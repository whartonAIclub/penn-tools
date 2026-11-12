// Member storage against a throwaway schema (skipped when no database is configured).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { listMembers, addMember, setMemberActive, syncMembers } from "../members.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_members_test_${Date.now()}`;

describe.skipIf(!databaseUrl)("member storage", () => {
  let admin: Sql;
  let sql: Sql;

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

  beforeEach(async () => {
    await sql`DELETE FROM tasks`;
    await sql`DELETE FROM event_roles`;
    await sql`DELETE FROM events`;
    await sql`DELETE FROM members`;
  });

  const mkEvent = async () => {
    const [e] = await sql<{ id: string }[]>`
      INSERT INTO events (title, event_type, organizer_name, created_by)
      VALUES ('E', 'pub', 'O', 'u') RETURNING id`;
    return e!.id;
  };

  it("adds and lists members ordered ignoring case", async () => {
    await addMember(sql, "bob", "Ops Lead");
    await addMember(sql, "Alice");
    await addMember(sql, "Carol");
    const list = await listMembers(sql);
    expect(list.map((m) => m.name)).toEqual(["Alice", "bob", "Carol"]);
    expect(list[1]).toMatchObject({ role: "Ops Lead", active: true });
    expect(list[0]!.role).toBeNull();
    expect(typeof list[0]!.id).toBe("number");
  });

  it("returns the existing id for a name differing only by case, keeping the spelling", async () => {
    const id = await addMember(sql, "Diva", "Treasurer");
    expect(await addMember(sql, "  diva ", "Other")).toBe(id);
    const list = await listMembers(sql);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Diva", role: "Treasurer" });
  });

  it("rejects blank and over-long names", async () => {
    await expect(addMember(sql, "   ")).rejects.toBeInstanceOf(RangeError);
    await expect(addMember(sql, "x".repeat(201))).rejects.toBeInstanceOf(RangeError);
    await expect(addMember(sql, "x".repeat(200))).resolves.toBeTypeOf("number");
  });

  it("filters to active members and toggles active", async () => {
    const a = await addMember(sql, "Ann");
    await addMember(sql, "Ben");
    expect(await setMemberActive(sql, a, false)).toBe(true);
    expect((await listMembers(sql, { activeOnly: true })).map((m) => m.name)).toEqual(["Ben"]);
    expect(await listMembers(sql)).toHaveLength(2);
    expect(await setMemberActive(sql, a, true)).toBe(true);
    expect(await listMembers(sql, { activeOnly: true })).toHaveLength(2);
    expect(await setMemberActive(sql, 999999, true)).toBe(false);
  });

  it("syncs names from event roles and task owners", async () => {
    const eventId = await mkEvent();
    await sql`INSERT INTO event_roles (event_id, position, role, person) VALUES (${eventId}, 0, 'Pub Leader', '  Zed  ')`;
    await sql`INSERT INTO event_roles (event_id, position, role, person) VALUES (${eventId}, 1, 'Ops Lead', 'unassigned')`;
    await sql`INSERT INTO tasks (event_id, title, owner) VALUES (${eventId}, 'T1', 'Yara')`;
    await sql`INSERT INTO tasks (event_id, title, owner) VALUES (${eventId}, 'T2', 'Unassigned')`;
    await sql`INSERT INTO tasks (event_id, title, owner) VALUES (${eventId}, 'T3', '   ')`;
    await sql`INSERT INTO tasks (event_id, title, owner) VALUES (${eventId}, 'T4', 'zed')`;
    await addMember(sql, "YARA");
    expect(await syncMembers(sql)).toBe(1);
    expect((await listMembers(sql)).map((m) => m.name)).toEqual(["YARA", "Zed"]);
  });

  it("is idempotent", async () => {
    const eventId = await mkEvent();
    await sql`INSERT INTO tasks (event_id, title, owner) VALUES (${eventId}, 'T1', 'Mia')`;
    await sql`INSERT INTO tasks (event_id, title, owner) VALUES (${eventId}, 'T2', 'Noah')`;
    expect(await syncMembers(sql)).toBe(2);
    expect(await syncMembers(sql)).toBe(0);
    expect(await listMembers(sql)).toHaveLength(2);
  });
});
