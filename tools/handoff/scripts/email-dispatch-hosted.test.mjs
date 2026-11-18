// Runs with Handoff's own tests (vitest finds *.test.mjs here): pnpm --filter @penntools/tool-handoff test
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { settings, runOnce } from "./email-dispatch-hosted.mjs";
const env = { NEXTAUTH_URL: "https://handoff.example.test", HANDOFF_EMAIL_DISPATCH_SECRET: "s".repeat(40) };
const counts = { swept: 0, claimed: 1, sent: 1, failed: 0, skipped: 0, dead: 0, expired: 0, pruned: 0 };

test("rejects local/http URLs and short secrets before any send", () => {
  for (const url of ["http://handoff.example.test", "https://localhost", "https://127.0.0.1", "https://user:pass@handoff.example.test", "https://handoff.example.test/path"]) {
    assert.throws(() => settings({ ...env, NEXTAUTH_URL: url }));
  }
  assert.throws(() => settings({ ...env, HANDOFF_EMAIL_DISPATCH_SECRET: "short" }));
  assert.throws(() => settings({ ...env, HANDOFF_EMAIL_BATCH_LIMIT: "0" }));
});
test("POST uses the existing endpoint, bearer secret and no redirect", async () => {
  const config = settings(env);
  const result = await runOnce(config, async (url, request) => {
    assert.equal(url, "https://handoff.example.test/tools/handoff/email/dispatch");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.Authorization, "Bearer " + env.HANDOFF_EMAIL_DISPATCH_SECRET);
    assert.equal(request.redirect, "error");
    assert.deepEqual(JSON.parse(request.body), { limit: 5 });
    return Response.json({ ...counts, privateText: "PRIVATE_CANARY" });
  });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes("PRIVATE_CANARY"), false);
});
test("unauthorized or unconfigured endpoints fail with no body disclosure", async () => {
  for (const status of [401, 404, 503, 500]) {
    const result = await runOnce(settings(env), async () => new Response("PRIVATE_CANARY", { status }));
    assert.equal(result.ok, false);
    assert.equal(result.message.includes("PRIVATE_CANARY"), false);
  }
});
test("network errors do not expose request or secret", async () => {
  const result = await runOnce(settings(env), async () => { throw new Error(env.HANDOFF_EMAIL_DISPATCH_SECRET); });
  assert.equal(result.ok, false);
  assert.equal(result.message.includes(env.HANDOFF_EMAIL_DISPATCH_SECRET), false);
});
test("200 with failed/dead messages or malformed counts is not success", async () => {
  for (const body of [{...counts, failed: 1}, {...counts, dead: 1}, { sent: "1" }, null]) {
    const result = await runOnce(settings(env), async () => Response.json(body));
    assert.equal(result.ok, false);
  }
});
test("started through a linked folder it still runs, never a silent exit 0", () => {
  // --check with no settings must refuse with its reason. Before the entry check compared real paths, a start through a link
  // matched nothing: no output, exit 0, and a supervised worker would have restarted for ever without calling the app.
  const tmp = mkdtempSync(join(tmpdir(), "handoff-email-"));
  const link = join(tmp, "scripts");
  try {
    symlinkSync(dirname(fileURLToPath(import.meta.url)), link, "junction"); // a junction on Windows (no admin rights), a symlink elsewhere
    const clean = { ...process.env };
    for (const name of ["NEXTAUTH_URL", "HANDOFF_EMAIL_DISPATCH_SECRET", "HANDOFF_EMAIL_BATCH_LIMIT"]) delete clean[name];
    const run = spawnSync(process.execPath, [join(link, "email-dispatch-hosted.mjs"), "--check"], { env: clean, encoding: "utf8", timeout: 20_000 });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /NEXTAUTH_URL must be the hosted HTTPS origin/);
    assert.equal(run.stdout, "");
  } finally {
    // The link itself, never what it points at: nothing here deletes recursively.
    try { unlinkSync(link); } catch { try { rmdirSync(link); } catch {} }
    try { rmdirSync(tmp); } catch {}
  }
});
