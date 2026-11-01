"use client";

// One message thread between an owner and a sitter about a request, with a
// box to write the next message. "Help me write" asks AI for a draft that the
// person edits and sends themselves; AI never sends anything.

import { useState } from "react";
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
}: {
  requestId: string;
  thread: Thread;
  title: string;
  otherFirstName: string;
  hasAI: boolean;
  onSent: () => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The owner replies in a named thread; a sitter's own thread is found from who they are.
  const threadId = thread.id || null;

  const run = async <T,>(kind: "send" | "draft", fn: () => Promise<ActionResult<T>>) => {
    setBusy(kind);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (!result.ok) {
      setError(result.kind === "missing_key" || result.kind === "invalid_key" || result.kind === "no_credit" ? `${result.error} Settings is in the menu at the top.` : result.error);
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
    if (result) setText(result.data);
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
          <label htmlFor={inputId} className={styles.visuallyHidden}>
            Message to {otherFirstName}
          </label>
          <textarea
            id={inputId}
            className={styles.input}
            rows={3}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Ask ${otherFirstName} about feeding, walks, keys or a quick meet-and-greet.`}
          />
          <div className={styles.row}>
            {hasAI ? (
              <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => void draft()}>
                {busy === "draft" ? "Writing…" : "Help me write"}
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className={styles.primary} disabled={busy !== null || !text.trim()}>
              {busy === "send" ? "Sending…" : "Send"}
            </button>
          </div>
          <span className={styles.hint}>
            {hasAI ? "AI drafts, you edit and send. " : ""}Keep your address and phone number here until you both approve the booking.
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
