// Checklist engine tables against a throwaway schema (skipped when no
// database is configured).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { rescheduleEvent, dueDate } from "../checklist.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_chk_test_${Date.now()}`;

describe.skipIf(!databaseUrl)("checklist schema", () => {
  let admin: Sql;
  let sql: Sql;
  let versionId: number;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
    const [row] = await sql<{ id: string }[]>`INSERT INTO template_versions (version) VALUES (1) RETURNING id`;
    versionId = Number(row!.id);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  const insertItem = (key: string, offsetDays: number | null, anchorWeekday: number | null) =>
    sql`INSERT INTO template_items (version_id, key, title, phase, area, offset_days, anchor_weekday)
        VALUES (${versionId}, ${key}, 'T', 'pre', 'general', ${offsetDays}, ${anchorWeekday})`;

  it("creates the checklist tables", async () => {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema}`;
    const names = rows.map((r) => r.table_name);
    for (const t of ["template_versions", "template_modules", "template_items", "event_modules", "tasks", "members"]) {
      expect(names).toContain(t);
    }
  });

  it("schema.sql can be applied twice", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("schema.sql rewrites old role names to slots, once", async () => {
    const [e] = await sql<{ id: string }[]>`
      INSERT INTO events (title, event_type, organizer_name, created_by) VALUES ('R', 'pub', 'O', 'u') RETURNING id`;
    await sql`INSERT INTO event_roles (event_id, position, role, person) VALUES
      (${e!.id}, 0, 'pub leader', 'A'), (${e!.id}, 1, 'C-suite owner', 'B'), (${e!.id}, 2, 'pub leader', 'C')`;
    const read = () => sql<{ role: string; person: string }[]>`
      SELECT role, person FROM event_roles WHERE event_id = ${e!.id} ORDER BY position`;
    const expected = [{ role: "Pub Leader 1", person: "A" }, { role: "CoS Owner", person: "B" }, { role: "Pub Leader 2", person: "C" }];
    await sql.unsafe(schemaSql);
    expect([...(await read())].map((r) => ({ ...r }))).toEqual(expected);
    await sql.unsafe(schemaSql);
    expect([...(await read())].map((r) => ({ ...r }))).toEqual(expected);
  });

  it("re-running schema.sql renames the plural 'Pub Leaders' and recomputes each event's stored leader", async () => {
    const [e] = await sql<{ id: string }[]>`
      INSERT INTO events (title, event_type, organizer_name, created_by, pub_leader)
      VALUES ('Plural', 'pub', 'Diva', 'u', 'Diva') RETURNING id`;
    const [f] = await sql<{ id: string }[]>`
      INSERT INTO events (title, event_type, organizer_name, created_by, pub_leader)
      VALUES ('Led', 'pub', 'Old', 'u', 'Old') RETURNING id`;
    await sql`INSERT INTO event_roles (event_id, position, role, person) VALUES
      (${e!.id}, 0, 'CoS Owner', 'Diva'), (${e!.id}, 1, 'Pub Leaders', NULL),
      (${f!.id}, 0, 'Pub Leaders', 'Ivana')`;
    const state = async (id: string) => {
      const [ev] = await sql<{ pub_leader: string | null; organizer_name: string }[]>`
        SELECT pub_leader, organizer_name FROM events WHERE id = ${id}`;
      const roles = await sql<{ role: string }[]>`SELECT role FROM event_roles WHERE event_id = ${id} ORDER BY position`;
      return { ...ev!, roles: roles.map((r) => r.role) };
    };
    for (let run = 0; run < 2; run++) {
      await sql.unsafe(schemaSql);
      expect(await state(e!.id)).toEqual({ pub_leader: null, organizer_name: "Unassigned", roles: ["CoS Owner", "Pub Leader 1"] });
      expect(await state(f!.id)).toEqual({ pub_leader: "Ivana", organizer_name: "Ivana", roles: ["Pub Leader 1"] });
    }
  });

  it("rejects an item with both an offset and a weekday anchor", async () => {
    await expect(insertItem("both", -3, 1)).rejects.toThrow();
  });

  it("rejects a weekday above 6", async () => {
    await expect(insertItem("wk", null, 7)).rejects.toThrow();
  });

  it("rejects a task with a bad status", async () => {
    await expect(sql`INSERT INTO tasks (title, status) VALUES ('x', 'bogus')`).rejects.toThrow();
  });

  it("a task's owner defaults to Unassigned", async () => {
    const [row] = await sql<{ owner: string }[]>`INSERT INTO tasks (title) VALUES ('y') RETURNING owner`;
    expect(row!.owner).toBe("Unassigned");
  });

  it("member names are unique ignoring case", async () => {
    await sql`INSERT INTO members (name) VALUES ('Diva')`;
    await expect(sql`INSERT INTO members (name) VALUES ('diva')`).rejects.toThrow();
  });

  describe("task uniqueness per event and template item", () => {
    const mkEvent = async () => {
      const [e] = await sql<{ id: string }[]>`
        INSERT INTO events (title, event_type, organizer_name, created_by) VALUES ('E', 'pub', 'O', 'u') RETURNING id`;
      return e!.id;
    };
    const mkTask = (eventId: string | null, key: string | null) =>
      sql`INSERT INTO tasks (event_id, template_item_key, title) VALUES (${eventId}, ${key}, 't')`;

    it("rejects a second task for the same event and template item", async () => {
      const id = await mkEvent();
      await mkTask(id, "dup");
      await expect(mkTask(id, "dup")).rejects.toMatchObject({ code: "23505" });
    });

    it("lets two events each have a task for the same template item", async () => {
      const a = await mkEvent();
      const b = await mkEvent();
      await mkTask(a, "same");
      await expect(mkTask(b, "same")).resolves.toBeDefined();
    });

    it("allows many manual tasks (no template item) on one event", async () => {
      const id = await mkEvent();
      await mkTask(id, null);
      await expect(mkTask(id, null)).resolves.toBeDefined();
    });

    it("allows many ongoing to-dos (no event)", async () => {
      await mkTask(null, "todo-key");
      await expect(mkTask(null, "todo-key")).resolves.toBeDefined();
      await mkTask(null, null);
      await expect(mkTask(null, null)).resolves.toBeDefined();
    });

    it("applying schema.sql twice still works", async () => {
      await sql.unsafe(schemaSql);
      await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
    });
  });

  describe("template and task amendments", () => {
    const insertItemWith = (key: string, phase: string | null, area: string | null, repeatFor: string | null = null) =>
      sql`INSERT INTO template_items (version_id, key, title, phase, area, repeat_for)
          VALUES (${versionId}, ${key}, 'T', ${phase}, ${area}, ${repeatFor})`;

    it("accepts the partners area and the skipped status", async () => {
      await expect(insertItemWith("partners-item", "pre", "partners")).resolves.toBeDefined();
      await expect(sql`INSERT INTO tasks (title, area) VALUES ('p', 'partners')`).resolves.toBeDefined();
      await expect(sql`INSERT INTO tasks (title, status) VALUES ('s', 'skipped')`).resolves.toBeDefined();
    });

    it("rejects a bad task phase, a bad task area and a template item without a phase", async () => {
      await expect(sql`INSERT INTO tasks (title, phase) VALUES ('x', 'bogus')`).rejects.toMatchObject({ code: "23514" });
      await expect(sql`INSERT INTO tasks (title, area) VALUES ('x', 'bogus')`).rejects.toMatchObject({ code: "23514" });
      await expect(insertItemWith("nophase", null, "general")).rejects.toMatchObject({ code: "23502" });
      await expect(insertItemWith("noarea", "pre", null)).rejects.toMatchObject({ code: "23502" });
    });

    it("allows a task with no phase or area", async () => {
      await expect(sql`INSERT INTO tasks (title) VALUES ('manual')`).resolves.toBeDefined();
    });

    it("has the new columns", async () => {
      const cols = async (table: string) =>
        (await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${schema} AND table_name = ${table}`).map((r) => r.column_name);
      const items = await cols("template_items");
      expect(items).toContain("repeat_for");
      expect(items).toContain("time_hint");
      const tasks = await cols("tasks");
      expect(tasks).toContain("time_hint");
      expect(tasks).toContain("partner");
    });

    it("rejects a repeat_for other than partner_club", async () => {
      await expect(insertItemWith("rf-bad", "pre", "general", "vendor")).rejects.toMatchObject({ code: "23514" });
      await expect(insertItemWith("rf-ok", "pre", "general", "partner_club")).resolves.toBeDefined();
    });

    it("template_issues defaults to open, rejects a bad status, and is removed with its version", async () => {
      const [v] = await sql<{ id: string }[]>`INSERT INTO template_versions (version) VALUES (900) RETURNING id`;
      const id = Number(v!.id);
      const [issue] = await sql<{ status: string }[]>`
        INSERT INTO template_issues (version_id, text) VALUES (${id}, 'missing') RETURNING status`;
      expect(issue!.status).toBe("open");
      await expect(sql`INSERT INTO template_issues (version_id, text, status) VALUES (${id}, 'x', 'bogus')`)
        .rejects.toMatchObject({ code: "23514" });
      await sql`DELETE FROM template_versions WHERE id = ${id}`;
      const rows = await sql`SELECT 1 FROM template_issues WHERE version_id = ${id}`;
      expect(rows.length).toBe(0);
    });
  });

  describe("re-applying schema.sql over rows written before the constraints", () => {
    it("repairs old rows instead of failing, and the constraints are back in force", async () => {
      const [v] = await sql<{ id: string }[]>`INSERT INTO template_versions (version) VALUES (950) RETURNING id`;
      const vid = Number(v!.id);
      // Recreate the old state.
      await sql.unsafe(`ALTER TABLE template_items ALTER COLUMN phase DROP NOT NULL`);
      await sql.unsafe(`ALTER TABLE template_items ALTER COLUMN area DROP NOT NULL`);
      await sql.unsafe(`ALTER TABLE tasks DROP CONSTRAINT tasks_phase_check`);
      await sql.unsafe(`ALTER TABLE tasks DROP CONSTRAINT tasks_area_check`);
      await sql`INSERT INTO template_items (version_id, key, title, phase, area) VALUES (${vid}, 'old', 'T', NULL, NULL)`;
      const [t] = await sql<{ id: string }[]>`
        INSERT INTO tasks (title, phase, area) VALUES ('old', 'bogus', 'bogus') RETURNING id`;

      await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();

      const [item] = await sql<{ phase: string; area: string }[]>`
        SELECT phase, area FROM template_items WHERE version_id = ${vid} AND key = 'old'`;
      expect(item).toEqual({ phase: "pre", area: "general" });
      const [task] = await sql<{ phase: string | null; area: string | null }[]>`
        SELECT phase, area FROM tasks WHERE id = ${t!.id}`;
      expect(task).toEqual({ phase: null, area: null });
      await expect(sql`INSERT INTO tasks (title, phase) VALUES ('x', 'bogus')`).rejects.toMatchObject({ code: "23514" });
      await expect(sql`INSERT INTO tasks (title, area) VALUES ('x', 'bogus')`).rejects.toMatchObject({ code: "23514" });
      await expect(sql`INSERT INTO template_items (version_id, key, title, phase, area) VALUES (${vid}, 'n', 'T', NULL, 'general')`)
        .rejects.toMatchObject({ code: "23502" });
    });
  });

  describe("rescheduleEvent", () => {
    let versionCounter = 100;
    const newVersion = async (items: [string, number | null, number | null][]) => {
      const [v] = await sql<{ id: string }[]>`
        INSERT INTO template_versions (version) VALUES (${++versionCounter}) RETURNING id`;
      const id = Number(v!.id);
      for (const [key, offset, weekday] of items) {
        await sql`INSERT INTO template_items (version_id, key, title, phase, area, offset_days, anchor_weekday)
                  VALUES (${id}, ${key}, 'T', 'pre', 'general', ${offset}, ${weekday})`;
      }
      return id;
    };
    const newEvent = async (date: string | null, version: number | null) => {
      const [e] = await sql<{ id: string }[]>`
        INSERT INTO events (title, event_type, event_date, organizer_name, created_by, template_version_id)
        VALUES ('E', 'pub', ${date}, 'O', 'u', ${version}) RETURNING id`;
      return e!.id;
    };
    const newTask = async (
      eventId: string | null, key: string, offset: number | null, status = "todo",
    ) => {
      await sql`INSERT INTO tasks (event_id, template_item_key, title, offset_days, status)
                VALUES (${eventId}, ${key}, ${key}, ${offset}, ${status})`;
    };
    const taskOf = async (eventId: string, key: string) => {
      const [t] = await sql<{ offset_days: number | null; due_date: string | null }[]>`
        SELECT offset_days, due_date::text FROM tasks WHERE event_id = ${eventId} AND template_item_key = ${key}`;
      expect(t!.due_date).toBeNull(); // never written for event tasks
      return t!.offset_days;
    };
    const dateOf = async (eventId: string) => {
      const [e] = await sql<{ d: string | null }[]>`SELECT event_date::text AS d FROM events WHERE id = ${eventId}`;
      return e!.d;
    };

    it("moves the event and counts unfinished tasks whose due date changed", async () => {
      const v = await newVersion([["a", -7, null], ["b", 2, null], ["c", -1, null]]);
      const id = await newEvent("2026-10-22", v);
      await newTask(id, "a", -7);
      await newTask(id, "b", 2);
      await newTask(id, "c", -1, "done");
      const r = await rescheduleEvent(sql, id, "2026-10-29");
      expect(r).toEqual({ from: "2026-10-22", to: "2026-10-29", moved: 2, recomputed: 0 });
      expect(await dateOf(id)).toBe("2026-10-29");
      expect(await taskOf(id, "a")).toBe(-7);
      expect(dueDate("2026-10-29", -7)).toBe("2026-10-22");
      expect(await taskOf(id, "c")).toBe(-1);
    });

    it("recomputes unfinished weekday-anchored tasks for the new weekday", async () => {
      const v = await newVersion([["mon", null, 1]]);
      const id = await newEvent("2026-10-22", v);
      await newTask(id, "mon", -3);
      const r = await rescheduleEvent(sql, id, "2026-10-23");
      expect(r).toEqual({ from: "2026-10-22", to: "2026-10-23", moved: 0, recomputed: 1 });
      expect(await taskOf(id, "mon")).toBe(-4);
    });

    it("recomputes a weekday-anchored task that repeats per club (key 'item:club')", async () => {
      const v = await newVersion([["mon", null, 1]]);
      const id = await newEvent("2026-10-22", v);
      await newTask(id, "mon:ski-club", -3);
      const r = await rescheduleEvent(sql, id, "2026-10-23");
      expect(r.recomputed).toBe(1);
      expect(await taskOf(id, "mon:ski-club")).toBe(-4);
    });

    it("leaves done tasks alone", async () => {
      const v = await newVersion([["mon", null, 1]]);
      const id = await newEvent("2026-10-22", v);
      await newTask(id, "mon", -3, "done");
      const r = await rescheduleEvent(sql, id, "2026-10-23");
      expect(r.recomputed).toBe(0);
      expect(r.moved).toBe(0);
      expect(await taskOf(id, "mon")).toBe(-3);
    });

    it("moving by zero days changes nothing", async () => {
      const v = await newVersion([["a", 1, null]]);
      const id = await newEvent("2026-10-22", v);
      await newTask(id, "a", 1);
      expect(await rescheduleEvent(sql, id, "2026-10-22")).toEqual({
        from: "2026-10-22", to: "2026-10-22", moved: 0, recomputed: 0,
      });
    });

    it("a blank date keeps offsets; a date after that restores due dates", async () => {
      const v = await newVersion([["a", 2, null], ["mon", null, 1]]);
      const id = await newEvent("2026-10-22", v);
      await newTask(id, "a", 2);
      await newTask(id, "mon", -3);
      const blank = await rescheduleEvent(sql, id, null);
      expect(blank).toEqual({ from: "2026-10-22", to: null, moved: 2, recomputed: 0 });
      expect(await dateOf(id)).toBeNull();
      expect(await taskOf(id, "a")).toBe(2);
      expect(await taskOf(id, "mon")).toBe(-3);
      const back = await rescheduleEvent(sql, id, "2026-10-23");
      expect(back).toEqual({ from: null, to: "2026-10-23", moved: 2, recomputed: 1 });
      expect(await taskOf(id, "a")).toBe(2);
      expect(await taskOf(id, "mon")).toBe(-4);
    });

    it("an event with no template version: anchored tasks are left alone, no error", async () => {
      const id = await newEvent("2026-10-22", null);
      await newTask(id, "mon", -3);
      const r = await rescheduleEvent(sql, id, "2026-10-23");
      expect(r).toEqual({ from: "2026-10-22", to: "2026-10-23", moved: 1, recomputed: 0 });
      expect(await taskOf(id, "mon")).toBe(-3);
    });

    it("an unknown or malformed id returns zeros; an invalid newDate throws and changes nothing", async () => {
      const zeros = { from: null, to: null, moved: 0, recomputed: 0 };
      expect(await rescheduleEvent(sql, "00000000-0000-4000-8000-000000000000", "2026-10-29")).toEqual(zeros);
      expect(await rescheduleEvent(sql, "not-a-uuid", "2026-10-29")).toEqual(zeros);
      const id = await newEvent("2026-10-22", null);
      await expect(rescheduleEvent(sql, id, "2026-02-30")).rejects.toThrow(RangeError);
      expect(await dateOf(id)).toBe("2026-10-22");
    });
    it("leaves another event's tasks and ongoing to-dos untouched", async () => {
      const v = await newVersion([["mon", null, 1]]);
      const id = await newEvent("2026-10-22", v);
      const other = await newEvent("2026-10-22", v);
      await newTask(id, "mon", -3);
      await newTask(other, "mon", -3);
      await newTask(null, "mon", -3);
      await sql`UPDATE tasks SET due_date = '2026-12-01' WHERE event_id IS NULL`;
      await rescheduleEvent(sql, id, "2026-10-23");
      expect(await taskOf(id, "mon")).toBe(-4);
      expect(await taskOf(other, "mon")).toBe(-3);
      const [todo] = await sql<{ offset_days: number; due: string }[]>`
        SELECT offset_days, due_date::text AS due FROM tasks WHERE event_id IS NULL AND template_item_key = 'mon'`;
      expect(todo).toEqual({ offset_days: -3, due: "2026-12-01" });
    });
  });
});
