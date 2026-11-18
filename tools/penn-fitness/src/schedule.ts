// The user's schedule, shared by both halves: exercise plans workouts around
// it, and intake can plan meals around the same classes and events. Plain
// values with no user id: storage scopes every query to the signed-in user.

import type { Attributes } from "./attributes.js";
import type { Zone } from "./location.js";
import type { LocalDate, LocalDateTime } from "./time.js";

/** Where a block came from. Checked in code, not the database, so a new source needs no schema change. */
export const BLOCK_SOURCES = ["ICS", "SCREENSHOT", "MANUAL"] as const;
export type BlockSource = (typeof BLOCK_SOURCES)[number];

/** A stretch of time the user is busy. */
export interface BusyBlock {
  id: string;
  start: LocalDateTime;
  end: LocalDateTime;
  /** Short, e.g. "FNCE 6110"; descriptions, attendees and locations are never kept. */
  label: string | null;
  source: BlockSource;
  /** Repeats every week between the semester dates in the shared preferences. */
  recurringWeekly: boolean;
  /** How sure the screenshot parser was, 0 to 1; null for other sources. */
  confidence: number | null;
  /** The user has reviewed it; only confirmed blocks are planned around. */
  confirmed: boolean;
  /** Where the user is during it, if known: timetable classes are CAMPUS. Null when unknown, taken as home. */
  zone: Zone | null;
  attributes: Attributes;
}

/** A whole day away (a trek, travel): nothing is planned on it. */
export interface AwayDay {
  date: LocalDate;
  attributes: Attributes;
}
