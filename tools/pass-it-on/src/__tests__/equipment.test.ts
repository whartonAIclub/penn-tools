import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { createPlannedEvent, updatePlannedEvent, getPlannedEvent, checkPlannedEventInput } from "../planning.js";
import type { PlannedEventInput } from "../planning.js";
import { MAX_EQUIPMENT } from "../equipment.js";
import { listTasks, updateTask } from "../tasks.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_equipment_test_${Date.now()}`;

describe("checkPlannedEventInput equipment", () => {
  const check = (extra: Record<string, unknown>) => checkPlannedEventInput({ title: "Pub", ...extra });

  it("treats missing fields as no equipment", () => {
    expect(check({})).toMatchObject({ ok: true, value: { needsEquipment: false, equipment: [] } });
  });

  it("splits a string on newlines, trims, drops blanks and case-insensitive repeats", () => {
    expect(check({ needsEquipment: true, equipment: "Fog machine\n\n fog machine \nFog-machine" }))
      .toMatchObject({ ok: true, value: { needsEquipment: true, equipment: ["Fog machine", "Fog-machine"] } });
  });

  it("accepts an array, and gives [] when the box is unchecked", () => {
    expect(check({ needsEquipment: true, equipment: [" Projector ", "", "projector"] })).toMatchObject({ value: { equipment: ["Projector"] } });
    expect(check({ needsEquipment: false, equipment: "Projector" })).toMatchObject({ value: { needsEquipment: false, equipment: [] } });
  });

  it("rejects too many lines, too long a line, and a non-text list", () => {
    expect(MAX_EQUIPMENT).toBe(20);
    const many = Array.from({ length: 21 }, (_, i) => `Item ${i}`);
    expect(check({ needsEquipment: true, equipment: many.join("\n") })).toMatchObject({ ok: false });
    expect(check({ needsEquipment: true, equipment: many.slice(0, 20) })).toMatchObject({ ok: true });
    expect(check({ needsEquipment: true, equipment: "x".repeat(201) })).toMatchObject({ ok: false });
    expect(check({ needsEquipment: true, equipment: "x".repeat(200) })).toMatchObject({ ok: true });
    expect(check({ needsEquipment: true, equipment: 5 })).toMatchObject({ ok: false });
  });
});

const input = (over: Partial<PlannedEventInput> = {}): PlannedEventInput => ({
  title: "Equip",
  eventDate: "2026-12-03",
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

describe.skipIf(!databaseUrl)("equipment tasks in the database", () => {
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

  const equipmentTasks = async (id: string) =>
    (await listTasks(sql, { eventIds: [id] })).filter((t) => t.templateItemKey?.startsWith("equipment"));
  const keys = async (id: string) => (await equipmentTasks(id)).map((t) => t.templateItemKey).sort();

  it("creates a source task per item and one return task, owned by the Ops Lead default", async () => {
    const id = await createPlannedEvent(sql, input({ needsEquipment: true, equipment: ["Fog machine", "Projector"] }), "u");
    expect(await getPlannedEvent(sql, id)).toMatchObject({ needsEquipment: true, equipment: ["Fog machine", "Projector"] });
    const tasks = await equipmentTasks(id);
    expect(tasks.map((t) => t.templateItemKey).sort()).toEqual(["equipment-return", "equipment:fog-machine", "equipment:projector"]);
    const fog = tasks.find((t) => t.templateItemKey === "equipment:fog-machine")!;
    expect(fog).toMatchObject({ title: "Arrange: Fog machine", phase: "pre", area: "operations", owner: "Michael", ownerRole: "Ops Lead", source: "manual", dueDate: "2026-11-26" });
    const back = tasks.find((t) => t.templateItemKey === "equipment-return")!;
    expect(back).toMatchObject({ title: "Return rented or borrowed equipment", phase: "post", area: "operations", owner: "Michael", ownerRole: "Ops Lead", dueDate: "2026-12-04" });
  });

  it("removing a line deletes its unfinished task, but a done one stays", async () => {
    const id = await createPlannedEvent(sql, input({ title: "Remove", needsEquipment: true, equipment: ["Fog machine", "Projector"] }), "u");
    await updatePlannedEvent(sql, id, input({ title: "Remove", needsEquipment: true, equipment: ["Fog machine"] }));
    expect(await keys(id)).toEqual(["equipment-return", "equipment:fog-machine"]);

    const id2 = await createPlannedEvent(sql, input({ title: "Remove done", needsEquipment: true, equipment: ["Fog machine", "Projector"] }), "u");
    const projector = (await equipmentTasks(id2)).find((t) => t.templateItemKey === "equipment:projector")!;
    await updateTask(sql, projector.id, { status: "done" });
    await updatePlannedEvent(sql, id2, input({ title: "Remove done", needsEquipment: true, equipment: ["Fog machine"] }));
    expect(await keys(id2)).toEqual(["equipment-return", "equipment:fog-machine", "equipment:projector"]);
  });

  it("editing a line's text swaps the unfinished task", async () => {
    const id = await createPlannedEvent(sql, input({ title: "Edit", needsEquipment: true, equipment: ["Projector"] }), "u");
    await updatePlannedEvent(sql, id, input({ title: "Edit", needsEquipment: true, equipment: ["Big projector"] }));
    expect(await keys(id)).toEqual(["equipment-return", "equipment:big-projector"]);
  });

  it("unchecking removes every unfinished equipment task, and re-saving adds none twice", async () => {
    const id = await createPlannedEvent(sql, input({ title: "Uncheck", needsEquipment: true, equipment: ["Fog machine"] }), "u");
    await updatePlannedEvent(sql, id, input({ title: "Uncheck", needsEquipment: true, equipment: ["Fog machine"] }));
    expect(await keys(id)).toEqual(["equipment-return", "equipment:fog-machine"]);
    await updatePlannedEvent(sql, id, input({ title: "Uncheck", needsEquipment: false, equipment: ["Fog machine"] }));
    expect(await keys(id)).toEqual([]);
    expect(await getPlannedEvent(sql, id)).toMatchObject({ needsEquipment: false });
  });

  it("two names with one slug get -2, and the return task follows the items", async () => {
    const checked = checkPlannedEventInput({ ...input(), title: "Slugs", needsEquipment: true, equipment: "Fog machine\n\n fog machine \nFog-machine" });
    if (!checked.ok) throw new Error(checked.message);
    const id = await createPlannedEvent(sql, checked.value, "u");
    expect(await keys(id)).toEqual(["equipment-return", "equipment:fog-machine", "equipment:fog-machine-2"]);
  });

  it("moving the date moves the tasks", async () => {
    const id = await createPlannedEvent(sql, input({ title: "Move", needsEquipment: true, equipment: ["Fog machine"] }), "u");
    await updatePlannedEvent(sql, id, input({ title: "Move", eventDate: "2026-12-10", needsEquipment: true, equipment: ["Fog machine"] }));
    const tasks = await equipmentTasks(id);
    expect(tasks.find((t) => t.templateItemKey === "equipment:fog-machine")!.dueDate).toBe("2026-12-03");
    expect(tasks.find((t) => t.templateItemKey === "equipment-return")!.dueDate).toBe("2026-12-11");
  });

  it("an Ops Lead set later moves the tasks to them", async () => {
    const id = await createPlannedEvent(sql, input({ title: "Ops later", needsEquipment: true, equipment: ["Fog machine"] }), "u");
    expect((await equipmentTasks(id))[0]!.owner).toBe("Michael");
    await updatePlannedEvent(sql, id, input({ title: "Ops later", needsEquipment: true, equipment: ["Fog machine"], roles: [{ role: "Pub Leader 1", person: "Alice" }, { role: "Ops Lead", person: "Ivana" }] }));
    for (const t of await equipmentTasks(id)) expect(t.owner).toBe("Ivana");
  });
});
