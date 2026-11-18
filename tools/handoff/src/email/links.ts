// An email's links (FOLLOWON-PLAN §2.4): {site}/tools/handoff#…, naming only public ids checked against live.ts ID, in forms the page
// already opens (_lib/routes.js initialView). A signed-out click reaches the guest page and its sign-in round trip, which comes back
// to the same place (C-CONTRACT §7). Nothing typed, no address and no private id ever goes in a link.

import { ID } from "../live.js";
import { EMAIL_KINDS } from "./kinds.js";
import type { EmailFacts, EmailKind } from "./types.js";

export const TOOL_PATH = "/tools/handoff";
/** The longest link an email carries (email_capture.action_url's CHECK). */
export const URL_MAX = 600;

/**
 * The site's origin ("https://penntools.example.edu", "http://localhost:3000"), from a URL that names nothing more than an origin (a
 * trailing "/" is fine); otherwise null. `https` requires it (production).
 */
export function siteOrigin(site: unknown, o: { https?: boolean } = {}): string | null {
  if (typeof site !== "string" || !site.trim()) return null;
  let url: URL;
  try {
    url = new URL(site.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && (o.https || url.protocol !== "http:")) return null;
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
  return url.origin;
}

/** Handoff's page at a hash: `{site}/tools/handoff#{hash}`. */
export function toolUrl(site: string, hash: string): string {
  const origin = siteOrigin(site);
  if (origin === null) throw new TypeError("Handoff: the site URL must be an http(s) origin.");
  return `${origin}${TOOL_PATH}#${hash}`;
}

/** Where the footer sends people to turn email off: Profile. */
export function profileUrl(site: string): string {
  return toolUrl(site, "profile");
}

/** The hash of a kind's one action link, from the facts' ids, or null when an id it needs is missing or isn't a live id. */
export function actionHash(kind: EmailKind, f: Pick<EmailFacts, "eventId" | "listingId" | "itemId">): string | null {
  const ok = (v: string | null, pattern: RegExp): v is string => typeof v === "string" && pattern.test(v);
  switch (EMAIL_KINDS[kind].link) {
    case "activityListing":
      return ok(f.listingId, ID.listing) ? `activity?listing=${f.listingId}` : null;
    case "eventListing":
      return ok(f.eventId, ID.event) && ok(f.listingId, ID.listing) ? `${f.eventId}?listing=${f.listingId}` : null;
    case "activityItem":
      return ok(f.itemId, ID.item) ? `activity?item=${f.itemId}` : null;
    case "item":
      return ok(f.itemId, ID.item) ? `item-${f.itemId}` : null;
    default:
      return null;
  }
}

/** The kind's action URL, or null when it can't be built (a missing id, or a site that isn't an origin). */
export function actionUrl(kind: EmailKind, f: Pick<EmailFacts, "eventId" | "listingId" | "itemId">, site: string): string | null {
  const hash = actionHash(kind, f);
  if (hash === null || siteOrigin(site) === null) return null;
  const url = toolUrl(site, hash);
  return url.length <= URL_MAX ? url : null;
}
