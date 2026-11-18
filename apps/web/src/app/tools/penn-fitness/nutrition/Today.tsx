"use client";

// Today: the meals logged today, in order, with a summary of the day so far.

import { useState } from "react";
import { formatMinutes, sortMeals, summarizeDay, toMinutes, type LoggedMeal } from "@penntools/tool-penn-fitness";
import styles from "./Nutrition.module.css";

export function Today({
  meals,
  now,
  onRemove,
}: {
  meals: LoggedMeal[];
  /** Minutes after midnight. */
  now: number;
  onRemove: (id: string) => void;
}) {
  const [showCalories, setShowCalories] = useState(false);
  const summary = summarizeDay(meals, now);

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Today</h2>
        {meals.length > 0 && (
          <label className={styles.toggle}>
            <input type="checkbox" checked={showCalories} onChange={(e) => setShowCalories(e.target.checked)} />
            Show calorie estimates
          </label>
        )}
      </div>

      {meals.length === 0 ? (
        <p className={styles.description}>Nothing logged today yet. Add what you&apos;ve eaten with Quick Log.</p>
      ) : (
        <>
          <dl className={styles.stats}>
            <div>
              <dt>Logged</dt>
              <dd>{summary.meals}</dd>
            </div>
            <div>
              <dt>Last ate</dt>
              <dd>
                {summary.lastMealTime && formatClock(summary.lastMealTime)}
                {summary.minutesSinceLastMeal !== null && (
                  <span className={styles.meta}> · {formatDuration(summary.minutesSinceLastMeal)} ago</span>
                )}
              </dd>
            </div>
            <div>
              <dt>With protein</dt>
              <dd>
                {summary.proteinMeals} of {summary.meals}
              </dd>
            </div>
          </dl>

          <div className={styles.results}>
            {sortMeals(meals).map((meal) => (
              <MealCard key={meal.id} meal={meal} showCalories={showCalories} onRemove={() => onRemove(meal.id)} />
            ))}
          </div>
        </>
      )}

      {summary.missing.length > 0 && (
        <p className={styles.nudge}>
          No {joinWords(summary.missing)} logged yet. If you&apos;ve eaten, add it above; if not, it may be a good time for
          something.
        </p>
      )}

      {meals.length > 0 && (
        <p className={styles.disclaimer}>
          Estimates only, not medical or dietary advice. For personal guidance, contact{" "}
          <a href="https://wellness.upenn.edu" className={styles.link} target="_blank" rel="noreferrer">
            Penn Wellness
          </a>
          .
        </p>
      )}
    </section>
  );
}

function MealCard({ meal, showCalories, onRemove }: { meal: LoggedMeal; showCalories: boolean; onRemove: () => void }) {
  return (
    <article className={styles.meal}>
      <header className={styles.mealHeader}>
        <span className={styles.mealType}>{meal.type}</span>
        {meal.time && <span className={styles.meta}>{formatClock(meal.time)}</span>}
        {meal.place && <span className={styles.meta}>· {meal.place}</span>}
        {showCalories && meal.estimatedCalories !== null && (
          <span className={styles.calories}>~{Math.round(meal.estimatedCalories)} kcal</span>
        )}
        <button className={styles.remove} onClick={onRemove} aria-label={`Remove ${meal.type}`} title="Remove">
          ×
        </button>
      </header>
      <ul className={styles.foods}>
        {meal.foods.map((food, i) => (
          <li key={i}>
            {food.name}
            {food.portion && <span className={styles.meta}> ({food.portion})</span>}
          </li>
        ))}
      </ul>
      <div className={styles.chips}>
        <Chip label="Protein" level={meal.protein} />
        <Chip label="Carbs" level={meal.carbs} />
        <Chip label="Fat" level={meal.fat} />
        {meal.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </div>
      {meal.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {meal.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Chip({ label, level }: { label: string; level: LoggedMeal["protein"] }) {
  return (
    <span className={`${styles.chip} ${styles[level]}`}>
      {label}: {level}
    </span>
  );
}

/** "13:05" → "1:05 PM"; anything else is shown as given. */
export function formatClock(time: string): string {
  const minutes = toMinutes(time);
  if (minutes === null) return time;
  const [hours, mins] = formatMinutes(minutes).split(":").map(Number) as [number, number];
  return `${hours % 12 || 12}:${String(mins).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** 95 → "1h 35m"; 20 → "20m". */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** ["breakfast", "lunch"] → "breakfast or lunch". */
function joinWords(words: string[]): string {
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : (words[0] ?? "");
}
