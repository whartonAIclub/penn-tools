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
- `apps/` — the web app and platform API routes
- `packages/` — `core` interfaces, `platform` implementations
- `scripts/` — tooling scripts
- `tools/platform-playground/` — Platform team's own tool implementation
- `apps/web/src/app/tools/platform-playground/` — Platform Playground landing page

### Tool Teams
Each tool team owns exactly one tool. Find their tool by matching the team's name or members against the `manifest` (title and contributors) of the `Tool` class in each `tools/*/src/`.

**Your tool lives in two places** — this is a Next.js constraint, not a choice:
- `tools/{tool-id}/` — business logic (TypeScript package: AI calls, data processing, types)
- `apps/web/src/app/tools/{tool-id}/` — landing page UI (must live here for Next.js routing to work)

Think of these two directories together as "your tool". You may edit both freely.

**You MUST NOT edit anything outside your tool:**
- Other tools' directories under `tools/`
- `apps/web/src/` (except your landing page folder above)
- `packages/`
- `scripts/`

If a user requests a change outside their scope, explain the boundary politely and decline.

**PRs will not be merged unless all changes are scoped to your tool.** Before making any edits, verify they fall within your two tool directories. The one exception is a new tool's first PR: it also carries the registration that `pnpm new-tool` writes (two lines in `apps/web/src/lib/container.ts`, one in `apps/web/package.json`) and the matching `pnpm-lock.yaml` change from `pnpm install`.

---

## 3. Register New Team

When the user says "Register new team", collect these inputs one at a time:

1. **Tool ID** — a short name in lowercase words joined by hyphens, e.g. `course-finder`. It becomes the page URL (`/tools/course-finder`), the package name and the class name (`CourseFinderTool`), so check that `tools/{id}/` doesn't already exist and that the ID isn't retired (`apps/web/next.config.mjs` redirects a retired tool's URL elsewhere); the scaffold refuses both
2. **Tool title** — human-readable, e.g. `"Course Finder"`
3. **Short description** — one sentence
4. **Contributors** — comma-separated names
5. **Category** — the tool's section in the site sidebar and on the dashboard. Offer the choices in `TOOL_CATEGORIES` (`packages/core/src/tools/Tool.ts`) with what each covers, from the comment above it; leave out Platform, which is for the Platform team's own tools. A tool that fits none goes in Other. If the team wants a category that doesn't exist, tell them to ask the Platform team to add it, and pick the closest existing one for now; it's a one-line change in their manifest later
6. **Mentor name** — optional

Show a summary and ask for confirmation. Then run the scaffold script with the answers, quoting each value for the shell:

```
pnpm new-tool --id course-finder --title "Course Finder" --description "…" --contributors "Ada Lovelace, Alan Turing" --category "Academics" --mentor "Grace Hopper" --yes
```

Leave out `--mentor` when there is none. Don't create or patch the files by hand. The script creates `tools/{id}/` (`package.json`, `tsconfig.json`, `src/{Name}Tool.ts` with the manifest, `src/index.ts`) and a placeholder page at `apps/web/src/app/tools/{id}/page.tsx`, and registers the tool in `apps/web/package.json` and `apps/web/src/lib/container.ts`. It checks everything before writing, so if it fails it has changed nothing: fix the input it names and run it again.

After scaffolding, remind the team to:
- Run `pnpm install`, then `pnpm dev` to work on it
- Delete `beta: true` from the manifest (`tools/{id}/src/{Name}Tool.ts`) when the tool is ready; until then it's shown as BETA. To move the tool to another section, change its `category` there, to one of `TOOL_CATEGORIES` in `@penntools/core/tools`
- Build the tool with the platform APIs in section 4, using AskPenn and the Platform Playground as the reference tools

---

## 4. Adding Platform APIs to a Tool

When a tool team asks to use a platform API (AI, embeddings, database, etc.), follow the reference named for each API below. Do **not** modify any files outside the tool's scope — the User, AI and Embeddings APIs are already available through `@/lib/auth` and `@/lib/ai`, and the tool's own routes pass the Database API into its functions.

### Available APIs

#### User API
Get the logged-in user's name and ID.

> **Usage:** Ask your coding agent: `Implement User API and refer to the platform playground implementation for guidance.`

#### AI API
Generate text, streams or structured data (typed objects checked against a Zod schema) with OpenAI or Anthropic. The tool picks the provider on every call, plus a model tier (`fast`, `standard`, `best`) and reasoning level; the platform sets the models and defaults in `packages/core/src/ai/models.ts`. The platform picks the key, which the tool never sees: its own keys until the signed-in user has used their free AI credit ($0.50 in all, `FREE_CREDIT_USD` in `packages/core/src/ai/pricing.ts`), then the user's own key from Settings. If the user has used the credit and hasn't saved a key for that provider, the call fails with `AIError("credit_used")`. Every call's tokens and cost are recorded against the user and the tool, which is why `getAI` takes the tool's ID. A user message can also carry images (JPEG, PNG, GIF or WebP, up to 7 MB each) and PDFs, and the AI API rejects any file that isn't really the type it's labelled. It takes no other files: convert them first, to text (as AskPenn does for text files) or to a supported image (as AskPenn does for HEIC).

> **Usage:** Ask your coding agent: `Implement AI API and refer to the platform playground implementation for guidance.` The Platform Playground shows single replies and structured output; for streaming and chat history, refer to the AskPenn (tools/askpenn) implementation instead. AskPenn is also the reference for sending images, PDFs and text files with a message: reading and shrinking them in the browser (`apps/web/src/app/tools/askpenn/attachments.ts`), checking them (`checkRequest` in `tools/askpenn/src/conversation.ts`), and sending them as content parts. Send files from the page to a route in the tool's folder, as AskPenn's `stream/route.ts` does, not to a server action: Next.js refuses server action requests over 1 MB.

#### Embeddings API
Turn text into vectors for semantic search. To search more than a handful of documents, embed them once and store the vectors with pgvector in the tool's own tables, which requires the Database API. Always OpenAI, with the model set by the platform; tools can't choose another.

> **Usage:** Ask your coding agent: `Implement Embeddings API and refer to the platform playground implementation for guidance.` Routes or server actions get an `EmbeddingProvider` from `getEmbeddings("<tool id>")` in `@/lib/ai`: it embeds with the user's OpenAI key, or the platform's when they have none, and is `null` when signed out or no key exists. The Playground shows getting and using it; Career Canvas (`tools/career-canvas`) shows storing and searching vectors in the tool's tables, but predates `getEmbeddings` and still uses the container's `embeddingProvider`, which new tools don't use.

#### Database API
Tables of the tool's own, in a Postgres schema that only the tool can access (see **Tool database isolation** in section 5).

> **Usage:** Ask your coding agent: `Implement Database API and refer to the AskPenn (tools/askpenn) implementation for guidance.` The tool team writes `tools/{id}/schema.sql` (and, for reference data, `tools/{id}/seed.mjs`, as Career Canvas does), and its routes or server actions pass `toolSql("<name>")` into the tool's functions. Registering the tool in `TOOLS` in `packages/platform/scripts/setup-tools.mjs` is outside a tool team's scope, so ask the Platform team to add that one line.

#### LLM API (legacy)
`POST /api/llm/complete`, which uses a key the browser sends in `X-Api-Key`, or else the platform's while the user has free AI credit (the same credit as the AI API; once it's used, it answers `402`). Existing tools keep using it until they migrate; new tools use the AI API instead. A tool still on it sets `notYetMigrated: true` in its manifest, which shows it as BETA; `pnpm check:tools` fails if a tool calls the legacy API without it, or keeps it after migrating, so remove it when the tool moves to the AI API.

### How to add an API integration

1. **Read the reference first.** Before writing any code, read the corresponding usage in one of the two reference tools.

   The Platform Playground (`/tools/platform-playground`) covers single replies, structured output, embeddings, the User API and tests:
   - `tools/platform-playground/src/demos.ts` — the tool's logic: `ai.generate()`, `ai.generateObject()` with a Zod schema, and semantic search with an `EmbeddingProvider`
   - `tools/platform-playground/src/__tests__/demos.test.ts` — testing that logic with fake AI and Embeddings APIs: no keys, no network, no cost
   - `apps/web/src/app/tools/platform-playground/` — `page.tsx` (checks sign-in and that the user can call a provider), `actions.ts` (server actions that get the APIs, check input and return errors as data), `Playground.tsx` (calls them, shows errors, lets the user pick the provider, and calls `GET /api/me`)

   AskPenn (`/tools/askpenn`) covers streaming, chat history and the tool's own database:
   - `tools/askpenn/src/conversation.ts` — a streamed reply with the user's key, saved with the tool's own database
   - `apps/web/src/app/tools/askpenn/` — `stream/route.ts` (streams replies to the page), `AskPenn.tsx` (reads the stream, lets the user pick the provider, speed and thinking effort)

   And the APIs themselves:
   - `packages/core/src/ai/types.ts` and `AIError.ts` — the full AI API and the error kinds
   - `apps/web/src/lib/ai.ts` — `getAI(toolId)` and `getEmbeddings(toolId)` for the tool's routes and server actions

2. **Backend (tool logic)** — Edit only `tools/{id}/src/`:
   - For **User API**: take the user's ID as a parameter from the tool's route or server action, as AskPenn's `chats.ts` does
   - For **AI API**: take an `AI` (type from `@penntools/core/ai`) as a parameter from the tool's route or server action. Name the `provider` on every call. When the tool needs JSON, use `generateObject` with a Zod schema rather than parsing model text; import `z` from `@penntools/core/ai` (never install `zod` separately), and mark fields that may be missing `.nullable()`, not `.optional()`
   - Import types from `@penntools/core` only — never from `@penntools/platform`
   - Never use `process.env`, `fetch` to external services, or vendor SDKs directly
   - You may add other npm dependencies to the tool's own `package.json` (e.g. a Penn API client), but not vendor AI SDKs

3. **Frontend and the tool's server code** — Edit only `apps/web/src/app/tools/{id}/`:
   - For **User API**: call `GET /api/me` to get the logged-in user's name and ID (it returns `401` when signed out). In the tool's own routes and server actions, call `getCurrentUser()` from `@/lib/auth` (null when signed out; respond with `signInRequired()`) — never create your own user IDs or identity cookies
   - For **AI API**: call it only from server code: `getAI("<tool id>")` from `@/lib/ai` in the tool's routes and server actions (null when signed out); pass the tool's manifest ID, which its usage is recorded against. The page calls the tool's own server actions; prompts never come from or go to the browser as API calls. Return an `AIError` as data (`error.toJSON()`), since thrown errors lose their class across a server action. Server actions can't stream, so to show text as it's written, add a route in the tool's folder that sends `ai.stream()` events to the page, like AskPenn's `stream/route.ts`. To let users pick a provider, read `ai.providers()` in the tool's `page.tsx` (a server component) and pass the list to the page's client component; when an error's kind is `missing_key`, `invalid_key`, `no_credit` or `credit_used`, point users to Settings
   - **If the tool needs a signed-in user for everything**, use the standard screens in its `page.tsx`, as AskPenn and the Platform Playground do: return `<SignInPrompt title="…" />` (`@/components/layout/SignInPrompt`) when `getCurrentUser()` is null, and, if it runs on the AI API, `<ApiKeyPrompt title="…" />` (`@/components/layout/ApiKeyPrompt`) when `ai.providers()` is empty (the user has used their free credit and saved no key). Don't write your own versions. A tool with parts that work signed out shouldn't block the whole page; ask for sign-in only where it's needed
   - Mirror the patterns in the Platform Playground's and AskPenn's folders

4. **Verify** after changes:
   ```
   pnpm typecheck
   pnpm check:tools
   pnpm test
   ```
   `pnpm typecheck` checks every package, including the tool's own `src/`. Don't rely on `npx tsc -p apps/web/tsconfig.json` alone: the web app compiles against each tool's last build, so it misses errors in tool code that hasn't been rebuilt.

### Rules

- **All changes must stay within the tool's two directories.** Only the APIs listed above are available. If a team needs something beyond these, explain that they should request it from the Platform team — do not add it yourself.
- **Do not create routes under `apps/web/src/app/api/`.** Those are platform routes; only the Platform team creates them. A tool may add its own routes or server actions inside its landing page folder (`apps/web/src/app/tools/{id}/`), as AskPenn and the Platform Playground do.
- **Do not duplicate platform logic.** If the Platform Playground or AskPenn already demonstrates the pattern, adapt it — don't reinvent it.
- **New tools use the AI API, not the legacy LLM API.**
- **Never read users' saved API keys, or use them for anyone but the signed-in user.** Keys are stored in plain text. Tool code must not import `userApiKeys`, `aiUsage`, `freeCreditLeft`, `createUserAI` or `createUserEmbeddingProvider` from `@/lib/container`, or query the `user_api_keys` or `ai_usage` tables; use `getAI` and `getEmbeddings`. `pnpm check:tools` enforces this, along with no vendor SDKs, no direct provider API calls and no platform imports besides `toolSql`.

---

## 5. Architecture Quick Reference

| Area | Path | Who can edit |
|------|------|--------------|
| Shared interfaces | `packages/core/` | Platform team |
| DB / AI implementations | `packages/platform/` | Platform team |
| Web app + API routes | `apps/web/src/` | Platform team |
| Tool registration | `apps/web/src/lib/container.ts` | `pnpm new-tool` writes it; otherwise the Platform team |
| Tool categories (sidebar and dashboard sections) | `TOOL_CATEGORIES` in `packages/core/src/tools/Tool.ts` | Platform team, who add categories when tool teams ask; a tool team picks one in its manifest |
| Community tools (apps outside this repo) | `apps/web/src/data/communityTools.ts` | Platform team |
| Tool landing pages | `apps/web/src/app/tools/{id}/` | That tool's team |
| Tool implementations | `tools/{id}/` | That tool's team |

### Tool pages: header and layout

Every page, including tool pages, renders below the site header (the sidebar's hamburger, logo and PennTools on the left, then, on a tool's pages, the tool's name and its info button; the GitHub link, then **Sign in** or the profile icon and **Log out**, on the right) and beside the site sidebar, which lists every tool by section. Tool pages render in the area left over, which scrolls on its own:

- Size full-height layouts with `height: 100%` / `min-height: 100%`, not `100vh`.
- Tool pages sit in a centered 720px column. To fill the whole page area instead, set `fullWidth: true` in the tool's manifest, as Career Canvas and AskPenn do; don't break out of the column with CSS. A full-width page area is `position: relative`, so a layout that should fill it exactly, such as AskPenn's chat, can use `position: absolute; inset: 0`. The page area is all the tool's: the platform's info button is in the site header, never on top of the page.
- Size full-width layouts with `width: 100%`, not `100vw`. `100vw` is the whole window, so with the sidebar open it's wider than the page: it adds a horizontal scrollbar and pushes content out of view. The page's width also changes when the user hides or shows the sidebar.
- `position: fixed` is relative to the page's area (beside the sidebar and under the header), not the window. Use it for modals and toasts, which then stay put while the page scrolls, not to make a page fill the area (that's `fullWidth`).
- Don't build sign-in UI. When a platform API returns `401`, tell the user to sign in with the button in the header.

See **Site header**, **Site sidebar** and **Page layout** in `docs/ARCHITECTURE.md`.

### Code style

- TypeScript strict mode is on everywhere. No `any` unless unavoidable, with a comment explaining why.
- Named exports only from library packages (`packages/*`, `tools/*`); Next.js pages and layouts use default exports as Next.js requires.
- No side effects at module load time; tools are registered only in `container.ts`.
- CSS Modules for component styles, no global class names.

### Tool database isolation

Tools that need their own tables get a dedicated Postgres role and schema in the shared database — never tables in `public` (which `prisma db push` manages and would drop):

- Name the role and schema the same short, lowercase word for the tool: its tool ID without hyphens (`course-finder` → `coursefinder`), or for an older tool with a numeric ID, a word for its name (e.g. `compass` for tool 19). Use it everywhere the tool's database is referenced (`TOOLS`, `toolSql`).
- Register the tool in `TOOLS` in `packages/platform/scripts/setup-tools.mjs`. The `db:deploy` pre-deploy step (see **Deploying** in `README.md`) runs `prisma db push`, then creates the role and schema and, as that role, applies `tools/{id}/schema.sql` and runs `tools/{id}/seed.mjs` if present — no manual setup.
- There are no migrations: `schema.sql` is the tool's full schema and runs on every deploy, so every statement must be safe to re-run (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). To add a column to a table that may already exist, append `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. `seed.mjs` (optional) default-exports `async ({ sql, embeddings }) => {}` to fill reference data (`embeddings` is the platform's `EmbeddingProvider`, or `null` without `OPENAI_API_KEY`); it also runs every deploy, so it must skip work already done. A failed seed is logged and does not block the deploy.
- The tool's API routes in `apps/web/src/app/tools/{id}/` (web-app code, where platform imports are allowed) get a shared database client from `toolSql("<role>")` in `@penntools/platform/db` and pass it into the tool's functions. The tool package itself (`tools/{id}/src/`) never creates connections; its only non-core import is `import type { Sql } from "postgres"` to type that parameter. The role's `search_path` is its schema; it cannot read other tools' or platform tables. The password is derived from `DATABASE_URL`, so there is no per-tool secret. This isolation guards against mistakes, not deliberate misuse: tool code runs in the same process as platform code (the web app, and `db:deploy` for seeds), which holds the admin `DATABASE_URL`, so reviewing tool PRs is what guards against that.
- No tool can read another tool's data today. If one ever must, add explicit `GRANT`s to that same script so all shared access lives in one reviewed place; grant on a view rather than a table (a view is a stable contract) and schema-qualify names.
- For vector search, use pgvector from `public`, where the platform installs it; it is not on the tool's `search_path`, so schema-qualify the type and operators (`public.vector`, `OPERATOR(public.<=>)`, `::public.vector`). Tool code gets embeddings from the platform's `EmbeddingProvider` (`@penntools/core/embeddings`), passed in by the route like the database client. Store `embeddings.model` next to each vector and search only rows from the current model, and have the seed re-embed rows from any other model, so changing the platform's model can't mix incomparable vectors.
- AskPenn (`tools/askpenn`) is the reference implementation, including tests against a throwaway schema; Career Canvas (`tools/career-canvas`) is the reference for `seed.mjs` and vector search.

After any change, verify it with the commands in step 4 of section 4 (`pnpm typecheck`, `pnpm check:tools`, `pnpm test`).
