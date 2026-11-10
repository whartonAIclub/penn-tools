"use client";

// Saving trips: the heart button, the saved-trips state behind it, and the
// short message shown when a save can't happen. Saves go through
// saved/route.ts, which also decides whether someone is signed in: a 401 shows
// the sign-in message. The heart changes at once and changes back if the save fails.

import { useEffect, useState } from "react";
import styles from "./TripCatalog.module.css";

const SIGN_IN_MESSAGE = "Sign in with the button at the top right to save trips.";

function toggled(ids: ReadonlySet<string>, tripId: string, saved: boolean): Set<string> {
  const next = new Set(ids);
  if (saved) next.add(tripId);
  else next.delete(tripId);
  return next;
}

/** The user's saved trips, starting from the page's savedIds. */
export function useSavedTrips(initialIds: readonly string[]) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set(initialIds));
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  async function toggle(tripId: string) {
    const saving = !ids.has(tripId);
    setIds((current) => toggled(current, tripId, saving));
    let status = 0;
    try {
      const response = await fetch("/tools/trek-finder/saved", {
        method: saving ? "PUT" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      if (response.ok) return;
      status = response.status;
    } catch {
      // A network failure is handled like any other failed save, below.
    }
    setIds((current) => toggled(current, tripId, !saving));
    if (status === 401) setMessage(SIGN_IN_MESSAGE);
    else setMessage(saving ? "Couldn't save that trip. Please try again." : "Couldn't remove that trip. Please try again.");
  }

  return { isSaved: (tripId: string) => ids.has(tripId), count: ids.size, toggle, message };
}

export function SaveButton({
  saved,
  tripName,
  onToggle,
  className,
}: {
  saved: boolean;
  tripName: string;
  onToggle: () => void;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      className={`${styles.save} ${className ?? ""}`}
      aria-pressed={saved}
      aria-label={`Save ${tripName}`}
      title={saved ? "Saved" : "Save"}
      onClick={onToggle}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}

/** The message from a failed save. Always rendered, so screen readers announce it when it appears. */
export function SaveMessage({ message }: { message: string | null }) {
  return (
    <p role="status" className={message ? styles.toast : styles.toastHidden}>
      {message}
    </p>
  );
}
