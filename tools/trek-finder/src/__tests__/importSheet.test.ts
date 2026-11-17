// The Sheet import from CSV text to stored trips and a logged run. The CSV
// tests need nothing; the import tests run against a real Postgres in their own
// throwaway schema, and are skipped when no database is configured
// (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { importSheet, parseCsv } from "../importSheet.js";
import { parseTripRow } from "../sheet.js";
import { listImportRuns } from "../db.js";
import { SHEET_COLUMNS } from "../sheet.js";
import { REGIONS, TIMINGS, TRIP_TYPES } from "../trips.js";

describe("parseCsv", () => {
  it("splits rows and cells", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps commas, line breaks and doubled quotes inside quoted cells", () => {
    expect(parseCsv('"one, two","line 1\nline 2","say ""hi"""\n')).toEqual([["one, two", "line 1\nline 2", 'say "hi"']]);
  });

  it("handles Windows line ends, empty cells and a byte-order mark", () => {
    expect(parseCsv("﻿a,,c\r\n,,\r\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("returns no rows for empty text", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("turns a Windows line ending inside a cell into a plain line break", () => {
    expect(parseCsv('"Day 1\r\nDay 2"\r\n')).toEqual([["Day 1\nDay 2"]]);
  });
});

describe("sheet/trips.csv", () => {
  it("has every column, and every trip in it loads without problems", () => {
    const [headers = [], ...rows] = parseCsv(readFileSync(new URL("../../sheet/trips.csv", import.meta.url), "utf8"));
    expect(headers).toEqual(SHEET_COLUMNS);
    const trips = rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
    expect(trips.length).toBeGreaterThan(0);
    for (const cells of trips) {
      const result = parseTripRow(Object.fromEntries(headers.map((header, i) => [header, cells[i]])));
      expect(result.ok ? [] : result.problems, cells[0]).toEqual([]);
    }
    const ids = trips.map((cells) => cells[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Building a Sheet ─────────────────────────────────────────────────────────

const quote = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

function tripRow(id: string, changes: Record<string, string> = {}): Record<string, string> {
  return {
    ID: id,
    Name: `Trip ${id}`,
    "Trip type": TRIP_TYPES[0],
    Location: "Testland",
    Region: REGIONS[0],
    "Start date": "2027-03-06",
    "End date": "2027-03-14",
    Timing: TIMINGS[0],
    "Organizer name": "Test Club",
    ...changes,
  };
}

function sheet(rows: Record<string, string>[], columns: readonly string[] = SHEET_COLUMNS): string {
  const lines = [columns.map(quote).join(",")];
  for (const row of rows) lines.push(columns.map((column) => quote(row[column] ?? "")).join(","));
  return lines.join("\r\n") + "\r\n";
}

// ── Importing ────────────────────────────────────────────────────────────────

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `trekfinder_sheet_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

async function listedIds(): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM trips WHERE listed ORDER BY id`;
  return rows.map((row) => row.id);
}

async function lastRun() {
  const [run] = await listImportRuns(sql, 1);
  return run!;
}

describe.skipIf(!databaseUrl)("importSheet (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
  });

  beforeEach(async () => {
    await sql`TRUNCATE trips, import_runs CASCADE`;
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("loads every good row and logs an ok run", async () => {
    const result = await importSheet(sql, sheet([tripRow("alpha"), tripRow("beta", { Cities: "One; Two" })]));
    expect(result).toEqual({ status: "ok", tripsLoaded: 2, delisted: 0, problems: [] });
    expect(await listedIds()).toEqual(["alpha", "beta"]);
    const [beta] = await sql`SELECT cities FROM trips WHERE id = 'beta'`;
    expect(beta!["cities"]).toEqual(["One", "Two"]);
    expect(await lastRun()).toMatchObject({ status: "ok", tripsLoaded: 2, problems: [] });
  });

  it("skips bad rows with their Sheet row number, without repeating what was entered", async () => {
    const result = await importSheet(
      sql,
      sheet([tripRow("alpha"), tripRow("beta", { "Start date": "next spring" }), tripRow("Not An ID!")])
    );
    expect(result.status).toBe("partial");
    expect(result.tripsLoaded).toBe(1);
    expect(result.problems.map((p) => [p.row, p.tripId])).toEqual([
      [3, "beta"],
      [4, null],
    ]);
    const text = JSON.stringify(result.problems);
    expect(text).not.toContain("next spring");
    expect(text).not.toContain("Not An ID!");
    expect(await lastRun()).toMatchObject({ status: "partial", tripsLoaded: 1 });
  });

  it("keeps the first row of a repeated ID and skips the rest", async () => {
    const result = await importSheet(sql, sheet([tripRow("alpha"), tripRow("beta"), tripRow("alpha", { Name: "Again" })]));
    expect(result.tripsLoaded).toBe(2);
    expect(result.problems).toEqual([{ tab: null, row: 4, tripId: "alpha", message: expect.stringContaining("row 2") }]);
    const [alpha] = await sql`SELECT name FROM trips WHERE id = 'alpha'`;
    expect(alpha!["name"]).toBe("Trip alpha");
  });

  it("ignores blank rows", async () => {
    const result = await importSheet(sql, sheet([tripRow("alpha"), {}, tripRow("beta")]));
    expect(result).toMatchObject({ status: "ok", tripsLoaded: 2, problems: [] });
  });

  it("hides listed trips that left the Sheet", async () => {
    await importSheet(sql, sheet([tripRow("alpha"), tripRow("beta"), tripRow("gamma")]));
    const result = await importSheet(sql, sheet([tripRow("alpha"), tripRow("beta")]));
    expect(result).toMatchObject({ status: "ok", tripsLoaded: 2, delisted: 1 });
    expect(await listedIds()).toEqual(["alpha", "beta"]);
  });

  it("changes nothing when no row can be loaded", async () => {
    await importSheet(sql, sheet([tripRow("alpha")]));
    const result = await importSheet(sql, sheet([tripRow("beta", { Region: "Atlantis" })]));
    expect(result.status).toBe("aborted");
    expect(result.tripsLoaded).toBe(0);
    expect(await listedIds()).toEqual(["alpha"]);
    expect(await lastRun()).toMatchObject({ status: "aborted", tripsLoaded: 0 });
  });

  it("changes nothing when an empty Sheet arrives", async () => {
    await importSheet(sql, sheet([tripRow("alpha")]));
    expect((await importSheet(sql, sheet([]))).status).toBe("aborted");
    expect(await listedIds()).toEqual(["alpha"]);
  });

  it("changes nothing when fewer than half the listed trips would remain", async () => {
    await importSheet(sql, sheet(["a", "b", "c", "d", "e"].map((id) => tripRow(id))));
    const result = await importSheet(sql, sheet([tripRow("a"), tripRow("b")]));
    expect(result.status).toBe("aborted");
    expect(result.problems.at(-1)!.message).toContain("fewer than half");
    expect(await listedIds()).toEqual(["a", "b", "c", "d", "e"]);

    // Exactly half is allowed.
    await importSheet(sql, sheet(["a", "b", "c", "d"].map((id) => tripRow(id))));
    expect((await importSheet(sql, sheet([tripRow("a"), tripRow("b")]))).status).toBe("ok");
  });

  it("fails, changing nothing, when columns are missing", async () => {
    await importSheet(sql, sheet([tripRow("alpha")]));
    const columns = SHEET_COLUMNS.filter((column) => column !== "Timing");
    const result = await importSheet(sql, sheet([tripRow("beta")], columns));
    expect(result.status).toBe("failed");
    expect(result.problems.map((p) => p.message)).toEqual([expect.stringContaining('"Timing"')]);
    expect(await listedIds()).toEqual(["alpha"]);
  });

  it("fails with one clear problem when the file isn't the Sheet", async () => {
    const result = await importSheet(sql, "<!DOCTYPE html><html><body>Sign in</body></html>");
    expect(result.status).toBe("failed");
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.message).toContain("isn't the Trek Finder Sheet");
  });
});
