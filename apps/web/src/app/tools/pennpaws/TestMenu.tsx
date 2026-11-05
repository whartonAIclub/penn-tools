"use client";

// A small Test button in the corner, shown only to the local test user under
// `pnpm dev` (page.tsx decides). Locally everyone is the same person, so this
// stands in for the other side of a booking and lets the tester start over.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { testPlay, testStartOver } from "./actions";
import styles from "./PennPaws.module.css";

export function TestMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const play = async () => {
    setBusy(true);
    const result = await testPlay();
    setBusy(false);
    setLog(result.ok ? (result.data.length ? result.data : ["Nothing for the fake people to do yet. Take your next step first."]) : [result.error]);
    router.refresh();
  };

  const startOver = async () => {
    setBusy(true);
    const result = await testStartOver();
    setBusy(false);
    setConfirming(false);
    setLog(result.ok ? ["Started over. Pick how you'll use PennPaws."] : [result.error]);
    router.refresh();
  };

  return (
    <div className={styles.testMenu}>
      {open && (
        <div className={styles.testPanel} role="dialog" aria-label="Test menu">
          <p className={styles.testTitle}>Test menu</p>
          <p className={styles.muted}>Only you see this, and only on your laptop.</p>
          <button type="button" className={styles.secondary} onClick={play} disabled={busy}>
            Fake people's turn
          </button>
          <p className={styles.testHint}>Fake sitters offer on your requests, fake owners pick you, and both approve agreements.</p>
          {confirming ? (
            <div className={styles.testConfirm}>
              <p>Delete your profile, requests, offers and messages, and bring back fresh fake people?</p>
              <div className={styles.testRow}>
                <button type="button" className={styles.secondary} onClick={() => setConfirming(false)} disabled={busy}>
                  Keep it
                </button>
                <button type="button" className={styles.primary} onClick={startOver} disabled={busy}>
                  Yes, start over
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.secondary} onClick={() => setConfirming(true)} disabled={busy}>
              Start over as a new member
            </button>
          )}
          {busy && <p className={styles.muted}>Working...</p>}
          {log.length > 0 && (
            <ul className={styles.testLog}>
              {log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="button" className={styles.testToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Close" : "Test"}
      </button>
    </div>
  );
}
