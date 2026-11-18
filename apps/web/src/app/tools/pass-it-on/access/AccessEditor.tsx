"use client";

// Add a Penn email to the board's list, or remove one. Removing yourself asks
// first, since you lose access straight away.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styles from "../PassItOn.module.css";
import { grantAccessAction, revokeAccessAction } from "./actions";

export interface AccessRow {
  email: string;
  addedBy: string | null;
}

export function AccessEditor({ members, you }: { members: AccessRow[]; you: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      try {
        const result = await grantAccessAction(email);
        if (!result.ok) return setError(result.message);
        setNotice(result.data.added ? `Added ${email.trim()}.` : `${email.trim()} already has access.`);
        setEmail("");
        router.refresh();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });

  const remove = (target: string) => {
    if (target === you && !window.confirm("Remove yourself? You'll lose access to Pass It On straight away.")) return;
    start(async () => {
      setError(null);
      setNotice(null);
      try {
        const result = await revokeAccessAction(target);
        if (!result.ok) return setError(result.message);
        setNotice(`Removed ${target}.`);
        router.refresh();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  };

  return (
    <>
      <ul className={styles.list}>
        {members.map((m) => (
          <li key={m.email} className={styles.item}>
            <div className={styles.spread}>
              <span className={styles.itemTitle}>
                {m.email}
                {m.email === you && " (you)"}
              </span>
              <button
                type="button"
                className={styles.secondary}
                disabled={pending || members.length <= 1}
                title={members.length <= 1 ? "The last person can't be removed" : undefined}
                onClick={() => remove(m.email)}
              >
                Remove
              </button>
            </div>
            <span className={styles.muted}>{m.addedBy ? `Added by ${m.addedBy}` : "First member"}</span>
          </li>
        ))}
      </ul>
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) add();
        }}
      >
        <input
          className={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pennkey@wharton.upenn.edu"
          aria-label="Penn email to add"
        />
        <button className={styles.button} type="submit" disabled={pending || email.trim() === ""}>
          Add
        </button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.muted}>{notice}</p>}
    </>
  );
}
