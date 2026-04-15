"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useAnonymousIdentity
//
// Client-side: reads the penntools_uid cookie OR localStorage.
// If neither exists, we rely on the server to create it on the first API call
// and return a Set-Cookie header.  The server is the source of truth for UUID
// generation — the client just reads what it was given.
//
// Rationale for reading from localStorage fallback:
//   HTTP-only cookies are not readable from JS, so we also mirror the userId
//   in localStorage for client reads.  The server still sets the HTTP-only
//   cookie on each response to future-proof session management.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";

const LS_KEY = "penntools_uid";

export function useAnonymousIdentity() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      setUserId(stored);
      return;
    }

    // No id yet — the server will create one on the first request and
    // return it in the response body so we can cache it here.
    // We leave userId null for now; useChat will handle the empty state.
  }, []);

  function storeUserId(id: string) {
    localStorage.setItem(LS_KEY, id);
    setUserId(id);
  }

  return { userId, storeUserId };
}
