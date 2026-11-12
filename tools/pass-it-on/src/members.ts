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
 * Adds the names already used as role people or task owners (never "Unassigned"),
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
    ) names
    WHERE n <> '' AND lower(n) <> 'unassigned' AND char_length(n) <= ${MAX_NAME}
    ORDER BY lower(n), n COLLATE "C"
    ON CONFLICT (lower(name)) DO NOTHING
    RETURNING id`;
  return rows.length;
}
