-- Industry Connections Tool database schema, applied on every `db:deploy` as
-- the industryconnector role (see packages/platform/scripts/setup-tools.mjs).
-- Every statement must be safe to re-run against a database that already has it.
-- The tool starts empty: admins load CareerPath data through its upload page.

-- One student or alum. person_key stays the same across uploads (the
-- CareerPath ID when the export has one, otherwise name, class year and
-- program), so a new upload updates people in place and their id never changes.
CREATE TABLE IF NOT EXISTS people (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_key       TEXT        NOT NULL UNIQUE,
  name             TEXT        NOT NULL,
  class_year       INTEGER     NOT NULL,
  program          TEXT        NOT NULL,
  is_alumni        BOOLEAN     NOT NULL,
  current_employer TEXT        NOT NULL DEFAULT '',
  current_title    TEXT        NOT NULL DEFAULT '',
  -- Every industry (from INDUSTRIES in src/industries.ts) they have worked in.
  industries       TEXT[]      NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Search finds people by industry (industries @> ARRAY[...]) ...
CREATE INDEX IF NOT EXISTS people_industries_idx ON people USING GIN (industries);
-- ... and lists them newest class first, then by name.
CREATE INDEX IF NOT EXISTS people_order_idx ON people (class_year DESC, name);

-- One row per upload, for the admin page's "last loaded" line and an audit trail.
CREATE TABLE IF NOT EXISTS uploads (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The admin's PennTools user id.
  uploaded_by   TEXT        NOT NULL,
  file_name     TEXT        NOT NULL,
  people_count  INTEGER     NOT NULL,
  added_count   INTEGER     NOT NULL,
  updated_count INTEGER     NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
