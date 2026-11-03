// ─────────────────────────────────────────────────────────────────────────────
// Drafting a cold outreach email to a person on the student's list.
//
// The draft uses only what's saved: the person's scored profile (title,
// company, schools, what was seen on it, the hook) and the student's own
// profile. It's a draft for the student to edit and send themselves: nothing
// here sends email.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import type { OutreachDraft, RecruitingProfile, ScoredContact } from "./scoring.js";

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 5000;
export const MAX_INSTRUCTION_LENGTH = 500;

export const OutreachSchema = z.object({
  subject: z.string().describe("A short, specific subject line"),
  body: z.string().describe("The email body, greeting to sign-off"),
});

const OUTREACH_SYSTEM = `You draft a cold networking email from an MBA student to a professional they found on LinkedIn.
Write like a thoughtful student, not a template:
- Under 150 words. Plain, warm, specific; no flattery, buzzwords or exclamation marks.
- Open with the strongest real connection: a shared school, a shared employer, industry, language or region, or their specific work.
- A shared school counts ONLY if it appears in the person's "Schools" line AND in the student's background; only then write e.g. "As a fellow Wharton student". If their schools are "(not recorded)" or empty, don't mention their school at all or imply you share one.
- One or two sentences on the student, drawn ONLY from the student's background and tied to the person's work.
- One small, clear ask: a 15-20 minute call about their path and team. Don't ask for a job or a referral.
- Sign off with the student's first name if the background states it; otherwise write [Your name].
Use ONLY facts given about the person and the student. Never invent shared experiences, mutual contacts or details.`;

/** Why an instruction for the drafts can't be used, or null if it's fine. */
export function checkInstruction(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Type how you'd like the drafts changed.";
  if (value.length > MAX_INSTRUCTION_LENGTH) return `Keep the instruction to at most ${MAX_INSTRUCTION_LENGTH} characters.`;
  if (value.includes("\0")) return "The instruction has characters that can't be used.";
  return null;
}

/** The student's standing style for every email, as a section of the prompt; empty if none. */
function styleSection(profile: RecruitingProfile): string {
  return profile.outreachStyle?.trim()
    ? `\n\n## How the student wants every email written (follow it, within the rules above)\n${profile.outreachStyle.trim()}`
    : "";
}

/** Why the draft can't be saved, or null if it's fine. */
export function checkOutreach(value: unknown): string | null {
  const { subject, body } = (typeof value === "object" && value !== null ? value : {}) as Partial<OutreachDraft>;
  if (typeof subject !== "string" || typeof body !== "string") return "The draft needs a subject and a body.";
  if (subject.length > MAX_SUBJECT_LENGTH) return `Keep the subject to at most ${MAX_SUBJECT_LENGTH} characters.`;
  if (body.length > MAX_BODY_LENGTH) return `Keep the email to at most ${MAX_BODY_LENGTH.toLocaleString()} characters.`;
  if (subject.includes("\0") || body.includes("\0")) return "The draft has characters that can't be saved.";
  return null;
}

/** What the model knows about the person: their saved review, without the scoring details. */
function describePerson(contact: ScoredContact): string {
  const lines = [
    `Name: ${contact.name ?? "(unknown)"}`,
    `Current role: ${contact.title} at ${contact.company}`,
    `Schools: ${contact.schools?.length ? contact.schools.join("; ") : "(not recorded)"}`,
    `Relevant to the student's target roles: ${contact.relevantRole ? "yes" : "no"}`,
  ];
  for (const m of contact.matchedSignals) lines.push(`Shared with the student: ${m.signal} (profile says: "${m.evidence}")`);
  lines.push(`Suggested opener: ${contact.hook}`);
  return lines.join("\n");
}

export async function draftOutreach(
  ai: AI,
  provider: AIProvider,
  profile: RecruitingProfile,
  contact: ScoredContact,
): Promise<OutreachDraft> {
  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: OutreachSchema,
    system: OUTREACH_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${aboutBoth(profile, contact)}${styleSection(profile)}`,
      },
    ],
  });
  return tidyDraft(object);
}

const REVISE_SYSTEM = `${OUTREACH_SYSTEM}

You are revising an existing draft. Apply the student's instruction to it, and keep everything else that works.
The instruction can change tone, length, structure or wording, but it can't override the rule against inventing facts:
if following it exactly would need a fact you weren't given, follow it as far as the facts allow.`;

/** The draft rewritten to follow the student's instruction, e.g. "make it shorter". */
export async function reviseOutreach(
  ai: AI,
  provider: AIProvider,
  profile: RecruitingProfile,
  contact: ScoredContact,
  draft: OutreachDraft,
  instruction: string,
): Promise<OutreachDraft> {
  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: OutreachSchema,
    system: REVISE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${aboutBoth(profile, contact)}\n\n## The current draft\nSubject: ${draft.subject}\n\n${draft.body}\n\n## The student's instruction\n${instruction}`,
      },
    ],
  });
  return tidyDraft(object);
}

function aboutBoth(profile: RecruitingProfile, contact: ScoredContact): string {
  return `## The person\n${describePerson(contact)}\n\n## The student's target roles\n${profile.targetRoles}\n\n## The student's background\n${profile.background}`;
}

function tidyDraft(draft: OutreachDraft): OutreachDraft {
  return {
    subject: draft.subject.trim().slice(0, MAX_SUBJECT_LENGTH),
    body: draft.body.trim().slice(0, MAX_BODY_LENGTH),
  };
}
