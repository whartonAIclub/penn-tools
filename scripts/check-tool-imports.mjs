#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// check-tool-imports — keeps tool code away from AI vendors and users' keys
//
// Scans every tool's code (tools/*, apps/web/src/app/tools/*) and fails if it:
//   - imports an AI vendor SDK (openai, @anthropic-ai/sdk) or calls their APIs
//     directly: tools use the AI API (@penntools/core/ai) instead
//   - touches users' saved API keys (userApiKeys) or AI usage (aiUsage,
//     freeCreditLeft), or builds an AI object for an arbitrary user
//     (createUserAI, createUserEmbeddingProvider): tools use
//     getAI / getEmbeddings, which are bound to the signed-in user
//   - imports the platform's admins or tool visits (admins, toolVisits)
//   - imports Prisma or platform internals; the one platform import allowed is
//     toolSql from @penntools/platform/db
//
// It also checks that each tool's manifest says whether it's still on the
// legacy LLM API (POST /api/llm/complete): notYetMigrated: true when the tool's
// code calls it, and not otherwise. The site shows those tools as BETA.
//
// Run: pnpm check:tools (optionally with a folder to scan instead of the repo,
// as the tests do). Existing violations are listed in KNOWN_EXCEPTIONS until
// those tools migrate; remove an entry once its tool is fixed.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("..", import.meta.url));
const ROOTS = ["tools", "apps/web/src/app/tools"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".turbo"]);
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Path prefixes (repo-relative, forward slashes) allowed to break the rules, with why. */
const KNOWN_EXCEPTIONS = [
  { prefix: "tools/prepsignal/", reason: "standalone app that calls the Anthropic SDK directly; not yet on the platform" },
];

const RULES = [
  {
    name: "vendor SDK",
    test: (src) => matches(src, /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:openai|@anthropic-ai\/sdk)(?:\/[^"']*)?["']/g),
    fix: "use the AI API (@penntools/core/ai) instead of a vendor SDK",
  },
  {
    name: "provider API URL",
    test: (src) => matches(src, /api\.openai\.com|api\.anthropic\.com/g),
    fix: "use the AI API (@penntools/core/ai) instead of calling the provider directly",
  },
  {
    name: "users' API keys",
    test: (src) => matches(src, /\b(?:userApiKeys|aiUsage|freeCreditLeft|createUserAI|createUserEmbeddingProvider)\b/g),
    fix: "use getAI / getEmbeddings from @/lib/ai, which read keys for the signed-in user",
  },
  {
    name: "platform data",
    test: (src) =>
      matches(src, /import\s+(?:type\s+)?\{[^}]*\b(?:admins|toolVisits)\b[^}]*\}\s*from\s*["']@\/lib\/container["']/g),
    fix: "admins and tool visits are the platform's; tools don't read or change them",
  },
  {
    name: "Prisma",
    test: (src) => matches(src, /["']@prisma\/client["']/g),
    fix: "use your tool's own database through toolSql",
  },
  {
    name: "platform internals",
    test: platformImports,
    fix: "the only platform import tools may use is toolSql from @penntools/platform/db",
  },
];

function matches(src, regex) {
  return [...src.matchAll(regex)].map((m) => m.index);
}

/** Imports from @penntools/platform other than `{ toolSql }` from @penntools/platform/db. */
function platformImports(src) {
  const found = [];
  // The clause can't contain quotes, so a match never spans several import statements.
  const importRe = /import\s+([^;"'`]*?)\s+from\s*["'](@penntools\/platform(?:\/[^"']*)?)["']|(?:import|require)\s*\(\s*["'](@penntools\/platform(?:\/[^"']*)?)["']/g;
  for (const m of src.matchAll(importRe)) {
    const clause = m[1];
    const specifier = m[2] ?? m[3];
    const named = clause?.match(/^(?:type\s+)?\{([^}]*)\}$/);
    const names = named?.[1]
      .split(",")
      .map((n) => n.trim().replace(/^type\s+/, "").replace(/\s+as\s+\w+$/, "")) // "toolSql as sql" → "toolSql"
      .filter(Boolean);
    const onlyToolSql = specifier === "@penntools/platform/db" && names?.every((n) => n === "toolSql");
    if (!onlyToolSql) found.push(m.index);
  }
  return found;
}

// A manifest declares its type, so other objects with an `id` don't count.
const MANIFEST = /\breadonly\s+manifest\s*:\s*ToolManifest\b/;
const NOT_YET_MIGRATED = /\bnotYetMigrated\s*:\s*true\b/;
const LEGACY_API = /\/api\/llm\/complete\b/;

/**
 * Tools whose manifest's notYetMigrated doesn't match their code. A tool is its
 * folder in tools/ and its page folder in apps/web/src/app/tools/.
 */
function migrationViolations() {
  const found = [];
  let dirs;
  try {
    dirs = readdirSync(join(repoRoot, "tools"));
  } catch {
    return found;
  }
  for (const dir of dirs) {
    if (!statSync(join(repoRoot, "tools", dir)).isDirectory()) continue;
    if (KNOWN_EXCEPTIONS.some((e) => `tools/${dir}/`.startsWith(e.prefix))) continue;
    const sources = [...walk(join(repoRoot, "tools", dir)), ...walk(join(repoRoot, "apps/web/src/app/tools", dir))].map(
      (file) => ({ path: relative(repoRoot, file).split(sep).join("/"), src: readFileSync(file, "utf8") }),
    );
    const manifest = sources.find((s) => s.path.startsWith(`tools/${dir}/`) && MANIFEST.test(s.src));
    if (!manifest) continue;
    const legacy = sources.find((s) => LEGACY_API.test(s.src));
    const flag = manifest.src.match(NOT_YET_MIGRATED);
    if (legacy && !flag) {
      found.push({
        path: manifest.path,
        line: lineOf(manifest.src, manifest.src.match(MANIFEST).index),
        rule: { name: "not yet migrated", fix: `${legacy.path} calls the legacy LLM API; add notYetMigrated: true to the manifest` },
      });
    } else if (flag && !legacy) {
      found.push({
        path: manifest.path,
        line: lineOf(manifest.src, flag.index),
        rule: { name: "not yet migrated", fix: "nothing in the tool calls the legacy LLM API any more; remove notYetMigrated from the manifest" },
      });
    }
  }
  return found;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (EXTENSIONS.test(entry)) yield path;
  }
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

const violations = [];
let excused = 0;
for (const root of ROOTS) {
  for (const file of walk(join(repoRoot, root))) {
    const path = relative(repoRoot, file).split(sep).join("/");
    const src = readFileSync(file, "utf8");
    const hits = RULES.flatMap((rule) => rule.test(src).map((index) => ({ rule, line: lineOf(src, index) })));
    if (hits.length === 0) continue;
    if (KNOWN_EXCEPTIONS.some((e) => path.startsWith(e.prefix))) {
      excused += hits.length;
      continue;
    }
    for (const hit of hits) violations.push({ path, ...hit });
  }
}
violations.push(...migrationViolations());

if (violations.length > 0) {
  console.error(`Tool code breaks ${violations.length} platform rule(s):\n`);
  for (const { path, line, rule } of violations) {
    console.error(`  ${path}:${line}  ${rule.name}: ${rule.fix}`);
  }
  console.error("\nSee CLAUDE.md, section 4.");
  process.exit(1);
}

const note = excused ? ` (${excused} known exception(s) skipped: ${KNOWN_EXCEPTIONS.map((e) => e.prefix).join(", ")})` : "";
console.log(`Tool code follows the platform rules${note}.`);
