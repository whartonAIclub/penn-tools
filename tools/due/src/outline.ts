// Reading a course outline PDF with the AI API: the course's details and its
// graded deadlines, turned into the shapes the rest of Due works with. The
// tool's route (apps/web/src/app/tools/due/read/route.ts) passes in the
// signed-in user's AI, so this runs on the student's own key.
//
// The model reports what the outline says (a date, or a week and weekday, and
// a time or "at class"); dates from weeks are worked out in deadlines.ts, once
// the student has confirmed the first week of classes.

import { AI_PROVIDERS, base64FileType, base64Bytes, isBase64, z } from "@penntools/core/ai";
import type { AI, AIProvider, AIUsage } from "@penntools/core/ai";
import { isDate, isTime } from "./dates.js";
import { MAX_RECURRING_WEEKS } from "./recurring.js";
import {
  REPEAT_KINDS,
  WEEKDAY_LABELS,
  type CourseDetails,
  type Deadline,
  type RecurringDeadline,
  type TimeChoice,
} from "./types.js";

/** The largest outline, in bytes. Outlines are rarely over 2 MB. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** The most pages an outline may have, bounding what one read costs the student. The route counts them. */
export const MAX_PDF_PAGES = 40;
export const MAX_FILENAME_LENGTH = 200;
/** The largest request body a valid outline needs: the PDF as base64, plus room for the other fields. */
export const MAX_REQUEST_BYTES = Math.ceil(MAX_PDF_BYTES / 3) * 4 + 16 * 1024;
/** More than any outline has; a longer list means the model went wrong. */
const MAX_DEADLINES = 150;
const MAX_RECURRING = 20;

/** Due's model: the cheapest tier at low reasoning, enough to find dates in an outline (see PLAN.md). */
export const OUTLINE_TIER = "fast" as const;
export const OUTLINE_REASONING = "low" as const;

export const OutlineReading = z.object({
  course: z.object({
    name: z
      .string()
      .nullable()
      .describe('The course number, e.g. "FNCE 6110", or a short course title if there is no number. Null if neither.'),
    classDays: z.array(z.enum(WEEKDAY_LABELS)).describe("The weekdays the class meets. Empty if the outline doesn't say."),
    classStart: z.string().nullable().describe('When class starts, 24-hour "HH:MM", e.g. "13:45". Null if not given.'),
    classEnd: z.string().nullable().describe('When class ends, 24-hour "HH:MM". Null if not given.'),
    firstClassDate: z.string().nullable().describe('The date of the first class, "YYYY-MM-DD". Null if not given.'),
  }),
  deadlines: z.array(
    z.object({
      title: z.string().describe('Short, as a calendar event title, e.g. "Problem Set 3" or "Marriott case write-up".'),
      kind: z.enum(["assignment", "exam"]).describe("exam for exams, midterms, finals and quizzes; assignment for everything else."),
      date: z.string().nullable().describe('"YYYY-MM-DD" when the outline gives or implies a calendar date. Null otherwise.'),
      week: z.number().int().nullable().describe('The week number when the outline gives a week instead of a date, e.g. 5 for "Week 5". Null otherwise.'),
      weekday: z.enum(WEEKDAY_LABELS).nullable().describe("The weekday within that week, if the outline names one. Null otherwise."),
      time: z.string().nullable().describe('The due time, 24-hour "HH:MM", e.g. "23:59" for 11:59 PM or midnight. Null if none is given or it is due at class.'),
      atClass: z.boolean().describe("True if it is due at, before or in class, or the exam is held in class."),
      outlineSays: z.string().describe('What the outline says about when it is due, in a few words, e.g. "Session 5, before class".'),
    }),
  ),
  repeating: z.array(
    z.object({
      title: z.string().describe('Short, e.g. "Reflection paper".'),
      kind: z.enum(["assignment", "exam"]).describe("exam for recurring quizzes; assignment for everything else."),
      repeat: z.enum(REPEAT_KINDS).describe("every-class if due at or before each class; weekly if due once a week."),
      weekday: z.enum(WEEKDAY_LABELS).nullable().describe("For weekly: the day it is due, if given. Null otherwise."),
      time: z.string().nullable().describe('The due time, 24-hour "HH:MM". Null if none is given or it is due at class.'),
      atClass: z.boolean().describe("True if it is due at or before class."),
      firstWeek: z.number().int().nullable().describe("The first week it is due, if the outline says or implies it (week 1 is the first week of classes). Null otherwise."),
      lastWeek: z.number().int().nullable().describe("The last week it is due: as stated, or else the last week of classes if the outline shows it. Null otherwise."),
      skipWeeks: z.array(z.number().int()).describe("Weeks between the first and last with nothing due, such as breaks or holidays the outline mentions."),
      outlineSays: z.string().describe('What the outline says about it, in a few words, e.g. "Due before each Monday class".'),
    }),
  ),
});
export type OutlineReading = z.infer<typeof OutlineReading>;

export function systemPrompt(today: string): string {
  return [
    "You read university course outlines (syllabi) and list their graded deadlines, so a student can put them in a calendar.",
    "Include every graded item that has its own due date or exam date: assignments, problem sets, case write-ups, papers, projects and their milestones, presentations, quizzes, midterms and final exams.",
    "Leave out readings, ungraded preparation and ongoing participation grades.",
    "Graded items that repeat every class or every week without their own listed dates, such as weekly reflection papers or recurring quizzes, go in repeating, once each, not in deadlines. Repeating readings are not graded deadlines: leave them out.",
    "List each deadline once. If the outline has a session-by-session schedule with dates, use it to turn \"due Session 5\" into that session's date.",
    "Never invent a date or time. When the outline gives only a week number, give the week and leave the date null. When it gives nothing, leave both null.",
    `Today is ${today}. When a date has no year, use the year of the term the outline is for; if that's not stated, the next such date after today.`,
    "Course details come from the outline's header or logistics section. Times are local Philadelphia times.",
  ].join("\n");
}

export interface OutlineResult {
  course: CourseDetails;
  deadlines: Deadline[];
  recurring: RecurringDeadline[];
  usage: AIUsage;
}

/** The course details and deadlines in a course outline PDF (`data` is base64). */
export async function readOutline(
  ai: AI,
  provider: AIProvider,
  pdf: { filename: string; data: string },
  options: { today?: string; signal?: AbortSignal } = {},
): Promise<OutlineResult> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const { object, usage } = await ai.generateObject({
    provider,
    tier: OUTLINE_TIER,
    reasoning: OUTLINE_REASONING,
    schema: OutlineReading,
    system: systemPrompt(today),
    messages: [
      {
        role: "user",
        content: [
          { type: "pdf", filename: pdf.filename, data: pdf.data },
          { type: "text", text: "List this course's details and graded deadlines." },
        ],
      },
    ],
    ...(options.signal && { signal: options.signal }),
  });
  return { ...toDue(object), usage };
}

/** The model's reading as Due's own shapes, dropping anything malformed. */
export function toDue(reading: OutlineReading): { course: CourseDetails; deadlines: Deadline[]; recurring: RecurringDeadline[] } {
  const { course } = reading;
  const classDays = [...new Set(course.classDays.map(weekdayNumber))].sort((a, b) => a - b);
  const classStart = isTime(course.classStart) ? course.classStart : null;

  const deadlines = reading.deadlines
    .filter((d) => d.title.trim())
    .slice(0, MAX_DEADLINES)
    .map((d, i): Deadline => {
      const date = isDate(d.date) ? d.date : null;
      const week = d.week !== null && d.week >= 1 && d.week <= 30 ? d.week : null;
      const day = week !== null && d.weekday ? weekdayNumber(d.weekday) : null;
      // Given only a week, the review screen guesses the week's first class, so
      // without a time from the outline, guess that class's time too.
      const weekOnly = date === null && week !== null && day === null;
      const time = weekOnly && !isTime(d.time) && classStart !== null ? { kind: "class-time" as const } : timeChoice(d.time, d.atClass);
      return {
        id: `outline-${i + 1}`,
        title: d.title.trim(),
        kind: d.kind,
        date,
        week,
        day,
        time,
        include: true,
        note: d.outlineSays.trim() || null,
      };
    });

  const validWeek = (week: number | null) => (week !== null && week >= 1 && week <= MAX_RECURRING_WEEKS ? week : null);
  const recurring = reading.repeating
    .filter((r) => r.title.trim())
    .slice(0, MAX_RECURRING)
    .map((r, i): RecurringDeadline => {
      const firstWeek = validWeek(r.firstWeek);
      const lastWeek = validWeek(r.lastWeek);
      const time = !isTime(r.time) && !r.atClass && r.repeat === "every-class" && classStart !== null
        ? { kind: "class-time" as const }
        : timeChoice(r.time, r.atClass);
      return {
        id: `repeating-${i + 1}`,
        title: r.title.trim(),
        kind: r.kind,
        repeat: r.repeat,
        weekday: r.weekday ? weekdayNumber(r.weekday) : null,
        time,
        firstWeek,
        lastWeek,
        skipWeeks: [...new Set(r.skipWeeks)].filter((w) => firstWeek !== null && lastWeek !== null && w > firstWeek && w < lastWeek).sort((a, b) => a - b),
        include: true, // graded, so ticked by default; the review screen asks the student to confirm
        confirmed: false,
        note: r.outlineSays.trim() || null,
      };
    });

  return {
    recurring,
    course: {
      name: course.name?.trim() ?? "",
      classDays,
      classStart,
      classEnd: isTime(course.classEnd) ? course.classEnd : null,
      week1Start: isDate(course.firstClassDate) ? course.firstClassDate : null,
    },
    deadlines,
  };
}

/**
 * At class wins when the outline says so: a time from the outline is often the
 * class's own start time. Without a known class time it's still class time, and
 * the review screen asks the student for it.
 */
function timeChoice(time: string | null, atClass: boolean): TimeChoice {
  if (atClass) return { kind: "class-time" };
  if (!isTime(time)) return { kind: "all-day" };
  if (time === "23:59") return { kind: "end-of-day" };
  return { kind: "custom", time };
}

function weekdayNumber(label: (typeof WEEKDAY_LABELS)[number]): number {
  return WEEKDAY_LABELS.indexOf(label) + 1;
}

/** Why an outline upload is invalid, or null if it's fine. The route counts pages, which needs a PDF parser. */
export function checkOutlineRequest(request: { provider?: unknown; filename?: unknown; data?: unknown }): string | null {
  const { provider, filename, data } = request;
  if (!AI_PROVIDERS.includes(provider as AIProvider)) return `provider must be ${AI_PROVIDERS.join(" or ")}.`;
  if (typeof filename !== "string" || !filename.trim() || filename.length > MAX_FILENAME_LENGTH) {
    return `The file needs a name under ${MAX_FILENAME_LENGTH} characters.`;
  }
  if (typeof data !== "string" || !data) return "The file is empty.";
  if (!isBase64(data) || base64FileType(data) !== "application/pdf") return `${filename} isn't a PDF.`;
  if (base64Bytes(data) > MAX_PDF_BYTES) return `${filename} is over ${MAX_PDF_BYTES / 1024 / 1024} MB.`;
  return null;
}
