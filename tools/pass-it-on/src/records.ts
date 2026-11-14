// Turning an organizer's five answers into lessons. The AI proposes lessons,
// each quoting the answer it came from; checkQuotes then confirms every quote
// really is in that answer, so the review step can flag any that aren't.

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { QUESTIONS, QUESTION_KEYS, type QuestionKey } from "./questions.js";
import { LESSON_CATEGORIES, type LessonCategory } from "./storage.js";

export const MAX_ANSWER_LENGTH = 4000;
export const MAX_FIELD_LENGTH = 200;

export const EventLessons = z.object({
  lessons: z.array(
    z.object({
      question: z.enum(QUESTION_KEYS).describe("Which answer the lesson comes from"),
      category: z.enum(LESSON_CATEGORIES),
      summary: z.string().describe("The lesson for a future organizer, in one short sentence"),
      quote: z.string().describe("The organizer's exact words the lesson rests on, copied verbatim from that answer"),
    }),
  ),
});
export type EventLessons = z.infer<typeof EventLessons>;

/** A proposed lesson, before the organizer reviews it. */
export interface DraftLesson {
  question: QuestionKey;
  category: LessonCategory;
  summary: string;
  quote: string;
  /** False when the quote isn't in the answer: the review step flags it. */
  quoteFound: boolean;
}

export const STRUCTURE_SYSTEM_PROMPT = [
  "You help student club leaders hand down what they learned running events.",
  "From the organizer's answers, pull out the lessons a future organizer of a similar event should know:",
  "what to watch for, what it really cost, who to contact or avoid, what to repeat or change.",
  "Each lesson is one short, specific sentence. Skip anything only true of this one event, and don't repeat a lesson.",
  "For every lesson, copy the organizer's exact words it rests on into `quote`, verbatim from one answer, and name that answer in `question`.",
  "If the answers hold no lessons, return an empty list.",
].join(" ");

/** Proposed lessons from an event's five answers, with each quote checked against its answer. */
export async function structureAnswers(ai: AI, provider: AIProvider, answers: Record<QuestionKey, string>): Promise<DraftLesson[]> {
  const content = QUESTIONS.map((q) => `## ${q.key}: ${q.prompt}\n${answers[q.key].trim() || "(no answer)"}`).join("\n\n");
  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: EventLessons,
    system: STRUCTURE_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });
  return object.lessons.map((lesson) => ({ ...lesson, quoteFound: containsQuote(answers[lesson.question], lesson.quote) }));
}

/**
 * Whether `quote` appears in `text`, ignoring case, runs of whitespace and
 * curly versus straight quotes, which models often change when copying.
 */
export function containsQuote(text: string, quote: string): boolean {
  const needle = normalize(quote);
  return needle.length > 0 && normalize(text).includes(needle);
}

/** Marks each lesson with whether its quote is in the text it cites. */
export function checkQuotes<T extends { quote: string }>(lessons: T[], textOf: (lesson: T) => string): (T & { quoteFound: boolean })[] {
  return lessons.map((lesson) => ({ ...lesson, quoteFound: containsQuote(textOf(lesson), lesson.quote) }));
}

function normalize(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface EventInput {
  title: string;
  eventType: string;
  eventDate: string | null;
  organizerName: string;
  answers: Record<QuestionKey, string>;
}

/**
 * The event form's input checked, or why it can't be used. Server actions get
 * browser input, so check it. At least one answer is required.
 */
export function checkEventInput(input: unknown): { ok: true; value: EventInput } | { ok: false; message: string } {
  if (typeof input !== "object" || input === null) return { ok: false, message: "Fill in the event form." };
  const raw = input as Record<string, unknown>;

  const fields: [keyof Omit<EventInput, "answers" | "eventDate">, string][] = [
    ["title", "the event's name"],
    ["eventType", "the kind of event"],
    ["organizerName", "the organizer's name"],
  ];
  for (const [field, label] of fields) {
    const value = raw[field];
    if (typeof value !== "string" || !value.trim()) return { ok: false, message: `Enter ${label}.` };
    if (value.length > MAX_FIELD_LENGTH) return { ok: false, message: `Keep ${label} to at most ${MAX_FIELD_LENGTH} characters.` };
  }

  const date = raw["eventDate"];
  if (date !== null && date !== undefined && date !== "" && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return { ok: false, message: "Enter the date as YYYY-MM-DD, or leave it blank." };
  }

  const rawAnswers = (typeof raw["answers"] === "object" && raw["answers"] !== null ? raw["answers"] : {}) as Record<string, unknown>;
  const answers = {} as Record<QuestionKey, string>;
  for (const question of QUESTIONS) {
    const value = rawAnswers[question.key] ?? "";
    if (typeof value !== "string") return { ok: false, message: `Answer "${question.prompt}" with text.` };
    if (value.length > MAX_ANSWER_LENGTH) return { ok: false, message: `Keep "${question.prompt}" to at most ${MAX_ANSWER_LENGTH} characters.` };
    answers[question.key] = value.trim();
  }
  if (Object.values(answers).every((a) => !a)) return { ok: false, message: "Answer at least one of the five questions." };

  return {
    ok: true,
    value: {
      title: (raw["title"] as string).trim(),
      eventType: (raw["eventType"] as string).trim(),
      eventDate: typeof date === "string" && date ? date : null,
      organizerName: (raw["organizerName"] as string).trim(),
      answers,
    },
  };
}
