// The weekly plan (section 8.3, steps 3 to 5 of docs/outtake.md): the best
// slot each day, then the set of days that scores highest once back-to-back
// days are penalized. Comparing every set of days, rather than picking
// greedily, finds the spread-out plan when one exists (a week has at most 7
// days, so at most 35 sets of 3). In crunch mode the target becomes 2 shorter
// sessions, and walking costs more, so they stay close to where the user is.

import { minutesOfDay, weekdayOf, WEEKDAYS, type LocalDate, type LocalDateTime } from "../../time.js";
import { measureBusyness } from "./busyness.js";
import { ENGINE_CONFIG, type EngineConfig } from "./config.js";
import { findGaps, formatTimeOfDay, placeOptions, type Gap, type PlaceOption } from "./gaps.js";
import { scoreSlot } from "./scoring.js";
import type { PlanInput, PlannedSlot, WeekPlan } from "./types.js";

const dateOf = (time: LocalDateTime): LocalDate => time.slice(0, 10);
const dayIndex = (time: LocalDateTime) => WEEKDAYS.indexOf(weekdayOf(dateOf(time)));
const byStart = (a: PlannedSlot, b: PlannedSlot) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

/** Session lengths to try, longest first: the user's usual one, or crunch mode's 30 then 20 minutes. */
function sessionLengths(input: PlanInput, config: EngineConfig): number[] {
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

/** The highest-scoring slot in a gap, at the longest session length that fits; null when none does. */
function bestInGap(gap: Gap, input: PlanInput, config: EngineConfig): PlannedSlot | null {
  for (const length of sessionLengths(input, config)) {
    let best: PlannedSlot | null = null;
    for (const option of placeOptions(gap, input.places, length, config.travel)) {
      for (const start of startTimes(option, config.plan.startStepMinutes)) {
        const startAt = `${gap.date}T${formatTimeOfDay(start)}`;
        if (input.planFrom !== null && startAt < input.planFrom) continue;
        const end = start + length;
        const travelMinutes = option.travelTo + option.travelBack;
        const minutesToNext = gap.beforeBlock ? minutesOfDay(gap.end) - end : null;
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

/** The `count` slots (one per day) scoring highest in total, less backToBack for each pair of consecutive days. */
function pickDays(candidates: readonly PlannedSlot[], keptDays: readonly number[], count: number, backToBack: number): PlannedSlot[] {
  let chosen: PlannedSlot[] = [];
  let bestValue = -Infinity;
  const visit = (from: number, picked: PlannedSlot[]) => {
    if (picked.length === count) {
      const days = [...keptDays, ...picked.map((slot) => dayIndex(slot.start))].sort((a, b) => a - b);
      const consecutive = days.filter((day, i) => i > 0 && day - days[i - 1]! === 1).length;
      const value = picked.reduce((sum, slot) => sum + slot.score, 0) - backToBack * consecutive;
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

export function planWeek(input: PlanInput, config: EngineConfig = ENGINE_CONFIG): WeekPlan {
  const targetSessions = input.crunchMode ? config.plan.crunch.sessions : input.weeklyTargetSessions;
  const busyness = measureBusyness(input);

  const kept = [...input.keptSlots].sort(byStart);
  const keptDates = new Set(kept.map((slot) => dateOf(slot.start)));

  // Gaps come in time order, so so do the days.
  const bestByDay = new Map<LocalDate, PlannedSlot>();
  for (const gap of findGaps(input)) {
    if (keptDates.has(gap.date)) continue;
    const slot = bestInGap(gap, input, config);
    const current = bestByDay.get(gap.date);
    if (slot !== null && (current === undefined || slot.score > current.score)) bestByDay.set(gap.date, slot);
  }

  const needed = Math.max(0, targetSessions - kept.length);
  const count = Math.min(needed, bestByDay.size);
  const picked = pickDays([...bestByDay.values()], kept.map((slot) => dayIndex(slot.start)), count, config.scoring.backToBack);

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
