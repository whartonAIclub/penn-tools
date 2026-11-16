// WEMBA Sync's class weekend storage, in its own wembasync schema
// (schema.sql). Callers pass the database client (toolSql("wembasync")) and
// the signed-in user's id. Weekends are shared by the class: one schedule per
// weekend, seen by every student, so each weekend's PDF is uploaded once. A
// newer upload replaces it for everyone; only the student who uploaded the
// current copy can remove it.

import type { Sql } from "postgres";
import { applyCorrections } from "./corrections.js";
import { WeekendSchedule } from "./schedule.js";

/** The most weekends the class keeps; saving past it drops the earliest. A program has about 30. */
export const MAX_WEEKENDS = 60;

export interface SavedWeekend {
  id: string;
  /** The uploaded PDF's name. */
  filename: string;
  schedule: WeekendSchedule;
  /** The weekend's first and last dates, YYYY-MM-DD. */
  start: string;
  end: string;
  /** ISO timestamp of the latest upload. */
  updatedAt: string;
  /** True if the signed-in student uploaded this copy, so they can remove it. */
  mine: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The weekend's first and last dates, from its items; null if none is dated. */
export function weekendRange(schedule: WeekendSchedule): { start: string; end: string } | null {
  const dates = schedule.items.map((item) => item.date).filter((date) => DATE_RE.test(date)).sort();
  return dates.length > 0 ? { start: dates[0]!, end: dates.at(-1)! } : null;
}

/** The weekend to show first: the first that hasn't ended by `today` (YYYY-MM-DD), else the latest. */
export function currentWeekend<T extends Pick<SavedWeekend, "end">>(weekends: T[], today: string): T | undefined {
  return weekends.find((weekend) => weekend.end >= today) ?? weekends.at(-1);
}

interface Row {
  id: string;
  user_id: string;
  filename: string;
  schedule: unknown;
  start_date: string;
  end_date: string;
  updated_at: Date;
}

/**
 * A stored row, or null if its schedule no longer matches the schema (e.g.
 * after a schema change). Fixes added since it was saved (corrections.ts) are
 * applied.
 */
function fromRow(row: Row, userId: string): SavedWeekend | null {
  const parsed = WeekendSchedule.safeParse(row.schedule);
  if (!parsed.success) return null;
  return {
    id: row.id,
    filename: row.filename,
    schedule: applyCorrections(parsed.data),
    start: row.start_date,
    end: row.end_date,
    updatedAt: row.updated_at.toISOString(),
    mine: row.user_id === userId,
  };
}

/** The class's weekends, earliest first. */
export async function listWeekends(sql: Sql, userId: string): Promise<SavedWeekend[]> {
  const rows = await sql<Row[]>`
    SELECT id, user_id, filename, schedule, start_date, end_date, updated_at FROM weekends
    ORDER BY start_date
  `;
  return rows.map((row) => fromRow(row, userId)).filter((saved): saved is SavedWeekend => saved !== null);
}

/**
 * Saves the weekend for the class, replacing the earlier schedule for a
 * weekend starting the same day, whoever uploaded it; the user becomes its
 * uploader. Null if no item is dated, so there's no weekend to
 * file it under. Past MAX_WEEKENDS, the earliest weekends are dropped.
 */
export async function saveWeekend(
  sql: Sql,
  userId: string,
  filename: string,
  schedule: WeekendSchedule,
): Promise<SavedWeekend | null> {
  const range = weekendRange(schedule);
  if (!range) return null;
  const [row] = await sql<Row[]>`
    INSERT INTO weekends (user_id, start_date, end_date, filename, schedule)
    VALUES (${userId}, ${range.start}, ${range.end}, ${filename}, ${sql.json(schedule)})
    ON CONFLICT (start_date)
    DO UPDATE SET user_id = EXCLUDED.user_id, end_date = EXCLUDED.end_date, filename = EXCLUDED.filename,
                  schedule = EXCLUDED.schedule, updated_at = NOW()
    RETURNING id, user_id, filename, schedule, start_date, end_date, updated_at
  `;
  await sql`
    DELETE FROM weekends WHERE id NOT IN (
      SELECT id FROM weekends ORDER BY start_date DESC LIMIT ${MAX_WEEKENDS}
    )
  `;
  return fromRow(row!, userId);
}

/** Deletes the weekend for the class; false if it doesn't exist or the user didn't upload it. */
export async function deleteWeekend(sql: Sql, userId: string, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = await sql`DELETE FROM weekends WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}
