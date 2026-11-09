// Trek Finder's storage, in its own trekfinder schema. Callers pass the database
// client (toolSql("trekfinder")) and the signed-in user's id; every saved-trip
// read and write is scoped to that user.

import type { Sql } from "postgres";

export type ImportRunStatus = "ok" | "partial" | "aborted" | "failed";

/** One thing that went wrong in an import; fields are null when they don't apply. */
export interface ImportProblem {
  tab: string | null;
  row: number | null;
  tripId: string | null;
  message: string;
}

export interface ImportRun {
  id: number;
  /** ISO timestamp of when the import started. */
  startedAt: string;
  status: ImportRunStatus;
  tripsLoaded: number;
  problems: ImportProblem[];
}

/** The most recent Sheet imports, newest first. */
export async function listImportRuns(sql: Sql, limit = 20): Promise<ImportRun[]> {
  // ::int because Postgres BIGINTs otherwise arrive as strings.
  const rows = await sql<{ id: number; started_at: Date; status: ImportRunStatus; trips_loaded: number; problems: ImportProblem[] }[]>`
    SELECT id::int AS id, started_at, status, trips_loaded, problems FROM import_runs
    ORDER BY import_runs.id DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tripsLoaded: row.trips_loaded,
    problems: row.problems,
  }));
}

/**
 * Saves a trip for the user; saving one they already have changes nothing.
 * Returns false, saving nothing, if no trip has that id. Trips that are no
 * longer listed can still be saved, so an unsave from the Saved view can be undone.
 */
export async function saveTrip(sql: Sql, userId: string, tripId: string): Promise<boolean> {
  const rows = await sql`
    WITH trip AS (SELECT id FROM trips WHERE id = ${tripId}),
    saved AS (
      INSERT INTO saved_trips (user_id, trip_id)
      SELECT ${userId}, id FROM trip
      ON CONFLICT (user_id, trip_id) DO NOTHING
    )
    SELECT 1 FROM trip
  `;
  return rows.length > 0;
}

/** Removes a trip from the user's saved trips; does nothing if it wasn't saved. */
export async function unsaveTrip(sql: Sql, userId: string, tripId: string): Promise<void> {
  await sql`DELETE FROM saved_trips WHERE user_id = ${userId} AND trip_id = ${tripId}`;
}

/** The ids of the user's saved trips, most recently saved first. */
export async function listSavedIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ trip_id: string }[]>`
    SELECT trip_id FROM saved_trips
    WHERE user_id = ${userId}
    ORDER BY created_at DESC, trip_id
  `;
  return rows.map((row) => row.trip_id);
}
