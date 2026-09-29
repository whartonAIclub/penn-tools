-- Compass database schema, applied on every `db:deploy` as the compass role
-- (see packages/platform/scripts/setup-tools.mjs). Every statement must be
-- safe to re-run against a database that already has it.
--
-- gen_random_uuid() is built into Postgres 13+, so no pgcrypto extension is
-- needed (the compass role is not allowed to create extensions).

-- Ingested ICS calendar events.
CREATE TABLE IF NOT EXISTS events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id TEXT        NOT NULL,
  calendar_title    TEXT,       -- source calendar title, from X-WR-CALNAME
  title             TEXT        NOT NULL,
  description       TEXT,
  organizer         TEXT,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ,
  location          TEXT,
  registration_url  TEXT,
  source_feed       TEXT        NOT NULL,
  last_synced_at    TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uniqueness constraint used for upsert (ON CONFLICT target)
CREATE UNIQUE INDEX IF NOT EXISTS events_external_event_id_idx
  ON events (external_event_id);

-- Index for common dashboard query: upcoming events ordered by start time
CREATE INDEX IF NOT EXISTS events_start_time_idx
  ON events (start_time);

-- Optional composite index for range queries (start_time, end_time)
CREATE INDEX IF NOT EXISTS events_start_end_time_idx
  ON events (start_time, end_time);

-- Logs each sync attempt for debugging and monitoring.
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_feed      TEXT        NOT NULL,
  status           TEXT        NOT NULL,   -- 'running' | 'success' | 'error'
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  records_inserted INTEGER     NOT NULL DEFAULT 0,
  records_updated  INTEGER     NOT NULL DEFAULT 0,
  error_message    TEXT
);

-- Index for quickly retrieving recent runs per feed
CREATE INDEX IF NOT EXISTS ingestion_runs_source_feed_started_at_idx
  ON ingestion_runs (source_feed, started_at DESC);

-- Per-user saved events.
CREATE TABLE IF NOT EXISTS saved_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored as text to avoid coupling Compass to platform auth tables.
  user_id    TEXT        NOT NULL,
  event_id   UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS saved_events_user_id_idx
  ON saved_events (user_id);

-- One optional reflection note per user per event.
CREATE TABLE IF NOT EXISTS event_reflections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored as text to avoid coupling Compass to platform auth tables.
  user_id         TEXT        NOT NULL,
  event_id        UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reflection_text TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS event_reflections_user_id_idx
  ON event_reflections (user_id);
