// ─────────────────────────────────────────────────────────────────────────────
// Recruiting Helper: score a pasted job posting or LinkedIn profile against the
// student's own profile (background, target roles, companies sorted into tiers,
// bonus signals).
//
// The AI makes the judgment calls (how well a role fits, what's visible on a
// profile); the points are added up here, in plain code, so every score can be
// explained and tested. Functions take `ai` from the tool's score route in
// apps/web/src/app/tools/recruiting-helper/score/route.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { AI_IMAGE_TYPES, base64Bytes, base64FileType, isBase64, z } from "@penntools/core/ai";
import type { AI, AIContentPart, AIImageType, AIProvider } from "@penntools/core/ai";

export const MAX_PASTE_LENGTH = 20000;
export const MAX_BACKGROUND_LENGTH = 6000;
export const MAX_FIELD_LENGTH = 1000;
export const MAX_COMPANIES = 100;
export const MAX_SIGNALS = 10;
export const MAX_LINK_LENGTH = 2000;

/** Screenshots per paste: a LinkedIn profile usually takes two or three. */
export const MAX_SCREENSHOTS = 4;
export const MAX_SCREENSHOT_BYTES = 7 * 1024 * 1024;
export const MAX_SCREENSHOTS_BYTES = 16 * 1024 * 1024;
/** The largest score request: the screenshots as base64, the text, and room for the rest. */
export const MAX_REQUEST_BYTES = Math.ceil(MAX_SCREENSHOTS_BYTES / 3) * 4 + MAX_PASTE_LENGTH * 4 + 64 * 1024;

const MB = 1024 * 1024;

// ── The student's profile ────────────────────────────────────────────────────

export type CompanyTier = "target" | "secondary" | "practice";

export interface TargetCompany {
  name: string;
  tier: CompanyTier;
}

export interface RecruitingProfile {
  /** Résumé-style summary: past roles, skills, education, languages. */
  background: string;
  /** The kinds of roles they want, e.g. "strategic partnerships, BD". */
  targetRoles: string;
  companies: TargetCompany[];
  /** Things they share with people worth meeting, e.g. "Wharton", "speaks Japanese". */
  bonusSignals: string[];
}

export const TIER_LABELS: Record<CompanyTier | "off-list", string> = {
  target: "Target",
  secondary: "Secondary",
  practice: "Practice",
  "off-list": "Not on your list",
};

/** Why `value` can't be sent, or null if it's fine. Server actions get browser input, so check it. */
export function checkText(value: unknown, label: string, maxLength: number): string | null {
  if (typeof value !== "string" || !value.trim()) return `Enter ${label}.`;
  if (value.length > maxLength) return `Keep ${label} to at most ${maxLength.toLocaleString()} characters.`;
  return null;
}

/** Why the profile can't be used, or null if it's fine. */
export function checkProfile(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "Fill in your profile first.";
  const p = value as Partial<RecruitingProfile>;
  const problem =
    checkText(p.background, "your background", MAX_BACKGROUND_LENGTH) ??
    checkText(p.targetRoles, "the roles you're targeting", MAX_FIELD_LENGTH);
  if (problem) return problem;
  if (!Array.isArray(p.companies) || p.companies.length === 0) return "Add at least one company you're targeting.";
  if (p.companies.length > MAX_COMPANIES) return `Keep your list to at most ${MAX_COMPANIES} companies.`;
  for (const c of p.companies) {
    if (typeof c?.name !== "string" || !c.name.trim() || c.name.length > 100) return "Each company needs a name.";
    if (!["target", "secondary", "practice"].includes(c.tier)) return `Pick a tier for ${c.name}.`;
  }
  if (!Array.isArray(p.bonusSignals) || p.bonusSignals.length > MAX_SIGNALS) {
    return `Keep bonus signals to at most ${MAX_SIGNALS}.`;
  }
  if (p.bonusSignals.some((s) => typeof s !== "string" || s.length > 200)) return "Keep each bonus signal short.";
  return null;
}

// ── What the student pastes ──────────────────────────────────────────────────

/** A screenshot, as base64 without a data: prefix (the AI API's inline image format). */
export interface Screenshot {
  mediaType: AIImageType;
  data: string;
}

/** A pasted job posting or LinkedIn profile: text, screenshots, or both. */
export interface Paste {
  text: string;
  screenshots: Screenshot[];
}

/** Why the paste can't be scored, or null if it's fine. `label` names it, e.g. "a job posting". */
export function checkPaste(value: unknown, label: string): string | null {
  if (typeof value !== "object" || value === null) return `Paste ${label}.`;
  const { text, screenshots } = value as Partial<Paste>;
  if (typeof text !== "string") return `Paste ${label}.`;
  if (text.length > MAX_PASTE_LENGTH) return `Keep the text to at most ${MAX_PASTE_LENGTH.toLocaleString()} characters.`;
  if (text.includes("\0")) return "The text has characters that can't be read. Copy it again.";
  if (!Array.isArray(screenshots)) return "Screenshots must be a list.";
  if (!text.trim() && screenshots.length === 0) return `Paste ${label}, as text or screenshots.`;
  if (screenshots.length > MAX_SCREENSHOTS) return `Add at most ${MAX_SCREENSHOTS} screenshots.`;

  let total = 0;
  for (const shot of screenshots as unknown[]) {
    const { mediaType, data } = (shot ?? {}) as Partial<Screenshot>;
    if (!AI_IMAGE_TYPES.includes(mediaType as AIImageType) || typeof data !== "string" || !isBase64(data)) {
      return "Screenshots must be JPEG, PNG, GIF or WebP images.";
    }
    // The browser's type comes from the file name, which can be wrong; check the bytes.
    if (base64FileType(data) !== mediaType) return "One of the screenshots isn't really the image type it says it is.";
    const bytes = base64Bytes(data);
    if (bytes > MAX_SCREENSHOT_BYTES) return `Each screenshot must be under ${MAX_SCREENSHOT_BYTES / MB} MB.`;
    total += bytes;
  }
  if (total > MAX_SCREENSHOTS_BYTES) return `Screenshots must total under ${MAX_SCREENSHOTS_BYTES / MB} MB.`;
  return null;
}

/** The posting's link if it's a web address, null if there's none, or undefined if it's not usable. */
export function cleanLink(value: unknown): string | null | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "string" || value.length > MAX_LINK_LENGTH) return undefined;
  try {
    const url = new URL(value.trim());
    // Only web links: anything else (javascript:, data:) could run in the page when clicked.
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** The AI message for one paste: the student's context, the pasted text, then the screenshots. */
function pasteMessage(context: string, heading: string, paste: Paste): AIContentPart[] {
  const text = paste.text.trim() ? paste.text : "(No text: see the screenshots.)";
  return [
    { type: "text", text: `${context}\n\n## ${heading}\n${text}` },
    ...paste.screenshots.map(({ mediaType, data }): AIContentPart => ({ type: "image", mediaType, data })),
  ];
}

// ── Company matching ─────────────────────────────────────────────────────────

/** Lowercase, no accents, punctuation or company suffixes: "NVIDIA Corp." → "nvidia". */
export function normalizeCompany(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|corp|corporation|co|company|llc|ltd|plc|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The student's entry for `company`, matched loosely: case, punctuation and
 * suffixes don't matter, and a list entry with alternatives ("Amazon / AWS")
 * matches any of them. Null when the company isn't on the list.
 */
export function findCompany(company: string, companies: TargetCompany[]): TargetCompany | null {
  const wanted = normalizeCompany(company);
  if (!wanted) return null;
  for (const entry of companies) {
    const names = entry.name.split(/[/,|]|\(|\)/).map(normalizeCompany).filter(Boolean);
    if (names.some((name) => name === wanted || wordsStartWith(wanted, name) || wordsStartWith(name, wanted))) {
      return entry;
    }
  }
  return null;
}

/** True when `text`'s words begin with all of `prefix`'s words: "google cloud" starts with "google". */
function wordsStartWith(text: string, prefix: string): boolean {
  return text === prefix || text.startsWith(prefix + " ");
}

const clamp = (n: number) => Math.max(1, Math.min(5, n));

// ── Job postings ─────────────────────────────────────────────────────────────

export const PostingReview = z.object({
  company: z.string().describe("The hiring company, as named in the posting"),
  title: z.string().describe("The job title"),
  // Range in the description, not .min/.max: not every provider's structured output supports them.
  roleFit: z.number().int().describe("1 to 5, per the scale in the instructions"),
  reason: z.string().describe("One sentence on why the role fit is what it is"),
  leadWith: z.array(z.string()).describe("Up to 3 things from the background to lead with"),
  gaps: z.array(z.string()).describe("Honest gaps against the posting's requirements"),
  applyBy: z.string().nullable().describe("YYYY-MM-DD if the posting gives a deadline, else null"),
  level: z.string().nullable().describe("Seniority, e.g. Manager, Director; null if unclear"),
});
export type PostingReview = z.infer<typeof PostingReview>;

export interface ScoredPosting extends PostingReview {
  kind: "posting";
  score: number;
  tier: CompanyTier | "off-list";
  /** The list entry the company matched, if any. */
  matchedCompany: string | null;
  /** "+1 Target", "+0 Secondary", "-1 Practice" or "-1 not on your list". */
  adjustment: string;
}

const POSTING_SYSTEM = `You help an MBA student decide which job postings to prioritize.
The posting comes as copied text, screenshots, or both.
Rate roleFit from 1 to 5 using ONLY the student's background and target roles:
5: squarely one of the target roles, and the background covers almost every stated requirement
4: strong match with one or two gaps a story or quick upskilling can address
3: adjacent to the target roles, or several real gaps
2: major gaps (a required degree, technical skills, or years of experience the background lacks)
1: not a real match
Never claim experience the background doesn't state; if something isn't there, it's a gap.
Don't judge the company: the student's company list is applied separately.`;

/** Score: roleFit from the AI, then +1 Target, +0 Secondary, -1 Practice or off-list, kept 1-5. */
export function scorePostingReview(review: PostingReview, companies: TargetCompany[]): ScoredPosting {
  const match = findCompany(review.company, companies);
  const tier = match?.tier ?? "off-list";
  const points = tier === "target" ? 1 : tier === "secondary" ? 0 : -1;
  return {
    ...review,
    kind: "posting",
    roleFit: clamp(review.roleFit),
    leadWith: review.leadWith.slice(0, 3),
    score: clamp(review.roleFit + points),
    tier,
    matchedCompany: match?.name ?? null,
    adjustment: `${points >= 0 ? "+" : ""}${points} ${tier === "off-list" ? "not on your list" : TIER_LABELS[tier]}`,
  };
}

export async function reviewPosting(
  ai: AI,
  provider: AIProvider,
  profile: RecruitingProfile,
  posting: Paste,
): Promise<ScoredPosting> {
  const context = `## Target roles\n${profile.targetRoles}\n\n## Background\n${profile.background}`;
  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: PostingReview,
    system: POSTING_SYSTEM,
    messages: [{ role: "user", content: pasteMessage(context, "Job posting (text and/or screenshots)", posting) }],
  });
  return scorePostingReview(object, profile.companies);
}

// ── LinkedIn profiles ────────────────────────────────────────────────────────

export const ContactReview = z.object({
  name: z.string().nullable().describe("The person's full name, or null if it isn't clearly stated"),
  company: z.string().describe("Current employer"),
  title: z.string().describe("Current job title"),
  relevantRole: z.boolean().describe("True if their current role is one of, or closely tied to, the target roles"),
  matchedSignals: z
    .array(z.object({ signal: z.string(), evidence: z.string() }))
    .describe("Bonus signals visibly present on the profile, copied exactly from the list, with the text that shows it"),
  hook: z.string().describe("One conversation opener based only on something stated on the profile"),
});
export type ContactReview = z.infer<typeof ContactReview>;

export type Priority = "High" | "Medium" | "Low";

export interface ScoredContact extends ContactReview {
  kind: "contact";
  score: number;
  priority: Priority;
  tier: CompanyTier | "off-list";
  matchedCompany: string | null;
  /** The points earned, e.g. ["+2 Target company", "+1 relevant role"]. */
  points: string[];
  /** True when the points added up to more than 5. */
  capped: boolean;
}

const CONTACT_SYSTEM = `You help an MBA student decide which people to network with.
You get one LinkedIn profile, as copied text, screenshots, or both. Use ONLY what is stated there:
never infer nationality, language, school or anything else from a name or photo.
If the person's name isn't clearly stated, return null for it.
For matchedSignals, include a bonus signal only if the profile text clearly shows it; copy the signal exactly.`;

/** Score: 1, +2 Target or +1 Secondary company, +1 relevant role, +1 per bonus signal, capped at 5. */
export function scoreContactReview(
  review: ContactReview,
  companies: TargetCompany[],
  bonusSignals: string[],
): ScoredContact {
  const match = findCompany(review.company, companies);
  const tier = match?.tier ?? "off-list";
  const points: string[] = [];
  if (tier === "target") points.push("+2 Target company");
  if (tier === "secondary") points.push("+1 Secondary company");
  if (review.relevantRole) points.push("+1 relevant role");

  // Only signals from the student's own list count, once each.
  const allowed = new Map(bonusSignals.map((s) => [s.trim().toLowerCase(), s.trim()]));
  const seen = new Set<string>();
  const matchedSignals = review.matchedSignals.filter((m) => {
    const key = m.signal.trim().toLowerCase();
    if (!allowed.has(key) || seen.has(key)) return false;
    seen.add(key);
    points.push(`+1 ${allowed.get(key)}`);
    return true;
  });

  const total = 1 + (tier === "target" ? 2 : tier === "secondary" ? 1 : 0) + (review.relevantRole ? 1 : 0) + seen.size;
  const score = clamp(total);
  return {
    ...review,
    matchedSignals,
    kind: "contact",
    score,
    priority: score >= 4 ? "High" : score === 3 ? "Medium" : "Low",
    tier,
    matchedCompany: match?.name ?? null,
    points,
    capped: total > 5,
  };
}

export async function reviewContact(
  ai: AI,
  provider: AIProvider,
  profile: RecruitingProfile,
  linkedIn: Paste,
): Promise<ScoredContact> {
  const signals = profile.bonusSignals.length ? profile.bonusSignals.map((s) => `- ${s}`).join("\n") : "(none)";
  const context = `## Target roles\n${profile.targetRoles}\n\n## Bonus signals\n${signals}\n\n## Student's background (for the hook)\n${profile.background}`;
  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: ContactReview,
    system: CONTACT_SYSTEM,
    messages: [{ role: "user", content: pasteMessage(context, "LinkedIn profile (text and/or screenshots)", linkedIn) }],
  });
  return scoreContactReview(object, profile.companies, profile.bonusSignals);
}
