// Where nutrition data is kept for now: this browser's localStorage, per user
// and, for meals, per day. Temporary until Penn Fitness has its own database
// tables; only this file should need to change then.
//
// Everything read back is checked against its schema, since stored data can
// be stale or edited by hand.

import { z } from "@penntools/core/ai";
import { LoggedMeal, MealPlan, NutritionPreferences, PlannerProfile, WeeklySchedule } from "@penntools/tool-penn-fitness";

const prefix = (userId: string) => `penn-fitness:${userId}:nutrition`;

/** A date in the browser's time zone, as YYYY-MM-DD; today by default. */
export function today(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function read<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: the data still lives on the page until it's closed.
  }
}

export function loadPreferences(userId: string): NutritionPreferences | null {
  return read(`${prefix(userId)}:preferences`, NutritionPreferences);
}

export function savePreferences(userId: string, preferences: NutritionPreferences) {
  write(`${prefix(userId)}:preferences`, preferences);
}

export function loadMeals(userId: string, date: string): LoggedMeal[] {
  return read(`${prefix(userId)}:meals:${date}`, z.array(LoggedMeal)) ?? [];
}

export function saveMeals(userId: string, date: string, meals: LoggedMeal[]) {
  write(`${prefix(userId)}:meals:${date}`, meals);
}

export function loadProfile(userId: string): PlannerProfile | null {
  return read(`${prefix(userId)}:planner-profile`, PlannerProfile);
}

export function saveProfile(userId: string, profile: PlannerProfile) {
  write(`${prefix(userId)}:planner-profile`, profile);
}

export function loadSchedule(userId: string): WeeklySchedule | null {
  return read(`${prefix(userId)}:schedule`, WeeklySchedule);
}

export function saveSchedule(userId: string, schedule: WeeklySchedule) {
  write(`${prefix(userId)}:schedule`, schedule);
}

export function loadPlan(userId: string): MealPlan | null {
  return read(`${prefix(userId)}:meal-plan`, MealPlan);
}

export function savePlan(userId: string, plan: MealPlan) {
  write(`${prefix(userId)}:meal-plan`, plan);
}

/** What the setup looked like when the plan was made, to tell when it's out of date. */
export function setupKey(profile: PlannerProfile | null, preferences: NutritionPreferences | null, schedule: WeeklySchedule | null): string {
  return JSON.stringify({ profile, preferences, schedule });
}

/** The setupKey the current plan was made from, or null for a plan saved before this was tracked. */
export function loadPlanBasis(userId: string): string | null {
  return read(`${prefix(userId)}:plan-basis`, z.string());
}

export function savePlanBasis(userId: string, basis: string) {
  write(`${prefix(userId)}:plan-basis`, basis);
}

/** Forgets the setup, the plan and its grocery checks. The meal log, and so the streak, stays. */
export function clearSetup(userId: string) {
  for (const key of ["preferences", "planner-profile", "schedule", "meal-plan", "plan-basis", "grocery-checks"]) {
    try {
      localStorage.removeItem(`${prefix(userId)}:${key}`);
    } catch {
      // Storage disabled: nothing was saved there anyway.
    }
  }
}

/** Dollars spent on logged meals this week, Monday to today. */
export function spentThisWeek(userId: string): number {
  const day = new Date();
  const daysSinceMonday = (day.getDay() + 6) % 7;
  let total = 0;
  for (let i = 0; i <= daysSinceMonday; i++) {
    total += loadMeals(userId, today(day)).reduce((sum, m) => sum + (m.estimatedCost ?? 0), 0);
    day.setDate(day.getDate() - 1);
  }
  return Math.round(total);
}

/** The grocery items ticked off for the current plan, by name. */
export function loadGroceryChecks(userId: string): string[] {
  return read(`${prefix(userId)}:grocery-checks`, z.array(z.string())) ?? [];
}

export function saveGroceryChecks(userId: string, names: string[]) {
  write(`${prefix(userId)}:grocery-checks`, names);
}

/**
 * Days in a row with at least one meal logged, ending today, or yesterday if
 * nothing is logged yet today. Looks back up to 60 days.
 */
export function loggingStreak(userId: string): number {
  const day = new Date();
  if (loadMeals(userId, today(day)).length === 0) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (streak < 60 && loadMeals(userId, today(day)).length > 0) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
