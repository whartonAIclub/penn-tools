// The homepage's exercise parts, for Nutrition's dashboard to lay out (see
// ../home.ts): the closed Exercise section, drawing the next workout and where
// it fits in that day; the opened section (what needs the user, free time
// today, the nearest places, tips); and Exercise's item in "Your setup". All
// from the week loadExerciseWeek assembles. Talks about time and getting
// there, never health or guilt (section 3 of tools/penn-fitness/docs/outtake.md).

import Link from "next/link";
import { formatCorner, minutesOfDay, type ExerciseDay, type ExerciseSummary, type PreferredTime, type WeekTip } from "@penntools/tool-penn-fitness";
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

/** A day drawn across waking hours: commitments in grey, a workout in green. */
function DayBar({ day, waking, workout }: { day: ExerciseDay; waking: ExerciseSummary["waking"]; workout: { start: string; end: string } | null }) {
  const from = minutesOfDay(waking.start);
  const span = minutesOfDay(waking.end) - from;
  const at = (time: string) => `${(Math.max(0, Math.min(span, minutesOfDay(time) - from)) / span) * 100}%`;
  const width = (start: string, end: string) => `${((minutesOfDay(end) - minutesOfDay(start)) / span) * 100}%`;
  return (
    <span className={styles.dayBar} aria-hidden="true">
      <span className={styles.dayTrack}>
        {day.busyStretches.map((busy) => (
          <span key={busy.start} className={styles.dayBusy} style={{ left: at(busy.start), width: width(busy.start, busy.end) }} />
        ))}
        {workout && (
          <span
            className={styles.dayWorkout}
            style={{ left: at(workout.start.slice(11)), width: width(workout.start.slice(11), workout.end.slice(11)) }}
          />
        )}
      </span>
      <span className={styles.dayEnds}>
        <span>{formatTime(waking.start)}</span>
        <span>{formatTime(waking.end)}</span>
      </span>
    </span>
  );
}

/** The closed section: the next workout as a ticket, with where it fits in its day. */
function NextWorkout({ summary, today }: { summary: ExerciseSummary; today: string }) {
  const toConfirm = summary.toConfirm > 0 ? `${summary.toConfirm} to confirm` : null;
  if (!summary.nextUp) {
    const fresh = summary.commitments === 0;
    return (
      <span className={styles.closedEmpty}>
        <span className={styles.closedTitle}>{fresh ? "Add your week to get workouts" : "No workout fits yet"}</span>
        <span className={styles.closedMeta}>{fresh ? "Import your calendar or a timetable screenshot." : [summary.reason, toConfirm].filter(Boolean).join(" · ")}</span>
      </span>
    );
  }
  const { start, end, placeName, travelMinutes } = summary.nextUp;
  const date = start.slice(0, 10);
  const [clock, meridiem] = formatTime(start).split(" ");
  const day = summary.days.find((d) => d.date === date);
  const length = minutesOfDay(end.slice(11)) - minutesOfDay(start.slice(11));
  return (
    <span className={styles.ticket}>
      <span className={styles.when}>
        <span className={styles.whenDay}>{date === today ? "Today" : formatWeekday(date)}</span>
        <span className={styles.whenTime}>{clock}</span>
        <span className={styles.whenMeridiem}>{meridiem}</span>
      </span>
      <span className={styles.ticketBody}>
        <span className={styles.ticketPlace}>📍 {placeName}</span>
        <span className={styles.chips}>
          <span className={styles.chip}>⏱ {formatMinutes(length)}</span>
          <span className={styles.chip}>🚶 {travelMinutes > 0 ? `${formatMinutes(travelMinutes)} walking` : "no walk"}</span>
          {toConfirm && <span className={styles.chipWarn}>✅ {toConfirm}</span>}
        </span>
        {day && <DayBar day={day} waking={summary.waking} workout={{ start, end }} />}
      </span>
    </span>
  );
}

function label(summary: ExerciseSummary, today: string): string {
  if (!summary.nextUp) return summary.commitments === 0 ? "Add your week to get workouts" : "No workout fits yet";
  const date = summary.nextUp.start.slice(0, 10);
  return `Next workout ${date === today ? "today" : dayName(date)} ${formatRange(summary.nextUp.start, summary.nextUp.end)} at ${summary.nextUp.placeName}`;
}

function ExerciseDetails({ summary, today }: { summary: ExerciseSummary; today: string }) {
  const fresh = summary.commitments === 0;
  const tips = summary.tips.map((tip) => tipText(tip, today));

  return (
    <>
      <div className={styles.headerRow}>
        <span className={styles.note}>
          {summary.sessions} of {summary.target} workouts fit around your week
          {summary.isBusy ? ` · a busy week, ${Math.round(summary.busyness * 100)}% of waking hours booked` : ""}
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
    const unavailable = <span className={styles.closedMeta}>Your exercise week couldn&apos;t be loaded just now. Try again in a moment.</span>;
    return {
      summary: unavailable,
      label: "Exercise couldn't be loaded",
      details: unavailable,
      plannedMinutes: 0,
      setup: { emoji: "🏃", title: "Workouts", summary: "Open Exercise to set up", href: PREFERENCES },
    };
  }
  const { summary, shared, outtake } = loaded;
  const times = outtake.preferredTimes.length > 0 ? list(outtake.preferredTimes.map((t) => TIME_WORDS[t])) : "any time";
  const home = shared.homeCorner ? `near ${formatCorner(shared.homeCorner)}` : "no corner yet";
  return {
    summary: <NextWorkout summary={summary} today={today} />,
    label: label(summary, today),
    details: <ExerciseDetails summary={summary} today={today} />,
    plannedMinutes: summary.days.reduce(
      (sum, day) => sum + (day.workout ? minutesOfDay(day.workout.end.slice(11)) - minutesOfDay(day.workout.start.slice(11)) : 0),
      0,
    ),
    setup: {
      emoji: "🏃",
      title: "Workouts",
      summary: `${outtake.weeklyTargetSessions} × ${outtake.sessionMinutes} min · ${times} · ${home}`,
      href: PREFERENCES,
    },
  };
}
