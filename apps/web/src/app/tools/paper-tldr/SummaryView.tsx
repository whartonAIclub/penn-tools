"use client";

import type { PaperSummary } from "@penntools/tool-paper-tldr";
import styles from "./SummaryView.module.css";

// The summary laid out like a one-page paper summary: header, claim box, then
// two columns (context, question and method on the left; results and what
// we learned on the right), with related work along the bottom. Lists are
// keyed by position: the model writes their text and can repeat an item.
export default function SummaryView({ summary: s }: { summary: PaperSummary }) {
  return (
    <article className={styles.sheet}>
      <header className={styles.header}>
        <div className={styles.topline}>
          <span className={styles.brand}>PennTools • Paper TL;DR</span>
          <span>{s.field}</span>
        </div>
        <h2 className={styles.title}>{s.title}</h2>
        <p className={styles.authors}>{s.authors}</p>
        {s.venue && <p className={styles.venue}>{s.venue}</p>}
      </header>

      <p className={styles.claim}>
        <strong>The claim in one line.</strong> {s.claim}
      </p>

      <div className={styles.columns}>
        <div className={styles.column}>
          <Section title="Context you need">
            <p>{s.context}</p>
            {s.keyTerms.length > 0 && (
              <dl className={styles.terms}>
                {s.keyTerms.map((t, i) => (
                  <div key={i} className={styles.termRow}>
                    <dt>{t.term}</dt>
                    <dd>{t.definition}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          <Section title="Research question">
            <p className={styles.callout}>
              <strong>{s.researchQuestion}</strong>
              {s.hypothesis && <> {s.hypothesis}</>}
            </p>
          </Section>

          <Section title="Method">
            <p>{s.data}</p>
            <ol className={styles.steps}>
              {s.methodSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </Section>

          {s.keyEquation && (
            <Section title="Key equation">
              <p className={styles.equation}>{s.keyEquation.equation}</p>
              <dl className={styles.terms}>
                {s.keyEquation.symbols.map((sym, i) => (
                  <div key={i} className={styles.termRow}>
                    <dt className={styles.symbol}>{sym.symbol}</dt>
                    <dd>{sym.meaning}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}
        </div>

        <div className={styles.column}>
          <Section title="Key results">
            <ul className={styles.bullets}>
              {s.keyResults.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {s.comparison && s.comparison.columns.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {s.comparison.columns.map((c, i) => (
                        <th key={i}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.comparison.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>
              <strong className={styles.accent}>Takeaway:</strong> {s.takeaway}
            </p>
          </Section>

          <Section title="What we learned">
            <p>{s.whatWeLearned}</p>
            <div className={styles.confidence}>
              <p>
                <strong>How confident to be:</strong> {s.confidence.verdict}
              </p>
              <ul className={styles.plusMinus}>
                {s.confidence.strengths.map((x, i) => (
                  <li key={`plus-${i}`} className={styles.plus}>
                    {x}
                  </li>
                ))}
                {s.confidence.limitations.map((x, i) => (
                  <li key={`minus-${i}`} className={styles.minus}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section title="Open questions (research ideas)">
            <ul className={styles.bullets}>
              {s.openQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      {s.relatedWork.length > 0 && (
        <footer className={styles.footer}>
          <strong className={styles.accent}>Who else works on this:</strong>{" "}
          {s.relatedWork.map((r, i) => (
            <span key={i}>
              {i > 0 && " • "}
              <strong>{r.citation}</strong> ({r.note})
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.h3}>{title}</h3>
      {children}
    </section>
  );
}
