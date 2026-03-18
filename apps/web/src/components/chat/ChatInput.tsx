"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { Typeahead } from "./Typeahead";
import styles from "./ChatInput.module.css";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  return (
    <div className={styles.wrapper}>
      <Typeahead query={value} onSelect={(s) => { setValue(s); textareaRef.current?.focus(); }} />

      <div className={styles.pill}>
        {/* Left: attach / tools button */}
        <button className={styles.pillBtn} aria-label="Attach or use a tool" tabIndex={-1}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask anything"
          rows={1}
          disabled={disabled}
        />

        {/* Right: send button */}
        <button
          className={[styles.sendBtn, value.trim() ? styles.sendActive : ""].join(" ")}
          onClick={submit}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l8 16-8-4-8 4 8-16z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
