// Loading a user's exercise week on the server, for the Exercise page and the
// homepage card. The assembling is the tool's (assembleWeek); this only
// fetches what's stored.

import "server-only";
import { toolSql } from "@penntools/platform/db";
import {
  assembleWeek,
  FACILITIES,
  getPreferences,
  listAwayDays,
  listBlocksForWeek,
  mondayOf,
  newYorkNow,
  OUTTAKE_PREFS,
  SHARED_PREFS,
  type ExerciseWeek,
  type LocalDate,
  type OuttakePrefs,
  type SharedPrefs,
} from "@penntools/tool-penn-fitness";

/** Penn Fitness's database client; throws if the database isn't configured. */
export function db() {
  const sql = toolSql("pennfitness");
  if (!sql) throw new Error("Penn Fitness's database is not configured (check DATABASE_URL).");
  return sql;
}

export interface LoadedWeek extends ExerciseWeek {
  shared: SharedPrefs;
  outtake: OuttakePrefs;
  now: string;
}

/** The user's week starting `weekStart` (this week by default). */
export async function loadExerciseWeek(userId: string, weekStart?: LocalDate): Promise<LoadedWeek> {
  const sql = db();
  const now = newYorkNow();
  const week = weekStart ?? mondayOf(now.slice(0, 10));
  const [shared, outtake, blocks, awayDays] = await Promise.all([
    getPreferences(sql, userId, SHARED_PREFS),
    getPreferences(sql, userId, OUTTAKE_PREFS),
    listBlocksForWeek(sql, userId, week),
    listAwayDays(sql, userId, week),
  ]);
  return { ...assembleWeek({ weekStart: week, shared, outtake, blocks, awayDays, places: FACILITIES, now }), shared, outtake, now };
}
