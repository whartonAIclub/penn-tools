"use client";

// The Exercise page, in Nutrition's planner frame and styles (its
// MealPlanner, Nutrition.module.css): a three-step setup (your week, where
// you work out, your workouts), then the week of workouts it plans. "Your
// week" is Nutrition's own ScheduleStep, editing the same shared week.

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  areaOfCorner,
  CROSS_STREETS,
  DEFAULT_PLANNER_PROFILE,
  formatCorner,
  PREFERRED_TIMES,
  type Corner,
  type ExerciseDay,
  type PlannerProfile,
  type PreferredTime,
  type WeeklySchedule,
} from "@penntools/tool-penn-fitness";
import { ScheduleStep } from "../nutrition/planner/ScheduleStep";
import { loadProfile, saveProfile, saveWeek } from "../nutrition/storage";
import n from "../nutrition/Nutrition.module.css";
import { saveExercisePreferences, setAway, type ExercisePreferencesInput } from "./actions";
import { formatDay, formatMinutes, formatTime, formatWeekday } from "./format";
import styles from "./Exercise.module.css";

const STEPS = ["Your week", "Where you work out", "Your workouts"] as const;
const STREETS = Array.from({ length: 49 }, (_, i) => i + 1);
const TIMES: Record<PreferredTime, { emoji: string; label: string; hint: string }> = {
  MORNING: { emoji: "🌅", label: "Mornings", hint: "before noon" },
  MIDDAY: { emoji: "☀️", label: "Midday", hint: "noon to 4 PM" },
  EVENING: { emoji: "🌙", label: "Evenings", hint: "after 4 PM" },
};
const LENGTHS = [20, 30, 45, 60, 75, 90];

interface Props {
  userId: string;
  /** The shared week, as Nutrition's template. */
  schedule: WeeklySchedule;
  prefs: ExercisePreferencesInput;
  days: ExerciseDay[];
  today: string;
  sessions: number;
  target: number;
  reason: string | null;
  /** Busy share of waking hours, 0 to 1. */
  busyness: number;
}

export function ExercisePlanner(props: Props) {
  const router = useRouter();
  const fresh = props.schedule.length === 0;
  const [view, setView] = useState<"setup" | "plan">(fresh ? "setup" : "plan");
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<PlannerProfile>(DEFAULT_PLANNER_PROFILE);
  const [prefs, setPrefs] = useState(props.prefs);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The area home is in: the corner's, when there is one.
  const homeArea = prefs.homeCorner ? areaOfCorner(prefs.homeCorner as Corner) : prefs.homeBase;
  const set = <K extends keyof ExercisePreferencesInput>(key: K, value: ExercisePreferencesInput[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  // Nutrition's "About you" (wake and sleep times, home) lives in this browser.
  useEffect(() => {
    const saved = loadProfile(props.userId);
    if (saved) setProfile(saved);
  }, [props.userId]);

  function open(at: number) {
    setError(null);
    setStep(at);
    setView("setup");
  }

  function finish() {
    setError(null);
    // Waking hours come from Nutrition's About you, when it has a day that ends after it starts.
    const waking = profile.sleepTime > profile.wakeTime ? { wakingStart: profile.wakeTime, wakingEnd: profile.sleepTime } : {};
    startTransition(async () => {
      const saved = await saveExercisePreferences({ ...prefs, ...waking });
      if (!saved.ok) return setError(saved.error);
      setView("plan");
      router.refresh();
    });
  }

  if (view === "plan") return <PlanView {...props} onEdit={open} />;

  return (
    <section className={n.card}>
      <div className={n.cardHeader}>
        <h2 className={n.cardTitle}>✨ Let&apos;s plan your workouts</h2>
        {!fresh && (
          <button className={n.linkButton} onClick={() => setView("plan")}>
            ← Your workout week
          </button>
        )}
      </div>
      <p className={n.description}>Three quick steps, then we&apos;ll fit short workouts into the gaps in your week.</p>

      <ol className={n.steps}>
        {STEPS.map((label, i) => (
          <li key={label}>
            <button className={i === step ? n.stepActive : n.step} onClick={() => setStep(i)}>
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <p className={n.meta}>📅 This is the same week as Nutrition&apos;s: change it here or there, and both plan around it.</p>
          <ScheduleStep
            initial={props.schedule}
            profile={profile}
            onBack={() => setView(fresh ? "setup" : "plan")}
            onNext={(nextSchedule, home) => {
              const nextProfile = { ...profile, home };
              setProfile(nextProfile);
              saveProfile(props.userId, nextProfile);
              startTransition(async () => {
                const saved = await saveWeek(nextSchedule);
                if (!saved) return setError("Your week couldn't be saved. Try again.");
                setStep(1);
                router.refresh();
              });
            }}
          />
        </>
      )}

      {step === 1 && (
        <div className={n.form}>
          <fieldset className={n.fieldset}>
            <legend>Where do you live?</legend>
            <div className={n.styleCards}>
              {(
                [
                  ["CAMPUS", "🏛️", "Near campus"],
                  ["CENTER_CITY", "🌆", "Center City / Rittenhouse"],
                ] as const
              ).map(([area, emoji, label]) => (
                <label key={area} className={homeArea === area ? n.styleCardActive : n.styleCard}>
                  <input
                    type="radio"
                    name="area"
                    checked={homeArea === area}
                    // A corner on the other side of the river no longer fits; one on this side stays.
                    onChange={() => setPrefs((p) => ({ ...p, homeBase: area, homeCorner: p.homeCorner && areaOfCorner(p.homeCorner as Corner) === area ? p.homeCorner : null }))}
                  />
                  <span aria-hidden="true">{emoji}</span>
                  {label}
                </label>
              ))}
              <label className={prefs.hasBuildingGym ? n.styleCardActive : n.styleCard}>
                <input type="checkbox" checked={prefs.hasBuildingGym} onChange={(e) => set("hasBuildingGym", e.target.checked)} />
                <span aria-hidden="true">🏢</span>
                My building has a gym
              </label>
            </div>
          </fieldset>

          <div className={n.subsection}>
            <h3 className={n.subTitle}>Your nearest corner</h3>
            <p className={n.meta}>For real walking times to Pottruck and the rest. Just the corner, never your address.</p>
            <div className={n.fieldRow}>
              <label className={n.field}>
                Street
                <select
                  className={n.select}
                  value={prefs.homeCorner?.street ?? ""}
                  onChange={(e) => set("homeCorner", e.target.value ? { street: Number(e.target.value), crossStreet: prefs.homeCorner?.crossStreet ?? "Walnut" } : null)}
                >
                  <option value="">Don&apos;t say</option>
                  {STREETS.map((s) => (
                    <option key={s} value={s}>
                      {formatCorner({ street: s, crossStreet: "Walnut" }).split(" & ")[0]} Street
                    </option>
                  ))}
                </select>
              </label>
              <label className={n.field}>
                And
                <select
                  className={n.select}
                  disabled={!prefs.homeCorner}
                  value={prefs.homeCorner?.crossStreet ?? "Walnut"}
                  onChange={(e) => prefs.homeCorner && set("homeCorner", { ...prefs.homeCorner, crossStreet: e.target.value })}
                >
                  {CROSS_STREETS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            {prefs.homeCorner && <p className={n.notice}>📍 Home near {formatCorner(prefs.homeCorner as Parameters<typeof formatCorner>[0])}</p>}
          </div>

          <div className={n.controls}>
            <button className={n.secondaryButton} onClick={() => setStep(0)}>
              Back
            </button>
            <button className={n.button} onClick={() => setStep(2)}>
              Next: your workouts
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={n.form}>
          <fieldset className={n.fieldset}>
            <legend>How many workouts a week?</legend>
            <div className={styles.chips}>
              {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                <label key={count} className={prefs.weeklyTargetSessions === count ? styles.chipActive : styles.chip}>
                  <input type="radio" name="count" checked={prefs.weeklyTargetSessions === count} onChange={() => set("weeklyTargetSessions", count)} />
                  {count}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={n.fieldset}>
            <legend>How long is a workout?</legend>
            <div className={styles.chips}>
              {LENGTHS.map((minutes) => (
                <label key={minutes} className={prefs.sessionMinutes === minutes ? styles.chipActive : styles.chip}>
                  <input type="radio" name="length" checked={prefs.sessionMinutes === minutes} onChange={() => set("sessionMinutes", minutes)} />
                  {minutes} min
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={n.fieldset}>
            <legend>When do you like to work out?</legend>
            <div className={n.styleCards}>
              {PREFERRED_TIMES.map((time) => {
                const on = prefs.preferredTimes.includes(time);
                return (
                  <label key={time} className={on ? n.styleCardActive : n.styleCard}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set("preferredTimes", on ? prefs.preferredTimes.filter((t) => t !== time) : [...prefs.preferredTimes, time])}
                    />
                    <span aria-hidden="true">{TIMES[time].emoji}</span>
                    {TIMES[time].label}
                    <small className={n.meta}>{TIMES[time].hint}</small>
                  </label>
                );
              })}
            </div>
            <p className={n.meta}>Pick none for any time.</p>
          </fieldset>

          <fieldset className={n.fieldset}>
            <legend>Across the week</legend>
            <div className={n.styleCards}>
              <label className={prefs.spreadOut ? n.styleCardActive : n.styleCard}>
                <input type="radio" name="spread" checked={prefs.spreadOut} onChange={() => set("spreadOut", true)} />
                <span aria-hidden="true">📅</span>
                Spread them out
              </label>
              <label className={!prefs.spreadOut ? n.styleCardActive : n.styleCard}>
                <input type="radio" name="spread" checked={!prefs.spreadOut} onChange={() => set("spreadOut", false)} />
                <span aria-hidden="true">🔁</span>
                Days in a row are fine
              </label>
            </div>
          </fieldset>

          {error && <p className={n.error}>{error}</p>}

          <div className={n.controls}>
            <button className={n.secondaryButton} onClick={() => setStep(1)}>
              Back
            </button>
            <button className={n.button} onClick={finish} disabled={pending}>
              {pending ? "Planning…" : "Plan my workouts 🎉"}
            </button>
          </div>
        </div>
      )}
      {step !== 2 && error && <p className={n.error}>{error}</p>}
    </section>
  );
}

/** The week of workouts, a card a day, with what to change one click away. */
function PlanView(props: Props & { onEdit: (step: number) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { days, today, prefs } = props;

  function toggleAway(day: ExerciseDay) {
    startTransition(async () => {
      const saved = await setAway(day.date, !day.away);
      if (!saved.ok) return setError(saved.error);
      setError(null);
      router.refresh();
    });
  }

  const times = prefs.preferredTimes.length > 0 ? prefs.preferredTimes.map((t) => TIMES[t as PreferredTime].label.toLowerCase()).join(" and ") : "any time";
  return (
    <section className={n.card}>
      <div className={n.cardHeader}>
        <h2 className={n.cardTitle}>🏃 Your workout week</h2>
        <a className={n.linkButton} href="/tools/penn-fitness">
          ← Penn Fitness home
        </a>
      </div>
      <p className={n.description}>
        {props.sessions} of {props.target} workouts fit around your week
        {props.busyness >= 0.5 ? ` · a busy one, ${Math.round(props.busyness * 100)}% of your waking hours are booked` : ""}.
      </p>
      {props.reason && <p className={n.notice}>{props.reason}</p>}

      <div className={styles.dayCards}>
        {days.map((day) => {
          const length = day.workout ? Number(day.workout.end.slice(11, 13)) * 60 + Number(day.workout.end.slice(14)) - (Number(day.workout.start.slice(11, 13)) * 60 + Number(day.workout.start.slice(14))) : 0;
          return (
            <div key={day.date} className={day.date === today ? styles.dayCardToday : day.past ? styles.dayCardPast : styles.dayCard}>
              <div className={styles.dayCardHead}>
                <strong>{formatWeekday(day.date)}</strong>
                <span>{formatDay(day.date).split(", ")[1]}</span>
              </div>
              {day.away ? (
                <div className={styles.dayRest}>
                  <span aria-hidden="true">✈️</span> Away
                </div>
              ) : day.workout ? (
                <div className={styles.dayWorkout}>
                  <span className={styles.dayTime}>{formatTime(day.workout.start)}</span>
                  <span className={styles.dayPlace}>📍 {day.workout.placeName}</span>
                  <span className={styles.dayMeta}>
                    ⏱ {formatMinutes(length)} · 🚶 {day.workout.travelMinutes > 0 ? formatMinutes(day.workout.travelMinutes) : "no walk"}
                  </span>
                </div>
              ) : (
                <div className={styles.dayRest}>
                  <span aria-hidden="true">😌</span> Rest
                </div>
              )}
              <span className={styles.dayBusy}>{day.busyMinutes > 0 ? `${Math.round(day.busyMinutes / 60)}h booked` : "Nothing booked"}</span>
              {!day.past && (
                <button className={styles.awayButton} disabled={pending} onClick={() => toggleAway(day)}>
                  {day.away ? "Not away" : "I'm away"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className={n.error}>{error}</p>}

      <h3 className={n.subTitle}>Your setup</h3>
      <div className={styles.setupCards}>
        {[
          { emoji: "📅", title: "Your week", summary: `${props.schedule.length} classes and commitments · shared with Nutrition`, step: 0 },
          {
            emoji: "📍",
            title: "Where you work out",
            summary: prefs.homeCorner ? `Near ${formatCorner(prefs.homeCorner as Parameters<typeof formatCorner>[0])}${prefs.hasBuildingGym ? " · building gym" : ""}` : prefs.homeBase === "CENTER_CITY" ? "Center City" : "Near campus",
            step: 1,
          },
          { emoji: "🏋️", title: "Your workouts", summary: `${prefs.weeklyTargetSessions} × ${prefs.sessionMinutes} min · ${times}${prefs.spreadOut ? " · spread out" : ""}`, step: 2 },
        ].map((part) => (
          <button key={part.title} className={styles.setupCard} onClick={() => props.onEdit(part.step)}>
            <span aria-hidden="true">{part.emoji}</span>
            <span className={styles.setupText}>
              <strong>{part.title}</strong>
              <small>{part.summary}</small>
            </span>
            <span aria-hidden="true">✏️</span>
          </button>
        ))}
      </div>
    </section>
  );
}
