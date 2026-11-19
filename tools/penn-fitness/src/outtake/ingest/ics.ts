// .ics ingestion (section 8.1A of docs/outtake.md): a calendar file's events
// in one week, as the shared schedule's busy blocks.
//
// Reading the file is Nutrition's readIcs (../../nutrition/calendarImport.ts),
// which expands recurring events (with moved and cancelled occurrences) and
// skips all-day ones; this file builds on it rather than parsing calendars a
// second time. It adapts what readIcs gives:
// - readIcs works in the computer's time zone; these blocks are New York time
//   wherever this runs, as the engine needs.
// - readIcs keeps locations; the schedule never stores them (privacy), only
//   the area they're in (campus or Center City), when the location says.
// - Overlapping events become one block.
// Blocks are that week's events (recurringWeekly false), unconfirmed until the
// user reviews them.
//
// Run it in the browser, as Nutrition's import does. readIcs cuts an event at
// the first midnight it crosses in the computer's time zone, and only gives
// times of day, so off New York time (a server in UTC, a student abroad) an
// evening event can come back cut short. importIcs can't recover the real end,
// so it warns instead, and the user fixes it on the review screen.

import { NO_ATTRIBUTES } from "../../attributes.js";
import type { Area } from "../../location.js";
import { readIcs } from "../../nutrition/calendarImport.js";
import type { BusyBlock } from "../../schedule.js";
import { isLocalDate, type LocalDate, type LocalDateTime } from "../../time.js";

const NEW_YORK = "America/New_York";
const DAY_OFFSETS = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 } as const;
const MAX_LABEL_LENGTH = 80;

/** Campus buildings and places students name in calendar locations. */
const CAMPUS_WORDS =
  /\b(huntsman|jmhh|wharton|steinberg|dietrich|vance hall|penn|upenn|locust walk|houston hall|van pelt|perelman|irvine|college hall|williams hall|fisher|towne|levine|meyerson|pottruck|franklin field|palestra|university city)\b/i;
const CENTER_CITY_WORDS = /\b(rittenhouse|center city|centre city|old city|logan square|fitler square)\b/i;
/** "3730 Walnut St": a house number on one of the main east-west streets. */
const ADDRESS = /\b(\d{3,4})\s+(?:market|chestnut|walnut|locust|spruce|pine|sansom|lombard|south|baltimore)\b/i;
/** "S 33rd St", "33rd & Walnut": a numbered street. */
const NUMBERED_STREET = /\b(\d{1,2})(?:st|nd|rd|th)\b/i;

/**
 * The area a calendar location is in, or null when it doesn't say. West of
 * the Schuylkill (house numbers 3000+, streets past 26th) is around campus;
 * east of it is Center City, as in ../../location.ts.
 */
export function areaOfLocation(location: string | null): Area | null {
  if (!location) return null;
  if (CAMPUS_WORDS.test(location)) return "CAMPUS";
  if (CENTER_CITY_WORDS.test(location)) return "CENTER_CITY";
  const address = ADDRESS.exec(location);
  if (address) {
    const number = Number(address[1]);
    if (number >= 3000 && number < 5000) return "CAMPUS";
    if (number < 2700) return "CENTER_CITY";
  }
  const street = NUMBERED_STREET.exec(location);
  if (street) {
    const n = Number(street[1]);
    if (n >= 27 && n <= 49) return "CAMPUS";
    if (n >= 1 && n <= 26) return "CENTER_CITY";
  }
  return null;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const newYorkClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: NEW_YORK,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A wall-clock time in this computer's time zone, as New York local time. */
function toNewYork(date: LocalDate, time: string): LocalDateTime {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const parts = Object.fromEntries(newYorkClock.formatToParts(new Date(y, m - 1, d, hh, mm)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

interface Stretch {
  start: LocalDateTime;
  end: LocalDateTime;
  labels: string[];
  areas: (Area | null)[];
}

export interface IcsImport {
  blocks: BusyBlock[];
  /** Things the user should check on the review screen; empty when there are none. */
  warnings: string[];
}

/** readIcs's end time for an event it cut at midnight. */
const CUT_AT_MIDNIGHT = "23:59";

export const CUT_SHORT_WARNING =
  "This computer isn't on New York time, so evening events may have been cut short. Check their end times before you confirm.";

/**
 * The timed events in the week starting `weekStart` (a Monday), as unconfirmed
 * busy blocks in New York time, overlapping ones merged. Throws if `ics` isn't
 * a calendar file.
 */
export function importIcs(ics: string, weekStart: LocalDate): IcsImport {
  if (!isLocalDate(weekStart)) throw new RangeError(`Not a date: ${weekStart}`);
  const [y, m, d] = weekStart.split("-").map(Number) as [number, number, number];
  const weekEnd = addDays(weekStart, 7);

  const read = readIcs(ics, new Date(y, m - 1, d));
  const offNewYorkTime = toNewYork(weekStart, "12:00") !== `${weekStart}T12:00`;
  const warnings = offNewYorkTime && read.some((block) => block.end === CUT_AT_MIDNIGHT) ? [CUT_SHORT_WARNING] : [];

  const stretches: Stretch[] = read
    .map((block) => {
      const date = addDays(weekStart, DAY_OFFSETS[block.day]);
      return {
        start: toNewYork(date, block.start),
        end: toNewYork(date, block.end),
        labels: [block.label],
        areas: [areaOfLocation(block.location)],
      };
    })
    .filter((s) => s.start >= weekStart && s.start < weekEnd && s.end > s.start)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  // Merge events that overlap (ones that only touch stay separate).
  const merged: Stretch[] = [];
  for (const stretch of stretches) {
    const last = merged.at(-1);
    if (last && stretch.start < last.end) {
      if (stretch.end > last.end) last.end = stretch.end;
      last.labels.push(...stretch.labels);
      last.areas.push(...stretch.areas);
    } else {
      merged.push({ ...stretch, labels: [...stretch.labels], areas: [...stretch.areas] });
    }
  }

  const blocks = merged.map((stretch, index): BusyBlock => {
    const labels = [...new Set(stretch.labels)];
    const areas = new Set(stretch.areas);
    return {
      id: `ics-${stretch.start}-${index}`,
      start: stretch.start,
      end: stretch.end,
      label: labels.join(" / ").slice(0, MAX_LABEL_LENGTH),
      source: "ICS",
      recurringWeekly: false,
      confidence: null,
      confirmed: false,
      // Where the user is, when every merged event agrees; unknown otherwise.
      zone: areas.size === 1 ? [...areas][0]! : null,
      attributes: NO_ATTRIBUTES,
    };
  });
  return { blocks, warnings };
}
