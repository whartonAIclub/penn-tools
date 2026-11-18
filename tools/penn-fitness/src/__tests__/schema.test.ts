// schema.sql runs on every deploy, so it must apply cleanly to a database that
// already has it, and its checks must hold the data model's rules.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, databaseUrl, schemaSql, type TestDatabase } from "./testDatabase.js";

let db: TestDatabase;

describe.skipIf(!databaseUrl)("Penn Fitness schema (Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDatabase("schema");
  });

  afterAll(async () => {
    await db?.drop();
  });

  it("can be applied again to an existing schema", async () => {
    await expect(db.sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("only takes weeks that start on a Monday", async () => {
    await db.sql`INSERT INTO outtake_weeks (user_id, week_start) VALUES ('alice', '2026-11-16')`;
    await expect(db.sql`INSERT INTO outtake_weeks (user_id, week_start) VALUES ('alice', '2026-11-17')`).rejects.toThrow();
  });

  it("requires a skip reason exactly when a slot is skipped", async () => {
    const slot = (status: string, reason: string | null) => db.sql`
      INSERT INTO outtake_workout_slots (user_id, week_start, starts_at, ends_at, facility_id, travel_minutes, score, status, skip_reason)
      VALUES ('alice', '2026-11-16', '2026-11-17 07:00', '2026-11-17 07:45', 'pottruck', 0, 1, ${status}, ${reason})
    `;
    await expect(slot("SKIPPED", "tired")).resolves.toBeDefined();
    await expect(slot("SKIPPED", null)).rejects.toThrow();
    await expect(slot("ACCEPTED", "tired")).rejects.toThrow();
  });

  it("rejects busy blocks that end before they start", async () => {
    await expect(db.sql`
      INSERT INTO outtake_busy_blocks (user_id, starts_at, ends_at, source)
      VALUES ('alice', '2026-11-17 10:00', '2026-11-17 09:00', 'MANUAL')
    `).rejects.toThrow();
  });
});
