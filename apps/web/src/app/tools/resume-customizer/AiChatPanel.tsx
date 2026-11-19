// The editor's AI chat: questions get an answer, change requests get a
// revised resume to apply (and undo).

import { useEffect, useRef, useState } from "react";
import { LIMITS, chars, resumeSizeProblem, type ChatTurn, type ResumeDoc } from "@penntools/tool-resume-customizer/resume";
import { revise, type ActionError } from "./actions";
import { ErrorText, IconChat, IconSend, ProviderPicker, UNREACHABLE, cx, type ProviderChoice } from "./shared";
import shared from "./shared.module.css";
import styles from "./AiChatPanel.module.css";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  /** The revised resume the reply came with. */
  revision?: ResumeDoc;
  applied?: boolean;
  /**
   * The resume before the revision was applied, kept only for the latest
   * revision applied: undoing an older one would also drop the newer ones.
   */
  before?: ResumeDoc | undefined;
  error?: ActionError;
}

/**
 * The chat, kept by the page so it survives leaving the Edit screen. `id`
 * changes when a new resume starts a new chat, so a reply to the old one is
 * dropped rather than added to the new; `sending` stays set while a reply is
 * on its way, even if the user leaves Edit and comes back.
 */
export interface Chat {
  id: number;
  messages: ChatMsg[];
  sending: boolean;
}

export const EMPTY_CHAT: Chat = { id: 0, messages: [], sending: false };

/** A new, empty chat, for setChat. */
export function nextChat(prev: Chat): Chat {
  return { id: prev.id + 1, messages: [], sending: false };
}

/** The turns to send with a message: the last few, leaving out failed exchanges. */
function chatHistory(chat: ChatMsg[]): ChatTurn[] {
  return chat
    .filter((m, i) => !m.error && !(m.role === "user" && chat[i + 1]?.error))
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-LIMITS.chatHistory);
}

const SUGGESTIONS = ["Make the bullets more results-driven", "Shorten the longest bullet", "Which bullets fit this job least?"];

export function AiChatPanel({ chat, setChat, providerChoice, jobDescription, currentDoc, onApply, onUndo }: {
  chat: Chat;
  setChat: React.Dispatch<React.SetStateAction<Chat>>;
  providerChoice: ProviderChoice;
  jobDescription: string;
  currentDoc: () => ResumeDoc;
  /** Puts the revision in the editor and returns the resume it replaced. */
  onApply: (revision: ResumeDoc) => ResumeDoc;
  onUndo: (before: ResumeDoc) => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sending } = chat;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  /** Changes `chat` only if it's still the chat with this id. */
  const update = (id: number, change: (prev: Chat) => Chat) => setChat((prev) => (prev.id === id ? change(prev) : prev));
  const setMessages = (map: (m: ChatMsg, i: number) => ChatMsg) =>
    update(chat.id, (prev) => ({ ...prev, messages: prev.messages.map(map) }));

  const tooLong = input.length > LIMITS.chatMessage;
  const send = async () => {
    const message = input.trim();
    if (!message || sending || tooLong) return;
    const { id } = chat;
    const history = chatHistory(messages);
    const resume = currentDoc();
    // A resume too large to send gets the reason at once, not a failed request.
    const tooLarge = resumeSizeProblem(resume);
    if (tooLarge) {
      update(id, (prev) => ({
        ...prev,
        messages: [...prev.messages, { role: "user", content: message }, { role: "assistant", content: "", error: { message: tooLarge } }],
      }));
      setInput("");
      return;
    }
    update(id, (prev) => ({ ...prev, sending: true, messages: [...prev.messages, { role: "user", content: message }] }));
    setInput("");
    let reply: ChatMsg;
    try {
      const result = await revise(providerChoice.provider, { resume, jobDescription, history, message });
      reply = result.ok
        ? { role: "assistant", content: result.data.reply, ...(result.data.resume ? { revision: result.data.resume } : {}) }
        : { role: "assistant", content: "", error: result.error };
    } catch {
      reply = { role: "assistant", content: "", error: UNREACHABLE };
    }
    update(id, (prev) => ({ ...prev, sending: false, messages: [...prev.messages, reply] }));
  };

  const apply = (index: number, revision: ResumeDoc) => {
    const before = onApply(revision);
    setMessages((m, i) => (i === index ? { ...m, applied: true, before } : { ...m, before: undefined }));
  };
  const undo = (index: number, before: ResumeDoc) => {
    onUndo(before);
    setMessages((m, i) => (i === index ? { ...m, applied: false, before: undefined } : m));
  };

  return (
    <aside className={cx(shared.panel, styles.panel)}>
      <div className={shared.panelHead}>
        <IconChat />
        AI Editor
      </div>
      <div ref={scrollRef} aria-live="polite" className={styles.messages}>
        {messages.length === 0 && !sending && (
          <div className={styles.suggestions}>
            <div className={styles.suggestionsLabel}>Ask for a change, or a question about your resume. Try:</div>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setInput(s)} className={styles.suggestion}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cx(styles.message, msg.role === "user" && styles.messageUser)}>
            <div className={cx(styles.bubble, msg.error && styles.bubbleError)}>{msg.error ? <ErrorText error={msg.error} /> : msg.content}</div>
            {msg.revision && !msg.applied && (
              <button onClick={() => apply(i, msg.revision!)} className={styles.apply}>
                Apply to editor
              </button>
            )}
            {msg.revision && msg.applied && (
              <div className={styles.applied}>
                <span className={styles.appliedLabel}>✓ Applied</span>
                {msg.before && (
                  <button onClick={() => undo(i, msg.before!)} title="Puts back the resume as it was before this change, including edits since" className={styles.undo}>
                    Undo this change
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div role="status" aria-label="Waiting for the AI" className={styles.typing}>
            <div className={styles.typingDot} />
            <div className={styles.typingDot} />
            <div className={styles.typingDot} />
          </div>
        )}
      </div>
      <div className={cx(shared.panelFoot, styles.foot)}>
        <div className={cx(styles.input, tooLong && styles.inputOver)}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask the AI… (Enter to send)"
            aria-label="Message to the AI editor"
            rows={2}
            className={styles.textarea}
          />
          <button onClick={() => void send()} disabled={sending || !input.trim() || tooLong} aria-label="Send" className={styles.send}>
            <IconSend />
          </button>
        </div>
        {tooLong && <div className={styles.over}>Keep your message to {chars(LIMITS.chatMessage)} characters.</div>}
        <ProviderPicker choice={providerChoice} />
      </div>
    </aside>
  );
}
