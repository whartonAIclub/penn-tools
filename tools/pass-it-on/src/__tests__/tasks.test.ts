// Task storage against a throwaway schema (skipped when no database is configured).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { createEventTasks, listTasks, updateTask, createTodo, deleteTask, MAX_TASK_TITLE } from "../tasks.js";
import type { TaskStatus } from "../tasks.js";
import type { TaskDraft } from "../checklist.js";
import { ensureTemplate } from "../pubTemplate.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_tasks_test_${Date.now()}`;

const draft = (key: string, over: Partial<TaskDraft> = {}): TaskDraft => ({
  templateItemKey: key,
  parentKey: null,
  title: `Task ${key}`,
  phase: "pre",
  area: "general",
  offsetDays: -7,
  owner: "Unassigned",
  isPostmortem: false,
  notes: null,
  timeHint: null,
  partner: null,
  source: "template",
  confirmed: false,
  ...over,
});

describe.skipIf(!databaseUrl)("task storage", () => {
  let admin: Sql;
  let sql: Sql;
  let versionId: number;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
    versionId = await ensureTemplate(sql);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  const mkEvent = async (date: string | null = "2026-03-20") => {
    const [e] = await sql<{ id: string }[]>`
      INSERT INTO events (title, event_type, organizer_name, created_by, event_date)
      VALUES ('E', 'pub', 'O', 'u', ${date}) RETURNING id`;
    return e!.id;
  };
  const count = async (eventId: string) => {
    const [r] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM tasks WHERE event_id = ${eventId}`;
    return r!.n;
  };

  it("createEventTasks inserts drafts, parents before children, and links each child to its parent", async () => {
    const id = await mkEvent();
    const drafts = [
      draft("child", { parentKey: "parent" }),
      draft("parent"),
      draft("club-child:a", { parentKey: "club:a", partner: "A" }),
      draft("club:a", { partner: "A", area: "partners", timeHint: "EOD", owner: "Sam", notes: "n", isPostmortem: true }),
    ];
    expect(await createEventTasks(sql, id, drafts)).toBe(4);
    const rows = await sql<{ key: string; parent: string | null }[]>`
      SELECT c.template_item_key AS key, p.template_item_key AS parent
      FROM tasks c LEFT JOIN tasks p ON p.id = c.parent_task_id WHERE c.event_id = ${id}`;
    const parentOf = Object.fromEntries(rows.map((r) => [r.key, r.parent]));
    expect(parentOf).toEqual({ child: "parent", parent: null, "club-child:a": "club:a", "club:a": null });
    const [club] = await listTasks(sql, { eventIds: [id] }).then((t) => t.filter((x) => x.templateItemKey === "club:a"));
    expect(club).toMatchObject({
      partner: "A", area: "partners", timeHint: "EOD", owner: "Sam", notes: "n", isPostmortem: true,
      source: "template", confirmed: false, phase: "pre", offsetDays: -7, status: "todo",
    });
  });

  it("createEventTasks twice adds nothing the second time and returns 0", async () => {
    const id = await mkEvent();
    const opts = { templateVersionId: versionId, moduleKeys: ["club-collab"] };
    expect(await createEventTasks(sql, id, [draft("a"), draft("b", { parentKey: "a" })], opts)).toBe(2);
    expect(await createEventTasks(sql, id, [draft("a"), draft("b", { parentKey: "a" })], opts)).toBe(0);
    expect(await count(id)).toBe(2);
    const [e] = await sql<{ v: string }[]>`SELECT template_version_id::text AS v FROM events WHERE id = ${id}`;
    expect(Number(e!.v)).toBe(versionId);
    const mods = await sql`SELECT * FROM event_modules WHERE event_id = ${id}`;
    expect(mods).toHaveLength(1);
  });

  it("createEventTasks links a child to a parent created by an earlier run", async () => {
    const id = await mkEvent();
    await createEventTasks(sql, id, [draft("p")]);
    expect(await createEventTasks(sql, id, [draft("p"), draft("c", { parentKey: "p" })])).toBe(1);
    const [r] = await sql<{ parent: string | null }[]>`
      SELECT p.template_item_key AS parent FROM tasks c JOIN tasks p ON p.id = c.parent_task_id
      WHERE c.event_id = ${id} AND c.template_item_key = 'c'`;
    expect(r!.parent).toBe("p");
  });

  it("createEventTasks leaves an unknown parent null and rejects an unknown event", async () => {
    const id = await mkEvent();
    expect(await createEventTasks(sql, id, [draft("orphan", { parentKey: "nope" })])).toBe(1);
    const [r] = await sql<{ p: string | null }[]>`SELECT parent_task_id AS p FROM tasks WHERE event_id = ${id}`;
    expect(r!.p).toBeNull();
    await expect(createEventTasks(sql, "00000000-0000-4000-8000-000000000000", [draft("x")])).rejects.toBeInstanceOf(RangeError);
    await expect(createEventTasks(sql, "not-a-uuid", [draft("x")])).rejects.toBeInstanceOf(RangeError);
  });

  it("listTasks computes due dates from the event date and the offset, and uses due_date for ongoing to-dos", async () => {
    const id = await mkEvent("2026-03-20");
    const undatedEvent = await mkEvent(null);
    await createEventTasks(sql, id, [draft("a", { offsetDays: -7 }), draft("noff", { offsetDays: null })]);
    await createEventTasks(sql, undatedEvent, [draft("u", { offsetDays: 2 })]);
    const ongoing = await createTodo(sql, { title: "Ongoing", dueDate: "2026-05-01" });
    const rows = await listTasks(sql, { eventIds: [id, undatedEvent] });
    const by = Object.fromEntries(rows.map((r) => [r.templateItemKey, r]));
    expect(by["a"]).toMatchObject({ dueDate: "2026-03-13", eventDate: "2026-03-20", eventTitle: "E", eventId: id });
    expect(by["noff"]!.dueDate).toBeNull();
    expect(by["u"]!.dueDate).toBeNull();
    const all = await listTasks(sql);
    const og = all.find((r) => r.id === ongoing)!;
    expect(og).toMatchObject({ dueDate: "2026-05-01", eventId: null, eventTitle: null, eventDate: null, source: "manual" });
    expect(typeof og.id).toBe("number");
  });

  it("listTasks filters by owner (ignoring case), window (inclusive at both ends), event, and status; undated tasks only when no window is given or includeUndated is true", async () => {
    const id = await mkEvent("2026-06-20");
    const other = await mkEvent("2026-06-20");
    await createEventTasks(sql, id, [
      draft("m10", { offsetDays: -10, owner: "Ann" }),
      draft("m5", { offsetDays: -5, owner: "Bob" }),
      draft("m0", { offsetDays: 0, owner: "ann" }),
      draft("p3", { offsetDays: 3, owner: "Ann" }),
      draft("none", { offsetDays: null, owner: "Ann" }),
    ]);
    await createEventTasks(sql, other, [draft("o", { offsetDays: -5, owner: "Ann" })]);
    const keys = async (f: Parameters<typeof listTasks>[1]) =>
      (await listTasks(sql, { eventIds: [id], ...f })).map((r) => r.templateItemKey);

    expect(await keys({ owner: "ANN" })).toEqual(["m10", "m0", "p3", "none"]);
    expect(await keys({ from: "2026-06-10", to: "2026-06-20" })).toEqual(["m10", "m5", "m0"]);
    expect(await keys({ from: "2026-06-15" })).toEqual(["m5", "m0", "p3"]);
    expect(await keys({ to: "2026-06-15" })).toEqual(["m10", "m5"]);
    expect(await keys({ from: "2026-06-15", to: "2026-06-15", includeUndated: true })).toEqual(["m5", "none"]);
    expect(await keys({ owner: "ann", from: "2026-06-10", to: "2026-06-20", includeUndated: true })).toEqual(["m10", "m0", "none"]);
    expect(await keys({})).toHaveLength(5);
    expect(await keys({ eventIds: [] })).toEqual([]);
    expect((await listTasks(sql, { eventIds: [other] })).map((r) => r.templateItemKey)).toEqual(["o"]);
    await sql`UPDATE tasks SET status = 'done' WHERE event_id = ${id} AND template_item_key = 'm5'`;
    const statuses: TaskStatus[] = ["done"];
    expect(await keys({ statuses })).toEqual(["m5"]);
    expect(await keys({ statuses: ["todo", "doing"] })).toHaveLength(4);
    await expect(listTasks(sql, { from: "2026-02-30" })).rejects.toBeInstanceOf(RangeError);
    await expect(listTasks(sql, { to: "soon" })).rejects.toBeInstanceOf(RangeError);
  });

  it("listTasks orders by due date, then offset, with undated last", async () => {
    const a = await mkEvent("2026-07-10");
    const b = await mkEvent("2026-07-20");
    const c = await mkEvent(null);
    // Same due date 2026-07-10: event a offset 0, event b offset -10.
    await createEventTasks(sql, a, [draft("a0", { offsetDays: 0 }), draft("a-5", { offsetDays: -5 })]);
    await createEventTasks(sql, b, [draft("b-10", { offsetDays: -10 })]);
    await createEventTasks(sql, c, [draft("c", { offsetDays: 1 })]);
    await createTodo(sql, { title: "undated" });
    const rows = await listTasks(sql, { eventIds: [a, b, c] });
    expect(rows.map((r) => r.templateItemKey)).toEqual(["a-5", "b-10", "a0", "c"]);
    const all = await listTasks(sql);
    expect(all[all.length - 1]!.dueDate).toBeNull();
    const dated = all.filter((r) => r.dueDate !== null).map((r) => r.dueDate!);
    expect(dated).toEqual([...dated].sort());
  });

  // Ids are compared as numbers, not text: a tie on due date and offset keeps
  // creation order even when the ids straddle a digit boundary (9 -> 10, 99 -> 100).
  it("listTasks breaks ties by numeric id across a digit boundary (event, undated and ongoing tasks)", async () => {
    const straddle = async () => {
      const [m] = await sql<{ max: string | null }[]>`SELECT MAX(id)::text AS max FROM tasks`;
      let boundary = 10;
      while (boundary <= Number(m!.max ?? 0) + 4) boundary *= 10;
      await sql.unsafe(`ALTER TABLE tasks ALTER COLUMN id RESTART WITH ${boundary - 3}`);
    };
    const ascending = (ids: number[]) => expect(ids).toEqual([...ids].sort((a, b) => a - b));

    await straddle();
    const e = await mkEvent("2026-11-01");
    await createEventTasks(sql, e, ["a", "b", "c", "d", "e", "f"].map((k) => draft(k, { offsetDays: -2 })));
    const eventIds = (await listTasks(sql, { eventIds: [e] })).map((r) => r.id);
    expect(eventIds).toHaveLength(6);
    expect(Math.min(...eventIds).toString().length).toBeLessThan(Math.max(...eventIds).toString().length);
    ascending(eventIds);

    await straddle();
    const u = await mkEvent(null);
    await createEventTasks(sql, u, ["a", "b", "c", "d", "e", "f"].map((k) => draft(k, { offsetDays: 4 })));
    const undated = (await listTasks(sql, { eventIds: [u] })).map((r) => r.id);
    expect(Math.min(...undated).toString().length).toBeLessThan(Math.max(...undated).toString().length);
    ascending(undated);

    await straddle();
    for (let i = 0; i < 6; i++) await createTodo(sql, { title: `tie ${i}`, owner: "TieOwner", dueDate: "2027-01-01" });
    const ongoing = (await listTasks(sql, { owner: "TieOwner" })).map((r) => r.id);
    expect(ongoing).toHaveLength(6);
    expect(Math.min(...ongoing).toString().length).toBeLessThan(Math.max(...ongoing).toString().length);
    ascending(ongoing);
  });

  it("updateTask sets completed_at when done and clears it when the task leaves done; skipped doesn't set it", async () => {
    const id = await createTodo(sql, { title: "t" });
    const get = async () => (await listTasks(sql)).find((r) => r.id === id)!;
    expect(await updateTask(sql, id, { status: "done" })).toBe(true);
    const first = (await get()).completedAt;
    expect(first).not.toBeNull();
    await updateTask(sql, id, { status: "done" });
    expect((await get()).completedAt).toBe(first);
    await updateTask(sql, id, { status: "doing" });
    expect((await get()).completedAt).toBeNull();
    await updateTask(sql, id, { status: "skipped" });
    expect(await get()).toMatchObject({ status: "skipped", completedAt: null });
    await updateTask(sql, id, { status: "done" });
    await updateTask(sql, id, { status: "skipped" });
    expect((await get()).completedAt).toBeNull();
  });

  it("updateTask changes only the fields given and can clear nullable ones", async () => {
    const id = await createTodo(sql, { title: "t", owner: "Ann", notes: "n", timeHint: "EOD", dueDate: "2026-08-01" });
    const get = async () => (await listTasks(sql)).find((r) => r.id === id)!;
    await updateTask(sql, id, { title: "  New  ", waitingOn: "Bob", confirmed: true, dueDate: "2026-08-09" });
    expect(await get()).toMatchObject({ title: "New", waitingOn: "Bob", confirmed: true, dueDate: "2026-08-09", owner: "Ann", notes: "n", timeHint: "EOD" });
    await updateTask(sql, id, { notes: null, timeHint: null, waitingOn: null, dueDate: null });
    expect(await get()).toMatchObject({ notes: null, timeHint: null, waitingOn: null, dueDate: null, title: "New", owner: "Ann" });
    expect(await updateTask(sql, id, {})).toBe(true);
    expect(await updateTask(sql, 999999999, {})).toBe(false);
  });

  it("updateTask moves an event task by offset and refuses due dates on event tasks", async () => {
    const e = await mkEvent("2026-09-10");
    await createEventTasks(sql, e, [draft("x", { offsetDays: -1 })]);
    const [t] = await listTasks(sql, { eventIds: [e] });
    await updateTask(sql, t!.id, { offsetDays: -3 });
    expect((await listTasks(sql, { eventIds: [e] }))[0]!.dueDate).toBe("2026-09-07");
    await expect(updateTask(sql, t!.id, { dueDate: "2026-09-01" })).rejects.toBeInstanceOf(RangeError);
    const todo = await createTodo(sql, { title: "o" });
    await expect(updateTask(sql, todo, { offsetDays: 2 })).rejects.toBeInstanceOf(RangeError);
  });

  it("updateTask rejects an unknown status, a blank title and a blank owner; owner null becomes Unassigned; unknown id returns false", async () => {
    const id = await createTodo(sql, { title: "t", owner: "Ann" });
    await expect(updateTask(sql, id, { status: "bogus" as TaskStatus })).rejects.toBeInstanceOf(RangeError);
    await expect(updateTask(sql, id, { title: "   " })).rejects.toBeInstanceOf(RangeError);
    await expect(updateTask(sql, id, { title: "x".repeat(MAX_TASK_TITLE + 1) })).rejects.toBeInstanceOf(RangeError);
    await expect(updateTask(sql, id, { owner: "  " })).rejects.toBeInstanceOf(RangeError);
    await expect(updateTask(sql, id, { dueDate: "2026-13-01" })).rejects.toBeInstanceOf(RangeError);
    expect((await listTasks(sql)).find((r) => r.id === id)).toMatchObject({ title: "t", owner: "Ann" });
    await updateTask(sql, id, { owner: null });
    expect((await listTasks(sql)).find((r) => r.id === id)!.owner).toBe("Unassigned");
    expect(await updateTask(sql, 999999999, { status: "done" })).toBe(false);
  });

  it("createTodo makes an event task (offset) or an ongoing to-do (due date) with source manual; refuses contradictory fields", async () => {
    const e = await mkEvent("2026-10-10");
    const ev = await createTodo(sql, { title: " Book band ", eventId: e, offsetDays: -14 });
    const og = await createTodo(sql, { title: "Renew", dueDate: "2026-12-01", owner: "Ann", source: "meeting" });
    const un = await createTodo(sql, { title: "Someday" });
    const all = await listTasks(sql);
    expect(all.find((r) => r.id === ev)).toMatchObject({ title: "Book band", eventId: e, dueDate: "2026-09-26", source: "manual", owner: "Unassigned", templateItemKey: null });
    expect(all.find((r) => r.id === og)).toMatchObject({ eventId: null, dueDate: "2026-12-01", owner: "Ann", source: "meeting" });
    expect(all.find((r) => r.id === un)!.dueDate).toBeNull();
    const [raw] = await sql<{ due: string | null }[]>`SELECT due_date::text AS due FROM tasks WHERE id = ${ev}`;
    expect(raw!.due).toBeNull();

    await expect(createTodo(sql, { title: " " })).rejects.toBeInstanceOf(RangeError);
    await expect(createTodo(sql, { title: "x", owner: " " })).rejects.toBeInstanceOf(RangeError);
    await expect(createTodo(sql, { title: "x", eventId: e, dueDate: "2026-10-01" })).rejects.toBeInstanceOf(RangeError);
    await expect(createTodo(sql, { title: "x", offsetDays: 3 })).rejects.toBeInstanceOf(RangeError);
    await expect(createTodo(sql, { title: "x", dueDate: "2026-02-30" })).rejects.toBeInstanceOf(RangeError);
    await expect(createTodo(sql, { title: "x", eventId: "00000000-0000-4000-8000-000000000000", offsetDays: 1 })).rejects.toBeInstanceOf(RangeError);
  });

  it("deleteTask removes a parent's subtasks; deleting the event removes its tasks", async () => {
    const id = await mkEvent();
    await createEventTasks(sql, id, [draft("p"), draft("c", { parentKey: "p" }), draft("other")]);
    const [p] = (await listTasks(sql, { eventIds: [id] })).filter((r) => r.templateItemKey === "p");
    expect(await deleteTask(sql, p!.id)).toBe(true);
    expect(await deleteTask(sql, p!.id)).toBe(false);
    expect(await count(id)).toBe(1);
    await sql`DELETE FROM events WHERE id = ${id}`;
    expect(await count(id)).toBe(0);
  });
});
