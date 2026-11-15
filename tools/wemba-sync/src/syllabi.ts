// WEMBA Sync's syllabus storage, in its own wembasync schema (schema.sql).
// Callers pass the database client (toolSql("wembasync")) and the signed-in
// user's id. Syllabi are shared by the class: one copy per course, seen by
// every student, so a course's syllabus is uploaded once. A newer upload
// replaces it for everyone; only the student who uploaded the current copy
// can remove it.

import type { Sql } from "postgres";
import { MAX_SYLLABI, Syllabus, courseKey } from "./syllabus.js";

export interface SavedSyllabus {
  id: string;
  /** The uploaded PDF's name. */
  filename: string;
  syllabus: Syllabus;
  /** ISO timestamp of the latest upload. */
  updatedAt: string;
  /** True if the signed-in student uploaded this copy, so they can remove it. */
  mine: boolean;
}

/** Thrown by saveSyllabus when the class already has MAX_SYLLABI other courses. */
export class TooManySyllabiError extends Error {
  constructor() {
    super(`The class can keep up to ${MAX_SYLLABI} syllabi. Remove one you uploaded that's no longer needed first.`);
    this.name = "TooManySyllabiError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  user_id: string;
  filename: string;
  syllabus: unknown;
  updated_at: Date;
}

/** A stored row, or null if its syllabus no longer matches the schema (e.g. after a schema change). */
function fromRow(row: Row, userId: string): SavedSyllabus | null {
  const parsed = Syllabus.safeParse(row.syllabus);
  if (!parsed.success) return null;
  return {
    id: row.id,
    filename: row.filename,
    syllabus: parsed.data,
    updatedAt: row.updated_at.toISOString(),
    mine: row.user_id === userId,
  };
}

/** The class's syllabi, by course code or title. */
export async function listSyllabi(sql: Sql, userId: string): Promise<SavedSyllabus[]> {
  const rows = await sql<Row[]>`
    SELECT id, user_id, filename, syllabus, updated_at FROM syllabi
    ORDER BY course_key
  `;
  return rows.map((row) => fromRow(row, userId)).filter((saved): saved is SavedSyllabus => saved !== null);
}

/**
 * Saves the syllabus for the class, replacing the earlier one for the same
 * course (see courseKey), whoever uploaded it; the user becomes its uploader.
 * Throws TooManySyllabiError for a new course past MAX_SYLLABI.
 */
export async function saveSyllabus(sql: Sql, userId: string, filename: string, syllabus: Syllabus): Promise<SavedSyllabus> {
  const key = courseKey(syllabus);
  const [count] = await sql<{ others: number }[]>`
    SELECT COUNT(*)::int AS others FROM syllabi WHERE course_key <> ${key}
  `;
  if (count!.others >= MAX_SYLLABI) throw new TooManySyllabiError();

  const [row] = await sql<Row[]>`
    INSERT INTO syllabi (user_id, course_key, filename, syllabus)
    VALUES (${userId}, ${key}, ${filename}, ${sql.json(syllabus)})
    ON CONFLICT (course_key)
    DO UPDATE SET user_id = EXCLUDED.user_id, filename = EXCLUDED.filename, syllabus = EXCLUDED.syllabus, updated_at = NOW()
    RETURNING id, user_id, filename, syllabus, updated_at
  `;
  return fromRow(row!, userId)!;
}

/** Deletes the syllabus for the class; false if it doesn't exist or the user didn't upload it. */
export async function deleteSyllabus(sql: Sql, userId: string, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = await sql`DELETE FROM syllabi WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}
