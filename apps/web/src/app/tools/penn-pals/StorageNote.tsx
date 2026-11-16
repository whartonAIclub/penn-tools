"use client";

// One line on where the user's network is saved, with what to do when saving
// fails, and a note after contacts are moved from this browser into the account.

import type { ContactsStore } from "./useContacts";
import styles from "./StorageNote.module.css";

export function StorageNote({ store }: { store: ContactsStore }) {
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
    <p className={styles.note}>
      {store.moved > 0 && (
        <span className={styles.moved}>
          ✓ Moved {store.moved} {store.moved === 1 ? "contact" : "contacts"} from this browser into your account.{" "}
        </span>
      )}
      Saved to your Penn Tools account, on every device you sign in on.
    </p>
  );
}
