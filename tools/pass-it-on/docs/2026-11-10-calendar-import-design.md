# Calendar import, approval and master calendar: design

*2026-11-10. Piece 1 of 2. Piece 2 (checklist engine and board, PROGRESS.md steps 12–19) gets its own spec and reads the master calendar defined here.*

## Goal

One person uploads a club's annual calendar spreadsheet. The tool proposes every event in it; people approve, edit or skip them; approved events form the master calendar. Anyone signed in can add, change and delete events afterwards. (Board-only roles come after the pilot, with the Platform team, as PROGRESS.md plans.)

## Decisions already taken

- Any signed-in user can import, approve, edit and delete. No roster.
- The AI reads the spreadsheet using the uploader's own key (AI API, `generateObject` with a Zod schema; fields that may be missing are `.nullable()`). No key: the page says so and points to Settings. Nothing is saved without a person approving it.
- The existing `events` table is the master calendar. No second copy.

## Flow

1. **Calendar tab → upload.** The existing Excel reader (`imports/`) turns the workbook into plain text rows, keeping sheet name and row number. Formulas are read as their cached values. The credential guard (`checkUploadForCredentials`) runs first.
2. **AI proposal.** `generateObject` returns a list of proposed rows: name, date, time, location, partner clubs, roles (role name + person), notes, confirmations, after-event numbers, `skip` with a reason (breaks, exam weeks, "Cancel" rows, blanks) and the source `sheet` and `row`. Each proposal's source row text is looked up in the stored rows; a proposal whose row doesn't exist is dropped, as lesson quotes are.
3. **Approval screen.** Proposals show as editable cards (the existing event form fields). Approve, Edit, Skip per card; Approve all / Skip all; skipped rows collapsed and restorable. Approving creates the event with `createPlannedEvent`.
4. **Master calendar.** The Events tab groups events by month, soonest first. Events marked cancelled show a marker. Add, edit and delete use the existing event form and actions.

## Data (additive, `schema.sql`)

- `calendar_imports (id, filename, uploaded_by, imported_at, status: pending | done)`.
- `calendar_proposals (id, import_id, position, sheet, row_number, source_text, proposal JSONB, skip_reason, status: pending | approved | skipped, event_id)`. Kept apart from `events` so a half-approved import never appears in the calendar. Deleting an import cascades to its proposals; approved events stay.
- `events.import_id` (nullable) and `events.cancelled` (boolean, default false).
- **Re-upload:** proposals are matched to existing events by lower-cased name + date and labelled new / changed / unchanged. Unchanged ones are pre-skipped; changed ones show the differing fields and, if approved, update the existing event instead of creating one.

## Guardrails

- Names only, no emails. The club contact is stored as a name.
- An unreadable file, a failed AI call or an AI error kind (`missing_key`, `invalid_key`, `no_credit`) returns a plain message as data and saves nothing.
- Row cap per import (e.g. 300) and file-size cap reuse the library upload limits.

## Components

| Unit | Where | Does |
|---|---|---|
| Calendar reader | `tools/pass-it-on/src/calendar.ts` | workbook rows → numbered text rows |
| Proposer | `tools/pass-it-on/src/calendar.ts` | rows + `AI` → checked proposals (Zod schema, source-row check) |
| Storage | `tools/pass-it-on/src/calendar.ts` | create import, list/edit/approve/skip proposals, match against existing events |
| Upload route + actions | `apps/web/src/app/tools/pass-it-on/calendar/` | upload (like `library/upload`), approve/skip/edit actions |
| Approval UI, calendar view | same folder; `page.tsx` | cards, month grouping |

Heavy file readers stay at the `@penntools/tool-pass-it-on/imports` entry point so `container.ts` doesn't load them.

## Testing

Fake `AI` in tests (no key, network or cost), throwaway schema as in `library.test.ts`. Cases: the Pub sample (break and cancel rows skipped; Pub Leader 1/2/3 become three roles; the Signups and Draft tabs don't produce duplicates); a proposal pointing at a nonexistent row is dropped; approve creates exactly one event; re-upload labels new/changed/unchanged; AI errors save nothing. `pnpm typecheck`, `pnpm check:tools`, `pnpm test` must pass.

## Out of scope

Checklist engine, task board and their add/edit/delete (piece 2); board-only access; AI-suggested modules; any use of the imported calendar beyond the events table.
