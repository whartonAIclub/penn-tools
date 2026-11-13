import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { ROLE_SLOTS, canonicalRole, normalizeRoles, isPubLeaderRole, resolveOwner, setRoleDefault, setEventRole, listRoleAssignments } from "../roles.js";
import type { RoleDefault } from "../roles.js";
import { createPlannedEvent, updatePlannedEvent, getPlannedEvent } from "../planning.js";
import type { PlannedEventInput } from "../planning.js";
import { generateEventChecklist } from "../eventChecklist.js";
import { createEventTasks, listTasks, updateTask } from "../tasks.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_roles_test_${Date.now()}`;

describe("canonicalRole", () => {
  it("maps variants to slots", () => {
    expect(canonicalRole(" c-suite owner ")).toBe("CoS Owner");
    expect(canonicalRole("Chief of Staff")).toBe("CoS Owner");
    expect(canonicalRole("President owner")).toBe("Prez Owner");
    expect(canonicalRole("ops")).toBe("Ops Lead");
    expect(canonicalRole("pub leader 2")).toBe("Pub Leader 2");
    expect(canonicalRole("Marketing")).toBe("Marketing Lead");
    expect(canonicalRole("Club contact")).toBe("Club contact"); // unknown: kept, trimmed
  });

  it("collapses spaces and leaves every slot name as itself", () => {
    expect(canonicalRole("  Finance   Lead ")).toBe("Finance Lead");
    for (const slot of ROLE_SLOTS) expect(canonicalRole(slot)).toBe(slot);
  });

  it("keeps an unnumbered Pub Leader as 'Pub Leader'", () => {
    expect(canonicalRole("pub leader")).toBe("Pub Leader");
    expect(canonicalRole("Leader")).toBe("Pub Leader");
  });
});

describe("isPubLeaderRole", () => {
  it("is true for numbered and unnumbered Pub Leaders only", () => {
    expect(isPubLeaderRole("Pub Leader 3")).toBe(true);
    expect(isPubLeaderRole(" pub leader ")).toBe(true);
    expect(isPubLeaderRole("Ops Lead")).toBe(false);
  });
});

describe("normalizeRoles", () => {
  it("numbers unnumbered Pub Leaders in order, after numbered ones", () => {
    expect(normalizeRoles([{ role: "Pub Leader", person: "A" }, { role: "Pub Leader 1", person: "B" }, { role: "pub leader", person: "C" }]))
      .toEqual([{ role: "Pub Leader 1", person: "B" }, { role: "Pub Leader 2", person: "A" }, { role: "Pub Leader 3", person: "C" }]);
  });

  it("merges a slot named twice with '/', keeps 'Diva/Arjun' whole, orders slots first then others", () => {
    expect(normalizeRoles([{ role: "Club contact", person: "Z" }, { role: "Ops", person: "Ivana" }, { role: "Ops Lead", person: "Sam" }, { role: "Prez Owner", person: "Diva/Arjun" }]))
      .toEqual([{ role: "Prez Owner", person: "Diva/Arjun" }, { role: "Ops Lead", person: "Ivana/Sam" }, { role: "Club contact", person: "Z" }]);
  });

  it("a fourth Pub Leader becomes an extra 'Pub Leader' role, not lost", () => {
    const four = ["A", "B", "C", "D"].map((person) => ({ role: "Pub Leader", person }));
    const once = normalizeRoles(four);
    expect(once).toEqual([
      { role: "Pub Leader 1", person: "A" },
      { role: "Pub Leader 2", person: "B" },
      { role: "Pub Leader 3", person: "C" },
      { role: "Pub Leader", person: "D" },
    ]);
    expect(normalizeRoles(once)).toEqual(once); // idempotent
  });

  it("keeps a blank person as null and doesn't repeat a name when merging", () => {
    expect(normalizeRoles([{ role: "Ops", person: null }, { role: "Ops Lead", person: "Sam" }, { role: "ops lead", person: "sam" }]))
      .toEqual([{ role: "Ops Lead", person: "Sam" }]);
    expect(normalizeRoles([{ role: "Finance", person: "  " }])).toEqual([{ role: "Finance Lead", person: null }]);
  });
});

describe("resolveOwner", () => {
  const defaults: RoleDefault[] = [
    { role: "Ops Lead", person: "Michael", alternates: [] },
    { role: "Marketing Lead", person: "Manisha", alternates: ["Kira", "Himanshi"] },
  ];

  it("a holder of the slot wins over the club default", () => {
    expect(resolveOwner("Ops Lead", [{ role: "Ops Lead", person: "Ivana" }], defaults)).toEqual({ owner: "Ivana", ownerRole: "Ops Lead" });
  });

  it("an empty slot falls to the club default", () => {
    expect(resolveOwner("Ops Lead", [{ role: "Ops Lead", person: null }], defaults)).toEqual({ owner: "Michael", ownerRole: "Ops Lead" });
    expect(resolveOwner("Ops Lead", [], defaults).owner).toBe("Michael");
  });

  it("with no default, goes to CoS Owner, then Prez Owner, then Unassigned", () => {
    const roles = [{ role: "Prez Owner", person: "Pat" }, { role: "CoS Owner", person: "Cam" }];
    expect(resolveOwner("Finance Lead", roles, defaults)).toEqual({ owner: "Cam", ownerRole: "Finance Lead" });
    expect(resolveOwner("Finance Lead", [{ role: "Prez Owner", person: "Pat" }], defaults).owner).toBe("Pat");
    expect(resolveOwner("Finance Lead", [], defaults).owner).toBe("Unassigned");
  });

  it("the club default comes before CoS Owner and Prez Owner", () => {
    expect(resolveOwner("Ops Lead", [{ role: "CoS Owner", person: "Cam" }], defaults).owner).toBe("Michael");
    expect(resolveOwner("Ops Lead", [{ role: "Prez Owner", person: "Pat" }], defaults).owner).toBe("Michael");
  });

  it("stores the Pub Leader role asked for, with the same chain for all three", () => {
    expect(resolveOwner("Pub Leader 2", [{ role: "Pub Leader 1", person: "A" }], defaults)).toEqual({ owner: "A", ownerRole: "Pub Leader 2" });
    expect(resolveOwner("Pub Leader 3", [{ role: "Pub Leader 2", person: "B" }], defaults)).toEqual({ owner: "B", ownerRole: "Pub Leader 3" });
    expect(resolveOwner("  ", [], defaults).ownerRole).toBe("Pub Leader 1");
  });

  it("Pub Leader 1 empty goes to Pub Leader 2, then 3, before CoS", () => {
    const roles = [{ role: "Pub Leader 2", person: "Bea" }, { role: "Pub Leader 3", person: "Cy" }, { role: "CoS Owner", person: "Cam" }];
    expect(resolveOwner("Pub Leader 1", roles, defaults)).toEqual({ owner: "Bea", ownerRole: "Pub Leader 1" });
    expect(resolveOwner("Pub Leader 2", [{ role: "Pub Leader 3", person: "Cy" }], defaults).owner).toBe("Cy");
    expect(resolveOwner("Pub Leader 1", [{ role: "CoS Owner", person: "Cam" }], defaults).owner).toBe("Cam");
  });

  it("null behaves as Pub Leader 1", () => {
    expect(resolveOwner(null, [{ role: "Pub Leader 1", person: "Diva" }], defaults)).toEqual({ owner: "Diva", ownerRole: "Pub Leader 1" });
    expect(resolveOwner(null, [], defaults)).toEqual({ owner: "Unassigned", ownerRole: "Pub Leader 1" });
  });

  it("matches roles by canonical name, keeps a two-person cell whole, and ignores case for unknown roles", () => {
    expect(resolveOwner("ops", [{ role: "Ops", person: "Ivana" }], defaults).owner).toBe("Ivana");
    expect(resolveOwner("Prez Owner", [{ role: "President owner", person: "Diva/Arjun" }], defaults).owner).toBe("Diva/Arjun");
    expect(resolveOwner("Treasurer", [{ role: "treasurer", person: "Tess" }], defaults).owner).toBe("Tess");
  });
});

const input = (over: Partial<PlannedEventInput> = {}): PlannedEventInput => ({
  title: "Pub",
  eventDate: "2030-10-22",
  eventTime: null,
  theme: null,
  venue: null,
  budget: null,
  roles: [{ role: "Pub Leader 1", person: "Alice" }],
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
  needsEquipment: false,
  equipment: [],
  ...over,
});

describe.skipIf(!databaseUrl)("role owners in the database", () => {
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

  const task = async (eventId: string, key: string) => (await listTasks(sql, { eventIds: [eventId] })).find((t) => t.templateItemKey === key)!;
  const generated = async (over: Partial<PlannedEventInput> = {}) => {
    const id = await createPlannedEvent(sql, input(over), "u");
    await generateEventChecklist(sql, id);
    return id;
  };

  it("an Ops Lead change moves unfinished role-derived tasks only", async () => {
    const id = await generated({ title: "Ops", roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "Ops Lead", person: "Michael" }] });
    expect((await task(id, "food-order")).owner).toBe("Michael");
    await updateTask(sql, (await task(id, "merch-ready")).id, { status: "done" });
    await updateTask(sql, (await task(id, "catering-tracker")).id, { owner: "Sam" });

    await updatePlannedEvent(sql, id, input({ title: "Ops", roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "Ops Lead", person: "Ivana" }] }));
    expect((await task(id, "food-order")).owner).toBe("Ivana");
    expect((await task(id, "merch-ready")).owner).toBe("Michael");
    const hand = await task(id, "catering-tracker");
    expect(hand.owner).toBe("Sam");
    expect(hand.ownerRole).toBeNull();
  });

  it("clearing the slot falls back to the club default", async () => {
    const id = await generated({ title: "Clear", roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "Ops Lead", person: "Ivana" }] });
    expect((await task(id, "food-order")).owner).toBe("Ivana");
    await updatePlannedEvent(sql, id, input({ title: "Clear", roles: [{ role: "Pub Leader 1", person: "Alice" }] }));
    expect((await task(id, "food-order")).owner).toBe("Michael");
  });

  it("a club default change moves tasks of events with no holder, not those with one", async () => {
    const open = await generated({ title: "Open" });
    const held = await generated({ title: "Held", roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "Marketing Lead", person: "Himanshi" }] });
    await setRoleDefault(sql, "Marketing Lead", "Kira", ["Manisha", "Himanshi"]);
    expect((await task(open, "flyer")).owner).toBe("Kira");
    expect((await task(held, "flyer")).owner).toBe("Himanshi");
  });

  it("setEventRole edits one cell and follows it into tasks", async () => {
    const id = await generated({ title: "Cell" });
    expect(await setEventRole(sql, id, "Pub Leader 1", "Benji")).toBe(true);
    expect((await getPlannedEvent(sql, id))!.pubLeader).toBe("Benji");
    expect((await task(id, "confirm-food")).owner).toBe("Benji");
    expect(await setEventRole(sql, id, "Pub Leader 1", null)).toBe(true);
    const roles = (await getPlannedEvent(sql, id))!.roles;
    expect(roles.some((r) => r.role === "Pub Leader 1")).toBe(false);
    expect(await setEventRole(sql, "00000000-0000-4000-8000-000000000000", "Ops Lead", "X")).toBe(false);
  });

  it("setEventRole collapses duplicate rows for a slot into one", async () => {
    const id = await generated({ title: "Dupes" });
    await sql`DELETE FROM event_roles WHERE event_id = ${id} AND role = 'Ops Lead'`;
    await sql`INSERT INTO event_roles (event_id, position, role, person) VALUES (${id}, 90, 'Ops Lead', 'Old1'), (${id}, 91, 'Ops Lead', 'Old2')`;
    expect(await setEventRole(sql, id, "Ops Lead", "Ivana")).toBe(true);
    const rows = await sql`SELECT person FROM event_roles WHERE event_id = ${id} AND role = 'Ops Lead'`;
    expect(rows.map((r) => r.person)).toEqual(["Ivana"]);
  });

  it("listRoleAssignments leaves out past events and keeps 'Diva/Arjun' whole", async () => {
    const future = await createPlannedEvent(sql, input({ title: "Grid future", eventDate: "2031-05-01", roles: [{ role: "President owner", person: "Diva/Arjun" }] }), "u");
    await createPlannedEvent(sql, input({ title: "Grid past", eventDate: "2020-01-01" }), "u");
    const rows = await listRoleAssignments(sql, { from: "2031-01-01" });
    expect(rows.find((r) => r.title === "Grid past")).toBeUndefined();
    const row = rows.find((r) => r.eventId === future)!;
    expect(row.roles["Prez Owner"]).toBe("Diva/Arjun");
    expect(row.roles["Ops Lead"]).toBeNull();
    expect(typeof row.openTasks).toBe("number");
    expect((await listRoleAssignments(sql, {})).some((r) => r.title === "Grid past")).toBe(true);
  });

  it("skipped and non-role tasks keep their owner when a role holder changes", async () => {
    const id = await generated({ title: "Keep", roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "Ops Lead", person: "Michael" }] });
    await updateTask(sql, (await task(id, "merch-ready")).id, { status: "skipped" });
    await sql`UPDATE tasks SET owner_role = NULL WHERE id = ${(await task(id, "catering-tracker")).id}`;
    await setEventRole(sql, id, "Ops Lead", "Ivana");
    expect((await task(id, "food-order")).owner).toBe("Ivana");
    expect((await task(id, "merch-ready")).owner).toBe("Michael");
    expect((await task(id, "catering-tracker")).owner).toBe("Michael");
  });

  it("clearing a club default falls through to CoS Owner, Prez Owner, then Unassigned", async () => {
    const cos = await generated({ title: "Cos", roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "CoS Owner", person: "Cam" }, { role: "Prez Owner", person: "Pat" }] });
    const prez = await generated({ title: "Prez", roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "Prez Owner", person: "Pat" }] });
    const none = await generated({ title: "None", roles: [{ role: "Pub Leader 1", person: "Alice" }] });
    await setRoleDefault(sql, "Ops Lead", null, []);
    expect((await task(cos, "food-order")).owner).toBe("Cam");
    expect((await task(prez, "food-order")).owner).toBe("Pat");
    expect((await task(none, "food-order")).owner).toBe("Unassigned");
    await setRoleDefault(sql, "Ops Lead", "Michael", []);
  });

  it("createEventTasks resolves role owners from the roles current in the database, not the draft's", async () => {
    const id = await createPlannedEvent(sql, input({ title: "Stale", roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "Ops Lead", person: "Ivana" }] }), "u");
    await createEventTasks(sql, id, [{
      templateItemKey: "stale", parentKey: null, title: "T", phase: "pre", area: "operations", offsetDays: -3,
      owner: "Stale", ownerRole: "Ops Lead", isPostmortem: false, notes: null, timeHint: null, partner: null, source: "template", confirmed: false,
    }]);
    expect((await task(id, "stale")).owner).toBe("Ivana");
  });
});
