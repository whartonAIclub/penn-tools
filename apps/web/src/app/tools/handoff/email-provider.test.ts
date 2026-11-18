// The Resend adapter (email-provider.ts) against a fake Resend on this machine: a node:http server on 127.0.0.1 that records each request
// and answers as each test says. The adapter's fetch is one that refuses any other host, so nothing here can reach Resend or anyone's
// inbox, whatever the code under test does. The key and the addresses are made up.
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { EmailMessage } from "@penntools/tool-handoff";
import { IDEMPOTENCY_KEY_MAX, failureOf, resendSender, type ResendOptions } from "./email-provider";

interface Seen {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}
interface Reply {
  status: number;
  body?: string;
  delayMs?: number;
  headers?: Record<string, string>;
}

const KEY = "re_test_0123456789abcdef";
const FROM = "Handoff <handoff@send.penntools.example.org>";
const OK_ID = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";
const MESSAGE: EmailMessage = {
  to: "ann@upenn.edu",
  subject: "Offer on your [Test] Spring Formal ticket",
  text: "Handoff made an offer. Accept, counter or decline by Nov 10, 2026, 6:00 PM.\n\nhttps://penntools.example.org/tools/handoff#activity?listing=l0123456789abcdef\n",
  html: "<p>Handoff made an offer.</p>",
  idempotencyKey: "handoff:live:n-0123456789abcdef",
  actionUrl: "https://penntools.example.org/tools/handoff#activity?listing=l0123456789abcdef",
};

let server: Server;
let base = "";
const seen: Seen[] = [];
let replies: Reply[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    res.on("error", () => {}); // a reply after the client gave up (the timeout test) goes nowhere
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      seen.push({ method: req.method ?? "", path: req.url ?? "", headers: req.headers, body });
      const r = replies.shift() ?? { status: 200, body: JSON.stringify({ id: OK_ID }) };
      const answer = (): void => {
        if (res.destroyed) return;
        res.writeHead(r.status, { "content-type": "application/json", ...r.headers });
        res.end(r.body ?? "");
      };
      if (r.delayMs) setTimeout(answer, r.delayMs);
      else answer();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  seen.length = 0;
  replies = [];
});

/** A fetch that reaches this machine only: a request anywhere else fails the test instead of leaving it. */
const localOnly: typeof fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "127.0.0.1") throw new Error(`Refused a request to ${url.host}: these tests only reach the fake server on 127.0.0.1.`);
  return fetch(input, init);
};

const sender = (over: Partial<ResendOptions> = {}) =>
  resendSender({ apiKey: KEY, from: FROM, allowlist: ["ann@upenn.edu"], baseUrl: base, fetch: localOnly, ...over });

/** A port nothing listens on (it was free a moment ago). */
async function closedPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((resolve) => s.close(() => resolve()));
  return port;
}

describe("the Resend adapter, against a fake Resend on this machine", () => {
  it("posts one email to the send endpoint: the key as a bearer, the idempotency key, and only from, to, subject, text and html", async () => {
    replies = [{ status: 200, body: JSON.stringify({ id: OK_ID, object: "email" }) }];
    expect(await sender().send(MESSAGE)).toEqual({ ok: true, providerId: OK_ID });
    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("POST");
    expect(req?.path).toBe("/emails");
    expect(req?.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(req?.headers["content-type"]).toBe("application/json");
    expect(req?.headers["idempotency-key"]).toBe(MESSAGE.idempotencyKey);
    expect(JSON.parse(req?.body ?? "")).toEqual({ from: FROM, to: MESSAGE.to, subject: MESSAGE.subject, text: MESSAGE.text, html: MESSAGE.html });
    expect(req?.body).not.toContain(KEY); // the key goes in the header only
    // Without html, none is sent.
    const { html: _html, ...plain } = MESSAGE;
    expect(await sender().send(plain)).toMatchObject({ ok: true });
    expect(Object.keys(JSON.parse(seen[1]?.body ?? "{}")).sort()).toEqual(["from", "subject", "text", "to"]);
  });

  it("sends the same idempotency key and the same email on every retry, so Resend can send it once", async () => {
    replies = [{ status: 500 }, { status: 429 }, { status: 200, body: JSON.stringify({ id: OK_ID }) }];
    const s = sender();
    expect(await s.send(MESSAGE)).toEqual({ ok: false, retryable: true, code: "server_error" });
    expect(await s.send(MESSAGE)).toEqual({ ok: false, retryable: true, code: "rate_limited" });
    expect(await s.send(MESSAGE)).toEqual({ ok: true, providerId: OK_ID });
    expect(seen.map((r) => r.headers["idempotency-key"])).toEqual([MESSAGE.idempotencyKey, MESSAGE.idempotencyKey, MESSAGE.idempotencyKey]);
    expect(new Set(seen.map((r) => r.body)).size).toBe(1);
  });

  it("answers 429, 5xx and 408 as retryable", async () => {
    for (const [status, code] of [[429, "rate_limited"], [500, "server_error"], [502, "server_error"], [503, "server_error"], [408, "timeout"]] as const) {
      replies = [{ status, body: JSON.stringify({ name: "x", message: "planted provider message" }) }];
      expect(await sender().send(MESSAGE), String(status)).toEqual({ ok: false, retryable: true, code });
    }
  });

  it("gives up on a send that takes too long (retryable timeout), and on a connection that fails (retryable network)", async () => {
    replies = [{ status: 200, body: JSON.stringify({ id: OK_ID }), delayMs: 1_500 }];
    const started = Date.now();
    expect(await sender({ timeoutMs: 200 }).send(MESSAGE)).toEqual({ ok: false, retryable: true, code: "timeout" });
    expect(Date.now() - started).toBeLessThan(1_400);
    expect(seen).toHaveLength(1);
    const port = await closedPort();
    expect(await sender({ baseUrl: `http://127.0.0.1:${port}` }).send(MESSAGE)).toEqual({ ok: false, retryable: true, code: "network" });
  });

  it("answers 401 and 403 as auth (the key is wrong or can't send): not retryable here; the dispatcher stops the run", async () => {
    for (const status of [401, 403]) {
      replies = [{ status, body: JSON.stringify({ name: "invalid_api_key", message: "API key is invalid" }) }];
      expect(await sender().send(MESSAGE), String(status)).toEqual({ ok: false, retryable: false, code: "auth" });
    }
  });

  it("answers every other 4xx as rejected, never retried", async () => {
    for (const status of [400, 404, 405, 409, 413, 422]) {
      replies = [{ status, body: JSON.stringify({ name: "validation_error", message: "planted" }) }];
      expect(await sender().send(MESSAGE), String(status)).toEqual({ ok: false, retryable: false, code: "rejected" });
    }
  });

  it("reads Resend's two idempotency answers (409): a key it already used with other wording was accepted before and isn't sent again; one still in flight is retried", async () => {
    // After a lost answer, the retry's wording may differ (a price changed in between): Resend refuses it, having taken the first.
    replies = [{ status: 409, body: JSON.stringify({ statusCode: 409, name: "invalid_idempotent_request", message: "planted: same key, another payload" }) }];
    expect(await sender().send(MESSAGE)).toEqual({ ok: true, providerId: null, duplicate: true });
    replies = [{ status: 409, body: JSON.stringify({ statusCode: 409, name: "concurrent_idempotent_requests", message: "planted: still in progress" }) }];
    expect(await sender().send(MESSAGE)).toEqual({ ok: false, retryable: true, code: "timeout" });
    // Any other 409, or one whose answer can't be read, stays rejected: nothing is taken as delivered on a guess.
    for (const body of ["", "not json", "null", JSON.stringify({ name: "validation_error" }), JSON.stringify({ name: 409 }), JSON.stringify(["invalid_idempotent_request"]),
      JSON.stringify({ message: "invalid_idempotent_request" }), JSON.stringify({ name: "INVALID_IDEMPOTENT_REQUEST" }), JSON.stringify({ name: "invalid_idempotent_request " })]) {
      replies = [{ status: 409, body }];
      expect(await sender().send(MESSAGE), body.slice(0, 40)).toEqual({ ok: false, retryable: false, code: "rejected" });
    }
    // The names mean this only on a 409.
    for (const status of [400, 422]) {
      replies = [{ status, body: JSON.stringify({ name: "invalid_idempotent_request" }) }];
      expect(await sender().send(MESSAGE), String(status)).toEqual({ ok: false, retryable: false, code: "rejected" });
    }
    expect(new Set(seen.map((r) => r.headers["idempotency-key"]))).toEqual(new Set([MESSAGE.idempotencyKey]));
  });

  it("never follows a redirect: the endpoint isn't Resend's API (config), and nothing goes anywhere else", async () => {
    replies = [{ status: 307, headers: { location: `${base}/elsewhere` } }];
    expect(await sender().send(MESSAGE)).toEqual({ ok: false, retryable: false, code: "config" });
    expect(seen.map((r) => r.path)).toEqual(["/emails"]);
  });

  it("keeps only Resend's id from the answer, and still counts a 2xx without one as sent", async () => {
    for (const body of ["", "not json", JSON.stringify({ id: "x".repeat(201) }), JSON.stringify({ id: 42 }), JSON.stringify([OK_ID]), JSON.stringify({ id: "a\nb" })]) {
      replies = [{ status: 200, body }];
      expect(await sender().send(MESSAGE), body.slice(0, 20)).toEqual({ ok: true, providerId: null });
    }
    replies = [{ status: 202, body: JSON.stringify({ id: "re-202" }) }];
    expect(await sender().send(MESSAGE)).toEqual({ ok: true, providerId: "re-202" });
  });
});

describe("the Resend adapter's gate and configuration (no request is made)", () => {
  it("sends to no one the provider gate refuses: the allowlist, the development sign-in, TEST accounts, other domains", async () => {
    const s = sender();
    expect(s.allows({ address: "ann@upenn.edu", signIn: "google" })).toBe(true);
    expect(s.allows({ address: "ANN@upenn.edu", signIn: "google" })).toBe(true);
    for (const r of [
      { address: "bob@upenn.edu", signIn: "google" }, // a Penn address, but not on the allowlist
      { address: "ann@upenn.edu", signIn: "dev" }, // the development sign-in
      { address: "dev@localhost", signIn: "dev" }, // the shared development identity
      { address: "handoff-test-a@upenn.edu", signIn: "google" }, // a TEST account
      { address: "ann@gmail.com", signIn: "google" },
    ] as const) {
      expect(s.allows(r), JSON.stringify(r)).toBe(false);
    }
    for (const to of ["bob@upenn.edu", "dev@localhost", "handoff-test-a@upenn.edu", "ann@gmail.com", "ann@upenn.edu.example.org", "", "ann@upenn.edu, bob@upenn.edu"]) {
      expect(await s.send({ ...MESSAGE, to }), to).toEqual({ ok: false, retryable: false, code: "rejected" });
    }
    // With the allowlist lifted ("*"), any Penn address the gate allows; still never a TEST account or the development identity.
    const open = sender({ allowlist: null });
    expect(open.allows({ address: "bob@wharton.upenn.edu", signIn: "google" })).toBe(true);
    expect(await open.send({ ...MESSAGE, to: "handoff-test-b@upenn.edu" })).toEqual({ ok: false, retryable: false, code: "rejected" });
    expect(await open.send({ ...MESSAGE, to: "dev@localhost" })).toEqual({ ok: false, retryable: false, code: "rejected" });
    expect(seen).toHaveLength(0);
  });

  it("makes no request at all without a key, a sender or an http(s) endpoint: not ready, nobody allowed, config", async () => {
    for (const over of [{ apiKey: "" }, { apiKey: "  " }, { apiKey: "re_ two" }, { from: "" }, { baseUrl: "ftp://127.0.0.1:1" }, { baseUrl: "not a url" }, { baseUrl: "http://user:pw@127.0.0.1:1" }]) {
      const s = sender(over);
      expect(await s.ready(), JSON.stringify(over)).toBe(false);
      expect(s.allows({ address: "ann@upenn.edu", signIn: "google" })).toBe(false);
      expect(await s.send(MESSAGE), JSON.stringify(over)).toEqual({ ok: false, retryable: false, code: "config" });
    }
    expect(await sender().ready()).toBe(true);
    expect(seen).toHaveLength(0);
  });

  it("isn't configured with a key an HTTP header can't carry (a pasted zero-width space, an accent): not ready, config, never a network retry", async () => {
    for (const apiKey of [`re_​${KEY}`, `${KEY}​`, `re_é${KEY}`, `“${KEY}”`, `${KEY}\u{1f511}`]) {
      const s = sender({ apiKey });
      expect(await s.ready(), JSON.stringify(apiKey)).toBe(false);
      expect(s.allows({ address: "ann@upenn.edu", signIn: "google" }), JSON.stringify(apiKey)).toBe(false);
      expect(await s.send(MESSAGE), JSON.stringify(apiKey)).toEqual({ ok: false, retryable: false, code: "config" });
    }
    expect(seen).toHaveLength(0);
  });

  it("answers config, not a retryable network failure, when the request can't even be built, and never calls fetch then", async () => {
    // A fetch that fails the way Node's does for a header it can't carry would otherwise read as a network failure, retried five times.
    let calls = 0;
    const throwing: typeof fetch = () => {
      calls += 1;
      throw new TypeError("Cannot convert argument to a ByteString");
    };
    const RealHeaders = globalThis.Headers;
    class NoHeaders {
      constructor() {
        throw new TypeError("Headers can't be built");
      }
    }
    globalThis.Headers = NoHeaders as unknown as typeof Headers;
    try {
      expect(await sender({ fetch: throwing }).send(MESSAGE)).toEqual({ ok: false, retryable: false, code: "config" });
    } finally {
      globalThis.Headers = RealHeaders;
    }
    expect(calls).toBe(0);
    expect(seen).toHaveLength(0);
  });

  it("refuses a message Resend shouldn't be given, without a request", async () => {
    for (const bad of [
      { subject: "" },
      { subject: "Two\nlines" },
      { subject: "s".repeat(201) },
      { text: " " },
      { text: "t".repeat(4_001) },
      { idempotencyKey: "" },
      { idempotencyKey: "has a space" },
      { idempotencyKey: "k".repeat(IDEMPOTENCY_KEY_MAX + 1) },
    ]) {
      expect(await sender().send({ ...MESSAGE, ...bad }), JSON.stringify(bad).slice(0, 40)).toEqual({ ok: false, retryable: false, code: "rejected" });
    }
    expect(seen).toHaveLength(0);
    // The longest key Resend accepts goes through.
    expect(await sender().send({ ...MESSAGE, idempotencyKey: "k".repeat(IDEMPOTENCY_KEY_MAX) })).toMatchObject({ ok: true });
  });

  it("maps every status the same way when it isn't 2xx", () => {
    expect(failureOf(401)).toEqual({ ok: false, retryable: false, code: "auth" });
    expect(failureOf(403)).toEqual({ ok: false, retryable: false, code: "auth" });
    expect(failureOf(429)).toEqual({ ok: false, retryable: true, code: "rate_limited" });
    expect(failureOf(408)).toEqual({ ok: false, retryable: true, code: "timeout" });
    expect(failureOf(599)).toEqual({ ok: false, retryable: true, code: "server_error" });
    expect(failureOf(301)).toEqual({ ok: false, retryable: false, code: "config" });
    expect(failureOf(418)).toEqual({ ok: false, retryable: false, code: "rejected" });
    expect(failureOf(101)).toEqual({ ok: false, retryable: true, code: "server_error" });
  });
});
