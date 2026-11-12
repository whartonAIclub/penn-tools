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
| Node.js | 22 | https://nodejs.org |
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
2. **Runs `db:deploy`** before switching traffic: pushes the platform schema, adds the first admins if there are none yet (`packages/platform/scripts/seed-platform.mjs`), then creates each tool's database role and schema, applies the tool's `schema.sql` and runs its `seed.mjs` if it has one (see `packages/platform/scripts/setup-tools.mjs`). It also clears removed tools' data (see Removing a tool). If this fails, the previous version keeps serving. On a fresh database, the first deploy takes about a minute longer while Career Canvas embeds the course catalog.
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

## Removing a tool

Removing a tool is one change: take out its code, and list it in `removed-tools.json` so the deploy clears its data from the database.

**Take out the code.** For a registered tool (in `tools/<id>/`):

- Delete `tools/<id>/` and `apps/web/src/app/tools/<id>/`.
- Remove the tool from `apps/web/src/lib/container.ts` (its two lines) and `apps/web/package.json`, then run `pnpm install`.
- If the tool has its own database, remove its entry from `TOOLS` in `packages/platform/scripts/setup-tools.mjs`.
- Delete its screenshot, `apps/web/public/dashboard/<id>.jpg`, and its row in `TARGETS` in `scripts/capture-tool-screenshots.py`.
- If it's listed in `KNOWN_EXCEPTIONS` in `scripts/check-tool-imports.mjs`, remove it there.
- If the tool now lives elsewhere and is listed as a community tool, redirect its old URL there in `apps/web/next.config.mjs`, as `/tools/ai-compass` does. (A tool that stays on this site under a new ID isn't being removed; see **Renaming a registered tool** below.)
- Search the repo for the tool's ID and its database name, and update anything else that mentions them, such as the docs.

For a community tool (in `apps/web/src/data/communityTools.ts`), delete its entry, its screenshot and its row in `TARGETS`.

**List it as removed.** In the same change, add the tool to `packages/platform/scripts/removed-tools.json`: its ID, and if it had its own database, its former name in `TOOLS`. For a community tool, the ID is `community-<id>`, the ID its clicks are stored under.

```json
[
  { "id": "course-finder", "name": "coursefinder" },
  { "id": "community-quakercal" }
]
```

From then on, every `db:deploy` deletes the tool's visits, and drops its role and its schema with every table in it. Dropping the schema also drops anything elsewhere that depends on its tables, so if the tool shared data with another tool (a `GRANT` in `setup-tools.mjs`), take out that sharing, and whatever the other tool built on it, before listing the tool. Anything granted to the removed tool's role is revoked when the role is dropped. That covers every database the change reaches: production, and each team instance once its branch merges `main`. `db:deploy` runs before the new version starts serving, so for that deploy the old version still serves the tool without its tables. Anyone using the tool for that minute or so gets errors. The visits the old version records in that time are deleted on the next deploy.

Keep the entries, which are safe to run again. A listed ID and name can't be used again, because the next deploy would clear the new tool's data too:

- `pnpm new-tool` refuses a listed ID.
- `db:deploy` fails if a listed name is back in `TOOLS`.
- The web app's tests fail if a listed ID is still on the site: a tool's page folder in `apps/web/src/app/tools/`, or a community tool. That also catches listing a tool before its code is taken out.

**The tool's AI usage is kept.** A user's free AI credit is the total of their `ai_usage` rows paid with the platform's keys. Deleting a tool's rows would give its users that credit back and remove its spending from `/admin`'s totals. After the tool is gone, `/admin` shows those rows under its ID. No later tool can take that ID, so their totals aren't combined.

**Renaming a community tool's `id`** works like removing it and adding it again: its clicks stay under the old ID. To keep them, don't list the old ID in `removed-tools.json`. Instead, once the rename is live, move the clicks to the new ID in each database:

```sql
UPDATE tool_visits SET tool_id = 'community-<new id>' WHERE tool_id = 'community-<old id>';
```

**Renaming a registered tool** isn't removing it either. Don't list it in `removed-tools.json`: if you did, every deploy would drop the database the renamed tool still uses.

- Rename everything named after its ID: its folders (`tools/<id>/` and `apps/web/src/app/tools/<id>/`), its package (`@penntools/tool-<id>`, also in `apps/web/package.json`), its class, its manifest's `id`, its lines in `container.ts`, its screenshot and its row in `TARGETS`. Then run `pnpm install`.
- Keep its name in `TOOLS`. The database name doesn't have to match the tool's ID (tool `19` uses `compass`), so its tables carry over unchanged.
- Redirect its old URL to the new one in `apps/web/next.config.mjs`, as `/tools/1` does. The redirect also stops `pnpm new-tool` from giving the old ID to a new tool.
- Once the rename is live, move its history to the new ID in each database. Moving its AI usage is safe, because free credit is counted per user, not per tool:

  ```sql
  UPDATE tool_visits SET tool_id = '<new id>' WHERE tool_id = '<old id>';
  UPDATE ai_usage SET tool_id = '<new id>' WHERE tool_id = '<old id>';
  ```

To run SQL locally, use `docker exec -it penntools-db psql -U penntools -d penntools`. On a Railway instance, use `railway connect pgvector`, which needs Railway's CLI and `psql` installed.
