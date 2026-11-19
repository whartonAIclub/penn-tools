// "Now" for exercise planning: New York local time, wherever the code runs (a
// server in UTC, a student abroad), as the rest of the schedule is.

import { isLocalDate, weekdayOf, WEEKDAYS, type LocalDate, type LocalDateTime } from "../time.js";

const newYorkClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The New York local date and time of an instant (now by default). */
export function newYorkNow(at: Date = new Date()): LocalDateTime {
  const parts = Object.fromEntries(newYorkClock.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** The date a number of days from another. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Monday of the week a date is in. */
export function mondayOf(date: LocalDate): LocalDate {
  if (!isLocalDate(date)) throw new RangeError(`Not a date: ${date}`);
  return addDays(date, -WEEKDAYS.indexOf(weekdayOf(date)));
}
