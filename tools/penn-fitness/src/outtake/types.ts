// The outtake (exercise) data model, from section 9 of docs/outtake.md. The
// schedule and places it uses are shared with the intake half (../schedule.ts,
// ../places.ts). Plain values with no user id: storage scopes every query to
// the signed-in user.

import type { Attributes } from "../attributes.js";
import type { LocalDate, LocalDateTime, TimeOfDay, Weekday } from "../time.js";

/** One planned week, Monday to Sunday. */
export interface Week {
  /** Always a Monday. */
  weekStart: LocalDate;
  /** Busy hours / waking hours, set once the user confirms their blocks; null before that. */
  busynessScore: number | null;
  crunchMode: boolean;
  /** busynessScore at or over the threshold, or crunch mode on: splits the success metric. */
  isBusy: boolean;
  attributes: Attributes;
}

/** Checked in code, not the database, so a new status needs no schema change. */
export const SLOT_STATUSES = ["SUGGESTED", "ACCEPTED", "COMPLETED", "SKIPPED", "DISMISSED"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const SKIP_REASONS = ["no_time", "tired", "plans_changed", "other"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface WorkoutSlot {
  id: string;
  weekStart: LocalDate;
  start: LocalDateTime;
  end: LocalDateTime;
  /** A Place id (../places.ts). */
  placeId: string;
  /** Walking there and back, in minutes. */
  travelMinutes: number;
  score: number;
  status: SlotStatus;
  /** Set only when status is SKIPPED. */
  skipReason: SkipReason | null;
  attributes: Attributes;
}

/** A time the user dismissed, so the engine learns to avoid it in later weeks. */
export interface DismissedTime {
  weekday: Weekday;
  start: TimeOfDay;
  end: TimeOfDay;
}
