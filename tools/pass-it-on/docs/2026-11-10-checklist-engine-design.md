# Checklist engine, steps 12–13: design

*2026-11-10. Piece 2 of the calendar/checklist work; reads the master calendar (the `events` table) built by the calendar import. Steps 14–19 (template content, task storage, pages) follow in their own plans.*

Inputs used: the approved build plan, `Big Gay Halloween Checklist.pdf` (a real past checklist) and the chief-of-staff chat summary. Where they disagree with the build plan, they win; changes are listed in PROGRESS.md "Decisions taken".

## Decisions

- Owners are plain names (default: the item's default role on the event, else Pub Leader, else "Unassigned"). A `members` list of names is filled from names already used, for dropdowns and filters only.
- WhatsApp reminders: Monday of event week and T-0 only, as weekday anchors that move with the event.
- Every task records its provenance (`source`) and whether the owner confirmed (`confirmed`).
- A task's due date is always the event's date plus its offset, computed when read, so moving an event moves its tasks without rewriting them.

## Step 12: schema (additive, `schema.sql`)

- `template_versions (id, version UNIQUE, note, created_at, reverted_from)`: a version is never edited.
- `template_modules (version_id, key, name, description)`.
- `template_items (version_id, key, module_key NULL for base, parent_key NULL, title, phase, area, offset_days NULL, anchor_weekday NULL, default_role NULL, notes, sort)`. `phase` is `pre`, `day_of`, `during` or `post`; `area` is `general`, `finance`, `marketing`, `operations`, `entertainment`. Exactly one of `offset_days` (T-n, T+n) or `anchor_weekday` (0=Sunday…6; "that weekday of the event's week", Monday–Sunday) is set, or neither for a standing item with no date.
- `event_modules (event_id, module_key)`; `events.template_version_id`.
- `tasks (id, event_id NULL, template_item_key, parent_task_id NULL, title, phase, area, offset_days NULL, due_date NULL, owner TEXT NOT NULL DEFAULT 'Unassigned', status todo|doing|blocked|done, waiting_on TEXT, completed_at, is_postmortem, notes, source template|manual|meeting|inferred, confirmed BOOLEAN, created_at)`. Event tasks carry `offset_days`; ongoing to-dos carry `due_date`.
- `members (id, name, role NULL, active)`, names unique ignoring case.

## Step 13: `src/checklist.ts`

- `dueDate(eventDate: string, offsetDays: number): string` — UTC date math (no daylight-saving drift); correct across month, year and leap-day boundaries.
- `anchorOffset(eventDate: string, weekday: number): number` — the offset (negative before the event) of that weekday in the event's Monday–Sunday week. For a Thursday event, Monday is -3 and Thursday is 0.
- `generateTasks(items, moduleKeys, event: { eventDate: string | null; roles: RoleInput[] }): TaskDraft[]` — base items plus the chosen modules' items; subtasks keep their parent by key; offsets from `offset_days` or `anchorOffset` (an undated event yields `offsetDays: null` for anchored items); owner = the person holding `default_role` on the event, else the Pub Leader (`leaderOf`), else "Unassigned"; `source: "template"`, `confirmed: false`; items sorted by offset then sort order; `is_postmortem` from the template. An item with neither offset nor anchor becomes an undated standing task.
- `rescheduleEvent(sql, eventId, newDate: string | null): Promise<{ from: string | null; to: string | null; moved: number; recomputed: number }>` — one transaction: updates `events.event_date`; for tasks that aren't done and whose item is weekday-anchored, recomputes `offset_days` for the new weekday; tasks done stay as they are. `moved` counts unfinished tasks whose due date changed. A null date keeps offsets and drops due dates.

## Testing

Pure-function tests: month, year and leap-day edges; daylight-saving dates; Thursday and non-Thursday events for `anchorOffset`; module selection; subtask parent links; owner by role, by leader, and unassigned; undated event; items with no date. Database tests on a throwaway schema: tables exist and are re-runnable; `rescheduleEvent` keeps done tasks, recomputes anchored ones, counts moved tasks, handles a null date, and returns zero for an unknown event.

## Out of scope for 12–13

Template content (14), task storage and queries (15), pages (16–18), AI features (Week 3).
