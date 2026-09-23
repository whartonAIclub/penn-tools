-- Migration: 003_add_calendar_title
-- Adds the source calendar title parsed from X-WR-CALNAME.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS calendar_title TEXT;
