"use client";

// Shown once after a file is loaded: what the tool took each column to be, in
// plain words, so a wrong guess is caught before anyone trusts a chart.

import { useState } from "react";
import { MAX_THEME_SAMPLE, themeSample, type Analysis, type QuestionKind, type Workspace } from "@penntools/tool-feedback-insights";
import { proposeThemes } from "./actions";
import { plural, Short, type AIAccess } from "./shared";
import styles from "./FeedbackInsights.module.css";

const GROUPS: { kind: QuestionKind; one: string; many: string; means: string }[] = [
  { kind: "rating", one: "rating", many: "ratings", means: "averaged and ranked, higher is better" },
  { kind: "scale", one: "number scale", many: "number scales", means: "shown as a spread, with no better end" },
  { kind: "choice", one: "pick-one question", many: "pick-one questions", means: "counted by option" },
  { kind: "multi", one: "checkbox question", many: "checkbox questions", means: "counted by option, several allowed" },
  { kind: "text", one: "written question", many: "written questions", means: "sorted into themes" },
  { kind: "ignore", one: "column left out", many: "columns left out", means: "not shown anywhere" },
];

type Props = {
  ws: Workspace;
  analysis: Analysis;
  removed: string[];
  ai: AIAccess;
  update: (change: (ws: Workspace) => Workspace) => void;
  onNotice: (text: string, tone?: "info" | "bad") => void;
  onFix: () => void;
  onDone: () => void;
};

export function ReadBack({ ws, analysis, removed, ai, update, onNotice, onFix, onDone }: Props) {
  const { questions, timestampColumn } = ws.setup;
  const n = ws.table.rows.length;
  const [suggested, setSuggested] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const noRatings = !questions.some((q) => q.kind === "rating");
  const written = themeSample(analysis, MAX_THEME_SAMPLE);
  const has = (t: string) => ws.setup.themes.some((x) => x.toLowerCase() === t.toLowerCase());
  const add = (themes: string[]) =>
    update((w) => ({ ...w, setup: { ...w.setup, themes: [...w.setup.themes, ...themes.filter((t) => !w.setup.themes.some((x) => x.toLowerCase() === t.toLowerCase()))] } }));
  async function suggest() {
    if (!ai.provider) return;
    setBusy(true);
    try {
      const reply = await proposeThemes(ai.provider, written, ws.setup.themes);
      if (reply.ok) setSuggested(reply.data);
      else onNotice(reply.error.message, "bad");
    } catch {
      onNotice("Something went wrong asking for themes. Try again.", "bad");
    }
    setBusy(false);
  }
  const open = suggested.filter((t) => !has(t));
  return (
    <section className={styles.callout} aria-label="How your file was read">
      <h2 className={styles.h2}>
        Here is how I read your file: {n} {plural(n, "response", "responses")}, {questions.length} {plural(questions.length, "question", "questions")}
      </h2>
      <ul className={styles.list}>
        {GROUPS.map((g) => {
          const found = questions.filter((q) => q.kind === g.kind);
          if (found.length === 0) return null;
          return (
            <li key={g.kind}>
              <strong>
                {found.length} {plural(found.length, g.one, g.many)}
              </strong>{" "}
              <span className={styles.mentions}>({g.means})</span>
              <span className={styles.quote}>
                {found.slice(0, 4).map((q, i) => (
                  <span key={q.column}>
                    {i > 0 && " · "}
                    <Short text={q.label} max={44} />
                  </span>
                ))}
                {found.length > 4 && ` · and ${found.length - 4} more`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className={styles.muted}>
        {timestampColumn
          ? `Each response is identified by its “${timestampColumn}”, but shown to you only as a number.`
          : "The file has no timestamp column, so each response is identified by its row. Keep the rows in the same order if you upload a newer file."}
        {removed.length > 0 &&
          ` ${removed.length} ${plural(removed.length, "column that identifies people was", "columns that identify people were")} removed and not kept: ${removed.join(", ")}.`}
      </p>
      {noRatings && written.length > 0 && (
        <div>
          <p>
            <strong>This survey has no rating questions</strong>, so there is nothing to rank. Themes are how you will see what people said. Start by asking AI to suggest themes from the
            written answers, then keep the ones you like.
          </p>
          {ai.provider ? (
            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={busy} onClick={() => void suggest()}>
                {busy ? "Reading answers…" : "Suggest themes with AI"}
              </button>
              {open.length > 0 && (
                <>
                  {open.map((t) => (
                    <button key={t} type="button" className={styles.buttonSmall} onClick={() => add([t])}>
                      + {t}
                    </button>
                  ))}
                  <button type="button" className={styles.buttonSmall} onClick={() => add(open)}>
                    Add all
                  </button>
                </>
              )}
            </div>
          ) : (
            <p className={styles.muted}>Sign in to use AI, or add your own themes on the Setup tab.</p>
          )}
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.buttonPrimary} onClick={onDone}>
          Looks right
        </button>
        <button type="button" className={styles.button} onClick={onFix}>
          Something is wrong, let me fix it
        </button>
      </div>
    </section>
  );
}
