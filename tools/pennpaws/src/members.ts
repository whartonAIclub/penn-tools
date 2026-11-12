// PennPaws members: who has finished first-time setup, with their role and
// survey answers. Callers pass the database client (toolSql("pennpaws")) and
// a profile already checked with checkProfile.

import type { Sql } from "postgres";
import { checkProfile, type MemberRole, type Profile } from "./profile.js";
import { PennPawsError, type Person } from "./requests.js";

export interface Member {
  userId: string;
  /** What they asked to be called at setup. */
  name: string;
  school: string;
  role: MemberRole;
  profile: Profile;
  /**
   * The role whose answers are saved on the other side of the switch, or null
   * before they have used both sides. One account, two sides: switchRole swaps
   * them, so nobody browses jobs with their own request in the list.
   */
  otherRole: MemberRole | null;
}

interface MemberRow {
  user_id: string;
  name: string;
  school: string;
  profile: unknown;
  other_profile?: unknown;
}

/**
 * Postgres's "column does not exist". `other_profile` arrived after the first
 * deployments, and nothing applies PennPaws's schema.sql for us yet (R19), so
 * a database that hasn't had it applied is a real state to survive rather than
 * crash in: PennPaws works as it did before, minus the switch, and starts
 * carrying both sides the moment someone runs schema.sql. See the README.
 */
const MISSING_COLUMN = "42703";

/** Runs `query`, falling back when this database has no `other_profile` yet. */
async function withBothSides<T>(query: () => Promise<T>, withoutIt: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if ((error as { code?: string } | null)?.code === MISSING_COLUMN) return withoutIt();
    throw error;
  }
}

/** The member, or null if they haven't finished setup (or their saved answers no longer pass the survey). */
export async function getMember(sql: Sql, userId: string): Promise<Member | null> {
  const [row] = await withBothSides(
    () => sql<MemberRow[]>`SELECT user_id, name, school, profile, other_profile FROM members WHERE user_id = ${userId}`,
    () => sql<MemberRow[]>`SELECT user_id, name, school, profile FROM members WHERE user_id = ${userId}`,
  );
  if (!row) return null;
  const checked = checkProfile(row.profile);
  if (!checked.ok) return null;
  const other = row.other_profile ? checkProfile(row.other_profile) : null;
  return {
    userId: row.user_id,
    name: row.name,
    school: row.school,
    role: checked.value.role,
    profile: checked.value,
    otherRole: other?.ok ? other.value.role : null,
  };
}

/** The side of PennPaws a member switches to from `role`, when they have no saved answers for it yet. */
export function oppositeRole(role: MemberRole): MemberRole {
  return role === "sitter" ? "owner" : "sitter";
}

/**
 * Swaps the member onto their other side, keeping the one they're leaving for
 * next time. Returns null when they have no saved answers over there, so the
 * caller opens setup for `oppositeRole` instead.
 */
export async function switchRole(sql: Sql, userId: string): Promise<Member | null> {
  const saved = await withBothSides<unknown>(
    async () => (await sql<{ other_profile: unknown }[]>`SELECT other_profile FROM members WHERE user_id = ${userId}`)[0]?.other_profile ?? null,
    async () => null,
  );
  if (!saved) return null;
  const checked = checkProfile(saved);
  if (!checked.ok) return null;
  const { area, lat, lng } = checked.value.location;
  // Both right-hand sides read the row as it was, so this swaps the two sides.
  await sql`
    UPDATE members
       SET role = ${checked.value.role}, profile = other_profile, other_profile = profile,
           lat = ${lat}, lng = ${lng}, area = ${area}, updated_at = NOW()
     WHERE user_id = ${userId}
  `;
  return getMember(sql, userId);
}

/** The name a member chose at setup, or null before setup. */
export async function memberName(sql: Sql, userId: string): Promise<string | null> {
  const [row] = await sql<{ name: string }[]>`SELECT name FROM members WHERE user_id = ${userId}`;
  return row?.name ?? null;
}

/** Saves the member's setup, replacing any earlier answers. */
export async function saveMember(sql: Sql, person: Person, school: string, profile: Profile): Promise<void> {
  const { area, lat, lng } = profile.location;
  const values = () => sql`
    (user_id, name, email, school, role, profile, lat, lng, area)
    VALUES (${person.id}, ${person.name}, ${person.email}, ${school}, ${profile.role}, ${sql.json(profile)}, ${lat}, ${lng}, ${area})
    ON CONFLICT (user_id) DO UPDATE SET
      name = EXCLUDED.name, email = EXCLUDED.email, school = EXCLUDED.school, role = EXCLUDED.role,
      profile = EXCLUDED.profile, lat = EXCLUDED.lat, lng = EXCLUDED.lng, area = EXCLUDED.area, updated_at = NOW()
  `;
  await withBothSides(
    // Setup that changes which side they're on keeps the side they left, so
    // the switch works both ways from here.
    () => sql`
      INSERT INTO members ${values()},
        other_profile = CASE WHEN members.role <> EXCLUDED.role THEN members.profile ELSE members.other_profile END
    `,
    () => sql`INSERT INTO members ${values()}`,
  );
}

/** Throws for a member the team has paused, so they can't post, offer or message (team.ts). */
export async function assertActive(sql: Sql, userId: string): Promise<void> {
  if (await isPaused(sql, userId)) {
    throw new PennPawsError("Your PennPaws account is paused while the team looks into a report. Reply to the team's email to sort it out.");
  }
}

export async function isPaused(sql: Sql, userId: string): Promise<boolean> {
  const [row] = await sql<{ paused: boolean }[]>`SELECT paused_at IS NOT NULL AS paused FROM members WHERE user_id = ${userId}`;
  return row?.paused ?? false;
}
