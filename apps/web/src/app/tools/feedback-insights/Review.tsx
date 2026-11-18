"use client";

// The Needs review tab: responses the checks flagged, for a person to keep or
// exclude. Nothing leaves the numbers until someone presses Exclude here.

import { useState } from "react";
import { responseKey, type CleanResponse, type DecisionKind } from "@penntools/tool-feedback-insights";
import { Badge, type TabProps, type Tone } from "./shared";
import styles from "./FeedbackInsights.module.css";

const STATUS_TONE: Record<CleanResponse["status"], Tone> = { OK: "good", "Needs review": "warn", Kept: "good", Excluded: "bad" };
const ORDER: Record<CleanResponse["status"], number> = { "Needs review": 0, Excluded: 1, Kept: 2, OK: 3 };

export function Review({ ws, analysis, update }: TabProps) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const listed = analysis.responses
    .filter((r) => r.flags.length > 0 || r.status === "Kept" || r.status === "Excluded")
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.number - b.number);
  const questions = ws.setup.questions.filter((q) => q.kind !== "ignore");

  const decide = (r: CleanResponse, decision: DecisionKind | null) =>
    update((w) => {
      const others = w.decisions.filter((d) => responseKey(d.responseId) !== r.id);
      return { ...w, decisions: decision ? [...others, { responseId: r.id, decision, reason: (reasons[r.id] ?? "").trim(), reviewer: "" }] : others };
    });

  if (listed.length === 0) {
    return <p className={styles.empty}>Nothing to review. No response looks like a duplicate, junk, empty or contradictory.</p>;
  }
  return (
    <>
      <p className={styles.muted}>These responses may have a problem. Each one still counts until you exclude it. Keep means “I looked, it&apos;s fine”.</p>
      <ul className={styles.answerList}>
        {listed.map((r) => (
          <li key={r.id} className={styles.answer}>
            <div className={styles.sectionHead}>
              <h3 className={styles.h3}>
                Response {r.number} <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </h3>
            </div>
            {r.flags.length > 0 && (
              <ul className={styles.list}>
                {r.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {r.reason && <p className={styles.muted}>Reason given: {r.reason}</p>}
            <details className={styles.details}>
              <summary>See this response&apos;s answers</summary>
              <dl className={styles.answers}>
                {questions.map((q) => {
                  const value = r.values[q.column];
                  const text = Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
                  return (
                    <div key={q.column}>
                      <dt>{q.label}</dt>
                      <dd>
                        {text || <span className={styles.muted}>(blank)</span>}
                        {r.unrecognized.includes(q.column) && (
                          <span className={styles.quote}>Not recognized, as typed: {ws.table.rows[r.number - 1]?.[q.column]}</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </details>
            {r.status === "Needs review" ? (
              <div className={styles.actions}>
                <input
                  className={styles.input}
                  aria-label={`Reason for response ${r.number} (optional)`}
                  placeholder="Reason (optional)"
                  value={reasons[r.id] ?? ""}
                  onChange={(e) => setReasons((all) => ({ ...all, [r.id]: e.target.value }))}
                />
                <button type="button" className={styles.button} onClick={() => decide(r, "Keep")}>
                  Keep
                </button>
                <button type="button" className={styles.buttonDanger} onClick={() => decide(r, "Exclude")}>
                  Exclude
                </button>
              </div>
            ) : (
              <div className={styles.actions}>
                <button type="button" className={styles.buttonSmall} onClick={() => decide(r, null)}>
                  Undo decision
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
