-- Accounting Practice usage data, applied on every `db:deploy` as the
-- accountingpractice role (see packages/platform/scripts/setup-tools.mjs).
-- Every statement must be safe to re-run against a database that already has it.
--
-- Only what the product metrics need: no names, emails or anything the student
-- types. user_id is the PennTools user id (a random code) for signed-in
-- students and NULL for signed-out ones; a tool's schema can't reference
-- platform tables, so there is no foreign key to users.

-- One practice round of one topic.
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
