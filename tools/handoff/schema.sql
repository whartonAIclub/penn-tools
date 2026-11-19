-- Handoff database schema, applied on every db:deploy as the handoff role
-- (packages/platform/scripts/setup-tools.mjs, once Handoff is in its TOOLS list; for a local
-- database, see "Database setup" in tools/handoff/README.md).
-- Every statement must be safe to re-run. There is no seed: the live market starts empty.
-- User ids are platform users.id values; there are no foreign keys because this role can't read public.users.
-- Times are TIMESTAMPTZ; quantities, money and ids inside the market live in records.data (JSON, as the
-- prototype's state). Changing an inline CHECK later needs ALTER TABLE ... DROP CONSTRAINT IF EXISTS / ADD.

-- The marketplace: one row per world. Its records are rows of their own (`records`, below); doc holds the rest of the market's
-- document, or, for a world written before the rows, the whole document until its first write splits it.
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

-- Profiles: the account's name and email and what the user chose to share. Made by the account's first change (opening Handoff saves
-- nothing: review of PR #88), refreshed by each change after, and deleted by "Delete my Handoff data" (store.ts deleteMyData).
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

-- Review of PR #88: the market as rows. Every event, holding, listing, exchange (a request on a listing), public request or alert,
-- share, item and goods request is its own row here, so a change writes only the rows it touches, locks only those (and the rows
-- they depend on, such as an exchange's listing) and the profiles of the people whose records change, and unrelated trades go
-- through at the same time. worlds.doc keeps only the rest of the document (its settings), with "format": "rows"; split_at is when
-- a world written before this was split into rows (store.ts ensureSplit, at its first write, after a before-upgrade snapshot).
-- A world's version is worlds.version plus every row's tally: each change adds one, on one of the rows it writes (or on the world's
-- row when it changes that anyway), so the version counts changes and no row is written by every change. rev is the row's own
-- revision, which app instances compare to read only the rows that changed since their copy. `ord` keeps each list's order (the
-- engine adds some at the front, some at the end); `data` is the record exactly as the engine keeps it. owner_id, open and parent_id
-- repeat what the record says (store.ts writes them from it): parent_id for the photo route, which reads an item's own rows only;
-- owner_id and open (open by the record's own fields; the per-account limit asks the engine, which also knows the time) for
-- diagnostics. A manual fix to a row must raise its rev and its tally, or app instances keep their copy.
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS split_at TIMESTAMPTZ;
CREATE SEQUENCE IF NOT EXISTS record_ord;
CREATE TABLE IF NOT EXISTS records (
  world_id   TEXT        NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL CHECK (kind ~ '^[A-Za-z]{1,24}$'),
  id         TEXT        NOT NULL CHECK (char_length(id) BETWEEN 1 AND 80),
  ord        BIGINT      NOT NULL,
  rev        INTEGER     NOT NULL DEFAULT 1 CHECK (rev >= 1),
  tally      INTEGER     NOT NULL DEFAULT 0 CHECK (tally >= 0),
  stamp      BIGINT      NOT NULL DEFAULT 0,    -- the engine's stamp clock (lastStamp) as the write that stored it left it
  owner_id   TEXT        CHECK (owner_id IS NULL OR char_length(owner_id) BETWEEN 1 AND 64),
  open       BOOLEAN     NOT NULL DEFAULT false,
  parent_id  TEXT        CHECK (parent_id IS NULL OR char_length(parent_id) BETWEEN 1 AND 80),
  data       JSONB       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- the time of the write that stored it (the engine's clock)
  PRIMARY KEY (world_id, kind, id)
);
CREATE INDEX IF NOT EXISTS records_tally_idx ON records (world_id) INCLUDE (tally, rev);
CREATE INDEX IF NOT EXISTS records_id_idx ON records (world_id, id);
CREATE INDEX IF NOT EXISTS records_parent_idx ON records (world_id, parent_id) WHERE parent_id IS NOT NULL;
-- The per-account limit on changes per minute counts one account's recent actions.
CREATE INDEX IF NOT EXISTS actions_actor_at_idx ON actions (world_id, actor_id, at);

-- Outbound email was removed from this tool (review of PR #88: a tool may not send its own email). Its four tables, made by earlier
-- versions of this file, go with it; in-app notifications (above) are unchanged.
DROP TABLE IF EXISTS email_capture;
DROP TABLE IF EXISTS email_jobs;
DROP TABLE IF EXISTS email_dispatch;
DROP TABLE IF EXISTS email_prefs;

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
