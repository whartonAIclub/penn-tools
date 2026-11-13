// Members: the roster of names used for owner dropdowns and filters. A task's
// owner stays a plain name; this list is only filled from names already used.

import type { Sql } from "postgres";

export interface Member {
  id: number;
  name: string;
  role: string | null;
  active: boolean;
}

const MAX_NAME = 200;

interface MemberRow {
  id: string;
  name: string;
  role: string | null;
  active: boolean;
}

function checkName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new RangeError("A member's name can't be blank.");
  if (trimmed.length > MAX_NAME) throw new RangeError(`A member's name can't be over ${MAX_NAME} characters.`);
  return trimmed;
}

/** Members ordered by name, ignoring case. */
export async function listMembers(sql: Sql, options: { activeOnly?: boolean } = {}): Promise<Member[]> {
  const rows = await sql<MemberRow[]>`
    SELECT id, name, role, active FROM members
    WHERE ${options.activeOnly ? sql`active` : sql`TRUE`}
    ORDER BY lower(name), id`;
  return rows.map((r) => ({ id: Number(r.id), name: r.name, role: r.role, active: r.active }));
}

/** Adds a member and returns the id; a name already present (ignoring case) returns the existing id unchanged. */
export async function addMember(sql: Sql, name: string, role?: string): Promise<number> {
  const clean = checkName(name);
  const cleanRole = role?.trim() || null;
  const [added] = await sql<{ id: string }[]>`
    INSERT INTO members (name, role) VALUES (${clean}, ${cleanRole})
    ON CONFLICT (lower(name)) DO NOTHING
    RETURNING id`;
  if (added) return Number(added.id);
  const [existing] = await sql<{ id: string }[]>`SELECT id FROM members WHERE lower(name) = lower(${clean})`;
  return Number(existing!.id);
}

/** Returns false when no member has this id. */
export async function setMemberActive(sql: Sql, id: number, active: boolean): Promise<boolean> {
  const rows = await sql`UPDATE members SET active = ${active} WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/**
 * Adds the names already used as role people, task owners or the club's
 * default and alternate leads (never "Unassigned"),
 * trimmed and new ignoring case. Where spellings differ only by case, the first
 * by code point wins ("Zed" over "zed"). Returns how many were added.
 */
export async function syncMembers(sql: Sql): Promise<number> {
  const rows = await sql`
    INSERT INTO members (name)
    SELECT DISTINCT ON (lower(n)) n FROM (
      SELECT btrim(person) AS n FROM event_roles WHERE person IS NOT NULL
      UNION
      SELECT btrim(owner) AS n FROM tasks
      UNION
      SELECT btrim(person) AS n FROM role_defaults WHERE person IS NOT NULL
      UNION
      SELECT btrim(unnest(alternates)) AS n FROM role_defaults
    ) names
    WHERE n <> '' AND lower(n) <> 'unassigned' AND char_length(n) <= ${MAX_NAME}
    ORDER BY lower(n), n COLLATE "C"
    ON CONFLICT (lower(name)) DO NOTHING
    RETURNING id`;
  return rows.length;
}

/**
 * Renames a person everywhere the exact old name is used: role cells, task
 * owners, the stored Pub Leader and the club's default and alternate leads. A
 * shared cell such as "Benju/Arjun" is left as it is. When the new name already
 * belongs to someone (ignoring case), the two are merged into that person, who
 * is then shown in the lists. Returns the surviving person's id and whether a
 * merge happened, or null when there is no person with this id.
 */
export async function renameMember(sql: Sql, id: number, newName: string): Promise<{ id: number; merged: boolean } | null> {
  const name = checkName(newName);
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const [person] = await tx<{ name: string }[]>`SELECT name FROM members WHERE id = ${id} FOR UPDATE`;
    if (!person) return null;
    const old = person.name;
    const [other] = await tx<{ id: string; name: string }[]>`
      SELECT id::text, name FROM members WHERE lower(name) = lower(${name}) AND id <> ${id} FOR UPDATE`;
    // On a merge the existing spelling wins, so "benji" onto "Benji" keeps "Benji".
    const target = other ? other.name : name;

    if (old !== target) {
      await tx`UPDATE event_roles SET person = ${target} WHERE person = ${old}`;
      await tx`UPDATE tasks SET owner = ${target} WHERE owner = ${old}`;
      await tx`UPDATE events SET pub_leader = ${target} WHERE pub_leader = ${old}`;
      await tx`UPDATE events SET organizer_name = ${target} WHERE organizer_name = ${old}`;
      await tx`UPDATE role_defaults SET person = ${target} WHERE person = ${old}`;
      await tx`UPDATE role_defaults SET alternates = array_replace(alternates, ${old}, ${target}) WHERE ${old} = ANY(alternates)`;
    }
    if (other) {
      await tx`DELETE FROM members WHERE id = ${id}`;
      await tx`UPDATE members SET active = TRUE WHERE id = ${other.id}`;
      return { id: Number(other.id), merged: true };
    }
    await tx`UPDATE members SET name = ${name} WHERE id = ${id}`;
    return { id, merged: false };
  });
}
