# Penn Fitness — shared context

Penn Fitness is a health app for Penn students, built as one PennTools tool (`penn-fitness`). It has two halves, each with its own spec, imported below:

- **Outtake (exercise):** owned by Arpit Singh. Spec: `docs/outtake.md`.
- **Intake (nutrition, dining, hydration):** owned by Manali Patil. Spec: `docs/intake.md` (not written yet).

Each owner edits only their own spec. Edit this file only for what both halves share, and agree on those changes together.

The repo's root `CLAUDE.md` still applies: platform APIs only, and changes only in `tools/penn-fitness/` and `apps/web/src/app/tools/penn-fitness/`.

## Shared layer (coordinate before changing)

Both halves plug into these; neither half builds them alone:

- **This week:** a home screen where both halves contribute cards.
- **Profile and preferences:** onboarding, home, waking hours, privacy. Preferences live in one `preferences` table as a JSON value per section (`shared`, `outtake`, `intake`), each defined in code with defaults and checks (`src/preferences.ts`): a half adds a field in its own section with no database change. `shared` (`src/sharedPrefs.ts`) is for what both halves use.
- **Schedule:** the user's busy blocks and away days (`src/schedule.ts`; tables `schedule_blocks`, `away_days`), so both halves plan around the same classes and events.
- **Places:** gyms, dining halls and anything else with a location and hours share one type (`src/places.ts`), told apart by a free-string `kind`. Each half keeps its own list and filters by kind (outtake: `WORKOUT_PLACE_KINDS`). Place ids are unique across both halves.
- **Location:** places are their nearest corner on the street grid, e.g. 23rd & Chestnut (`src/location.ts`), never a street address; an area (`CAMPUS`, `CENTER_CITY`) when there's no corner.
- **Integrations and body signals:** wearables, sleep, heart rate, HRV.
- **Analytics:** one events table for both halves.

## Extending without schema changes

- **Extra fields:** every table has an `attributes` JSONB column (`src/attributes.ts`). Name a field for the half that owns it (`"intake.mealType"`), unless both halves use it, and read it with a default. Only fields that are searched, sorted or constrained need real columns.
- **Value lists** (block sources, slot statuses, place kinds, zones) are checked in code, not by the database, so a new value is a code change only.
- **Preferences:** add a field to your section's type with a default (`src/preferences.ts`).
- **Engines don't read stored shapes:** the exercise engine takes its own fixed input, built by `src/outtake/planInput.ts`. When stored data gains or renames attributes, only that translator changes.

## Code layout

```
tools/penn-fitness/
  schema.sql            one database schema (pennfitness) for both halves
  src/                  shared: preferences, schedule, places, location, time
  src/outtake/          exercise only
  src/intake/           nutrition only
apps/web/src/app/tools/penn-fitness/
  page.tsx, actions.ts  shared entry point
  outtake/, intake/     each half's screens
```

Table names are prefixed by half (`outtake_*`, `intake_*`); shared tables have no prefix. Tests are Vitest, run with `pnpm --filter @penntools/tool-penn-fitness test`.

## Decisions (both halves)

- Stack: the PennTools platform: Next.js and TypeScript, Postgres through the Database API (schema `pennfitness`, `toolSql("pennfitness")`), AI through the AI API, sign-in through the platform (`getCurrentUser()`, Penn accounts only).
- The `pennfitness` database still has to be registered by the Platform team (one line in `packages/platform/scripts/setup-tools.mjs`). Until then, storage code is tested against a throwaway schema, as AskPenn's tests are.
- Commit messages follow the repo's style: plain sentences, e.g. "Add the slot engine's gap finder".

@docs/outtake.md
@docs/intake.md
