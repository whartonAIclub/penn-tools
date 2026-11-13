// Steps 16-19 end to end against a throwaway schema: an event gets its
// checklist, moving it moves the tasks, the board's readiness and leader flag,
// and template versions. Includes the step 19 exit test: two overlapping events.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { createPlannedEvent, updatePlannedEvent, getPlannedEvent } from "../planning.js";
import type { PlannedEventInput } from "../planning.js";
import { generateEventChecklist } from "../eventChecklist.js";
import { listTasks, updateTask } from "../tasks.js";
import { eventReadiness, eventsWithoutLeader, hasPubLeader } from "../board.js";
import { listTemplateVersions, revertTemplate, setTemplateIssueStatus } from "../templateVersions.js";
import { getTemplate, PUB_TEMPLATE_V1 } from "../pubTemplate.js";
import { describeTiming } from "../checklist.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_workflow_test_${Date.now()}`;

const input = (over: Partial<PlannedEventInput> = {}): PlannedEventInput => ({
  title: "Pub",
  eventDate: "2026-10-22",
  eventTime: null,
  theme: null,
  venue: null,
  budget: null,
  roles: [{ role: "Pub Leader", person: "Alice" }],
  partnerClubs: [],
  vendors: [],
  notes: null,
  confirmedClub: false,
  confirmedVenue: false,
  clubContact: null,
  totalAttendees: null,
  dropIns: null,
  ticketRevenue: null,
  costs: null,
  cancelled: false,
  ...over,
});

describe("hasPubLeader", () => {
  it("needs the role itself, filled in; another named person doesn't count", () => {
    expect(hasPubLeader([{ role: "Pub Leader", person: "Ada" }])).toBe(true);
    expect(hasPubLeader([{ role: " pub leader ", person: "Ada" }])).toBe(true);
    expect(hasPubLeader([{ role: "Pub Leader", person: null }])).toBe(false);
    expect(hasPubLeader([{ role: "Pub Leader", person: "  " }])).toBe(false);
    expect(hasPubLeader([{ role: "Ops Lead", person: "Bob" }])).toBe(false);
    expect(hasPubLeader([])).toBe(false);
  });
});

describe("describeTiming", () => {
  it("reads offsets and weekday anchors", () => {
    expect(describeTiming({ offsetDays: -14, anchorWeekday: null })).toBe("T-14");
    expect(describeTiming({ offsetDays: 5, anchorWeekday: null })).toBe("T+5");
    expect(describeTiming({ offsetDays: 0, anchorWeekday: null })).toBe("T-0");
    expect(describeTiming({ offsetDays: null, anchorWeekday: 1 })).toBe("Monday of event week");
    expect(describeTiming({ offsetDays: null, anchorWeekday: null })).toBe("No set date");
  });
});

describe.skipIf(!databaseUrl)("event checklist workflow", () => {
  let admin: Sql;
  let sql: Sql;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 4, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  const due = async (eventId: string, key: string) => {
    const task = (await listTasks(sql, { eventIds: [eventId] })).find((t) => t.templateItemKey === key);
    return task ? { due: task.dueDate, owner: task.owner } : undefined;
  };

  describe("generateEventChecklist", () => {
    it("gives an event dated tasks owned by its Pub Leader", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Gen" }), "u");
      const result = await generateEventChecklist(sql, id);
      expect(result!.created).toBeGreaterThan(20);
      expect(result!.moduleKeys).toEqual([]);
      expect(await due(id, "po")).toEqual({ due: "2026-10-12", owner: "Alice" }); // T-10
      expect(await due(id, "whatsapp-monday")).toEqual({ due: "2026-10-19", owner: "Alice" }); // Monday of that week
    });

    it("is safe to run twice", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Twice" }), "u");
      const first = await generateEventChecklist(sql, id);
      const second = await generateEventChecklist(sql, id);
      expect(second!.created).toBe(0);
      expect((await listTasks(sql, { eventIds: [id] })).length).toBe(first!.created);
    });

    it("is safe to run at the same time", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Parallel" }), "u");
      const results = await Promise.all([generateEventChecklist(sql, id), generateEventChecklist(sql, id), generateEventChecklist(sql, id)]);
      const total = results.reduce((sum, r) => sum + r!.created, 0);
      expect((await listTasks(sql, { eventIds: [id] })).length).toBe(total);
    });

    it("suggests the club collab module for partner clubs and makes one set of tasks per club", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Collab", partnerClubs: ["Ski Club", "Chess Club"] }), "u");
      const result = await generateEventChecklist(sql, id);
      expect(result!.moduleKeys).toEqual(["club-collab"]);
      const tasks = await listTasks(sql, { eventIds: [id] });
      expect(tasks.filter((t) => t.partner === "Ski Club").length).toBeGreaterThan(0);
      expect(tasks.filter((t) => t.partner === "Chess Club").length).toBe(tasks.filter((t) => t.partner === "Ski Club").length);
    });

    it("adds only what's new when a partner club is added later", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Later", partnerClubs: ["Ski Club"] }), "u");
      await generateEventChecklist(sql, id);
      const before = (await listTasks(sql, { eventIds: [id] })).length;
      await updatePlannedEvent(sql, id, input({ title: "Later", partnerClubs: ["Ski Club", "Chess Club"] }));
      const result = await generateEventChecklist(sql, id);
      const perClub = (await listTasks(sql, { eventIds: [id] })).filter((t) => t.partner === "Chess Club").length;
      expect(result!.created).toBe(perClub);
      expect((await listTasks(sql, { eventIds: [id] })).length).toBe(before + perClub);
    });

    it("takes extra modules on request, ignores unknown ones, and keeps modules it already has", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Mods" }), "u");
      const first = await generateEventChecklist(sql, id, { moduleKeys: ["singles", "no-such-module"] });
      expect(first!.moduleKeys).toEqual(["singles"]);
      const second = await generateEventChecklist(sql, id, { moduleKeys: ["international"] });
      expect(second!.moduleKeys).toEqual(["international", "singles"]);
    });

    it("gives an undated event undated tasks, which get dates when it is scheduled", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Undated", eventDate: null }), "u");
      await generateEventChecklist(sql, id);
      expect((await due(id, "po"))!.due).toBeNull();
      expect((await due(id, "whatsapp-monday"))!.due).toBeNull(); // anchored to a weekday, so it needs a date
      await updatePlannedEvent(sql, id, input({ title: "Undated", eventDate: "2026-11-05" }));
      expect((await due(id, "po"))!.due).toBe("2026-10-26");
      expect((await due(id, "whatsapp-monday"))!.due).toBe("2026-11-02");
    });

    it("owners fall back to 'Unassigned' with nobody named", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Nobody", roles: [] }), "u");
      await generateEventChecklist(sql, id);
      expect((await due(id, "po"))!.owner).toBe("Unassigned");
    });

    it("returns null for an unknown event", async () => {
      expect(await generateEventChecklist(sql, "00000000-0000-4000-8000-000000000000")).toBeNull();
      expect(await generateEventChecklist(sql, "nope")).toBeNull();
    });
  });

  describe("moving an event through updatePlannedEvent", () => {
    it("moves its tasks with it and recomputes weekday-anchored ones", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Move", eventDate: "2026-10-22" }), "u"); // Thursday
      await generateEventChecklist(sql, id);
      expect((await due(id, "po"))!.due).toBe("2026-10-12");
      expect((await due(id, "whatsapp-monday"))!.due).toBe("2026-10-19");

      await updatePlannedEvent(sql, id, input({ title: "Move", eventDate: "2026-10-30" })); // Friday, a week later
      expect((await getPlannedEvent(sql, id))!.eventDate).toBe("2026-10-30");
      expect((await due(id, "po"))!.due).toBe("2026-10-20");
      expect((await due(id, "whatsapp-monday"))!.due).toBe("2026-10-26"); // Monday of the new week
      const stored = await sql`SELECT 1 FROM tasks WHERE event_id = ${id} AND due_date IS NOT NULL`;
      expect(stored.length).toBe(0);
    });

    it("doesn't recompute a done weekday-anchored task", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Done", eventDate: "2026-10-22" }), "u"); // Thursday
      await generateEventChecklist(sql, id);
      const monday = (await listTasks(sql, { eventIds: [id] })).find((t) => t.templateItemKey === "whatsapp-monday")!;
      expect(monday.offsetDays).toBe(-3);
      await updateTask(sql, monday.id, { status: "done" });
      await updatePlannedEvent(sql, id, input({ title: "Done", eventDate: "2026-10-23" })); // Friday: an unfinished one would become -4
      const after = (await listTasks(sql, { eventIds: [id] })).find((t) => t.templateItemKey === "whatsapp-monday")!;
      expect(after.offsetDays).toBe(-3);
      const po = (await listTasks(sql, { eventIds: [id] })).find((t) => t.templateItemKey === "po")!;
      expect(po.dueDate).toBe("2026-10-13");
    });

    it("saving without a date change changes no task", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Same" }), "u");
      await generateEventChecklist(sql, id);
      const before = JSON.stringify(await listTasks(sql, { eventIds: [id] }));
      await updatePlannedEvent(sql, id, input({ title: "Same", venue: "Houston Hall" }));
      expect(JSON.stringify(await listTasks(sql, { eventIds: [id] }))).toBe(before);
    });

    it("an unknown event is still false", async () => {
      expect(await updatePlannedEvent(sql, "00000000-0000-4000-8000-000000000000", input())).toBe(false);
    });
  });

  describe("step 19 exit test: two overlapping events", () => {
    it("each event gets its own dates and owners, and moving one leaves the other alone", async () => {
      const a = await createPlannedEvent(sql, input({ title: "Event A", eventDate: "2026-12-03", roles: [{ role: "Pub Leader", person: "Ada" }], partnerClubs: ["Ski Club"] }), "u");
      const b = await createPlannedEvent(sql, input({ title: "Event B", eventDate: "2026-12-10", roles: [{ role: "Pub Leader", person: "Bea" }] }), "u");
      await generateEventChecklist(sql, a);
      await generateEventChecklist(sql, b);

      // A's T-10 lands in B's T-17 window: same calendar day, different tasks and owners.
      expect(await due(a, "po")).toEqual({ due: "2026-11-23", owner: "Ada" });
      expect(await due(b, "po")).toEqual({ due: "2026-11-30", owner: "Bea" });
      expect((await due(a, "whatsapp-monday"))!.due).toBe("2026-11-30");
      expect((await due(b, "whatsapp-monday"))!.due).toBe("2026-12-07");
      expect((await listTasks(sql, { eventIds: [a] })).every((t) => t.owner === "Ada")).toBe(true);
      expect((await listTasks(sql, { eventIds: [b] })).every((t) => t.owner === "Bea")).toBe(true);

      // The cross-event view for one week shows both events' tasks, each with its own owner.
      const week = await listTasks(sql, { eventIds: [a, b], from: "2026-11-30", to: "2026-12-06" });
      expect(new Set(week.map((t) => t.eventId))).toEqual(new Set([a, b]));
      for (const t of week) expect(t.owner).toBe(t.eventId === a ? "Ada" : "Bea");
      expect(week.map((t) => t.dueDate)).toEqual([...week.map((t) => t.dueDate)].sort());

      // Moving A by a week doesn't touch B.
      const bBefore = JSON.stringify(await listTasks(sql, { eventIds: [b] }));
      await updatePlannedEvent(sql, a, input({ title: "Event A", eventDate: "2026-12-10", roles: [{ role: "Pub Leader", person: "Ada" }], partnerClubs: ["Ski Club"] }));
      expect((await due(a, "po"))!.due).toBe("2026-11-30");
      expect(JSON.stringify(await listTasks(sql, { eventIds: [b] }))).toBe(bBefore);
    });
  });

  describe("board data", () => {
    it("reports readiness per event and area, ignoring skipped tasks", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Ready", eventDate: "2027-01-14" }), "u");
      await generateEventChecklist(sql, id);
      const tasks = await listTasks(sql, { eventIds: [id] });
      const finance = tasks.filter((t) => t.area === "finance");
      await updateTask(sql, finance[0]!.id, { status: "done" });
      await updateTask(sql, finance[1]!.id, { status: "skipped" });

      const me = (await eventReadiness(sql)).find((e) => e.eventId === id)!;
      expect(me.total).toBe(tasks.length - 1);
      expect(me.done).toBe(1);
      expect(me.areas.find((a) => a.area === "finance")).toEqual({ area: "finance", total: finance.length - 1, done: 1 });
      expect(me.noPubLeader).toBe(false);
      expect(me.areas.reduce((n, a) => n + a.total, 0)).toBe(me.total);
    });

    it("flags upcoming events with no Pub Leader, not past, cancelled, or led ones", async () => {
      const none = await createPlannedEvent(sql, input({ title: "No leader", eventDate: "2027-03-04", roles: [{ role: "Ops Lead", person: "Bob" }] }), "u");
      const blank = await createPlannedEvent(sql, input({ title: "Blank leader", eventDate: "2027-03-05", roles: [{ role: "Pub Leader", person: null }] }), "u");
      const undated = await createPlannedEvent(sql, input({ title: "Undated, no leader", eventDate: null, roles: [] }), "u");
      const led = await createPlannedEvent(sql, input({ title: "Led", eventDate: "2027-03-06" }), "u");
      const past = await createPlannedEvent(sql, input({ title: "Past", eventDate: "2020-01-01", roles: [] }), "u");
      const off = await createPlannedEvent(sql, input({ title: "Off", eventDate: "2027-03-07", roles: [], cancelled: true }), "u");
      const flagged = await eventsWithoutLeader(sql, "2027-01-01");
      expect(flagged).toEqual(expect.arrayContaining([none, blank, undated]));
      for (const id of [led, past, off]) expect(flagged).not.toContain(id);
      await expect(eventsWithoutLeader(sql, "01/01/2027")).rejects.toThrow(RangeError);
    });
  });

  describe("template versions", () => {
    it("reverting copies an older version into a new latest one, leaving events on theirs", async () => {
      const id = await createPlannedEvent(sql, input({ title: "Pinned" }), "u");
      await generateEventChecklist(sql, id);
      const v1 = (await listTemplateVersions(sql)).find((v) => v.version === 1)!;
      expect(v1.items).toBe(PUB_TEMPLATE_V1.items.length);

      const newId = await revertTemplate(sql, v1.versionId);
      expect(newId).not.toBeNull();
      const versions = await listTemplateVersions(sql);
      expect(versions[0]).toMatchObject({ versionId: newId, revertedFrom: 1, note: "Reverted to version 1", items: v1.items });
      const copy = (await getTemplate(sql))!;
      const original = (await getTemplate(sql, v1.versionId))!;
      expect(copy.items).toEqual(original.items);
      expect(copy.modules).toEqual(original.modules);
      expect(copy.issues.map((i) => i.text)).toEqual(original.issues.map((i) => i.text));

      // The event stays on version 1; a new event gets the new one.
      expect(await generateEventChecklist(sql, id)).toMatchObject({ versionId: v1.versionId, created: 0 });
      const fresh = await createPlannedEvent(sql, input({ title: "Fresh" }), "u");
      expect((await generateEventChecklist(sql, fresh))!.versionId).toBe(newId);
    });

    it("two reverts at once get different version numbers", async () => {
      const v = (await listTemplateVersions(sql))[0]!;
      const [x, y] = await Promise.all([revertTemplate(sql, v.versionId), revertTemplate(sql, v.versionId)]);
      expect(x).not.toBe(y);
      const numbers = (await listTemplateVersions(sql)).map((s) => s.version);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it("an unknown version is null", async () => {
      expect(await revertTemplate(sql, 999999)).toBeNull();
      expect(await revertTemplate(sql, 1.5)).toBeNull();
    });

    it("resolves and reopens a known issue", async () => {
      const issue = (await getTemplate(sql))!.issues[0]!;
      expect(await setTemplateIssueStatus(sql, issue.id, "resolved")).toBe(true);
      expect((await getTemplate(sql))!.issues.find((i) => i.id === issue.id)!.status).toBe("resolved");
      expect(await setTemplateIssueStatus(sql, issue.id, "open")).toBe(true);
      expect(await setTemplateIssueStatus(sql, 999999, "resolved")).toBe(false);
    });
  });
});
