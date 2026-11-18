// The user's workout preferences: how much exercise a week, and when they like
// it. Stored as the "outtake" section of the preferences table (see ../preferences.ts).

import type { PreferenceSection } from "../preferences.js";

export const PREFERRED_TIMES = ["MORNING", "MIDDAY", "EVENING"] as const;
export type PreferredTime = (typeof PREFERRED_TIMES)[number];

export interface OuttakePrefs {
  weeklyTargetSessions: number;
  sessionMinutes: number;
  /** Times of day they'd rather work out; empty means no preference. */
  preferredTimes: PreferredTime[];
}

export const SESSIONS_RANGE = { min: 1, max: 14 } as const;
export const SESSION_MINUTES_RANGE = { min: 10, max: 180 } as const;

function inRange(value: number, range: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
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
  return problems;
}

/** The spec's default: 3 sessions of 45 minutes, any time of day. */
export const OUTTAKE_PREFS: PreferenceSection<OuttakePrefs> = {
  name: "outtake",
  defaults: { weeklyTargetSessions: 3, sessionMinutes: 45, preferredTimes: [] },
  check: checkOuttakePrefs,
};
