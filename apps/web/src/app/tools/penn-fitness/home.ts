// What the homepage's exercise part hands Nutrition's dashboard, which lays
// out the homepage: the greeting, then Nutrition and Exercise as sections
// that open, then "Your setup". Built by exercise/ExerciseHome.tsx.

import type { ReactNode } from "react";

export interface HomeExercise {
  /** The closed section's line: the next workout, or what's needed first. */
  title: string;
  meta: string;
  /** Shown when the section is opened. */
  details: ReactNode;
  /** Exercise's item in "Your setup", linking to its preferences. */
  setup: { emoji: string; title: string; summary: string; href: string };
}
