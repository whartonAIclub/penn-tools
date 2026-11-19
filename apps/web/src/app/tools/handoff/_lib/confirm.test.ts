import { describe, expect, it } from "vitest";
import {
  FIRST_RENDER_MS, NEXTAUTH_MESSAGE_KEY, confirmsViewer, holdStatus, isSessionMessage, newHold, renderLedger, retryDelay, startsConcealed,
} from "./confirm";

const ME = "user-b", OTHER = "user-c";
const view = (viewer: { id: string } | null, guest?: boolean) => ({ protocol: 1, mode: "live", version: 7, serverNow: 1, viewer, ...(guest ? { guest: true } : {}) });

describe("renderLedger", () => {
  it("says a render is restored only once this document has committed it", () => {
    const l = renderLedger();
    expect(l.restored("r1")).toBe(false);
    expect(l.restored("r1")).toBe(false); // reading notes nothing (React may render twice before committing)
    l.committed("r1");
    expect(l.restored("r1")).toBe(true);
    expect(l.restored("r2")).toBe(false); // a fresh server render has a new id
    l.committed("r1"); // development's double effect: still just committed
    expect(l.restored("r1")).toBe(true);
  });
  it("never treats a missing or empty id as restored", () => {
    const l = renderLedger();
    for (const id of [null, undefined, ""]) { l.committed(id); expect(l.restored(id)).toBe(false); }
  });
  it("keeps each ledger to itself", () => {
    const a = renderLedger(), b = renderLedger();
    a.committed("r1");
    expect(b.restored("r1")).toBe(false);
  });
});

describe("startsConcealed", () => {
  const base = { restored: false, hydrating: false, firstInDocument: true, sinceCodeRan: 40 };
  it("always waits for a render this document committed before (Next's router cache brought it back)", () => {
    expect(startsConcealed({ ...base, restored: true })).toBe(true);
    expect(startsConcealed({ ...base, restored: true, hydrating: true })).toBe(true);
    expect(startsConcealed({ ...base, restored: true, firstInDocument: false })).toBe(true);
  });
  it("never waits for the document's own render (hydration), however long ago Handoff's code ran", () => {
    expect(startsConcealed({ ...base, hydrating: true, sinceCodeRan: 60_000 })).toBe(false);
  });
  it("trusts the first render of a navigation only as Handoff's code arrives, not long after", () => {
    expect(startsConcealed(base)).toBe(false); // rendered 40 ms after the code ran: the render it was loaded for
    expect(startsConcealed({ ...base, sinceCodeRan: FIRST_RENDER_MS })).toBe(false);
    expect(startsConcealed({ ...base, sinceCodeRan: FIRST_RENDER_MS + 1 })).toBe(true); // later: maybe a render Next kept from a navigation left before the code arrived
    expect(startsConcealed({ ...base, sinceCodeRan: 7_000 })).toBe(true);
  });
  it("trusts a render never committed once Handoff has been committed in this document (a render then commits as it arrives)", () => {
    expect(startsConcealed({ ...base, firstInDocument: false, sinceCodeRan: 60_000 })).toBe(false);
  });
  it("waits when the clock can't be read", () => {
    expect(startsConcealed({ ...base, sinceCodeRan: Number.NaN })).toBe(true);
    expect(startsConcealed({ ...base, sinceCodeRan: -5 })).toBe(true);
  });
});

describe("confirmsViewer", () => {
  it("confirms an unchanged answer (the server compared the session with the tab's account first)", () => {
    expect(confirmsViewer({ unchanged: true, version: 7 }, ME)).toBe(true);
  });
  it("confirms a view for this account, and nothing else", () => {
    expect(confirmsViewer({ unchanged: false, view: view({ id: ME }) }, ME)).toBe(true);
    expect(confirmsViewer({ unchanged: false, view: view({ id: OTHER }) }, ME)).toBe(false);
    expect(confirmsViewer({ unchanged: false, view: view(null, true) }, ME)).toBe(false); // a guest view
    expect(confirmsViewer({ unchanged: false, view: { ...view({ id: ME }), guest: true } }, ME)).toBe(false);
    expect(confirmsViewer({ unchanged: false, view: view(null) }, ME)).toBe(false);
    expect(confirmsViewer({ unchanged: false }, ME)).toBe(false);
  });
  it("never confirms a stale code, an error or a lost call", () => {
    for (const code of ["signed_out", "account_changed", "reload", "busy", "internal", "unavailable", "invalid"]) expect(confirmsViewer({ ok: false, code, error: "x" }, ME)).toBe(false);
    for (const a of [null, undefined, "unchanged", 1, [], {}]) expect(confirmsViewer(a, ME)).toBe(false);
  });
  it("needs an account to confirm (a guest's page is never concealed)", () => {
    expect(confirmsViewer({ unchanged: true }, null)).toBe(false);
    expect(confirmsViewer({ unchanged: false, view: view({ id: ME }) }, "")).toBe(false);
  });
});

describe("isSessionMessage", () => {
  const msg = (o: unknown) => JSON.stringify(o);
  it("recognizes next-auth's cross-tab session message (its signOut, a tab reading the session)", () => {
    expect(isSessionMessage(NEXTAUTH_MESSAGE_KEY, msg({ event: "session", data: { trigger: "signout" }, timestamp: 1 }))).toBe(true);
    expect(isSessionMessage(NEXTAUTH_MESSAGE_KEY, msg({ event: "session", data: { trigger: "getSession" }, timestamp: 2 }))).toBe(true);
  });
  it("ignores other keys, other events, a removed key and anything malformed", () => {
    expect(isSessionMessage("penntools-handoff-draft", msg({ event: "session", data: {} }))).toBe(false);
    expect(isSessionMessage(NEXTAUTH_MESSAGE_KEY, msg({ event: "other", data: {} }))).toBe(false);
    expect(isSessionMessage(NEXTAUTH_MESSAGE_KEY, msg({ event: "session" }))).toBe(false);
    expect(isSessionMessage(NEXTAUTH_MESSAGE_KEY, null)).toBe(false);
    expect(isSessionMessage(NEXTAUTH_MESSAGE_KEY, "{not json")).toBe(false);
    expect(isSessionMessage(NEXTAUTH_MESSAGE_KEY, "null")).toBe(false);
    expect(isSessionMessage(null, msg({ event: "session", data: {} }))).toBe(false); // storage cleared
  });
});

describe("retryDelay", () => {
  it("backs off from 2 s to 30 s at most", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(retryDelay)).toEqual([2000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(retryDelay(Number.NaN)).toBe(2000);
    expect(retryDelay(-3)).toBe(2000);
  });
});

describe("holdStatus", () => {
  it("says it's checking, then that it's late or failed, offering Try again only then", () => {
    const h = newHold("restore", 5);
    expect(h).toEqual({ why: "restore", since: 5, failed: false, slow: false });
    expect(holdStatus(h)).toEqual({ text: "Checking which account is signed in…", retry: false });
    expect(holdStatus({ ...h, slow: true })).toEqual({ text: "Still checking which account is signed in. Handoff stays hidden until it knows.", retry: true });
    expect(holdStatus({ ...h, failed: true })).toEqual({ text: "Couldn't check which account is signed in, so Handoff stays hidden. Check your connection, then try again.", retry: true });
    expect(holdStatus({ ...h, slow: true, failed: true }).text).toMatch(/^Couldn't check/);
  });
});
