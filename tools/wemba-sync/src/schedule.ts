// ─────────────────────────────────────────────────────────────────────────────
// WEMBA Sync: a class weekend's schedule, read from the program's PDF
//
// The program office emails a PDF before each class weekend: both sections'
// classes, meals, events, logistics and save-the-dates. extractWeekend() has
// the AI read it into a WeekendSchedule; the page shows it as a calendar.
// The AI is passed in by the tool's route, so tests use a fake (see
// __tests__/schedule.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { base64Bytes, base64FileType, isBase64 } from "@penntools/core/ai/attachments";

/** The largest schedule PDF, in bytes. Real ones are well under 1 MB. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** The most pages a schedule PDF may have, bounding what one upload costs the user. */
export const MAX_PDF_PAGES = 10;
/** The largest request body the extract route reads: the PDF as base64, plus room for the other fields. */
export const MAX_REQUEST_BYTES = Math.ceil(MAX_PDF_BYTES / 3) * 4 + 64 * 1024;
export const MAX_FILENAME_LENGTH = 200;

export const ITEM_KINDS = ["class", "meal", "event"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

// Fields that may be missing are .nullable(), not .optional(): providers'
// structured output requires every field to be present.
export const WeekendSchedule = z.object({
  title: z.string().describe("A short name for the weekend, e.g. 'Class weekend · November 13–14'"),
  program: z.string().nullable().describe("The cohort or program named on the schedule, e.g. 'WEMBA 52', or null"),
  sections: z
    .array(z.string())
    .describe("The sections the schedule splits the class into, as labeled, e.g. ['Section 1', 'Section 2']; empty if none"),
  items: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD"),
        start: z.string().nullable().describe("24-hour HH:MM, or null if no time is given"),
        end: z.string().nullable().describe("24-hour HH:MM, or null if no end time is given"),
        kind: z.enum(ITEM_KINDS),
        title: z.string().describe("For a class, the course name or code; otherwise what it is, e.g. 'Lunch', 'Diwali celebration'"),
        course: z.string().nullable().describe("Course code, e.g. 'FNCE 6130', or null"),
        instructor: z.string().nullable(),
        location: z.string().nullable().describe("Room and building, or address"),
        section: z
          .string()
          .nullable()
          .describe("The section this applies to, exactly as written in `sections`; null if it's for everyone"),
        signupOnly: z.boolean().describe("True if only for people who signed up or registered"),
        notes: z.string().nullable().describe("One or two sentences of what attendees need to know, or null"),
      }),
    )
    .describe("Everything happening on the weekend's days: classes, meals and events"),
  logistics: z
    .array(z.object({ label: z.string(), details: z.string() }))
    .describe("Standing information for the weekend, e.g. hotels, meals, break stations"),
  upcoming: z
    .array(
      z.object({
        date: z.string().nullable().describe("YYYY-MM-DD of the first day, or null if not yet set"),
        endDate: z.string().nullable().describe("YYYY-MM-DD of the last day if it spans several, else null"),
        title: z.string(),
        details: z.string().nullable(),
      }),
    )
    .describe("Save-the-dates and reminders for dates after this weekend"),
  warnings: z
    .array(z.string())
    .describe("Anything you corrected or weren't sure of, for the student to check, e.g. a time that looked like a typo"),
});
export type WeekendSchedule = z.infer<typeof WeekendSchedule>;
export type ScheduleItem = WeekendSchedule["items"][number];

const SYSTEM = [
  "You read Wharton MBA Program for Executives (WEMBA) class weekend schedules and return them as data.",
  "Include every class in every section, each meal, and each event on the weekend's days, even ones without a time.",
  "A class block taught to both sections in different rooms is two items, one per section. Items for everyone have a null section.",
  "Schedules give dates without a year: use the year that puts the weekend closest to today's date.",
  "Fix obvious typos, such as a lunch listed as 12:00am, and list each fix in warnings.",
  "Put things happening after the weekend, such as save-the-dates, next weekend's dates and exam dates, in upcoming, not items.",
  "Leave out registration links and email addresses of individual people.",
].join(" ");

/** The weekend in the schedule PDF, read by the AI. `today` is YYYY-MM-DD, for the year the PDF leaves out. */
export async function extractWeekend(
  ai: AI,
  provider: AIProvider,
  pdf: { filename: string; data: string },
  today: string,
): Promise<WeekendSchedule> {
  const { object } = await ai.generateObject({
    provider,
    tier: "standard", // tables of times and rooms: worth the stronger model
    reasoning: "low",
    schema: WeekendSchedule,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "pdf", filename: pdf.filename, data: pdf.data },
          { type: "text", text: `Today is ${today}. Read this class weekend schedule.` },
        ],
      },
    ],
  });
  return { ...object, items: sortItems(object.items) };
}

/** Items by date, then start time; items without a time go after the day's timed ones. */
export function sortItems(items: ScheduleItem[]): ScheduleItem[] {
  const key = (item: ScheduleItem) => `${item.date} ${item.start ?? "99:99"}`;
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

/** The items a student in `section` attends: theirs and everyone's. Null shows every section's. */
export function itemsForSection(items: ScheduleItem[], section: string | null): ScheduleItem[] {
  return section === null ? items : items.filter((item) => item.section === null || item.section === section);
}

/** Items grouped by date, in order. */
export function groupByDate(items: ScheduleItem[]): { date: string; items: ScheduleItem[] }[] {
  const days = new Map<string, ScheduleItem[]>();
  for (const item of items) days.set(item.date, [...(days.get(item.date) ?? []), item]);
  return [...days].map(([date, dayItems]) => ({ date, items: dayItems }));
}

/**
 * Why the uploaded file can't be read, or null if it's fine. The route gets it
 * from the browser, so it checks everything; it counts pages itself, since
 * that needs a PDF parser.
 */
export function checkUpload(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Send the schedule as JSON.";
  const { filename, data } = body as Record<string, unknown>;
  if (typeof filename !== "string" || !filename.trim() || filename.length > MAX_FILENAME_LENGTH) {
    return `The file needs a name under ${MAX_FILENAME_LENGTH} characters.`;
  }
  if (typeof data !== "string" || !data) return `${filename} is empty.`;
  if (!isBase64(data) || base64FileType(data) !== "application/pdf") return `${filename} isn't a PDF.`;
  if (base64Bytes(data) > MAX_PDF_BYTES) return `${filename} is over ${MAX_PDF_BYTES / 1024 / 1024} MB.`;
  return null;
}
