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
import { SAMPLE_COMMUNITY, sampleCrowd } from "./demo";
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

const FIT_TEXT = {
  workout: (fit: { minutes: number; placeName: string; travelMinutes: number }) =>
    `Room for a ${formatMinutes(fit.minutes)} workout at ${fit.placeName}${fit.travelMinutes > 0 ? ` · ${formatMinutes(fit.travelMinutes)} walking` : ""}`,
  short: (fit: { minutes: number; placeName: string }) => `Room for a quick ${fit.minutes}-min session at ${fit.placeName}`,
};

/**
 * Free time today (or, once today has none left, the next day that has some):
 * a bar of the day, and what each free stretch has room for.
 */
function FreeToday({ summary, today }: { summary: ExerciseSummary; today: string }) {
  const soon = summary.freeSoon;
  const date = soon?.date ?? today;
  const tomorrow = summary.days.find((d) => d.date > today)?.date;
  const when = date === today ? "today" : date === tomorrow ? "tomorrow" : dayName(date);
  const day = summary.days.find((d) => d.date === date);
  const next = summary.nextUp && summary.nextUp.start.startsWith(date) ? summary.nextUp : null;
  const stretches = soon?.stretches ?? [];
  const free = stretches.reduce((sum, g) => sum + g.minutes, 0);
  return (
    <div className={styles.tile}>
      <h4 className={styles.tileTitle}>⏱️ Free {when}</h4>
      {day && !day.away && <DayBar day={day} waking={summary.waking} workout={next} />}
      {stretches.length === 0 ? (
        <p className={styles.note}>No free stretch of 20 minutes or more left this week.</p>
      ) : (
        <>
          <p className={styles.note}>
            {date !== today && "Nothing left today. "}
            {formatMinutes(free)} free {when} across {stretches.length} {stretches.length === 1 ? "stretch" : "stretches"}
          </p>
          <ul className={styles.freeList}>
            {stretches.slice(0, 3).map((gap) => {
              const hasNext = next !== null && next.start.slice(11) >= gap.start && next.end.slice(11) <= gap.end;
              return (
                <li key={gap.start} className={styles.freeItem}>
                  <span className={styles.freeTime}>
                    <strong>
                      {formatTime(gap.start)}–{formatTime(gap.end)}
                    </strong>
                    <span className={styles.note}> {formatMinutes(gap.minutes)}</span>
                  </span>
                  <span className={gap.fits.kind === "break" ? styles.fitBreak : gap.fits.kind === "short" ? styles.fitShort : styles.fitWorkout}>
                    {gap.fits.kind === "break"
                      ? "☕ A short break: too tight for a workout and the walk"
                      : gap.fits.kind === "short"
                        ? `⚡ ${FIT_TEXT.short(gap.fits)}`
                        : `🏋️ ${FIT_TEXT.workout(gap.fits)}`}
                  </span>
                  {hasNext && <span className={styles.fitNext}>⭐ Your next workout is in this one</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

const KIND_ICONS: Record<string, string> = { gym: "🏋️", pool: "🏊", court: "🎾", field: "⚽", studio: "🧘", "building-gym": "🏢" };
const LEVEL_TEXT = { quiet: "Quiet now", moderate: "Getting busy", busy: "Busy now" } as const;
const LONGEST_WALK_DRAWN = 20;

/** The nearest places: how far, and (sample data) how busy. */
function NearYou({ summary, hour }: { summary: ExerciseSummary; hour: number }) {
  return (
    <div className={styles.tile}>
      <h4 className={styles.tileTitle}>📍 Near you</h4>
      <ul className={styles.placeList}>
        {summary.nearby.map((place) => {
          const crowd = sampleCrowd(place.placeId, place.kind, hour);
          return (
            <li key={place.placeId} className={styles.place}>
              <span className={styles.placeIcon} aria-hidden="true">
                {KIND_ICONS[place.kind] ?? "📍"}
              </span>
              <span className={styles.placeBody}>
                <span className={styles.placeHead}>
                  <strong>{place.placeName}</strong>
                  <span className={styles[`crowd_${crowd.level}`]}>{LEVEL_TEXT[crowd.level]}</span>
                </span>
                <span className={styles.walkRow}>
                  <span className={styles.walkTrack} aria-hidden="true">
                    <span style={{ width: `${Math.max(6, Math.min(100, (place.walkMinutes / LONGEST_WALK_DRAWN) * 100))}%` }} />
                  </span>
                  <span className={styles.note}>🚶 {place.walkMinutes === 0 ? "right there" : `${formatMinutes(place.walkMinutes)}`}</span>
                </span>
                <span className={styles.spark} aria-label={`Usually busiest ${crowd.peak}`}>
                  {crowd.byHour.map((h) => (
                    <span key={h.hour} className={h.hour === hour ? styles.sparkNow : undefined} style={{ height: `${Math.round(h.value * 100)}%` }} />
                  ))}
                </span>
                <span className={styles.note}>Usually busiest {crowd.peak}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {!summary.homeCornerSet && (
        <Link href={PREFERENCES} className={styles.link}>
          Set your nearest corner →
        </Link>
      )}
      <p className={styles.sampleNote}>🧪 Crowd levels are sample data for now; live levels come with Penn Now.</p>
    </div>
  );
}

/** Group workouts (sample data): what the Community feature might show. */
function Community() {
  return (
    <div className={styles.tile}>
      <div className={styles.headerRow}>
        <h4 className={styles.tileTitle}>👥 Fitness community</h4>
        <span className={styles.previewPill}>Preview</span>
      </div>
      <ul className={styles.communityList}>
        {SAMPLE_COMMUNITY.map((a) => (
          <li key={a.who} className={styles.activity}>
            <span className={styles.activityIcon} aria-hidden="true">
              {a.emoji}
            </span>
            <span className={styles.activityBody}>
              <span>
                <strong>{a.who}</strong> {a.what}
              </span>
              <span className={styles.note}>
                📍 {a.place} · {a.when}
              </span>
              <span className={styles.signups}>
                <span className={styles.signupTrack} aria-hidden="true">
                  <span style={{ width: `${(a.joined / a.spots) * 100}%` }} />
                </span>
                <span className={styles.note}>
                  {a.joined}/{a.spots} signed up{a.spots - a.joined <= 2 ? ` · ${a.spots - a.joined === 1 ? "1 spot" : `${a.spots - a.joined} spots`} left` : ""}
                </span>
              </span>
            </span>
            <button className={styles.joinButton} disabled title="Coming soon">
              Join
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.sampleNote}>🧪 Sample activity: workouts with classmates are coming soon.</p>
    </div>
  );
}

function ExerciseDetails({ summary, today, hour }: { summary: ExerciseSummary; today: string; hour: number }) {
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
        <FreeToday summary={summary} today={today} />
        <NearYou summary={summary} hour={hour} />
      </div>

      <Community />

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
    details: <ExerciseDetails summary={summary} today={today} hour={Number(loaded.now.slice(11, 13))} />,
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
