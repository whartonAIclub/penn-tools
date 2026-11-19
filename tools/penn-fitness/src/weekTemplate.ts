// One week for both halves. The schedule lives in the shared tables
// (schedule.ts, storage/schedule.ts); Nutrition edits it as a weekly template
// (nutrition/schedule.ts: weekday, times, label, location). This translates
// between the two, so a class added in either half shows in both.
//
// - Reading: the week's timeline (weekly blocks repeated in, one-offs that
//   week) as template blocks. A block running past midnight shows to 23:59,
//   as Nutrition's calendar import does.
// - Saving: the template as it now stands, compared with that same view.
//   Blocks no longer there are deleted (a weekly one from every week, as in
//   Exercise's review), blocks still there are confirmed (the user has just
//   seen them) and keep their dates, and new ones are added as weekly blocks,
//   since a template repeats. Only what changed is written.
//
// Locations are kept as the `location` attribute: Nutrition suggests food
// near classes. They're places on a calendar, never a home address.

import { NO_ATTRIBUTES } from "./attributes.js";
import type { DAY_KEYS, ScheduleBlock } from "./nutrition/schedule.js";
import { areaOfLocation } from "./outtake/ingest/ics.js";
import type { TimelineEntry } from "./outtake/ingest/timeline.js";
import type { BusyBlock } from "./schedule.js";
import type { LocalDate } from "./time.js";

type DayKey = (typeof DAY_KEYS)[number];
const DAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MAX_LABEL = 80;
const MAX_LOCATION = 120;

function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The location stored on a block, if any. */
export function blockLocation(block: BusyBlock): string | null {
  const value = block.attributes["location"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A timeline entry as a template block, or null if it doesn't start in the week. */
function toTemplate(entry: TimelineEntry, weekStart: LocalDate): ScheduleBlock | null {
  const { block } = entry;
  const date = block.start.slice(0, 10);
  const index = DAYS.findIndex((_, i) => addDays(weekStart, i) === date);
  if (index < 0) return null;
  const sameDay = block.end.slice(0, 10) === date;
  return {
    day: DAYS[index]!,
    start: block.start.slice(11),
    end: sameDay ? block.end.slice(11) : "23:59",
    label: (block.label ?? "Busy").slice(0, MAX_LABEL),
    location: blockLocation(block),
  };
}

const key = (b: ScheduleBlock) => `${b.day}|${b.start}|${b.end}|${b.label.trim().toLowerCase()}`;

/** The week's timeline as Nutrition's weekly template, in day and time order. */
export function templateFromTimeline(entries: readonly TimelineEntry[], weekStart: LocalDate): ScheduleBlock[] {
  return entries
    .map((entry) => toTemplate(entry, weekStart))
    .filter((b): b is ScheduleBlock => b !== null)
    .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
}

export interface TemplateChanges {
  /** Stored blocks to delete (by id). */
  remove: string[];
  /** Stored blocks to mark confirmed (by id). */
  confirm: string[];
  /** Stored blocks whose location changed (by id). */
  relocate: { id: string; location: string | null }[];
  /** New weekly blocks to add, dated in the week. */
  add: BusyBlock[];
}

/** What to write so the stored week matches the template as Nutrition now has it. */
export function templateChanges(entries: readonly TimelineEntry[], template: readonly ScheduleBlock[], weekStart: LocalDate): TemplateChanges {
  const wanted = new Map<string, ScheduleBlock>();
  for (const block of template) {
    const tidy = { ...block, label: block.label.trim().slice(0, MAX_LABEL) || "Busy", location: block.location?.trim().slice(0, MAX_LOCATION) || null };
    if (!wanted.has(key(tidy))) wanted.set(key(tidy), tidy);
  }

  const changes: TemplateChanges = { remove: [], confirm: [], relocate: [], add: [] };
  const kept = new Set<string>();
  for (const entry of entries) {
    const shown = toTemplate(entry, weekStart);
    if (shown === null) continue;
    const match = wanted.get(key(shown));
    if (match === undefined || kept.has(key(shown))) {
      changes.remove.push(entry.block.id);
      continue;
    }
    kept.add(key(shown));
    if (!entry.block.confirmed) changes.confirm.push(entry.block.id);
    if (match.location !== shown.location) changes.relocate.push({ id: entry.block.id, location: match.location });
  }

  for (const [k, block] of wanted) {
    if (kept.has(k)) continue;
    const date = addDays(weekStart, DAYS.indexOf(block.day));
    const endsNextDay = block.end <= block.start;
    changes.add.push({
      id: `template-${date}T${block.start}`,
      start: `${date}T${block.start}`,
      end: `${endsNextDay ? addDays(date, 1) : date}T${block.end}`,
      label: block.label,
      source: "MANUAL",
      recurringWeekly: true,
      confidence: null,
      confirmed: true,
      zone: areaOfLocation(block.location),
      attributes: block.location ? { location: block.location } : NO_ATTRIBUTES,
    });
  }
  return changes;
}
