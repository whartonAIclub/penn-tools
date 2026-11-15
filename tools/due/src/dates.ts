// Date and time helpers. Dates are "YYYY-MM-DD" strings and the math runs in
// UTC, so the computer's own time zone can never shift a deadline by a day.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDate(value: string | null): value is string {
  return value !== null && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function isTime(value: string | null): value is string {
  return value !== null && TIME.test(value);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

export function mondayOf(date: string): string {
  return addDays(date, 1 - weekdayOf(date));
}

/** "HH:MM" as minutes after midnight. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** e.g. "Wed, Feb 10". */
export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** e.g. "10:15 AM". */
export function formatTime(time: string): string {
  const minutes = toMinutes(time);
  const hours = Math.floor(minutes / 60);
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}
