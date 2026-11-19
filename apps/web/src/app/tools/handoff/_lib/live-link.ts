// The live page's link to the server (C-DESIGN §4.7; C-CONTRACT.md §1, §4, §7): useLiveLink, and what App uses beside it (installLive,
// asGuest, settled, RELOADING). Typed against the tool's own server types, imported as types only (nothing of the server package reaches
// the browser). Handoff.tsx declares the page's server actions as a LiveApi, so pnpm typecheck fails when an action's input or answer
// changes in a way the link doesn't follow.
//
// The code is the app's, moved here as it was; only types were added. Where TypeScript can't see a fact the code relies on, it's asserted
// where it's used (`!`, `as`), and never checked again at runtime:
// - in live mode, initial and api are set (App's live: mode "live" with both);
// - me is null only on a guest's page, which never sends a change or marks anything read (it only refreshes, and refresh takes null);
// - a code STALE_CODES includes is a StaleCode;
// - a guest's page holds a guest view (asGuest), and a signed-in page a View.
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { applyWorld, HANDOFF_PROTOCOL, setLiveClock } from "@penntools/tool-handoff/engine";
import type {
  ActAnswer, ActInput, GuestView, Guard, MarkReadAnswer, MarkReadInput, PayMethodInput, RefreshAnswer, RefreshInput, SaveProfileInput, SeqStep, StaleCode, View,
} from "@penntools/tool-handoff";
import { demoRoot } from "./dom";
import { keepDraft } from "./session";
import { confirmsViewer, isSessionMessage, newHold, retryDelay, SLOW_MS, STUCK_MS, type Hold, type HoldWhy } from "./confirm";
import { callGate, type CallGate } from "./call-gate";

// ── Types ────────────────────────────────────────────────────────────────────────────────

/** The page's server actions (actions.ts), as the live app calls them (C-CONTRACT §1). Handoff.tsx's API is one. */
export interface LiveApi {
  /** A change; one that carries a photo goes to the act route, not a server action (Handoff.tsx: review of PR #88). */
  act: (input: ActInput) => Promise<ActAnswer>;
  refresh: (input: RefreshInput) => Promise<RefreshAnswer>;
  markRead: (input: MarkReadInput) => Promise<MarkReadAnswer>;
  saveMyProfile: (input: SaveProfileInput) => Promise<ActAnswer>;
  /** Deletes the viewer's Handoff data (review of PR #88), unless something of theirs is still open. */
  deleteMyData: (input: Guard) => Promise<ActAnswer>;
}

/** An action as App dispatches it: its type and that type's fields (the engine's Action; the server checks each type's fields). */
export type DispatchAction = { type: string; [field: string]: unknown };

/**
 * What dispatch and saveProfile answer once awaited, in both modes (the preview's reducer answers with the same fields, and its state):
 * - { error }: refused, failed or maybe not sent, and nothing was changed (code: the server's, when it gave one);
 * - { toast, result }: done (result: what it made, when it made something);
 * - {}: nothing to say (a notification marked read, or the preview's own bookkeeping).
 * steps: a seq's steps, either way. In development, reading any of them before awaiting throws (settled).
 */
export type DispatchResult =
  | { error: string; code?: string | undefined; steps?: SeqStep[] }
  | { toast: string | null; result?: { id: string }; steps?: SeqStep[] }
  | Record<string, never>;

/** A guest view as the app holds it (asGuest): with an empty people map. */
export type HeldGuestView = GuestView & { people: Record<string, never> };
/** The view App holds in live mode (its s): the viewer's View, or a guest's as held. */
export type HeldView = View | HeldGuestView;

/**
 * What App gives the link. In the preview, live is false and initial and api are null: the link keeps its idle state, and never reads
 * s, calls api or schedules anything.
 */
interface LinkProps {
  /** The normal route (App's live). */
  live: boolean;
  /** A signed-out visitor's page: it refreshes and adopts guest views only, and sends nothing else. */
  guest: boolean;
  /** The view page.tsx rendered: its version and serverNow are the first shown. */
  initial: View | GuestView | null;
  api: LiveApi | null;
  /** The tab's account (viewer.id); null on a guest's page. */
  me: string | null;
  /** App's state (live: the view as held), its ref and its setter. */
  s: HeldView;
  sRef: { current: HeldView };
  setS: (next: HeldView) => void;
  /** Shows a toast, or an error. */
  flash: (msg: string, kind?: "error") => void;
  /** The server's clock minus this browser's (ms): the link keeps it up to date. */
  skew: { current: number };
  /**
   * This page may not belong to the account signed in now (Handoff.tsx's unconfirmed, asked as App first rendered: a render Next's router
   * cache brought back, one that may have been fetched earlier, or a signal heard while the app's code loaded): the page starts concealed
   * (hold) until a refresh confirms the viewer.
   */
  restored: boolean;
  /**
   * Handoff.tsx's answer, asked again once the link is listening (a signal can come between App's first render and then); null in the
   * preview and on a guest's page.
   */
  unconfirmed?: (() => boolean) | null;
}

/**
 * What useLiveLink gives App: dispatch and saveProfile, a refresh whose answer is waited for (refreshNow), whether a change is
 * out (busy), why the page is reloading (stale), and, while the page must show nothing of this account's until the account signed in now
 * is confirmed, the concealment (hold, null otherwise) with its status's Try again (retry), and whenIdle, which runs App's address writes
 * once none of the page's calls is out (SELL5-M5; _lib/call-gate.ts).
 */
export type LiveLink = ReturnType<typeof useLiveLink>;

/** Every key of every member of a union. */
type KeyOfAny<U> = U extends unknown ? keyof U : never;
/**
 * A union read field by field without narrowing it first, as the link reads answers and views: each member also has the other members'
 * keys (as undefined), and every key is optional, since send reads an answer that isn't an object as {}. The fields' names and types are
 * still the server's.
 */
type Loose<U, All = U> = U extends unknown ? Partial<U & { [K in Exclude<KeyOfAny<All>, keyof U>]?: undefined }> : never;
/** Any of the server's answers, as the link reads it. */
type Answer = Loose<ActAnswer | RefreshAnswer | MarkReadAnswer>;
/** A call as send gives it back: the answer, with when it was sent and received (for the skew); or lost, when no answer came. */
type Sent = { lost?: undefined; ans: Answer; sentAt: number; receivedAt: number } | { lost: true };
/** What write sends: act's input (its requestId is remembered when its answer is lost), or saveMyProfile's or deleteMyData's, which have none. */
type WriteInput = ActInput | ((SaveProfileInput | Guard) & { requestId?: undefined; action?: undefined });
/** A press, as the pending mark reads it: a submit names its submitter; a click's target may not be an element, so closest is checked. */
type Press = Event & { submitter?: HTMLElement | null; target: (EventTarget & { closest?: Element["closest"] }) | null };

// ── The link ─────────────────────────────────────────────────────────────────────────────

const LIVE_QUIET = new Set(["seen", "feedbackGiven", "markFeedSeen"]); // the preview's own bookkeeping: nothing to send
// The answers that mean this tab no longer matches the session or the server (any answer's code can be asked about; satisfies keeps the
// list to the server's StaleCode). RELOADING's keys must be every StaleCode.
const STALE_CODES: readonly unknown[] = ["signed_out", "account_changed", "reload"] satisfies StaleCode[];
export const RELOADING: Readonly<Record<StaleCode, string>> = { signed_out: "You're signed out. Reloading…", account_changed: "Reloading…", reload: "Handoff was updated. Reloading…" };
const STILL_SAVING = "Still saving your last change…";
// A change whose answer never came (R6): the form keeps what was typed, and sending the same change again reuses its request id, so the
// server applies it at most once (useLiveLink's lost).
const NOT_SENT = "Couldn't reach Handoff, so this may not have been saved. Check your connection, then try again: Handoff won't save it twice.";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// How long a link opened in the tab waits for fresh availability before the page shows what it holds (refreshNow).
const LINK_WAIT_MS = 8000;
// What a guest's page answers a change with, should one come at all: App asks a guest to sign in before any change (askSignIn).
const SIGN_IN_FIRST = "Sign in first.";

/* A guest view as the app holds it: with an empty people map, so installing it (applyWorld) leaves nobody's name in the catalog. */
export const asGuest = (view: GuestView): HeldGuestView => ({ ...view, people: {} });
/* A change as the lost-answer memory knows it: the action, and the photo sent beside it (§9s item 6), so another photo is another intent. */
const intentKey = (action: unknown, photo?: string): string => JSON.stringify(action) + (photo ? "|" + photo : "");
/* One id per intent (C-DESIGN §4.5): its one retry reuses it, so the server applies the change once however often it arrives. */
function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16)); b[6] = (b[6]! & 15) | 64; b[8] = (b[8]! & 63) | 128; // a version 4 UUID
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/* dispatch answers with a Promise in both modes, since a live change waits for the server. In development the Promise can't be read
   as a result (r.error, r.result…), so a caller that forgot to await fails loudly in the preview's browser suites. */
export function settled(res: DispatchResult | PromiseLike<DispatchResult>): Promise<DispatchResult> {
  const p = Promise.resolve(res);
  if (process.env.NODE_ENV !== "production") for (const k of ["error", "toast", "result", "state", "steps"]) Object.defineProperty(p, k, { get() { throw new Error(`Handoff: await dispatch(…) before reading .${k}`); } });
  return p;
}
/* Installs a live view before App's other state reads the catalog (C-DESIGN §6.3): the clock (this browser's plus the server's skew)
   and the view's events and people. */
export function installLive<V extends HeldView>(view: V, skew: { current: number }): V {
  setLiveClock(() => Date.now() + skew.current);
  applyWorld(view);
  return view;
}

/* The live page's link to the server (C-DESIGN §4.7; C-CONTRACT.md §1, §4). A view replaces the shown one only when it's newer: a
   higher version, or the same version built later. Changes go one at a time; a busy answer or a lost connection is retried once,
   after a second, with the same request id. The view refreshes on every mount, on focus, every minute while the page is
   visible, and just after its nextRefreshAt (sent back with it; asked once more 2 s later if the server hadn't reached it yet). An answer for another account, a signed-out session or a new
   release turns the page into a bare "Reloading…" and reloads it. Notifications opened here stay read in views that predate the
   mark. A refresh asked for while a call is out runs once that call has answered, never dropped. A listing's link opened in the tab
   asks for one and waits for its answer (refreshNow). In the preview it does nothing.
   A guest's page (guest: viewerId null) refreshes the same way and adopts only guest views; it never sends a change (C-CONTRACT §7).
   A signed-in page is concealed (hold) while the account it shows may not be the one signed in: from a render Next's router cache brought
   back (restored), when the tab is shown again, when it goes into the back/forward cache, and on another tab's sign-out; a refresh sent
   since then that confirms the viewer reveals it, and one that says otherwise reloads it as above (_lib/confirm.ts; conceal-fix). */
export function useLiveLink({ live, guest, initial, api, me, s, sRef, setS, flash, skew, restored, unconfirmed = null }: LinkProps) {
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState<StaleCode | null>(null);
  // Concealed until the account is confirmed (conceal-fix): while hold is set, App shows a status and none of this account's content.
  const [hold, setHoldState] = useState<Hold | null>(() => live && !guest && restored ? newHold("restore") : null);
  const [, setTick] = useState(0);
  const busyRef = useRef(false), staleRef = useRef<StaleCode | null>(null), refreshing = useRef(false), again = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(null!); // timer: null until the first schedule (clearTimeout(null) does nothing)
  const shown = useRef(live ? { version: initial!.version, serverNow: initial!.serverNow } : null);
  const reads = useRef({ ids: new Set<string>(), allAt: 0 });
  const calls = useRef<CallGate | null>(null); if (!calls.current) calls.current = callGate(); // the calls out (send), for whenIdle
  const guard = { viewerId: me!, protocol: HANDOFF_PROTOCOL }; // a guest's null goes only to refresh, which takes it
  // pressed: the control a change starts from (write marks it pending); lost: { key, requestId, at } for a change whose answer never came.
  const pressed = useRef<HTMLElement | null>(null), lost = useRef<{ key: string; requestId: string; at: number } | null>(null);
  // The nextRefreshAt asked about once more after an "unchanged" that arrived before it by the server's clock (refresh; readiness RB-11).
  const askedAgain = useRef<number | null>(null);
  // Those waiting for a refresh sent from now on (refreshNow): the next refresh to be sent takes them, and tells them once it's answered.
  const waiting = useRef<Array<() => void>>([]);
  // The concealment as the link reads it (holdRef), how many concealments have begun (holdEpoch: only a refresh sent since the latest one
  // can end it), the failed confirmations in a row (holdFailures: the next try backs off), and when the last refresh was sent.
  const holdRef = useRef(hold), holdEpoch = useRef(0), holdFailures = useRef(0), refreshSentAt = useRef(0);
  // Every change of the concealment is committed at once (flushSync): concealing before the browser can paint again, and revealing or
  // updating the status even while a server action is out (Next runs those in a transition, which holds back this component's other
  // renders until it ends; measured: without it a confirmation waited for the next refresh's answer). Never called while rendering.
  const putHold = (h: Hold | null) => { holdRef.current = h; flushSync(() => { setHoldState(h); }); };
  // Conceals now, and counts it, so only a refresh sent from now on can end it.
  const conceal = (why: HoldWhy) => {
    if (!live || guest || staleRef.current) return;
    holdEpoch.current++; holdFailures.current = 0;
    putHold(newHold(why));
  };
  // A refresh's answer, for the concealment that was current when it was sent: a confirmation of this account reveals the page; anything
  // else (lost, busy, unavailable, internal) leaves it concealed, and the status says the check failed. A stale answer reloads instead.
  const settleHold = (epoch: number, confirmed: boolean) => {
    const h = holdRef.current; if (!h || epoch !== holdEpoch.current || staleRef.current) return;
    if (confirmed) { holdFailures.current = 0; putHold(null); }
    else { holdFailures.current++; putHold({ ...h, failed: true }); }
  };

  // A session that ended keeps the open form's typed values for after sign-in (keepDraft); another account's or a new release's reload doesn't.
  const goStale = (code: StaleCode) => { if (staleRef.current) return; staleRef.current = code; clearTimeout(timer.current); if (code === "signed_out" && !guest) keepDraft(me!); setStale(code); };
  const withReads = (view: View): View => {
    const { ids, allAt } = reads.current; if (!ids.size && !allAt) return view;
    let fixed = 0;
    const notifications = view.notifications.map(n => !n.read && (ids.has(n.id) || n.at <= allAt) ? (fixed++, { ...n, read: true }) : n);
    return fixed ? { ...view, notifications, unreadCount: allAt ? notifications.filter(n => !n.read).length : Math.max(0, view.unreadCount - fixed) } : view;
  };
  const adopt = (view: Loose<View | GuestView> | null | undefined, sentAt: number, receivedAt: number) => {
    if (!view || typeof view.version !== "number" || typeof view.serverNow !== "number") return false;
    // Never another account's data in this tab, and never a signed-in view in a guest's tab or a guest view in a signed-in one: they reload.
    if (guest ? !(view.guest === true && view.viewer === null) : (view.guest === true || !view.viewer || view.viewer.id !== me)) { goStale("account_changed"); return false; }
    const cur = shown.current!;
    if (view.version < cur.version || (view.version === cur.version && view.serverNow < cur.serverNow)) return false;
    if (sentAt != null) skew.current = view.serverNow - (sentAt + receivedAt) / 2;
    shown.current = { version: view.version, serverNow: view.serverNow };
    const next = guest ? asGuest(view as GuestView) : withReads(view as View); sRef.current = next; setS(next);
    return true;
  };
  // Every call is counted from when it's sent until it answers (or fails), so App writes its address only when none is out (whenIdle;
  // _lib/call-gate.ts, SELL5-M5): the site's router hears that write as a navigation, which drops the calls queued behind one that's out.
  const send = async <I>(fn: (input: I) => Promise<ActAnswer | RefreshAnswer | MarkReadAnswer>, input: I): Promise<Sent> => {
    const sentAt = Date.now(), call = calls.current!.start();
    try { const ans = await fn(input); return { ans: ans && typeof ans === "object" ? ans : {}, sentAt, receivedAt: Date.now() }; }
    catch (e) { return { lost: true }; }
    finally { calls.current!.end(call); }
  };
  /** Runs `write` (App's address) once none of this page's calls is out: at once when none is (_lib/call-gate.ts). */
  const whenIdle = (write: () => void) => calls.current!.whenIdle(write);
  // An answer as dispatch's result: { error } or { toast, result: { id } }, with the view adopted and the toast or error shown.
  const settle = (r: Sent, quiet?: boolean): DispatchResult => {
    if (r.lost) { if (!quiet) flash(NOT_SENT, "error"); return { error: NOT_SENT, code: "lost" }; } // code "lost": no answer came, so it may or may not be stored (Sell a ticket keeps its form as sent: sent again unchanged, it reuses the request)
    const a = r.ans;
    if (STALE_CODES.includes(a.code)) { goStale(a.code as StaleCode); return { error: RELOADING[a.code as StaleCode] }; }
    // Committed before dispatch's caller goes on, as the preview's synchronous changes are, so its focus moves find the new page.
    if (a.view) flushSync(() => { adopt(a.view, r.sentAt, r.receivedAt); });
    if (a.ok) {
      if (a.toast && !quiet) flash(a.toast);
      return { toast: a.toast || null, ...(a.resultId ? { result: { id: a.resultId } } : {}), ...(a.steps ? { steps: a.steps } : {}) };
    }
    const error = typeof a.error === "string" && a.error ? a.error : "Something went wrong. Nothing was changed.";
    if (!quiet) flash(error, "error");
    return { error, code: a.code, ...(a.steps ? { steps: a.steps } : {}) };
  };
  const write = async <I extends WriteInput>(fn: (input: I) => Promise<ActAnswer>, input: I, quiet?: boolean): Promise<DispatchResult> => {
    const ctl = pressed.current; pressed.current = null; // the control pressed for this change, if one was (read before anything waits)
    if (staleRef.current) return { error: RELOADING[staleRef.current] };
    if (busyRef.current) { if (!quiet) flash(STILL_SAVING, "error"); return { error: STILL_SAVING }; }
    busyRef.current = true; setBusy(true);
    // Pending (R6): the pressed control says so (a spinner, and it reads as unavailable) and ignores presses until the answer comes.
    const mark = ctl && ctl.isConnected && !ctl.hasAttribute("data-pending") ? ctl : null;
    if (mark) { mark.setAttribute("data-pending", ""); mark.setAttribute("aria-disabled", "true"); }
    try {
      let r = await send(fn, input);
      if (r.lost || r.ans.code === "busy") { await sleep(1000); r = await send(fn, input); } // the same request id: applied at most once
      // Still no answer, or busy: sending this same change again carries this id (dispatch), so the server applies it at most once.
      if (input.requestId) lost.current = r.lost || r.ans.code === "busy" ? { key: intentKey(input.action, (input as ActInput).photo), requestId: input.requestId, at: Date.now() }
        : lost.current && lost.current.requestId === input.requestId ? null : lost.current;
      return settle(r, quiet);
    } finally { if (mark) { mark.removeAttribute("data-pending"); mark.removeAttribute("aria-disabled"); } busyRef.current = false; setBusy(false); if (again.current) refresh(); } // a refresh asked for while this change was out
  };
  const markRead = async (ids: string[] | "all") => {
    const cur = sRef.current as View; if (!cur || guest) return; // a guest has no notifications (a signed-in page holds a View)
    if (ids === "all") reads.current.allAt = Math.max(Date.now() + skew.current, ...cur.notifications.map(n => n.at));
    else for (const id of ids) reads.current.ids.add(id);
    const next = withReads(cur); if (next !== cur) { sRef.current = next; setS(next); } // the bell updates first
    const r = await send(api!.markRead, { ...guard, ids });
    if (!r.lost && STALE_CODES.includes(r.ans.code)) goStale(r.ans.code as StaleCode); // anything else: the next view says what the server has
  };
  const schedule = () => {
    clearTimeout(timer.current);
    if (!live || staleRef.current) return;
    if (holdRef.current) { timer.current = setTimeout(refresh, retryDelay(holdFailures.current)); return; } // concealed: asked again soon, backing off
    const at = sRef.current && sRef.current.nextRefreshAt;
    const wait = typeof at === "number" ? at + 1000 - (Date.now() + skew.current) : Infinity; // passed already: the minute's tick
    timer.current = setTimeout(refresh, Math.max(1000, Math.min(wait > 0 ? wait : Infinity, 60000)));
  };
  async function refresh() {
    if (!live || staleRef.current) return; if (refreshing.current || busyRef.current) { again.current = true; return; } // after the call that's out: its answer predates this ask (journey review F1)
    if (document.visibilityState === "hidden") { schedule(); return; } // a hidden tab catches up when it's shown (visibilitychange)
    again.current = false; refreshing.current = true;
    const waiters = waiting.current; waiting.current = []; // asked before this call is sent: its answer is theirs (refreshNow)
    let soon = false;
    const epoch = holdEpoch.current; // the concealment this call can end: the one current as it's sent
    try {
      const v = sRef.current;
      const due = v && typeof v.nextRefreshAt === "number" ? v.nextRefreshAt : null;
      refreshSentAt.current = Date.now();
      const r = await send(api!.refresh, { ...guard, version: shown.current!.version, nextRefreshAt: due });
      if (r.lost) { settleHold(epoch, false); return; }
      if (STALE_CODES.includes(r.ans.code)) { goStale(r.ans.code as StaleCode); return; }
      if (r.ans.unchanged === false && r.ans.view) adopt(r.ans.view, r.sentAt, r.receivedAt); // busy, internal, unavailable: keep the screen
      // "Unchanged" although that time has passed by this tab's clock: the server read its clock a moment before it (this tab's estimate
      // of the server's clock runs a little fast, or the answer was slow). Asked once more 2 s on, rather than at the minute's tick; never
      // more than once for the same time, so it can't loop (readiness RB-11).
      else if (r.ans.unchanged === true && due !== null && due <= Date.now() + skew.current && askedAgain.current !== due) { askedAgain.current = due; soon = true; }
      settleHold(epoch, confirmsViewer(r.ans, me)); // concealed: only a confirmation of this account reveals the page, never an error
    } finally {
      refreshing.current = false;
      for (const done of waiters) done();
      if (again.current) refresh();
      else if (soon) { clearTimeout(timer.current); timer.current = setTimeout(refresh, 2000); }
      else schedule();
    }
  }
  // A refresh whose answer is waited for: App asks when a listing's link opens in this tab, before the page says whether that listing is
  // open. The Promise resolves once a refresh sent from now on has answered or failed (never on an answer that was already on its way),
  // and after LINK_WAIT_MS at the latest, so a call that never answers can't leave the page waiting: it then shows what it holds, and a
  // later answer still updates it.
  const refreshNow = (): Promise<void> => new Promise(done => {
    if (!live || staleRef.current) { done(); return; }
    const t = setTimeout(done, LINK_WAIT_MS);
    waiting.current.push(() => { clearTimeout(t); done(); });
    refresh();
  });
  useEffect(() => { if (stale) window.location.reload(); }, [stale]);
  useEffect(() => { if (live) schedule(); }, [s]);
  useEffect(() => {
    if (!live) return;
    const onFocus = () => refresh();
    // Shown again: another tab may have signed in as someone else meanwhile, so the page is concealed until a refresh sent now confirms it.
    const onVisible = () => { if (document.visibilityState === "visible") { conceal("shown"); refresh(); } };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); }; // Back to a cached page (after Log out, say): load it afresh
    // Into the back/forward cache: concealed first, so a page that comes back shows nothing of this account's while it reloads.
    const onHide = (e: PageTransitionEvent) => { if (e.persisted) conceal("pagehide"); };
    // Another tab signed out (next-auth's cross-tab message): concealed, and checked now.
    const onStorage = (e: StorageEvent) => { if (isSessionMessage(e.key, e.newValue)) { conceal("signal"); refresh(); } };
    window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onVisible); window.addEventListener("pageshow", onShow);
    window.addEventListener("pagehide", onHide); window.addEventListener("storage", onStorage);
    // Listening now: a signal Handoff.tsx heard after App's first render, before these listeners, conceals the page too (conceal-fix-2).
    // Counted like any concealment, before the mount refresh below is sent, so that refresh can end it. Not flushSync: this is an effect.
    if (!guest && !holdRef.current && !staleRef.current && unconfirmed && unconfirmed()) {
      holdEpoch.current++; holdFailures.current = 0;
      holdRef.current = newHold("restore"); setHoldState(holdRef.current);
    }
    // Every mount, however recent the view: Next's router cache can bring back an earlier render (Back, or a link within 30 s) after another
    // account signed in (journey review F1). Sent from a task of its own (conceal-fix): sent from this effect, which runs as Back's commit
    // finishes, Next's server action was tied to Back's transition and held back this page's renders until it answered, so a concealed
    // page couldn't say it was late, or show its confirmation, before then (measured). React's development double effect now sends one.
    const firstCall = setTimeout(refresh, 0);
    const tick = setInterval(() => setTick(t => t + 1), 30000); // countdowns follow the clock
    return () => {
      window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("pageshow", onShow);
      window.removeEventListener("pagehide", onHide); window.removeEventListener("storage", onStorage); clearTimeout(firstCall); clearInterval(tick); clearTimeout(timer.current);
    };
  }, []);
  // A confirmation that's late says so and offers Try again (SLOW_MS).
  useEffect(() => {
    if (!hold || hold.slow || hold.failed) return;
    const t = setTimeout(() => { if (holdRef.current === hold) putHold({ ...hold, slow: true }); }, Math.max(0, hold.since + SLOW_MS - Date.now()));
    return () => clearTimeout(t);
  }, [hold]);

  // The control a change starts from (R6): a pressed button, or the submit button of a form sent from the keyboard. Noted as the press
  // happens, before the page's own handler runs (capture), and forgotten once that press is over; write marks it while its change is out.
  // Pressing a control that's pending does nothing at all: no second change, and no "still saving" message.
  useEffect(() => {
    if (!live || guest) return;
    const root = demoRoot(); if (!root) return;
    const note = (e: Press) => {
      const c = e.type === "submit" ? e.submitter : e.target && e.target.closest ? e.target.closest("button") : null;
      if (!c) return;
      if (c.hasAttribute("data-pending")) { e.preventDefault(); e.stopPropagation(); return; }
      pressed.current = c; setTimeout(() => { if (pressed.current === c) pressed.current = null; }, 0);
    };
    root.addEventListener("click", note, true); root.addEventListener("submit", note, true);
    return () => { root.removeEventListener("click", note, true); root.removeEventListener("submit", note, true); };
  }, []);

  // A guest's page asks for sign-in before any change (App's askSignIn), so nothing here sends one; should a change come anyway, it says so.
  const refuseGuest = (quiet?: boolean) => { if (!quiet) flash(SIGN_IN_FIRST, "error"); return settled({ error: SIGN_IN_FIRST }); };
  // extra.photo (§9s item 6): a Goods photo the page already resized and re-encoded (base64, _lib/photo.js), sent beside "Post item" (or
  // the seq that posts and shares it) and beside setItemPhoto. The server checks it again by its bytes (tools/handoff/src/photo.ts).
  const dispatch = (a: DispatchAction | null | undefined, quiet?: boolean, extra?: { photo?: string }) => {
    if (!a || LIVE_QUIET.has(a.type)) return settled({});
    if (guest) return refuseGuest(quiet);
    if (a.type === "readNote") { markRead([a.id as string]); return settled({}); } // readNote carries its notification's id
    if (a.type === "readAll") { markRead("all"); return settled({}); }
    const photo = extra && typeof extra.photo === "string" && extra.photo ? extra.photo : undefined;
    // The same change as one whose answer never came (within 10 minutes) goes again with its id: one intent, one id (C-DESIGN §4.5).
    const l = lost.current, retry = l && l.key === intentKey(a, photo) && Date.now() - l.at < 10 * 60e3;
    return settled(write(api!.act, { ...guard, requestId: retry ? l.requestId : newRequestId(), action: a, ...(photo ? { photo } : {}) }, quiet));
  };
  // How the viewer is paid (follow-on B1): 0 to 2 methods, the first preferred. quiet: a form that shows the answer itself (Sell, before
  // its listing) says nothing in a toast.
  const saveProfile = (payMethods: PayMethodInput[], quiet = false) => guest ? refuseGuest(quiet) : settled(write(api!.saveMyProfile, { ...guard, payMethods }, quiet));
  // Review of PR #88: deletes the viewer's Handoff data; the answer says why not while something of theirs is still open.
  const deleteData = () => guest ? refuseGuest() : settled(write(api!.deleteMyData, { ...guard }));
  // The concealed page's Try again: asks now, or as soon as the call that's out answers. A call out for STUCK_MS is given up on: the page
  // reloads, which asks the server afresh (and keeps nothing of this account's on screen meanwhile).
  const retry = () => {
    const h = holdRef.current; if (!h || staleRef.current) return;
    if (refreshing.current && Date.now() - refreshSentAt.current > STUCK_MS) { window.location.reload(); return; }
    putHold({ ...h, failed: false, slow: false, since: Date.now() });
    clearTimeout(timer.current);
    refresh();
  };
  return { dispatch, saveProfile, deleteData, refreshNow, busy, stale, hold, retry, whenIdle };
}
