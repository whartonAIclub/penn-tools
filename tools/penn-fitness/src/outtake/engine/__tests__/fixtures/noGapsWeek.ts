// NO VIABLE GAPS: the worst week of the semester. Finals Monday to Friday,
// with study groups and superday prep around every exam, then a case
// competition all weekend. The only breaks are 15 minutes between
// commitments. Lives near campus (36th & Chestnut) in a building with a gym,
// so even a 20-minute crunch session with no walking doesn't fit.
//
// A GOOD PLAN:
// - is empty, with targetMet false and a reason for the user (e.g. "No gaps
//   long enough for a workout this week"), in normal and crunch mode;
// - doesn't crash or suggest anything that overlaps a commitment;
// - the week counts as busy.

import type { BusyBlock } from "../../../../schedule.js";
import { WEEKDAYS } from "../../../../time.js";
import { event, planInput } from "./build.js";

const finalsDay = (day: (typeof WEEKDAYS)[number], exam: string): BusyBlock[] => [
  event(day, "07:00", "08:15", "Study group", "CAMPUS"),
  event(day, "08:30", "11:30", `Final exam: ${exam}`, "CAMPUS"),
  event(day, "11:45", "13:45", "Review session", "CAMPUS"),
  event(day, "14:00", "17:00", "Study group", "CAMPUS"),
  event(day, "17:15", "19:00", "Superday prep", "CAMPUS"),
  event(day, "19:15", "22:30", "Study group", "CAMPUS"),
];

const blocks: BusyBlock[] = [
  ...finalsDay("MON", "MGMT 6100"),
  ...finalsDay("TUE", "ACCT 6110"),
  ...finalsDay("WED", "STAT 6130"),
  ...finalsDay("THU", "MKTG 6110"),
  ...finalsDay("FRI", "FNCE 6110"),
  event("SAT", "07:00", "22:30", "Case competition", "CENTER_CITY"),
  event("SUN", "07:00", "22:30", "Case competition", "CENTER_CITY"),
];

const shared = { homeBase: "CAMPUS", homeCorner: { street: 36, crossStreet: "Chestnut" }, hasBuildingGym: true } as const;

export const noGapsWeek = planInput({ busyBlocks: blocks, shared });

export const noGapsWeekCrunch = planInput({ busyBlocks: blocks, shared, crunchMode: true });
