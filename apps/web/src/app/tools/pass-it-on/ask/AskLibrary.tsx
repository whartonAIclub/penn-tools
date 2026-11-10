"use client";

import Link from "next/link";
import { useState } from "react";
import type { AIProvider } from "@penntools/core/ai";
import type { CitedAnswer } from "@penntools/tool-pass-it-on";
import { askLibrary } from "../actions";
import styles from "../PassItOn.module.css";

type Status = { state: "idle" } | { state: "loading" } | { state: "done"; answer: CitedAnswer } | { state: "error"; message: string; settings: boolean };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

export function AskLibrary({
  providers,
  labels,
  tags,
  maxLength,
}: {
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  tags: string[];
  maxLength: number;
}) {
  const [provider, setProvider] = useState(providers[0]!);
  const [question, setQuestion] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function ask() {
    setStatus({ state: "loading" });
    try {
      const result = await askLibrary(provider, question, tag ? [tag] : []);
      setStatus(
        result.ok
          ? { state: "done", answer: result.data }
          : { state: "error", message: result.message, settings: KEY_PROBLEMS.has(result.kind ?? "") || result.message.includes("Settings") },
      );
    } catch {
      setStatus({ state: "error", message: "Something went wrong. Try again.", settings: false });
    }
  }

  return (
    <>
      <form
        className={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <h2 className={styles.heading}>Ask the library</h2>
        <label className={styles.field}>
          Question
          <textarea
            className={styles.textarea}
            value={question}
            maxLength={maxLength}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="When are reimbursement receipts due?"
          />
        </label>
        <div className={styles.row}>
          {tags.length > 0 && (
            <label className={styles.field}>
              Only files tagged
              <select className={styles.select} value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">Any file</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
          {providers.length > 1 && (
            <label className={styles.field}>
              Provider
              <select className={styles.select} value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {labels[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className={styles.row}>
          <button className={styles.button} type="submit" disabled={status.state === "loading" || !question.trim()}>
            {status.state === "loading" ? "Searching…" : "Ask"}
          </button>
        </div>
      </form>

      {status.state === "error" && (
        <p className={styles.error}>
          {status.message}{" "}
          {status.settings && (
            <Link href="/settings" className={styles.link}>
              Open Settings
            </Link>
          )}
        </p>
      )}

      {status.state === "done" &&
        (status.answer.found ? (
          <section className={styles.card}>
            <p className={styles.answer}>{status.answer.answer}</p>
            {status.answer.citations.map((c) => (
              <div key={c.passage.excerptId} className={styles.citation}>
                <p>&ldquo;{c.quote}&rdquo;</p>
                <Link
                  href={`/tools/pass-it-on/library/passage/${c.passage.excerptId}?quote=${encodeURIComponent(c.quote)}`}
                  className={styles.link}
                >
                  {c.passage.filename}
                  {c.passage.meta.page ? `, page ${c.passage.meta.page}` : ""}
                  {c.passage.meta.sheet ? `, sheet ${c.passage.meta.sheet}` : ""}
                </Link>
              </div>
            ))}
          </section>
        ) : (
          <section className={styles.card}>
            <p className={styles.muted}>{status.answer.message}</p>
          </section>
        ))}
    </>
  );
}
