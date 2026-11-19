# Follow-ups from merging Nutrition and Outtake

_Written November 18, 2026, when Manali's Nutrition section (`3cc307a`) was merged into Arpit's outtake work on `team/pennfitness` (merge `93ba1a3`). Pick these up later; tick them off as they're done._

Both halves' tests pass together (169 tests). Nutrition was written against the platform before `main`'s AI changes, so a few small things need updating, and the two halves built some of the shared layer separately.

---

## For Manali: please check

Arpit has kept Nutrition's code as you wrote it, apart from one fix it needed to run. These are the things that need you, most useful first; details are in the sections below.

1. **The database is ready for Nutrition.** `pennfitness` is registered on `team/pennfitness` and works locally: run `node packages/platform/scripts/setup-tools.mjs` from the repo root (with Postgres running). Nutrition can move off `localStorage` whenever you like: only `nutrition/storage.ts` should change, and your tables go in `tools/penn-fitness/schema.sql` with `intake_` names (see section 3, "Where data is stored"). Two things that will save you time:
   - **Watch out for times:** pass them to Postgres as text cast `::text::timestamp` (or `::text::date`), not `::timestamp`. With a plain `::timestamp` parameter, the postgres driver converts through `new Date()` and stores 08:30 as 13:30. See the top of `src/storage/schedule.ts`.
   - **The shared schedule is stored now:** `src/storage/schedule.ts` saves busy blocks and away days for both halves, and `weekTimeline` (`src/outtake/ingest/timeline.ts`) gives one week's view, with weekly classes repeating through the semester. Nutrition's week grid could read and write the same blocks, so students enter their classes once (section 3, "Schedule").
2. **Changes made in your files:**
   - `getAI()` → `getAI("penn-fitness")` in `page.tsx` and twice in `nutrition/actions.ts`. `main` now requires the tool's id, and without it the page crashed for every signed-in user (section 2).
   - `page.tsx` now also shows an **"Exercise this week" card** under the heading, linking to the new Exercise page (`/tools/penn-fitness/exercise`). It loads separately, so a problem with it can't break Nutrition; `<Nutrition />` is unchanged. The heading still says "Penn Fitness · Nutrition", which now sits above an exercise card: part of designing the common view together (section 5).
3. **Two lines to fix before the PR:** the settings-error lists in `nutrition/QuickLog.tsx:20` and `nutrition/planner/PlanView.tsx:24` should call `isSettingsError(kind)`; `pnpm check:tools` fails until they do (section 1).
4. **A bug:** "I ate this" logs the same meal again on every click (section 4).
5. **The preview plan ignores the user's setup**, e.g. peanut butter on the list for a peanut allergy, with only a small "Preview mode" badge to say it's a sample (section 4).
6. **`readIcs` is now used by both halves.** Outtake builds on it rather than parsing calendars again. Three small changes would help both (real start and end times, a flag for repeating events, keeping busy all-day events); see section 3, "Calendar import".
7. **Screenshot reading works now.** Your "From a screenshot" says the AI can't read images yet, but `main` added image support since you branched. Outtake's `readTimetable` (`src/outtake/ingest/timetable.ts`) reads a timetable photo with it, retrying once on a bad reply; the week grid could use it instead of the sample (its events have day, times, label and location, close to your `ScheduleBlock`).
8. **Shared-layer decisions to make together:** one schedule model, shared preferences (home as a corner, not a street address), place data, folder names, streaks, and the common view (sections 3 to 5).

---

## 1. Must fix before a PR

`pnpm check:tools` fails on two lines, so the PR can't be merged until they're fixed. They don't change how the app runs.

- [ ] `apps/web/src/app/tools/penn-fitness/nutrition/QuickLog.tsx:20`: lists the AI error kinds that send the user to Settings. Replace the list with `isSettingsError(error.kind)` from `@penntools/core/ai/errors` (root `CLAUDE.md`, section 4).
- [ ] `apps/web/src/app/tools/penn-fitness/nutrition/planner/PlanView.tsx:24`: the same.

## 2. Already fixed in the merge (for the record)

- [x] `getAI()` now takes the tool's id: `getAI("penn-fitness")`. Without it, `getAI` throws "Unknown tool", which crashed the whole page for signed-in users. Changed in `page.tsx` and twice in `nutrition/actions.ts`; nothing else in Nutrition was touched.
- [x] Both halves exported a `PlanInput` and a `TimeWindow` from the package root, and TypeScript silently hid one of each. The slot engine's are now `WorkoutPlanInput` and `PreferredWindow`; Nutrition's keep their names.
- [x] `src/index.ts` lists Nutrition's exports first, then the shared and outtake ones.

## 3. Decide together: the shared layer

`tools/penn-fitness/CLAUDE.md` describes a shared layer both halves plug into. Nutrition was built before those notes were pushed, so it has its own versions of several shared pieces. Nothing is broken, but the two halves will drift apart if both keep building on their own versions.

- [ ] **Schedule.** Nutrition has its own weekly schedule (`src/nutrition/schedule.ts`: `WeeklySchedule`, `freeWindows`, `busyAt`). Outtake uses the shared one (`src/schedule.ts`: `BusyBlock`, `AwayDay`, in the `schedule_blocks` and `away_days` tables). The point of sharing is that a user enters their classes once and both halves plan around them. Agree on one model.
- [x] **Calendar import.** Nutrition reads `.ics` files (`src/nutrition/calendarImport.ts`, with `ical.js`). Outtake's step 7 was going to build the same thing. Done November 18, 2026: outtake's `importIcs` (`src/outtake/ingest/ics.ts`) builds on Nutrition's `readIcs` instead of parsing calendars again, turning its blocks into the shared schedule's. `readIcs` itself is unchanged.
- [ ] **Calendar import: small changes to `readIcs` that would help both halves** (Manali's call; outtake works around all three today):
  - It works in the computer's time zone and cuts an event at the first midnight it crosses. Off New York time (a server in UTC, a student abroad), a 6–8 PM event comes back as 6:00–6:59 PM. Found by running outtake's tests in UTC. Outtake warns the user when this may have happened; returning each block's real start and end (as dates and times, or instants) would fix it.
  - It returns weekday and time only, so nobody can tell a weekly class from a one-off. Nutrition's grid tells the user to delete one-offs by hand ("delete anything that doesn't repeat each week"). A `recurring` flag per block would let both halves keep classes for the semester and one-offs for their week.
  - It skips all-day events. The outtake spec wanted all-day events kept when they're marked busy (e.g. a trek day: `TRANSP:OPAQUE`), which could become away days.
  - Moving it from `src/nutrition/` to `src/` would make it officially shared.
- [ ] **Preferences.** Nutrition keeps its own `NutritionPreferences`. The shared plan is one `preferences` table with a section per half (`shared`, `outtake`, `intake`; `src/preferences.ts`). Home, waking hours and semester dates belong in `shared`, so both halves use the same values.
- [ ] **Where data is stored.** Nutrition keeps everything in the browser's `localStorage` (`nutrition/storage.ts`), so it's lost on another device and in private windows. Outtake is written for the `pennfitness` database. Update (November 18, 2026): the database is now registered on `team/pennfitness` (one line in `packages/platform/scripts/setup-tools.mjs`, to be called out in the PR for the Platform team), and works locally after `node packages/platform/scripts/setup-tools.mjs`. Nutrition can move off `localStorage` whenever Manali is ready; her `storage.ts` is the only file that should need to change, and her tables would go in the same `schema.sql` with `intake_` names.
- [ ] **PR note for the Platform team:** the first PR touches one file outside the tool's folders, `packages/platform/scripts/setup-tools.mjs` (+1 line registering `pennfitness`), as other teams' PRs have.
- [ ] **Folder names.** Nutrition lives in `src/nutrition/` and `apps/web/.../penn-fitness/nutrition/`; the shared `CLAUDE.md` says `intake/`. Pick one and update `CLAUDE.md` to match. Renaming Nutrition's folders is Manali's call.
- [ ] **Places.** Nutrition's food outlets (`src/nutrition/foodData.ts`) and outtake's gyms (`src/outtake/facilities.ts`) are both places with locations and hours. The shared `Place` type (`src/places.ts`) can hold both, so walking times can be worked out the same way for each.
- [ ] **Intake spec.** `docs/intake.md` is still empty. A short spec, like `docs/outtake.md`, would make the decisions above easier to agree on.

## 4. Found by testing Nutrition in the browser

Tested November 18, 2026, signed in as the local development user, in preview mode (no AI key: the platform's `.env.local` keys are empty and the user had saved none). Working well: setup saves and comes back; daily macro targets (170 lb, moderate: protein 95–125 g, carbs 385–540 g, fat 60–95 g); `.ics` import (7 items from weekly repeats, a one-off and New York times, all correct); drag-to-add on the week grid; place search (campus and Rittenhouse branches); the Grad Plan panel; the weekly eating-out budget ($15 × 9 meals out = $135); the grocery list and ticking items off. No console errors anywhere.

- [ ] **Bug: "I ate this" logs the same meal again on every click.** The next-meal card doesn't move on or show the meal as done, so each click adds another copy to today's log and to the macros (four clicks: four salmon dinners, 144 g protein shown as target met). Mark the planned meal eaten once, and move the card to the next meal.
- [ ] **The preview plan ignores the user's setup.** With no AI key, "Make my plan" shows the fixed `SAMPLE_MEAL_PLAN`. Its grocery list has peanut butter for a user who entered a peanut allergy, and the only sign it's a sample is the small "Preview mode" badge. Quick Log already says "Preview mode: you'll see a sample. To log your own meals, add an OpenAI or Anthropic key in Settings."; the plan should say the same.
- [ ] **"Log what you spent" opens the meal log**, the same page as "Log a meal". Check that's intended, and that a meal logged there can carry a price.
- [ ] **Home is a free-text street address** ("Where do you live?", placeholder "e.g. 2040 Market St"). The shared decision is a nearest corner, never a street address (`src/location.ts`), for privacy and for walking times. Fold this into the shared home preference (section 3).
- [ ] **Streaks.** Nutrition shows a "1-day streak". Outtake's spec says crunch mode must not break streaks. Agree on what a streak is for both halves before either builds more on it.
- [ ] **Not tested yet: the real AI planner and Quick Log**, which need an AI key (a platform key in `apps/web/.env.local`, or the user's own in Settings). Check that the real plan respects allergies, dislikes, the dining plan and favourite places.

## 5. A common view

- [ ] There's no common view yet. `page.tsx` shows only Nutrition, and the outtake half has no screens until steps 10 and 11 of `docs/outtake.md`. The shared plan is a **This week** home screen with cards from both halves, plus a way to switch between Nutrition and Exercise. Design it together.
- [ ] `fullWidth: true` is now set for the whole tool (Nutrition's dashboard needs it). Outtake's screens should be built for the full-width page area too.
