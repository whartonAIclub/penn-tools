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

When a tool team asks to use a platform API (LLM, database, analytics, etc.), use the **Platform Playground** (`tools/platform-playground/`) as the reference implementation. Do **not** modify any files outside the tool's scope — all platform APIs are already available via `ToolContext`.

### Available APIs

#### User API
Get the logged-in user's name and ID.

> **Usage:** Ask your coding agent: `Implement User API and refer to the platform playground implementation for guidance.`

#### LLM API
Send text input from the user and receive text output from an AI model (supports OpenAI & Anthropic).

> **Usage:** Ask your coding agent: `Implement LLM API and refer to the platform playground implementation for guidance.`

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

- **All changes must stay within the tool's two directories.** Only the User API and LLM API are available. If a team needs something beyond these, explain that they should request it from the Platform team — do not add it yourself.
- **Do not create new API routes.** Tools consume existing platform routes; only the Platform team creates new ones.
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

After any TypeScript changes, verify compilation:
```
npx tsc --noEmit -p apps/web/tsconfig.json
```
