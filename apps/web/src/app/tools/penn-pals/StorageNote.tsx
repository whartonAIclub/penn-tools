"use client";

// One line on where the user's network is saved, with what to do when saving
// fails, the question about moving contacts saved in this browser into the
// account, and a note on what was moved or couldn't be.

import { useState } from "react";
import type { ContactsStore } from "./useContacts";
import styles from "./StorageNote.module.css";

export function StorageNote({ store }: { store: ContactsStore }) {
  const [moving, setMoving] = useState(false);

  async function move() {
    setMoving(true);
    try {
      await store.moveWaiting();
    } finally {
      setMoving(false);
    }
  }

  if (store.error) {
    return (
      <p className={`${styles.note} ${styles.error}`} role="alert">
        {store.error}{" "}
        <button type="button" className={styles.retry} onClick={store.retry}>
          Try again
        </button>
      </p>
    );
  }
  if (store.where === "browser") {
    return (
      <p className={styles.note}>
        Saved in this browser only. <strong>Sign in</strong> (top right) to keep your network on every device.
      </p>
    );
  }
  return (
    <>
      {store.waiting > 0 && (
        <div className={`${styles.note} ${styles.ask}`} role="group" aria-label="Contacts saved in this browser">
          <p className={styles.askText}>
            Move {store.waiting} {store.waiting === 1 ? "contact" : "contacts"} saved in this browser into your account? They were
            saved here before you signed in. Moving them deletes the copy in this browser.
          </p>
          <div className={styles.askActions}>
            <button type="button" className={styles.askButton} onClick={move} disabled={moving}>
              {moving ? "Moving…" : "Move"}
            </button>
            <button type="button" className={styles.retry} onClick={store.skipMove} disabled={moving}>
              Not now
            </button>
          </div>
        </div>
      )}
      {store.stuck.length > 0 && (
        <p className={`${styles.note} ${styles.error}`} role="status">
          {store.stuck.length === 1 ? "1 contact couldn't be moved and is still only in this browser" : `${store.stuck.length} contacts couldn't be moved and are still only in this browser`}:{" "}
          {store.stuck.map((s) => (s.reason.includes(s.name) ? s.reason : `${s.name}: ${s.reason}`)).join(" ")}
        </p>
      )}
      <p className={styles.note}>
        {store.moved > 0 && (
          <span className={styles.moved}>
            ✓ Moved {store.moved} {store.moved === 1 ? "contact" : "contacts"} from this browser into your account.{" "}
          </span>
        )}
        Saved to your Penn Tools account, on every device you sign in on.
      </p>
    </>
  );
}
