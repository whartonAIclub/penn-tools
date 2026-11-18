// Where things are, shared by both halves.
//
// The precise answer is a corner on Philadelphia's street grid: a numbered
// street (running north-south) and a named cross street (running east-west),
// e.g. 23rd & Chestnut. That's precise enough to estimate walking time without
// a map service, and less personal than a street address, so no house numbers
// are ever stored. The rough answer, when there's no corner, is an area.
//
// The grid is an approximation: blocks aren't all the same length, and the
// Schuylkill can only be crossed on its bridges. The engine turns blocks into
// minutes with a setting tuned at the engine review.

/** Center City's main cross streets, north to south; each step is one block. */
export const CROSS_STREETS = ["Race", "Arch", "Market", "Chestnut", "Walnut", "Locust", "Spruce", "Pine", "Lombard", "South"] as const;
export type CrossStreet = (typeof CROSS_STREETS)[number];

/** Numbered streets run from Front (1st) to the city line; Broad is 14th. */
export const NUMBERED_STREET_RANGE = { min: 1, max: 69 } as const;

export interface Corner {
  /** The numbered street: 23 for 23rd Street. */
  street: number;
  crossStreet: CrossStreet;
}

/** The broad areas, for when there's no corner; CENTER_CITY includes Rittenhouse. */
export const AREAS = ["CAMPUS", "CENTER_CITY"] as const;
export type Area = (typeof AREAS)[number];

/**
 * Where a stored record says something happens, when it has no corner: an
 * area, or HOME, meaning wherever the user lives (see SharedPrefs).
 */
export const ZONES = [...AREAS, "HOME"] as const;
export type Zone = (typeof ZONES)[number];

/** A resolved place: always an area, and a corner when known. */
export interface Location {
  area: Area;
  corner: Corner | null;
}

export function isCorner(value: Corner): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger(value.street) &&
    value.street >= NUMBERED_STREET_RANGE.min &&
    value.street <= NUMBERED_STREET_RANGE.max &&
    (CROSS_STREETS as readonly string[]).includes(value.crossStreet)
  );
}

/** Streets up to the Schuylkill (26th) are Center City; past it is University City, around campus. */
export function areaOfCorner(corner: Corner): Area {
  return corner.street <= 26 ? "CENTER_CITY" : "CAMPUS";
}

/** A location at a corner, in the corner's area. */
export function atCorner(corner: Corner): Location {
  return { area: areaOfCorner(corner), corner };
}

/** Blocks walked between two corners: across numbered streets plus across cross streets. */
export function blocksBetween(a: Corner, b: Corner): number {
  const crossIndex = (corner: Corner) => CROSS_STREETS.indexOf(corner.crossStreet);
  return Math.abs(a.street - b.street) + Math.abs(crossIndex(a) - crossIndex(b));
}

/** "23rd & Chestnut". */
export function formatCorner(corner: Corner): string {
  const n = corner.street;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix} & ${corner.crossStreet}`;
}
