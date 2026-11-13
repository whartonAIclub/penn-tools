"use client";

// The team page's Release button: asks to confirm, releases, then shows what
// happened. The page reloads with the next preview (usually empty).

import { useState, useTransition } from "react";
import { release, type ReleaseOutcome } from "./actions";
import styles from "../Connector.module.css";

export function ReleaseButton({ disabled }: { disabled: boolean }) {
  const [outcome, setOutcome] = useState<ReleaseOutcome | null>(null);
  const [releasing, startReleasing] = useTransition();

  function onClick() {
    if (!window.confirm("Release these matches? Students will see their groups, and this can't be undone.")) return;
    setOutcome(null);
    startReleasing(async () => setOutcome(await release()));
  }

  return (
    <>
      {outcome?.ok === true && (
        <p className={styles.success}>
          Released {outcome.groups} group{outcome.groups === 1 ? "" : "s"}.
          {outcome.waitlist > 0 && ` ${outcome.waitlist} on the waitlist for next time.`}
        </p>
      )}
      {outcome?.ok === false && <p className={styles.error}>{outcome.error}</p>}
      <div>
        <button type="button" className={styles.button} disabled={disabled || releasing} onClick={onClick}>
          {releasing ? "Releasing…" : "Release matches"}
        </button>
      </div>
    </>
  );
}
