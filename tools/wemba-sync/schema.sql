-- WEMBA Sync database schema, applied on every `db:deploy` as the wembasync
-- role (see packages/platform/scripts/setup-tools.mjs). Every statement must
-- be safe to re-run against a database that already has it.

-- A course's syllabus, shared by the class, as the AI read it from the PDF
-- (see tools/wemba-sync/src/syllabus.ts); the PDF itself isn't kept. user_id
-- is the platform id of the student who uploaded this copy (only they can
-- remove it); a tool's schema can't reference platform tables, so there is no
-- foreign key to users. course_key identifies the course, so a new upload of
-- the same course's syllabus, by anyone, replaces the old one.
CREATE TABLE IF NOT EXISTS syllabi (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  course_key TEXT        NOT NULL,
  filename   TEXT        NOT NULL,
  syllabus   JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_key)
);

-- A class weekend's schedule, shared by the class, as the AI read it from the
-- program's PDF (see tools/wemba-sync/src/schedule.ts). user_id is the student
-- who uploaded this copy, as for syllabi. Dates are YYYY-MM-DD, so they sort
-- as text. A weekend is identified by its first date: a new upload of the
-- same weekend's schedule, by anyone, replaces the old one.
CREATE TABLE IF NOT EXISTS weekends (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  start_date TEXT        NOT NULL,
  end_date   TEXT        NOT NULL,
  filename   TEXT        NOT NULL,
  schedule   JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (start_date)
);

-- Databases from before syllabi and weekends were shared had one copy per
-- student. Keep the latest upload of each course and weekend, then make them
-- unique across the class. Safe to re-run: once they're unique, nothing is
-- deleted and the old constraints are gone.
DELETE FROM syllabi a USING syllabi b
WHERE a.course_key = b.course_key
  AND (a.updated_at, a.id) < (b.updated_at, b.id);
ALTER TABLE syllabi DROP CONSTRAINT IF EXISTS syllabi_user_id_course_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS syllabi_course_key_key ON syllabi (course_key);

DELETE FROM weekends a USING weekends b
WHERE a.start_date = b.start_date
  AND (a.updated_at, a.id) < (b.updated_at, b.id);
ALTER TABLE weekends DROP CONSTRAINT IF EXISTS weekends_user_id_start_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS weekends_start_date_key ON weekends (start_date);

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
