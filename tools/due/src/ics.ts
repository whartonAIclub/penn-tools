// Building the calendar (.ics) file. Each deadline becomes one event with the
// student's reminders built in, which Google, Apple and Outlook calendars all
// keep on import. Reminders count back from the event's start, because Google
// can't remind after an event starts; an assignment's event ends at its due
// time, so its details say when it's due.
//
// Event IDs come from the course and title, so the same deadline gets the same
// ID in every download. Google rejects a whole file if any of its events is
// already in the calendar, so students update by deleting the Due calendar and
// importing the new file (see PLAN.md).

import { addDays, formatDate, formatTime, toMinutes } from "./dates.js";
import { deadlineProblem, resolveDate } from "./deadlines.js";
import type { CourseDetails, Deadline, ReminderSettings } from "./types.js";

const TIME_ZONE = "America/New_York";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TIME_ZONE}`,
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

/** How long an assignment's event is: it ends at the due time. */
const ASSIGNMENT_MINUTES = 30;
/** How long an exam's event is when it isn't at class time. */
const EXAM_MINUTES = 60;
const END_OF_DAY = 23 * 60 + 59;

/** The deadlines that are ticked and ready, as one calendar file. */
export function buildCalendar(
  course: CourseDetails,
  deadlines: Deadline[],
  reminders: ReminderSettings,
  now: Date = new Date(),
): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const usedIds = new Set<string>();
  const events = deadlines
    .filter((d) => d.include && deadlineProblem(d, course) === null)
    .flatMap((d) => eventLines(d, course, reminders, uniqueId(course, d, usedIds), stamp));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PennTools//Due//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...VTIMEZONE,
    ...events,
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** e.g. "due-fnce-6110.ics". */
export function calendarFileName(course: CourseDetails): string {
  return `due-${slug(course.name) || "course"}.ics`;
}

/** What the event is called in the calendar, e.g. "DUE: Problem Set 1 (FNCE 6110)". */
export function eventTitle(deadline: Deadline, course: CourseDetails): string {
  const prefix = deadline.kind === "exam" ? "EXAM" : "DUE";
  const name = course.name.trim();
  return `${prefix}: ${deadline.title.trim()}${name ? ` (${name})` : ""}`;
}

function eventLines(
  deadline: Deadline,
  course: CourseDetails,
  reminders: ReminderSettings,
  uid: string,
  stamp: string,
): string[] {
  const date = resolveDate(deadline, course)!; // ready deadlines always have one
  const summary = eventTitle(deadline, course);
  const { time } = deadline;
  const timing: string[] = [];
  const alarms: number[] = []; // minutes from the event's start
  let when: string;

  if (time.kind === "all-day") {
    when = `Due ${formatDate(date)} (all day)`;
    timing.push(
      `DTSTART;VALUE=DATE:${compactDate(date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(date, 1))}`,
      "TRANSP:TRANSPARENT", // doesn't mark the student busy
    );
    alarms.push(...reminders.allDayOffsets);
  } else {
    const at =
      time.kind === "class-time" ? toMinutes(course.classStart!) : time.kind === "end-of-day" ? END_OF_DAY : toMinutes(time.time);

    if (deadline.kind === "exam") {
      const classEnd = course.classEnd ? toMinutes(course.classEnd) : null;
      const end = time.kind === "class-time" && classEnd !== null && classEnd > at ? classEnd : at + EXAM_MINUTES;
      when = `Exam ${formatDate(date)}, ${formatTime(clock(at))} – ${formatTime(clock(end))}`;
      timing.push(
        `DTSTART;TZID=${TIME_ZONE}:${localDateTime(date, at)}`,
        `DTEND;TZID=${TIME_ZONE}:${localDateTime(date, end)}`,
      );
      alarms.push(...reminders.timedMinutesBefore.map((m) => -m));
    } else {
      when = `Due ${formatDate(date)} at ${formatTime(clock(at))}`;
      timing.push(
        `DTSTART;TZID=${TIME_ZONE}:${localDateTime(date, at - ASSIGNMENT_MINUTES)}`,
        `DTEND;TZID=${TIME_ZONE}:${localDateTime(date, at)}`,
        "TRANSP:TRANSPARENT",
      );
      // The event starts ASSIGNMENT_MINUTES before the due time, so "3 hours before
      // it's due" is 150 minutes before the event. Never after the event starts.
      alarms.push(...reminders.timedMinutesBefore.map((m) => -Math.max(m - ASSIGNMENT_MINUTES, 0)));
    }
  }

  const details = [when, `Course: ${course.name.trim() || "—"}`, "Added by Due on PennTools."].join("\n");
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(details)}`,
    ...timing,
    ...unique(alarms).flatMap((offset) => alarm(`${summary}: ${when}`, offset)),
    "END:VEVENT",
  ];
}

/** A reminder `offsetMinutes` from the event's start (negative for before). */
function alarm(text: string, offsetMinutes: number): string[] {
  const trigger = `${offsetMinutes < 0 ? "-" : ""}PT${Math.abs(offsetMinutes)}M`;
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(text)}`, `TRIGGER:${trigger}`, "END:VALARM"];
}

/** Minutes after midnight as "HH:MM", wrapping past midnight. */
function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** e.g. 2027-02-10 and 1335 minutes → "20270210T221500"; minutes past midnight roll over into the next day. */
function localDateTime(date: string, minutes: number): string {
  const dayShift = Math.floor(minutes / 1440);
  const rest = minutes - dayShift * 1440;
  const hh = String(Math.floor(rest / 60)).padStart(2, "0");
  const mm = String(rest % 60).padStart(2, "0");
  return `${compactDate(addDays(date, dayShift))}T${hh}${mm}00`;
}

function compactDate(date: string): string {
  return date.replace(/-/g, "");
}

function uniqueId(course: CourseDetails, deadline: Deadline, used: Set<string>): string {
  const base = `${slug(course.name) || "course"}-${slug(deadline.title) || "deadline"}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return `${id}@due.penntools.org`;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function unique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** Escapes text for an iCalendar value. */
function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Splits a line longer than 75 bytes, as the iCalendar format requires. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = utf8Length(char);
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}
