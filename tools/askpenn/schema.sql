-- AskPenn database schema, applied on every `db:deploy` as the askpenn role
-- (see packages/platform/scripts/setup-tools.mjs). Every statement must be
-- safe to re-run against a database that already has it.

-- One conversation. user_id is the platform user's id; a tool's schema can't
-- reference platform tables, so there is no foreign key to users.
CREATE TABLE IF NOT EXISTS chats (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The sidebar lists a user's chats, most recently active first.
CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON chats (user_id, updated_at DESC);

-- id increases with every insert, so it orders a chat's messages.
CREATE TABLE IF NOT EXISTS messages (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id    UUID        NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_chat_idx ON messages (chat_id, id);

-- The names of the files sent with a user message. The files themselves are
-- sent to the model once and never stored.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_names TEXT[] NOT NULL DEFAULT '{}';
