// tools/handoff/schema.sql against a real Postgres (C-DESIGN §9.2): safe to re-run, the nine tables
// (the market's five and follow-on B4's four email tables) and their indexes, and the CHECKs that keep
// malformed rows out. Each run uses a throwaway schema (helpers/db.ts) and drops it afterwards; skipped
// when no database is configured.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, databaseUrl, schemaSql, type TestDb } from "./helpers/db.js";

let db: TestDb;

/** The SQLSTATE a statement fails with, or "ok". */
async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "ok";
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    return typeof code === "string" ? code : `not a database error: ${String(e)}`;
  }
}

const UUID = "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b";
const MD5 = "0123456789abcdef0123456789abcdef";

describe.skipIf(!databaseUrl)("Handoff schema (Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("schema");
    await db.sql`INSERT INTO worlds (id, doc) VALUES ('test-base', '{"mode":"live"}')`;
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("applies again to a schema that already has it (it was applied twice already)", async () => {
    await expect(db.sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("has exactly the ten tables, their primary keys and their indexes", async () => {
    const tables = await db.admin<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = ${db.schema} ORDER BY table_name`;
    expect(tables.map((t) => t.table_name)).toEqual([
      "actions", "email_capture", "email_dispatch", "email_jobs", "email_prefs", "item_photos", "notifications", "people", "world_snapshots", "worlds", // item_photos: §9s item 6
    ]);

    const indexes = await db.admin<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = ${db.schema} ORDER BY indexname`;
    expect(indexes.map((i) => i.indexname)).toEqual([
      "actions_at_idx",
      "actions_pkey",
      "email_capture_pkey",
      "email_dispatch_pkey",
      "email_jobs_due",
      "email_jobs_pkey",
      "email_jobs_user",
      "email_jobs_world_id_user_id_event_key_key",
      "email_prefs_pkey",
      "item_photos_pkey",
      "notifications_pkey",
      "notifications_unread_once",
      "notifications_user_idx",
      "people_pkey",
      "world_snapshots_pkey",
      "worlds_pkey",
    ]);
    const def = (name: string) => indexes.find((i) => i.indexname === name)?.indexdef ?? "";
    expect(def("notifications_unread_once")).toMatch(/^CREATE UNIQUE INDEX .* \(world_id, user_id, dedupe\) WHERE \(read_at IS NULL\)$/);
    expect(def("notifications_user_idx")).toMatch(/\(world_id, user_id, at DESC\)$/);
    expect(def("actions_pkey")).toMatch(/\(world_id, actor_id, request_id\)$/);
    // Follow-on B4: one job per notification, one per change, kind, record and recipient, and the dispatcher's two partial indexes.
    expect(def("email_jobs_pkey")).toMatch(/\(world_id, notification_id\)$/);
    expect(def("email_jobs_world_id_user_id_event_key_key")).toMatch(/^CREATE UNIQUE INDEX .* \(world_id, user_id, event_key\)$/);
    expect(def("email_jobs_due")).toMatch(/\(retry_at\) WHERE \(status = ANY \(ARRAY\['pending'::text, 'failed'::text, 'sending'::text\]\)\)$/);
    expect(def("email_jobs_user")).toMatch(/\(user_id, category\) WHERE \(status = ANY \(ARRAY\['pending'::text, 'failed'::text\]\)\)$/);
  });

  it("accepts only 'live' and test-… world ids", async () => {
    const insert = (id: string) => db.sql`INSERT INTO worlds (id, doc) VALUES (${id}, '{"mode":"live"}')`;
    for (const id of ["live", "test-a", "test-run-1-x", `test-${"a".repeat(40)}`]) {
      expect(await outcome(() => insert(id)), id).toBe("ok");
    }
    const bad = ["LIVE", "Live", "prod", "", "test-", `test-${"a".repeat(41)}`, "test-A", "test_a", "test-a b", "live ", "test-a\n", "test-é"];
    for (const id of bad) expect(await outcome(() => insert(id)), JSON.stringify(id)).toBe("23514");
  });

  it("accepts a document only when it is an object whose mode is the string 'live' (a missing or null mode too)", async () => {
    const insert = (id: string, doc: string) => db.sql`INSERT INTO worlds (id, doc) VALUES (${id}, ${doc}::text::jsonb)`;
    expect(await outcome(() => insert("test-doc-ok", '{"mode":"live","v":11,"format":1}'))).toBe("ok");
    const bad = [
      "{}",
      '{"v":11}',
      '{"mode":null}',
      '{"mode":"preview"}',
      '{"mode":"LIVE"}',
      '{"mode":1}',
      '{"mode":["live"]}',
      "[]",
      '[{"mode":"live"}]',
      '"live"',
      "null",
    ];
    for (const [i, doc] of bad.entries()) expect(await outcome(() => insert(`test-doc-bad-${i}`, doc)), doc).toBe("23514");
    // The version can't go negative either.
    expect(await outcome(() => db.sql`UPDATE worlds SET version = -1 WHERE id = 'test-doc-ok'`)).toBe("23514");
  });

  it("keeps one unread notification per person and text, and allows it again once read", async () => {
    const add = (id: string, user: string, dedupe = MD5) => db.sql`
      INSERT INTO notifications (world_id, id, user_id, text, link, dedupe, at)
      VALUES ('test-base', ${id}, ${user}, 'Hello', '{"name":"activity"}', ${dedupe}, NOW())`;
    const addOnce = (id: string, user: string) => db.sql`
      INSERT INTO notifications (world_id, id, user_id, text, dedupe, at)
      VALUES ('test-base', ${id}, ${user}, 'Hello', ${MD5}, NOW())
      ON CONFLICT (world_id, user_id, dedupe) WHERE read_at IS NULL DO NOTHING`;

    expect(await outcome(() => add("n1", "ann"))).toBe("ok");
    expect(await outcome(() => add("n2", "ann"))).toBe("23505");
    expect((await addOnce("n3", "ann")).count).toBe(0);
    expect(await outcome(() => add("n4", "bob"))).toBe("ok"); // another person
    expect(await outcome(() => add("n5", "ann", "fedcba9876543210fedcba9876543210"))).toBe("ok"); // another text

    await db.sql`UPDATE notifications SET read_at = NOW() WHERE world_id = 'test-base' AND id = 'n1'`;
    expect((await addOnce("n6", "ann")).count).toBe(1);
    expect(await outcome(() => add("n7", "ann"))).toBe("23505"); // n6 is unread now
  });

  it("checks notification ids, texts, links and dedupe keys", async () => {
    const add = (id: string, text: string, link: string | null, dedupe: string) => db.sql`
      INSERT INTO notifications (world_id, id, user_id, text, link, dedupe, at)
      VALUES ('test-base', ${id}, 'cat', ${text}, ${link}::text::jsonb, ${dedupe}, NOW())`;
    const md5 = (i: number) => i.toString(16).padStart(32, "0");
    expect(await outcome(() => add("ok-1", "Hi", null, md5(1)))).toBe("ok");
    expect(await outcome(() => add("ok-2", "x".repeat(2000), '{"name":"item","id":"g1"}', md5(2)))).toBe("ok");
    expect(await outcome(() => add("Bad-Id", "Hi", null, md5(3)))).toBe("23514");
    expect(await outcome(() => add("x".repeat(49), "Hi", null, md5(4)))).toBe("23514");
    expect(await outcome(() => add("ok-5", "", null, md5(5)))).toBe("23514");
    expect(await outcome(() => add("ok-6", "x".repeat(2001), null, md5(6)))).toBe("23514");
    expect(await outcome(() => add("ok-7", "Hi", "null", md5(7)))).toBe("23514"); // JSON null, not SQL NULL
    expect(await outcome(() => add("ok-8", "Hi", '["activity"]', md5(8)))).toBe("23514");
    expect(await outcome(() => add("ok-9", "Hi", null, "not-an-md5"))).toBe("23514");
    expect(await outcome(() => add("ok-10", "Hi", null, MD5.toUpperCase()))).toBe("23514");
  });

  it("keys actions by world, actor and a UUID request id, with ids as an object", async () => {
    const log = (actor: string, requestId: string, ids = "{}", type = "take") => db.sql`
      INSERT INTO actions (world_id, actor_id, request_id, type, ids, ok, result, version_before, version_after)
      VALUES ('test-base', ${actor}, ${requestId}, ${type}, ${ids}::text::jsonb, true, '{}', 0, 1)`;
    expect(await outcome(() => log("ann", UUID))).toBe("ok");
    expect(await outcome(() => log("ann", UUID))).toBe("23505");
    expect(await outcome(() => log("bob", UUID))).toBe("ok"); // another actor may reuse the id
    expect(await outcome(() => log("ann", "not-a-uuid"))).toBe("22P02");
    expect(await outcome(() => log("cat", UUID, "[]"))).toBe("23514");
    expect(await outcome(() => log("dan", UUID, "{}", "t".repeat(41)))).toBe("23514");
  });

  it("checks profile fields and snapshot reasons", async () => {
    const person = (id: string, name: string, email: string | null = null, pay = "") => db.sql`
      INSERT INTO people (user_id, name, email, pay_handle) VALUES (${id}, ${name}, ${email}, ${pay})`;
    expect(await outcome(() => person("p1", "Ann Lee", "ann@example.invalid", "@ann"))).toBe("ok");
    expect(await outcome(() => person("p2", ""))).toBe("23514");
    expect(await outcome(() => person("p3", "n".repeat(121)))).toBe("23514");
    expect(await outcome(() => person("x".repeat(65), "Ann"))).toBe("23514");
    expect(await outcome(() => person("p5", "Ann", `${"e".repeat(250)}@x.io`))).toBe("23514");
    expect(await outcome(() => person("p6", "Ann", null, "h".repeat(61)))).toBe("23514");

    const snap = (version: number, reason: string) => db.sql`
      INSERT INTO world_snapshots (world_id, version, reason, doc) VALUES ('test-base', ${version}, ${reason}, '{"mode":"live"}')`;
    for (const reason of ["daily", "before-upgrade", "manual"]) expect(await outcome(() => snap(1, reason)), reason).toBe("ok");
    expect(await outcome(() => snap(2, "hourly"))).toBe("23514");
  });

  it("keeps payment methods as a list of at most two, within 1,200 bytes, '[]' by default (follow-on B1)", async () => {
    await db.sql`INSERT INTO people (user_id, name) VALUES ('pm1', 'Ann Lee')`;
    const [fresh] = await db.sql<{ pay_methods: unknown }[]>`SELECT pay_methods FROM people WHERE user_id = 'pm1'`;
    expect(fresh?.pay_methods).toEqual([]);
    const set = (json: string | null) => db.sql`UPDATE people SET pay_methods = ${json}::text::jsonb WHERE user_id = 'pm1'`;
    const two = JSON.stringify([{ kind: "venmo", value: "ann-lee" }, { kind: "zelle", value: "+12155550142" }]);
    expect(await outcome(() => set(two))).toBe("ok");
    expect(await outcome(() => set("[]"))).toBe("ok");
    for (const bad of ["{}", '"venmo"', "null", "[1, 2, 3]", JSON.stringify([{ kind: "paypal", value: "x".repeat(1200) }])]) {
      expect(await outcome(() => set(bad)), bad.slice(0, 40)).toBe("23514");
    }
    expect(await outcome(() => set(null))).toBe("23502"); // NOT NULL
    const [col] = await db.admin<{ column_default: string; is_nullable: string; data_type: string }[]>`
      SELECT column_default, is_nullable, data_type FROM information_schema.columns
      WHERE table_schema = ${db.schema} AND table_name = 'people' AND column_name = 'pay_methods'`;
    expect(col).toEqual({ column_default: "'[]'::jsonb", is_nullable: "NO", data_type: "jsonb" });
  });

  it("deletes a world's notifications, actions and snapshots with it", async () => {
    await db.sql`INSERT INTO worlds (id, doc) VALUES ('test-cascade', '{"mode":"live"}')`;
    await db.sql`INSERT INTO notifications (world_id, id, user_id, text, dedupe, at) VALUES ('test-cascade', 'c1', 'ann', 'Hi', ${MD5}, NOW())`;
    await db.sql`
      INSERT INTO actions (world_id, actor_id, request_id, type, ok, result, version_before, version_after)
      VALUES ('test-cascade', 'ann', ${UUID}, 'take', true, '{}', 0, 1)`;
    await db.sql`INSERT INTO world_snapshots (world_id, version, reason, doc) VALUES ('test-cascade', 1, 'daily', '{"mode":"live"}')`;
    await db.sql`DELETE FROM worlds WHERE id = 'test-cascade'`;
    const [left] = await db.sql<{ n: number }[]>`
      SELECT ((SELECT count(*) FROM notifications WHERE world_id = 'test-cascade')
            + (SELECT count(*) FROM actions WHERE world_id = 'test-cascade')
            + (SELECT count(*) FROM world_snapshots WHERE world_id = 'test-cascade'))::int AS n`;
    expect(left?.n).toBe(0);
    // A notification can't point at a world that doesn't exist.
    expect(
      await outcome(() => db.sql`INSERT INTO notifications (world_id, id, user_id, text, dedupe, at) VALUES ('test-none', 'c2', 'ann', 'Hi', ${MD5}, NOW())`),
    ).toBe("23503");
  });

  // ── Follow-on B4: the email tables ──────────────────────────────────────────────────────

  it("keeps one email preference row per profile: the sign-in address, the sign-in, a consent version; off by default; gone with the profile", async () => {
    await db.sql`INSERT INTO people (user_id, name, email) VALUES ('ep1', 'Ann Lee', 'ann@upenn.edu'), ('ep2', 'Bob Diaz', NULL)`;
    const prefs = (user: string, address: string, signIn = "google", version = "v1") => db.sql`
      INSERT INTO email_prefs (user_id, address, sign_in, consent_version, consented_at) VALUES (${user}, ${address}, ${signIn}, ${version}, NOW())`;
    expect(await outcome(() => prefs("ep1", "ann@upenn.edu"))).toBe("ok");
    const [row] = await db.sql<{ exchange_on: boolean; matches_on: boolean }[]>`SELECT exchange_on, matches_on FROM email_prefs WHERE user_id = 'ep1'`;
    expect(row).toEqual({ exchange_on: false, matches_on: false }); // nothing is on until someone turns it on
    expect(await outcome(() => prefs("ep1", "ann@upenn.edu"))).toBe("23505"); // one row per account
    expect(await outcome(() => prefs("ep-none", "cat@upenn.edu"))).toBe("23503"); // only for a profile that exists
    for (const bad of ["", "a@", "@b", "ab", "a b@upenn.edu", "a@b@upenn.edu", "a@upenn edu", `${"x".repeat(250)}@x.io`]) {
      expect(await outcome(() => prefs("ep2", bad)), JSON.stringify(bad)).toBe("23514");
    }
    expect(await outcome(() => prefs("ep2", "bob@upenn.edu", "github"))).toBe("23514");
    for (const version of ["1", "v", "V1", "v1000", "v1 ", ""]) expect(await outcome(() => prefs("ep2", "bob@upenn.edu", "dev", version)), version).toBe("23514");
    expect(await outcome(() => db.sql`INSERT INTO email_prefs (user_id, address, sign_in, consent_version) VALUES ('ep2', 'bob@upenn.edu', 'dev', 'v1')`)).toBe("23502"); // consented_at
    await db.sql`DELETE FROM people WHERE user_id = 'ep1'`;
    expect(await count(db.sql`SELECT count(*)::int AS n FROM email_prefs WHERE user_id = 'ep1'`)).toBe(0);
  });

  it("keeps the dispatcher's heartbeat for the capture and a provider only", async () => {
    const beat = (sender: string, runAt: Date | null = new Date()) => db.sql`
      INSERT INTO email_dispatch (sender, last_run_at, last_ok_at) VALUES (${sender}, ${runAt}, NULL)`;
    expect(await outcome(() => beat("capture"))).toBe("ok");
    expect(await outcome(() => beat("provider"))).toBe("ok");
    expect(await outcome(() => beat("capture"))).toBe("23505");
    for (const sender of ["smtp", "Capture", "whatsapp", "sms"]) expect(await outcome(() => beat(sender)), sender).toBe("23514");
    expect(await outcome(() => db.sql`UPDATE email_dispatch SET last_run_at = NULL WHERE sender = 'capture'`)).toBe("23502");
  });

  it("keeps one email job per notification and per change, kind, record and recipient, with fixed codes, and a lease, sent time and expiry that agree with the status", async () => {
    const T = Date.UTC(2026, 10, 9, 15, 0);
    await db.sql`INSERT INTO worlds (id, doc) VALUES ('test-email', '{"mode":"live"}')`;
    for (let i = 1; i <= 40; i++) {
      await db.sql`INSERT INTO notifications (world_id, id, user_id, text, dedupe, at) VALUES ('test-email', ${`n${i}`}, 'ann', 'Hi', md5(${`n${i}`}), NOW())`;
    }
    let next = 0;
    type Job = { note: string; kind: string; category: string; ref: string; link: string | null; key: string; status: string; reason: string | null; attempts: number; lease: Date | null; sent: Date | null; expires: Date; user: string };
    const job = (o: Partial<Job> = {}) => {
      next += 1;
      const j: Job = {
        note: `n${next}`, kind: "offer.received", category: "exchange", ref: "r0123456789abcdef", link: '{"name":"activity","listing":"l1"}',
        key: `${UUID}:offer.received:r${next}`, status: "pending", reason: null, attempts: 0, lease: null, sent: null, expires: new Date(T + 86_400_000), user: "ann", ...o,
      };
      return db.sql`
        INSERT INTO email_jobs (world_id, notification_id, user_id, kind, category, ref, link, event_key, status, reason, attempts, retry_at, lease_until,
                                expires_at, sent_at, created_at)
        VALUES ('test-email', ${j.note}, ${j.user}, ${j.kind}, ${j.category}, ${j.ref}, ${j.link}::text::jsonb, ${j.key}, ${j.status}, ${j.reason},
                ${j.attempts}, ${new Date(T)}, ${j.lease}, ${j.expires}, ${j.sent}, ${new Date(T)})`;
    };
    expect(await outcome(() => job({ note: "n40", key: "first" }))).toBe("ok");
    expect(await outcome(() => job({ note: "n40" }))).toBe("23505"); // a second job for the same notification
    expect(await outcome(() => job({ key: "first" }))).toBe("23505"); // the same change, kind and record for the same person
    expect(await outcome(() => job({ key: "first", user: "bob" }))).toBe("ok"); // another person's
    expect(await outcome(() => job({ note: "n-none" }))).toBe("23503"); // only for a stored notification
    for (const kind of ["offer", "Offer.received", "offer_received", "offer.received.x.y", "match.", `${"a".repeat(36)}.bcde`]) {
      expect(await outcome(() => job({ kind })), kind).toBe("23514");
    }
    expect(await outcome(() => job({ kind: "match.listing", category: "match" }))).toBe("ok");
    expect(await outcome(() => job({ category: "broadcast" }))).toBe("23514");
    for (const ref of ["R1", "r 1", "", "x".repeat(49)]) expect(await outcome(() => job({ ref })), ref).toBe("23514");
    expect(await outcome(() => job({ link: "[]" }))).toBe("23514");
    expect(await outcome(() => job({ link: null }))).toBe("23502");
    expect(await outcome(() => job({ key: "k".repeat(161) }))).toBe("23514");
    expect(await outcome(() => job({ status: "queued" }))).toBe("23514");
    for (const reason of ["not_relevant:answered", "retry:rate_limited", "opted_out", "dead:attempts"]) expect(await outcome(() => job({ status: "skipped", reason })), reason).toBe("ok");
    for (const reason of ["Opted out", "opted-out", "x".repeat(61), ""]) expect(await outcome(() => job({ status: "skipped", reason })), reason).toBe("23514");
    for (const attempts of [-1, 21]) expect(await outcome(() => job({ attempts })), String(attempts)).toBe("23514");
    // A lease exactly while sending, a sent time exactly once sent, and an expiry after the job was made.
    const lease = new Date(T + 120_000);
    expect(await outcome(() => job({ status: "sending", lease, attempts: 1 }))).toBe("ok");
    expect(await outcome(() => job({ status: "sending" }))).toBe("23514");
    expect(await outcome(() => job({ lease }))).toBe("23514");
    expect(await outcome(() => job({ status: "sent", sent: new Date(T) }))).toBe("ok");
    expect(await outcome(() => job({ status: "sent" }))).toBe("23514");
    expect(await outcome(() => job({ sent: new Date(T) }))).toBe("23514");
    expect(await outcome(() => job({ expires: new Date(T) }))).toBe("23514");
  });

  it("keeps the capture outbox to its column limits, once per key, and deletes jobs and captures with their notification or world", async () => {
    await db.sql`INSERT INTO worlds (id, doc) VALUES ('test-email-cascade', '{"mode":"live"}')`;
    for (const id of ["m1", "m2"]) {
      await db.sql`INSERT INTO notifications (world_id, id, user_id, text, dedupe, at) VALUES ('test-email-cascade', ${id}, 'ann', 'Hi', md5(${id}), NOW())`;
      await db.sql`
        INSERT INTO email_jobs (world_id, notification_id, user_id, kind, category, ref, link, event_key, retry_at, expires_at, created_at)
        VALUES ('test-email-cascade', ${id}, 'ann', 'offer.received', 'exchange', 'r1', '{"name":"activity"}', ${`${UUID}:offer.received:${id}`},
                NOW(), NOW() + interval '1 day', NOW())`;
    }
    const capture = (o: { key?: string; note?: string; to?: string; subject?: string; body?: string; url?: string } = {}) => db.sql`
      INSERT INTO email_capture (idempotency_key, world_id, notification_id, to_address, subject, body_text, action_url)
      VALUES (${o.key ?? "handoff:test-email-cascade:m1"}, 'test-email-cascade', ${o.note ?? "m1"}, ${o.to ?? "handoff-test-a@example.invalid"},
              ${o.subject ?? "Offer on your ticket"}, ${o.body ?? "Ann made an offer."}, ${o.url ?? "http://localhost:3000/tools/handoff#activity"})`;
    expect(await outcome(() => capture())).toBe("ok");
    expect(await outcome(() => capture())).toBe("23505"); // once per idempotency key
    expect(await outcome(() => capture({ key: "handoff:test-email-cascade:x", note: "m-none" }))).toBe("23503"); // only for a job
    for (const [field, value] of [["key", "k".repeat(121)], ["to", "t".repeat(255)], ["subject", "s".repeat(201)], ["body", "b".repeat(4001)], ["url", "u".repeat(601)]] as const) {
      expect(await outcome(() => capture({ key: `handoff:test-email-cascade:${field}`, note: "m2", [field]: value })), field).toBe("23514");
    }
    expect(await outcome(() => capture({ key: "handoff:test-email-cascade:m2", note: "m2" }))).toBe("ok");
    // A notification takes its job and capture with it; the world takes everything.
    await db.sql`DELETE FROM notifications WHERE world_id = 'test-email-cascade' AND id = 'm1'`;
    const left = () => count(db.sql`
      SELECT ((SELECT count(*) FROM email_jobs WHERE world_id = 'test-email-cascade') + (SELECT count(*) FROM email_capture WHERE world_id = 'test-email-cascade'))::int AS n`);
    expect(await left()).toBe(2);
    await db.sql`DELETE FROM worlds WHERE id = 'test-email-cascade'`;
    expect(await left()).toBe(0);
  });
});

async function count(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? -1;
}
