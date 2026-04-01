-- Migration: 001_create_events
-- Creates the events table for ingested ICS calendar events.
-- Run this against your Postgres / Supabase database before starting ingestion.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id TEXT        NOT NULL,
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


