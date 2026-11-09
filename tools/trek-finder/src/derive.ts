// Values worked out from dates instead of stored: today's date, a trip's
// current price stage and its status. Dates are YYYY-MM-DD strings, so they
// compare as plain text. Only todayInNewYork reads the clock, so everything
// else can be tested with any date.

import type { PriceStage, Trip } from "./trips.js";

/** past: started on or before today. prelim_passed: preliminary deadline before today. */
export type TripStatus = "past" | "prelim_passed" | "open";

/** Today's date in America/New_York, as YYYY-MM-DD. */
export function todayInNewYork(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The stage in effect today: of the stages whose dates include today (both
 * ends included, a missing date meaning no bound), the one with the highest
 * position. Stages without dates always count, so when no stage has dates the
 * latest one entered wins. Null when no stage covers today, which shows as TBD.
 */
export function currentPriceStage(stages: readonly PriceStage[], today: string): PriceStage | null {
  let current: PriceStage | null = null;
  for (const stage of stages) {
    const started = stage.validFrom === null || stage.validFrom <= today;
    const notEnded = stage.validUntil === null || today <= stage.validUntil;
    if (started && notEnded && (current === null || stage.position > current.position)) current = stage;
  }
  return current;
}

/** Where a trip stands today. Deadline times are ignored: a deadline passes the day after it's due. */
export function tripStatus(trip: Trip, today: string): TripStatus {
  if (trip.startDate <= today) return "past";
  const preliminary = trip.deadlines.find((d) => d.kind === "preliminary");
  if (preliminary && preliminary.dueDate < today) return "prelim_passed";
  return "open";
}
