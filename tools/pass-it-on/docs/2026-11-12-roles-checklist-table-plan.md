# Roles, Checklist Table, Event Order and Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every event a fixed set of role slots that decide who owns its tasks, turn the Board into a one-click checklist table, trim the template's modules, list events soonest-first with past events folded away, and let an event list specialized equipment that becomes tasks.

**Architecture:**
- **Roles** become canonical slot names, normalized whenever they're written. The slots are the screenshot's six plus three new leads.
- **Owner chain.** Each template item names a role. A task's owner is resolved through a fixed chain, and the task remembers which role it came from (`tasks.owner_role`), so a change of role holder moves the unfinished tasks with it.
- **Template version 2** is a new built-in version, with the modules changed and a role on every item. Events already on version 1 keep it.
- **Web side:** the Board page becomes a table, and a new Roles tab shows the screenshot's grid.

**Tech Stack:** TypeScript (strict), postgres.js, Vitest against a throwaway schema, Next.js App Router (server components and server actions), CSS Modules.

**Spec:** the requirements below (from Joe, 2026-11-12), plus the existing designs in this folder: `2026-11-10-checklist-engine-design.md` and `2026-11-10-template-and-tasks-design.md`.

## Requirements (verbatim, with Joe's answers)

1. The checklist should be a table, optimized for readability and ease of use. Checking off a task should take one click. *Answer: replace the Board with this table.*
2. Remove the International Pub option for the checklist, and keep club collab. Broaden the singles Pub option to "Non-Wharton schools", which includes the Eventbrite and GAPSA tasks.
3. A better way to assign and track roles, following the screenshot's framework: CoS Owner | Pub Leader 1 | Pub Leader 2 | Pub Leader 3 | Prez Owner | Ops Lead. A cell can hold two people, e.g. "Diva/Arjun". *Answer:*
   - Create a **Marketing Lead** to own all marketing (emails, WhatsApps, graphics). The default is Manisha; the other marketing leads are Kira and Himanshi.
   - Create a **Finance Lead** to own budgets and contracts. The default is Marcela, and Charlie is the alternative.
   - The **Ops Lead** is ops-specific (logistics, equipment). It follows the calendar, and if no one is named the default is Michael.
   - The **Pub Leader** has the majority of tasks (run of show, scheduling, day-of tasks).
   - **CoS and Prez** are the catch-all.
   - Create an **Entertainment Lead** (default Billy) for DJ-related tasks.
5. Events are sorted by upcoming, nearest at the top. Past events go in a drop-down at the bottom.
6. Each event has a "Specialized equipment" option. When it's checked, a text input appears for the equipment the event needs; anything entered creates event-specific tasks. *Answer: source and return.*

## Global Constraints

- **Scope:** edit only `tools/pass-it-on/` and `apps/web/src/app/tools/pass-it-on/` (CLAUDE.md section 2).
- **No commits by implementers.** Joe reviews tool-logic changes and commits (PROGRESS.md). Each task ends with "stop for review", not a commit.
- **`schema.sql` re-runs on every deploy.** Every statement must be re-runnable (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, idempotent `UPDATE`s).
- **Event tasks never store `due_date`;** it's event date + `offset_days`, computed when read.
- **Role slot names are exactly:** `CoS Owner`, `Pub Leader 1`, `Pub Leader 2`, `Pub Leader 3`, `Prez Owner`, `Ops Lead`, `Marketing Lead`, `Finance Lead`, `Entertainment Lead`.
- **Seeded role defaults are exactly:**
  - Marketing Lead: Manisha (alternates Kira, Himanshi)
  - Finance Lead: Marcela (alternate Charlie)
  - Ops Lead: Michael (no alternates)
  - Entertainment Lead: Billy (no alternates)
- **The new module is exactly:** key `non-wharton`, name "Non-Wharton schools".
- **Equipment tasks:** "Arrange: {item}" at T-7, plus one "Return rented or borrowed equipment" at T+1, both owned via `Ops Lead`.
- **Code rules:** server actions return errors as data (`ActionResult`), and no `any`.
- **Run tests with** `pnpm --filter @penntools/tool-pass-it-on exec vitest run <name>`. Postgres must be running (`docker start penntools-db`).

**Decision for Joe to confirm.** Seeding the defaults in `schema.sql` puts four board members' first names in the repo. This is the only way every laptop gets them. The alternative is to enter them once on the Roles tab (Task 7), with nothing in the repo.

## Owner resolution (used by Tasks 2–4)

An item's role is resolved for an event in this order. The first non-blank result wins.
- **A specialist slot** (CoS, Prez, Ops, Marketing, Finance or Entertainment): the slot's holder on the event → the club default for the slot → CoS Owner → Prez Owner → `"Unassigned"`.
- **A Pub Leader slot:** Pub Leader 1 → Pub Leader 2 → Pub Leader 3 → CoS Owner → Prez Owner → `"Unassigned"`.
- **An item with no role** (template version 1) is treated as `Pub Leader 1`.

`owner_role` stores the role asked for, not the slot that answered. Recomputing therefore picks up a newly filled slot.

## Template v2 roles (Task 2)

Rule, by area and phase:

| Area | Phase | Role |
|---|---|---|
| marketing | any | Marketing Lead |
| finance | any | Finance Lead |
| entertainment | any | Entertainment Lead |
| operations | pre | Ops Lead |
| operations | day_of, during, post | Pub Leader 1 |
| general or partners | any | Pub Leader 1 |

Explicit overrides: `partnerships` → Prez Owner, `membership-specials` → Prez Owner.

## Review Focus

1. **Imported calendar roles.** The calendar import produces "Pub Leader 1", "C-suite owner", "President owner" and "Diva/Arjun". These must normalize to slots, and "Diva/Arjun" must stay as one Prez Owner value. "No Pub Leader" must not fire for an event with only "Pub Leader 1" filled (Task 1).
2. **Changing a role holder after work has started.** Only unfinished tasks whose owner came from a role move. Done tasks and tasks someone reassigned by hand keep their owner (Task 3).
3. **An event generated from template v1 after v2 exists.** Re-running "Update checklist" stays on v1 and adds no duplicates. The module checkboxes come from the event's own version, not the latest (Tasks 2 and 6).
4. **Rapid clicks on the checklist checkbox.** The final state matches the last click. A failed save reverts the row and shows the error (Task 8, manual check).
5. **Messy equipment text:** blank lines, duplicates differing in case, and two names with the same slug. Each gives one task per distinct item. Editing a line's text removes the old unfinished task and adds the new one, and a done task survives (Task 4).

---

### Task 1: Role slots and normalization

**Files:**
- Create: `tools/pass-it-on/src/roles.ts`
- Modify: `tools/pass-it-on/src/planning.ts`. In `checkRoles`, return `normalizeRoles(roles)`. In `leaderOf`, take the first person in Pub Leader 1, then 2, then 3, then the old "pub leader"; failing those, the first named person (the fallback is unchanged).
- Modify: `tools/pass-it-on/src/calendar.ts:88-91`. Run the parsed roles through `normalizeRoles`, so proposals compare in canonical form.
- Modify: `tools/pass-it-on/src/board.ts`. `hasPubLeader`, and the SQL in `eventsWithoutLeader` and `eventReadiness`, match `lower(btrim(role)) IN ('pub leader 1','pub leader 2','pub leader 3','pub leader')`.
- Modify: `tools/pass-it-on/schema.sql` (append). Add an idempotent `UPDATE event_roles` that rewrites known variants to slot names. Unnumbered "pub leader" rows get numbered per event by `position` (`row_number()` over the event's Pub Leader rows, offset past any already-numbered ones).
- Modify: `tools/pass-it-on/src/index.ts` (exports)
- Test: `tools/pass-it-on/src/__tests__/roles.test.ts`

**Interfaces:**
- Produces:
  - `ROLE_SLOTS: readonly ["CoS Owner","Pub Leader 1","Pub Leader 2","Pub Leader 3","Prez Owner","Ops Lead","Marketing Lead","Finance Lead","Entertainment Lead"]`
  - `type RoleSlot = (typeof ROLE_SLOTS)[number]`
  - `canonicalRole(raw: string): string`
  - `normalizeRoles(roles: RoleInput[]): RoleInput[]`
  - `isPubLeaderRole(role: string): boolean`

- [ ] **Step 1: Write the failing tests** in `roles.test.ts` (pure, no DB):

```ts
it("maps variants to slots", () => {
  expect(canonicalRole(" c-suite owner ")).toBe("CoS Owner");
  expect(canonicalRole("Chief of Staff")).toBe("CoS Owner");
  expect(canonicalRole("President owner")).toBe("Prez Owner");
  expect(canonicalRole("ops")).toBe("Ops Lead");
  expect(canonicalRole("pub leader 2")).toBe("Pub Leader 2");
  expect(canonicalRole("Marketing")).toBe("Marketing Lead");
  expect(canonicalRole("Club contact")).toBe("Club contact"); // unknown: kept, trimmed
});
it("numbers unnumbered Pub Leaders in order, after numbered ones", () => {
  expect(normalizeRoles([{ role: "Pub Leader", person: "A" }, { role: "Pub Leader 1", person: "B" }, { role: "pub leader", person: "C" }]))
    .toEqual([{ role: "Pub Leader 1", person: "B" }, { role: "Pub Leader 2", person: "A" }, { role: "Pub Leader 3", person: "C" }]);
});
it("merges a slot named twice with '/', keeps 'Diva/Arjun' whole, orders slots first then others", () => {
  expect(normalizeRoles([{ role: "Club contact", person: "Z" }, { role: "Ops", person: "Ivana" }, { role: "Ops Lead", person: "Sam" }, { role: "Prez Owner", person: "Diva/Arjun" }]))
    .toEqual([{ role: "Prez Owner", person: "Diva/Arjun" }, { role: "Ops Lead", person: "Ivana/Sam" }, { role: "Club contact", person: "Z" }]);
});
it("a fourth Pub Leader becomes an extra 'Pub Leader' role, not lost", () => { /* 4 unnumbered → slots 1-3 + { role: "Pub Leader", person: D } kept among others */ });
```

Also add these:
- **`hasPubLeader`** in `eventWorkflow.test.ts`: true for `[{ role: "Pub Leader 2", person: "X" }]`.
- **A DB test.** An event saved with roles `[{role:"Pub Leader 1", person:"Diva"}]` is not in `eventsWithoutLeader`.
- **A `schema.sql` re-run test** in `checklistDb.test.ts`. Insert raw `event_roles` rows `("pub leader", "A")`, `("C-suite owner", "B")` and `("pub leader", "C")` for one event. Re-apply `schema.sql`, and expect `Pub Leader 1`/A, `CoS Owner`/B and `Pub Leader 2`/C. Re-apply again, and expect no change.

- [ ] **Step 2: Run, expect FAIL.** Run `pnpm --filter @penntools/tool-pass-it-on exec vitest run roles eventWorkflow checklistDb`. It fails with module-not-found errors and the new assertions.
- [ ] **Step 3: Implement `roles.ts`.** Do the matching on the trimmed, lower-cased text with spaces collapsed. The variant table:
  - cos, cos owner, chief of staff, c-suite owner, c suite owner → **CoS Owner**
  - prez, prez owner, pres owner, president, president owner → **Prez Owner**
  - ops, ops lead, operations lead → **Ops Lead**
  - marketing, marketing lead → **Marketing Lead**
  - finance, finance lead → **Finance Lead**
  - entertainment, entertainment lead → **Entertainment Lead**
  - pub leader and leader → unnumbered; pub leader 1/2/3 → **Pub Leader 1/2/3**

  Then wire `planning.ts`, `calendar.ts`, `board.ts` and `schema.sql` as listed under Files.
- [ ] **Step 4: Run the full tool suite.** Run `pnpm --filter @penntools/tool-pass-it-on exec vitest run`. Expect PASS. Update `calendar.test.ts` and `calendarStorage.test.ts` only where they assert raw role names that are now canonical.
- [ ] **Step 5: Stop for review** (no commit).

### Task 2: Template v2 and role-based owners in generation

**Files:**
- Modify: `tools/pass-it-on/src/roles.ts`. Add `RoleDefault` and `resolveOwner`, plus `listRoleDefaults` (it only reads; Task 3 adds the writes).
- Modify: `tools/pass-it-on/src/checklist.ts`:
  - `generateTasks`'s event parameter gains `roleDefaults: RoleDefault[]`.
  - `ownerOf` uses `resolveOwner`.
  - `TaskDraft` gains `ownerRole: string | null`.
- Modify: `tools/pass-it-on/src/tasks.ts`. `createEventTasks` inserts `owner_role`. `TaskRow` gains `ownerRole`, and `listTasks` returns it.
- Modify: `tools/pass-it-on/src/pubTemplate.ts`:
  - `PubTemplate` gains `source: string`; V1's is `"pub-v1"`.
  - Add `PUB_TEMPLATE_V2` (`source: "pub-v2"`, note "Roles on every item; Non-Wharton schools module replaces Singles and International").
  - `Spec` gains an optional `role`; `toItem` fills `defaultRole` for V2 by the rule table above.
  - `ensureTemplate` makes sure every built-in exists.
- Modify: `tools/pass-it-on/src/eventChecklist.ts`. Pass `roleDefaults: await listRoleDefaults(sql)`.
- Modify: `tools/pass-it-on/schema.sql` (append):
  - `role_defaults (role TEXT PRIMARY KEY, person TEXT, alternates TEXT[] NOT NULL DEFAULT '{}')`, plus the seed `INSERT … ON CONFLICT (role) DO NOTHING` from Global Constraints.
  - `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_role TEXT`.
  - `ALTER TABLE template_versions ADD COLUMN IF NOT EXISTS source TEXT`.
  - `UPDATE template_versions SET source = 'pub-v1' WHERE version = 1 AND reverted_from IS NULL AND source IS NULL`.
  - `CREATE UNIQUE INDEX IF NOT EXISTS template_versions_source_idx ON template_versions (source) WHERE source IS NOT NULL`.
- Test: `pubTemplate.test.ts`, `checklist.test.ts`, `eventWorkflow.test.ts` (update the `"international"`/`"singles"` module test to `"non-wharton"`), `roles.test.ts`.

**Interfaces:**
- Consumes: `ROLE_SLOTS`, `RoleSlot` and `normalizeRoles` from Task 1.
- Produces:
  - `interface RoleDefault { role: RoleSlot; person: string | null; alternates: string[] }`
  - `resolveOwner(role: string | null, roles: RoleInput[], defaults: RoleDefault[]): { owner: string; ownerRole: string }`
  - `listRoleDefaults(sql: Sql): Promise<RoleDefault[]>`
  - `PUB_TEMPLATE_V2: PubTemplate`
  - `ensureTemplate(sql): Promise<number>`, which returns the id of the newest **built-in** version
  - `TaskDraft.ownerRole`, `TaskRow.ownerRole`

V2's module keys are `["club-collab", "non-wharton"]`, and the non-Wharton module's description is "Events open to students from other schools: Eventbrite ticketing, GAPSA and outreach." V1's five singles items move into it with keys `nonwharton-schools`, `nonwharton-logo`, `nonwharton-newsletter`, `nonwharton-eventbrite` and `nonwharton-gapsa-review` (titles unchanged). The international items are dropped. The PO issue is kept.

`ensureTemplate` inserts each missing built-in at version `MAX(version)+1`, under `LOCK TABLE template_versions IN SHARE ROW EXCLUSIVE MODE`, in V1 → V2 order.

- [ ] **Step 1: Write the failing tests.**
  - `resolveOwner`, one case per chain link:
    - an Ops Lead holder wins;
    - an empty slot → default Michael;
    - no default → CoS → Prez → `"Unassigned"`;
    - Pub Leader 1 empty → Pub Leader 2;
    - `null` → behaves as Pub Leader 1, with `ownerRole: "Pub Leader 1"`.
  - `pubTemplate.test.ts`:
    - V2's module keys are `["club-collab","non-wharton"]`;
    - every V2 item's `defaultRole` is in `ROLE_SLOTS`;
    - `flyer`→Marketing Lead, `whatsapp-day`→Marketing Lead, `budget`→Finance Lead, `receipts`→Finance Lead, `dj`→Entertainment Lead, `food-order`→Ops Lead, `confirm-food`→Pub Leader 1, `nonwharton-eventbrite`→Ops Lead, `nonwharton-gapsa-review`→Finance Lead, `partnerships`→Prez Owner;
    - Pub Leader 1 owns more items than any other role.
  - `ensureTemplate`:
    - a fresh schema → versions 1 (`pub-v1`) and 2 (`pub-v2`), and the call returns version 2's id;
    - a second call adds nothing;
    - a DB holding version 1 plus a revert copy (version 2, `source` null) → the built-in V2 becomes version 3;
    - three calls in parallel leave exactly one `pub-v2`.
  - `eventWorkflow.test.ts`: a new event with roles `Ops Lead: Ivana`, `Pub Leader 1: Diva` and no Marketing Lead gets:
    - `food-order` owned by Ivana with `ownerRole` "Ops Lead";
    - `flyer` owned by Manisha (the seeded default);
    - `confirm-food` owned by Diva.
  - An event generated on V1 before V2 existed stays on V1 when regenerated, with `created: 0`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** as listed under Files.
- [ ] **Step 4: Run the full tool suite, expect PASS.**
- [ ] **Step 5: Stop for review.**

### Task 3: Owners follow role changes; defaults, single-cell edits, assignments grid

**Files:**
- Modify: `tools/pass-it-on/src/roles.ts`. Add `reassignRoleOwners`, `setRoleDefault`, `setEventRole` and `listRoleAssignments`.
- Modify: `tools/pass-it-on/src/planning.ts`. `updatePlannedEventIn` calls `reassignRoleOwners(tx, id)` after `setParties`.
- Modify: `tools/pass-it-on/src/tasks.ts`:
  - `updateTask` with an `owner` also sets `owner_role = NULL` (a hand-picked owner stops following the role).
  - The `listTasks` `owner` filter also matches any `/`-separated name, so `owner: "arjun"` finds "Diva/Arjun". Use `lower(${owner}) = ANY(SELECT btrim(x) FROM unnest(string_to_array(lower(owner), '/')) x)`.
- Test: `roles.test.ts` (DB block), `tasks.test.ts`.

**Interfaces:**
- Consumes: `resolveOwner` and `listRoleDefaults` (Task 2).
- Produces:
  - `reassignRoleOwners(tx: Sql, eventId: string | null): Promise<number>`. It sets `owner` on unfinished tasks (status not done or skipped) with a non-null `owner_role`, for one event or for all when null, and returns how many changed.
  - `setRoleDefault(sql, role: RoleSlot, person: string | null, alternates: string[]): Promise<void>`. It runs in one transaction, then calls `reassignRoleOwners(tx, null)`.
  - `setEventRole(sql, eventId: string, role: RoleSlot, person: string | null): Promise<boolean>`:
    - it upserts or deletes the one `event_roles` row;
    - it recomputes `events.pub_leader` and `organizer_name` with `leaderOf`;
    - it calls `reassignRoleOwners(tx, eventId)`;
    - it returns false for an unknown event.
  - `interface RoleAssignment { eventId: string; title: string; eventDate: string | null; cancelled: boolean; roles: Record<RoleSlot, string | null>; openTasks: number }`
  - `listRoleAssignments(sql, options: { from?: string }): Promise<RoleAssignment[]>`. It returns events dated on or after `from`, plus undated ones (all events when `from` is omitted), in date order.

- [ ] **Step 1: Write the failing tests.**
  - **Ops Lead change.** Generate for an event with Ops Lead Michael, then mark `merch-ready` done. `updatePlannedEvent` with Ops Lead Ivana gives:
    - `food-order` → Ivana;
    - `merch-ready` stays Michael;
    - a task reassigned by hand to "Sam" (via `updateTask`) stays Sam, with `ownerRole` null.
  - **Clearing the slot.** Clearing Ops Lead moves `food-order` to the default, Michael.
  - **Club default change.** `setRoleDefault("Marketing Lead", "Kira", ["Manisha","Himanshi"])` moves unfinished `flyer` tasks to Kira on events with no Marketing Lead. It doesn't touch an event whose Marketing Lead is Himanshi.
  - **Single-cell edit.** `setEventRole(id, "Pub Leader 1", "Benji")` → `getPlannedEvent(...).pubLeader` is Benji, and `confirm-food` → Benji. With `null`, the row is removed. An unknown id → false.
  - **Assignments grid.** `listRoleAssignments({ from })` excludes past events and returns "Diva/Arjun" as one Prez Owner value.
  - **Owner filter.** `listTasks({ owner: "Arjun" })` finds a task owned by "Diva/Arjun", and `owner: "Ar"` finds nothing.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full tool suite, expect PASS.**
- [ ] **Step 5: Stop for review.**

### Task 4: Specialized equipment (tool)

**Files:**
- Modify: `tools/pass-it-on/schema.sql`. Add `ALTER TABLE events ADD COLUMN IF NOT EXISTS needs_equipment BOOLEAN NOT NULL DEFAULT FALSE` and `… ADD COLUMN IF NOT EXISTS equipment TEXT`, which holds the items joined by `\n`.
- Modify: `tools/pass-it-on/src/planning.ts`:
  - `PlannedEventInput` gains `needsEquipment: boolean` and `equipment: string[]`.
  - `checkPlannedEventInput` accepts `equipment` as a string (split on newlines) or a string array. It trims each line, drops blanks and case-insensitive duplicates, and allows at most `MAX_EQUIPMENT = 20` lines of at most 200 characters each. With `needsEquipment` false, the list is `[]`.
  - Create and update write the columns and call `syncEquipmentTasks(tx, id, input.needsEquipment ? input.equipment : [])`.
  - `getPlannedEvent` returns both fields.
- Create: `tools/pass-it-on/src/equipment.ts`
- Test: `tools/pass-it-on/src/__tests__/equipment.test.ts`

**Interfaces:**
- Consumes: `resolveOwner` and `listRoleDefaults` (Task 2).
- Produces:
  - `MAX_EQUIPMENT = 20`
  - `syncEquipmentTasks(tx: Sql, eventId: string, items: string[]): Promise<{ added: number; removed: number }>`. Desired tasks are:
    - `equipment:<slug>` per item, using the same slug rule as clubs (`-2` on a clash): title `Arrange: {item}`, phase `pre`, area `operations`, offset -7;
    - when any item exists, `equipment-return`: title "Return rented or borrowed equipment", phase `post`, area `operations`, offset 1.

    Each task has `source: "manual"`, `owner_role: "Ops Lead"`, and its owner from `resolveOwner("Ops Lead", …)`. Missing ones are inserted with `ON CONFLICT DO NOTHING`. Unfinished `equipment:%`/`equipment-return` tasks no longer desired are deleted. Done tasks are never deleted.

- [ ] **Step 1: Write the failing tests.**
  - **Create.** Create with `needsEquipment: true, equipment: ["Fog machine", "Projector"]`, dated 2026-12-03, Ops Lead empty. This gives `equipment:fog-machine` due 2026-11-26 owned by Michael, `equipment:projector`, and `equipment-return` due 2026-12-04.
  - **Removing a line.** Update with `["Fog machine"]` → the projector task is gone. If the projector task was done first, it stays.
  - **Unchecking** `needsEquipment` → every unfinished equipment task is gone.
  - **Messy input.** `equipment: "Fog machine\n\n fog machine \nFog-machine"` gives two items, "Fog machine" and "Fog-machine", with keys `equipment:fog-machine` and `equipment:fog-machine-2`.
  - **Too much input.** 21 lines, or a line of 201 characters, give `{ ok: false }` with a message.
  - **Date moves.** Moving the event's date moves the equipment tasks (offset-based, nothing extra to do).
  - **Ops Lead change.** Setting Ops Lead later via `updatePlannedEvent` moves them to the new holder (relies on Task 3).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full tool suite, expect PASS.** Fix the fixtures that build a `PlannedEventInput` by adding `needsEquipment: false, equipment: []`.
- [ ] **Step 5: Stop for review.**

### Task 5: Events soonest-first, past events folded

**Files:**
- Modify: `tools/pass-it-on/src/calendarView.ts`. Add `splitByToday`, and give `groupByMonth` an optional `order: "asc" | "desc"` (default `"asc"`).
- Modify: `apps/web/src/app/tools/pass-it-on/page.tsx`:
  - upcoming events grouped by month, ascending;
  - then the undated group;
  - then `<details><summary>Past events (N)</summary>…</details>`, grouped by month in descending order (most recent first);
  - all from `today()`.
- Test: `calendarView.test.ts`

**Interfaces:**
- Produces: `splitByToday(events: PlannedEventSummary[], today: string): { upcoming: PlannedEventSummary[]; undated: PlannedEventSummary[]; past: PlannedEventSummary[] }`. `upcoming` is `eventDate >= today`, ascending; `past` is descending. Cancelled events stay in their date's list.

- [ ] **Step 1: Write the failing tests.** Use events dated 2026-11-01, 2026-11-12, 2026-12-01 and null, with today 2026-11-12:
  - `upcoming` = [11-12, 12-01];
  - `past` = [11-01];
  - `undated` holds the null-dated event;
  - `groupByMonth(past, "desc")` gives months newest-first.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement,** then update `page.tsx`. Style `<details>` with a new `.pastEvents` class.
- [ ] **Step 4: Run the tests and `pnpm typecheck`, expect PASS.**
- [ ] **Step 5: Stop for review.**

### Task 6: Event form (role slots, equipment) and the event page's module list

**Files:**
- Modify: `apps/web/src/app/tools/pass-it-on/actions.ts`. `EventFormValues` gains `needsEquipment: boolean` and `equipment: string`, a textarea with one item per line.
- Modify: `apps/web/src/app/tools/pass-it-on/events/EventForm.tsx`. Replace the free role list with a labeled grid of the nine `ROLE_SLOTS` inputs:
  - Each input uses `list="pass-it-on-members"` (a datalist of members plus that role's alternates).
  - The lead slots show a placeholder like "Manisha (default)".
  - Below the grid, an "Other roles" list keeps the old add/remove UI for anything not in a slot, such as "Club contact".
  - A "Specialized equipment" checkbox reveals a textarea, "One item per line, e.g. Fog machine".
- Modify: `apps/web/src/app/tools/pass-it-on/events/emptyEventForm.ts`, `events/new/page.tsx` and `events/[id]/page.tsx`. Pass the slot values, `roleDefaults` and the members list. The `[id]` page passes `needsEquipment` and `equipment.join("\n")`. The `ChecklistPanel`'s `modules` come from `getTemplate(db(), eventVersionId)`: the event's own version when it has one, else the latest.
- Modify: `apps/web/src/app/tools/pass-it-on/calendar/ProposalCard.tsx`. Its `toFormValues` sets `needsEquipment: false, equipment: ""`.
- Modify: `apps/web/src/app/tools/pass-it-on/PassItOn.module.css`. Add `.roleGrid`: two columns of label and input, one column under 560px.

**Interfaces:**
- Consumes: `ROLE_SLOTS`, `listRoleDefaults` and `listMembers` from the tool package. `getPlannedEvent` returns `needsEquipment` and `equipment` (Task 4).
- Produces: `EventFormValues.needsEquipment` and `EventFormValues.equipment`.

- [ ] **Step 1: Implement the form, the pages and the proposal card.**
- [ ] **Step 2: Run `pnpm typecheck` and `pnpm check:tools`, expect PASS.**
- [ ] **Step 3: Manual check in the browser** (signed in):
  - **New event:** create one with Pub Leader 1 "Diva", Ops Lead blank, and equipment "Fog machine". On the Checklist tab, `food-order` is owned by Michael, there's an "Arrange: Fog machine" task, and the event isn't flagged "No Pub Leader".
  - **Edit:** setting Ops Lead to "Ivana" moves `food-order` to Ivana.
  - **Old event:** the page for a v1 event lists v1's modules.
- [ ] **Step 4: Stop for review.**

### Task 7: Roles tab

**Files:**
- Create: `apps/web/src/app/tools/pass-it-on/roles/page.tsx`. It's a server component with three parts:
  - **A grid** shaped like the screenshot. The columns are Event, Date, then the nine slots, inside a horizontally scrollable wrapper. It shows upcoming and undated events (`listRoleAssignments({ from: today() })`), with a "Show past events" link (`?past=1`) that drops `from`. Empty lead cells show the default greyed out.
  - **Who's doing what:** per person, the count of upcoming events where they hold any slot and their open tasks (`listTasks` with statuses todo, doing and blocked), with names split on `/`.
  - **Club defaults:** the four lead roles, each with a default and alternates.
- Create: `apps/web/src/app/tools/pass-it-on/roles/RolesGrid.tsx` (client). Each cell is an input that saves on blur through `setEventRoleAction`, then calls `router.refresh()`. A `RoleDefaultsForm` saves through `setRoleDefaultAction`. Errors show inline.
- Create: `apps/web/src/app/tools/pass-it-on/roles/actions.ts` (`"use server"`), following `board/actions.ts`:
  - `setEventRoleAction(eventId: string, role: string, person: string)`: a blank person means remove; a role not in `ROLE_SLOTS` → fail with "Unknown role." It returns `ActionResult<null>`.
  - `setRoleDefaultAction(role: string, person: string, alternates: string)`: alternates are comma-separated. It returns `ActionResult<null>`.

  Both call `syncMembers` after saving.
- Modify: `apps/web/src/app/tools/pass-it-on/Nav.tsx`. Add a Roles tab after Events.
- Modify: `PassItOn.module.css`. Add `.tableWrap` (`overflow-x: auto`), `.table`, and `.cellInput` (borderless until focus).

**Interfaces:**
- Consumes: `listRoleAssignments`, `setEventRole`, `setRoleDefault`, `listRoleDefaults` and `ROLE_SLOTS` (Tasks 1–3).

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run `pnpm typecheck` and `pnpm check:tools`, expect PASS.**
- [ ] **Step 3: Manual check:**
  - typing "Ivana" into an event's Ops Lead cell and tabbing away saves it, and the board's `food-order` for that event shows Ivana;
  - setting the Marketing Lead default to Kira updates the placeholders;
  - the grid scrolls sideways without the page scrolling sideways.
- [ ] **Step 4: Stop for review.**

### Task 8: Checklist table replaces the Board

**Files:**
- Create: `apps/web/src/app/tools/pass-it-on/board/ChecklistTable.tsx` (client). A `<table>` per group:
  - **Groups:** "Ongoing to-dos" first, then one group per event, soonest first.
  - **Group header:** event title (a link), date, "N of M done", a `<progress>`, and the "No Pub Leader" flag. Within an event, rows sit under "Planning" and "Run of show" sub-headers (`categoryOf`), sorted by due date.
  - **Columns:** ✓, Task, Due, Owner, Status. The Task cell shows the title, then the notes, partner, time hint and waiting-on as a muted second line. Subtasks are rows indented under their parent.
  - **The ✓ cell** is a native checkbox whose `onChange` alone saves `{ status: checked ? "done" : "todo" }`, with no confirm. It uses React `useOptimistic`, so the row strikes through immediately. If the action returns `ok: false`, the row goes back and the error shows in it.
  - **Owner** is an input with the members datalist, saved on blur.
  - **Status** is a `<select>` for Doing, Blocked and Skipped. Choosing Blocked reveals a "Waiting on" input in the row.
  - **Overdue** due dates are red.
  - **Delete** is shown only for `source === "manual"`.
- Modify: `apps/web/src/app/tools/pass-it-on/board/page.tsx`:
  - It renders `ChecklistTable` instead of the columns and drops the separate Readiness card (now in each group header). The filters and `AddTodo` stay.
  - **Done tasks:** hidden by default with "All events" selected, shown (struck through) when one event is selected. "Show done" overrides either way.
- Delete: `TaskCard` and `SubtaskRow` from `board/Board.tsx`; keep `AddTodo`.
- Modify: `Nav.tsx`. The tab label "Board" becomes "Checklist"; the URL stays `/board`.
- Modify: `PassItOn.module.css`:
  - Remove `.columns`, `.column` and `.taskCard`.
  - Add `.checkCell`, a 44×44px hit area so the checkbox is easy to click.
  - Add `.groupHeader`, `.subHeader`, `.subRow` (indent), and `.rowDone` (strike-through and muted).
  - Rows stack as cards under 560px.
- Modify: `events/ChecklistPanel.tsx`. Its link text becomes "Open the checklist".

**Interfaces:**
- Consumes: `TaskRow` (with `ownerRole`, from Task 2), `updateTaskAction`, `deleteTaskAction`, and `EventReadiness` from `eventReadiness`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run `pnpm typecheck`, `pnpm check:tools` and `pnpm test`, expect PASS.**
- [ ] **Step 3: Manual check:**
  - one click on a box strikes the row through, and a reload keeps it;
  - clicking the same box five times quickly ends in the state of the fifth click;
  - with the dev server stopped, a click reverts and shows an error;
  - one event's view lists Planning, then Run of show;
  - at 400px wide, the rows stack and nothing scrolls sideways.
- [ ] **Step 4: Stop for review.**

### Task 9: Wrap-up

**Files:**
- Modify: `tools/pass-it-on/PROGRESS.md`:
  - add a "2026-11-12 changes" row per requirement, with its status;
  - add the owner-resolution and template-v2 decisions under "Decisions taken";
  - add "Roles" and "Checklist" to the tab list.

- [ ] **Step 1: Run `pnpm typecheck && pnpm check:tools && pnpm test`.** Expect all to pass, and note the tool test count.
- [ ] **Step 2: Apply the schema to the local DB** with `DATABASE_URL="postgresql://penntools:penntools@localhost:5432/penntools" pnpm --filter @penntools/platform db:deploy`, then re-run it. Expect both runs to succeed (proving re-runnability).
- [ ] **Step 3: Do the browser pass,** signed in: the Events order with past events folded, the Roles tab, an event with equipment, and one-click check-off on the Checklist tab.
- [ ] **Step 4: Update PROGRESS.md and stop for Joe's review.**
