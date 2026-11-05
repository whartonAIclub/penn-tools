// Telling people when something needs them: a new offer, an accepted offer,
// an approval. Every notification is stored for the in-app list; extra
// channels (email, phone push) plug in through NotificationChannel once the
// platform offers one, without changing any caller.

import type { Sql } from "postgres";

export interface Notification {
  id: number;
  requestId: string | null;
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
    message: row.message,
    read: row.read_at !== null,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function markAllRead(sql: Sql, userId: string): Promise<void> {
  await sql`UPDATE notifications SET read_at = NOW() WHERE user_id = ${userId} AND read_at IS NULL`;
}
