# Follow-ups from merging Nutrition and Outtake

_Written November 18, 2026, when Manali's Nutrition section (`3cc307a`) was merged into Arpit's outtake work on `team/pennfitness` (merge `93ba1a3`). Pick these up later; tick them off as they're done._

Both halves' tests pass together (169 tests). Nutrition was written against the platform before `main`'s AI changes, so a few small things need updating, and the two halves built some of the shared layer separately.

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
- [ ] **Calendar import.** Nutrition reads `.ics` files (`src/nutrition/calendarImport.ts`, with `ical.js`). Outtake's step 7 was going to build the same thing. Build one shared importer that produces the shared schedule, reusing what's in Nutrition's.
- [ ] **Preferences.** Nutrition keeps its own `NutritionPreferences`. The shared plan is one `preferences` table with a section per half (`shared`, `outtake`, `intake`; `src/preferences.ts`). Home, waking hours and semester dates belong in `shared`, so both halves use the same values.
- [ ] **Where data is stored.** Nutrition keeps everything in the browser's `localStorage` (`nutrition/storage.ts`), so it's lost on another device and in private windows. Outtake is written for the `pennfitness` database, which still needs the Platform team to register it (one line in `packages/platform/scripts/setup-tools.mjs`). Move Nutrition to the database once it's registered.
- [ ] **Folder names.** Nutrition lives in `src/nutrition/` and `apps/web/.../penn-fitness/nutrition/`; the shared `CLAUDE.md` says `intake/`. Pick one and update `CLAUDE.md` to match. Renaming Nutrition's folders is Manali's call.
- [ ] **Places.** Nutrition's food outlets (`src/nutrition/foodData.ts`) and outtake's gyms (`src/outtake/facilities.ts`) are both places with locations and hours. The shared `Place` type (`src/places.ts`) can hold both, so walking times can be worked out the same way for each.
- [ ] **Intake spec.** `docs/intake.md` is still empty. A short spec, like `docs/outtake.md`, would make the decisions above easier to agree on.

## 4. A common view

- [ ] There's no common view yet. `page.tsx` shows only Nutrition, and the outtake half has no screens until steps 10 and 11 of `docs/outtake.md`. The shared plan is a **This week** home screen with cards from both halves, plus a way to switch between Nutrition and Exercise. Design it together.
- [ ] `fullWidth: true` is now set for the whole tool (Nutrition's dashboard needs it). Outtake's screens should be built for the full-width page area too.
