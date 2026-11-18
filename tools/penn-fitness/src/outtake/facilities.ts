// The places a workout can happen, for v1 (section 9 of docs/outtake.md). A
// constant rather than a table: the engine reads it directly, and it moves into
// the database when Penn Now needs live data.
//
// TODO before launch:
// - Every campus facility has PLACEHOLDER_HOURS and an approximate corner. Check
//   each against its own listing, enter the real hours and corner, and set verified.
// - Add four to six popular Rittenhouse / Center City gyms and studios (zone
//   CENTER_CITY, with their corners): pick them from user interviews.
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

const campus = { zone: "CAMPUS", hours: PLACEHOLDER_HOURS, verified: false, lat: null, lng: null } as const;

export const FACILITIES: readonly Facility[] = [
  { ...campus, id: "pottruck", name: "Pottruck", type: "GYM", corner: { street: 37, crossStreet: "Walnut" } },
  { ...campus, id: "fox-fitness", name: "Fox Fitness", type: "GYM", corner: { street: 33, crossStreet: "Walnut" } },
  { ...campus, id: "penn-park", name: "Penn Park", type: "FIELD", corner: { street: 31, crossStreet: "Walnut" } },
  // Inside Pottruck.
  { ...campus, id: "sheerr-pool", name: "Sheerr Pool", type: "POOL", corner: { street: 37, crossStreet: "Walnut" } },
  { ...campus, id: "ringe-squash", name: "Ringe Squash", type: "COURT", corner: { street: 33, crossStreet: "Walnut" } },
  { ...campus, id: "levy-tennis", name: "Levy Tennis", type: "COURT", corner: { street: 31, crossStreet: "Walnut" } },
  // Wherever the user lives (zone HOME), and always open. Only offered to users
  // whose shared preferences say their building has a gym.
  {
    id: BUILDING_GYM_ID,
    name: "My building gym",
    zone: "HOME",
    corner: null,
    type: "BUILDING_GYM",
    hours: sameEveryDay("00:00", "24:00"),
    verified: true,
    lat: null,
    lng: null,
  },
];

/** The facility with this id, or undefined. */
export function findFacility(id: string): Facility | undefined {
  return FACILITIES.find((facility) => facility.id === id);
}
