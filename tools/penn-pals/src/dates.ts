// "Today" for Penn Pals is the user's own date: the one on their device, which
// may be any time zone (a summer internship, a semester abroad, a trip). The
// server runs in UTC, so it never works the date out itself; it takes the
// browser's, checked.

import { addDays, isDate } from "./debrief.js";

/** Today on this device (its own time zone) as YYYY-MM-DD. Call it in the browser. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The date a server should use for "today": the one the browser sent if it's a
 * real YYYY-MM-DD within a day of the server's UTC date (time zones run from
 * UTC-12 to UTC+14, so the user's date is never further off than that), else
 * the server's UTC date.
 */
export function resolveToday(claimed: unknown, now: Date = new Date()): string {
  const utc = now.toISOString().slice(0, 10);
  if (typeof claimed !== "string" || !isDate(claimed)) return utc;
  return claimed === utc || claimed === addDays(utc, -1) || claimed === addDays(utc, 1) ? claimed : utc;
}
