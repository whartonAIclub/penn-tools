// Telling people when something needs them: a new offer, an accepted offer,
// an approval. Every notification is stored for the in-app list; extra
// channels (email, phone push) plug in through NotificationChannel once the
// platform offers one, without changing any caller.

import type { Sql } from "postgres";

/**
 * The part of a request a notification is about, so opening it lands on that
 * step: the offers, a conversation, the agreement, the booking's contacts,
 * how to get in, a visit's photos, paying for a visit, rating, or just the
 * request.
 */
export type NotificationStep = "offers" | "messages" | "agreement" | "booked" | "guide" | "visit" | "pay" | "rate" | "request";

// Matched against the messages this tool writes (requests.ts, messages.ts,
// visits.ts), so notifications stored before steps existed land right too.
// A new message without a rule here opens the request at the top; the tests
// pin every message to its step.
const STEP_RULES: [RegExp, NotificationStep][] = [
  [/ offered to look after /, "offers"],
  [/ sent you a message about | replied about /, "messages"],
  [/ picked you to look after | It's your turn to review it\.| asked for a change to the agreement /, "agreement"],
  [/^You're booked\./, "booked"],
  [/ added how to get in /, "guide"],
  [/ arrived and is with /, "visit"],
  [/ You can pay for it now\./, "pay"],
  [/ paid \$[\d.]+ for the visit /, "visit"],
  [/ confirmed getting \$[\d.]+ for the visit /, "visit"],
  [/ marked looking after .+ as done\. .*Leave a rating\./, "rate"],
];

/** Which step of the request `message` is about. */
export function stepOf(message: string): NotificationStep {
  return STEP_RULES.find(([rule]) => rule.test(message))?.[1] ?? "request";
}

export interface Notification {
  id: number;
  requestId: string | null;
  /** Where opening it lands in the request. */
  step: NotificationStep;
  message: string;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

export interface NotificationChannel {
  send(userId: string, message: string, requestId: string | null): Promise<void>;
}

/** Stores the notification, then hands it to any extra channels. A channel failing never blocks the action. */
export async function notify(
  sql: Sql,
  userId: string,
  message: string,
  requestId: string | null,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  await sql`INSERT INTO notifications (user_id, request_id, message) VALUES (${userId}, ${requestId}, ${message})`;
  await Promise.allSettled(channels.map((channel) => channel.send(userId, message, requestId)));
}

/** The user's latest notifications, newest first. */
export async function listNotifications(sql: Sql, userId: string): Promise<Notification[]> {
  const rows = await sql<{ id: string; request_id: string | null; message: string; read_at: Date | null; created_at: Date }[]>`
    SELECT id, request_id, message, read_at, created_at FROM notifications
    WHERE user_id = ${userId}
    ORDER BY id DESC
    LIMIT 50
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    requestId: row.request_id,
    step: stepOf(row.message),
    message: row.message,
    read: row.read_at !== null,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function markAllRead(sql: Sql, userId: string): Promise<void> {
  await sql`UPDATE notifications SET read_at = NOW() WHERE user_id = ${userId} AND read_at IS NULL`;
}
