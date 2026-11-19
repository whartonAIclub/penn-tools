// POST /tools/handoff/act (review of PR #88): the route a change with a photo goes through. Its own checks, with the handler, the
// session, the pool and the cookies faked: no database, no sign-in. The handler (handleAct) is tested in the tool's own package.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACT_BODY_MAX_BYTES, PHOTO_SIZE_ERROR } from "@penntools/tool-handoff";
import { sameHost } from "../_lib/same-host";

const state = vi.hoisted(() => ({ calls: [] as unknown[], world: undefined as string | undefined }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null }));
vi.mock("@penntools/platform/db", () => ({ toolSql: () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "handoff-world" && state.world ? { value: state.world } : undefined) }),
}));
vi.mock("@penntools/tool-handoff", async (importOriginal) => {
  const real = await importOriginal<typeof import("@penntools/tool-handoff")>();
  return {
    ...real,
    handleAct: async (ctx: { worldId(): string }, input: unknown) => {
      state.calls.push({ input, worldId: ctx.worldId() });
      return { ok: false, code: "signed_out", error: "Sign in to do this." };
    },
  };
});

const { POST } = await import("../act/route");

function post(body: string, headers: Record<string, string> = {}, url = "http://localhost:3000/tools/handoff/act"): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", host: new URL(url).host, ...headers }, body });
}

beforeEach(() => {
  state.calls = [];
  state.world = undefined;
});

describe("POST /tools/handoff/act", () => {
  it("passes a same-site JSON body to the handler and answers its result, not cached", async () => {
    const input = { viewerId: "u1", protocol: 1, requestId: "r", action: { type: "postItem" }, photo: "AAAA" };
    const res = await POST(post(JSON.stringify(input), { origin: "http://localhost:3000" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, code: "signed_out", error: "Sign in to do this." });
    expect(state.calls).toEqual([{ input, worldId: "live" }]);
  });

  it("refuses another site's request before reading it", async () => {
    const res = await POST(post("{}", { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it("takes a request through a proxy: https outside, http inside, the host forwarded", async () => {
    const res = await POST(post("{}", { origin: "https://tools.example.org", "x-forwarded-host": "tools.example.org" }, "http://10.0.0.5:8080/tools/handoff/act"));
    expect(res.status).toBe(200);
    expect(state.calls).toHaveLength(1);
  });

  it("refuses a body that isn't JSON (a plain form can't send one without the browser asking first)", async () => {
    const res = await POST(post("{}", { origin: "http://localhost:3000", "content-type": "text/plain" }));
    expect(res.status).toBe(415);
    expect(state.calls).toEqual([]);
  });

  it("refuses a body over the cap with 413 and the photo-size message, without calling the handler", async () => {
    const res = await POST(post("x".repeat(ACT_BODY_MAX_BYTES + 1), { origin: "http://localhost:3000" }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ ok: false, code: "invalid", error: PHOTO_SIZE_ERROR });
    expect(state.calls).toEqual([]);
  });

  it("hands a body that isn't JSON text to the handler as null, which answers it as the server action would", async () => {
    const res = await POST(post("not json", { origin: "http://localhost:3000" }));
    expect(res.status).toBe(200);
    expect(state.calls).toEqual([{ input: null, worldId: "live" }]);
  });

  it("uses the live world outside development, whatever the test-world cookie says", async () => {
    state.world = "test-something";
    await POST(post("{}"));
    expect(state.calls).toEqual([{ input: {}, worldId: "live" }]);
  });
});

describe("sameHost", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("compares the Origin's host with the forwarded host, else the Host header", () => {
    expect(sameHost(h({ host: "localhost:3000" }))).toBe(true); // no Origin
    expect(sameHost(h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(sameHost(h({ origin: "https://a.example", host: "internal:8080", "x-forwarded-host": "a.example, proxy.example" }))).toBe(true);
    expect(sameHost(h({ origin: "https://a.example", host: "a.example" }))).toBe(true);
    expect(sameHost(h({ origin: "https://b.example", host: "a.example" }))).toBe(false);
    expect(sameHost(h({ origin: "https://a.example:444", host: "a.example" }))).toBe(false);
    expect(sameHost(h({ origin: "null", host: "a.example" }))).toBe(false);
    expect(sameHost(h({ origin: "https://a.example" }))).toBe(false); // nothing to compare with
  });
});
