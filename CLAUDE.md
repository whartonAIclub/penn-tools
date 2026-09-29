# PennTools — Agent Instructions

## 1. Team Identification

Do **not** ask upfront. Instead, infer the team from the user's first request:

- If the request clearly targets a specific tool's files or a known team's scope, infer that team and **confirm before proceeding**: e.g. _"It looks like you're on the Platform team — is that right?"_
- If the request is ambiguous (touches multiple teams, or you can't tell which tool is involved), **ask before proceeding**: _"Which team are you on? (Or say **Register new team** to scaffold a new tool.)"_

Only proceed with any file edits after the team is confirmed. This includes changes to CLAUDE.md itself.

---

## 2. Access Scopes

### Platform Team
Full repository access. You may edit any file across:
- `CLAUDE.md` — agent instruction file; only the Platform team may modify it
- `apps/` — AskPenn web app and API routes
- `packages/` — `core` interfaces, `platform` implementations
- `scripts/` — tooling scripts
- `tools/platform-playground/` — Platform team's own tool implementation
- `apps/web/src/app/tools/platform-playground/` — Platform Playground landing page

### Tool Teams
Each tool team owns exactly one tool. Find their tool by matching the team name against `meta.json` files in `tools/*/meta.json`.

**Your tool lives in two places** — this is a Next.js constraint, not a choice:
- `tools/{tool-id}/` — business logic (TypeScript package: LLM calls, data processing, types)
- `apps/web/src/app/tools/{tool-id}/` — landing page UI (must live here for Next.js routing to work)

Think of these two directories together as "your tool". You may edit both freely.

**You MUST NOT edit anything outside your tool:**
- Other tools' directories under `tools/`
- `apps/web/src/` (except your landing page folder above)
- `packages/`
- `scripts/`

If a user requests a change outside their scope, explain the boundary politely and decline.

**PRs will not be merged unless all changes are scoped to your tool.** Before making any edits, verify they fall within your two tool directories.

---

## 3. Register New Team

When the user says "Register new team", collect these inputs one at a time:

1. **Tool title** — human-readable, e.g. `"Course Finder"`
2. **Numeric tool ID** — positive integer; verify `tools/{ID}/` does not already exist
3. **Short description** — one sentence
4. **Category** — e.g. `Academics`, `Recruiting`, `Platform`
5. **Contributors** — comma-separated names
6. **Mentor name**

The following are set automatically and should **not** be asked:
- **Version** — always defaults to `"0.0.1"`
- **Date of inception** — today's date (ISO format)
- **Latest release date** — same as date of inception; updated automatically on each new release

Show a summary and ask for confirmation before creating any files.

Then create/patch exactly these targets (follow `scripts/registerTool.sh` for precise file templates):

| Action | Target |
|--------|--------|
| Create | `tools/{ID}/meta.json` |
| Create | `tools/{ID}/package.json` |
| Create | `tools/{ID}/tsconfig.json` |
| Create | `tools/{ID}/src/types.ts` |
| Create | `tools/{ID}/src/Tool{ID}.ts` |
| Create | `tools/{ID}/src/index.ts` |
| Create | `apps/web/src/app/tools/{ID}/page.tsx` |
| Patch  | `apps/web/package.json` — add `"@penntools/tool-{ID}": "workspace:*"` to `dependencies` |
| Patch  | `apps/web/src/lib/container.ts` — import and `toolRegistry.register(new Tool{ID}())` |

After scaffolding, remind the team to:
- Run `pnpm install && pnpm build`
- Add an icon at `apps/web/public/tools/{ID}/icon.png`

---

## 4. Adding Platform APIs to a Tool

When a tool team asks to use a platform API (LLM, database, analytics, etc.), use the **Platform Playground** (`tools/platform-playground/`) as the reference implementation. Do **not** modify any files outside the tool's scope — the User and LLM APIs are already available via `ToolContext`, and the tool's own routes pass the Database and Embeddings APIs into its functions.

### Available APIs

#### User API
Get the logged-in user's name and ID.

> **Usage:** Ask your coding agent: `Implement User API and refer to the platform playground implementation for guidance.`

#### LLM API
Send text input from the user and receive text output from an AI model (supports OpenAI & Anthropic).

> **Usage:** Ask your coding agent: `Implement LLM API and refer to the platform playground implementation for guidance.`

#### Database API
Tables of the tool's own, in a Postgres schema that only the tool can access (see **Tool database isolation** in section 5).

> **Usage:** Ask your coding agent: `Implement Database API and refer to the Compass (tool 19) implementation for guidance.` The tool team writes `tools/{id}/schema.sql` (and, for reference data, `tools/{id}/seed.mjs`), and its routes or server actions pass `toolSql("<name>")` into the tool's functions. Registering the tool in `TOOLS` in `packages/platform/scripts/setup-tools.mjs` is outside a tool team's scope, so ask the Platform team to add that one line.

#### Embeddings API
Turn text into vectors for semantic search, stored with pgvector in the tool's own tables. Requires the Database API.

> **Usage:** Ask your coding agent: `Implement Embeddings API and refer to the Career Canvas (tool 8) implementation for guidance.` Routes or server actions pass `embeddingProvider` from `@/lib/container` (`null` without `OPENAI_API_KEY`) into the tool's functions, which type it as `EmbeddingProvider` from `@penntools/core/embeddings`.

### How to add an API integration

1. **Read the reference first.** Before writing any code, read the corresponding usage in:
   - `tools/platform-playground/src/PlatformPlaygroundTool.ts` — backend usage of `context.llm`, `context.currentUser`, etc.
   - `apps/web/src/app/tools/platform-playground/page.tsx` — frontend patterns for calling `GET /api/me` (User API) and `POST /api/llm/complete` (LLM API)

2. **Backend (tool logic)** — Edit only `tools/{id}/src/`:
   - For **User API**: access the logged-in user via `context.currentUser` (returns name and ID)
   - For **LLM API**: call `context.llm.complete(request)` or `context.llm.stream(request)` for AI completions
   - Import types from `@penntools/core` only — never from `@penntools/platform`
   - Never use `process.env`, `fetch` to external services, or vendor SDKs directly

3. **Frontend (landing page)** — Edit only `apps/web/src/app/tools/{id}/`:
   - For **User API**: call `GET /api/me` to get the logged-in user's name and ID
   - For **LLM API**: call `POST /api/llm/complete` with `{ messages }` in the body; optionally pass a user-provided API key via the `X-Api-Key` header
   - Mirror the patterns in the Platform Playground's `page.tsx`

4. **Verify compilation** after changes:
   ```
   npx tsc --noEmit -p apps/web/tsconfig.json
   ```

### Rules

- **All changes must stay within the tool's two directories.** Only the APIs listed above are available. If a team needs something beyond these, explain that they should request it from the Platform team — do not add it yourself.
- **Do not create routes under `apps/web/src/app/api/`.** Those are platform routes; only the Platform team creates them. A tool may add its own routes or server actions inside its landing page folder (`apps/web/src/app/tools/{id}/`), as Compass and Career Canvas do.
- **Do not duplicate platform logic.** If the Platform Playground already demonstrates the pattern, adapt it — don't reinvent it.

---

## 5. Architecture Quick Reference

| Area | Path | Who can edit |
|------|------|--------------|
| Shared interfaces | `packages/core/` | Platform team |
| DB / LLM implementations | `packages/platform/` | Platform team |
| Web app + API routes | `apps/web/src/` | Platform team |
| Tool registration | `apps/web/src/lib/container.ts` | Platform team (or via script) |
| Tool landing pages | `apps/web/src/app/tools/{id}/` | That tool's team |
| Tool implementations | `tools/{id}/` | That tool's team |

### Tool database isolation

Tools that need their own tables get a dedicated Postgres role and schema in the shared database — never tables in `public` (which `prisma db push` manages and would drop):

- Name the role and schema the same short, lowercase word for the tool (e.g. `compass`), not its numeric tool ID; use it everywhere the tool's database is referenced (`TOOLS`, `toolSql`).
- Register the tool in `TOOLS` in `packages/platform/scripts/setup-tools.mjs`. The `db:deploy` pre-deploy step (see `railway.json`) runs `db:push`, then creates the role and schema and, as that role, applies `tools/{id}/schema.sql` and runs `tools/{id}/seed.mjs` if present — no manual setup.
- There are no migrations: `schema.sql` is the tool's full schema and runs on every deploy, so every statement must be safe to re-run (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). To add a column to a table that may already exist, append `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. `seed.mjs` (optional) default-exports `async ({ sql, embeddings }) => {}` to fill reference data (`embeddings` is the platform's `EmbeddingProvider`, or `null` without `OPENAI_API_KEY`); it also runs every deploy, so it must skip work already done. A failed seed is logged and does not block the deploy.
- The tool's API routes in `apps/web/src/app/tools/{id}/` (web-app code, where platform imports are allowed) get a shared database client from `toolSql("<role>")` in `@penntools/platform/db` and pass it into the tool's functions. The tool package itself (`tools/{id}/src/`) never creates connections; its only non-core import is `import type { Sql } from "postgres"` to type that parameter. The role's `search_path` is its schema; it cannot read other tools' or platform tables. The password is derived from `DATABASE_URL`, so there is no per-tool secret. This isolation guards against mistakes, not deliberate misuse: tool code runs in the same process as platform code (the web app, and `db:deploy` for seeds), which holds the admin `DATABASE_URL`, so reviewing tool PRs is what guards against that.
- No tool can read another tool's data today. If one ever must, add explicit `GRANT`s to that same script so all shared access lives in one reviewed place; grant on a view rather than a table (a view is a stable contract) and schema-qualify names.
- For vector search, use pgvector from `public`, where the platform installs it; it is not on the tool's `search_path`, so schema-qualify the type and operators (`public.vector`, `OPERATOR(public.<=>)`, `::public.vector`). Tool code gets embeddings from the platform's `EmbeddingProvider` (`@penntools/core/embeddings`), passed in by the route like the database client. Store `embeddings.model` next to each vector and search only rows from the current model, and have the seed re-embed rows from any other model, so changing the platform's model can't mix incomparable vectors.
- Compass (tool 19) is the reference implementation; Career Canvas (tool 8) is the reference for vector search.

After any TypeScript changes, verify compilation:
```
npx tsc --noEmit -p apps/web/tsconfig.json
```
