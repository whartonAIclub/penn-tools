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

-- Added after the first deploy: when either person marked the booking done.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Added after the first deploy: the type of care (visits, stay or boarding),
-- what the owner asks of a sitter (compared with sitter profiles), and the
-- owner's own post when AI read it from another language.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS care_type TEXT NOT NULL DEFAULT 'visits'
  CHECK (care_type IN ('visits', 'stay', 'boarding'));
ALTER TABLE requests ADD COLUMN IF NOT EXISTS must_haves TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS sitter_gender TEXT NOT NULL DEFAULT 'none';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS original_text TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS original_language TEXT;

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

-- A member's first-time setup: the role they chose, the school their .edu
-- sign-in email belongs to, and their survey answers. profile is checked in
-- code against the Profile schema in profile.ts. lat/lng (rounded to about
-- 300 m, never an exact address) and area are copied out of it for matching
-- by distance.
CREATE TABLE IF NOT EXISTS members (
  user_id     TEXT             PRIMARY KEY,
  name        TEXT             NOT NULL,
  email       TEXT,
  school      TEXT             NOT NULL,
  role        TEXT             NOT NULL CHECK (role IN ('owner', 'sitter', 'pals')),
  profile     JSONB            NOT NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  area        TEXT,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS members_role_idx ON members (role);

-- What a sitter was paid for a booking, as they record it. Money moves in
-- Venmo, PayPal and the like, outside PennPaws; this only keeps track.
CREATE TABLE IF NOT EXISTS payments (
  request_id  UUID          PRIMARY KEY REFERENCES requests (id) ON DELETE CASCADE,
  sitter_id   TEXT          NOT NULL,
  amount      NUMERIC(8, 2) NOT NULL CHECK (amount > 0),
  method      TEXT          NOT NULL CHECK (method IN ('venmo', 'paypal', 'zelle', 'cash', 'other')),
  paid_on     DATE          NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_sitter_idx ON payments (sitter_id, paid_on DESC);

-- An owner's rating of a finished booking, one per booking. The sitter reads
-- ratings without the owner, the pet or the booking (see jobs.ts), so owners
-- can be honest.
CREATE TABLE IF NOT EXISTS reviews (
  request_id  UUID        PRIMARY KEY REFERENCES requests (id) ON DELETE CASCADE,
  owner_id    TEXT        NOT NULL,
  sitter_id   TEXT        NOT NULL,
  rating      SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reviews_sitter_idx ON reviews (sitter_id, created_at DESC);

-- Messages about a request: one thread per sitter, between that sitter and
-- the owner, so they can sort out details before and after booking. Emails
-- stay hidden; people talk here until both approve.
CREATE TABLE IF NOT EXISTS threads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  sitter_id   TEXT        NOT NULL,
  sitter_name TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, sitter_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id   UUID        NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  from_owner  BOOLEAN     NOT NULL,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (thread_id, id);

-- Team moderation. A hidden request drops out of Find for everyone but its
-- owner; a paused member can still sign in but can't post, offer or message
-- until the team unpauses them. See team.ts.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- What members report about a request or a sitter's offer. subject_id is the
-- member the report is about (the request's owner or the offer's sitter),
-- worked out on the server so reporters never see anyone's id.
CREATE TABLE IF NOT EXISTS reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  TEXT        NOT NULL,
  target_kind  TEXT        NOT NULL CHECK (target_kind IN ('request', 'offer')),
  request_id   UUID        NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  subject_id   TEXT        NOT NULL,
  reason       TEXT        NOT NULL CHECK (reason IN ('unsafe', 'fake', 'rude', 'other')),
  details      TEXT,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reporter_id, target_kind, request_id, subject_id)
);

CREATE INDEX IF NOT EXISTS reports_open_idx ON reports (created_at DESC) WHERE resolved_at IS NULL;

-- The rules' match score when the sitter offered, so the team can see whether
-- people act on good matches.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS match_score SMALLINT;

-- What each person shares when they approve: a phone number for the care
-- itself, and the address where it happens (the owner's for visits and stays,
-- the sitter's for boarding). Shown only to the two of them, once booked.
CREATE TABLE IF NOT EXISTS handoffs (
  request_id  UUID        NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, user_id)
);

-- Why someone backed out, for the other person's notification and the team.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS withdraw_reason TEXT;

-- The latest change someone asked for, so the other person sees what moved.
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS last_change TEXT;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS changed_by TEXT;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS changed_fields TEXT[] NOT NULL DEFAULT '{}';

-- An owner's saved pets, one row each, so a request is posted by picking pets
-- instead of answering the same questions again. The columns mirror the pet
-- block of OwnerProfile (profile.ts); photo is a data URL, as on requests.
CREATE TABLE IF NOT EXISTS pets (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           TEXT        NOT NULL,
  name               TEXT        NOT NULL,
  kind               TEXT        NOT NULL,
  kind_other         TEXT,
  size               TEXT        NOT NULL,
  age                TEXT        NOT NULL,
  energy             TEXT        NOT NULL,
  with_people        TEXT        NOT NULL,
  with_animals       TEXT        NOT NULL,
  alone              TEXT        NOT NULL,
  special_care       TEXT[]      NOT NULL DEFAULT '{}',
  special_care_other TEXT,
  bites              BOOLEAN     NOT NULL DEFAULT FALSE,
  bites_details      TEXT,
  photo              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- My Pets lists an owner's pets oldest first, so the order stays put.
CREATE INDEX IF NOT EXISTS pets_owner_idx ON pets (owner_id, created_at);

-- Details an owner may not want on a public request: breed, what the pet eats,
-- and any condition. Private by default and shown once the booking is agreed;
-- shared_early names the ones the owner chose to show sitters sooner, because
-- they change whether someone can take the job at all.
ALTER TABLE pets ADD COLUMN IF NOT EXISTS breed TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS diet TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS health TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS shared_early TEXT[] NOT NULL DEFAULT '{}';
