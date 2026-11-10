-- Connector database schema, applied on every `db:deploy` as the connector
-- role (see packages/platform/scripts/setup-tools.mjs). Every statement must be
-- safe to re-run against a database that already has it.

-- One sign-up per student, tied to their Penn sign-in: user_id is the
-- platform user's id (a tool's schema can't reference platform tables, so
-- there is no foreign key), and email comes from that sign-in. Submitting
-- again updates the same row.
--
-- answers maps each question's id to the id of the chosen option, e.g.
-- {"friday-midnight": "rooftop-talk", "free-day": "hike", ...} (see questions.ts),
-- so adding a question needs no change here.
CREATE TABLE IF NOT EXISTS signups (
  user_id    TEXT        PRIMARY KEY,
  first_name TEXT        NOT NULL,
  last_name  TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  cohort     TEXT        NOT NULL,
  answers    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
