// The weekly plan (section 8.3, steps 3 to 5 of docs/outtake.md): the best
// slot each day, then the set of days that scores highest once spacing is
// counted (for users who want sessions spread out). Comparing every set of
// days, rather than picking greedily, finds the spread-out plan when one exists
// (a week has at most 7 days, so at most 35 sets of 3). In crunch mode the
// target becomes 2 shorter sessions, and walking costs more, so they stay close
// to where the user is.
//
// Sessions never start within wakeBufferMinutes of waking, nor until
// afterBlockMinutes after a commitment ends: those are rules, not scores.

import { minutesOfDay, weekdayOf, WEEKDAYS, type LocalDate, type LocalDateTime } from "../../time.js";
import { measureBusyness } from "./busyness.js";
import { ENGINE_CONFIG, type EngineConfig } from "./config.js";
import { findGaps, formatTimeOfDay, placeOptions, type Gap, type PlaceOption } from "./gaps.js";
import { scoreSlot, type ScoreParts } from "./scoring.js";
import type { WorkoutPlanInput, PlannedSlot, WeekPlan } from "./types.js";

const dateOf = (time: LocalDateTime): LocalDate => time.slice(0, 10);
const dayIndex = (time: LocalDateTime) => WEEKDAYS.indexOf(weekdayOf(dateOf(time)));
const byStart = (a: PlannedSlot, b: PlannedSlot) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

/** Session lengths to try, longest first: the user's usual one, or crunch mode's 30 then 20 minutes. */
function sessionLengths(input: WorkoutPlanInput, config: EngineConfig): number[] {
  if (!input.crunchMode) return [input.sessionMinutes];
  const { longestMinutes, shortestMinutes } = config.plan.crunch;
  const longest = Math.max(shortestMinutes, Math.min(longestMinutes, input.sessionMinutes));
  return longest === shortestMinutes ? [shortestMinutes] : [longest, shortestMinutes];
}

/** On the quarter hour where the option allows it, else as early as it can. */
function startTimes(option: PlaceOption, step: number): number[] {
  const earliest = minutesOfDay(option.earliestStart);
  const latest = minutesOfDay(option.latestStart);
  const first = Math.ceil(earliest / step) * step;
  if (first > latest) return [earliest];
  const starts: number[] = [];
  for (let start = first; start <= latest; start += step) starts.push(start);
  return starts;
}

/**
 * The part of a gap a session (with its walks) may use: not until
 * afterBlockMinutes after a commitment, nor within wakeBufferMinutes of waking,
 * and ending bedBufferMinutes before bed. Null when nothing is left.
 */
function usableWindow(gap: Gap, input: WorkoutPlanInput, config: EngineConfig): Gap | null {
  const { wakeBufferMinutes, bedBufferMinutes, afterBlockMinutes } = config.plan;
  const start = Math.max(
    minutesOfDay(gap.start) + (gap.afterBlock ? afterBlockMinutes : 0),
    minutesOfDay(input.wakingStart) + wakeBufferMinutes,
  );
  const end = Math.min(minutesOfDay(gap.end), minutesOfDay(input.wakingEnd) - bedBufferMinutes);
  return start < end ? { ...gap, start: formatTimeOfDay(start), end: formatTimeOfDay(end) } : null;
}

/** The highest-scoring slot in a gap, at the longest session length that fits; null when none does. */
function bestInGap(fullGap: Gap, input: WorkoutPlanInput, config: EngineConfig): PlannedSlot | null {
  const gap = usableWindow(fullGap, input, config);
  if (gap === null) return null;
  for (const length of sessionLengths(input, config)) {
    let best: PlannedSlot | null = null;
    for (const option of placeOptions(gap, input.places, length, config.travel)) {
      for (const start of startTimes(option, config.plan.startStepMinutes)) {
        const startAt = `${gap.date}T${formatTimeOfDay(start)}`;
        if (input.planFrom !== null && startAt < input.planFrom) continue;
        const end = start + length;
        const travelMinutes = option.travelTo + option.travelBack;
        // Measured to the commitment itself, not to the end of the usable window.
        const minutesToNext = fullGap.beforeBlock ? minutesOfDay(fullGap.end) - end : null;
        const { total } = scoreSlot({ date: gap.date, start, end, travelMinutes, minutesToNext }, input, config.scoring);
        // Strictly better only: ties keep the earlier time and the shorter walk.
        if (best === null || total > best.score) {
          best = { start: startAt, end: `${gap.date}T${formatTimeOfDay(end)}`, placeId: option.placeId, travelMinutes, score: total };
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/**
 * Points for how a set of days (week indexes, in order) is spread: for users
 * who want sessions spread out, less backToBack per pair of consecutive days
 * plus spreadPerDay per day between consecutive slots (up to 3); 0 otherwise.
 */
export function spreadPoints(days: readonly number[], spreadOut: boolean, config: EngineConfig = ENGINE_CONFIG): number {
  if (!spreadOut) return 0;
  let points = 0;
  for (let i = 1; i < days.length; i++) {
    const apart = days[i]! - days[i - 1]!;
    if (apart === 1) points -= config.scoring.backToBack;
    points += config.scoring.spreadPerDay * Math.min(apart, 3);
  }
  return points;
}

/** The `count` slots (one per day) scoring highest in total, with spreadPoints for their days. */
function pickDays(candidates: readonly PlannedSlot[], keptDays: readonly number[], count: number, spreadOut: boolean, config: EngineConfig): PlannedSlot[] {
  let chosen: PlannedSlot[] = [];
  let bestValue = -Infinity;
  const visit = (from: number, picked: PlannedSlot[]) => {
    if (picked.length === count) {
      const days = [...keptDays, ...picked.map((slot) => dayIndex(slot.start))].sort((a, b) => a - b);
      const value = picked.reduce((sum, slot) => sum + slot.score, 0) + spreadPoints(days, spreadOut, config);
      // Strictly better only: ties keep the earliest days.
      if (value > bestValue) {
        bestValue = value;
        chosen = picked;
      }
      return;
    }
    for (let i = from; i < candidates.length; i++) visit(i + 1, [...picked, candidates[i]!]);
  };
  visit(0, []);
  return chosen;
}

function shortfallReason(found: number): string {
  if (found === 0) return "No gaps long enough for a workout this week.";
  return `Only ${found} ${found === 1 ? "day has" : "days have"} a gap long enough for a workout this week.`;
}

/**
 * The highest-scoring slot on each day that has room for one, in day order:
 * the candidates the weekly plan picks from. Days with a kept slot are left out.
 */
export function bestSlotPerDay(input: WorkoutPlanInput, config: EngineConfig = ENGINE_CONFIG): PlannedSlot[] {
  const keptDates = new Set(input.keptSlots.map((slot) => dateOf(slot.start)));
  // Gaps come in time order, so so do the days.
  const bestByDay = new Map<LocalDate, PlannedSlot>();
  for (const gap of findGaps(input)) {
    if (keptDates.has(gap.date)) continue;
    const slot = bestInGap(gap, input, config);
    const current = bestByDay.get(gap.date);
    if (slot !== null && (current === undefined || slot.score > current.score)) bestByDay.set(gap.date, slot);
  }
  return [...bestByDay.values()];
}

/** A slot's score, part by part, for the engine review; null if the slot isn't in a gap of the week. */
export function explainSlot(slot: PlannedSlot, input: WorkoutPlanInput, config: EngineConfig = ENGINE_CONFIG): ScoreParts | null {
  const date = dateOf(slot.start);
  const start = minutesOfDay(slot.start.slice(11));
  const end = minutesOfDay(slot.end.slice(11));
  const gap = findGaps(input).find((g) => g.date === date && minutesOfDay(g.start) <= start && end <= minutesOfDay(g.end));
  if (!gap) return null;
  const minutesToNext = gap.beforeBlock ? minutesOfDay(gap.end) - end : null;
  return scoreSlot({ date, start, end, travelMinutes: slot.travelMinutes, minutesToNext }, input, config.scoring);
}

export function planWeek(input: WorkoutPlanInput, config: EngineConfig = ENGINE_CONFIG): WeekPlan {
  const targetSessions = input.crunchMode ? config.plan.crunch.sessions : input.weeklyTargetSessions;
  const busyness = measureBusyness(input);
  const kept = [...input.keptSlots].sort(byStart);

  const candidates = bestSlotPerDay(input, config);
  const needed = Math.max(0, targetSessions - kept.length);
  const count = Math.min(needed, candidates.length);
  const picked = pickDays(candidates, kept.map((slot) => dayIndex(slot.start)), count, input.spreadOut, config);

  const slots = [...kept, ...picked].sort(byStart);
  const targetMet = slots.length >= targetSessions;
  return {
    slots,
    targetSessions,
    targetMet,
    reason: targetMet ? null : shortfallReason(slots.length),
    busyness,
    isBusy: input.crunchMode || busyness >= config.plan.busyThreshold,
  };
}
