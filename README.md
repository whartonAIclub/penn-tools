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

The app needs Postgres. Docker is optional — without it, set `DATABASE_URL` in `apps/web/.env.local` to a Postgres with the `vector` extension, then apply the schema and set up tool databases before starting. `db:deploy` doesn't read `.env.local`, so pass the URL on the command line: `DATABASE_URL="<url>" pnpm --filter @penntools/platform db:deploy`.

Locally, you don't need Google credentials: without them, **Sign in** logs you in as a local development user.

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
  core/                       Shared TypeScript interfaces — no runtime deps
  platform/                   Prisma DB, LLM adapters, analytics
tools/
  tool-1/                     First registered tool
  tool-2/                     Second registered tool
  ...
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

pnpm --filter @penntools/platform db:deploy   # apply schema changes + tool databases
```

## Deploying

The app runs on [Railway](https://railway.com). On the app service, set **Settings → Deploy → Pre-deploy Command** to `pnpm --filter @penntools/platform db:deploy`; without it the database is never set up. The build and start commands are Railway's defaults.

On each push to the tracked branch, Railway:

1. **Builds** the monorepo.
2. **Runs `db:deploy`** before switching traffic: pushes the platform schema, then creates each tool's database role and schema, applies the tool's `schema.sql` and runs its `seed.mjs` if it has one (see `packages/platform/scripts/setup-tools.mjs`). If this fails, the previous version keeps serving. On a fresh database, the first deploy takes about a minute longer while Career Canvas embeds the course catalog.
3. **Starts** the app with `next start`.

The database is Railway's pgvector Postgres template (the platform schema needs the `vector` extension). Set these variables on the app service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{pgvector.DATABASE_URL}}` — a reference to the database service |
| `OPENAI_API_KEY` | Your OpenAI key (chat and semantic search; deploys also use it to embed Career Canvas's course catalog) |
| `NEXT_PUBLIC_APP_URL` | The app's public URL; baked in at build time, so redeploy after changing it |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google OAuth client (redirect URI `<public URL>/api/auth/callback/google`) |
| `NEXTAUTH_SECRET` | Signs session cookies; generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | The app's public URL |

## Adding a tool

The recommended way is to ask your coding agent:

> "Register new team"

The agent will prompt you for a title, tool ID, description, category, contributors, and mentor, then scaffold everything automatically.

Alternatively, run the setup script directly:

```bash
bash scripts/registerTool.sh
```

See `docs/ARCHITECTURE.md` for the full tool system documentation.
