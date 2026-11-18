// The gap finder (section 8.3, step 1 of docs/outtake.md): the free windows in
// each day's waking hours, and the places a session fits in each one.
//
// A gap is usable at a place if the place is open for the whole session and
// the gap leaves room to walk there and back:
// gap length >= travel there + session + travel back.

import type { Location } from "../../location.js";
import { minutesOfDay, weekdayOf, type LocalDate, type LocalDateTime, type TimeOfDay } from "../../time.js";
import { ENGINE_CONFIG, type TravelConfig } from "./config.js";
import { walkingMinutes } from "./travel.js";
import type { EnginePlace, WorkoutPlanInput } from "./types.js";

const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86_400_000;

/** A free window on one day, within waking hours. */
export interface Gap {
  date: LocalDate;
  start: TimeOfDay;
  /** May be "24:00" if the user is awake until midnight. */
  end: TimeOfDay;
  /** Where the user is when it starts: at the block just before it, or home if it starts the day. */
  from: Location;
  /** Where the user has to be when it ends: at the block just after it, or home if it ends the day. */
  to: Location;
  /** True when a commitment starts as it ends; false when it runs to the end of the day. */
  beforeBlock: boolean;
}

/** A place a session fits in a gap. */
export interface PlaceOption {
  placeId: string;
  /** Walking minutes from the gap's start location to the place. */
  travelTo: number;
  /** Walking minutes from the place to the gap's end location. */
  travelBack: number;
  /** The session can start at any time from earliestStart to latestStart. */
  earliestStart: TimeOfDay;
  latestStart: TimeOfDay;
}

export type GapInput = Pick<WorkoutPlanInput, "weekStart" | "busyBlocks" | "awayDays" | "home" | "wakingStart" | "wakingEnd">;

function utcDay(date: LocalDate): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

function dateAfter(start: LocalDate, days: number): LocalDate {
  return new Date(utcDay(start) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Minutes from midnight at the start of the week; negative before it. */
function minuteOfWeek(weekStart: LocalDate, time: LocalDateTime): number {
  const days = Math.round((utcDay(time.slice(0, 10)) - utcDay(weekStart)) / MS_PER_DAY);
  return days * MINUTES_PER_DAY + minutesOfDay(time.slice(11));
}

/** "07:30" from 450. */
export function formatTimeOfDay(minutes: number): TimeOfDay {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Every free window in the week's waking hours, in time order. Away days have
 * none. Overlapping and back-to-back blocks count as one busy stretch, and a
 * block running past midnight carries into the next day.
 */
export function findGaps(input: GapInput): Gap[] {
  const wakingStart = minutesOfDay(input.wakingStart);
  const wakingEnd = minutesOfDay(input.wakingEnd);
  const blocks = input.busyBlocks
    .map((block) => ({
      start: minuteOfWeek(input.weekStart, block.start),
      end: minuteOfWeek(input.weekStart, block.end),
      location: block.location,
    }))
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const gaps: Gap[] = [];
  for (let day = 0; day < 7; day++) {
    const date = dateAfter(input.weekStart, day);
    if (input.awayDays.includes(date)) continue;

    const dayStart = day * MINUTES_PER_DAY + wakingStart;
    const dayEnd = day * MINUTES_PER_DAY + wakingEnd;
    const gap = (start: number, end: number, from: Location, to: Location | null): Gap => ({
      date,
      start: formatTimeOfDay(start - day * MINUTES_PER_DAY),
      end: formatTimeOfDay(end - day * MINUTES_PER_DAY),
      from,
      to: to ?? input.home,
      beforeBlock: to !== null,
    });

    // Walk the day's blocks in order; cursor is when the user is next free.
    let cursor = dayStart;
    let from = input.home;
    for (const block of blocks.filter((b) => b.start < dayEnd && b.end > dayStart)) {
      if (block.start > cursor) gaps.push(gap(cursor, block.start, from, block.location));
      if (block.end >= cursor) {
        cursor = block.end;
        from = block.location;
      }
    }
    if (cursor < dayEnd) gaps.push(gap(cursor, dayEnd, from, null));
  }
  return gaps;
}

/**
 * The places a session of sessionMinutes fits in the gap, least total walking
 * first; empty when the gap isn't usable anywhere.
 */
export function placeOptions(
  gap: Gap,
  places: readonly EnginePlace[],
  sessionMinutes: number,
  config: TravelConfig = ENGINE_CONFIG.travel,
): PlaceOption[] {
  const gapStart = minutesOfDay(gap.start);
  const gapEnd = minutesOfDay(gap.end);
  const weekday = weekdayOf(gap.date);

  const options: PlaceOption[] = [];
  for (const place of places) {
    const hours = place.hours[weekday];
    if (!hours) continue;
    const travelTo = walkingMinutes(gap.from, place.location, config);
    const travelBack = walkingMinutes(place.location, gap.to, config);
    const earliest = Math.max(gapStart + travelTo, minutesOfDay(hours.open));
    const latest = Math.min(gapEnd - travelBack, minutesOfDay(hours.close)) - sessionMinutes;
    if (latest < earliest) continue;
    options.push({
      placeId: place.id,
      travelTo,
      travelBack,
      earliestStart: formatTimeOfDay(earliest),
      latestStart: formatTimeOfDay(latest),
    });
  }
  // A stable sort, so ties keep the places' order and the result is the same every time.
  return options.sort((a, b) => a.travelTo + a.travelBack - (b.travelTo + b.travelBack));
}
