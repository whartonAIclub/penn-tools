-- WEMBA Sync database schema, applied on every `db:deploy` as the wembasync
-- role (see packages/platform/scripts/setup-tools.mjs). Every statement must
-- be safe to re-run against a database that already has it.

-- A student's syllabus for one course, as the AI read it from the PDF (see
-- tools/wemba-sync/src/syllabus.ts); the PDF itself isn't kept. user_id is the
-- platform user's id; a tool's schema can't reference platform tables, so
-- there is no foreign key to users. course_key identifies the course, so a new
-- upload of the same course's syllabus replaces the old one.
CREATE TABLE IF NOT EXISTS syllabi (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  course_key TEXT        NOT NULL,
  filename   TEXT        NOT NULL,
  syllabus   JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_key)
);

-- A student's class weekend schedule, as the AI read it from the program's PDF
-- (see tools/wemba-sync/src/schedule.ts). Dates
-- are YYYY-MM-DD, so they sort as text. A weekend is identified by its first
-- date: a new upload of the same weekend's schedule replaces the old one.
CREATE TABLE IF NOT EXISTS weekends (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  start_date TEXT        NOT NULL,
  end_date   TEXT        NOT NULL,
  filename   TEXT        NOT NULL,
  schedule   JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, start_date)
);

-- An event outside class the student added (see tools/wemba-sync/src/events.ts):
-- a club event, celebration or social. date is its first day, YYYY-MM-DD, for
-- ordering; rsvp is the student's answer, or null before they give one.
CREATE TABLE IF NOT EXISTS events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  date       TEXT        NOT NULL,
  event      JSONB       NOT NULL,
  rsvp       TEXT        CHECK (rsvp IN ('going', 'maybe', 'not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_user_date_idx ON events (user_id, date);
