-- Student Discount Central database schema, applied on every `db:deploy` as the
-- studentdiscountmaximizer role (see packages/platform/scripts/setup-tools.mjs).
-- Every statement must be safe to re-run against a database that already has it.

-- One student deal. Starter deals (seed.mjs) have a slug so re-seeding skips
-- them; students' deals have created_by, the platform user's id (a tool's
-- schema can't reference platform tables, so there is no foreign key).
CREATE TABLE IF NOT EXISTS discounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT        UNIQUE,
  kind              TEXT        NOT NULL CHECK (kind IN ('code', 'online', 'local')),
  business          TEXT        NOT NULL,
  title             TEXT        NOT NULL,
  -- The deal's details in the student's words; may be empty (see deal_type below).
  discount          TEXT        NOT NULL,
  code              TEXT,
  location          TEXT,
  url               TEXT,
  how_to_claim      TEXT        NOT NULL DEFAULT '',
  category          TEXT        NOT NULL CHECK (category IN ('food', 'entertainment', 'tech', 'shopping', 'travel', 'culture', 'fitness', 'other')),
  source            TEXT        NOT NULL CHECK (source IN ('starter', 'student')),
  created_by        TEXT,
  status            TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  -- When and by whom the status last changed: status_changed_by is null when
  -- votes expired the deal. Restoring a deal also clears its votes.
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_changed_by TEXT,
  expired_reason    TEXT        CHECK (expired_reason IN ('marked', 'votes')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- True for deals only Penn students can get (PennCard perks, Penn-only
-- prices), false for deals open to any student.
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS penn_specific BOOLEAN NOT NULL DEFAULT FALSE;

-- Where a local spot is, e.g. 'university-city'; null for other deals. The
-- list lives in NEIGHBORHOODS in src/discounts.ts, which checks it, so adding
-- a neighborhood needs no database change.
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS neighborhood TEXT;

-- The deal's structure, which makes its headline (dealSummary in src/discounts.ts):
-- deal_type is one of DEAL_TYPES there (checked in code, like neighborhood),
-- amount the number for % off, $ off or a student price, and applies_to what
-- it's for ("bowls"), null for everything. Null deal_type: an older deal,
-- shown by its details. With these, a title is optional.
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS deal_type TEXT;
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2);
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS applies_to TEXT;
ALTER TABLE discounts ALTER COLUMN title DROP NOT NULL;

-- Every way the deal can be used (in person, online, with a promo code): a
-- deal can be more than one, e.g. Madewell's student discount works in stores
-- and online. Each is one of KINDS in src/discounts.ts, which checks them.
-- `kind` above keeps the first, for deals added before this column.
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS kinds TEXT[] NOT NULL DEFAULT '{}';
UPDATE discounts SET kinds = ARRAY[kind] WHERE kinds = '{}';

CREATE INDEX IF NOT EXISTS discounts_status_idx ON discounts (status, created_at DESC);
-- The daily submission limit counts a student's recent deals.
CREATE INDEX IF NOT EXISTS discounts_creator_idx ON discounts (created_by, created_at);

-- One vote per student per deal: works = true for "works", false for "doesn't work".
CREATE TABLE IF NOT EXISTS votes (
  discount_id UUID        NOT NULL REFERENCES discounts (id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,
  works       BOOLEAN     NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discount_id, user_id)
);
