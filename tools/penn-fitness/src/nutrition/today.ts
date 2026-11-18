// ─────────────────────────────────────────────────────────────────────────────
// Today: the meals a student has logged today, in order, and a summary of the
// day so far. Pure functions, so the page and (later) Fitness can share them.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import { MealLog } from "./quickLog.js";

/** A meal the student has kept, with what's needed to list and remove it. */
export const LoggedMeal = MealLog.shape.meals.element.extend({
  id: z.string(),
  /** When it was logged, as an ISO timestamp; stands in for `time` when the meal has none. */
  loggedAt: z.string(),
});
export type LoggedMeal = z.infer<typeof LoggedMeal>;

export interface DaySummary {
  meals: number;
  /** The latest meal's time, HH:MM, or null with no meals. */
  lastMealTime: string | null;
  /** Minutes from the last meal to `now`, or null with no meals. */
  minutesSinceLastMeal: number | null;
  /** Meals with medium or high protein. */
  proteinMeals: number;
  /** Main meals not logged although their usual time has passed. */
  missing: ("breakfast" | "lunch" | "dinner")[];
}

// When each main meal is usually over, in minutes after midnight.
const USUALLY_OVER = { breakfast: 11 * 60, lunch: 15 * 60, dinner: 21 * 60 } as const;

/** "13:05" → 785, or null if it isn't HH:MM. */
export function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** When the meal was eaten, in minutes after midnight: its time, or failing that when it was logged. */
export function mealMinutes(meal: LoggedMeal): number {
  const time = meal.time === null ? null : toMinutes(meal.time);
  if (time !== null) return time;
  const logged = new Date(meal.loggedAt);
  return logged.getHours() * 60 + logged.getMinutes();
}

/** The meals in the order they were eaten. */
export function sortMeals(meals: LoggedMeal[]): LoggedMeal[] {
  return [...meals].sort((a, b) => mealMinutes(a) - mealMinutes(b));
}

/** The day so far, as of `now` (minutes after midnight). */
export function summarizeDay(meals: LoggedMeal[], now: number): DaySummary {
  const sorted = sortMeals(meals);
  const last = sorted.at(-1);
  const lastMinutes = last ? mealMinutes(last) : null;
  return {
    meals: meals.length,
    lastMealTime: lastMinutes === null ? null : formatMinutes(lastMinutes),
    minutesSinceLastMeal: lastMinutes === null ? null : Math.max(0, now - lastMinutes),
    proteinMeals: meals.filter((m) => m.protein !== "low").length,
    missing: (Object.keys(USUALLY_OVER) as (keyof typeof USUALLY_OVER)[]).filter(
      (type) => now >= USUALLY_OVER[type] && !meals.some((m) => m.type === type),
    ),
  };
}

export interface DayTotals {
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Dollars spent on bought food, from the meals' estimates. */
  spent: number;
}

/** The day's estimated grams and spending, counting unknowns as zero. */
export function dayTotals(meals: LoggedMeal[]): DayTotals {
  const sum = (pick: (m: LoggedMeal) => number | null) => Math.round(meals.reduce((total, m) => total + (pick(m) ?? 0), 0));
  return {
    proteinG: sum((m) => m.proteinG),
    carbsG: sum((m) => m.carbsG),
    fatG: sum((m) => m.fatG),
    spent: sum((m) => m.estimatedCost),
  };
}

/** 785 → "13:05". */
export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
