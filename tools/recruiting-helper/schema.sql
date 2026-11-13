-- Recruiting Helper database schema, applied on every `db:deploy` as the
-- recruitinghelper role (see packages/platform/scripts/setup-tools.mjs). Every
-- statement must be safe to re-run against a database that already has it.
--
-- user_id is the platform user's id; a tool's schema can't reference platform
-- tables, so there are no foreign keys to users. Every query is scoped to it.

-- One profile per user: background, target roles, companies by tier and bonus
-- signals, as the RecruitingProfile object in src/scoring.ts.
CREATE TABLE IF NOT EXISTS profiles (
  user_id    TEXT        PRIMARY KEY,
  profile    JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Everything a user has scored: job postings and people (LinkedIn profiles).
-- result is the scored item (ScoredPosting or ScoredContact in src/scoring.ts).
-- match_key identifies a repeat of the same item (a posting's link, a person's
-- name) so scoring it again replaces the old row; it's null when there's no
-- link, and nulls never match each other.
CREATE TABLE IF NOT EXISTS items (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  kind       TEXT        NOT NULL CHECK (kind IN ('posting', 'contact')),
  match_key  TEXT,
  score      SMALLINT    NOT NULL CHECK (score BETWEEN 1 AND 5),
  result     JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS items_user_match_idx ON items (user_id, kind, match_key);

-- The ranked list: a user's items, best score first, most recent first within a score.
CREATE INDEX IF NOT EXISTS items_user_rank_idx ON items (user_id, score DESC, updated_at DESC);

-- Follow-up questions about one item and the AI's answers, oldest first (by id).
-- Removing the item deletes its chat; re-scoring a repeat keeps the item's id, and so its chat.
CREATE TABLE IF NOT EXISTS messages (
  id         BIGSERIAL   PRIMARY KEY,
  item_id    UUID        NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_item_idx ON messages (item_id, id);
