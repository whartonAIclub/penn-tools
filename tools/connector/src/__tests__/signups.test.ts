// Checking sign-up input, and saving and reading sign-ups against a real
// Postgres: each run creates a throwaway schema from schema.sql and drops it
// afterwards. The database tests are skipped when no database is configured
// (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { checkSignup, listSignups, saveSignup } from "../signups.js";

const answers = { "ideal-2am": "rooftop-talk", "free-saturday": "hike" };

describe("checkSignup", () => {
  it("trims names and accepts a real cohort and real answers", () => {
    expect(checkSignup({ firstName: " Ada ", lastName: "Lovelace ", cohort: "F", answers })).toEqual({
      ok: true,
      input: { firstName: "Ada", lastName: "Lovelace", cohort: "F", answers },
    });
  });

  it("drops answers to questions that don't exist", () => {
    const result = checkSignup({ firstName: "A", lastName: "L", cohort: "A", answers: { ...answers, extra: "x" } });
    expect(result.ok && result.input.answers).toEqual(answers);
  });

  it("says what to fix", () => {
    const ok = { firstName: "A", lastName: "L", cohort: "A", answers };
    expect(checkSignup(null)).toEqual({ ok: false, error: "Fill in the form." });
    expect(checkSignup({ ...ok, firstName: " " })).toEqual({ ok: false, error: "Enter your first name." });
    expect(checkSignup({ ...ok, lastName: "" })).toEqual({ ok: false, error: "Enter your last name." });
    expect(checkSignup({ ...ok, firstName: "A".repeat(101) }).ok).toBe(false);
    expect(checkSignup({ ...ok, cohort: "Z" })).toEqual({ ok: false, error: "Choose your cohort." });
    expect(checkSignup({ ...ok, answers: { "ideal-2am": "rooftop-talk" } })).toEqual({
      ok: false,
      error: 'Answer "Free Saturday".',
    });
    expect(checkSignup({ ...ok, answers: { ...answers, "ideal-2am": "Rooftop Talk" } }).ok).toBe(false);
  });
});

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `connector_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

describe.skipIf(!databaseUrl)("Connector sign-ups (Postgres)", () => {
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

  it("saves sign-ups, replaces a student's earlier one, and lists everyone's", async () => {
    expect(await listSignups(sql)).toEqual([]);

    await saveSignup(sql, "alice", "alice@wharton.upenn.edu", { firstName: "Alice", lastName: "A", cohort: "A", answers });
    await saveSignup(sql, "bob", "bob@wharton.upenn.edu", {
      firstName: "Bob",
      lastName: "B",
      cohort: "D",
      answers: { "ideal-2am": "diner-run", "free-saturday": "museum" },
    });
    await saveSignup(sql, "alice", "alice@wharton.upenn.edu", {
      firstName: "Alice",
      lastName: "Smith",
      cohort: "K",
      answers: { "ideal-2am": "asleep", "free-saturday": "sleep-in" },
    });

    expect(await listSignups(sql)).toEqual([
      {
        id: "alice",
        name: "Alice Smith",
        email: "alice@wharton.upenn.edu",
        cohort: "K",
        answers: { "ideal-2am": "asleep", "free-saturday": "sleep-in" },
      },
      {
        id: "bob",
        name: "Bob B",
        email: "bob@wharton.upenn.edu",
        cohort: "D",
        answers: { "ideal-2am": "diner-run", "free-saturday": "museum" },
      },
    ]);
  });
});
