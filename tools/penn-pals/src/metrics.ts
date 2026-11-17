// ─────────────────────────────────────────────────────────────────────────────
// Penn Pals usage metrics: how many people use the tool, how many chats they
// save, how many different people they've talked to, whether they follow up
// (thank-yous and check-ins done) and whether they come back.
//
// Counts only. When a signed-in user's save adds a chat or finishes a thank-you
// or check-in, the server records opaque keys and a few numbers (see schema.sql);
// no names, notes or contact details ever reach these tables. The counts come
// from the saved contacts themselves (storage.ts), never from the browser.
// ─────────────────────────────────────────────────────────────────────────────

import type { Sql } from "postgres";
import { chatsWith, type Contact } from "./contacts.js";
import { followUpKindOf } from "./network.js";

export interface ChatEvent {
  /** The contact's id, random and made in the browser. */
  personKey: string;
  /** The contact's id plus the chat's number, so the same chat is counted once. */
  chatKey: string;
}

/** A thank-you counts as sent on time when it's done within this many days of the chat. */
export const THANK_YOU_ON_TIME_DAYS = 2;

export type FollowUpEventKind = "thankYou" | "followUp";

export interface FollowUpEvent {
  /** The step's own id, which stays with it however the list is reordered, so the same follow-up is counted once. */
  followUpKey: string;
  kind: FollowUpEventKind;
  /** Whole days from the chat the step belongs to until it was done, never negative. */
  daysAfterChat: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to` (both YYYY-MM-DD), never negative; 0 when either isn't a date. */
function daysBetween(from: string, to: string): number {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
  return Number.isFinite(days) ? Math.max(0, days) : 0;
}

/**
 * The counts a save adds, worked out from the contacts as they were and as
 * they are now, so they come from what was really saved and not from anything
 * the browser reports:
 *   - a chat is counted when the contact has more chats than before (numbered
 *     within the contact, so the same chat is never counted twice);
 *   - a thank-you or check-in is counted when its step goes from open to done,
 *     keyed by the step's id, and its days are counted from the chat the step
 *     belongs to (its own `chatDate`, else the contact's latest chat) up to the
 *     day it was marked done.
 * Steps without an id aren't counted: ids are given when a step is saved.
 */
export function eventsFromChanges(changes: { before: Contact | null; after: Contact }[]): {
  chats: ChatEvent[];
  followUps: FollowUpEvent[];
} {
  const chats: ChatEvent[] = [];
  const followUps: FollowUpEvent[] = [];
  for (const { before, after } of changes) {
    const had = before ? chatsWith(before).length : 0;
    for (let n = had + 1; n <= chatsWith(after).length; n++) {
      chats.push({ personKey: after.id, chatKey: `${after.id}:${n}` });
    }
    after.nextSteps.forEach((step, index) => {
      if (!step.done || !step.id) return;
      const kind = followUpKindOf(step);
      if (!kind) return;
      // The same step before this save: by id, or, for one saved before ids existed, the one in its place.
      const prior = before?.nextSteps.find((s) => s.id === step.id) ?? (before?.nextSteps[index]?.id ? undefined : before?.nextSteps[index]);
      if (!prior || prior.done) return;
      const doneOn = step.doneOn ?? after.meetingDate;
      followUps.push({ followUpKey: step.id, kind, daysAfterChat: daysBetween(step.chatDate ?? after.meetingDate, doneOn) });
    });
  }
  return { chats, followUps };
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

/** Records what a save changed (see eventsFromChanges). */
export async function recordChanges(sql: Sql, userId: string, changes: { before: Contact | null; after: Contact }[]): Promise<void> {
  const { chats, followUps } = eventsFromChanges(changes);
  for (const event of chats) await recordChat(sql, userId, event);
  for (const event of followUps) await recordFollowUp(sql, userId, event);
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
