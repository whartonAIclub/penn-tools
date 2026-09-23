-- Migration: 004_create_saved_events
-- Stores per-user saved events for Compass MVP.

CREATE TABLE IF NOT EXISTS saved_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored as text to avoid coupling Compass MVP migrations to platform auth tables.
  user_id    TEXT        NOT NULL,
  event_id   UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS saved_events_user_id_idx
  ON saved_events (user_id);
