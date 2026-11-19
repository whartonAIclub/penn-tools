// Manual entry (section 8.1C of docs/outtake.md): one-off busy blocks the user
// adds by hand (recruiting events, coffee chats, parties that aren't in a
// timetable), and whole days away (a trek, travel), when nothing is planned.
//
// The user typed these themselves, so they're confirmed as they're made.

import { NO_ATTRIBUTES } from "../../attributes.js";
import { ZONES, type Zone } from "../../location.js";
import type { BusyBlock } from "../../schedule.js";
import { isLocalDate, isTimeOfDay, minutesOfDay, type LocalDate, type TimeOfDay } from "../../time.js";

export const MAX_LABEL_LENGTH = 80;

export interface QuickAdd {
  date: LocalDate;
  start: TimeOfDay;
  end: TimeOfDay;
  /** Optional, e.g. "Coffee chat". */
  label: string | null;
  /** Where they'll be, if they said; null when unknown (taken as home). */
  zone: Zone | null;
}

/** What's wrong with a quick-add, as messages for the user; empty when it's fine. */
export function checkQuickAdd(input: QuickAdd): string[] {
  const problems: string[] = [];
  if (!isLocalDate(input.date)) problems.push("Pick a date.");
  // A quick-add is within one day, so it can't end at midnight ("24:00").
  const times = [input.start, input.end].every((t) => typeof t === "string" && isTimeOfDay(t) && t !== "24:00");
  if (!times) problems.push("Enter start and end times, like 09:00 and 10:30.");
  else if (minutesOfDay(input.end) <= minutesOfDay(input.start)) problems.push("It has to end after it starts.");
  if (input.label !== null && (typeof input.label !== "string" || input.label.trim().length > MAX_LABEL_LENGTH)) {
    problems.push(`Keep the name to ${MAX_LABEL_LENGTH} characters.`);
  }
  if (input.zone !== null && !(ZONES as readonly string[]).includes(input.zone)) problems.push("Pick where you'll be from the list.");
  return problems;
}

/** Thrown when asked to make a block from a quick-add that checkQuickAdd rejects. */
export class InvalidQuickAddError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "InvalidQuickAddError";
  }
}

/** The busy block for a quick-add: confirmed, one-off. Throws InvalidQuickAddError if it isn't valid. */
export function quickAddBlock(input: QuickAdd): BusyBlock {
  const problems = checkQuickAdd(input);
  if (problems.length > 0) throw new InvalidQuickAddError(problems);
  return {
    id: `manual-${input.date}T${input.start}`,
    start: `${input.date}T${input.start}`,
    end: `${input.date}T${input.end}`,
    label: input.label?.trim() || null,
    source: "MANUAL",
    recurringWeekly: false,
    confidence: null,
    confirmed: true,
    zone: input.zone,
    attributes: NO_ATTRIBUTES,
  };
}

/** Why a date can't be marked away, for the user; null when it's fine. */
export function checkAwayDay(date: LocalDate): string | null {
  return isLocalDate(date) ? null : "Pick a date.";
}
