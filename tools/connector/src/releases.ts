// Releasing matches, in rounds. Students sign up and wait; when the team
// releases, everyone ready to be matched is matched once and the matches are
// saved, so they never reshuffle. Each release is a round. Once matched, a
// student says whether they met their match and can ask to be matched again
// in the next round, never with anyone they've been matched with before.
// Anyone left on the waitlist stays ready for the next release.

import type { Sql } from "postgres";
import { makeMatches, metBeforeFrom } from "./matching/matching.js";
import type { MetBefore } from "./matching/grouping.js";
import { toSignup, type SignupRow } from "./signups.js";
import type { GroupingResult, Signup } from "./types.js";

/** The people who can preview and release matches, by their Penn sign-in email. */
export const TEAM_EMAILS: readonly string[] = ["sayenko@upenn.edu", "subasree@wharton.upenn.edu"];

export function isTeamMember(email: string | null | undefined): boolean {
  return !!email && TEAM_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Sign-ups ready to be matched: not matched in any release since they signed
 * up or asked to be matched again (so new ones, returning ones, and the last
 * release's waitlist). Whoever has waited longest comes first, so they win
 * ties in the matching.
 */
export async function listUnmatched(sql: Sql): Promise<Signup[]> {
  const rows = await sql<SignupRow[]>`
    SELECT s.user_id, s.first_name, s.last_name, s.email, s.cohort, s.answers
    FROM signups s
    WHERE NOT EXISTS (
      SELECT 1 FROM matches m JOIN releases r ON r.id = m.release_id
      WHERE m.user_id = s.user_id AND r.released_at >= s.ready_since
    )
    ORDER BY s.ready_since, s.created_at, s.user_id
  `;
  return rows.map(toSignup);
}

/** Who has been matched with whom, in any release, so nobody is matched with the same person twice. */
async function loadMetBefore(sql: Sql): Promise<MetBefore> {
  const rows = await sql<{ a: string; b: string }[]>`
    SELECT x.user_id AS a, y.user_id AS b
    FROM matches x
    JOIN matches y ON y.release_id = x.release_id AND y.group_number = x.group_number AND y.user_id > x.user_id
  `;
  return metBeforeFrom(rows.map((r) => [r.a, r.b] as const));
}

/** The pairs and groups a release would make right now, without saving anything. */
export async function previewRelease(sql: Sql): Promise<GroupingResult> {
  return makeMatches(await listUnmatched(sql), await loadMetBefore(sql));
}

export interface ReleaseResult extends GroupingResult {
  releaseId: number;
}

/**
 * Matches everyone ready to be matched and saves the matches as a new
 * release. Two team members releasing at once can't match anyone twice: the
 * second waits for the first, then only sees who's still ready.
 */
export async function releaseMatches(sql: Sql, releasedBy: string): Promise<ReleaseResult> {
  return sql.begin(async (transaction) => {
    // postgres's TransactionSql type drops Sql's call signatures (it's built
    // with Omit), though at runtime it is called the same way.
    const tx = transaction as unknown as Sql;
    await tx`LOCK TABLE releases IN EXCLUSIVE MODE`;
    const result = makeMatches(await listUnmatched(tx), await loadMetBefore(tx));
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
  /** Which release this was, counting from 1. */
  round: number;
  releasedAt: Date;
  /** Everyone in the student's pair or group, the student included. */
  members: Signup[];
  /** Whether the student said they met their match, or null if they haven't said. */
  met: boolean | null;
}

/** Where a student stands. */
export type Status =
  | { kind: "not-signed-up" }
  /** Ready to be matched, and no release has happened since. `returning` if they've been matched before. */
  | { kind: "waiting"; signup: Signup; nextRound: number; returning: boolean }
  /** Ready to be matched, but a release since then had no room for them: they're first in line next time. */
  | { kind: "waitlisted"; signup: Signup; nextRound: number }
  /** Matched in the latest release they were ready for. */
  | { kind: "matched"; signup: Signup; match: Match; nextRound: number };

export async function getStatus(sql: Sql, userId: string): Promise<Status> {
  const [row] = await sql<(SignupRow & { ready_since: Date; missed_release: boolean; next_round: number })[]>`
    SELECT s.user_id, s.first_name, s.last_name, s.email, s.cohort, s.answers, s.ready_since,
      EXISTS (SELECT 1 FROM releases r WHERE r.released_at > s.ready_since) AS missed_release,
      (SELECT count(*)::int + 1 FROM releases) AS next_round
    FROM signups s
    WHERE s.user_id = ${userId}
  `;
  if (!row) return { kind: "not-signed-up" };
  const signup = toSignup(row);
  const match = await getMatch(sql, userId);
  if (match && match.releasedAt >= row.ready_since) return { kind: "matched", signup, match, nextRound: row.next_round };
  if (row.missed_release) return { kind: "waitlisted", signup, nextRound: row.next_round };
  return { kind: "waiting", signup, nextRound: row.next_round, returning: match !== null };
}

/** The student's match from the latest release they were matched in, or null if they haven't been matched. */
export async function getMatch(sql: Sql, userId: string): Promise<Match | null> {
  return (await listMatches(sql, userId, 1))[0] ?? null;
}

/** Every match the student has had, newest first (at most `limit`). */
export async function listMatches(sql: Sql, userId: string, limit = 100): Promise<Match[]> {
  const mine = await sql<{ release_id: string; group_number: number; released_at: Date; round: number; met: boolean | null }[]>`
    SELECT m.release_id, m.group_number, r.released_at,
      (SELECT count(*)::int FROM releases earlier WHERE earlier.id <= r.id) AS round,
      c.met
    FROM matches m
    JOIN releases r ON r.id = m.release_id
    LEFT JOIN checkins c ON c.release_id = m.release_id AND c.user_id = m.user_id
    WHERE m.user_id = ${userId}
    ORDER BY m.release_id DESC
    LIMIT ${limit}
  `;
  return Promise.all(
    mine.map(async (match) => {
      const rows = await sql<SignupRow[]>`
        SELECT s.user_id, s.first_name, s.last_name, s.email, s.cohort, s.answers
        FROM matches m JOIN signups s ON s.user_id = m.user_id
        WHERE m.release_id = ${match.release_id} AND m.group_number = ${match.group_number}
        ORDER BY s.created_at, s.user_id
      `;
      return {
        releaseId: Number(match.release_id),
        round: match.round,
        releasedAt: match.released_at,
        members: rows.map(toSignup),
        met: match.met,
      };
    }),
  );
}

export type RoundResult = { ok: true } | { ok: false; error: string };

/** Saves whether the student met their current match. */
export async function checkIn(sql: Sql, userId: string, met: boolean): Promise<RoundResult> {
  const status = await getStatus(sql, userId);
  if (status.kind !== "matched") return { ok: false, error: "You don't have a match to check in on yet." };
  await sql`
    INSERT INTO checkins (release_id, user_id, met) VALUES (${status.match.releaseId}, ${userId}, ${met})
    ON CONFLICT (release_id, user_id) DO UPDATE SET met = EXCLUDED.met, created_at = NOW()
  `;
  return { ok: true };
}

/**
 * Puts the student in the next round. They must have checked in on their
 * current match first; their answers carry over.
 */
export async function matchAgain(sql: Sql, userId: string): Promise<RoundResult> {
  const status = await getStatus(sql, userId);
  if (status.kind !== "matched") return { ok: false, error: "You're already in line for the next round." };
  if (status.match.met === null) return { ok: false, error: "Tell us whether you met your match first." };
  await sql`UPDATE signups SET ready_since = NOW() WHERE user_id = ${userId}`;
  return { ok: true };
}

export interface RoundStats {
  /** The round the next release will be. */
  nextRound: number;
  /** Ready for the next release: signed up and never matched. */
  newcomers: number;
  /** Ready for the next release: matched before and asked to be matched again. */
  returning: number;
  /** Ready for the next release: a release since they were ready had no room for them. */
  waitlisted: number;
  /** The latest release, if there has been one. */
  lastRound: { round: number; matched: number; checkedIn: number; met: number } | null;
}

/** How the rounds are going, for the team page. */
export async function getRoundStats(sql: Sql): Promise<RoundStats> {
  const [ready] = await sql<{ newcomers: number; returning: number; waitlisted: number; releases: number }[]>`
    SELECT
      count(*) FILTER (WHERE NOT ever_matched AND NOT missed)::int AS newcomers,
      count(*) FILTER (WHERE ever_matched AND NOT missed)::int AS returning,
      count(*) FILTER (WHERE missed)::int AS waitlisted,
      (SELECT count(*)::int FROM releases) AS releases
    FROM (
      SELECT
        EXISTS (SELECT 1 FROM matches m WHERE m.user_id = s.user_id) AS ever_matched,
        EXISTS (SELECT 1 FROM releases r WHERE r.released_at > s.ready_since) AS missed
      FROM signups s
      WHERE NOT EXISTS (
        SELECT 1 FROM matches m JOIN releases r ON r.id = m.release_id
        WHERE m.user_id = s.user_id AND r.released_at >= s.ready_since
      )
    ) ready
  `;
  const [last] = await sql<{ matched: number; checked_in: number; met: number }[]>`
    SELECT
      (SELECT count(*)::int FROM matches WHERE release_id = r.id) AS matched,
      (SELECT count(*)::int FROM checkins WHERE release_id = r.id) AS checked_in,
      (SELECT count(*)::int FROM checkins WHERE release_id = r.id AND met) AS met
    FROM releases r ORDER BY r.id DESC LIMIT 1
  `;
  return {
    nextRound: ready!.releases + 1,
    newcomers: ready!.newcomers,
    returning: ready!.returning,
    waitlisted: ready!.waitlisted,
    lastRound: last ? { round: ready!.releases, matched: last.matched, checkedIn: last.checked_in, met: last.met } : null,
  };
}
