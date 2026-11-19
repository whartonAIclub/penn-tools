export { PennFitnessTool } from "./PennFitnessTool.js";
export {
  checkMealText,
  logMeals,
  MealLog,
  MAX_MEAL_TEXT_LENGTH,
  SAMPLE_MEAL_LOG,
  SAMPLE_MEAL_TEXT,
} from "./nutrition/quickLog.js";
export type { Meal } from "./nutrition/quickLog.js";
export {
  COOKING_SETUPS,
  DIETS,
  EMPTY_PREFERENCES,
  NUTRITION_GOALS,
  NutritionPreferences,
  describePreferences,
  splitList,
} from "./nutrition/preferences.js";
export { dayTotals, formatMinutes, LoggedMeal, sortMeals, summarizeDay, toMinutes } from "./nutrition/today.js";
export type { DaySummary, DayTotals } from "./nutrition/today.js";
export {
  busyAt,
  byDayThenStart,
  checkScheduleText,
  cleanBlocks,
  DAY_KEYS,
  DAYS,
  freeWindows,
  MAX_SCHEDULE_TEXT_LENGTH,
  readSchedule,
  ScheduleBlock,
  WeeklySchedule,
} from "./nutrition/schedule.js";
export type { Day, TimeWindow } from "./nutrition/schedule.js";
export {
  ACTIVITY_LEVELS,
  DEFAULT_PLANNER_PROFILE,
  EATING_STYLES,
  PlannerProfile,
  describeProfile,
} from "./nutrition/plannerProfile.js";
export { describeMacros, KG_PER_LB, macroTargets, MAX_WEIGHT_KG, MIN_WEIGHT_KG } from "./nutrition/macros.js";
export type { MacroTargets } from "./nutrition/macros.js";
export {
  describeWeek,
  eatingOutCost,
  GROCERY_CATEGORIES,
  GroceryItem,
  MealPlan,
  nextMeal,
  PlanInput,
  PlannedMeal,
  planMeals,
  tidyPlan,
} from "./nutrition/mealPlan.js";
export type { UpcomingMeal } from "./nutrition/mealPlan.js";
export {
  describeDiningPlan,
  describeOutlet,
  DINING_PLANS,
  findDiningPlan,
  findOutlet,
  FOOD_DATA_CHECKED_ON,
  outletsForPlan,
  OUTLETS,
  searchOutlets,
  WEEKS_PER_SEMESTER,
} from "./nutrition/foodData.js";
export type { DiningPlan, DietaryTag, MenuItem, Outlet } from "./nutrition/foodData.js";
export { SAMPLE_MEAL_PLAN, SAMPLE_SCHEDULE, SAMPLE_SCHEDULE_TEXT } from "./nutrition/plannerSamples.js";
export { MAX_ICS_LENGTH, readIcs, shortLocation, weekStart } from "./nutrition/calendarImport.js";

// Shared by both halves
export * from "./attributes.js";
export * from "./time.js";
export * from "./location.js";
export * from "./schedule.js";
export * from "./places.js";
export * from "./preferences.js";
export * from "./sharedPrefs.js";
export * from "./storage/preferences.js";
export * from "./storage/schedule.js";

// Outtake (exercise)
export * from "./outtake/types.js";
export * from "./outtake/facilities.js";
export * from "./outtake/prefs.js";
export * from "./outtake/planInput.js";
export * from "./outtake/checkIn.js";
export * from "./outtake/ingest/ics.js";
export * from "./outtake/ingest/timetable.js";
export * from "./outtake/ingest/manual.js";
export * from "./outtake/ingest/timeline.js";
export * from "./outtake/engine/index.js";
