// Calorie estimates for the homepage, shown gently (decided with Arpit,
// November 18, 2026; see section 6 of docs/outtake.md): always labelled as
// estimates, with no targets, no "remaining", and never eaten against burnt as
// a balance, because of the disordered-eating and over-exercise risk in
// student populations.

/** A moderate workout (gym, brisk cardio) in METs: about 5 times resting energy use. */
export const MODERATE_MET = 5;
/** Used when the user hasn't given their weight. */
export const TYPICAL_WEIGHT_KG = 70;

export interface CaloriesEaten {
  /** Rounded to the nearest 10, from the meals that have an estimate. */
  calories: number;
  /** How many of today's meals had an estimate, of how many logged. */
  estimated: number;
  logged: number;
}

/** About how many calories today's logged meals add up to, from those with an estimate. */
export function caloriesEaten(meals: readonly { estimatedCalories: number | null }[]): CaloriesEaten {
  const known = meals.filter((m) => typeof m.estimatedCalories === "number" && Number.isFinite(m.estimatedCalories) && m.estimatedCalories > 0);
  const total = known.reduce((sum, m) => sum + m.estimatedCalories!, 0);
  return { calories: Math.round(total / 10) * 10, estimated: known.length, logged: meals.length };
}

/**
 * About how many calories workouts of these lengths use at a moderate pace:
 * METs × weight in kg × hours, rounded to the nearest 10. Uses a typical
 * weight when the user hasn't given theirs.
 */
export function estimatedBurn(minutes: number, weightKg: number | null): number {
  const weight = weightKg !== null && Number.isFinite(weightKg) && weightKg > 0 ? weightKg : TYPICAL_WEIGHT_KG;
  const kcal = MODERATE_MET * weight * (Math.max(0, minutes) / 60);
  return Math.round(kcal / 10) * 10;
}
