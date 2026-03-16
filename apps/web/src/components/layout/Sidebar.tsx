"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Chat } from "@penntools/core/types";
import type { ToolManifest } from "@penntools/core/tools";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  tools: ToolManifest[];
}

function IconNewChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconTool() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

export function Sidebar({ chats, activeChatId, onSelectChat, onNewChat, tools }: SidebarProps) {
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setApiKey(localStorage.getItem("penntools_api_key") ?? "");
  }, []);

  function handleKeyChange(val: string) {
    setApiKey(val);
    if (val) localStorage.setItem("penntools_api_key", val);
    else localStorage.removeItem("penntools_api_key");
  }

  return (
    <aside className={styles.sidebar}>
      {/* Top nav */}
      <nav className={styles.topNav}>
        <button className={styles.newChat} onClick={onNewChat} disabled>
          <IconNewChat />
          <span>New chat</span>
        </button>
        <button className={styles.navItem} disabled>
          <IconSearch />
          <span>Search chats</span>
        </button>
        <button className={styles.navItem} disabled>
          <IconGrid />
          <span>Dashboard</span>
        </button>
      </nav>

      {/* Tools section */}
      {tools.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Tools</p>
          {tools.map((tool) => (
            <Link key={tool.id} href={`/tools/${tool.id}`} className={styles.toolItem}>
              <IconTool />
              <span className={styles.chatTitle}>{tool.title}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Chats section */}
      <div className={styles.section}>
        {chats.length > 0 && <p className={styles.sectionLabel}>Chats</p>}
        <div className={styles.chatList}>
          {chats.map((chat) => (
            <button
              key={chat.id}
              className={[styles.chatItem, chat.id === activeChatId ? styles.active : ""].join(" ")}
              onClick={() => onSelectChat(chat.id)}
            >
              <IconChat />
              <span className={styles.chatTitle}>{chat.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div className={`${styles.section} ${styles.apiKeySection}`}>
        <p className={styles.sectionLabel}>API Key</p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => handleKeyChange(e.target.value)}
          placeholder="sk-… or sk-ant-…"
          className={styles.apiKeyInput}
        />
      </div>

      {/* Bottom: user */}
      <div className={styles.userRow}>
        <div className={styles.avatar}>A</div>
        <div className={styles.userInfo}>
          <span className={styles.userName}>Anonymous</span>
        </div>
      </div>
    </aside>
  );
}
