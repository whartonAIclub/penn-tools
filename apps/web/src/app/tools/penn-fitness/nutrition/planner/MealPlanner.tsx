"use client";

// First-time setup: three steps (about you, your week, eating), saved as each
// is finished. The last one asks the dashboard to make the plan; after that,
// each step is edited on its own from the dashboard.

import { useState } from "react";
import {
  DEFAULT_PLANNER_PROFILE,
  EMPTY_PREFERENCES,
  type NutritionPreferences,
  type PlannerProfile,
  type WeeklySchedule,
} from "@penntools/tool-penn-fitness";
import { AboutYouStep } from "./AboutYouStep";
import { EatingStep } from "./EatingStep";
import { ScheduleStep } from "./ScheduleStep";
import styles from "../Nutrition.module.css";

const STEPS = ["About you", "Your week", "Eating"] as const;

export function MealPlanner({
  preview,
  preferences,
  profile,
  schedule,
  onSavePreferences,
  onSaveProfile,
  onSaveSchedule,
  onFinish,
  onCancel,
}: {
  preview: boolean;
  preferences: NutritionPreferences | null;
  profile: PlannerProfile | null;
  schedule: WeeklySchedule | null;
  onSavePreferences: (preferences: NutritionPreferences) => void;
  onSaveProfile: (profile: PlannerProfile) => void;
  onSaveSchedule: (schedule: WeeklySchedule) => void;
  /** Called after the last step with the final answers, to make the plan. */
  onFinish: (profile: PlannerProfile, preferences: NutritionPreferences) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const currentProfile = profile ?? DEFAULT_PLANNER_PROFILE;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>✨ Let&apos;s set up your plan</h2>
        <button className={styles.linkButton} onClick={onCancel}>
          ← Dashboard
        </button>
      </div>
      <p className={styles.description}>Three quick steps, then we&apos;ll plan a week of meals around your life.</p>

      <ol className={styles.steps}>
        {STEPS.map((label, i) => (
          <li key={label}>
            <button className={i === step ? styles.stepActive : styles.step} onClick={() => setStep(i)}>
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <AboutYouStep
          initialProfile={currentProfile}
          initialPreferences={preferences ?? EMPTY_PREFERENCES}
          onNext={(nextProfile, nextPreferences) => {
            onSaveProfile(nextProfile);
            onSavePreferences(nextPreferences);
            setStep(1);
          }}
        />
      )}
      {step === 1 && (
        <ScheduleStep
          initial={schedule ?? []}
          profile={currentProfile}
          onBack={() => setStep(0)}
          onNext={(nextSchedule, home) => {
            onSaveSchedule(nextSchedule);
            onSaveProfile({ ...currentProfile, home });
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <EatingStep
          profile={currentProfile}
          preferences={preferences ?? EMPTY_PREFERENCES}
          submitLabel={preview ? "Show me a sample plan 🎉" : "Make my plan 🎉"}
          onBack={() => setStep(1)}
          onNext={(nextProfile, nextPreferences) => {
            onSaveProfile(nextProfile);
            onSavePreferences(nextPreferences);
            onFinish(nextProfile, nextPreferences);
          }}
        />
      )}
    </section>
  );
}
