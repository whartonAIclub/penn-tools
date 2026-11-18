// Concealing one account's page until the account signed in now is confirmed (conceal-fix, USER-INSTRUCTIONS §9b; C-CONTRACT §1;
// DEVIATIONS D69). A signed-in Handoff page shows that account's private content: My activity and its count, exchanges, notifications,
// Handoff settings (with the account's name and email), private alerts, payment details, toasts and kept drafts. The browser can show
// such a page again when that
// account may no longer be the one signed in:
// - Next's router cache brings back an earlier render of the page (Back, or a link within 30 s) after someone else signed in or the
//   session ended. page.tsx gives every server render an id, and Handoff.tsx, which Next commits with the page, notes each id it has
//   committed in this document (renders): a render whose id was committed before is such a restore. Noted where the page commits, not
//   where the app mounts, since the app's code arrives in a chunk of its own: a render committed while "Loading Handoff…" showed, and
//   left before the app arrived, is still known when it comes back (conceal-fix-2, the confirmation's CF-1);
// - on a first visit, a render Next fetched but never committed (the person left before Handoff's own page code arrived) can still come
//   back from Next's cache by a link within 30 s, unseen by any of Handoff's code. So the first Handoff render in a document that didn't
//   come with the document itself (hydration) counts as fresh only when it comes as Handoff's code arrives, not long after it
//   (FIRST_RENDER_MS, startsConcealed);
// - while the app's code is still loading, nothing of the app hears the signals below, so Handoff.tsx notes them meanwhile and the app
//   starts concealed;
// - the tab is shown again after being hidden, when another tab may have signed in as someone else meanwhile;
// - the page comes back from the browser's back/forward cache;
// - another tab signed out: next-auth's cross-tab message (isSessionMessage).
// Until a refresh sent since then confirms the viewer (confirmsViewer), App shows only a status (holdStatus), and its content stays out of
// the page. A confirmation reveals the page as it was; a refresh that says the session changed reloads the page as the new account, or as
// the guest view, as it always did. A slow or failed confirmation keeps it concealed, says so, and offers Try again; never revealed on an
// error. Pure functions, so the tests run them without a browser.

/** Why a page is concealed: a router-cache restore, shown again after being hidden, put in the back/forward cache, another tab's signal. */
export type HoldWhy = "restore" | "shown" | "pagehide" | "signal";
/** A concealment in progress. since: when it began, or Try again was pressed (ms); failed: the last confirmation failed; slow: it's late. */
export interface Hold { why: HoldWhy; since: number; failed: boolean; slow: boolean }
export const newHold = (why: HoldWhy, now: number = Date.now()): Hold => ({ why, since: now, failed: false, slow: false });

/**
 * The server renders this document has committed, by the id page.tsx gives each one (Handoff.tsx notes them). A render committed again
 * came from Next's router cache, not from the server for this request. restored only reads, so it's safe while rendering; committed is
 * called from a layout effect, so React's development double render and double effects never make a fresh render look restored.
 */
export function renderLedger() {
  const seen = new Set<string>();
  const ok = (id: unknown): id is string => typeof id === "string" && id !== "";
  return {
    restored: (id: string | null | undefined): boolean => ok(id) && seen.has(id),
    committed: (id: string | null | undefined): void => { if (ok(id)) seen.add(id); },
  };
}
/** The live page's ledger: one per document (a module's state lasts as long as the document does). */
export const renders = renderLedger();

/**
 * How soon after Handoff's page code has run (by the document's performance clock) the first Handoff render in a document must come to
 * count as the render that code was loaded for. When a navigation brings Handoff for the first time, Next evaluates its page module as
 * the code arrives, because that render is waiting for it, and renders it at once (milliseconds). When the person left before the code
 * arrived, the module still runs on arrival, with nothing to render; a first render that comes long after may be the render Next fetched
 * then and kept (a link within 30 s), so it waits. Far longer than that scheduling takes; far shorter than signing out and in as someone
 * else takes.
 */
export const FIRST_RENDER_MS = 500;
/**
 * Whether a server render the app is about to show must first wait for the account to be confirmed, decided as it's first rendered:
 * - restored: this document committed it before (Next's router cache brought it back): always;
 * - hydrating: it came with the document itself, made for this document's request: never (unless restored);
 * - the first Handoff render committed in this document, fetched for a navigation: only when it comes within FIRST_RENDER_MS of Handoff's
 *   code having run (sinceCodeRan) is it the render the code was loaded for. Later, or a clock that can't be read: wait;
 * - later in the document (Handoff has been committed here, so a render commits as it arrives): a render never committed is fresh.
 */
export function startsConcealed(o: { restored: boolean; hydrating: boolean; firstInDocument: boolean; sinceCodeRan: number }): boolean {
  if (o.restored) return true;
  if (o.hydrating || !o.firstInDocument) return false;
  return !(Number.isFinite(o.sinceCodeRan) && o.sinceCodeRan >= 0 && o.sinceCodeRan <= FIRST_RENDER_MS);
}

/**
 * Whether a refresh answer confirms that the session is still `me`'s: "unchanged" (the server compares the session's user with the tab's
 * viewerId before anything else, and answers account_changed or signed_out when they differ), or a view whose viewer is `me`. A stale
 * code, an error, a lost call or a guest view never confirms.
 */
export function confirmsViewer(answer: unknown, me: string | null): boolean {
  if (!me || !answer || typeof answer !== "object") return false;
  const a = answer as { unchanged?: unknown; view?: unknown };
  if (a.unchanged === true) return true;
  if (a.unchanged !== false || !a.view || typeof a.view !== "object") return false;
  const v = a.view as { guest?: unknown; viewer?: unknown };
  return v.guest !== true && !!v.viewer && typeof v.viewer === "object" && (v.viewer as { id?: unknown }).id === me;
}

/** The localStorage key of next-auth's cross-tab message (next-auth/react's BroadcastChannel). */
export const NEXTAUTH_MESSAGE_KEY = "nextauth.message";
/**
 * Whether a storage event is next-auth's cross-tab session message: the platform's Log out (next-auth's signOut) posts one, and so does
 * any page that reads the session through next-auth's client. Signing in posts none (it navigates), so a tab shown again is checked anyway.
 */
export function isSessionMessage(key: string | null, value: string | null): boolean {
  if (key !== NEXTAUTH_MESSAGE_KEY || !value) return false;
  try { const m = JSON.parse(value) as { event?: unknown; data?: unknown } | null; return !!m && m.event === "session" && !!m.data; } catch { return false; }
}

/** How long to wait before asking again while concealed, after `failures` failed confirmations in a row: 2 s, 4 s, 8 s, 16 s, then 30 s. */
export function retryDelay(failures: number): number {
  const n = Number.isFinite(failures) ? Math.max(0, Math.floor(failures)) : 0;
  return Math.min(30000, 2000 * 2 ** Math.max(0, Math.min(n - 1, 4)));
}
/** A confirmation that hasn't come back after SLOW_MS is late: the status says so and offers Try again. One out for STUCK_MS is given
    up on: Try again then reloads the page, which asks the server afresh. */
export const SLOW_MS = 3000, STUCK_MS = 15000;

/** What a concealed page says: what's happening, and whether Try again is offered. Never a name or any other account detail. */
export function holdStatus(h: Pick<Hold, "failed" | "slow">): { text: string; retry: boolean } {
  if (h.failed) return { text: "Couldn't check which account is signed in, so Handoff stays hidden. Check your connection, then try again.", retry: true };
  if (h.slow) return { text: "Still checking which account is signed in. Handoff stays hidden until it knows.", retry: true };
  return { text: "Checking which account is signed in…", retry: false };
}
