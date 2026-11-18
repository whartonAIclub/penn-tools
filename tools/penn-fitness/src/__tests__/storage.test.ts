// Preference storage against a real Postgres, in a throwaway schema. Skipped
// when no database is configured.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PreferenceSection } from "../preferences.js";
import { SHARED_PREFS, type SharedPrefs } from "../sharedPrefs.js";
import { InvalidPreferencesError, getPreferences, savePreferences } from "../storage/preferences.js";
import { OUTTAKE_PREFS } from "../outtake/prefs.js";
import { createTestDatabase, databaseUrl, type TestDatabase } from "./testDatabase.js";

let db: TestDatabase;

describe.skipIf(!databaseUrl)("Penn Fitness preference storage (Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDatabase("storage");
  });

  afterAll(async () => {
    await db?.drop();
  });

  it("gives a user each section's defaults until they save their own", async () => {
    expect(await getPreferences(db.sql, "new-user", SHARED_PREFS)).toEqual(SHARED_PREFS.defaults);
    expect(await getPreferences(db.sql, "new-user", OUTTAKE_PREFS)).toEqual(OUTTAKE_PREFS.defaults);
  });

  it("saves, replaces and reads back a section, including a corner and a day ending at midnight", async () => {
    const shared: SharedPrefs = {
      homeBase: "CENTER_CITY",
      homeCorner: { street: 23, crossStreet: "Chestnut" },
      hasBuildingGym: true,
      wakingStart: "06:30",
      wakingEnd: "24:00",
      semesterStart: "2027-01-13",
      semesterEnd: "2027-05-05",
    };
    await savePreferences(db.sql, "alice", SHARED_PREFS, { ...shared, hasBuildingGym: false });
    await savePreferences(db.sql, "alice", SHARED_PREFS, shared);
    expect(await getPreferences(db.sql, "alice", SHARED_PREFS)).toEqual(shared);
  });

  it("keeps sections and users separate", async () => {
    await savePreferences(db.sql, "alice", OUTTAKE_PREFS, { weeklyTargetSessions: 2, sessionMinutes: 60, preferredTimes: ["MIDDAY"] });
    expect(await getPreferences(db.sql, "alice", OUTTAKE_PREFS)).toEqual({ weeklyTargetSessions: 2, sessionMinutes: 60, preferredTimes: ["MIDDAY"] });
    expect((await getPreferences(db.sql, "alice", SHARED_PREFS)).homeBase).toBe("CENTER_CITY");
    expect(await getPreferences(db.sql, "bob", OUTTAKE_PREFS)).toEqual(OUTTAKE_PREFS.defaults);
  });

  it("refuses to save invalid preferences, keeping what was there", async () => {
    await expect(
      savePreferences(db.sql, "alice", OUTTAKE_PREFS, { ...OUTTAKE_PREFS.defaults, weeklyTargetSessions: 0 }),
    ).rejects.toThrow(InvalidPreferencesError);
    expect((await getPreferences(db.sql, "alice", OUTTAKE_PREFS)).weeklyTargetSessions).toBe(2);
  });

  it("gives fields added after a user saved their defaults", async () => {
    // A section as Manali might first write it, then the same section after she adds a field.
    const before: PreferenceSection<{ diet: string }> = { name: "intake", defaults: { diet: "any" }, check: () => [] };
    const after: PreferenceSection<{ diet: string; waterGoalCups: number }> = {
      name: "intake",
      defaults: { diet: "any", waterGoalCups: 8 },
      check: () => [],
    };
    await savePreferences(db.sql, "alice", before, { diet: "vegetarian" });
    expect(await getPreferences(db.sql, "alice", after)).toEqual({ diet: "vegetarian", waterGoalCups: 8 });
  });

  it("doesn't let callers change the section's defaults through what they're given", async () => {
    const prefs = await getPreferences(db.sql, "nobody", OUTTAKE_PREFS);
    prefs.preferredTimes.push("MORNING");
    expect(OUTTAKE_PREFS.defaults.preferredTimes).toEqual([]);
  });
});
