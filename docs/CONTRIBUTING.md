# Contributing to PennTools

## Directory ownership

We use the GitHub CODEOWNERS model (`.github/CODEOWNERS`) to assign reviewers.
Suggested ownership:

```
# Platform core — reviewed by platform team
/packages/core/    @penntools/platform
/packages/platform/ @penntools/platform

# Web shell — reviewed by frontend team
/apps/web/         @penntools/frontend

# Each tool — reviewed by its contributor(s)
/tools/course-finder/ @penntools/tool-course-finder-team
```

## Boundaries — what tools may and may not do

### Allowed
- Import from `@penntools/core` (types, Tool base, ToolContext).
- Use anything provided via `ToolContext`: `db`, `llm`, `analytics`, `logger`, `config`.
- Add sub-dependencies to your tool's `package.json` (e.g. a Penn API client).
- Define your own `types.ts` for strongly-typed inputs/outputs.

### Forbidden
- `import { prisma } from "@penntools/platform"` — use `context.db.*` instead.
- `process.env.*` — request config values via `context.config` (platform injects them).
- `fetch()` called directly from `execute()` — wrap the call in a service class
  and accept it via a constructor parameter or `context` extension (ask platform team
  to add the service to `ToolContext` if it's broadly useful).
- Registering your own tool in `container.ts` — open a PR; the platform team
  will merge the registration after review.

## Adding a new tool — checklist

- [ ] `tools/<tool_id>/package.json` with `"name": "@penntools/tool-<id>"`
- [ ] `tools/<tool_id>/src/types.ts` — strongly typed `Input` and `Output`
- [ ] `tools/<tool_id>/src/<ToolName>Tool.ts` — extends `Tool<Input, Output>`
- [ ] `tools/<tool_id>/src/index.ts` — barrel export
- [ ] `tools/<tool_id>/src/__tests__/<ToolName>Tool.test.ts` — unit test
- [ ] `tools/<tool_id>/tsconfig.json` extending `../../tsconfig.base.json`
- [ ] Entry in `apps/web/package.json` dependencies
- [ ] Registration in `apps/web/src/lib/container.ts`
- [ ] Icon at `apps/web/public/tools/<tool_id>/icon.png`

## Running locally

The app needs Postgres. The simplest setup is `bash scripts/test.sh` (see the
README), which starts Postgres in Docker. To do it by hand:

```bash
# Install all dependencies
pnpm install

# Build the platform package, then apply the database schema and tool
# databases. db:deploy doesn't read apps/web/.env.local, so pass the URL of a
# Postgres with the vector extension (and set the same one in .env.local).
pnpm --filter @penntools/platform build
DATABASE_URL="<url>" pnpm --filter @penntools/platform db:deploy

# Start the web app
pnpm dev
```

## Running tests

```bash
# All packages
pnpm test

# A single tool
pnpm --filter @penntools/tool-course-finder test
```

## Style guide

- **TypeScript strict mode** is on everywhere. No `any` unless unavoidable and
  annotated with a comment explaining why.
- **No default exports** from library packages — named exports only.
- **No side effects at module load time** — no `register()` calls in barrel files.
- CSS Modules for component styles — no global class names.
