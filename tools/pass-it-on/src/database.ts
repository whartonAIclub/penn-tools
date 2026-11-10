// Tells "the database isn't ready" apart from real bugs, so pages can show a
// plain message ("run bash scripts/setup.sh") instead of a crash.

import type { Sql } from "postgres";

/**
 * not_set_up: the database answers but our role, schema, tables or columns
 * are missing or out of date. Fix: run `bash scripts/setup.sh`.
 * unreachable: nothing is listening. Fix: start Docker Desktop, then
 * `docker start penntools-db`.
 */
export type DatabaseProblem = "not_set_up" | "unreachable";

// Postgres error codes: 28000 and 28P01 are a missing role or wrong password,
// 3F000 a missing schema, 42P01 a missing table, 42703 a missing column.
const NOT_SET_UP_CODES = new Set(["28000", "28P01", "3F000", "42P01", "42703"]);
const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
]);

function codeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/** Classifies a thrown error, or returns null when it isn't a database-readiness problem. */
export function databaseProblem(error: unknown): DatabaseProblem | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];
  while (queue.length > 0) {
    const current = queue.shift();
    if (typeof current !== "object" || current === null || seen.has(current)) continue;
    seen.add(current);
    const code = codeOf(current);
    if (code && NOT_SET_UP_CODES.has(code)) return "not_set_up";
    if (code && UNREACHABLE_CODES.has(code)) return "unreachable";
    // A refused connection can arrive wrapped (AggregateError, error.cause).
    const wrapped = current as { cause?: unknown; errors?: unknown };
    queue.push(wrapped.cause);
    if (Array.isArray(wrapped.errors)) queue.push(...wrapped.errors);
  }
  return null;
}

/** Plain-language message for a problem, shown to the person using the page. */
export function databaseProblemMessage(problem: DatabaseProblem): string {
  return problem === "unreachable"
    ? "Pass It On can't reach its database. Start Docker Desktop, then run `docker start penntools-db`."
    : "Pass It On's database isn't set up yet (or is out of date). Run `bash scripts/setup.sh` once, then reload.";
}

/** Reports why the database can't be used, or null when Pass It On's tables are ready. */
export async function checkDatabaseReady(sql: Sql): Promise<DatabaseProblem | null> {
  try {
    // Touch the newest additions too, so a database from before they existed counts as out of date.
    await sql`SELECT id, theme, budget FROM events LIMIT 0`;
    await sql`SELECT id, tags FROM sources LIMIT 0`;
    await sql`SELECT id, embedding_model FROM excerpts LIMIT 0`;
    await sql`SELECT id FROM vendors LIMIT 0`;
    return null;
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return problem;
    throw error;
  }
}
