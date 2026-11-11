"use client";

// The AskPenn chat: a sidebar of the user's chats, the open chat's thread, and
// the message box, which takes attached, pasted or dropped files. Replies
// stream from stream/route.ts.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import type { AIProvider, AIReasoning, AIStreamEvent, AITier } from "@penntools/core/ai";
import type { Attachment, AttachmentLimits, ChatMessage, ChatSummary } from "@penntools/tool-askpenn";
import { loadChat, loadChats } from "./actions";
import { ACCEPT, attachmentSize, readAttachment, uniqueName } from "./attachments";
import styles from "./AskPenn.module.css";

interface ShownError {
  kind?: string;
  message: string;
}

/** A message in the thread; an error stands in for a reply that failed (it isn't saved). */
type ShownMessage = ChatMessage & { error?: ShownError };

type StreamEvent = AIStreamEvent | { type: "chat"; chatId: string } | { type: "error"; error: ShownError };

/** The user's choices for replies, remembered in this browser. */
interface ReplySettings {
  provider: AIProvider;
  tier: AITier;
  reasoning: AIReasoning;
}

const SPEEDS: Record<AITier, string> = { fast: "Fast", standard: "Balanced", best: "Best" };
const THINKING: Record<AIReasoning, string> = { low: "Low", medium: "Medium", high: "High" };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit", "credit_used"]);
const SETTINGS_STORAGE_KEY = "askpenn_settings";
const URL_RE = /(https?:\/\/[^\s)]+)/g;
const MB = 1024 * 1024;

/** A reply's error, said in terms of the files when the message had some. */
function withAttachments(error: ShownError): ShownError {
  if (error.kind === "bad_request") return { ...error, message: "Couldn't read one of your attachments. Try a different file." };
  if (error.kind === "too_long") {
    return { ...error, message: "Your attachments are too long for this model. Try a shorter file or fewer pages." };
  }
  return error;
}

export function AskPenn({
  initialChats,
  providers,
  labels,
  defaultTier,
  defaultReasoning,
  maxMessageLength,
  attachmentLimits: limits,
}: {
  initialChats: ChatSummary[];
  /** Providers the user can call (ai.providers()); never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  defaultTier: AITier;
  defaultReasoning: AIReasoning;
  /** The server rejects longer messages, so the message box stops there. */
  maxMessageLength: number;
  /** The server's limits on a message's attachments, checked here first. */
  attachmentLimits: AttachmentLimits;
}) {
  const [chats, setChats] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [settings, setSettings] = useState<ReplySettings>({
    provider: providers[0]!,
    tier: defaultTier,
    reasoning: defaultReasoning,
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  /** Files ready to send with the next message. */
  const [pending, setPending] = useState<Attachment[]>([]);
  /** How many files are still being read. */
  const [reading, setReading] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);
  /** Files are being dragged over the chat. */
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const openingRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Files are read asynchronously, so adding them checks the latest list, not the one from when reading began.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // Restore last time's choices, keeping only ones that are still valid (the
  // user may have removed a key since).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}") as Partial<ReplySettings>;
      setSettings((current) => ({
        provider: saved.provider && providers.includes(saved.provider) ? saved.provider : current.provider,
        tier: saved.tier && Object.hasOwn(SPEEDS, saved.tier) ? saved.tier : current.tier,
        reasoning: saved.reasoning && Object.hasOwn(THINKING, saved.reasoning) ? saved.reasoning : current.reasoning,
      }));
    } catch {
      // storage unavailable or unreadable: keep the defaults
    }
  }, [providers]);

  // The page can come from the browser's cache of recently visited pages, so
  // fetch the current chat list rather than trusting initialChats.
  useEffect(() => {
    loadChats().then(setChats, () => {});
  }, []);

  // Stop a reply in progress when the user leaves the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function choose(change: Partial<ReplySettings>) {
    const next = { ...settings, ...change };
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: the choice lasts until reload
    }
  }

  function newChat() {
    openingRef.current = null;
    setActiveChatId(null);
    setMessages([]);
  }

  async function openChat(chatId: string) {
    if (chatId === activeChatId) return;
    openingRef.current = chatId;
    setActiveChatId(chatId);
    setMessages([]);
    let loaded: ChatMessage[] | null;
    try {
      loaded = await loadChat(chatId);
    } catch {
      loaded = null;
    }
    if (openingRef.current !== chatId) return; // the user opened another chat meanwhile
    setMessages(loaded ?? [{ role: "assistant", content: "", error: { message: "Couldn't load this chat. Try again." } }]);
  }

  /** Reads the files and adds them to the next message, saying why any can't be added. */
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setAttachError(null);
    setReading((n) => n + files.length);
    const results = await Promise.allSettled(files.map((file) => readAttachment(file, limits)));
    setReading((n) => n - files.length);

    const problems: string[] = [];
    const next = [...pendingRef.current];
    for (const result of results) {
      if (result.status === "rejected") {
        problems.push(result.reason instanceof Error ? result.reason.message : "A file couldn't be read.");
        continue;
      }
      const attachment = result.value;
      if (next.some((a) => a.data === attachment.data)) {
        problems.push(`${attachment.name} is already attached.`);
        continue;
      }
      if (next.length >= limits.count) {
        problems.push(`Attach at most ${limits.count} files.`);
        break;
      }
      const textLength = (a: Attachment) => (a.mediaType === "text/plain" ? a.data.length : 0);
      if (next.reduce((total, a) => total + textLength(a), textLength(attachment)) > limits.textLength) {
        problems.push(
          `${attachment.name} would take your text files over ${limits.textLength / 1_000_000} million characters, more than any model reads.`,
        );
        continue;
      }
      if (next.reduce((total, a) => total + attachmentSize(a), attachmentSize(attachment)) > limits.bytes) {
        problems.push(`${attachment.name} would take your attachments over ${limits.bytes / MB} MB.`);
        continue;
      }
      next.push({ ...attachment, name: uniqueName(attachment.name, next.map((a) => a.name)) });
    }
    pendingRef.current = next;
    setPending(next);
    if (problems.length > 0) setAttachError(problems.join(" "));
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    // Copying from Word or Excel puts the text and a picture of it on the
    // clipboard; paste the text as usual then.
    if (files.length === 0 || e.clipboardData.getData("text/plain")) return;
    e.preventDefault();
    void addFiles(files);
  }

  // Files can be dropped anywhere on the chat. Every file drag is taken, even
  // mid-reply when the drop is ignored, since a missed drop makes the browser
  // open the file in place of the page.
  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  function handleDragOver(e: DragEvent<HTMLElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = busy ? "none" : "copy";
    setDragging(!busy);
  }
  function handleDragLeave(e: DragEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }
  function handleDrop(e: DragEvent<HTMLElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setDragging(false);
    if (!busy) void addFiles(Array.from(e.dataTransfer.files));
  }

  async function send() {
    const content = input.trim();
    const attachments = pending;
    if ((!content && attachments.length === 0) || busy || reading > 0) return;
    setInput("");
    setPending([]);
    setAttachError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setBusy(true);
    const names = attachments.map((a) => a.name);
    setMessages((m) => [
      ...m,
      { role: "user", content, ...(names.length > 0 && { attachments: names }) },
      { role: "assistant", content: "" },
    ]);

    // The reply is the last message; text streams into it, or an error replaces it.
    const updateReply = (update: (reply: ShownMessage) => ShownMessage) =>
      setMessages((m) => [...m.slice(0, -1), update(m.at(-1)!)]);
    const fail = (error: ShownError) => updateReply(() => ({ role: "assistant", content: "", error }));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/tools/askpenn/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: activeChatId, ...settings, content, ...(attachments.length > 0 && { attachments }) }),
        signal: controller.signal,
      });
      if (res.status === 401) return fail({ message: "Sign in with the button at the top right to keep chatting." });
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
          if (event.type === "chat") {
            openingRef.current = event.chatId;
            setActiveChatId(event.chatId);
          } else if (event.type === "text") {
            updateReply((reply) => ({ ...reply, content: reply.content + event.delta }));
          } else if (event.type === "done") {
            finished = true;
            if (!event.result.text.trim()) fail({ message: "AskPenn couldn't answer that. Try rephrasing." });
          } else {
            finished = true;
            fail(attachments.length > 0 ? withAttachments(event.error) : event.error);
          }
        }
      }
      if (!finished) fail({ message: "The reply was interrupted. Try again." });
    } catch {
      if (!controller.signal.aborted) fail({ message: "Couldn't reach AskPenn. Check your connection and try again." });
    } finally {
      abortRef.current = null;
      setBusy(false);
      loadChats().then(setChats, () => {});
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function growTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  const canSend = (input.trim() !== "" || pending.length > 0) && !busy && reading === 0;

  const composer = (
    <div className={styles.composer}>
      {(pending.length > 0 || reading > 0) && (
        <div className={styles.attachments}>
          {pending.map((attachment, i) => (
            <span key={i} className={styles.attachment}>
              <span className={styles.attachmentName}>{attachment.name}</span>
              <button
                className={styles.removeAttachment}
                onClick={() => setPending((current) => current.filter((_, j) => j !== i))}
                disabled={busy}
                aria-label={`Remove ${attachment.name}`}
              >
                ×
              </button>
            </span>
          ))}
          {reading > 0 && <span className={styles.attachment}>Reading…</span>}
        </div>
      )}
      <div className={[styles.pill, dragging ? styles.dragging : ""].join(" ")}>
        <button
          className={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          aria-label="Attach files"
          title="Attach images, PDFs or text files, or paste or drop them here"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = ""; // so picking the same file again still adds it
          }}
        />
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={growTextarea}
          onPaste={handlePaste}
          placeholder="Ask anything"
          maxLength={maxMessageLength}
          rows={1}
          disabled={busy}
        />
        <button
          className={[styles.sendBtn, canSend ? styles.sendActive : ""].join(" ")}
          onClick={() => void send()}
          disabled={!canSend}
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 4l8 16-8-4-8 4 8-16z" />
          </svg>
        </button>
      </div>
      {attachError && <p className={styles.attachError}>{attachError}</p>}
      <div className={styles.settings}>
        {providers.length > 1 && (
          <Choice
            label="Provider"
            value={settings.provider}
            options={Object.fromEntries(providers.map((p) => [p, labels[p]])) as Record<AIProvider, string>}
            onChange={(provider) => choose({ provider })}
            disabled={busy}
          />
        )}
        <Choice
          label="Speed"
          title="Faster models cost less on your API key; Best is the most capable."
          value={settings.tier}
          options={SPEEDS}
          onChange={(tier) => choose({ tier })}
          disabled={busy}
        />
        <Choice
          label="Thinking"
          title="More thinking can give better answers to hard questions, but takes longer and costs more."
          value={settings.reasoning}
          options={THINKING}
          onChange={(reasoning) => choose({ reasoning })}
          disabled={busy}
        />
      </div>
    </div>
  );

  return (
    <div className={styles.shell} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <aside className={styles.sidebar}>
        <button className={styles.newChat} onClick={newChat} disabled={busy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          New chat
        </button>
        {chats.length > 0 && <p className={styles.sectionLabel}>Chats</p>}
        <nav className={styles.chatList}>
          {chats.map((chat) => (
            <button
              key={chat.id}
              className={[styles.chatItem, chat.id === activeChatId ? styles.active : ""].join(" ")}
              onClick={() => void openChat(chat.id)}
              disabled={busy}
              title={chat.title}
            >
              <span className={styles.chatTitle}>{chat.title}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.main}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.taglineWrap}>
              <h1 className={styles.tagline}>AskPenn</h1>
              <span className={styles.betaSticker}>BETA</span>
            </div>
            {composer}
          </div>
        ) : (
          <>
            <div className={styles.thread}>
              {messages.map((message, i) => (
                <Bubble key={i} message={message} thinking={busy && i === messages.length - 1 && !message.content} />
              ))}
              <div ref={bottomRef} />
            </div>
            <div className={styles.inputBottom}>{composer}</div>
          </>
        )}
      </main>
    </div>
  );
}

/** A labelled dropdown under the message box. */
function Choice<T extends string>({
  label,
  title,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  title?: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <label className={styles.choice} title={title}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
        {(Object.entries(options) as [T, string][]).map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Bubble({ message, thinking }: { message: ShownMessage; thinking: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={[styles.row, isUser ? styles.rowUser : ""].join(" ")}>
      {!isUser && (
        <div className={styles.avatar} aria-hidden>
          A
        </div>
      )}
      <div className={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant].join(" ")}>
        {message.error ? (
          <p className={styles.error}>
            {message.error.message}
            {message.error.kind && KEY_PROBLEMS.has(message.error.kind) && (
              <>
                {" "}
                <Link href="/settings" className={styles.link}>
                  Open Settings
                </Link>
              </>
            )}
          </p>
        ) : thinking ? (
          <div className={styles.thinking} aria-label="AskPenn is replying">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        ) : (
          <>
            {message.attachments && message.attachments.length > 0 && (
              <div className={styles.attachments}>
                {message.attachments.map((name, i) => (
                  <span key={i} className={styles.attachment} title="Sent with this message only">
                    <span className={styles.attachmentName}>{name}</span>
                  </span>
                ))}
              </div>
            )}
            {message.content && (
              <p className={styles.content}>
                <Linkify text={message.content} />
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        // split() with a capturing group puts the URLs at odd indexes.
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={styles.link}>
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
