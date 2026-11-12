"use client";

// AMA: questions about the uploaded weekend, answered from the schedule the
// page shows (see tools/wemba-sync/src/ama.ts). A button in the bottom-right
// corner opens it as a chat panel; minimizing keeps the conversation, and a
// dot on the button marks an answer that finished while it was minimized.
// Answers stream from ama/route.ts. The conversation lives in this component
// only: a new upload or a reload starts over.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import type { AIProvider, GenerateResult } from "@penntools/core/ai";
import type { WeekendSchedule } from "@penntools/tool-wemba-sync";
import styles from "./WembaSync.module.css";

const MAX_QUESTION_LENGTH = 1000;
const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

const SUGGESTIONS = ["Where's lunch on Saturday?", "When does my first class start?", "What's happening Friday evening?"];

interface ShownError {
  kind?: string;
  message: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: ShownError;
}

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "done"; result: GenerateResult }
  | { type: "error"; error: ShownError };

export function AMA({
  provider,
  schedule,
  section,
}: {
  provider: AIProvider;
  schedule: WeekendSchedule;
  section: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const openRef = useRef(open);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  openRef.current = open;

  // A new schedule starts a new conversation.
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setUnread(false);
  }, [schedule]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the latest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  function show() {
    setOpen(true);
    setUnread(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function minimize() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  async function ask(question: string) {
    question = question.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);

    // Earlier questions and answers, without failed ones, then the new question.
    const history: Message[] = [];
    for (let i = 0; i + 1 < messages.length; i += 2) {
      const [q, a] = [messages[i]!, messages[i + 1]!];
      if (!a.error && a.content) history.push({ role: q.role, content: q.content }, { role: a.role, content: a.content });
    }
    const sent = [...history.slice(-18), { role: "user" as const, content: question }];
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);

    // The answer is the last message; text streams into it, or an error replaces it.
    const updateAnswer = (update: (answer: Message) => Message) => setMessages((m) => [...m.slice(0, -1), update(m.at(-1)!)]);
    const fail = (error: ShownError) => updateAnswer(() => ({ role: "assistant", content: "", error }));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/tools/wemba-sync/ama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, schedule, section, messages: sent }),
        signal: controller.signal,
      });
      if (res.status === 401) return fail({ message: "Sign in with the button at the top right to ask." });
      if (!res.ok || !res.body) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        return fail({ message: error ?? "Something went wrong. Try again." });
      }

      // Server-sent events: one "data: <json>" per event, separated by blank lines.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const event = JSON.parse(part.slice(6)) as StreamEvent;
          if (event.type === "text") {
            updateAnswer((answer) => ({ ...answer, content: answer.content + event.delta }));
          } else if (event.type === "done") {
            finished = true;
            if (!event.result.text.trim()) fail({ message: "AMA couldn't answer that. Try rephrasing." });
          } else {
            finished = true;
            fail(event.error);
          }
        }
      }
      if (!finished) fail({ message: "The answer was interrupted. Try again." });
    } catch {
      if (!controller.signal.aborted) fail({ message: "Couldn't reach AMA. Check your connection and try again." });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      // Answered while minimized: mark the button.
      if (!controller.signal.aborted && !openRef.current) setUnread(true);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  }

  return (
    <>
      <section
        id="wemba-ama"
        className={styles.amaPanel}
        aria-label="AMA"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape") minimize();
        }}
      >
        <header className={styles.amaHeader}>
          <div>
            <h3 className={styles.amaTitle}>AMA</h3>
            <p className={styles.meta}>Ask me anything about this weekend{section ? `, for ${section}` : ""}.</p>
          </div>
          <button type="button" className={styles.amaMinimize} onClick={minimize} aria-label="Minimize AMA" title="Minimize">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={styles.amaBody}>
          {messages.length === 0 ? (
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className={styles.suggestion} onClick={() => void ask(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <ol ref={listRef} className={styles.messages} aria-live="polite" aria-busy={busy}>
              {messages.map((m, i) => (
                <li key={i} className={m.role === "user" ? styles.question : styles.answer}>
                  {m.error ? (
                    <span className={styles.error} role="alert">
                      {m.error.message}
                      {m.error.kind && KEY_PROBLEMS.has(m.error.kind) && (
                        <>
                          {" "}
                          <Link href="/settings" className={styles.link}>
                            Open Settings
                          </Link>
                        </>
                      )}
                    </span>
                  ) : m.content ? (
                    m.content
                  ) : (
                    <span className={styles.thinking}>
                      <span className={styles.spinner} aria-hidden /> Looking it up…
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <form className={styles.askForm} onSubmit={submit}>
          <textarea
            ref={inputRef}
            className={styles.askInput}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about times, rooms, meals, events…"
            rows={1}
            maxLength={MAX_QUESTION_LENGTH}
            aria-label="Your question"
          />
          <button type="submit" className={styles.button} disabled={busy || !input.trim()}>
            Ask
          </button>
        </form>
        <p className={`${styles.meta} ${styles.amaFooter}`}>
          Answers come from this weekend&apos;s schedule and can be wrong. Check the PDF for anything important.
        </p>
      </section>

      <button
        ref={launcherRef}
        type="button"
        className={styles.amaLauncher}
        onClick={open ? minimize : show}
        aria-expanded={open}
        aria-controls="wemba-ama"
        aria-label={open ? "Minimize AMA" : unread ? "Open AMA: new answer" : "Open AMA: ask me anything"}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          {open ? (
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"
              fill="currentColor"
            />
          )}
        </svg>
        AMA
        {unread && <span className={styles.amaUnread} aria-hidden />}
      </button>
    </>
  );
}
