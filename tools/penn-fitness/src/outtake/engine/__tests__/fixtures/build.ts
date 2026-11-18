// Helpers for writing fixture weeks as readable data. Every fixture is the
// week of Monday, November 16, 2026, a normal (non-holiday) week of a
// first-year Wharton MBA's fall.

import { FACILITIES } from "../../../facilities.js";
import { OUTTAKE_PREFS, type OuttakePrefs } from "../../../prefs.js";
import { SHARED_PREFS, type SharedPrefs } from "../../../../sharedPrefs.js";
import { WEEKDAYS, type LocalDate, type TimeOfDay, type Weekday } from "../../../../time.js";
import type { BlockSource, BusyBlock, DismissedTime, Zone } from "../../../types.js";
import type { PlanInput } from "../../types.js";

export const WEEK_START: LocalDate = "2026-11-16";

/** The date of a weekday in the fixture week: dateOf("WED") is "2026-11-18". */
export function dateOf(day: Weekday): LocalDate {
  return `2026-11-${16 + WEEKDAYS.indexOf(day)}`;
}

function busy(source: BlockSource, day: Weekday, start: TimeOfDay, end: TimeOfDay, label: string, zone: Zone | null): BusyBlock {
  return {
    id: `${day}-${start}-${label}`,
    start: `${dateOf(day)}T${start}`,
    end: `${dateOf(day)}T${end}`,
    label,
    source,
    recurringWeekly: source === "SCREENSHOT",
    confidence: source === "SCREENSHOT" ? 0.95 : null,
    confirmed: true,
    zone,
  };
}

/** A class from the user's timetable: on campus, weekly. */
export const lecture = (day: Weekday, start: TimeOfDay, end: TimeOfDay, label: string) =>
  busy("SCREENSHOT", day, start, end, label, "CAMPUS");

/** A one-off event the user added by hand; zone null when it could be anywhere. */
export const event = (day: Weekday, start: TimeOfDay, end: TimeOfDay, label: string, zone: Zone | null = null) =>
  busy("MANUAL", day, start, end, label, zone);

/**
 * A first-year core schedule: Mon/Wed and Tue/Thu pairs of 80-minute classes
 * in Wharton's usual time slots, with Fridays free of class.
 */
export function coreClasses(): BusyBlock[] {
  return [
    lecture("MON", "08:30", "09:50", "MGMT 6100"),
    lecture("MON", "10:15", "11:35", "STAT 6130"),
    lecture("MON", "13:45", "15:05", "FNCE 6110"),
    lecture("TUE", "10:15", "11:35", "ACCT 6110"),
    lecture("TUE", "13:45", "15:05", "MKTG 6110"),
    lecture("WED", "08:30", "09:50", "MGMT 6100"),
    lecture("WED", "10:15", "11:35", "STAT 6130"),
    lecture("WED", "13:45", "15:05", "FNCE 6110"),
    lecture("THU", "10:15", "11:35", "ACCT 6110"),
    lecture("THU", "13:45", "15:05", "MKTG 6110"),
  ];
}

export interface FixtureOptions {
  busyBlocks: BusyBlock[];
  awayDays?: Weekday[];
  shared?: Partial<SharedPrefs>;
  outtake?: Partial<OuttakePrefs>;
  dismissed?: DismissedTime[];
  crunchMode?: boolean;
}

export function planInput(options: FixtureOptions): PlanInput {
  return {
    weekStart: WEEK_START,
    busyBlocks: options.busyBlocks,
    awayDays: (options.awayDays ?? []).map(dateOf),
    shared: { ...SHARED_PREFS.defaults, ...options.shared },
    outtake: { ...OUTTAKE_PREFS.defaults, ...options.outtake },
    facilities: FACILITIES,
    crunchMode: options.crunchMode ?? false,
    dismissed: options.dismissed ?? [],
  };
}
