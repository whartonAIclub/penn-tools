"use server";

// Counts a saved chat for Penn Pals' usage metrics (see
// tools/penn-pals/src/metrics.ts). Only signed-in users are counted, only two
// opaque keys are sent, and nothing here can fail the user's save: problems are
// logged and swallowed.

import { toolSql } from "@penntools/platform/db";
import { checkChatEvent, recordChat as saveChatEvent } from "@penntools/tool-penn-pals";
import { getCurrentUser } from "@/lib/auth";

export async function recordChat(personKey: string, chatKey: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return; // using the tool signed out isn't counted
  if (checkChatEvent(personKey, chatKey)) return;
  try {
    const sql = toolSql("pennpals");
    if (!sql) throw new Error("Penn Pals' database is not configured (check DATABASE_URL).");
    await saveChatEvent(sql, user.id, { personKey, chatKey });
  } catch (error) {
    // The tool's database may not be set up yet; the user's chat is saved in their browser regardless.
    console.error("[penn-pals] couldn't record the chat for metrics", error);
  }
}
