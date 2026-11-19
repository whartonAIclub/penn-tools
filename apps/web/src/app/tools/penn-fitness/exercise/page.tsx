// Penn Fitness · Exercise: the deep dive on the exercise half, linked from the
// homepage's exercise card. For now, the week's schedule review (section 8.2 of
// tools/penn-fitness/docs/outtake.md): add the week from a calendar file, a
// screenshot or by hand, check and correct it, confirm it, and see the
// workouts suggested around it. `?week=YYYY-MM-DD` shows another week.

import type { Metadata } from "next";
import Link from "next/link";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { FACILITIES, isLocalDate, isLowConfidence, mondayOf } from "@penntools/tool-penn-fitness";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { loadExerciseWeek } from "./data";
import { ExerciseReview, type ReviewEntry } from "./ExerciseReview";
import styles from "./Exercise.module.css";

export const metadata: Metadata = {
  title: "Exercise · Penn Fitness",
};

export default async function ExercisePage(props: PageProps<"/tools/penn-fitness/exercise">) {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Penn Fitness" />;

  const { week } = await props.searchParams;
  const weekStart = typeof week === "string" && isLocalDate(week) ? mondayOf(week) : undefined;
  const loaded = await loadExerciseWeek(user.id, weekStart);
  const providers = await (await getAI("penn-fitness"))!.providers();

  const entries: ReviewEntry[] = loaded.timeline.entries.map(({ block, repeated, alsoFrom }) => ({
    id: block.id,
    start: block.start,
    end: block.end,
    label: block.label,
    source: block.source,
    alsoFrom,
    repeated,
    weekly: block.recurringWeekly,
    confirmed: block.confirmed,
    checkThis: isLowConfidence(block),
  }));
  const placeName = (id: string) => FACILITIES.find((place) => place.id === id)?.name ?? id;

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>
          Penn Fitness <span className={styles.section}>· Exercise</span>
        </h1>
        <Link href="/tools/penn-fitness" className={styles.backLink}>
          ← Penn Fitness home
        </Link>
      </div>
      <ExerciseReview
        weekStart={loaded.timeline.weekStart}
        now={loaded.now}
        entries={entries}
        awayDays={loaded.timeline.awayDays}
        slots={loaded.plan.slots.map((slot) => ({ ...slot, placeName: placeName(slot.placeId) }))}
        summary={loaded.summary}
        semester={{ start: loaded.shared.semesterStart, end: loaded.shared.semesterEnd }}
        providers={providers}
        labels={PROVIDER_LABELS}
      />
    </div>
  );
}
