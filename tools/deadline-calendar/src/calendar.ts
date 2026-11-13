// ─────────────────────────────────────────────────────────────────────────────
// Deadlines as a calendar file
//
// buildCalendar turns the student's (fixed) deadlines into an iCalendar (.ics)
// file that Google Calendar, Apple Calendar and Outlook import. The page builds
// it in the browser, so this file imports no runtime code: it's exported on
// its own as "@penntools/tool-deadline-calendar/calendar", without the zod
// schema extract.ts brings.
//
// Timed events (an exam from 8 to 10am) keep their hours, in Philadelphia
// time. A deadline with only a due time becomes an all-day event on its date,
// with the time in its description, since an event at 11:59pm is a sliver at
// the bottom of the day that's easy to miss. Undated deadlines are left out.
// Each event's description says what it's worth, from the class's grading.
// ─────────────────────────────────────────────────────────────────────────────

import type { Deadline, GradingCategory } from "./extract.js";

/** One class's deadlines and grading, as the page holds them after the student's fixes. */
export interface CalendarCourse {
  course: string | null;
  deadlines: Deadline[];
  grading: GradingCategory[];
}

const TIME_ZONE = "America/New_York";

// Philadelphia's time zone, as RFC 5545 asks a file to define any TZID it
// uses: daylight time from the second Sunday of March to the first Sunday of
// November (the US rules since 2007).
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:20070311T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:20071104T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Text as an iCalendar TEXT value: backslashes, semicolons, commas and newlines escaped. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * The line folded as RFC 5545 asks: at most 75 bytes of UTF-8 per line, each
 * continuation starting with a space. Splits between characters, never inside one.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = lines.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      lines.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  lines.push(current);
  return lines.join("\r\n ");
}

/** "20261008" from "2026-10-08". */
function compactDate(date: string): string {
  return date.replace(/-/g, "");
}

/** The day after `date` (YYYY-MM-DD), compact: an all-day event's DTEND, which is exclusive. */
function nextDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, "");
}

/** "20261008T080000" from a date and an HH:MM time. */
function localDateTime(date: string, time: string): string {
  return `${compactDate(date)}T${time.replace(":", "")}00`;
}

/** "11:59pm" from "23:59". */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours! < 12 ? "am" : "pm";
  const hour12 = hours! % 12 === 0 ? 12 : hours! % 12;
  return minutes === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minutes).padStart(2, "0")}${suffix}`;
}

/** "ACCT 6130" from "ACCT 6130: Fundamentals of Financial and Managerial Accounting". */
export function courseCode(course: string | null): string | null {
  if (!course) return null;
  return course.split(":")[0]!.trim() || null;
}

/** Lowercase letters and digits joined by hyphens, for UIDs. */
function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "x"
  );
}

/** "ACCT 6130: Midterm exam", or "Midterm exam" without a course. */
export function eventTitle(course: string | null, deadline: Deadline): string {
  const code = courseCode(course);
  return `${code ? `${code}: ` : ""}${deadline.title}`;
}

/** "2%", "1.4%" or "18.8%". */
function formatPercent(percent: number): string {
  return `${Math.round(percent * 10) / 10}%`;
}

/**
 * What the deadline is worth, from the class's grading: its share of the
 * grade, how many in its category are dropped, and every category's share.
 * An item's share is its category's divided among the items that count, so
 * with 2 of 7 quizzes dropped, each quiz is 10% ÷ 5 = 2% (if it counts).
 * Lines whose numbers the syllabus doesn't give are left out.
 */
export function gradeLines(grading: GradingCategory[], deadline: Deadline): string[] {
  if (grading.length === 0) return [];
  const lines: string[] = [];
  const name = deadline.category?.trim().toLowerCase();
  const category = name ? grading.find((g) => g.category.trim().toLowerCase() === name) : undefined;

  if (category) {
    const { percent, count, counted } = category;
    const items = counted ?? count;
    if (items === null) lines.push(`Worth: part of ${category.category} (${formatPercent(percent)} of your grade)`);
    else lines.push(`Worth: ${formatPercent(percent / items)} of your grade`);

    if (count !== null && counted !== null && counted < count) {
      lines.push(`Dropped: ${count - counted} of ${count} (your best ${counted} count)`);
    } else if (count === 1) {
      lines.push("Dropped: none");
    } else if (count !== null && counted === count) {
      lines.push(`Dropped: none, all ${count} count`);
    }
  }

  lines.push(`Grading: ${grading.map((g) => `${g.category} ${formatPercent(g.percent)}`).join(" · ")}`);
  return lines;
}

function eventDescription(course: CalendarCourse, deadline: Deadline): string {
  const lines: string[] = [];
  if (deadline.time && !deadline.endTime) lines.push(`Due ${formatTime(deadline.time)} ET`);
  lines.push(...gradeLines(course.grading, deadline));
  if (deadline.section) lines.push(`Section: ${deadline.section}`);
  if (course.course) lines.push("", course.course);
  lines.push("From your syllabus, via Penn Tools Deadline Calendar. Check Canvas for any changes.");
  return lines.join("\n");
}

/** DTSTAMP's UTC form: "20261113T150405Z". */
function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** How many of the courses' deadlines go in the calendar: the dated ones. */
export function calendarEventCount(courses: CalendarCourse[]): number {
  return courses.reduce((sum, c) => sum + c.deadlines.filter((d) => d.date !== null).length, 0);
}

/** A file name for one class's calendar: "acct-6130-deadlines.ics". */
export function calendarFileName(course: string | null): string {
  const code = courseCode(course);
  return code ? `${slug(code)}-deadlines.ics` : "deadlines.ics";
}

/**
 * The courses' dated deadlines as an .ics file, lines ending in CRLF. `name`
 * is the calendar's name, which Apple Calendar offers for a new calendar.
 *
 * Each event's UID comes from its course, section and title, not its date, so
 * importing again after fixing a date updates the event in calendars that
 * match on UID instead of adding a second one. A class's own file has the same
 * UIDs as the all-classes file, so mixing the two doesn't duplicate events.
 */
export function buildCalendar(courses: CalendarCourse[], now: Date = new Date(), name = "Deadline Calendar"): string {
  const stamp = utcStamp(now);
  const usedUids = new Set<string>();
  const events: string[] = [];

  for (const calendarCourse of courses) {
    const { course, deadlines } = calendarCourse;
    for (const deadline of deadlines) {
      if (deadline.date === null) continue;

      // Same-named deadlines in one class get "--2", "--3": a double hyphen, which slugs never contain.
      const base = [courseCode(course) ?? "course", deadline.section, deadline.title].filter(Boolean).map((part) => slug(part!)).join("-");
      let uid = `${base}@deadline-calendar.penntools`;
      for (let n = 2; usedUids.has(uid); n++) uid = `${base}--${n}@deadline-calendar.penntools`;
      usedUids.add(uid);

      const timed = deadline.time !== null && deadline.endTime !== null;
      events.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        ...(timed
          ? [
              `DTSTART;TZID=${TIME_ZONE}:${localDateTime(deadline.date, deadline.time!)}`,
              `DTEND;TZID=${TIME_ZONE}:${localDateTime(deadline.date, deadline.endTime!)}`,
            ]
          : [`DTSTART;VALUE=DATE:${compactDate(deadline.date)}`, `DTEND;VALUE=DATE:${nextDay(deadline.date)}`]),
        `SUMMARY:${escapeText(eventTitle(course, deadline))}`,
        `DESCRIPTION:${escapeText(eventDescription(calendarCourse, deadline))}`,
        // All-day deadlines shouldn't show the student as busy all day.
        `TRANSP:${timed ? "OPAQUE" : "TRANSPARENT"}`,
        "END:VEVENT",
      );
    }
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Penn Tools//Deadline Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    ...VTIMEZONE,
    ...events,
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
