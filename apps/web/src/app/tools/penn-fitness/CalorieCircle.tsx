// A calorie estimate on the homepage, shown gently (src/calories.ts): a
// neutral, full circle with the number in it and "estimate" under it. No
// target, no progress, no "remaining", so it reads as information, not a goal.

import home from "./HomeSection.module.css";

export function CalorieCircle({ calories, label, note }: { calories: number; label: string; note: string }) {
  return (
    <span className={home.calorieCircle} title={note}>
      <span className={home.calorieRing}>
        <span className={home.calorieNumber}>~{calories.toLocaleString("en-US")}</span>
        <span className={home.calorieUnit}>cal</span>
      </span>
      <span className={home.calorieLabel}>{label}</span>
      <span className={home.calorieNote}>{note}</span>
    </span>
  );
}
