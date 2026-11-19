// Penn Fitness · Community: a preview of group workouts with classmates.
// The activities are SAMPLE DATA (../exercise/demo.ts) until the Community
// feature exists (section 12 of tools/penn-fitness/docs/outtake.md), but
// whether each one fits is checked against the user's real week: their
// confirmed commitments, days away and planned workouts. Linked from the
// homepage's Fitness community card.

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { addDays, mondayOf } from "@penntools/tool-penn-fitness";
import { loadExerciseWeek, type LoadedWeek } from "../exercise/data";
import { SAMPLE_COMMUNITY, activityWhen } from "../exercise/demo";
import { CommunityBoard, type BoardActivity, type Fit } from "./CommunityBoard";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Community · Penn Fitness",
};

/** How an activity sits in the user's week. */
function fitOf(date: string, start: string, end: string, week: LoadedWeek, now: string): Fit {
  const from = `${date}T${start}`;
  const to = `${date}T${end}`;
  if (from < now) return { kind: "started" };
  if (week.timeline.awayDays.includes(date)) return { kind: "away" };
  const clash = week.timeline.entries.find(({ block }) => block.confirmed && block.start < to && block.end > from);
  if (clash) return { kind: "clash", with: clash.block.label ?? "something in your week" };
  const day = week.summary.days.find((d) => d.date === date);
  if (day?.workout) return { kind: "swap", workoutStart: day.workout.start.slice(11, 16) };
  return { kind: "fits" };
}

export default async function CommunityPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Penn Fitness" />;

  const thisWeek = await loadExerciseWeek(user.id);
  const today = thisWeek.now.slice(0, 10);
  const dated = SAMPLE_COMMUNITY.map((a) => ({ a, when: activityWhen(a, today) }));
  // Activities run up to six days ahead, so some may fall in next week.
  const nextMonday = addDays(mondayOf(today), 7);
  const nextWeek = dated.some(({ when }) => when.date >= nextMonday) ? await loadExerciseWeek(user.id, nextMonday) : null;

  const activities: BoardActivity[] = dated
    .map(({ a, when }) => ({
      ...a,
      date: when.date,
      when: when.label,
      fit: fitOf(when.date, a.start, a.end, nextWeek && when.date >= nextMonday ? nextWeek : thisWeek, thisWeek.now),
    }))
    .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        Penn Fitness <span className={styles.section}>· Community</span>
      </h1>
      <CommunityBoard activities={activities} today={today} />
    </div>
  );
}
