// ─────────────────────────────────────────────────────────────────────────────
// WEMBA Sync: AMA, questions about the uploaded weekend
//
// The page already has the weekend as a WeekendSchedule (with corrections.ts
// applied), so AMA sends that, not the PDF: each question costs a fraction of
// a cent. The browser sends the schedule and the conversation with every
// question; nothing is saved. askAMA() streams the answer; the route
// (apps/web/.../wemba-sync/ama/route.ts) turns it into server-sent events.
// ─────────────────────────────────────────────────────────────────────────────

import type { AI, AIMessage, AIProvider, AIStreamEvent } from "@penntools/core/ai";
import { WeekendSchedule } from "./schedule.js";

/** The most messages a conversation sends, questions and answers together. */
export const MAX_AMA_MESSAGES = 20;
/** The longest question, in characters. */
export const MAX_QUESTION_LENGTH = 1000;
/** The longest answer kept in the conversation, in characters. */
const MAX_ANSWER_LENGTH = 6000;
/** The largest AMA request body: a schedule is a few KB; this leaves plenty of room. */
export const MAX_AMA_REQUEST_BYTES = 256 * 1024;

export interface AMARequest {
  provider: AIProvider;
  schedule: WeekendSchedule;
  /** The section the student picked, or null if they haven't. */
  section: string | null;
  /** The conversation so far, ending with the new question. */
  messages: AIMessage[];
}

/**
 * Why the request can't be answered, or null if it's fine. The route gets it
 * from the browser, so it checks everything, including that the schedule is
 * a real WeekendSchedule.
 */
export function checkAsk(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Send the question as JSON.";
  const { provider, schedule, section, messages } = body as Record<string, unknown>;
  if (typeof provider !== "string") return "Pick an AI provider.";

  const parsed = WeekendSchedule.safeParse(schedule);
  if (!parsed.success) return "Upload the schedule again, then ask.";
  if (section !== null && (typeof section !== "string" || !parsed.data.sections.includes(section))) {
    return "Pick a section from this schedule.";
  }

  if (!Array.isArray(messages) || messages.length === 0) return "Ask a question.";
  if (messages.length > MAX_AMA_MESSAGES) return "This conversation is long. Reload the page to start a new one.";
  for (const [i, message] of messages.entries()) {
    const { role, content } = (message ?? {}) as Record<string, unknown>;
    // Questions and answers alternate, starting and ending with a question.
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (role !== expected || typeof content !== "string") return "Send the conversation as questions and answers.";
    if (role === "user" && !content.trim()) return "Ask a question.";
    if (role === "user" && content.length > MAX_QUESTION_LENGTH) {
      return `Questions can be at most ${MAX_QUESTION_LENGTH} characters.`;
    }
    if (role === "assistant" && content.length > MAX_ANSWER_LENGTH) {
      return "This conversation is long. Reload the page to start a new one.";
    }
  }
  if (messages.length % 2 === 0) return "Ask a question.";
  return null;
}

/** AMA's instructions: how to answer, and the weekend to answer from. */
export function amaSystem(schedule: WeekendSchedule, section: string | null, now: string): string {
  return [
    "You are AMA, the question-answering helper in WEMBA Sync, for Wharton MBA Program for Executives students.",
    "Answer questions about this class weekend using only the schedule below: classes, meals, events, logistics and upcoming dates.",
    "If the schedule doesn't say, say so plainly and suggest checking the program's email or PDF. Never guess times, rooms or names.",
    section
      ? `The student is in ${section}. Answer for ${section} and for everyone's items; mention another section's items only if asked.`
      : "The student hasn't picked a section. When an answer differs by section, give each section's.",
    `It is now ${now} in Philadelphia; use it for questions like "what's next?".`,
    "Be brief: one to three sentences, or a short list with '- ' bullets. Give times as 9:00 AM, and include the room when there is one.",
    "Write plain text, not Markdown: no headings, bold or tables.",
    "",
    "The schedule, as JSON (times are 24-hour, Philadelphia time; section null means everyone):",
    JSON.stringify(schedule),
  ].join("\n");
}

/** Streams AMA's answer to the last question. `now` is Philadelphia's date and time, e.g. "Friday, November 13, 2026, 4:05 PM". */
export function askAMA(
  ai: AI,
  { provider, schedule, section, messages }: AMARequest,
  now: string,
  signal?: AbortSignal,
): AsyncIterable<AIStreamEvent> {
  return ai.stream({
    provider,
    tier: "fast", // looking things up in a short schedule: the fast model is enough
    reasoning: "low",
    system: amaSystem(schedule, section, now),
    messages,
    maxOutputTokens: 1000,
    ...(signal && { signal }),
  });
}
