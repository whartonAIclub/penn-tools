// Usage metrics against a real Postgres: each run creates a throwaway schema
// from schema.sql and drops it afterwards. The database tests are skipped when
// no database is configured (DATABASE_URL, or apps/web/.env.local); the rest
// need none.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  canViewMetrics,
  checkChatEvent,
  checkFollowUpEvent,
  followUpEventFor,
  getMetrics,
  recordChat,
  recordFollowUp,
} from "../metrics.js";

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
    await sql`TRUNCATE chat_events, follow_up_events`;
  });

  it("schema.sql can be applied again to an existing schema", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("starts at zero, with no averages to divide by", async () => {
    expect(await getMetrics(sql)).toEqual({
      users: 0,
      chats: 0,
      people: 0,
      chatsPerUser: null,
      peoplePerUser: null,
      followThrough: { thankYousSent: 0, thankYousOnTime: 0, onTimeRate: null, checkInsDone: 0 },
      retention: { activeThisWeek: 0, returningUsers: 0, returningRate: null },
    });
  });

  it("counts a user once they save a chat", async () => {
    expect(await recordChat(sql, "alice", { personKey: "p1", chatKey: "p1:1" })).toBe(true);
    expect(await getMetrics(sql)).toMatchObject({ users: 1, chats: 1, people: 1, chatsPerUser: 1, peoplePerUser: 1 });
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

    expect(await getMetrics(sql)).toMatchObject({ users: 3, chats: 6, people: 5, chatsPerUser: 2, peoplePerUser: 5 / 3 });
  });

  describe("follow-through", () => {
    const thankYou = (n: number, days: number) => ({ followUpKey: `p${n}:0`, kind: "thankYou" as const, daysAfterChat: days });
    const checkIn = (n: number) => ({ followUpKey: `p${n}:1`, kind: "followUp" as const, daysAfterChat: 60 });

    it("counts thank-yous sent and the share done within 2 days of the chat", async () => {
      await recordFollowUp(sql, "alice", thankYou(1, 0));
      await recordFollowUp(sql, "alice", thankYou(2, 2)); // still on time: the limit is inclusive
      await recordFollowUp(sql, "bob", thankYou(3, 3));
      await recordFollowUp(sql, "bob", thankYou(4, 10));
      expect((await getMetrics(sql)).followThrough).toEqual({ thankYousSent: 4, thankYousOnTime: 2, onTimeRate: 0.5, checkInsDone: 0 });
    });

    it("counts check-ins separately from thank-yous", async () => {
      await recordFollowUp(sql, "alice", checkIn(1));
      await recordFollowUp(sql, "alice", checkIn(2));
      await recordFollowUp(sql, "alice", thankYou(3, 1));
      expect((await getMetrics(sql)).followThrough).toEqual({ thankYousSent: 1, thankYousOnTime: 1, onTimeRate: 1, checkInsDone: 2 });
    });

    it("counts the same follow-up once, even if it's undone and done again", async () => {
      expect(await recordFollowUp(sql, "alice", thankYou(1, 1))).toBe(true);
      expect(await recordFollowUp(sql, "alice", thankYou(1, 9))).toBe(false);
      expect((await getMetrics(sql)).followThrough).toMatchObject({ thankYousSent: 1, thankYousOnTime: 1 });
    });

    it("keeps two users' follow-ups apart even when their keys match", async () => {
      await recordFollowUp(sql, "alice", thankYou(1, 1));
      expect(await recordFollowUp(sql, "bob", thankYou(1, 1))).toBe(true);
      expect((await getMetrics(sql)).followThrough.thankYousSent).toBe(2);
    });

    it("stores only keys, the kind and a number of days", async () => {
      const columns = await sql<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'follow_up_events'
      `;
      expect(columns.map((c) => c.column_name).sort()).toEqual(["created_at", "days_after_chat", "follow_up_key", "id", "kind", "user_id"]);
    });
  });

  describe("retention", () => {
    // 2026-11-11 is a Wednesday; its week starts Monday 2026-11-09.
    const now = new Date("2026-11-11T12:00:00Z");
    const chatAt = (user: string, key: string, at: string) =>
      sql`INSERT INTO chat_events (user_id, person_key, chat_key, created_at) VALUES (${user}, ${key}, ${key + ":1"}, ${at}::timestamptz)`;
    const doneAt = (user: string, key: string, at: string) =>
      sql`INSERT INTO follow_up_events (user_id, follow_up_key, kind, days_after_chat, created_at) VALUES (${user}, ${key}, 'thankYou', 1, ${at}::timestamptz)`;

    it("counts users active in the last 7 days", async () => {
      await chatAt("alice", "a1", "2026-11-10T09:00:00Z"); // yesterday
      await chatAt("bob", "b1", "2026-11-02T09:00:00Z"); // 9 days ago
      expect((await getMetrics(sql, now)).retention.activeThisWeek).toBe(1);
    });

    it("counts a user as returning once they're active in two different weeks", async () => {
      await chatAt("alice", "a1", "2026-10-28T09:00:00Z"); // week of Oct 26
      await chatAt("alice", "a2", "2026-11-10T09:00:00Z"); // week of Nov 9
      await chatAt("bob", "b1", "2026-11-09T08:00:00Z"); // Monday of this week
      await chatAt("bob", "b2", "2026-11-15T22:00:00Z"); // Sunday, same week
      const { retention } = await getMetrics(sql, now);
      expect(retention.returningUsers).toBe(1);
      expect(retention.returningRate).toBe(0.5);
    });

    it("counts a follow-up marked done in a later week as coming back", async () => {
      await chatAt("alice", "a1", "2026-10-28T09:00:00Z");
      await doneAt("alice", "a1:0", "2026-11-10T09:00:00Z");
      expect((await getMetrics(sql, now)).retention).toMatchObject({ returningUsers: 1, activeThisWeek: 1 });
    });

    it("ignores follow-ups from someone who never saved a chat", async () => {
      await doneAt("ghost", "g1:0", "2026-10-28T09:00:00Z");
      await doneAt("ghost", "g1:1", "2026-11-10T09:00:00Z");
      expect((await getMetrics(sql, now)).retention).toEqual({ activeThisWeek: 0, returningUsers: 0, returningRate: null });
    });
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

describe("followUpEventFor", () => {
  const thankYou = { contactId: "c1", stepIndex: 0, kind: "thankYou" as const };

  it("counts the days from the chat to the day it was done", () => {
    expect(followUpEventFor(thankYou, "2026-11-10", "2026-11-12")).toEqual({ followUpKey: "c1:0", kind: "thankYou", daysAfterChat: 2 });
    expect(followUpEventFor(thankYou, "2026-11-10", "2026-11-10").daysAfterChat).toBe(0);
  });

  it("never goes negative, e.g. when a later chat moved the contact's date", () => {
    expect(followUpEventFor(thankYou, "2026-11-20", "2026-11-12").daysAfterChat).toBe(0);
  });

  it("copes with a bad date by counting 0 days", () => {
    expect(followUpEventFor(thankYou, "not a date", "2026-11-12").daysAfterChat).toBe(0);
  });
});

describe("checkFollowUpEvent", () => {
  it("accepts a normal event", () => {
    expect(checkFollowUpEvent("c1:0", "thankYou", 2)).toBeNull();
    expect(checkFollowUpEvent("c1:3", "followUp", 0)).toBeNull();
  });

  it.each([
    ["a missing key", "", "thankYou", 1],
    ["a key that's too long", "x".repeat(101), "thankYou", 1],
    ["an unknown kind", "c1:0", "email", 1],
    ["negative days", "c1:0", "thankYou", -1],
    ["fractional days", "c1:0", "thankYou", 1.5],
    ["days that aren't a number", "c1:0", "thankYou", "2"],
    ["absurd days", "c1:0", "thankYou", 99999],
  ])("rejects %s", (_label, key, kind, days) => {
    expect(checkFollowUpEvent(key, kind, days)).toEqual(expect.any(String));
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
