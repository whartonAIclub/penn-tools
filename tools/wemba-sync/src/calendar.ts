// ─────────────────────────────────────────────────────────────────────────────
// WEMBA Sync: a class weekend as a calendar file
//
// toICS() writes a weekend's items as an iCalendar (.ics) file, which Google
// Calendar, Outlook and Apple Calendar all import. Times on the schedule are
// Philadelphia's, so events carry TZID=America/New_York and the file defines
// that zone. Each event's UID comes from what it is, so importing the same
// weekend again updates events in calendars that track UIDs instead of
// duplicating them.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScheduleItem, WeekendSchedule } from "./schedule.js";

const TZID = "America/New_York";

// US Eastern time since 2007: daylight time from the second Sunday of March to
// the first Sunday of November.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Text as an iCalendar value: backslashes, semicolons, commas and newlines escaped. */
function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** A content line folded at 75 bytes, as iCalendar requires, never splitting a character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75.
    if (size + bytes > 75) {
      parts.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n");
}

/** A short, stable hash of `text` (FNV-1a), for UIDs. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date);
const isTime = (time: string | null): time is string => time !== null && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

/** "2026-11-13" as "20261113". */
const icsDate = (date: string) => date.replace(/-/g, "");

/** The day after a YYYY-MM-DD date, for an all-day event's end. */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** An hour after HH:MM, for items without an end time, capped at 23:59. */
function hourLater(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function event(item: ScheduleItem, stamp: string): string[] {
  const summary = item.signupOnly ? `${item.title} (if you signed up)` : item.title;
  const description = [
    item.course && item.course !== item.title ? item.course : null,
    item.instructor,
    item.section,
    item.notes,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:${hash([item.date, item.start, item.title, item.section].join("|"))}-${icsDate(item.date)}@wemba-sync.penntools`,
    `DTSTAMP:${stamp}`,
  ];
  if (isTime(item.start)) {
    // An end missing, malformed or not after the start: an hour, so the event shows.
    const end = isTime(item.end) && item.end > item.start ? item.end : hourLater(item.start);
    lines.push(
      `DTSTART;TZID=${TZID}:${icsDate(item.date)}T${item.start.replace(":", "")}00`,
      `DTEND;TZID=${TZID}:${icsDate(item.date)}T${end.replace(":", "")}00`,
    );
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(item.date)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(item.date))}`);
  }
  lines.push(`SUMMARY:${escapeText(summary)}`);
  if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push(`CATEGORIES:${item.kind.toUpperCase()}`, "END:VEVENT");
  return lines;
}

/**
 * The weekend's items as an .ics file. Pass the items to include, e.g. one
 * section's from itemsForSection; items with a malformed date are left out.
 * `now` stamps the events.
 */
export function toICS(schedule: WeekendSchedule, items: ScheduleItem[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PennTools//WEMBA Sync//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(schedule.title)}`,
    ...VTIMEZONE,
    ...items.filter((item) => isDate(item.date)).flatMap((item) => event(item, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A file name for the weekend's calendar, e.g. "wemba-weekend-2026-11-13-section-1.ics". */
export function icsFilename(items: ScheduleItem[], section: string | null): string {
  const first = items.find((item) => isDate(item.date))?.date;
  const slug = section?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return ["wemba-weekend", first, slug].filter(Boolean).join("-") + ".ics";
}
