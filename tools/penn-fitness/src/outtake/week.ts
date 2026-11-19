// One week of exercise, assembled from what's stored: the timeline the review
// screen shows, the plan the engine suggests for it, and a short summary for
// the Penn Fitness homepage card. Pure: the app loads the stored data and
// passes it in, with the time now.

import type { Place } from "../places.js";
import type { AwayDay, BusyBlock } from "../schedule.js";
import type { SharedPrefs } from "../sharedPrefs.js";
import { minutesOfDay, type LocalDate, type LocalDateTime, type TimeOfDay } from "../time.js";
import { addDays } from "./clock.js";
import { ENGINE_CONFIG } from "./engine/config.js";
import { findGaps, placeOptions } from "./engine/gaps.js";
import { planWeek } from "./engine/plan.js";
import { walkingMinutes } from "./engine/travel.js";
import type { WeekPlan, WorkoutPlanInput } from "./engine/types.js";
import { tunedConfig } from "./checkIn.js";
import { weekTimeline, timelineBlocks, type WeekTimeline } from "./ingest/timeline.js";
import { buildPlanInput } from "./planInput.js";
import type { OuttakePrefs } from "./prefs.js";

/** Free time shorter than this isn't worth pointing out. */
export const SHORTEST_GAP_WORTH_SHOWING = 20;

export interface ExerciseSummary {
  weekStart: LocalDate;
  /** Commitments in the week's timeline, and how many still need the user to confirm them. */
  commitments: number;
  toConfirm: number;
  /** The suggested plan: how many sessions fit against the target, and why not all when they don't. */
  sessions: number;
  target: number;
  reason: string | null;
  /** The first suggested session from now on, or null. */
  nextUp: { start: LocalDateTime; end: LocalDateTime; placeName: string; travelMinutes: number } | null;
  busyness: number;
  isBusy: boolean;
  /** Today's longest free stretch from now, in waking hours; null if none is long enough, or today isn't in the week. */
  todaysGap: { start: TimeOfDay; minutes: number } | null;
  /** Every free stretch left today worth showing, in order. */
  todaysGaps: FreeStretch[];
  /** Today's free stretches, or, once none are left, the next day's that has some; null when the week has none left. */
  freeSoon: { date: LocalDate; stretches: FreeStretch[] } | null;
  /** Each day of the week, Monday first. */
  days: ExerciseDay[];
  /** The closest places to work out, from home, nearest first (up to 3), with their kind (gym, pool, court...). */
  nearby: { placeId: string; placeName: string; kind: string; walkMinutes: number }[];
  /** The user has given their nearest corner, so walking times are real rather than by area. */
  homeCornerSet: boolean;
  /** The user's waking hours, the span a day is drawn over. */
  waking: { start: TimeOfDay; end: TimeOfDay };
  /** Things worth knowing about the week, most useful first (up to 4); the page words them. */
  tips: WeekTip[];
}

export interface FreeStretch {
  date: LocalDate;
  start: TimeOfDay;
  end: TimeOfDay;
  minutes: number;
  /** What the stretch has room for, walking there and back included (the engine's placeOptions). */
  fits: StretchFit;
}

/** A full session of the user's length, a short one (SHORT_SESSION_MINUTES), or just a break. */
export type StretchFit =
  | { kind: "workout" | "short"; minutes: number; placeName: string; travelMinutes: number }
  | { kind: "break" };

/** The shortest session worth suggesting in a stretch too short for a full one. */
export const SHORT_SESSION_MINUTES = 20;

export interface ExerciseDay {
  date: LocalDate;
  away: boolean;
  /** Before today. */
  past: boolean;
  /** Waking minutes taken by commitments, and left free. */
  busyMinutes: number;
  freeMinutes: number;
  /** When the day's first confirmed commitment starts; null when there's none. */
  firstCommitment: TimeOfDay | null;
  /** The day's busy stretches within waking hours, in order: for drawing the day. */
  busyStretches: { start: TimeOfDay; end: TimeOfDay }[];
  /** The suggested workout that day, if any. */
  workout: { start: LocalDateTime; end: LocalDateTime; placeName: string; travelMinutes: number } | null;
}

/** About time, never effort or guilt (docs/outtake.md, section 3). */
export type WeekTip =
  | { kind: "setHome" }
  | { kind: "heavyWeek"; percentBooked: number }
  | { kind: "lightestDay"; date: LocalDate; freeMinutes: number }
  | { kind: "longestStretch"; stretch: FreeStretch }
  | { kind: "freeMornings"; dates: LocalDate[] };

/** A weekday morning counts as free when nothing starts before this. */
const FREE_MORNING_UNTIL = "10:00";
const MAX_TIPS = 4;

export interface ExerciseWeek {
  timeline: WeekTimeline;
  input: WorkoutPlanInput;
  plan: WeekPlan;
  summary: ExerciseSummary;
}

export interface WeekSources {
  weekStart: LocalDate;
  shared: SharedPrefs;
  outtake: OuttakePrefs;
  /** The user's stored blocks for the week (listBlocksForWeek). */
  blocks: readonly BusyBlock[];
  awayDays: readonly AwayDay[];
  places: readonly Place[];
  /** New York local time now. */
  now: LocalDateTime;
}

const clock = (minutes: number): TimeOfDay => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The week's free stretches from now on, worth showing, in time order. */
function freeStretches(input: WorkoutPlanInput, now: LocalDateTime, placeName: (id: string) => string): FreeStretch[] {
  const today = now.slice(0, 10);
  const nowMinutes = minutesOfDay(now.slice(11));
  const stretches: FreeStretch[] = [];
  for (const gap of findGaps(input)) {
    if (gap.date < today) continue;
    const start = gap.date === today ? Math.max(minutesOfDay(gap.start), nowMinutes) : minutesOfDay(gap.start);
    const minutes = minutesOfDay(gap.end) - start;
    if (minutes < SHORTEST_GAP_WORTH_SHOWING) continue;
    // What fits from now on: a full session if it can, else a short one, nearest place first.
    const from = { ...gap, start: clock(start) };
    let fits: StretchFit = { kind: "break" };
    for (const [kind, length] of [["workout", input.sessionMinutes], ["short", SHORT_SESSION_MINUTES]] as const) {
      const option = placeOptions(from, input.places, length)[0];
      if (option) {
        fits = { kind, minutes: length, placeName: placeName(option.placeId), travelMinutes: option.travelTo + option.travelBack };
        break;
      }
    }
    stretches.push({ date: gap.date, start: clock(start), end: gap.end, minutes, fits });
  }
  return stretches;
}

function weekTips(summary: Omit<ExerciseSummary, "tips">, stretches: FreeStretch[], today: LocalDate): WeekTip[] {
  const tips: WeekTip[] = [];
  if (!summary.homeCornerSet) tips.push({ kind: "setHome" });
  if (summary.isBusy) tips.push({ kind: "heavyWeek", percentBooked: Math.round(summary.busyness * 100) });

  const ahead = summary.days.filter((day) => !day.past && !day.away);
  let lightestDate: LocalDate | null = null;
  if (ahead.length > 1) {
    const lightest = ahead.reduce((best, day) => (day.freeMinutes > best.freeMinutes ? day : best));
    if (lightest.freeMinutes >= 60) {
      tips.push({ kind: "lightestDay", date: lightest.date, freeMinutes: lightest.freeMinutes });
      lightestDate = lightest.date;
    }
  }

  // On the lightest day it would only say the same thing again.
  const longest = stretches.reduce<FreeStretch | null>((best, s) => (best === null || s.minutes > best.minutes ? s : best), null);
  if (longest && longest.date !== lightestDate) tips.push({ kind: "longestStretch", stretch: longest });

  // Weekdays still ahead (after today) with nothing booked before 10:00.
  const mornings = summary.days
    .slice(0, 5)
    .filter((day) => day.date > today && !day.away && (day.firstCommitment === null || day.firstCommitment >= FREE_MORNING_UNTIL))
    .map((day) => day.date);
  if (mornings.length >= 2) tips.push({ kind: "freeMornings", dates: mornings });

  return tips.slice(0, MAX_TIPS);
}

export function assembleWeek(sources: WeekSources): ExerciseWeek {
  const { weekStart, shared, outtake, now } = sources;
  const timeline = weekTimeline({
    weekStart,
    blocks: sources.blocks,
    awayDays: sources.awayDays,
    semesterStart: shared.semesterStart,
    semesterEnd: shared.semesterEnd,
  });
  const input = buildPlanInput({
    weekStart,
    shared,
    outtake,
    blocks: timelineBlocks(timeline),
    awayDays: timeline.awayDays.map((date) => ({ date, attributes: {} })),
    places: sources.places,
    crunchMode: false,
    dismissed: [],
    // Only plan what's still ahead when the week has started.
    ...(now >= weekStart && now < addDays(weekStart, 7) ? { now } : {}),
  });
  const plan = planWeek(input, tunedConfig(ENGINE_CONFIG, outtake.adjustments));

  const next = plan.slots.find((slot) => slot.start >= now) ?? null;
  const placeName = (id: string) => sources.places.find((place) => place.id === id)?.name ?? id;
  const today = now.slice(0, 10);

  // Each day's free time ignores away days, so an away day still shows its commitments as busy.
  const wakingMinutes = minutesOfDay(input.wakingEnd) - minutesOfDay(input.wakingStart);
  const allGaps = findGaps({ ...input, awayDays: [] });
  const days: ExerciseDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const gaps = allGaps.filter((gap) => gap.date === date);
    const freeMinutes = gaps.reduce((sum, gap) => sum + minutesOfDay(gap.end) - minutesOfDay(gap.start), 0);
    const first = gaps[0];
    const firstCommitment = first === undefined || first.afterBlock ? input.wakingStart : first.beforeBlock ? first.end : null;
    const slot = plan.slots.find((s) => s.start.startsWith(date));
    // Busy is whatever of waking hours isn't a gap.
    const busyStretches: ExerciseDay["busyStretches"] = [];
    let cursor = input.wakingStart;
    for (const gap of gaps) {
      if (gap.start > cursor) busyStretches.push({ start: cursor, end: gap.start });
      cursor = gap.end;
    }
    if (cursor < input.wakingEnd) busyStretches.push({ start: cursor, end: input.wakingEnd });
    return {
      date,
      away: input.awayDays.includes(date),
      past: date < today,
      busyMinutes: wakingMinutes - freeMinutes,
      freeMinutes,
      firstCommitment,
      busyStretches,
      workout: slot ? { start: slot.start, end: slot.end, placeName: placeName(slot.placeId), travelMinutes: slot.travelMinutes } : null,
    };
  });

  const stretches = freeStretches(input, now, placeName);
  const todays = stretches.filter((s) => s.date === today);
  const longestToday = todays.reduce<FreeStretch | null>((best, s) => (best === null || s.minutes > best.minutes ? s : best), null);

  // One way from home, nearest first, one entry per place name.
  const nearby = [...input.places]
    .map((place) => ({
      placeId: place.id,
      placeName: placeName(place.id),
      kind: sources.places.find((p) => p.id === place.id)?.kind ?? "gym",
      walkMinutes: walkingMinutes(input.home, place.location),
    }))
    .sort((a, b) => a.walkMinutes - b.walkMinutes)
    .filter((entry, i, all) => all.findIndex((e) => e.placeName === entry.placeName) === i)
    .slice(0, 3);

  const summary: Omit<ExerciseSummary, "tips"> = {
    weekStart,
    commitments: timeline.entries.length,
    toConfirm: timeline.unconfirmed,
    sessions: plan.slots.length,
    target: plan.targetSessions,
    reason: plan.reason,
    nextUp: next ? { start: next.start, end: next.end, placeName: placeName(next.placeId), travelMinutes: next.travelMinutes } : null,
    busyness: plan.busyness,
    isBusy: plan.isBusy,
    todaysGap: longestToday ? { start: longestToday.start, minutes: longestToday.minutes } : null,
    todaysGaps: todays,
    freeSoon: stretches.length === 0 ? null : { date: stretches[0]!.date, stretches: stretches.filter((s) => s.date === stretches[0]!.date) },
    days,
    nearby,
    homeCornerSet: shared.homeCorner !== null,
    waking: { start: input.wakingStart, end: input.wakingEnd },
  };

  return { timeline, input, plan, summary: { ...summary, tips: weekTips(summary, stretches, today) } };
}
