// The homepage's exercise section, for Nutrition's dashboard to lay out (see
// ../home.ts): closed, one line with the next workout; open, what needs the
// user, this week at a glance, today's free time, the nearest places, the
// week day by day and tips; and Exercise's item in "Your setup". All from
// the week loadExerciseWeek assembles. Talks about time and getting there,
// never health or guilt (section 3 of tools/penn-fitness/docs/outtake.md).

import Link from "next/link";
import { formatCorner, type ExerciseSummary, type PreferredTime, type WeekTip } from "@penntools/tool-penn-fitness";
import type { HomeExercise } from "../home";
import type { LoadedWeek } from "./data";
import { formatMinutes, formatRange, formatTime, formatWeekday } from "./format";
import styles from "./ExerciseHome.module.css";

const EXERCISE_PAGE = "/tools/penn-fitness/exercise";
const PREFERENCES = `${EXERCISE_PAGE}#preferences`;
const WEEKDAY_NAMES: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const TIME_WORDS: Record<PreferredTime, string> = { MORNING: "mornings", MIDDAY: "midday", EVENING: "evenings" };

const dayName = (date: string) => WEEKDAY_NAMES[formatWeekday(date)]!;
const list = (items: string[]) => (items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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

/** The closed section's line: the next workout, or what's needed before there is one. */
function closedLine(summary: ExerciseSummary, today: string): { title: string; meta: string } {
  const toConfirm = summary.toConfirm > 0 ? `${plural(summary.toConfirm, "commitment", "commitments")} to confirm` : null;
  if (summary.nextUp) {
    const { start, placeName, travelMinutes } = summary.nextUp;
    const when = start.slice(0, 10) === today ? "today" : formatWeekday(start.slice(0, 10));
    const walk = travelMinutes > 0 ? `${formatMinutes(travelMinutes)} walking, there and back` : "no walk";
    return { title: `Next workout · ${when} ${formatTime(start)}`, meta: [placeName, walk, toConfirm].filter(Boolean).join(" · ") };
  }
  if (summary.commitments === 0) return { title: "Add your week to get workouts", meta: "Import your calendar or a timetable screenshot." };
  return { title: "No workout fits yet", meta: [summary.reason, toConfirm].filter(Boolean).join(" · ") };
}

function ExerciseDetails({ summary, today }: { summary: ExerciseSummary; today: string }) {
  const fresh = summary.commitments === 0;
  const tips = summary.tips.map((tip) => tipText(tip, today));
  const bookedPercent = Math.round(summary.busyness * 100);

  return (
    <>
      <div className={styles.headerRow}>
        <span className={styles.note}>
          {summary.nextUp ? `Next: ${summary.nextUp.placeName}, ${formatRange(summary.nextUp.start, summary.nextUp.end)}` : "Your week of workouts"}
        </span>
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
            <span className={styles.rowTitle}>{fresh ? "Add your week" : `${plural(summary.toConfirm, "commitment", "commitments")} to confirm`}</span>
            <span className={styles.rowMeta}>
              {fresh ? "Import your calendar or a timetable screenshot, and workouts get fitted around it." : "Workouts are only planned around what you've confirmed."}
            </span>
          </span>
        </Link>
      )}

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
            <Link href={PREFERENCES} className={styles.link}>
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
                    <Link href={PREFERENCES} className={styles.link}>
                      Set it →
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

/** What the homepage shows for exercise; `loaded` is null when the week couldn't be loaded. */
export function homeExercise(loaded: LoadedWeek | null, today: string): HomeExercise {
  if (loaded === null) {
    return {
      title: "Couldn't load your exercise week",
      meta: "Try again in a moment.",
      details: <p className={styles.note}>Your exercise week couldn&apos;t be loaded just now. Try again in a moment.</p>,
      setup: { emoji: "🏃", title: "Workouts", summary: "Open Exercise to set up", href: PREFERENCES },
    };
  }
  const { summary, shared, outtake } = loaded;
  const times = outtake.preferredTimes.length > 0 ? list(outtake.preferredTimes.map((t) => TIME_WORDS[t])) : "any time";
  const home = shared.homeCorner ? `near ${formatCorner(shared.homeCorner)}` : "no corner yet";
  return {
    ...closedLine(summary, today),
    details: <ExerciseDetails summary={summary} today={today} />,
    setup: {
      emoji: "🏃",
      title: "Workouts",
      summary: `${outtake.weeklyTargetSessions} × ${outtake.sessionMinutes} min · ${times} · ${home}`,
      href: PREFERENCES,
    },
  };
}
