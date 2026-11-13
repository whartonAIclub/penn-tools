// Releasing matches against a real Postgres: each run creates a throwaway
// schema from schema.sql and drops it afterwards. The database tests are
// skipped when no database is configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { QUESTIONS } from "../questions.js";
import { getMatch, getStatus, isTeamMember, listUnmatched, previewRelease, releaseMatches } from "../releases.js";
import { saveSignup } from "../signups.js";

describe("isTeamMember", () => {
  it("recognizes the team's emails, ignoring case and spaces", () => {
    expect(isTeamMember("sayenko@upenn.edu")).toBe(true);
    expect(isTeamMember(" Subasree@Wharton.upenn.edu ")).toBe(true);
    expect(isTeamMember("someone@wharton.upenn.edu")).toBe(false);
    expect(isTeamMember(null)).toBe(false);
    expect(isTeamMember("")).toBe(false);
  });
});

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `connector_release_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

/** Everyone answers the first option of every question. */
const sameAnswers = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options[0]!.id]));

/** Signs up a student with the given id in the given cohort. */
async function signUp(id: string, cohort: string) {
  await saveSignup(sql, id, `${id}@wharton.upenn.edu`, { firstName: id, lastName: "Test", cohort, answers: sameAnswers });
}

describe.skipIf(!databaseUrl)("Connector releases (Postgres)", () => {
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

  it("previews without saving, releases once, and later releases only match newcomers and the waitlist", async () => {
    // Four students from different cohorts: one group, and nobody waits.
    for (const [id, cohort] of [["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]] as const) {
      await signUp(id, cohort);
    }

    const preview = await previewRelease(sql);
    expect(preview.groups.flatMap((g) => g.members.map((m) => m.id)).sort()).toEqual(["a", "b", "c", "d"]);
    expect(await getMatch(sql, "a")).toBeNull();
    expect(await listUnmatched(sql)).toHaveLength(4);
    expect((await getStatus(sql, "a")).kind).toBe("waiting");
    expect((await getStatus(sql, "nobody")).kind).toBe("not-signed-up");

    const first = await releaseMatches(sql, "sayenko@upenn.edu");
    expect(first.groups).toHaveLength(1);
    expect(await listUnmatched(sql)).toEqual([]);

    const match = await getMatch(sql, "c");
    expect(match?.releaseId).toBe(first.releaseId);
    expect(match?.members.map((m) => m.id).sort()).toEqual(["a", "b", "c", "d"]);
    const status = await getStatus(sql, "c");
    expect(status.kind === "matched" && status.match.members).toHaveLength(4);

    // A newcomer after the release isn't matched yet, and the first group stays as it was.
    await signUp("f", "F");
    expect((await listUnmatched(sql)).map((s) => s.id)).toEqual(["f"]);
    expect((await getMatch(sql, "a"))?.members).toHaveLength(4);
    expect((await getStatus(sql, "f")).kind).toBe("waiting");

    // One person can't make a group: the next release waitlists them, and they stay unmatched.
    const second = await releaseMatches(sql, "subasree@wharton.upenn.edu");
    expect(second.groups).toEqual([]);
    expect(second.waitlist.map((s) => s.id)).toEqual(["f"]);
    expect(await getMatch(sql, "f")).toBeNull();
    expect((await listUnmatched(sql)).map((s) => s.id)).toEqual(["f"]);
    expect((await getStatus(sql, "f")).kind).toBe("waitlisted");

    // With three more, the waitlisted student is matched in the next release.
    for (const [id, cohort] of [["g", "G"], ["h", "H"], ["i", "I"]] as const) await signUp(id, cohort);
    const third = await releaseMatches(sql, "sayenko@upenn.edu");
    expect(third.groups.flatMap((g) => g.members.map((m) => m.id)).sort()).toEqual(["f", "g", "h", "i"]);
    expect((await getMatch(sql, "f"))?.releaseId).toBe(third.releaseId);
    expect((await getStatus(sql, "f")).kind).toBe("matched");
    expect((await getMatch(sql, "a"))?.releaseId).toBe(first.releaseId);
  });
});
