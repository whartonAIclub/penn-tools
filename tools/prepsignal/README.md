# PrepSignal

AI-powered case interview scoring. Paste your mock session notes and get scored across 6 dimensions — with verbatim quotes and one clear thing to work on next.

## What it does

1. **Paste** your case notes (minimum 200 words)
2. **Score** — Claude analyzes across 6 dimensions
3. **Improve** — get a feedback card with scores, quoted evidence, and one priority

**Dimensions scored:**
- Structuring
- Quantitative Rigor
- Creativity
- Synthesis
- Communication
- Business Judgment

## Getting started

**Prerequisites:** Node.js or [Bun](https://bun.sh), an [Anthropic API key](https://console.anthropic.com)

```bash
# Install dependencies
bun install

# Add your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

# Start the dev server
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

- [Next.js 15](https://nextjs.org) — React framework
- [Anthropic SDK](https://github.com/anthropic-ai/anthropic-sdk-python) — Claude API
- TypeScript

## Project structure

```
src/
  app/
    page.tsx              # Main UI
    api/score/route.ts    # POST /api/score — LLM scoring endpoint
  components/
    FeedbackCard.tsx      # 6-dimension score cards
  lib/
    score.ts              # Scoring prompt + Anthropic API call
    types.ts              # Shared types
```

## Validation study

Before showing scores to real users, run a validation study:
- Collect 5 sample transcripts across a range of performance quality
- Have 5–10 raters (classmates with MBB offers, career advisors) score each 1–5 per dimension
- Compare to the LLM's scores — target ≥75% agreement (within ±1)
- See `~/.gstack/projects/prepsignal/` for the full design doc
