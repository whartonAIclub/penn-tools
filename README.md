# PennTools

AI-powered tools for the Penn community. Built on a Next.js monorepo with a chat interface (AskPenn) that surfaces tools by name and links to full-page tool UIs.

## Quick start

```bash
bash scripts/test.sh
```

The setup script handles everything: installs dependencies, builds packages, spins up a Postgres container via Docker, applies the database schema, runs tests, builds the web app, and starts the dev server at **http://localhost:3000**.

### Prerequisites

| Tool | Min version | Install |
|---|---|---|
| Node.js | 20 | https://nodejs.org |
| pnpm | 9 | `npm install -g pnpm` |
| Docker | any | https://docs.docker.com/get-docker |

Docker is optional — without it, set `DATABASE_URL` in `apps/web/.env.local` manually and run `pnpm --filter @penntools/platform db:push` before starting.

### Environment variables

Copy `.env.example` to `apps/web/.env.local` (the setup script does this automatically) and fill in:

```bash
# Required — at least one LLM provider
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

# Auto-filled by test.sh if Docker is available
DATABASE_URL="postgresql://penntools:penntools@localhost:5432/penntools"

# Optional
POSTHOG_API_KEY=""
```

## Monorepo layout

```
apps/
  web/                        Next.js app (port 3000)
packages/
  core/                       Shared TypeScript interfaces — no runtime deps
  platform/                   Prisma DB, LLM adapters, analytics
tools/
  course-finder/              Example tool (@penntools/tool-course-finder)
docs/
  ARCHITECTURE.md             Architecture decisions and conventions
scripts/
  test.sh                    One-shot dev setup
```

## Common commands

```bash
pnpm dev                                      # start all dev servers
pnpm test                                     # run all tests
pnpm build                                    # production build
pnpm typecheck                                # TypeScript check
pnpm lint                                     # ESLint

pnpm --filter @penntools/platform db:push     # apply schema changes
pnpm --filter @penntools/platform db:migrate  # create a new migration
```

## Adding a tool

1. `mkdir tools/my-tool && cd tools/my-tool`
2. `pnpm init` and add `@penntools/core` as a dependency
3. Extend `Tool<MyInput, MyOutput>` and fill in `manifest` + `execute()`
4. Add `@penntools/tool-my-tool` to `apps/web/package.json`
5. Register it in `apps/web/src/lib/container.ts`
6. Create `apps/web/src/app/tools/my-tool/page.tsx` for the tool UI
7. Write tests in `src/__tests__/`

See `docs/ARCHITECTURE.md` for the full tool system documentation.
