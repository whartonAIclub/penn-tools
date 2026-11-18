// Dates and times shared by both halves. Everything is New York local time
// (America/New_York), written as strings so values pass through server actions,
// JSON and the database unchanged, and the planning engine never does time-zone math.

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** "HH:MM", 24-hour. "24:00" is allowed only as the end of a day. */
export type TimeOfDay = string;
/** "YYYY-MM-DD". */
export type LocalDate = string;
/** "YYYY-MM-DDTHH:MM", New York local time. */
export type LocalDateTime = string;

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isTimeOfDay(value: string): boolean {
  return TIME_RE.test(value);
}

/** Minutes since midnight: "07:30" is 450, "24:00" is 1440. */
export function minutesOfDay(time: TimeOfDay): number {
  if (!isTimeOfDay(time)) throw new RangeError(`Not a time of day: ${time}`);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** True for a real calendar date ("2026-02-30" is not). */
export function isLocalDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isLocalDateTime(value: string): boolean {
  const [date, time, ...rest] = value.split("T");
  return rest.length === 0 && date !== undefined && time !== undefined && isLocalDate(date) && isTimeOfDay(time) && time !== "24:00";
}

/** The weekday a date falls on. */
export function weekdayOf(date: LocalDate): Weekday {
  if (!isLocalDate(date)) throw new RangeError(`Not a date: ${date}`);
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  // getUTCDay: 0 is Sunday; WEEKDAYS starts on Monday.
  return WEEKDAYS[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7]!;
}
