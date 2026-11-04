-- Trek Finder database schema, applied on every `db:deploy` as the trekfinder
-- role (see packages/platform/scripts/setup-tools.mjs). Every statement must be
-- safe to re-run against a database that already has it.
--
-- Trips come from the team's Google Sheet (seed.mjs); the app only reads these
-- tables. Status, the current price stage and the current cost are worked out
-- from dates in code, never stored. Trip types, regions, timings and other
-- categories are TEXT checked in TypeScript, so adding one needs no schema
-- change.

-- One trip. id is the permanent slug from the Sheet (e.g. 'japan-trek-2027'),
-- which saves and future features point to. Trips are never deleted: a trip
-- that leaves the Sheet gets listed = false.
CREATE TABLE IF NOT EXISTS trips (
  id                  TEXT        PRIMARY KEY,
  name                TEXT        NOT NULL,
  trip_type           TEXT        NOT NULL,
  location            TEXT        NOT NULL,              -- "Japan", "Italy & France"
  cities              TEXT[]      NOT NULL DEFAULT '{}',
  region              TEXT        NOT NULL,
  start_date          DATE        NOT NULL,
  end_date            DATE        NOT NULL,
  timing              TEXT        NOT NULL,              -- 'break' | 'opportunity_week' | 'other'
  period_label        TEXT,                              -- "Spring Break 2027"
  academic_credit     BOOLEAN     NOT NULL DEFAULT FALSE,
  credit_note         TEXT,                              -- "1.0 CU"
  description         TEXT,
  price_includes      TEXT,                              -- shown by the price's info icon
  destination_blurb   TEXT,                              -- back of the card; null = no flip
  itinerary           TEXT,
  availability_status TEXT,                              -- 'open' | 'limited' | 'waitlist' | 'full'; null = unknown
  spots_total         INT,
  spots_remaining     INT,
  organizer_name      TEXT        NOT NULL,
  organizer_contact   TEXT,
  organizer_email     TEXT,
  application_url     TEXT,
  destination_airport TEXT,                              -- IATA code, for a future flight link or prices
  image_url           TEXT,
  image_credit        TEXT,
  listed              BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The catalog loads listed trips in date order.
CREATE INDEX IF NOT EXISTS trips_listed_start_idx ON trips (listed, start_date);

-- A trip's price stages, in order. Stages with dates are tiers that change on
-- those dates; stages without dates are an estimate that firms up, the latest
-- (highest position) being current.
CREATE TABLE IF NOT EXISTS trip_price_stages (
  trip_id     TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  position    INT  NOT NULL,
  label       TEXT NOT NULL,                             -- "Early bird", "Confirmed"
  amount_usd  INT,                                       -- null = TBD
  certainty   TEXT NOT NULL DEFAULT 'estimate',          -- 'estimate' | 'confirmed'
  valid_from  DATE,
  valid_until DATE,
  note        TEXT,
  PRIMARY KEY (trip_id, position)
);

-- A trip's deadlines, in order. due_time is America/New_York; null means end
-- of day.
CREATE TABLE IF NOT EXISTS trip_deadlines (
  trip_id  TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  position INT  NOT NULL,
  kind     TEXT NOT NULL,                                -- 'preliminary' | 'application' | 'deposit' | 'payment' | 'other'
  label    TEXT NOT NULL,
  due_date DATE NOT NULL,
  due_time TIME,
  PRIMARY KEY (trip_id, position)
);

-- At most one preliminary deadline per trip; it decides when the card greys out.
CREATE UNIQUE INDEX IF NOT EXISTS trip_deadlines_one_preliminary_idx
  ON trip_deadlines (trip_id) WHERE kind = 'preliminary';

CREATE TABLE IF NOT EXISTS trip_links (
  trip_id  TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  position INT  NOT NULL,
  label    TEXT NOT NULL,
  url      TEXT NOT NULL,
  PRIMARY KEY (trip_id, position)
);

-- A student's saved (hearted) trips. user_id is the platform user's id; a
-- tool's schema can't reference platform tables, so there is no foreign key
-- to users.
CREATE TABLE IF NOT EXISTS saved_trips (
  user_id    TEXT        NOT NULL,
  trip_id    TEXT        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, trip_id)
);

-- One row per Sheet import, so the team can see what loaded and what was
-- skipped. problems is [{ row, tripId, message }].
CREATE TABLE IF NOT EXISTS import_runs (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT        NOT NULL,                     -- 'ok' | 'partial' | 'aborted' | 'failed'
  trips_loaded INT         NOT NULL DEFAULT 0,
  problems     JSONB       NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS import_runs_started_idx ON import_runs (started_at DESC);

-- Clicks on a trip's outbound links (P2 feature; the table is ready now).
-- user_id is null when signed out.
CREATE TABLE IF NOT EXISTS link_clicks (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id    TEXT        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  link_kind  TEXT        NOT NULL,                       -- 'application' | 'other'
  user_id    TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS link_clicks_trip_idx ON link_clicks (trip_id, clicked_at);
