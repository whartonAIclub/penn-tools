// The slot engine's input and output (section 8.3 of docs/outtake.md). The
// engine is pure: everything it needs comes in through PlanInput, and it
// returns a WeekPlan without reading or writing anything.

import type { LocalDate, LocalDateTime } from "../../time.js";
import type { SharedPrefs } from "../../sharedPrefs.js";
import type { OuttakePrefs } from "../prefs.js";
import type { BusyBlock, DismissedTime, Facility } from "../types.js";

export interface PlanInput {
  /** The Monday the week starts on; the plan covers Monday to Sunday. */
  weekStart: LocalDate;
  /** The user's confirmed busy blocks for the week. */
  busyBlocks: readonly BusyBlock[];
  /** Whole days away (treks, travel): nothing is planned on them. */
  awayDays: readonly LocalDate[];
  shared: SharedPrefs;
  outtake: OuttakePrefs;
  facilities: readonly Facility[];
  /** Heavy week: aim for 2 short sessions instead of the usual target. */
  crunchMode: boolean;
  /** Times the user dismissed before, to avoid. */
  dismissed: readonly DismissedTime[];
}

export interface PlannedSlot {
  start: LocalDateTime;
  end: LocalDateTime;
  facilityId: string;
  /** Walking there and back, in minutes. */
  travelMinutes: number;
  score: number;
}

export interface WeekPlan {
  /** In time order, at most one a day. */
  slots: PlannedSlot[];
  /** How many sessions the plan aimed for: the user's target, or 2 in crunch mode. */
  targetSessions: number;
  targetMet: boolean;
  /** Why the target wasn't met, for the user ("only 2 viable gaps this week"); null when it was. */
  reason: string | null;
  /** Busy hours / waking hours for the week. */
  busyness: number;
  /** busyness at or over the threshold, or crunch mode on. */
  isBusy: boolean;
}
