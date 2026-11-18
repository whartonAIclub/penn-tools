// Outreach notes: the student answers a few questions about who they're writing
// to and why, and the AI API drafts a short, polite email they send themselves.
// The tool's server action passes in `ai` (the signed-in user's own key), the
// recipient (looked up on the server, never taken from the browser) and the
// answers, checked here against OutreachAnswers.

import { AI_PROVIDERS, z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { INDUSTRIES } from "./industries.js";
import type { Person } from "./types.js";

// ── The questions ─────────────────────────────────────────────────────────────

/** Why the student is writing: the kind of message. */
export const MESSAGE_TYPES = [
  { id: "cold", label: "First message (cold outreach)" },
  { id: "follow_up", label: "Follow-up (no reply yet)" },
  { id: "thank_you", label: "Thank-you after a call or coffee chat" },
  { id: "update", label: "Update after we spoke (e.g., applied, got an offer)" },
] as const;

/** What the student wants from the recipient. */
export const PURPOSES = [
  { id: "coffee_chat", label: "Set up a 20–30 minute coffee chat or call" },
  { id: "learn_role", label: "Learn about their role, team or company" },
  { id: "recruiting_advice", label: "Get advice on recruiting for this industry" },
  { id: "referral", label: "Ask for a referral to a specific job" },
  { id: "introduction", label: "Ask for an introduction to someone" },
  { id: "no_ask", label: "No ask: just saying thanks or keeping in touch" },
] as const;

export const TONES = [
  { id: "warm", label: "Warm and friendly" },
  { id: "formal", label: "Formal" },
  { id: "brief", label: "Brief and direct" },
] as const;

export const LENGTHS = [
  { id: "short", label: "Short (under 120 words)" },
  { id: "standard", label: "Standard (120–200 words)" },
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number]["id"];
export type Purpose = (typeof PURPOSES)[number]["id"];

/** Message types where the student has already spoken with the recipient. */
export const AFTER_CONVERSATION: readonly MessageType[] = ["thank_you", "update"];

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((o) => o.id) as [T[number]["id"], ...T[number]["id"][]];
const text = (max: number) => z.string().trim().max(max, `Keep this to ${max} characters or fewer.`);

/** The student's answers, as the browser sends them. Checked before anything reaches the AI. */
export const OutreachAnswers = z
  .object({
    messageType: z.enum(ids(MESSAGE_TYPES)),
    purpose: z.enum(ids(PURPOSES)),
    /** For a referral: the job title and company, and a link or job ID if they have one. */
    referralJob: text(300),
    /** For an introduction: who they'd like to meet. */
    introductionTarget: text(300),
    /** For a thank-you or update: what they discussed, or what was most helpful. */
    conversationNotes: text(600),
    senderName: text(100).min(1, "Enter your name."),
    /** e.g. "FT MBA, Class of 2027". */
    senderProgram: text(100),
    /** One or two sentences, e.g. pre-MBA experience. */
    senderBackground: text(400),
    /** e.g. "Product management roles at fintech companies". */
    recruitingGoal: text(200),
    /** Anything they share: same pre-MBA firm, club, hometown, undergrad. */
    sharedConnection: text(300),
    tone: z.enum(ids(TONES)),
    length: z.enum(ids(LENGTHS)),
    extraNotes: text(400),
  })
  .superRefine((a, ctx) => {
    if (a.purpose === "referral" && !a.referralJob) {
      ctx.addIssue({ code: "custom", path: ["referralJob"], message: "Say which job you'd like a referral for." });
    }
    if (a.purpose === "introduction" && !a.introductionTarget) {
      ctx.addIssue({ code: "custom", path: ["introductionTarget"], message: "Say who you'd like to be introduced to." });
    }
  });
export type OutreachAnswers = z.infer<typeof OutreachAnswers>;

/** A whole draft request from the browser: who to write to, for which industry, with which provider, and the answers. */
export const DraftRequest = z.object({
  personId: z.string().uuid(),
  industry: z.enum(INDUSTRIES),
  provider: z.enum(AI_PROVIDERS as [AIProvider, ...AIProvider[]]),
  answers: OutreachAnswers,
});
export type DraftRequest = z.infer<typeof DraftRequest>;

/**
 * Why a note to `recipient` about `industry` can't be drafted, or null. The
 * prompt tells the model the recipient worked in the industry, so it must be true.
 */
export function recipientProblem(recipient: Person, industry: string): string | null {
  return recipient.industries.includes(industry) ? null : `${recipient.name} hasn't worked in ${industry}. Search again.`;
}

/** The draft: a subject line and a plain-text body. */
export const OutreachDraft = z.object({
  subject: z.string().describe("A short, specific email subject line"),
  body: z.string().describe("The email body as plain text, with a greeting and a sign-off; no subject line"),
});
export type OutreachDraft = z.infer<typeof OutreachDraft>;

// ── The prompt ────────────────────────────────────────────────────────────────

const label = <T extends readonly { id: string; label: string }[]>(list: T, id: string) =>
  list.find((o) => o.id === id)?.label ?? id;

const SYSTEM = `You draft outreach emails for Wharton students writing to fellow Wharton students and alumni for career networking.

Write an email that is professional, polite, concise and specific:
- Open with a friendly greeting using the recipient's first name.
- Say early who the sender is and why they are writing to this person in particular.
- Make one clear, easy-to-answer ask (if there is an ask), and make it easy to say no.
- Respect the recipient's time: for a coffee chat, suggest 20–30 minutes at their convenience.
- Close with thanks and the sender's name.

Rules:
- Use only the facts given. Never invent shared experiences, mutual contacts, achievements or details about the recipient's work.
- The recipient's industry experience may come from an earlier job, not their current one, so don't assume their current role is in that industry.
- If a detail the email needs is missing (such as a job link), leave a short placeholder in square brackets, e.g. [job link].
- No flattery, no buzzwords, no emojis. Plain text only, no markdown.`;

/** The facts about the sender, recipient and request, as the model sees them. */
export function outreachPrompt(recipient: Person, industry: string, a: OutreachAnswers): string {
  const role = recipient.currentEmployer
    ? `${recipient.currentTitle ? `${recipient.currentTitle} at ` : ""}${recipient.currentEmployer}`
    : "unknown";
  const recipientFacts = [
    `Recipient: ${recipient.name}, ${recipient.program}, Class of ${recipient.classYear} (${recipient.isAlumni ? "alum" : "current student"}).`,
    `Recipient's current role: ${role}.`,
    `Industry the sender is interested in, which the recipient has worked in: ${industry}.`,
  ];
  const request = [
    `Kind of message: ${label(MESSAGE_TYPES, a.messageType)}.`,
    `Purpose: ${label(PURPOSES, a.purpose)}.`,
    a.purpose === "referral" && `Job for the referral: ${a.referralJob}`,
    a.purpose === "introduction" && `Who the sender wants to be introduced to: ${a.introductionTarget}`,
    AFTER_CONVERSATION.includes(a.messageType) && a.conversationNotes && `What they discussed / what was helpful: ${a.conversationNotes}`,
    a.messageType === "follow_up" && "The sender wrote before and hasn't heard back: keep it short and gracious.",
  ];
  const sender = [
    `Sender: ${a.senderName}${a.senderProgram ? `, ${a.senderProgram}` : ""}.`,
    a.senderBackground && `Sender's background: ${a.senderBackground}`,
    a.recruitingGoal && `Sender is recruiting for: ${a.recruitingGoal}`,
    a.sharedConnection && `Connection between them: ${a.sharedConnection}`,
    a.extraNotes && `Also mention: ${a.extraNotes}`,
  ];
  const style = [`Tone: ${label(TONES, a.tone)}. Length: ${label(LENGTHS, a.length)}.`];
  return [recipientFacts, request, sender, style]
    .map((section) => section.filter(Boolean).join("\n"))
    .join("\n\n");
}

/** A subject and body the student can edit and send from their own email. */
export async function draftOutreach(
  ai: AI,
  provider: AIProvider,
  recipient: Person,
  industry: string,
  answers: OutreachAnswers,
): Promise<OutreachDraft> {
  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: OutreachDraft,
    system: SYSTEM,
    messages: [{ role: "user", content: outreachPrompt(recipient, industry, answers) }],
  });
  return object;
}
