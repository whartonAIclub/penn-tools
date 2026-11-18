# Feedback Insights

Turns a survey's response export into ranked themes, flagged responses and a
short list of what to change first. Page: `/tools/feedback-insights`.

## How it works

1. **Load** a CSV from Google Forms, Microsoft Forms, Qualtrics, Typeform or a
   spreadsheet (or paste the cells). Columns that identify people (Name,
   Email, Penn ID, IP address and similar) are removed as the file is read.
2. **Detect** what each column is: rating, number scale, pick-one, checkbox,
   written answer, or left out (`src/detect.ts`). The page shows how it read
   the file, and every guess can be changed on the Setup tab.
3. **Clean** each response (`src/clean.ts`): standardize timestamps and rating
   words to numbers, and flag duplicates, junk, contradictions and possible
   names. Flags suggest; a person keeps or excludes.
4. **Tag** written answers with a theme, a topic and a type (Pain point,
   Working, Idea), by hand or with AI (`src/tagging.ts`).
5. **Analyze** (`src/analyze.ts`): ratings ranked, themes counted by people,
   and recommendations scored as people × how far the theme's rating is from
   5 (themes holding only suggestions count half).

All analysis runs in the browser. The tool has no database.

## Where data lives, and what leaves the browser

- The survey, tags and decisions are kept in the browser
  (`apps/web/src/app/tools/feedback-insights/storage.ts`), not on PennTools.
  Signed in, they are in `localStorage` under the user's ID, so another
  account on the same computer doesn't see them, until **Start over**. Signed
  out, they are in `sessionStorage` and are gone when the tab closes.
- **Save a copy** downloads the whole workspace as JSON; opening that file
  loads it back. This is how people share work today.
- The two AI buttons call server actions (`actions.ts`) that use the
  platform's AI API. Only written answers are sent, with emails, phone
  numbers, @handles and names after role words ("thanks Ananya", "mentor
  sam", "thanks Dr. Patel") masked first (`src/privacy.ts`). Other names can
  still get through; tags that may hold one are flagged for a person to check.
- **Sort with AI** sends answers that say the same thing ("N/A", "n/a.") once,
  40 to a request, and asks before starting when it would take more than 5
  requests, so a large survey can't use up someone's free AI credit unseen.

## Files the tool reads and writes

| File | Columns or shape |
|------|------------------|
| Tags CSV | `comment_id, response_id, source, question, text, theme, topic, sentiment` |
| Review CSV | `response_id, decision (Keep or Exclude), reason, reviewer` |
| Workspace JSON | `{ format: "penntools-feedback-insights", version: 2, name, table: { columns, rows }, setup, tags, decisions, skipped }`, each row a list of cells in column order (version 1, with rows keyed by column name, still opens) |

A response's ID is its standardized timestamp (`YYYY-MM-DD HH:MM:SS`), with
` (2)`, ` (3)` added when several share one, or `row N` when the file has no
timestamp column.

## Presets

`src/presets.ts` holds the AI PMT end-of-program survey's themes; they are
added automatically when an uploaded file matches it.

## Developing

```
pnpm --filter @penntools/tool-feedback-insights test
pnpm typecheck && pnpm check:tools
```

Tests use a fake AI, so they need no keys. Made-up survey files for trying the
page are in `src/sample.ts` (the "Try sample data" button). It is its own entry,
`@penntools/tool-feedback-insights/sample`, which the page loads only when the
button is pressed.

## Not built yet

A shared, saved-on-the-server workspace for several organizers needs the
Database API, which the Platform team enables by adding the tool to `TOOLS` in
`packages/platform/scripts/setup-tools.mjs`.
