// The brief for an event someone is planning: find the most relevant accepted
// lessons by meaning, then have the AI write a few short points, each citing
// the lessons (and attendance counts) it rests on. Citations are ids only, and
// any the AI invents are dropped, so every quote shown comes from the
// database, never from the model.

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import type { Sql } from "postgres";
import type { ExcerptMeta } from "./imports/excerpts.js";
import type { LessonCategory, SourceKind } from "./storage.js";

export const MAX_QUERY_LENGTH = 500;
/** Lessons sent to the AI for one brief. */
export const BRIEF_LESSON_LIMIT = 40;
/** Attendance rows sent to the AI for one brief. */
export const BRIEF_ATTENDANCE_LIMIT = 20;

/** Where a lesson's quote comes from: an organizer's answer, or an imported file. */
export type LessonOrigin =
  | { type: "answer"; eventId: string; eventTitle: string; organizerName: string; eventDate: string | null }
  | { type: "excerpt"; excerptId: number; filename: string; kind: SourceKind; meta: ExcerptMeta };

export interface BriefLesson {
  id: number;
  category: LessonCategory;
  summary: string;
  quote: string;
  origin: LessonOrigin;
}

export interface AttendanceFact {
  id: number;
  eventName: string;
  eventDate: string | null;
  rsvps: number;
  attended: number | null;
}

export interface BriefPoint {
  text: string;
  lessons: BriefLesson[];
  attendance: AttendanceFact[];
}

/** Why `query` can't be used, or null if it's fine. Server actions get browser input, so check it. */
export function checkQuery(query: unknown): string | null {
  if (typeof query !== "string" || !query.trim()) return "Describe the event you're planning.";
  if (query.length > MAX_QUERY_LENGTH) return `Keep the description to at most ${MAX_QUERY_LENGTH} characters.`;
  return null;
}

/**
 * The accepted lessons closest in meaning to `query`, best first. Only lessons
 * embedded with the current model are comparable, so others are left out.
 */
export async function findLessons(sql: Sql, embeddings: EmbeddingProvider, query: string, limit = BRIEF_LESSON_LIMIT): Promise<BriefLesson[]> {
  const vector = `[${(await embeddings.embed(query)).join(",")}]`;
  // pgvector's type and operator live in `public`, outside this role's
  // search_path, so both are schema-qualified.
  const rows = await sql<LessonRow[]>`
    SELECT l.id, l.category, l.summary, l.quote,
           l.answer_id, ev.id AS event_id, ev.title AS event_title, ev.organizer_name, ev.event_date::text AS event_date,
           l.excerpt_id, s.filename, s.kind, ex.meta
    FROM lessons l
    LEFT JOIN answers a ON a.id = l.answer_id
    LEFT JOIN events ev ON ev.id = a.event_id
    LEFT JOIN excerpts ex ON ex.id = l.excerpt_id
    LEFT JOIN sources s ON s.id = ex.source_id
    WHERE l.status = 'accepted' AND l.model = ${embeddings.model}
    ORDER BY l.embedding OPERATOR(public.<=>) ${vector}::public.vector
    LIMIT ${limit}
  `;
  return rows.map(toBriefLesson);
}

/**
 * Attendance for events whose names share a word with `query` (words of four
 * letters or more), most recent first.
 */
export async function findAttendance(sql: Sql, query: string, limit = BRIEF_ATTENDANCE_LIMIT): Promise<AttendanceFact[]> {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])];
  if (words.length === 0) return [];
  const patterns = words.map((w) => `%${w}%`);
  const rows = await sql<{ id: string; event_name: string; event_date: string | null; rsvps: number; attended: number | null }[]>`
    SELECT id, event_name, event_date::text AS event_date, rsvps, attended
    FROM attendance
    WHERE event_name ILIKE ANY (${patterns})
    ORDER BY event_date DESC NULLS LAST, id DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ id: Number(r.id), eventName: r.event_name, eventDate: r.event_date, rsvps: r.rsvps, attended: r.attended }));
}

export const BriefSchema = z.object({
  points: z.array(
    z.object({
      text: z.string().describe("One short, specific point for the organizer"),
      lessonIds: z.array(z.number().int()).describe("Ids of the lessons this point rests on"),
      attendanceIds: z.array(z.number().int()).describe("Ids of the attendance rows this point rests on; empty if none"),
    }),
  ),
});
export type BriefSchema = z.infer<typeof BriefSchema>;

export const BRIEF_SYSTEM_PROMPT = [
  "You brief a student club leader who is planning an event, using only what past organizers recorded.",
  "Write at most six short points, most important first: what to watch for, what it will really cost, who to contact or avoid,",
  "how turnout compares with RSVPs, and what takes longest. Use only the lessons and attendance rows given; never add advice of your own.",
  "Skip lessons that don't apply to this event. Every point must cite at least one lesson or attendance row by id.",
  "If nothing given applies, return no points.",
].join(" ");

/**
 * The brief for `query`. Points cite lessons and attendance rows by id; ids
 * the AI made up are dropped, and so is any point left with no citation.
 */
export async function buildBrief(
  ai: AI,
  provider: AIProvider,
  query: string,
  lessons: BriefLesson[],
  attendance: AttendanceFact[] = [],
): Promise<BriefPoint[]> {
  if (lessons.length === 0 && attendance.length === 0) return [];
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const attendanceById = new Map(attendance.map((a) => [a.id, a]));

  const content = [
    `Event being planned: ${query.trim()}`,
    "Lessons:",
    ...lessons.map((l) => `- [lesson ${l.id}] (${l.category}) ${l.summary} — "${l.quote}"`),
    ...(attendance.length
      ? ["Attendance:", ...attendance.map((a) => `- [attendance ${a.id}] ${a.eventName}${a.eventDate ? ` (${a.eventDate})` : ""}: ${a.rsvps} RSVPs, ${a.attended ?? "unknown"} attended`)]
      : []),
  ].join("\n");

  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: BriefSchema,
    system: BRIEF_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  return object.points
    .map((point) => ({
      text: point.text,
      lessons: unique(point.lessonIds).flatMap((id) => lessonById.get(id) ?? []),
      attendance: unique(point.attendanceIds).flatMap((id) => attendanceById.get(id) ?? []),
    }))
    .filter((point) => point.lessons.length > 0 || point.attendance.length > 0);
}

interface LessonRow {
  id: string;
  category: LessonCategory;
  summary: string;
  quote: string;
  answer_id: string | null;
  event_id: string | null;
  event_title: string | null;
  organizer_name: string | null;
  event_date: string | null;
  excerpt_id: string | null;
  filename: string | null;
  kind: SourceKind | null;
  meta: ExcerptMeta | null;
}

function toBriefLesson(row: LessonRow): BriefLesson {
  const origin: LessonOrigin =
    row.answer_id !== null
      ? { type: "answer", eventId: row.event_id!, eventTitle: row.event_title!, organizerName: row.organizer_name!, eventDate: row.event_date }
      : { type: "excerpt", excerptId: Number(row.excerpt_id), filename: row.filename!, kind: row.kind!, meta: row.meta ?? {} };
  return { id: Number(row.id), category: row.category, summary: row.summary, quote: row.quote, origin };
}

function unique(ids: number[]): number[] {
  return [...new Set(ids)];
}
