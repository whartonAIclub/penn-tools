// SELL5-M5 (USER-INSTRUCTIONS §9v orchestrator addendum 2: flows-a F5, "opening that notification marks it read"): the live page writes
// its address only when none of its server calls is out (callGate, used by useLiveLink and App). Next.js 14 hears an address the page
// writes with history.replaceState as a navigation, and a navigation drops every server action still queued behind the one that's out:
// a notification opened from the bell while a refresh was out showed as read but was never stored, and a change pressed just before a
// tap that moved the page was never sent. The gate's rules, with no page and no server: at once when nothing is out; otherwise once the
// last call has answered (on the next task); the latest write wins; a call out for longer than the cap is taken as gone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callGate, IDLE_CAP_MS } from "./call-gate";

describe("callGate: the page's address waits for its server calls (9v addendum 2)", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T20:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("runs a write at once when no call is out", () => {
    const g = callGate(); const fn = vi.fn();
    g.whenIdle(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(g.out()).toBe(0);
  });

  it("holds a write while a call is out, and runs it on the task after that call answers, never before", () => {
    const g = callGate(); const fn = vi.fn();
    const id = g.start();
    expect(g.out()).toBe(1);
    g.whenIdle(fn);
    vi.advanceTimersByTime(3000);
    expect(fn).not.toHaveBeenCalled(); // the refresh is still out: writing now would drop what's queued behind it
    g.end(id);
    expect(fn).not.toHaveBeenCalled(); // not in the answer's own turn: the router finishes that call first
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(g.out()).toBe(0);
  });

  it("waits for every call that's out (a refresh, then a markRead queued behind it)", () => {
    const g = callGate(); const fn = vi.fn();
    const refresh = g.start(), read = g.start();
    g.whenIdle(fn);
    g.end(refresh); vi.advanceTimersByTime(0);
    expect(fn).not.toHaveBeenCalled();
    g.end(read); vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest write while it waits (the page shown last is the address)", () => {
    const g = callGate(); const first = vi.fn(), second = vi.fn();
    const id = g.start();
    g.whenIdle(first); g.whenIdle(second);
    g.end(id); vi.advanceTimersByTime(0);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a write made once nothing is out replaces one still waiting for its turn, and runs at once", () => {
    const g = callGate(); const old = vi.fn(), now = vi.fn();
    const id = g.start(); g.whenIdle(old); g.end(id); // old waits for the next task
    g.whenIdle(now);
    expect(now).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(0);
    expect(old).not.toHaveBeenCalled();
  });

  it("a call out for longer than the cap is taken as gone: the write runs at most IDLE_CAP_MS after that call started", () => {
    const g = callGate(); const fn = vi.fn();
    g.start(); // never answers (dropped by a Back, say)
    g.whenIdle(fn);
    vi.advanceTimersByTime(IDLE_CAP_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(g.out()).toBe(0); // the stale call no longer counts
    const later = vi.fn(); g.whenIdle(later);
    expect(later).toHaveBeenCalledTimes(1); // and holds nothing back afterwards
  });

  it("a younger call still holds the write when an older one passes the cap", () => {
    const g = callGate(); const fn = vi.fn();
    g.start(); // stuck from t0
    vi.advanceTimersByTime(8000);
    const young = g.start(); // a refresh from t0 + 8 s
    g.whenIdle(fn);
    vi.advanceTimersByTime(2000); // t0 + 10 s: the stuck one is gone, the young one is still out
    expect(fn).not.toHaveBeenCalled();
    g.end(young); vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("an answer for a call it no longer counts changes nothing, and a gate starts empty", () => {
    const g = callGate(); const fn = vi.fn();
    const id = g.start(); vi.advanceTimersByTime(IDLE_CAP_MS + 5);
    g.whenIdle(fn); expect(fn).toHaveBeenCalledTimes(1);
    g.end(id); g.end(id); vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(callGate().out()).toBe(0);
  });
});
