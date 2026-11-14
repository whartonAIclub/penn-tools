// Task storage: event tasks from a checklist, plus ongoing to-dos. An event
// task's due date is never stored: it is the event date plus the task's offset,
// computed when read. Only ongoing to-dos (no event) use `due_date`.

import type { Sql } from "postgres";
import { parseDate } from "./checklist.js";
import { reassignRoleOwners } from "./roles.js";
import type { Area, Phase, TaskDraft } from "./checklist.js";

export type TaskStatus = "todo" | "doing" | "blocked" | "done" | "skipped";

export const MAX_TASK_TITLE = 300;

const STATUSES: readonly string[] = ["todo", "doing", "blocked", "done", "skipped"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TaskRow {
  id: number;
  eventId: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  templateItemKey: string | null;
  parentTaskId: number | null;
  title: string;
  phase: Phase | null;
  area: Area | null;
  offsetDays: number | null;
  dueDate: string | null;
  owner: string;
  ownerRole: string | null;
  status: TaskStatus;
  waitingOn: string | null;
  completedAt: string | null;
  isPostmortem: boolean;
  notes: string | null;
  source: "template" | "manual" | "meeting" | "inferred";
  confirmed: boolean;
  timeHint: string | null;
  partner: string | null;
}

function checkTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === "") throw new RangeError("A task needs a title.");
  if (trimmed.length > MAX_TASK_TITLE) throw new RangeError(`A task title is at most ${MAX_TASK_TITLE} characters.`);
  return trimmed;
}

function checkOwner(owner: string | null | undefined): string {
  if (owner === null || owner === undefined) return "Unassigned";
  const trimmed = owner.trim();
  if (trimmed === "") throw new RangeError("An owner can't be blank; use null for Unassigned.");
  return trimmed;
}

function checkStatus(status: string): TaskStatus {
  if (!STATUSES.includes(status)) throw new RangeError(`Unknown task status: ${status}`);
  return status as TaskStatus;
}

function checkOffset(offset: number | null): number | null {
  if (offset !== null && !Number.isInteger(offset)) throw new RangeError(`Offset must be a whole number of days: ${offset}`);
  return offset;
}

/**
 * Adds a checklist's tasks to an event in one transaction and returns how many
 * were new. Parents are inserted before children; a parent not among the drafts
 * is looked up among the event's existing tasks, else the child has no parent.
 * Re-running adds nothing.
 */
export async function createEventTasks(
  sql: Sql,
  eventId: string,
  drafts: TaskDraft[],
  options: { templateVersionId?: number; moduleKeys?: string[] } = {},
): Promise<number> {
  if (!UUID.test(eventId)) throw new RangeError(`Unknown event: ${eventId}`);
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const [event] = await tx<{ id: string }[]>`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
    if (!event) throw new RangeError(`Unknown event: ${eventId}`);

    // Ids of tasks by template key, from earlier runs and from this one.
    const ids = new Map<string, number>();
    const existing = await tx<{ key: string; id: string }[]>`
      SELECT template_item_key AS key, id::text FROM tasks
      WHERE event_id = ${eventId} AND template_item_key IS NOT NULL`;
    for (const row of existing) ids.set(row.key, Number(row.id));

    const draftKeys = new Set(drafts.map((d) => d.templateItemKey));
    let pending = [...drafts];
    let inserted = 0;
    while (pending.length > 0) {
      // Insertable: no parent, a parent outside the drafts, or a parent already handled.
      const handled = new Set(drafts.map((d) => d.templateItemKey).filter((k) => !pending.some((p) => p.templateItemKey === k)));
      const ready = pending.filter(
        (d) => d.parentKey === null || !draftKeys.has(d.parentKey) || handled.has(d.parentKey) || d.parentKey === d.templateItemKey,
      );
      // A cycle can't be ordered; insert what's left without waiting.
      const batch = ready.length > 0 ? ready : pending;
      for (const d of batch) {
        const parentId = d.parentKey === null || d.parentKey === d.templateItemKey ? null : (ids.get(d.parentKey) ?? null);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO tasks (event_id, template_item_key, parent_task_id, title, phase, area, offset_days, owner, owner_role,
                             is_postmortem, notes, time_hint, partner, source, confirmed)
          VALUES (${eventId}, ${d.templateItemKey}, ${parentId}, ${d.title}, ${d.phase}, ${d.area}, ${d.offsetDays},
                  ${d.owner}, ${d.ownerRole}, ${d.isPostmortem}, ${d.notes}, ${d.timeHint}, ${d.partner}, ${d.source}, ${d.confirmed})
          ON CONFLICT (event_id, template_item_key) WHERE event_id IS NOT NULL AND template_item_key IS NOT NULL DO NOTHING
          RETURNING id::text`;
        if (row) {
          inserted++;
          ids.set(d.templateItemKey, Number(row.id));
        }
      }
      const done = new Set(batch);
      pending = pending.filter((d) => !done.has(d));
    }

    if (options.templateVersionId !== undefined) {
      await tx`UPDATE events SET template_version_id = ${options.templateVersionId} WHERE id = ${eventId}`;
    }
    for (const key of new Set(options.moduleKeys ?? [])) {
      await tx`INSERT INTO event_modules (event_id, module_key) VALUES (${eventId}, ${key}) ON CONFLICT DO NOTHING`;
    }
    // Roles may have changed since the drafts were built (the event is locked now), so resolve role-owned owners again from the current roles.
    await reassignRoleOwners(tx, eventId);
    return inserted;
  });
}

interface RawTask {
  id: string;
  event_id: string | null;
  event_title: string | null;
  event_date: string | null;
  template_item_key: string | null;
  parent_task_id: string | null;
  title: string;
  phase: Phase | null;
  area: Area | null;
  offset_days: number | null;
  due: string | null;
  owner: string;
  owner_role: string | null;
  status: TaskStatus;
  waiting_on: string | null;
  completed_at: string | null;
  is_postmortem: boolean;
  notes: string | null;
  source: TaskRow["source"];
  confirmed: boolean;
  time_hint: string | null;
  partner: string | null;
}

/** Tasks with their computed due dates, soonest first (undated last). */
export async function listTasks(
  sql: Sql,
  filter: { owner?: string; from?: string; to?: string; eventIds?: string[]; statuses?: TaskStatus[]; includeUndated?: boolean } = {},
): Promise<TaskRow[]> {
  if (filter.from !== undefined) parseDate(filter.from);
  if (filter.to !== undefined) parseDate(filter.to);
  if (filter.eventIds?.length === 0 || filter.statuses?.length === 0) return [];
  const windowed = filter.from !== undefined || filter.to !== undefined;
  const includeUndated = filter.includeUndated === true || !windowed;

  const rows = await sql<RawTask[]>`
    WITH t AS (
      SELECT tasks.*, e.title AS event_title, e.event_date,
             CASE WHEN tasks.event_id IS NULL THEN tasks.due_date
                  ELSE e.event_date + tasks.offset_days END AS due
      FROM tasks LEFT JOIN events e ON e.id = tasks.event_id
    )
    SELECT id::text, event_id::text, event_title, event_date::text AS event_date, template_item_key,
           parent_task_id::text, title, phase, area, offset_days, due::text AS due, owner, owner_role, status, waiting_on,
           completed_at::text AS completed_at, is_postmortem, notes, source, confirmed, time_hint, partner
    FROM t
    WHERE (${filter.owner ?? null}::text IS NULL OR lower(${filter.owner ?? null}::text) = ANY(SELECT btrim(x) FROM unnest(string_to_array(lower(owner), '/')) x))
      AND (${filter.eventIds ?? null}::text[] IS NULL OR event_id::text = ANY(${filter.eventIds ?? null}::text[]))
      AND (${filter.statuses ?? null}::text[] IS NULL OR status = ANY(${filter.statuses ?? null}::text[]))
      AND (
        CASE WHEN due IS NULL THEN ${includeUndated}::boolean
             ELSE (${filter.from ?? null}::date IS NULL OR due >= ${filter.from ?? null}::date)
              AND (${filter.to ?? null}::date IS NULL OR due <= ${filter.to ?? null}::date) END
      )
    ORDER BY t.due ASC NULLS LAST, t.offset_days ASC NULLS LAST, t.id ASC`;

  return rows.map((r) => ({
    id: Number(r.id),
    eventId: r.event_id,
    eventTitle: r.event_title,
    eventDate: r.event_date,
    templateItemKey: r.template_item_key,
    parentTaskId: r.parent_task_id === null ? null : Number(r.parent_task_id),
    title: r.title,
    phase: r.phase,
    area: r.area,
    offsetDays: r.offset_days,
    dueDate: r.due,
    owner: r.owner,
    ownerRole: r.owner_role,
    status: r.status,
    waitingOn: r.waiting_on,
    completedAt: r.completed_at,
    isPostmortem: r.is_postmortem,
    notes: r.notes,
    source: r.source,
    confirmed: r.confirmed,
    timeHint: r.time_hint,
    partner: r.partner,
  }));
}

/**
 * Changes the fields present in `change` (null clears where allowed; an owner
 * of null means Unassigned). False for an unknown id. An event task is moved
 * with `offsetDays` and an ongoing to-do with `dueDate`; the wrong one is a
 * RangeError, so a due date is never stored for an event task.
 */
export async function updateTask(
  sql: Sql,
  id: number,
  change: {
    title?: string;
    status?: TaskStatus;
    owner?: string | null;
    waitingOn?: string | null;
    notes?: string | null;
    timeHint?: string | null;
    offsetDays?: number | null;
    dueDate?: string | null;
    confirmed?: boolean;
  },
): Promise<boolean> {
  const has = <K extends keyof typeof change>(k: K) => k in change && change[k] !== undefined;
  const title = has("title") ? checkTitle(change.title as string) : undefined;
  const status = has("status") ? checkStatus(change.status as string) : undefined;
  const owner = has("owner") ? checkOwner(change.owner) : undefined;
  const offset = has("offsetDays") ? checkOffset(change.offsetDays as number | null) : undefined;
  const due = has("dueDate") ? (change.dueDate === null ? null : (parseDate(change.dueDate as string), change.dueDate as string)) : undefined;

  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const [task] = await tx<{ event_id: string | null; status: string }[]>`
      SELECT event_id::text, status FROM tasks WHERE id = ${id} FOR UPDATE`;
    if (!task) return false;
    if (due !== undefined && task.event_id !== null) throw new RangeError("An event task's due date comes from its event; change its offset instead.");
    if (offset !== undefined && task.event_id === null) throw new RangeError("An ongoing to-do has a due date, not an offset.");

    const set: Record<string, unknown> = {};
    if (title !== undefined) set["title"] = title;
    if (owner !== undefined) {
      set["owner"] = owner;
      set["owner_role"] = null; // a hand-picked owner stops following the role
    }
    if (has("waitingOn")) set["waiting_on"] = change.waitingOn;
    if (has("notes")) set["notes"] = change.notes;
    if (has("timeHint")) set["time_hint"] = change.timeHint;
    if (offset !== undefined) set["offset_days"] = offset;
    if (due !== undefined) set["due_date"] = due;
    if (has("confirmed")) set["confirmed"] = change.confirmed;
    if (status !== undefined) {
      set["status"] = status;
      if (status !== "done") set["completed_at"] = null;
      else if (task.status !== "done") set["completed_at"] = new Date();
    }
    if (Object.keys(set).length > 0) await tx`UPDATE tasks SET ${tx(set)} WHERE id = ${id}`;
    return true;
  });
}

/**
 * Adds a to-do: an event task (`eventId` + `offsetDays`), an ongoing to-do
 * (`dueDate`) or an undated one. Returns the new id.
 */
export async function createTodo(
  sql: Sql,
  input: {
    title: string;
    owner?: string;
    eventId?: string;
    offsetDays?: number;
    dueDate?: string;
    notes?: string;
    timeHint?: string;
    source?: "manual" | "meeting" | "inferred";
  },
): Promise<number> {
  const title = checkTitle(input.title);
  const owner = checkOwner(input.owner);
  const eventId = input.eventId ?? null;
  if (eventId !== null && input.dueDate !== undefined) throw new RangeError("An event task takes an offset, not a due date.");
  if (eventId === null && input.offsetDays !== undefined) throw new RangeError("An offset needs an event.");
  if (input.dueDate !== undefined) parseDate(input.dueDate);
  const offset = input.offsetDays === undefined ? null : checkOffset(input.offsetDays);
  if (eventId !== null && !UUID.test(eventId)) throw new RangeError(`Unknown event: ${eventId}`);

  try {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO tasks (event_id, title, owner, offset_days, due_date, notes, time_hint, source)
      VALUES (${eventId}, ${title}, ${owner}, ${offset}, ${input.dueDate ?? null}, ${input.notes ?? null},
              ${input.timeHint ?? null}, ${input.source ?? "manual"})
      RETURNING id::text`;
    return Number(row!.id);
  } catch (error) {
    if ((error as { code?: string }).code === "23503") throw new RangeError(`Unknown event: ${eventId}`);
    throw error;
  }
}

/** Deletes a task and, by cascade, its subtasks. False when there was none. */
export async function deleteTask(sql: Sql, id: number): Promise<boolean> {
  const rows = await sql`DELETE FROM tasks WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
