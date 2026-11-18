// The meal planner's logic: reading schedules, finding free time, and planning
// meals, with a fake AI. No API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { findOutlet, OUTLETS } from "../nutrition/foodData.js";
import { EMPTY_PREFERENCES } from "../nutrition/preferences.js";
import { DEFAULT_PLANNER_PROFILE, PlannerProfile } from "../nutrition/plannerProfile.js";
import { allowedPlaces, describePlaces, describeWeek, eatingOutCost, MealPlan, nextMeal, planMeals, tidyPlan, type PlannedMeal } from "../nutrition/mealPlan.js";
import { toMinutes } from "../nutrition/today.js";
import { SAMPLE_MEAL_PLAN, SAMPLE_SCHEDULE } from "../nutrition/plannerSamples.js";
import { busyAt, checkScheduleText, cleanBlocks, freeWindows, readSchedule } from "../nutrition/schedule.js";

// Requests are recorded as MealPlan requests; readSchedule's differ only in schema.
type Request = GenerateObjectRequest<typeof MealPlan>;

/** An AI whose generateObject returns `object` and records each request. */
function fakeAI(object: unknown) {
  const requests: Request[] = [];
  const ai = {
    providers: async () => ["openai"],
    generateObject: async (request: Request) => {
      requests.push(request);
      return { object, provider: "openai", model: "fake-model", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("cleanBlocks", () => {
  it("pads times, drops unreadable or backwards blocks, and sorts by day then time", () => {
    expect(
      cleanBlocks([
        { day: "wed", start: "9:00", end: "10:00", label: " Lab ", location: " DRL " },
        { day: "mon", start: "14:00", end: "13:00", label: "Backwards", location: null },
        { day: "mon", start: "noon", end: "13:00", label: "Unreadable", location: null },
        { day: "mon", start: "08:30", end: "10:00", label: "", location: "" },
      ]),
    ).toEqual([
      { day: "mon", start: "08:30", end: "10:00", label: "Busy", location: null },
      { day: "wed", start: "09:00", end: "10:00", label: "Lab", location: "DRL" },
    ]);
  });
});

describe("readSchedule", () => {
  it("asks the AI to read the text and cleans its blocks", async () => {
    const { ai, requests } = fakeAI({ blocks: [{ day: "tue", start: "8:30", end: "10:00", label: "STAT 6130", location: null }] });
    expect(await readSchedule(ai, "openai", "STAT 6130 Tue 8:30-10")).toEqual([
      { day: "tue", start: "08:30", end: "10:00", label: "STAT 6130", location: null },
    ]);
    expect(requests[0]).toMatchObject({ provider: "openai", tier: "fast" });
  });
});

describe("checkScheduleText", () => {
  it("rejects empty and over-long text", () => {
    expect(checkScheduleText("Mon 9-10 class")).toBeNull();
    expect(checkScheduleText(" ")).toEqual(expect.any(String));
    expect(checkScheduleText("x".repeat(3001))).toEqual(expect.any(String));
  });
});

describe("freeWindows", () => {
  it("finds the gaps between waking, classes and sleep", () => {
    expect(freeWindows(SAMPLE_SCHEDULE, "mon", "08:00", "23:30")).toEqual([
      { start: "08:00", end: "10:15" },
      { start: "11:45", end: "13:45" },
      { start: "15:15", end: "23:30" },
    ]);
  });

  it("skips gaps shorter than the minimum and handles overlapping blocks", () => {
    const blocks = [
      { day: "fri" as const, start: "09:00", end: "11:00", label: "A" , location: null },
      { day: "fri" as const, start: "10:30", end: "12:00", label: "B" , location: null },
      { day: "fri" as const, start: "12:15", end: "13:00", label: "C" , location: null },
    ];
    expect(freeWindows(blocks, "fri", "08:00", "22:00")).toEqual([
      { start: "08:00", end: "09:00" },
      { start: "13:00", end: "22:00" },
    ]);
  });

  it("treats a bedtime after midnight as the end of the day", () => {
    expect(freeWindows([], "sat", "10:00", "01:00")).toEqual([{ start: "10:00", end: "23:59" }]);
  });
});

describe("busyAt", () => {
  it("finds the block a time falls in, if any", () => {
    expect(busyAt(SAMPLE_SCHEDULE, "mon", "10:30")?.label).toBe("FNCE 6110");
    expect(busyAt(SAMPLE_SCHEDULE, "mon", "11:45")).toBeNull();
    expect(busyAt(SAMPLE_SCHEDULE, "sat", "10:30")).toBeNull();
  });
});

describe("planMeals", () => {
  const input = { preferences: EMPTY_PREFERENCES, profile: DEFAULT_PLANNER_PROFILE, schedule: SAMPLE_SCHEDULE };

  it("sends the week's free windows and the profile, and returns the tidied plan", async () => {
    const { ai, requests } = fakeAI(SAMPLE_MEAL_PLAN);
    expect(await planMeals(ai, "anthropic", input)).toEqual(tidyPlan(SAMPLE_MEAL_PLAN, allowedPlaces(input)));
    expect(requests[0]).toMatchObject({ provider: "anthropic", tier: "standard", schema: MealPlan });
    const content = requests[0]!.messages[0]!.content as string;
    expect(content).toContain("Monday: busy 10:15–11:45 FNCE 6110 @ Huntsman Hall; 13:45–15:15 MKTG 6110 @ Huntsman Hall; free 08:00–10:15, 11:45–13:45, 15:15–23:30");
    expect(content).toContain("Eating style: A mix of both");
  });
});

describe("describeWeek", () => {
  it("covers all seven days", () => {
    expect(describeWeek(DEFAULT_PLANNER_PROFILE, []).split("\n")).toHaveLength(7);
  });
});

describe("tidyPlan", () => {
  const out = (m: Partial<PlannedMeal>): PlannedMeal => ({
    time: "12:00",
    type: "lunch",
    name: "Bowl",
    source: "eat-out",
    place: null,
    placeType: null,
    estimatedCost: 12,
    proteinG: null,
    carbsG: null,
    fatG: null,
    ...m,
  });
  const places = ["Houston Market"];

  it("keeps only places from the student's list, as they wrote them", () => {
    const plan = tidyPlan(
      {
        days: [{ day: "mon", meals: [out({ place: "houston market" }), out({ time: "18:00", place: "Made-Up Diner", placeType: "Diner" })] }],
        tips: [],
        groceries: [],
      },
      places,
    );
    expect(plan.days[0]!.meals.map((m) => [m.place, m.placeType])).toEqual([
      ["Houston Market", null],
      [null, "Diner"],
    ]);
  });

  it("orders days and meals, padding times", () => {
    const plan = tidyPlan(
      {
        days: [
          { day: "sun", meals: [] },
          { day: "mon", meals: [out({ time: "13:00" }), out({ time: "8:30" })] },
        ],
        tips: ["a", "b", "c", "d"],
        groceries: [],
      },
      places,
    );
    expect(plan.days.map((d) => d.day)).toEqual(["mon", "sun"]);
    expect(plan.days[0]!.meals.map((m) => m.time)).toEqual(["08:30", "13:00"]);
    expect(plan.tips).toHaveLength(3);
  });
});

describe("samples", () => {
  it("the sample plan is valid and has no meals during the sample schedule's classes", () => {
    expect(MealPlan.safeParse(SAMPLE_MEAL_PLAN).success).toBe(true);
    const clashes = SAMPLE_MEAL_PLAN.days.flatMap(({ day, meals }) =>
      meals.filter((m) => busyAt(SAMPLE_SCHEDULE, day, m.time)).map((m) => `${day} ${m.time}`),
    );
    expect(clashes).toEqual([]);
  });

  it("the sample plan only names places from the food data", () => {
    const places = SAMPLE_MEAL_PLAN.days.flatMap((d) => d.meals.map((m) => m.place)).filter((p) => p !== null);
    expect(places.length).toBeGreaterThan(0);
    for (const place of places) expect(findOutlet(place)?.name).toBe(place);
  });

  it("the default profile is valid", () => {
    expect(PlannerProfile.safeParse(DEFAULT_PLANNER_PROFILE).success).toBe(true);
  });
});

describe("nextMeal", () => {
  it("finds the next meal today, counting one that started in the last half hour", () => {
    expect(nextMeal(SAMPLE_MEAL_PLAN, "mon", toMinutes("11:00")!)).toMatchObject({ day: "mon", minutesUntil: 60, meal: { type: "lunch" } });
    expect(nextMeal(SAMPLE_MEAL_PLAN, "mon", toMinutes("12:20")!)).toMatchObject({ day: "mon", minutesUntil: 0, meal: { type: "lunch" } });
  });

  it("rolls over to the next day after the last meal", () => {
    expect(nextMeal(SAMPLE_MEAL_PLAN, "mon", toMinutes("21:00")!)).toMatchObject({
      day: "tue",
      minutesUntil: 11 * 60,
      meal: { type: "breakfast" },
    });
  });

  it("is null for an empty plan", () => {
    expect(nextMeal({ days: [], tips: [], groceries: [] }, "mon", 600)).toBeNull();
  });
});

describe("eatingOutCost", () => {
  it("adds up only eating-out meals", () => {
    expect(eatingOutCost(SAMPLE_MEAL_PLAN.days[0]!.meals)).toBe(11);
  });
});

describe("tidyPlan groceries", () => {
  it("groups groceries by category, then by name", () => {
    const plan = tidyPlan(
      {
        days: [],
        tips: [],
        groceries: [
          { name: "Rice", quantity: "1 bag", category: "grains" },
          { name: "Spinach", quantity: "1 bag", category: "produce" },
          { name: "Apples", quantity: "3", category: "produce" },
        ],
      },
      [],
    );
    expect(plan.groceries.map((g) => g.name)).toEqual(["Apples", "Spinach", "Rice"]);
  });
});

describe("allowedPlaces and describePlaces", () => {
  const base = { preferences: EMPTY_PREFERENCES, profile: DEFAULT_PLANNER_PROFILE, schedule: [] };

  it("puts favorites first, using the food data's names for known places and keeping unknown ones", () => {
    const input = { ...base, profile: { ...DEFAULT_PLANNER_PROFILE, favoritePlaces: ["chipotle mexican grill", "Abner's"] } };
    expect(allowedPlaces(input).slice(0, 2)).toEqual(["Chipotle Mexican Grill", "Abner's"]);
    expect(allowedPlaces(input).filter((p) => p === "Chipotle Mexican Grill")).toHaveLength(1);
    const text = describePlaces(input);
    expect(text).toContain("My favorite places:\nChipotle Mexican Grill (3925 Walnut Street; near The Radian");
    expect(text).toContain("Chicken (4 oz) (180 cal, 32 g protein, 0 g carbs, 7 g fat)");
    expect(text).toContain("Abner's (no menu on file)");
  });

  it("puts where the student's dining plan works before other places", () => {
    const places = allowedPlaces({ ...base, preferences: { ...EMPTY_PREFERENCES, diningPlan: "upperclass-108" } });
    expect(places.indexOf("1920 Commons")).toBeLessThan(places.indexOf("Chipotle Mexican Grill"));
  });

  it("offers every place in the food data even when the student listed none", () => {
    expect(allowedPlaces(base)).toEqual(OUTLETS.map((o) => o.name));
    expect(describePlaces(base)).toContain("Other places near campus and in Center City:");
  });

  it("says 'about' for approximate nutrition", () => {
    expect(describePlaces(base)).toContain("Beef pho, regular bowl (about 460 cal");
  });
});
