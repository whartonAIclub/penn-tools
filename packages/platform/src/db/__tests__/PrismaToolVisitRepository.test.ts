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
        { toolId: "career-canvas", userId: alice, createdAt: old },
        { toolId: "career-canvas", userId: alice, createdAt: old },
        { toolId: "career-canvas", userId: null, createdAt: old },
      ],
    });
    await visits.record("askpenn", alice);

    expect(await visits.report()).toEqual([
      { toolId: "askpenn", visits: 1, users: 1, recentVisits: 1, recentUsers: 1 },
      { toolId: "career-canvas", visits: 3, users: 1, recentVisits: 0, recentUsers: 0 },
    ]);
  });

  it("is empty before anyone visits", async () => {
    expect(await visits.report()).toEqual([]);
  });
});
