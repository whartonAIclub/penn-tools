import postgres from "postgres";
import {
  parseEventPresentation,
  type EventPresentationFields,
} from "./eventPresentation.js";

export interface ListEventsOptions {
  databaseUrl: string;
  upcomingOnly?: boolean;
  limit?: number;
}

export interface EventListItem extends EventPresentationFields {
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
        ? Math.min(Math.trunc(options.limit), 500)
        : null;

    const rows = await sql<Array<Omit<EventListItem, keyof EventPresentationFields>>>`
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
      ${options.upcomingOnly ? sql`WHERE start_time >= NOW()` : sql``}
      ORDER BY start_time ASC
      ${safeLimit !== null ? sql`LIMIT ${safeLimit}` : sql``}
    `;

    return rows.map((row) => ({
      ...row,
      ...parseEventPresentation(row.description, row.registration_url),
    }));
  } finally {
    await sql.end();
  }
}
