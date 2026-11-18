// The dispatch route (email/dispatch/route.ts) as Next calls it: a Request in, a Response out. The tool's pool and the dispatcher are
// stand-ins (no database, nothing run), and fetch is a spy for the whole file, so no test can reach a provider. What's checked is the
// route's own decisions: which setup runs, 404, 401, 503, 405 (only POST is exported), and that the answer is the counts only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ toolSql: vi.fn(), dispatchEmail: vi.fn(), sqlCaptureSender: vi.fn() }));
vi.mock("@penntools/platform/db", () => ({ toolSql: m.toolSql }));
vi.mock("@penntools/tool-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@penntools/tool-handoff")>()),
  dispatchEmail: m.dispatchEmail,
  sqlCaptureSender: m.sqlCaptureSender,
}));

import { storeDispatchDeps } from "@penntools/tool-handoff";
import * as route from "./email/dispatch/route";

const SECRET = "s".repeat(16) + "0123456789abcdef"; // 32 bytes, made up
const KEY = "re_test_0123456789abcdef"; // made up: nothing here reaches a provider
const LOCAL = "http://localhost:3000/tools/handoff/email/dispatch";
const SITE = "https://penntools.example.org";
const AT = `${SITE}/tools/handoff/email/dispatch`;
const COUNTS = { swept: 1, claimed: 3, sent: 1, failed: 1, skipped: 1, dead: 0, expired: 2, pruned: 4 };
const POOL = { pool: "the tool's pool" };
const CAPTURE = { kind: "capture", allows: () => true, ready: async () => true, send: async () => ({ ok: true, providerId: null }) };

const ENV_NAMES = ["HANDOFF_EMAIL_PROVIDER", "HANDOFF_EMAIL_API_KEY", "HANDOFF_EMAIL_FROM", "HANDOFF_EMAIL_DISPATCH_SECRET", "NEXTAUTH_URL", "HANDOFF_EMAIL_ALLOWLIST"] as const;
type EnvName = (typeof ENV_NAMES)[number];
const PROD: Record<EnvName, string> = {
  HANDOFF_EMAIL_PROVIDER: "resend",
  HANDOFF_EMAIL_API_KEY: KEY,
  HANDOFF_EMAIL_FROM: "Handoff <handoff@send.penntools.example.org>",
  HANDOFF_EMAIL_DISPATCH_SECRET: SECRET,
  NEXTAUTH_URL: SITE,
  HANDOFF_EMAIL_ALLOWLIST: "ann@upenn.edu",
};

/** NODE_ENV and the six variables, each "" (unset) unless given. */
function env(nodeEnv: string, values: Partial<Record<EnvName, string>> = {}): void {
  vi.stubEnv("NODE_ENV", nodeEnv);
  for (const name of ENV_NAMES) vi.stubEnv(name, values[name] ?? "");
}

/**
 * A POST as Next's dev server hands it to the route: its URL is the server's own origin whatever the client asked for, and the Host
 * and X-Forwarded-For headers say where it came from (`from`: this machine, unless a test says otherwise).
 */
const post = (url: string, o: { body?: unknown; auth?: string; host?: string; from?: string } = {}): Promise<Response> =>
  route.POST(new Request(url, {
    method: "POST",
    headers: {
      host: o.host ?? new URL(url).host,
      "x-forwarded-for": o.from ?? "::1",
      "content-type": "application/json",
      ...(o.auth !== undefined ? { authorization: o.auth } : {}),
    },
    body: o.body === undefined ? "" : JSON.stringify(o.body),
  }));

let fetchSpy: ReturnType<typeof vi.fn<[], Promise<Response>>>;

beforeEach(() => {
  fetchSpy = vi.fn<[], Promise<Response>>(async () => new Response(null, { status: 599 }));
  vi.stubGlobal("fetch", fetchSpy);
  m.toolSql.mockReturnValue(POOL);
  m.sqlCaptureSender.mockReturnValue(CAPTURE);
  m.dispatchEmail.mockResolvedValue(COUNTS);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled(); // no test sends anything anywhere
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the email dispatch route", () => {
  it("exports POST only (Next answers every other method 405) and is always dynamic", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic"]);
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("development: runs the capture for test worlds, from this machine, with its origin for links, and answers the counts only", async () => {
    env("development", PROD); // a provider configured too: development never uses it
    m.dispatchEmail.mockResolvedValue({ ...COUNTS, address: "ann@upenn.edu", note: "planted" });
    const res = await post(LOCAL, { body: { limit: 5, noGrace: true, worlds: "live", siteUrl: "https://evil.example" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(COUNTS);
    expect(m.toolSql).toHaveBeenCalledWith("handoff");
    expect(m.sqlCaptureSender).toHaveBeenCalledWith(POOL);
    expect(m.dispatchEmail).toHaveBeenCalledTimes(1);
    expect(m.dispatchEmail).toHaveBeenCalledWith(POOL, { sender: CAPTURE, siteUrl: "http://localhost:3000", worlds: "test", limit: 5, graceMs: 0 }, storeDispatchDeps);
    // No body, or one that isn't JSON: the defaults (25, with the 2-minute grace period).
    for (const body of [undefined, "not json"]) {
      m.dispatchEmail.mockClear();
      const at = "http://127.0.0.1:3000/tools/handoff/email/dispatch";
      const r = await route.POST(new Request(at, { method: "POST", headers: { host: "127.0.0.1:3000", "x-forwarded-for": "::ffff:127.0.0.1" }, body: body ?? "" }));
      expect(r.status).toBe(200);
      expect(m.dispatchEmail).toHaveBeenCalledWith(POOL, { sender: CAPTURE, siteUrl: "http://127.0.0.1:3000", worlds: "test", limit: 25 }, storeDispatchDeps);
    }
  });

  it("development: is not there for another machine (404), whatever URL the server gives the route, and runs nothing", async () => {
    env("development");
    for (const url of ["http://192.168.1.20:3000/tools/handoff/email/dispatch", "http://penntools.example.org/tools/handoff/email/dispatch"]) {
      const res = await post(url, { body: {} });
      expect(res.status, url).toBe(404);
      expect(await res.text()).toBe("");
    }
    // The dev server's own origin as the URL, from another machine: its Host, or its address in X-Forwarded-For.
    for (const o of [{ host: "192.168.1.20:3000" }, { from: "192.168.1.30" }, { from: "::ffff:192.168.1.30" }]) {
      expect((await post(LOCAL, { body: {}, ...o })).status, JSON.stringify(o)).toBe(404);
    }
    expect(m.toolSql).not.toHaveBeenCalled();
    expect(m.dispatchEmail).not.toHaveBeenCalled();
  });

  it("production: is not there (404) without a provider, its key, a sender, the secret, an https site or the allowlist; runs nothing", async () => {
    const missing: Partial<Record<EnvName, string>>[] = [
      {},
      { HANDOFF_EMAIL_PROVIDER: "" },
      { HANDOFF_EMAIL_PROVIDER: "sendgrid" },
      { HANDOFF_EMAIL_API_KEY: "" },
      { HANDOFF_EMAIL_FROM: "" },
      { HANDOFF_EMAIL_DISPATCH_SECRET: "" },
      { HANDOFF_EMAIL_DISPATCH_SECRET: "too-short" },
      { NEXTAUTH_URL: "http://penntools.example.org" },
      { HANDOFF_EMAIL_ALLOWLIST: "" },
    ];
    for (const [i, over] of missing.entries()) {
      env("production", i === 0 ? {} : { ...PROD, ...over });
      const res = await post(AT, { body: {}, auth: `Bearer ${SECRET}` });
      expect(res.status, JSON.stringify(over)).toBe(404);
    }
    expect(m.toolSql).not.toHaveBeenCalled();
    expect(m.dispatchEmail).not.toHaveBeenCalled();
  });

  it("production: a missing or wrong bearer gets 401, and runs nothing", async () => {
    env("production", PROD);
    for (const auth of [undefined, "", SECRET, `Bearer ${SECRET.slice(1)}`, `Bearer ${SECRET}x`, `Basic ${SECRET}`]) {
      const res = await post(AT, { body: {}, ...(auth !== undefined ? { auth } : {}) });
      expect(res.status, String(auth)).toBe(401);
    }
    expect(m.toolSql).not.toHaveBeenCalled();
    expect(m.dispatchEmail).not.toHaveBeenCalled();
  });

  it("answers 503 when the server has no database, and runs nothing", async () => {
    m.toolSql.mockReturnValue(null);
    env("development");
    expect((await post(LOCAL, { body: {} })).status).toBe(503);
    env("production", PROD);
    expect((await post(AT, { body: {}, auth: `Bearer ${SECRET}` })).status).toBe(503);
    expect(m.dispatchEmail).not.toHaveBeenCalled();
  });

  it("production with everything set: the Resend adapter for the live world, limited to the allowlist, never the capture", async () => {
    env("production", PROD);
    const res = await post(AT, { body: { limit: 100, noGrace: true }, auth: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COUNTS);
    expect(m.sqlCaptureSender).not.toHaveBeenCalled();
    const [pool, options, deps] = m.dispatchEmail.mock.calls[0] ?? [];
    expect(pool).toBe(POOL);
    expect(deps).toBe(storeDispatchDeps);
    expect(options).toMatchObject({ siteUrl: SITE, worlds: "live", limit: 100 });
    expect(options).not.toHaveProperty("graceMs"); // a provider always waits out the grace period
    const sender = (options as { sender: { kind: string; endpoint: string; allows(r: { address: string; signIn: "google" | "dev" }): boolean } }).sender;
    expect(sender.kind).toBe("provider");
    expect(sender.endpoint).toBe("https://api.resend.com/emails");
    expect(sender.allows({ address: "ann@upenn.edu", signIn: "google" })).toBe(true);
    expect(sender.allows({ address: "bob@upenn.edu", signIn: "google" })).toBe(false);
    expect(sender.allows({ address: "ann@upenn.edu", signIn: "dev" })).toBe(false);
  });

  it("answers 500 when a run fails, logging the error's class only", async () => {
    env("development");
    m.dispatchEmail.mockRejectedValue(new TypeError("planted detail ann@upenn.edu"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await post(LOCAL, { body: {} });
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("");
      expect(log).toHaveBeenCalledWith("[handoff] email dispatch failed", { error: "TypeError" });
      expect(JSON.stringify(log.mock.calls)).not.toContain("planted");
    } finally {
      log.mockRestore();
    }
  });
});
