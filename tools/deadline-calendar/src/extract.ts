// ─────────────────────────────────────────────────────────────────────────────
// Reading deadlines out of a syllabus PDF
//
// The tool's route (apps/web/src/app/tools/deadline-calendar/extract/route.ts)
// checks the upload with checkUpload, then calls extractDeadlines with the
// signed-in user's AI. The model reads the PDF itself, tables and all, and
// returns SyllabusDeadlines; cleanDeadlines and cleanGrading then fix what a
// schema can't check, such as a date that isn't a real date, and turn grading
// in points into percentages.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { base64Bytes, base64FileType, isBase64 } from "@penntools/core/ai/attachments";

/** The largest syllabus PDF, in bytes. Real syllabi are well under 1 MB. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** The most pages a syllabus PDF may have, bounding what one upload costs the user. */
export const MAX_PDF_PAGES = 30;
export const MAX_FILE_NAME_LENGTH = 200;
/** The largest request body the route reads: the PDF as base64, plus room for the rest. */
export const MAX_REQUEST_BYTES = Math.ceil(MAX_PDF_BYTES / 3) * 4 + 64 * 1024;

export const DEADLINE_TYPES = ["exam", "quiz", "assignment", "project", "presentation", "other"] as const;
export type DeadlineType = (typeof DEADLINE_TYPES)[number];

// Fields that may be missing are .nullable(), not .optional(): providers'
// structured output requires every field.
export const SyllabusDeadlines = z.object({
  course: z
    .string()
    .nullable()
    .describe("The course's code and name, e.g. 'ACCT 6130: Fundamentals of Financial and Managerial Accounting'"),
  deadlines: z.array(
    z.object({
      title: z.string().describe("Short and specific, e.g. 'Homework #2' or 'Midterm exam'"),
      type: z.enum(DEADLINE_TYPES),
      date: z.string().nullable().describe("YYYY-MM-DD, or null if the syllabus gives no specific date"),
      time: z.string().nullable().describe("When it's due or starts, as 24-hour HH:MM, or null if no time is given"),
      endTime: z.string().nullable().describe("When it ends, as 24-hour HH:MM, for exams and other timed events; else null"),
      section: z
        .string()
        .nullable()
        .describe("The sections or course numbers it applies to, if the syllabus limits it to some; else null"),
      needsReview: z.boolean().describe("true if the date is missing, inferred, ambiguous or listed inconsistently"),
      note: z.string().nullable().describe("For items that need review, why, in one short sentence; else null"),
      category: z
        .string()
        .nullable()
        .describe("The grading category it counts toward, exactly as named in `grading`; null if none fits"),
    }),
  ),
  gradingUnit: z
    .enum(["percent", "points"])
    .nullable()
    .describe("Whether the syllabus weights its grading categories in percent or in points; null if it gives no weights"),
  grading: z.array(
    z.object({
      category: z.string().describe("As the syllabus names it, e.g. 'Quizzes' or 'Midterm exam'"),
      weight: z.number().describe("The category's share of the grade, in gradingUnit, as the syllabus states it"),
      count: z.number().nullable().describe("How many graded items the category has, e.g. 7 quizzes; null if not stated"),
      counted: z
        .number()
        .nullable()
        .describe("How many of them count toward the grade, e.g. 5 when the best 5 of 7 count, or count when none are dropped; null if not stated"),
    }),
  ),
});
export type SyllabusDeadlines = z.infer<typeof SyllabusDeadlines>;
export type Deadline = SyllabusDeadlines["deadlines"][number];

/** One grading category, its weight always a percentage of the course grade. */
export interface GradingCategory {
  category: string;
  /** Its share of the course grade, 0–100, to one decimal place. */
  percent: number;
  /** How many graded items it has, or null if the syllabus doesn't say. */
  count: number | null;
  /** How many of them count toward the grade (count minus the dropped ones), or null if the syllabus doesn't say. */
  counted: number | null;
}

/** What the tool returns for one syllabus: its deadlines, sorted, and its grading breakdown. */
export interface Syllabus {
  course: string | null;
  deadlines: Deadline[];
  grading: GradingCategory[];
}

export interface SyllabusFile {
  name: string;
  /** The PDF as base64, without a data: prefix. */
  data: string;
}

/** Why the upload can't be read, or null if it's fine. The route gets browser input, so check it. */
export function checkUpload(file: unknown): string | null {
  if (typeof file !== "object" || file === null) return "Choose a syllabus PDF.";
  const { name, data } = file as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.length > MAX_FILE_NAME_LENGTH) {
    return `The file needs a name under ${MAX_FILE_NAME_LENGTH} characters.`;
  }
  if (typeof data !== "string" || !data || !isBase64(data)) return `${name} couldn't be read.`;
  if (base64FileType(data) !== "application/pdf") return `${name} isn't a PDF. Save it as a PDF and upload it again.`;
  if (base64Bytes(data) > MAX_PDF_BYTES) return `${name} is over ${MAX_PDF_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** Today's date in Philadelphia as YYYY-MM-DD, so the model can tell which year undated entries fall in. */
export function todayInPhiladelphia(now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

function instructions(today: string): string {
  return `You read a course syllabus and list its deadlines for a student's calendar. Today is ${today}.

List every graded deliverable that has a due date or a scheduled time: exams, quizzes, homework, problem sets, papers, projects, presentations and graded case write-ups. Leave out readings, lecture topics, office hours, review sessions and other ungraded events.

Dates are YYYY-MM-DD. When the syllabus leaves out the year, take it from the term it names (for example, Fall 2026 means 2026), or from today's date if it names none, and don't mark the item for review just for that.

When a graded item has no specific date (for example, "due the evening after the material is taught"), include it once with date null and needsReview true rather than guessing. When the syllabus gives an item's date more than once and the dates disagree, use the most specific one and set needsReview with a note naming the conflict.

When the syllabus gives different dates for different sections or course numbers, list each version separately and name its section.

Times are 24-hour HH:MM: 11:59pm is 23:59 and noon is 12:00. Give an exam's start as time and its end as endTime. Use null when no time is given.

Also list how the course grade is made up, one entry per category the syllabus weights (for example class participation, quizzes, homework, midterm exam, final exam), with its weight as the syllabus states it, in percent or in points. Give how many items each category has and how many count toward the grade: when the best 5 of 7 quizzes count, count is 7 and counted is 5; when every item counts, counted equals count. Leave out extra credit and bonus points. If the syllabus gives no weights, return an empty list and a null gradingUnit. Give each deadline the category it counts toward, named exactly as in the grading list.`;
}

/** The syllabus's deadlines and grading breakdown, read by the model from the PDF and cleaned. */
export async function extractDeadlines(
  ai: AI,
  provider: AIProvider,
  file: SyllabusFile,
  today: string,
  signal?: AbortSignal,
): Promise<Syllabus> {
  const { object } = await ai.generateObject({
    provider,
    // Accuracy matters more than speed here, so the standard tier with its default reasoning.
    tier: "standard",
    schema: SyllabusDeadlines,
    system: instructions(today),
    messages: [
      {
        role: "user",
        content: [
          { type: "pdf", filename: file.name, data: file.data },
          { type: "text", text: "List this syllabus's deadlines." },
        ],
      },
    ],
    ...(signal && { signal }),
  });
  return {
    course: object.course,
    deadlines: sortDeadlines(cleanDeadlines(object.deadlines)),
    grading: cleanGrading(object.grading, object.gradingUnit),
  };
}

/** A whole number of at least 1, or null for anything else. */
function itemCount(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 1 ? value : null;
}

/**
 * The grading categories with every weight as a percentage of the course
 * grade: weights in points are divided by their total (Marketing 612 grades
 * out of 160), and percentages are kept as stated, even if they don't add up
 * to exactly 100. Categories without a positive weight are dropped, and a
 * `counted` that isn't between 1 and `count` becomes null.
 */
export function cleanGrading(grading: SyllabusDeadlines["grading"], unit: SyllabusDeadlines["gradingUnit"]): GradingCategory[] {
  const weighted = grading.filter((g) => Number.isFinite(g.weight) && g.weight > 0);
  const totalPoints = weighted.reduce((sum, g) => sum + g.weight, 0);
  return weighted.map((g) => {
    const count = itemCount(g.count);
    const counted = itemCount(g.counted);
    const percent = unit === "points" ? (g.weight / totalPoints) * 100 : g.weight;
    return {
      category: g.category,
      percent: Math.round(percent * 10) / 10,
      count,
      counted: counted !== null && (count === null || counted <= count) ? counted : null,
    };
  });
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whether `value` is a real calendar date as YYYY-MM-DD (not 2026-02-30). */
export function isValidDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The deadlines with what the schema can't check fixed: a date that isn't a
 * real YYYY-MM-DD date becomes null and needs review, and a time that isn't
 * HH:MM is dropped.
 */
export function cleanDeadlines(deadlines: Deadline[]): Deadline[] {
  return deadlines.map((deadline) => {
    const time = deadline.time !== null && TIME_RE.test(deadline.time) ? deadline.time : null;
    const endTime = time !== null && deadline.endTime !== null && TIME_RE.test(deadline.endTime) ? deadline.endTime : null;
    if (deadline.date === null || isValidDate(deadline.date)) return { ...deadline, time, endTime };
    return {
      ...deadline,
      date: null,
      time,
      endTime,
      needsReview: true,
      note: deadline.note ?? `The syllabus's date ("${deadline.date}") couldn't be read.`,
    };
  });
}

/** Dated deadlines first, earliest first (untimed before timed on the same day), then undated ones in syllabus order. */
export function sortDeadlines(deadlines: Deadline[]): Deadline[] {
  // ISO dates and HH:MM times sort correctly as strings; Array.prototype.sort is stable.
  const key = (d: Deadline) => `${d.date ?? "9999-99-99"} ${d.time ?? "00:00"}`;
  return [...deadlines].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}
