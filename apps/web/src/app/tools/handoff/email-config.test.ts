import { describe, expect, it, vi } from "vitest";
import {
  DISPATCH_LIMIT,
  dispatchAuthorized,
  dispatchRunOptions,
  emailDispatchSetup,
  fromThisMachine,
  parseAllowlist,
  providerSender,
  providerSettings,
  senderAddress,
  type DispatchConfig,
  type DispatchRequest,
  type EmailEnv,
  type ProviderDispatchConfig,
} from "./email-config";
import { RESEND_BASE_URL } from "./email-provider";

const SECRET = "s".repeat(16) + "0123456789abcdef"; // 32 bytes
const KEY = "re_test_0123456789abcdef"; // made up: nothing here ever reaches a provider
const FROM = "Handoff <handoff@send.penntools.example.org>";
const NO_PROVIDER = { HANDOFF_EMAIL_PROVIDER: undefined, HANDOFF_EMAIL_API_KEY: undefined, HANDOFF_EMAIL_FROM: undefined };
const DEV: EmailEnv = { NODE_ENV: "development", ...NO_PROVIDER, HANDOFF_EMAIL_DISPATCH_SECRET: undefined, NEXTAUTH_URL: "http://localhost:3000", HANDOFF_EMAIL_ALLOWLIST: undefined };
const PROD: EmailEnv = {
  NODE_ENV: "production",
  HANDOFF_EMAIL_PROVIDER: "resend",
  HANDOFF_EMAIL_API_KEY: KEY,
  HANDOFF_EMAIL_FROM: FROM,
  HANDOFF_EMAIL_DISPATCH_SECRET: SECRET,
  NEXTAUTH_URL: "https://penntools.example.org",
  HANDOFF_EMAIL_ALLOWLIST: "ann@upenn.edu",
};
const LOCAL_URL = "http://localhost:3000/tools/handoff/email/dispatch";
const AT_URL = "https://penntools.example.org/tools/handoff/email/dispatch";
const PROVIDER = { name: "resend", apiKey: KEY, from: FROM } as const;

/** A request to `url` as Next's dev server hands it to a route: the Host the client used, and X-Forwarded-For from its connection. */
function request(url: string, headers: Record<string, string> = {}): DispatchRequest {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    // not a URL: no Host either
  }
  return { url, headers: new Headers({ ...(host ? { host } : {}), "x-forwarded-for": "::1", ...headers }) };
}
const LOCAL = request(LOCAL_URL);
const AT = request(AT_URL, { "x-forwarded-for": "203.0.113.7" });

describe("emailDispatchSetup", () => {
  it("is the capture, for test worlds, on a development server reached from this machine", () => {
    expect(emailDispatchSetup(DEV, LOCAL)).toEqual({ ok: true, config: { mode: "capture", worlds: "test", siteUrl: "http://localhost:3000" } });
    expect(emailDispatchSetup(DEV, request("http://127.0.0.1:3001/tools/handoff/email/dispatch", { "x-forwarded-for": "::ffff:127.0.0.1" })))
      .toEqual({ ok: true, config: { mode: "capture", worlds: "test", siteUrl: "http://127.0.0.1:3001" } });
    expect(emailDispatchSetup(DEV, request("http://[::1]:3000/x"))).toMatchObject({ ok: true, config: { siteUrl: "http://[::1]:3000" } });
    // Development never uses a provider, whatever is configured.
    expect(emailDispatchSetup({ ...PROD, NODE_ENV: "development" }, LOCAL)).toEqual({ ok: true, config: { mode: "capture", worlds: "test", siteUrl: "http://localhost:3000" } });
  });

  it("is not there on a development server reached from another machine", () => {
    for (const url of ["http://192.168.1.20:3000/tools/handoff/email/dispatch", "http://penntools.example.org/x", "not a url"]) {
      expect(emailDispatchSetup(DEV, request(url)), url).toEqual({ ok: false, status: 404, why: "not_this_machine" });
    }
    // The dev server gives a route its own origin as the URL whatever the client asked for: the headers say where it came from.
    for (const headers of [
      { host: "192.168.1.20:3000" },
      { "x-forwarded-for": "192.168.1.20" },
      { "x-forwarded-for": "::ffff:192.168.1.20" },
      { "x-forwarded-for": "127.0.0.1, 10.0.0.5" },
      { "x-forwarded-host": "penntools.example.org" },
    ]) {
      expect(emailDispatchSetup(DEV, request(LOCAL_URL, headers)), JSON.stringify(headers)).toEqual({ ok: false, status: 404, why: "not_this_machine" });
    }
    expect(emailDispatchSetup(DEV, { url: LOCAL_URL, headers: new Headers() })).toEqual({ ok: false, status: 404, why: "not_this_machine" }); // no Host
  });

  it("is not there in production without a configured provider: its name, its key and the sender, all three", () => {
    expect(emailDispatchSetup({ ...PROD, ...NO_PROVIDER }, AT)).toEqual({ ok: false, status: 404, why: "no_provider" });
    for (const env of ["test", undefined, "", "Development"]) {
      expect(emailDispatchSetup({ ...DEV, NODE_ENV: env }, LOCAL), String(env)).toEqual({ ok: false, status: 404, why: "no_provider" });
    }
    for (const over of [
      { HANDOFF_EMAIL_PROVIDER: undefined }, { HANDOFF_EMAIL_PROVIDER: "" }, { HANDOFF_EMAIL_PROVIDER: "sendgrid" }, { HANDOFF_EMAIL_PROVIDER: "smtp" },
      { HANDOFF_EMAIL_API_KEY: undefined }, { HANDOFF_EMAIL_API_KEY: "" }, { HANDOFF_EMAIL_API_KEY: "re_ two" },
      { HANDOFF_EMAIL_FROM: undefined }, { HANDOFF_EMAIL_FROM: "" }, { HANDOFF_EMAIL_FROM: "Handoff" }, { HANDOFF_EMAIL_FROM: "Handoff <handoff@localhost>" },
    ]) {
      expect(emailDispatchSetup({ ...PROD, ...over }, AT), JSON.stringify(over)).toEqual({ ok: false, status: 404, why: "no_provider" });
    }
  });

  it("needs a secret of at least 32 bytes, an https site and an allowlist in production", () => {
    expect(emailDispatchSetup(PROD, AT)).toEqual({
      ok: true,
      config: { mode: "provider", worlds: "live", siteUrl: "https://penntools.example.org", secret: SECRET, allowlist: ["ann@upenn.edu"], provider: PROVIDER },
    });
    for (const secret of [undefined, "", "short", "s".repeat(31), ` ${SECRET}`, `${SECRET.slice(0, 20)} ${SECRET.slice(20)}`]) {
      expect(emailDispatchSetup({ ...PROD, HANDOFF_EMAIL_DISPATCH_SECRET: secret }, AT), String(secret)).toEqual({ ok: false, status: 404, why: "no_secret" });
    }
    for (const site of [undefined, "", "http://penntools.example.org", "penntools.example.org"]) {
      expect(emailDispatchSetup({ ...PROD, NEXTAUTH_URL: site }, AT), String(site)).toEqual({ ok: false, status: 404, why: "no_site" });
    }
    for (const list of [undefined, "", "  ", "not-an-address", "dev@localhost"]) {
      expect(emailDispatchSetup({ ...PROD, HANDOFF_EMAIL_ALLOWLIST: list }, AT), String(list)).toEqual({ ok: false, status: 404, why: "no_allowlist" });
    }
    expect(emailDispatchSetup({ ...PROD, HANDOFF_EMAIL_ALLOWLIST: "*" }, AT)).toMatchObject({ ok: true, config: { allowlist: null } });
    expect(emailDispatchSetup({ ...PROD, NEXTAUTH_URL: "https://penntools.example.org/" }, AT)).toMatchObject({ ok: true, config: { siteUrl: "https://penntools.example.org" } });
  });
});

describe("fromThisMachine", () => {
  it("takes loopback hosts and connection addresses only, as Next's dev server reports them", () => {
    for (const ok of [
      { host: "localhost:3000" },
      { host: "localhost" },
      { host: "LOCALHOST:3000", "x-forwarded-for": "127.0.0.1" },
      { host: "127.0.0.1:3000", "x-forwarded-for": "::ffff:127.0.0.1" },
      { host: "[::1]:3000", "x-forwarded-for": "::1", "x-forwarded-host": "localhost:3000" },
    ]) {
      expect(fromThisMachine(new Headers(ok)), JSON.stringify(ok)).toBe(true);
    }
    for (const bad of [
      {},
      { host: "" },
      { host: "localhost.example.org:3000" },
      { host: "localhost@evil.example" },
      { host: "evil.example#@localhost" },
      { host: "localhost:3000", "x-forwarded-for": "" },
      { host: "localhost:3000", "x-forwarded-for": "128.0.0.1" },
      { host: "localhost:3000", "x-forwarded-for": "unknown" },
      { host: "localhost:3000", "x-forwarded-host": "localhost:3000, evil.example" },
    ]) {
      expect(fromThisMachine(new Headers(bad)), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("providerSettings and senderAddress", () => {
  it("reads the provider's name (any case), its key and the sender, or nothing", () => {
    expect(providerSettings(PROD)).toEqual(PROVIDER);
    expect(providerSettings({ ...PROD, HANDOFF_EMAIL_PROVIDER: " Resend ", HANDOFF_EMAIL_API_KEY: ` ${KEY} ` })).toEqual(PROVIDER);
    expect(providerSettings(NO_PROVIDER)).toBeNull();
    expect(providerSettings({ ...PROD, HANDOFF_EMAIL_API_KEY: `${KEY}\n` + "x" })).toBeNull();
    expect(providerSettings({ ...PROD, HANDOFF_EMAIL_API_KEY: "k".repeat(513) })).toBeNull();
  });

  it("takes only a key an HTTP header can carry (printable ASCII): one with a pasted zero-width space is no provider, so the route isn't there", () => {
    for (const key of [`re_​${KEY}`, `${KEY}​`, `​${KEY}`, `re_é${KEY}`, `re_﻿${KEY}`, `“${KEY}”`, `${KEY} x`, `${KEY}\u{1f511}`]) {
      const env = { ...PROD, HANDOFF_EMAIL_API_KEY: key };
      expect(providerSettings(env), JSON.stringify(key)).toBeNull();
      expect(emailDispatchSetup(env, AT), JSON.stringify(key)).toEqual({ ok: false, status: 404, why: "no_provider" });
    }
    // Every printable ASCII character is fine.
    const ascii = "re_AZaz09-_.~!#$%&'*+^`|:/=";
    expect(providerSettings({ ...PROD, HANDOFF_EMAIL_API_KEY: ascii })).toEqual({ ...PROVIDER, apiKey: ascii });
  });

  it("takes a sender as an address or a name and an address, on one line", () => {
    for (const ok of ["handoff@send.penntools.example.org", "Handoff <handoff@send.penntools.example.org>", '"Handoff, Penn" <h@x.org>', "<h@x.org>"]) {
      expect(senderAddress(ok), ok).toBe(ok);
    }
    expect(senderAddress("  Handoff <h@x.org>  ")).toBe("Handoff <h@x.org>");
    for (const bad of [undefined, "", "Handoff", "h@x", "Handoff <h@x>", "a@b.org, c@d.org", "Handoff <h@x.org>\r\nBcc: e@f.org", "Handoff <h@x.org> extra", `${"n".repeat(320)} <h@x.org>`]) {
      expect(senderAddress(bad), String(bad)).toBeNull();
    }
  });
});

describe("parseAllowlist", () => {
  it("reads addresses separated by commas, semicolons or spaces, lowercased and once each; * lifts it", () => {
    expect(parseAllowlist(" Ann@UPenn.edu, bob@wharton.upenn.edu;ann@upenn.edu  cat@upenn.edu ")).toEqual(["ann@upenn.edu", "bob@wharton.upenn.edu", "cat@upenn.edu"]);
    expect(parseAllowlist("*")).toBeNull();
    expect(parseAllowlist(undefined)).toBeUndefined();
    expect(parseAllowlist("x, y@")).toBeUndefined();
  });
});

describe("dispatchAuthorized", () => {
  const provider: DispatchConfig = { mode: "provider", worlds: "live", siteUrl: "https://penntools.example.org", secret: SECRET, allowlist: null, provider: PROVIDER };
  it("takes only the exact bearer secret in production", () => {
    expect(dispatchAuthorized(provider, `Bearer ${SECRET}`)).toBe(true);
    for (const h of [null, undefined, "", SECRET, `bearer ${SECRET}`, `Bearer  ${SECRET}`, `Bearer ${SECRET} `, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, "Bearer", `Basic ${SECRET}`]) {
      expect(dispatchAuthorized(provider, h), String(h)).toBe(false);
    }
  });

  it("needs none in development, where the route only answers this machine and only the capture runs", () => {
    expect(dispatchAuthorized({ mode: "capture", worlds: "test", siteUrl: "http://localhost:3000" }, null)).toBe(true);
  });
});

describe("dispatchRunOptions", () => {
  const capture: DispatchConfig = { mode: "capture", worlds: "test", siteUrl: "http://localhost:3000" };
  const provider: DispatchConfig = { mode: "provider", worlds: "live", siteUrl: "https://penntools.example.org", secret: SECRET, allowlist: null, provider: PROVIDER };
  it("takes a limit from 1 to 100, and skips the grace period for the capture only", () => {
    expect(dispatchRunOptions(capture, {})).toEqual({ limit: DISPATCH_LIMIT });
    expect(dispatchRunOptions(capture, { limit: 7, noGrace: true })).toEqual({ limit: 7, graceMs: 0 });
    expect(dispatchRunOptions(provider, { limit: 100, noGrace: true })).toEqual({ limit: 100 });
    for (const limit of [0, 101, 2.5, "10", null, -1]) expect(dispatchRunOptions(capture, { limit }), String(limit)).toEqual({ limit: DISPATCH_LIMIT });
    for (const body of [null, undefined, "x", [1], 5]) expect(dispatchRunOptions(capture, body), String(body)).toEqual({ limit: DISPATCH_LIMIT });
  });
});

describe("providerSender", () => {
  const config = (allowlist: readonly string[] | null): ProviderDispatchConfig => ({
    mode: "provider", worlds: "live", siteUrl: "https://penntools.example.org", secret: SECRET, allowlist, provider: PROVIDER,
  });

  it("builds the Resend adapter for Resend's own endpoint, limited to the allowlist, without sending anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const sender = providerSender(config(["ann@upenn.edu"]));
      expect(sender.kind).toBe("provider");
      expect(sender.endpoint).toBe(`${RESEND_BASE_URL}/emails`);
      expect(await sender.ready()).toBe(true);
      expect(sender.allows({ address: "Ann@UPenn.edu", signIn: "google" })).toBe(true);
      for (const r of [
        { address: "bob@upenn.edu", signIn: "google" }, // not on the allowlist
        { address: "ann@upenn.edu", signIn: "dev" }, // the development sign-in
      ] as const) {
        expect(sender.allows(r), JSON.stringify(r)).toBe(false);
      }
      const open = providerSender(config(null)); // "*": anyone the provider gate allows
      expect(open.allows({ address: "bob@wharton.upenn.edu", signIn: "google" })).toBe(true);
      for (const address of ["dev@localhost", "handoff-test-a@upenn.edu", "ann@gmail.com", "ann@upenn.edu.example.org"]) {
        expect(open.allows({ address, signIn: "google" }), address).toBe(false);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
