// Who a real email provider may ever send to (FOLLOWON-PLAN §2.4; scout-email §5.10). Each of these keeps the shared development
// identity ("Local Developer", dev@localhost) and the labelled TEST accounts (handoff-test-…) away from a real inbox on its own:
// - the person turned email on while signed in with Google (the development sign-in records "dev");
// - the address is at upenn.edu or one of its subdomains, as PennTools' Google sign-in requires;
// - it isn't a reserved or example domain;
// - its local part doesn't start with "handoff-test-" (TEST sessions can be minted with a Penn-looking domain);
// - while delivery is being verified, it's on the allowlist (HANDOFF_EMAIL_ALLOWLIST).
// The capture sender sends nothing, so it allows everyone; it only ever handles test worlds.

import type { SignInKind } from "./types.js";

/** Addresses longer than this aren't addresses (RFC 5321's path limit, and people.email's CHECK). */
export const ADDRESS_MAX = 254;
const LOCAL_MAX = 64;
const CONTROLS = /[\u0000-\u001f\u007f]/g;
const ADDRESS = /^[^@\s]+@[^@\s]+$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** Top-level names reserved for tests, examples and this machine (RFC 2606, RFC 6761), and the example domains. */
const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost", "local"]);
const RESERVED_DOMAINS = new Set(["localhost", "example.com", "example.net", "example.org"]);
const PENN = "upenn.edu";
const TEST_LOCAL_PREFIX = "handoff-test-";

/** An address as Handoff keeps it: trimmed, without control characters, one "@", at most 254 characters; otherwise null. */
export function cleanAddress(address: unknown): string | null {
  if (typeof address !== "string") return null;
  const flat = address.replace(CONTROLS, "").trim();
  if (!flat || Array.from(flat).length > ADDRESS_MAX || !ADDRESS.test(flat)) return null;
  return flat;
}

/** Whether two addresses name the same mailbox, as PennTools' Google sign-in reports them (compared without case). */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = cleanAddress(a);
  const y = cleanAddress(b);
  return x !== null && y !== null && x.toLowerCase() === y.toLowerCase();
}

/** The address's local part and domain (lowercased), when it's a plain mailbox address; otherwise null. */
export function addressParts(address: string): { local: string; domain: string } | null {
  const clean = cleanAddress(address);
  if (clean === null) return null;
  const at = clean.indexOf("@");
  const local = clean.slice(0, at).toLowerCase();
  const domain = clean.slice(at + 1).toLowerCase();
  if (!local || Array.from(local).length > LOCAL_MAX) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  return { local, domain };
}

/** A reserved, example or local domain, which never has a real inbox. */
export function isReservedDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  const tld = d.slice(d.lastIndexOf(".") + 1);
  return RESERVED_DOMAINS.has(d) || RESERVED_TLDS.has(tld) || [...RESERVED_DOMAINS].some((r) => d.endsWith("." + r));
}

/** A labelled TEST account's address (C-CONTRACT §6; the minted sessions use handoff-test-x@…), whatever its domain. */
export function isTestAddress(address: string): boolean {
  const parts = addressParts(address);
  return parts !== null && parts.local.startsWith(TEST_LOCAL_PREFIX);
}

/** Whether a real provider may send to this recipient (see the top of this file). `allowlist` null or absent: verification is done. */
export function providerAllows(address: string, signIn: SignInKind, allowlist?: readonly string[] | null): boolean {
  if (signIn !== "google") return false;
  const parts = addressParts(address);
  if (parts === null) return false;
  if (parts.domain !== PENN && !parts.domain.endsWith("." + PENN)) return false;
  if (isReservedDomain(parts.domain)) return false;
  if (parts.local.startsWith(TEST_LOCAL_PREFIX)) return false;
  if (allowlist !== null && allowlist !== undefined) {
    const wanted = `${parts.local}@${parts.domain}`;
    if (!allowlist.some((a) => typeof a === "string" && a.trim().toLowerCase() === wanted)) return false;
  }
  return true;
}
