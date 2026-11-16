"use server";

// A signed-in user's contacts in Penn Pals' database (tools/penn-pals/src/storage.ts),
// so their network is on every device they sign in on. Every action checks
// sign-in and works only on that user's contacts; contacts from the browser are
// checked before they're stored. Errors come back as data, for the page to show.
// Requests stay under Next.js's 1 MB limit: the page sends saves in batches
// (batchContacts).

import { toolSql } from "@penntools/platform/db";
import {
  checkContacts,
  checkIds,
  ContactLimitError,
  deleteContacts,
  importContacts,
  listContacts,
  saveContacts,
  type Contact,
} from "@penntools/tool-penn-pals";
import { getCurrentUser } from "@/lib/auth";

export type ContactsResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const SIGN_IN = "Sign in to keep your network in your account.";
const UNAVAILABLE = "Couldn't reach your saved network. Check your connection and try again.";

/** The signed-in user and the database, or the error to show. */
async function access(): Promise<{ ok: true; userId: string; sql: NonNullable<ReturnType<typeof toolSql>> } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGN_IN };
  const sql = toolSql("pennpals");
  if (!sql) {
    console.error("[penn-pals] Penn Pals' database is not configured (check DATABASE_URL and setup-tools.mjs).");
    return { ok: false, error: UNAVAILABLE };
  }
  return { ok: true, userId: user.id, sql };
}

function failure(action: string, error: unknown): { ok: false; error: string } {
  if (error instanceof ContactLimitError) return { ok: false, error: error.message };
  console.error(`[penn-pals] couldn't ${action}`, error);
  return { ok: false, error: UNAVAILABLE };
}

/** The signed-in user's contacts. */
export async function loadMyContacts(): Promise<ContactsResult<{ contacts: Contact[] }>> {
  const db = await access();
  if (!db.ok) return db;
  try {
    return { ok: true, contacts: await listContacts(db.sql, db.userId) };
  } catch (error) {
    return failure("load contacts", error);
  }
}

/** Saves new and changed contacts (one batch). */
export async function saveMyContacts(contacts: unknown): Promise<ContactsResult<object>> {
  const db = await access();
  if (!db.ok) return db;
  const checked = checkContacts(contacts);
  if (!checked.ok) return checked;
  try {
    await saveContacts(db.sql, db.userId, checked.contacts);
    return { ok: true };
  } catch (error) {
    return failure("save contacts", error);
  }
}

/** Deletes contacts by id. */
export async function deleteMyContacts(ids: unknown): Promise<ContactsResult<object>> {
  const db = await access();
  if (!db.ok) return db;
  const checked = checkIds(ids);
  if (!checked) return { ok: false, error: "Couldn't delete that contact. Reload and try again." };
  try {
    await deleteContacts(db.sql, db.userId, checked);
    return { ok: true };
  } catch (error) {
    return failure("delete contacts", error);
  }
}

/** Moves contacts kept in the browser into the account (one batch), never overwriting the account's. */
export async function importMyContacts(contacts: unknown): Promise<ContactsResult<{ added: number }>> {
  const db = await access();
  if (!db.ok) return db;
  const checked = checkContacts(contacts);
  if (!checked.ok) return checked;
  try {
    return { ok: true, added: await importContacts(db.sql, db.userId, checked.contacts) };
  } catch (error) {
    return failure("import contacts", error);
  }
}
