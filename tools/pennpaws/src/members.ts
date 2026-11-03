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
}

/** The member, or null if they haven't finished setup (or their saved answers no longer pass the survey). */
export async function getMember(sql: Sql, userId: string): Promise<Member | null> {
  const [row] = await sql<{ user_id: string; name: string; school: string; profile: unknown }[]>`
    SELECT user_id, name, school, profile FROM members WHERE user_id = ${userId}
  `;
  if (!row) return null;
  const checked = checkProfile(row.profile);
  if (!checked.ok) return null;
  return { userId: row.user_id, name: row.name, school: row.school, role: checked.value.role, profile: checked.value };
}

/** The name a member chose at setup, or null before setup. */
export async function memberName(sql: Sql, userId: string): Promise<string | null> {
  const [row] = await sql<{ name: string }[]>`SELECT name FROM members WHERE user_id = ${userId}`;
  return row?.name ?? null;
}

/** Saves the member's setup, replacing any earlier answers. */
export async function saveMember(sql: Sql, person: Person, school: string, profile: Profile): Promise<void> {
  const { area, lat, lng } = profile.location;
  await sql`
    INSERT INTO members (user_id, name, email, school, role, profile, lat, lng, area)
    VALUES (${person.id}, ${person.name}, ${person.email}, ${school}, ${profile.role}, ${sql.json(profile)}, ${lat}, ${lng}, ${area})
    ON CONFLICT (user_id) DO UPDATE SET
      name = EXCLUDED.name, email = EXCLUDED.email, school = EXCLUDED.school, role = EXCLUDED.role,
      profile = EXCLUDED.profile, lat = EXCLUDED.lat, lng = EXCLUDED.lng, area = EXCLUDED.area, updated_at = NOW()
  `;
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
