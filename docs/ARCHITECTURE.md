# PennTools Architecture

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  apps/web  (Next.js)                                     │
│   └─ route handlers → container.ts (DI root)             │
│   └─ lib/auth.ts (Google sign-in, getCurrentUser)        │
│   └─ pages, server actions and routes (tool folders)     │
├──────────────────────────────────────────────────────────┤
│  packages/platform  (reads env vars, constructs clients) │
│   ├─ Prisma repositories                                 │
│   ├─ AI adapters (OpenAI Responses, Anthropic Messages)  │
│   ├─ Legacy LLM adapters (OpenAI, Anthropic)             │
│   ├─ Embedding adapters (OpenAI)                         │
│   └─ Tool databases (toolSql; setup-tools for db:deploy) │
├──────────────────────────────────────────────────────────┤
│  packages/core  (pure interfaces, no env, no vendor SDK) │
│   ├─ Tool (manifest), ToolRegistry, Logger               │
│   ├─ AI API types, model catalog, AIError, z (Zod)       │
│   ├─ EmbeddingProvider, legacy LLMProvider interfaces    │
│   └─ Repository interfaces (User, UserApiKey)            │
├──────────────────────────────────────────────────────────┤
│  tools/<tool_id>  (one folder per tool)                  │
│   ├─ a Tool class with the manifest, plus its logic      │
│   └─ optional schema.sql + seed.mjs (own DB schema)      │
└──────────────────────────────────────────────────────────┘
```

### Dependency rules

| Package | May import from | Must NOT import from |
|---------|----------------|---------------------|
| `core` | Node builtins, `zod` (re-exported as `z` for AI schemas) | `platform`, `env`, any vendor SDK |
| `platform` | `core`, vendor SDKs, `process.env` | `apps/web`, `tools/*` |
| `tools/*` | `core` only | `platform`, `process.env`, fetch, Prisma |
| `apps/web` | `core`, `platform`, `tools/*` | — |

A tool with its own schema still follows these rules: its API route in
`apps/web` gets a shared database client from `toolSql("<role>")`
(`@penntools/platform/db`) and passes it into the tool's functions. The tool
never opens connections; it may only `import type { Sql } from "postgres"` to
type that parameter.

---

## Tool system

### Tools as mini-websites

Every tool is a first-class feature with its own UI page at `/tools/[tool-id]`, not
just a backend function. AskPenn, the chat assistant, is a tool like any other
(`tools/askpenn`, at `/tools/askpenn`).

AskPenn and the Platform Playground (`tools/platform-playground`) are the
reference tools for new tool teams. AskPenn shows streaming, chat history and a
tool's own database. The Playground shows single replies, structured output,
embeddings, the User API and testing with fake APIs.

Each tool ships with:
- **Backend logic** — functions in `tools/<tool-id>/` (`core`-only, no UI) that the
  tool's page, routes and server actions call, plus a `Tool` class holding its manifest
- **UI page** — a Next.js page at `apps/web/src/app/tools/[tool-id]/page.tsx`
- **UI components** — co-located under `apps/web/src/app/tools/[tool-id]/`

The tool `manifest` (defined in the `Tool` class) is the single source of truth for a
tool's title, description, contributors, category and status. The site sidebar and
the dashboard list it under its category, and on its pages the site header shows its
title, with an info button for the rest:

```ts
export class AskPennTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "askpenn",
    title: "AskPenn",
    description: "Chat with an AI assistant for Penn students and staff, …",
    contributors: ["Platform team"],
    category: "Platform", // one of TOOL_CATEGORIES in @penntools/core/tools
    beta: true,           // shown as BETA
    fullWidth: true,      // fill the page area, not the 720px column (see Page layout)
    // and optionally a mentor, and notYetMigrated (below)
  };
}
```

### Folder layout (AskPenn)

```
tools/
  askpenn/                ← backend package (@penntools/tool-askpenn)
    src/
      AskPennTool.ts      ← the manifest
      conversation.ts     ← the tool's logic: replies with the AI API
      chats.ts            ← reads and writes its own tables
      index.ts            ← exports the tool class and its functions
      __tests__/          ← tests with a fake AI and a throwaway schema
    schema.sql            ← optional: the tool's own database tables

apps/web/src/app/tools/
  askpenn/
    page.tsx              ← /tools/askpenn: checks sign-in and saved keys
    actions.ts            ← server actions that call the tool's logic
    stream/route.ts       ← a route, for streaming replies to the page
    AskPenn.tsx           ← the page's client component (+ AskPenn.module.css)
```

### Adding a new tool

1. Run `pnpm new-tool` (or ask your coding agent to "Register new team", and it
   runs the script). It creates the tool package with its manifest, a
   placeholder page, and the entries in `apps/web/package.json` and
   `container.ts`.
2. Put the tool's logic in `tools/<tool-id>/src/`, and call it from server
   actions or routes in the tool's page folder, which pass in the platform APIs
   (`getAI`, `getEmbeddings`, `toolSql`). CLAUDE.md section 4 has the details;
   AskPenn and the Platform Playground are the reference tools.
3. Write tests in `src/__tests__/`, passing in fakes for the APIs (see the
   Playground's `demos.test.ts`).

### How the registry works

Tools are registered **explicitly** at server startup, in `container.ts` (not at
import time), which keeps the order predictable and lets tests use their own
`new ToolRegistry()`. `pnpm new-tool` writes a new tool's two registration lines.

```ts
// container.ts (server-only, runs once per process)
import { toolRegistry } from "@penntools/core/tools";
import { AskPennTool } from "@penntools/tool-askpenn";
toolRegistry.register(new AskPennTool());
```

The registry only holds manifests, and only server code reads it: the root layout
and the home page for the site sidebar and the dashboard (see **Tool catalog**
below), the site header for the current tool's name and info button (it passes
down only those details, as `ToolInfo`, so the browser never gets whole
manifests), and the tools layout (`apps/web/src/app/tools/layout.tsx`) for which
tools are full-width (see **Page layout**). A tool does its work from its own
pages, routes and server actions.

---

## AI API

New tools generate text and structured data through `@penntools/core/ai`;
existing tools keep the legacy LLM API (`/api/llm/complete`)
until they migrate, after which it is deleted. How to call it is in CLAUDE.md
section 4; this section covers the design.

- **Keys stay server-side.** `createUserAI(userId, toolId)` in `container.ts`
  builds an `AI` bound to one user and tool. Tools get it from
  `getAI(toolId)` (`apps/web/src/lib/ai.ts`, bound to the signed-in user). Keys
  stay inside the adapters' closures, and `AIError` messages are written by the
  platform, so no key reaches tool code or logs.
- **Free credit, then the user's key.** Each call uses the platform's key for
  its provider (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) while the user's
  `FREE_CREDIT_USD` ($0.50, ever, across both providers;
  `packages/core/src/ai/pricing.ts`) covers it, then the user's saved key.
  With neither, it fails with `credit_used` (or `missing_key` when the platform
  has no key for that provider). If the platform's key itself is rejected or
  out of credit, users see `unavailable` and the error is logged, since the
  fix is ours, not theirs.
- **Reserve, then settle.** Before a call on the platform's key, the
  provider's token counting endpoint counts its input (Anthropic's
  `count_tokens`, OpenAI's `responses/input_tokens`; a local estimate stands in
  if counting fails), and the call reserves its expected cost: that input
  plus `EXPECTED_REPLY_TOKENS` (4,000) of reply, or its `maxOutputTokens` if
  lower. The reservation is a pending `ai_usage` row, taken under a per-user
  Postgres advisory lock so calls started together can't overrun the credit
  together; the call settles it with what it used, or releases it if the
  provider billed nothing. So input never takes a user past the credit, and
  only a reply longer than 4,000 tokens can, by at most the rest of its reply
  cap. Reserving the whole cap instead would leave much of the credit
  unusable on the larger models (16,000 tokens of Opus 5.5 reply is $0.32).
  Since calls stop a little short of the credit, less left than the cheapest
  call reserves (`MIN_CALL_USD`, $0.002) counts as used: `providers()` drops
  the platform's providers and Settings shows none left.
  The legacy LLM API reserves the same way, from a local estimate.
- **Every call is recorded.** `createAI` reports each billed call's tokens,
  cost (from `MODEL_PRICES` in `pricing.ts`) and whose key paid; `container.ts`
  saves it in `ai_usage` with the user and tool. A stream cut short after the
  provider started answering is recorded with estimated tokens. Search-query
  embeddings and the legacy LLM API are recorded the same way, and the legacy
  API spends the same free credit. `/admin`, for admins only, shows spend by
  tool and by user.
- **One model catalog.** The tool picks the provider; models and their default
  reasoning come from `packages/core/src/ai/models.ts`, so changing a model is
  a one-file change. Requests are checked against a Zod schema in `createAI`,
  since they can carry browser input.
- **Adapters** (`packages/platform/src/ai/`): OpenAI's Responses API and
  Anthropic's Messages API, each a single `stream()`. `createAI` builds
  `generate()` and `generateObject()` by collecting the stream, so every request
  streams and long replies never hit non-streaming limits. For
  `generateObject`, the adapter sends the Zod schema as structured output and
  returns the raw text; `createAI` checks the stop reason (refused, cut off)
  before parsing and validating.
- **Images and PDFs.** A user message's content can be a list of parts (text,
  image, PDF; `AIContentPart`), sent inline as base64 in the request: nothing
  is uploaded to the provider's Files API, which would leave files in the
  user's own provider account and tie them to one provider. Those are the only
  files the AI API takes, in the image types both providers read, and
  `createAI` checks each one really is its type from its first bytes, so a
  mislabelled file never reaches a provider; tools convert anything else first,
  to text or to a supported image. The limits, `fileType()` and
  `imageFitSize()` (the largest size Claude reads, for shrinking images in the
  browser first) are in `packages/core/src/ai/attachments.ts`, also exported
  without zod as `@penntools/core/ai/attachments` for browser code. Office
  files aren't supported: Anthropic doesn't read them, so a tool would have to
  extract their text first. Pages send files to a route in the tool's folder
  (AskPenn's `stream/route.ts`), since Next.js refuses server action requests
  over 1 MB. PDFs are the costly part: Claude reads each page as text and an
  image, about 1,500 tokens a page, up to 600 pages, so AskPenn allows 20.
- **Errors.** Every failure reaching a tool is an `AIError` (aborts excepted):
  provider errors map to a kind, and anything else (a connection dropped
  mid-stream, a bug) becomes `unavailable` and is logged in full.
- **Embeddings.** Always OpenAI with `EMBEDDING_MODEL`. Seeds (`db:deploy`) use
  the platform's key. Search queries (`getEmbeddings`)
  use the user's OpenAI key, or `OPENAI_API_KEY` when they haven't saved one.
  Each call is recorded in `ai_usage`; calls on the platform's key count
  toward the user's free credit but aren't reserved or refused, since they
  cost so little (text-embedding-3-small is $0.02 per million tokens).
- **Enforcement.** `pnpm check:tools` (`scripts/check-tool-imports.mjs`) fails
  if tool code imports a vendor SDK, calls a provider API, or touches users'
  keys or platform internals.

---

## Identity and sign-in

- There are no anonymous users. A `users` row exists only once someone signs in
  with Google, keyed by `google_id`; each sign-in refreshes their name, email
  and picture.
- Sign-in uses NextAuth (`apps/web/src/lib/auth.ts`). Sessions are signed JWT
  cookies carrying the `users` row id; there are no session tables. In
  development without Google credentials, sign-in logs in as a fixed local user.
- `getCurrentUser()` (`apps/web/src/lib/auth.ts`) is the one place server code
  gets the current user. Signed-out visitors can browse pages, but it returns
  null for them and APIs that need a user respond `401` via `signInRequired()`.
- Every repository method receives `userId` explicitly — there are no implicit
  "current user" globals.

---

## Site header, sidebar and page layout

### Site header

The root layout (`apps/web/src/app/layout.tsx`) renders `SiteHeader`
(`apps/web/src/components/layout/SiteHeader.tsx`) above every page, including
tool pages. It is a server component that calls `getCurrentUser()`:

- **Left:** the hamburger that hides or shows the site sidebar, then the
  Wharton AI Club logo and "PennTools", linking to the home page. On a tool's
  pages, then "/" and the tool's name, linking to its main page, and the info
  button, which opens its description, contributors and mentor (`HeaderTool`).
  It's in the header so it can't cover anything a tool draws. On phones only
  the info button shows; the popover names the tool.
- **Right, always:** a **GitHub** link to the repository, before the sign-in
  controls below.
- **Signed out:** a **Sign in** button. It signs in with the provider in
  `signInProvider` (Google, or the local development user) and returns to the
  same page. It is disabled when sign-in isn't configured. Only Penn accounts
  can sign in: the Google account needs a verified email at upenn.edu or a Penn
  school's subdomain, such as wharton.upenn.edu (the `signIn` callback in
  `apps/web/src/lib/auth.ts`). Anyone else lands on `/penn-only`, which says so,
  and Google always shows its account picker so they can choose their Penn
  account next time.
- **Signed in:** the profile picture (or initial), linking to account settings
  at `/settings` (the Google profile, how much of the free AI credit is left,
  and the user's own OpenAI and Anthropic API keys, used once that credit is
  spent; see `ai_usage` and `user_api_keys` under **Data model**), and
  **Log out**, which signs out and stays on the page.

Pages that need a user render `SignInPrompt` for signed-out visitors instead of
their content (`/settings`, AskPenn and the Platform Playground do). Tools that
need a user for everything use the standard screens: `SignInPrompt` with just
their title ("Sign in to use AskPenn."), and, if they run on the AI API,
`ApiKeyPrompt` when the user has used their free AI credit and hasn't saved a
key (`ai.providers()` is empty), pointing to Settings. Because
`getCurrentUser()` reads the request's cookies, every page renders per request
rather than being prerendered; it is cached per request, so the header and the
page share one user lookup.

### Tool catalog

`toolCatalog()` (`apps/web/src/lib/toolCatalog.ts`) sorts every tool on the
site into sections, for both the site sidebar and the dashboard. The sections
are `TOOL_CATEGORIES` (`packages/core/src/tools/Tool.ts`), in that order:
Recruiting, Academics, Finance, Entrepreneurship, Productivity, Lifestyle,
Other (the catch-all) and Platform. A comment there says what each covers;
`pnpm new-tool` requires one and reads the list from that file. Only the
Platform team adds categories. Each holds:

- **Community tools** in that category: apps that live outside this repo and
  open in a new tab, listed by hand in `apps/web/src/data/communityTools.ts`.
- **Registered tools** whose manifest names that category, in the order
  `container.ts` registers them, so a tool appears as soon as it's registered.

A registered tool is shown as **BETA** when its manifest sets `beta: true` or
`notYetMigrated: true`. `notYetMigrated` marks a tool still on the legacy LLM
API; it isn't shown to users except as BETA, and `pnpm check:tools` keeps it
accurate (it fails if a tool calls `/api/llm/complete` without it, or has it and
doesn't). A section whose tools are all in beta is marked BETA itself.

### Site sidebar

The root layout renders `SiteSidebar`
(`apps/web/src/components/layout/SiteSidebar.tsx`) to the left of every page: a
**Dashboard** link, then each section of the catalog with its tools. A tool links
to its page, or out to a community tool in a new tab. Clicking a section's name
collapses or expands it; the `penntools_sidebar_collapsed` cookie remembers which
are collapsed.

- **Desktop:** open unless the user hides it with the header's hamburger. The
  `penntools_sidebar` cookie remembers that, so the server renders it the same
  way and it doesn't flash on load.
- **Narrow screens (768px or less):** a drawer over the page, closed until the
  hamburger opens it, and closing on choosing a link, changing pages, Escape or a
  click outside it.

### Home page

The home page (`apps/web/src/app/page.tsx`) is the dashboard
(`apps/web/src/components/dashboard/`): the catalog's sections as tiles. Each
tile shows a screenshot from `apps/web/public/dashboard/{id}.jpg`, captured by
`scripts/capture-tool-screenshots.py`; a tool without one gets a plain tile.

### Page layout

Below the header and beside the sidebar, every page renders inside
`.app-viewport`, which fills the rest of the window and scrolls on its own
(styles in `apps/web/src/app/globals.css`).
For page authors this means:

- Tool pages sit in a centered 720px column. A tool whose manifest sets
  `fullWidth: true` fills the whole page area instead, as Career Canvas and
  AskPenn do; the tools layout (`apps/web/src/app/tools/layout.tsx`) reads that
  from the manifests. A full-width page area is `position: relative` and at least
  as tall as the space, so a layout that should fill it exactly, such as AskPenn's
  chat, uses `position: absolute; inset: 0`. Don't break out of the column with
  CSS instead.
- Size full-height layouts with `height: 100%` / `min-height: 100%`, not `100vh`;
  `100vh` is taller than the space under the header and adds a scrollbar.
- `position: fixed` is relative to the page's area, not the window
  (`.app-viewport` uses `contain: layout`), so fixed modals and toasts cover the
  page but not the header or sidebar, and stay in place while the page scrolls.
  Use `fullWidth`, not `position: fixed`, to make a page fill the area.
- Size full-width layouts with `width: 100%`, not `100vw`. `100vw` is the whole
  window, so with the sidebar open it's wider than the page: it adds a horizontal
  scrollbar and pushes content out of view. The page's width also changes when
  the user hides or shows the sidebar.
- Don't build sign-in UI in a tool; when a platform API returns `401`, ask the
  user to sign in with the button in the header.

---

## Data model

See `packages/platform/prisma/schema.prisma` for the canonical schema.

Key design choices:
- `user_api_keys` holds the OpenAI and Anthropic keys users save on `/settings`
  (at most one per provider), in plain text. Keys are checked with the provider
  before saving and never sent back to the browser; the page shows only the last
  four characters. The repository is `userApiKeys` in `container.ts`; tool code
  must not import it (enforced by `pnpm check:tools`). The AI API reads keys on
  the tool's behalf.
- `ai_usage` has one row per AI call: user, tool, API (AI, embeddings or
  legacy), model, tokens, cost in USD, and whose key paid. A user's free credit
  is the sum of their `PLATFORM` rows, so costs are stored at the price when
  the call was made and a later price change doesn't rewrite them. A
  `pending` row is a reservation for a call in progress (its cost is the
  expected cost until settled); one older than 30 minutes stops counting, as
  its call was probably abandoned, but is kept so a slow call can still settle
  it.
  Reports leave pending rows out. The repository is `aiUsage` in
  `container.ts`; tool code must not import it.
- `tool_visits` has one row per visit to a tool: the tool, when, and the user
  if signed in. The tools frame (`ToolsShell`) sends it to `POST /api/visits`
  with `navigator.sendBeacon` each time a tool is opened; moving between pages
  within a tool isn't another visit. `/admin` shows visits and distinct
  signed-in users per tool, for the last 30 days and all time. Anyone can
  call the route, so the counts are a guide, not an audit.
- `admins` lists, by email, who can open `/admin` (AI usage, tool visits, and
  the admins themselves, who add and remove each other there; no one can remove
  themselves). `db:deploy` adds the first admins
  (`packages/platform/scripts/seed-platform.mjs`) only while the table is
  empty, so a removed admin stays removed. In development without Google
  sign-in, the local user is an admin.
- Tools that need real tables (queries across users, relations, search) get their
  own Postgres role and schema in the same database, never tables in `public`,
  which `prisma db push` manages and would drop. `db:deploy` (`prisma db push`,
  `packages/platform/scripts/seed-platform.mjs`, then
  `packages/platform/scripts/setup-tools.mjs`) creates each role and schema
  and, as that role, applies `tools/{id}/schema.sql` and runs the optional
  `tools/{id}/seed.mjs`. Like `prisma db push` for the platform, both run on
  every deploy and must be safe to re-run; there are no migrations. A tool role
  cannot read platform or other tools' tables. AskPenn (schema `askpenn`) is
  the reference.
- Tools use pgvector from `public`, where the platform installs it. That schema is
  not on a tool role's `search_path`, so tool SQL schema-qualifies the type and
  operators (`public.vector`, `OPERATOR(public.<=>)`). Each vector is stored
  with the model that made it; searches compare only the current model's
  vectors, and the seed re-embeds the rest. Career Canvas (`tools/career-canvas`, schema
  `careercanvas`) is the reference.
- Tool metadata is not stored in the database; the registry in code is the
  source of truth.

---

## Configuration

The platform's env var reads happen in `packages/platform`,
`apps/web/src/lib/container.ts` and `apps/web/src/lib/auth.ts`; `core` and tool
packages (`tools/*`) never access `process.env`. Two older tools read their own
variables in their pages and routes: Compass (`COMPASS_ICS_FEED_URL`,
`TOOL19_ADMIN_KEY`, `NEXT_PUBLIC_TOOL19_ADMIN_KEY`) and Penn Planner
(`NEXT_PUBLIC_GCAL_CLIENT_ID`).

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | platform/prisma, `db:deploy` | Postgres admin connection; tool role passwords are derived from it |
| `OPENAI_API_KEY` | platform/embeddings, web/lib/container, `db:deploy`, platform/llm | The AI API's OpenAI calls while a user has free credit; embeddings: tool seeds (e.g. Career Canvas course embeddings; skipped when unset) and search queries from users without their own OpenAI key. Also the legacy LLM API |
| `ANTHROPIC_API_KEY` | web/lib/container, platform/llm | The AI API's Anthropic calls while a user has free credit, and the legacy LLM API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | web/lib/auth | Google sign-in (OAuth client); without them, development signs in as a local user and production disables sign-in |
| `NEXTAUTH_SECRET` | web/lib/auth | Signs session cookies; required with the Google credentials |
| `NEXTAUTH_URL` | web/lib/auth | The site's public URL; required in production |
