// What the planner shows users without an API key: a sample schedule and the
// kind of week planMeals returns for it. Eating-out meals name real places
// from the food data (data/pennFood.ts), as a real plan does.

import type { MealPlan, PlannedMeal } from "./mealPlan.js";
import type { ScheduleBlock } from "./schedule.js";

export const SAMPLE_SCHEDULE_TEXT = `FNCE 6110 Mon/Wed 10:15-11:45, Huntsman Hall
MKTG 6110 Mon/Wed 1:45-3:15, Huntsman Hall
STAT 6130 Tue/Thu 8:30-10:00, Huntsman Hall
MGMT 6100 Tue/Thu 12:00-1:30, Vance Hall
Club meeting Thu 6-7:30pm, Houston Hall`;

const huntsman = "Huntsman Hall";

/** What readSchedule returns for SAMPLE_SCHEDULE_TEXT. */
export const SAMPLE_SCHEDULE: ScheduleBlock[] = [
  { day: "mon", start: "10:15", end: "11:45", label: "FNCE 6110", location: huntsman },
  { day: "mon", start: "13:45", end: "15:15", label: "MKTG 6110", location: huntsman },
  { day: "tue", start: "08:30", end: "10:00", label: "STAT 6130", location: huntsman },
  { day: "tue", start: "12:00", end: "13:30", label: "MGMT 6100", location: "Vance Hall" },
  { day: "wed", start: "10:15", end: "11:45", label: "FNCE 6110", location: huntsman },
  { day: "wed", start: "13:45", end: "15:15", label: "MKTG 6110", location: huntsman },
  { day: "thu", start: "08:30", end: "10:00", label: "STAT 6130", location: huntsman },
  { day: "thu", start: "12:00", end: "13:30", label: "MGMT 6100", location: "Vance Hall" },
  { day: "thu", start: "18:00", end: "19:30", label: "Club meeting", location: "Houston Hall" },
];

type SampleMeal = Omit<PlannedMeal, "place" | "placeType" | "estimatedCost" | "proteinG" | "carbsG" | "fatG"> &
  Partial<PlannedMeal> & { g: [number, number, number] };

/** A sample meal; `g` is its rough [protein, carbs, fat] in grams. */
const meal = ({ g: [proteinG, carbsG, fatG], ...m }: SampleMeal): PlannedMeal => ({
  place: null,
  placeType: null,
  estimatedCost: null,
  proteinG,
  carbsG,
  fatG,
  ...m,
});

const monWed: PlannedMeal[] = [
  meal({ time: "08:30", type: "breakfast", name: "Overnight oats with peanut butter and banana", g: [18, 70, 16], source: "cook", estimatedCost: 3 }),
  meal({ time: "12:00", type: "lunch", name: "Chicken Caesar Baguette", g: [26, 60, 25], source: "eat-out", place: "Pret A Manger (Huntsman Hall)", estimatedCost: 11 }),
  meal({ time: "15:30", type: "snack", name: "Apple and a handful of almonds", g: [6, 28, 14], source: "cook", estimatedCost: 2 }),
  meal({ time: "19:00", type: "dinner", name: "Salmon, rice and stir-fried broccoli", g: [36, 65, 18], source: "cook", estimatedCost: 8 }),
];

const tueThu: PlannedMeal[] = [
  meal({ time: "08:00", type: "breakfast", name: "Greek yogurt with granola and berries", g: [22, 50, 8], source: "cook", estimatedCost: 3 }),
  meal({ time: "10:15", type: "snack", name: "Hard-boiled eggs and a clementine", g: [13, 10, 10], source: "cook", estimatedCost: 2 }),
  meal({ time: "13:45", type: "lunch", name: "Kale Caesar", g: [41, 18, 35], source: "eat-out", place: "Sweetgreen (UPenn)", estimatedCost: 15 }),
  meal({ time: "19:00", type: "dinner", name: "Chicken burrito bowl with rice and black beans", g: [44, 62, 13], source: "eat-out", place: "Chipotle Mexican Grill", estimatedCost: 14 }),
];

const weekend: PlannedMeal[] = [
  meal({ time: "10:00", type: "breakfast", name: "Veggie omelette with whole-grain toast", g: [24, 30, 18], source: "cook", estimatedCost: 4 }),
  meal({ time: "13:30", type: "lunch", name: "Broccoli cheddar soup and half a Bacon Turkey Bravo", g: [32, 57, 37], source: "eat-out", place: "Panera Bread (40th & Walnut)", estimatedCost: 14 }),
  meal({ time: "16:30", type: "snack", name: "Hummus with carrots and pita", g: [9, 40, 12], source: "cook", estimatedCost: 3 }),
  meal({ time: "19:30", type: "dinner", name: "Pasta with turkey meatballs and spinach", g: [38, 80, 18], source: "cook", estimatedCost: 7 }),
];

export const SAMPLE_MEAL_PLAN: MealPlan = {
  days: [
    { day: "mon", meals: monWed },
    { day: "tue", meals: tueThu },
    { day: "wed", meals: monWed },
    { day: "thu", meals: tueThu.map((m) => (m.type === "dinner" ? { ...m, time: "19:45" } : m)) },
    { day: "fri", meals: monWed },
    { day: "sat", meals: weekend },
    { day: "sun", meals: weekend },
  ],
  tips: [
    "Make two jars of overnight oats on Sunday and Tuesday nights for the next morning.",
    "Tuesdays and Thursdays have a late lunch, so keep a snack in your bag.",
    "Cook a double batch on Sunday; it covers a weekday lunch.",
  ],
  groceries: [
    { name: "Bananas", quantity: "3", category: "produce" },
    { name: "Berries", quantity: "2 pints", category: "produce" },
    { name: "Broccoli", quantity: "3 heads", category: "produce" },
    { name: "Carrots", quantity: "1 bag", category: "produce" },
    { name: "Clementines", quantity: "4", category: "produce" },
    { name: "Apples", quantity: "3", category: "produce" },
    { name: "Spinach", quantity: "1 bag", category: "produce" },
    { name: "Bell peppers and onion (for omelettes)", quantity: "2 peppers, 1 onion", category: "produce" },
    { name: "Salmon fillets", quantity: "3", category: "protein" },
    { name: "Eggs", quantity: "1 dozen", category: "protein" },
    { name: "Ground turkey (for meatballs)", quantity: "1 lb", category: "protein" },
    { name: "Greek yogurt", quantity: "32 oz tub", category: "dairy" },
    { name: "Milk (for oats)", quantity: "1 half-gallon", category: "dairy" },
    { name: "Rolled oats", quantity: "1 canister", category: "grains" },
    { name: "Rice", quantity: "2 lb bag", category: "grains" },
    { name: "Pasta", quantity: "1 lb", category: "grains" },
    { name: "Whole-grain bread", quantity: "1 loaf", category: "grains" },
    { name: "Pita", quantity: "1 pack", category: "grains" },
    { name: "Granola", quantity: "1 bag", category: "pantry" },
    { name: "Peanut butter", quantity: "1 jar", category: "pantry" },
    { name: "Marinara sauce", quantity: "1 jar", category: "pantry" },
    { name: "Hummus", quantity: "1 tub", category: "snacks" },
    { name: "Almonds", quantity: "1 small bag", category: "snacks" },
  ],
};
