// Hand-written types for engine/time.js: New York wall time (C-DESIGN.md §5.2). index.js re-exports all of it.
// src/__tests__/engine-exports.test.ts checks that this file declares exactly what time.js exports.

/** The New York calendar date and wall-clock time at an instant. Every field is NaN for an instant that isn't a finite date. */
export interface NyParts {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  /** 0 to 23. */
  hour: number;
  minute: number;
  second: number;
  /** 0 (Sunday) to 6. */
  weekday: number;
}

/** The time zone every naive Handoff date and time is in. */
export declare const NY_TZ: "America/New_York";
/** The New York date and time at an instant (ms). */
export declare function nyParts(ms: number): NyParts;
/**
 * The instant (ms) a New York wall time names: "YYYY-MM-DDTHH:MM", optionally ":SS". NaN for anything else, including a date
 * alone (use at or atMs from index.js, where a date means 23:59). A time the clocks skip moves an hour later; a time that
 * happens twice is the first of the two.
 */
export declare function wallToMs(wall: string): number;
/** The New York date at an instant, as "YYYY-MM-DD". */
export declare function nyIsoDate(ms: number): string;
