// ─────────────────────────────────────────────────────────────────────────────
// Penn Pals usage metrics: how many people use the tool, how many chats they
// save, and how many different people they've talked to.
//
// Counts only. A signed-in user's saved chat is recorded as two opaque keys
// (see schema.sql); no names, notes or contact details ever reach the
// database. Callers pass the database client (toolSql("pennpals")) and the
// signed-in user's id.
// ─────────────────────────────────────────────────────────────────────────────

import type { Sql } from "postgres";

const MAX_KEY_LENGTH = 100;

export interface ChatEvent {
  /** The contact's id, random and made in the browser. */
  personKey: string;
  /** The contact's id plus the chat's number, so the same chat is counted once. */
  chatKey: string;
}

/** A problem with a reported chat, or null when it's fine. The browser sends these, so check them. */
export function checkChatEvent(personKey: unknown, chatKey: unknown): string | null {
  for (const [label, value] of [["person", personKey], ["chat", chatKey]] as const) {
    if (typeof value !== "string" || !value.trim() || value.length > MAX_KEY_LENGTH) {
      return `The ${label} key is missing or longer than ${MAX_KEY_LENGTH} characters.`;
    }
  }
  return null;
}

/** Records a saved chat. True when it was new, false when it had already been recorded. */
export async function recordChat(sql: Sql, userId: string, event: ChatEvent): Promise<boolean> {
  const rows = await sql`
    INSERT INTO chat_events (user_id, person_key, chat_key)
    VALUES (${userId}, ${event.personKey}, ${event.chatKey})
    ON CONFLICT (user_id, chat_key) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

export interface PennPalsMetrics {
  /** Signed-in users who have saved at least one chat. */
  users: number;
  /** Every chat saved, across all users. */
  chats: number;
  /** Different people talked to, counted per user and added up (the same person met by two users counts twice). */
  people: number;
  /** Chats per user, or null before anyone has saved one. */
  chatsPerUser: number | null;
  /** People per user, or null before anyone has saved a chat. */
  peoplePerUser: number | null;
}

/** The usage numbers across all users. */
export async function getMetrics(sql: Sql): Promise<PennPalsMetrics> {
  const [row] = await sql<{ users: number; chats: number; people: number }[]>`
    WITH per_user AS (
      SELECT user_id, COUNT(*) AS chats, COUNT(DISTINCT person_key) AS people
      FROM chat_events
      GROUP BY user_id
    )
    SELECT
      COUNT(*)::int AS users,
      COALESCE(SUM(chats), 0)::int AS chats,
      COALESCE(SUM(people), 0)::int AS people
    FROM per_user
  `;
  const { users, chats, people } = row!;
  return {
    users,
    chats,
    people,
    chatsPerUser: users > 0 ? chats / users : null,
    peoplePerUser: users > 0 ? people / users : null,
  };
}

/**
 * Whether `email` may see the metrics. Anyone can while developing locally; in
 * production only the emails in `viewers` (compared without regard to case).
 */
export function canViewMetrics(email: string | null | undefined, viewers: readonly string[], isProduction: boolean): boolean {
  if (!isProduction) return true;
  if (!email) return false;
  return viewers.some((viewer) => viewer.trim().toLowerCase() === email.trim().toLowerCase());
}
