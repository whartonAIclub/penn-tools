import { describe, it, expect } from "vitest";
import { OUTTAKE_PREFS, type OuttakePrefs } from "../prefs.js";

const check = (changes: Partial<OuttakePrefs>) => OUTTAKE_PREFS.check({ ...OUTTAKE_PREFS.defaults, ...changes });

describe("outtake preferences", () => {
  it("defaults to the spec's 3 sessions of 45 minutes, any time", () => {
    expect(OUTTAKE_PREFS.defaults).toEqual({ weeklyTargetSessions: 3, sessionMinutes: 45, preferredTimes: [] });
    expect(OUTTAKE_PREFS.check(OUTTAKE_PREFS.defaults)).toEqual([]);
    expect(check({ preferredTimes: ["MORNING", "EVENING"] })).toEqual([]);
  });

  it("keeps the weekly target and session length in range, as whole numbers", () => {
    expect(check({ weeklyTargetSessions: 0 })).toEqual(["Pick 1 to 14 workouts a week."]);
    expect(check({ weeklyTargetSessions: 2.5 })).toEqual(["Pick 1 to 14 workouts a week."]);
    expect(check({ sessionMinutes: 5 })).toEqual(["Pick a workout length of 10 to 180 minutes."]);
    expect(check({ sessionMinutes: 181 })).toEqual(["Pick a workout length of 10 to 180 minutes."]);
  });

  it("only takes known preferred times, each once", () => {
    expect(check({ preferredTimes: ["NIGHT" as "MORNING"] })).toEqual(["Pick preferred times from morning, midday and evening."]);
    expect(check({ preferredTimes: ["MORNING", "MORNING"] })).toEqual(["Pick each preferred time only once."]);
  });
});
