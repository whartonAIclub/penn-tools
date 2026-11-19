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

  it("has exactly the seven tables, their primary keys and their indexes", async () => {
    const tables = await db.admin<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = ${db.schema} ORDER BY table_name`;
    expect(tables.map((t) => t.table_name)).toEqual([
      // item_photos: §9s item 6. records: the market as rows (review of PR #88). The email tables went with outbound email.
      "actions", "item_photos", "notifications", "people", "records", "world_snapshots", "worlds",
    ]);

    const indexes = await db.admin<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = ${db.schema} ORDER BY indexname`;
    expect(indexes.map((i) => i.indexname)).toEqual([
      "actions_actor_at_idx",
      "actions_at_idx",
      "actions_pkey",
      "item_photos_pkey",
      "notifications_pkey",
      "notifications_unread_once",
      "notifications_user_idx",
      "people_pkey",
      "records_id_idx",
      "records_parent_idx",
      "records_pkey",
      "records_tally_idx",
      "world_snapshots_pkey",
      "worlds_pkey",
    ]);
    const def = (name: string) => indexes.find((i) => i.indexname === name)?.indexdef ?? "";
    expect(def("notifications_unread_once")).toMatch(/^CREATE UNIQUE INDEX .* \(world_id, user_id, dedupe\) WHERE \(read_at IS NULL\)$/);
    expect(def("notifications_user_idx")).toMatch(/\(world_id, user_id, at DESC\)$/);
    expect(def("actions_pkey")).toMatch(/\(world_id, actor_id, request_id\)$/);
    expect(def("actions_actor_at_idx")).toMatch(/\(world_id, actor_id, at\)$/); // the per-account limit on changes a minute
    expect(def("records_pkey")).toMatch(/\(world_id, kind, id\)$/);
    expect(def("records_tally_idx")).toMatch(/\(world_id\) INCLUDE \(tally, rev\)$/); // the version, read on every refresh
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

  // ── Review of PR #88: the market as rows; outbound email gone ───────────────────────────

  it("keeps each record as its own row: checked kind, id, revision, tally and data; gone with its world", async () => {
    await db.sql`INSERT INTO worlds (id, doc) VALUES ('test-rows', '{"mode":"live"}')`;
    const row = (kind: string, id: string, data: string, extra: { rev?: number; tally?: number } = {}) => db.sql`
      INSERT INTO records (world_id, kind, id, ord, rev, tally, data) VALUES ('test-rows', ${kind}, ${id}, nextval('record_ord'), ${extra.rev ?? 1}, ${extra.tally ?? 0}, ${data}::text::jsonb)`;
    expect(await outcome(() => row("listing", "l1", '{"id":"l1"}'))).toBe("ok");
    expect(await outcome(() => row("listing", "l1", '{"id":"l1"}'))).toBe("23505"); // one row per kind and id
    expect(await outcome(() => row("goodsReq", "l1", '{"id":"l1"}'))).toBe("ok"); // another kind may share the id
    for (const [kind, id, data, extra] of [
      ["no kind!", "x1", "{}", {}],
      ["listing", "", "{}", {}],
      ["listing", "x2", "[]", {}],
      ["listing", "x3", "{}", { rev: 0 }],
      ["listing", "x4", "{}", { tally: -1 }],
    ] as const) {
      expect(await outcome(() => row(kind, id, data, extra)), `${kind} ${id} ${data}`).toBe("23514");
    }
    await db.sql`DELETE FROM worlds WHERE id = 'test-rows'`;
    expect((await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM records WHERE world_id = 'test-rows'`)[0]?.n).toBe(0);
  });

  it("drops the email tables an earlier version of this file made, and keeps in-app notifications", async () => {
    await db.sql.unsafe(`
      CREATE TABLE email_prefs (user_id TEXT PRIMARY KEY);
      CREATE TABLE email_dispatch (sender TEXT PRIMARY KEY);
      CREATE TABLE email_jobs (world_id TEXT, notification_id TEXT, PRIMARY KEY (world_id, notification_id));
      CREATE TABLE email_capture (idempotency_key TEXT PRIMARY KEY)`);
    await db.sql`INSERT INTO notifications (world_id, id, user_id, text, dedupe, at) VALUES ('test-base', 'kept1', 'kept-user', 'Hi', ${MD5}, NOW())`;
    await db.sql.unsafe(schemaSql);
    const tables = await db.admin<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = ${db.schema} AND table_name LIKE 'email%'`;
    expect(tables).toEqual([]);
    expect((await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE id = 'kept1'`)[0]?.n).toBe(1);
  });
});

async function count(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? -1;
}
