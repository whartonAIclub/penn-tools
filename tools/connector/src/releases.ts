// Releasing matches. Students sign up and wait; when the team releases,
// everyone not yet matched is grouped once and the groups are saved, so they
// never reshuffle. Anyone left on the waitlist joins the next release.

import type { Sql } from "postgres";
import { makeMatches } from "./matching/matching.js";
import { toSignup, type SignupRow } from "./signups.js";
import type { GroupingResult, Signup } from "./types.js";

/** The people who can preview and release matches, by their Penn sign-in email. */
export const TEAM_EMAILS: readonly string[] = ["sayenko@upenn.edu", "subasree@wharton.upenn.edu"];

export function isTeamMember(email: string | null | undefined): boolean {
  return !!email && TEAM_EMAILS.includes(email.trim().toLowerCase());
}

/** Sign-ups not matched in any release yet (new ones, and last release's waitlist), oldest first. */
export async function listUnmatched(sql: Sql): Promise<Signup[]> {
  const rows = await sql<SignupRow[]>`
    SELECT s.user_id, s.first_name, s.last_name, s.email, s.cohort, s.answers
    FROM signups s
    WHERE NOT EXISTS (SELECT 1 FROM matches m WHERE m.user_id = s.user_id)
    ORDER BY s.created_at, s.user_id
  `;
  return rows.map(toSignup);
}

/** The groups a release would make right now, without saving anything. */
export async function previewRelease(sql: Sql): Promise<GroupingResult> {
  return makeMatches(await listUnmatched(sql));
}

export interface ReleaseResult extends GroupingResult {
  releaseId: number;
}

/**
 * Groups everyone not yet matched and saves the groups as a new release.
 * Two team members releasing at once can't match anyone twice: the second
 * waits for the first, then only sees who's still unmatched.
 */
export async function releaseMatches(sql: Sql, releasedBy: string): Promise<ReleaseResult> {
  return sql.begin(async (transaction) => {
    // postgres's TransactionSql type drops Sql's call signatures (it's built
    // with Omit), though at runtime it is called the same way.
    const tx = transaction as unknown as Sql;
    await tx`LOCK TABLE releases IN EXCLUSIVE MODE`;
    const result = makeMatches(await listUnmatched(tx));
    const [release] = await tx<{ id: string }[]>`
      INSERT INTO releases (released_by) VALUES (${releasedBy}) RETURNING id
    `;
    const releaseId = Number(release!.id);
    const rows = result.groups.flatMap((group, i) =>
      group.members.map((member) => ({ release_id: releaseId, group_number: i + 1, user_id: member.id }))
    );
    if (rows.length > 0) await tx`INSERT INTO matches ${tx(rows)}`;
    return { releaseId, ...result };
  });
}

export interface Match {
  releaseId: number;
  releasedAt: Date;
  /** Everyone in the student's group, the student included. */
  members: Signup[];
}

/** Where a student stands. */
export type Status =
  | { kind: "not-signed-up" }
  /** Signed up, and no release has happened since. */
  | { kind: "waiting"; signup: Signup }
  /** Signed up, but a release since then had no room for them: they're first in line next time. */
  | { kind: "waitlisted"; signup: Signup }
  | { kind: "matched"; signup: Signup; match: Match };

export async function getStatus(sql: Sql, userId: string): Promise<Status> {
  const [row] = await sql<(SignupRow & { missed_release: boolean })[]>`
    SELECT s.user_id, s.first_name, s.last_name, s.email, s.cohort, s.answers,
      EXISTS (SELECT 1 FROM releases r WHERE r.released_at > s.created_at) AS missed_release
    FROM signups s
    WHERE s.user_id = ${userId}
  `;
  if (!row) return { kind: "not-signed-up" };
  const signup = toSignup(row);
  const match = await getMatch(sql, userId);
  if (match) return { kind: "matched", signup, match };
  return { kind: row.missed_release ? "waitlisted" : "waiting", signup };
}

/** The student's group from the latest release they were matched in, or null if they haven't been matched. */
export async function getMatch(sql: Sql, userId: string): Promise<Match | null> {
  const [mine] = await sql<{ release_id: string; group_number: number; released_at: Date }[]>`
    SELECT m.release_id, m.group_number, r.released_at
    FROM matches m JOIN releases r ON r.id = m.release_id
    WHERE m.user_id = ${userId}
    ORDER BY m.release_id DESC
    LIMIT 1
  `;
  if (!mine) return null;
  const rows = await sql<SignupRow[]>`
    SELECT s.user_id, s.first_name, s.last_name, s.email, s.cohort, s.answers
    FROM matches m JOIN signups s ON s.user_id = m.user_id
    WHERE m.release_id = ${mine.release_id} AND m.group_number = ${mine.group_number}
    ORDER BY s.created_at, s.user_id
  `;
  return { releaseId: Number(mine.release_id), releasedAt: mine.released_at, members: rows.map(toSignup) };
}
