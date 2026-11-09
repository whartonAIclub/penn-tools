// Saved trips against a real Postgres: each run creates a throwaway schema from
// schema.sql and drops it afterwards. Skipped when no database is configured
// (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { listImportRuns, listSavedIds, saveTrip, unsaveTrip } from "../db.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `trekfinder_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

async function addTrip(id: string) {
  await sql`
    INSERT INTO trips (id, name, trip_type, location, region, start_date, end_date, timing, organizer_name)
    VALUES (${id}, ${id}, 'trek', 'Testland', 'Asia', '2027-03-06', '2027-03-14', 'break', 'Test Club')
  `;
}

describe.skipIf(!databaseUrl)("Trek Finder saved trips (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
    for (const id of ["japan-2027", "peru-2027", "italy-2027", "delisted-2027"]) await addTrip(id);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("schema.sql can be applied again to an existing schema", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("lists a user's saved trips, most recently saved first", async () => {
    expect(await saveTrip(sql, "alice", "japan-2027")).toBe(true);
    expect(await saveTrip(sql, "alice", "peru-2027")).toBe(true);
    expect(await saveTrip(sql, "alice", "italy-2027")).toBe(true);

    expect(await listSavedIds(sql, "alice")).toEqual(["italy-2027", "peru-2027", "japan-2027"]);
  });

  it("returns an empty list for someone with no saved trips", async () => {
    expect(await listSavedIds(sql, "nobody")).toEqual([]);
  });

  it("keeps each user's saved trips separate", async () => {
    await saveTrip(sql, "bob", "japan-2027");
    await saveTrip(sql, "carol", "peru-2027");

    expect(await listSavedIds(sql, "bob")).toEqual(["japan-2027"]);
    expect(await listSavedIds(sql, "carol")).toEqual(["peru-2027"]);
  });

  it("treats saving a trip twice as one save", async () => {
    expect(await saveTrip(sql, "dave", "japan-2027")).toBe(true);
    expect(await saveTrip(sql, "dave", "japan-2027")).toBe(true);

    expect(await listSavedIds(sql, "dave")).toEqual(["japan-2027"]);
  });

  it("refuses a trip that doesn't exist, saving nothing", async () => {
    expect(await saveTrip(sql, "eve", "no-such-trip")).toBe(false);
    expect(await listSavedIds(sql, "eve")).toEqual([]);
  });

  it("unsaves only that trip, only for that user", async () => {
    await saveTrip(sql, "frank", "japan-2027");
    await saveTrip(sql, "frank", "peru-2027");
    await saveTrip(sql, "gina", "japan-2027");

    await unsaveTrip(sql, "frank", "japan-2027");

    expect(await listSavedIds(sql, "frank")).toEqual(["peru-2027"]);
    expect(await listSavedIds(sql, "gina")).toEqual(["japan-2027"]);
  });

  it("ignores unsaving a trip that wasn't saved", async () => {
    await expect(unsaveTrip(sql, "hank", "japan-2027")).resolves.toBeUndefined();
    await expect(unsaveTrip(sql, "hank", "no-such-trip")).resolves.toBeUndefined();
  });

  it("keeps a saved trip when it stops being listed, and can save it again", async () => {
    await saveTrip(sql, "ivy", "delisted-2027");
    await sql`UPDATE trips SET listed = FALSE WHERE id = 'delisted-2027'`;
    expect(await listSavedIds(sql, "ivy")).toEqual(["delisted-2027"]);

    await unsaveTrip(sql, "ivy", "delisted-2027");
    expect(await saveTrip(sql, "ivy", "delisted-2027")).toBe(true);
    expect(await listSavedIds(sql, "ivy")).toEqual(["delisted-2027"]);
  });

  it("lists import runs newest first, with each run's problems", async () => {
    expect(await listImportRuns(sql)).toEqual([]);

    const problem = { tab: "Trips", row: 12, tripId: "peru-2027", message: "Start date isn't a date" };
    await sql`INSERT INTO import_runs (status, trips_loaded) VALUES ('ok', 40)`;
    await sql`INSERT INTO import_runs (status, trips_loaded, problems) VALUES ('partial', 39, ${sql.json([problem])})`;

    const runs = await listImportRuns(sql);
    expect(runs.map((run) => run.status)).toEqual(["partial", "ok"]);
    expect(runs[0]).toMatchObject({ id: expect.any(Number), tripsLoaded: 39, problems: [problem] });
    expect(runs[1]?.problems).toEqual([]);
    expect(new Date(runs[0]!.startedAt).toISOString()).toBe(runs[0]!.startedAt);
  });

  it("stops at the limit, keeping the newest import runs", async () => {
    for (const status of ["aborted", "failed"]) await sql`INSERT INTO import_runs (status) VALUES (${status})`;

    expect((await listImportRuns(sql, 1)).map((run) => run.status)).toEqual(["failed"]);
  });
});
