// The live page's address waits for its server calls (SELL5-M5; USER-INSTRUCTIONS §9v orchestrator addendum 2, flows-a F5).
//
// Next.js 14 patches history.replaceState: an address the page writes with it reaches the site's router as a navigation ("restore"), and a
// navigation drops every server action still waiting in the router's queue behind the one that's out (never sent; its promise never
// settles). Handoff's calls (act, refresh, markRead, saveMyProfile, saveEmailPrefs) go one at a time through that queue, and since §9v
// (SELL5-M2) the page writes its address after each move inside Handoff. So a notification opened from the bell while a refresh was out
// showed as read but was never stored, and a change pressed just before a tap that moved the page was never sent, leaving the page busy.
// useLiveLink counts each call from when it's sent until it answers (start, end), and App writes the address through whenIdle: at once
// when none is out, otherwise on the task after the last one answers (the router finishes that call first). Only the latest write waits:
// it's the page shown last. A call out for longer than IDLE_CAP_MS is taken as gone (one a Back or Forward dropped never answers), so the
// address follows the page at most that long after such a call was sent.

/** How long a call that hasn't answered still holds the address back. */
export const IDLE_CAP_MS = 10_000;

export interface CallGate {
  /** A call is sent: counted until end(id), or until it has been out for IDLE_CAP_MS. */
  start(): number;
  /** That call answered (or failed): a waiting write runs on the next task if nothing else is out. */
  end(id: number): void;
  /** Runs `write` now when no call is out, else once they have answered; a later whenIdle replaces a waiting one. */
  whenIdle(write: () => void): void;
  /** The calls still counted as out. */
  out(): number;
}

export function callGate(): CallGate {
  const calls = new Map<number, number>(); // id -> when it was sent
  let seq = 0;
  let waiting: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
  /** The time until the youngest counted call passes the cap (0: none is counted); older ones stop counting. */
  const holdFor = (): number => {
    const now = Date.now(); let wait = 0;
    for (const [id, at] of calls) { const left = at + IDLE_CAP_MS - now; if (left <= 0) calls.delete(id); else if (left > wait) wait = left; }
    return wait;
  };
  const check = () => {
    clear();
    if (!waiting) return;
    const wait = holdFor();
    if (wait > 0) { timer = setTimeout(check, wait); return; }
    const write = waiting; waiting = null; write();
  };
  return {
    start() { const id = ++seq; calls.set(id, Date.now()); return id; },
    end(id) { if (!calls.delete(id)) return; if (waiting) { clear(); timer = setTimeout(check, 0); } },
    whenIdle(write) { waiting = write; if (holdFor() > 0) { if (timer === undefined) timer = setTimeout(check, holdFor()); return; } check(); },
    out() { holdFor(); return calls.size; },
  };
}
