// Writing a Sheet import and reading the trips back, against a real Postgres,
// in its own throwaway schema so hiding trips here can't affect the saved-trip tests. Skipped when no
// database is configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { listSavedIds, listTrips, saveTrip, writeImport } from "../db.js";
import { SAMPLE_TRIPS } from "../samples.js";
import type { Trip } from "../trips.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `trekfinder_import_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

const [first, second, third] = SAMPLE_TRIPS as [Trip, Trip, Trip];

async function listedIds(): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM trips WHERE listed ORDER BY id`;
  return rows.map((row) => row.id);
}

async function stored(id: string) {
  const [trip] = await sql`SELECT * FROM trips WHERE id = ${id}`;
  const prices = await sql`SELECT * FROM trip_price_stages WHERE trip_id = ${id} ORDER BY position`;
  const deadlines = await sql`SELECT * FROM trip_deadlines WHERE trip_id = ${id} ORDER BY position`;
  const links = await sql`SELECT * FROM trip_links WHERE trip_id = ${id} ORDER BY position`;
  return { trip, prices, deadlines, links };
}

describe.skipIf(!databaseUrl)("Trek Finder import write (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
  });

  beforeEach(async () => {
    await sql`TRUNCATE trips CASCADE`;
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("stores every trip with its prices, deadlines and links", async () => {
    expect(await writeImport(sql, SAMPLE_TRIPS)).toEqual({ written: SAMPLE_TRIPS.length, delisted: 0 });
    expect(await listedIds()).toEqual(SAMPLE_TRIPS.map((t) => t.id).sort());

    const { trip, prices, deadlines, links } = await stored(first.id);
    expect(trip).toMatchObject({ name: first.name, cities: first.cities, organizer_name: first.organizerName, listed: true });
    expect(prices.map((p) => p["label"])).toEqual(first.priceStages.map((p) => p.label));
    expect(deadlines.map((d) => d["label"])).toEqual(first.deadlines.map((d) => d.label));
    expect(links.map((l) => l["url"])).toEqual(first.links.map((l) => l.url));
  });

  it("updates a trip on the next import and replaces its lists", async () => {
    await writeImport(sql, [first]);
    const changed: Trip = {
      ...first,
      name: "Renamed Trek",
      cities: ["Onlyville"],
      priceStages: [{ position: 1, label: "Final", amountUsd: 999, certainty: "confirmed", validFrom: null, validUntil: null, note: null }],
      deadlines: [],
      links: [],
    };
    await writeImport(sql, [changed]);

    const { trip, prices, deadlines, links } = await stored(first.id);
    expect(trip).toMatchObject({ name: "Renamed Trek", cities: ["Onlyville"] });
    expect(prices.map((p) => [p["label"], p["amount_usd"]])).toEqual([["Final", 999]]);
    expect(deadlines).toEqual([]);
    expect(links).toEqual([]);
  });

  it("hides trips that leave the Sheet, keeps their saves, and lists them again if they come back", async () => {
    await writeImport(sql, [first, second, third]);
    await saveTrip(sql, "alice", third.id);

    expect(await writeImport(sql, [first, second])).toEqual({ written: 2, delisted: 1 });
    expect(await listedIds()).toEqual([first.id, second.id].sort());
    expect((await stored(third.id)).trip).toMatchObject({ listed: false });
    expect(await listSavedIds(sql, "alice")).toEqual([third.id]);

    expect(await writeImport(sql, [first, second, third])).toEqual({ written: 3, delisted: 0 });
    expect(await listedIds()).toEqual([first.id, second.id, third.id].sort());
  });

  it("refuses an empty import or a repeated id, changing nothing", async () => {
    await writeImport(sql, [first, second]);

    await expect(writeImport(sql, [])).rejects.toThrow("zero trips");
    await expect(writeImport(sql, [first, first])).rejects.toThrow("repeated trip id");
    expect(await listedIds()).toEqual([first.id, second.id].sort());
  });

  it("reads back exactly the trips that were imported, soonest first", async () => {
    await writeImport(sql, SAMPLE_TRIPS);
    const bySoonest = [...SAMPLE_TRIPS].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
    expect(await listTrips(sql)).toEqual(bySoonest);
  });

  it("reads back times as HH:MM and blank dates and lists as empty", async () => {
    const trip: Trip = {
      ...first,
      priceStages: [{ position: 2, label: "Regular", amountUsd: null, certainty: "estimate", validFrom: "2026-12-16", validUntil: null, note: null }],
      deadlines: [{ position: 1, kind: "deposit", label: "Deposit", dueDate: "2027-01-15", dueTime: "17:00" }],
      links: [],
    };
    await writeImport(sql, [trip]);
    const [read] = await listTrips(sql);
    expect(read!.priceStages).toEqual(trip.priceStages);
    expect(read!.deadlines).toEqual(trip.deadlines);
    expect(read!.links).toEqual([]);
  });

  it("includes hidden trips, marked as not listed", async () => {
    await writeImport(sql, [first, second]);
    await writeImport(sql, [first]);
    const listed = Object.fromEntries((await listTrips(sql)).map((t) => [t.id, t.listed]));
    expect(listed).toEqual({ [first.id]: true, [second.id]: false });
  });

  it("returns no trips when nothing has been imported", async () => {
    expect(await listTrips(sql)).toEqual([]);
  });

  it("changes nothing if any trip fails to write", async () => {
    await writeImport(sql, [first]);
    // Two preliminary deadlines break a database rule that validation normally catches first.
    const broken: Trip = {
      ...second,
      deadlines: [
        { position: 1, kind: "preliminary", label: "A", dueDate: "2027-01-01", dueTime: null },
        { position: 2, kind: "preliminary", label: "B", dueDate: "2027-01-02", dueTime: null },
      ],
    };
    const renamed: Trip = { ...first, name: "Should not stick" };

    await expect(writeImport(sql, [renamed, broken])).rejects.toThrow();
    expect(await listedIds()).toEqual([first.id]);
    expect((await stored(first.id)).trip).toMatchObject({ name: first.name });
    expect((await stored(second.id)).trip).toBeUndefined();
  });
});
