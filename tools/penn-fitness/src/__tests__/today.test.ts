import { describe, it, expect } from "vitest";
import { SAMPLE_MEAL_LOG } from "../nutrition/quickLog.js";
import { dayTotals, sortMeals, summarizeDay, toMinutes, type LoggedMeal } from "../nutrition/today.js";

const [breakfast, lunch, drink] = SAMPLE_MEAL_LOG.meals.map(
  (meal, i): LoggedMeal => ({ ...meal, id: String(i), loggedAt: new Date(2026, 10, 3, 16, 0).toISOString() }),
) as [LoggedMeal, LoggedMeal, LoggedMeal];

describe("toMinutes", () => {
  it("reads HH:MM and rejects anything else", () => {
    expect(toMinutes("13:05")).toBe(785);
    expect(toMinutes("8:00")).toBe(480);
    expect(toMinutes("25:00")).toBeNull();
    expect(toMinutes("noon")).toBeNull();
  });
});

describe("sortMeals", () => {
  it("orders by time, using the log time for meals without one", () => {
    // The drink has no time, so it counts as eaten when logged (16:00).
    expect(sortMeals([drink, lunch, breakfast]).map((m) => m.type)).toEqual(["breakfast", "lunch", "drink"]);
  });
});

describe("summarizeDay", () => {
  it("summarizes the day so far", () => {
    expect(summarizeDay([breakfast, lunch, drink], toMinutes("17:30")!)).toEqual({
      meals: 3,
      lastMealTime: "16:00",
      minutesSinceLastMeal: 90,
      proteinMeals: 1,
      missing: [],
    });
  });

  it("notes main meals not logged once their usual time has passed", () => {
    expect(summarizeDay([breakfast], toMinutes("16:00")!).missing).toEqual(["lunch"]);
    expect(summarizeDay([breakfast], toMinutes("12:00")!).missing).toEqual([]);
  });

  it("handles an empty day", () => {
    expect(summarizeDay([], toMinutes("09:00")!)).toEqual({
      meals: 0,
      lastMealTime: null,
      minutesSinceLastMeal: null,
      proteinMeals: 0,
      missing: [],
    });
  });
});

describe("dayTotals", () => {
  it("adds up grams and spending, treating unknowns as zero", () => {
    expect(dayTotals([breakfast, lunch, { ...drink, proteinG: null }])).toEqual({ proteinG: 43, carbsG: 114, fatG: 39, spent: 14 });
    expect(dayTotals([])).toEqual({ proteinG: 0, carbsG: 0, fatG: 0, spent: 0 });
  });
});
