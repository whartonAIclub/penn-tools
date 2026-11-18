// ─────────────────────────────────────────────────────────────────────────────
// Macro targets: daily protein, carbohydrate and fat ranges in grams, from body
// weight and activity level, using common sports-nutrition guidance in grams
// per kilogram. Ranges, not exact numbers, and never below maintenance: they
// guide the planner and aren't something to hit precisely.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlannerProfile } from "./plannerProfile.js";

export type ActivityLevel = PlannerProfile["activityLevel"];

/** Grams per kilogram of body weight per day, [low, high], by activity level. */
const GRAMS_PER_KG: Record<ActivityLevel, Record<"protein" | "carbs" | "fat", [number, number]>> = {
  light: { protein: [0.8, 1.2], carbs: [3, 5], fat: [0.8, 1.0] },
  moderate: { protein: [1.2, 1.6], carbs: [5, 7], fat: [0.8, 1.2] },
  high: { protein: [1.6, 2.0], carbs: [6, 10], fat: [1.0, 1.5] },
};

export interface MacroTargets {
  /** Grams per day, [low, high]. */
  protein: [number, number];
  carbs: [number, number];
  fat: [number, number];
}

export const KG_PER_LB = 0.45359237;
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 250;

/** Daily macro ranges for this weight and activity level, rounded to 5 g. */
export function macroTargets(weightKg: number, activityLevel: ActivityLevel): MacroTargets {
  const per = GRAMS_PER_KG[activityLevel];
  const range = ([low, high]: [number, number]): [number, number] => [round5(low * weightKg), round5(high * weightKg)];
  return { protein: range(per.protein), carbs: range(per.carbs), fat: range(per.fat) };
}

function round5(grams: number): number {
  return Math.round(grams / 5) * 5;
}

/** The targets as a line for an AI prompt. */
export function describeMacros(t: MacroTargets): string {
  const r = ([low, high]: [number, number]) => `${low}–${high} g`;
  return `Daily targets (approximate ranges): protein ${r(t.protein)}, carbohydrate ${r(t.carbs)}, fat ${r(t.fat)}`;
}
