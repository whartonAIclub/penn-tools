# Penn Health App: Outtake / Schedule Feature, Project Context

This document gets you (Claude Code) up to speed on the product, the decisions already made, and the build plan for the first feature. Read it fully before writing code. When something isn't covered here, ask instead of assuming.

_Last updated: November 18, 2026._

---

## 0. Current status (read this first)

- **Current feature:** Schedule ("My fitness week"), the first of the three outtake hero features.
- **Build order:** engine first, then ingestion, then UI (see section 11). This replaces the earlier ingestion-first order.
- **Progress:** unknown to this document; it may be out of date. **At the start of a session, inspect the repo (git log, tests, folder structure) and report which steps in section 11 are done, partly done, or not started before writing any code.** Then update the checklist in section 11.
- **Working agreements:**
  - Work one step of section 11 at a time; don't start the next step unprompted.
  - After each step, list what changed and confirm tests pass.
  - Stop at the two checkpoints (stack confirmation, engine review) and wait for me.
  - If a test looks wrong rather than the code, flag it instead of changing it.
  - Keep UI minimal and stay out of the "Later" scope (section 12).
- **Decisions from kickoff (step 1, November 18, 2026):**
  - Stack: the PennTools platform (see section 6, Stack).
  - Exercise code lives in `src/outtake/` (engine, ingestion, export, `outtake_*` tables); shared types, profile and analytics live at `src/`, ready for the intake half.
  - Facilities are a TypeScript constant for v1, moving to the database when Penn Now needs live data.
  - Screenshot parsing uses the AI API's `standard` tier, with the user picking OpenAI or Anthropic (as WEMBA Sync does). It runs on the user's $0.50 free credit, then their own key. `.ics` upload and quick-add use no AI.
  - Plans cover one Monday-to-Sunday week.
  - Commit messages use the repo's style (plain sentences), not conventional commits.
  - The `pennfitness` database still has to be registered by the Platform team; build continues without it. Update (November 18, 2026): registered on our branch with the one `TOOLS` line in `packages/platform/scripts/setup-tools.mjs`, as Penn Pals, Student Discount Central and WEMBA Sync did in their own PRs; the PR must call it out for the Platform team. Locally, `node packages/platform/scripts/setup-tools.mjs` creates the role and schema and applies `schema.sql`.

---

## 1. Product context

**What we're building:** a health app for Penn students. The premise is that everything at Penn (recruiting, parties, treks, courses) only works if you have a sound body and mind. The app has two pillars: **physical health** and **mental health**. Physical health comes first.

**Physical health has two halves:**
- **Intake:** nutrition, dining, hydration. Owned by my teammate.
- **Outtake:** exercise. **Owned by me. This repo/work is the outtake section.**

**Shared layer above both halves.** Coordinate with the teammate on this; don't build it unilaterally:
- **This week:** a unified home screen where both halves contribute cards.
- **Integrations hub:** wearables and other connections, set up once and shared by both halves.
- **Body signals:** sleep, heart rate, HRV. These are shared because both halves use them.
- **Goals and profile:** onboarding, preferences, privacy.

Design data structures so they can plug into this shared layer later. For example, keep user preferences and integrations out of outtake-specific tables where reasonable.

---

## 2. Outtake section: the three hero features

1. **Schedule ("My fitness week"):** a personal weekly plan that fits workouts into the user's real schedule. **This is the feature we're building now.**
2. **Penn Now:** a live view of facility availability across Penn (Pottruck, Fox, Penn Park, courts, pools) and a curated set of Rittenhouse gyms and studios. Comes later.
3. **Community:** walk and workout buddies, plus group slots. Comes later.

**Device integrations** (Apple Health, wearables) are an **enabler layer**, not a headline feature. Every feature must work fully without a connected device. Integrations only make features smarter or more automatic.

The three features form a loop: **plan it** (Schedule), **go do it** (Penn Now), and **do it with people** (Community). Schedule is first because the other two plug into it. Penn Now answers "where should I go for this slot?" Community answers "who else is going at this time?"

---

## 3. Target user

**The Wharton MBA who has let their health slide.**

- They're in their late twenties and often come from consulting, banking, or tech, where they already got used to skipping workouts.
- Their time is consumed by recruiting, Learning Team meetings, club leadership, and a heavy social calendar.
- They know they should exercise, and many used to do it regularly. In practice, it's the first thing they drop.
- Their biggest objection is that every hour of exercise feels like an hour taken from networking or recruiting. That objection, not laziness, is what the product has to overcome.
- **Many live in Center City or Rittenhouse, not near campus.** Pottruck may be a detour. A building gym or a nearby studio often isn't. Location matters in planning.
- **The social side is the main draw.** If a workout with classmates counts as social time, the objection goes away.

**Framing rule:** talk about time and people, not health. "You have a 40-minute gap Thursday" works. "You've missed 3 workouts" doesn't. No guilt mechanics.

---

## 4. The job

> **When recruiting, classes, and the social calendar crowd everything out, help me fit in enough exercise to keep my energy up, without giving up time with my classmates.**

This means short workouts, close to where the user already is, and eventually done with other people. It does **not** mean training programs, PRs, weight loss, or calorie tracking.

---

## 5. The moment it works (success definition)

> **A user completes a workout they planned in the app during a week when they would normally have skipped it.**

A workout during a quiet week tells us little. A workout completed during a busy week (recruiting, a heavy social week) shows the product changed behavior.

**Primary metric:** the percentage of users who complete **at least 2 planned workouts in their second week**, split into **busy weeks and normal weeks**. Busy weeks are identified by the week's busyness score (see the processing section) or by crunch mode being on.

Instrument for this from the start. If we can't measure it, the feature isn't done.

---

## 6. Hard constraints and guardrails

- **No calendar OAuth.** We cannot connect Google Calendar, Outlook, or any other account. Users provide their schedule in one of two ways:
  1. **Uploading a screenshot or photo of their timetable**, which we parse with a vision LLM.
  2. **Uploading an `.ics` calendar file manually.**
  They can also quick-add one-off busy blocks by hand.
- **Focus on functionality, not UI/UX.** Build minimal, functional screens: plain lists, tables, and basic forms. Visual design gets refined later. Don't spend effort on styling, animations, or polish.
- **No calorie or energy-balance features**, and no "burned vs. eaten" displays. These carry disordered-eating and over-exercise risk in student populations. **Amended November 18, 2026 (Arpit): calories may be shown, gently.** The homepage shows "about N cal eaten today" (from meal-log estimates) and "about N cal, planned this week" (from planned workouts at a moderate pace), each as a neutral circle labelled "estimate": no targets, no progress fill, no "remaining", in separate sections and never set against each other as a balance (`src/calories.ts`, `CalorieCircle.tsx`). Nothing is "burnt" until workouts are checked in.
- **Privacy:**
  - Store only what the engine needs: start/end times, plus a busy flag and an optional short label.
  - Don't keep uploaded timetable images after parsing.
  - Don't send personal data anywhere except the parsing call.
- **Penn-only access eventually.** Sign-in will be limited to Penn and Wharton email domains. For now, a single-user or dev mode is fine. Put auth behind a clean seam so it's easy to add later.
- **Stack (confirmed at kickoff):** the PennTools platform. TypeScript; the slot engine as pure functions with no dependencies in `src/outtake/engine/`, tested with Vitest; the page and server actions in Next.js (`apps/web/src/app/tools/penn-fitness/`); Postgres through the Database API (schema `pennfitness`); screenshot parsing through the AI API (`generateObject` with an image); `ical.js` for reading `.ics`; a small hand-written `.ics` writer. The engine works in New York local time within one week, so ingestion converts to that.
- **Commits:** one logical chunk per commit, in the repo's style (plain sentences, e.g. "Add the slot engine's gap finder"). Each commit should leave the app in a working state with its tests passing. The commit names listed in section 11 describe the chunks, not the message format.

---

## 7. Feature scope: Schedule v1

**In scope:**
- Ingest the user's schedule from a screenshot, an `.ics` upload, or manual quick-add.
- Let the user review and correct what was parsed.
- Set a weekly target.
- Generate suggested workout slots that fit the gaps, accounting for travel to a facility.
- Let the user accept, swap, or dismiss slots.
- Offer crunch mode for heavy weeks.
- Let the user export accepted slots as `.ics` with reminders.
- Let the user mark workouts done or skipped.
- Track the success metric.

**Out of scope for now:**
- Live occupancy (Penn Now).
- Buddies (Community).
- Push notifications. The `.ics` reminders cover this for now.
- Apple Health sync. Manual check-in covers this for now.
- Workout content.
- Polished UI.

---

## 8. Architecture: four chunks

```
[1] Data ingestion  ->  [2] Input presentation  ->  [3] Data processing  ->  [4] Output presentation
 screenshot / .ics       review & correct           gap finder, scoring,     week plan, actions,
 / manual quick-add      parsed busy blocks         plan, crunch, busyness   .ics export, check-in
```

### 8.1 Data ingestion

The goal is to turn whatever the user provides into normalized `BusyBlock`s.

**A. `.ics` upload**
- Parse with a mature iCal library, not a hand-rolled parser.
- Handle these cases:
  - `RRULE` and `EXDATE`: expand recurring events into the target week.
  - Time zones: normalize everything to `America/New_York`.
  - All-day events: ignore them by default, unless they are marked busy or the user flags them.
  - Overlapping events: merge them.
- Keep only the start, end, busy flag, and a short label. Drop descriptions, attendees, and locations.

**B. Timetable screenshot or photo**
- Send the image to a vision-capable LLM with a strict prompt that returns **JSON only**, matching this schema:
  ```json
  {
    "events": [
      {
        "label": "string, short, e.g. 'FNCE 6110'",
        "day_of_week": "MON|TUE|WED|THU|FRI|SAT|SUN or null",
        "date": "YYYY-MM-DD or null (for one-off events)",
        "start_time": "HH:MM (24h)",
        "end_time": "HH:MM (24h)",
        "recurring_weekly": true,
        "confidence": 0.0
      }
    ],
    "notes": "anything ambiguous the model noticed"
  }
  ```
- Timetables vary a lot: Path@Penn views, Canvas, Wharton course schedules, hand-made grids, and phone photos. The prompt must handle grids and list layouts, and must not invent events.
- Validate the JSON against the schema. On failure, retry once and then show an error.
- Treat recurring weekly events as repeating within a user-supplied date range (for example, the semester start and end). Ask for this range once.
- Flag events with low confidence (threshold configurable, default 0.7) for review.
- **Discard the image after parsing.**

**C. Manual quick-add**
- Users can add a one-off busy block with a date, a start and end time, and an optional label. This exists for recruiting events, coffee chats, and parties that aren't in a timetable.
- Users can mark a whole day as **away**, such as a trek or travel day. No slots get suggested on away days.

**Output of ingestion:** a list of `BusyBlock`s tagged with their `source` (`ics`, `screenshot`, or `manual`).

### 8.2 Input presentation (minimal UI)

The goal is to let the user trust and correct the engine's input before planning. Keep this plain.

- Show a simple table or list of parsed blocks grouped by day: day, time, label, source, and a low-confidence flag.
- Let the user edit a block's time, delete it, mark a day away, or add a block.
- Users must confirm before the blocks are used for planning. Planning on wrong input is the biggest risk with screenshot parsing.
- Merge blocks from all sources into one timeline, and show it before confirmation.

### 8.3 Data processing: the slot engine

This is the core of the feature. Write it as **pure functions with no I/O and no framework code, plus thorough unit tests.**

**Inputs:**
- Confirmed busy blocks for the target week.
- `UserPrefs`.
- `Facility` list.
- Away days.
- Crunch mode flag.
- Previously dismissed times, so the engine can avoid them.

**Step 1: Gap finder**
- Waking hours are configurable, defaulting to 07:00–22:30.
- Find free windows between busy blocks within waking hours.
- A gap is usable if: `gap_length >= travel_to_facility + session_length + travel_back`.
- **Travel model (street grid, decided November 18, 2026):**
  - Places are their **nearest corner** on Philadelphia's grid: a numbered street and a cross street, e.g. 23rd & Chestnut (`src/location.ts`). Users may give their home corner; facilities have one. No street addresses are stored.
  - Walking minutes = blocks between corners (numbered streets crossed + cross streets crossed) × minutes per block, a configurable setting (about 1.5 to start; tune at the engine review). It's an approximation: blocks vary in length and the Schuylkill has fixed bridges.
  - **Zones are the fallback** when a corner is missing: `CAMPUS`, `CENTER_CITY` (includes Rittenhouse) and `HOME`, with a small configurable matrix of walking minutes (0 within a zone, about 25 between campus and Center City).
  - Infer where the user is before and after a gap from the adjacent busy blocks. Class blocks mean `CAMPUS` by default. If unknown, assume home: their corner if they gave one, else their home area.
  - Pick the facility that minimizes total travel and is open during the slot.

**Step 2: Slot scoring**

Score each candidate slot, using simple, configurable weights:
- **Preference fit:** how well the slot matches the user's preferred time of day.
- **Spacing:** whether it's on a different day from other chosen slots. Avoid back-to-back days when possible.
- **Travel cost:** lower total travel scores higher.
- **Buffer:** penalize slots that end shortly before a busy block (default within 30 minutes). This avoids rushing into a recruiting event sweaty.
- **Dismissed:** heavily penalize slots overlapping times the user previously dismissed.

**Step 3: Weekly plan**
- Greedily or optimally pick the top N slots to meet the weekly target (default 3 sessions of 45 minutes), respecting spacing.
- If the target can't be met, return what fits and say why, for example "only 2 viable gaps this week."

**Step 4: Crunch mode**
- When on, the target becomes **2 sessions of 20–30 minutes**. Prefer facilities in the user's current zone or home base, such as a building gym.
- Crunch mode regenerates **only the remaining** days of the week. Completed slots stay.
- Crunch mode does **not** break streaks.

**Step 5: Busyness score**
- `busyness = total busy hours / total waking hours` for the week, computed after confirmation.
- Store it on the `Week`.
- A week counts as **busy** if `busyness >= threshold` (configurable, default 0.5) **or** crunch mode was turned on. This drives the success metric.

**Test fixtures (required):**
- **Light week:** a normal class load.
- **Recruiting-heavy week:** classes plus many evening events and coffee chats.
- **Trek week:** two or three away days.
- **Center City user:** home base in Center City, classes on campus.
- **No viable gaps:** the engine returns an empty plan with a reason and doesn't crash.

### 8.4 Output presentation (minimal UI)

The goal is to show the plan and let the user act on it.

- **Week plan view:**
  - A plain list or simple day grid of suggested slots, each showing day, time, facility, and travel time.
  - Busy blocks can be shown dimmed or omitted. Simple is fine.
  - A one-line reason when the target isn't met.
- **Actions per slot:**
  - **Accept** locks the slot in.
  - **Swap** replaces it with the next-best slot.
  - **Dismiss** removes it and records the time so the engine avoids it.
- **Crunch mode toggle** regenerates the remaining plan.
- **Export:** download accepted slots as an `.ics` file with a `VALARM` reminder 45 minutes before each slot (configurable). This is our reminder system for v1, since we can't write to the user's calendar.
- **Check-in:** mark a slot done or skipped. Skipping asks for a one-tap reason: `no_time`, `tired`, `plans_changed`, or `other`.

---

## 9. Data model (sketch; adapt to the chosen stack)

```
UserPrefs
  user_id
  weekly_target_sessions   int, default 3
  session_minutes          int, default 45
  preferred_times          [MORNING | MIDDAY | EVENING]
  home_base                CAMPUS | CENTER_CITY | BUILDING_GYM
  waking_start, waking_end time
  semester_start, semester_end  date (for recurring timetable events)

BusyBlock
  id, user_id
  start, end               datetime (America/New_York)
  label                    short string, optional
  source                   ICS | SCREENSHOT | MANUAL
  recurring_weekly         bool
  confidence               float, nullable (screenshot only)
  confirmed                bool

AwayDay
  user_id, date

Facility                   (seeded; shared with Penn Now later)
  id, name
  zone                     CAMPUS | CENTER_CITY
  lat, lng
  hours                    per weekday open/close
  type                     GYM | FIELD | POOL | STUDIO | COURT | BUILDING_GYM

Week
  user_id, week_start (Monday)
  busyness_score           float
  crunch_mode              bool
  is_busy                  bool (derived)

WorkoutSlot
  id, user_id, week_start
  start, end
  facility_id
  travel_minutes
  score
  status                   SUGGESTED | ACCEPTED | COMPLETED | SKIPPED | DISMISSED
  skip_reason              nullable enum
  created_at, updated_at

DismissedTime
  user_id, weekday, start_time, end_time   (lets the engine learn avoidance)

AnalyticsEvent
  user_id, name, payload (json), created_at
```

**As built (step 2).** Where the code differs from the sketch above:
- `UserPrefs` is **flexible**: one `preferences` table holds a JSON value per user and section, so a half adds a preference without a database change. Each section is defined in code with defaults and checks (`src/preferences.ts`), and fields added later get their defaults for users who saved before.
  - `shared` (`src/sharedPrefs.ts`), used by both halves: home area, home corner, building gym, waking hours, semester dates.
  - `outtake` (`src/outtake/prefs.ts`): weekly target, session length, preferred times.
  - `intake`: Manali's.
- Home is an area, `CAMPUS | CENTER_CITY`, plus an optional **nearest corner** (e.g. 23rd & Chestnut, which must be in that area) and a separate `hasBuildingGym` flag, instead of a third `BUILDING_GYM` value: a building gym is somewhere you live, not a third location.
- Times are New York local strings (`"2026-11-17T07:30"`, `"07:30"`, `"2026-11-16"`; `src/time.ts`), stored as `TIMESTAMP`, `TIME` and `DATE` without time zones.
- Domain types carry no `user_id`: storage scopes every query to the signed-in user, and the engine only ever sees one user's data.
- **Built to extend (before step 4):** the schedule (`BusyBlock`, `AwayDay`; tables `schedule_blocks`, `away_days`) and places are **shared with the intake half**, not outtake-only. Every table has an `attributes` JSONB column for extra fields, and value lists (sources, statuses, zones, place kinds) are checked in code rather than by the database. See "Extending without schema changes" in `tools/penn-fitness/CLAUDE.md`.
- **The engine has its own input** (`WorkoutPlanInput` in `src/outtake/engine/types.ts`: home location, waking hours, target, session length, preferred time windows, usable places), built from stored data by `buildPlanInput` (`src/outtake/planInput.ts`). The engine never reads preference or attribute names, so they can change without touching it. Preferred times become windows there (morning 00:00–12:00, midday 12:00–16:00, evening 16:00–24:00, in `PREFERRED_TIME_WINDOWS`).
- `BusyBlock` adds `zone` (step 3): where the user is during it, if known. Timetable classes are `CAMPUS`; `null` means unknown, and the engine assumes home. The spec's "class blocks mean CAMPUS" needs this, since a block otherwise doesn't say where it is. `buildPlanInput` puts every `CAMPUS` block at Huntsman Hall (38th & Walnut, `CAMPUS_BLOCK_CORNER`), where most Wharton MBA classes and events are, so walks from class are counted on the grid.
- Facility corners come from each facility's address on Penn's sites (November 2026); hours are still placeholders. Ringe Squash is now the Penn Squash Center and Levy Tennis the Hecht Tennis Center; their ids are unchanged.
- `Facility` is a shared `Place` (`src/places.ts`) with a `kind` (gym, field, pool, studio, court, building-gym). It adds a `corner` and a `verified` flag, and `lat`/`lng` are nullable until looked up. Every campus facility has placeholder hours and an approximate corner for now (`verified: false`).

**Facility seed list for v1.** Hand-enter these, and verify hours before launch:
- Pottruck, Fox Fitness, Penn Park, Sheerr Pool, Ringe Squash, Levy Tennis.
- Four to six popular Rittenhouse or Center City gyms and studios. Mark these as TODOs to fill in.
- A generic **"My building gym"**, always open, placed in the user's home zone.

---

## 10. Analytics (required for "done")

**Events to log:**
- `schedule_ingested`, with source and block count.
- `blocks_confirmed`.
- `plan_generated`, with session count, target met or not, and crunch flag.
- `slot_suggested`, `slot_accepted`, `slot_swapped`, `slot_dismissed`.
- `slot_completed`, `slot_skipped` (with reason).
- `ics_exported`.
- `crunch_toggled`.

**Metric query:** the percentage of users with at least 2 `COMPLETED` planned slots in their second week, split by `Week.is_busy`.

---

## 11. Build plan: engine first

The engine is built and tested with hand-made fixture weeks before any ingestion exists. Ingestion only needs to produce `BusyBlock`s the engine already accepts. Each step is one or a few commits; tests must pass after every commit. Tick boxes as steps complete.

- [x] **1. Kickoff (no code).** Summarize understanding, propose stack and folder structure, list questions. **Checkpoint: wait for stack confirmation.**
- [x] **2. Scaffold and foundations.** `chore: scaffold`, `feat(schedule): data model` (section 9), `feat(facilities): seed locations`, `feat(prefs): user preferences + dev auth seam`.
- [x] **3. Test fixtures.** The five fixture weeks from section 8.3 as plain data, each with a comment describing what a good plan looks like, plus failing engine tests. `test(engine): fixture weeks and expectations`.
- [x] **4. Gap finder and travel model.** Section 8.3 step 1. `feat(engine): gap finder + travel model`. Built as `findGaps` and `placeOptions` (`src/outtake/engine/gaps.ts`) and `walkingMinutes` (`travel.ts`), with settings in `ENGINE_CONFIG` (`config.ts`).
- [x] **5. Scoring, plan, crunch, busyness.** Section 8.3 steps 2 to 5, as separate `feat(engine): ...` commits. All weights in one config object. Built as `scoreSlot` (`scoring.ts`), `planWeek` (`plan.ts`) and `measureBusyness` (`busyness.ts`), with every weight in `ENGINE_CONFIG` (`config.ts`). As built:
  - The plan takes each day's best slot, then compares every set of days (at most 35) rather than picking greedily, less a penalty per pair of back-to-back days; ties go to the earliest days and times. Slots start on the quarter hour where the gap allows.
  - Crunch mode: 2 sessions of 30 minutes (no longer than the user's usual session), or 20 where 30 doesn't fit; walking costs three times as much, so sessions stay near where the user is.
  - Regenerating mid-week: `WorkoutPlanInput` gains `planFrom` (nothing starts before it) and `keptSlots` (completed slots, which stay and count toward the target), filled by `buildPlanInput` from the week's slots and the time now. There are no streaks yet for crunch mode to break.
  - Busyness counts busy minutes within waking hours; an away day with nothing on it isn't busy (still an open question).
- [x] **6. Engine review.** A debug script that prints each fixture's plan (normal and crunch) with score breakdowns, busyness and reason lines. **Checkpoint: show me the output and wait; tune weights from my feedback.** Script built: `pnpm --filter @penntools/tool-penn-fitness engine-review` (`scripts/engine-review.mjs`), printing every day's best slot with its score part by part (`bestSlotPerDay`, `explainSlot` in `plan.ts`). Decisions from the first review (November 18, 2026):
  - **Buffer after waking:** no session starts within 30 minutes of waking (`plan.wakeBufferMinutes`). A rule, not a score.
  - **10 minutes after every commitment:** nobody leaves for a session until 10 minutes after a class or event ends, then walks (`plan.afterBlockMinutes`). A rule. There's also `plan.bedBufferMinutes` (0 to start) for ending sessions before bed.
  - **Ask the user how to spread sessions:** a new outtake preference, `spreadOut` (default on). On: days in a row are penalized and evenly spaced days earn a little (`scoring.spreadPerDay`, per day apart up to 3), so ties go to an even week. Off: only the slots' own scores count. Time of day is already asked (`preferredTimes`); onboarding (step 10/11) asks both.
  - **Recruiting week:** an afternoon gap between class and evening events is as good as an early morning; the engine picks whichever is closer. No change.
  - **Start from a base, then tune per user:** everyone starts on `ENGINE_CONFIG`. A weekly check-in (`src/outtake/checkIn.ts`) asks four plain questions: how the walk felt, whether they felt rushed, whether the times were too early or late, and how many sessions would suit. Each answer nudges that user's `adjustments` (an outtake preference, stored as changes from the base and bounded by `ADJUSTMENT_RANGES`), and `tunedConfig` turns base plus adjustments into the settings their next plan uses. Questions talk about time and getting there, never weight or effort. The check-in screen comes with steps 11 and 12; its answers should be logged as analytics in step 13.
- [x] **7. .ics ingestion.** Section 8.1A. `feat(ingest): ics parser`. Built as `importIcs` (`src/outtake/ingest/ics.ts`) on top of Nutrition's `readIcs` rather than a second parser (decided November 18, 2026). It gives New York times wherever it runs, keeps no locations (only the area a location is in: `areaOfLocation`), merges overlapping events, and makes unconfirmed blocks for that one week (`recurringWeekly` false: re-import for another week). All-day events are skipped (readIcs's choice; the spec's "unless marked busy" isn't supported). Limits inherited from readIcs, logged in `docs/follow-ups.md`: off New York time an evening event can be cut at the computer's midnight, so `importIcs` returns a warning for the review screen; and it can't tell which events repeat. Run it in the browser, as Nutrition does.
- [x] **8. Screenshot ingestion.** Section 8.1B. Prompt lives in its own file; LLM mocked in unit tests; manual script for real screenshots. `feat(ingest): screenshot parser`. Built as `readTimetable` and `timetableToBlocks` (`src/outtake/ingest/timetable.ts`), with the prompt in `timetablePrompt.ts`. Nutrition's "From a screenshot" was a placeholder (it predates the AI API's image support), so there was nothing to build on; this one can serve both halves. As built:
  - `readTimetable` checks the image (type, size, that it's really that type), then calls `generateObject` with the image on the `standard` tier and the user's provider. A reply that doesn't match the schema, or has events but none usable, is retried once; then it throws `AIError("bad_output")` with a message for the user. Other AI errors (no key, credit used) aren't retried.
  - The schema follows the spec's, plus a nullable `location`, used only to work out the area and then dropped.
  - `timetableToBlocks` (no AI) places weekly events on their weekday in the week being planned, within the semester dates (`needsSemesterDates` when they aren't set, so the page asks once); keeps one-off events only in that week; leaves out unusable events with a count; and flags confidence under 0.7 (`LOW_CONFIDENCE_THRESHOLD`, `isLowConfidence`). Weekly entries with no location are on campus.
  - The image is never stored; the route that calls `readTimetable` (step 10) must not store it either.
  - **No manual script:** tool code can't read keys or call providers itself (only `getAI` can), so real screenshots are tried through the app once the review screen exists (step 10), with an AI key.
- [x] **9. Quick-add, away days, merged timeline.** Section 8.1C plus normalization. `feat(ingest): manual quick-add + away days`, `feat(ingest): normalize + merge timeline`. As built:
  - `checkQuickAdd` / `quickAddBlock` and `checkAwayDay` (`src/outtake/ingest/manual.ts`): manual blocks are one-off and confirmed as they're made, since the user typed them.
  - `weekTimeline` (`src/outtake/ingest/timeline.ts`): one week's blocks from every source. Weekly blocks are stored once, in the week first added, and repeat into later weeks within the semester dates (indefinitely when none are set); the same block from two sources shows once (confirmed first, then manual, .ics, screenshot, with `alsoFrom`); blocks that only overlap stay separate. `timelineBlocks` feeds `buildPlanInput`, so weekly classes are planned around in every week, not just the first.
  - Schedule storage for the shared tables (`src/storage/schedule.ts`): list a week's blocks (plus earlier weekly ones), add, re-import a source for a week without doubling it (`replaceImportedBlocks`, keeping confirmed blocks), edit, delete, confirm, and away days; every call scoped to the user. Tested against a throwaway Postgres schema, in New York time and in UTC.
  - Found by those tests: given a `::timestamp` parameter, the postgres driver runs the text through `new Date()` and sends UTC, moving 08:30 to 13:30. Times are sent as `::text::timestamp` instead (explained at the top of the file).
- [x] **10. Review screen.** Section 8.2, minimal UI. `feat(review): parsed blocks review screen`. Built November 18, 2026, as the first part of an **Exercise page** (`/tools/penn-fitness/exercise`, the exercise deep dive, `?week=` for other weeks), plus an **exercise card on the Penn Fitness homepage** linking to it (decided with Arpit). As built:
  - The page: import an `.ics` file (read in the browser) or a timetable screenshot (`exercise/screenshot/route.ts`, needs an AI key), semester dates, the week by day with source, "every week", "Check this" (low confidence) and "Not confirmed" tags; edit times and name, delete (warning that weekly ones go from every week), mark days away, quick-add, "Confirm N commitments", and the workouts suggested around the confirmed week. Edits change times only, applied to the stored block's own date, so a weekly class shown this week stays stored in its first week.
  - The homepage card (`exercise/ExerciseCard.tsx`, from `assembleWeek`'s summary in `src/outtake/week.ts`): "Needs you" (commitments to confirm, or add your week), "Next up" (next suggested workout, place, walk), "This week" (workouts that fit vs target, busy-week note or reason), "Today" (longest free stretch from now). A failure to load shows on the card and never breaks the Nutrition page.
  - Tested in the browser: import, re-import (replaces, doesn't double), confirm, quick-add, away, edit, delete, and the card updating. The screenshot import is untested until there's an AI key.
  - **Update, same day (Arpit's feedback):** the homepage card became a fuller **exercise section right under Nutrition's greeting** (`exercise/ExerciseHome.tsx`, passed into Nutrition's dashboard through an `afterGreeting` slot): "needs you", the next workout, tiles for this week (workouts that fit, how booked the week is), free time today and the nearest places from home, a Mon–Sun strip of the week's workouts, and tips for the week (lightest day, longest free stretch, free weekday mornings, a heavy week, setting a home corner; `WeekTip` in `src/outtake/week.ts`, worded on the page). The Exercise page gained **"Your preferences"**: nearest corner (or area), building gym, waking hours, workouts a week and their length, best times, and spread out or not; home and waking hours are shared preferences. The **bed buffer is now 30 minutes** by default (`plan.bedBufferMinutes`), and check-ins can take it from 0 to 210.
  - **Update 2 (Arpit's feedback, too long):** the homepage is now the greeting, then **Nutrition and Exercise as two sections that open**, then "Your setup" at the bottom. Closed, Nutrition shows today's macros and Exercise the next workout (or what's needed first, and commitments to confirm); open, each shows its full view. "Your setup" gains a **"Workouts"** item (sessions × length, best times, home corner) linking to the preferences. Built as `homeExercise` (`exercise/ExerciseHome.tsx`), handed to Nutrition's dashboard as `HomeExercise` (`home.ts`), with shared styles in `HomeSection.module.css`.
- [ ] **11. Week plan screen and actions.** Section 8.4. `feat(plan): week plan view`, `feat(plan): accept / swap / dismiss`, `feat(plan): crunch toggle`.
- [ ] **12. Export and check-in.** `feat(export): ics export with reminders`, `feat(checkin): done / skipped with reason`.
- [ ] **13. Analytics and end-to-end test.** Section 10, plus one end-to-end test (upload, confirm, plan, accept, export, complete). Finish with a summary of what's built, known gaps and suggested next steps.

---

## 12. Later (don't build now, but don't block it)

- **Penn Now:** live occupancy and crowd-sourced "how busy is it?" taps, reusing `Facility`. The schedule will later pick the least-crowded facility for each slot.
- **Community:**
  - Buddy slots and group runs, shown as "3 classmates are going at this time" on suggested slots.
  - Will need Penn-email auth, public meeting points, and report/block.
  - The cold-start plan is to seed content and partner with Wharton clubs.
- **Integrations (enabler layer):** Apple Health or an aggregator for auto-completing slots, plus sleep and HRV for readiness hints. This is shared with the intake teammate.
- **Push notifications**, to replace `.ics` reminders.
- **UI/UX refinement.**

---

## 13. Open questions (ask me when they become relevant)

- ~~Stack choice~~ and ~~which vision LLM, and how keys are managed~~: decided at kickoff (section 0).
- Exact Rittenhouse facility list and verified hours.
- Default busyness threshold. 0.5 is a guess; tune it with real data.
- The format MBAs most commonly use for their timetable. Collect sample screenshots from user interviews for parser fixtures.
