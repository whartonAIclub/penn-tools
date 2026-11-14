"use client";

// Quick capture, at the top of the add form: the user jots a note about who
// they just met, and draftFromNote in actions.ts asks the AI API to fill in the
// form from it. Nothing is saved until the user checks the form and saves.

import { useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { ContactDraft } from "@penntools/tool-keepintouch";
import { draftFromNote } from "./actions";
import { localToday } from "./helpers";
import styles from "./KeepInTouch.module.css";

/** AI errors the user fixes in Settings. */
const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

const EXAMPLE =
  "e.g. Met Sarah Chen at the Goldman TMT coffee chat. VP, Wharton '15, into climate tech. Offered to intro me to her team, follow up in 2 weeks.";

export function QuickCapture({
  providers,
  labels,
  maxLength,
  onDraft,
}: {
  /** Providers the user has saved a key for; without any, this suggests Settings. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  maxLength: number;
  onDraft: (draft: ContactDraft) => void;
}) {
  const [note, setNote] = useState("");
  const [provider, setProvider] = useState<AIProvider>(providers[0] ?? "openai");
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<{ message: string; settings: boolean } | null>(null);

  if (providers.length === 0) {
    return (
      <p className={styles.hint}>
        Save an OpenAI or Anthropic API key in{" "}
        <Link href="/settings" className={styles.link}>
          Settings
        </Link>{" "}
        to fill in this form from a quick note.
      </p>
    );
  }

  async function fill() {
    if (busy || !note.trim()) return;
    setBusy(true);
    setFilled(false);
    setError(null);
    try {
      const result = await draftFromNote(provider, note, localToday());
      if (result.ok) {
        onDraft(result.data);
        setFilled(true);
      } else {
        setError({ message: result.error, settings: result.kind !== undefined && KEY_PROBLEMS.has(result.kind) });
      }
    } catch {
      setError({ message: "Something went wrong. Try again.", settings: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.capture}>
      <label className={styles.field}>
        Quick note
        <textarea
          className={styles.input}
          rows={3}
          autoFocus
          placeholder={EXAMPLE}
          maxLength={maxLength}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setFilled(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void fill();
            }
          }}
        />
      </label>
      <div className={styles.captureRow}>
        <button type="button" className={styles.secondary} onClick={() => void fill()} disabled={busy || !note.trim()}>
          {busy ? "Filling in…" : "Fill in the form"}
        </button>
        {providers.length > 1 && (
          <select
            aria-label="AI provider"
            className={styles.input}
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
        <span className={styles.hint} role="status">
          {filled ? "Filled in below. Check it, then save." : `Uses your ${labels[provider]} key · Ctrl+Enter`}
        </span>
      </div>
      {error && (
        <p className={styles.error}>
          {error.message}
          {error.settings && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
