// Quick Log's logic, tested with a fake AI that records what it was asked and
// returns a canned reply. No API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { checkMealText, logMeals, MealLog, MAX_MEAL_TEXT_LENGTH, SAMPLE_MEAL_LOG } from "../nutrition/quickLog.js";
import { EMPTY_PREFERENCES } from "../nutrition/preferences.js";

/** An AI whose generateObject returns `object` and records each request. */
function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<typeof MealLog>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generateObject: async (request: GenerateObjectRequest<typeof MealLog>) => {
      requests.push(request);
      return {
        object,
        provider: "openai",
        model: "fake-model",
        usage: { inputTokens: 5, outputTokens: 2, reasoningTokens: 0 },
      };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("logMeals", () => {
  it("asks for the MealLog shape on the fast tier and returns the meals", async () => {
    const { ai, requests } = fakeAI(SAMPLE_MEAL_LOG);
    expect(await logMeals(ai, "anthropic", "oatmeal at 8")).toEqual(SAMPLE_MEAL_LOG);
    expect(requests[0]).toMatchObject({
      provider: "anthropic",
      tier: "fast",
      messages: [{ role: "user", content: "oatmeal at 8" }],
    });
    expect(requests[0]!.schema).toBe(MealLog);
  });

  it("tells the AI the student's preferences when there are any", async () => {
    const { ai, requests } = fakeAI(SAMPLE_MEAL_LOG);
    await logMeals(ai, "openai", "a wrap", { ...EMPTY_PREFERENCES, allergies: ["peanuts"] });
    await logMeals(ai, "openai", "a wrap", EMPTY_PREFERENCES);
    expect(requests[0]!.system).toContain("Allergies or intolerances: peanuts");
    expect(requests[1]!.system).not.toContain("preferences:");
  });
});

describe("MealLog", () => {
  it("accepts the sample", () => {
    expect(MealLog.safeParse(SAMPLE_MEAL_LOG).success).toBe(true);
  });

  it("requires every field, with null when unknown", () => {
    const meal = SAMPLE_MEAL_LOG.meals[0]!;
    const { time: _time, ...withoutTime } = meal;
    expect(MealLog.safeParse({ meals: [withoutTime], note: null }).success).toBe(false);
    expect(MealLog.safeParse({ meals: [{ ...meal, time: null }], note: null }).success).toBe(true);
  });

  it("rejects levels other than low, medium and high", () => {
    const meal = { ...SAMPLE_MEAL_LOG.meals[0]!, protein: "lots" };
    expect(MealLog.safeParse({ meals: [meal], note: null }).success).toBe(false);
  });
});

describe("checkMealText", () => {
  it("accepts a description within the limit", () => {
    expect(checkMealText("a bagel")).toBeNull();
  });

  it.each([
    ["empty text", "  "],
    ["a non-string", 5],
    ["text over the limit", "x".repeat(MAX_MEAL_TEXT_LENGTH + 1)],
  ])("rejects %s", (_label, value) => {
    expect(checkMealText(value)).toEqual(expect.any(String));
  });
});
