// ─────────────────────────────────────────────────────────────────────────────
// WEMBA Sync: AMA, questions about everything the student has uploaded
//
// AMA answers from the student's saved class weekends and syllabi, which the
// route (apps/web/.../wemba-sync/ama/route.ts) loads from the tool's database,
// plus the weekend the page shows, which the browser sends in case it wasn't
// saved. It sends the AI what was read from the PDFs, not the PDFs, so each
// question costs a cent or two. The browser sends the conversation with every
// question; it isn't saved. askAMA() streams the answer; the route turns it
// into server-sent events.
// ─────────────────────────────────────────────────────────────────────────────

import type { AI, AIMessage, AIProvider, AIStreamEvent } from "@penntools/core/ai";
import { WeekendSchedule } from "./schedule.js";
import type { Syllabus } from "./syllabus.js";

/** The most messages a conversation sends, questions and answers together. */
export const MAX_AMA_MESSAGES = 20;
/** The longest question, in characters. */
export const MAX_QUESTION_LENGTH = 1000;
/** The longest answer kept in the conversation, in characters. */
const MAX_ANSWER_LENGTH = 6000;
/** The largest AMA request body: a schedule is a few KB; this leaves plenty of room. */
export const MAX_AMA_REQUEST_BYTES = 256 * 1024;

/** The longest section name, in characters. */
const MAX_SECTION_LENGTH = 100;

/** What the browser sends. */
export interface AMARequest {
  provider: AIProvider;
  /** The weekend the page shows, or null on the Courses tab or before an upload. */
  schedule: WeekendSchedule | null;
  /** The section the student picked, or null if they haven't. */
  section: string | null;
  /** The conversation so far, ending with the new question. */
  messages: AIMessage[];
}

/** Everything AMA answers from. */
export interface AMAKnowledge {
  /** The student's class weekends, earliest first. */
  weekends: WeekendSchedule[];
  syllabi: Syllabus[];
  /** The weekend the student is looking at, if any: "this weekend" means it. */
  shown: WeekendSchedule | null;
}

/**
 * Why the request can't be answered, or null if it's fine. The route gets it
 * from the browser, so it checks everything, including that a schedule sent
 * is a real WeekendSchedule.
 */
export function checkAsk(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Send the question as JSON.";
  const { provider, schedule, section, messages } = body as Record<string, unknown>;
  if (typeof provider !== "string") return "Pick an AI provider.";

  if (schedule !== null && !WeekendSchedule.safeParse(schedule).success) return "Upload the schedule again, then ask.";
  if (section !== null && (typeof section !== "string" || section.length > MAX_SECTION_LENGTH)) {
    return "Pick your section again, then ask.";
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

/**
 * The weekends to answer from: the saved ones, plus the shown one if it isn't
 * among them (e.g. when storage isn't set up), in date order.
 */
export function knownWeekends(saved: WeekendSchedule[], shown: WeekendSchedule | null): WeekendSchedule[] {
  const first = (schedule: WeekendSchedule) => schedule.items.map((item) => item.date).sort()[0] ?? "";
  if (!shown || saved.some((weekend) => first(weekend) === first(shown))) return saved;
  return [...saved, shown].sort((a, b) => first(a).localeCompare(first(b)));
}

/** AMA's instructions: how to answer, and everything to answer from. */
export function amaSystem({ weekends, syllabi, shown }: AMAKnowledge, section: string | null, now: string): string {
  return [
    "You are AMA, the question-answering helper in WEMBA Sync, for Wharton MBA Program for Executives students.",
    "Answer using only what the student has uploaded, below: their class weekend schedules (classes, meals, events, logistics, upcoming dates) and their course syllabi (sessions, readings, assignments, grading, materials, policies, instructors).",
    "Connect them when it helps: a class on a weekend's schedule is the syllabus session for that course on that date, with its readings and what to prepare.",
    "If the uploads don't say, say so plainly and suggest checking the program's email, the PDF or the syllabus. Never guess times, rooms, dates, readings or names.",
    shown
      ? `The student is looking at the weekend "${shown.title}"; "this weekend" means it unless they say otherwise.`
      : `"This weekend" or "the next weekend" means the first class weekend that hasn't ended yet.`,
    section
      ? `The student is in ${section}. Answer for ${section} and for everyone's items; mention another section's items only if asked.`
      : "The student hasn't picked a section. When an answer differs by section, give each section's.",
    `It is now ${now} in Philadelphia; use it for questions like "what's next?" or "what's due this week?".`,
    "Be brief: one to three sentences, or a short list with '- ' bullets. Give times as 9:00 AM, and include the room when there is one.",
    "Write plain text, not Markdown: no headings, bold or tables.",
    "",
    "Class weekend schedules, as JSON (times are 24-hour, Philadelphia time; section null means everyone):",
    weekends.length > 0 ? JSON.stringify(weekends) : "None uploaded yet.",
    "",
    "Course syllabi, as JSON (dates YYYY-MM-DD, times 24-hour):",
    syllabi.length > 0 ? JSON.stringify(syllabi) : "None uploaded yet.",
  ].join("\n");
}

/**
 * Streams AMA's answer to the last question. `now` is Philadelphia's date and
 * time, e.g. "Friday, November 13, 2026, 4:05 PM".
 */
export function askAMA(
  ai: AI,
  { provider, section, messages }: Omit<AMARequest, "schedule">,
  knowledge: AMAKnowledge,
  now: string,
  signal?: AbortSignal,
): AsyncIterable<AIStreamEvent> {
  return ai.stream({
    provider,
    tier: "fast", // looking things up in schedules and syllabi: the fast model is enough
    reasoning: "low",
    system: amaSystem(knowledge, section, now),
    messages,
    maxOutputTokens: 1000,
    ...(signal && { signal }),
  });
}
