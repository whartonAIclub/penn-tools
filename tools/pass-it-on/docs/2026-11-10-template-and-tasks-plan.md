# Pub Template v1 and Task Storage (Steps 14–15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The schema amendments and `generateTasks` changes from the Chili Cook Off checklist, the Pub template v1 as data with `ensureTemplate`/`getTemplate`, and task and member storage.

**Architecture:** Everything is tool logic in `tools/pass-it-on/` (no pages). Schema amendments go in `schema.sql`; `generateTasks` gains per-partner-club repetition in `src/checklist.ts`; the template is data plus loader in `src/pubTemplate.ts`; task and member storage are in `src/tasks.ts` and `src/members.ts`.

**Tech Stack:** TypeScript, postgres.js, vitest (database tests use a throwaway schema, as in `checklistDb.test.ts`).

**Spec:** `tools/pass-it-on/docs/2026-11-10-template-and-tasks-design.md` (it amends `2026-11-10-checklist-engine-design.md`; where they differ, the new one wins). **The "Template v1 data" section of the spec is the source for every item's key, title, phase, area, timing, role, hint and note: copy them verbatim into `pubTemplate.ts`.**

## Global Constraints

- Edit only `tools/pass-it-on/` (nothing under `apps/web`). Tool code never uses `process.env`, `fetch` or vendor SDKs; the only non-core import is `import type { Sql } from "postgres"`.
- `schema.sql` changes are additive and re-runnable. Postgres has no `ADD CONSTRAINT IF NOT EXISTS`: replace a constraint with `ALTER TABLE … DROP CONSTRAINT IF EXISTS <name>` then `ADD CONSTRAINT <name> …`.
- Dates are `YYYY-MM-DD`; all date math is UTC. Weekdays 0 = Sunday … 6 = Saturday.
- Owners are plain text, never null, default "Unassigned". A task's due date is computed when read (`events.event_date + offset_days`); `due_date` is only for ongoing to-dos (`event_id` NULL). Never write `due_date` for an event task.
- Categories derive from phase: `pre` → Planning; `day_of`, `during`, `post` → Run of show.
- Statuses: `todo`, `doing`, `blocked`, `done`, `skipped`. Areas: `general`, `finance`, `marketing`, `operations`, `entertainment`, `partners`. Phases: `pre`, `day_of`, `during`, `post`.
- Verify with `pnpm typecheck`, `pnpm check:tools`, `pnpm test`. Apply the schema locally with `set -a && . apps/web/.env.local && set +a && pnpm --filter @penntools/platform db:deploy` (confirm `passiton: schema ready`).
- Commit only if Joe asks; this run leaves changes uncommitted for his review.

## Review Focus

- Partner club names that collide after slugging ("Ski & Food" vs "Ski + Food"), repeat with different case, are blank, or contain regex-like characters or `:`: keys stay unique, blanks and duplicates ignored.
- An event with no partner clubs, or with the club-collab module not chosen: no per-club tasks, no error.
- Running `ensureTemplate` twice, and two at once: one version 1, no duplicate items.
- Running `createEventTasks` twice, and with a child draft listed before its parent: no duplicates, parent links correct, no orphan links.
- `listTasks` windows: a task due exactly on `from` or `to` is included; ongoing to-dos use `due_date`; undated tasks only when asked or when no window is given; tasks of other events never leak into an `eventIds` filter.
- Marking a task done and then back to todo: `completed_at` set then cleared; `skipped` doesn't set it.
- Deleting an event removes its tasks; deleting a parent task removes its subtasks; `createTodo` with contradictory fields (event plus due date, or no event plus offset) is refused.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/pass-it-on/schema.sql` (modify) | Constraint replacements, new columns, `template_issues` |
| `tools/pass-it-on/src/checklist.ts` (modify) | New fields, per-club generation, `categoryOf`, `suggestedModules`, `ownerOf` trim |
| `tools/pass-it-on/src/pubTemplate.ts` (create) | `PUB_TEMPLATE_V1`, `ensureTemplate`, `getTemplate` |
| `tools/pass-it-on/src/tasks.ts` (create) | `createEventTasks`, `listTasks`, `updateTask`, `createTodo`, `deleteTask` |
| `tools/pass-it-on/src/members.ts` (create) | `listMembers`, `addMember`, `setMemberActive`, `syncMembers` |
| `tools/pass-it-on/src/index.ts` (modify) | Exports |
| `src/__tests__/checklistDb.test.ts`, `checklist.test.ts` (modify); `pubTemplate.test.ts`, `tasks.test.ts` (create) | Tests |

---

### Task 1: Schema amendments

**Files:**
- Modify: `tools/pass-it-on/schema.sql`
- Test: `tools/pass-it-on/src/__tests__/checklistDb.test.ts`

**Interfaces:**
- Produces:
  - `template_items.repeat_for TEXT NULL CHECK (repeat_for IN ('partner_club'))`; `template_items.time_hint TEXT NULL`; `tasks.time_hint TEXT NULL`; `tasks.partner TEXT NULL`.
  - `template_items` constraint `template_items_area_check` now allows `'partners'`; `template_items.phase` and `.area` are `NOT NULL`.
  - `tasks` constraints `tasks_status_check` (adds `'skipped'`), `tasks_phase_check` and `tasks_area_check` (same value lists as `template_items`; NULL allowed).
  - `template_issues (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_id BIGINT NOT NULL REFERENCES template_versions (id) ON DELETE CASCADE, item_key TEXT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')))`.

- [ ] **Step 1: Write failing tests** (extend `checklistDb.test.ts`; update any existing insert into `template_items` that omits `phase`/`area` so it still passes):
  - `accepts the partners area and the skipped status`: insert a template item with `area = 'partners'`, a task with `area = 'partners'` and one with `status = 'skipped'`.
  - `rejects a bad task phase, a bad task area and a template item without a phase`, asserting Postgres error codes (`23514` check violation, `23502` not-null).
  - `has the new columns`: `repeat_for`, `time_hint` on template items; `time_hint`, `partner` on tasks (`information_schema.columns`).
  - `rejects a repeat_for other than partner_club`.
  - `template_issues defaults to open, rejects a bad status, and is removed with its version`.
  - `schema.sql can be applied twice` still passes (the existing test).
- [ ] **Step 2:** Run `pnpm --filter @penntools/tool-pass-it-on exec vitest run checklistDb` → FAIL.
- [ ] **Step 3: Append to `schema.sql`** under a comment "Template and task amendments (additive)": `ADD COLUMN IF NOT EXISTS` for the four columns; `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` for `template_items_area_check`, `tasks_status_check`, `tasks_phase_check`, `tasks_area_check`; `ALTER COLUMN … SET NOT NULL` for `template_items.phase` and `.area`; `CREATE TABLE IF NOT EXISTS template_issues`. The unnamed original check on `template_items.phase`/`area` uses Postgres's default names `template_items_phase_check` and `template_items_area_check`; the original `tasks.status` check is `tasks_status_check`.
- [ ] **Step 4:** Run the tests → PASS; run the whole tool suite; apply the schema locally and confirm `passiton: schema ready`.
- [ ] **Step 5: Commit** (only if Joe asks).

### Task 2: Generation changes

**Files:**
- Modify: `tools/pass-it-on/src/checklist.ts`, `tools/pass-it-on/src/index.ts`
- Test: `tools/pass-it-on/src/__tests__/checklist.test.ts`

**Interfaces:**
- Consumes: existing `TemplateItem`, `TaskDraft`, `generateTasks`, `anchorOffset`, `leaderOf`.
- Produces:
  - `type Area` gains `"partners"`; `TemplateItem` gains `repeatFor: "partner_club" | null`, `timeHint: string | null`; `TaskDraft` gains `timeHint: string | null`, `partner: string | null`.
  - `generateTasks(items: TemplateItem[], moduleKeys: string[], event: { eventDate: string | null; roles: RoleInput[]; partnerClubs: string[] }): TaskDraft[]`.
  - `categoryOf(phase: Phase): "planning" | "run_of_show"`; `suggestedModules(event: { partnerClubs: string[] }): string[]`.

- [ ] **Step 1: Write failing tests** (update the existing fixtures with `repeatFor: null`, `timeHint: null` and `partnerClubs: []`):
  - `repeats an item once per partner club, with {club} replaced everywhere in the title`: clubs `["Ski Club", "Food Club"]`, item `collab-names` → two drafts titled `Ski Club: …`/`Food Club: …`, `templateItemKey` `collab-names:ski-club`/`collab-names:food-club`, `partner` set.
  - `repeats subtasks with their parent and links each to its own club's parent` (`parentKey` is the per-club parent key).
  - `yields no per-club tasks without partner clubs, and still yields other module tasks`.
  - `ignores blank and repeated club names (ignoring case) and keeps keys unique when names collide after slugging` ("Ski & Food" and "Ski + Food" → `…:ski-food` and `…:ski-food-2`).
  - `copies the time hint through`.
  - `matches a default role ignoring surrounding spaces and case` (`defaultRole: " ops lead "`).
  - `categoryOf maps pre to planning and day_of, during, post to run_of_show`.
  - `suggestedModules returns ["club-collab"] when there are partner clubs, else []`.
- [ ] **Step 2:** Run `pnpm --filter @penntools/tool-pass-it-on exec vitest run checklist.test` → FAIL.
- [ ] **Step 3: Implement**: `repeatFor` items expand per unique club (slug = lowercase, runs of non-alphanumerics → `-`, trimmed of `-`; a repeated slug gets `-2`, `-3`…); `{club}` replaced in the title; `partner` set to the club's name; a subtask of a repeated parent expands with it and its `parentKey` becomes the per-club parent key; a repeated item's subtasks must themselves be marked `repeatFor`-inherited (they repeat because their parent does). Trim `defaultRole` in `ownerOf`. Export `categoryOf`, `suggestedModules` and the new fields from `index.ts`.
- [ ] **Step 4:** Run tests → PASS; run `pnpm --filter @penntools/tool-pass-it-on exec tsc --noEmit` (fixtures elsewhere may need the new fields).
- [ ] **Step 5: Commit** (only if Joe asks).

### Task 3: The Pub template

**Files:**
- Create: `tools/pass-it-on/src/pubTemplate.ts`
- Modify: `tools/pass-it-on/src/index.ts`
- Test: `tools/pass-it-on/src/__tests__/pubTemplate.test.ts`

**Interfaces:**
- Consumes: `TemplateItem` (Task 2); the Task 1 tables.
- Produces:
  - `PUB_TEMPLATE_V1: { note: string; modules: { key: string; name: string; description: string | null }[]; items: TemplateItem[]; issues: { itemKey: string | null; text: string }[] }` with the items, modules (`club-collab`, `singles`, `international`) and the one issue exactly as in the spec's "Template v1 data" (a `sort` per item in listed order, increasing by 10; assumed items carry the note text `Assumed: confirm`).
  - `ensureTemplate(sql: Sql): Promise<number>` → the id of version 1.
  - `interface LoadedTemplate { versionId: number; version: number; note: string | null; modules: { key: string; name: string; description: string | null }[]; items: TemplateItem[]; issues: { id: number; itemKey: string | null; text: string; status: "open" | "resolved" }[] }`; `getTemplate(sql: Sql, versionId?: number): Promise<LoadedTemplate | null>` (latest version by default; null if none).

- [ ] **Step 1: Write failing tests:**
  - `the template is internally consistent` (pure): keys unique; every `parentKey` and `moduleKey` exists; no item has both an offset and an anchor; every `repeatFor` item belongs to a module; every item with the note "Assumed: confirm" is exactly the spec's assumed set (list them in the test).
  - `has the dated items from the Halloween checklist`: flyer T-14, po T-10, budget T-7, partiful T-7, campusgroups T-7, food-order T-7, whatsapp-monday anchored to Monday (1), whatsapp-day T-0, attendance/feedback/receipts/postmortem T+5, postmortem flagged `isPostmortem`.
  - `puts day_of, during and post items in the run of show category` (via `categoryOf`) and gives every item a phase and an area.
  - (database) `ensureTemplate inserts version 1 once and returns the same id on a second call and on two concurrent calls`; `getTemplate returns what was inserted` (deep-equals `PUB_TEMPLATE_V1.items` and modules, one open issue on `po`); `getTemplate returns null when there is no template`.
  - `generating tasks for a Thursday event (2026-11-12) with clubs ["Ski Club", "Food Club"] and modules ["club-collab"]` gives per-club tasks `collab-upload:ski-club` with offset -2 and `collab-transfer:food-club` with offset +5, the Monday WhatsApp at offset -3, and with no clubs gives none of the `collab-` per-club tasks.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the data (copy from the spec) and the two functions. `ensureTemplate`: one transaction; `INSERT INTO template_versions (version, note) VALUES (1, …) ON CONFLICT (version) DO NOTHING RETURNING id`; when a row comes back insert modules, items and issues, otherwise select version 1's id. `getTemplate` maps rows to `TemplateItem` (snake_case columns to camelCase). Export from `index.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** (only if Joe asks).

### Task 4: Task storage

**Files:**
- Create: `tools/pass-it-on/src/tasks.ts`
- Modify: `tools/pass-it-on/src/index.ts`
- Test: `tools/pass-it-on/src/__tests__/tasks.test.ts`

**Interfaces:**
- Consumes: `TaskDraft`, `Phase`, `Area` (Task 2); tables from Tasks 1 and 3's `ensureTemplate` (tests may use it).
- Produces:
  - `type TaskStatus = "todo" | "doing" | "blocked" | "done" | "skipped"`; `MAX_TASK_TITLE = 300`.
  - `interface TaskRow { id: number; eventId: string | null; eventTitle: string | null; eventDate: string | null; templateItemKey: string | null; parentTaskId: number | null; title: string; phase: Phase | null; area: Area | null; offsetDays: number | null; dueDate: string | null; owner: string; status: TaskStatus; waitingOn: string | null; completedAt: string | null; isPostmortem: boolean; notes: string | null; source: "template" | "manual" | "meeting" | "inferred"; confirmed: boolean; timeHint: string | null; partner: string | null }`. `dueDate` is computed: `event_date + offset_days` for event tasks (null if either is null), `due_date` for ongoing to-dos.
  - `createEventTasks(sql: Sql, eventId: string, drafts: TaskDraft[], options?: { templateVersionId?: number; moduleKeys?: string[] }): Promise<number>` — number of new tasks.
  - `listTasks(sql: Sql, filter?: { owner?: string; from?: string; to?: string; eventIds?: string[]; statuses?: TaskStatus[]; includeUndated?: boolean }): Promise<TaskRow[]>`.
  - `updateTask(sql: Sql, id: number, change: { title?: string; status?: TaskStatus; owner?: string | null; waitingOn?: string | null; notes?: string | null; timeHint?: string | null; offsetDays?: number | null; dueDate?: string | null; confirmed?: boolean }): Promise<boolean>` — false for an unknown id; throws `RangeError` for an unknown status, a blank title, a blank-string owner, or a malformed `dueDate`.
  - `createTodo(sql: Sql, input: { title: string; owner?: string; eventId?: string; offsetDays?: number; dueDate?: string; notes?: string; timeHint?: string; source?: "manual" | "meeting" | "inferred" }): Promise<number>` — the new task's id; throws `RangeError` for a blank title, an event with a `dueDate`, no event with an `offsetDays`, or an unknown event (foreign-key failure surfaced as a `RangeError`).
  - `deleteTask(sql: Sql, id: number): Promise<boolean>`.

- [ ] **Step 1: Write failing tests** (throwaway schema; each test builds its events by SQL):
  - `createEventTasks inserts drafts, parents before children, and links each child to its parent`, including a child listed before its parent and a per-club parent/child pair.
  - `createEventTasks twice adds nothing the second time and returns 0`; the event's `template_version_id` and `event_modules` are recorded once.
  - `createEventTasks links a child to a parent created by an earlier run`.
  - `listTasks computes due dates from the event date and the offset, and uses due_date for ongoing to-dos`.
  - `listTasks filters by owner (ignoring case), window (inclusive at both ends), event, and status; undated tasks only when no window is given or includeUndated is true`.
  - `listTasks orders by due date, then offset, with undated last`.
  - `updateTask sets completed_at when done and clears it when the task leaves done; skipped doesn't set it`.
  - `updateTask rejects an unknown status, a blank title and a blank owner; owner null becomes Unassigned; unknown id returns false`.
  - `createTodo makes an event task (offset) or an ongoing to-do (due date) with source manual; refuses contradictory fields`.
  - `deleteTask removes a parent's subtasks; deleting the event removes its tasks`.
- [ ] **Step 2:** Run `pnpm --filter @penntools/tool-pass-it-on exec vitest run tasks.test` → FAIL.
- [ ] **Step 3: Implement** in `tasks.ts`. `createEventTasks`: one `sql.begin`, order drafts so a parent comes before its children (a child whose `parentKey` isn't among the drafts looks the parent up among the event's existing tasks by `template_item_key`; if none, `parent_task_id` stays null), insert with `ON CONFLICT DO NOTHING` against `tasks_event_item_idx`, count only inserted rows, update `events.template_version_id` when given and insert `event_modules` with `ON CONFLICT DO NOTHING`. `listTasks` computes `dueDate` in SQL and applies filters there.
- [ ] **Step 4:** Run → PASS; whole tool suite.
- [ ] **Step 5: Commit** (only if Joe asks).

### Task 5: Members and wrap-up

**Files:**
- Create: `tools/pass-it-on/src/members.ts`
- Modify: `tools/pass-it-on/src/index.ts`, `tools/pass-it-on/PROGRESS.md`
- Test: `tools/pass-it-on/src/__tests__/members.test.ts`

**Interfaces:**
- Produces:
  - `interface Member { id: number; name: string; role: string | null; active: boolean }`.
  - `listMembers(sql: Sql, options?: { activeOnly?: boolean }): Promise<Member[]>` ordered by lower-cased name.
  - `addMember(sql: Sql, name: string, role?: string): Promise<number>` — the id; an existing name (ignoring case) returns the existing id unchanged; throws `RangeError` for a blank name or one over 200 characters.
  - `setMemberActive(sql: Sql, id: number, active: boolean): Promise<boolean>`.
  - `syncMembers(sql: Sql): Promise<number>` — adds the distinct non-blank names found in `event_roles.person` and `tasks.owner` (never "Unassigned"; trimmed; case-insensitively new), returns how many were added; idempotent.

- [ ] **Step 1: Write failing tests:** add/list ordering ignoring case; adding "diva" after "Diva" returns the same id and keeps the original spelling; blank and over-long names throw `RangeError`; `activeOnly`; `setMemberActive` for a known and an unknown id; `syncMembers` picks up role people and task owners, skips "Unassigned" and blanks, trims, is idempotent, and returns 0 on the second call.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** with `INSERT … ON CONFLICT (lower(name)) DO NOTHING` (the unique index `members_name_lower_idx` is on `lower(name)`); `syncMembers` is one `INSERT … SELECT DISTINCT` per source. Export everything from Tasks 3–5 from `index.ts`.
- [ ] **Step 4:** Run the whole tool suite, then `pnpm typecheck && pnpm check:tools && pnpm test`.
- [ ] **Step 5:** Update PROGRESS.md: steps 14 and 15 marked Done with the test count, and add one line under "Decisions taken" about the Run of show category and the per-club repeating items. Commit only if Joe asks.

---

## Self-review notes

- **Spec coverage:** amendments to 12–13 (T1 schema, T2 generation, categoryOf, suggestedModules, role trim), template data, `ensureTemplate`, `getTemplate`, consistency tests and the Halloween dated items (T3), the whole of step 15 including topological create and idempotence (T4), members including `syncMembers` (T5). Template data is copied from the spec, not restated here, to keep one source.
- **Deferred minors from the 12–13 review now addressed:** `template_items` NOT NULL (T1), `tasks.phase`/`area` checks (T1), role trimming (T2). Not addressed on purpose: `ON DELETE SET NULL` on `events.template_version_id`, the `leaderOf` fallback, parent cycles.
- **Types:** `TemplateItem`/`TaskDraft` fields are extended once (T2) and consumed unchanged by T3 and T4.
