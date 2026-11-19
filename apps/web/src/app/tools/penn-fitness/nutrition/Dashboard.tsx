"use client";

// The Nutrition dashboard, top to bottom: a greeting; your setup (what the plan
// is built from) with the plan's actions; the next meal in one line; today's
// macros, this week's eating-out money and groceries; then the week and tips.

import { useState } from "react";
import { caloriesEaten, estimatedBurn } from "@penntools/tool-penn-fitness";
import { CalorieCircle } from "../CalorieCircle";
import type { HomeExercise } from "../home";
import home from "../HomeSection.module.css";
import {
  DAY_KEYS,
  DAYS,
  DIETS,
  EATING_STYLES,
  KG_PER_LB,
  ACTIVITY_LEVELS,
  dayTotals,
  findDiningPlan,
  macroTargets,
  nextMeal,
  type Day,
  type LoggedMeal,
  type MacroTargets,
  type MealPlan,
  type NutritionPreferences,
  type PlannedMeal,
  type PlannerProfile,
  type WeeklySchedule,
} from "@penntools/tool-penn-fitness";
import type { ActionError } from "./actions";
import { todayKey } from "./planner/PlanView";
import { formatClock } from "./Today";
import styles from "./Nutrition.module.css";

export type Panel = "about" | "week" | "eating" | "plan" | "groceries" | "log";

const MEAL_EMOJI: Record<PlannedMeal["type"], string> = { breakfast: "🥣", lunch: "🥗", dinner: "🍝", snack: "🍎" };

const CHEERS = [
  "Fuel the grind 💪",
  "Good food, good mood 🌈",
  "Snack smarter, study harder 📚",
  "Your future self says thanks 🙌",
  "Eat well, ace everything ✨",
  "Hydrate, then dominate 💧",
  "Small bites, big wins 🏆",
];

function greeting(now: number) {
  if (now < 12 * 60) return "Good morning";
  if (now < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** "now", "in 45 min", "in 2h 15m", "tomorrow at 8:00 AM" or "Thursday at 12:00 PM". */
function whenText(minutesUntil: number, day: Day, today: Day, time: string) {
  if (day === today) {
    if (minutesUntil < 5) return "now";
    if (minutesUntil < 60) return `in ${minutesUntil} min`;
    return `in ${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`;
  }
  const tomorrow = DAY_KEYS[(DAY_KEYS.indexOf(today) + 1) % 7];
  return `${day === tomorrow ? "tomorrow" : DAYS[day]} at ${formatClock(time)}`;
}

export function Dashboard({
  name,
  preview,
  now,
  plan,
  planning,
  planError,
  planStale,
  profile,
  preferences,
  schedule,
  todaysMeals,
  weekSpent,
  streak,
  groceriesChecked,
  onOpen,
  onSetup,
  onStartOver,
  onAte,
  exercise,
}: {
  name: string | null;
  preview: boolean;
  /** Minutes after midnight. */
  now: number;
  plan: MealPlan | null;
  planning: boolean;
  planError: ActionError | null;
  /** The setup changed since the plan was made. */
  planStale: boolean;
  profile: PlannerProfile | null;
  preferences: NutritionPreferences | null;
  schedule: WeeklySchedule | null;
  todaysMeals: LoggedMeal[];
  /** Dollars logged on meals since Monday. */
  weekSpent: number;
  streak: number;
  groceriesChecked: string[];
  onOpen: (panel: Panel, day?: Day) => void;
  /** Makes (or remakes) the plan, or starts the setup wizard if there's no setup yet. */
  onSetup: () => void;
  onStartOver: () => void;
  onAte: (meal: PlannedMeal) => void;
  /** The homepage's exercise section, after Nutrition's (exercise/ExerciseHome.tsx); none when not given. */
  exercise?: HomeExercise | undefined;
}) {
  const today = todayKey();
  const upcoming = plan ? nextMeal(plan, today, now) : null;
  const targets = profile?.weightKg ? macroTargets(profile.weightKg, profile.activityLevel) : null;
  const totals = dayTotals(todaysMeals);
  const eaten = caloriesEaten(todaysMeals);
  const cheer = CHEERS[new Date().getDate() % CHEERS.length]!;

  return (
    <div className={styles.dashboard}>
      <header className={styles.hero}>
        <div>
          <p className={styles.heroDate}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h2 className={styles.heroTitle}>
            {greeting(now)}
            {name ? `, ${name.split(" ")[0]}` : ""}! 👋
          </h2>
          <p className={styles.heroCheer}>{cheer}</p>
        </div>
        <div className={styles.heroBadges}>
          {streak > 0 && (
            <span className={styles.badge} title="Days in a row with a meal logged">
              🔥 {streak}-day streak
            </span>
          )}
          {preview && <span className={styles.badge}>👀 Preview mode</span>}
        </div>
      </header>

      {/* ── This week: workouts day by day, and the meal plan's status ───── */}
      {(exercise?.weekStrip || planning || !upcoming) && (
        <section className={home.week} aria-label="This week">
          <h3 className={home.weekHeading}>This week</h3>
          {exercise?.weekStrip}
      {planning ? (
        <section className={styles.nextUp}>
          <span className={`${styles.nextUpEmoji} ${styles.spinner}`} aria-hidden="true">
            🍳
          </span>
          <div className={styles.nextUpText}>
            <p className={styles.nextUpName}>Making your plan…</p>
            <p className={styles.nextUpMeta}>This can take up to a minute.</p>
          </div>
        </section>
      ) : !upcoming ? (
        <section className={styles.nextUp}>
          <span className={styles.nextUpEmoji} aria-hidden="true">
            {planError ? "⚠️" : "🗓️"}
          </span>
          <div className={styles.nextUpText}>
            <p className={styles.nextUpName}>{planError ? "That didn't work" : "No meal plan yet"}</p>
            <p className={styles.nextUpMeta}>{planError ? planError.message : "Plan a week of meals around your classes."}</p>
          </div>
          <div className={styles.nextUpActions}>
            <button className={styles.smallPrimary} onClick={onSetup}>
              {planError ? "Try again" : profile ? "Make my plan" : "Get started"}
            </button>
          </div>
        </section>
      ) : null}
        </section>
      )}

      {/* ── Nutrition: today's macros closed, the full dashboard open ─────── */}
      <details className={`${home.fold} ${home.nutrition}`}>
        <summary className={home.summary}>
          <span className={home.icon} aria-hidden="true">
            🥗
          </span>
          <span className={home.text}>
            <span className={home.label}>Nutrition</span>
            <span className={home.title}>Today&apos;s macros</span>
            {!targets && <span className={home.meta}>Add your weight in &quot;About you&quot; for daily targets.</span>}
          </span>
          <span className={home.rings} aria-label={macrosLine(totals, targets)}>
            <Ring label="Protein" grams={totals.proteinG} range={targets?.protein ?? null} color="var(--ring-protein)" />
            <Ring label="Carbs" grams={totals.carbsG} range={targets?.carbs ?? null} color="var(--ring-carbs)" />
            <Ring label="Fat" grams={totals.fatG} range={targets?.fat ?? null} color="var(--ring-fat)" />
          </span>
          <CalorieCircle
            calories={eaten.calories}
            label="eaten today"
            note={eaten.estimated < eaten.logged ? `estimate · ${eaten.estimated} of ${eaten.logged} meals` : "estimate"}
          />
          <button
            className={styles.smallPrimary}
            onClick={(e) => {
              // A button inside the summary would also open or close the section.
              e.preventDefault();
              e.stopPropagation();
              onOpen("log");
            }}
          >
            ✏️ Log a meal
          </button>
          <span className={home.chevron}>
            <span className={home.closed}>Open ▾</span>
            <span className={home.open}>Close ▴</span>
          </span>
        </summary>
        <div className={home.body}>

      {/* ── Next meal, in one line ─────────────────────────────────────────── */}
      {upcoming && !planning && (
        <section className={styles.nextUp} aria-label="Next meal">
          <span className={styles.nextUpEmoji} aria-hidden="true">
            {MEAL_EMOJI[upcoming.meal.type]}
          </span>
          <div className={styles.nextUpText}>
            <p className={styles.nextUpLabel}>
              Next · {upcoming.meal.type} {whenText(upcoming.minutesUntil, upcoming.day, today, upcoming.meal.time)}
            </p>
            <p className={styles.nextUpName}>{upcoming.meal.name}</p>
            <p className={styles.nextUpMeta}>
              {[
                upcoming.meal.source === "cook" ? "🏠 Cook at home" : `📍 ${upcoming.meal.place ?? upcoming.meal.placeType ?? "Eat out"}`,
                upcoming.meal.estimatedCost !== null && `~$${Math.round(upcoming.meal.estimatedCost)}`,
                upcoming.meal.proteinG !== null && `${Math.round(upcoming.meal.proteinG)} g protein`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className={styles.nextUpActions}>
            <button className={styles.smallPrimary} onClick={() => onAte(upcoming.meal)}>
              ✅ I ate this
            </button>
            <button className={styles.linkButton} onClick={() => onOpen("plan", upcoming.day)}>
              See the day →
            </button>
          </div>
        </section>
      )}

      {/* ── Key numbers ───────────────────────────────────────────────────── */}
      <div className={styles.tiles}>
        <MacrosTile totals={totals} targets={targets} onLog={() => onOpen("log")} onAddWeight={() => onOpen("about")} />
        <MoneyTile
          plan={plan}
          budgetPerMeal={preferences?.budgetPerMeal ?? null}
          weekSpent={weekSpent}
          onLog={() => onOpen("log")}
          onSetBudget={() => onOpen("eating")}
        />
        <GroceriesTile plan={plan} checked={groceriesChecked} onOpen={() => onOpen("groceries")} />
      </div>

      {/* ── The week ──────────────────────────────────────────────────────── */}
      {plan && (
        <section className={styles.tile}>
          <div className={styles.cardHeader}>
            <h3 className={styles.tileTitle}>🗓️ Your week</h3>
            <button className={styles.linkButton} onClick={() => onOpen("plan")}>
              Full plan →
            </button>
          </div>
          <div className={styles.weekStrip}>
            {DAY_KEYS.map((day) => {
              const meals = plan.days.find((d) => d.day === day)?.meals ?? [];
              return (
                <button key={day} className={day === today ? styles.stripToday : styles.stripDay} onClick={() => onOpen("plan", day)}>
                  <span className={styles.stripName}>{DAYS[day].slice(0, 3)}</span>
                  <span className={styles.stripEmoji}>{meals.map((m) => MEAL_EMOJI[m.type]).join("") || "—"}</span>
                  <span className={styles.stripCount}>
                    {meals.filter((m) => m.source === "cook").length} 🏠 · {meals.filter((m) => m.source === "eat-out").length} 🍴
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {plan && plan.tips.length > 0 && (
        <section className={styles.tipsCard} aria-label="Tips for the week">
          <h3>💡 Tips for your week</h3>
          <ol>
            {plan.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ol>
        </section>
      )}
        </div>
      </details>

      {/* ── Exercise: the next workout closed, its section open ───────────── */}
      {exercise && (
        <details className={`${home.fold} ${home.exercise}`}>
          <summary className={home.summary} aria-label={exercise.label}>
            <span className={home.icon} aria-hidden="true">
              🏃
            </span>
            <span className={home.labelColumn}>
              <span className={home.label}>Exercise</span>
              <span className={home.title}>Next workout</span>
            </span>
            {exercise.summary}
            {exercise.plannedMinutes > 0 && (
              <CalorieCircle
                calories={estimatedBurn(exercise.plannedMinutes, profile?.weightKg ?? null)}
                label="planned this week"
                note={profile?.weightKg ? "estimate" : "estimate · add weight"}
              />
            )}
            <span className={home.chevron}>
              <span className={home.closed}>Open ▾</span>
              <span className={home.open}>Close ▴</span>
            </span>
          </summary>
          <div className={home.body}>{exercise.details}</div>
        </details>
      )}

      <SetupBar
        preview={preview}
        plan={plan}
        planning={planning}
        planStale={planStale}
        profile={profile}
        preferences={preferences}
        schedule={schedule}
        onOpen={onOpen}
        onSetup={onSetup}
        onStartOver={onStartOver}
        extra={exercise ? [exercise.setup] : []}
      />
    </div>
  );
}

/** "40 of 95–125 g protein · 65 g carbs · 18 g fat": today's macros in one line, against the protein target if set. */
function macrosLine(totals: ReturnType<typeof dayTotals>, targets: MacroTargets | null): string {
  const protein = targets ? `${totals.proteinG} of ${targets.protein[0]}–${targets.protein[1]} g protein` : `${totals.proteinG} g protein`;
  return `${protein} · ${totals.carbsG} g carbs · ${totals.fatG} g fat`;
}

/**
 * What the plan is built from, each part one click from editing, with the
 * plan's actions: update it after a change, remake it, or start over.
 */
function SetupBar({
  preview,
  plan,
  planning,
  planStale,
  profile,
  preferences,
  schedule,
  onOpen,
  onSetup,
  onStartOver,
  extra,
}: {
  preview: boolean;
  plan: MealPlan | null;
  planning: boolean;
  planStale: boolean;
  profile: PlannerProfile | null;
  preferences: NutritionPreferences | null;
  schedule: WeeklySchedule | null;
  onOpen: (panel: Panel) => void;
  onSetup: () => void;
  onStartOver: () => void;
  /** Other halves' setup items (Exercise's), linking to their own pages. */
  extra: HomeExercise["setup"][];
}) {
  const [confirming, setConfirming] = useState(false);
  const hasSetup = profile !== null || preferences !== null || schedule !== null || plan !== null;

  const parts: { panel: Panel; emoji: string; title: string; summary: string }[] = [
    {
      panel: "about",
      emoji: "🙋",
      title: "About you",
      summary: [
        profile?.weightKg ? `${Math.round(profile.weightKg / KG_PER_LB)} lb` : "No weight",
        profile ? ACTIVITY_LEVELS[profile.activityLevel].split(":")[0]!.toLowerCase() : null,
        preferences && preferences.diet !== "none" ? DIETS[preferences.diet] : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      panel: "week",
      emoji: "📅",
      title: "Your week",
      summary: schedule?.length ? `${schedule.length} classes and commitments` : "No classes yet",
    },
    {
      panel: "eating",
      emoji: "🍽️",
      title: "Eating",
      summary: [
        profile ? EATING_STYLES[profile.eatingStyle] : null,
        preferences?.budgetPerMeal != null ? `$${preferences.budgetPerMeal}/meal` : null,
        preferences ? (findDiningPlan(preferences.diningPlan)?.name ?? null) : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Not set",
    },
  ];

  return (
    <section className={styles.setupBar} aria-label="Your setup">
      <div className={styles.setupBarHeader}>
        <h3 className={styles.sectionHeading}>Your setup</h3>
        {hasSetup && !confirming && (
          <button className={styles.textButton} onClick={() => setConfirming(true)}>
            ↺ Start over
          </button>
        )}
      </div>

      <div className={styles.setupChips}>
        {parts.map((part) => (
          <button key={part.panel} className={styles.setupChip} onClick={() => onOpen(part.panel)}>
            <span className={styles.setupChipEmoji} aria-hidden="true">
              {part.emoji}
            </span>
            <span className={styles.setupChipText}>
              <strong>{part.title}</strong>
              <small>{part.summary}</small>
            </span>
            <span className={styles.setupChipEdit} aria-hidden="true">
              ✏️
            </span>
          </button>
        ))}
        {extra.map((part) => (
          <a key={part.href} href={part.href} className={`${styles.setupChip} ${home.setupLink}`}>
            <span className={styles.setupChipEmoji} aria-hidden="true">
              {part.emoji}
            </span>
            <span className={styles.setupChipText}>
              <strong>{part.title}</strong>
              <small>{part.summary}</small>
            </span>
            <span className={styles.setupChipEdit} aria-hidden="true">
              ✏️
            </span>
          </a>
        ))}
      </div>

      {confirming ? (
        <div className={styles.confirmRow} role="alert">
          <p>Clear your setup and plan and start again? Your logged meals, streak and week (shared with Exercise) stay.</p>
          <button
            className={styles.dangerButton}
            onClick={() => {
              setConfirming(false);
              onStartOver();
            }}
          >
            Yes, start over
          </button>
          <button className={styles.ghostButton} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        plan &&
        !planning &&
        (planStale ? (
          <div className={styles.staleBanner} role="status">
            {preview ? (
              <p>
                ✏️ Saved! Preview mode always shows the same sample week. Add an AI key in{" "}
                <a href="/settings" className={styles.link}>
                  Settings
                </a>{" "}
                to get a plan built from your answers.
              </p>
            ) : (
              <>
                <p>✏️ You changed your setup since this plan was made.</p>
                <button className={styles.smallPrimary} onClick={onSetup}>
                  🔄 Update my plan
                </button>
              </>
            )}
          </div>
        ) : (
          !preview && (
            <div className={styles.setupFooter}>
              <span className={styles.meta}>✓ Your plan matches this setup.</span>
              <button className={styles.textButton} onClick={onSetup}>
                🔄 Make a new plan
              </button>
            </div>
          )
        ))
      )}
    </section>
  );
}

function MacrosTile({
  totals,
  targets,
  onLog,
  onAddWeight,
}: {
  totals: ReturnType<typeof dayTotals>;
  targets: MacroTargets | null;
  onLog: () => void;
  onAddWeight: () => void;
}) {
  return (
    <section className={`${styles.tile} ${styles.tileMacros}`}>
      <h3 className={styles.tileTitle}>⚡ Today&apos;s macros</h3>
      <div className={styles.rings}>
        <Ring label="Protein" grams={totals.proteinG} range={targets?.protein ?? null} color="var(--ring-protein)" />
        <Ring label="Carbs" grams={totals.carbsG} range={targets?.carbs ?? null} color="var(--ring-carbs)" />
        <Ring label="Fat" grams={totals.fatG} range={targets?.fat ?? null} color="var(--ring-fat)" />
      </div>
      <div className={styles.tileLinks}>
        <button className={styles.linkButton} onClick={onLog}>
          Log a meal →
        </button>
        {!targets && (
          <button className={styles.linkButton} onClick={onAddWeight}>
            Add your weight for targets →
          </button>
        )}
      </div>
    </section>
  );
}

/** A progress ring: full at the low end of the target range; a ✓ once inside it. */
function Ring({ label, grams, range, color }: { label: string; grams: number; range: [number, number] | null; color: string }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const fraction = range ? Math.min(1, grams / range[0]) : 0;
  const inRange = range !== null && grams >= range[0];
  return (
    <div className={styles.ring}>
      <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          transform="rotate(-90 32 32)"
          className={styles.ringArc}
        />
      </svg>
      <span className={styles.ringValue}>
        {grams}
        <small>g</small>
        {inRange && " ✓"}
      </span>
      <span className={styles.ringLabel}>{label}</span>
      {range && (
        <span className={styles.ringTarget}>
          {range[0]}–{range[1]} g
        </span>
      )}
    </div>
  );
}

/**
 * This week's eating out (Monday to Sunday): what you've spent, from meals you
 * log, against a weekly budget (your per-meal budget times the plan's meals
 * out). Only those two numbers, to keep it simple.
 */
function MoneyTile({
  plan,
  budgetPerMeal,
  weekSpent,
  onLog,
  onSetBudget,
}: {
  plan: MealPlan | null;
  budgetPerMeal: number | null;
  weekSpent: number;
  onLog: () => void;
  onSetBudget: () => void;
}) {
  const mealsOut = plan ? plan.days.flatMap((d) => d.meals).filter((m) => m.source === "eat-out") : [];
  const budget = budgetPerMeal !== null && mealsOut.length > 0 ? budgetPerMeal * mealsOut.length : null;
  const over = budget !== null && weekSpent > budget;

  return (
    <section className={`${styles.tile} ${styles.tileMoney}`}>
      <h3 className={styles.tileTitle}>💸 Eating out this week</h3>
      <p className={styles.bigNumber}>
        ${weekSpent}
        {budget !== null && <span className={styles.bigSuffix}> of ${budget}</span>}
      </p>
      <p className={styles.meta}>{budget !== null ? "spent of your weekly budget" : "spent since Monday"}</p>

      {budget !== null && (
        <>
          <div className={over ? styles.progressOver : styles.progress}>
            <div style={{ width: `${Math.min(100, (weekSpent / budget) * 100)}%` }} />
          </div>
          <p className={styles.tileLine}>
            <strong>{over ? `$${weekSpent - budget} over budget` : `$${budget - weekSpent} left`}</strong>
          </p>
        </>
      )}
      <div className={styles.tileLinks}>
        {budgetPerMeal === null ? (
          <button className={styles.linkButton} onClick={onSetBudget}>
            Set a budget per meal →
          </button>
        ) : (
          <button className={styles.linkButton} onClick={onLog}>
            Log what you spent →
          </button>
        )}
      </div>
    </section>
  );
}

function GroceriesTile({ plan, checked, onOpen }: { plan: MealPlan | null; checked: string[]; onOpen: () => void }) {
  const items = plan?.groceries ?? [];
  const left = items.filter((i) => !checked.includes(i.name));
  return (
    <section className={`${styles.tile} ${styles.tileGroceries}`}>
      <h3 className={styles.tileTitle}>🛒 Groceries</h3>
      {items.length === 0 ? (
        <p className={styles.meta}>{plan ? "Nothing to buy this week 🎉" : "Your list appears once you have a plan."}</p>
      ) : (
        <>
          <p className={styles.bigNumber}>{left.length}</p>
          <p className={styles.meta}>{left.length ? "items left to buy" : "all bought! 🎉"}</p>
          <div className={styles.progress}>
            <div style={{ width: `${((items.length - left.length) / items.length) * 100}%` }} />
          </div>
          {left.length > 0 && <p className={styles.tileLine}>{left.slice(0, 3).map((i) => i.name).join(", ")}{left.length > 3 ? "…" : ""}</p>}
          <button className={styles.linkButton} onClick={onOpen}>
            Open list →
          </button>
        </>
      )}
    </section>
  );
}
