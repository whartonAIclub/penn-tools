// ─────────────────────────────────────────────────────────────────────────────
// Quick Log: turns a plain-language description of what someone ate into
// structured meals.
//
// Receives `ai` from the tool's server action (getAI in @/lib/ai), so it never
// sees API keys and is easy to test with a fake (see __tests__/quickLog.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { describePreferences, type NutritionPreferences } from "./preferences.js";

export const MAX_MEAL_TEXT_LENGTH = 1000;

/** Why `value` can't be logged, or null if it's fine. Server actions get browser input, so check it. */
export function checkMealText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Describe what you ate.";
  if (value.length > MAX_MEAL_TEXT_LENGTH) return `Keep it to at most ${MAX_MEAL_TEXT_LENGTH} characters.`;
  return null;
}

const Level = z.enum(["low", "medium", "high"]);

// One schema tells the model the shape, checks the reply, and types the result.
// Fields that may be missing are .nullable(), not .optional().
export const MealLog = z.object({
  meals: z.array(
    z.object({
      type: z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]),
      time: z.string().nullable().describe("24-hour HH:MM, or null if not mentioned"),
      place: z.string().nullable().describe("Where it came from, e.g. a dining hall or café, or null"),
      foods: z.array(
        z.object({
          name: z.string(),
          portion: z.string().nullable().describe("e.g. '1 bowl', 'large', or null if unknown"),
        }),
      ),
      protein: Level,
      carbs: Level,
      fat: Level,
      estimatedCalories: z.number().nullable().describe("A rough whole-number estimate, or null if impossible to guess"),
      proteinG: z.number().nullable().describe("Rough grams of protein, or null if impossible to guess"),
      carbsG: z.number().nullable().describe("Rough grams of carbohydrate, or null"),
      fatG: z.number().nullable().describe("Rough grams of fat, or null"),
      estimatedCost: z.number().nullable().describe("Rough price in US dollars if bought (not home-cooked), else null"),
      tags: z.array(z.string()).describe("Short dietary tags, e.g. 'vegetarian', 'high fiber', 'caffeine'"),
      warnings: z
        .array(z.string())
        .describe("Short notes on foods that may conflict with the student's allergies or diet; empty if none"),
    }),
  ),
  note: z
    .string()
    .nullable()
    .describe("One short, friendly, non-judgmental observation, or null. Never suggest eating less."),
});
export type MealLog = z.infer<typeof MealLog>;
export type Meal = MealLog["meals"][number];

const SYSTEM = `You turn a Penn student's description of what they ate into structured meals.
- Split it into separate meals or snacks; group foods eaten together.
- Only include what they said they ate. Don't invent foods.
- Estimates are rough; that's fine. Use typical portions when none is given.
- Be supportive and neutral about food. Never encourage restriction, skipping meals or very low calories.
- If the student's preferences are given, add a warning to any meal with a food that may conflict with their
  allergies or diet (e.g. "Caesar dressing usually contains fish" for a vegetarian). Otherwise leave warnings empty.`;

/** The meals described in `text`, as typed data, checked against the student's preferences. */
export async function logMeals(
  ai: AI,
  provider: AIProvider,
  text: string,
  preferences: NutritionPreferences | null = null,
): Promise<MealLog> {
  const described = preferences && describePreferences(preferences);
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: MealLog,
    system: described ? `${SYSTEM}\n\nThe student's preferences:\n${described}` : SYSTEM,
    messages: [{ role: "user", content: text }],
  });
  return object; // already checked against MealLog
}

// ── Preview ───────────────────────────────────────────────────────────────────

export const SAMPLE_MEAL_TEXT =
  "Oatmeal with banana at 8, a chicken caesar wrap from Wawa around 1, and an iced latte in the afternoon";

/** What logMeals returns for SAMPLE_MEAL_TEXT, shown to users without an API key. */
export const SAMPLE_MEAL_LOG: MealLog = {
  meals: [
    {
      type: "breakfast",
      time: "08:00",
      place: null,
      foods: [
        { name: "Oatmeal", portion: "1 bowl" },
        { name: "Banana", portion: "1 medium" },
      ],
      protein: "low",
      carbs: "high",
      fat: "low",
      estimatedCalories: 300,
      proteinG: 8,
      carbsG: 55,
      fatG: 5,
      estimatedCost: null,
      tags: ["vegetarian", "high fiber"],
      warnings: [],
    },
    {
      type: "lunch",
      time: "13:00",
      place: "Wawa",
      foods: [{ name: "Chicken caesar wrap", portion: "1 wrap" }],
      protein: "high",
      carbs: "medium",
      fat: "medium",
      estimatedCalories: 600,
      proteinG: 35,
      carbsG: 45,
      fatG: 28,
      estimatedCost: 9,
      tags: [],
      warnings: [],
    },
    {
      type: "drink",
      time: null,
      place: null,
      foods: [{ name: "Iced latte", portion: "medium" }],
      protein: "low",
      carbs: "low",
      fat: "low",
      estimatedCalories: 150,
      proteinG: 8,
      carbsG: 14,
      fatG: 6,
      estimatedCost: 5,
      tags: ["caffeine"],
      warnings: [],
    },
  ],
  note: "Good mix today: a fiber-rich breakfast and a protein-rich lunch.",
};
