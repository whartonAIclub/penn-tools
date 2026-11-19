// The user's workout preferences: how much exercise a week, and when they like
// it. Stored as the "outtake" section of the preferences table (see ../preferences.ts).

import type { PreferenceSection } from "../preferences.js";
import type { TimeOfDay } from "../time.js";

export const PREFERRED_TIMES = ["MORNING", "MIDDAY", "EVENING"] as const;
export type PreferredTime = (typeof PREFERRED_TIMES)[number];

/** What each preferred time means, as a window of the day; the engine only ever sees windows. */
export const PREFERRED_TIME_WINDOWS: Record<PreferredTime, { start: TimeOfDay; end: TimeOfDay }> = {
  MORNING: { start: "00:00", end: "12:00" },
  MIDDAY: { start: "12:00", end: "16:00" },
  EVENING: { start: "16:00", end: "24:00" },
};

/**
 * How a user's plans differ from everyone's starting point, learned from their
 * weekly check-ins (checkIn.ts). Stored as changes, not values, so tuning the
 * starting point (ENGINE_CONFIG) still reaches users who've checked in.
 */
export interface Adjustments {
  /** Multiplies how much walking counts against a slot: above 1, they'd rather stay close. */
  travelFactor: number;
  /** Added to the minutes kept clear before their next commitment. */
  bufferMinutes: number;
  /** Added to the minutes after waking with no session. */
  wakeBufferMinutes: number;
  /** Added to the minutes before bed with no session. */
  bedBufferMinutes: number;
}

export const NO_ADJUSTMENTS: Adjustments = { travelFactor: 1, bufferMinutes: 0, wakeBufferMinutes: 0, bedBufferMinutes: 0 };

/** How far check-ins can move each adjustment, so a few answers can't make plans impossible. */
export const ADJUSTMENT_RANGES: Record<keyof Adjustments, { min: number; max: number }> = {
  travelFactor: { min: 0.25, max: 4 },
  bufferMinutes: { min: -20, max: 60 },
  wakeBufferMinutes: { min: -30, max: 120 },
  bedBufferMinutes: { min: 0, max: 180 },
};

export interface OuttakePrefs {
  weeklyTargetSessions: number;
  sessionMinutes: number;
  /** Times of day they'd rather work out; empty means no preference. */
  preferredTimes: PreferredTime[];
  /** Spread sessions across the week, or don't mind days in a row. */
  spreadOut: boolean;
  /** Learned from weekly check-ins; NO_ADJUSTMENTS until the first. */
  adjustments: Adjustments;
}

export const SESSIONS_RANGE = { min: 1, max: 14 } as const;
export const SESSION_MINUTES_RANGE = { min: 10, max: 180 } as const;

function inRange(value: number, range: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}

function isAdjustments(value: Adjustments): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.keys(ADJUSTMENT_RANGES) as (keyof Adjustments)[]).every((key) => {
      const n = value[key];
      return typeof n === "number" && Number.isFinite(n) && n >= ADJUSTMENT_RANGES[key].min && n <= ADJUSTMENT_RANGES[key].max;
    })
  );
}

function checkOuttakePrefs(prefs: OuttakePrefs): string[] {
  const problems: string[] = [];
  if (!inRange(prefs.weeklyTargetSessions, SESSIONS_RANGE)) {
    problems.push(`Pick ${SESSIONS_RANGE.min} to ${SESSIONS_RANGE.max} workouts a week.`);
  }
  if (!inRange(prefs.sessionMinutes, SESSION_MINUTES_RANGE)) {
    problems.push(`Pick a workout length of ${SESSION_MINUTES_RANGE.min} to ${SESSION_MINUTES_RANGE.max} minutes.`);
  }
  const times = prefs.preferredTimes;
  if (!Array.isArray(times) || times.some((time) => !(PREFERRED_TIMES as readonly string[]).includes(time))) {
    problems.push("Pick preferred times from morning, midday and evening.");
  } else if (new Set(times).size !== times.length) {
    problems.push("Pick each preferred time only once.");
  }
  if (typeof prefs.spreadOut !== "boolean") problems.push("Say whether you'd like your workouts spread across the week.");
  // Set by check-ins, never typed by the user, so a problem here is a bug rather than a mistake.
  if (!isAdjustments(prefs.adjustments)) problems.push("Your weekly check-in settings look wrong; they'll be reset.");
  return problems;
}

/** The spec's default: 3 sessions of 45 minutes, any time of day, spread across the week. */
export const OUTTAKE_PREFS: PreferenceSection<OuttakePrefs> = {
  name: "outtake",
  defaults: { weeklyTargetSessions: 3, sessionMinutes: 45, preferredTimes: [], spreadOut: true, adjustments: NO_ADJUSTMENTS },
  check: checkOuttakePrefs,
};
