"use server";

// Nutrition's server actions: how the page calls the logic in
// tools/penn-fitness/src/nutrition/. Each one gets the AI API for the
// signed-in user, checks the browser's input, and calls that logic.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so AIErrors are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  checkMealText,
  logMeals,
  NutritionPreferences,
  PlanInput,
  planMeals,
  type MealLog,
  type MealPlan,
} from "@penntools/tool-penn-fitness";
import { getAI } from "@/lib/ai";

export interface ActionError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const signedOut: ActionResult<never> = { ok: false, error: { message: "Sign in with the button at the top right." } };

function invalid(message: string): ActionResult<never> {
  return { ok: false, error: { message } };
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}

// The AI API checks provider itself.

export async function quickLog(
  provider: AIProvider,
  text: string,
  preferences: unknown,
): Promise<ActionResult<MealLog>> {
  const ai = await getAI("penn-fitness");
  if (!ai) return signedOut;
  const problem = checkMealText(text);
  if (problem) return invalid(problem);
  const prefs = preferences === null ? null : NutritionPreferences.safeParse(preferences);
  if (prefs && !prefs.success) return invalid("Your food preferences look wrong. Edit and save them again.");
  return run(() => logMeals(ai, provider, text, prefs?.data ?? null));
}

export async function planWeek(provider: AIProvider, input: unknown): Promise<ActionResult<MealPlan>> {
  const ai = await getAI("penn-fitness");
  if (!ai) return signedOut;
  const parsed = PlanInput.safeParse(input);
  if (!parsed.success) return invalid("Some of your answers look wrong. Go back through the steps and save them again.");
  return run(() => planMeals(ai, provider, parsed.data));
}
