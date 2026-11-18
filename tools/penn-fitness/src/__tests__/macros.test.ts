import { describe, it, expect } from "vitest";
import { describeMacros, macroTargets } from "../nutrition/macros.js";
import { DEFAULT_PLANNER_PROFILE, describeProfile } from "../nutrition/plannerProfile.js";

describe("macroTargets", () => {
  it("scales grams per kilogram by activity level, rounded to 5 g", () => {
    expect(macroTargets(70, "moderate")).toEqual({ protein: [85, 110], carbs: [350, 490], fat: [55, 85] });
    expect(macroTargets(70, "light").protein).toEqual([55, 85]);
    expect(macroTargets(70, "high").carbs).toEqual([420, 700]);
  });
});

describe("describeMacros", () => {
  it("reads as ranges", () => {
    expect(describeMacros(macroTargets(70, "moderate"))).toBe(
      "Daily targets (approximate ranges): protein 85–110 g, carbohydrate 350–490 g, fat 55–85 g",
    );
  });
});

describe("describeProfile", () => {
  it("includes macro targets only when a weight is given", () => {
    expect(describeProfile(DEFAULT_PLANNER_PROFILE)).not.toContain("Daily targets");
    expect(describeProfile({ ...DEFAULT_PLANNER_PROFILE, weightKg: 70 })).toContain("protein 85–110 g");
  });
});
