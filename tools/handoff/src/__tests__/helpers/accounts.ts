// Test-only helpers shared by the store's database tests: more labelled TEST accounts, the notifications one change stored, and a way
// to let an account list tickets with a payment handle saved before follow-on Batch 1. (They lived in email-db.ts beside the email
// helpers, which went with outbound email: review of PR #88.) Nothing here touches the handoff schema or the live world.
import type { Sql } from "postgres";
import { ensurePerson } from "../../store.js";
import type { Actor, NotificationLink, WorldId } from "../../types.js";
import type { StoreWorld } from "./live-store.js";

/** More labelled TEST accounts (made-up ids; C-CONTRACT §6), beside live-store.ts's A, B and C. */
const testActor = (x: string): Actor => ({ id: `handoff-test-${x}`, name: `Handoff Test ${x.toUpperCase()}`, email: `handoff-test-${x}@example.invalid` });
export const TEST_D = testActor("d");
export const TEST_E = testActor("e");
export const TEST_F = testActor("f");
export const TEST_G = testActor("g");
export const TEST_H = testActor("h");

/** A notification as stored, with the change that stored it. */
export interface StoredNote {
  id: string;
  userId: string;
  text: string;
  link: NotificationLink | null;
}

/** The notifications one change stored (the store keys each by the change's request id and its text: RB-10). */
export async function changeNotes(sql: Sql, worldId: WorldId, requestId: string): Promise<StoredNote[]> {
  const rows = await sql<{ id: string; user_id: string; text: string; link: NotificationLink | null }[]>`
    SELECT id, user_id, text, link FROM notifications
    WHERE world_id = ${worldId} AND dedupe = md5(${requestId} || E'\n' || text)
    ORDER BY at, id`;
  return rows.map((r) => ({ id: r.id, userId: r.user_id, text: r.text, link: r.link }));
}

/**
 * Lets a TEST account list tickets before and after follow-on Batch 1: its profile row, with a payment handle saved before Batch 1's
 * methods (a legacy handle, which listings and reservations still accept).
 */
export async function canSell(w: StoreWorld, actor: Actor): Promise<void> {
  await ensurePerson(w.sql, actor);
  await w.sql`UPDATE people SET pay_handle = ${`@${actor.id}`} WHERE user_id = ${actor.id}`;
}
