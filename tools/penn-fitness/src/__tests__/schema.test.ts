// schema.sql runs on every deploy, so it must apply cleanly to a database that
// already has it. Its constraints hold structure only; value lists are checked
// in code, so new values and attributes need no schema change.

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

  it("gives every table an attributes column for extra fields", async () => {
    const rows = await db.sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables t
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('preferences', 'analytics_events')
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name = 'attributes'
        )
    `;
    expect(rows.map((row) => row.table_name)).toEqual([]);
  });

  it("stores and reads back extra attributes", async () => {
    await db.sql`
      INSERT INTO schedule_blocks (user_id, starts_at, ends_at, source, attributes)
      VALUES ('alice', '2026-11-17 12:00', '2026-11-17 13:00', 'MANUAL', ${db.sql.json({ "intake.mealType": "lunch" })})
    `;
    const [row] = await db.sql<{ attributes: Record<string, unknown> }[]>`SELECT attributes FROM schedule_blocks WHERE user_id = 'alice'`;
    expect(row?.attributes).toEqual({ "intake.mealType": "lunch" });
  });

  it("accepts new values without a schema change", async () => {
    await expect(db.sql`
      INSERT INTO schedule_blocks (user_id, starts_at, ends_at, source, zone)
      VALUES ('alice', '2026-11-18 09:00', '2026-11-18 10:00', 'SOME_NEW_SOURCE', 'SOME_NEW_ZONE')
    `).resolves.toBeDefined();
  });

  it("only takes weeks that start on a Monday", async () => {
    await db.sql`INSERT INTO outtake_weeks (user_id, week_start) VALUES ('alice', '2026-11-16')`;
    await expect(db.sql`INSERT INTO outtake_weeks (user_id, week_start) VALUES ('alice', '2026-11-17')`).rejects.toThrow();
  });

  it("rejects blocks and slots that end before they start", async () => {
    await expect(db.sql`
      INSERT INTO schedule_blocks (user_id, starts_at, ends_at, source)
      VALUES ('alice', '2026-11-17 10:00', '2026-11-17 09:00', 'MANUAL')
    `).rejects.toThrow();
    await expect(db.sql`
      INSERT INTO outtake_workout_slots (user_id, week_start, starts_at, ends_at, place_id, travel_minutes, score, status)
      VALUES ('alice', '2026-11-16', '2026-11-17 08:00', '2026-11-17 07:00', 'pottruck', 0, 1, 'SUGGESTED')
    `).rejects.toThrow();
  });
});
