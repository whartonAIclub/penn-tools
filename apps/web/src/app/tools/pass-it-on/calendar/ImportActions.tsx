"use client";

// "Approve all" and "Delete import" for one calendar import.

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../PassItOn.module.css";
import { approveAllAction, deleteImportAction } from "./actions";

export function ImportActions({ importId, pending }: { importId: string; pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approveAll() {
    setBusy(true);
    setError(null);
    try {
      const result = await approveAllAction(importId);
      if (!result.ok) setError(result.message);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm("Delete this import? Events you already approved stay on the calendar.")) return;
    setBusy(true);
    try {
      const result = await deleteImportAction(importId);
      if (result.ok) {
        router.push("/tools/pass-it-on/calendar");
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
    <>
      <div className={styles.spread}>
        <button className={styles.button} type="button" disabled={busy || pending === 0} onClick={() => void approveAll()}>
          Approve all ({pending})
        </button>
        <button className={styles.danger} type="button" disabled={busy} onClick={() => void remove()}>
          Delete import
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </>
  );
}
