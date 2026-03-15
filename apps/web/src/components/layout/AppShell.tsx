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
        sendMessage(content);
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
            <h1 className={styles.tagline}>AskPenn</h1>
            <ChatInput onSend={handleSend} disabled={isLoading} />
          </div>
        )}
      </main>
    </div>
  );
}
