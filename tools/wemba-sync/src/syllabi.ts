// WEMBA Sync's syllabus storage, in its own wembasync schema (schema.sql).
// Callers pass the database client (toolSql("wembasync")) and the signed-in
// user's id; every read and write is scoped to that user.

import type { Sql } from "postgres";
import { MAX_SYLLABI, Syllabus, courseKey } from "./syllabus.js";

export interface SavedSyllabus {
  id: string;
  /** The uploaded PDF's name. */
  filename: string;
  syllabus: Syllabus;
  /** ISO timestamp of the latest upload. */
  updatedAt: string;
}

/** Thrown by saveSyllabus when the student already has MAX_SYLLABI other courses. */
export class TooManySyllabiError extends Error {
  constructor() {
    super(`You can keep up to ${MAX_SYLLABI} syllabi. Remove one you no longer need first.`);
    this.name = "TooManySyllabiError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  filename: string;
  syllabus: unknown;
  updated_at: Date;
}

/** A stored row, or null if its syllabus no longer matches the schema (e.g. after a schema change). */
function fromRow(row: Row): SavedSyllabus | null {
  const parsed = Syllabus.safeParse(row.syllabus);
  if (!parsed.success) return null;
  return { id: row.id, filename: row.filename, syllabus: parsed.data, updatedAt: row.updated_at.toISOString() };
}

/** The user's syllabi, by course code or title. */
export async function listSyllabi(sql: Sql, userId: string): Promise<SavedSyllabus[]> {
  const rows = await sql<Row[]>`
    SELECT id, filename, syllabus, updated_at FROM syllabi
    WHERE user_id = ${userId}
    ORDER BY course_key
  `;
  return rows.map(fromRow).filter((saved): saved is SavedSyllabus => saved !== null);
}

/**
 * Saves the syllabus, replacing the user's earlier one for the same course
 * (see courseKey). Throws TooManySyllabiError for a new course past MAX_SYLLABI.
 */
export async function saveSyllabus(sql: Sql, userId: string, filename: string, syllabus: Syllabus): Promise<SavedSyllabus> {
  const key = courseKey(syllabus);
  const [count] = await sql<{ others: number }[]>`
    SELECT COUNT(*)::int AS others FROM syllabi WHERE user_id = ${userId} AND course_key <> ${key}
  `;
  if (count!.others >= MAX_SYLLABI) throw new TooManySyllabiError();

  const [row] = await sql<Row[]>`
    INSERT INTO syllabi (user_id, course_key, filename, syllabus)
    VALUES (${userId}, ${key}, ${filename}, ${sql.json(syllabus)})
    ON CONFLICT (user_id, course_key)
    DO UPDATE SET filename = EXCLUDED.filename, syllabus = EXCLUDED.syllabus, updated_at = NOW()
    RETURNING id, filename, syllabus, updated_at
  `;
  return fromRow(row!)!;
}

/** Deletes the syllabus; false if it doesn't exist or isn't the user's. */
export async function deleteSyllabus(sql: Sql, userId: string, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = await sql`DELETE FROM syllabi WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}
