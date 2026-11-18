-- Handoff database schema, applied on every db:deploy as the handoff role
-- (packages/platform/scripts/setup-tools.mjs, once Handoff is in its TOOLS list; for a local
-- database, see "Database setup" in tools/handoff/README.md).
-- Every statement must be safe to re-run. There is no seed: the live market starts empty.
-- User ids are platform users.id values; there are no foreign keys because this role can't read public.users.
-- Times are TIMESTAMPTZ; quantities, money and ids inside the market live in worlds.doc (JSON, as the
-- prototype's state). Changing an inline CHECK later needs ALTER TABLE ... DROP CONSTRAINT IF EXISTS / ADD.

-- The marketplace: one JSON document per world, written only under SELECT ... FOR UPDATE (one writer at a time).
-- "live" is the shared market; "test-..." worlds exist only for development checks and tests.
-- The doc CHECK uses containment, so a document whose mode is missing or null is refused too
-- (doc->>'mode' = 'live' would be NULL for those, and a CHECK accepts NULL).
CREATE TABLE IF NOT EXISTS worlds (
  id         TEXT        PRIMARY KEY CHECK (id = 'live' OR id ~ '^test-[a-z0-9-]{1,40}$'),
  version    INTEGER     NOT NULL DEFAULT 0 CHECK (version >= 0),
  doc        JSONB       NOT NULL CHECK (jsonb_typeof(doc) = 'object' AND doc @> '{"mode": "live"}'),
  next_due   TIMESTAMPTZ,                      -- earliest stored deadline; the first read after it sweeps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles: the account's name and email (refreshed on every visit) and what the user chose to share.
-- One row per user, shared by all worlds. Other users see only what the projection allows.
CREATE TABLE IF NOT EXISTS people (
  user_id    TEXT        PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 64),
  name       TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email      TEXT        CHECK (email IS NULL OR char_length(email) <= 254),
  pay_handle TEXT        NOT NULL DEFAULT '' CHECK (char_length(pay_handle) <= 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- In-app notifications, written in the same transaction as the action that caused them.
-- One change never leaves the same person the same unread text twice (store.ts keys it by the change, so separate changes each arrive).
CREATE TABLE IF NOT EXISTS notifications (
  world_id TEXT        NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
  id       TEXT        NOT NULL CHECK (id ~ '^[0-9a-z-]{1,48}$'),
  user_id  TEXT        NOT NULL,
  text     TEXT        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  link     JSONB       CHECK (link IS NULL OR jsonb_typeof(link) = 'object'),
  dedupe   TEXT        NOT NULL CHECK (dedupe ~ '^[0-9a-f]{32}$'),   -- md5 of the change's request id and the text, computed in store.ts
  at       TIMESTAMPTZ NOT NULL,
  read_at  TIMESTAMPTZ,
  PRIMARY KEY (world_id, id)
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (world_id, user_id, at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_once
  ON notifications (world_id, user_id, dedupe) WHERE read_at IS NULL;

-- Every action the server received, accepted or refused: a retried click returns its first outcome.
-- Keeps only the type, the record ids and what the actor was told (a toast or refusal, so a retry gets the
-- same answer): never the request itself, text typed in it or contact details. A toast can repeat an amount
-- or time the action saved, which the document keeps anyway. Deleted once over 7 days old, at the first
-- write of each New York day and every 50th version (store.ts); a world nobody writes to keeps them until
-- its next write.
CREATE TABLE IF NOT EXISTS actions (
  world_id       TEXT        NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
  actor_id       TEXT        NOT NULL,           -- 'system' for expiry sweeps
  request_id     UUID        NOT NULL,           -- the browser's id for one intent
  type           TEXT        NOT NULL CHECK (char_length(type) <= 40),
  ids            JSONB       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(ids) = 'object'),
  ok             BOOLEAN     NOT NULL,
  result         JSONB       NOT NULL,           -- { toast, resultId, error, steps } as returned to this actor
  version_before INTEGER     NOT NULL,
  version_after  INTEGER     NOT NULL,
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, actor_id, request_id)
);
CREATE INDEX IF NOT EXISTS actions_at_idx ON actions (at);

-- Short-lived rollback points: the first write of each New York day (the newest 7, none over 7 days old
-- except the newest 2, the rollback point before the latest write) and before a document upgrade (3 kept).
-- They hold everyone's data, so they are pruned (store.ts, with the actions above). Manual ones are kept.
CREATE TABLE IF NOT EXISTS world_snapshots (
  world_id TEXT        NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
  version  INTEGER     NOT NULL,
  reason   TEXT        NOT NULL CHECK (reason IN ('daily', 'before-upgrade', 'manual')),
  doc      JSONB       NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, version, reason)
);

-- Follow-on B1: payment methods (0-2, the first preferred). pay_handle stays for legacy rows until the person saves methods.
-- Each entry is {"kind": "venmo" | "zelle" | "paypal", "value": …}, checked by the engine's checkPayMethods before it's written
-- (store.ts savePayMethods). Skipped when the column exists, so its CHECK is added once, with it.
ALTER TABLE people ADD COLUMN IF NOT EXISTS pay_methods JSONB NOT NULL DEFAULT '[]'::jsonb
  CHECK (CASE WHEN jsonb_typeof(pay_methods) = 'array'
              THEN jsonb_array_length(pay_methods) <= 2 AND octet_length(pay_methods::text) <= 1200
              ELSE false END);

-- Follow-on B4: email updates. Jobs hold ids and fixed codes only; addresses live in email_prefs and the local capture.
-- Deletes cascade from worlds to notifications to jobs to captures, and from people to preferences (src/email/*.ts).
CREATE TABLE IF NOT EXISTS email_prefs (            -- one row per account; the address is its PennTools sign-in email at opt-in
  user_id         TEXT        PRIMARY KEY REFERENCES people (user_id) ON DELETE CASCADE,
  address         TEXT        NOT NULL CHECK (char_length(address) BETWEEN 3 AND 254 AND address ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  sign_in         TEXT        NOT NULL CHECK (sign_in IN ('google', 'dev')),
  exchange_on     BOOLEAN     NOT NULL DEFAULT FALSE,
  matches_on      BOOLEAN     NOT NULL DEFAULT FALSE,
  consent_version TEXT        NOT NULL CHECK (consent_version ~ '^v[0-9]{1,3}$'),
  consented_at    TIMESTAMPTZ NOT NULL,              -- the last time a category was turned on
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS email_dispatch (         -- heartbeat: jobs are made, and opt-in offered, only while last_ok_at < 10 min old
  sender      TEXT        PRIMARY KEY CHECK (sender IN ('capture', 'provider')),
  last_run_at TIMESTAMPTZ NOT NULL,
  last_ok_at  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS email_jobs (             -- one email per notification of an emailed kind, written in its transaction
  world_id        TEXT        NOT NULL,
  notification_id TEXT        NOT NULL,
  user_id         TEXT        NOT NULL,
  kind            TEXT        NOT NULL CHECK (kind ~ '^[a-z]+(\.[a-z]+){1,2}$' AND char_length(kind) <= 40),
  category        TEXT        NOT NULL CHECK (category IN ('exchange', 'match')),
  ref             TEXT        NOT NULL CHECK (ref ~ '^[0-9a-z-]{1,48}$'),
  link            JSONB       NOT NULL CHECK (jsonb_typeof(link) = 'object'),
  event_key       TEXT        NOT NULL CHECK (char_length(event_key) <= 160),   -- <change request id>:<kind>:<ref>
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped', 'dead')),
  reason          TEXT        CHECK (reason IS NULL OR reason ~ '^[a-z0-9_:]{1,60}$'),
  attempts        SMALLINT    NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  retry_at        TIMESTAMPTZ NOT NULL,
  lease_until     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  provider_id     TEXT        CHECK (provider_id IS NULL OR char_length(provider_id) <= 200),
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, notification_id),
  FOREIGN KEY (world_id, notification_id) REFERENCES notifications (world_id, id) ON DELETE CASCADE,
  UNIQUE (world_id, user_id, event_key),
  CHECK ((status = 'sending') = (lease_until IS NOT NULL)),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS email_jobs_due  ON email_jobs (retry_at) WHERE status IN ('pending', 'failed', 'sending');
CREATE INDEX IF NOT EXISTS email_jobs_user ON email_jobs (user_id, category) WHERE status IN ('pending', 'failed');
CREATE TABLE IF NOT EXISTS email_capture (          -- the capture sender's outbox (development, test worlds); kept 7 days
  idempotency_key TEXT        PRIMARY KEY CHECK (char_length(idempotency_key) <= 120),
  world_id        TEXT        NOT NULL,
  notification_id TEXT        NOT NULL,
  to_address      TEXT        NOT NULL CHECK (char_length(to_address) <= 254),
  subject         TEXT        NOT NULL CHECK (char_length(subject) <= 200),
  body_text       TEXT        NOT NULL CHECK (char_length(body_text) <= 4000),
  action_url      TEXT        NOT NULL CHECK (char_length(action_url) <= 600),
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (world_id, notification_id) REFERENCES email_jobs (world_id, notification_id) ON DELETE CASCADE
);

-- §9s item 6: a Goods item's one optional photo. The image is here and nowhere else: worlds.doc holds only a reference on the item
-- (pic: its version and size), so snapshots and the actions log never carry bytes. One row per item (the primary key); a replaced
-- photo overwrites it, and the write that removes the photo or ends the item (sold, closed, expired) deletes it, in the same
-- transaction as the document (store.ts syncPhotos). Deleting a world deletes its photos. What gets in is decided by src/photo.ts
-- (a JPEG or a simple WebP by its bytes, metadata cut out, at most 300 KB); the CHECKs repeat the type and size so nothing else fits.
CREATE TABLE IF NOT EXISTS item_photos (
  world_id   TEXT        NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
  item_id    TEXT        NOT NULL CHECK (item_id ~ '^g[0-9a-f]{16}$'),
  owner_id   TEXT        NOT NULL CHECK (char_length(owner_id) BETWEEN 1 AND 64),   -- the item's seller, as people.user_id
  mime       TEXT        NOT NULL CHECK (mime IN ('image/jpeg', 'image/webp')),
  bytes      BYTEA       NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 307200),
  version    TEXT        NOT NULL CHECK (version ~ '^[0-9a-f]{16}$'),               -- first 16 hex of the bytes' SHA-256; the item's pic.v
  width      SMALLINT    NOT NULL CHECK (width BETWEEN 1 AND 4096),
  height     SMALLINT    NOT NULL CHECK (height BETWEEN 1 AND 4096),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, item_id)
);
