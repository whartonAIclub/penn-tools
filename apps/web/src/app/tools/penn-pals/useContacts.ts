"use client";

// Where the user's network lives, for every Penn Pals page.
//
// Signed in: in their Penn Tools account (contactsActions.ts), so it's on every
// device. The first time, contacts kept in this browser are moved into the
// account (never overwriting the account's), and the browser copy is kept
// under a backup key rather than deleted. Saves send only what changed, so a
// device with an older list can't erase what another device added.
//
// Signed out: in this browser only, as before.
//
// The page updates at once; a save that doesn't reach the account is kept and
// sent again with the next save or with retry().

import { useCallback, useEffect, useRef, useState } from "react";
import {
  batchContacts,
  CONTACTS_STORAGE_KEY,
  contactChanges,
  parseStoredContacts,
  type Contact,
} from "@penntools/tool-penn-pals";
import { deleteMyContacts, importMyContacts, loadMyContacts, saveMyContacts } from "./contactsActions";

/** Where browser contacts go once they're in the account: kept as a backup, not deleted. */
export const MOVED_STORAGE_KEY = `${CONTACTS_STORAGE_KEY}:moved-to-account`;

export interface ContactsStore {
  /** Null while loading. */
  contacts: Contact[] | null;
  /** Shows `next` at once and saves it; resolves true once it's saved (in the account when signed in). */
  save: (next: Contact[]) => Promise<boolean>;
  /** "account" when signed in, "browser" otherwise. */
  where: "account" | "browser";
  /** What went wrong with loading or saving, until it works. */
  error: string | null;
  /** Tries again: loads if loading failed, otherwise sends unsaved changes. */
  retry: () => void;
  /** How many contacts were just moved from this browser into the account (0 if none). */
  moved: number;
}

function readBrowser(key = CONTACTS_STORAGE_KEY): Contact[] {
  try {
    return parseStoredContacts(localStorage.getItem(key));
  } catch {
    return []; // storage blocked (private window)
  }
}

function writeBrowser(contacts: Contact[]) {
  try {
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

/** Moves the browser's contacts aside once they're in the account; a later move adds to the backup. */
function keepBrowserBackup(contacts: Contact[]) {
  try {
    const backup = readBrowser(MOVED_STORAGE_KEY);
    const ids = new Set(contacts.map((c) => c.id));
    localStorage.setItem(MOVED_STORAGE_KEY, JSON.stringify([...contacts, ...backup.filter((c) => !ids.has(c.id))]));
    localStorage.removeItem(CONTACTS_STORAGE_KEY);
  } catch {
    // Can't touch storage: the contacts are in the account anyway, and moving again adds nothing.
  }
}

export function useContacts(signedIn: boolean): ContactsStore {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  // What's on screen, and what's been saved: the next save sends the difference.
  const current = useRef<Contact[]>([]);
  const synced = useRef<Contact[]>([]);
  // Saves run one at a time, in order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // One load at a time: React runs effects twice in development, and the move must not race itself.
  const loading = useRef<Promise<void> | null>(null);

  const loadOnce = useCallback(async () => {
    if (!signedIn) {
      const local = readBrowser();
      current.current = synced.current = local;
      setContacts(local);
      return;
    }
    setError(null);
    setLoadFailed(false);
    const local = readBrowser();
    let added = 0;
    for (const batch of batchContacts(local)) {
      const result = await importMyContacts(batch);
      if (!result.ok) {
        setError(`Couldn't move your contacts from this browser into your account: ${result.error}`);
        setLoadFailed(true);
        return;
      }
      added += result.added;
    }
    if (local.length > 0) keepBrowserBackup(local);
    const result = await loadMyContacts();
    if (!result.ok) {
      setError(result.error);
      setLoadFailed(true);
      return;
    }
    current.current = synced.current = result.contacts;
    setContacts(result.contacts);
    setMoved(added);
  }, [signedIn]);

  const load = useCallback(() => {
    loading.current ??= loadOnce().finally(() => {
      loading.current = null;
    });
    return loading.current;
  }, [loadOnce]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Sends what's on screen but not yet saved. True when the account matches the screen. */
  const flush = useCallback(async (): Promise<boolean> => {
    const target = current.current;
    const { changed, removedIds } = contactChanges(synced.current, target);
    try {
      for (const batch of batchContacts(changed)) {
        const result = await saveMyContacts(batch);
        if (!result.ok) throw new Error(result.error);
      }
      if (removedIds.length > 0) {
        const result = await deleteMyContacts(removedIds);
        if (!result.ok) throw new Error(result.error);
      }
      synced.current = target;
      setError(null);
      return true;
    } catch (failure) {
      setError(
        `Your latest changes aren't saved to your account yet. ${failure instanceof Error ? failure.message : ""}`.trim(),
      );
      return false;
    }
  }, []);

  const save = useCallback(
    (next: Contact[]): Promise<boolean> => {
      current.current = next;
      setContacts(next);
      if (!signedIn) {
        writeBrowser(next);
        synced.current = next;
        return Promise.resolve(true);
      }
      const run = queue.current.then(flush);
      queue.current = run.catch(() => undefined);
      return run;
    },
    [signedIn, flush],
  );

  const retry = useCallback(() => {
    if (loadFailed) {
      void load();
      return;
    }
    queue.current = queue.current.then(flush).catch(() => undefined);
  }, [loadFailed, load, flush]);

  return { contacts, save, where: signedIn ? "account" : "browser", error, retry, moved };
}
