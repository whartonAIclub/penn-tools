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
import { findGaps } from "./engine/gaps.js";
import { planWeek } from "./engine/plan.js";
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
}

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

function todaysGap(input: WorkoutPlanInput, now: LocalDateTime): ExerciseSummary["todaysGap"] {
  const today = now.slice(0, 10);
  const nowMinutes = minutesOfDay(now.slice(11));
  let best: ExerciseSummary["todaysGap"] = null;
  for (const gap of findGaps(input)) {
    if (gap.date !== today) continue;
    const start = Math.max(minutesOfDay(gap.start), nowMinutes);
    const minutes = minutesOfDay(gap.end) - start;
    if (minutes >= SHORTEST_GAP_WORTH_SHOWING && (best === null || minutes > best.minutes)) {
      best = { start: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`, minutes };
    }
  }
  return best;
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

  return {
    timeline,
    input,
    plan,
    summary: {
      weekStart,
      commitments: timeline.entries.length,
      toConfirm: timeline.unconfirmed,
      sessions: plan.slots.length,
      target: plan.targetSessions,
      reason: plan.reason,
      nextUp: next ? { start: next.start, end: next.end, placeName: placeName(next.placeId), travelMinutes: next.travelMinutes } : null,
      busyness: plan.busyness,
      isBusy: plan.isBusy,
      todaysGap: todaysGap(input, now),
    },
  };
}
