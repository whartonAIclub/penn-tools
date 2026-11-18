// ─────────────────────────────────────────────────────────────────────────────
// Calendar import: a week of schedule blocks from an .ics file, such as one
// exported from Google Calendar. Runs in the browser, with no AI and no cost.
//
// Times are read in the browser's time zone. Recurring events (weekly classes)
// are expanded, including moved and cancelled occurrences; all-day events are
// skipped, since they don't block meal times.
// ─────────────────────────────────────────────────────────────────────────────

import ICAL from "ical.js";
import { byDayThenStart, MAX_SCHEDULE_BLOCKS, type Day, type ScheduleBlock } from "./schedule.js";
import { formatMinutes } from "./today.js";

/** About 5 MB: a few years of a busy calendar. */
export const MAX_ICS_LENGTH = 5_000_000;
// A cap on occurrences per recurring event, in case one repeats every minute.
const MAX_OCCURRENCES = 5000;

const JS_DAYS: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Monday 00:00, local time, of the week containing `date`. */
export function weekStart(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/**
 * The timed events in the week starting `start` (a Monday from weekStart), as
 * schedule blocks. Throws if `ics` isn't a calendar file.
 */
export function readIcs(ics: string, start: Date): ScheduleBlock[] {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const parsed = ICAL.parse(ics) as unknown[];
  const calendars = (Array.isArray(parsed[0]) ? parsed : [parsed]).map((jcal) => new ICAL.Component(jcal as never));
  if (!calendars.some((c) => c.name === "vcalendar")) throw new Error("Not a calendar file.");

  const masters = new Map<string, InstanceType<typeof ICAL.Event>>();
  const exceptions: InstanceType<typeof ICAL.Event>[] = [];
  for (const calendar of calendars) {
    for (const tz of calendar.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
    for (const vevent of calendar.getAllSubcomponents("vevent")) {
      const event = new ICAL.Event(vevent);
      if (event.isRecurrenceException()) exceptions.push(event);
      else masters.set(event.uid, event);
    }
  }
  for (const exception of exceptions) masters.get(exception.uid)?.relateException(exception);

  const blocks: ScheduleBlock[] = [];
  function add(from: Date, to: Date, event: InstanceType<typeof ICAL.Event>) {
    if (from >= end || to <= start) return;
    if (String(event.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    const startMinutes = from.getHours() * 60 + from.getMinutes();
    // An event running past midnight blocks the rest of its first day.
    const sameDay = from.toDateString() === to.toDateString();
    const endMinutes = sameDay ? to.getHours() * 60 + to.getMinutes() : 24 * 60 - 1;
    if (endMinutes <= startMinutes) return;
    blocks.push({
      day: JS_DAYS[from.getDay()]!,
      start: formatMinutes(startMinutes),
      end: formatMinutes(endMinutes),
      label: (event.summary ?? "").trim().slice(0, 80) || "Busy",
      location: shortLocation(event.location),
    });
  }

  for (const event of masters.values()) {
    if (event.startDate.isDate) continue; // all-day
    if (!event.isRecurring()) {
      add(event.startDate.toJSDate(), event.endDate.toJSDate(), event);
      continue;
    }
    const occurrences = event.iterator();
    for (let i = 0, next = occurrences.next(); next && i < MAX_OCCURRENCES; i++, next = occurrences.next()) {
      const details = event.getOccurrenceDetails(next);
      const from = details.startDate.toJSDate();
      if (from >= end) break;
      add(from, details.endDate.toJSDate(), details.item);
    }
  }

  const unique = new Map(blocks.map((b) => [`${b.day} ${b.start} ${b.end} ${b.label}`, b]));
  return [...unique.values()].sort(byDayThenStart).slice(0, MAX_SCHEDULE_BLOCKS);
}

/** "Jon M. Huntsman Hall, 3730 Walnut St, Philadelphia, PA" → "Jon M. Huntsman Hall"; blank → null. */
export function shortLocation(location: string | null | undefined): string | null {
  const first = (location ?? "").split(",")[0]!.trim();
  return first ? first.slice(0, 120) : null;
}
