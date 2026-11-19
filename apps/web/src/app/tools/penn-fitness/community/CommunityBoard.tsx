"use client";

// The Community page's board: the week ahead at a glance, sport filters, a
// card per group workout (who's going, and whether it fits the user's week),
// and a preview of hosting one. The activities are sample data and joining
// isn't saved; the page says so. In Nutrition's card frame, like Exercise.

import { useState } from "react";
import n from "../nutrition/Nutrition.module.css";
import type { SampleActivity } from "../exercise/demo";
import styles from "./Community.module.css";

export type Fit =
  | { kind: "fits" }
  | { kind: "swap"; workoutStart: string }
  | { kind: "clash"; with: string }
  | { kind: "away" }
  | { kind: "started" };

export interface BoardActivity extends SampleActivity {
  date: string;
  /** e.g. "Today, 5:00 PM" */
  when: string;
  fit: Fit;
}

type Sport = SampleActivity["sport"];

const SPORTS: Record<Sport, { emoji: string; tint: string; ink: string }> = {
  Tennis: { emoji: "🎾", tint: "linear-gradient(135deg, #fef9c3, #dcfce7)", ink: "#3f6212" },
  Running: { emoji: "🏃", tint: "linear-gradient(135deg, #ffedd5, #fee2e2)", ink: "#9a3412" },
  Lifting: { emoji: "🏋️", tint: "linear-gradient(135deg, #e0e7ff, #ede9fe)", ink: "#3730a3" },
  Squash: { emoji: "🟢", tint: "linear-gradient(135deg, #dcfce7, #ccfbf1)", ink: "#166534" },
  Swimming: { emoji: "🏊", tint: "linear-gradient(135deg, #e0f2fe, #cffafe)", ink: "#075985" },
  Yoga: { emoji: "🧘", tint: "linear-gradient(135deg, #fce7f3, #f3e8ff)", ink: "#86198f" },
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function dateParts(date: string): { weekday: string; day: number } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d));
  return { weekday: WEEKDAYS[at.getUTCDay()]!, day: d };
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function FitBadge({ fit }: { fit: Fit }) {
  switch (fit.kind) {
    case "fits":
      return <span className={styles.fitGood}>✅ Fits your week</span>;
    case "swap":
      return <span className={styles.fitSwap}>🔁 Could replace your {clock(fit.workoutStart)} workout</span>;
    case "clash":
      return <span className={styles.fitBad}>⚠️ Clashes with {fit.with}</span>;
    case "away":
      return <span className={styles.fitBad}>✈️ You&apos;re away that day</span>;
    case "started":
      return <span className={styles.fitMuted}>⏱️ Already started</span>;
  }
}

export function CommunityBoard({ activities, today }: { activities: BoardActivity[]; today: string }) {
  const [sport, setSport] = useState<Sport | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const shown = activities.filter((a) => (!sport || a.sport === sport) && (!day || a.date === day));
  const sports = (Object.keys(SPORTS) as Sport[]).filter((s) => activities.some((a) => a.sport === s));
  const going = activities.reduce((sum, a) => sum + a.joined, 0) + joined.size;
  const fitting = activities.filter((a) => a.fit.kind === "fits" || a.fit.kind === "swap").length;

  const toggle = (id: string) =>
    setJoined((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <section className={n.card}>
        <div className={styles.hero}>
          <div>
            <h2 className={n.cardTitle}>
              👥 Fitness community <span className={styles.previewPill}>Preview</span>
            </h2>
            <p className={styles.lede}>Group workouts with classmates, checked against your week.</p>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <strong>{activities.length}</strong>
              <span>groups this week</span>
            </div>
            <div className={styles.stat}>
              <strong>{going}</strong>
              <span>classmates going</span>
            </div>
            <div className={styles.statHighlight}>
              <strong>{fitting}</strong>
              <span>fit your week</span>
            </div>
          </div>
        </div>

        {/* The week ahead: each day's groups as bubbles; click a day to see just its groups. */}
        <div className={styles.week} role="group" aria-label="Filter by day">
          {days.map((date) => {
            const { weekday, day: num } = dateParts(date);
            const onDay = activities.filter((a) => a.date === date);
            const active = day === date;
            return (
              <button
                key={date}
                className={active ? styles.weekDayActive : styles.weekDay}
                onClick={() => setDay(active ? null : date)}
                aria-pressed={active}
              >
                <span className={styles.weekName}>{date === today ? "Today" : weekday}</span>
                <span className={styles.weekNum}>{num}</span>
                <span className={styles.bubbles}>
                  {onDay.length === 0 ? (
                    <span className={styles.noBubble}>·</span>
                  ) : (
                    onDay.map((a) => (
                      <span key={a.id} className={styles.bubble} style={{ background: SPORTS[a.sport].tint }} title={a.title}>
                        {SPORTS[a.sport].emoji}
                      </span>
                    ))
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.chips} role="group" aria-label="Filter by sport">
          <button className={sport === null ? styles.chipActive : styles.chip} onClick={() => setSport(null)} aria-pressed={sport === null}>
            All
          </button>
          {sports.map((s) => (
            <button key={s} className={sport === s ? styles.chipActive : styles.chip} onClick={() => setSport(sport === s ? null : s)} aria-pressed={sport === s}>
              {SPORTS[s].emoji} {s}
            </button>
          ))}
        </div>
      </section>

      {shown.length === 0 ? (
        <p className={styles.empty}>
          No groups match.{" "}
          <button
            className={styles.linkButton}
            onClick={() => {
              setSport(null);
              setDay(null);
            }}
          >
            Show all
          </button>
        </p>
      ) : (
        <div className={styles.grid}>
          {shown.map((a) => {
            const isIn = joined.has(a.id);
            const count = a.joined + (isIn ? 1 : 0);
            const left = a.spots - count;
            const full = left <= 0 && !isIn;
            const look = SPORTS[a.sport];
            return (
              <article key={a.id} className={isIn ? styles.cardJoined : styles.card}>
                <div className={styles.banner} style={{ background: look.tint }}>
                  <span className={styles.bannerEmoji} aria-hidden="true">
                    {look.emoji}
                  </span>
                  <span className={styles.bannerTags}>
                    <span className={styles.tag} style={{ color: look.ink }}>
                      {a.sport}
                    </span>
                    <span className={styles.tag} style={{ color: look.ink }}>
                      {a.level}
                    </span>
                  </span>
                </div>
                <div className={styles.body}>
                  <h3 className={styles.cardTitle}>{a.title}</h3>
                  <p className={styles.host}>
                    <span className={styles.hostAvatar}>{a.who.replace(/\D/g, "") || "?"}</span>
                    <strong>{a.who}</strong> {a.what}
                  </p>
                  <ul className={styles.facts}>
                    <li>🕔 {a.when}–{clock(a.end)}</li>
                    <li>📍 {a.place}</li>
                  </ul>

                  <div className={styles.signups}>
                    <span className={styles.avatars} aria-hidden="true">
                      {isIn && <span className={styles.avatarYou}>You</span>}
                      {a.going.map((initials) => (
                        <span key={initials} className={styles.avatar}>
                          {initials}
                        </span>
                      ))}
                      {count - a.going.length - (isIn ? 1 : 0) > 0 && <span className={styles.avatarMore}>+{count - a.going.length - (isIn ? 1 : 0)}</span>}
                    </span>
                    <span className={styles.spotsText}>
                      {count}/{a.spots} · {left <= 0 ? "full" : `${left} ${left === 1 ? "spot" : "spots"} left`}
                    </span>
                  </div>
                  <div className={styles.track} aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (count / a.spots) * 100)}%`, background: left <= 2 ? "#f59e0b" : "#0f766e" }} />
                  </div>

                  <div className={styles.footer}>
                    <FitBadge fit={a.fit} />
                    <button className={isIn ? styles.joinedButton : styles.joinButton} onClick={() => toggle(a.id)} disabled={full || a.fit.kind === "started"}>
                      {isIn ? "✓ You're in" : full ? "Full" : "Join"}
                    </button>
                  </div>
                  {isIn && <p className={styles.notSaved}>Preview only: joining isn&apos;t saved yet.</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section>
        <div className={styles.hostPanel}>
          <span className={styles.hostIcon} aria-hidden="true">
            ➕
          </span>
          <div className={styles.hostText}>
            <h3 className={styles.cardTitle}>Host a group workout</h3>
            <p className={styles.lede}>Pick a sport, a place and a time that&apos;s free in your week; classmates who are free then see it first.</p>
            <div className={styles.hostSports}>
              {(Object.keys(SPORTS) as Sport[]).map((s) => (
                <span key={s} className={styles.hostSport}>
                  {SPORTS[s].emoji} {s}
                </span>
              ))}
            </div>
          </div>
          <button className={styles.joinButton} disabled title="Coming soon">
            Coming soon
          </button>
        </div>
      </section>

      <p className={styles.sampleNote}>🧪 These groups are sample data, so the page can be seen before Community exists. Whether each one fits is checked against your real week.</p>
    </>
  );
}
