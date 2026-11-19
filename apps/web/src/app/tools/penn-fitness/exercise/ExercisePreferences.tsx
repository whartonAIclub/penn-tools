"use client";

// Exercise preferences on the Exercise page: where home is (its nearest corner,
// never an address), whether the building has a gym, waking hours, and how
// the user likes to work out. Home and waking hours are shared with Nutrition.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CROSS_STREETS, formatCorner, PREFERRED_TIMES, type PreferredTime } from "@penntools/tool-penn-fitness";
import { saveExercisePreferences, type ExercisePreferencesInput } from "./actions";
import styles from "./Exercise.module.css";

const STREETS = Array.from({ length: 49 }, (_, i) => i + 1);
const SESSION_LENGTHS = [20, 30, 45, 60, 75, 90];
const TIME_LABELS: Record<PreferredTime, string> = { MORNING: "Mornings", MIDDAY: "Midday", EVENING: "Evenings" };

export function ExercisePreferences({ current }: { current: ExercisePreferencesInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [prefs, setPrefs] = useState(current);
  const set = <K extends keyof ExercisePreferencesInput>(key: K, value: ExercisePreferencesInput[K]) => setPrefs((p) => ({ ...p, [key]: value }));
  const corner = prefs.homeCorner;

  return (
    <details id="preferences" className={styles.card} open={current.homeCorner === null}>
      <summary className={styles.cardTitle}>
        Your preferences
        <span className={styles.meta}>
          {" "}
          · {current.homeCorner ? `home near ${formatCorner(current.homeCorner as Parameters<typeof formatCorner>[0])}` : "add your nearest corner"} ·{" "}
          {current.weeklyTargetSessions} × {current.sessionMinutes} min a week
        </span>
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const saved = await saveExercisePreferences(prefs);
            setResult(saved.ok ? { ok: true, text: saved.message ?? "Saved." } : { ok: false, text: saved.error });
            if (saved.ok) router.refresh();
          });
        }}
      >
        <h3 className={styles.subTitle}>Where you live</h3>
        <p className={styles.meta}>Your nearest corner, for walking times. Never a street address.</p>
        <div className={styles.row}>
          <label className={styles.inline}>
            Street
            <select
              value={corner?.street ?? ""}
              onChange={(e) => set("homeCorner", e.target.value ? { street: Number(e.target.value), crossStreet: corner?.crossStreet ?? "Walnut" } : null)}
            >
              <option value="">Don&apos;t say</option>
              {STREETS.map((n) => (
                <option key={n} value={n}>
                  {formatCorner({ street: n, crossStreet: "Walnut" }).split(" & ")[0]} St
                </option>
              ))}
            </select>
          </label>
          {corner && (
            <label className={styles.inline}>
              &amp;
              <select value={corner.crossStreet} onChange={(e) => set("homeCorner", { ...corner, crossStreet: e.target.value })}>
                {CROSS_STREETS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          {!corner && (
            <label className={styles.inline}>
              Area
              <select value={prefs.homeBase} onChange={(e) => set("homeBase", e.target.value)}>
                <option value="CAMPUS">Near campus</option>
                <option value="CENTER_CITY">Center City / Rittenhouse</option>
              </select>
            </label>
          )}
          <label className={styles.inline}>
            <input type="checkbox" checked={prefs.hasBuildingGym} onChange={(e) => set("hasBuildingGym", e.target.checked)} />
            My building has a gym
          </label>
        </div>

        <h3 className={styles.subTitle}>Your day</h3>
        <div className={styles.row}>
          <label className={styles.inline}>
            Usually up by <input type="time" value={prefs.wakingStart} onChange={(e) => set("wakingStart", e.target.value)} required />
          </label>
          <label className={styles.inline}>
            Usually in bed by <input type="time" value={prefs.wakingEnd} onChange={(e) => set("wakingEnd", e.target.value)} required />
          </label>
        </div>

        <h3 className={styles.subTitle}>Your workouts</h3>
        <div className={styles.row}>
          <label className={styles.inline}>
            <select value={prefs.weeklyTargetSessions} onChange={(e) => set("weeklyTargetSessions", Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            a week, of
          </label>
          <label className={styles.inline}>
            <select value={prefs.sessionMinutes} onChange={(e) => set("sessionMinutes", Number(e.target.value))}>
              {(SESSION_LENGTHS.includes(prefs.sessionMinutes) ? SESSION_LENGTHS : [...SESSION_LENGTHS, prefs.sessionMinutes].sort((a, b) => a - b)).map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.row}>
          <span className={styles.inline}>Best times:</span>
          {PREFERRED_TIMES.map((time) => (
            <label key={time} className={styles.inline}>
              <input
                type="checkbox"
                checked={prefs.preferredTimes.includes(time)}
                onChange={(e) => set("preferredTimes", e.target.checked ? [...prefs.preferredTimes, time] : prefs.preferredTimes.filter((t) => t !== time))}
              />
              {TIME_LABELS[time]}
            </label>
          ))}
          <span className={styles.meta}>(none ticked: any time)</span>
        </div>
        <div className={styles.row}>
          <label className={styles.inline}>
            <input type="radio" name="spread" checked={prefs.spreadOut} onChange={() => set("spreadOut", true)} />
            Spread them across the week
          </label>
          <label className={styles.inline}>
            <input type="radio" name="spread" checked={!prefs.spreadOut} onChange={() => set("spreadOut", false)} />
            Days in a row are fine
          </label>
        </div>

        <div className={styles.row}>
          <button className={styles.primary} type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save preferences"}
          </button>
          {result && <span className={result.ok ? styles.meta : styles.errorText}>{result.text}</span>}
        </div>
      </form>
    </details>
  );
}
