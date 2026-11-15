// Syllabus and weekend storage against a real Postgres: each run creates a throwaway
// schema from schema.sql and drops it afterwards. Skipped when no database is
// configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { MAX_SYLLABI } from "../syllabus.js";
import { TooManySyllabiError, deleteSyllabus, listSyllabi, saveSyllabus } from "../syllabi.js";
import { MAX_WEEKENDS, currentWeekend, deleteWeekend, listWeekends, saveWeekend, weekendRange } from "../weekends.js";
import type { ScheduleItem, WeekendSchedule } from "../schedule.js";
import { EventError, addEvents, deleteEvent, listEvents, setRsvp } from "../eventStore.js";
import { event, syllabus } from "./fixtures.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `wembasync_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

describe.skipIf(!databaseUrl)("storage (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
    await sql.unsafe(schemaSql); // safe to re-run, as every deploy does
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("shares one syllabus per course with the class; the latest upload replaces it", async () => {
    const saved = await saveSyllabus(sql, "ada", "FNCE.pdf", syllabus());
    expect(saved.syllabus.title).toBe("Corporate Finance");
    expect(saved.mine).toBe(true);

    // The same course again, by a classmate, with its code written differently: replaces it for everyone.
    await saveSyllabus(sql, "alan", "FNCE-v2.pdf", syllabus({ courseCode: "fnce6130", term: "Fall 2026 (rev.)" }));
    await saveSyllabus(sql, "ada", "STAT.pdf", syllabus({ courseCode: "STAT 6130", title: "Statistics" }));

    const forAda = await listSyllabi(sql, "ada");
    expect(forAda.map((s) => [s.filename, s.syllabus.term, s.mine])).toEqual([
      ["FNCE-v2.pdf", "Fall 2026 (rev.)", false],
      ["STAT.pdf", "Fall 2026", true],
    ]);
    expect(forAda[0]!.id).toBe(saved.id);
    // Grace uploaded nothing and sees the same syllabi.
    expect((await listSyllabi(sql, "grace")).map((s) => [s.filename, s.mine])).toEqual([
      ["FNCE-v2.pdf", false],
      ["STAT.pdf", false],
    ]);
  });

  it("lets only the uploader of a syllabus remove it", async () => {
    const [stat] = (await listSyllabi(sql, "ada")).filter((s) => s.filename === "STAT.pdf");
    expect(await deleteSyllabus(sql, "alan", stat!.id)).toBe(false);
    expect(await deleteSyllabus(sql, "ada", "not-a-uuid")).toBe(false);
    expect(await deleteSyllabus(sql, "ada", stat!.id)).toBe(true);
    expect((await listSyllabi(sql, "grace")).map((s) => s.filename)).toEqual(["FNCE-v2.pdf"]);
  });

  it("refuses a new course past the class's limit, but still replaces an existing one", async () => {
    // FNCE is already saved; fill the rest.
    for (let i = 1; i < MAX_SYLLABI; i++) {
      await saveSyllabus(sql, i % 2 ? "grace" : "alan", `${i}.pdf`, syllabus({ courseCode: `TEST ${i}` }));
    }
    await expect(saveSyllabus(sql, "ada", "new.pdf", syllabus({ courseCode: "NEW 1" }))).rejects.toBeInstanceOf(
      TooManySyllabiError,
    );
    await expect(saveSyllabus(sql, "ada", "1b.pdf", syllabus({ courseCode: "TEST 1" }))).resolves.toBeTruthy();
  });

  it("skips rows that no longer match the schema", async () => {
    await sql`INSERT INTO syllabi (user_id, course_key, filename, syllabus) VALUES ('ada', 'old', 'old.pdf', ${sql.json({ title: 1 })})`;
    const listed = await listSyllabi(sql, "ada");
    expect(listed).toHaveLength(MAX_SYLLABI);
    expect(listed.map((s) => s.filename)).not.toContain("old.pdf");
    await sql`DELETE FROM syllabi`;
  });

  it("shares one schedule per weekend with the class; the latest upload replaces it", async () => {
    const dec = await saveWeekend(sql, "ada", "W-dec.pdf", weekend("2026-12-04", "2026-12-05"));
    await saveWeekend(sql, "ada", "W-nov.pdf", weekend("2026-11-13", "2026-11-14"));
    await saveWeekend(sql, "alan", "W-dec-v2.pdf", weekend("2026-12-04", "2026-12-05", "Updated"));

    const forAda = await listWeekends(sql, "ada");
    expect(forAda.map((w) => [w.start, w.end, w.filename, w.mine])).toEqual([
      ["2026-11-13", "2026-11-14", "W-nov.pdf", true],
      ["2026-12-04", "2026-12-05", "W-dec-v2.pdf", false],
    ]);
    expect(forAda[1]!.id).toBe(dec!.id);
    expect(forAda[1]!.schedule.title).toBe("Updated");
    expect(await listWeekends(sql, "grace")).toHaveLength(2);

    // Alan uploaded the current December schedule, so only he can remove it.
    expect(await deleteWeekend(sql, "ada", dec!.id)).toBe(false);
    expect(await deleteWeekend(sql, "alan", dec!.id)).toBe(true);
    expect((await listWeekends(sql, "grace")).map((w) => w.start)).toEqual(["2026-11-13"]);
    await sql`DELETE FROM weekends`;
  });

  it("doesn't save a weekend without dates, and keeps only the latest MAX_WEEKENDS", async () => {
    expect(await saveWeekend(sql, "grace", "x.pdf", { ...weekend("2026-01-01", "2026-01-01"), items: [] })).toBeNull();
    for (let i = 0; i <= MAX_WEEKENDS; i++) {
      const day = `2027-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;
      await saveWeekend(sql, "grace", `${i}.pdf`, weekend(day, day));
    }
    const kept = await listWeekends(sql, "grace");
    expect(kept).toHaveLength(MAX_WEEKENDS);
    expect(kept[0]!.filename).toBe("1.pdf"); // the earliest was dropped
  });

  it("adds events in date order, cleaned, and records answers, per user", async () => {
    const [diwali, mixer] = await addEvents(sql, "ada", [
      event(),
      event({ title: "Club mixer", date: "2026-11-05", link: "javascript:alert(1)" }),
    ]);
    await addEvents(sql, "alan", [event({ title: "Alan's party" })]);

    expect((await listEvents(sql, "ada")).map((e) => [e.event.title, e.rsvp])).toEqual([
      ["Club mixer", null],
      ["Diwali celebration", null],
    ]);
    expect(mixer!.event.link).toBeNull();

    expect(await setRsvp(sql, "ada", diwali!.id, "going")).toBe(true);
    expect(await setRsvp(sql, "alan", diwali!.id, "maybe")).toBe(false);
    expect(await setRsvp(sql, "ada", diwali!.id, "yes" as never)).toBe(false);
    expect((await listEvents(sql, "ada")).find((e) => e.id === diwali!.id)!.rsvp).toBe("going");

    expect(await deleteEvent(sql, "alan", mixer!.id)).toBe(false);
    expect(await deleteEvent(sql, "ada", mixer!.id)).toBe(true);
    expect((await listEvents(sql, "ada")).map((e) => e.event.title)).toEqual(["Diwali celebration"]);
  });

  it("saves none of a batch with an invalid event", async () => {
    await expect(addEvents(sql, "grace", [event(), event({ date: "someday" })])).rejects.toBeInstanceOf(EventError);
    expect(await listEvents(sql, "grace")).toEqual([]);
  });
});

/** A weekend with a class on `start` and one on `end`. */
function weekend(start: string, end: string, title = "Class weekend"): WeekendSchedule {
  const item = (date: string): ScheduleItem => ({
    date,
    start: "09:00",
    end: "12:00",
    kind: "class",
    title: "FNCE 6130",
    course: null,
    instructor: null,
    location: null,
    section: null,
    signupOnly: false,
    notes: null,
  });
  return { title, program: null, sections: [], items: [item(start), item(end)], logistics: [], upcoming: [], warnings: [] };
}

// Databases from before syllabi and weekends were shared had a copy per student.
describe.skipIf(!databaseUrl)("schema.sql on an older database (Postgres)", () => {
  const oldSchema = `wembasync_old_test_${Date.now()}`;
  let old: Sql;

  afterAll(async () => {
    await old?.end();
    const cleanup = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${oldSchema} CASCADE`);
    await cleanup.end();
  });

  it("keeps the latest copy of each course and weekend, then shares them", async () => {
    const setup = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await setup.unsafe(`CREATE SCHEMA ${oldSchema}`);
    await setup.end();
    old = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: oldSchema } });
    await old.unsafe(`
      CREATE TABLE syllabi (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, course_key TEXT NOT NULL,
        filename TEXT NOT NULL, syllabus JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (user_id, course_key));
      CREATE TABLE weekends (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, start_date TEXT NOT NULL,
        end_date TEXT NOT NULL, filename TEXT NOT NULL, schedule JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, start_date));
    `);
    const fnce = old.json(syllabus());
    await old`INSERT INTO syllabi (user_id, course_key, filename, syllabus, updated_at) VALUES
      ('ada', 'fnce6130', 'ada.pdf', ${fnce}, NOW() - INTERVAL '2 days'),
      ('alan', 'fnce6130', 'alan.pdf', ${fnce}, NOW() - INTERVAL '1 day')`;
    const nov = old.json(weekend("2026-11-13", "2026-11-14"));
    await old`INSERT INTO weekends (user_id, start_date, end_date, filename, schedule, updated_at) VALUES
      ('ada', '2026-11-13', '2026-11-14', 'ada.pdf', ${nov}, NOW()),
      ('alan', '2026-11-13', '2026-11-14', 'alan.pdf', ${nov}, NOW() - INTERVAL '1 day')`;

    await old.unsafe(schemaSql);
    await old.unsafe(schemaSql); // and again, as every deploy does

    expect((await listSyllabi(old, "ada")).map((s) => [s.filename, s.mine])).toEqual([["alan.pdf", false]]);
    expect((await listWeekends(old, "ada")).map((w) => [w.filename, w.mine])).toEqual([["ada.pdf", true]]);
    // Now shared: a classmate's upload replaces the class's copy.
    await saveSyllabus(old, "grace", "grace.pdf", syllabus());
    expect((await listSyllabi(old, "ada")).map((s) => s.filename)).toEqual(["grace.pdf"]);
  });
});

describe("weekendRange and currentWeekend", () => {
  it("finds a weekend's dates, ignoring malformed ones", () => {
    const w = weekend("2026-11-14", "2026-11-13");
    expect(weekendRange({ ...w, items: [...w.items, { ...w.items[0]!, date: "Nov 15" }] })).toEqual({
      start: "2026-11-13",
      end: "2026-11-14",
    });
  });

  it("picks the first weekend that hasn't ended, else the latest", () => {
    const weekends = [{ end: "2026-11-14" }, { end: "2026-12-05" }];
    expect(currentWeekend(weekends, "2026-11-14")).toBe(weekends[0]);
    expect(currentWeekend(weekends, "2026-11-15")).toBe(weekends[1]);
    expect(currentWeekend(weekends, "2027-01-01")).toBe(weekends[1]);
    expect(currentWeekend([], "2027-01-01")).toBeUndefined();
  });
});
