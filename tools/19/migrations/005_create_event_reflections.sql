-- Migration: 005_create_event_reflections
-- Stores one optional reflection note per user per event.

CREATE TABLE IF NOT EXISTS event_reflections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored as text to avoid coupling Compass MVP migrations to platform auth tables.
  user_id         TEXT        NOT NULL,
  event_id        UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reflection_text TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS event_reflections_user_id_idx
  ON event_reflections (user_id);
