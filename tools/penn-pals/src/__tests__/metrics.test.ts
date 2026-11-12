// Usage metrics against a real Postgres: each run creates a throwaway schema
// from schema.sql and drops it afterwards. The database tests are skipped when
// no database is configured (DATABASE_URL, or apps/web/.env.local); the rest
// need none.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { canViewMetrics, checkChatEvent, getMetrics, recordChat } from "../metrics.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `pennpals_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

describe.skipIf(!databaseUrl)("Penn Pals metrics (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  beforeEach(async () => {
    await sql`TRUNCATE chat_events`;
  });

  it("schema.sql can be applied again to an existing schema", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("starts at zero, with no averages to divide by", async () => {
    expect(await getMetrics(sql)).toEqual({ users: 0, chats: 0, people: 0, chatsPerUser: null, peoplePerUser: null });
  });

  it("counts a user once they save a chat", async () => {
    expect(await recordChat(sql, "alice", { personKey: "p1", chatKey: "p1:1" })).toBe(true);
    expect(await getMetrics(sql)).toEqual({ users: 1, chats: 1, people: 1, chatsPerUser: 1, peoplePerUser: 1 });
  });

  it("counts the same chat only once, even if it's reported twice", async () => {
    await recordChat(sql, "alice", { personKey: "p1", chatKey: "p1:1" });
    expect(await recordChat(sql, "alice", { personKey: "p1", chatKey: "p1:1" })).toBe(false);
    expect((await getMetrics(sql)).chats).toBe(1);
  });

  it("counts several chats with one person as several chats but one person", async () => {
    for (const n of [1, 2, 3]) await recordChat(sql, "alice", { personKey: "p1", chatKey: `p1:${n}` });
    expect(await getMetrics(sql)).toMatchObject({ users: 1, chats: 3, people: 1 });
  });

  it("works out the totals and the averages per user across users", async () => {
    // alice: 3 chats with 2 people; bob: 1 chat with 1 person; carol: 2 chats with 2 people
    await recordChat(sql, "alice", { personKey: "a1", chatKey: "a1:1" });
    await recordChat(sql, "alice", { personKey: "a1", chatKey: "a1:2" });
    await recordChat(sql, "alice", { personKey: "a2", chatKey: "a2:1" });
    await recordChat(sql, "bob", { personKey: "b1", chatKey: "b1:1" });
    await recordChat(sql, "carol", { personKey: "c1", chatKey: "c1:1" });
    await recordChat(sql, "carol", { personKey: "c2", chatKey: "c2:1" });

    expect(await getMetrics(sql)).toEqual({ users: 3, chats: 6, people: 5, chatsPerUser: 2, peoplePerUser: 5 / 3 });
  });

  it("keeps two users' chats apart even when their keys match", async () => {
    await recordChat(sql, "alice", { personKey: "p1", chatKey: "p1:1" });
    expect(await recordChat(sql, "bob", { personKey: "p1", chatKey: "p1:1" })).toBe(true);
    expect(await getMetrics(sql)).toMatchObject({ users: 2, chats: 2, people: 2 });
  });

  it("stores only keys and a time: nothing a person wrote", async () => {
    await recordChat(sql, "alice", { personKey: "p1", chatKey: "p1:1" });
    const columns = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'chat_events'
    `;
    expect(columns.map((c) => c.column_name).sort()).toEqual(["chat_key", "created_at", "id", "person_key", "user_id"]);
  });
});

describe("checkChatEvent", () => {
  it("accepts ordinary keys", () => {
    expect(checkChatEvent("3f6c0c1e-9d2a-4b7e-8a53-1c2d3e4f5a6b", "3f6c0c1e-9d2a-4b7e-8a53-1c2d3e4f5a6b:2")).toBeNull();
  });

  it.each([
    ["a missing person key", "", "k:1"],
    ["a blank chat key", "p", "   "],
    ["a non-string", 5, "k:1"],
    ["a key that's too long", "p", "x".repeat(101)],
  ])("rejects %s", (_label, personKey, chatKey) => {
    expect(checkChatEvent(personKey, chatKey)).toEqual(expect.any(String));
  });
});

describe("canViewMetrics", () => {
  const team = ["Luana@example.edu", " gabriela@example.edu "];

  it("lets anyone in while developing locally", () => {
    expect(canViewMetrics("anyone@example.edu", [], false)).toBe(true);
    expect(canViewMetrics(null, [], false)).toBe(true);
  });

  it("lets only the listed emails in production, ignoring case and spaces", () => {
    expect(canViewMetrics("luana@example.edu", team, true)).toBe(true);
    expect(canViewMetrics("GABRIELA@EXAMPLE.EDU", team, true)).toBe(true);
    expect(canViewMetrics("stranger@example.edu", team, true)).toBe(false);
  });

  it("keeps everyone out in production while the list is empty, or with no email", () => {
    expect(canViewMetrics("luana@example.edu", [], true)).toBe(false);
    expect(canViewMetrics(null, team, true)).toBe(false);
    expect(canViewMetrics(undefined, team, true)).toBe(false);
  });
});
