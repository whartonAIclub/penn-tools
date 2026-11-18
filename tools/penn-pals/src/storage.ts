// ─────────────────────────────────────────────────────────────────────────────
// Penn Pals' contacts for signed-in users, in the tool's own `contacts` table
// (schema.sql), so a user's network is there on every device they sign in on.
// Callers pass the database client (toolSql("pennpals")) and the signed-in
// user's id; every query is scoped to that user.
//
// Saves are per contact, never the whole list: a device showing an older list
// must not erase contacts another device added since. Each contact has a
// version, and a save names the version it was based on: if another device has
// saved that contact since, the save is refused for it (a conflict) and the
// page loads the newer copy. Every contact is checked against the Contact shape
// and size limits on the way in and on the way out, and a user's total storage
// is capped.
// ─────────────────────────────────────────────────────────────────────────────

import type { JSONValue, Sql, TransactionSql } from "postgres";
import { checkContactLimits, parseContact, type Contact } from "./contacts.js";
import { recordChanges } from "./metrics.js";

/**
 * The transaction as a query function. postgres.js's TransactionSql type drops
 * the call signature (a known gap in its types; it is callable at runtime).
 */
function query(tx: TransactionSql): Sql {
  return tx as unknown as Sql;
}

/** Rows as a JSONB parameter (sql.json stores the value itself, not a JSON string). */
function json(sql: Sql, value: unknown) {
  return sql.json(value as JSONValue);
}

/** Most contacts one user can keep: far beyond a real network, a guard against runaway writes. */
export const MAX_CONTACTS = 2000;
/** Largest single contact, as JSON: room for long notes over many chats. */
export const MAX_CONTACT_BYTES = 200_000;
/** Most a user's contacts can take up in all, as stored. */
export const MAX_USER_BYTES = 8_000_000;
/** Longest contact id accepted (the browser makes UUIDs). */
export const MAX_ID_LENGTH = 100;
/** Most bytes of contacts per save request: under Next.js's 1 MB server action limit, with room. */
export const MAX_BATCH_BYTES = 700_000;

/** A save or import that would take the user past a storage limit. */
export class ContactLimitError extends Error {
  constructor(message = `You can keep up to ${MAX_CONTACTS.toLocaleString()} contacts.`) {
    super(message);
    this.name = "ContactLimitError";
  }
}

/** JSON with object keys in a fixed order, so two equal contacts compare equal however their keys were written. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** One contact sent from the browser, checked: the contact, or a message saying what's wrong. */
function checkOne(item: unknown): { contact: Contact } | { error: string; name: string } {
  const contact = parseContact(item);
  if (!contact) return { error: "A contact couldn't be read. Reload the page and try again.", name: "A contact" };
  const fail = (error: string) => ({ error, name: contact.name });
  if (!contact.id || contact.id.length > MAX_ID_LENGTH) return fail("A contact has a bad id.");
  if (jsonBytes(contact) > MAX_CONTACT_BYTES) return fail(`${contact.name}'s notes are too long to save. Shorten them and try again.`);
  const tooBig = checkContactLimits(contact);
  if (tooBig) return fail(tooBig);
  return { contact };
}

/**
 * Contacts sent from the browser, checked: a list of valid contacts with
 * distinct ids, each within the size limits. A problem is a message to show.
 */
export function checkContacts(items: unknown): { ok: true; contacts: Contact[] } | { ok: false; error: string } {
  if (!Array.isArray(items)) return { ok: false, error: "Contacts must be a list." };
  if (items.length > MAX_CONTACTS) return { ok: false, error: `You can keep up to ${MAX_CONTACTS.toLocaleString()} contacts.` };
  const contacts: Contact[] = [];
  const ids = new Set<string>();
  for (const item of items as unknown[]) {
    const checked = checkOne(item);
    if ("error" in checked) return { ok: false, error: checked.error };
    if (ids.has(checked.contact.id)) return { ok: false, error: "The same contact was sent twice." };
    ids.add(checked.contact.id);
    contacts.push(checked.contact);
  }
  return { ok: true, contacts };
}

/** A contact that couldn't be accepted, and why. */
export interface SkippedContact {
  id: string;
  name: string;
  reason: string;
}

/**
 * Like checkContacts, but one bad contact doesn't spoil the rest: the valid
 * ones come back, and the others are listed so the user can be told. For the
 * move from the browser, where a single bad contact must not block everything.
 */
export function sortContacts(items: unknown): { contacts: Contact[]; skipped: SkippedContact[] } | null {
  if (!Array.isArray(items) || items.length > MAX_CONTACTS) return null;
  const contacts: Contact[] = [];
  const skipped: SkippedContact[] = [];
  const ids = new Set<string>();
  for (const item of items as unknown[]) {
    const checked = checkOne(item);
    if ("error" in checked) {
      const id = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : "";
      skipped.push({ id, name: checked.name, reason: checked.error });
    } else if (ids.has(checked.contact.id)) {
      skipped.push({ id: checked.contact.id, name: checked.contact.name, reason: "Sent twice." });
    } else {
      ids.add(checked.contact.id);
      contacts.push(checked.contact);
    }
  }
  return { contacts, skipped };
}

/** Ids, checked: a list of short strings. Null when it isn't one. */
export function checkIds(items: unknown): string[] | null {
  if (!Array.isArray(items) || items.length > MAX_CONTACTS) return null;
  return items.every((id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH) ? (items as string[]) : null;
}

/** A saved contact with the version a later save must name. */
export interface SavedContact {
  contact: Contact;
  version: number;
}

/** A contact to save, with the version it was loaded at (null for one the account doesn't have yet). */
export interface ContactToSave {
  contact: Contact;
  version: number | null;
}

/** Items to save, checked: each a valid contact with null or a whole-number version. */
export function checkSaveItems(items: unknown): { ok: true; items: ContactToSave[] } | { ok: false; error: string } {
  if (!Array.isArray(items)) return { ok: false, error: "Contacts must be a list." };
  const versions: (number | null)[] = [];
  for (const item of items as unknown[]) {
    const version = item && typeof item === "object" ? (item as { version?: unknown }).version : undefined;
    if (version !== null && !(typeof version === "number" && Number.isInteger(version) && version >= 1)) {
      return { ok: false, error: "A contact has a bad version. Reload the page and try again." };
    }
    versions.push(version);
  }
  const checked = checkContacts((items as { contact?: unknown }[]).map((item) => item?.contact));
  if (!checked.ok) return checked;
  return { ok: true, items: checked.contacts.map((contact, i) => ({ contact, version: versions[i] ?? null })) };
}

/** The user's contacts, most recently saved first, with their versions. Rows that no longer fit the shape are skipped. */
export async function listContacts(sql: Sql, userId: string): Promise<SavedContact[]> {
  const rows = await sql<{ data: unknown; version: number }[]>`
    SELECT data, version FROM contacts WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT ${MAX_CONTACTS}
  `;
  return rows.flatMap((row) => {
    const contact = parseContact(row.data);
    return contact ? [{ contact, version: row.version }] : [];
  });
}

/** How many contacts and bytes the user has saved. */
async function usage(sql: Sql, userId: string): Promise<{ saved: number; bytes: number }> {
  const [row] = await sql<{ saved: number; bytes: number }[]>`
    SELECT COUNT(*)::int AS saved, COALESCE(SUM(bytes), 0)::float8 AS bytes
    FROM contacts WHERE user_id = ${userId}
  `;
  return { saved: row?.saved ?? 0, bytes: row?.bytes ?? 0 };
}

/** Throws ContactLimitError when what's stored is past the user's limits (rolling back the transaction it's called in). */
async function enforceLimits(sql: Sql, userId: string): Promise<void> {
  const { saved, bytes } = await usage(sql, userId);
  if (saved > MAX_CONTACTS) throw new ContactLimitError();
  if (bytes > MAX_USER_BYTES) throw new ContactLimitError("Your network is too big to save more. Delete some contacts or shorten their notes.");
}

/** What a save did: the new version of each contact saved, the ones refused, and what changed. */
export interface SaveResult {
  versions: Record<string, number>;
  /** Contacts another device saved since this one was loaded: not saved. */
  conflicts: string[];
  /** Each saved contact as it was before (null if new) and after, for the caller's records. */
  changes: { before: Contact | null; after: Contact }[];
}

/**
 * Saves `items` (checked by checkSaveItems) in one transaction: new contacts
 * are added; changed ones are replaced if the account still has the version
 * they were based on, and otherwise reported in `conflicts`. Sending the same
 * save again after a lost reply changes nothing and isn't a conflict. Throws
 * ContactLimitError past the user's limits.
 */
export async function saveContacts(sql: Sql, userId: string, items: ContactToSave[]): Promise<SaveResult> {
  const result: SaveResult = { versions: {}, conflicts: [], changes: [] };
  if (items.length === 0) return result;
  await sql.begin(async (transaction) => {
    const tx = query(transaction);
    const ids = items.map((i) => i.contact.id);
    const existing = await tx<{ id: string; version: number; data: unknown }[]>`
      SELECT id, version, data FROM contacts WHERE user_id = ${userId} AND id = ANY(${ids}) FOR UPDATE
    `;
    const saved = new Map(existing.map((row) => [row.id, row]));

    const inserts: { id: string; data: Contact }[] = [];
    const updates: { id: string; data: Contact }[] = [];
    for (const { contact, version } of items) {
      const row = saved.get(contact.id);
      const before = row ? parseContact(row.data) : null;
      if (row && before && canonical(before) === canonical(contact)) {
        result.versions[contact.id] = row.version; // already saved: a repeat of an earlier attempt
      } else if (!row) {
        if (version !== null) {
          result.conflicts.push(contact.id); // deleted on another device
        } else {
          inserts.push({ id: contact.id, data: contact });
          result.changes.push({ before: null, after: contact });
        }
      } else if (version === null || row.version !== version) {
        result.conflicts.push(contact.id);
      } else {
        updates.push({ id: contact.id, data: contact });
        result.changes.push({ before, after: contact });
      }
    }

    if (inserts.length > 0) {
      const rows = await tx<{ id: string; version: number }[]>`
        INSERT INTO contacts (user_id, id, data, bytes)
        SELECT ${userId}, r.id, r.data, octet_length(r.data::text) FROM jsonb_to_recordset(${json(tx, inserts)}) AS r(id text, data jsonb)
        RETURNING id, version
      `;
      for (const row of rows) result.versions[row.id] = row.version;
    }
    if (updates.length > 0) {
      const rows = await tx<{ id: string; version: number }[]>`
        UPDATE contacts c SET data = r.data, bytes = octet_length(r.data::text), version = c.version + 1, updated_at = NOW()
        FROM jsonb_to_recordset(${json(tx, updates)}) AS r(id text, data jsonb)
        WHERE c.user_id = ${userId} AND c.id = r.id
        RETURNING c.id, c.version
      `;
      for (const row of rows) result.versions[row.id] = row.version;
    }
    await enforceLimits(tx, userId);

    // The team's counts come from what was saved, in the same transaction. They can never stop a save:
    // a failure is undone back to the savepoint, logged, and the save goes on.
    try {
      await transaction.savepoint(async (savepoint) => recordChanges(query(savepoint as unknown as TransactionSql), userId, result.changes));
    } catch (error) {
      console.error("[penn-pals] couldn't record usage counts", error);
    }
  });
  return result;
}

/** Deletes the user's contacts with these ids; other users' are never touched. */
export async function deleteContacts(sql: Sql, userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`DELETE FROM contacts WHERE user_id = ${userId} AND id = ANY(${ids})`;
}

/**
 * The move of contacts kept in the browser into the user's account: adds those
 * the account doesn't have and never overwrites one it does (the account's copy
 * may be newer, from another device). Returns the ids added.
 */
export async function importContacts(sql: Sql, userId: string, contacts: Contact[]): Promise<string[]> {
  if (contacts.length === 0) return [];
  return sql.begin(async (transaction) => {
    const tx = query(transaction);
    const rows = await tx<{ id: string }[]>`
      INSERT INTO contacts (user_id, id, data, bytes)
      SELECT ${userId}, r.id, r.data, octet_length(r.data::text)
      FROM jsonb_to_recordset(${json(tx, contacts.map((c) => ({ id: c.id, data: c })))}) AS r(id text, data jsonb)
      ON CONFLICT (user_id, id) DO NOTHING
      RETURNING id
    `;
    await enforceLimits(tx, userId);
    return rows.map((row) => row.id);
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
