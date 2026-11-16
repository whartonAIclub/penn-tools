// ─────────────────────────────────────────────────────────────────────────────
// Penn Pals' contacts for signed-in users, in the tool's own `contacts` table
// (schema.sql), so a user's network is there on every device they sign in on.
// Callers pass the database client (toolSql("pennpals")) and the signed-in
// user's id; every query is scoped to that user.
//
// Saves are per contact, never the whole list: a device showing an older list
// must not erase contacts another device added since. The latest save of a
// contact wins. Every contact is checked against the Contact shape on the way
// in and on the way out.
// ─────────────────────────────────────────────────────────────────────────────

import type { JSONValue, Sql, TransactionSql } from "postgres";

/**
 * The transaction as a query function. postgres.js's TransactionSql type drops
 * the call signature (a known gap in its types; it is callable at runtime).
 */
function query(tx: TransactionSql): Sql {
  return tx as unknown as Sql;
}

/**
 * The contact as a JSONB parameter. A JSON string with ::jsonb would be stored
 * as a JSON *string*, not an object; sql.json stores the object itself.
 */
function json(sql: Sql, contact: Contact) {
  return sql.json(contact as unknown as JSONValue);
}
import { parseContact, type Contact } from "./contacts.js";

/** Most contacts one user can keep: far beyond a real network, a guard against runaway writes. */
export const MAX_CONTACTS = 2000;
/** Largest single contact, as JSON: room for long notes over many chats. */
export const MAX_CONTACT_BYTES = 200_000;
/** Longest contact id accepted (the browser makes UUIDs). */
export const MAX_ID_LENGTH = 100;
/** Most bytes of contacts per save request: under Next.js's 1 MB server action limit, with room. */
export const MAX_BATCH_BYTES = 700_000;

/** A save or import that would take the user past MAX_CONTACTS. */
export class ContactLimitError extends Error {
  constructor() {
    super(`You can keep up to ${MAX_CONTACTS.toLocaleString()} contacts.`);
    this.name = "ContactLimitError";
  }
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Contacts sent from the browser, checked: a list of valid contacts with
 * distinct ids, each within MAX_CONTACT_BYTES. A problem is a message to show.
 */
export function checkContacts(items: unknown): { ok: true; contacts: Contact[] } | { ok: false; error: string } {
  if (!Array.isArray(items)) return { ok: false, error: "Contacts must be a list." };
  if (items.length > MAX_CONTACTS) return { ok: false, error: `You can keep up to ${MAX_CONTACTS.toLocaleString()} contacts.` };
  const contacts: Contact[] = [];
  const ids = new Set<string>();
  for (const item of items as unknown[]) {
    const contact = parseContact(item);
    if (!contact) return { ok: false, error: "A contact couldn't be read. Reload the page and try again." };
    if (!contact.id || contact.id.length > MAX_ID_LENGTH) return { ok: false, error: "A contact has a bad id." };
    if (ids.has(contact.id)) return { ok: false, error: "The same contact was sent twice." };
    if (jsonBytes(contact) > MAX_CONTACT_BYTES) {
      return { ok: false, error: `${contact.name}'s notes are too long to save. Shorten them and try again.` };
    }
    ids.add(contact.id);
    contacts.push(contact);
  }
  return { ok: true, contacts };
}

/** Ids, checked: a list of short strings. Null when it isn't one. */
export function checkIds(items: unknown): string[] | null {
  if (!Array.isArray(items) || items.length > MAX_CONTACTS) return null;
  return items.every((id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH) ? (items as string[]) : null;
}

/** The user's contacts, most recently saved first. Rows that no longer fit the shape are skipped. */
export async function listContacts(sql: Sql, userId: string): Promise<Contact[]> {
  const rows = await sql<{ data: unknown }[]>`
    SELECT data FROM contacts WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT ${MAX_CONTACTS}
  `;
  return rows.flatMap((row) => {
    const contact = parseContact(row.data);
    return contact ? [contact] : [];
  });
}

/** How many of `contacts` the user doesn't have yet, and how many they have. */
async function counts(sql: Sql, userId: string, contacts: Contact[]): Promise<{ newOnes: number; saved: number }> {
  const ids = contacts.map((c) => c.id);
  const [row] = await sql<{ saved: number; existing: number }[]>`
    SELECT
      COUNT(*)::int AS saved,
      COUNT(*) FILTER (WHERE id = ANY(${ids}))::int AS existing
    FROM contacts WHERE user_id = ${userId}
  `;
  return { newOnes: ids.length - (row?.existing ?? 0), saved: row?.saved ?? 0 };
}

/**
 * Saves `contacts` (checked by checkContacts), adding new ones and replacing
 * the user's saved versions of the rest. Throws ContactLimitError past MAX_CONTACTS.
 */
export async function saveContacts(sql: Sql, userId: string, contacts: Contact[]): Promise<void> {
  if (contacts.length === 0) return;
  await sql.begin(async (transaction) => {
    const tx = query(transaction);
    const { newOnes, saved } = await counts(tx, userId, contacts);
    if (saved + newOnes > MAX_CONTACTS) throw new ContactLimitError();
    for (const contact of contacts) {
      await tx`
        INSERT INTO contacts (user_id, id, data)
        VALUES (${userId}, ${contact.id}, ${json(tx, contact)})
        ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
    }
  });
}

/** Deletes the user's contacts with these ids; other users' are never touched. */
export async function deleteContacts(sql: Sql, userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`DELETE FROM contacts WHERE user_id = ${userId} AND id = ANY(${ids})`;
}

/**
 * The one-time move of contacts kept in the browser into the user's account:
 * adds those the account doesn't have and never overwrites one it does (the
 * account's copy may be newer, from another device). Returns how many were added.
 */
export async function importContacts(sql: Sql, userId: string, contacts: Contact[]): Promise<number> {
  if (contacts.length === 0) return 0;
  return sql.begin(async (transaction) => {
    const tx = query(transaction);
    const { newOnes, saved } = await counts(tx, userId, contacts);
    if (saved + newOnes > MAX_CONTACTS) throw new ContactLimitError();
    let added = 0;
    for (const contact of contacts) {
      const rows = await tx`
        INSERT INTO contacts (user_id, id, data)
        VALUES (${userId}, ${contact.id}, ${json(tx, contact)})
        ON CONFLICT (user_id, id) DO NOTHING
        RETURNING id
      `;
      added += rows.length;
    }
    return added;
  });
}

/**
 * What changed between two versions of the list: the contacts that are new or
 * different in `after`, and the ids that are gone from it.
 */
export function contactChanges(before: Contact[], after: Contact[]): { changed: Contact[]; removedIds: string[] } {
  const old = new Map(before.map((c) => [c.id, c]));
  const changed = after.filter((c) => {
    const previous = old.get(c.id);
    return previous !== c && (!previous || JSON.stringify(previous) !== JSON.stringify(c));
  });
  const kept = new Set(after.map((c) => c.id));
  const removedIds = before.filter((c) => !kept.has(c.id)).map((c) => c.id);
  return { changed, removedIds };
}

/** `contacts` split into requests of at most MAX_BATCH_BYTES each (a lone bigger contact gets its own). */
export function batchContacts(contacts: Contact[], maxBytes = MAX_BATCH_BYTES): Contact[][] {
  const batches: Contact[][] = [];
  let batch: Contact[] = [];
  let size = 0;
  for (const contact of contacts) {
    const bytes = jsonBytes(contact);
    if (batch.length > 0 && size + bytes > maxBytes) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(contact);
    size += bytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
