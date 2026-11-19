// One week's timeline (sections 8.1 and 8.2 of docs/outtake.md): every stored
// busy block from every source (.ics, screenshot, manual), as they fall in the
// week being planned. The review screen shows it before the user confirms,
// and the planner plans around it.
//
// - Weekly blocks are stored once, in the week they were first added, and
//   repeat into later weeks on the same weekday and times, within the
//   semester dates when those are set (otherwise indefinitely).
// - The same block from two sources (a class in both the .ics file and a
//   screenshot) appears once: the confirmed one if either is, else the one
//   from the most trusted source (manual, then .ics, then screenshot).
// - Blocks that only overlap stay separate: they're different commitments,
//   and the engine treats overlapping busy time as one stretch anyway.

import type { AwayDay, BlockSource, BusyBlock } from "../../schedule.js";
import type { LocalDate, LocalDateTime } from "../../time.js";

/** Which source wins when the same block comes from two: the user's own entry, then a calendar file, then a photo. */
const SOURCE_TRUST: Record<BlockSource, number> = { MANUAL: 0, ICS: 1, SCREENSHOT: 2 };

export interface TimelineEntry {
  /** As it falls in this week; its id is the stored block's, for editing or deleting it. */
  block: BusyBlock;
  /** Shown because it repeats weekly from an earlier week. */
  repeated: boolean;
  /** Other sources the same block also came from, merged into this one. */
  alsoFrom: BlockSource[];
}

export interface WeekTimeline {
  weekStart: LocalDate;
  /** In time order. */
  entries: TimelineEntry[];
  /** Days away in this week, in order. */
  awayDays: LocalDate[];
  /** How many entries the user still has to confirm before they're planned around. */
  unconfirmed: number;
}

export interface TimelineSources {
  weekStart: LocalDate;
  /** The user's stored blocks: at least those in this week and every weekly one that started before it. */
  blocks: readonly BusyBlock[];
  awayDays: readonly AwayDay[];
  /** The shared preferences' semester dates; null when not set. */
  semesterStart: LocalDate | null;
  semesterEnd: LocalDate | null;
}

function dayNumber(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function addDays(date: LocalDate, days: number): LocalDate {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

const dateOf = (time: LocalDateTime): LocalDate => time.slice(0, 10);
const shift = (time: LocalDateTime, days: number): LocalDateTime => `${addDays(dateOf(time), days)}${time.slice(10)}`;

/** Where a block falls in the week, or null if it doesn't. */
function inWeek(block: BusyBlock, sources: TimelineSources): { block: BusyBlock; repeated: boolean } | null {
  const { weekStart, semesterStart, semesterEnd } = sources;
  const weekEnd = addDays(weekStart, 7);
  if (block.start < weekEnd && block.end > weekStart) return { block, repeated: false };
  if (!block.recurringWeekly) return null;

  // Move it by whole weeks to the day in this week with its weekday, keeping its times.
  const startDate = dateOf(block.start);
  const weekday = (((dayNumber(startDate) - dayNumber(weekStart)) % 7) + 7) % 7;
  const occurrence = addDays(weekStart, weekday);
  // Only from when it was first added, and within the semester when that's set.
  if (occurrence <= startDate) return null;
  if (semesterStart !== null && semesterEnd !== null && (occurrence < semesterStart || occurrence > semesterEnd)) return null;
  const moveBy = dayNumber(occurrence) - dayNumber(startDate);
  return { block: { ...block, start: shift(block.start, moveBy), end: shift(block.end, moveBy) }, repeated: true };
}

/** The better of two copies of the same block: a confirmed one, then the most trusted source. */
function better(a: BusyBlock, b: BusyBlock): BusyBlock {
  if (a.confirmed !== b.confirmed) return a.confirmed ? a : b;
  return SOURCE_TRUST[a.source] <= SOURCE_TRUST[b.source] ? a : b;
}

export function weekTimeline(sources: TimelineSources): WeekTimeline {
  const weekEnd = addDays(sources.weekStart, 7);

  // Copies of the same block share a start and an end.
  const byTimes = new Map<string, { winner: { block: BusyBlock; repeated: boolean }; sources: Set<BlockSource> }>();
  for (const stored of sources.blocks) {
    const placed = inWeek(stored, sources);
    if (placed === null) continue;
    const key = `${placed.block.start}|${placed.block.end}`;
    const existing = byTimes.get(key);
    if (existing === undefined) {
      byTimes.set(key, { winner: placed, sources: new Set([placed.block.source]) });
    } else {
      existing.sources.add(placed.block.source);
      if (better(placed.block, existing.winner.block) === placed.block) existing.winner = placed;
    }
  }

  const entries: TimelineEntry[] = [...byTimes.values()]
    .map(({ winner, sources: from }) => ({
      block: winner.block,
      repeated: winner.repeated,
      alsoFrom: [...from].filter((source) => source !== winner.block.source).sort((a, b) => SOURCE_TRUST[a] - SOURCE_TRUST[b]),
    }))
    .sort((a, b) => (a.block.start < b.block.start ? -1 : a.block.start > b.block.start ? 1 : a.block.end < b.block.end ? -1 : 1));

  const awayDays = [...new Set(sources.awayDays.map((day) => day.date))]
    .filter((date) => date >= sources.weekStart && date < weekEnd)
    .sort();

  return {
    weekStart: sources.weekStart,
    entries,
    awayDays,
    unconfirmed: entries.filter((entry) => !entry.block.confirmed).length,
  };
}

/** The week's blocks for the planner (buildPlanInput plans around the confirmed ones). */
export function timelineBlocks(timeline: WeekTimeline): BusyBlock[] {
  return timeline.entries.map((entry) => entry.block);
}
