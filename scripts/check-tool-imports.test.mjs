// Tests for check-tool-imports.mjs: runs it against sample tool folders.
// Run: node --test scripts/check-tool-imports.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-tool-imports.mjs");

/** Runs the check against a temporary repo holding `files` (path → contents). */
function check(files) {
  const root = mkdtempSync(join(tmpdir(), "check-tool-imports-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), contents);
    }
    const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
    return { code: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("passes code that only uses allowed imports", () => {
  const { code, output } = check({
    "tools/demo/src/logic.ts": `import { z } from "@penntools/core/ai";\nimport type { AI } from "@penntools/core/ai";\n`,
    "apps/web/src/app/tools/demo/actions.ts": [
      `import { NextResponse } from "next/server";`,
      `import { toolSql } from "@penntools/platform/db";`,
      `import type { toolSql as Sql } from "@penntools/platform/db";`,
      `import { getAI, getEmbeddings } from "@/lib/ai";`,
    ].join("\n"),
  });
  assert.equal(code, 0, output);
});

test("flags each kind of violation on its own line", () => {
  const { code, output } = check({
    "apps/web/src/app/tools/demo/bad.ts": [
      `import { NextResponse } from "next/server";`,
      `import OpenAI from "openai";`,
      `import { toolSql, prisma } from "@penntools/platform/db";`,
      `import { createAI } from "@penntools/platform/ai";`,
      `import { createUserAI } from "@/lib/container";`,
      `import type { PrismaClient } from "@prisma/client";`,
      `const zod = await import("@anthropic-ai/sdk/helpers/zod");`,
      `await fetch("https://api.anthropic.com/v1/messages");`,
      `const keys = userApiKeys;`,
      `const spend = await aiUsage.platformSpend(id);`,
      `import { logger, admins } from "@/lib/container";`,
      `import {\n  toolVisits,\n} from "@/lib/container";`,
      `const note = "Ask the admins";`,
    ].join("\n"),
  });
  assert.equal(code, 1);
  for (const expected of [
    "bad.ts:2  vendor SDK",
    "bad.ts:3  platform internals",
    "bad.ts:4  platform internals",
    "bad.ts:5  users' API keys",
    "bad.ts:6  Prisma",
    "bad.ts:7  vendor SDK",
    "bad.ts:8  provider API URL",
    "bad.ts:9  users' API keys",
    "bad.ts:10  users' API keys",
    "bad.ts:11  platform data",
    "bad.ts:12  platform data",
  ]) {
    assert.ok(output.includes(expected), `missing "${expected}" in:\n${output}`);
  }
  assert.ok(!output.includes("bad.ts:1 "), "the next/server import must not be flagged");
  assert.ok(!output.includes("bad.ts:15 "), "the word admins in text must not be flagged");
});

test("doesn't stretch one import match across several import statements", () => {
  // Regression: a lazy match used to run from the first import to the platform one.
  const { code, output } = check({
    "apps/web/src/app/tools/demo/guard.ts": `import { NextRequest } from "next/server";\nimport { cookies } from "next/headers";\nimport { toolSql } from "@penntools/platform/db";\n`,
  });
  assert.equal(code, 0, output);
});

test("skips known exceptions and ignores build output", () => {
  const { code, output } = check({
    "tools/prepsignal/src/score.ts": `import Anthropic from "@anthropic-ai/sdk";\n`,
    "tools/demo/dist/index.js": `import OpenAI from "openai";\n`,
    "tools/demo/node_modules/x/index.js": `import OpenAI from "openai";\n`,
  });
  assert.equal(code, 0, output);
  assert.match(output, /known exception/);
});

/** A tool's manifest, with notYetMigrated (line 5) when `flag` is set. */
const LEGACY_MANIFEST = (flag) =>
  [
    `export class Demo extends Tool {`,
    `  readonly manifest: ToolManifest = {`,
    `    id: "demo",`,
    `    category: "Other",`,
    ...(flag ? [`    notYetMigrated: true,`] : []),
    `  };`,
    `}`,
  ].join("\n");
const LEGACY_CALL = `await fetch("/api/llm/complete", { method: "POST" });\n`;

test("passes a tool that calls the legacy LLM API and says so in its manifest", () => {
  const { code, output } = check({
    "tools/demo/src/DemoTool.ts": LEGACY_MANIFEST(true),
    "apps/web/src/app/tools/demo/page.tsx": LEGACY_CALL,
  });
  assert.equal(code, 0, output);
});

test("flags a tool that calls the legacy LLM API without notYetMigrated", () => {
  const { code, output } = check({
    "tools/demo/src/DemoTool.ts": LEGACY_MANIFEST(false),
    "apps/web/src/app/tools/demo/page.tsx": LEGACY_CALL,
  });
  assert.equal(code, 1);
  assert.match(output, /tools\/demo\/src\/DemoTool\.ts:2  not yet migrated: apps\/web\/src\/app\/tools\/demo\/page\.tsx calls the legacy LLM API/);
});

test("flags notYetMigrated on a tool that no longer calls the legacy LLM API", () => {
  const { code, output } = check({ "tools/demo/src/DemoTool.ts": LEGACY_MANIFEST(true) });
  assert.equal(code, 1);
  assert.match(output, /tools\/demo\/src\/DemoTool\.ts:5  not yet migrated: nothing in the tool calls the legacy LLM API/);
});
