"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { PaperSummary } from "@penntools/tool-paper-tldr";
import type { SummaryResult } from "./types";
import { extractPdfText } from "./extractText";
import SummaryView from "./SummaryView";
import styles from "./PaperTldr.module.css";

const MAX_MB = 20;

type Status = "idle" | "reading" | "summarizing";

const KEY_ERRORS = new Set(["missing_key", "invalid_key", "no_credit", "credit_used"]);

/** Sends the paper's text to the tool's route (not a server action: those refuse requests over 1 MB). */
async function simplifyPaper(provider: AIProvider, text: string): Promise<SummaryResult> {
  const res = await fetch("/tools/paper-tldr/simplify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, text }),
  });
  if (res.status === 401) {
    return { ok: false, error: { message: "Sign in with the button at the top right to simplify a paper." } };
  }
  try {
    return (await res.json()) as SummaryResult;
  } catch {
    return { ok: false, error: { message: "Something went wrong on our end. Try again in a moment." } };
  }
}

const SECTIONS = [
  "The claim in one line",
  "Context and key terms",
  "Research question",
  "Method",
  "Key equation",
  "Key results",
  "How confident to be",
  "Open questions",
];

interface Props {
  signedIn: boolean;
  /** Providers the user has saved a key for. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
}

export default function PaperTldr({ signedIn, providers, labels }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyProblem, setKeyProblem] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [provider, setProvider] = useState<AIProvider | undefined>(
    providers[0],
  );
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [seconds, setSeconds] = useState(0);

  const ready = signedIn && provider !== undefined;
  const busy = status !== "idle";

  // Elapsed time while the summary is being written, so a long wait reads as progress.
  useEffect(() => {
    if (status !== "summarizing") return;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  async function simplify() {
    if (!file || !provider) return;
    setError(null);
    setKeyProblem(false);
    setSummary(null);
    try {
      setStatus("reading");
      let text: string;
      try {
        text = await extractPdfText(file);
      } catch (err) {
        console.error("Paper TL;DR: reading the PDF failed", err);
        setError("We couldn't read that PDF. Try again, or try a different file.");
        return;
      }
      setStatus("summarizing");
      const result = await simplifyPaper(provider, text);
      if (result.ok) {
        setSummary(result.summary);
        requestAnimationFrame(() =>
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        );
      } else {
        setError(result.error.message);
        setKeyProblem(KEY_ERRORS.has(result.error.kind ?? ""));
      }
    } catch (err) {
      console.error("Paper TL;DR: the summary request failed", err);
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setStatus("idle");
    }
  }

  function choose(f: File | undefined) {
    if (!f) return;
    if (
      f.type !== "application/pdf" &&
      !f.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Paper TL;DR reads PDF files.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`PDFs can be up to ${MAX_MB} MB.`);
      return;
    }
    setError(null);
    setKeyProblem(false);
    setSummary(null);
    setFile(f);
  }

  function reset() {
    setFile(null);
    setSummary(null);
    setError(null);
    setKeyProblem(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Paper TL;DR</p>
          <h1 className={styles.title}>Penn research, in plain language.</h1>
          <p className={styles.lede}>
            Upload a paper by a Penn professor. Get a one-page summary.
          </p>
        </header>

        {/* ── Upload ───────────────────────────────────────────── */}
        <section className={styles.card} aria-label="Upload a paper">
          <div
            className={`${styles.drop} ${dragging ? styles.dropActive : ""} ${file ? styles.dropFilled : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) choose(e.dataTransfer.files[0]);
            }}
          >
            {file ? (
              <div className={styles.fileRow}>
                <span className={styles.fileBadge} aria-hidden="true">
                  PDF
                </span>
                <div className={styles.fileInfo}>
                  <p className={styles.fileName}>{file.name}</p>
                  <p className={styles.fileMeta}>
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.dropButton}
                onClick={() => inputRef.current?.click()}
              >
                <svg
                  className={styles.dropIcon}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className={styles.dropTitle}>
                  Drop a PDF here, or click to choose one
                </span>
                <span className={styles.dropHint}>Up to {MAX_MB} MB</span>
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className={styles.hidden}
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <div className={styles.actions}>
            {providers.length > 1 && (
              <label className={styles.provider}>
                Model
                <select
                  value={provider}
                  disabled={busy}
                  onChange={(e) => setProvider(e.target.value as AIProvider)}
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {labels[p]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className={styles.primary}
              disabled={!file || !ready || busy}
              onClick={simplify}
            >
              {busy ? (
                <span className={styles.spinner} aria-hidden="true" />
              ) : null}
              {busy ? "Working…" : "Simplify paper"}
            </button>
          </div>

          {busy && (
            <ol className={styles.progress} aria-live="polite">
              <li
                className={
                  status === "reading"
                    ? styles.progressActive
                    : styles.progressDone
                }
              >
                Reading the PDF
              </li>
              <li
                className={
                  status === "summarizing"
                    ? styles.progressActive
                    : styles.progressTodo
                }
              >
                Writing your summary
                {status === "summarizing" && (
                  <span className={styles.timer}>
                    {formatTime(seconds)} · usually 1–2 min
                  </span>
                )}
              </li>
            </ol>
          )}

          {error ? (
            <p className={styles.error} role="alert">
              {error}
              {keyProblem && (
                <>
                  {" "}
                  Check your key in{" "}
                  <Link href="/settings" className={styles.link}>
                    Settings
                  </Link>
                  .
                </>
              )}
            </p>
          ) : !signedIn ? (
            <p className={styles.note}>
              Sign in with the button at the top right to simplify a paper.
            </p>
          ) : !provider ? (
            <p className={styles.note}>
              You&apos;ve used your free AI credit. Add an OpenAI or Anthropic
              key in{" "}
              <Link href="/settings" className={styles.link}>
                Settings
              </Link>
              .
            </p>
          ) : !busy ? (
            <p className={styles.note}>
              Your PDF stays in your browser. Only its text goes to{" "}
              {labels[provider]}.
            </p>
          ) : null}
        </section>

        {/* ── Result ───────────────────────────────────────────── */}
        {summary && (
          <section
            ref={resultRef}
            aria-label="Your summary"
            className={styles.result}
          >
            <div className={styles.resultBar}>
              <h2 className={styles.h2}>Your summary</h2>
              <button
                type="button"
                className={styles.secondary}
                onClick={reset}
              >
                Simplify another paper
              </button>
            </div>
            <SummaryView summary={summary} />
            <p className={styles.footnote}>
              Written by AI from the paper&apos;s text. Check the original
              before you cite it.
            </p>
          </section>
        )}

        {/* ── What's in a summary ──────────────────────────────── */}
        <section className={styles.panel}>
          <h2 className={styles.h2}>Breaking down the research into:</h2>
          <ol className={styles.parts}>
            {SECTIONS.map((name, i) => (
              <li key={name} className={styles.part}>
                <span className={styles.partNum}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {name}
              </li>
            ))}
          </ol>
        </section>

        {/* ── Example ──────────────────────────────────────────── */}
        <section className={styles.panel}>
          <h2 className={styles.h2}>Example</h2>
          <figure className={styles.example}>
            <div className={styles.sheet} aria-hidden="true">
              <p className={styles.sheetTop}>Statistics • Causal inference</p>
              <p className={styles.sheetTitle}>
                Beyond Reweighting: On the Predictive Role of Covariate Shift in
                Effect Generalization
              </p>
              <p className={styles.sheetAuthors}>
                Ying Jin (Wharton), Naoki Egami (MIT), Dominik Rothenhäusler
                (Stanford)
              </p>
              <p className={styles.sheetClaim}>
                <strong>The claim in one line.</strong> The unmeasured part of
                the difference between two study populations is usually no
                bigger than the measured part, so the measured part can set
                honest, narrow error bars.
              </p>
              <div className={styles.sheetCols}>
                {[
                  ["Context you need", "Research question", "Method"],
                  ["Key results", "What we learned", "Open questions"],
                ].map((col, c) => (
                  <div key={c}>
                    {col.map((h) => (
                      <div key={h} className={styles.sheetBlock}>
                        <p className={styles.sheetH}>{h}</p>
                        <span className={styles.sheetLine} />
                        <span className={styles.sheetLine} />
                        <span
                          className={`${styles.sheetLine} ${styles.sheetLineShort}`}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <figcaption className={styles.caption}>
              <strong>46 pages → 1 page.</strong> A PNAS paper with a Wharton
              co-author.
            </figcaption>
          </figure>
        </section>
      </div>
      <p className={styles.credit}>
        Background: Claude Monet, Water Lilies (1906)
      </p>
    </div>
  );
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
