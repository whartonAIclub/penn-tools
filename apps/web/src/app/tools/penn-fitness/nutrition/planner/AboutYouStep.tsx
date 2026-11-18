"use client";

// Step 1: how the student eats (diet, allergies, dislikes, goals) and their
// body and day (weight for macro targets, activity, meals per day, waking
// hours). Quick Log uses the same food preferences to flag conflicts.

import { useState } from "react";
import {
  ACTIVITY_LEVELS,
  DIETS,
  KG_PER_LB,
  macroTargets,
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  NUTRITION_GOALS,
  NutritionPreferences,
  PlannerProfile,
  splitList,
  type MacroTargets,
} from "@penntools/tool-penn-fitness";
import { Checkboxes, Select } from "../fields";
import styles from "../Nutrition.module.css";

type Unit = "lb" | "kg";

export function AboutYouStep({
  initialProfile,
  initialPreferences,
  submitLabel = "Next: your week",
  onNext,
}: {
  initialProfile: PlannerProfile;
  initialPreferences: NutritionPreferences;
  submitLabel?: string;
  onNext: (profile: PlannerProfile, preferences: NutritionPreferences) => void;
}) {
  const [diet, setDiet] = useState(initialPreferences.diet);
  const [allergies, setAllergies] = useState(initialPreferences.allergies.join(", "));
  const [dislikes, setDislikes] = useState(initialPreferences.dislikes.join(", "));
  const [goals, setGoals] = useState(initialPreferences.goals);
  const [unit, setUnit] = useState<Unit>("lb");
  const [weight, setWeight] = useState(
    initialProfile.weightKg === null ? "" : String(Math.round(initialProfile.weightKg / KG_PER_LB)),
  );
  const [activityLevel, setActivityLevel] = useState(initialProfile.activityLevel);
  const [mealsPerDay, setMealsPerDay] = useState(initialProfile.mealsPerDay);
  const [wakeTime, setWakeTime] = useState(initialProfile.wakeTime);
  const [sleepTime, setSleepTime] = useState(initialProfile.sleepTime);
  const [error, setError] = useState<string | null>(null);

  const weightKg = toKg(weight, unit);
  const validWeight = weightKg !== null && weightKg >= MIN_WEIGHT_KG && weightKg <= MAX_WEIGHT_KG;

  function switchUnit(next: Unit) {
    if (next === unit) return;
    if (weightKg !== null) setWeight(String(Math.round(next === "kg" ? weightKg : weightKg / KG_PER_LB)));
    setUnit(next);
  }

  function next() {
    if (weight.trim() && !validWeight) {
      setError("Enter a weight that looks right, or leave it blank.");
      return;
    }
    const profile = PlannerProfile.safeParse({
      ...initialProfile,
      weightKg: validWeight ? Math.round(weightKg * 10) / 10 : null,
      activityLevel,
      mealsPerDay,
      wakeTime,
      sleepTime,
    });
    const preferences = NutritionPreferences.safeParse({
      ...initialPreferences,
      diet,
      allergies: splitList(allergies),
      dislikes: splitList(dislikes),
      goals,
    });
    if (!profile.success || !preferences.success) {
      setError("Check your answers: enter a wake-up time and a bedtime, and keep each food under 60 characters.");
      return;
    }
    onNext(profile.data, preferences.data);
  }

  return (
    <div className={styles.form}>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          Diet
          <Select options={DIETS} value={diet} onChange={setDiet} />
        </label>
        <label className={styles.field}>
          Allergies or intolerances <span className={styles.hint}>(comma-separated)</span>
          <input className={styles.input} value={allergies} placeholder="e.g. peanuts, gluten, lactose" onChange={(e) => setAllergies(e.target.value)} />
        </label>
      </div>
      <label className={styles.field}>
        Foods you don&apos;t like <span className={styles.hint}>(comma-separated)</span>
        <input className={styles.input} value={dislikes} placeholder="e.g. mushrooms, olives" onChange={(e) => setDislikes(e.target.value)} />
      </label>

      <fieldset className={styles.fieldset}>
        <legend>Food goals</legend>
        <Checkboxes options={NUTRITION_GOALS} selected={goals} onChange={setGoals} />
      </fieldset>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          Weight <span className={styles.hint}>(optional, for daily macro targets)</span>
          <span className={styles.inputWithUnit}>
            <input className={styles.input} type="number" min={1} value={weight} placeholder={unit === "lb" ? "e.g. 150" : "e.g. 68"} onChange={(e) => setWeight(e.target.value)} />
            <span className={styles.unitToggle}>
              {(["lb", "kg"] as const).map((u) => (
                <button key={u} type="button" className={u === unit ? styles.unitActive : undefined} onClick={() => switchUnit(u)}>
                  {u}
                </button>
              ))}
            </span>
          </span>
        </label>
        <label className={styles.field}>
          Activity level <span className={styles.hint}>(until Fitness can tell us)</span>
          <Select options={ACTIVITY_LEVELS} value={activityLevel} onChange={setActivityLevel} />
        </label>
      </div>

      {validWeight && <MacroCard targets={macroTargets(weightKg, activityLevel)} />}

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          Meals and snacks per day
          <select className={styles.select} value={mealsPerDay} onChange={(e) => setMealsPerDay(Number(e.target.value))}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Usually wake up
          <input className={styles.input} type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
        </label>
        <label className={styles.field}>
          Usually go to sleep
          <input className={styles.input} type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} />
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.controls}>
        <button className={styles.button} onClick={next}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/** The weight in kilograms, or null if it isn't a number. */
function toKg(weight: string, unit: Unit): number | null {
  const n = Number(weight);
  if (!weight.trim() || !Number.isFinite(n)) return null;
  return unit === "kg" ? n : n * KG_PER_LB;
}

export function MacroCard({ targets }: { targets: MacroTargets }) {
  const r = ([low, high]: [number, number]) => `${low}–${high} g`;
  return (
    <div className={styles.macros}>
      <div>
        <span>Protein</span>
        <strong>{r(targets.protein)}</strong>
      </div>
      <div>
        <span>Carbs</span>
        <strong>{r(targets.carbs)}</strong>
      </div>
      <div>
        <span>Fat</span>
        <strong>{r(targets.fat)}</strong>
      </div>
      <p className={styles.meta}>
        Daily ranges from your weight and activity, using common sports-nutrition guidance. Your plan aims for these;
        they&apos;re a guide, not a number to hit exactly.
      </p>
    </div>
  );
}
