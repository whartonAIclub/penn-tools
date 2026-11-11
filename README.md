# PennTools

AI-powered tools for the Penn community, built as a Next.js monorepo. Each tool has its own page at `/tools/<id>`, including AskPenn, the chat assistant (`/tools/askpenn`).

## Quick start

```bash
bash scripts/setupAndRun.sh
```

This runs the setup script, `scripts/setup.sh`, then starts the dev server at **http://localhost:3000**. The setup script starts a Postgres container in Docker, installs dependencies, builds the packages, creates `apps/web/.env.local` and applies the database schema; it's safe to re-run. Run `bash scripts/setup.sh` on its own to set up without starting the server, then `pnpm dev` when you're ready.

### Prerequisites

| Tool | Min version | Install |
|---|---|---|
| Node.js | 20.12 | https://nodejs.org |
| pnpm | 9 | `npm install -g pnpm` |
| Docker | any | https://docs.docker.com/get-docker |

The app needs Postgres (with the `vector` extension), and locally it runs in Docker: the setup script starts it for you.

Locally, you don't need Google credentials: without them, **Sign in** logs you in as a local development user.

### Environment variables

Copy `.env.example` to `apps/web/.env.local` (the setup script does this automatically) and fill in:

```bash
# The platform's keys: they pay for each user's free AI credit ($0.50), the legacy
# LLM API and, for OpenAI, embeddings. Past the credit, tools use users' own keys.
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

# Filled in by setup.sh: the local Docker Postgres
DATABASE_URL="postgresql://penntools:penntools@localhost:5432/penntools"

# Optional locally — Google sign-in (see .env.example)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
NEXTAUTH_SECRET=""
```

## Monorepo layout

```
apps/
  web/                        Next.js app (port 3000)
packages/
  core/                       Shared interfaces and the AI API's types (only runtime dep: Zod)
  platform/                   Prisma DB, AI and embedding adapters, tool databases
tools/
  askpenn/                    One package per tool; AskPenn and
  platform-playground/        the Platform Playground are the reference tools
  ...
docs/
  ARCHITECTURE.md             Architecture decisions and conventions
  RAILWAY.md                  Standing up a Railway instance
scripts/
  setup.sh                    One-shot dev setup
  setupAndRun.sh              Dev setup, then start the dev server
  new-tool.mjs                Scaffold a new tool (pnpm new-tool)
  check-tool-imports.mjs      Check tool code against the platform rules (pnpm check:tools)
CLAUDE.md                     Rules for contributors and their coding agents
```

## Common commands

```bash
pnpm dev                                      # start all dev servers
pnpm test                                     # run all tests
pnpm --filter @penntools/tool-askpenn test    # run one package's tests
pnpm build                                    # production build
pnpm typecheck                                # TypeScript check
pnpm check:tools                              # tool code follows the platform rules (no vendor SDKs or key access; notYetMigrated matches legacy API use)
pnpm new-tool                                 # scaffold a new tool (see Adding a tool)

# Apply schema changes + tool databases. db:deploy doesn't read .env.local, so pass the URL
# (this one is the local Docker Postgres that setup.sh starts):
DATABASE_URL="postgresql://penntools:penntools@localhost:5432/penntools" pnpm --filter @penntools/platform db:deploy
```

## Deploying

The app runs on [Railway](https://railway.com). To stand up a new instance, for example from your team's branch for beta testers, follow [docs/RAILWAY.md](docs/RAILWAY.md). You don't need one to build or test a tool: the local dev server covers that.

Railway has deprecated Config as Code (`railway.json`), so these commands are set by hand on the app service (**Settings → Deploy**):

| Setting | Value | Why it's needed |
|---|---|---|
| Start command | `pnpm --filter @penntools/web start` | The root `package.json` has no `start` script, so Railway can't detect one. |
| Pre-deploy command | `pnpm --filter @penntools/platform db:deploy` | Sets up the database (step 2 below); without it the tables are never created. |

Leave the build command empty: Railway runs the root `build` script (`turbo build`).

On each push to the tracked branch, Railway:

1. **Builds** the monorepo.
2. **Runs `db:deploy`** before switching traffic: pushes the platform schema, adds the first admins if there are none yet (`packages/platform/scripts/seed-platform.mjs`), then creates each tool's database role and schema, applies the tool's `schema.sql` and runs its `seed.mjs` if it has one (see `packages/platform/scripts/setup-tools.mjs`). If this fails, the previous version keeps serving. On a fresh database, the first deploy takes about a minute longer while Career Canvas embeds the course catalog.
3. **Starts** the app with `next start`.

The database is Railway's pgvector Postgres template (the platform schema needs the `vector` extension). Set these variables on the app service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{pgvector.DATABASE_URL}}` — a reference to the database service |
| `OPENAI_API_KEY` | The platform's OpenAI key: embeddings (deploys use it to embed Career Canvas's course catalog, and searches use it for users without their own OpenAI key), the legacy LLM API, and each user's free AI credit ($0.50, then their own keys from Settings) |
| `ANTHROPIC_API_KEY` | The platform's Anthropic key: the free AI credit and the legacy LLM API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google OAuth client (redirect URI `<public URL>/api/auth/callback/google`) |
| `NEXTAUTH_SECRET` | Signs session cookies; generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | The app's public URL |

## Adding a tool

The recommended way is to ask your coding agent:

> "Register new team"

The agent asks for a tool ID (a name like `course-finder`), title, description, contributors, category and mentor, then runs the scaffold script for you. The new tool appears in the site sidebar and on the dashboard, under its category, right away. The categories are `TOOL_CATEGORIES` in `packages/core/src/tools/Tool.ts`; to add one, ask the Platform team. To run it yourself, answer its questions in the terminal, or pass the answers as options (some terminals, such as Git Bash on Windows, can't answer questions):

```bash
pnpm new-tool
pnpm new-tool --id course-finder --title "Course Finder" --description "Find Penn courses by topic." --contributors "Ada Lovelace, Alan Turing" --category Academics --mentor "Grace Hopper"
```

Then build the tool with the platform APIs (user, AI, embeddings, database): section 4 of `CLAUDE.md` says how, with AskPenn (`tools/askpenn`) and the Platform Playground (`tools/platform-playground`) as the reference tools. Tool code may only use those APIs, and `pnpm check:tools` checks it. See `docs/ARCHITECTURE.md` for how the tool system works.
