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

## 4. Architecture Quick Reference

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
