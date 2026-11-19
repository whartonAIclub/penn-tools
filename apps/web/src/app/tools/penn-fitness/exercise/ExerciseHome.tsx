// The exercise section of the Penn Fitness homepage, under the greeting:
// what needs the user, the next suggested workout, this week at a glance,
// today's free time, the nearest places, the week day by day, and tips. All
// from assembleWeek's summary; it links to the Exercise page for everything
// else. Talks about time and getting there, never health or guilt
// (section 3 of tools/penn-fitness/docs/outtake.md).

import Link from "next/link";
import type { ExerciseSummary, WeekTip } from "@penntools/tool-penn-fitness";
import { formatMinutes, formatRange, formatTime, formatWeekday } from "./format";
import styles from "./ExerciseHome.module.css";

const EXERCISE_PAGE = "/tools/penn-fitness/exercise";
const WEEKDAY_NAMES: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

const dayName = (date: string) => WEEKDAY_NAMES[formatWeekday(date)]!;
const list = (items: string[]) => (items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

function tipText(tip: WeekTip, today: string): { text: string; link?: boolean } {
  switch (tip.kind) {
    case "setHome":
      return { text: "Add your nearest corner, so walking times are right for you.", link: true };
    case "heavyWeek":
      return { text: `A heavy week: ${tip.percentBooked}% of your waking hours are booked. Short 20–30 minute sessions count too.` };
    case "lightestDay":
      return { text: `${dayName(tip.date)} is your lightest day, with ${formatMinutes(tip.freeMinutes)} free.` };
    case "longestStretch": {
      const when = tip.stretch.date === today ? "today" : dayName(tip.stretch.date);
      return { text: `Your longest free stretch is ${when}, ${formatTime(tip.stretch.start)}–${formatTime(tip.stretch.end)}.` };
    }
    case "freeMornings":
      return { text: `Mornings are free on ${list(tip.dates.map(dayName))}: room for a session before anything else starts.` };
  }
}

/** `summary` is null when the week couldn't be loaded; the section says so rather than hiding. */
export function ExerciseHome({ summary, today }: { summary: ExerciseSummary | null; today: string }) {
  if (summary === null) {
    return (
      <section className={styles.section} aria-label="Exercise">
        <h3 className={styles.heading}>🏃 Exercise</h3>
        <p className={styles.note}>Your exercise week couldn&apos;t be loaded just now. Try again in a moment.</p>
      </section>
    );
  }

  const fresh = summary.commitments === 0;
  const tips = summary.tips.map((tip) => tipText(tip, today));
  const bookedPercent = Math.round(summary.busyness * 100);

  return (
    <section className={styles.section} aria-label="Exercise">
      <div className={styles.headerRow}>
        <h3 className={styles.heading}>🏃 Exercise</h3>
        <Link href={EXERCISE_PAGE} className={styles.link}>
          Open Exercise →
        </Link>
      </div>

      {(fresh || summary.toConfirm > 0) && (
        <Link href={EXERCISE_PAGE} className={styles.needsYou}>
          <span className={styles.icon} aria-hidden="true">
            {fresh ? "📅" : "✅"}
          </span>
          <span className={styles.rowText}>
            <span className={styles.rowLabel}>Needs you</span>
            <span className={styles.rowTitle}>
              {fresh ? "Add your week" : `${summary.toConfirm} ${summary.toConfirm === 1 ? "commitment" : "commitments"} to confirm`}
            </span>
            <span className={styles.rowMeta}>
              {fresh ? "Import your calendar or a timetable screenshot, and workouts get fitted around it." : "Workouts are only planned around what you've confirmed."}
            </span>
          </span>
        </Link>
      )}

      <div className={styles.nextUp}>
        <span className={styles.icon} aria-hidden="true">
          🏋️
        </span>
        <span className={styles.rowText}>
          {summary.nextUp ? (
            <>
              <span className={styles.rowLabel}>
                Next workout · {summary.nextUp.start.slice(0, 10) === today ? "today" : formatWeekday(summary.nextUp.start.slice(0, 10))}{" "}
                {formatTime(summary.nextUp.start)}
              </span>
              <span className={styles.rowTitle}>{summary.nextUp.placeName}</span>
              <span className={styles.rowMeta}>
                {formatRange(summary.nextUp.start, summary.nextUp.end)}
                {summary.nextUp.travelMinutes > 0 ? ` · ${formatMinutes(summary.nextUp.travelMinutes)} walking, there and back` : " · no walk"}
              </span>
            </>
          ) : (
            <>
              <span className={styles.rowLabel}>Next workout</span>
              <span className={styles.rowTitle}>Nothing fits yet</span>
              <span className={styles.rowMeta}>{summary.reason ?? "Add your week to get suggestions."}</span>
            </>
          )}
        </span>
        <Link href={EXERCISE_PAGE} className={styles.link}>
          See the week →
        </Link>
      </div>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <h4 className={styles.tileTitle}>📊 This week</h4>
          <p className={styles.bigNumber}>
            {summary.sessions}
            <span className={styles.of}>/{summary.target}</span>
          </p>
          <p className={styles.note}>workouts fit around your week</p>
          <div className={styles.meter} aria-label={`${bookedPercent}% of waking hours booked`}>
            <span style={{ width: `${Math.min(100, bookedPercent)}%` }} className={summary.isBusy ? styles.meterBusy : styles.meterFill} />
          </div>
          <p className={styles.note}>
            {bookedPercent}% of your waking hours booked{summary.isBusy ? ": a busy week" : ""}
          </p>
        </div>

        <div className={styles.tile}>
          <h4 className={styles.tileTitle}>⏱️ Free today</h4>
          {summary.todaysGaps.length === 0 ? (
            <p className={styles.note}>No free stretch of 20 minutes or more left today.</p>
          ) : (
            <ul className={styles.list}>
              {summary.todaysGaps.slice(0, 3).map((gap) => (
                <li key={gap.start}>
                  <strong>
                    {formatTime(gap.start)}–{formatTime(gap.end)}
                  </strong>
                  <span className={styles.note}> {formatMinutes(gap.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.tile}>
          <h4 className={styles.tileTitle}>📍 Near you</h4>
          <ul className={styles.list}>
            {summary.nearby.map((place) => (
              <li key={place.placeName}>
                <strong>{place.placeName}</strong>
                <span className={styles.note}> {place.walkMinutes === 0 ? "right there" : `${formatMinutes(place.walkMinutes)} walk`}</span>
              </li>
            ))}
          </ul>
          {!summary.homeCornerSet && (
            <Link href={`${EXERCISE_PAGE}#preferences`} className={styles.link}>
              Set your nearest corner →
            </Link>
          )}
        </div>
      </div>

      <div className={styles.weekStrip} aria-label="Workouts this week">
        {summary.days.map((day) => (
          <div key={day.date} className={day.date === today ? styles.stripToday : day.past ? styles.stripPast : styles.stripDay}>
            <span className={styles.stripName}>{formatWeekday(day.date)}</span>
            <span className={styles.stripIcon} aria-hidden="true">
              {day.away ? "✈️" : day.workout ? "🏃" : "·"}
            </span>
            <span className={styles.stripTime}>{day.away ? "away" : day.workout ? formatTime(day.workout.start) : "rest"}</span>
            <span className={styles.stripBusy}>{day.busyMinutes > 0 ? `${Math.round(day.busyMinutes / 60)}h booked` : "free"}</span>
          </div>
        ))}
      </div>

      {tips.length > 0 && (
        <div className={styles.tips}>
          <h4 className={styles.tipsTitle}>💡 For your week</h4>
          <ol>
            {tips.map((tip) => (
              <li key={tip.text}>
                {tip.text}
                {tip.link && (
                  <>
                    {" "}
                    <Link href={`${EXERCISE_PAGE}#preferences`} className={styles.link}>
                      Set it →
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
