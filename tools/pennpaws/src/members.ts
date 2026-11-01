// PennPaws members: who has finished first-time setup, with their role and
// survey answers. Callers pass the database client (toolSql("pennpaws")) and
// a profile already checked with checkProfile.

import type { Sql } from "postgres";
import { checkProfile, type MemberRole, type Profile } from "./profile.js";
import type { Person } from "./requests.js";

export interface Member {
  userId: string;
  school: string;
  role: MemberRole;
  profile: Profile;
}

/** The member, or null if they haven't finished setup (or their saved answers no longer pass the survey). */
export async function getMember(sql: Sql, userId: string): Promise<Member | null> {
  const [row] = await sql<{ user_id: string; school: string; profile: unknown }[]>`
    SELECT user_id, school, profile FROM members WHERE user_id = ${userId}
  `;
  if (!row) return null;
  const checked = checkProfile(row.profile);
  if (!checked.ok) return null;
  return { userId: row.user_id, school: row.school, role: checked.value.role, profile: checked.value };
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
