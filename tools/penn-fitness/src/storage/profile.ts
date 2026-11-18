// Profile storage, in the pennfitness schema. Callers pass the database client
// (toolSql("pennfitness")) and the signed-in user's id; every read and write is
// scoped to that user.

import type { Sql } from "postgres";
import { DEFAULT_PROFILE, checkProfile } from "../profile.js";
import type { HomeBase, UserProfile } from "../profile.js";

/** Thrown when asked to save a profile that checkProfile rejects. */
export class InvalidProfileError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "InvalidProfileError";
  }
}

/** The user's profile, or DEFAULT_PROFILE if they haven't saved one. */
export async function getProfile(sql: Sql, userId: string): Promise<UserProfile> {
  const [row] = await sql<
    {
      home_base: HomeBase;
      has_building_gym: boolean;
      waking_start: string;
      waking_end: string;
      semester_start: string | null;
      semester_end: string | null;
    }[]
  >`
    SELECT home_base, has_building_gym,
           to_char(waking_start, 'HH24:MI') AS waking_start,
           to_char(waking_end, 'HH24:MI') AS waking_end,
           semester_start::text AS semester_start,
           semester_end::text AS semester_end
    FROM profiles WHERE user_id = ${userId}
  `;
  if (!row) return { ...DEFAULT_PROFILE };
  return {
    homeBase: row.home_base,
    hasBuildingGym: row.has_building_gym,
    wakingStart: row.waking_start,
    // TIME stores 24:00, which to_char prints as 00:00 of the next day.
    wakingEnd: row.waking_end === "00:00" ? "24:00" : row.waking_end,
    semesterStart: row.semester_start,
    semesterEnd: row.semester_end,
  };
}

/** Saves the user's profile, replacing any earlier one. Throws InvalidProfileError if it isn't valid. */
export async function saveProfile(sql: Sql, userId: string, profile: UserProfile): Promise<void> {
  const problems = checkProfile(profile);
  if (problems.length > 0) throw new InvalidProfileError(problems);
  await sql`
    INSERT INTO profiles (user_id, home_base, has_building_gym, waking_start, waking_end, semester_start, semester_end)
    VALUES (${userId}, ${profile.homeBase}, ${profile.hasBuildingGym}, ${profile.wakingStart}, ${profile.wakingEnd},
            ${profile.semesterStart}, ${profile.semesterEnd})
    ON CONFLICT (user_id) DO UPDATE SET
      home_base = EXCLUDED.home_base,
      has_building_gym = EXCLUDED.has_building_gym,
      waking_start = EXCLUDED.waking_start,
      waking_end = EXCLUDED.waking_end,
      semester_start = EXCLUDED.semester_start,
      semester_end = EXCLUDED.semester_end,
      updated_at = NOW()
  `;
}
