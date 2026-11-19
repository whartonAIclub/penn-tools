// New York wall time for Handoff's engine (C-DESIGN.md §5.2).
// Every naive "YYYY-MM-DDTHH:MM" string in Handoff (event times, transfer deadlines, train departures, pickup times) means
// America/New_York wall time: on the server, which runs in UTC, and in every browser, whatever its own time zone. A date
// alone ("YYYY-MM-DD") means 23:59 that day (index.js's at). This module turns those strings into instants, and instants
// back into New York dates and times, with Intl and Date.UTC only: never the machine's local time.
// Plain JavaScript with no imports, so the browser and the server run the same code. Typed by time.d.ts.

export const NY_TZ = "America/New_York";

const DAY_MS = 24 * 3600e3;
/** The largest instant a Date can hold (ms from the epoch, either way). */
const MAX_MS = 8.64e15;
const FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
});
const pad = x => String(x).padStart(2, "0");

/** The New York calendar date and wall-clock time at an instant: month 1–12, hour 0–23, weekday 0 (Sunday) to 6.
    Every field is NaN for an instant that isn't a finite date, so formatting an unreadable date never throws. */
export function nyParts(ms) {
  const p = { year: NaN, month: NaN, day: NaN, hour: NaN, minute: NaN, second: NaN, weekday: NaN };
  if (typeof ms !== "number" || !Number.isFinite(ms) || Math.abs(ms) > MAX_MS) return p;
  for (const { type, value } of FORMAT.formatToParts(ms)) if (type !== "weekday" && type in p) p[type] = Number(value);
  if (p.hour === 24) p.hour = 0; // older engines print midnight as 24 even with h23
  p.weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return p;
}

/** New York's offset from UTC at an instant, in ms: −5 hours in winter (EST), −4 in summer (EDT). */
function offsetAt(ms) {
  const p = nyParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
function parseWall(wall) {
  const m = WALL.exec(wall);
  if (!m) return NaN;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = m[6] === undefined ? 0 : +m[6];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return NaN; // Date.UTC reads years 0–99 as 1900s
  const w = Date.UTC(y, mo - 1, d, h, mi, s); // the wall time read as if it were UTC
  if (new Date(w).getUTCDate() !== d) return NaN; // Feb 30 and the like
  // The offsets in force a day either side: equal unless the clocks change near this time.
  const before = offsetAt(w - DAY_MS), after = offsetAt(w + DAY_MS);
  const a = w - before, b = w - after; // the instant this wall time names under each offset
  if (before === after) return a;
  const aReal = offsetAt(a) === before, bReal = offsetAt(b) === after;
  if (aReal && bReal) return Math.min(a, b); // the clocks fell back and this time happens twice: the first one
  if (aReal) return a;
  if (bReal) return b;
  return a; // the clocks sprang forward over this time: the same moment an hour later (2:30 AM is 3:30 AM EDT)
}

const memo = new Map();
const MEMO_MAX = 10000;
/** The instant a New York wall time names: "2026-11-12T19:00" is 7 PM in Philadelphia, which is 00:00 UTC on Nov 13.
    Takes "YYYY-MM-DDTHH:MM", optionally with ":SS". Anything else (a date alone, an impossible date, extra text) is NaN,
    as an unreadable date always was. Daylight saving resolves the same way every time: a time the clocks skip
    (2:00–2:59 AM on the spring-forward day) moves an hour later, and a time that happens twice (1:00–1:59 AM on the
    fall-back day) is the first of the two. Memoized per string (the memo is cleared when it grows past 10,000). */
export function wallToMs(wall) {
  if (typeof wall !== "string") return NaN;
  let ms = memo.get(wall);
  if (ms === undefined) {
    ms = parseWall(wall);
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(wall, ms);
  }
  return ms;
}

/** The New York date at an instant, as "YYYY-MM-DD" ("NaN-NaN-NaN" for an unreadable instant, as before). */
export function nyIsoDate(ms) {
  const p = nyParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
