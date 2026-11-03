// Pass It On storage against a real Postgres: each run creates a throwaway
// schema from schema.sql and drops it afterwards. Skipped when no database is
// configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { getEvent, listEvents, saveEvent, saveLessons, setLessonStatus, type NewEvent } from "../storage.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

const dinner: NewEvent = {
  title: "Fall speaker dinner",
  eventType: "speaker dinner",
  eventDate: "2025-10-14",
  organizerName: "Pat Example",
  createdBy: "user-1",
  answers: {
    happened: "Forty people came to hear the speaker at the bistro.",
    surprised: "RSVPs overstated attendance by about a third.",
    cost: "The venue required a $500 deposit two weeks ahead.",
    repeat: "Send the speaker questions a week before.",
    change: "Recruit the moderator earlier; it took longest.",
  },
};

describe.skipIf(!databaseUrl)("Pass It On storage (Postgres)", () => {
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

  it("saves an event with its five answers and reads it back", async () => {
    const { id, answerIds } = await saveEvent(sql, dinner);

    const event = await getEvent(sql, id);
    expect(event).toMatchObject({ id, title: "Fall speaker dinner", eventType: "speaker dinner", eventDate: "2025-10-14", organizerName: "Pat Example" });
    expect(event?.answers.map((a) => a.question)).toEqual(["happened", "surprised", "cost", "repeat", "change"]);
    expect(event?.answers.find((a) => a.question === "cost")).toEqual({ id: answerIds.cost, question: "cost", text: dinner.answers.cost });
    expect((await listEvents(sql)).map((e) => e.id)).toContain(id);
  });

  it("returns null for a missing or malformed event id", async () => {
    expect(await getEvent(sql, "not-a-uuid")).toBeNull();
    expect(await getEvent(sql, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("saves lessons as pending, then accepts one with its embedding and rejects another", async () => {
    const { id, answerIds } = await saveEvent(sql, dinner);
    const [deposit, moderator] = await saveLessons(sql, [
      { answerId: answerIds.cost, excerptId: null, eventId: id, category: "vendors", summary: "Venues may want a deposit", quote: "required a $500 deposit" },
      { answerId: answerIds.change, excerptId: null, eventId: id, category: "timeline", summary: "Recruit the moderator early", quote: "Recruit the moderator earlier" },
    ]);

    expect(await setLessonStatus(sql, deposit!, "accepted", { model: "fake-model", vector: [1, 0, 0] })).toBe(true);
    expect(await setLessonStatus(sql, moderator!, "rejected")).toBe(true);
    expect(await setLessonStatus(sql, 999_999, "rejected")).toBe(false);

    const rows = await sql<{ id: string; status: string; model: string | null; has_vector: boolean }[]>`
      SELECT id, status, model, embedding IS NOT NULL AS has_vector FROM lessons WHERE event_id = ${id} ORDER BY id
    `;
    expect(rows.map((r) => [r.status, r.model, r.has_vector])).toEqual([
      ["accepted", "fake-model", true],
      ["rejected", null, false],
    ]);
  });

  it("won't accept a lesson without its embedding", async () => {
    await expect(setLessonStatus(sql, 1, "accepted")).rejects.toThrow(/embedding/);
  });

  it("rejects a lesson that quotes both an answer and an excerpt, or neither", async () => {
    await expect(
      saveLessons(sql, [{ answerId: null, excerptId: null, eventId: null, category: "other", summary: "s", quote: "q" }]),
    ).rejects.toThrow();
  });
});
