-- PennPaws database schema, applied on every `db:deploy` as the pennpaws role
-- (see packages/platform/scripts/setup-tools.mjs). Every statement must be
-- safe to re-run against a database that already has it.
--
-- user_id columns hold the platform user's id; a tool's schema can't reference
-- platform tables, so names and emails are copied in when someone posts or
-- offers, and only shown to the other person once a booking is agreed.

-- A request for pet care. Survey answers are stored as the option value plus
-- its "something else" text, so filters use the fixed options and nothing the
-- owner typed is lost.
CREATE TABLE IF NOT EXISTS requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         TEXT        NOT NULL,
  owner_name       TEXT        NOT NULL,
  owner_email      TEXT,
  pet_name         TEXT        NOT NULL,
  pet_kind         TEXT        NOT NULL,
  pet_kind_other   TEXT,
  pet_details      TEXT,
  photo            TEXT,
  weekly           BOOLEAN     NOT NULL DEFAULT FALSE,
  starts_on        DATE,
  ends_on          DATE,
  frequency        TEXT        NOT NULL,
  frequency_other  TEXT,
  tasks            TEXT[]      NOT NULL,
  tasks_other      TEXT,
  access           TEXT        NOT NULL,
  access_other     TEXT,
  pay              TEXT        NOT NULL,
  area             TEXT,
  vet              TEXT,
  notes            TEXT,
  status           TEXT        NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'matched', 'agreed', 'completed', 'cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Browsing lists open requests by start date; "my requests" lists an owner's.
CREATE INDEX IF NOT EXISTS requests_status_starts_idx ON requests (status, starts_on);
CREATE INDEX IF NOT EXISTS requests_owner_idx ON requests (owner_id, created_at DESC);

-- Added after the first deploy: the owner's vet, for the care agreement.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS vet TEXT;

-- A sitter's offer to help with one request; one per sitter per request.
CREATE TABLE IF NOT EXISTS offers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   UUID        NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  sitter_id    TEXT        NOT NULL,
  sitter_name  TEXT        NOT NULL,
  sitter_email TEXT,
  message      TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, sitter_id)
);

CREATE INDEX IF NOT EXISTS offers_sitter_idx ON offers (sitter_id, created_at DESC);

-- The care agreement for an accepted offer. terms is checked in code against
-- the AgreementTerms schema. Any change request bumps version and clears both
-- approvals.
CREATE TABLE IF NOT EXISTS agreements (
  request_id         UUID        PRIMARY KEY REFERENCES requests (id) ON DELETE CASCADE,
  offer_id           UUID        NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  terms              JSONB       NOT NULL,
  version            INTEGER     NOT NULL DEFAULT 1,
  owner_approved_at  TIMESTAMPTZ,
  sitter_approved_at TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- In-app notifications. notify() in notifications.ts writes here; email or
-- push can be added as further channels without changing callers.
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  request_id  UUID        REFERENCES requests (id) ON DELETE CASCADE,
  message     TEXT        NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, id DESC);
