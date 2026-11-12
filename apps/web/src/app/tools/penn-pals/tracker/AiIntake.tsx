"use client";

// "Tell us about your chat": the user writes (or dictates) what happened, the
// AI asks up to three questions about what's missing, then fills in the form
// below for the user to check and save. At most two AI calls; skipping the
// questions uses the first answer and costs nothing more.

import { useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import { MAX_STORY_LENGTH, type ContactDraft } from "@penntools/tool-penn-pals";
import { readChat, type IntakeResult } from "./actions";
import styles from "./Tracker.module.css";

export interface AiAccess {
  signedIn: boolean;
  /** Providers the user has saved keys for; empty when none. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
}

type Status =
  | { state: "idle" }
  | { state: "reading" }
  | { state: "asking"; draft: ContactDraft; questions: string[]; answers: string[]; tokens: number }
  | { state: "finishing"; tokens: number }
  | { state: "done"; tokens: number }
  | { state: "error"; message: string; keyProblem: boolean };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

const PLACEHOLDER =
  "e.g. Had coffee with Maria Chen yesterday, she's a PM at Stripe and a Wharton alum. Super friendly. Her best advice: lead every story with one metric. She offered to introduce me to her manager.";

export function AiIntake({
  ai,
  onFilled,
  onTyping,
}: {
  ai: AiAccess;
  /** Called with the form's fields once the AI is done. */
  onFilled: (draft: ContactDraft) => void;
  /** Whether there's text the user would lose by leaving. */
  onTyping: (hasText: boolean) => void;
}) {
  const [provider, setProvider] = useState<AIProvider | undefined>(ai.providers[0]);
  const [story, setStory] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  if (!ai.signedIn || !provider) {
    return (
      <section className={styles.ai} aria-labelledby="ai-title">
        <h2 id="ai-title" className={styles.aiTitle}>
          ✨ Tell us about your chat
        </h2>
        <p className={styles.aiNote}>
          {!ai.signedIn ? (
            <>Sign in with the button at the top right to have AI fill in the form for you.</>
          ) : (
            <>
              To have AI fill in the form for you, add an AI key in <Link href="/settings">Settings</Link>.
            </>
          )}{" "}
          Or fill it in yourself below.
        </p>
      </section>
    );
  }

  function fail(result: Extract<IntakeResult, { ok: false }>) {
    setStatus({ state: "error", message: result.error.message, keyProblem: KEY_PROBLEMS.has(result.error.kind ?? "") });
  }

  function finish(draft: ContactDraft, tokens: number) {
    onFilled(draft);
    onTyping(false); // the story is now in the form, which asks before leaving
    setStatus({ state: "done", tokens });
  }

  async function read() {
    setStatus({ state: "reading" });
    try {
      const result = await readChat(provider!, story);
      if (!result.ok) return fail(result);
      if (result.questions.length === 0) return finish(result.draft, result.tokens);
      setStatus({
        state: "asking",
        draft: result.draft,
        questions: result.questions,
        answers: result.questions.map(() => ""),
        tokens: result.tokens,
      });
    } catch {
      setStatus({ state: "error", message: "Something went wrong. Try again.", keyProblem: false });
    }
  }

  async function answer(s: Extract<Status, { state: "asking" }>) {
    // Nothing answered: use the first reply, no second call.
    if (s.answers.every((a) => !a.trim())) return finish(s.draft, s.tokens);
    setStatus({ state: "finishing", tokens: s.tokens });
    try {
      const result = await readChat(
        provider!,
        story,
        s.questions.map((question, i) => ({ question, answer: s.answers[i] ?? "" })),
      );
      if (!result.ok) return fail(result);
      finish(result.draft, s.tokens + result.tokens);
    } catch {
      setStatus({ state: "error", message: "Something went wrong. Try again.", keyProblem: false });
    }
  }

  function startOver() {
    setStory("");
    onTyping(false);
    setStatus({ state: "idle" });
  }

  const busy = status.state === "reading" || status.state === "finishing";

  return (
    <section className={styles.ai} aria-labelledby="ai-title">
      <h2 id="ai-title" className={styles.aiTitle}>
        ✨ Tell us about your chat
      </h2>

      {status.state === "done" ? (
        <p className={styles.aiDone}>
          ✓ Filled in below from your story. Check everything before saving.{" "}
          <button type="button" className={styles.link} onClick={startOver}>
            Start over
          </button>
          <span className={styles.aiUsage}> · {status.tokens.toLocaleString()} AI tokens used</span>
        </p>
      ) : status.state === "asking" ? (
        <div className={styles.aiQuestions}>
          <p className={styles.aiNote}>A few quick questions. Skip any you don&apos;t know.</p>
          {status.questions.map((question, i) => (
            <label key={question} className={styles.field}>
              {question}
              <input
                value={status.answers[i]}
                onChange={(e) =>
                  setStatus({ ...status, answers: status.answers.map((a, j) => (j === i ? e.target.value : a)) })
                }
                autoFocus={i === 0}
              />
            </label>
          ))}
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={() => void answer(status)}>
              Fill in the form
            </button>
            <button type="button" className={styles.link} onClick={() => finish(status.draft, status.tokens)}>
              Skip questions
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.aiNote}>
            Who you talked to, what they said, what they offered. Type it or dictate it (press Fn twice on a Mac).
          </p>
          <textarea
            aria-label="What happened in your chat"
            rows={5}
            className={styles.aiStory}
            value={story}
            maxLength={MAX_STORY_LENGTH}
            placeholder={PLACEHOLDER}
            disabled={busy}
            onChange={(e) => {
              setStory(e.target.value);
              onTyping(Boolean(e.target.value.trim()));
            }}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={busy || !story.trim()} onClick={() => void read()}>
              {busy ? "Reading your story…" : "Fill in the form"}
            </button>
            {ai.providers.length > 1 && (
              <select aria-label="AI provider" value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                {ai.providers.map((p) => (
                  <option key={p} value={p}>
                    {ai.labels[p]}
                  </option>
                ))}
              </select>
            )}
            <span className={styles.aiUsage}>
              {story.length.toLocaleString()} / {MAX_STORY_LENGTH.toLocaleString()}
            </span>
          </div>
          {status.state === "error" && (
            <p className={styles.aiError}>
              {status.message}
              {status.keyProblem && (
                <>
                  {" "}
                  <Link href="/settings">Open Settings</Link>
                </>
              )}
            </p>
          )}
        </>
      )}
      {status.state === "finishing" && <p className={styles.aiNote}>Filling in the form…</p>}
    </section>
  );
}
