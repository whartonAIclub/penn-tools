// ─────────────────────────────────────────────────────────────────────────────
// Food preferences: what the nutrition features need to know about a student.
// Only nutrition's own fields live here; anything Fitness needs too (name,
// goals, schedule) belongs in the shared profile.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import { DINING_PLAN_IDS, describeDiningPlan, findDiningPlan } from "./foodData.js";

// One diet per student, picked from a dropdown. Gluten and dairy are
// intolerances, so they go under allergies instead.
export const DIETS = {
  none: "No specific diet",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  halal: "Halal",
  kosher: "Kosher",
} as const;

export const COOKING_SETUPS = {
  none: "No kitchen",
  microwave: "Microwave and fridge",
  shared: "Shared kitchen",
  full: "My own kitchen",
} as const;

// No weight-loss goal, on purpose: restrictive goals carry real eating-disorder
// risk among students.
export const NUTRITION_GOALS = {
  "eat-regularly": "Eat more regularly",
  "more-energy": "Have more energy",
  "more-protein": "Get more protein",
  "build-muscle": "Support building muscle",
  "eat-healthier": "Eat a more balanced diet",
  "save-money": "Spend less on food",
} as const;

type Keys<T> = [keyof T & string, ...(keyof T & string)[]];
/** An options object's keys, typed for z.enum. */
export const optionKeys = <T extends object>(o: T) => Object.keys(o) as Keys<T>;

export const MAX_LIST_ITEMS = 20;
/** One entry in a free-text list, such as an allergy or a favorite place. */
export const ListItem = z.string().trim().min(1).max(60);

export const NutritionPreferences = z.object({
  diet: z.enum(optionKeys(DIETS)),
  allergies: z.array(ListItem).max(MAX_LIST_ITEMS),
  dislikes: z.array(ListItem).max(MAX_LIST_ITEMS),
  budgetPerMeal: z.number().positive().max(200).nullable(),
  /** A plan id from DINING_PLANS, or "none". */
  diningPlan: z.enum(DINING_PLAN_IDS),
  cooking: z.enum(optionKeys(COOKING_SETUPS)),
  goals: z.array(z.enum(optionKeys(NUTRITION_GOALS))),
});
export type NutritionPreferences = z.infer<typeof NutritionPreferences>;

export const EMPTY_PREFERENCES: NutritionPreferences = {
  diet: "none",
  allergies: [],
  dislikes: [],
  budgetPerMeal: null,
  diningPlan: "none",
  cooking: "none",
  goals: [],
};

/** The preferences as lines for an AI prompt, or null if nothing is set. */
export function describePreferences(p: NutritionPreferences): string | null {
  const lines = [
    p.diet !== "none" && `Diet: ${DIETS[p.diet]}`,
    p.allergies.length && `Allergies or intolerances: ${p.allergies.join(", ")}`,
    p.dislikes.length && `Dislikes: ${p.dislikes.join(", ")}`,
    p.budgetPerMeal !== null && `Budget: about $${p.budgetPerMeal} per meal`,
    p.diningPlan !== "none" && diningPlanLine(p.diningPlan),
    p.cooking !== "none" && `Cooking: ${COOKING_SETUPS[p.cooking]}`,
    p.goals.length && `Goals: ${p.goals.map((g) => NUTRITION_GOALS[g]).join(", ")}`,
  ].filter((line): line is string => typeof line === "string");
  return lines.length ? lines.join("\n") : null;
}

function diningPlanLine(id: string): string | false {
  const plan = findDiningPlan(id);
  return plan !== null && `Dining plan: ${describeDiningPlan(plan)}`;
}

/** "nuts, , Dairy " → ["nuts", "Dairy"]: for the comma-separated fields in the form. */
export function splitList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
}
