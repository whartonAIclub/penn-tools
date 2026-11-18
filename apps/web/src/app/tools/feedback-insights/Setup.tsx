"use client";

// The Setup tab: correct what the tool guessed about each question, manage
// themes and thresholds, and move tags and decisions in and out as files.

import { useRef, useState } from "react";
import {
  decisionsFromCsv,
  decisionsToCsv,
  MAX_FILE_BYTES,
  QUESTION_KINDS,
  responseKey,
  setQuestionKind,
  tagsFromCsv,
  tagsToCsv,
  toCsv,
  workspaceToJson,
  type Question,
  type QuestionKind,
  type Setup as SetupData,
} from "@penntools/tool-feedback-insights";
import { applyPreset, matchPreset } from "@penntools/tool-feedback-insights";
import { useThemeSuggestions } from "./useThemeSuggestions";
import { Short, type AIAccess, type TabProps } from "./shared";
import { download, slug } from "./storage";
import styles from "./FeedbackInsights.module.css";

const KIND_LABELS: Record<QuestionKind, string> = {
  rating: "Rating (higher is better)",
  scale: "Scale (no better end)",
  choice: "Pick one",
  multi: "Checkboxes",
  text: "Written answer",
  ignore: "Ignore",
};

function detail(q: Question): string {
  if (q.kind === "rating" || q.kind === "scale") return q.labels.length ? `${q.labels[0]} to ${q.labels[q.labels.length - 1]}` : `${q.min} to ${q.max}`;
  if (q.kind === "choice" || q.kind === "multi") return `${q.options.length} ${q.options.length === 1 ? "option" : "options"}`;
  if (q.kind === "text") return "Gets tagged";
  return "Not shown";
}

/** A number box that only saves a sensible number. */
function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onSave,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  onSave: (n: number | null) => void;
}) {
  // The typed text is kept as it is while the field has focus; it is saved once it's a valid number, and put back on blur if it isn't.
  const [text, setText] = useState<string | null>(null);
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.input}
        type="number"
        min={min}
        max={max}
        step={step}
        value={text ?? value ?? ""}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value === "") return onSave(null);
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) onSave(n);
        }}
        onBlur={() => setText(null)}
      />
    </label>
  );
}

function WordList({ label, words, onSave }: { label: string; words: string[]; onSave: (words: string[]) => void }) {
  const [text, setText] = useState(words.join(", "));
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onSave([
            ...new Set(
              text
                .split(",")
                .map((w) => w.trim().toLowerCase())
                .filter(Boolean),
            ),
          ])
        }
      />
    </label>
  );
}

export function Setup({ ws, analysis, update, ai, onNotice }: TabProps & { ai: AIAccess; onNotice: (text: string, tone?: "info" | "bad") => void }) {
  const [newTheme, setNewTheme] = useState("");
  const tagsInput = useRef<HTMLInputElement>(null);
  const decisionsInput = useRef<HTMLInputElement>(null);
  const { setup } = ws;
  const set = (change: Partial<SetupData>) => update((w) => ({ ...w, setup: { ...w.setup, ...change } }));
  const { open: suggested, suggesting, suggest, add, has, canSuggest } = useThemeSuggestions(ws, analysis, ai, update, onNotice);
  const addTheme = (theme: string) => add([theme]);
  const preset = matchPreset(ws.table);
  const presetMissing = preset ? preset.themes.some((t) => !has(t)) : false;
  const used = new Set(analysis.comments.map((c) => c.theme.toLowerCase()));
  async function importFile(file: File | undefined, kind: "tags" | "decisions") {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return onNotice("That file is over 5 MB, which is more than this tool can open.", "bad");
    const text = await file.text();
    if (kind === "tags") {
      const { items, notes } = tagsFromCsv(text, ws.tags);
      if (items.length) update((w) => ({ ...w, tags: [...w.tags, ...items] }));
      onNotice(
        [items.length ? `Added ${items.length} tags. Any that repeat a tag you already had are counted once.` : "", ...notes].filter(Boolean).join(" ") ||
          "That file has no tags in it.",
        items.length ? "info" : "bad",
      );
    } else {
      const { items, notes } = decisionsFromCsv(text);
      if (items.length) {
        const incoming = new Set(items.map((d) => responseKey(d.responseId)));
        update((w) => ({ ...w, decisions: [...w.decisions.filter((d) => !incoming.has(responseKey(d.responseId))), ...items] }));
      }
      onNotice(
        [items.length ? `Loaded ${items.length} decisions.` : "", ...notes].filter(Boolean).join(" ") || "That file has no decisions in it.",
        items.length ? "info" : "bad",
      );
    }
  }

  const name = slug(ws.name);
  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.h2}>This survey</h2>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            Name
            <input className={styles.input} value={ws.name} maxLength={80} onChange={(e) => update((w) => ({ ...w, name: e.target.value }))} />
          </label>
          <NumberField
            label="How many people were asked (for the response rate)"
            value={setup.cohortSize}
            min={1}
            max={100000}
            onSave={(n) => set({ cohortSize: n })}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Themes</h2>
        <p className={styles.muted}>
          Every tag gets one theme. A theme named exactly like a rating question is ranked using that rating, which is why your rating questions start out as
          themes.
        </p>
        {preset && presetMissing && (
          <p className={styles.actions}>
            <span className={styles.muted}>This looks like the {preset.name}.</span>
            <button type="button" className={styles.buttonSmall} onClick={() => update((w) => ({ ...w, setup: applyPreset(w.setup, preset) }))}>
              Add its themes
            </button>
          </p>
        )}
        <ul className={styles.chips}>
          {setup.themes.map((t) => (
            <li key={t} className={styles.chip}>
              {t}
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remove theme ${t}`}
                title={used.has(t.toLowerCase()) ? "In use: its tags will be reported as having an unknown theme" : "Remove"}
                onClick={() => set({ themes: setup.themes.filter((x) => x !== t) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className={styles.actions}
          onSubmit={(e) => {
            e.preventDefault();
            addTheme(newTheme);
            setNewTheme("");
          }}
        >
          <input
            className={styles.input}
            aria-label="New theme"
            placeholder="New theme"
            value={newTheme}
            maxLength={40}
            onChange={(e) => setNewTheme(e.target.value)}
          />
          <button type="submit" className={styles.button} disabled={!newTheme.trim() || has(newTheme)}>
            Add theme
          </button>
          {ai.provider && canSuggest && (
            <button type="button" className={styles.button} disabled={suggesting} onClick={() => void suggest()}>
              {suggesting ? "Reading answers…" : "Suggest themes with AI"}
            </button>
          )}
        </form>
        {suggested.length > 0 && (
          <p className={styles.actions}>
            <span className={styles.muted}>Suggested:</span>
            {suggested
              .map((s) => (
                <button key={s} type="button" className={styles.buttonSmall} onClick={() => addTheme(s)}>
                  + {s}
                </button>
              ))}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Questions</h2>
        <p className={styles.muted}>
          The tool guessed what each column holds. Change any that are wrong.
          {setup.timestampColumn
            ? ` Responses are identified by the “${setup.timestampColumn}” column.`
            : " There is no timestamp column, so responses are identified by their row."}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Question</th>
                <th>Type</th>
                <th>Read as</th>
              </tr>
            </thead>
            <tbody>
              {setup.questions.map((q) => (
                <tr key={q.column}>
                  <td data-label="Question">
                    <Short text={q.label} max={90} />
                    {q.group && (
                      <span className={styles.quote}>
                        <Short text={q.group} max={70} />
                      </span>
                    )}
                  </td>
                  <td data-label="Type">
                    <select
                      className={styles.select}
                      aria-label={`Type of ${q.label}`}
                      value={q.kind}
                      onChange={(e) => update((w) => ({ ...w, setup: setQuestionKind(w.setup, w.table, q.column, e.target.value as QuestionKind) }))}
                    >
                      {QUESTION_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Read as" className={styles.muted}>
                    {detail(q)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Thresholds</h2>
        <div className={styles.fieldRow}>
          <NumberField
            label="Mark a rating Low under (out of 5)"
            value={setup.flagBelow}
            min={1}
            max={5}
            step={0.1}
            onSave={(n) => n != null && set({ flagBelow: n })}
          />
          <NumberField label="Warn when fewer responses than" value={setup.lowSample} min={0} max={1000} onSave={(n) => n != null && set({ lowSample: n })} />
          <NumberField
            label="Same answers within this many minutes is a likely duplicate"
            value={setup.duplicateMinutes}
            min={0}
            max={10080}
            onSave={(n) => n != null && set({ duplicateMinutes: n })}
          />
          <NumberField
            label="Rating gap for themes with no rating"
            value={setup.noRatingGap}
            min={0}
            max={4}
            step={0.1}
            onSave={(n) => n != null && set({ noRatingGap: n })}
          />
        </div>
        <div className={styles.fieldRow}>
          <WordList
            key={`b${setup.blankValues.join()}`}
            label="Answers treated as blank"
            words={setup.blankValues}
            onSave={(blankValues) => set({ blankValues })}
          />
          <WordList
            key={`n${setup.nonAnswers.join()}`}
            label="Answers that need no tag"
            words={setup.nonAnswers}
            onSave={(nonAnswers) => set({ nonAnswers })}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Files</h2>
        <p className={styles.muted}>
          Save a copy holds everything and is the way to hand this survey to someone else. The CSV files use the same columns as a “Coded” and “Review” sheet,
          if your team keeps those.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => download(`${name}-workspace.json`, workspaceToJson(ws), "application/json")}>
            Save a copy
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={ws.tags.length === 0}
            onClick={() => download(`${name}-tags.csv`, tagsToCsv(ws.tags), "text/csv")}
          >
            Export tags (.csv)
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={ws.decisions.length === 0}
            onClick={() => download(`${name}-review.csv`, decisionsToCsv(ws.decisions), "text/csv")}
          >
            Export decisions (.csv)
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={analysis.recommendations.length === 0}
            onClick={() =>
              download(
                `${name}-recommendations.csv`,
                toCsv(
                  ["rank", "theme", "main_problem", "people", "rating_out_of_5", "most_suggested_fix", "priority_1_to_5", "score", "example"],
                  analysis.recommendations.map((r) => ({
                    rank: r.rank,
                    theme: r.theme,
                    main_problem: r.problem,
                    people: r.people,
                    rating_out_of_5: r.rating,
                    most_suggested_fix: r.fix,
                    priority_1_to_5: r.priority,
                    score: r.score,
                    example: r.quote,
                  })),
                ),
                "text/csv",
              )
            }
          >
            Export recommendations (.csv)
          </button>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => tagsInput.current?.click()}>
            Import tags (.csv)
          </button>
          <button type="button" className={styles.button} onClick={() => decisionsInput.current?.click()}>
            Import decisions (.csv)
          </button>
          {ws.skipped.length > 0 && (
            <button type="button" className={styles.button} onClick={() => update((w) => ({ ...w, skipped: [] }))}>
              Bring back {ws.skipped.length} “nothing to tag” {ws.skipped.length === 1 ? "answer" : "answers"}
            </button>
          )}
          <input
            ref={tagsInput}
            type="file"
            accept=".csv,text/csv"
            className={styles.hidden}
            onChange={(e) => {
              void importFile(e.target.files?.[0], "tags");
              e.target.value = "";
            }}
          />
          <input
            ref={decisionsInput}
            type="file"
            accept=".csv,text/csv"
            className={styles.hidden}
            onChange={(e) => {
              void importFile(e.target.files?.[0], "decisions");
              e.target.value = "";
            }}
          />
        </div>
      </section>
    </>
  );
}
