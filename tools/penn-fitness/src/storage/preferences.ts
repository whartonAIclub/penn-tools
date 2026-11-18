// Preference storage, in the pennfitness schema: one JSON value per user and
// section (see ../preferences.ts). Callers pass the database client
// (toolSql("pennfitness")) and the signed-in user's id; every read and write is
// scoped to that user.

import type { Sql } from "postgres";
import type { PreferenceSection } from "../preferences.js";

/** Thrown when asked to save preferences that the section's check rejects. */
export class InvalidPreferencesError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "InvalidPreferencesError";
  }
}

/**
 * The user's preferences for a section: what they saved, laid over the
 * section's defaults, so fields added since they saved get their defaults.
 */
export async function getPreferences<T extends object>(sql: Sql, userId: string, section: PreferenceSection<T>): Promise<T> {
  const [row] = await sql<{ data: Partial<T> }[]>`
    SELECT data FROM preferences WHERE user_id = ${userId} AND section = ${section.name}
  `;
  return structuredClone({ ...section.defaults, ...row?.data });
}

/** Saves the user's preferences for a section, replacing what was there. Throws InvalidPreferencesError if they aren't valid. */
export async function savePreferences<T extends object>(
  sql: Sql,
  userId: string,
  section: PreferenceSection<T>,
  value: T,
): Promise<void> {
  const problems = section.check(value);
  if (problems.length > 0) throw new InvalidPreferencesError(problems);
  await sql`
    INSERT INTO preferences (user_id, section, data)
    VALUES (${userId}, ${section.name}, ${sql.json(value as Parameters<Sql["json"]>[0])})
    ON CONFLICT (user_id, section) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
}
