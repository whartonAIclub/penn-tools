// The local capture: an EmailSender that sends nothing (FOLLOWON-PLAN §2.4). sqlCaptureSender keeps each email it's given in
// email_capture, Handoff's own outbox for development and test worlds, once per idempotency key (INSERT … ON CONFLICT DO NOTHING),
// as a provider with idempotency keys would deliver it once. memoryCaptureSender keeps them in memory for unit tests, with failures
// a test can inject. scripts/email-captures.mjs prints a test world's outbox, each recipient masked.
// Captures are kept 7 days (dispatch.ts prunes them) and cascade away with their job, notification and world.

import type { Sql } from "postgres";
import type { WorldId } from "../types.js";
import { cleanAddress } from "./gates.js";
import type { EmailMessage, EmailSender, SendErrorCode, SendResult } from "./types.js";

const TEST_WORLD = /^test-[a-z0-9-]{1,40}$/;
const NOTE_ID = /^[0-9a-z-]{1,48}$/;
const KEY = /^handoff:(live|test-[a-z0-9-]{1,40}):([0-9a-z-]{1,48})$/;
/** email_capture's column limits. */
const LIMITS = { key: 120, to: 254, subject: 200, text: 4000, url: 600 } as const;

/** The idempotency key of a notification's email: the same on every retry. */
export function idempotencyKey(worldId: WorldId, notificationId: string): string {
  if (!(worldId === "live" || TEST_WORLD.test(worldId)) || !NOTE_ID.test(notificationId)) {
    throw new TypeError("Handoff: an idempotency key needs a world id and a notification id.");
  }
  return `handoff:${worldId}:${notificationId}`;
}

/** The world and notification an idempotency key names, or null. */
export function parseIdempotencyKey(key: unknown): { worldId: WorldId; notificationId: string } | null {
  if (typeof key !== "string") return null;
  const m = KEY.exec(key);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { worldId: m[1] as WorldId, notificationId: m[2] };
}

const tooLong = (v: string | undefined, max: number): boolean => v !== undefined && Array.from(v).length > max;
const refused = (code: SendErrorCode): SendResult => ({ ok: false, retryable: false, code });

/**
 * The capture as a sender: each email goes into email_capture for its test world, never anywhere else. A second send with the same
 * key (a retry after a crash) captures nothing more. It refuses the live world and anything its table can't hold.
 */
export function sqlCaptureSender(sql: Sql): EmailSender {
  return Object.freeze({
    kind: "capture" as const,
    allows: () => true,
    async ready(): Promise<boolean> {
      try {
        await sql`SELECT 1 FROM email_capture LIMIT 0`;
        return true;
      } catch {
        return false;
      }
    },
    async send(m: EmailMessage): Promise<SendResult> {
      const target = parseIdempotencyKey(m.idempotencyKey);
      if (target === null || target.worldId === "live") return refused("rejected");
      const to = cleanAddress(m.to);
      const url = m.actionUrl ?? "";
      if (to === null || tooLong(to, LIMITS.to) || tooLong(m.subject, LIMITS.subject) || tooLong(m.text, LIMITS.text) || tooLong(url, LIMITS.url)) {
        return refused("rejected");
      }
      await sql`
        INSERT INTO email_capture (idempotency_key, world_id, notification_id, to_address, subject, body_text, action_url)
        VALUES (${m.idempotencyKey}, ${target.worldId}, ${target.notificationId}, ${to}, ${m.subject}, ${m.text}, ${url})
        ON CONFLICT (idempotency_key) DO NOTHING`;
      return { ok: true, providerId: null };
    },
  });
}

/** What a memory capture saw: every attempt, and the emails it accepted (one per idempotency key). */
export interface MemoryCaptureSender extends EmailSender {
  readonly attempts: readonly EmailMessage[];
  readonly sent: readonly EmailMessage[];
}

/**
 * A capture in memory, for unit tests. `failWith` answers an attempt instead of capturing it (return undefined to capture); `ready`
 * says what ready() returns; `kind` "provider" stands in for a real provider (its allows is then providerAllows, passed as `allows`).
 */
export function memoryCaptureSender(o: {
  failWith?: (m: EmailMessage, attempt: number) => SendResult | undefined;
  ready?: boolean;
  kind?: "capture" | "provider";
  allows?: EmailSender["allows"];
} = {}): MemoryCaptureSender {
  const attempts: EmailMessage[] = [];
  const sent: EmailMessage[] = [];
  const keys = new Set<string>();
  return {
    kind: o.kind ?? "capture",
    attempts,
    sent,
    allows: o.allows ?? (() => true),
    ready: async () => o.ready ?? true,
    async send(m: EmailMessage): Promise<SendResult> {
      attempts.push(m);
      const failed = o.failWith?.(m, attempts.length);
      if (failed) return failed;
      if (!keys.has(m.idempotencyKey)) {
        keys.add(m.idempotencyKey);
        sent.push(m);
      }
      return { ok: true, providerId: `memory-${sent.length}` };
    },
  };
}

