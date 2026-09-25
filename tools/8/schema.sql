-- Career Canvas database schema, applied on every `db:deploy` as the
-- careercanvas role (see packages/platform/scripts/setup-tools.mjs). Every
-- statement must be safe to re-run against a database that already has it.

CREATE TABLE IF NOT EXISTS users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per user: the latest answers from the wizard.
CREATE TABLE IF NOT EXISTS wizard_answers (
  user_id        UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school         TEXT        NOT NULL DEFAULT '',
  major          TEXT        NOT NULL DEFAULT '',
  year           TEXT        NOT NULL DEFAULT '',
  coursework     TEXT        NOT NULL DEFAULT '',
  interests      TEXT        NOT NULL DEFAULT '',
  resume_text    TEXT        NOT NULL DEFAULT '',
  linkedin_text  TEXT        NOT NULL DEFAULT '',
  target_roles   TEXT        NOT NULL DEFAULT '',
  scenario_notes TEXT        NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roadmaps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  markdown   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roadmaps_user_id_idx ON roadmaps (user_id, created_at DESC);

-- Filled by seed.mjs after this schema is applied, which re-embeds every row
-- when the platform's embedding model changes. `model` records which model made
-- each vector; searches compare only vectors from the current model. The
-- vector size is left open so a model with a different size also fits (only an
-- index needs a fixed size, and about 10k rows need no index). The pgvector
-- type lives in the `public` schema (the platform installs it there), which is
-- outside this role's search_path, so it is schema-qualified.
CREATE TABLE IF NOT EXISTS course_embeddings (
  code      TEXT          PRIMARY KEY,  -- e.g. "CIS 1200" or "ACCT 2110, BEPP 2110"
  name      TEXT          NOT NULL,
  model     TEXT          NOT NULL,     -- e.g. "text-embedding-3-small"
  embedding public.vector NOT NULL
);
