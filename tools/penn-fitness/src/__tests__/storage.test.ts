// Profile and workout-preference storage against a real Postgres, in a
// throwaway schema. Skipped when no database is configured.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DEFAULT_PROFILE, type UserProfile } from "../profile.js";
import { InvalidProfileError, getProfile, saveProfile } from "../storage/profile.js";
import { DEFAULT_FITNESS_PREFS } from "../outtake/prefs.js";
import { InvalidFitnessPrefsError, getFitnessPrefs, saveFitnessPrefs } from "../outtake/storage/prefs.js";
import { createTestDatabase, databaseUrl, type TestDatabase } from "./testDatabase.js";

let db: TestDatabase;

describe.skipIf(!databaseUrl)("Penn Fitness storage (Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDatabase("storage");
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("profiles", () => {
    it("gives a user the default profile until they save one", async () => {
      expect(await getProfile(db.sql, "new-user")).toEqual(DEFAULT_PROFILE);
    });

    it("saves, replaces and reads back a profile, including a day ending at midnight", async () => {
      const profile: UserProfile = {
        homeBase: "CENTER_CITY",
        hasBuildingGym: true,
        wakingStart: "06:30",
        wakingEnd: "24:00",
        semesterStart: "2027-01-13",
        semesterEnd: "2027-05-05",
      };
      await saveProfile(db.sql, "alice", { ...profile, homeBase: "CAMPUS" });
      await saveProfile(db.sql, "alice", profile);
      expect(await getProfile(db.sql, "alice")).toEqual(profile);
    });

    it("keeps each user's profile separate", async () => {
      await saveProfile(db.sql, "bob", { ...DEFAULT_PROFILE, wakingStart: "09:00" });
      expect((await getProfile(db.sql, "bob")).wakingStart).toBe("09:00");
      expect((await getProfile(db.sql, "alice")).wakingStart).toBe("06:30");
    });

    it("refuses to save an invalid profile", async () => {
      await expect(saveProfile(db.sql, "carol", { ...DEFAULT_PROFILE, wakingEnd: "06:00" })).rejects.toThrow(InvalidProfileError);
      expect(await getProfile(db.sql, "carol")).toEqual(DEFAULT_PROFILE);
    });
  });

  describe("workout preferences", () => {
    it("gives a user the defaults until they save their own", async () => {
      expect(await getFitnessPrefs(db.sql, "new-user")).toEqual(DEFAULT_FITNESS_PREFS);
    });

    it("saves, replaces and reads back preferences, per user", async () => {
      await saveFitnessPrefs(db.sql, "alice", { weeklyTargetSessions: 4, sessionMinutes: 30, preferredTimes: ["MORNING"] });
      await saveFitnessPrefs(db.sql, "alice", { weeklyTargetSessions: 2, sessionMinutes: 60, preferredTimes: ["MIDDAY", "EVENING"] });
      expect(await getFitnessPrefs(db.sql, "alice")).toEqual({ weeklyTargetSessions: 2, sessionMinutes: 60, preferredTimes: ["MIDDAY", "EVENING"] });
      expect(await getFitnessPrefs(db.sql, "bob")).toEqual(DEFAULT_FITNESS_PREFS);
    });

    it("refuses to save invalid preferences", async () => {
      await expect(saveFitnessPrefs(db.sql, "carol", { ...DEFAULT_FITNESS_PREFS, weeklyTargetSessions: 0 })).rejects.toThrow(
        InvalidFitnessPrefsError,
      );
    });
  });
});
