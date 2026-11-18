// Handoff's email provider adapter (follow-on Batch 4; USER-INSTRUCTIONS §9c): the one EmailSender that sends real email, through
// Resend's send endpoint (POST {base}/emails) with fetch: no SDK and no new dependency. Server only: it holds the API key, which leaves
// this module only in the request's Authorization header and is never logged. email-config.ts builds it (providerSender), and only
// when HANDOFF_EMAIL_PROVIDER is "resend" and HANDOFF_EMAIL_API_KEY and HANDOFF_EMAIL_FROM are set; otherwise there is no provider,
// and email is never available for the live world.
//
// - Recipients: never anyone the provider gate refuses (providerAllows: a Google sign-in, at upenn.edu or a subdomain, not a reserved
//   domain, not a TEST account, and on HANDOFF_EMAIL_ALLOWLIST until delivery is verified). allows() is that gate; send() checks the
//   address again and refuses without a request.
// - Each email carries its idempotency key (Idempotency-Key, the same on every retry), which Resend honours for 24 hours, so a retry
//   after a timeout or a crash doesn't send a second email. Delivery is still at least once, never exactly once.
// - Each send is cut off after PROVIDER_TIMEOUT_MS (before the dispatcher's own 10 s, so the request is aborted, not abandoned).
// - The answer: 2xx is sent (Resend's id is kept); 429, 5xx, 408, a network failure or the time limit are retryable; 401 and 403 are
//   "auth" (the key is wrong or lacks permission: the dispatcher stops the run and retries later, without a working heartbeat); a
//   redirect is "config" (the endpoint isn't Resend's API), and so is a request that can't be built; every other 4xx is "rejected" and
//   never retried, except Resend's two 409s about the idempotency key: "invalid_idempotent_request" (the key was already used with
//   other wording, so an earlier attempt was accepted: sent, as a duplicate, with nothing sent again) and
//   "concurrent_idempotent_requests" (the earlier attempt is still in progress: retried). Nothing from the answer but its id, or a
//   409's error name, is read, and nothing is logged here.

import { providerAllows, type EmailMessage, type EmailSender, type SendResult } from "@penntools/tool-handoff";

/** Resend's API. Tests point the adapter at a local fake server instead (ResendOptions.baseUrl); nothing else changes it. */
export const RESEND_BASE_URL = "https://api.resend.com";
/** A send's time limit: below the dispatcher's SEND_TIMEOUT_MS (10 s), so a slow request is aborted rather than left running. */
export const PROVIDER_TIMEOUT_MS = 8_000;
/** Resend's limit for an Idempotency-Key. Handoff's keys ("handoff:<world>:<notification>") are far shorter. */
export const IDEMPOTENCY_KEY_MAX = 256;
const PROVIDER_ID_MAX = 200;
const SUBJECT_MAX = 200;
const TEXT_MAX = 4_000;
const HTML_MAX = 100_000;
const CONTROLS = /[\u0000-\u001f\u007f]/;
/** Printable ASCII without spaces: what an HTTP header value can carry unchanged. */
const KEY = /^[\x21-\x7e]+$/;
/** Resend's 409 for an Idempotency-Key it already used with a different payload (within its 24 hours). */
const KEY_ALREADY_USED = "invalid_idempotent_request";
/** Resend's 409 while an earlier request with the same Idempotency-Key is still in progress. */
const KEY_IN_PROGRESS = "concurrent_idempotent_requests";

export interface ResendOptions {
  /** HANDOFF_EMAIL_API_KEY. */
  apiKey: string;
  /** HANDOFF_EMAIL_FROM: "Handoff <handoff@…>" or a bare address, on a domain verified with Resend. */
  from: string;
  /** HANDOFF_EMAIL_ALLOWLIST: the addresses delivery is first verified with (lowercased), or null once it has been ("*"). */
  allowlist: readonly string[] | null;
  /** The API's origin. Resend's unless a test points it at a local fake server. */
  baseUrl?: string;
  /** Per send (ms). */
  timeoutMs?: number;
  /** The fetch to call (tests: one that only reaches the local fake server). Read at each send. */
  fetch?: typeof fetch;
}

/** The provider sender, with the one endpoint it posts to (not secret), so its wiring can be checked without sending anything. */
export interface ResendSender extends EmailSender {
  readonly kind: "provider";
  readonly endpoint: string | null;
}

const answer = (retryable: boolean, code: Extract<SendResult, { ok: false }>["code"]): SendResult => ({ ok: false, retryable, code });

/**
 * The Resend sender. Configured only with a key an HTTP header can carry (printable ASCII, no spaces), a sender address and an http(s)
 * endpoint; otherwise ready() is false, allows() refuses everyone and send() answers "config" without a request.
 */
export function resendSender(o: ResendOptions): ResendSender {
  const apiKey = typeof o.apiKey === "string" ? o.apiKey.trim() : "";
  const from = typeof o.from === "string" ? o.from.trim() : "";
  const endpoint = endpointOf(o.baseUrl ?? RESEND_BASE_URL);
  const timeoutMs = o.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new TypeError("Handoff: timeoutMs is 1 to 60000 ms.");
  const allowlist = o.allowlist === null ? null : Object.freeze([...(o.allowlist ?? [])]);
  // The key travels in the Authorization header, so it must be what a header can carry: one that isn't (a zero-width space pasted with
  // it, an accent) is no configuration at all, rather than a send that fails every time and reads as a network failure.
  const configured = KEY.test(apiKey) && from !== "" && !CONTROLS.test(from) && endpoint !== null;

  return Object.freeze({
    kind: "provider" as const,
    endpoint,
    allows: (r: { address: string; signIn: "google" | "dev" }): boolean => configured && providerAllows(r.address, r.signIn, allowlist),
    ready: async (): Promise<boolean> => configured,
    async send(m: EmailMessage): Promise<SendResult> {
      if (!configured || endpoint === null) return answer(false, "config");
      // The gate again, on the address alone (the dispatcher checked the sign-in with allows()): no request for anyone it refuses.
      if (typeof m?.to !== "string" || !providerAllows(m.to, "google", allowlist)) return answer(false, "rejected");
      if (!sendable(m)) return answer(false, "rejected");
      const doFetch = o.fetch ?? globalThis.fetch;
      if (typeof doFetch !== "function") return answer(false, "config");

      // The request is built before anything is sent: one that can't be built is this server's configuration, never a network failure
      // to retry (fetch throws the same TypeError for both).
      let headers: Headers;
      let body: string;
      try {
        headers = new Headers({
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": m.idempotencyKey,
          "User-Agent": "PennTools-Handoff",
        });
        body = JSON.stringify({ from, to: m.to, subject: m.subject, text: m.text, ...(typeof m.html === "string" && m.html ? { html: m.html } : {}) });
      } catch {
        return answer(false, "config");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let res: Response;
        try {
          res = await doFetch(endpoint, { method: "POST", headers, body, redirect: "manual", cache: "no-store", signal: controller.signal });
        } catch {
          return answer(true, controller.signal.aborted ? "timeout" : "network");
        }
        if (res.status >= 200 && res.status < 300) return { ok: true, providerId: await providerId(res) };
        if (res.status === 409) {
          // Resend's answers about the idempotency key itself. Only the error's name is read; nothing else in the answer is kept.
          const name = await errorName(res);
          // The key was already used with other wording: Resend took an earlier attempt whose answer never arrived (the wording can
          // change between attempts, when a price or a deadline did). Nothing is sent again, so the email is accepted, not refused.
          if (name === KEY_ALREADY_USED) return { ok: true, providerId: null, duplicate: true };
          // The earlier attempt with this key is still being handled: try again later, with the same key.
          if (name === KEY_IN_PROGRESS) return answer(true, "timeout");
          return controller.signal.aborted ? answer(true, "timeout") : answer(false, "rejected");
        }
        await discard(res);
        return failureOf(res.status);
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

/** What a status other than 2xx means for the dispatcher. */
export function failureOf(status: number): SendResult {
  if (status === 401 || status === 403) return answer(false, "auth");
  if (status === 429) return answer(true, "rate_limited");
  if (status === 408) return answer(true, "timeout");
  if (status >= 500 && status < 600) return answer(true, "server_error");
  if (status >= 300 && status < 400) return answer(false, "config"); // not Resend's API: a wrong base URL, or a proxy in the way
  if (status >= 400 && status < 500) return answer(false, "rejected");
  return answer(true, "server_error");
}

/** Only what Resend may be given: a one-line subject, a body within limits, and an idempotency key it accepts. */
function sendable(m: EmailMessage): boolean {
  const len = (v: string): number => Array.from(v).length;
  if (typeof m.subject !== "string" || !m.subject.trim() || len(m.subject) > SUBJECT_MAX || CONTROLS.test(m.subject)) return false;
  if (typeof m.text !== "string" || !m.text.trim() || len(m.text) > TEXT_MAX) return false;
  if (m.html !== undefined && (typeof m.html !== "string" || len(m.html) > HTML_MAX)) return false;
  return typeof m.idempotencyKey === "string" && m.idempotencyKey.length <= IDEMPOTENCY_KEY_MAX && KEY.test(m.idempotencyKey);
}

/** The send endpoint for an http(s) origin, or null. */
function endpointOf(base: string): string | null {
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return new URL("/emails", url.origin).toString();
  } catch {
    return null;
  }
}

/** Resend's id for the email ({"id": "…"}), or null when the answer has none we can keep. */
async function providerId(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    const id = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>)["id"] : undefined;
    return typeof id === "string" && id.length > 0 && id.length <= PROVIDER_ID_MAX && !CONTROLS.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The `name` of Resend's error answer ({"name": "…"}), or null when there is none to read. The rest of the answer is dropped. */
async function errorName(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    const name = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>)["name"] : undefined;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

/** Lets the connection go without reading an error's body (it may quote the request). */
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Nothing to do: the request is over either way.
  }
}
