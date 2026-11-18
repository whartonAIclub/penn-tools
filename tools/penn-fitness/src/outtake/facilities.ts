// The places a workout can happen, for v1 (section 9 of docs/outtake.md):
// shared Place records (../places.ts) of the workout kinds below. A constant
// rather than a table: it moves into the database when Penn Now needs live data.
//
// Corners come from each facility's address on Penn's own sites (checked
// November 2026); the address is noted beside each. Ids stay as first named,
// since records store them, even where the facility has since been renamed.
//
// TODO before launch:
// - Every campus facility has PLACEHOLDER_HOURS. Check each against its own
//   listing, enter the real hours, and set verified.
// - Add four to six popular Rittenhouse / Center City gyms and studios (zone
//   CENTER_CITY, with their corners): pick them from user interviews.
// - Fill in lat/lng, for Penn Now's map.

import { NO_ATTRIBUTES } from "../attributes.js";
import type { OpeningHours, Place } from "../places.js";
import { WEEKDAYS } from "../time.js";

/** The place kinds a workout can happen at. */
export const WORKOUT_PLACE_KINDS = ["gym", "field", "pool", "studio", "court", "building-gym"] as const;

function sameEveryDay(open: string, close: string): OpeningHours {
  return Object.fromEntries(WEEKDAYS.map((day) => [day, { open, close }])) as OpeningHours;
}

/** Not anyone's real hours: a stand-in until each facility's are checked. */
const PLACEHOLDER_HOURS = sameEveryDay("06:00", "22:00");

/** The user's own building gym. */
export const BUILDING_GYM_ID = "my-building-gym";

const campus = { zone: "CAMPUS", hours: PLACEHOLDER_HOURS, verified: false, lat: null, lng: null, attributes: NO_ATTRIBUTES } as const;

export const FACILITIES: readonly Place[] = [
  // 3701 Walnut Street.
  { ...campus, id: "pottruck", name: "Pottruck", kind: "gym", corner: { street: 37, crossStreet: "Walnut" } },
  // Weiss Pavilion, under Franklin Field's north stands, on Smith Walk off 33rd Street.
  { ...campus, id: "fox-fitness", name: "Fox Fitness", kind: "gym", corner: { street: 33, crossStreet: "Locust" } },
  // 3000 Walnut Street, entered at 31st and Walnut.
  { ...campus, id: "penn-park", name: "Penn Park", kind: "field", corner: { street: 31, crossStreet: "Walnut" } },
  // Inside Pottruck.
  { ...campus, id: "sheerr-pool", name: "Sheerr Pool", kind: "pool", corner: { street: 37, crossStreet: "Walnut" } },
  // 223 South 33rd Street; formerly Ringe Squash Courts.
  { ...campus, id: "ringe-squash", name: "Penn Squash Center", kind: "court", corner: { street: 33, crossStreet: "Walnut" } },
  // 240 South 31st Street, in Penn Park; formerly Levy Tennis Pavilion.
  { ...campus, id: "levy-tennis", name: "Hecht Tennis Center", kind: "court", corner: { street: 31, crossStreet: "Locust" } },
  // Wherever the user lives (zone HOME), and always open. Only offered to users
  // whose shared preferences say their building has a gym.
  {
    id: BUILDING_GYM_ID,
    name: "My building gym",
    kind: "building-gym",
    zone: "HOME",
    corner: null,
    hours: sameEveryDay("00:00", "24:00"),
    verified: true,
    lat: null,
    lng: null,
    attributes: NO_ATTRIBUTES,
  },
];

/** The facility with this id, or undefined. */
export function findFacility(id: string): Place | undefined {
  return FACILITIES.find((facility) => facility.id === id);
}
