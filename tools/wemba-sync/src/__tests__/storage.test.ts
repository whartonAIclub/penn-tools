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

  it("saves, lists and replaces a course's syllabus, per user", async () => {
    const saved = await saveSyllabus(sql, "ada", "FNCE.pdf", syllabus());
    expect(saved.syllabus.title).toBe("Corporate Finance");

    // The same course again, with its code written differently: replaces it.
    await saveSyllabus(sql, "ada", "FNCE-v2.pdf", syllabus({ courseCode: "fnce6130", term: "Fall 2026 (rev.)" }));
    await saveSyllabus(sql, "ada", "STAT.pdf", syllabus({ courseCode: "STAT 6130", title: "Statistics" }));
    await saveSyllabus(sql, "alan", "MGMT.pdf", syllabus({ courseCode: "MGMT 6110", title: "Leadership" }));

    const ada = await listSyllabi(sql, "ada");
    expect(ada.map((s) => [s.filename, s.syllabus.term])).toEqual([
      ["FNCE-v2.pdf", "Fall 2026 (rev.)"],
      ["STAT.pdf", "Fall 2026"],
    ]);
    expect(ada[0]!.id).toBe(saved.id);
    expect((await listSyllabi(sql, "alan")).map((s) => s.filename)).toEqual(["MGMT.pdf"]);
  });

  it("deletes only the user's own syllabus", async () => {
    const [stat] = (await listSyllabi(sql, "ada")).filter((s) => s.filename === "STAT.pdf");
    expect(await deleteSyllabus(sql, "alan", stat!.id)).toBe(false);
    expect(await deleteSyllabus(sql, "ada", "not-a-uuid")).toBe(false);
    expect(await deleteSyllabus(sql, "ada", stat!.id)).toBe(true);
    expect((await listSyllabi(sql, "ada")).map((s) => s.filename)).toEqual(["FNCE-v2.pdf"]);
  });

  it("refuses a new course past the limit, but still replaces an existing one", async () => {
    for (let i = 0; i < MAX_SYLLABI; i++) {
      await saveSyllabus(sql, "grace", `${i}.pdf`, syllabus({ courseCode: `TEST ${i}` }));
    }
    await expect(saveSyllabus(sql, "grace", "new.pdf", syllabus({ courseCode: "NEW 1" }))).rejects.toBeInstanceOf(
      TooManySyllabiError,
    );
    await expect(saveSyllabus(sql, "grace", "0b.pdf", syllabus({ courseCode: "TEST 0" }))).resolves.toBeTruthy();
  });

  it("skips rows that no longer match the schema", async () => {
    await sql`INSERT INTO syllabi (user_id, course_key, filename, syllabus) VALUES ('ada', 'old', 'old.pdf', ${sql.json({ title: 1 })})`;
    expect((await listSyllabi(sql, "ada")).map((s) => s.filename)).toEqual(["FNCE-v2.pdf"]);
  });

  it("saves weekends by first date, replacing an updated schedule, per user", async () => {
    const dec = await saveWeekend(sql, "ada", "W-dec.pdf", weekend("2026-12-04", "2026-12-05"));
    await saveWeekend(sql, "ada", "W-nov.pdf", weekend("2026-11-13", "2026-11-14"));
    await saveWeekend(sql, "ada", "W-dec-v2.pdf", weekend("2026-12-04", "2026-12-05", "Updated"));
    await saveWeekend(sql, "alan", "W-nov.pdf", weekend("2026-11-13", "2026-11-14"));

    const ada = await listWeekends(sql, "ada");
    expect(ada.map((w) => [w.start, w.end, w.filename])).toEqual([
      ["2026-11-13", "2026-11-14", "W-nov.pdf"],
      ["2026-12-04", "2026-12-05", "W-dec-v2.pdf"],
    ]);
    expect(ada[1]!.id).toBe(dec!.id);
    expect(ada[1]!.schedule.title).toBe("Updated");
    expect(await listWeekends(sql, "alan")).toHaveLength(1);

    expect(await deleteWeekend(sql, "alan", dec!.id)).toBe(false);
    expect(await deleteWeekend(sql, "ada", dec!.id)).toBe(true);
    expect((await listWeekends(sql, "ada")).map((w) => w.start)).toEqual(["2026-11-13"]);
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
