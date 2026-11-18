-- Penn Fitness database schema, applied on every `db:deploy` as the
-- pennfitness role once the Platform team registers it in
-- packages/platform/scripts/setup-tools.mjs. Every statement must be safe to
-- re-run against a database that already has it.
--
-- One schema for both halves: shared tables have no prefix, exercise tables
-- start with outtake_, nutrition tables with intake_. user_id is the platform
-- user's id; a tool's schema can't reference platform tables, so there is no
-- foreign key to users.
--
-- Times are New York local time with no time zone (TIMESTAMP, DATE, TIME), as
-- in src/time.ts.

-- ── Shared ──────────────────────────────────────────────────────────────────

-- Where the user lives and when they're awake: used by both halves.
CREATE TABLE IF NOT EXISTS profiles (
  user_id           TEXT        PRIMARY KEY,
  home_base         TEXT        NOT NULL CHECK (home_base IN ('CAMPUS', 'CENTER_CITY')),
  has_building_gym  BOOLEAN     NOT NULL,
  waking_start      TIME        NOT NULL,
  waking_end        TIME        NOT NULL,
  -- Recurring timetable events repeat between these dates.
  semester_start    DATE,
  semester_end      DATE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every analytics event from both halves (section 10 of docs/outtake.md).
CREATE TABLE IF NOT EXISTS analytics_events (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON analytics_events (name, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_user_idx ON analytics_events (user_id, created_at);

-- ── Outtake (exercise) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outtake_prefs (
  user_id                 TEXT        PRIMARY KEY,
  weekly_target_sessions  INTEGER     NOT NULL,
  session_minutes         INTEGER     NOT NULL,
  -- Any of MORNING, MIDDAY, EVENING; empty means no preference.
  preferred_times         TEXT[]      NOT NULL DEFAULT '{}',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outtake_busy_blocks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT        NOT NULL,
  starts_at         TIMESTAMP   NOT NULL,
  ends_at           TIMESTAMP   NOT NULL CHECK (ends_at > starts_at),
  label             TEXT,
  source            TEXT        NOT NULL CHECK (source IN ('ICS', 'SCREENSHOT', 'MANUAL')),
  recurring_weekly  BOOLEAN     NOT NULL DEFAULT FALSE,
  confidence        REAL        CHECK (confidence BETWEEN 0 AND 1),
  confirmed         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outtake_busy_blocks_user_idx ON outtake_busy_blocks (user_id, starts_at);

CREATE TABLE IF NOT EXISTS outtake_away_days (
  user_id TEXT NOT NULL,
  day     DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS outtake_weeks (
  user_id         TEXT    NOT NULL,
  -- Always a Monday.
  week_start      DATE    NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  busyness_score  REAL,
  crunch_mode     BOOLEAN NOT NULL DEFAULT FALSE,
  is_busy         BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS outtake_workout_slots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,
  week_start      DATE        NOT NULL,
  starts_at       TIMESTAMP   NOT NULL,
  ends_at         TIMESTAMP   NOT NULL CHECK (ends_at > starts_at),
  -- An id from src/outtake/facilities.ts.
  facility_id     TEXT        NOT NULL,
  travel_minutes  INTEGER     NOT NULL,
  score           REAL        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('SUGGESTED', 'ACCEPTED', 'COMPLETED', 'SKIPPED', 'DISMISSED')),
  skip_reason     TEXT        CHECK (skip_reason IN ('no_time', 'tired', 'plans_changed', 'other')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'SKIPPED') = (skip_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS outtake_workout_slots_week_idx ON outtake_workout_slots (user_id, week_start);

CREATE TABLE IF NOT EXISTS outtake_dismissed_times (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  weekday     TEXT        NOT NULL CHECK (weekday IN ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')),
  start_time  TIME        NOT NULL,
  end_time    TIME        NOT NULL CHECK (end_time > start_time),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outtake_dismissed_times_user_idx ON outtake_dismissed_times (user_id);
