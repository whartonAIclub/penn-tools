# Penn Planner — v1 Build Notes
**Team 2 | AI-PMT Spring '26 | Engineer: Krishna Vadera**

---

## What's Built (v1)

A functional end-to-end prototype of the Penn Planner living at `/tools/penn-planner`.

### Flow
1. **Setup** — Upload syllabus PDF + set rigor level (5-point slider) + pace preferences
2. **Review** — AI parses assignments and estimates hours per task; student can adjust with +/− stepper
3. **My Plan** — Dashboard with stat summary, assignment list, weekly calendar grid, and Google Calendar links

### Features
- **MBA Reference Dataset** — hardcoded baseline hours by assignment type (case, exam, problem-set, quiz, group-project, etc.) used as ground truth for estimates
- **Rigor multiplier** — Just Pass (0.7×) → Dean's List (1.5×) scales all estimates
- **Pace preferences** — checkboxes (slow reader, fast quant, etc.) fed into LLM prompt
- **Two-stage LLM pipeline** — parse assignments from syllabus text → estimate effort per assignment
- **Mock fallback** — when LLM API is unavailable, shows realistic Wharton MBA sample data so the full UI flow is always demonstrable
- **Calendar block generator** — spreads study sessions across weekdays before due dates, alternating morning (9am) and evening (7pm) slots
- **Weekly calendar grid** — one week at a time, Prev/Next navigation, color-coded by type (blue=assignment, yellow=quiz, red=exam, green=project)
- **Toggle blocks** — click any block to include/exclude from plan
- **Google Calendar links** — each block opens a pre-filled Google Calendar event (no OAuth needed for v1)

---

## Running Locally

```bash
cd ~/penn-tools
git fetch origin
git pull origin main
pnpm install
pnpm dev --concurrency=15
```

Navigate to: `http://localhost:3000/tools/penn-planner`

---

## Branch

All v1 work is on: `feat/estimation-effort-engine`
Personal staging repo: `https://github.com/ksvkgp/penn-planner-v1`

To run from Krishna's branch:
```bash
git fetch origin
git checkout feat/estimation-effort-engine
pnpm dev --concurrency=15
```

---

## Known Issues / TODO for v2

| Issue | Status | Notes |
|---|---|---|
| PDF text extraction failing | 🔴 Open | Server-side pdfjs-dist worker path not resolving in Next.js; mock data works as fallback |
| LLM API not connected | 🟡 Pending | Needs PennTools platform API key from Team 20 |
| Canvas integration | 🔲 Not started | Track 1 (Arkan) — blocked until Canvas API access |
| Google Calendar OAuth | 🔲 Not started | v1 uses pre-fill URL only; real push needs OAuth |
| Feedback loop | 🔲 Not started | Post-deadline actual time capture → recalibration |

---

## File Structure

```
apps/web/src/app/tools/penn-planner/
└── page.tsx                          ← entire frontend (setup, review, dashboard)

apps/web/src/app/api/tools/penn-planner/
└── parse-pdf/route.ts                ← server-side PDF text extraction (pdfjs-dist)

tools/penn-planner/src/
├── PennPlannerTool.ts                ← platform Tool class (scaffold)
├── types.ts                          ← input/output types
└── index.ts
```

---

## LLM Prompts (Track 2 — for review)

**Prompt 1 — Syllabus Parser**
Extracts graded deliverables only. Skips readings, guest speakers, no-class rows. Handles table format (Date | Topic | Reading | Deliverables) and embedded due dates (e.g. "Project 2 - 3/8 by 11:59pm").

**Prompt 2 — Effort Estimator**
Takes parsed assignments + student rigor level + pace preferences. Applies multiplier against MBA reference dataset. Returns hours, confidence level, and one-sentence reasoning per assignment.

Both prompts use `context.llm` via `/api/llm/complete` — no direct Anthropic/OpenAI calls.

---

## Questions for Sam / Team 20

1. **API key** — how do we get a dev key for the LLM API to test end-to-end locally?
2. **pdfjs-dist** — is there a platform-approved way to handle file uploads / text extraction?
3. **ToolDataRepository** — can we use `context.db.toolData` to persist personalization prefs (rigor mode, pace) between sessions?
4. **Analytics** — should we fire events on plan generation and calendar block adds?
