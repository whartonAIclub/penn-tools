#!/usr/bin/env node
// email-captures.mjs: prints what Handoff's local capture "sent" in one test world (follow-on Batch 4): each email's kind, recipient
// (masked: "h***@e***.invalid"), subject, body and link, oldest first. Nothing was sent anywhere: the capture only keeps them.
//
// Read-only and local only, like pilot-report.mjs: it reads the database apps/web/.env.local's DATABASE_URL names only when that is
// this machine, with search_path handoff, in one REPEATABLE READ, READ ONLY transaction on a connection whose transactions default to
// read-only. Captures exist only for test-… worlds (the capture never handles live), and are kept 7 days. It never prints DATABASE_URL
// or a full address.
//
// Usage, from the repository root:
//   node tools/handoff/scripts/email-captures.mjs --world=test-email-1
//   node tools/handoff/scripts/email-captures.mjs --world=test-email-1 --json
// (--schema=handoff_test_… reads a test's throwaway schema instead of handoff: tests only.)

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ENV_FILE = join(REPO, "apps", "web", ".env.local");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const TEST_WORLD = /^test-[a-z0-9-]{1,40}$/;
const TEST_SCHEMA = /^handoff_test_\d{13}_[0-9a-f]{6}$/;
const HELP = `Usage: node tools/handoff/scripts/email-captures.mjs --world=test-… [--json]
Prints the emails Handoff's local capture kept for one test world (recipients masked). Read-only; the local database only.`;

function fail(message) {
  console.error(`email-captures: ${message}`);
  process.exit(1);
}

let world = "";
let json = false;
let schema = "handoff";
for (const a of process.argv.slice(2)) {
  if (a === "--help") {
    console.log(HELP);
    process.exit(0);
  } else if (a === "--json") json = true;
  else if (a.startsWith("--world=")) world = a.slice("--world=".length);
  else if (a.startsWith("--schema=")) schema = a.slice("--schema=".length);
  else fail(`unknown option ${a}. Use --world, --json or --help.`);
}
if (!world) fail("say which test world: --world=test-….");
if (!TEST_WORLD.test(world)) fail("captures exist only in test-… worlds (lowercase letters, digits and hyphens).");
if (schema !== "handoff" && !TEST_SCHEMA.test(schema)) fail("--schema is for tests' throwaway schemas only.");

// ── The local database only ──────────────────────────────────────────────────────────────
if (!process.env["DATABASE_URL"] && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE); // fills only unset variables
if (process.env["NODE_ENV"] === "production") fail("refusing: NODE_ENV is production. This reads the local database only.");
const dbUrl = process.env["DATABASE_URL"];
if (!dbUrl) fail("DATABASE_URL isn't set (apps/web/.env.local).");
let host = "";
try {
  host = new URL(dbUrl).hostname;
} catch {
  fail("DATABASE_URL isn't a valid URL.");
}
if (!LOCAL_HOSTS.has(host)) fail("refusing: DATABASE_URL doesn't point at this machine.");

/** All but the first letters hidden: "handoff-test-a@example.invalid" is "h***@e***.invalid". */
function mask(address) {
  const at = String(address).lastIndexOf("@");
  if (at <= 0) return "***";
  const hide = (part) => (part ? `${Array.from(part)[0]}***` : "***");
  const labels = String(address).slice(at + 1).split(".");
  const tld = labels.length > 1 ? labels.pop() : undefined;
  return `${hide(String(address).slice(0, at))}@${labels.map(hide).join(".")}${tld !== undefined ? "." + tld : ""}`;
}

const sql = postgres(dbUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 2,
  onnotice: () => {},
  connection: { application_name: "handoff-email-captures", search_path: schema, default_transaction_read_only: "on" },
});
let rows;
let failure;
try {
  rows = await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", (tx) => tx`
    SELECT j.kind, c.to_address, c.subject, c.body_text, c.action_url, c.captured_at
    FROM email_capture c
    JOIN email_jobs j ON j.world_id = c.world_id AND j.notification_id = c.notification_id
    WHERE c.world_id = ${world}
    ORDER BY c.captured_at, c.notification_id`);
} catch (error) {
  failure = error;
} finally {
  await sql.end({ timeout: 5 });
}
if (failure !== undefined) {
  // Only the error's code or class: a message can quote values.
  const code = failure && typeof failure === "object" ? failure.code : undefined;
  if (code === "42P01" || code === "3F000") {
    fail(`Handoff's email tables aren't set up in this database (schema ${schema}). Apply tools/handoff/schema.sql: see Database setup in tools/handoff/README.md.`);
  }
  if (code === "ECONNREFUSED") fail("can't reach the local database. Is Docker's penntools-db running (docker start penntools-db)?");
  fail(`the captures couldn't be read (${code ?? (failure instanceof Error ? failure.name : "error")}). Nothing was changed.`);
}

const emails = rows.map((r) => ({
  kind: r.kind,
  to: mask(r.to_address),
  subject: r.subject,
  text: r.body_text,
  link: r.action_url,
  capturedAt: r.captured_at.toISOString(),
}));
if (json) {
  console.log(JSON.stringify({ world, emails }, null, 2));
} else if (emails.length === 0) {
  console.log(`No captured emails in ${world}.`);
} else {
  console.log(`${emails.length} captured email${emails.length === 1 ? "" : "s"} in ${world} (nothing was sent):\n`);
  emails.forEach((e, i) => {
    console.log(`#${i + 1} ${e.kind} to ${e.to}, ${e.capturedAt}\nSubject: ${e.subject}\n${e.text.trimEnd()}\nLink: ${e.link}\n`);
  });
}
