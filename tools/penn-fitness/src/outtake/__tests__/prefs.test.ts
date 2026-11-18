import { describe, it, expect } from "vitest";
import { DEFAULT_FITNESS_PREFS, checkFitnessPrefs, type FitnessPrefs } from "../prefs.js";

const prefs = (changes: Partial<FitnessPrefs>): FitnessPrefs => ({ ...DEFAULT_FITNESS_PREFS, ...changes });

describe("checkFitnessPrefs", () => {
  it("accepts the spec's default of 3 sessions of 45 minutes", () => {
    expect(DEFAULT_FITNESS_PREFS).toEqual({ weeklyTargetSessions: 3, sessionMinutes: 45, preferredTimes: [] });
    expect(checkFitnessPrefs(DEFAULT_FITNESS_PREFS)).toEqual([]);
    expect(checkFitnessPrefs(prefs({ preferredTimes: ["MORNING", "EVENING"] }))).toEqual([]);
  });

  it("keeps the weekly target and session length in range, as whole numbers", () => {
    expect(checkFitnessPrefs(prefs({ weeklyTargetSessions: 0 }))).toEqual(["Pick 1 to 14 workouts a week."]);
    expect(checkFitnessPrefs(prefs({ weeklyTargetSessions: 2.5 }))).toEqual(["Pick 1 to 14 workouts a week."]);
    expect(checkFitnessPrefs(prefs({ sessionMinutes: 5 }))).toEqual(["Pick a workout length of 10 to 180 minutes."]);
    expect(checkFitnessPrefs(prefs({ sessionMinutes: 181 }))).toEqual(["Pick a workout length of 10 to 180 minutes."]);
  });

  it("only takes known preferred times, each once", () => {
    expect(checkFitnessPrefs(prefs({ preferredTimes: ["NIGHT" as "MORNING"] }))).toEqual([
      "Pick preferred times from morning, midday and evening.",
    ]);
    expect(checkFitnessPrefs(prefs({ preferredTimes: ["MORNING", "MORNING"] }))).toEqual(["Pick each preferred time only once."]);
  });
});
