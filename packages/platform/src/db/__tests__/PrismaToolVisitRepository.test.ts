// Tool visits against a real Postgres: each run pushes the platform schema
// into a throwaway schema and drops it afterwards. Skipped when no database is
// configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { VISIT_RECENT_DAYS } from "@penntools/core/repositories";
import { PrismaToolVisitRepository } from "../repositories/PrismaToolVisitRepository.js";

const envFile = fileURLToPath(new URL("../../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schema = `platform_test_${Date.now()}`;
const DAY = 24 * 60 * 60_000;

let db: PrismaClient;
let visits: PrismaToolVisitRepository;

/** A user to visit as. */
async function user(name: string): Promise<string> {
  const row = await db.user.create({ data: { googleId: `google-${name}`, name } });
  return row.id;
}

describe.skipIf(!databaseUrl)("PrismaToolVisitRepository (Postgres)", () => {
  beforeAll(() => {
    const url = new URL(databaseUrl!);
    url.searchParams.set("schema", schema);
    const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
    execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "pipe",
    });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    visits = new PrismaToolVisitRepository(db);
  }, 60_000);

  afterAll(async () => {
    await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db?.$disconnect();
  });

  beforeEach(async () => {
    await db.toolVisit.deleteMany();
    await db.user.deleteMany();
  });

  it("counts every visit, and each signed-in user once", async () => {
    const alice = await user("alice");
    const bob = await user("bob");
    await visits.record("askpenn", alice);
    await visits.record("askpenn", alice);
    await visits.record("askpenn", bob);
    await visits.record("askpenn", null);
    await visits.record("askpenn", null);

    expect(await visits.report()).toEqual([
      { toolId: "askpenn", visits: 5, users: 2, recentVisits: 5, recentUsers: 2 },
    ]);
  });

  it(`counts only the last ${VISIT_RECENT_DAYS} days as recent, and sorts by recent visits`, async () => {
    const alice = await user("alice");
    const old = new Date(Date.now() - (VISIT_RECENT_DAYS + 1) * DAY);
    await db.toolVisit.createMany({
      data: [
        { toolId: "choose-mba-major", userId: alice, createdAt: old },
        { toolId: "choose-mba-major", userId: alice, createdAt: old },
        { toolId: "choose-mba-major", userId: null, createdAt: old },
      ],
    });
    await visits.record("askpenn", alice);

    expect(await visits.report()).toEqual([
      { toolId: "askpenn", visits: 1, users: 1, recentVisits: 1, recentUsers: 1 },
      { toolId: "choose-mba-major", visits: 3, users: 1, recentVisits: 0, recentUsers: 0 },
    ]);
  });

  it("is empty before anyone visits", async () => {
    expect(await visits.report()).toEqual([]);
    expect(await visits.visitsSince(7)).toEqual([]);
  });

  it("counts only the window's visits, most first, ties broken by users, signed-out visitors as one user", async () => {
    const alice = await user("alice");
    const bob = await user("bob");
    const at = (days: number) => new Date(Date.now() - days * DAY);
    await db.toolVisit.createMany({
      data: [
        // Two visits each this week; choose-mba-major's are from two people.
        { toolId: "askpenn", userId: alice, createdAt: at(1) },
        { toolId: "askpenn", userId: alice, createdAt: at(2) },
        { toolId: "choose-mba-major", userId: alice, createdAt: at(1) },
        { toolId: "choose-mba-major", userId: bob, createdAt: at(3) },
        // Older than a week, so only in the month.
        { toolId: "askpenn", userId: null, createdAt: at(10) },
        { toolId: "deadline-calendar", userId: null, createdAt: at(10) },
        // Older than the month.
        { toolId: "deadline-calendar", userId: bob, createdAt: at(40) },
      ],
    });

    expect(await visits.visitsSince(7)).toEqual([
      { toolId: "choose-mba-major", visits: 2, users: 2 },
      { toolId: "askpenn", visits: 2, users: 1 },
    ]);
    // AskPenn: alice, and one for its signed-out visit. Deadline Calendar's
    // only visit in the month is signed out, which still makes one user.
    expect(await visits.visitsSince(30)).toEqual([
      { toolId: "askpenn", visits: 3, users: 2 },
      { toolId: "choose-mba-major", visits: 2, users: 2 },
      { toolId: "deadline-calendar", visits: 1, users: 1 },
    ]);
  });
});
