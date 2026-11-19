import { describe, it, expect } from "vitest";
import { NO_ADJUSTMENTS, OUTTAKE_PREFS, type OuttakePrefs } from "../prefs.js";

const check = (changes: Partial<OuttakePrefs>) => OUTTAKE_PREFS.check({ ...OUTTAKE_PREFS.defaults, ...changes });

describe("outtake preferences", () => {
  it("defaults to the spec's 3 sessions of 45 minutes, any time, spread out, with no check-in adjustments", () => {
    expect(OUTTAKE_PREFS.defaults).toEqual({
      weeklyTargetSessions: 3,
      sessionMinutes: 45,
      preferredTimes: [],
      spreadOut: true,
      adjustments: { travelFactor: 1, bufferMinutes: 0, wakeBufferMinutes: 0, bedBufferMinutes: 0 },
    });
    expect(OUTTAKE_PREFS.check(OUTTAKE_PREFS.defaults)).toEqual([]);
    expect(check({ preferredTimes: ["MORNING", "EVENING"], spreadOut: false })).toEqual([]);
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

  it("needs a yes or no for spreading sessions out", () => {
    expect(check({ spreadOut: "yes" as unknown as boolean })).toEqual(["Say whether you'd like your workouts spread across the week."]);
  });

  it("only takes check-in adjustments within their ranges", () => {
    const wrong = "Your weekly check-in settings look wrong; they'll be reset.";
    expect(check({ adjustments: { ...NO_ADJUSTMENTS, travelFactor: 4, bufferMinutes: 60, bedBufferMinutes: 180 } })).toEqual([]);
    expect(check({ adjustments: { ...NO_ADJUSTMENTS, travelFactor: 5 } })).toEqual([wrong]);
    expect(check({ adjustments: { ...NO_ADJUSTMENTS, bedBufferMinutes: -30 } })).toEqual([]);
    expect(check({ adjustments: { ...NO_ADJUSTMENTS, bedBufferMinutes: -31 } })).toEqual([wrong]);
    expect(check({ adjustments: { ...NO_ADJUSTMENTS, wakeBufferMinutes: Number.NaN } })).toEqual([wrong]);
    expect(check({ adjustments: { travelFactor: 1 } as unknown as typeof NO_ADJUSTMENTS })).toEqual([wrong]);
  });
});
