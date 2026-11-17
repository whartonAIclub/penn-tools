// The people directory against a real Postgres: each run creates a throwaway
// schema from schema.sql and drops it afterwards. Skipped when no database is
// configured (DATABASE_URL, or apps/web/.env.local).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  applyUpload,
  checkUpload,
  dataVersion,
  getPerson,
  industryCounts,
  lastUpload,
  PAGE_SIZE,
  previewUpload,
  searchPeople,
  type UploadEntry,
} from "../index.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `industryconnector_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

/** Made-up people, checked with the real upload schema. */
function entries(list: Record<string, unknown>[]): UploadEntry[] {
  const result = checkUpload(list);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.entries;
}
const person = (name: string, gradYear: number, industries: string[], extra: Record<string, unknown> = {}) => ({
  name, gradYear, program: "FT MBA", isAlumni: gradYear <= 2026, currentEmployer: "Example Co", currentTitle: "Associate", industries, ...extra,
});

describe.skipIf(!databaseUrl)("people directory (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
    await sql.unsafe(schemaSql); // safe to run twice, as every deploy does
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("starts empty", async () => {
    expect(await industryCounts(sql)).toEqual({});
    expect(await lastUpload(sql)).toBeNull();
    expect(await searchPeople(sql, "Consulting")).toEqual({ people: [], total: 0 });
  });

  it("previews an upload without changing anything", async () => {
    const preview = await previewUpload(sql, entries([person("Alex Sample", 2026, ["Consulting", "Technology"])]));
    expect(preview).toEqual({ people: 1, added: 1, updated: 0, perIndustry: { Consulting: 1, Technology: 1 } });
    expect(await industryCounts(sql)).toEqual({});
  });

  it("adds people, logs the upload, and finds them by industry, newest class first", async () => {
    const before = await dataVersion(sql);
    const result = await applyUpload(
      sql,
      entries([
        person("Alex Sample", 2026, ["Consulting", "Technology"]),
        person("Bailey Example", 2027, ["Consulting"], { careerPathId: "cp-1" }),
        person('Casey "CJ" Placeholder', 2025, ["Real Estate"]),
      ]),
      { uploadedBy: "admin-1", fileName: "first.json" },
    );
    expect(result).toEqual({ added: 3, updated: 0 });
    expect(await dataVersion(sql)).not.toBe(before);
    expect(await lastUpload(sql)).toMatchObject({ uploadedBy: "admin-1", fileName: "first.json", peopleCount: 3, addedCount: 3, updatedCount: 0 });
    expect(await industryCounts(sql)).toEqual({ Consulting: 2, Technology: 1, "Real Estate": 1 });

    const page = await searchPeople(sql, "Consulting");
    expect(page.total).toBe(2);
    expect(page.people.map((p) => p.name)).toEqual(["Bailey Example", "Alex Sample"]);
    expect(page.people[0]).not.toHaveProperty("industries"); // the card doesn't need them
  });

  it("updates people already loaded, keeps their id, and leaves everyone else alone", async () => {
    const [alex] = (await searchPeople(sql, "Technology")).people;
    const preview = await previewUpload(sql, entries([person("alex  sample", 2026, ["FinTech"]), person("Dana New", 2028, ["FinTech"])]));
    expect(preview).toMatchObject({ added: 1, updated: 1 });

    const result = await applyUpload(
      sql,
      entries([person("alex  sample", 2026, ["FinTech"], { currentEmployer: "New Co" }), person("Dana New", 2028, ["FinTech"])]),
      { uploadedBy: "admin-1", fileName: "second.json" },
    );
    expect(result).toEqual({ added: 1, updated: 1 });

    const updated = await getPerson(sql, alex!.id);
    expect(updated).toMatchObject({ id: alex!.id, currentEmployer: "New Co", industries: ["FinTech"] });
    expect((await searchPeople(sql, "Technology")).total).toBe(0); // their industries were replaced
    expect((await searchPeople(sql, "Real Estate")).people[0]?.name).toBe('Casey "CJ" Placeholder'); // not in the file: unchanged
  });

  it("pages results", async () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => person(`Person ${String(i).padStart(3, "0")}`, 2024, ["Retail"]));
    await applyUpload(sql, entries(many), { uploadedBy: "admin-1", fileName: "many.json" });
    const first = await searchPeople(sql, "Retail");
    const second = await searchPeople(sql, "Retail", PAGE_SIZE);
    expect(first).toMatchObject({ total: PAGE_SIZE + 5 });
    expect(first.people).toHaveLength(PAGE_SIZE);
    expect(second.people).toHaveLength(5);
    expect(new Set([...first.people, ...second.people].map((p) => p.id)).size).toBe(PAGE_SIZE + 5);
    expect(await searchPeople(sql, "Retail", 10_000)).toEqual({ people: [], total: PAGE_SIZE + 5 });
  });

  it("changes nothing when an upload fails part-way", async () => {
    const counts = await industryCounts(sql);
    const bad = entries([person("Rollback Test", 2026, ["Energy"])]);
    // The people insert succeeds, then the log insert fails (uploaded_by is NOT NULL): all of it must roll back.
    await expect(
      applyUpload(sql, bad, { uploadedBy: null as unknown as string, fileName: "broken.json" }),
    ).rejects.toThrow();
    expect(await industryCounts(sql)).toEqual(counts);
  });

  it("returns null for an unknown or malformed id", async () => {
    expect(await getPerson(sql, "not-a-uuid")).toBeNull();
    expect(await getPerson(sql, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
