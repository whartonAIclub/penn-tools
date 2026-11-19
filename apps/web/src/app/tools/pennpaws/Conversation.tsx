"use client";

// One message thread between an owner and a sitter about a request, with a
// box to write the next message. "Help me write" asks AI for a draft that the
// person edits and sends themselves; AI never sends anything.
// A sitter who hasn't offered yet writes in this same box: `offerAction` adds
// their Offer to help button to it, so there's only ever one place to type.

import { useState, type ReactNode } from "react";
import type { Thread } from "@penntools/tool-pennpaws";
import { draftNextMessage, message, type ActionResult } from "./actions";
import styles from "./PennPaws.module.css";

export function Conversation({
  requestId,
  thread,
  title,
  otherFirstName,
  hasAI,
  onSent,
  offerAction,
}: {
  requestId: string;
  thread: Thread;
  title: string;
  otherFirstName: string;
  hasAI: boolean;
  onSent: () => Promise<void> | void;
  /** For a sitter who hasn't offered yet: this box also sends their offer. */
  offerAction?:
    | {
        label: string;
        hint: ReactNode;
        /** Returns true when the offer went through, so the box can be cleared. */
        onOffer: (note: string) => Promise<boolean>;
      }
    | undefined;
}) {
  const [text, setText] = useState("");
  // AI's draft waits here until the member reads it and taps Use this. It never
  // goes straight into the box, so they always see whose words they are.
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "draft" | "offer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The owner replies in a named thread; a sitter's own thread is found from who they are.
  const threadId = thread.id || null;

  const run = async <T,>(kind: "send" | "draft", fn: () => Promise<ActionResult<T>>) => {
    setBusy(kind);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (!result.ok) {
      setError(result.kind === "missing_key" || result.kind === "invalid_key" || result.kind === "no_credit" || result.kind === "credit_used" ? `${result.error} Settings is in the menu at the top.` : result.error);
      return null;
    }
    return result;
  };

  const send = async () => {
    if (await run("send", () => message(requestId, text, threadId))) {
      setText("");
      await onSent();
    }
  };
  const draft = async () => {
    const result = await run("draft", () => draftNextMessage(requestId, threadId));
    if (result) setSuggestion(result.data);
  };
  const sendOffer = async () => {
    if (!offerAction) return;
    setBusy("offer");
    setError(null);
    const ok = await offerAction.onOffer(text);
    setBusy(null);
    if (ok) setText("");
  };

  const inputId = `pp-message-${thread.id || "new"}`;
  return (
    <div className={styles.conversation}>
      <h3 className={styles.heading}>{title}</h3>
      {thread.messages.length === 0 ? (
        <p className={styles.muted}>No messages yet.</p>
      ) : (
        <ol className={styles.chat}>
          {thread.messages.map((m, i) => (
            <li key={i} className={m.mine ? styles.me : styles.bot}>
              {m.body}
              <time className={styles.messageTime} dateTime={m.createdAt}>
                {m.mine ? "You" : otherFirstName},{" "}
                {new Date(m.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </time>
            </li>
          ))}
        </ol>
      )}

      {thread.canSend ? (
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {hasAI && (
            <>
              <span className={styles.label}>How much does AI write?</span>
              <div className={styles.chips}>
                <button type="button" className={styles.chipOn} aria-pressed>
                  Draft
                </button>
                <button type="button" className={styles.chip} disabled title="After launch">
                  Hold
                </button>
                <button type="button" className={styles.chip} disabled title="After launch">
                  Auto
                </button>
              </div>
              <span className={styles.hint}>
                Draft: AI writes, you read it and send. Nothing reaches {otherFirstName} until you tap Send. Hold lets AI send on its own after a few minutes,
                and Auto replies at once — both come after launch. At every setting, AI never agrees to meet in person or on video, and never settles the final
                payment: those stay your tap.
              </span>
            </>
          )}
          {suggestion !== null && (
            <div className={styles.suggestion}>
              <p>
                <strong>Suggested by AI</strong>
              </p>
              <p className={styles.preLine}>{suggestion}</p>
              <p className={styles.hint}>Written from the request, your profiles and the agreement. Read it over — {otherFirstName} hasn&apos;t seen it.</p>
              <div className={styles.row}>
                <button type="button" className={styles.secondary} onClick={() => setSuggestion(null)}>
                  Dismiss
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setText(text.trim() ? `${text.trim()} ${suggestion}` : suggestion);
                    setSuggestion(null);
                  }}
                >
                  Use this
                </button>
              </div>
            </div>
          )}
          <label htmlFor={inputId} className={styles.label}>
            Message to {otherFirstName}
          </label>
          <textarea
            id={inputId}
            className={styles.input}
            rows={3}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              offerAction
                ? `Tell ${otherFirstName} a little about you, or ask about feeding, walks, keys or a quick meet-and-greet.`
                : `Ask ${otherFirstName} about feeding, walks, keys or a quick meet-and-greet.`
            }
          />
          <div className={styles.row}>
            {hasAI ? (
              <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => void draft()}>
                {busy === "draft" ? "Writing…" : "Help me write"}
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className={offerAction ? styles.secondary : styles.primary} disabled={busy !== null || !text.trim()}>
              {busy === "send" ? "Sending…" : "Send"}
            </button>
          </div>
          {offerAction && (
            <>
              <button type="button" className={styles.primary} disabled={busy !== null || !text.trim()} onClick={() => void sendOffer()}>
                {busy === "offer" ? "Offering…" : offerAction.label}
              </button>
              <span className={styles.hint}>{offerAction.hint}</span>
            </>
          )}
          <span className={styles.hint}>
            Don't share your address or phone number in messages. You each add them when you approve, and they show once you're both booked.
          </span>
        </form>
      ) : (
        <p className={styles.muted}>This conversation is closed.</p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
