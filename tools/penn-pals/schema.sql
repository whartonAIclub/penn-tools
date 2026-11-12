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
