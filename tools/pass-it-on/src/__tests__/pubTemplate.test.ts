// The Pub template: its own consistency (pure), the tasks it generates, and
// storing/loading it against throwaway schemas (skipped without a database).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { categoryOf, generateTasks } from "../checklist.js";
import { PUB_TEMPLATE_V1, PUB_TEMPLATE_V2, ensureTemplate, getTemplate } from "../pubTemplate.js";
import { ROLE_SLOTS } from "../roles.js";

const ASSUMED = [
  "group-chat",
  "tabling",
  "collab-reminder",
  "singles-schools",
  "singles-logo",
  "singles-newsletter",
  "singles-eventbrite",
  "singles-gapsa-review",
  "intl-outreach",
  "intl-followup",
];

const item = (key: string) => {
  const found = PUB_TEMPLATE_V1.items.find((i) => i.key === key);
  if (!found) throw new Error(`No template item ${key}`);
  return found;
};

const itemV2 = (key: string) => {
  const found = PUB_TEMPLATE_V2.items.find((i) => i.key === key);
  if (!found) throw new Error(`No v2 template item ${key}`);
  return found;
};

describe("template version 2", () => {
  it("has the club-collab and non-wharton modules, and is internally consistent", () => {
    expect(PUB_TEMPLATE_V2.source).toBe("pub-v2");
    expect(PUB_TEMPLATE_V1.source).toBe("pub-v1");
    expect(PUB_TEMPLATE_V2.note).toBe("Roles on every item; Non-Wharton schools module replaces Singles and International");
    expect(PUB_TEMPLATE_V2.modules.map((m) => m.key)).toEqual(["club-collab", "non-wharton"]);
    expect(PUB_TEMPLATE_V2.modules.find((m) => m.key === "non-wharton")).toEqual({
      key: "non-wharton",
      name: "Non-Wharton schools",
      description: "Events open to students from other schools: Eventbrite ticketing, GAPSA and outreach.",
    });
    const keys = PUB_TEMPLATE_V2.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of PUB_TEMPLATE_V2.items) {
      if (i.parentKey !== null) expect(keys, `${i.key} parent`).toContain(i.parentKey);
      if (i.moduleKey !== null) expect(["club-collab", "non-wharton"], `${i.key} module`).toContain(i.moduleKey);
    }
    expect(PUB_TEMPLATE_V2.items.map((i) => i.sort)).toEqual(PUB_TEMPLATE_V2.items.map((_, n) => n * 10));
    expect(PUB_TEMPLATE_V2.issues.map((i) => i.itemKey)).toEqual(["po"]);
  });

  it("moves the five singles items into non-wharton and drops the international ones", () => {
    const nonWharton = PUB_TEMPLATE_V2.items.filter((i) => i.moduleKey === "non-wharton").map((i) => i.key);
    expect(nonWharton).toEqual(["nonwharton-schools", "nonwharton-logo", "nonwharton-newsletter", "nonwharton-eventbrite", "nonwharton-gapsa-review"]);
    expect(itemV2("nonwharton-schools").title).toBe(item("singles-schools").title);
    expect(itemV2("nonwharton-gapsa-review").title).toBe(item("singles-gapsa-review").title);
    expect(PUB_TEMPLATE_V2.items.some((i) => i.key.startsWith("intl-") || i.key.startsWith("singles-"))).toBe(false);
    expect(PUB_TEMPLATE_V2.items.some((i) => i.key === "po")).toBe(true);
  });

  it("gives every item a role from the slots, by the rule table", () => {
    for (const i of PUB_TEMPLATE_V2.items) expect(ROLE_SLOTS as readonly (string | null)[], i.key).toContain(i.defaultRole);
    const role = (key: string) => itemV2(key).defaultRole;
    expect(role("flyer")).toBe("Marketing Lead");
    expect(role("whatsapp-day")).toBe("Marketing Lead");
    expect(role("budget")).toBe("Finance Lead");
    expect(role("receipts")).toBe("Finance Lead");
    expect(role("dj")).toBe("Entertainment Lead");
    expect(role("food-order")).toBe("Ops Lead");
    expect(role("confirm-food")).toBe("Pub Leader 1");
    expect(role("nonwharton-eventbrite")).toBe("Ops Lead");
    expect(role("nonwharton-gapsa-review")).toBe("Finance Lead");
    expect(role("collab-rider")).toBe("Pub Leader 1"); // partners area
    expect(role("event-folder")).toBe("Pub Leader 1"); // general area
    expect(role("partnerships")).toBe("Prez Owner");
    expect(role("membership-specials")).toBe("Prez Owner");
  });

  it("gives Pub Leader 1 more items than any other role", () => {
    const counts = new Map<string, number>();
    for (const i of PUB_TEMPLATE_V2.items) counts.set(i.defaultRole!, (counts.get(i.defaultRole!) ?? 0) + 1);
    const pub = counts.get("Pub Leader 1") ?? 0;
    for (const [role, n] of counts) if (role !== "Pub Leader 1") expect(pub, `${role} has ${n}`).toBeGreaterThan(n);
  });
});

describe("the Pub template data", () => {
  it("the template is internally consistent", () => {
    const { items, modules } = PUB_TEMPLATE_V1;
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const moduleKeys = new Set(modules.map((m) => m.key));
    expect([...moduleKeys].sort()).toEqual(["club-collab", "international", "singles"]);
    for (const i of items) {
      if (i.parentKey !== null) expect(keys, `${i.key} parent`).toContain(i.parentKey);
      if (i.moduleKey !== null) expect(moduleKeys.has(i.moduleKey), `${i.key} module`).toBe(true);
      expect(i.offsetDays !== null && i.anchorWeekday !== null, `${i.key} offset and anchor`).toBe(false);
      if (i.repeatFor !== null) expect(i.moduleKey, `${i.key} repeat`).not.toBeNull();
    }
    const assumed = items.filter((i) => i.notes?.includes("Assumed: confirm")).map((i) => i.key);
    expect(assumed.sort()).toEqual([...ASSUMED].sort());
    expect(items.map((i) => i.sort)).toEqual(items.map((_, n) => n * 10));
  });

  it("has the dated items from the Halloween checklist", () => {
    expect(item("flyer").offsetDays).toBe(-14);
    expect(item("po").offsetDays).toBe(-10);
    expect(item("budget").offsetDays).toBe(-7);
    expect(item("partiful").offsetDays).toBe(-7);
    expect(item("campusgroups").offsetDays).toBe(-7);
    expect(item("food-order").offsetDays).toBe(-7);
    expect(item("whatsapp-monday").anchorWeekday).toBe(1);
    expect(item("whatsapp-monday").offsetDays).toBeNull();
    expect(item("whatsapp-day").offsetDays).toBe(0);
    for (const key of ["attendance", "feedback", "receipts", "postmortem"]) {
      expect(item(key).offsetDays).toBe(5);
    }
    expect(item("postmortem").isPostmortem).toBe(true);
    expect(PUB_TEMPLATE_V1.items.filter((i) => i.isPostmortem)).toHaveLength(1);
  });

  it("puts day_of, during and post items in the run of show category", () => {
    for (const i of PUB_TEMPLATE_V1.items) {
      expect(i.phase).toBeTruthy();
      expect(i.area).toBeTruthy();
      expect(categoryOf(i.phase)).toBe(i.phase === "pre" ? "planning" : "run_of_show");
    }
    expect(categoryOf(item("whatsapp-day").phase)).toBe("run_of_show");
    expect(categoryOf(item("during-food").phase)).toBe("run_of_show");
    expect(categoryOf(item("receipts").phase)).toBe("run_of_show");
    expect(categoryOf(item("flyer").phase)).toBe("planning");
  });

  it("generates per-club tasks for a Thursday event", () => {
    const event = { eventDate: "2026-11-12", roles: [], roleDefaults: [], partnerClubs: ["Ski Club", "Food Club"] };
    const drafts = generateTasks(PUB_TEMPLATE_V1.items, ["club-collab"], event);
    const byKey = new Map(drafts.map((d) => [d.templateItemKey, d]));
    expect(byKey.get("collab-upload:ski-club")?.offsetDays).toBe(-2);
    expect(byKey.get("collab-transfer:food-club")?.offsetDays).toBe(5);
    expect(byKey.get("collab-upload:ski-club")?.title).toBe(
      "Ski Club: upload members to CampusGroups with free tickets",
    );
    expect(byKey.get("whatsapp-monday")?.offsetDays).toBe(-3);
    expect(byKey.has("collab-report")).toBe(true);
    expect(byKey.has("checkin-qr")).toBe(true);

    const none = generateTasks(PUB_TEMPLATE_V1.items, ["club-collab"], { ...event, partnerClubs: [] });
    expect(none.filter((d) => d.templateItemKey.startsWith("collab-") && d.templateItemKey.includes(":"))).toEqual([]);
    expect(none.some((d) => d.templateItemKey === "collab-report")).toBe(true);
  });
});

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");

describe.skipIf(!databaseUrl)("storing the template", () => {
  const made: string[] = [];
  const open: Sql[] = [];
  let admin: Sql;

  // A fresh throwaway schema with the tool's tables, and a client on it.
  const clientOn = (name: string, max: number): Sql => {
    const client = postgres(databaseUrl!, { max, onnotice: () => {}, connection: { search_path: name } });
    open.push(client);
    return client;
  };
  const schemaNames = new WeakMap<Sql, string>();
  const freshSchema = async (): Promise<Sql> => {
    const name = `passiton_tpl_test_${Date.now()}_${made.length}`;
    made.push(name);
    await admin.unsafe(`CREATE SCHEMA ${name}`);
    const client = clientOn(name, 1);
    schemaNames.set(client, name);
    await client.unsafe(schemaSql);
    return client;
  };

  beforeAll(() => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  });

  afterAll(async () => {
    for (const client of open) await client.end();
    for (const name of made) await admin.unsafe(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    await admin.end();
  });

  it("getTemplate returns null when there is no template", async () => {
    const sql = await freshSchema();
    expect(await getTemplate(sql)).toBeNull();
  });

  it("ensureTemplate inserts versions 1 and 2 once and returns version 2's id on a repeat call", async () => {
    const sql = await freshSchema();
    const id = await ensureTemplate(sql);
    expect(await ensureTemplate(sql)).toBe(id);
    const versions = await sql<{ id: string; version: number; source: string | null }[]>`
      SELECT id, version, source FROM template_versions ORDER BY version`;
    expect(versions.map((v) => [v.version, v.source])).toEqual([[1, "pub-v1"], [2, "pub-v2"]]);
    expect(id).toBe(Number(versions[1]!.id));
    const [items] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM template_items`;
    expect(items!.n).toBe(PUB_TEMPLATE_V1.items.length + PUB_TEMPLATE_V2.items.length);
    const [issues] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM template_issues`;
    expect(issues!.n).toBe(2);
  });

  it("a database with version 1 and a revert copy gets the built-in v2 as version 3", async () => {
    const sql = await freshSchema();
    // Version 1 as an older deploy left it (no source column value yet), then a revert copy as version 2.
    await sql`INSERT INTO template_versions (version, note) VALUES (1, 'old')`;
    await sql.unsafe(schemaSql); // the schema's UPDATE marks version 1 as pub-v1
    await sql`INSERT INTO template_versions (version, note, reverted_from) VALUES (2, 'Reverted to version 1', 1)`;
    await ensureTemplate(sql);
    const versions = await sql<{ version: number; source: string | null }[]>`SELECT version, source FROM template_versions ORDER BY version`;
    expect(versions.map((v) => [v.version, v.source])).toEqual([[1, "pub-v1"], [2, null], [3, "pub-v2"]]);
  });

  it("three ensureTemplate calls at once leave exactly one pub-v2", async () => {
    const setup = await freshSchema();
    const name = schemaNames.get(setup)!;
    const clients = [clientOn(name, 2), clientOn(name, 2), clientOn(name, 2)];
    const ids = await Promise.all(clients.map((c) => ensureTemplate(c)));
    expect(new Set(ids).size).toBe(1);
    const rows = await setup<{ source: string }[]>`SELECT source FROM template_versions ORDER BY version`;
    expect(rows.map((r) => r.source)).toEqual(["pub-v1", "pub-v2"]);
  });

  it("two overlapping ensureTemplate calls on separate connections insert each version once", async () => {
    const setup = await freshSchema();
    const name = schemaNames.get(setup)!;
    // Two clients, so the transactions really overlap on the unique version.
    const [a, b] = [clientOn(name, 2), clientOn(name, 2)];
    const [idA, idB] = await Promise.all([ensureTemplate(a), ensureTemplate(b)]);
    expect(idA).toBe(idB);

    const count = async (table: string) =>
      (await setup.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${table}`))[0]!.n;
    const versions = await setup<{ id: string }[]>`SELECT id FROM template_versions WHERE version = 2`;
    expect(versions.map((v) => Number(v.id))).toEqual([idA]);
    expect(await count("template_versions")).toBe(2);
    expect(await count("template_items")).toBe(PUB_TEMPLATE_V1.items.length + PUB_TEMPLATE_V2.items.length);
    expect(await count("template_modules")).toBe(PUB_TEMPLATE_V1.modules.length + PUB_TEMPLATE_V2.modules.length);
    expect(await count("template_issues")).toBe(2);
  });

  it("getTemplate returns what was inserted", async () => {
    const sql = await freshSchema();
    const latest = await ensureTemplate(sql);
    expect((await getTemplate(sql))!.versionId).toBe(latest);
    const [one] = await sql<{ id: string }[]>`SELECT id FROM template_versions WHERE version = 1`;
    const id = Number(one!.id);
    const loaded = await getTemplate(sql, id);
    expect(loaded).not.toBeNull();
    expect(loaded!.versionId).toBe(id);
    expect(loaded!.version).toBe(1);
    expect(loaded!.note).toBe(PUB_TEMPLATE_V1.note);
    expect(loaded!.items).toEqual(PUB_TEMPLATE_V1.items);
    expect(loaded!.modules).toEqual(PUB_TEMPLATE_V1.modules);
    expect(loaded!.issues).toHaveLength(1);
    expect(loaded!.issues[0]).toMatchObject({ itemKey: "po", status: "open", text: PUB_TEMPLATE_V1.issues[0]!.text });
    expect(await getTemplate(sql, id)).toEqual(loaded);
    expect(await getTemplate(sql, id + 1000)).toBeNull();
  });
});
