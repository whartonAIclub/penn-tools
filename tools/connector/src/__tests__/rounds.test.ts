// Multiple rounds against a real Postgres: each run creates a throwaway
// schema from schema.sql and drops it afterwards. Skipped when no database is
// configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { QUESTIONS } from "../questions.js";
import { checkIn, getRoundStats, getStatus, listMatches, matchAgain, releaseMatches } from "../releases.js";
import { saveSignup } from "../signups.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `connector_rounds_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

const sameAnswers = { ...Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options[0]!.id])), "meet-format": "small-group" };
const students = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

describe.skipIf(!databaseUrl)("Connector rounds (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
    for (const [i, id] of students.entries()) {
      const cohort = String.fromCharCode(65 + i); // A, B, C, …
      await saveSignup(sql, id, `${id}@wharton.upenn.edu`, { firstName: id, lastName: "Test", cohort, answers: sameAnswers });
    }
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("schema.sql can be applied again to an existing schema", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("checks in, matches again in the next round, and never repeats a match", async () => {
    const first = await releaseMatches(sql, "sayenko@upenn.edu");
    expect(first.groups).toHaveLength(3);
    expect(first.waitlist).toEqual([]);

    // Matched students can't ask again until they've said whether they met.
    expect(await matchAgain(sql, "a")).toEqual({ ok: false, error: "Tell us whether you met your match first." });
    expect((await getRoundStats(sql)).lastRound).toEqual({ round: 1, matched: 9, checkedIn: 0, met: 0 });

    for (const id of students) {
      expect(await checkIn(sql, id, id !== "i")).toEqual({ ok: true });
      expect(await matchAgain(sql, id)).toEqual({ ok: true });
    }
    expect(await matchAgain(sql, "a")).toEqual({ ok: false, error: "You're already in line for the next round." });
    const waiting = await getStatus(sql, "a");
    expect(waiting.kind === "waiting" && waiting.returning && waiting.nextRound).toBe(2);
    expect(await getRoundStats(sql)).toEqual({
      nextRound: 2,
      newcomers: 0,
      returning: 9,
      waitlisted: 0,
      lastRound: { round: 1, matched: 9, checkedIn: 9, met: 8 },
    });

    const second = await releaseMatches(sql, "subasree@wharton.upenn.edu");
    expect(second.waitlist).toEqual([]);
    // Nobody shares a group with anyone from their first group.
    const firstGroupOf = new Map(first.groups.flatMap((g, i) => g.members.map((m) => [m.id, i] as const)));
    for (const group of second.groups) {
      const earlier = group.members.map((m) => firstGroupOf.get(m.id));
      expect(new Set(earlier).size).toBe(earlier.length);
    }

    // Past matches, newest first, with each round's check-in.
    const history = await listMatches(sql, "a");
    expect(history.map((m) => [m.round, m.met])).toEqual([
      [2, null],
      [1, true],
    ]);
    const now = await getStatus(sql, "a");
    expect(now.kind === "matched" && now.match.round).toBe(2);
  });

  it("keeps a newcomer who signs up mid-round for the next release", async () => {
    await saveSignup(sql, "new", "new@wharton.upenn.edu", { firstName: "New", lastName: "Test", cohort: "L", answers: sameAnswers });
    const status = await getStatus(sql, "new");
    expect(status.kind === "waiting" && !status.returning && status.nextRound).toBe(3);
  });
});
