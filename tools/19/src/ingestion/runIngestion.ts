import postgres from "postgres";
import { fetchIcsFeed } from "./fetchFeed.js";
import { parseIcsFeed } from "./parseFeed.js";
import { upsertEvents } from "./upsertEvents.js";


export interface IngestionOptions {
  /** Full URL of the CampusGroups ICS feed. Typically from COMPASS_ICS_FEED_URL. */
  feedUrl: string;
  /** Postgres connection string. Typically from DATABASE_URL. */
  databaseUrl: string;
}

export interface IngestionResult {
  success: boolean;
  inserted: number;
  updated: number;
  total: number;
  durationMs: number;
  error?: string;
}

/**
 * Orchestrates a full ingestion run:
 *   1. Fetches the ICS feed
 *   2. Parses events
 *   3. Upserts into Postgres
 *   4. Logs an ingestion_run record (start + finish)
 *
 * Designed to be called from:
 *   - the manual POST /api/sync route (development)
 *   - a scheduled cron job (production)
 */
export async function runIngestion(
  options: IngestionOptions
): Promise<IngestionResult> {
  const { feedUrl, databaseUrl } = options;
  const startedAt = Date.now();
  const sql = postgres(databaseUrl, { max: 5 });
  const runId = crypto.randomUUID();

  try {
    await sql`
      INSERT INTO ingestion_runs (id, source_feed, status, started_at)
      VALUES (${runId}, ${feedUrl}, 'running', NOW())
    `;

    const icsText = await fetchIcsFeed(feedUrl);
    const events = parseIcsFeed(icsText, feedUrl);
    const { inserted, updated } = await upsertEvents(sql, events);

    const durationMs = Date.now() - startedAt;

    await sql`
      UPDATE ingestion_runs
      SET
        status           = 'success',
        finished_at      = NOW(),
        records_inserted = ${inserted},
        records_updated  = ${updated}
      WHERE id = ${runId}
    `;

    return { success: true, inserted, updated, total: events.length, durationMs };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;

    // Best-effort: don't throw if the run record itself failed to update
    await sql`
      UPDATE ingestion_runs
      SET status = 'error', finished_at = NOW(), error_message = ${errorMessage}
      WHERE id = ${runId}
    `.catch(() => {});

    return {
      success: false,
      inserted: 0,
      updated: 0,
      total: 0,
      durationMs,
      error: errorMessage,
    };
  } finally {
    await sql.end();
  }
}
