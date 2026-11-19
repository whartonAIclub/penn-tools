#!/usr/bin/env node
// pilot-report.mjs: Handoff's pilot metrics report, owner-run and read-only (USER-INSTRUCTIONS §8 item 3).
//
// It reads the LOCAL database that apps/web/.env.local's DATABASE_URL names (any other host is refused), with search_path
// handoff, on a connection whose transactions default to read-only. The report itself runs in one REPEATABLE READ, READ ONLY
// transaction (src/report/collect.ts), in which Postgres refuses any write: it creates no profile, settles no deadline, marks no
// notification read and changes nothing. It reads the live world (the real market) only, and leaves out known TEST and Local
// Developer accounts, which it identifies in public.users.
//
// It prints the aggregate report as JSON, then a short Markdown summary. Neither holds a name, email, payment handle, account id,
// alert detail, private budget or offer, message or other typed text: counts, sums, durations, fixed words and event ids only.
// It never prints DATABASE_URL.
//
// Usage, from the repository root (Handoff's package must be built from its current source; `pnpm dev` keeps it built):
//   node tools/handoff/scripts/pilot-report.mjs              JSON, then Markdown
//   node tools/handoff/scripts/pilot-report.mjs --json       JSON only
//   node tools/handoff/scripts/pilot-report.mjs --markdown   Markdown only
// To build it once: pnpm --filter @penntools/tool-handoff build
// Definitions, coverage limits and what isn't tracked: in the output, and in the pilot's METRICS.md.

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(PKG, "..", "..");
const ENV_FILE = join(REPO, "apps", "web", ".env.local");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const OPTIONS = new Set(["--json", "--markdown", "--help"]);

function fail(message) {
  console.error(`pilot-report: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
for (const a of args) if (!OPTIONS.has(a)) fail(`unknown option ${a}. Use --json, --markdown or --help.`);
if (args.includes("--help")) {
  console.log("Usage: node tools/handoff/scripts/pilot-report.mjs [--json | --markdown]\nRead-only pilot metrics for Handoff's live market, from the local database.");
  process.exit(0);
}
if (args.includes("--json") && args.includes("--markdown")) fail("choose --json or --markdown, or neither for both.");

// ── The local database only ──────────────────────────────────────────────────────────────
if (!process.env["DATABASE_URL"] && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE); // fills only unset variables
if (process.env["NODE_ENV"] === "production") fail("refusing: NODE_ENV is production. This report reads the local database only.");
const url = process.env["DATABASE_URL"];
if (!url) fail("DATABASE_URL isn't set (apps/web/.env.local).");
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  fail("DATABASE_URL isn't a valid URL.");
}
if (!LOCAL_HOSTS.has(host)) fail(`refusing: DATABASE_URL points at ${host}, not the local database.`);

// ── The report's code, built from the current source ─────────────────────────────────────
const SRC = join(PKG, "src");
const DIST = join(PKG, "dist");
function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") yield* sources(join(dir, entry.name));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) yield join(dir, entry.name);
  }
}
const stale = [];
for (const src of sources(SRC)) {
  const built = join(DIST, relative(SRC, src)).replace(/\.ts$/, ".js");
  if (!existsSync(built) || statSync(built).mtimeMs < statSync(src).mtimeMs) stale.push(relative(PKG, src).replaceAll("\\", "/"));
}
if (stale.length > 0) {
  fail(
    `Handoff's package isn't built from its current source (${stale.slice(0, 3).join(", ")}${stale.length > 3 ? ", …" : ""}). ` +
      "Run pnpm --filter @penntools/tool-handoff build (pnpm dev keeps it built), then try again.",
  );
}
const { runPilotReport, pilotReportMarkdown } = await import(pathToFileURL(join(DIST, "report", "index.js")).href);

// ── Read, then print ─────────────────────────────────────────────────────────────────────
const sql = postgres(url, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 2,
  onnotice: () => {},
  connection: { application_name: "handoff-pilot-report", search_path: "handoff", default_transaction_read_only: "on" },
});
let report;
let failure;
try {
  report = await runPilotReport(sql, { identifyTestAccounts: true });
} catch (error) {
  failure = error;
} finally {
  await sql.end({ timeout: 5 });
}
if (failure !== undefined) {
  // Only the error's code or class: a message can quote values.
  const code = failure && typeof failure === "object" ? failure.code : undefined;
  if (code === "42P01" || code === "3F000") fail("Handoff's tables aren't set up in this database (the handoff schema). See PILOT-HANDOFF.md §2 step 5.");
  if (code === "ECONNREFUSED") fail("can't reach the local database. Is Docker's penntools-db running (docker start penntools-db)?");
  fail(`the report couldn't be read (${code ?? (failure instanceof Error ? failure.name : "error")}). Nothing was changed.`);
}

if (!args.includes("--markdown")) console.log(JSON.stringify(report, null, 2));
if (!args.includes("--json") && !args.includes("--markdown")) console.log("");
if (!args.includes("--json")) process.stdout.write(pilotReportMarkdown(report));
