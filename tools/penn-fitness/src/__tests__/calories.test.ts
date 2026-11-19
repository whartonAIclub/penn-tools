import { describe, it, expect } from "vitest";
import { caloriesEaten, estimatedBurn, TYPICAL_WEIGHT_KG } from "../calories.js";

describe("caloriesEaten", () => {
  it("adds up the meals with an estimate, to the nearest 10, and says how many had one", () => {
    expect(caloriesEaten([{ estimatedCalories: 300 }, { estimatedCalories: 604 }, { estimatedCalories: null }])).toEqual({
      calories: 900,
      estimated: 2,
      logged: 3,
    });
  });

  it("is 0 of 0 with nothing logged, and ignores estimates that aren't real numbers", () => {
    expect(caloriesEaten([])).toEqual({ calories: 0, estimated: 0, logged: 0 });
    expect(caloriesEaten([{ estimatedCalories: Number.NaN }, { estimatedCalories: -50 }])).toEqual({ calories: 0, estimated: 0, logged: 2 });
  });
});

describe("estimatedBurn", () => {
  it("is METs × weight × hours at a moderate pace, to the nearest 10", () => {
    // 5 × 77 kg × 0.75 h = 288.75
    expect(estimatedBurn(45, 77)).toBe(290);
    // Three 45-minute workouts.
    expect(estimatedBurn(135, 77)).toBe(870);
  });

  it("uses a typical weight when there isn't one", () => {
    expect(estimatedBurn(60, null)).toBe(5 * TYPICAL_WEIGHT_KG);
    expect(estimatedBurn(60, 0)).toBe(5 * TYPICAL_WEIGHT_KG);
  });

  it("is 0 with no workouts", () => {
    expect(estimatedBurn(0, 77)).toBe(0);
    expect(estimatedBurn(-10, 77)).toBe(0);
  });
});
