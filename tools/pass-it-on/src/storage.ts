// Pass It On's storage, in its own passiton schema. Callers pass the database
// client (toolSql("passiton")). All of a club's records are shared: the pilot
// runs for one club, so reads aren't scoped to the signed-in user.

import type { Sql } from "postgres";
import type { QuestionKey } from "./questions.js";

export const LESSON_CATEGORIES = ["budget", "vendors", "turnout", "partners", "logistics", "timeline", "other"] as const;
export type LessonCategory = (typeof LESSON_CATEGORIES)[number];

export type LessonStatus = "pending" | "accepted" | "rejected";

export interface NewEvent {
  title: string;
  eventType: string;
  /** YYYY-MM-DD, or null when unknown. */
  eventDate: string | null;
  organizerName: string;
  createdBy: string;
  answers: Record<QuestionKey, string>;
}

export interface EventSummary {
  id: string;
  title: string;
  eventType: string;
  eventDate: string | null;
  organizerName: string;
}

export interface EventDetail extends EventSummary {
  answers: { id: number; question: QuestionKey; text: string }[];
}

/** A lesson to save. It quotes exactly one answer or excerpt. */
export interface NewLesson {
  answerId: number | null;
  excerptId: number | null;
  eventId: string | null;
  category: LessonCategory;
  summary: string;
  quote: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saves an event and its answers in one transaction; returns the event's id and each answer's id. */
export async function saveEvent(sql: Sql, event: NewEvent): Promise<{ id: string; answerIds: Record<QuestionKey, number> }> {
  return sql.begin(async (transaction) => {
    // postgres's TransactionSql type drops the call signature (a TypeScript
    // limit with Omit), though it runs queries exactly like Sql.
    const tx = transaction as unknown as Sql;
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO events (title, event_type, event_date, organizer_name, created_by)
      VALUES (${event.title}, ${event.eventType}, ${event.eventDate}, ${event.organizerName}, ${event.createdBy})
      RETURNING id
    `;
    const id = row!.id;
    const answerIds = {} as Record<QuestionKey, number>;
    for (const [question, text] of Object.entries(event.answers) as [QuestionKey, string][]) {
      const [answer] = await tx<{ id: number }[]>`
        INSERT INTO answers (event_id, question, text) VALUES (${id}, ${question}, ${text}) RETURNING id
      `;
      answerIds[question] = Number(answer!.id);
    }
    return { id, answerIds };
  });
}

/** Logged events, most recent first. */
export async function listEvents(sql: Sql): Promise<EventSummary[]> {
  const rows = await sql<EventRow[]>`
    SELECT id, title, event_type, event_date::text AS event_date, organizer_name
    FROM events ORDER BY created_at DESC LIMIT 200
  `;
  return rows.map(toSummary);
}

/** An event with its answers, or null if it doesn't exist. */
export async function getEvent(sql: Sql, id: string): Promise<EventDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await sql<EventRow[]>`
    SELECT id, title, event_type, event_date::text AS event_date, organizer_name FROM events WHERE id = ${id}
  `;
  if (!row) return null;
  const answers = await sql<{ id: string; question: QuestionKey; text: string }[]>`
    SELECT id, question, text FROM answers WHERE event_id = ${id} ORDER BY id
  `;
  return { ...toSummary(row), answers: answers.map((a) => ({ id: Number(a.id), question: a.question, text: a.text })) };
}

/** Saves lessons as pending; returns their ids in order. */
export async function saveLessons(sql: Sql, lessons: NewLesson[]): Promise<number[]> {
  if (lessons.length === 0) return [];
  const rows = await sql<{ id: string }[]>`
    INSERT INTO lessons ${sql(
      lessons.map((l) => ({
        answer_id: l.answerId,
        excerpt_id: l.excerptId,
        event_id: l.eventId,
        category: l.category,
        summary: l.summary,
        quote: l.quote,
      })),
    )}
    RETURNING id
  `;
  return rows.map((r) => Number(r.id));
}

/**
 * Accepts or rejects a lesson. Accepting stores its embedding, so briefs can
 * find it; rejecting clears it. Returns false if the lesson doesn't exist.
 */
export async function setLessonStatus(
  sql: Sql,
  id: number,
  status: Exclude<LessonStatus, "pending">,
  embedding?: { model: string; vector: number[] },
): Promise<boolean> {
  if (status === "accepted" && !embedding) throw new Error("Accepting a lesson needs its embedding.");
  const vector = embedding ? `[${embedding.vector.join(",")}]` : null;
  const rows = await sql`
    UPDATE lessons
    SET status = ${status},
        model = ${embedding?.model ?? null},
        embedding = ${vector}::public.vector
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

interface EventRow {
  id: string;
  title: string;
  event_type: string;
  event_date: string | null;
  organizer_name: string;
}

function toSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    title: row.title,
    eventType: row.event_type,
    eventDate: row.event_date,
    organizerName: row.organizer_name,
  };
}
