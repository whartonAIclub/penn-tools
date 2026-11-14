// ─────────────────────────────────────────────────────────────────────────────
// Penn Pals usage metrics: how many people use the tool, how many chats they
// save, how many different people they've talked to, whether they follow up
// (thank-yous and check-ins done) and whether they come back.
//
// Counts only. A signed-in user's saved chat, or a follow-up marked done, is
// recorded as opaque keys and a few numbers (see schema.sql); no names, notes
// or contact details ever reach the database. Callers pass the database client (toolSql("pennpals")) and the
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

/** A thank-you counts as sent on time when it's done within this many days of the chat. */
export const THANK_YOU_ON_TIME_DAYS = 2;

export type FollowUpEventKind = "thankYou" | "followUp";

export interface FollowUpEvent {
  /** `<contact id>:<step number>`, so the same follow-up is counted once. */
  followUpKey: string;
  kind: FollowUpEventKind;
  /** Whole days from the chat to completion, never negative. */
  daysAfterChat: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The event for a follow-up finished on `today`, with the days counted from the contact's chat date (both YYYY-MM-DD). */
export function followUpEventFor(
  followUp: { contactId: string; stepIndex: number; kind: FollowUpEventKind },
  meetingDate: string,
  today: string,
): FollowUpEvent {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${meetingDate}T00:00:00Z`)) / DAY_MS);
  return {
    followUpKey: `${followUp.contactId}:${followUp.stepIndex}`,
    kind: followUp.kind,
    daysAfterChat: Number.isFinite(days) ? Math.max(0, days) : 0,
  };
}

/** A problem with a reported follow-up, or null when it's fine. The browser sends these, so check them. */
export function checkFollowUpEvent(followUpKey: unknown, kind: unknown, daysAfterChat: unknown): string | null {
  if (typeof followUpKey !== "string" || !followUpKey.trim() || followUpKey.length > MAX_KEY_LENGTH) {
    return `The follow-up key is missing or longer than ${MAX_KEY_LENGTH} characters.`;
  }
  if (kind !== "thankYou" && kind !== "followUp") return "The follow-up kind must be thankYou or followUp.";
  if (typeof daysAfterChat !== "number" || !Number.isInteger(daysAfterChat) || daysAfterChat < 0 || daysAfterChat > 36500) {
    return "The days after the chat must be a whole number from 0 up.";
  }
  return null;
}

/** Records a follow-up marked done. True when it was new, false when it had already been recorded. */
export async function recordFollowUp(sql: Sql, userId: string, event: FollowUpEvent): Promise<boolean> {
  const rows = await sql`
    INSERT INTO follow_up_events (user_id, follow_up_key, kind, days_after_chat)
    VALUES (${userId}, ${event.followUpKey}, ${event.kind}, ${event.daysAfterChat})
    ON CONFLICT (user_id, follow_up_key) DO NOTHING
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
  /** Whether people do what they planned to after a chat. */
  followThrough: {
    /** Thank-yous marked done. */
    thankYousSent: number;
    /** Of those, done within THANK_YOU_ON_TIME_DAYS days of the chat. */
    thankYousOnTime: number;
    /** The share of sent thank-yous that were on time (0 to 1), or null before any were sent. */
    onTimeRate: number | null;
    /** Check-ins marked done. */
    checkInsDone: number;
  };
  /** Whether people come back. A user's activity is a saved chat or a follow-up marked done. */
  retention: {
    /** Users active in the last 7 days. */
    activeThisWeek: number;
    /** Users active in 2 or more different calendar weeks (UTC, weeks start Monday). */
    returningUsers: number;
    /** returningUsers as a share of users (0 to 1), or null before anyone has saved a chat. */
    returningRate: number | null;
  };
}

/** The usage numbers across all users. `now` is injectable so "the last 7 days" can be tested. */
export async function getMetrics(sql: Sql, now: Date = new Date()): Promise<PennPalsMetrics> {
  const [usage] = await sql<{ users: number; chats: number; people: number }[]>`
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
  const [follow] = await sql<{ sent: number; on_time: number; check_ins: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE kind = 'thankYou')::int AS sent,
      COUNT(*) FILTER (WHERE kind = 'thankYou' AND days_after_chat <= ${THANK_YOU_ON_TIME_DAYS})::int AS on_time,
      COUNT(*) FILTER (WHERE kind = 'followUp')::int AS check_ins
    FROM follow_up_events
  `;
  const [back] = await sql<{ active: number; returning: number }[]>`
    WITH activity AS (
      SELECT user_id, created_at FROM chat_events
      UNION ALL
      SELECT user_id, created_at FROM follow_up_events WHERE user_id IN (SELECT user_id FROM chat_events)
    ), per_user AS (
      SELECT
        user_id,
        COUNT(DISTINCT date_trunc('week', created_at AT TIME ZONE 'UTC')) AS weeks,
        BOOL_OR(created_at > ${now.toISOString()}::timestamptz - INTERVAL '7 days') AS active
      FROM activity
      GROUP BY user_id
    )
    SELECT
      COUNT(*) FILTER (WHERE active)::int AS active,
      COUNT(*) FILTER (WHERE weeks >= 2)::int AS returning
    FROM per_user
  `;
  const { users, chats, people } = usage!;
  const { sent, on_time: onTime, check_ins: checkIns } = follow!;
  const { active, returning } = back!;
  return {
    users,
    chats,
    people,
    chatsPerUser: users > 0 ? chats / users : null,
    peoplePerUser: users > 0 ? people / users : null,
    followThrough: {
      thankYousSent: sent,
      thankYousOnTime: onTime,
      onTimeRate: sent > 0 ? onTime / sent : null,
      checkInsDone: checkIns,
    },
    retention: {
      activeThisWeek: active,
      returningUsers: returning,
      returningRate: users > 0 ? returning / users : null,
    },
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
