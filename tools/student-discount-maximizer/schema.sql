-- Student Discount Central database schema, applied on every `db:deploy` as the
-- studentdiscountmaximizer role (see packages/platform/scripts/setup-tools.mjs).
-- Every statement must be safe to re-run against a database that already has it.

-- One student deal. Starter deals (seed.mjs) have a slug so re-seeding matches
-- them; students' deals have created_by, the platform user's id (a tool's
-- schema can't reference platform tables, so there is no foreign key).
CREATE TABLE IF NOT EXISTS discounts (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT          UNIQUE,
  -- Every way the deal can be used: a deal can be more than one, e.g. a store
  -- discount that also works online. KINDS in src/discounts.ts.
  kinds             TEXT[]        NOT NULL CHECK (kinds <@ ARRAY['code', 'online', 'local'] AND cardinality(kinds) > 0),
  business          TEXT          NOT NULL,
  -- An optional headline; cards fall back to the summary built from deal_type.
  title             TEXT,
  -- The deal's structure, which makes its headline (dealSummary in
  -- src/discounts.ts): deal_type is one of DEAL_TYPES there, amount the number
  -- for % off, $ off or a student price, and applies_to what it's for
  -- ("bowls"), null for everything.
  deal_type         TEXT          NOT NULL CHECK (deal_type IN ('percent', 'amount', 'bogo', 'free_item', 'student_price', 'other')),
  amount            NUMERIC(10, 2) CHECK (amount > 0),
  applies_to        TEXT,
  -- Details in the student's words; may be empty.
  discount          TEXT          NOT NULL DEFAULT '',
  -- Only for deals used with a promo code.
  code              TEXT,
  -- Only for deals used in person: the address, and the Philadelphia
  -- neighborhood, one of NEIGHBORHOODS in src/discounts.ts, which checks it, so
  -- adding a neighborhood needs no database change.
  location          TEXT,
  neighborhood      TEXT,
  url               TEXT,
  how_to_claim      TEXT          NOT NULL DEFAULT '',
  category          TEXT          NOT NULL CHECK (category IN ('food', 'entertainment', 'tech', 'shopping', 'travel', 'culture', 'fitness', 'other')),
  -- True for deals only Penn students can get (PennCard perks, Penn-only
  -- prices), false for deals open to any student.
  penn_specific     BOOLEAN       NOT NULL DEFAULT FALSE,
  source            TEXT          NOT NULL CHECK (source IN ('starter', 'student')),
  created_by        TEXT,
  status            TEXT          NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  -- When and by whom the status last changed: status_changed_by is null when
  -- votes expired the deal. Votes expire a deal counting only votes cast since
  -- status_changed_at, so a restored deal keeps its votes but isn't expired
  -- again by the votes that expired it before.
  status_changed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  status_changed_by TEXT,
  expired_reason    TEXT          CHECK (expired_reason IN ('marked', 'votes')),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

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

-- Each time a student marks a deal expired or restores it, for the daily
-- limits on both (DAILY_STATUS_CHANGE_LIMIT in src/discounts.ts).
CREATE TABLE IF NOT EXISTS status_changes (
  discount_id UUID        NOT NULL REFERENCES discounts (id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,
  action      TEXT        NOT NULL CHECK (action IN ('expire', 'restore')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS status_changes_user_idx ON status_changes (user_id, action, created_at);

-- The type of discount (SCOPES in src/discounts.ts, which checks it): a
-- general student discount, a Wharton discount or a local Philly discount.
-- Deals from before this column get local if they're used in person, else
-- general; seed.mjs sets starter deals' the same way.
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS scope TEXT;
UPDATE discounts SET scope = CASE WHEN 'local' = ANY(kinds) THEN 'local' ELSE 'general' END WHERE scope IS NULL;
ALTER TABLE discounts ALTER COLUMN scope SET DEFAULT 'general';
ALTER TABLE discounts ALTER COLUMN scope SET NOT NULL;

-- The last day the deal works; null if it doesn't end. The day after, the
-- deal counts as expired (see listDiscounts in src/discounts.ts).
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS expires_on DATE;

-- Who added the deal, as they gave their name; null for starter deals.
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS added_by TEXT;
