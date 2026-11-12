# Pub template v1 and task storage (steps 14–15), with amendments to steps 12–13: design

*2026-11-10. Builds on `2026-11-10-checklist-engine-design.md` (steps 12–13, already built). Inputs: `Big Gay Halloween Checklist.pdf`, `chili_cook_off_checklist.md` (a live week-of checklist), the chief-of-staff summary and the playbook notes already in PROGRESS.md. Where this document and the steps 12–13 design differ, this one wins.*

## What the Chili Cook Off checklist changed

1. **Partner clubs repeat blocks.** Ski Club and Food Club each get their own block of tasks. A template item can repeat once per partner club, with `{club}` in its title.
2. **Time of day.** Items say "Morning" or "EOD"; a free-text time hint carries it.
3. **A "not needed" status and a partners area.** A struck-out task (Armory logistics) needs `skipped`; the per-club blocks need a `partners` area.
4. **Waiting on a person** ("send once Benji approves", "budget approval from Marcela and Diva") is already `tasks.waiting_on`.
5. **Event-specific tasks stay manual** (remove Euro from the flyer, lock the cook count, the Bonners invoice). Board members add them by hand.
6. **Real offsets** run a day or two either side of the event (T-2, T-1, T+1) as well as T-7/T-10/T+5.

## Decisions

- **Run of show category.** Items are grouped into two top-level categories derived from `phase`: **Planning** (`pre`) and **Run of show** (`day_of`, `during`, `post`). No new column. Exported as `categoryOf(phase): "planning" | "run_of_show"`; the Template tab (step 18) and the board show these two sections.
- Tabling and the event email are in the base template; attendance is due T+5 (the playbook's rule; Chili did it at T+1, noted on the item).
- Modules default on for an event with partner clubs: `suggestedModules({ partnerClubs })` returns `["club-collab"]` when it has any, else `[]` (the other modules are chosen by hand).
- Items marked *assumed* in the table have a date or wording guessed from partial evidence; their `notes` say "Assumed: confirm" so the Template tab can show them.
- The PO/budget conflict (PO due T-10, budget final T-7) is stored as an open known issue, shown and not silently fixed.

## Amendments to steps 12–13 (additive)

- `schema.sql`:
  - `template_items.repeat_for TEXT NULL CHECK (repeat_for IN ('partner_club'))`, `template_items.time_hint TEXT NULL`.
  - `tasks.time_hint TEXT NULL`, `tasks.partner TEXT NULL` (the club a repeated task is for).
  - `area` allows `partners` on `template_items`; `tasks.status` allows `skipped`. Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so use `ALTER TABLE ... DROP CONSTRAINT IF EXISTS <name>` then `ADD CONSTRAINT <name> ...` (the tables are empty or hold only test rows; the statements must be re-runnable). Give `tasks.area` and `tasks.phase` the same CHECK values as `template_items` while doing so, and make `template_items.phase` and `area` NOT NULL (both deferred minors from the steps 12–13 review).
  - `template_issues (id BIGINT identity PK, version_id BIGINT REFERENCES template_versions ON DELETE CASCADE, item_key TEXT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK IN ('open','resolved'))`.
- `checklist.ts`:
  - `Area` gains `"partners"`; `TemplateItem` gains `repeatFor: "partner_club" | null` and `timeHint: string | null`; `TaskDraft` gains `timeHint: string | null` and `partner: string | null`.
  - `generateTasks(items, moduleKeys, event: { eventDate; roles; partnerClubs: string[] })`: an item with `repeatFor = "partner_club"` yields one task per partner club, titled with `{club}` replaced by the club's name, with `templateItemKey` = `<key>:<slug of club>` (lowercase, non-alphanumerics to `-`, so it stays unique per club and the unique index still holds) and `partner` set; with no partner clubs it yields none. Subtasks of a repeated item repeat with it. `timeHint` is copied through.
  - `categoryOf(phase)` and `suggestedModules(event)` as above.
  - `ownerOf` trims the role it compares (deferred minor).
- Tasks are rescheduled by `rescheduleEvent` exactly as before; `template_item_key` for repeated tasks matches the item by the part before the `:`.

## Step 14: `src/pubTemplate.ts`

- `PUB_TEMPLATE_V1`: `{ note, modules, items, issues }` as data (below), typed with `TemplateItem` plus a `version` note.
- `ensureTemplate(sql: Sql): Promise<number>` returns the id of version 1, inserting the version, modules, items and issues in one transaction when version 1 doesn't exist, and doing nothing when it does. Safe to call concurrently (version number is unique).
- `getTemplate(sql, versionId?)` returns a version's modules and items (latest by default) as `TemplateItem[]` plus `issues`, for generation and for the Template tab.
- Tests: the template's own consistency (unique keys, every `parentKey` and `moduleKey` exists, offsets and anchors never both set, assumed items have the "Assumed" note, every repeated item is in a module); `ensureTemplate` inserts once and is idempotent (including under two concurrent calls); round trip through `getTemplate` equals the data; generating tasks for a Thursday event with and without partner clubs gives the expected counts, per-club titles and keys, and the Halloween checklist's dated items (T-14 flyer, T-10 PO, T-7 budget, Monday and T-0 WhatsApp).

## Step 15: `src/tasks.ts`

- `createEventTasks(sql, eventId, drafts: TaskDraft[]): Promise<number>` — one transaction; inserts parents before children (resolving `parent_task_id` from `parentKey`, which for repeated tasks is the parent's per-club key); ignores duplicates via the unique index (`ON CONFLICT DO NOTHING`), so running it twice adds nothing; also records the event's `template_version_id` and chosen modules. Returns how many tasks were new.
- `listTasks(sql, filter: { owner?: string; from?: string; to?: string; eventIds?: string[]; statuses?: TaskStatus[]; includeUndated?: boolean }): Promise<TaskRow[]>` — each row has the due date computed in SQL (`events.event_date + offset_days`, or `due_date` for ongoing to-dos), the event's title and date, and the T-offset; ordered by due date then offset, undated last; `from`/`to` are inclusive.
- `updateTask(sql, id, change: { title?; status?; owner?; waitingOn?; notes?; timeHint?; offsetDays?; dueDate?; confirmed? })` — sets `completed_at` when status becomes `done` and clears it when it leaves `done`; rejects an unknown status or a blank owner (blank becomes "Unassigned" only through an explicit `owner: null`); returns false for an unknown id.
- `createTodo(sql, input: { title; owner?; eventId?; offsetDays?; dueDate?; notes?; timeHint?; source? })` — a manual task, linked to an event (offset) or ongoing (due date); `source` defaults to `manual`.
- `deleteTask(sql, id)`; deleting a parent removes its subtasks.
- `listMembers`, `addMember`, `setMemberActive`, `syncMembers(sql)` (adds names found in `event_roles.person` and `tasks.owner`, except "Unassigned", ignoring case).
- Tests (throwaway schema): create is idempotent and parents-first; per-club tasks stay distinct; `listTasks` due dates and filters (owner, window edges, event, status, undated); `completed_at` set and cleared; blank owner and bad status rejected; to-dos with and without an event; delete cascades to subtasks; members unique ignoring case and `syncMembers` idempotent.

## Template v1 data

Keys, titles, phase and area, timing (T-n days; `Mon` = Monday of event week), default role (blank = the Pub Leader), time hint, notes. *A* = assumed, confirm.

**Planning (`pre`)** — general: `group-chat` Make a group chat with the Presidents and CFO, T-14, *A*; `event-folder` Create the event folder and planning doc, T-14; `approve-deadlines` Get deadlines approved by the Chief of Staff and a Co-President, T-14; `partnerships` Align on event partnerships (start of semester), no date (standing); `membership-specials` Decide on membership specials, if any, T-7.
finance: `budget` Finalize the event budget, T-7, note "Budget changes over $1,500 need a majority of the Co-Presidents (bylaws 4.2)"; `po` Submit venue and food fees for restricted-fund PO payment, T-10.
marketing: `flyer` Official event flyer, and post to Instagram, T-14; `flyer-cg` (sub of flyer) Send the flyer and blurb to Ops for CampusGroups, T-14; `partiful` Make and distribute the Partiful, T-7 ("at the latest"); `email` Send the event email to members (get it reviewed first), T-2; `whatsapp-monday` WhatsApp message (Monday of event week), Mon; `tabling-reminder` Remind the board about tabling and the setup call time, T-2.
operations: `campusgroups` Publish the event on CampusGroups, T-7 ("at the latest"); `food-order` Place the food order, T-7; subs `food-pizza` Pizza, `food-snacks` Non-pizza snacks (note: past order — chicken tenders; wings x2, 1 buffalo and 1 BBQ; veg quesadillas x2; cheesesteak spring rolls x2; pigs in a blanket x2; pretzel x1), `catering-tracker` Fill in the catering tracker for this event, all T-7; `merch-ready` Pack merch, wristbands, laptop and power strips, T-1; `print-qr` Print QR codes for tabling (drop-in ticket and membership sign-up), T-1.

**Run of show** — `day_of`, all T-0: `whatsapp-day` WhatsApp message (event day), marketing; `tabling` Tabling shift (see the Tabling sheet), operations, *A* (Chili tabled 12–3 on the day); `speakers` Set up speakers and `dj` Allocate the DJ, entertainment; `confirm-food` Confirm the food order, `confirm-setup` Confirm setup with Entertainment and the venue, operations; `checkin-materials` Print check-in materials with subs `checkin-qr` Drop-in ticket QR (Venmo QR on the back?) and `checkin-signup` Membership sign-up sheet with the latest pricing; `checkin-table` Set up the check-in table, operations; `team-arrives` Pub team arrives for setup (the call time is in the event's notes), general.
`during`, all T-0: `during-signups` Manage merch and membership sign-ups; `during-checkin` Support the check-in desk with the Pub Leaders; `during-encourage` Encourage sign-ups to memberships and spread the word (all general); `during-venue` Manage the venue relationship (confirm tab progress with bar staff; stay within the finance-approved budget), `during-food` Receive and manage the food order, `during-merch` Distribute merch to early-bird sign-ups, `closeout-merch` Collect merch and props at close (operations); `during-photos` Take photos and post to the Instagram story (marketing).
`post`: `attendance` Log attendance in the After Action tracker, T+5 (note: Chili did this at T+1), general; `feedback` Submit event feedback to the post-event form, T+5, general; `receipts` Submit receipts to Finance for reimbursement (see the Reimbursement Instructions), T+5, finance; `reimbursement-check` Check reimbursement status, T+35 (about 4 weeks with WGA plus 1–2 weeks to be paid; errors restart the clock), finance; `postmortem` Post-mortem: answer the five questions, T+5, general, `isPostmortem`.

**Module `club-collab`** (Club collab; area `partners`; repeated per partner club unless noted): `collab-reminder` {club}: remind about the signed Club Collab Rider, T-21, *A*; `collab-rider` {club}: signed Club Collab Rider and written confirmation on file, T-14; `collab-covers` {club}: confirm in writing what the club covers and up to what amount, T-7; `collab-names` {club}: get the club's free-entry names (at most 2 complimentary board members), T-3; `collab-upload` {club}: upload members to CampusGroups with free tickets, T-2; `collab-crosscheck` {club}: cross-check the list against the ticket export, then refund members who already paid, T-1, hint "EOD"; `collab-layout` {club}: send the final layout, T-1; `collab-transfer` {club}: request the fund transfer (subsidy math; within 5 days of the event), T+5 (post); `collab-report` (once per event) Report the partnership outcomes to the Chief of Staff, Finance and the Presidents, T+5 (post), general.
**Module `singles`** (Singles/GAPSA, all *A*): `singles-schools` Market to the partner schools, T-14; `singles-logo` Put the GAPSA logo on all materials, T-10; `singles-newsletter` Send the GAPSA newsletter blurb, T-10 (marketing); `singles-eventbrite` Check Eventbrite, T-7 (operations); `singles-gapsa-review` Complete the GAPSA After Action Review (funding requirement), T+5 (post, finance).
**Module `international`** (all *A*; replace with the International Pub Checklist when it's available; repeated per partner club, area `partners`): `intl-outreach` {club}: reach out about the International Pub (use the Intl Pub Contacts sheet), T-60; `intl-followup` {club}: follow up if they haven't responded, T-45.

**Known issue** (open, on `po`): "The playbook has the PO due at T-10, but the budget isn't final until T-7. Decide which date moves."

## Out of scope

Pages (steps 16–18), AI features, importing the Chili checklist itself, and the weekly cross-event "follow-ups" view (the board's due-window filter in step 17 covers it).
