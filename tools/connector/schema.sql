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

-- Each time the team releases matches. released_by is the team member's email.
CREATE TABLE IF NOT EXISTS releases (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  released_by TEXT        NOT NULL,
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Who was matched with whom in each release: everyone with the same
-- release_id and group_number is in one group. A student is matched at most
-- once per release; anyone left out (the waitlist) has no row and joins the
-- next release.
CREATE TABLE IF NOT EXISTS matches (
  release_id   BIGINT  NOT NULL REFERENCES releases (id) ON DELETE CASCADE,
  group_number INTEGER NOT NULL,
  user_id      TEXT    NOT NULL,
  PRIMARY KEY (release_id, user_id)
);

-- Finding a student's match, and who hasn't been matched yet.
CREATE INDEX IF NOT EXISTS matches_user_idx ON matches (user_id);
