// Who may use Pass It On: the board's Penn emails. Everyone on the list is
// equal: any of them can add or remove others, but the last one can't be
// removed, so the club can never lock itself out. The first members are added
// by schema.sql while the list is empty.

import type { Sql } from "postgres";

export const MAX_EMAIL_LENGTH = 254;

export interface BoardMember {
  email: string;
  /** The email of whoever added them, or null for the first members. */
  addedBy: string | null;
  addedAt: Date;
}

/**
 * The email in the form it's stored and compared in (trimmed, lower case), or
 * a RangeError with a message for people. Only Penn addresses can sign in to
 * PennTools, so any other address is a typo.
 */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email === "") throw new RangeError("Enter an email address.");
  if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new RangeError(`"${raw.trim()}" isn't an email address.`);
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domain !== "upenn.edu" && !domain.endsWith(".upenn.edu")) {
    throw new RangeError("Use a Penn email (ending in upenn.edu): it's what people sign in to PennTools with.");
  }
  return email;
}

/** Whether this signed-in email is on the board's list. */
export async function hasBoardAccess(sql: Sql, email: string | null): Promise<boolean> {
  if (!email) return false;
  const rows = await sql`SELECT 1 FROM board_access WHERE email = ${email.trim().toLowerCase()}`;
  return rows.length > 0;
}

/** Everyone with access, by email. */
export async function listBoardAccess(sql: Sql): Promise<BoardMember[]> {
  const rows = await sql<{ email: string; added_by: string | null; added_at: Date }[]>`
    SELECT email, added_by, added_at FROM board_access ORDER BY email`;
  return rows.map((r) => ({ email: r.email, addedBy: r.added_by, addedAt: r.added_at }));
}

/** Gives an email access; false when it already had it. Throws RangeError for an address that isn't a Penn email. */
export async function grantBoardAccess(sql: Sql, email: string, addedBy: string | null): Promise<boolean> {
  const clean = normalizeEmail(email);
  const rows = await sql`
    INSERT INTO board_access (email, added_by) VALUES (${clean}, ${addedBy})
    ON CONFLICT (email) DO NOTHING
    RETURNING email`;
  return rows.length > 0;
}

export type RevokeResult = "removed" | "not_found" | "last_member";

/** Takes an email off the list, unless it's the last one left. */
export async function revokeBoardAccess(sql: Sql, email: string): Promise<RevokeResult> {
  const clean = email.trim().toLowerCase();
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    // Two people removing the last two members at once must not both succeed.
    await tx`LOCK TABLE board_access IN SHARE ROW EXCLUSIVE MODE`;
    const [{ count } = { count: 0 }] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM board_access`;
    const [found] = await tx`SELECT 1 FROM board_access WHERE email = ${clean}`;
    if (!found) return "not_found";
    if (count <= 1) return "last_member";
    await tx`DELETE FROM board_access WHERE email = ${clean}`;
    return "removed";
  });
}
