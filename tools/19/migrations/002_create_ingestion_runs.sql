-- Migration: 002_create_ingestion_runs
-- Logs each sync attempt for debugging and monitoring.
-- Run after 001_create_events.

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
