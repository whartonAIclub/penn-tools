"use client";

// The admin page's list of admins: add one by email, or remove anyone but
// yourself.

import { useState, useTransition, type FormEvent } from "react";
import type { Admin } from "@penntools/core/repositories";
import buttons from "@/components/layout/Buttons.module.css";
import cardPage from "@/components/layout/CardPage.module.css";
import { addAdmin, removeAdmin, type AdminsResult } from "./actions";
import styles from "./page.module.css";

export function Admins({ initial, me }: { initial: Admin[]; me: string }) {
  const [list, setList] = useState(initial);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<AdminsResult>, failure: string, onDone?: () => void) {
    startTransition(async () => {
      let result;
      try {
        result = await action();
      } catch {
        setError(failure);
        return;
      }
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setList(result.admins);
      setError(null);
      onDone?.();
    });
  }

  function add(event: FormEvent) {
    event.preventDefault();
    run(() => addAdmin(email), "Couldn't add the admin. Try again.", () => setEmail(""));
  }

  function remove(target: string) {
    if (!window.confirm(`Remove ${target} as an admin?`)) return;
    run(() => removeAdmin(target), "Couldn't remove the admin. Try again.");
  }

  return (
    <div className={styles.admins}>
      <ul className={styles.adminList}>
        {list.map((admin) => (
          <li key={admin.email} className={styles.adminRow}>
            <div>
              <div>{admin.email}</div>
              <div className={cardPage.muted}>
                Added {admin.addedAt.toISOString().slice(0, 10)}
                {admin.addedBy ? ` by ${admin.addedBy}` : ""}
              </div>
            </div>
            {admin.email === me.toLowerCase() ? (
              <span className={cardPage.muted}>You</span>
            ) : (
              <button type="button" className={buttons.ghost} disabled={pending} onClick={() => remove(admin.email)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className={styles.addAdmin} onSubmit={add}>
        <input
          type="email"
          className={styles.emailInput}
          placeholder="name@wharton.upenn.edu"
          aria-label="Email of the admin to add"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
        <button type="submit" className={buttons.primary} disabled={pending || !email.trim()}>
          Add admin
        </button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
