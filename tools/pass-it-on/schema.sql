-- Pass It On database schema, applied on every `db:deploy` as the passiton role
-- (see packages/platform/scripts/setup-tools.mjs). Every statement must be
-- safe to re-run against a database that already has it.

-- One event an organizer logged with the five questions. created_by is the
-- platform user's id; a tool's schema can't reference platform tables, so
-- there is no foreign key to users.
CREATE TABLE IF NOT EXISTS events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  event_type     TEXT        NOT NULL,
  event_date     DATE,
  organizer_name TEXT        NOT NULL,
  created_by     TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at DESC);

-- The organizer's answer to one of the five questions, kept word for word so
-- lessons can quote it.
CREATE TABLE IF NOT EXISTS answers (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id UUID   NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  question TEXT   NOT NULL CHECK (question IN ('happened', 'surprised', 'cost', 'repeat', 'change')),
  text     TEXT   NOT NULL,
  UNIQUE (event_id, question)
);

-- One uploaded file: a WhatsApp chat export, a Drive folder zip or a
-- CampusGroups spreadsheet. status tracks lesson extraction from its excerpts.
CREATE TABLE IF NOT EXISTS sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT        NOT NULL CHECK (kind IN ('drive', 'whatsapp', 'campusgroups')),
  filename    TEXT        NOT NULL,
  uploaded_by TEXT        NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT        NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'extracting', 'done'))
);

-- A piece of an uploaded file small enough for one extraction prompt: a day of
-- chat, or a section of a document. meta holds what locates it in the
-- original (date, sender, file path, sheet or page). extracted_at is set once
-- lessons have been pulled from it.
CREATE TABLE IF NOT EXISTS excerpts (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id    UUID        NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  position     INTEGER     NOT NULL,
  text         TEXT        NOT NULL,
  meta         JSONB       NOT NULL DEFAULT '{}',
  extracted_at TIMESTAMPTZ,
  UNIQUE (source_id, position)
);

-- Extraction works through each source's excerpts in order.
CREATE INDEX IF NOT EXISTS excerpts_pending_idx ON excerpts (source_id, position) WHERE extracted_at IS NULL;

-- Attendance from CampusGroups as counts only: attendees' names and emails are
-- dropped on import and never stored.
CREATE TABLE IF NOT EXISTS attendance (
  id         BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id  UUID    NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  event_name TEXT    NOT NULL,
  event_date DATE,
  rsvps      INTEGER NOT NULL,
  attended   INTEGER
);

-- One lesson, quoting either an organizer's answer or an imported excerpt
-- (exactly one of them). quote appears word for word in that text. Lessons
-- start pending; once accepted they're embedded so briefs can find them. The
-- pgvector type lives in the `public` schema (the platform installs it
-- there), which is outside this role's search_path, so it is schema-qualified.
CREATE TABLE IF NOT EXISTS lessons (
  id         BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  answer_id  BIGINT        REFERENCES answers (id) ON DELETE CASCADE,
  excerpt_id BIGINT        REFERENCES excerpts (id) ON DELETE CASCADE,
  event_id   UUID          REFERENCES events (id) ON DELETE CASCADE,
  category   TEXT          NOT NULL CHECK (category IN ('budget', 'vendors', 'turnout', 'partners', 'logistics', 'timeline', 'other')),
  summary    TEXT          NOT NULL,
  quote      TEXT          NOT NULL,
  status     TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  model      TEXT,
  embedding  public.vector,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK ((answer_id IS NULL) <> (excerpt_id IS NULL))
);

CREATE INDEX IF NOT EXISTS lessons_status_idx ON lessons (status, created_at DESC);
