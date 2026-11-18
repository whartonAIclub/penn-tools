"use client";

// Quick Log: describe what you ate, and the meals are added to today. Calls
// quickLog in actions.ts, which calls logMeals in tools/penn-fitness/src/nutrition/.
// Without an API key it runs in preview mode, adding a sample result instead.

import { useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { Meal, MealLog, NutritionPreferences } from "@penntools/tool-penn-fitness";
import { quickLog, type ActionError } from "./actions";
import styles from "./Nutrition.module.css";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; log: MealLog }
  | { state: "error"; error: ActionError };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

export function QuickLog({
  providers,
  labels,
  sampleText,
  sampleLog,
  maxLength,
  preferences,
  onLogged,
}: {
  /** Providers the user has saved keys for; empty means preview mode. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  sampleText: string;
  sampleLog: MealLog;
  maxLength: number;
  preferences: NutritionPreferences | null;
  onLogged: (meals: Meal[]) => void;
}) {
  const preview = providers.length === 0;
  const [provider, setProvider] = useState<AIProvider | undefined>(providers[0]);
  const [text, setText] = useState(preview ? sampleText : "");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function submit() {
    if (!provider) {
      onLogged(sampleLog.meals);
      setStatus({ state: "done", log: sampleLog });
      return;
    }
    setStatus({ state: "loading" });
    try {
      const result = await quickLog(provider, text, preferences);
      if (!result.ok) {
        setStatus({ state: "error", error: result.error });
        return;
      }
      onLogged(result.data.meals);
      setStatus({ state: "done", log: result.data });
      setText("");
    } catch {
      setStatus({ state: "error", error: { message: "Something went wrong. Try again." } });
    }
  }

  const warnings = status.state === "done" ? status.log.meals.flatMap((m) => m.warnings) : [];

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Quick Log</h2>
      <p className={styles.description}>Tell us what you ate, in your own words. We&apos;ll add it to today.</p>

      {preview && (
        <p className={styles.notice}>
          Preview mode: you&apos;ll see a sample. To log your own meals, add an OpenAI or Anthropic key in{" "}
          <Link href="/settings" className={styles.link}>
            Settings
          </Link>
          .
        </p>
      )}

      <textarea
        aria-label="What did you eat?"
        className={styles.textarea}
        rows={3}
        placeholder="e.g. eggs and toast at 9, a burrito bowl from Houston Market for lunch"
        value={text}
        maxLength={maxLength}
        readOnly={preview}
        onChange={(e) => setText(e.target.value)}
      />

      <div className={styles.controls}>
        <button
          className={styles.button}
          onClick={() => void submit()}
          disabled={status.state === "loading" || !text.trim() || (preview && status.state === "done")}
        >
          {status.state === "loading" ? "Logging…" : preview ? (status.state === "done" ? "Sample added" : "Add sample") : "Log it"}
        </button>
        {providers.length > 1 && (
          <select
            aria-label="AI provider"
            className={styles.select}
            value={provider}
            onChange={(e) => setProvider(e.target.value as AIProvider)}
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {labels[p]}
              </option>
            ))}
          </select>
        )}
      </div>

      {status.state === "error" && (
        <p className={styles.error}>
          {status.error.message}
          {status.error.kind && KEY_PROBLEMS.has(status.error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}

      {status.state === "done" && (
        <div className={styles.results}>
          <p className={styles.meta}>
            {status.log.meals.length === 0
              ? "No meals found. Try describing what you ate and roughly when."
              : `Added ${status.log.meals.length} ${status.log.meals.length === 1 ? "item" : "items"} to today.`}
          </p>
          {warnings.length > 0 && (
            <ul className={styles.warnings}>
              {warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
          {status.log.note && <p className={styles.note}>{status.log.note}</p>}
        </div>
      )}
    </section>
  );
}
