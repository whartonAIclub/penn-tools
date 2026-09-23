// TypeScript types mirroring the Postgres schema.
// These are plain data types — no ORM, no database dependency.

/** A fully-hydrated event row as stored in the database. */
export interface Event {
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
  created_at: Date;
  updated_at: Date;
}

/**
 * A parsed event before it is written to the database.
 * No id, created_at, or updated_at — the DB generates those.
 */
export interface ParsedEvent {
  external_event_id: string;
  title: string;
  description: string | null;
  organizer: string | null;
  start_time: Date;
  end_time: Date | null;
  location: string | null;
  registration_url: string | null;
  source_feed: string;
}

/** A row in the ingestion_runs table. */
export interface IngestionRun {
  id: string;
  source_feed: string;
  status: "running" | "success" | "error";
  started_at: Date;
  finished_at: Date | null;
  records_inserted: number;
  records_updated: number;
  error_message: string | null;
}
