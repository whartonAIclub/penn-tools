import postgres from "postgres";

export interface ListEventsOptions {
  databaseUrl: string;
  limit?: number;
}

export interface EventListItem {
  id: string;
  external_event_id: string;
  calendar_title: string | null;
  title: string;
  description: string | null;
  organizer: string | null;
  start_time: Date;
  end_time: Date | null;
  location: string | null;
  registration_url: string | null;
  source_feed: string;
  last_synced_at: Date;
}

/**
 * Returns recently synced events ordered by start time ascending.
 *
 * This keeps query logic in the tool package so the web route can stay thin.
 */
export async function listEvents(options: ListEventsOptions): Promise<EventListItem[]> {
  const sql = postgres(options.databaseUrl, { max: 3 });

  try {
    const safeLimit =
      typeof options.limit === "number" && options.limit > 0
        ? Math.min(Math.trunc(options.limit), 200)
        : 100;

    const rows = await sql<EventListItem[]>`
      SELECT
        id,
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
        last_synced_at
      FROM events
      ORDER BY start_time ASC
      LIMIT ${safeLimit}
    `;

    return rows;
  } finally {
    await sql.end();
  }
}
