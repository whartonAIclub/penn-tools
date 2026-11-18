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
  - The `pennfitness` database still has to be registered by the Platform team; build continues without it.

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
- **No calorie or energy-balance features**, and no "burned vs. eaten" displays. These carry disordered-eating and over-exercise risk in student populations.
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
- **Travel model (keep it simple for v1):**
  - Divide space into zones: `CAMPUS`, `CENTER_CITY` (includes Rittenhouse), and `HOME` (the user's home base). Each facility belongs to a zone.
  - Use a small constant matrix of walking minutes between zones, for example 0 within a zone and about 25 between campus and Center City. Make it configurable.
  - Infer where the user is before and after a gap from the adjacent busy blocks. Class blocks mean `CAMPUS` by default. If unknown, assume the user's home base.
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
- [ ] **2. Scaffold and foundations.** `chore: scaffold`, `feat(schedule): data model` (section 9), `feat(facilities): seed locations`, `feat(prefs): user preferences + dev auth seam`.
- [ ] **3. Test fixtures.** The five fixture weeks from section 8.3 as plain data, each with a comment describing what a good plan looks like, plus failing engine tests. `test(engine): fixture weeks and expectations`.
- [ ] **4. Gap finder and travel model.** Section 8.3 step 1. `feat(engine): gap finder + travel model`.
- [ ] **5. Scoring, plan, crunch, busyness.** Section 8.3 steps 2 to 5, as separate `feat(engine): ...` commits. All weights in one config object.
- [ ] **6. Engine review.** A debug script that prints each fixture's plan (normal and crunch) with score breakdowns, busyness and reason lines. **Checkpoint: show me the output and wait; tune weights from my feedback.**
- [ ] **7. .ics ingestion.** Section 8.1A. `feat(ingest): ics parser`.
- [ ] **8. Screenshot ingestion.** Section 8.1B. Prompt lives in its own file; LLM mocked in unit tests; manual script for real screenshots. `feat(ingest): screenshot parser`.
- [ ] **9. Quick-add, away days, merged timeline.** Section 8.1C plus normalization. `feat(ingest): manual quick-add + away days`, `feat(ingest): normalize + merge timeline`.
- [ ] **10. Review screen.** Section 8.2, minimal UI. `feat(review): parsed blocks review screen`.
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
