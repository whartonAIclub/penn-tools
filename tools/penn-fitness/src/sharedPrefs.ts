// Preferences both halves use: where the user lives and when they're awake.
// Each half keeps its own section too (outtake/prefs.ts, and intake's).

import { AREAS, areaOfCorner, formatCorner, isCorner } from "./location.js";
import type { Area, Corner } from "./location.js";
import type { PreferenceSection } from "./preferences.js";
import { isLocalDate, isTimeOfDay, minutesOfDay } from "./time.js";
import type { LocalDate, TimeOfDay } from "./time.js";

export interface SharedPrefs {
  /** The area the user lives in; CENTER_CITY includes Rittenhouse. */
  homeBase: Area;
  /** Their nearest corner, for walking times; optional, and never a street address. */
  homeCorner: Corner | null;
  /** Their building has a gym, so "My building gym" can be suggested. */
  hasBuildingGym: boolean;
  wakingStart: TimeOfDay;
  wakingEnd: TimeOfDay;
  /** Recurring timetable events repeat between these dates; both set or both null. */
  semesterStart: LocalDate | null;
  semesterEnd: LocalDate | null;
}

const AREA_LABELS: Record<Area, string> = { CAMPUS: "campus", CENTER_CITY: "Center City" };

function checkSharedPrefs(prefs: SharedPrefs): string[] {
  const problems: string[] = [];
  if (!(AREAS as readonly string[]).includes(prefs.homeBase)) problems.push("Pick where you live.");
  if (prefs.homeCorner !== null) {
    if (!isCorner(prefs.homeCorner)) problems.push("Pick your nearest corner from the lists.");
    else if (areaOfCorner(prefs.homeCorner) !== prefs.homeBase) {
      const area = AREA_LABELS[areaOfCorner(prefs.homeCorner)];
      problems.push(`${formatCorner(prefs.homeCorner)} is in ${area}: pick ${area} as where you live, or check the corner.`);
    }
  }
  if (typeof prefs.hasBuildingGym !== "boolean") problems.push("Say whether your building has a gym.");

  if (!isTimeOfDay(prefs.wakingStart) || !isTimeOfDay(prefs.wakingEnd)) {
    problems.push("Enter waking hours as times, like 07:00 and 22:30.");
  } else if (minutesOfDay(prefs.wakingEnd) <= minutesOfDay(prefs.wakingStart)) {
    problems.push("Your day has to end after it starts.");
  }

  const { semesterStart: start, semesterEnd: end } = prefs;
  if ((start === null) !== (end === null)) problems.push("Enter both semester dates, or neither.");
  else if (start !== null && end !== null) {
    if (!isLocalDate(start) || !isLocalDate(end)) problems.push("Enter semester dates as dates.");
    else if (end < start) problems.push("The semester has to end after it starts.");
  }
  return problems;
}

export const SHARED_PREFS: PreferenceSection<SharedPrefs> = {
  name: "shared",
  defaults: {
    homeBase: "CAMPUS",
    homeCorner: null,
    hasBuildingGym: false,
    wakingStart: "07:00",
    wakingEnd: "22:30",
    semesterStart: null,
    semesterEnd: null,
  },
  check: checkSharedPrefs,
};
