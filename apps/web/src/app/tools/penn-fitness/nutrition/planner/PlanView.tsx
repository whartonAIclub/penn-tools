"use client";

// Step 4: the week's plan. Tips for the week up top, then either one day in
// detail or the whole week at a glance. Flags any meal that lands during a
// commitment.

import { useState } from "react";
import Link from "next/link";
import {
  busyAt,
  DAY_KEYS,
  eatingOutCost,
  DAYS,
  type Day,
  type MacroTargets,
  type MealPlan,
  type PlannedMeal,
  type WeeklySchedule,
} from "@penntools/tool-penn-fitness";
import type { ActionError } from "../actions";
import { formatClock } from "../Today";
import styles from "../Nutrition.module.css";

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

type View = "day" | "week";

/** Today's key in DAYS: Monday is "mon". */
export function todayKey(): Day {
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[new Date().getDay()]!;
}

export function PlanView({
  plan,
  schedule,
  targets,
  planning,
  error,
  preview,
  initialDay,
  onRegenerate,
  onEdit,
}: {
  plan: MealPlan | null;
  schedule: WeeklySchedule;
  /** Daily macro ranges, when the student gave their weight. */
  targets: MacroTargets | null;
  planning: boolean;
  error: ActionError | null;
  preview: boolean;
  /** The day to open on; today by default. */
  initialDay?: Day | undefined;
  onRegenerate: () => void;
  onEdit: () => void;
}) {
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<Day>(() => initialDay ?? todayKey());

  if (planning) {
    return <p className={styles.notice}>Planning your week… this can take up to a minute.</p>;
  }

  const weekSpend = plan ? eatingOutCost(plan.days.flatMap((d) => d.meals)) : 0;

  return (
    <div className={styles.form}>
      {error && (
        <p className={styles.error}>
          {error.message}
          {error.kind && KEY_PROBLEMS.has(error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}
      {preview && plan && <p className={styles.notice}>Preview mode: this is a sample plan for the sample schedule.</p>}

      {plan && (
        <>
          {plan.tips.length > 0 && (
            <section className={styles.tipsCard} aria-label="Tips for the week">
              <h3>💡 Tips for your week</h3>
              <ol>
                {plan.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ol>
            </section>
          )}

          <div className={styles.planBar}>
            <div className={styles.viewToggle} role="tablist" aria-label="View">
              {(["day", "week"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} className={view === v ? styles.viewActive : undefined} onClick={() => setView(v)}>
                  {v === "day" ? "Day" : "Week"}
                </button>
              ))}
            </div>
            <span className={styles.meta}>
              {weekSpend > 0 && `About $${Math.round(weekSpend)} eating out this week`}
              {targets && `${weekSpend > 0 ? " · " : ""}Aiming for ${targets.protein[0]}–${targets.protein[1]} g protein a day`}
            </span>
          </div>

          {view === "day" ? (
            <>
              <div className={styles.dayTabs} role="tablist" aria-label="Day">
                {plan.days.map((d) => (
                  <button
                    key={d.day}
                    role="tab"
                    aria-selected={d.day === day}
                    className={d.day === day ? styles.dayTabActive : styles.dayTab}
                    onClick={() => setDay(d.day)}
                  >
                    {DAYS[d.day].slice(0, 3)}
                  </button>
                ))}
              </div>
              <DayPlan plan={plan} day={day} schedule={schedule} />
            </>
          ) : (
            <WeekPlan
              plan={plan}
              schedule={schedule}
              onPickDay={(d) => {
                setDay(d);
                setView("day");
              }}
            />
          )}

          <p className={styles.disclaimer}>
            Suggestions only, not medical or dietary advice. Check opening hours before you go. For personal guidance,
            contact{" "}
            <a href="https://wellness.upenn.edu" className={styles.link} target="_blank" rel="noreferrer">
              Penn Wellness
            </a>
            .
          </p>
        </>
      )}

      <div className={styles.controls}>
        <button className={styles.secondaryButton} onClick={onEdit}>
          Change my answers
        </button>
        {!preview && (
          <button className={styles.button} onClick={onRegenerate}>
            {plan ? "Make a new plan" : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
}

function DayPlan({ plan, day, schedule }: { plan: MealPlan; day: Day; schedule: WeeklySchedule }) {
  const meals = plan.days.find((d) => d.day === day)?.meals ?? [];
  if (meals.length === 0) return <p className={styles.meta}>Nothing planned for {DAYS[day]}.</p>;
  const spend = eatingOutCost(meals);

  return (
    <div className={styles.results}>
      {meals.map((meal, i) => {
        const clash = busyAt(schedule, day, meal.time);
        return (
          <article key={i} className={styles.meal}>
            <header className={styles.mealHeader}>
              <span className={styles.planTime}>{formatClock(meal.time)}</span>
              <span className={styles.mealType}>{meal.type}</span>
              <SourceBadge source={meal.source} />
              {meal.estimatedCost !== null && <span className={styles.calories}>~${Math.round(meal.estimatedCost)}</span>}
            </header>
            <p className={styles.planName}>{meal.name}</p>
            {meal.proteinG !== null && (
              <p className={styles.meta}>
                P {Math.round(meal.proteinG)} g · C {Math.round(meal.carbsG ?? 0)} g · F {Math.round(meal.fatG ?? 0)} g
              </p>
            )}
            {(meal.place ?? meal.placeType) && <p className={styles.meta}>📍 {meal.place ?? meal.placeType}</p>}
            {clash && <p className={styles.errorText}>Overlaps {clash.label}: move it a little earlier or later.</p>}
          </article>
        );
      })}
      {spend > 0 && <p className={styles.meta}>Eating out on {DAYS[day]}: about ${Math.round(spend)}</p>}
    </div>
  );
}

/** All seven days side by side; a day's name opens it in the day view. */
function WeekPlan({ plan, schedule, onPickDay }: { plan: MealPlan; schedule: WeeklySchedule; onPickDay: (day: Day) => void }) {
  return (
    <div className={styles.weekPlanScroll}>
      <div className={styles.weekPlan}>
        {DAY_KEYS.map((day) => {
          const meals = plan.days.find((d) => d.day === day)?.meals ?? [];
          const spend = eatingOutCost(meals);
          return (
            <div key={day} className={styles.weekPlanDay}>
              <button className={styles.weekPlanDayName} onClick={() => onPickDay(day)} title={`Open ${DAYS[day]}`}>
                {DAYS[day].slice(0, 3)}
              </button>
              {meals.map((meal, i) => (
                <div key={i} className={meal.source === "cook" ? styles.weekMealCook : styles.weekMealOut} title={meal.place ? `${meal.name} at ${meal.place}` : meal.name}>
                  <span className={styles.weekMealTime}>
                    {formatClock(meal.time)}
                    {busyAt(schedule, day, meal.time) && " ⚠"}
                  </span>
                  <span className={styles.weekMealName}>{meal.name}</span>
                </div>
              ))}
              {spend > 0 && <span className={styles.weekPlanSpend}>~${Math.round(spend)} out</span>}
            </div>
          );
        })}
      </div>
      <p className={styles.meta}>
        <span className={styles.legendCook}>■</span> Cook <span className={styles.legendOut}>■</span> Eat out · ⚠ overlaps a
        commitment · Click a day for details.
      </p>
    </div>
  );
}

function SourceBadge({ source }: { source: PlannedMeal["source"] }) {
  return <span className={source === "cook" ? styles.badgeCook : styles.badgeOut}>{source === "cook" ? "Cook" : "Eat out"}</span>;
}
