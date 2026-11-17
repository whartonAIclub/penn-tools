"use client";

// Where the user's network lives, for every Penn Pals page.
//
// Signed in: in their Penn Tools account (contactsActions.ts), so it's on every
// device. The account always loads first. Contacts kept in this browser are
// never moved on their own (a shared computer's contacts belong to whoever used
// it, not whoever signs in next): the user is asked, and once a contact is in
// the account its browser copy is deleted. A contact that can't be moved stays
// in the browser and is named. Each contact is saved with the version it was
// loaded at: if another device saved it since, the newer copy is loaded and the
// user is told, instead of overwriting it.
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
  type SkippedContact,
} from "@penntools/tool-penn-pals";
import { deleteMyContacts, importMyContacts, loadMyContacts, saveMyContacts } from "./contactsActions";

/** An earlier version kept a full backup of moved contacts here; it's deleted now, wherever it's found. */
const LEGACY_BACKUP_KEY = `${CONTACTS_STORAGE_KEY}:moved-to-account`;

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
  /** How many contacts saved in this browser are waiting to be moved into the account, once the user agrees (0 if none, or if they said not now). */
  waiting: number;
  /** Moves the waiting contacts into the account. */
  moveWaiting: () => Promise<void>;
  /** Leaves them in the browser for now. */
  skipMove: () => void;
  /** Contacts that couldn't be moved and are still only in this browser. */
  stuck: SkippedContact[];
}

function readBrowser(): Contact[] {
  try {
    return parseStoredContacts(localStorage.getItem(CONTACTS_STORAGE_KEY));
  } catch {
    return []; // storage blocked (private window)
  }
}

function writeBrowser(contacts: Contact[]) {
  try {
    if (contacts.length === 0) localStorage.removeItem(CONTACTS_STORAGE_KEY);
    else localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

function removeLegacyBackup() {
  try {
    localStorage.removeItem(LEGACY_BACKUP_KEY);
  } catch {
    // Blocked: nothing to remove.
  }
}

export function useContacts(signedIn: boolean): ContactsStore {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [stuck, setStuck] = useState<SkippedContact[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  // What's on screen, and what's been saved: the next save sends the difference.
  const current = useRef<Contact[]>([]);
  const synced = useRef<Contact[]>([]);
  // The version of each contact as last loaded or saved.
  const versions = useRef(new Map<string, number>());
  // Saves run one at a time, in order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // One load at a time: React runs effects twice in development.
  const loading = useRef<Promise<void> | null>(null);

  /** Loads the account's contacts onto the screen. Returns false (with the error set) when it fails. */
  const loadAccount = useCallback(async (): Promise<boolean> => {
    let result;
    try {
      result = await loadMyContacts();
    } catch {
      setError("Couldn't reach your saved network. Check your connection and try again.");
      return false;
    }
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    const list = result.contacts.map((saved) => saved.contact);
    versions.current = new Map(result.contacts.map((saved) => [saved.contact.id, saved.version]));
    current.current = synced.current = list;
    setContacts(list);
    return true;
  }, []);

  const loadOnce = useCallback(async () => {
    if (!signedIn) {
      const local = readBrowser();
      current.current = synced.current = local;
      setContacts(local);
      return;
    }
    setError(null);
    setLoadFailed(false);
    if (!(await loadAccount())) {
      setLoadFailed(true);
      return;
    }
    removeLegacyBackup();
    // Browser contacts already in the account (from an earlier move) are just removed; the rest wait for the user's say-so.
    const inAccount = new Set(current.current.map((c) => c.id));
    const local = readBrowser();
    const others = local.filter((c) => !inAccount.has(c.id));
    if (others.length < local.length) writeBrowser(others);
    setWaiting(others.length);
  }, [signedIn, loadAccount]);

  const load = useCallback(() => {
    loading.current ??= loadOnce().finally(() => {
      loading.current = null;
    });
    return loading.current;
  }, [loadOnce]);

  useEffect(() => {
    void load();
  }, [load]);

  const moveWaiting = useCallback(async () => {
    const local = readBrowser();
    const left: Contact[] = [];
    const notMoved: SkippedContact[] = [];
    let added = 0;
    let failed = false;
    for (const batch of batchContacts(local)) {
      if (failed) {
        left.push(...batch);
        continue;
      }
      let result;
      try {
        result = await importMyContacts(batch);
      } catch {
        result = { ok: false as const, error: "Couldn't reach your saved network. Check your connection and try again." };
      }
      if (!result.ok) {
        failed = true;
        setError(`Couldn't move all your contacts from this browser into your account: ${result.error}`);
        left.push(...batch);
        continue;
      }
      added += result.addedIds.length;
      const skippedIds = new Set(result.skipped.map((s) => s.id));
      for (const contact of batch) if (skippedIds.has(contact.id)) left.push(contact);
      notMoved.push(...result.skipped);
    }
    writeBrowser(left); // what's in the account no longer needs a copy here
    setStuck(notMoved);
    setWaiting(left.length);
    if (await loadAccount()) {
      setMoved(added);
      if (!failed) setError(null);
    }
  }, [loadAccount]);

  const skipMove = useCallback(() => setWaiting(0), []);

  /** Loads the newer copies of contacts another device saved, and says so. Returns false: the save didn't go through. */
  const resolveConflicts = useCallback(
    async (conflictIds: string[], names: Map<string, string>): Promise<boolean> => {
      const mine = current.current;
      let result;
      try {
        result = await loadMyContacts();
      } catch {
        setError("Some changes weren't saved because another device changed those contacts. Check your connection and try again.");
        return false;
      }
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      const latest = new Map(result.contacts.map((saved) => [saved.contact.id, saved]));
      const conflicted = new Set(conflictIds);
      const replaced = mine
        .map((c) => (conflicted.has(c.id) ? latest.get(c.id)?.contact : c))
        .filter((c): c is Contact => c !== undefined);
      for (const id of conflictIds) {
        const saved = latest.get(id);
        if (saved) versions.current.set(id, saved.version);
        else versions.current.delete(id);
      }
      // Contacts another device added that this screen has never shown.
      const shown = new Set(replaced.map((c) => c.id));
      for (const saved of result.contacts) {
        if (!shown.has(saved.contact.id) && !versions.current.has(saved.contact.id)) {
          replaced.push(saved.contact);
          versions.current.set(saved.contact.id, saved.version);
        }
      }
      current.current = synced.current = replaced;
      setContacts(replaced);
      const who = conflictIds.map((id) => names.get(id) ?? "A contact");
      setError(
        `${who.join(", ")} ${who.length === 1 ? "was" : "were"} changed on another device, so your change to ${who.length === 1 ? "it" : "them"} wasn't saved. The latest version is showing: please make your change again.`,
      );
      return false;
    },
    [],
  );

  /** Sends what's on screen but not yet saved. True when the account matches the screen. */
  const flush = useCallback(async (): Promise<boolean> => {
    const target = current.current;
    const { changed, removedIds } = contactChanges(synced.current, target);
    const conflicts: string[] = [];
    const names = new Map(changed.map((c) => [c.id, c.name]));
    try {
      for (const batch of batchContacts(changed)) {
        const items = batch.map((contact) => ({ contact, version: versions.current.get(contact.id) ?? null }));
        const result = await saveMyContacts(items);
        if (!result.ok) throw new Error(result.error);
        for (const [id, version] of Object.entries(result.versions)) versions.current.set(id, version);
        conflicts.push(...result.conflicts);
      }
      if (removedIds.length > 0) {
        const result = await deleteMyContacts(removedIds);
        if (!result.ok) throw new Error(result.error);
        for (const id of removedIds) versions.current.delete(id);
      }
    } catch (failure) {
      setError(
        `Your latest changes aren't saved to your account yet. ${failure instanceof Error ? failure.message : ""}`.trim(),
      );
      return false;
    }
    if (conflicts.length > 0) return resolveConflicts(conflicts, names);
    synced.current = target;
    setError(null);
    return true;
  }, [resolveConflicts]);

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

  return { contacts, save, where: signedIn ? "account" : "browser", error, retry, moved, waiting, moveWaiting, skipMove, stuck };
}
