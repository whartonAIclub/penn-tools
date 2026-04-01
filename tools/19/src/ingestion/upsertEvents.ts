import type postgres from "postgres";
import type { ParsedEvent } from "../db/schema.js";

export interface UpsertResult {
  inserted: number;
  updated: number;
}

/**
 * Upserts an array of ParsedEvents into the events table.
 *
 * Uses `external_event_id` as the conflict target so re-running
 * ingestion updates existing rows without creating duplicates.
 *
 * Returns the count of rows inserted vs updated.
 *
 * @param sql  - A `postgres` client (from the `postgres` npm package).
 * @param events - Parsed events to upsert.
 */
export async function upsertEvents(
  sql: postgres.Sql,
  events: ParsedEvent[]
): Promise<UpsertResult> {
  if (events.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;
  const now = new Date();

  // Process in batches of 100 to stay well within parameter limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchPayload = batch as unknown as Parameters<typeof sql.json>[0];

    const rows = await sql<Array<{ is_insert: boolean }>>`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${sql.json(batchPayload)}) AS src(
          external_event_id text,
          calendar_title text,
          title text,
          description text,
          organizer text,
          start_time timestamptz,
          end_time timestamptz,
          location text,
          registration_url text,
          source_feed text
        )
      )
      INSERT INTO events (
        external_event_id,
        calendar_title,
        title,
        description,
        organizer,
        start_time,
        end_time,
        location,
        registration_url,
        source_feed,
        last_synced_at,
        created_at,
        updated_at
      )
      SELECT
        external_event_id,
        calendar_title,
        title,
        description,
        organizer,
        start_time,
        end_time,
        location,
        registration_url,
        source_feed,
        ${now},
        ${now},
        ${now}
      FROM incoming
      ON CONFLICT (external_event_id) DO UPDATE SET
        calendar_title   = EXCLUDED.calendar_title,
        title            = EXCLUDED.title,
        description      = EXCLUDED.description,
        organizer        = EXCLUDED.organizer,
        start_time       = EXCLUDED.start_time,
        end_time         = EXCLUDED.end_time,
        location         = EXCLUDED.location,
        registration_url = EXCLUDED.registration_url,
        source_feed      = EXCLUDED.source_feed,
        last_synced_at   = EXCLUDED.last_synced_at,
        updated_at       = EXCLUDED.updated_at
      RETURNING (xmax = 0) AS is_insert
    `;

    for (const row of rows) {
      if (row.is_insert) inserted++;
      else updated++;
    }
  }

  return { inserted, updated };
}
