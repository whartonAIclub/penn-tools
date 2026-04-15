"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { ChatThread } from "../chat/ChatThread";
import { ChatInput } from "../chat/ChatInput";
import { useChat } from "@/hooks/useChat";
import { useAnonymousIdentity } from "@/hooks/useAnonymousIdentity";
import type { ToolManifest } from "@penntools/core/tools";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { userId } = useAnonymousIdentity();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolManifest[]>([]);
  const { messages, chats, sendMessage, startNewChat, isLoading } = useChat({
    userId,
    chatId: activeChatId,
  });

  useEffect(() => {
    fetch("/api/tools")
      .then((r) => r.json())
      .then(setTools)
      .catch(() => {});
  }, []);

  const hasMessages = messages.length > 0;

  async function handleSend(content: string) {
    if (!activeChatId) {
      const id = await startNewChat();
      if (id) {
        setActiveChatId(id);
        sendMessage(content, id);
      }
    } else {
      sendMessage(content);
    }
  }

  async function handleNewChat() {
    const chatId = await startNewChat();
    if (chatId) setActiveChatId(chatId);
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onNewChat={handleNewChat}
        tools={tools}
      />

      <main className={styles.main}>
        <div className={styles.topBar}>
          <a
            className={styles.githubLink}
            href="https://github.com/whartonAIclub/penn-tools"
            target="_blank"
            rel="noreferrer"
            aria-label="Open Penn Tools GitHub repository"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.githubIcon}>
              <path
                fill="currentColor"
                d="M12 2C6.477 2 2 6.589 2 12.248c0 4.526 2.865 8.367 6.839 9.722.5.095.682-.223.682-.496 0-.245-.009-.894-.014-1.754-2.782.617-3.369-1.38-3.369-1.38-.455-1.184-1.11-1.5-1.11-1.5-.908-.637.069-.624.069-.624 1.004.072 1.532 1.056 1.532 1.056.892 1.566 2.341 1.114 2.91.852.091-.665.349-1.114.635-1.37-2.221-.259-4.556-1.14-4.556-5.074 0-1.121.39-2.037 1.03-2.755-.103-.26-.447-1.307.098-2.725 0 0 .84-.277 2.75 1.052A9.303 9.303 0 0 1 12 6.965c.85.004 1.705.117 2.504.344 1.909-1.33 2.748-1.052 2.748-1.052.546 1.418.202 2.465.1 2.725.64.718 1.028 1.634 1.028 2.755 0 3.944-2.338 4.812-4.566 5.067.359.32.678.951.678 1.917 0 1.384-.012 2.5-.012 2.84 0 .275.18.596.688.495C19.138 20.612 22 16.772 22 12.248 22 6.589 17.523 2 12 2Z"
              />
            </svg>
            <span className={styles.githubText}>Github</span>
          </a>
        </div>
        {hasMessages ? (
          /* Active chat: thread fills space, input pinned to bottom */
          <>
            <ChatThread messages={messages} isLoading={isLoading} />
            <div className={styles.inputBottom}>
              <ChatInput onSend={handleSend} disabled={isLoading} />
            </div>
          </>
        ) : (
          /* Empty state: tagline + input centered */
          <div className={styles.emptyState}>
            <div className={styles.taglineWrap}>
              <h1 className={styles.tagline}>AskPenn</h1>
              <span className={styles.betaSticker}>BETA</span>
            </div>
            <ChatInput onSend={handleSend} disabled={isLoading} />
          </div>
        )}
      </main>
    </div>
  );
}
