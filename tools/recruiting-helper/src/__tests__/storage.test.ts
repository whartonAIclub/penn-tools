// Storage against a real Postgres: each run creates a throwaway schema from
// schema.sql and drops it afterwards. Skipped when no database is configured
// (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { getProfile, listItems, removeItem, saveItem, saveProfile, type NewItem } from "../storage.js";
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

function contact(score: number, name: string | null): NewItem {
  return {
    kind: "contact",
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

  it("removes only the user's own items", async () => {
    const { item } = await saveItem(sql, "erin", contact(4, "Someone"));
    expect(await removeItem(sql, "mallory", item.id)).toBe(false);
    expect(await removeItem(sql, "erin", "not-a-uuid")).toBe(false);
    expect(await removeItem(sql, "erin", item.id)).toBe(true);
    expect(await listItems(sql, "erin")).toEqual([]);
  });
});
