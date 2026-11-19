// Penn Fitness: an AI health companion for Penn students. Each area has its
// own folder beside this page (nutrition/, exercise/), with its logic in
// tools/penn-fitness/src/. Signed-out visitors are asked to sign in; users
// without a saved key see the page in preview mode.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_MEAL_TEXT_LENGTH, newYorkNow, SAMPLE_MEAL_LOG, SAMPLE_MEAL_TEXT } from "@penntools/tool-penn-fitness";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { loadExerciseWeek } from "./exercise/data";
import { homeExercise } from "./exercise/ExerciseHome";
import { Nutrition } from "./nutrition/Nutrition";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Penn Fitness",
};

export default async function PennFitnessPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Penn Fitness" />;

  const providers = await (await getAI("penn-fitness"))!.providers();
  // The exercise section's week; a problem loading it shows in the section, never breaks the page.
  const exercise = await loadExerciseWeek(user.id).catch((error: unknown) => {
    console.error("[penn-fitness] exercise summary failed", error instanceof Error ? error.message : error);
    return null;
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        Penn Fitness <span className={styles.section}>· Nutrition</span>
      </h1>
      <Nutrition
        exercise={homeExercise(exercise, (exercise?.now ?? newYorkNow()).slice(0, 10))}
        userId={user.id}
        userName={user.name ?? null}
        providers={providers}
        labels={PROVIDER_LABELS}
        sampleText={SAMPLE_MEAL_TEXT}
        sampleLog={SAMPLE_MEAL_LOG}
        maxLength={MAX_MEAL_TEXT_LENGTH}
      />
    </div>
  );
}
