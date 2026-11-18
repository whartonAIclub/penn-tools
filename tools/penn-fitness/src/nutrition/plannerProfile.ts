// ─────────────────────────────────────────────────────────────────────────────
// Planner profile: what the meal planner needs beyond food preferences (diet,
// allergies, budget, dining plan and cooking setup live in preferences.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import { describeMacros, macroTargets, MAX_WEIGHT_KG, MIN_WEIGHT_KG } from "./macros.js";
import { ListItem, MAX_LIST_ITEMS, optionKeys } from "./preferences.js";
import { Time } from "./schedule.js";

// A stand-in for now: the Fitness module will supply activity from the
// student's actual workouts, and this question can go then.
export const ACTIVITY_LEVELS = {
  light: "Light: mostly sitting, little exercise",
  moderate: "Moderate: exercise 2–4 times a week",
  high: "High: exercise 5+ times a week or training for a sport",
} as const;

export const EATING_STYLES = {
  "eat-out": "Mostly eat out",
  cook: "Mostly cook",
  mix: "A mix of both",
} as const;

export const PlannerProfile = z.object({
  activityLevel: z.enum(optionKeys(ACTIVITY_LEVELS)),
  /** Body weight, for macro targets; null if the student would rather not say. */
  weightKg: z.number().min(MIN_WEIGHT_KG).max(MAX_WEIGHT_KG).nullable(),
  /** Meals and snacks per day. */
  mealsPerDay: z.number().int().min(2).max(6),
  wakeTime: Time,
  sleepTime: Time,
  eatingStyle: z.enum(optionKeys(EATING_STYLES)),
  /** Where the student lives, e.g. "2040 Market St": where cooked meals happen. */
  home: z.string().trim().min(1).max(120).nullable(),
  /** Places the student likes, which the planner favors over the rest of the food data. */
  favoritePlaces: z.array(ListItem).max(MAX_LIST_ITEMS),
});
export type PlannerProfile = z.infer<typeof PlannerProfile>;

export const DEFAULT_PLANNER_PROFILE: PlannerProfile = {
  activityLevel: "moderate",
  weightKg: null,
  mealsPerDay: 4,
  wakeTime: "08:00",
  sleepTime: "23:30",
  eatingStyle: "mix",
  home: null,
  favoritePlaces: [],
};

/** The profile as lines for an AI prompt. */
export function describeProfile(p: PlannerProfile): string {
  return [
    `Activity level: ${ACTIVITY_LEVELS[p.activityLevel]}`,
    p.weightKg !== null && describeMacros(macroTargets(p.weightKg, p.activityLevel)),
    `Meals and snacks per day: ${p.mealsPerDay}`,
    `Wakes at ${p.wakeTime}, goes to sleep at ${p.sleepTime}`,
    `Eating style: ${EATING_STYLES[p.eatingStyle]}`,
    p.home && `Lives at: ${p.home}`,
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}
