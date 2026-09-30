"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Message, Chat } from "@penntools/core/types";

interface UseChatOptions {
  userId: string;
  chatId: string | null;
}

interface UseChatResult {
  messages: Message[];
  chats: Chat[];
  isLoading: boolean;
  sendMessage: (content: string, overrideChatId?: string) => Promise<void>;
  startNewChat: () => Promise<string | null>;
}

/**
 * Fetches JSON from a platform API. If the session has ended (401), reloads the
 * page, which then shows the sign-in prompt; any other failure throws.
 */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) window.location.reload();
  if (!res.ok) throw new Error(`${url} failed (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export function useChat({ userId, chatId }: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const sendingRef = useRef(false);

  // Load chat list.
  useEffect(() => {
    fetchJson<{ chats: Chat[] }>("/api/chats")
      .then((data) => setChats(data.chats))
      .catch(console.error);
  }, [userId]);

  // Load messages when active chat changes.
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    // Skip fetching if a send is already in progress — the send will
    // populate messages itself and a concurrent fetch would race and
    // wipe the optimistic message, causing a UI flicker.
    if (sendingRef.current) return;

    setIsLoading(true);
    let cancelled = false;
    fetchJson<{ messages: Message[] }>(`/api/chats/${chatId}`)
      .then((data) => {
        if (!cancelled) setMessages(data.messages ?? []);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [chatId]);

  const sendMessage = useCallback(
    async (content: string, overrideChatId?: string) => {
      const effectiveChatId = overrideChatId ?? chatId;
      if (!effectiveChatId) return;
      sendingRef.current = true;
      setIsLoading(true);

      // Optimistic user message (no id yet).
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        chatId: effectiveChatId,
        userId,
        role: "user",
        content,
        toolId: null,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const apiKey = typeof window !== "undefined"
          ? (localStorage.getItem("penntools_api_key") ?? "")
          : "";
        const data = await fetchJson<{ userMessage: Message; assistantMessage: Message }>("/api/chat/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-Api-Key": apiKey } : {}),
          },
          body: JSON.stringify({ chatId: effectiveChatId, content }),
        });

        // Replace the optimistic message with the real one.
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic.id),
          data.userMessage,
          data.assistantMessage,
        ]);

        // Refresh chat list to update title / ordering.
        const chatsData = await fetchJson<{ chats: Chat[] }>("/api/chats");
        setChats(chatsData.chats);
      } catch (err) {
        console.error(err);
        // Remove the optimistic message on error.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      } finally {
        sendingRef.current = false;
        setIsLoading(false);
      }
    },
    [chatId, userId]
  );

  const startNewChat = useCallback(async (): Promise<string | null> => {
    try {
      const data = await fetchJson<{ chat: Chat }>("/api/chats/new", { method: "POST" });
      setChats((prev) => [data.chat, ...prev]);
      return data.chat.id;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, []);

  return { messages, chats, isLoading, sendMessage, startNewChat };
}
