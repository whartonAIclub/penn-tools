-- Accounting Practice usage data, applied on every `db:deploy` as the
-- accountingpractice role (see packages/platform/scripts/setup-tools.mjs).
-- Every statement must be safe to re-run against a database that already has it.
--
-- Only what the product metrics need: no names, emails or anything the student
-- types. user_id is the PennTools user id (a random code); a tool's schema
-- can't reference platform tables, so there is no foreign key to users.

-- One signed-in practice round. (Rounds from before signed-out activity moved
-- to the anon_* tables below may have a NULL user_id; the metrics ignore them.)
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT,
  topic_id     TEXT        NOT NULL,
  -- The questions the server drew for this round, in order. Answers are
  -- accepted only for these.
  question_ids TEXT[]      NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set once every question has an answer; score is computed on the server.
  completed_at TIMESTAMPTZ,
  score        SMALLINT
);

CREATE INDEX IF NOT EXISTS sessions_started_idx ON sessions (started_at);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id) WHERE user_id IS NOT NULL;

-- One answer to one question in a round. The first answer counts: a question
-- can't be answered twice in the same round.
CREATE TABLE IF NOT EXISTS answers (
  session_id  UUID        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  question_id TEXT        NOT NULL,
  chosen      TEXT        NOT NULL CHECK (chosen IN ('A', 'B', 'C', 'D')),
  correct     BOOLEAN     NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, question_id)
);

-- ── Signed-out activity ──────────────────────────────────────────────────────
-- Signed-out rounds are kept only while in progress, and only as daily totals
-- afterwards, so anonymous traffic can't grow storage without bound.

-- Signed-out rounds in progress. A completed round is deleted; an abandoned
-- one expires after 2 hours. `slot` caps the table at 5,000 rows in the
-- database itself: each round takes one of slots 1–5000, and slots are unique,
-- so even concurrent requests can't exceed the cap.
CREATE TABLE IF NOT EXISTS anon_rounds (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot         SMALLINT    NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 5000),
  topic_id     TEXT        NOT NULL,
  question_ids TEXT[]      NOT NULL,
  -- The questions answered so far: one answer per question.
  answered     TEXT[]      NOT NULL DEFAULT '{}',
  correct      SMALLINT    NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS anon_rounds_started_idx ON anon_rounds (started_at);

-- Signed-out rounds started and completed, per day (Philadelphia time).
CREATE TABLE IF NOT EXISTS anon_daily_rounds (
  day       DATE    PRIMARY KEY,
  started   INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0
);

-- Signed-out answers per question per day. Only question ids the server drew
-- are recorded, so there are at most (questions in the bank) rows per day.
CREATE TABLE IF NOT EXISTS anon_daily_answers (
  day         DATE    NOT NULL,
  question_id TEXT    NOT NULL,
  answered    INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, question_id)
);
