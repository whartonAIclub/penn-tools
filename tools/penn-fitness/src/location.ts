// Where things are, on Philadelphia's street grid, shared by both halves. A
// place is its nearest corner: a numbered street (running north-south) and a
// named cross street (running east-west), e.g. 23rd & Chestnut. That's precise
// enough to estimate walking time without a map service, and less personal
// than a street address, so no house numbers are ever stored.
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

/** The broad areas the travel model falls back to when there's no corner. */
export const HOME_BASES = ["CAMPUS", "CENTER_CITY"] as const;
export type HomeBase = (typeof HOME_BASES)[number];

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
export function areaOfCorner(corner: Corner): HomeBase {
  return corner.street <= 26 ? "CENTER_CITY" : "CAMPUS";
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
