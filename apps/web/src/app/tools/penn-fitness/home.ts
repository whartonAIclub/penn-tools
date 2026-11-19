// What the homepage's exercise part hands Nutrition's dashboard, which lays
// out the homepage: the greeting; "This week" (the workouts day by day, with
// Nutrition's meal plan status); Nutrition and Exercise as sections that
// open; then "Your setup". Built by exercise/ExerciseHome.tsx.

import type { ReactNode } from "react";

export interface HomeExercise {
  /** The closed section: the next workout, drawn, or what's needed first. */
  summary: ReactNode;
  /** A short text version of `summary`, for screen readers. */
  label: string;
  /** Shown when the section is opened. */
  details: ReactNode;
  /** The week's workouts day by day, shown in "This week" above both sections. */
  weekStrip: ReactNode;
  /** Minutes of workouts planned this week, for the calorie estimate (the dashboard knows the weight). */
  plannedMinutes: number;
  /** Exercise's item in "Your setup", linking to its preferences. */
  setup: { emoji: string; title: string; summary: string; href: string };
}
