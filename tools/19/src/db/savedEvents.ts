import postgres from "postgres";

export interface SavedEventListItem {
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
  saved_at: Date;
}

export interface SavedEventMutationResult {
  saved: boolean;
}

export interface ListSavedEventsOptions {
  databaseUrl: string;
  userId: string;
}

export interface SaveEventOptions {
  databaseUrl: string;
  userId: string;
  eventId: string;
}

export interface UnsaveEventOptions {
  databaseUrl: string;
  userId: string;
  eventId: string;
}

export async function listSavedEvents(
  options: ListSavedEventsOptions
): Promise<SavedEventListItem[]> {
  const sql = postgres(options.databaseUrl, { max: 3 });

  try {
    const rows = await sql<SavedEventListItem[]>`
      SELECT
        e.id,
        e.external_event_id,
        e.calendar_title,
        e.title,
        e.description,
        e.organizer,
        e.start_time,
        e.end_time,
        e.location,
        e.registration_url,
        e.source_feed,
        e.last_synced_at,
        se.created_at AS saved_at
      FROM saved_events se
      JOIN events e ON e.id = se.event_id
      WHERE se.user_id = ${options.userId}
      ORDER BY e.start_time ASC
    `;

    return rows;
  } finally {
    await sql.end();
  }
}

export async function saveEvent(
  options: SaveEventOptions
): Promise<SavedEventMutationResult> {
  const sql = postgres(options.databaseUrl, { max: 3 });

  try {
    const rows = await sql<Array<{ id: string }>>`
      INSERT INTO saved_events (user_id, event_id)
      VALUES (${options.userId}, ${options.eventId})
      ON CONFLICT (user_id, event_id) DO NOTHING
      RETURNING id
    `;

    return { saved: rows.length > 0 };
  } finally {
    await sql.end();
  }
}

export async function unsaveEvent(
  options: UnsaveEventOptions
): Promise<SavedEventMutationResult> {
  const sql = postgres(options.databaseUrl, { max: 3 });

  try {
    const rows = await sql<Array<{ id: string }>>`
      DELETE FROM saved_events
      WHERE user_id = ${options.userId}
        AND event_id = ${options.eventId}
      RETURNING id
    `;

    return { saved: rows.length > 0 };
  } finally {
    await sql.end();
  }
}