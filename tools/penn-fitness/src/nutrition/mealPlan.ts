// ─────────────────────────────────────────────────────────────────────────────
// Meal plan: a week of meals fitted into the student's free time, from their
// food preferences, planner profile and schedule.
//
// The code works out the free windows (schedule.ts); the AI only chooses meals
// for them. Named places come from the food data (foodData.ts), favoring the
// student's own places and their dining plan's, plus any they typed in.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { describeOutlet, findDiningPlan, findOutlet, OUTLETS, outletsForPlan } from "./foodData.js";
import { describePreferences, NutritionPreferences } from "./preferences.js";
import { describeProfile, PlannerProfile } from "./plannerProfile.js";
import { DAY_KEYS, DAYS, freeWindows, WeeklySchedule, type Day } from "./schedule.js";
import { formatMinutes, toMinutes } from "./today.js";

export const PlannedMeal = z.object({
  time: z.string().describe("24-hour HH:MM, inside one of the day's free windows"),
  type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().describe("The dish, e.g. 'Greek yogurt with granola and berries'"),
  source: z.enum(["cook", "eat-out"]),
  place: z.string().nullable().describe("When eating out: exactly one of the listed places, as written; else null"),
  placeType: z
    .string()
    .nullable()
    .describe("Only when eating out and no listed place fits: a general kind of place; else null"),
  estimatedCost: z.number().nullable().describe("Rough cost in US dollars, or null"),
  proteinG: z.number().nullable().describe("Rough grams of protein, or null"),
  carbsG: z.number().nullable().describe("Rough grams of carbohydrate, or null"),
  fatG: z.number().nullable().describe("Rough grams of fat, or null"),
});
export type PlannedMeal = z.infer<typeof PlannedMeal>;

export const GROCERY_CATEGORIES = ["produce", "protein", "dairy", "grains", "pantry", "snacks", "other"] as const;

export const GroceryItem = z.object({
  name: z.string(),
  quantity: z.string().describe("For the whole week, e.g. '2 lb' or '1 dozen'"),
  category: z.enum(GROCERY_CATEGORIES),
});
export type GroceryItem = z.infer<typeof GroceryItem>;

export const MealPlan = z.object({
  days: z.array(z.object({ day: z.enum(DAY_KEYS), meals: z.array(PlannedMeal) })),
  tips: z.array(z.string()).describe("Up to three short, practical tips for the week"),
  groceries: z
    .array(GroceryItem)
    .describe("Everything to buy for the week's cooked meals, combined across meals; empty if nothing is cooked"),
});
export type MealPlan = z.infer<typeof MealPlan>;

/** Everything the planner needs. The server action checks the browser's copy against this. */
export const PlanInput = z.object({
  preferences: NutritionPreferences,
  profile: PlannerProfile,
  schedule: WeeklySchedule,
});
export type PlanInput = z.infer<typeof PlanInput>;

const SYSTEM = `You plan a week of meals for a Penn student, fitted around their schedule.
- Plan every day, Monday to Sunday, with the number of meals and snacks per day they asked for.
- Put each meal inside one of that day's free windows, never during a class. Leave time to get there.
- Use where they are: commitments show their location after "@". Cooked meals happen at home, so only plan
  one when there's time to get home and back; between classes on campus, eat out or pack something.
- Follow their diet and never include foods they're allergic to or dislike.
- Eating style: "Mostly cook" means mostly cooked meals, "Mostly eat out" mostly eating out, a mix both.
  Cooked meals must suit their cooking setup and be simple enough for a busy student.
- When eating out, set "place" to one of the places under "Places I can eat", written exactly as shown.
  Prefer their favorite places, then their dining plan's, then other places near where they'll be: compare
  each place's address and nearby buildings with their commitments' locations and home. Plan Center City places
  only when there's time to get there. Vary places across the week.
  Prefer items from those menus, using their published nutrition, and say which item in the meal's name.
  Only if no listed place fits, set place to null and describe a kind of place in placeType. Never name
  other businesses.
- Keep eating-out meals within their budget when they gave one.
- Fit their activity level with sensible, balanced meals. When daily macro targets are given, aim for each
  day's meals together to land roughly within them; they're ranges, not exact numbers.
- Be supportive. Never plan calorie restriction, skipped meals or very small portions.
- Estimate each meal's protein, carbohydrate and fat in grams.
- List the groceries for every cooked meal in the week, combining repeats into one line with a total quantity.`;

/** The week's days, busy blocks and free windows, as lines for the AI prompt. */
export function describeWeek(profile: PlannerProfile, schedule: WeeklySchedule): string {
  return DAY_KEYS.map((day) => {
    const busy = schedule
      .filter((b) => b.day === day)
      .map((b) => `${b.start}–${b.end} ${b.label}${b.location ? ` @ ${b.location}` : ""}`)
      .join("; ");
    const free = freeWindows(schedule, day, profile.wakeTime, profile.sleepTime)
      .map((w) => `${w.start}–${w.end}`)
      .join(", ");
    return `${DAYS[day]}: busy ${busy || "none"}; free ${free || "none"}`;
  }).join("\n");
}

/** A week of meals, tidied by tidyPlan. */
export async function planMeals(ai: AI, provider: AIProvider, input: PlanInput): Promise<MealPlan> {
  const preferences = describePreferences(input.preferences) ?? "None given";
  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: MealPlan,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Food preferences:\n${preferences}\n\nAbout me:\n${describeProfile(input.profile)}\n\nMy week:\n${describeWeek(input.profile, input.schedule)}\n\n${describePlaces(input)}`,
      },
    ],
  });
  return tidyPlan(object, allowedPlaces(input));
}

/**
 * The places the plan may name, in order of preference: the student's
 * favorites, where their dining plan works, then every other place in the
 * food data. Known places use their name from the food data.
 */
export function placeGroups(input: PlanInput): { favorites: string[]; diningPlan: string[]; nearby: string[] } {
  const favorites = [...new Set(input.profile.favoritePlaces.map((name) => findOutlet(name)?.name ?? name))];
  const plan = findDiningPlan(input.preferences.diningPlan);
  const diningPlan = (plan ? outletsForPlan(plan).map((o) => o.name) : []).filter((n) => !favorites.includes(n));
  const taken = new Set([...favorites, ...diningPlan]);
  return { favorites, diningPlan, nearby: OUTLETS.map((o) => o.name).filter((n) => !taken.has(n)) };
}

/** Every place the plan may name. */
export function allowedPlaces(input: PlanInput): string[] {
  const { favorites, diningPlan, nearby } = placeGroups(input);
  return [...favorites, ...diningPlan, ...nearby];
}

/** "Places I can eat", grouped by preference, with menus and published nutrition, for the AI prompt. */
export function describePlaces(input: PlanInput): string {
  const { favorites, diningPlan, nearby } = placeGroups(input);
  const describe = (names: string[]) =>
    names.map((name) => {
      const outlet = findOutlet(name);
      return outlet ? describeOutlet(outlet) : `${name} (no menu on file)`;
    });
  return [
    "Places I can eat:",
    favorites.length > 0 && ["My favorite places:", ...describe(favorites)].join("\n"),
    diningPlan.length > 0 && ["Where my dining plan works:", ...describe(diningPlan)].join("\n"),
    nearby.length > 0 && ["Other places near campus and in Center City:", ...describe(nearby)].join("\n"),
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n\n");
}

/**
 * Orders days and meals, pads times to HH:MM, and keeps named places to
 * `places`: any other name the AI gave is dropped, keeping placeType.
 */
export function tidyPlan(plan: MealPlan, places: string[]): MealPlan {
  const listed = new Map(places.map((p) => [p.toLowerCase(), p]));
  return {
    days: [...plan.days]
      .sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day))
      .map(({ day, meals }) => ({
        day,
        meals: meals
          .map((meal) => {
            const minutes = toMinutes(meal.time.trim());
            return {
              ...meal,
              time: minutes === null ? meal.time : formatMinutes(minutes),
              place: meal.place === null ? null : (listed.get(meal.place.trim().toLowerCase()) ?? null),
            };
          })
          .sort((a, b) => a.time.localeCompare(b.time)),
      })),
    tips: plan.tips.slice(0, 3),
    groceries: [...plan.groceries].sort(
      (a, b) => GROCERY_CATEGORIES.indexOf(a.category) - GROCERY_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name),
    ),
  };
}

/** What eating out costs across these meals, in dollars. */
export function eatingOutCost(meals: PlannedMeal[]): number {
  return meals.reduce((sum, m) => sum + (m.source === "eat-out" ? (m.estimatedCost ?? 0) : 0), 0);
}

export interface UpcomingMeal {
  day: Day;
  meal: PlannedMeal;
  /** Minutes from now until it; 0 if it's happening now-ish. */
  minutesUntil: number;
}

/**
 * The next planned meal after `now` (minutes after midnight on `today`),
 * looking up to a week ahead; null if the plan has no meals.
 */
export function nextMeal(plan: MealPlan, today: Day, now: number): UpcomingMeal | null {
  const start = DAY_KEYS.indexOf(today);
  for (let offset = 0; offset < 7; offset++) {
    const day = DAY_KEYS[(start + offset) % 7]!;
    const meals = plan.days.find((d) => d.day === day)?.meals ?? [];
    for (const meal of meals) {
      const at = toMinutes(meal.time);
      if (at === null) continue;
      // A meal that started in the last half hour still counts as next.
      const minutesUntil = offset * 24 * 60 + at - now;
      if (minutesUntil >= -30) return { day, meal, minutesUntil: Math.max(0, minutesUntil) };
    }
  }
  return null;
}
