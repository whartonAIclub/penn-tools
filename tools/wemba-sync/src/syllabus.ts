// ─────────────────────────────────────────────────────────────────────────────
// WEMBA Sync: a course's syllabus, read from its PDF
//
// Students upload each course's syllabus once a semester. extractSyllabus()
// has the AI sort it into the same categories for every course (overview,
// sessions, assignments, grading, materials, policies), which the Courses tab
// shows and syllabi.ts saves. The AI is passed in by the tool's route, so
// tests use a fake (see __tests__/syllabus.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";

/** The most pages a syllabus PDF may have, bounding what one upload costs the user. */
export const MAX_SYLLABUS_PAGES = 40;
/** The most syllabi one student keeps: a semester's courses, with room to spare. */
export const MAX_SYLLABI = 20;
/** The longest Word document's text, in characters (about 50 pages), bounding what one upload costs the user. */
export const MAX_SYLLABUS_TEXT = 150_000;

/** A syllabus as the AI reads it: a PDF, or a Word document's text (see docx.ts). */
export type SyllabusDocument =
  | { kind: "pdf"; filename: string; data: string }
  | { kind: "text"; filename: string; text: string };

// Fields that may be missing are .nullable(), not .optional(): providers'
// structured output requires every field to be present.
export const Syllabus = z.object({
  courseCode: z.string().nullable().describe("The course code, e.g. 'FNCE 6130', or null"),
  title: z.string().describe("The course's name, e.g. 'Corporate Finance'"),
  term: z.string().nullable().describe("The semester or term, e.g. 'Fall 2026', or null"),
  summary: z.string().nullable().describe("Two or three sentences on what the course covers, or null"),
  instructors: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().nullable().describe("e.g. 'Professor', 'Teaching assistant', or null"),
        email: z.string().nullable(),
        officeHours: z.string().nullable().describe("When and where, as written, or null"),
      }),
    )
    .describe("Faculty and TAs, as the syllabus lists them"),
  sessions: z
    .array(
      z.object({
        number: z.number().nullable().describe("The session or class number, or null"),
        date: z.string().nullable().describe("YYYY-MM-DD, or null if the syllabus gives none"),
        topic: z.string(),
        readings: z.array(z.string()).describe("Readings and cases to read before this session, each as cited"),
        prepare: z.array(z.string()).describe("Anything else to do before it: questions to answer, problem sets to bring"),
        notes: z.string().nullable(),
      }),
    )
    .describe("Every class session, in order"),
  assignments: z
    .array(
      z.object({
        title: z.string(),
        due: z.string().nullable().describe("YYYY-MM-DD, or null if not dated"),
        dueTime: z.string().nullable().describe("24-hour HH:MM, or null"),
        weight: z.string().nullable().describe("Its share of the grade as written, e.g. '20%', or null"),
        group: z.boolean().describe("True if done in a team or group"),
        details: z.string().nullable().describe("One or two sentences: what to submit and how"),
      }),
    )
    .describe("Every graded deliverable: assignments, papers, exams, quizzes, projects"),
  grading: z
    .array(z.object({ component: z.string(), weight: z.string().describe("As written, e.g. '25%' or '50 points'") }))
    .describe("How the grade is made up"),
  materials: z
    .array(
      z.object({
        title: z.string(),
        required: z.boolean(),
        details: z.string().nullable().describe("Where to get it, edition, or null"),
      }),
    )
    .describe("Books, course packs, software and other materials"),
  policies: z
    .array(z.object({ topic: z.string().describe("e.g. 'Attendance', 'Laptops', 'Late work'"), details: z.string() }))
    .describe("Course rules, each summarized in one to three sentences"),
  warnings: z.array(z.string()).describe("Anything you weren't sure of, for the student to check"),
});
export type Syllabus = z.infer<typeof Syllabus>;
export type Session = Syllabus["sessions"][number];
export type Assignment = Syllabus["assignments"][number];

const SYSTEM = [
  "You read course syllabi for Wharton MBA Program for Executives (WEMBA) students and return them as data.",
  "Include every session and every graded deliverable, even ones without a date.",
  "WEMBA classes meet on class weekends (Friday and Saturday), often several sessions a weekend.",
  "Syllabi often give dates without a year: use the year that puts the course closest to today's date.",
  "Keep readings and case names as cited. Summarize policies briefly; don't copy whole paragraphs.",
  "If something is ambiguous, such as a due date that conflicts with the session list, pick the likeliest and list it in warnings.",
].join(" ");

/** The syllabus in the document, read by the AI. `today` is YYYY-MM-DD, for the year the document may leave out. */
export async function extractSyllabus(
  ai: AI,
  provider: AIProvider,
  document: SyllabusDocument,
  today: string,
): Promise<Syllabus> {
  const { object } = await ai.generateObject({
    provider,
    tier: "standard", // long, dense documents: worth the stronger model
    reasoning: "low",
    schema: Syllabus,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          document.kind === "pdf"
            ? { type: "pdf", filename: document.filename, data: document.data }
            : { type: "text", text: `The syllabus, from the Word document ${document.filename}:\n\n${document.text}` },
          { type: "text", text: `Today is ${today}. Read this syllabus.` },
        ],
      },
    ],
  });
  return object;
}

/**
 * What identifies a course among a student's syllabi, so uploading a new
 * version replaces the old one: its code without spaces or case, else its title.
 */
export function courseKey(syllabus: Pick<Syllabus, "courseCode" | "title">): string {
  const key = (syllabus.courseCode ?? syllabus.title).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return key || syllabus.title.toLowerCase();
}

/** A deadline from one of a student's courses. */
export interface Deadline extends Assignment {
  course: string;
}

/**
 * Dated assignments across courses due on or after `today` (YYYY-MM-DD),
 * soonest first.
 */
export function upcomingDeadlines(syllabi: Syllabus[], today: string): Deadline[] {
  return syllabi
    .flatMap((syllabus) =>
      syllabus.assignments.map((assignment) => ({ ...assignment, course: syllabus.courseCode ?? syllabus.title })),
    )
    .filter((deadline) => deadline.due !== null && deadline.due >= today)
    .sort((a, b) => `${a.due} ${a.dueTime ?? "99:99"}`.localeCompare(`${b.due} ${b.dueTime ?? "99:99"}`));
}

/** The course's sessions on `date` (YYYY-MM-DD), e.g. to show a class weekend's readings. */
export function sessionsOn(syllabus: Syllabus, date: string): Session[] {
  return syllabus.sessions.filter((session) => session.date === date);
}
