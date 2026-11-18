// Email templates, links, kinds, the provider's gate and the in-memory capture (follow-on Batch 4; FOLLOWON-PLAN §2.4, B4.3, B4.10,
// B4.11, B4.14). No database and no engine: the facts are written out here as relevance.ts returns them.
import { describe, expect, it } from "vitest";
import { idempotencyKey, memoryCaptureSender, parseIdempotencyKey } from "../email/capture.js";
import { addressParts, cleanAddress, isReservedDomain, isTestAddress, providerAllows, sameAddress } from "../email/gates.js";
import { EMAIL_KINDS, EMAIL_KIND_LIST, EXCHANGE_TTL_MS, MATCH_TTL_MS, cleanLink, emailJobRows } from "../email/kinds.js";
import { actionHash, actionUrl, profileUrl, siteOrigin } from "../email/links.js";
import { FOOTER, SUBJECT_MAX, TEXT_MAX, clip, oneLine, renderEmail } from "../email/templates.js";
import type { EmailFacts, EmailKind } from "../email/types.js";

const SITE = "http://localhost:3000";
const EV = "ev-0123456789abcdef";
const L = "l0123456789abcdef";
const G = "g0123456789abcdef";
const R = "r0123456789abcdef";

/** Facts as relevance.ts gives them for each kind: listing kinds name the event and listing, item kinds the item. */
function factsFor(kind: EmailKind, over: Partial<EmailFacts> = {}): EmailFacts {
  const item = EMAIL_KINDS[kind].link === "item" || EMAIL_KINDS[kind].link === "activityItem";
  const match = EMAIL_KINDS[kind].category === "match";
  return {
    title: item ? "Desk chair" : "Spring Formal",
    who: match && !kind.startsWith("share.") ? null : "Ann",
    unit: item ? "item" : "ticket",
    qty: kind === "match.listing" ? 2 : null,
    due: match ? null : "Nov 10, 2026, 6:00 PM",
    price: match ? "$35" : null,
    obo: false,
    via: kind === "match.listing" ? "alert" : match ? "request" : null,
    eventId: item ? null : EV,
    listingId: item ? null : L,
    itemId: item ? G : null,
    ...over,
  };
}

const sentences = (body: string): number => (body.match(/[.!?](?=\s|$)/g) ?? []).length;
/** The body: the text before the action link. */
const bodyOf = (text: string): string => text.split("\n\n")[0] ?? "";

describe("kinds", () => {
  it("emails the 12 exchange updates that need a response and the 4 match and share kinds, nothing else", () => {
    // Follow-on B5 added three exchange updates, at the end: a request to buy (to the seller), an invitation to pay (to the buyer) and a
    // late payment report (to the seller). The 13 before them are unchanged, in their order.
    expect(EMAIL_KIND_LIST).toEqual([
      "offer.received", "offer.accepted", "counter.received", "reply.held", "payment.reported", "transfer.sent", "payment.missing",
      "item.requested", "item.accepted", "match.listing", "match.item", "share.listing", "share.item",
      "buy.requested", "buy.invited", "payment.late",
    ]);
    for (const k of EMAIL_KIND_LIST) {
      const rule = EMAIL_KINDS[k];
      expect(rule.ttlMs, k).toBe(rule.category === "exchange" ? EXCHANGE_TTL_MS : MATCH_TTL_MS);
      expect(k, "the schema's kind pattern").toMatch(/^[a-z]+(\.[a-z]+){1,2}$/);
    }
    expect(EXCHANGE_TTL_MS).toBe(24 * 3_600_000);
    expect(MATCH_TTL_MS).toBe(12 * 3_600_000);
    expect(EMAIL_KIND_LIST.filter((k) => EMAIL_KINDS[k].category === "exchange")).toHaveLength(12);
    expect(EMAIL_KIND_LIST.filter((k) => EMAIL_KINDS[k].category === "match")).toHaveLength(4);
    // The new kinds are exchange updates about a ticket request (the record their email links to).
    for (const k of ["buy.requested", "buy.invited", "payment.late"] as const) expect([EMAIL_KINDS[k].category, EMAIL_KINDS[k].ref], k).toEqual(["exchange", "request"]);
  });

  it("makes a job row only for a tagged note of an emailed kind whose ref fits it; untagged notes stay in the app", () => {
    const note = { id: "0123456789abcdef", userId: "handoff-test-a", link: { name: "activity", tab: "todo" } };
    expect(emailJobRows([note])).toEqual([]); // no tag: in the app only (lapses, releases, pause notes, a request's pings to sellers)
    expect(emailJobRows([{ ...note, kind: "listing.posted", ref: R }])).toEqual([]); // not an emailed kind: no broadcast of new posts
    expect(emailJobRows([{ ...note, kind: "offer.received", ref: "iso-0123456789abcdef" }])).toEqual([]); // the wrong record for the kind
    expect(emailJobRows([{ ...note, kind: "offer.received", ref: "r123" }])).toEqual([]); // not a live id
    expect(emailJobRows([{ ...note, id: "Bad Id", kind: "offer.received", ref: R }])).toEqual([]);
    expect(emailJobRows([{ ...note, userId: "", kind: "offer.received", ref: R }])).toEqual([]);
    expect(emailJobRows([{ ...note, kind: "offer.received", ref: R }])).toEqual([
      { id: note.id, user_id: "handoff-test-a", kind: "offer.received", category: "exchange", ref: R, link: { name: "activity", tab: "todo" }, ttl_s: 86_400 },
    ]);
    expect(emailJobRows([{ ...note, kind: "match.listing", ref: "iso-0123456789abcdef", link: { name: "event", id: EV, listing: L } }])[0])
      .toMatchObject({ category: "match", ttl_s: 43_200, link: { name: "event", id: EV, listing: L } });
  });

  it("keeps only a link's public fields", () => {
    expect(cleanLink({ name: "event", id: EV, listing: L, tab: "todo", text: "Pay me at @ann", email: "a@upenn.edu" })).toEqual({ name: "event", id: EV, listing: L, tab: "todo" });
    expect(cleanLink({ name: "Event Page", id: "ev 1" })).toEqual({});
    expect(cleanLink(null)).toEqual({});
    expect(cleanLink(["event"])).toEqual({});
  });
});

describe("links", () => {
  it("leads each kind where the page opens it, by public ids only", () => {
    const hashes = Object.fromEntries(EMAIL_KIND_LIST.map((k) => [k, actionHash(k, factsFor(k))]));
    expect(hashes).toEqual({
      "offer.received": `activity?listing=${L}`, "payment.reported": `activity?listing=${L}`,
      "offer.accepted": `${EV}?listing=${L}`, "counter.received": `${EV}?listing=${L}`, "reply.held": `${EV}?listing=${L}`,
      "transfer.sent": `${EV}?listing=${L}`, "payment.missing": `${EV}?listing=${L}`, "match.listing": `${EV}?listing=${L}`,
      "share.listing": `${EV}?listing=${L}`,
      "item.requested": `activity?item=${G}`,
      "item.accepted": `item-${G}`, "match.item": `item-${G}`, "share.item": `item-${G}`,
      // Invite to pay (follow-on B5): the seller's two open in My activity, the buyer's invitation on the listing's page.
      "buy.requested": `activity?listing=${L}`, "payment.late": `activity?listing=${L}`,
      "buy.invited": `${EV}?listing=${L}`,
    });
    expect(actionUrl("offer.accepted", factsFor("offer.accepted"), SITE)).toBe(`${SITE}/tools/handoff#${EV}?listing=${L}`);
    expect(profileUrl("https://penntools.example.org/")).toBe("https://penntools.example.org/tools/handoff#profile");
  });

  it("builds no link from an id that isn't a live id, or from a site that isn't an origin", () => {
    expect(actionHash("offer.accepted", factsFor("offer.accepted", { listingId: "l123" }))).toBeNull();
    expect(actionHash("offer.accepted", factsFor("offer.accepted", { eventId: null }))).toBeNull();
    expect(actionHash("item.accepted", factsFor("item.accepted", { itemId: "g0123456789abcdef&x=1" }))).toBeNull();
    for (const site of ["", "localhost:3000", "javascript:alert(1)", "ftp://x.org", "http://x.org/tools", "http://x.org?a=1", "http://u:p@x.org", "http://x.org#h"]) {
      expect(siteOrigin(site), site).toBeNull();
      expect(actionUrl("offer.accepted", factsFor("offer.accepted"), site), site).toBeNull();
    }
    expect(siteOrigin("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(siteOrigin("http://localhost:3000", { https: true })).toBeNull();
    expect(siteOrigin("https://penntools.example.org", { https: true })).toBe("https://penntools.example.org");
  });
});

describe("templates (B4.3)", () => {
  it("renders every kind: a subject of at most 120 characters, one or two sentences, one action link and the footer", () => {
    for (const k of EMAIL_KIND_LIST) {
      const e = renderEmail(k, factsFor(k), SITE);
      if (!e) throw new Error(`${k} didn't render`);
      expect(Array.from(e.subject).length, k).toBeLessThanOrEqual(SUBJECT_MAX);
      expect(e.subject, k).not.toMatch(/[\r\n]/);
      expect(e.text.length, k).toBeLessThanOrEqual(TEXT_MAX);
      const body = bodyOf(e.text);
      expect(sentences(body), `${k}: ${body}`).toBeGreaterThanOrEqual(1);
      expect(sentences(body), `${k}: ${body}`).toBeLessThanOrEqual(2);
      // The text: the body, the action link on its own line, then the footer with Profile's link (how to stop).
      expect(e.text, k).toBe(`${body}\n\n${e.actionUrl}\n\n${FOOTER} ${SITE}/tools/handoff#profile\n`);
      expect(e.text.split("\n").filter((line) => line === e.actionUrl), k).toHaveLength(1);
      expect((e.text.match(/https?:\/\//g) ?? []).length, k).toBe(2); // the action and Profile, nothing else
      expect(e.html, k).toContain(`<a href="${e.actionUrl}">Open in Handoff</a>`);
      expect(e.html, k).toContain(`<a href="${SITE}/tools/handoff#profile">Handoff settings</a>`); // amendment 9h: the stop link names the page it opens
      expect((e.html.match(/<a /g) ?? []).length, k).toBe(2);
    }
  });

  it("says what each step needs, in the plan's words", () => {
    const text = (k: EmailKind, over: Partial<EmailFacts> = {}) => {
      const e = renderEmail(k, factsFor(k, over), SITE);
      if (!e) throw new Error(`${k} didn't render`);
      return { subject: e.subject, body: bodyOf(e.text) };
    };
    expect(text("offer.received", { who: "Bob" })).toEqual({ subject: "Offer on your Spring Formal ticket", body: "Bob made an offer. Accept, counter or decline by Nov 10, 2026, 6:00 PM." });
    expect(text("offer.accepted")).toEqual({ subject: "Ann accepted your offer: Spring Formal", body: `It's reserved for you until Nov 10, 2026, 6:00 PM. Pay Ann, then tap "I've sent payment" in Handoff.` });
    expect(text("counter.received").body).toBe("Accept or decline by Nov 10, 2026, 6:00 PM. Accepting reserves it, so accept when you can pay.");
    expect(text("reply.held", { unit: "spot" })).toEqual({ subject: "A spot is held for your request: Spring Formal", body: "Ann is holding it for you. Accept by Nov 10, 2026, 6:00 PM to reserve it." });
    expect(text("payment.reported", { who: "Bob" })).toEqual({ subject: "Bob says they paid: Spring Formal", body: `Check that it arrived, then tap "Payment received". Handoff can't see payments.` });
    expect(text("transfer.sent").subject).toBe("Ann sent your ticket: Spring Formal");
    expect(text("payment.missing").body).toBe("If you paid, contact Ann. If you didn't, you can cancel.");
    expect(text("item.requested", { who: "Bob" })).toEqual({ subject: "Bob wants your Desk chair", body: "Accept or decline by Nov 10, 2026, 6:00 PM." });
    expect(text("item.accepted").body).toBe("It's held for you. Agree a pickup time in Handoff by Nov 10, 2026, 6:00 PM.");
    expect(text("match.listing")).toEqual({ subject: "A Spring Formal ticket is available", body: "2 tickets at $35 may match your alert. It isn't held for you." });
    expect(text("match.listing", { qty: 1, obo: true, via: "request" }).body).toBe("1 ticket at $35 OBO may match your request. It isn't held for you.");
    expect(text("match.item", { price: "$25" })).toEqual({ subject: "Possible match: Desk chair", body: "A classmate is selling it for $25. It isn't held for you." });
    expect(text("share.listing").subject).toBe("Ann shared a listing for your request");
    // What the requester does on the listing's page, in the words of the share's in-app note (the B5 fix round, F1): ask to buy it
    // since invite to pay, also when the fact is absent; the earlier flow's words and an organizer's only where relevance.ts says so.
    expect(text("share.listing").body).toBe("It isn't held for you: ask to buy it on its page.");
    expect(text("share.listing", { how: "ask" }).body).toBe("It isn't held for you: ask to buy it on its page.");
    expect(text("share.listing", { how: "reserve" }).body).toBe("It isn't held for you: reserve it or make an offer on its page.");
    expect(text("share.listing", { how: "request" }).body).toBe("It isn't held for you: send a request on its page.");
    expect(text("share.item").body).toBe("It isn't held for you: request it on its page.");
    // Invite to pay (follow-on B5; FOLLOWON-PLAN §2.4): an email never says a ticket is held before it's reserved, and names no
    // payment method, handle or amount. The invitation says "up to 15 minutes" (the B5 fix round, F3; the plan's table said "15
    // minutes"): a hold is shorter when a cutoff, the event or a train comes first.
    expect(text("buy.requested", { who: "Bob" })).toEqual({ subject: "Bob wants to buy: Spring Formal", body: "Invite them to pay, or decline, by Nov 10, 2026, 6:00 PM." });
    expect(text("buy.invited")).toEqual({ subject: "Ann invited you to pay: Spring Formal", body: "It isn't held yet: reserve it by Nov 10, 2026, 6:00 PM, then you have up to 15 minutes to pay." });
    expect(text("payment.late", { who: "Bob" })).toEqual({ subject: "Bob says they paid after the reservation ended: Spring Formal", body: "If the money arrived, sort it out with Bob. Handoff can't see payments." });
    for (const k of ["buy.requested", "buy.invited", "payment.late"] as const) {
      const e = renderEmail(k, factsFor(k, { price: "$35" }), SITE);
      expect(`${e?.subject}\n${e?.text}\n${e?.html}`, k).not.toMatch(/\$\d|@[a-z]|venmo|zelle|paypal/i);
    }
  });

  it("shortens a long title to keep the subject within 120 characters, and keeps every value on one line", () => {
    const long = "Wharton Graduate Association Spring Formal at the Philadelphia Museum of Art, with an open bar, a jazz band, a photo booth and more ".repeat(2);
    for (const k of EMAIL_KIND_LIST) {
      const e = renderEmail(k, factsFor(k, { title: long, who: "Christopher-Alexander Montgomery-Wellington III" }), SITE);
      if (!e) throw new Error(`${k} didn't render`);
      expect(Array.from(e.subject).length, k).toBeLessThanOrEqual(SUBJECT_MAX);
    }
    const e = renderEmail("transfer.sent", factsFor("transfer.sent", { title: "Spring\nFormal\t\u0007 2026", who: "Ann\r\nBcc: x@y.org" }), SITE);
    expect(e?.subject).toBe("Ann Bcc: x@y.org sent your ticket: Spring Formal 2026");
    expect(oneLine("  a \n\n b\u0000c ")).toBe("a b c");
    expect(clip("abcdef", 4)).toBe("abc…");
  });

  it("escapes every value in the HTML", () => {
    const e = renderEmail("payment.missing", factsFor("payment.missing", { who: `<script>alert("x")</script> & 'co'` }), SITE);
    expect(e?.html).not.toContain("<script>");
    expect(e?.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;co&#39;");
  });

  it("never calls anything simulated or a demo, and offers no other channel (the copy audit's rule, for emails)", () => {
    for (const k of EMAIL_KIND_LIST) {
      const e = renderEmail(k, factsFor(k), SITE);
      if (!e) throw new Error(`${k} didn't render`);
      expect(`${e.subject}\n${e.text}\n${e.html}`, k).not.toMatch(/simulat|demo|fictional|prototype|sample|whatsapp|\bsms\b|text message/i);
    }
  });

  it("renders nothing when its link can't be built", () => {
    expect(renderEmail("offer.accepted", factsFor("offer.accepted", { listingId: null }), SITE)).toBeNull();
    expect(renderEmail("offer.accepted", factsFor("offer.accepted"), "not a site")).toBeNull();
  });
});

describe("the provider's gate (B4.10)", () => {
  it("lets through only Penn addresses of people who signed in with Google", () => {
    expect(providerAllows("ann@upenn.edu", "google")).toBe(true);
    expect(providerAllows("Ann.Lee@Wharton.UPenn.edu", "google")).toBe(true);
    expect(providerAllows("ann@upenn.edu", "dev")).toBe(false); // the local development sign-in
    for (const a of ["ann@gmail.com", "ann@upenn.edu.example.com", "ann@notupenn.edu", "ann@upenn.education", "ann@upenn", "ann@@upenn.edu", "@upenn.edu", "ann upenn.edu", "ann@ upenn.edu", ""]) {
      expect(providerAllows(a, "google"), a).toBe(false);
    }
  });

  it("never lets the shared development identity or a TEST account through, whatever their domain", () => {
    for (const a of ["dev@localhost", "handoff-test-a@example.invalid", "handoff-test-a@wharton.upenn.edu", "HANDOFF-TEST-B@upenn.edu", "handoff-test-d@upenn.edu"]) {
      expect(providerAllows(a, "google"), a).toBe(false);
      expect(providerAllows(a, "dev"), a).toBe(false);
    }
    expect(isTestAddress("handoff-test-a@wharton.upenn.edu")).toBe(true);
    expect(isTestAddress("ann@upenn.edu")).toBe(false);
  });

  it("holds to the allowlist while delivery is being verified", () => {
    const allow = [" Ann@UPenn.edu ", "bob@wharton.upenn.edu"];
    expect(providerAllows("ann@upenn.edu", "google", allow)).toBe(true);
    expect(providerAllows("bob@wharton.upenn.edu", "google", allow)).toBe(true);
    expect(providerAllows("cat@upenn.edu", "google", allow)).toBe(false);
    expect(providerAllows("cat@upenn.edu", "google", [])).toBe(false);
    expect(providerAllows("cat@upenn.edu", "google", null)).toBe(true); // verification done: no allowlist
    expect(providerAllows("handoff-test-a@upenn.edu", "google", ["handoff-test-a@upenn.edu"])).toBe(false); // never a TEST account
  });

  it("knows reserved domains and plain addresses", () => {
    for (const d of ["localhost", "example.com", "mail.example.org", "x.test", "x.example", "x.invalid", "box.local"]) expect(isReservedDomain(d), d).toBe(true);
    expect(isReservedDomain("upenn.edu")).toBe(false);
    expect(addressParts("Ann@Wharton.UPenn.edu")).toEqual({ local: "ann", domain: "wharton.upenn.edu" });
    expect(addressParts("ann@-upenn.edu")).toBeNull();
    expect(cleanAddress(" ann@upenn.edu\u0007 ")).toBe("ann@upenn.edu");
    expect(cleanAddress("no-at-sign")).toBeNull();
    expect(cleanAddress(`${"a".repeat(250)}@upenn.edu`)).toBeNull();
    expect(sameAddress("Ann@UPenn.edu", "ann@upenn.edu")).toBe(true);
    expect(sameAddress("ann@upenn.edu", null)).toBe(false);
  });
});

describe("the in-memory capture and idempotency keys (B4.14)", () => {
  it("keys each notification's email the same on every retry", () => {
    expect(idempotencyKey("test-email-a", "0123456789abcdef")).toBe("handoff:test-email-a:0123456789abcdef");
    expect(parseIdempotencyKey("handoff:live:0123456789abcdef")).toEqual({ worldId: "live", notificationId: "0123456789abcdef" });
    expect(parseIdempotencyKey("handoff:test-x:0123456789abcdef")).toEqual({ worldId: "test-x", notificationId: "0123456789abcdef" });
    for (const k of ["handoff:prod:0123", "handoff:test-x:", "x:test-x:0123", "handoff:test-x:01 23", null]) expect(parseIdempotencyKey(k), String(k)).toBeNull();
    expect(() => idempotencyKey("test-x", "Bad Id")).toThrow(TypeError);
  });

  it("accepts a key once, however often it's sent, and answers with the failures a test injects", async () => {
    const failures = [{ ok: false, retryable: true, code: "timeout" } as const];
    const sender = memoryCaptureSender({ failWith: () => failures.shift() });
    const m = { to: "ann@upenn.edu", subject: "s", text: "t", idempotencyKey: "handoff:test-x:0123456789abcdef" };
    expect(await sender.send(m)).toEqual({ ok: false, retryable: true, code: "timeout" });
    expect(await sender.send(m)).toMatchObject({ ok: true });
    expect(await sender.send(m)).toMatchObject({ ok: true });
    expect(sender.attempts).toHaveLength(3);
    expect(sender.sent).toHaveLength(1);
    expect(sender.kind).toBe("capture");
    expect(sender.allows({ address: "dev@localhost", signIn: "dev" })).toBe(true); // the capture sends nothing, to anyone
  });
});
