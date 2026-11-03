// Storage against a real Postgres: each run creates a throwaway schema from
// schema.sql and drops it afterwards. Skipped when no database is configured
// (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  getContact,
  getProfile,
  listItems,
  removeItem,
  rescoreItems,
  saveItem,
  saveOutreach,
  saveProfile,
  type NewItem,
} from "../storage.js";
import { SAMPLE_PROFILE } from "../samples.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `recruitinghelper_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

function posting(score: number, link: string | null, title = "Partner Manager"): NewItem {
  return {
    kind: "posting",
    company: "Google",
    title,
    roleFit: score,
    reason: "Fits.",
    leadWith: [],
    gaps: [],
    applyBy: null,
    level: null,
    score,
    tier: "target",
    matchedCompany: "Google",
    adjustment: "+1 Target",
    link,
  };
}

function contact(score: number, name: string | null, link: string | null = null): NewItem {
  return {
    kind: "contact",
    link,
    name,
    company: "Google",
    title: "Head of Partnerships",
    relevantRole: true,
    matchedSignals: [],
    hook: "Ask about partnerships.",
    score,
    priority: score >= 4 ? "High" : "Low",
    tier: "target",
    matchedCompany: "Google",
    points: [],
    capped: false,
    schools: [],
    pennAlum: false,
  };
}

describe.skipIf(!databaseUrl)("Recruiting Helper storage (Postgres)", () => {
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

  it("schema.sql can be applied again to an existing schema", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("saves, replaces and returns each user's own profile", async () => {
    expect(await getProfile(sql, "alice")).toBeNull();
    await saveProfile(sql, "alice", SAMPLE_PROFILE);
    await saveProfile(sql, "alice", { ...SAMPLE_PROFILE, targetRoles: "Corp dev" });
    expect((await getProfile(sql, "alice"))?.targetRoles).toBe("Corp dev");
    expect(await getProfile(sql, "bob")).toBeNull();
  });

  it("lists a user's jobs and people together, best score first, and only theirs", async () => {
    await saveItem(sql, "carol", posting(3, null, "Three"));
    await saveItem(sql, "carol", contact(5, "Five Person"));
    await saveItem(sql, "carol", posting(4, null, "Four"));
    await saveItem(sql, "mallory", posting(5, null, "Not Carol's"));

    const items = await listItems(sql, "carol");
    expect(items.map((i) => i.score)).toEqual([5, 4, 3]);
    expect(items.map((i) => i.kind)).toEqual(["contact", "posting", "posting"]);
    expect(items.every((i) => i.id && i.addedAt)).toBe(true);
  });

  it("replaces a repeat of the same posting link or person, and says so", async () => {
    const first = await saveItem(sql, "dave", posting(2, "https://jobs.example.com/1"));
    const again = await saveItem(sql, "dave", posting(4, "https://jobs.example.com/1"));
    expect(first.replaced).toBe(false);
    expect(again.replaced).toBe(true);
    expect(again.item.id).toBe(first.item.id);

    await saveItem(sql, "dave", contact(3, "José O'Neil"));
    expect((await saveItem(sql, "dave", contact(5, "jose oneil"))).replaced).toBe(true);

    // Postings without links are never the same posting.
    await saveItem(sql, "dave", posting(1, null));
    expect((await saveItem(sql, "dave", posting(1, null))).replaced).toBe(false);

    expect((await listItems(sql, "dave")).map((i) => i.score)).toEqual([5, 4, 1, 1]);
  });

  it("keeps a person's LinkedIn link and outreach draft when they're scored again without a link", async () => {
    const { item } = await saveItem(sql, "gus", contact(3, "Pat Lee", "https://www.linkedin.com/in/patlee"));
    expect(await saveOutreach(sql, "gus", item.id, { subject: "Hi", body: "Hello Pat" })).toBe(true);

    const again = await saveItem(sql, "gus", contact(4, "Pat Lee"));
    expect(again.replaced).toBe(true);
    expect(again.item.link).toBe("https://www.linkedin.com/in/patlee");
    expect(again.item.kind === "contact" && again.item.outreach).toEqual({ subject: "Hi", body: "Hello Pat" });

    // A new link replaces the old one.
    const moved = await saveItem(sql, "gus", contact(4, "Pat Lee", "https://www.linkedin.com/in/pat-lee-2"));
    expect(moved.item.link).toBe("https://www.linkedin.com/in/pat-lee-2");
  });

  it("saves outreach drafts only on the user's own people", async () => {
    const { item } = await saveItem(sql, "hal", contact(3, "Sam Roe"));
    expect(await saveOutreach(sql, "mallory", item.id, { subject: "x", body: "y" })).toBe(false);
    expect(await getContact(sql, "mallory", item.id)).toBeNull();
    const posted = await saveItem(sql, "hal", posting(3, "https://jobs.example.com/9"));
    expect(await saveOutreach(sql, "hal", posted.item.id, { subject: "x", body: "y" })).toBe(false);
    expect((await getContact(sql, "hal", item.id))?.name).toBe("Sam Roe");
  });

  it("re-scores the list against a new profile without AI", async () => {
    await saveProfile(sql, "ivy", SAMPLE_PROFILE);
    await saveItem(sql, "ivy", { ...contact(1, "Nvidia Person"), company: "NVIDIA", tier: "off-list", points: [] } as NewItem);
    await saveItem(sql, "ivy", { ...posting(2, "https://jobs.example.com/nv"), company: "NVIDIA", roleFit: 3, tier: "off-list" } as NewItem);

    const withNvidia = { ...SAMPLE_PROFILE, companies: [{ name: "NVIDIA", tier: "target" as const }] };
    expect(await rescoreItems(sql, "ivy", withNvidia)).toBe(2);

    const items = await listItems(sql, "ivy");
    const person = items.find((i) => i.kind === "contact");
    const job = items.find((i) => i.kind === "posting");
    expect(person?.score).toBe(4); // 1 + 2 Target + 1 relevant role
    expect(person?.kind === "contact" && person.schools).toEqual([]);
    expect(job?.score).toBe(4); // role fit 3 + 1 Target
    expect(await rescoreItems(sql, "ivy", withNvidia)).toBe(0); // nothing left to change
  });

  it("removes only the user's own items", async () => {
    const { item } = await saveItem(sql, "erin", contact(4, "Someone"));
    expect(await removeItem(sql, "mallory", item.id)).toBe(false);
    expect(await removeItem(sql, "erin", "not-a-uuid")).toBe(false);
    expect(await removeItem(sql, "erin", item.id)).toBe(true);
    expect(await listItems(sql, "erin")).toEqual([]);
  });
});
