// Usage metrics against a real Postgres: each run creates a throwaway schema
// from schema.sql and drops it afterwards. The database tests are skipped when
// no database is configured (DATABASE_URL, or apps/web/.env.local); the rest
// need none.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { buildContact, contactToDraft, emptyDraft, logAnotherChat, type Contact } from "../contacts.js";
import { canViewMetrics, eventsFromChanges, getMetrics, recordChat, recordFollowUp } from "../metrics.js";

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

const TODAY = "2026-11-16";
function person(overrides: Partial<Contact> = {}): Contact {
  const built = buildContact({ ...emptyDraft("2026-11-10"), name: "Maria Chen", meetingDate: "2026-11-10" }, TODAY, "c1");
  if (!built.ok) throw new Error("fixture is invalid");
  const steps = [
    { action: "Send a thank-you email", owner: "me" as const, dueDate: "2026-11-11", done: false, doneOn: null, id: "step-ty" },
    { action: "Follow up", owner: "me" as const, dueDate: "2027-01-10", done: false, doneOn: null, id: "step-ci" },
  ];
  return { ...built.contact, nextSteps: steps, ...overrides };
}
const doneStep = (contact: Contact, id: string, doneOn: string): Contact => ({
  ...contact,
  nextSteps: contact.nextSteps.map((s) => (s.id === id ? { ...s, done: true, doneOn } : s)),
});

describe("eventsFromChanges", () => {
  it("counts a new contact as one chat", () => {
    expect(eventsFromChanges([{ before: null, after: person() }])).toEqual({ chats: [{ personKey: "c1", chatKey: "c1:1" }], followUps: [] });
  });

  it("counts a thank-you when its step goes from open to done, keyed by the step's id, with days from the chat", () => {
    const before = person();
    const { chats, followUps } = eventsFromChanges([{ before, after: doneStep(before, "step-ty", "2026-11-12") }]);
    expect(chats).toEqual([]);
    expect(followUps).toEqual([{ followUpKey: "step-ty", kind: "thankYou", daysAfterChat: 2 }]);
  });

  it("counts a check-in separately", () => {
    const before = person();
    expect(eventsFromChanges([{ before, after: doneStep(before, "step-ci", "2026-12-01") }]).followUps[0]).toMatchObject({ kind: "followUp", followUpKey: "step-ci" });
  });

  it("counts nothing for a save that changes neither chats nor steps, or for a step that was already done", () => {
    const before = doneStep(person(), "step-ty", "2026-11-12");
    expect(eventsFromChanges([{ before, after: { ...before, company: "Stripe" } }])).toEqual({ chats: [], followUps: [] });
  });

  it("keeps counting right when steps move: the key follows the step, not its position", () => {
    const before = person();
    const reordered = { ...before, nextSteps: [before.nextSteps[1]!, before.nextSteps[0]!] };
    const after = doneStep(reordered, "step-ty", "2026-11-11"); // the thank-you is now at index 1
    expect(eventsFromChanges([{ before, after }]).followUps).toEqual([{ followUpKey: "step-ty", kind: "thankYou", daysAfterChat: 1 }]);
  });

  it("counts a later follow-up under its own key even after a finished step was removed ahead of it", () => {
    const first = doneStep(person(), "step-ty", "2026-11-11");
    const reopenedAndRemoved = { ...first, nextSteps: first.nextSteps.filter((s) => s.id !== "step-ty") }; // positions shift
    const after = doneStep(reopenedAndRemoved, "step-ci", "2026-12-02");
    expect(eventsFromChanges([{ before: reopenedAndRemoved, after }]).followUps.map((f) => f.followUpKey)).toEqual(["step-ci"]);
  });

  it("measures a late thank-you from the chat it belongs to, not from a newer chat", () => {
    // The thank-you for the 10th is still open when a second chat on the 30th is logged; it's done on Dec 1.
    const older = person();
    const logged = logAnotherChat(older, { ...contactToDraft(older), meetingDate: "2026-11-30", nextSteps: [] }, "2026-11-30");
    if (!logged.ok) throw new Error("fixture failed");
    const after = doneStep(logged.contact, "step-ty", "2026-12-01");
    const [event] = eventsFromChanges([{ before: logged.contact, after }]).followUps;
    expect(event).toEqual({ followUpKey: "step-ty", kind: "thankYou", daysAfterChat: 21 }); // 21 days after Nov 10, not 1 day after Nov 30
  });

  it("counts each new chat once, numbered within the contact", () => {
    const one = person();
    const two = logAnotherChat(one, { ...contactToDraft(one), meetingDate: "2026-11-12", nextSteps: [] }, TODAY);
    if (!two.ok) throw new Error("fixture failed");
    expect(eventsFromChanges([{ before: one, after: two.contact }]).chats).toEqual([{ personKey: "c1", chatKey: "c1:2" }]);
    expect(eventsFromChanges([{ before: null, after: two.contact }]).chats.map((c) => c.chatKey)).toEqual(["c1:1", "c1:2"]);
  });

  it("doesn't count steps that have no id yet (they get one when saved)", () => {
    const before = person();
    const noIds = { ...before, nextSteps: before.nextSteps.map(({ id: _id, ...rest }) => rest) };
    const after = { ...noIds, nextSteps: noIds.nextSteps.map((s, i) => (i === 0 ? { ...s, done: true, doneOn: "2026-11-11" } : s)) };
    expect(eventsFromChanges([{ before: noIds, after }]).followUps).toEqual([]);
  });

  it("copes with a bad date by counting 0 days, and never goes negative", () => {
    const before = person();
    expect(eventsFromChanges([{ before, after: doneStep(before, "step-ty", "2026-11-01") }]).followUps[0]?.daysAfterChat).toBe(0);
    expect(eventsFromChanges([{ before, after: doneStep(before, "step-ty", "not a date") }]).followUps[0]?.daysAfterChat).toBe(0);
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
