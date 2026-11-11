# Recruiting Helper — testing plan

How Recruiting Helper is tested: automated tests that run with no API key and cost nothing, a manual checklist run in the browser before each release, and the user tests from the WAIAC AI PM Training.

Last run: 11 Nov 2026, on `team/recruiting-helper-registration` with the latest `main` merged in, after the fixes from the first review. Every test that was run passed; the results column says which were run that day and which earlier.

## 1. Automated checks

Run from the repository root:

```
pnpm typecheck
pnpm check:tools
pnpm --filter @penntools/tool-recruiting-helper test
```

The AI is replaced by a fake in these tests, so they need no key and don't spend credit. Storage tests run against a throwaway Postgres schema (made from `schema.sql`, dropped afterwards) and are skipped when no database is configured.

| Area | File | Tests | What it proves |
|---|---|---|---|
| Scoring | `src/__tests__/scoring.test.ts` | 52 | Company tiers (+1 Target, 0 Secondary, −1 Practice or off-list); people's points (1 + 2 Target / 1 Secondary, +1 relevant role, +1 per bonus signal, capped at 5); signals not on the student's list are ignored and none counts twice; the paste is sent with the profile and screenshots go as images; an unclear paste asks instead of guessing; posting summaries, teams (named or inferred) and search phrases are kept; postings saved before summaries existed still load; profile, paste and link checks, including text with a null character, which Postgres can't store |
| Outreach | `src/__tests__/outreach.test.ts` | 39 | Drafts are built only from the person's saved profile and the student's background; "schools not recorded" is passed on so no shared school is invented; a remembered style is followed by new drafts and dropped when cleared; "change all drafts" sends the current draft and the instruction; school and email boxes are checked; Penn and Wharton schools are tagged as Penn alumni and earn a matching bonus signal's point once |
| Résumé | `src/__tests__/resume.test.ts` | 12 | The server accepts only PDFs, recognized by their bytes, not their names (Word files are read in the browser, so the server never unzips an upload); old `.doc` files get instructions to convert; Word text is read without AI; PDFs are read by the AI, and an unreadable one is reported |
| Storage | `src/__tests__/storage.test.ts` | 15 | `schema.sql` can be re-run on every deploy; each user sees, edits and deletes only their own profile and items; the list is ranked best first; re-pasting a posting (same link, company and role) or person (same name and company) replaces it and keeps the earlier link, outreach draft and email, while two people with the same name at different companies, or two roles sharing a careers-page link, stay apart; a full list (500 items) refuses new items but still updates repeats; re-scoring after a profile change needs no AI and leaves drafts and emails alone; the outreach style survives a profile save |
| **Total** | | **118** | |

`pnpm typecheck` checks every package, including this one; `pnpm check:tools` checks the platform rules (no vendor SDKs, no direct provider calls, no reading saved API keys). The full `pnpm test` passes too. On Node 20 its last step can't expand `scripts/*.test.mjs`, so run those files by name there: `node --test scripts/check-tool-imports.test.mjs scripts/new-tool.test.mjs`.

## 2. Manual test specifications

Run at `/tools/recruiting-helper` while signed in, with an Anthropic or OpenAI key saved in Settings. "Pass" means every expected result happened.

| ID | Test | Steps | Expected result | Result |
|---|---|---|---|---|
| M1 | Sign-in required | Open the page signed out | The standard PennTools sign-in screen, nothing else | Not re-run (platform's standard screen) |
| M2 | Key required | Sign in with no API key saved | The standard "add an API key" screen linking to Settings | Not re-run (platform's standard screen) |
| M3 | Saved list loads | Open the page with a saved profile and list | Profile summary (roles and company tiers) and the ranked list, best score first | Pass |
| M4 | Score a job posting | Click "Try an example: job posting", then **Score it** | "Added to your list" with a 1–5 score and the math behind it; a 50–100 word summary of the role; the team, marked as named in the posting or inferred; LinkedIn people-search links; lead-with points, gaps and apply-by date; a note if the company isn't on the profile | Pass (3/5: role fit 4, −1 not on list) |
| M5 | Score a person | Click "Try an example: LinkedIn profile", then **Score it** | Score with the points spelled out; priority; schools read from the profile; Penn alum tag for a Wharton graduate; editable School and Email boxes; a hook; an outreach email draft written automatically | Pass (4/5, Penn alum, draft written) |
| M6 | No invented common ground | Read the M5 draft | It mentions a shared school only if that school is in the person's Schools | Pass (Wharton is on the example's profile) |
| M7 | Remove from list | Open an item, click **Remove from list** | The item leaves the list at once and is still gone after reloading | Pass |
| M8 | Screenshots | Paste one to four screenshots of a LinkedIn profile (⌘V), then **Score it** | Read the same as pasted text | Pass (in earlier run) |
| M9 | Résumé upload | In **Edit** profile, upload a PDF, then a Word résumé | The background box fills with the résumé's text; the character counter updates. The Word file is read on the page, with no request to the server | Pass (Word on 11 Nov, PDF in earlier run) |
| M10 | Voice typing | Click the microphone in the background box and speak | Words appear in the box; a hint shows in browsers without speech support | Pass (in earlier run, Chrome) |
| M11 | Re-score on profile change | Move a company to another tier and save | Scores of items at that company change without new AI calls | Covered by the storage tests |
| M12 | Change all drafts | Type "make them shorter", click **Update all** | Every person's draft is rewritten; with "Use this for new drafts too" checked, new drafts follow it until "Stop using it" | Pass (in earlier run) |
| M13 | Repeats | Paste the same person twice | "Already on your list, so it was updated"; their draft and email are kept | Pass (in earlier run) |
| M14 | Across devices | Sign in on a second browser | The same profile and list | Pass (in earlier run) |
| M15 | Never sends | Look for any send action | Drafts can only be copied; the page says nothing is sent | Pass |
| M16 | Missing drafts | Open the page with a person who has no email draft | Nothing is written on its own; a notice offers "Write the missing draft", which writes it with the selected AI provider | Pass |

## 3. User tests (WAIAC AI PM Training)

Five MBA students try the tool on their own recruiting and say what helped and what didn't. For each tester, record:

| Tester | Date | Tasks tried | Did the scores match their judgment? | Would they send the draft as-is? | Confusing moments | Changes made |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

Tasks to give each tester:

1. Upload your résumé, pick your target roles, and sort 3–5 companies into Target / Secondary / Practice.
2. Paste a real job posting you're considering. Does the score, summary and team look right?
3. Paste the LinkedIn profiles of two people you'd like to meet. Is the ranking the order you'd reach out in?
4. Read one outreach draft. What would you change before sending it? Try "change all drafts" with that change.
5. Open the tool on your phone or another computer. Is your list there?
