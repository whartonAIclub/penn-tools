// Which email dispatch this server may run (follow-on Batch 4; FOLLOWON-PLAN §2.4 and its Addendum), for the protected dispatch route
// (email/dispatch/route.ts). No server-only import, so apps/web's vitest loads it on its own (email-config.test.ts); its one import from
// the tool is the provider gate, through the provider adapter (email-provider.ts). Callers pass process.env's values; Next inlines
// NODE_ENV at build time.
//
// - Development (`next dev`): the capture sender, for test worlds only, with the request's own origin for links, and only from this
//   machine (fromThisMachine: the dev server listens on every interface, and gives a route its own origin as the URL whatever the
//   request said, so the request's Host and X-Forwarded-* headers decide). Nothing is ever sent anywhere, whatever else is configured.
// - Production: only with all of these, set as hosting environment variables:
//   - a provider: HANDOFF_EMAIL_PROVIDER=resend (the one adapter there is), HANDOFF_EMAIL_API_KEY and HANDOFF_EMAIL_FROM;
//   - HANDOFF_EMAIL_DISPATCH_SECRET, at least 32 bytes, which the scheduler sends as its bearer token;
//   - NEXTAUTH_URL over https, for the links;
//   - HANDOFF_EMAIL_ALLOWLIST: the addresses delivery is first verified with, or "*" once it has been.
//   Without all of them the route answers 404, as if it weren't there; a missing or wrong bearer gets 401.
// So nothing is ever sent without a configured provider, and never to anyone outside the allowlist until it's lifted. The provider
// adapter is built here (providerSender) and nowhere else.

import { createHash, timingSafeEqual } from "node:crypto";
import { resendSender, type ResendOptions, type ResendSender } from "./email-provider";

export const DISPATCH_SECRET_MIN_BYTES = 32;
export const DISPATCH_LIMIT = 25;
export const DISPATCH_LIMIT_MAX = 100;
/** The providers this build has an adapter for. */
export const EMAIL_PROVIDERS = ["resend"] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** A loopback IP as a connection reports it: IPv6's ::1, 127.x.x.x, or 127.x.x.x mapped into IPv6 (a dual-stack listener). */
const LOOPBACK_IP = /^(?:::1|(?:::ffff:)?127(?:\.\d{1,3}){3})$/i;
const ADDRESS = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
const CONTROLS = /[\u0000-\u001f\u007f]/;
/** Printable ASCII without spaces: what the Authorization header can carry. A pasted zero-width space or accent would fail every send. */
const HEADER_SAFE = /^[\x21-\x7e]+$/;
const API_KEY_MAX = 512;
/** RFC 5322's line limit is far more; this is plenty for "Handoff <handoff@…>". */
const FROM_MAX = 320;

/** The environment the route reads (only these). */
export interface EmailEnv {
  NODE_ENV: string | undefined;
  /** "resend": the provider adapter to send with (production). Unset: no provider, and email isn't available. */
  HANDOFF_EMAIL_PROVIDER: string | undefined;
  /** The provider's API key (production). */
  HANDOFF_EMAIL_API_KEY: string | undefined;
  /** The sender, "Handoff <handoff@…>" or a bare address, on a domain the provider has verified (production). */
  HANDOFF_EMAIL_FROM: string | undefined;
  /** The scheduler's bearer secret (production). */
  HANDOFF_EMAIL_DISPATCH_SECRET: string | undefined;
  /** The site's public URL, for links (production). */
  NEXTAUTH_URL: string | undefined;
  /** Comma-separated addresses delivery is verified with first, or "*" once it has been (production). */
  HANDOFF_EMAIL_ALLOWLIST: string | undefined;
}

/** A configured provider: what its adapter needs besides the allowlist. */
export interface ProviderSettings {
  name: EmailProviderName;
  apiKey: string;
  from: string;
}

export type ProviderDispatchConfig = {
  mode: "provider";
  worlds: "live";
  siteUrl: string;
  secret: string;
  allowlist: readonly string[] | null;
  provider: ProviderSettings;
};
export type DispatchConfig = { mode: "capture"; worlds: "test"; siteUrl: string } | ProviderDispatchConfig;

/** Why the route isn't there (by kind only, never a value). */
export type NotConfigured = "not_this_machine" | "no_provider" | "no_secret" | "no_site" | "no_allowlist";

export type DispatchSetup = { ok: true; config: DispatchConfig } | { ok: false; status: 404; why: NotConfigured };

/**
 * The provider configured by HANDOFF_EMAIL_PROVIDER, HANDOFF_EMAIL_API_KEY and HANDOFF_EMAIL_FROM, or null: no provider (unset, one this
 * build has no adapter for, or a missing or malformed key or sender). A key is printable ASCII without spaces, which is all an HTTP
 * header carries: anything else (a zero-width space pasted with it, say) is no provider, rather than one whose every send fails.
 */
export function providerSettings(env: Pick<EmailEnv, "HANDOFF_EMAIL_PROVIDER" | "HANDOFF_EMAIL_API_KEY" | "HANDOFF_EMAIL_FROM">): ProviderSettings | null {
  const name = (env.HANDOFF_EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (!(EMAIL_PROVIDERS as readonly string[]).includes(name)) return null;
  const apiKey = (env.HANDOFF_EMAIL_API_KEY ?? "").trim();
  if (!apiKey || apiKey.length > API_KEY_MAX || !HEADER_SAFE.test(apiKey)) return null;
  const from = senderAddress(env.HANDOFF_EMAIL_FROM);
  if (from === null) return null;
  return { name: name as EmailProviderName, apiKey, from };
}

/** HANDOFF_EMAIL_FROM as the provider takes it ("Name <address>" or "address", one line), or null. */
export function senderAddress(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v || v.length > FROM_MAX || CONTROLS.test(v)) return null;
  const named = /^([^<>]*)<([^<>]+)>$/.exec(v);
  const address = named ? (named[2] ?? "").trim() : v;
  return ADDRESS.test(address) ? v : null;
}

/** What the setup reads from a request (a Request is one): its URL, and in development the headers that say where it came from. */
export interface DispatchRequest {
  url: string;
  headers: { get(name: string): string | null };
}

/** The dispatch this server may run for this request. */
export function emailDispatchSetup(env: EmailEnv, req: DispatchRequest): DispatchSetup {
  if (env.NODE_ENV === "development") {
    const url = parseUrl(req.url);
    if (!url || !LOOPBACK.has(url.hostname) || !fromThisMachine(req.headers)) return { ok: false, status: 404, why: "not_this_machine" };
    return { ok: true, config: { mode: "capture", worlds: "test", siteUrl: url.origin } };
  }
  const provider = providerSettings(env);
  if (provider === null) return { ok: false, status: 404, why: "no_provider" };
  const secret = env.HANDOFF_EMAIL_DISPATCH_SECRET ?? "";
  if (new TextEncoder().encode(secret).length < DISPATCH_SECRET_MIN_BYTES || /\s/.test(secret)) return { ok: false, status: 404, why: "no_secret" };
  const site = parseUrl(env.NEXTAUTH_URL ?? "");
  if (!site || site.protocol !== "https:") return { ok: false, status: 404, why: "no_site" };
  const allowlist = parseAllowlist(env.HANDOFF_EMAIL_ALLOWLIST);
  if (allowlist === undefined) return { ok: false, status: 404, why: "no_allowlist" };
  return { ok: true, config: { mode: "provider", worlds: "live", siteUrl: site.origin, secret, allowlist, provider } };
}

/**
 * HANDOFF_EMAIL_ALLOWLIST: "*" is null (delivery verified: anyone the provider's gate allows); otherwise the valid addresses in it,
 * lowercased. Unset, or with no valid address, it's undefined: not configured.
 */
export function parseAllowlist(value: string | undefined): readonly string[] | null | undefined {
  const v = (value ?? "").trim();
  if (v === "*") return null;
  const list = [...new Set(v.split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter((a) => ADDRESS.test(a)))];
  return list.length > 0 ? list : undefined;
}

/** Whether the request may run the dispatcher: always in development (from this machine only); in production, the exact bearer. */
export function dispatchAuthorized(config: DispatchConfig, authorization: string | null | undefined): boolean {
  if (config.mode === "capture") return true;
  const m = /^Bearer (\S+)$/.exec(authorization ?? "");
  if (!m || m[1] === undefined) return false;
  // Equal-length digests, so the comparison takes the same time whatever was sent.
  const sent = createHash("sha256").update(m[1], "utf8").digest();
  const want = createHash("sha256").update(config.secret, "utf8").digest();
  return timingSafeEqual(sent, want);
}

/**
 * The run's options from the request's JSON body: `limit` (1 to 100, else 25) and, with the capture only, `noGrace` (no 2-minute wait,
 * for the local runner's --no-grace). Anything else is ignored.
 */
export function dispatchRunOptions(config: DispatchConfig, body: unknown): { limit: number; graceMs?: number } {
  const b = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const limit = typeof b["limit"] === "number" && Number.isInteger(b["limit"]) && b["limit"] >= 1 && b["limit"] <= DISPATCH_LIMIT_MAX ? b["limit"] : DISPATCH_LIMIT;
  return config.mode === "capture" && b["noGrace"] === true ? { limit, graceMs: 0 } : { limit };
}

/**
 * The provider's sender for a production dispatch: the adapter for the configured provider, limited to the allowlist. `test` points
 * it at a local fake server (tests only; the route never passes it).
 */
export function providerSender(config: ProviderDispatchConfig, test: Pick<ResendOptions, "baseUrl" | "fetch" | "timeoutMs"> = {}): ResendSender {
  const { provider, allowlist } = config;
  switch (provider.name) {
    case "resend":
      return resendSender({ apiKey: provider.apiKey, from: provider.from, allowlist, ...test });
  }
}

/**
 * Whether a development request came from this machine. Next's dev server answers on every interface and gives a route handler its
 * own origin as the URL whatever the request said, so the headers decide: the Host (and any X-Forwarded-Host) must name this machine,
 * and X-Forwarded-For, which Next fills in from the connection's address when the client sent none, must list loopback addresses only.
 * A client that writes those headers itself can still get through; all it can start is a capture run, which sends nothing anywhere.
 */
export function fromThisMachine(headers: DispatchRequest["headers"]): boolean {
  const host = headers.get("host");
  if (host === null || !LOOPBACK.has(hostnameOf(host))) return false;
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedHost !== null && !forwardedHost.split(",").every((h) => LOOPBACK.has(hostnameOf(h.trim())))) return false;
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor !== null && !forwardedFor.split(",").every((a) => LOOPBACK_IP.test(a.trim()))) return false;
  return true;
}

/** The host name in a Host header ("localhost:3000" → "localhost", "[::1]:3000" → "[::1]"), or "" when it isn't one. */
function hostnameOf(host: string): string {
  if (!host || /[\s/\\@?#]/.test(host)) return "";
  return parseUrl(`http://${host}`)?.hostname ?? "";
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
