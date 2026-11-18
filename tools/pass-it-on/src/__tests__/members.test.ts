// Member storage against a throwaway schema (skipped when no database is configured).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { listMembers, addMember, setMemberActive, syncMembers, renameMember } from "../members.js";

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

  // The club's seeded default and alternate leads, which syncMembers also adds.
  const LEADS = ["Billy", "Charlie", "Himanshi", "Kira", "Manisha", "Marcela", "Michael"];
  const withoutLeads = (names: string[]) => names.filter((n) => !LEADS.includes(n));

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
    expect(await syncMembers(sql)).toBe(1 + LEADS.length);
    expect(withoutLeads((await listMembers(sql)).map((m) => m.name))).toEqual(["YARA", "Zed"]);
  });

  it("is idempotent", async () => {
    const eventId = await mkEvent();
    await sql`INSERT INTO tasks (event_id, title, owner) VALUES (${eventId}, 'T1', 'Mia')`;
    await sql`INSERT INTO tasks (event_id, title, owner) VALUES (${eventId}, 'T2', 'Noah')`;
    expect(await syncMembers(sql)).toBe(2 + LEADS.length);
    expect(await syncMembers(sql)).toBe(0);
    expect(await listMembers(sql)).toHaveLength(2 + LEADS.length);
  });

  it("picks up the club's default and alternate leads, and never un-hides a hidden person", async () => {
    await syncMembers(sql);
    const names = (await listMembers(sql)).map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["Manisha", "Kira", "Himanshi", "Marcela", "Charlie", "Michael", "Billy"]));
    const kira = (await listMembers(sql)).find((m) => m.name === "Kira")!;
    await setMemberActive(sql, kira.id, false);
    await syncMembers(sql);
    expect((await listMembers(sql, { activeOnly: true })).map((m) => m.name)).not.toContain("Kira");
  });

  describe("renameMember", () => {
    it("fixes the name everywhere it is used, but not inside a shared cell", async () => {
      const id = await mkEvent();
      await sql`INSERT INTO event_roles (event_id, position, role, person) VALUES (${id}, 0, 'Pub Leader 1', 'Benju'), (${id}, 1, 'Prez Owner', 'Benju/Arjun')`;
      await sql`UPDATE events SET pub_leader = 'Benju' WHERE id = ${id}`;
      await sql`INSERT INTO tasks (event_id, title, owner, offset_days) VALUES (${id}, 't', 'Benju', -1)`;
      await sql`UPDATE role_defaults SET person = 'Benju', alternates = ARRAY['Kira', 'Benju'] WHERE role = 'Marketing Lead'`;
      const benju = await addMember(sql, "Benju");

      expect(await renameMember(sql, benju, " Benji ")).toEqual({ id: benju, merged: false });

      const roles = await sql<{ person: string }[]>`SELECT person FROM event_roles WHERE event_id = ${id} ORDER BY position`;
      expect(roles.map((r) => r.person)).toEqual(["Benji", "Benju/Arjun"]);
      const [ev] = await sql<{ pub_leader: string }[]>`SELECT pub_leader FROM events WHERE id = ${id}`;
      expect(ev!.pub_leader).toBe("Benji");
      const [task] = await sql<{ owner: string }[]>`SELECT owner FROM tasks WHERE event_id = ${id}`;
      expect(task!.owner).toBe("Benji");
      const [d] = await sql<{ person: string; alternates: string[] }[]>`SELECT person, alternates FROM role_defaults WHERE role = 'Marketing Lead'`;
      expect(d).toEqual({ person: "Benji", alternates: ["Kira", "Benji"] });
      expect((await listMembers(sql)).map((m) => m.name)).toContain("Benji");
      await sql`UPDATE role_defaults SET person = 'Manisha', alternates = ARRAY['Kira', 'Himanshi'] WHERE role = 'Marketing Lead'`;
    });

    it("merges into an existing person when the new name is taken (ignoring case), keeping that person visible", async () => {
      const benji = await addMember(sql, "Benji");
      await setMemberActive(sql, benji, false);
      const benju = await addMember(sql, "Benju");
      expect(await renameMember(sql, benju, "benji")).toEqual({ id: benji, merged: true });
      const all = await listMembers(sql);
      expect(all.filter((m) => m.name.toLowerCase().startsWith("benj"))).toEqual([{ id: benji, name: "Benji", role: null, active: true }]);
    });

    it("rejects a blank name, and returns null for an unknown person", async () => {
      const id = await addMember(sql, "Zed");
      await expect(renameMember(sql, id, "  ")).rejects.toThrow(RangeError);
      expect(await renameMember(sql, 999999, "X")).toBeNull();
    });
  });
});
