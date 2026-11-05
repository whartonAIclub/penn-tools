// Messages about a request: one thread per sitter, between that sitter and the
// owner. Any sitter may ask about an open request; once the owner picks
// someone, only the picked sitter's thread stays open, until the booking is
// done. Emails stay hidden, so people sort out details here.

import type { Sql } from "postgres";
import { assertActive } from "./members.js";
import type { RequestStatus } from "./booking.js";
import { notify, type NotificationChannel } from "./notifications.js";
import { PennPawsError, UUID_RE, firstName, type Person } from "./requests.js";
import { LIMITS } from "./survey.js";

export interface Message {
  fromOwner: boolean;
  /** Whether the viewer wrote it. */
  mine: boolean;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
}

export interface Thread {
  id: string;
  sitterFirstName: string;
  /** Whether the viewer may send in this thread now. */
  canSend: boolean;
  messages: Message[];
}

/** Whether a thread may get new messages: any thread while the request is open, then only the picked sitter's. */
export function canMessage(status: RequestStatus, pickedSitter: boolean): boolean {
  if (status === "open") return true;
  return pickedSitter && (status === "matched" || status === "agreed");
}

interface RequestFacts {
  owner_id: string;
  owner_name: string;
  pet_name: string;
  status: RequestStatus;
  picked_sitter: string | null;
}

async function requestFacts(sql: Sql, requestId: string): Promise<RequestFacts | null> {
  if (!UUID_RE.test(requestId)) return null;
  const [row] = await sql<RequestFacts[]>`
    SELECT r.owner_id, r.owner_name, r.pet_name, r.status,
           (SELECT o.sitter_id FROM offers o WHERE o.request_id = r.id AND o.status = 'accepted') AS picked_sitter
    FROM requests r WHERE r.id = ${requestId}
  `;
  return row ?? null;
}

/**
 * The threads the viewer may read on a request: every thread for the owner,
 * the sitter's own for a sitter (possibly empty, so they can start one).
 */
export async function listThreads(sql: Sql, viewerId: string, requestId: string): Promise<Thread[]> {
  const facts = await requestFacts(sql, requestId);
  if (!facts) return [];
  const isOwner = facts.owner_id === viewerId;
  const threads = await sql<{ id: string; sitter_id: string; sitter_name: string }[]>`
    SELECT id, sitter_id, sitter_name FROM threads
    WHERE request_id = ${requestId} ${isOwner ? sql`` : sql`AND sitter_id = ${viewerId}`}
    ORDER BY created_at
  `;
  const ids = threads.map((t) => t.id);
  const messages = ids.length
    ? await sql<{ thread_id: string; from_owner: boolean; body: string; created_at: Date }[]>`
        SELECT thread_id, from_owner, body, created_at FROM messages
        WHERE thread_id IN ${sql(ids)}
        ORDER BY id
      `
    : [];

  const toThread = (id: string, sitterId: string, sitterName: string): Thread => ({
    id,
    sitterFirstName: firstName(sitterName),
    canSend: canMessage(facts.status, facts.picked_sitter === sitterId),
    messages: messages
      .filter((m) => m.thread_id === id)
      .map((m) => ({ fromOwner: m.from_owner, mine: m.from_owner === isOwner, body: m.body, createdAt: m.created_at.toISOString() })),
  });

  const list = threads.map((t) => toThread(t.id, t.sitter_id, t.sitter_name));
  // A sitter who hasn't written yet gets an empty thread to start, while they still can.
  if (!isOwner && list.length === 0 && canMessage(facts.status, facts.picked_sitter === viewerId)) {
    list.push({ id: "", sitterFirstName: "", canSend: true, messages: [] });
  }
  return list;
}

/**
 * Sends a message. A sitter writes in their own thread (started on first
 * message); the owner replies in the thread they name. The other person is
 * notified.
 */
export async function sendMessage(
  sql: Sql,
  sender: Person,
  requestId: string,
  body: string,
  threadId: string | null,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  const text = body.trim().slice(0, LIMITS.message);
  if (!text) throw new PennPawsError("Write a message first.");
  await assertActive(sql, sender.id);
  const facts = await requestFacts(sql, requestId);
  if (!facts) throw new PennPawsError("That request doesn't exist.");

  if (facts.owner_id === sender.id) {
    if (!threadId || !UUID_RE.test(threadId)) throw new PennPawsError("Pick who to reply to.");
    const [thread] = await sql<{ sitter_id: string }[]>`SELECT sitter_id FROM threads WHERE id = ${threadId} AND request_id = ${requestId}`;
    if (!thread) throw new PennPawsError("That conversation doesn't exist.");
    if (!canMessage(facts.status, facts.picked_sitter === thread.sitter_id)) throw new PennPawsError("This conversation is closed.");
    await sql`INSERT INTO messages (thread_id, from_owner, body) VALUES (${threadId}, TRUE, ${text})`;
    await notify(sql, thread.sitter_id, `${firstName(facts.owner_name)} replied about ${facts.pet_name}.`, requestId, channels);
    return;
  }

  if (!canMessage(facts.status, facts.picked_sitter === sender.id)) throw new PennPawsError("This request already has a sitter.");
  const [thread] = await sql<{ id: string }[]>`
    INSERT INTO threads (request_id, sitter_id, sitter_name) VALUES (${requestId}, ${sender.id}, ${sender.name})
    ON CONFLICT (request_id, sitter_id) DO UPDATE SET sitter_name = EXCLUDED.sitter_name
    RETURNING id
  `;
  await sql`INSERT INTO messages (thread_id, from_owner, body) VALUES (${thread!.id}, FALSE, ${text})`;
  await notify(sql, facts.owner_id, `${firstName(sender.name)} sent you a message about ${facts.pet_name}.`, requestId, channels);
}
