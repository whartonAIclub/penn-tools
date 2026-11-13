// Checklist date math. Dates are YYYY-MM-DD strings and all math is UTC, so
// daylight saving never shifts a result. Weekdays: 0 = Sunday ... 6 = Saturday.

import type { Sql } from "postgres";
import { leaderOf } from "./planning.js";
import type { RoleInput } from "./planning.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Parses a real calendar date into UTC milliseconds, or throws RangeError.
export function parseDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const ms = Date.UTC(year, month - 1, day);
    const check = new Date(ms);
    if (check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day) {
      return ms;
    }
  }
  throw new RangeError(`Not a real YYYY-MM-DD date: ${date}`);
}

/** The date `offsetDays` after (or, if negative, before) the event date. */
export function dueDate(eventDate: string, offsetDays: number): string {
  return new Date(parseDate(eventDate) + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** Days from the event date to `weekday` of the event's Monday-Sunday week. */
export function anchorOffset(eventDate: string, weekday: number): number {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new RangeError(`Weekday must be an integer from 0 to 6: ${weekday}`);
  }
  const eventWeekday = new Date(parseDate(eventDate)).getUTCDay();
  const mondayFirst = (w: number) => (w + 6) % 7;
  return mondayFirst(weekday) - mondayFirst(eventWeekday);
}

export type Phase = "pre" | "day_of" | "during" | "post";
export type Area = "general" | "finance" | "marketing" | "operations" | "entertainment" | "partners";

export interface TemplateItem {
  key: string;
  moduleKey: string | null;
  parentKey: string | null;
  title: string;
  phase: Phase;
  area: Area;
  offsetDays: number | null;
  anchorWeekday: number | null;
  defaultRole: string | null;
  notes: string | null;
  sort: number;
  isPostmortem: boolean;
  repeatFor: "partner_club" | null;
  timeHint: string | null;
}

export interface TaskDraft {
  templateItemKey: string;
  parentKey: string | null;
  title: string;
  phase: Phase;
  area: Area;
  offsetDays: number | null;
  owner: string;
  isPostmortem: boolean;
  notes: string | null;
  timeHint: string | null;
  partner: string | null;
  source: "template";
  confirmed: false;
}

/** The planning-vs-run-of-show category of a phase. */
export function categoryOf(phase: Phase): "planning" | "run_of_show" {
  return phase === "pre" ? "planning" : "run_of_show";
}

/** The modules worth suggesting for an event. */
export function suggestedModules(event: { partnerClubs: string[] }): string[] {
  return event.partnerClubs.some((club) => slugOf(club) !== "") ? ["club-collab"] : [];
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Unique clubs in order, each with a unique key slug. Blank names, names with
// an empty slug and repeats (ignoring case) are dropped.
function uniqueClubs(names: string[]): { name: string; slug: string }[] {
  const seenNames = new Set<string>();
  const usedSlugs = new Set<string>();
  const clubs: { name: string; slug: string }[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const base = slugOf(name);
    if (base === "" || seenNames.has(name.toLowerCase())) continue;
    seenNames.add(name.toLowerCase());
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug);
    clubs.push({ name, slug });
  }
  return clubs;
}

/**
 * The tasks a template gives an event: base items plus the chosen modules'
 * items, with offsets from the event date and owners from its roles. Items that
 * repeat for partner clubs (and their subtasks) get one task per club. Pure.
 */
export function generateTasks(
  items: TemplateItem[],
  moduleKeys: string[],
  event: { eventDate: string | null; roles: RoleInput[]; partnerClubs: string[] },
): TaskDraft[] {
  const modules = new Set(moduleKeys);
  let included = items.filter((i) => i.moduleKey === null || modules.has(i.moduleKey));
  // Drop subtasks whose parent isn't included; repeat so grandchildren go too.
  for (;;) {
    const keys = new Set(included.map((i) => i.key));
    const kept = included.filter((i) => i.parentKey === null || keys.has(i.parentKey));
    if (kept.length === included.length) break;
    included = kept;
  }

  // Items that repeat per club: marked so, or a subtask of one that does.
  const byKey = new Map(included.map((i) => [i.key, i]));
  const repeats = (item: TemplateItem): boolean => {
    for (let at: TemplateItem | undefined = item, hops = 0; at && hops <= included.length; hops++) {
      if (at.repeatFor !== null) return true;
      at = at.parentKey === null ? undefined : byKey.get(at.parentKey);
    }
    return false;
  };

  interface Occurrence { item: TemplateItem; club: { name: string; slug: string } | null }
  const clubs = uniqueClubs(event.partnerClubs);
  const occurrences: Occurrence[] = included.flatMap((item): Occurrence[] =>
    repeats(item) ? clubs.map((club) => ({ item, club })) : [{ item, club: null }],
  );

  const leader = leaderOf(event.roles);
  const holders = event.roles.filter((r) => r.person);
  const ownerOf = (item: TemplateItem): string => {
    const role = item.defaultRole?.trim().toLowerCase();
    const holder = role ? holders.find((r) => r.role.trim().toLowerCase() === role) : undefined;
    return holder?.person ?? leader ?? "Unassigned";
  };
  const offsetOf = (item: TemplateItem): number | null => {
    if (item.offsetDays !== null) return item.offsetDays;
    if (item.anchorWeekday !== null && event.eventDate !== null) {
      return anchorOffset(event.eventDate, item.anchorWeekday);
    }
    return null;
  };

  return occurrences
    .map((o) => ({ ...o, offset: offsetOf(o.item) }))
    .sort((a, b) => {
      if (a.offset !== b.offset) {
        if (a.offset === null) return 1;
        if (b.offset === null) return -1;
        return a.offset - b.offset;
      }
      return a.item.sort - b.item.sort;
    })
    .map(({ item, club, offset }) => ({
      templateItemKey: club ? `${item.key}:${club.slug}` : item.key,
      parentKey:
        item.parentKey !== null && club && repeats(byKey.get(item.parentKey) as TemplateItem)
          ? `${item.parentKey}:${club.slug}`
          : item.parentKey,
      title: club ? item.title.replaceAll("{club}", club.name) : item.title,
      phase: item.phase,
      area: item.area,
      offsetDays: offset,
      owner: ownerOf(item),
      isPostmortem: item.isPostmortem,
      notes: item.notes,
      timeHint: item.timeHint,
      partner: club?.name ?? null,
      source: "template" as const,
      confirmed: false as const,
    }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RescheduleResult {
  from: string | null;
  to: string | null;
  moved: number;
  recomputed: number;
}

/**
 * Moves an event to `newDate` (null clears it) and reschedules its unfinished
 * tasks: weekday-anchored ones get a new offset for the new weekday. Due dates
 * are never stored for event tasks (event date + offset, computed when read).
 * Done tasks are never touched. `moved` counts unfinished tasks whose due date
 * changed, `recomputed` anchored tasks whose offset changed. An unknown or
 * malformed id returns all nulls and zeros.
 */
export async function rescheduleEvent(sql: Sql, eventId: string, newDate: string | null): Promise<RescheduleResult> {
  if (newDate !== null) parseDate(newDate);
  if (!UUID.test(eventId)) return { from: null, to: null, moved: 0, recomputed: 0 };
  return sql.begin(async (transaction) => rescheduleEventIn(transaction as unknown as Sql, eventId, newDate));
}

/** rescheduleEvent inside a transaction the caller already opened (`tx`). */
export async function rescheduleEventIn(tx: Sql, eventId: string, newDate: string | null): Promise<RescheduleResult> {
  if (newDate !== null) parseDate(newDate);
  if (!UUID.test(eventId)) return { from: null, to: null, moved: 0, recomputed: 0 };

  const [event] = await tx<{ date: string | null; version: string | null }[]>`
    SELECT event_date::text AS date, template_version_id::text AS version
    FROM events WHERE id = ${eventId} FOR UPDATE`;
  if (!event) return { from: null, to: null, moved: 0, recomputed: 0 };
  const from = event.date;
  if (from === newDate) return { from, to: newDate, moved: 0, recomputed: 0 };

  await tx`UPDATE events SET event_date = ${newDate}, updated_at = NOW() WHERE id = ${eventId}`;

  const tasks = await tx<{ id: string; key: string | null; offset: number | null }[]>`
    SELECT id::text, template_item_key AS key, offset_days AS offset
    FROM tasks WHERE event_id = ${eventId} AND status <> 'done'`;
  const anchors = new Map<string, number>();
  if (event.version !== null && newDate !== null) {
    const rows = await tx<{ key: string; weekday: number }[]>`
      SELECT key, anchor_weekday AS weekday FROM template_items
      WHERE version_id = ${event.version} AND anchor_weekday IS NOT NULL`;
    for (const row of rows) anchors.set(row.key, row.weekday);
  }

  let moved = 0;
  let recomputed = 0;
  for (const task of tasks) {
    // A per-club task's key is "<item key>:<club slug>"; the template knows only the item key.
    const weekday = task.key === null ? undefined : anchors.get(task.key.split(":")[0]!);
    let offset = task.offset;
    if (weekday !== undefined && newDate !== null) {
      offset = anchorOffset(newDate, weekday);
      if (offset !== task.offset) recomputed++;
    }
    const before = from !== null && task.offset !== null ? dueDate(from, task.offset) : null;
    const after = newDate !== null && offset !== null ? dueDate(newDate, offset) : null;
    if (before !== after) moved++;
    if (offset !== task.offset) {
      await tx`UPDATE tasks SET offset_days = ${offset} WHERE id = ${task.id} AND status <> 'done'`;
    }
  }
  return { from, to: newDate, moved, recomputed };
}

/** How a task's timing reads on the Template tab: "T-14", "T+5", "T-0 (day of)" or "Monday of event week". */
export function describeTiming(item: Pick<TemplateItem, "offsetDays" | "anchorWeekday">): string {
  if (item.offsetDays !== null) return item.offsetDays === 0 ? "T-0" : item.offsetDays < 0 ? `T${item.offsetDays}` : `T+${item.offsetDays}`;
  if (item.anchorWeekday !== null) {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `${names[item.anchorWeekday]} of event week`;
  }
  return "No set date";
}
