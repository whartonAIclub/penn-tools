import { describe, it, expect } from "vitest";
import { describePreferences, EMPTY_PREFERENCES, NutritionPreferences, splitList } from "../nutrition/preferences.js";

describe("NutritionPreferences", () => {
  it("accepts the empty preferences", () => {
    expect(NutritionPreferences.safeParse(EMPTY_PREFERENCES).success).toBe(true);
  });

  it("rejects unknown options and a negative budget", () => {
    expect(NutritionPreferences.safeParse({ ...EMPTY_PREFERENCES, diet: "carnivore" }).success).toBe(false);
    expect(NutritionPreferences.safeParse({ ...EMPTY_PREFERENCES, goals: ["lose-weight"] }).success).toBe(false);
    expect(NutritionPreferences.safeParse({ ...EMPTY_PREFERENCES, budgetPerMeal: -5 }).success).toBe(false);
  });
});

describe("describePreferences", () => {
  it("is null when nothing is set", () => {
    expect(describePreferences(EMPTY_PREFERENCES)).toBeNull();
  });

  it("lists only what is set, with readable labels", () => {
    const text = describePreferences({
      ...EMPTY_PREFERENCES,
      diet: "vegetarian",
      allergies: ["peanuts", "shellfish"],
      budgetPerMeal: 12,
      goals: ["more-protein"],
    });
    expect(text).toBe(
      "Diet: Vegetarian\nAllergies or intolerances: peanuts, shellfish\nBudget: about $12 per meal\nGoals: Get more protein",
    );
  });
});

describe("splitList", () => {
  it("splits on commas and drops blanks", () => {
    expect(splitList(" nuts, , Dairy ")).toEqual(["nuts", "Dairy"]);
    expect(splitList("")).toEqual([]);
  });
});
