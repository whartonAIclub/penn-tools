# Checklist Engine (Steps 12–13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The checklist engine's schema, its pure date and task-generation functions, and `rescheduleEvent`.

**Architecture:** New tables are appended to `schema.sql`. All date math and task generation are pure functions in `src/checklist.ts` (no database). `rescheduleEvent` is the one database function; it reads template items to know which tasks are weekday-anchored. Storage, template content and pages are later steps (14–18).

**Tech Stack:** TypeScript, postgres.js, vitest (database tests use a throwaway schema, as in `library.test.ts`).

**Spec:** `tools/pass-it-on/docs/2026-11-10-checklist-engine-design.md`

## Global Constraints

- Edit only `tools/pass-it-on/` (this plan touches nothing under `apps/web`).
- Tool code never uses `process.env`, `fetch` or vendor SDKs; the only non-core import is `import type { Sql } from "postgres"`.
- `schema.sql` changes are additive and re-runnable (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Dates are `YYYY-MM-DD` strings; all date math is UTC so daylight saving never shifts a result.
- Weekdays are numbered 0 = Sunday … 6 = Saturday. "That weekday of the event's week" means the Monday–Sunday week.
- Owners are plain text, defaulting to "Unassigned" (never null).
- A task's due date is always event date + `offset_days`, computed when read; nothing is rewritten when an event moves, except weekday-anchored offsets in `rescheduleEvent`.
- Spec clarification: `template_items` also gets `is_postmortem BOOLEAN NOT NULL DEFAULT FALSE` (the spec says generated tasks take it "from the template" but lists no column).
- Apply the schema to the local database with `set -a && . apps/web/.env.local && set +a && pnpm --filter @penntools/platform db:deploy`. Verify with `pnpm typecheck`, `pnpm check:tools`, `pnpm test`.
- Commit after each task only when Joe wants commits; tool-logic commits go to Joe for review.

## Review Focus

- Moving an event to a blank date and back: offsets survive, due dates reappear, anchored tasks recomputed for the new weekday.
- Moving an event by zero days or to the same date: `moved` and `recomputed` are 0 and nothing is rewritten.
- A task whose weekday-anchored item has no template version on its event (event never had a checklist): left alone, no error.
- A subtask whose parent item is in a module that wasn't chosen: dropped, not left orphaned.
- Dates on boundaries: 29 February 2028, year end, and the US daylight-saving changes (2026-03-08, 2026-11-01).
- A role named in different case ("ops lead" vs "Ops Lead") or held by no one: still resolves, or falls back to the Pub Leader.
- An invalid `newDate` string: throws a clear error and changes nothing.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/pass-it-on/schema.sql` (modify) | Template, module, item, event-module, task and member tables; `events.template_version_id` |
| `tools/pass-it-on/src/checklist.ts` (create) | Types, `dueDate`, `anchorOffset`, `generateTasks`, `rescheduleEvent` |
| `tools/pass-it-on/src/index.ts` (modify) | Export the above |
| `tools/pass-it-on/src/__tests__/checklist.test.ts` (create) | Pure-function tests |
| `tools/pass-it-on/src/__tests__/checklistDb.test.ts` (create) | Schema and `rescheduleEvent` tests on a throwaway schema |

---

### Task 1: Schema

**Files:**
- Modify: `tools/pass-it-on/schema.sql`
- Test: `tools/pass-it-on/src/__tests__/checklistDb.test.ts`

**Interfaces:**
- Produces (tables used by Tasks 4 and by steps 14–15):
  - `template_versions (id BIGINT identity PK, version INTEGER UNIQUE NOT NULL, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), reverted_from INTEGER)`.
  - `template_modules (version_id BIGINT REFERENCES template_versions ON DELETE CASCADE, key TEXT, name TEXT NOT NULL, description TEXT, PRIMARY KEY (version_id, key))`.
  - `template_items (version_id, key TEXT, module_key TEXT NULL, parent_key TEXT NULL, title TEXT NOT NULL, phase TEXT CHECK IN ('pre','day_of','during','post'), area TEXT CHECK IN ('general','finance','marketing','operations','entertainment'), offset_days INTEGER NULL, anchor_weekday INTEGER NULL CHECK (anchor_weekday BETWEEN 0 AND 6), default_role TEXT NULL, notes TEXT NULL, sort INTEGER NOT NULL DEFAULT 0, is_postmortem BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (version_id, key), CHECK (offset_days IS NULL OR anchor_weekday IS NULL))`.
  - `event_modules (event_id UUID REFERENCES events ON DELETE CASCADE, module_key TEXT, PRIMARY KEY (event_id, module_key))`; `events.template_version_id BIGINT REFERENCES template_versions ON DELETE SET NULL`.
  - `tasks (id BIGINT identity PK, event_id UUID NULL REFERENCES events ON DELETE CASCADE, template_item_key TEXT NULL, parent_task_id BIGINT NULL REFERENCES tasks ON DELETE CASCADE, title TEXT NOT NULL, phase TEXT, area TEXT, offset_days INTEGER NULL, due_date DATE NULL, owner TEXT NOT NULL DEFAULT 'Unassigned', status TEXT NOT NULL DEFAULT 'todo' CHECK IN ('todo','doing','blocked','done'), waiting_on TEXT NULL, completed_at TIMESTAMPTZ NULL, is_postmortem BOOLEAN NOT NULL DEFAULT FALSE, notes TEXT NULL, source TEXT NOT NULL DEFAULT 'template' CHECK IN ('template','manual','meeting','inferred'), confirmed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`, with indexes on `(event_id)` and `(status)`.
  - `members (id BIGINT identity PK, name TEXT NOT NULL, role TEXT NULL, active BOOLEAN NOT NULL DEFAULT TRUE)` with a unique index on `lower(name)`.

- [ ] **Step 1: Write failing tests** in `checklistDb.test.ts` (same throwaway-schema harness as `library.test.ts`: `describe.skipIf(!databaseUrl)`, a `passiton_chk_test_<timestamp>` schema, apply `schema.sql`):
  - `creates the checklist tables`: query `information_schema.tables` and assert `template_versions`, `template_modules`, `template_items`, `event_modules`, `tasks`, `members` exist.
  - `schema.sql can be applied twice`: run `sql.unsafe(schemaSql)` again, expect no throw.
  - `rejects an item with both an offset and a weekday anchor` (insert item with `offset_days = -3, anchor_weekday = 1` → rejects) and `rejects a weekday above 6`.
  - `rejects a task with a bad status`; `a task's owner defaults to Unassigned`; `member names are unique ignoring case` (inserting "Diva" then "diva" rejects).
- [ ] **Step 2:** Run `pnpm --filter @penntools/tool-pass-it-on exec vitest run checklistDb` → FAIL (tables missing).
- [ ] **Step 3:** Append the tables above to `schema.sql` under a comment block "Checklist engine (steps 12–13, additive)". Create `template_versions` before everything that references it, and add `events.template_version_id` after it.
- [ ] **Step 4:** Run the tests → PASS. Apply the schema locally with the `db:deploy` command and confirm `passiton: schema ready`.
- [ ] **Step 5: Commit** (`feat(pass-it-on): checklist engine schema`).

### Task 2: Date math

**Files:**
- Create: `tools/pass-it-on/src/checklist.ts`
- Modify: `tools/pass-it-on/src/index.ts`
- Test: `tools/pass-it-on/src/__tests__/checklist.test.ts`

**Interfaces:**
- Produces: `dueDate(eventDate: string, offsetDays: number): string`; `anchorOffset(eventDate: string, weekday: number): number`; both throw `RangeError` for a date that isn't a real `YYYY-MM-DD` or, for `anchorOffset`, a weekday outside 0–6 / non-integer.

- [ ] **Step 1: Write failing tests:**
  - `dueDate`: `("2026-10-22", -7) → "2026-10-15"`, `("2026-10-22", 5) → "2026-10-27"`, `("2026-10-22", 0)` unchanged; month edge `("2026-11-02", -3) → "2026-10-30"`; year edge `("2027-01-02", -5) → "2026-12-28"`; leap day `("2028-03-01", -1) → "2028-02-29"` and `("2027-03-01", -1) → "2027-02-28"`; across daylight-saving changes `("2026-03-09", -2) → "2026-03-07"` and `("2026-11-02", -2) → "2026-10-31"`.
  - `anchorOffset` for a Thursday event (`"2026-10-22"`): Monday (1) → -3, Thursday (4) → 0, Sunday (0) → +3, Saturday (6) → +2; for a Sunday event (`"2026-10-25"`): Monday → -6; for a Monday event: Monday → 0, Sunday → +6.
  - `throws RangeError` for `"2026-02-30"`, `"not a date"`, and `anchorOffset("2026-10-22", 7)`.
- [ ] **Step 2:** Run `pnpm --filter @penntools/tool-pass-it-on exec vitest run checklist.test` → FAIL.
- [ ] **Step 3: Implement** both functions with `Date.UTC`; `anchorOffset` maps a weekday to a Monday-first index `(w + 6) % 7` and returns `index(weekday) - index(eventWeekday)`. Export from `index.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** (`feat(pass-it-on): checklist date math`).

### Task 3: Task generation

**Files:**
- Modify: `tools/pass-it-on/src/checklist.ts`, `tools/pass-it-on/src/index.ts`
- Test: `tools/pass-it-on/src/__tests__/checklist.test.ts` (extend)

**Interfaces:**
- Consumes: `dueDate`/`anchorOffset` (Task 2); `leaderOf`, `RoleInput` from `planning.ts`.
- Produces:
  - `type Phase = "pre" | "day_of" | "during" | "post"`; `type Area = "general" | "finance" | "marketing" | "operations" | "entertainment"`.
  - `interface TemplateItem { key: string; moduleKey: string | null; parentKey: string | null; title: string; phase: Phase; area: Area; offsetDays: number | null; anchorWeekday: number | null; defaultRole: string | null; notes: string | null; sort: number; isPostmortem: boolean }`.
  - `interface TaskDraft { templateItemKey: string; parentKey: string | null; title: string; phase: Phase; area: Area; offsetDays: number | null; owner: string; isPostmortem: boolean; notes: string | null; source: "template"; confirmed: false }`.
  - `generateTasks(items: TemplateItem[], moduleKeys: string[], event: { eventDate: string | null; roles: RoleInput[] }): TaskDraft[]`.

- [ ] **Step 1: Write failing tests** with a small fixture of items (base items, a "singles" module item, a subtask, an anchored Monday item, an item with neither offset nor anchor, a post-mortem item) and a Thursday event on `2026-10-22`:
  - `includes base items and only the chosen modules' items`.
  - `uses the item's offset, or the weekday anchor's offset`: Monday anchor → `-3`; the offset item `-7` → `-7`.
  - `leaves anchored offsets null for an undated event but keeps fixed offsets`.
  - `keeps subtasks linked to their parent by key, and drops a subtask whose parent isn't included`.
  - `an item with neither offset nor anchor becomes an undated standing task` (`offsetDays: null`, still generated).
  - `owner: the person with the item's default role, ignoring case; else the Pub Leader; else "Unassigned"` (three assertions; a role held by no one falls through).
  - `sorts by offset then sort order, with undated tasks last`.
  - `marks the post-mortem item and sets source "template", confirmed false on every task`.
  - `ignores unknown or duplicate module keys`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `generateTasks` per the spec: filter items (`moduleKey === null` or in `moduleKeys`), drop subtasks whose parent key isn't among the filtered items, compute offsets, resolve owners (role match first, then `leaderOf(roles)`, then "Unassigned"), sort. Export the types and function from `index.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** (`feat(pass-it-on): generate checklist tasks`).

### Task 4: Rescheduling

**Files:**
- Modify: `tools/pass-it-on/src/checklist.ts`, `tools/pass-it-on/src/index.ts`
- Test: `tools/pass-it-on/src/__tests__/checklistDb.test.ts` (extend)

**Interfaces:**
- Consumes: `dueDate`, `anchorOffset` (Task 2); the Task 1 tables.
- Produces: `rescheduleEvent(sql: Sql, eventId: string, newDate: string | null): Promise<{ from: string | null; to: string | null; moved: number; recomputed: number }>`. An unknown or malformed `eventId` returns `{ from: null, to: null, moved: 0, recomputed: 0 }`; a `newDate` that isn't a real `YYYY-MM-DD` (and isn't null) throws `RangeError` before touching anything.

- [ ] **Step 1: Write failing tests** (each builds its own event, a template version with items, and tasks by direct SQL):
  - `moves the event and counts unfinished tasks whose due date changed`: Thursday 2026-10-22 → 2026-10-29; two unfinished fixed-offset tasks and one done task → `moved: 2`, event date updated, offsets unchanged.
  - `recomputes unfinished weekday-anchored tasks for the new weekday`: Thursday → Friday (2026-10-23); a Monday-anchored task's offset goes `-3` → `-4`, its due date stays 2026-10-19, `recomputed: 1`, and it is not counted in `moved`.
  - `leaves done tasks alone`: a done anchored task keeps `offset_days = -3`.
  - `moving by zero days changes nothing`: same date → `{ moved: 0, recomputed: 0 }`.
  - `a blank date keeps offsets; a date after that restores due dates`: set `null`, then a real date; offsets unchanged throughout, and the anchored task is recomputed on the second move.
  - `an event with no template version: anchored tasks are left alone, no error`.
  - `an unknown or malformed id returns zeros; an invalid newDate throws and changes nothing` (`"2026-02-30"` rejects `RangeError`; the event's date is unchanged).
- [ ] **Step 2:** Run `pnpm --filter @penntools/tool-pass-it-on exec vitest run checklistDb` → FAIL.
- [ ] **Step 3: Implement** `rescheduleEvent` in one `sql.begin`: lock the event row (`FOR UPDATE`), update `event_date` and `updated_at`, then for unfinished tasks of the event compute old and new due dates; for tasks whose `template_item_key` matches an item with `anchor_weekday` in the event's `template_version_id`, set `offset_days = anchorOffset(newDate, weekday)` (skip when `newDate` is null). `moved` counts unfinished tasks whose due date (or lack of one) differs before and after; `recomputed` counts anchored tasks whose offset changed. Export from `index.ts`.
- [ ] **Step 4:** Run the whole tool suite (`pnpm --filter @penntools/tool-pass-it-on test`) → PASS; then `pnpm typecheck && pnpm check:tools && pnpm test`.
- [ ] **Step 5: Update PROGRESS.md** (steps 12 and 13 marked Done, with the test count) and commit (`feat(pass-it-on): reschedule events and their tasks`).

---

## Self-review notes

- **Spec coverage:** schema (T1: all tables, the two-way CHECK, `is_postmortem` added to items as a ruling), `dueDate`/`anchorOffset` (T2), `generateTasks` with subtasks, owners, undated and standing items, ordering, provenance (T3), `rescheduleEvent` with done tasks kept, weekday recompute, null date, zero results and bad input (T4).
- **Not here:** storing generated tasks (step 15), the template's content (14), pages (16–18); `generateTasks` returns drafts only, and `parentKey` is turned into `parent_task_id` by step 15's storage.
- **Types:** `TemplateItem`, `TaskDraft`, `Phase`, `Area` are defined once in Task 3 and consumed unchanged by Task 4 (which only reads columns).
