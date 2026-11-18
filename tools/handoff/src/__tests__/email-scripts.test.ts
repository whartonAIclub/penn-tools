// The email runners (follow-on Batch 4; FOLLOWON-PLAN §2.4, B4.8): scripts/email-dispatch.mjs and scripts/email-captures.mjs, run as
// child processes. The dispatch runner talks only to a stand-in server on this machine (never the dev server), and the captures
// reader reads a throwaway schema; neither touches the handoff schema or the live world. No sign-in of any kind.
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorldId } from "../types.js";
import { sqlCaptureSender } from "../email/capture.js";
import { dispatchEmail } from "../email/dispatch.js";
import { databaseUrl, type TestDb } from "./helpers/db.js";
import { SITE, actTagged, canSell, createEmailTestDb, heartbeat, optIn, testDispatchDeps, to } from "./helpers/email-db.js";
import { StoreWorld, T0, TEST_A, TEST_B, actions as sent } from "./helpers/live-store.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const DISPATCH = fileURLToPath(new URL("../../scripts/email-dispatch.mjs", import.meta.url));
const CAPTURES = fileURLToPath(new URL("../../scripts/email-captures.mjs", import.meta.url));

/** Runs a script with these arguments and environment changes (undefined removes a variable); its exit code and output. */
function runScript(script: string, args: string[], env: Record<string, string | undefined> = {}): Promise<{ code: number | null; out: string; err: string }> {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...env })) if (v !== undefined) merged[k] = v;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env: merged, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

/** A port on this machine nothing listens on (it was free a moment ago): a run that wrongly went ahead could reach no server. */
async function closedPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", () => resolve()));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((resolve) => s.close(() => resolve()));
  return port;
}

describe("scripts/email-dispatch.mjs", () => {
  it("refuses anything but this machine, production, and options out of range, each for its own reason, before any request", async () => {
    expect((await runScript(DISPATCH, ["--help"])).code).toBe(0);
    // The option cases aim at a closed port, never the dev server's default, so even a runner that skipped a check couldn't run anything.
    const nowhere = `--base=http://127.0.0.1:${await closedPort()}`;
    const machine = /--base must be this machine/;
    const watch = /--watch takes whole seconds from 10 to 3600/;
    const limit = /--limit takes a whole number from 1 to 100/;
    const refused: [string[], RegExp][] = [
      [["--base=http://example.com"], machine],
      [["--base=http://192.168.1.2:3000"], machine],
      [["--base=http://user:pw@localhost:3000"], machine],
      [["--base=nope"], /--base isn't a URL/],
      [[nowhere, "--watch=5"], watch],
      [[nowhere, "--watch=0"], watch],
      [[nowhere, "--watch=abc"], watch],
      [[nowhere, "--limit=0"], limit],
      [[nowhere, "--limit="], limit],
      [[nowhere, "--limit=101"], limit],
      [[nowhere, "--limit=2.5"], limit],
      [[nowhere, "--frobnicate"], /unknown option --frobnicate/],
    ];
    const results = await Promise.all(refused.map(([args]) => runScript(DISPATCH, args)));
    results.forEach((r, i) => {
      const [args, why] = refused[i] ?? [[], /^$/];
      expect(r.code, args.join(" ")).toBe(1);
      expect(r.err, args.join(" ")).toMatch(/^email-dispatch: /);
      expect(r.err, args.join(" ")).toMatch(why);
    });
    const prod = await runScript(DISPATCH, [nowhere], { NODE_ENV: "production" });
    expect(prod.code).toBe(1);
    expect(prod.err).toContain("NODE_ENV is production");
  }, 30_000);

  describe("against a stand-in server on this machine", () => {
    const seen: { method: string; url: string; body: string }[] = [];
    let status = 200;
    let answer = "";
    let server: ReturnType<typeof createServer>;
    let base = "";
    beforeAll(async () => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        let body = "";
        req.on("data", (d: Buffer) => (body += d.toString("utf8")));
        req.on("end", () => {
          seen.push({ method: req.method ?? "", url: req.url ?? "", body });
          res.writeHead(status, { "content-type": "application/json" });
          res.end(answer);
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("POSTs once to the dispatch route and prints the counts only", { timeout: 30_000 }, async () => {
      status = 200;
      answer = JSON.stringify({ swept: 1, claimed: 3, sent: 2, failed: 0, skipped: 1, dead: 0, expired: 0, pruned: 4, note: "ann@upenn.edu" });
      const r = await runScript(DISPATCH, [`--base=${base}`, "--no-grace", "--limit=5"]);
      expect(r).toMatchObject({ code: 0, err: "" });
      expect(r.out.trim()).toBe("swept=1 claimed=3 sent=2 failed=0 skipped=1 dead=0 expired=0 pruned=4");
      expect(seen.at(-1)).toEqual({ method: "POST", url: "/tools/handoff/email/dispatch", body: JSON.stringify({ limit: 5, noGrace: true }) });
    });

    it("says what's wrong when the route isn't there", { timeout: 30_000 }, async () => {
      status = 404;
      answer = "";
      const r = await runScript(DISPATCH, [`--base=${base}`]);
      expect(r.code).toBe(1);
      expect(r.err).toContain("isn't available here");
      expect(seen.at(-1)?.body).toBe("{}");
    });
  });
});

describe("scripts/email-captures.mjs", () => {
  it("needs a test world, and refuses another machine's database and production", async () => {
    expect((await runScript(CAPTURES, ["--help"])).code).toBe(0);
    const local = { DATABASE_URL: "postgres://u:p@localhost:5432/x" };
    const refused = [[], ["--world=live"], ["--world=Test-A"], ["--world=test-a", "--schema=public"], ["--world=test-a", "--frobnicate"]];
    const results = await Promise.all(refused.map((args) => runScript(CAPTURES, args, local)));
    results.forEach((r, i) => {
      expect(r.code, refused[i]?.join(" ")).toBe(1);
      expect(r.err, refused[i]?.join(" ")).toMatch(/^email-captures: /);
    });
    const [remote, prod] = await Promise.all([
      runScript(CAPTURES, ["--world=test-a"], { DATABASE_URL: "postgres://u:p@db.example.com:5432/x" }),
      runScript(CAPTURES, ["--world=test-a"], { ...local, NODE_ENV: "production" }),
    ]);
    expect(remote.code).toBe(1);
    expect(remote.err).toContain("doesn't point at this machine");
    expect(remote.err).not.toContain("db.example.com"); // never the URL
    expect(prod.code).toBe(1);
  }, 30_000);

  describe.skipIf(!databaseUrl)("on a throwaway schema", () => {
    let db: TestDb;
    beforeAll(async () => {
      db = await createEmailTestDb("email-scripts");
    }, 30_000);
    afterAll(async () => {
      await db?.close();
    });

    it("prints each captured email with its recipient masked, read-only", { timeout: 30_000 }, async () => {
      const w = new StoreWorld(db.sql, "test-email-captures" as WorldId, T0);
      await heartbeat(w.sql, "capture", w.now);
      await canSell(w, TEST_A);
      const ev = await w.createEvent(TEST_A);
      const l = await w.list(TEST_A, ev, { qty: 2, ask: "35", obo: true });
      await optIn(w, TEST_A, { exchange: true });
      await actTagged(w, TEST_B, sent.offer(l, "30"), to(TEST_A.id, "offer.received"));
      await dispatchEmail(w.sql, { sender: sqlCaptureSender(w.sql), siteUrl: SITE, worlds: "test", graceMs: 0, now: w.now }, testDispatchDeps());
      const env = { DATABASE_URL: databaseUrl };
      const text = await runScript(CAPTURES, [`--world=${w.worldId}`, `--schema=${db.schema}`], env);
      expect(text.code).toBe(0);
      expect(text.out).toContain("1 captured email in test-email-captures (nothing was sent):");
      expect(text.out).toContain("offer.received to h***@e***.invalid");
      expect(text.out).toContain("Subject: Offer on your [Test] Spring Formal ticket");
      expect(text.out).toContain(`Link: ${SITE}/tools/handoff#activity?listing=${l}`);
      expect(text.out).not.toContain(TEST_A.email ?? "-");
      const asJson = await runScript(CAPTURES, [`--world=${w.worldId}`, `--schema=${db.schema}`, "--json"], env);
      const parsed = JSON.parse(asJson.out) as { world: string; emails: { kind: string; to: string; link: string }[] };
      expect(parsed.world).toBe(w.worldId);
      expect(parsed.emails.map((e) => [e.kind, e.to, e.link])).toEqual([["offer.received", "h***@e***.invalid", `${SITE}/tools/handoff#activity?listing=${l}`]]);
      expect((await runScript(CAPTURES, ["--world=test-email-none", `--schema=${db.schema}`], env)).out.trim()).toBe("No captured emails in test-email-none.");
    });

    it("says how to set the email tables up where they're missing (they're in schema.sql), and nothing about the database", { timeout: 30_000 }, async () => {
      // A schema that doesn't exist: the same failure as a database whose schema.sql hasn't been applied.
      const r = await runScript(CAPTURES, ["--world=test-email-none", "--schema=handoff_test_0000000000000_000000"], { DATABASE_URL: databaseUrl });
      expect(r.code).toBe(1);
      expect(r.out).toBe("");
      expect(r.err.trim()).toBe(
        "email-captures: Handoff's email tables aren't set up in this database (schema handoff_test_0000000000000_000000). Apply tools/handoff/schema.sql: see Database setup in tools/handoff/README.md.");
      expect(r.err).not.toMatch(/checkpoint|\byet\b/); // the tables are in schema.sql now, not something still to come
      if (databaseUrl) expect(r.err).not.toContain(new URL(databaseUrl).password || "\u0000");
    });
  });
});
