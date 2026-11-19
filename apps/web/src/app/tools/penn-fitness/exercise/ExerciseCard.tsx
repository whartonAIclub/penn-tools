// The exercise summary on the Penn Fitness homepage, linking to the Exercise
// page: what needs the user, the next suggested workout, how the week is
// shaping up, and today's free time. Talks about time, not health or guilt
// (section 3 of tools/penn-fitness/docs/outtake.md).

import Link from "next/link";
import type { ExerciseSummary } from "@penntools/tool-penn-fitness";
import { formatDay, formatMinutes, formatRange, formatTime } from "./format";
import styles from "./Exercise.module.css";

const EXERCISE_PAGE = "/tools/penn-fitness/exercise";

/** `summary` is null when the week couldn't be loaded; the card says so rather than hiding. */
export function ExerciseCard({ summary }: { summary: ExerciseSummary | null }) {
  if (summary === null) {
    return (
      <section className={styles.homeCard}>
        <h2 className={styles.cardTitle}>Exercise</h2>
        <p className={styles.meta}>Your exercise week couldn&apos;t be loaded just now. Try again in a moment.</p>
      </section>
    );
  }

  const highlights: { label: string; value: string; detail?: string }[] = [];

  if (summary.commitments === 0) {
    highlights.push({ label: "Get started", value: "Add your week", detail: "Import your calendar or a timetable screenshot, and we'll fit workouts around it." });
  } else if (summary.toConfirm > 0) {
    highlights.push({
      label: "Needs you",
      value: `${summary.toConfirm} ${summary.toConfirm === 1 ? "commitment" : "commitments"} to confirm`,
      detail: "Workouts are only planned around what you've confirmed.",
    });
  }

  if (summary.nextUp) {
    const { start, end, placeName, travelMinutes } = summary.nextUp;
    highlights.push({
      label: "Next up",
      value: `${formatDay(start.slice(0, 10))}, ${formatRange(start, end)}`,
      detail: `${placeName}${travelMinutes > 0 ? ` · ${formatMinutes(travelMinutes)} walking, there and back` : ""}`,
    });
  }

  highlights.push({
    label: "This week",
    value: `${summary.sessions} of ${summary.target} workouts fit`,
    ...(summary.reason
      ? { detail: summary.reason }
      : summary.isBusy
        ? { detail: `A busy week: ${Math.round(summary.busyness * 100)}% of your waking hours are taken.` }
        : {}),
  });

  if (summary.todaysGap) {
    highlights.push({
      label: "Today",
      value: `${formatMinutes(summary.todaysGap.minutes)} free from ${formatTime(summary.todaysGap.start)}`,
    });
  }

  return (
    <section className={styles.homeCard} aria-label="Exercise this week">
      <div className={styles.homeCardHeader}>
        <h2 className={styles.cardTitle}>Exercise this week</h2>
        <Link href={EXERCISE_PAGE} className={styles.cta}>
          Open Exercise →
        </Link>
      </div>
      <ul className={styles.highlights}>
        {highlights.map((h) => (
          <li key={h.label} className={styles.highlight}>
            <p className={styles.highlightLabel}>{h.label}</p>
            <p className={styles.highlightValue}>{h.value}</p>
            {h.detail && <p className={styles.meta}>{h.detail}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
