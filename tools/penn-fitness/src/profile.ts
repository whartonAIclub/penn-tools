// The user's profile, shared by both halves: where they live and when they're
// awake. Each half keeps its own preferences (e.g. outtake/prefs.ts).

import { isLocalDate, isTimeOfDay, minutesOfDay } from "./time.js";
import type { LocalDate, TimeOfDay } from "./time.js";

export const HOME_BASES = ["CAMPUS", "CENTER_CITY"] as const;
export type HomeBase = (typeof HOME_BASES)[number];

export interface UserProfile {
  /** Where the user lives; CENTER_CITY includes Rittenhouse. */
  homeBase: HomeBase;
  /** Their building has a gym, so "My building gym" can be suggested. */
  hasBuildingGym: boolean;
  wakingStart: TimeOfDay;
  wakingEnd: TimeOfDay;
  /** Recurring timetable events repeat between these dates; both set or both null. */
  semesterStart: LocalDate | null;
  semesterEnd: LocalDate | null;
}

/** What a user has until they save their own. */
export const DEFAULT_PROFILE: UserProfile = {
  homeBase: "CAMPUS",
  hasBuildingGym: false,
  wakingStart: "07:00",
  wakingEnd: "22:30",
  semesterStart: null,
  semesterEnd: null,
};

/**
 * What's wrong with a profile, as messages for the user; empty when it's valid.
 * Checks every field at runtime, since profiles arrive from forms.
 */
export function checkProfile(profile: UserProfile): string[] {
  const problems: string[] = [];
  if (!(HOME_BASES as readonly string[]).includes(profile.homeBase)) problems.push("Pick where you live.");
  if (typeof profile.hasBuildingGym !== "boolean") problems.push("Say whether your building has a gym.");

  const wakingTimesValid = isTimeOfDay(profile.wakingStart) && isTimeOfDay(profile.wakingEnd);
  if (!wakingTimesValid) problems.push("Enter waking hours as times, like 07:00 and 22:30.");
  else if (minutesOfDay(profile.wakingEnd) <= minutesOfDay(profile.wakingStart)) {
    problems.push("Your day has to end after it starts.");
  }

  const { semesterStart: start, semesterEnd: end } = profile;
  if ((start === null) !== (end === null)) problems.push("Enter both semester dates, or neither.");
  else if (start !== null && end !== null) {
    if (!isLocalDate(start) || !isLocalDate(end)) problems.push("Enter semester dates as dates.");
    else if (end < start) problems.push("The semester has to end after it starts.");
  }
  return problems;
}
