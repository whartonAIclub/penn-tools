# Calendar Import, Approval and Master Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user uploads a club's annual calendar spreadsheet; the AI proposes events; people approve, edit or skip them; approved events form the master calendar that anyone signed in can edit.

**Architecture:** Tool logic in `tools/pass-it-on/src/` (spreadsheet reader at the `imports` entry point, AI proposer and storage in the main entry). Proposals live in staging tables apart from `events`; approving one writes to the existing `events` table through `createPlannedEvent`/`updatePlannedEvent`. Pages, an upload route and server actions live in `apps/web/src/app/tools/pass-it-on/calendar/`.

**Tech Stack:** TypeScript, Next.js 14 (server actions, route handler), postgres.js, exceljs (already a dependency), Zod via `@penntools/core/ai`, vitest.

**Spec:** `tools/pass-it-on/docs/2026-11-10-calendar-import-design.md`

## Global Constraints

- Edit only `tools/pass-it-on/` and `apps/web/src/app/tools/pass-it-on/`. No new routes under `apps/web/src/app/api/`.
- Tool code imports types from `@penntools/core` only; no `process.env`, `fetch` or vendor SDKs. `z` comes from `@penntools/core/ai`; fields that may be missing are `.nullable()`, not `.optional()`.
- AI calls name the `provider` on every call and run in server code with the signed-in user's key (`getAI()` from `@/lib/ai`); AI errors return as data (`isAIError`), never thrown to the browser.
- `schema.sql` changes are additive and re-runnable (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`).
- Heavy file readers stay at `@penntools/tool-pass-it-on/imports`; `container.ts` must not load them.
- Names only, no emails. Run `checkUploadForCredentials` on every upload.
- Row cap per import: 300 (`MAX_CALENDAR_ROWS`). File-size cap: `MAX_UPLOAD_BYTES`.
- Nothing becomes an event until a person approves it.
- Verify with `pnpm typecheck`, `pnpm check:tools`, `pnpm test`. Local DB changes need `set -a && . apps/web/.env.local && set +a && pnpm --filter @penntools/platform db:deploy`.
- Commit after each task only when Joe has said commits are wanted; tool-logic commits go to Joe for review.

## Review Focus

- A calendar where the same event appears on two tabs (Pub's Signups and Draft): exactly one proposal per name+date.
- Dates in the file as real dates, as text ("Oct 22"), or missing: a date the AI can't pin to YYYY-MM-DD becomes `null`, never a guess; a text date without a year uses the calendar's season only if the file states it.
- A row of the file nobody can find (AI invents a row): dropped, not shown.
- Approving the same proposal twice (double-click, two people): one event, not two.
- Re-uploading the same file: every proposal "unchanged" and pre-skipped; no duplicate events.
- Empty workbook, workbook over 300 rows, or a non-spreadsheet file: a plain message, nothing saved.
- Credentials flagged in the file: upload refused or needs confirmation, as in the library.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/pass-it-on/schema.sql` (modify) | `calendar_imports`, `calendar_proposals`, `events.import_id`, `events.cancelled` |
| `tools/pass-it-on/src/imports/calendar.ts` (create) | Workbook bytes → numbered text rows |
| `tools/pass-it-on/src/calendar.ts` (create) | Proposal schema, AI proposer, source-row check, dedupe |
| `tools/pass-it-on/src/calendarStorage.ts` (create) | Imports and proposals in the database; matching; approve/skip/edit |
| `tools/pass-it-on/src/planning.ts` (modify) | `cancelled` and `importId` on events |
| `apps/web/.../calendar/upload/route.ts` (create) | Upload → read → AI → save import |
| `apps/web/.../calendar/actions.ts` (create) | Approve, skip, restore, edit, approve all, delete import |
| `apps/web/.../calendar/page.tsx`, `[importId]/page.tsx`, `CalendarUpload.tsx`, `ProposalCard.tsx` (create) | Calendar tab and approval screen |
| `apps/web/.../page.tsx`, `Nav.tsx`, `events/EventForm.tsx`, `PassItOn.module.css` (modify) | Month-grouped master calendar, tab, cancelled checkbox |

---

### Task 1: Schema and spreadsheet reader

**Files:**
- Modify: `tools/pass-it-on/schema.sql`
- Create: `tools/pass-it-on/src/imports/calendar.ts`
- Modify: `tools/pass-it-on/src/imports/index.ts`
- Test: `tools/pass-it-on/src/__tests__/calendar.test.ts`

**Interfaces:**
- Produces: `interface CalendarRow { sheet: string; row: number; text: string }`; `MAX_CALENDAR_ROWS = 300`; `class CalendarFormatError extends Error`; `calendarRows(filename: string, data: Uint8Array): Promise<CalendarRow[]>` (exported from `@penntools/tool-pass-it-on/imports`). `text` is the row's non-empty cells joined with ` | `, dates as `YYYY-MM-DD`, formulas as their cached result.

- [ ] **Step 1: Write failing tests** in `calendar.test.ts` (build workbooks in memory with exceljs):
  - `reads rows from every tab with sheet name and row number`: two tabs, assert `{ sheet: "Draft", row: 3, text: "2026-08-14 | Pre-Term Pub | Lucy's" }`-style output.
  - `skips empty rows and reads formula results`: a cell `{ formula: "A1", result: "Armory" }` yields "Armory".
  - `rejects non-spreadsheets and workbooks over 300 rows`: `.docx` filename and a 301-row sheet each throw `CalendarFormatError`.
  - `returns no rows for an empty workbook` → `[]`.
- [ ] **Step 2:** Run `pnpm --filter @penntools/tool-pass-it-on test calendar` → FAIL (module missing).
- [ ] **Step 3: Implement** `calendarRows` in `src/imports/calendar.ts` using the same `workbook.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer)` pattern as `imports/documents.ts`; accept `.xlsx` only (`.csv` optional: reuse `csv.ts` if trivial, otherwise reject with a message saying to save as .xlsx). Export it from `imports/index.ts`.
- [ ] **Step 4: Append to `schema.sql`:**
  ```sql
  CREATE TABLE IF NOT EXISTS calendar_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), filename TEXT NOT NULL, uploaded_by TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')));
  CREATE TABLE IF NOT EXISTS calendar_proposals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, import_id UUID NOT NULL REFERENCES calendar_imports (id) ON DELETE CASCADE,
    position INTEGER NOT NULL, sheet TEXT NOT NULL, row_number INTEGER NOT NULL, source_text TEXT NOT NULL,
    proposal JSONB NOT NULL, skip_reason TEXT, match_kind TEXT NOT NULL DEFAULT 'new' CHECK (match_kind IN ('new','changed','unchanged')),
    match_event_id UUID REFERENCES events (id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','skipped')),
    event_id UUID REFERENCES events (id) ON DELETE SET NULL, UNIQUE (import_id, position));
  ALTER TABLE events ADD COLUMN IF NOT EXISTS import_id  UUID REFERENCES calendar_imports (id) ON DELETE SET NULL;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled  BOOLEAN NOT NULL DEFAULT FALSE;
  ```
  (Format as the file's existing style; `calendar_imports` must be created before `events.import_id` is added.)
- [ ] **Step 5:** Run tests → PASS. Apply the schema locally with the `db:deploy` command above and confirm `passiton: schema ready`.
- [ ] **Step 6: Commit** (`feat(pass-it-on): calendar schema and spreadsheet reader`).

### Task 2: AI proposer

**Files:**
- Create: `tools/pass-it-on/src/calendar.ts`
- Modify: `tools/pass-it-on/src/index.ts`
- Test: `tools/pass-it-on/src/__tests__/calendar.test.ts` (extend)

**Interfaces:**
- Consumes: `CalendarRow` (Task 1 — redefine as a type-only import is not possible across entry points, so declare the same shape locally as `SourceRow` in `calendar.ts`); `checkPlannedEventInput`, `PlannedEventInput` from `planning.ts`.
- Produces:
  - `CalendarProposalSchema` (Zod): `{ sheet: string, row: number, skipReason: string | null, title: string | null, eventDate: string | null, eventTime: string | null, venue: string | null, partnerClubs: string[], roles: { role: string, person: string | null }[], notes: string | null, confirmedClub: boolean, confirmedVenue: boolean, clubContact: string | null, totalAttendees: number | null, dropIns: number | null, ticketRevenue: number | null, costs: number | null }`.
  - `interface EventProposal { sheet: string; row: number; sourceText: string; skipReason: string | null; input: PlannedEventInput | null }` (`input` is null for skipped rows with no usable title).
  - `proposeEvents(ai: AI, provider: AIProvider, rows: SourceRow[]): Promise<EventProposal[]>`.
  - `CALENDAR_SYSTEM_PROMPT: string`.

- [ ] **Step 1: Write failing tests** with a `fakeAI(object)` like `answer.test.ts`:
  - `drops proposals whose sheet and row aren't in the file`.
  - `keeps one proposal per name and date across tabs` (same "International Pub" 2026-10-22 on two tabs → one, the one with more filled fields).
  - `marks breaks and cancelled rows as skipped with the AI's reason` and keeps them in the result.
  - `turns Pub Leader 1/2/3 into three roles` (AI returns three roles; assert `input.roles.length === 3`).
  - `sets an unparseable date to null` (AI returns "Oct 22" → `eventDate: null`).
  - `sends the rows, with sheet and row numbers, in the prompt` (assert the request content contains `[Draft row 12]`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `proposeEvents`: one `ai.generateObject` call (`tier: "standard"`, `reasoning: "low"`, `provider` passed through) with schema `z.object({ events: z.array(CalendarProposalSchema) })`; system prompt tells the AI to emit one entry per calendar row, set `skipReason` for non-event rows (breaks, exam weeks, "Cancel" rows, blanks, "TBD" with nothing else), never guess a date, put every "Pub Leader N"/"Owner"/"Lead" column into `roles` with the column's name as `role`, and never invent rows. Then in code: drop entries whose `(sheet,row)` isn't in `rows`; attach `sourceText`; run each through `checkPlannedEventInput` (invalid input → `input: null`, skip reason "Couldn't read this row"); dedupe by lower-cased title + date, keeping the entry with more non-null fields. Export from `index.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** (`feat(pass-it-on): AI calendar proposer`).

### Task 3: Import and proposal storage

**Files:**
- Create: `tools/pass-it-on/src/calendarStorage.ts`
- Modify: `tools/pass-it-on/src/planning.ts`, `tools/pass-it-on/src/index.ts`
- Test: `tools/pass-it-on/src/__tests__/calendarStorage.test.ts` (throwaway schema, same setup as `library.test.ts`)

**Interfaces:**
- Consumes: `EventProposal` (Task 2); `createPlannedEvent`, `updatePlannedEvent`, `getPlannedEvent`, `listPlannedEvents` (existing).
- Produces:
  - `type MatchKind = "new" | "changed" | "unchanged"`.
  - `interface StoredProposal { id: number; importId: string; sheet: string; row: number; sourceText: string; skipReason: string | null; input: PlannedEventInput | null; matchKind: MatchKind; matchEventId: string | null; status: "pending" | "approved" | "skipped"; eventId: string | null }`.
  - `createCalendarImport(sql: Sql, args: { filename: string; uploadedBy: string; proposals: EventProposal[] }): Promise<string>` — matches each proposal against existing events by lower(title)+date and sets `matchKind`/`matchEventId`; "unchanged" and skip-reason proposals are stored with status `skipped`.
  - `listCalendarImports(sql): Promise<{ id: string; filename: string; importedAt: string; pending: number; total: number }[]>`.
  - `getCalendarImport(sql, id): Promise<{ id: string; filename: string; proposals: StoredProposal[] } | null>`.
  - `updateProposal(sql, proposalId: number, input: PlannedEventInput): Promise<boolean>`; `skipProposal(sql, proposalId): Promise<boolean>`; `restoreProposal(sql, proposalId): Promise<boolean>` (back to pending).
  - `approveProposal(sql, proposalId: number, createdBy: string): Promise<{ ok: true; eventId: string } | { ok: false; message: string }>` — idempotent: a proposal already approved returns its existing `eventId`; a "changed" one calls `updatePlannedEvent` on `matchEventId`; otherwise `createPlannedEvent`, then sets `events.import_id`. Uses one transaction with `SELECT … FOR UPDATE` on the proposal row.
  - `approveAllPending(sql, importId: string, createdBy: string): Promise<number>`; `deleteCalendarImport(sql, id): Promise<boolean>`.
  - `PlannedEventInput.cancelled: boolean` and `PlannedEvent.importId: string | null` / `cancelled` added in `planning.ts` (create, update, get, list summary; `checkPlannedEventInput` reads `raw["cancelled"] === true`).

- [ ] **Step 1: Write failing tests:**
  - `creates an import with pending proposals and pre-skips skipped rows`.
  - `labels proposals new, changed and unchanged against existing events` (existing event same name+date and same fields → unchanged, pre-skipped; same name+date with a different venue → changed; otherwise new).
  - `approving creates one event with import_id set, and approving twice returns the same event` (call twice, plus `Promise.all` of two calls; assert one event row).
  - `approving a changed proposal updates the existing event instead of creating one`.
  - `edit, skip and restore change status and input`.
  - `approveAllPending approves only pending proposals with an input`.
  - `deleting an import keeps approved events`.
  - `getCalendarImport returns null for an unknown or malformed id`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** as specified; add `cancelled`/`importId` to `planning.ts` queries (`events.cancelled`, `events.import_id`) and update `planned()` in `library.test.ts` plus the expected object in "checks planned events" for the new fields.
- [ ] **Step 4:** Run the whole tool test suite → PASS.
- [ ] **Step 5: Commit** (`feat(pass-it-on): calendar import storage and approval`).

### Task 4: Upload route and actions

**Files:**
- Create: `apps/web/src/app/tools/pass-it-on/calendar/upload/route.ts`, `apps/web/src/app/tools/pass-it-on/calendar/actions.ts`

**Interfaces:**
- Consumes: `calendarRows`, `CalendarFormatError`, `MAX_UPLOAD_BYTES` (imports entry); `proposeEvents`, `createCalendarImport`, `approveProposal`, `approveAllPending`, `updateProposal`, `skipProposal`, `restoreProposal`, `deleteCalendarImport`, `checkPlannedEventInput`, `parseVendorLines` (main entry); `getAI`, `getCurrentUser`, `signInRequired`, `db`/`maybeDb`.
- Produces: `POST /tools/pass-it-on/calendar/upload` (multipart `file`, `provider`, `confirm`) → JSON `{ status: "saved", importId, proposals, skipped } | { status: "blocked" | "needs_confirmation", … } | { error }` (same style as `library/upload/route.ts`); server actions returning `ActionResult<…>` (reuse the type from `../actions`): `approveProposalAction(id)`, `approveAllAction(importId)`, `skipProposalAction(id)`, `restoreProposalAction(id)`, `saveProposalAction(id, values: EventFormValues)`, `deleteImportAction(importId)`.

- [ ] **Step 1:** Write the route, mirroring `library/upload/route.ts`: signed-out → `signInRequired()`; no `getAI()` → JSON error telling the user to add a key in Settings; `provider` must be in `ai.providers()`; size cap; credential guard (`checkUploadForCredentials(file.name, rows.map(r => r.text))`, with the same `confirm` handling); `CalendarFormatError` → 400 with its message; AI errors via `isAIError` → JSON `{ error: error.message, kind }`; empty rows → `{ status: "empty" }`; database problems → 503 as in the library route.
- [ ] **Step 2:** Write the actions with `run()`/`fail()` patterns copied from `../actions.ts`; each requires `getCurrentUser()`; `saveProposalAction` builds input exactly as `saveEvent` does (reuse by extracting a shared `parseEventForm(values)` helper in `../actions.ts` only if it is a 5-line change, otherwise duplicate the five lines).
- [ ] **Step 3:** Run `pnpm typecheck` → passes.
- [ ] **Step 4: Commit** (`feat(pass-it-on): calendar upload route and actions`).

### Task 5: Calendar tab and approval screen

**Files:**
- Create: `calendar/page.tsx`, `calendar/[importId]/page.tsx`, `calendar/CalendarUpload.tsx`, `calendar/ProposalCard.tsx`
- Modify: `Nav.tsx`, `PassItOn.module.css`

**Interfaces:**
- Consumes: `listCalendarImports`, `getCalendarImport`, `StoredProposal`, the Task 4 route and actions, `ai.providers()`, `<SignInPrompt>` and `<ApiKeyPrompt>` as in `ask/page.tsx`, and `emptyEventForm`/the form fields from `events/EventForm.tsx`.

- [ ] **Step 1:** `Nav.tsx`: add a "Calendar" tab (`${BASE}/calendar`, active for paths under it).
- [ ] **Step 2:** `calendar/page.tsx` (server): signed-out → `SignInPrompt`; no providers → `ApiKeyPrompt`; otherwise `CalendarUpload` (provider picker, file input accepting `.xlsx`, shows the route's messages, the "needs confirmation" checkbox like `library/Upload.tsx`, redirects to `/calendar/{importId}` on success) and the list of past imports with "N of M waiting".
- [ ] **Step 3:** `calendar/[importId]/page.tsx` + `ProposalCard.tsx`: cards grouped Pending / Skipped (collapsed). Each shows title, date, time, location, roles, partner clubs, the source row text, and a badge for new / changed / unchanged (changed lists which fields differ from the match). Buttons: Approve, Edit (inline fields from the event form, calling `saveProposalAction`), Skip / Restore. Header buttons: "Approve all", and "Delete import". After approving, the card shows "Approved" with a link to `/tools/pass-it-on/events/{eventId}`. Use `router.refresh()` after actions.
- [ ] **Step 4:** Check by hand in the browser (dev server at `localhost:3000/tools/pass-it-on/calendar`) with `/Users/joehardwicke/Downloads/Pub Calendar 2026_27.xlsx` and an OpenAI or Anthropic key saved in Settings: break and exam weeks are skipped, International Pub shows the roles Justin, Diva and Ivana, approving one card creates one event, "Approve all" creates the rest, re-uploading the same file shows everything as unchanged.
- [ ] **Step 5:** `pnpm typecheck && pnpm check:tools` → pass.
- [ ] **Step 6: Commit** (`feat(pass-it-on): calendar tab and approval screen`).

### Task 6: Master calendar view and cancelled flag

**Files:**
- Modify: `apps/web/src/app/tools/pass-it-on/page.tsx`, `events/EventForm.tsx`, `events/[id]/page.tsx`, `events/new/page.tsx` (only if `emptyEventForm` needs `cancelled`), `actions.ts` (`EventFormValues.cancelled: boolean`), `PassItOn.module.css`
- Test: extend `library.test.ts` for `cancelled` round-trip (done in Task 3) and add `groupByMonth` tests.
- Create: `tools/pass-it-on/src/calendarView.ts` exporting `groupByMonth(events: PlannedEventSummary[]): { month: string; events: PlannedEventSummary[] }[]` (month label like "October 2026"; undated events in a final "Date to be decided" group; input order kept within a group).

- [ ] **Step 1: Write failing tests** `groups events by month in date order, undated last` and `keeps events in the same month together`; run → FAIL; implement `groupByMonth`; run → PASS; export from `index.ts`.
- [ ] **Step 2:** `page.tsx` renders the groups with a month heading each, and a "Cancelled" tag on `cancelled` events (add `cancelled` to `PlannedEventSummary`/`listPlannedEvents`). Add a "Cancelled" checkbox to `EventForm.tsx` and pass it through `saveEvent`.
- [ ] **Step 3:** `pnpm typecheck && pnpm check:tools && pnpm test` → all pass; check the Events tab in the browser.
- [ ] **Step 4: Commit** (`feat(pass-it-on): master calendar view`).

### Task 7: Docs and final check

**Files:**
- Modify: `tools/pass-it-on/PROGRESS.md`

- [ ] **Step 1:** Add the calendar import to PROGRESS.md (new "Calendar import" rows in the status table, marked Done, plus one line under "What we're building" that approved calendar events feed the checklist engine and board in Week 2).
- [ ] **Step 2:** Run `pnpm typecheck`, `pnpm check:tools`, `pnpm test` and paste the pass counts into the hand-off.
- [ ] **Step 3: Commit** (`docs(pass-it-on): record calendar import`).

---

## Self-review notes

- **Spec coverage:** reader (T1), schema incl. `import_id`/`cancelled` (T1), AI proposer with source-row check and guardrails (T2), re-upload matching and approve/skip/restore (T3), upload route with credential guard, key check and errors (T4), approval screen and Approve all (T5), master calendar by month, add/edit/delete via the existing form (T6). Piece 2 is out of scope.
- **Cancelled:** rows that say "Cancel" are skipped by the AI (restorable); the `cancelled` flag is a manual checkbox on real events.
- **Calendar tab shape, not column layout:** nothing hard-codes the Pub file's columns; the Pub sample is used only in tests and the manual check.
