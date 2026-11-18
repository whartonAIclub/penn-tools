// The outtake (exercise) data model, from section 9 of docs/outtake.md. These
// are plain values with no user ID: storage scopes every read and write to the
// signed-in user, and the engine only ever sees one user's data.

import type { LocalDate, LocalDateTime, TimeOfDay, Weekday } from "../time.js";

/**
 * Where someone is, for the travel model. HOME is the user's home base, which
 * is CAMPUS or CENTER_CITY (see UserProfile); a building gym is always at HOME.
 */
export const ZONES = ["CAMPUS", "CENTER_CITY", "HOME"] as const;
export type Zone = (typeof ZONES)[number];

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
  /** Repeats every week between the profile's semester dates. */
  recurringWeekly: boolean;
  /** How sure the screenshot parser was, 0 to 1; null for other sources. */
  confidence: number | null;
  /** The user has reviewed it; only confirmed blocks are planned around. */
  confirmed: boolean;
}

/** A whole day away (a trek, travel): no workouts are suggested on it. */
export interface AwayDay {
  date: LocalDate;
}

export const FACILITY_TYPES = ["GYM", "FIELD", "POOL", "STUDIO", "COURT", "BUILDING_GYM"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

/** Opening and closing time on one weekday; null when closed all day. */
export type DayHours = { open: TimeOfDay; close: TimeOfDay } | null;
export type OpeningHours = Record<Weekday, DayHours>;

export interface Facility {
  /** Stable, kebab-case; slots store it. */
  id: string;
  name: string;
  zone: Zone;
  type: FacilityType;
  hours: OpeningHours;
  /** False until someone has checked the hours against the facility's own listing. */
  hoursVerified: boolean;
  /** For Penn Now's map later; null until looked up. */
  lat: number | null;
  lng: number | null;
}

/** One planned week, Monday to Sunday. */
export interface Week {
  /** Always a Monday. */
  weekStart: LocalDate;
  /** Busy hours / waking hours, set once the user confirms their blocks; null before that. */
  busynessScore: number | null;
  crunchMode: boolean;
  /** busynessScore at or over the threshold, or crunch mode on: splits the success metric. */
  isBusy: boolean;
}

export const SLOT_STATUSES = ["SUGGESTED", "ACCEPTED", "COMPLETED", "SKIPPED", "DISMISSED"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const SKIP_REASONS = ["no_time", "tired", "plans_changed", "other"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface WorkoutSlot {
  id: string;
  weekStart: LocalDate;
  start: LocalDateTime;
  end: LocalDateTime;
  facilityId: string;
  /** Walking there and back, in minutes. */
  travelMinutes: number;
  score: number;
  status: SlotStatus;
  /** Set only when status is SKIPPED. */
  skipReason: SkipReason | null;
}

/** A time the user dismissed, so the engine learns to avoid it in later weeks. */
export interface DismissedTime {
  weekday: Weekday;
  start: TimeOfDay;
  end: TimeOfDay;
}
