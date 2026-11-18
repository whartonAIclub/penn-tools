// Slot scoring (section 8.3, step 2 of docs/outtake.md): points for one
// candidate slot on its own. Spacing between slots depends on which others are
// picked, so the weekly plan (plan.ts) adds it.

import { minutesOfDay, weekdayOf, type LocalDate } from "../../time.js";
import type { ScoringConfig } from "./config.js";
import type { PlanInput } from "./types.js";

export interface SlotToScore {
  date: LocalDate;
  /** Minutes since midnight. */
  start: number;
  end: number;
  /** Walking there and back. */
  travelMinutes: number;
  /** Minutes from the slot's end to the next commitment that day; null when nothing follows. */
  minutesToNext: number | null;
}

/** Each part of a slot's score, and their total; for the engine review's breakdowns. */
export interface ScoreParts {
  preferredTime: number;
  travel: number;
  buffer: number;
  dismissed: number;
  total: number;
}

export type ScoringInput = Pick<PlanInput, "preferredWindows" | "dismissed" | "crunchMode">;

export function scoreSlot(slot: SlotToScore, input: ScoringInput, config: ScoringConfig): ScoreParts {
  const length = slot.end - slot.start;
  const overlap = (start: number, end: number) => Math.max(0, Math.min(slot.end, end) - Math.max(slot.start, start));

  let preferredTime = 0;
  if (input.preferredWindows.length > 0) {
    const inside = input.preferredWindows.reduce((sum, w) => sum + overlap(minutesOfDay(w.start), minutesOfDay(w.end)), 0);
    preferredTime = (config.preferredTime * Math.min(length, inside)) / length;
  }

  const perMinute = input.crunchMode ? config.crunchTravelPerMinute : config.travelPerMinute;
  const travel = 0 - perMinute * slot.travelMinutes;

  const buffer = slot.minutesToNext !== null && slot.minutesToNext < config.bufferMinutes ? -config.buffer : 0;

  const weekday = weekdayOf(slot.date);
  const wasDismissed = input.dismissed.some(
    (time) => time.weekday === weekday && overlap(minutesOfDay(time.start), minutesOfDay(time.end)) > 0,
  );
  const dismissed = wasDismissed ? -config.dismissed : 0;

  return { preferredTime, travel, buffer, dismissed, total: preferredTime + travel + buffer + dismissed };
}
