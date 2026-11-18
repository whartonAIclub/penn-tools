# Penn Fitness — shared context

Penn Fitness is a health app for Penn students, built as one PennTools tool (`penn-fitness`). It has two halves, each with its own spec, imported below:

- **Outtake (exercise):** owned by Arpit Singh. Spec: `docs/outtake.md`.
- **Intake (nutrition, dining, hydration):** owned by Manali Patil. Spec: `docs/intake.md` (not written yet).

Each owner edits only their own spec. Edit this file only for what both halves share, and agree on those changes together.

The repo's root `CLAUDE.md` still applies: platform APIs only, and changes only in `tools/penn-fitness/` and `apps/web/src/app/tools/penn-fitness/`.

## Shared layer (coordinate before changing)

Both halves plug into these; neither half builds them alone:

- **This week:** a home screen where both halves contribute cards.
- **Profile and preferences:** onboarding, home base, waking hours, privacy.
- **Integrations and body signals:** wearables, sleep, heart rate, HRV.
- **Analytics:** one events table for both halves.

## Code layout

```
tools/penn-fitness/
  schema.sql            one database schema (pennfitness) for both halves
  src/                  shared: profile, analytics, common types
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
