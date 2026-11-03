// ─────────────────────────────────────────────────────────────────────────────
// Penn Pals debrief: plain-language notes in, a structured contact card out
//
// Receives `ai` from the tool's server actions (getAI in @/lib/ai), so it never
// sees API keys and is tested with a fake AI (see __tests__/debrief.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";

// Roomy enough for a full meeting-notes export (Granola and similar run 6k-20k
// characters); still a bound, since the user's own AI key pays per token.
export const MAX_NOTES_LENGTH = 30000;

/** Days until follow-up when the notes don't give a date. */
export const DEFAULT_FOLLOW_UP_DAYS = 14;

/** Why `value` can't be sent, or null if it's fine. Server actions get browser input, so check it. */
export function checkNotes(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Enter your notes from the chat.";
  if (value.length > MAX_NOTES_LENGTH) return `Keep your notes to at most ${MAX_NOTES_LENGTH} characters.`;
  return null;
}

// One schema tells the model the shape, checks the reply, and types the result.
// Fields that may be missing are .nullable(), not .optional().
export const DebriefCard = z.object({
  name: z.string().describe("The person's full name as given; first name only if that's all there is"),
  relationship: z.enum(["2Y", "alumni", "recruiter", "faculty", "other"]),
  classYear: z.string().nullable().describe("Graduation year like '2022', or null if not mentioned"),
  company: z.string().nullable().describe("Employer, or null"),
  role: z.string().nullable().describe("Job title, or null"),
  area: z.string().nullable().describe("Function or industry like 'Product' or 'Consulting', or null"),
  location: z.string().nullable().describe("City or office where they're based, or null"),
  email: z.string().nullable().describe("Their email if the notes give it, or null"),
  phone: z.string().nullable().describe("Their phone number if the notes give it, or null"),
  linkedin: z.string().nullable().describe("Their LinkedIn URL or handle if the notes give it, or null"),
  takeaways: z.array(z.string()).describe("Key points from the conversation, one short sentence each"),
  vibe: z.enum(["great", "good", "neutral", "lukewarm"]).describe("How the conversation went"),
  nextSteps: z.array(
    z.object({
      action: z.string(),
      owner: z.enum(["me", "them"]).describe("Who promised or needs to do it"),
    }),
  ),
  followUpDate: z.string().nullable().describe("YYYY-MM-DD, or null if the notes give no timing"),
  followUpReason: z.string().nullable().describe("Why that date, in a few words, or null"),
});
export type DebriefCard = z.infer<typeof DebriefCard>;

/**
 * A contact card from the user's notes. `today` (YYYY-MM-DD) lets the model
 * turn "after Thanksgiving" or "next week" into a real date.
 */
export async function extractDebrief(ai: AI, provider: AIProvider, notes: string, today: string): Promise<DebriefCard> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: DebriefCard,
    system: [
      "You turn a student's notes on a networking chat (a coffee chat with a 2nd-year, alumnus, recruiter or similar) into a contact card.",
      `Today is ${today}. Resolve relative timing such as "next week" or "after Thanksgiving" to a YYYY-MM-DD date after today.`,
      "Use only what the notes say. If something isn't stated, use null; never guess names, employers or dates.",
    ].join(" "),
    messages: [{ role: "user", content: notes }],
  });
  return object; // already checked against DebriefCard
}

/**
 * What gets stored: the card plus the user's notes exactly as written. The
 * notes are kept for the backend (and later features) and never go through the
 * AI's output, so they can't be altered or cost output tokens; the page shows
 * the card's `takeaways`.
 */
export type ContactRecord = DebriefCard & { fullNotes: string };

export function toContactRecord(card: DebriefCard, notes: string): ContactRecord {
  return { ...card, fullNotes: notes };
}

/**
 * The card with a follow-up date: its own if it has a valid one in the future,
 * otherwise `today` plus DEFAULT_FOLLOW_UP_DAYS.
 */
export function withFollowUpDate(card: DebriefCard, today: string): DebriefCard {
  if (card.followUpDate && isDate(card.followUpDate) && card.followUpDate > today) return card;
  return {
    ...card,
    followUpDate: addDays(today, DEFAULT_FOLLOW_UP_DAYS),
    followUpReason: card.followUpReason ?? "Default check-in",
  };
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** `date` (YYYY-MM-DD) plus `days`, in UTC so time zones can't shift it. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
