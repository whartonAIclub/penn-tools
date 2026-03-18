"use client";

import type { Message } from "@penntools/core/types";
import styles from "./MessageBubble.module.css";

const URL_REGEX = /(https?:\/\/[^\s)]+)/g;

function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={styles.link}>
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={[styles.row, isUser ? styles.rowUser : ""].join(" ")}>
      {!isUser && <div className={styles.avatar} aria-hidden>A</div>}
      <div className={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant].join(" ")}>
        {message.toolId && (
          <div><span className={styles.toolBadge}>via {message.toolId}</span></div>
        )}
        <p className={styles.content}><Linkify text={message.content} /></p>
      </div>
    </div>
  );
}
