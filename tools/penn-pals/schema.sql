-- Penn Pals database schema, applied on every `db:deploy` as the pennpals role
-- (see packages/platform/scripts/setup-tools.mjs). Every statement must be
-- safe to re-run against a database that already has it.

-- One row per chat a signed-in user saves: the usage numbers (users, chats,
-- people) are counted from these. Counts only: no names, notes, companies or
-- contact details are stored, and the contacts themselves stay in the user's
-- browser. A tool's schema can't reference platform tables, so user_id is the
-- platform user's id with no foreign key.
--
--   person_key  the opaque random id the browser gave the contact, so a person
--               counts once however many chats there are with them
--   chat_key    that id plus the chat's number (`<person_key>:2`), so saving
--               the same chat twice is counted once
CREATE TABLE IF NOT EXISTS chat_events (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  person_key TEXT        NOT NULL,
  chat_key   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chat_key)
);

CREATE INDEX IF NOT EXISTS chat_events_user_idx ON chat_events (user_id);

-- One row per follow-up a signed-in user marks done (a thank-you or a check-in):
-- the follow-through numbers are counted from these. Counts only, like
-- chat_events: no names or notes, just opaque keys, the kind of follow-up and
-- how many days after the chat it was done.
--
--   follow_up_key    `<person_key>:<step number>`, so the same follow-up is
--                    counted once even if it's un-done and done again
--   kind             'thankYou' or 'followUp' (a check-in)
--   days_after_chat  whole days from the chat to completion, never negative
CREATE TABLE IF NOT EXISTS follow_up_events (
  id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         TEXT        NOT NULL,
  follow_up_key   TEXT        NOT NULL,
  kind            TEXT        NOT NULL CHECK (kind IN ('thankYou', 'followUp')),
  days_after_chat INTEGER     NOT NULL CHECK (days_after_chat >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, follow_up_key)
);

CREATE INDEX IF NOT EXISTS follow_up_events_user_idx ON follow_up_events (user_id);
