# Pass It On: progress and plan

*Last updated 2026-11-12. Repo: `jhard99/penn-tools`, branch `pass-it-on`.*

## What we're building

Pass It On is a **live planning tool for Pub's weekly events**, built from four components:

1. **A file library with AI search.** Upload Pub's documents (playbook, club rider, catering and merch sheets, reimbursement instructions, bylaws, planning docs) and ask questions. Every answer cites the source passage.
2. **Event records.** Each Pub is one record: date, theme, venue, partner clubs, budget and Pub Leader. Files, tasks and lessons attach to it.
3. **A checklist engine** (reads its events from the master calendar built by the calendar import). One base template plus optional modules (club collab, international, singles/GAPSA) generates dated tasks, each with one owner, for every event. Dates are relative (T-14 … T+5), so they move when the event moves.
4. **A board.** A Trello-style view of every in-flight event's tasks plus ongoing to-dos, such as merch inventory, vendor relationships and succession planning.

**An AI layer** ties these together. It:
- answers questions from the library;
- suggests modules and flags past lessons when an event is created;
- after each post-mortem, proposes changes to the template.

The post-mortem is a **T+5 task** in the checklist, not a separate flow.

**Design rules:**
- **People approve.** The AI proposes and a person approves; nothing is changed silently.
- **Everything is cited.** Every AI output cites its source, or says it can't find one. Quotes are checked word for word, and the quotes shown always come from the database.
- **One owner per task.** A task can be *blocked, waiting on* a vendor or partner club.
- **Changes are versioned.** Template changes are small, versioned and reversible.

## Constraints

- **Our folders only:** we edit only `tools/pass-it-on/` and `apps/web/src/app/tools/pass-it-on/`. Anything else goes to the Platform team.
- **Laptop only:** the pilot runs locally, with our own API keys. We need an **OpenAI** key, because embeddings only work with OpenAI.
- **Uploads only:** tool code never calls Drive, WhatsApp or CampusGroups.
- **Attendance as counts:** attendees' names and emails are never stored.
- **No credentials:** the "Pub Email & Social Accounts" doc must never be uploaded. Uploads containing "password" or "pass:" are flagged and need confirmation.
- **Real files stay outside the repo:** never commit them.

## Status

| Step | What | Status |
|---|---|---|
| Earlier work | Schema, storage, the five questions, file readers (Drive, WhatsApp, CampusGroups), lesson extraction with quote checking, lesson search, cited briefs: 55 tests | **Done** (reused below) |
| 0 | This document; switch on our database (`TOOLS` entry) | **Done** |
| **Week 1: library and events** | | |
| 1 | Schema: event fields, vendors and partner clubs, file tags, excerpt embeddings | **Done** |
| 2 | Detect "database not ready" | **Done** |
| 3 | Credential guard for uploads | **Done** |
| 4 | Embed documents on upload; search them | **Done** |
| 5 | Cited answers ("I couldn't find this" when there's no source) | **Done** |
| 6 | Event and party storage | **Done** |
| 7 | Page shell with tabs; "database not ready" message | **Done** |
| 8 | Upload page and route, with the credential check | **Done** |
| 9 | Ask-the-library page, linking to source passages | **Done** |
| 10 | Event list and edit pages | **Done** |
| 11 | **Exit test:** five real questions, correct cited answers | To do |
| **Calendar import** (added 2026-11-10) | Upload a club's annual calendar (.xlsx); the AI proposes events; people approve, edit or skip; approved events are the master calendar (Events tab, grouped by month, `cancelled` flag). Spec and plan in `tools/pass-it-on/docs/`. 121 tool tests. Not yet tried in the browser with a real AI key | **Built, needs a manual check** |
| **Week 2: checklist and board** | | |
| 12 | Schema: template versions, modules, items (with subtasks, phase, area, weekday anchors), tasks (with source and confirmed), members | **Done** |
| 13 | Date math (`dueDate`, weekday anchors), task and subtask generation with owners by role, rescheduling. 161 tool tests | **Done** |
| 14 | Pub template version 1, from the playbook and the Big Gay Halloween checklist, with modules (club collab, international, singles/GAPSA) and the PO issue flagged. Also a Run of show category and per-club repeating items. 208 tool tests | **Done** |
| 15 | Task and to-do storage; filters; members list (`listMembers`, `addMember`, `syncMembers`). 208 tool tests | **Done** |
| 16 | Creating an event generates its checklist (also an Update checklist button on the event page); moving the date reschedules, via `updatePlannedEvent`. 231 tool tests | **Built, needs a manual check** |
| 17 | Board tab: columns, owner/event/due-window filters, "waiting on", subtasks, per-area readiness, "No Pub Leader" flag (board and Events list), add to-dos by hand | **Built, needs a manual check** |
| 18 | Template tab: Planning / Run of show, known issues (resolve), versions, revert | **Built, needs a manual check** |
| 19 | **Exit test:** two overlapping events, correct dates and owners | Passes as an automated test (`eventWorkflow.test.ts`); not yet seen in the browser |
| **Week 3: AI layer, post-mortem, pilot** | | |
| 20–21 | Suggested modules and past lessons when creating an event | To do |
| 22–23 | Post-mortem task: pre-filled questions or uploaded notes, then a lesson review queue | To do |
| 24–25 | Proposed template changes, with citations, approved by a person | To do |
| 26 | **Pilot** with a current Pub leader | To do |
| 27 | Pull request to `whartonAIclub/penn-tools` | To do |

## 2026-11-12 changes: roles and checklist table

Two new tabs: **Roles** (a grid of who holds each role, per event, plus club defaults) and **Checklist** (the old Board, same URL, now a table with one-click check-off). 283 tool tests.

| Req | What | Status |
|---|---|---|
| 1 | Roles tab: edit role holders per event and the club's default leads; default names seeded in `schema.sql` | **Built, needs a manual check** |
| 2 | Task owners follow the owner chain (see Decisions); changing a role holder re-owns its tasks | **Built, needs a manual check** |
| 3 | Template v2: each item gets a role by area and phase; events on v1 keep v1 | **Built, needs a manual check** |
| 5 | Equipment on an event: Arrange at T-7 and Return at T+1 tasks, owned by the Ops Lead | **Built, needs a manual check** |
| 6 | Checklist tab (was Board): table, one-click strike, Planning before Run of show, show-done toggle; Events tab soonest first with "Past events (N)" | **Built, needs a manual check** |

`db:deploy` ran twice against the local database with no errors (schema re-runs cleanly).

**Manual checks for Joe (signed in):**
- **New event:** Pub Leader 1 "Diva", Ops Lead blank, equipment "Fog machine". `food-order` is owned by Michael, an "Arrange: Fog machine" task exists, and there is no "No Pub Leader" flag.
- **Changing Ops Lead:** set it to "Ivana"; `food-order` moves to Ivana.
- **Older events:** a v1 event's page lists v1's modules.
- **Roles tab:** typing a cell value and tabbing away saves it; changing the Marketing Lead default to Kira updates the placeholders; the grid scrolls sideways without the page scrolling.
- **Checklist tab:** one click strikes a row and a reload keeps it in single-event view; five quick clicks end on the fifth click's state; a failed save reverts and shows an error; Planning comes before Run of show; at 400px wide rows stack with no sideways scroll.
- **Events tab:** soonest first, past events in "Past events (N)".

**Cut line, in this order:** meeting-notes extraction → proposed template changes → suggested modules → non-event to-dos → Drive zip and WhatsApp support. **Never cut:** cited search, event records, dated tasks with owners generated from the template, and human approval.

## Step 11: exit test runbook

Needs real Pub files (kept outside the repo) and, for the AI answers, an OpenAI key in Settings.

1. Upload the playbook, club rider, catering and merch sheets, reimbursement instructions and bylaws on the Library tab, with tags. Never the Pub Email & Social Accounts doc (it is refused).
2. Pick five questions whose answers you already know from those files. Write them here before testing:
   1. …
   2. …
   3. …
   4. …
   5. …
3. Ask each on the Ask tab. **Pass** = the answer is correct and its citation links to the passage that says so. A question whose answer isn't in the files must say "I couldn't find this".
4. With no AI key, the Ask tab still shows the passages containing the question's words (keyword search): use it to check the files were read and the right passage is findable. That checks retrieval only; the exit test itself needs the cited answers.
5. Mark step 11 Done only when all five pass.

## Decisions taken (change them if you disagree)

- **PO timing conflict:** the playbook has the restricted fund PO due at T-10, but the budget isn't final until T-7. The template keeps the playbook's dates, shows this as a known issue, and the Pub leader decides in the app.
- **Task owners:** chosen from a roster of Pub board names, defaulting to the Pub Leader. No emails are stored.
- **WhatsApp reminders** *(changed 2026-11-10, matching the club's real checklist)*: one message on the Monday of event week and one on T-0, both recomputed when the event moves. Replaces the earlier "every Monday and Thursday from T-14".
- **Owners** *(2026-11-10)*: a task's owner is a plain name. The default is whoever holds the item's default role on the event (e.g. "Ops Lead"), else the Pub Leader, else "Unassigned". The `members` list is filled from names already used, only for dropdowns and filters.
- **Run of show and partner clubs** *(2026-11-10)*: the template has a "Run of show" category for day-of, during-event and post-event items, and items that repeat for each partner club are generated once per club.
- **Provenance** *(2026-11-10)*: every task records where it came from (template, manual, meeting notes, inferred) and whether its owner has confirmed. Meeting-notes extraction is a Week 3 option after template-change proposals.
- **Owner chain** *(2026-11-12)*: specialist slot, then the role's holder, then the club default, then CoS Owner, then Prez Owner, then Unassigned. Pub Leader slots go PL1, PL2, PL3, CoS, Prez.
- **Template v2** *(2026-11-12)*: each item's role comes from a rule by area and phase; partnerships and membership specials go to the Prez Owner. Events on v1 keep v1.
- **Default lead names** *(2026-11-12)*: seeded in `schema.sql`; Joe chose to keep them in the repo.
- **Board is now the Checklist tab** *(2026-11-12)*, at the same URL.
- **Equipment tasks** *(2026-11-12)*: Arrange at T-7 and Return at T+1, owned by the Ops Lead.
- **Older events** *(2026-11-12)*: tasks generated before this change have no role link (owner_role NULL), so editing a role on an older event doesn't move them; regenerating doesn't change them either, so reassign by hand.
- **Approval rule on the finance item:** a budget change over $1,500 needs a majority of the Co-Presidents (bylaws 4.2). Shown as a note on the item, not enforced.
- **"Board-only" access:** not needed while the pilot runs on one laptop. It comes after the pilot, with the Platform team.

## What we reuse from earlier work

| Earlier work | Role now |
|---|---|
| Drive readers (Word, Excel, CSV, PDF, Markdown, zip) and `saveImport` | The library's upload path |
| Quote checking (`containsQuote`, `checkQuotes`) | Verifying every citation in answers, suggestions and proposals |
| Lesson search and cited briefs (`findLessons`, `buildBrief`) | Flagging past lessons when an event is created |
| The five questions and `structureAnswers` | The post-mortem form |
| Lesson extraction (`extract.ts`) | Pulling lessons from uploaded post-mortem notes |
| WhatsApp and CampusGroups readers, attendance counts | **Kept but deprioritized.** No pages for now. |

## Blockers

- **Database: resolved.** The Platform team gave us one-time permission to add `{ name: "passiton", dir: "tools/pass-it-on", connectionLimit: 30 }` to `TOOLS` in `packages/platform/scripts/setup-tools.mjs`, and it's committed. **After you `git pull`, run `bash scripts/setup.sh` once** to create the tool's tables on your laptop. Pages still show a clear "database isn't set up" message if that step hasn't been done. The pull request touches this one file outside our folders, so mention the permission in its description.
- **Real Pub files:** we need them for the week 1 exit test. Keep them outside the repo.

## Daily workflow

```bash
git pull                                          # get the other person's work
pnpm dev                                          # http://localhost:3000/tools/pass-it-on
pnpm typecheck && pnpm check:tools && pnpm test   # before every commit
git push                                          # share it
```

Before running the site or the tests, start Docker Desktop, then run `docker start penntools-db`. Changes to `tools/pass-it-on/` (tool logic) go to Joe for review.
