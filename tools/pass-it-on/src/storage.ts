// Pass It On's storage, in its own passiton schema. Callers pass the database
// client (toolSql("passiton")). All of a club's records are shared: the pilot
// runs for one club, so reads aren't scoped to the signed-in user.

import type { Sql } from "postgres";
import type { AttendanceDraft } from "./imports/campusgroups.js";
import type { ExcerptDraft, ExcerptMeta } from "./imports/excerpts.js";
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

// ── Imports ───────────────────────────────────────────────────────────────────

export type SourceKind = "drive" | "whatsapp" | "campusgroups";
export type SourceStatus = "imported" | "extracting" | "done";

export interface NewSource {
  kind: SourceKind;
  filename: string;
  uploadedBy: string;
}

export interface SourceSummary {
  id: string;
  kind: SourceKind;
  filename: string;
  importedAt: string;
  status: SourceStatus;
  excerpts: number;
  /** Excerpts lessons have already been extracted from. */
  extracted: number;
  attendanceRows: number;
  pendingLessons: number;
}

export interface StoredExcerpt {
  id: number;
  sourceId: string;
  text: string;
  meta: ExcerptMeta;
}

/** Rows per INSERT, well under Postgres's limit on query parameters. */
const INSERT_BATCH = 500;

/**
 * Saves an upload with its excerpts and attendance counts in one transaction;
 * returns the source's id. A source with no excerpts (attendance only) is
 * marked done, since there's nothing to extract from.
 */
export async function saveImport(sql: Sql, source: NewSource, excerpts: ExcerptDraft[], attendance: AttendanceDraft[] = []): Promise<string> {
  return sql.begin(async (transaction) => {
    // See saveEvent on this cast.
    const tx = transaction as unknown as Sql;
    const status: SourceStatus = excerpts.length === 0 ? "done" : "imported";
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO sources (kind, filename, uploaded_by, status)
      VALUES (${source.kind}, ${source.filename}, ${source.uploadedBy}, ${status})
      RETURNING id
    `;
    const sourceId = row!.id;

    for (let i = 0; i < excerpts.length; i += INSERT_BATCH) {
      const batch = excerpts.slice(i, i + INSERT_BATCH).map((e, j) => ({
        source_id: sourceId,
        position: i + j,
        text: e.text,
        meta: tx.json(e.meta as Parameters<typeof tx.json>[0]),
      }));
      await tx`INSERT INTO excerpts ${tx(batch)}`;
    }
    for (let i = 0; i < attendance.length; i += INSERT_BATCH) {
      const batch = attendance.slice(i, i + INSERT_BATCH).map((a) => ({
        source_id: sourceId,
        event_name: a.eventName,
        event_date: a.eventDate,
        rsvps: a.rsvps,
        attended: a.attended,
      }));
      await tx`INSERT INTO attendance ${tx(batch)}`;
    }
    return sourceId;
  });
}

/** Uploaded sources with their progress, newest first. */
export async function listSources(sql: Sql): Promise<SourceSummary[]> {
  const rows = await sql<
    { id: string; kind: SourceKind; filename: string; imported_at: Date; status: SourceStatus; excerpts: string; extracted: string; attendance_rows: string; pending_lessons: string }[]
  >`
    SELECT s.id, s.kind, s.filename, s.imported_at, s.status,
      (SELECT COUNT(*) FROM excerpts e WHERE e.source_id = s.id) AS excerpts,
      (SELECT COUNT(*) FROM excerpts e WHERE e.source_id = s.id AND e.extracted_at IS NOT NULL) AS extracted,
      (SELECT COUNT(*) FROM attendance a WHERE a.source_id = s.id) AS attendance_rows,
      (SELECT COUNT(*) FROM lessons l JOIN excerpts e ON e.id = l.excerpt_id WHERE e.source_id = s.id AND l.status = 'pending') AS pending_lessons
    FROM sources s
    ORDER BY s.imported_at DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    filename: r.filename,
    importedAt: r.imported_at.toISOString(),
    status: r.status,
    excerpts: Number(r.excerpts),
    extracted: Number(r.extracted),
    attendanceRows: Number(r.attendance_rows),
    pendingLessons: Number(r.pending_lessons),
  }));
}

/** The next excerpts of a source that lessons haven't been extracted from yet, in order. */
export async function nextExcerptBatch(sql: Sql, sourceId: string, limit: number): Promise<StoredExcerpt[]> {
  if (!UUID_RE.test(sourceId)) return [];
  const rows = await sql<{ id: string; source_id: string; text: string; meta: ExcerptMeta }[]>`
    SELECT id, source_id, text, meta FROM excerpts
    WHERE source_id = ${sourceId} AND extracted_at IS NULL
    ORDER BY position
    LIMIT ${limit}
  `;
  return rows.map(toExcerpt);
}

/** An excerpt, or null if it doesn't exist. */
export async function getExcerpt(sql: Sql, id: number): Promise<(StoredExcerpt & { filename: string; kind: SourceKind }) | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [row] = await sql<{ id: string; source_id: string; text: string; meta: ExcerptMeta; filename: string; kind: SourceKind }[]>`
    SELECT e.id, e.source_id, e.text, e.meta, s.filename, s.kind
    FROM excerpts e JOIN sources s ON s.id = e.source_id
    WHERE e.id = ${id}
  `;
  return row ? { ...toExcerpt(row), filename: row.filename, kind: row.kind } : null;
}

/** Marks excerpts as extracted, and the source as done once none are left. */
export async function markExtracted(sql: Sql, sourceId: string, excerptIds: number[]): Promise<void> {
  if (excerptIds.length > 0) {
    await sql`UPDATE excerpts SET extracted_at = NOW() WHERE source_id = ${sourceId} AND id IN ${sql(excerptIds)}`;
  }
  await sql`
    UPDATE sources
    SET status = CASE WHEN EXISTS (SELECT 1 FROM excerpts WHERE source_id = ${sourceId} AND extracted_at IS NULL)
                      THEN 'extracting' ELSE 'done' END
    WHERE id = ${sourceId}
  `;
}

function toExcerpt(row: { id: string; source_id: string; text: string; meta: ExcerptMeta }): StoredExcerpt {
  return { id: Number(row.id), sourceId: row.source_id, text: row.text, meta: row.meta };
}

// ── Row mapping ───────────────────────────────────────────────────────────────

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
