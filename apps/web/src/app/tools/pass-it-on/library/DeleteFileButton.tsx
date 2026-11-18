"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteFile } from "../actions";
import styles from "../PassItOn.module.css";

export function DeleteFileButton({ id, filename }: { id: string; filename: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${filename}"? Its passages and any lessons taken from it are removed too. This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteFile(id);
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.message);
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  return (
    <span className={styles.row}>
      <button className={styles.danger} type="button" onClick={() => void remove()} disabled={busy}>
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </span>
  );
}
