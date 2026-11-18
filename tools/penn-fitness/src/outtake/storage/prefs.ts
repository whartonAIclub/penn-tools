// Workout preference storage, in the pennfitness schema. Callers pass the
// database client (toolSql("pennfitness")) and the signed-in user's id.

import type { Sql } from "postgres";
import { DEFAULT_FITNESS_PREFS, checkFitnessPrefs } from "../prefs.js";
import type { FitnessPrefs, PreferredTime } from "../prefs.js";

/** Thrown when asked to save preferences that checkFitnessPrefs rejects. */
export class InvalidFitnessPrefsError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "InvalidFitnessPrefsError";
  }
}

/** The user's workout preferences, or DEFAULT_FITNESS_PREFS if they haven't saved any. */
export async function getFitnessPrefs(sql: Sql, userId: string): Promise<FitnessPrefs> {
  const [row] = await sql<{ weekly_target_sessions: number; session_minutes: number; preferred_times: PreferredTime[] }[]>`
    SELECT weekly_target_sessions, session_minutes, preferred_times
    FROM outtake_prefs WHERE user_id = ${userId}
  `;
  if (!row) return { ...DEFAULT_FITNESS_PREFS, preferredTimes: [...DEFAULT_FITNESS_PREFS.preferredTimes] };
  return {
    weeklyTargetSessions: row.weekly_target_sessions,
    sessionMinutes: row.session_minutes,
    preferredTimes: row.preferred_times,
  };
}

/** Saves the user's preferences, replacing any earlier ones. Throws InvalidFitnessPrefsError if they aren't valid. */
export async function saveFitnessPrefs(sql: Sql, userId: string, prefs: FitnessPrefs): Promise<void> {
  const problems = checkFitnessPrefs(prefs);
  if (problems.length > 0) throw new InvalidFitnessPrefsError(problems);
  await sql`
    INSERT INTO outtake_prefs (user_id, weekly_target_sessions, session_minutes, preferred_times)
    VALUES (${userId}, ${prefs.weeklyTargetSessions}, ${prefs.sessionMinutes}, ${prefs.preferredTimes})
    ON CONFLICT (user_id) DO UPDATE SET
      weekly_target_sessions = EXCLUDED.weekly_target_sessions,
      session_minutes = EXCLUDED.session_minutes,
      preferred_times = EXCLUDED.preferred_times,
      updated_at = NOW()
  `;
}
