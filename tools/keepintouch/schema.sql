-- Keep in Touch database schema, applied on every `db:deploy` as the
-- keepintouch role (see packages/platform/scripts/setup-tools.mjs). Every
-- statement must be safe to re-run against a database that already has it.

-- One person the user has met. user_id is the platform user's id; a tool's
-- schema can't reference platform tables, so there is no foreign key to users.
CREATE TABLE IF NOT EXISTS contacts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  company        TEXT,
  role           TEXT,
  -- How they met (one of MET_HOW in src/input.ts), where (e.g. "PE club
  -- panel") and when.
  met_how        TEXT        CHECK (met_how IN ('recruiting', 'class', 'club', 'conference', 'social', 'intro', 'other')),
  met_at         TEXT,
  met_on         DATE,
  -- The user's own labels, e.g. "alumni", "consulting".
  tags           TEXT[]      NOT NULL DEFAULT '{}',
  -- What they talked about and what the person cares about.
  notes          TEXT        NOT NULL DEFAULT '',
  -- How often to check in; null means only when a follow-up is set.
  cadence_days   INTEGER     CHECK (cadence_days > 0),
  -- A follow-up the user means to do, and when.
  follow_up_on   DATE,
  follow_up_note TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The page lists a user's contacts, most recently added first.
CREATE INDEX IF NOT EXISTS contacts_user_created_idx ON contacts (user_id, created_at DESC);

-- Each time the user was in touch with a contact after meeting them.
CREATE TABLE IF NOT EXISTS interactions (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id  UUID        NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  occurred_on DATE        NOT NULL,
  kind        TEXT        NOT NULL CHECK (kind IN ('message', 'call', 'meeting')),
  summary     TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interactions_contact_idx ON interactions (contact_id, occurred_on DESC, id DESC);
