// The slot engine's input and output (section 8.3 of docs/outtake.md).
//
// The engine is pure, and knows nothing about how preferences, the schedule or
// places are stored: PlanInput is its own small, fixed shape, built by
// buildPlanInput (../planInput.ts). When either half adds or renames an
// attribute, only that translator changes, never the engine.

import type { Location } from "../../location.js";
import type { OpeningHours } from "../../places.js";
import type { LocalDate, LocalDateTime, TimeOfDay } from "../../time.js";
import type { DismissedTime } from "../types.js";

export interface TimeWindow {
  start: TimeOfDay;
  end: TimeOfDay;
}

/** A busy stretch, and where the user is during it. */
export interface EngineBlock {
  start: LocalDateTime;
  end: LocalDateTime;
  location: Location;
}

/** A place a workout can happen, already filtered to the ones this user can use. */
export interface EnginePlace {
  id: string;
  location: Location;
  hours: OpeningHours;
}

export interface PlanInput {
  /** The Monday the week starts on; the plan covers Monday to Sunday. */
  weekStart: LocalDate;
  /** Confirmed busy stretches. */
  busyBlocks: readonly EngineBlock[];
  /** Whole days away: nothing is planned on them. */
  awayDays: readonly LocalDate[];
  /** Where the user starts and ends each day, and is when a block doesn't say. */
  home: Location;
  wakingStart: TimeOfDay;
  wakingEnd: TimeOfDay;
  weeklyTargetSessions: number;
  sessionMinutes: number;
  /** Times of day the user would rather work out; empty means no preference. */
  preferredWindows: readonly TimeWindow[];
  places: readonly EnginePlace[];
  /** Heavy week: aim for 2 short sessions instead of the usual target. */
  crunchMode: boolean;
  /** Times the user dismissed before, to avoid. */
  dismissed: readonly DismissedTime[];
  /**
   * Plan nothing that starts before this, so regenerating mid-week (as crunch
   * mode does) only changes the rest of the week; null plans the whole week.
   */
  planFrom: LocalDateTime | null;
  /** Slots that stay as they are (completed ones): they count toward the target and fill their day. */
  keptSlots: readonly PlannedSlot[];
}

export interface PlannedSlot {
  start: LocalDateTime;
  end: LocalDateTime;
  placeId: string;
  /** Walking there and back, in minutes. */
  travelMinutes: number;
  score: number;
}

export interface WeekPlan {
  /** In time order, at most one a day; includes the kept slots. */
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
