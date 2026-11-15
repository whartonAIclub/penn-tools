"use client";

// The team page's Release button: asks to confirm, releases, then shows what
// happened. The page reloads with the next preview (usually empty).

import { useState, useTransition } from "react";
import { release, type ReleaseOutcome } from "./actions";
import styles from "../Connector.module.css";

/**
 * An email to everyone just matched, each as BCC so nobody sees the others'
 * addresses, opened in the team member's own email app to send.
 */
function announcement(emails: readonly string[]): string {
  const link = `${window.location.origin}/tools/connector`;
  const subject = "Your Connector matches are ready ✨";
  const body =
    `Hi!\n\nYour Connector matches are in. See who you're meeting, and what you have in common, here:\n${link}\n\n` +
    "Say hi and pick a time this week. Have fun!\n\nThe Connector team";
  return `mailto:?bcc=${emails.map(encodeURIComponent).join(",")}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

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
        <div className={styles.success}>
          <p>
            Released {outcome.groups} match{outcome.groups === 1 ? "" : "es"}.
            {outcome.waitlist > 0 && ` ${outcome.waitlist} on the waitlist for next time.`} Now let everyone know: the
            waiting page promises them an email.
          </p>
          {outcome.matchedEmails.length > 0 && (
            <a className={styles.button} href={announcement(outcome.matchedEmails)}>
              Email everyone their news
            </a>
          )}
        </div>
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
