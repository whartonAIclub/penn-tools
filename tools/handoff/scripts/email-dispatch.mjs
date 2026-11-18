#!/usr/bin/env node
// email-dispatch.mjs: runs Handoff's email dispatcher on the LOCAL development server, once or every N seconds (follow-on Batch 4).
//
// It POSTs to <base>/tools/handoff/email/dispatch, the route that runs the dispatcher with the capture sender for test worlds
// (apps/web/src/app/tools/handoff/email-config.ts): nothing is ever sent, each email lands in Handoff's own capture table
// (scripts/email-captures.mjs prints it). The route runs as Handoff's database role through the app's toolSql, so this script needs no
// database URL and derives no password. It accepts only a loopback base (localhost, 127.0.0.1, [::1]) and refuses NODE_ENV=production:
// a deployment's scheduler calls the route itself, with its bearer secret. It prints the counts each run returns: never an address,
// an id or any text.
//
// Usage, from the repository root, while `pnpm dev` runs:
//   node tools/handoff/scripts/email-dispatch.mjs                 one run
//   node tools/handoff/scripts/email-dispatch.mjs --watch=60      a run every 60 seconds (10 to 3600) until Ctrl+C
//   node tools/handoff/scripts/email-dispatch.mjs --no-grace      don't wait the 2 minutes a new email normally waits
//   node tools/handoff/scripts/email-dispatch.mjs --limit=10 --base=http://127.0.0.1:3000

const ROUTE = "/tools/handoff/email/dispatch";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const COUNTS = ["swept", "claimed", "sent", "failed", "skipped", "dead", "expired", "pruned"];
const HELP = `Usage: node tools/handoff/scripts/email-dispatch.mjs [--base=http://localhost:3000] [--watch=SECONDS] [--no-grace] [--limit=N]
Runs Handoff's email dispatcher on the local development server (capture only: nothing is sent) and prints its counts.`;

function fail(message) {
  console.error(`email-dispatch: ${message}`);
  process.exit(1);
}

let base = "http://localhost:3000";
/** null: not given (one run; the route's default limit). Given, each is checked, so --limit=0 or --watch=0 is refused, never ignored. */
let watch = null;
let limit = null;
let noGrace = false;
for (const a of process.argv.slice(2)) {
  if (a === "--help") {
    console.log(HELP);
    process.exit(0);
  } else if (a === "--no-grace") noGrace = true;
  else if (a.startsWith("--base=")) base = a.slice("--base=".length);
  else if (a.startsWith("--watch=")) watch = Number(a.slice("--watch=".length));
  else if (a.startsWith("--limit=")) limit = Number(a.slice("--limit=".length));
  else fail(`unknown option ${a}. Use --base, --watch, --no-grace, --limit or --help.`);
}
if (watch !== null && !(Number.isInteger(watch) && watch >= 10 && watch <= 3600)) fail("--watch takes whole seconds from 10 to 3600.");
if (limit !== null && !(Number.isInteger(limit) && limit >= 1 && limit <= 100)) fail("--limit takes a whole number from 1 to 100.");
if (process.env["NODE_ENV"] === "production") fail("refusing: NODE_ENV is production. This runner is for the local development server only.");

let url;
try {
  url = new URL(ROUTE, base);
} catch {
  fail("--base isn't a URL, like http://localhost:3000.");
}
if ((url.protocol !== "http:" && url.protocol !== "https:") || !LOOPBACK.has(url.hostname) || url.username || url.password) {
  fail("refusing: --base must be this machine (localhost, 127.0.0.1 or [::1]).");
}

/** One run: the counts as one line, or why there are none. */
async function once() {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(limit !== null ? { limit } : {}), ...(noGrace ? { noGrace: true } : {}) }),
      redirect: "error",
      signal: AbortSignal.timeout(150_000),
    });
  } catch (e) {
    return { ok: false, line: `can't reach ${url.origin} (${e && e.name ? e.name : "error"}). Is pnpm dev running?` };
  }
  if (res.status === 404) {
    return { ok: false, line: "the dispatch route isn't available here: it answers on a development server reached from this machine (a deployment needs a configured provider)." };
  }
  if (res.status === 503) return { ok: false, line: "the server has no database for Handoff (DATABASE_URL)." };
  if (!res.ok) return { ok: false, line: `the route answered ${res.status}.` };
  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, line: "the route's answer wasn't JSON." };
  }
  // Only the counts, whatever else an answer might hold.
  return { ok: true, line: COUNTS.map((k) => `${k}=${body && Number.isInteger(body[k]) ? body[k] : "?"}`).join(" ") };
}

if (watch === null) {
  const r = await once();
  if (!r.ok) fail(r.line);
  console.log(r.line);
} else {
  for (;;) {
    const r = await once();
    (r.ok ? console.log : console.error)(`${new Date().toISOString()} ${r.line}`);
    await new Promise((resolve) => setTimeout(resolve, watch * 1000));
  }
}
