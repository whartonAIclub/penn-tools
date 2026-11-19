// Penn Fitness · Exercise: plan a week of workouts around the user's week.
// Laid out in Nutrition's planner frame (ExercisePlanner): a three-step setup
// (the shared week, where you work out, your workouts), then the week of
// workouts. Linked from the homepage's Exercise section.

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { templateFromTimeline } from "@penntools/tool-penn-fitness";
import { loadExerciseWeek } from "./data";
import { ExercisePlanner } from "./ExercisePlanner";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Exercise · Penn Fitness",
};

export default async function ExercisePage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Penn Fitness" />;

  const loaded = await loadExerciseWeek(user.id);
  const { shared, outtake, summary, timeline } = loaded;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        Penn Fitness <span className={styles.section}>· Exercise</span>
      </h1>
      <ExercisePlanner
        userId={user.id}
        schedule={templateFromTimeline(timeline.entries, timeline.weekStart)}
        prefs={{
          homeCorner: shared.homeCorner,
          homeBase: shared.homeBase,
          hasBuildingGym: shared.hasBuildingGym,
          wakingStart: shared.wakingStart,
          wakingEnd: shared.wakingEnd,
          weeklyTargetSessions: outtake.weeklyTargetSessions,
          sessionMinutes: outtake.sessionMinutes,
          preferredTimes: outtake.preferredTimes,
          spreadOut: outtake.spreadOut,
        }}
        days={summary.days}
        today={loaded.now.slice(0, 10)}
        sessions={summary.sessions}
        target={summary.target}
        reason={summary.reason}
        busyness={summary.busyness}
      />
    </div>
  );
}
