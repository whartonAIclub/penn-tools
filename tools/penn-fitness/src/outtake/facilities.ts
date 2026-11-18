// The places a workout can happen, for v1 (section 9 of docs/outtake.md). A
// constant rather than a table: the engine reads it directly, and it moves into
// the database when Penn Now needs live data.
//
// TODO before launch:
// - Every campus facility has PLACEHOLDER_HOURS, not its real hours. Check each
//   against its posted schedule, enter the real hours and set hoursVerified.
// - Add four to six popular Rittenhouse / Center City gyms and studios (zone
//   CENTER_CITY): pick them from user interviews.
// - Fill in lat/lng, for Penn Now's map.

import { WEEKDAYS } from "../time.js";
import type { Facility, OpeningHours } from "./types.js";

function sameEveryDay(open: string, close: string): OpeningHours {
  return Object.fromEntries(WEEKDAYS.map((day) => [day, { open, close }])) as OpeningHours;
}

/** Not anyone's real hours: a stand-in until each facility's are checked. */
const PLACEHOLDER_HOURS = sameEveryDay("06:00", "22:00");

/** The user's own building gym. */
export const BUILDING_GYM_ID = "my-building-gym";

export const FACILITIES: readonly Facility[] = [
  { id: "pottruck", name: "Pottruck", zone: "CAMPUS", type: "GYM", hours: PLACEHOLDER_HOURS, hoursVerified: false, lat: null, lng: null },
  { id: "fox-fitness", name: "Fox Fitness", zone: "CAMPUS", type: "GYM", hours: PLACEHOLDER_HOURS, hoursVerified: false, lat: null, lng: null },
  { id: "penn-park", name: "Penn Park", zone: "CAMPUS", type: "FIELD", hours: PLACEHOLDER_HOURS, hoursVerified: false, lat: null, lng: null },
  { id: "sheerr-pool", name: "Sheerr Pool", zone: "CAMPUS", type: "POOL", hours: PLACEHOLDER_HOURS, hoursVerified: false, lat: null, lng: null },
  { id: "ringe-squash", name: "Ringe Squash", zone: "CAMPUS", type: "COURT", hours: PLACEHOLDER_HOURS, hoursVerified: false, lat: null, lng: null },
  { id: "levy-tennis", name: "Levy Tennis", zone: "CAMPUS", type: "COURT", hours: PLACEHOLDER_HOURS, hoursVerified: false, lat: null, lng: null },
  // Wherever the user lives (zone HOME), and always open. Only offered to users
  // whose profile says their building has a gym.
  {
    id: BUILDING_GYM_ID,
    name: "My building gym",
    zone: "HOME",
    type: "BUILDING_GYM",
    hours: sameEveryDay("00:00", "24:00"),
    hoursVerified: true,
    lat: null,
    lng: null,
  },
];

/** The facility with this id, or undefined. */
export function findFacility(id: string): Facility | undefined {
  return FACILITIES.find((facility) => facility.id === id);
}
