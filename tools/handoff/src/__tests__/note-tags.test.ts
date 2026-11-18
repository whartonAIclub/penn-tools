// Follow-on B4, Lane A's first step (FOLLOWON-PLAN §2.4 "Notification kinds", §3.2 step 6; FO\B4-server.md §4.2). Nothing is emailed
// here and nothing a person sees changes:
// - the engine tags the notifications that may also go by email, and only those, with {kind, ref}: each exchange step that needs its
//   recipient, and each listing, item or share that may fit someone's request or alert, with the id of the record it's about;
// - every other notification (a reservation, a decline, a release, a lapse, a pause, a request's ping to sellers…) carries no tag;
// - the port's drain passes a tag on only as a pair in email_jobs' own patterns, and never drops the note;
// - a view's email envelope (View.email) is its owner's alone: the projection never makes one, a view never carries a note's tag, and
//   the contract (helpers/contract.ts) refuses an envelope with anyone else's address, and any envelope in a guest view.
// Worlds run on the server's path (helpers/views.ts ServerWorld: parseAction, then the real engine on frozen documents, notifications
// drained after every accepted action). The people are labelled test accounts with made-up ids; no database and no sign-in.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action, EngineNotification, NoteMeta } from "../../engine/index.js";
import { EMAIL_KINDS, EMAIL_KIND_LIST, emailJobRows, isEmailKind } from "../email/kinds.js";
import type { ViewEmail } from "../email/types.js";
import { NOTE_KIND, NOTE_KIND_MAX, NOTE_REF, enginePort, type WorldDoc } from "../engine-port.js";
import { ID } from "../live.js";
import type { GuestView, View, ViewNotification } from "../types.js";
import { VIEW_EMAIL_KEYS, contractViolations, emailViolations, guestContractViolations } from "./helpers/contract.js";
import { FAY, PEOPLE6, ServerWorld, emailOf, guestViewOf, rowOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, EVE, HOUR, MIN, T0, dateAfter, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const TOOL = fileURLToPath(new URL("../../", import.meta.url));

afterEach(() => {
  E.setLiveClock(null);
  E.applyWorld(null);
});

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}

interface Tag {
  to: string;
  kind: string;
  ref: string;
}
const tagKey = (t: Tag): string => `${t.to} ${t.kind} ${t.ref}`;
const byTag = (a: Tag, b: Tag): number => (tagKey(a) < tagKey(b) ? -1 : tagKey(a) > tagKey(b) ? 1 : 0);
/** The tags an action should write, in tagsOf's order. */
const tags = (...t: Tag[]): Tag[] => [...t].sort(byTag);

/** The tagged notes among `notes`, sorted. Every note has both kind and ref, or neither. */
function tagsOf(notes: readonly EngineNotification[]): Tag[] {
  expect(notes.filter((n) => ("kind" in n) !== ("ref" in n)).map((n) => n.text), "a note with only one of kind and ref").toEqual([]);
  return notes.filter((n) => "kind" in n).map((n) => ({ to: n.userId, kind: String(n.kind), ref: String(n.ref) })).sort(byTag);
}

/** An action whose notes all stay in the app: at least one note, and none with a kind or a ref. */
function inAppOnly(notes: readonly EngineNotification[], what: string): void {
  expect(notes.length, `${what}: its note`).toBeGreaterThan(0);
  expect(notes.filter((n) => "kind" in n || "ref" in n).map((n) => n.text), `${what}: tagged`).toEqual([]);
}

const offerOn = (w: ServerWorld, who: string, listingId: string, amount: string) => w.ok(who, { type: "offer", listingId, qty: 1, amount, msg: "", member: false });
const takeOf = (w: ServerWorld, who: string, listingId: string) => w.ok(who, { type: "take", listingId, qty: 1, amount: "", msg: "", member: false });
const chair = (w: ServerWorld, over: Record<string, unknown> = {}): Action => ({
  type: "postItem", data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", obo: true, area: "Rittenhouse", until: dateAfter(w.now, 10), note: "", ...over },
});
const wantChair = (w: ServerWorld, who: string): string =>
  must(w.ok(who, { type: "saveInterest", data: { goods: { title: "Desk chair", cat: "Furniture" }, qty: 1, budget: "50", note: "", expires: dateAfter(w.now, 5) } }).id, "a goods request");
/** ListPage's addThen: one $40 ticket listed at $35. */
const listStep = (ev: string): Action => ({
  type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
  then: { type: "list", qty: 1, ask: "35", viaOrganizer: false, restricted: false, obo: false, method: "app", namesChecked: false, file: null, note: "", membersOnly: false },
});

// ── The worlds: each tag site, then everything that stays in the app ──────────────────────

/** An offer, a counter, an accepted offer, then "I've sent payment", "Payment hasn't arrived", the transfer and the receipt. */
function exchange(): ServerWorld {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = w.addEvent(ANN);
  const l = w.listTickets(ANN, ev, { qty: 3, obo: true });
  // An offer: the seller answers it.
  const offered = offerOn(w, BOB.userId, l, "30");
  const bob = must(offered.id, "Bob's offer");
  expect(bob).toMatch(ID.request);
  expect(tagsOf(offered.notes)).toEqual([{ to: ANN.userId, kind: "offer.received", ref: bob }]);
  // A counter: the buyer answers it. Their answer reaches the seller in the app only.
  expect(tagsOf(w.ok(ANN.userId, { type: "counter", requestId: bob, amount: "33" }).notes)).toEqual([{ to: BOB.userId, kind: "counter.received", ref: bob }]);
  inAppOnly(w.ok(BOB.userId, { type: "respond", requestId: bob, accept: true }).notes, "the buyer accepts the counter");
  // An accepted offer: the buyer pays.
  const catOffer = offerOn(w, CAT.userId, l, "31");
  const cat = must(catOffer.id, "Cat's offer");
  expect(tagsOf(catOffer.notes)).toEqual([{ to: ANN.userId, kind: "offer.received", ref: cat }]);
  expect(tagsOf(w.ok(ANN.userId, { type: "accept", requestId: cat }).notes)).toEqual([{ to: CAT.userId, kind: "offer.accepted", ref: cat }]);
  // "I've sent payment": the seller checks. "Payment hasn't arrived": the buyer checks. "Payment received": in the app only.
  expect(tagsOf(w.ok(CAT.userId, { type: "markPaid", requestId: cat }).notes)).toEqual([{ to: ANN.userId, kind: "payment.reported", ref: cat }]);
  expect(tagsOf(w.ok(ANN.userId, { type: "paymentMissing", requestId: cat }).notes)).toEqual([{ to: CAT.userId, kind: "payment.missing", ref: cat }]);
  inAppOnly(w.ok(ANN.userId, { type: "confirmPayment", requestId: cat }).notes, "payment received");
  // Sent: the buyer confirms they have it. "Received": in the app only.
  expect(tagsOf(w.ok(ANN.userId, { type: "markTransferred", requestId: cat }).notes)).toEqual([{ to: CAT.userId, kind: "transfer.sent", ref: cat }]);
  inAppOnly(w.ok(CAT.userId, { type: "buyerReceived", requestId: cat }).notes, "received");
  return w;
}

/** A seller holds a ticket for a public request: the requester answers it. */
function heldReply(): ServerWorld {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = w.addEvent(ANN);
  const iso = w.requestFor(BOB, ev, { budget: "40" });
  const replied = w.ok(ANN.userId, {
    type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
    then: { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, note: "", membersOnly: false },
  });
  const rid = must(replied.id, "the held reply");
  expect(rid).toMatch(ID.request);
  expect(tagsOf(replied.notes)).toEqual([{ to: BOB.userId, kind: "reply.held", ref: rid }]);
  inAppOnly(w.ok(BOB.userId, { type: "respond", requestId: rid, accept: true }).notes, "the requester accepts the held reply");
  return w;
}

/** Goods: requests and an offer to the seller, an acceptance to the buyer; a backup waits with nothing to answer. */
function goods(): ServerWorld {
  const w = new ServerWorld({ people: PEOPLE6 });
  const it = must(w.ok(ANN.userId, chair(w)).id, "the chair");
  const asked = w.ok(BOB.userId, { type: "requestItem", id: it, msg: "", shareContact: true });
  const bob = must(asked.id, "Bob's request");
  expect(bob).toMatch(ID.goodsReq);
  expect(tagsOf(asked.notes)).toEqual([{ to: ANN.userId, kind: "item.requested", ref: bob }]);
  const offered = w.ok(CAT.userId, { type: "requestItem", id: it, offer: "25", msg: "", shareContact: false });
  expect(tagsOf(offered.notes)).toEqual([{ to: ANN.userId, kind: "item.requested", ref: must(offered.id, "Cat's offer") }]);
  // Accepted: the buyer agrees a pickup time. Cat's offer waits as a backup, and hears so in the app only.
  const accepted = w.ok(ANN.userId, { type: "acceptItemReq", id: bob, shareContact: true });
  expect(tagsOf(accepted.notes)).toEqual([{ to: BOB.userId, kind: "item.accepted", ref: bob }]);
  expect(accepted.notes.map((n) => n.userId).sort()).toEqual([BOB.userId, CAT.userId].sort());
  // A request while it's held waits as a backup: the seller has nothing to answer yet.
  inAppOnly(w.ok(DAN.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).notes, "a backup request");
  return w;
}

/** A new listing for each public request and alert it fits; a new item for each goods request it fits. */
function matches(): ServerWorld {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = w.addEvent(ANN);
  const bobIso = w.requestFor(BOB, ev, { budget: "40" });
  const catAlert = must(w.ok(CAT.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" }).id, "Cat's alert");
  w.ok(DAN.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "20" }); // below the asking price: no match, no note
  const listed = w.ok(ANN.userId, listStep(ev));
  const l = must(listed.id, "the listing");
  expect(tagsOf(listed.notes)).toEqual(tags({ to: BOB.userId, kind: "match.listing", ref: bobIso }, { to: CAT.userId, kind: "match.listing", ref: catAlert }));
  expect(listed.notes.map((n) => n.link)).toEqual([{ name: "event", id: ev, listing: l }, { name: "event", id: ev, listing: l }]);
  const eveIso = wantChair(w, EVE.userId);
  const posted = w.ok(ANN.userId, chair(w));
  expect(tagsOf(posted.notes)).toEqual([{ to: EVE.userId, kind: "match.item", ref: eveIso }]);
  expect(posted.notes.map((n) => n.link)).toEqual([{ name: "item", id: posted.id }]);
  return w;
}

/** Resumed: those who started looking while it was paused hear about the listing or item, tagged as a new one would be. */
function resumed(): ServerWorld {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = w.addEvent(ANN);
  const l = w.listTickets(ANN, ev, { qty: 2 });
  w.ok(ANN.userId, { type: "pauseListing", listingId: l });
  w.advance(10 * MIN);
  const danIso = w.requestFor(DAN, ev, { budget: "40" });
  const fayAlert = must(w.ok(FAY.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" }).id, "Fay's alert");
  const back = w.ok(ANN.userId, { type: "resumeListing", listingId: l });
  expect(tagsOf(back.notes)).toEqual(tags({ to: DAN.userId, kind: "match.listing", ref: danIso }, { to: FAY.userId, kind: "match.listing", ref: fayAlert }));
  const it = must(w.ok(ANN.userId, chair(w)).id, "the chair");
  w.ok(ANN.userId, { type: "pauseItem", id: it });
  w.advance(10 * MIN);
  const eveIso = wantChair(w, EVE.userId);
  const itemBack = w.ok(ANN.userId, { type: "resumeItem", id: it });
  expect(tagsOf(itemBack.notes)).toEqual([{ to: EVE.userId, kind: "match.item", ref: eveIso }]);
  return w;
}

/** Shares: a listing or item shared with a request, apart or in the change that made it (the requester hears once, about the share). */
function shares(): ServerWorld {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = w.addEvent(ANN);
  const bobIso = w.requestFor(BOB, ev, { budget: "40" });
  const l = w.listTickets(ANN, ev, { qty: 1 }); // Bob hears it opened up (a match)
  const shared = w.ok(ANN.userId, { type: "shareListing", isoId: bobIso, listingId: l });
  const share = must(shared.id, "the share");
  expect(share).toMatch(ID.share);
  expect(tagsOf(shared.notes)).toEqual([{ to: BOB.userId, kind: "share.listing", ref: share }]);
  const catIso = wantChair(w, CAT.userId);
  const it = must(w.ok(ANN.userId, chair(w)).id, "the chair"); // Cat hears it may match
  const sharedItem = w.ok(ANN.userId, { type: "shareItem", isoId: catIso, itemId: it });
  expect(tagsOf(sharedItem.notes)).toEqual([{ to: CAT.userId, kind: "share.item", ref: must(sharedItem.id, "the item share") }]);
  // Listed for Dan's request and shared in one change (another event: one holding per tier): Dan hears once, about the share; Bob's
  // request and Eve's alert hear it opened up.
  const gala = w.addEvent(ANN, { title: "Winter Gala" });
  const bobGala = w.requestFor(BOB, gala, { budget: "40" });
  const danIso = w.requestFor(DAN, gala, { budget: "40" });
  const eveAlert = must(w.ok(EVE.userId, { type: "joinAlert", eventId: gala, qty: 1, max: "" }).id, "Eve's alert");
  const both = w.ok(ANN.userId, { type: "seq", steps: [{ action: listStep(gala) }, { action: { type: "shareListing", isoId: danIso, listingId: "@0" }, optional: true }] });
  expect(tagsOf(both.notes)).toEqual(tags(
    { to: BOB.userId, kind: "match.listing", ref: bobGala },
    { to: DAN.userId, kind: "share.listing", ref: must(both.steps?.[1]?.id, "the seq's share") },
    { to: EVE.userId, kind: "match.listing", ref: eveAlert },
  ));
  // Posted for Fay's request and shared in one change: Fay hears once, about the share; Cat's request hears it may match.
  const fayIso = wantChair(w, FAY.userId);
  const bothItem = w.ok(ANN.userId, { type: "seq", steps: [{ action: chair(w, { title: "Desk chair, oak" }) }, { action: { type: "shareItem", isoId: fayIso, itemId: "@0" }, optional: true }] });
  expect(tagsOf(bothItem.notes)).toEqual(tags(
    { to: CAT.userId, kind: "match.item", ref: catIso },
    { to: FAY.userId, kind: "share.item", ref: must(bothItem.steps?.[1]?.id, "the seq's item share") },
  ));
  return w;
}

/** Everything else a live world tells people: each stays in the app, with no kind or ref. */
function inApp(): ServerWorld {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = w.addEvent(ANN);
  const l = w.listTickets(ANN, ev, { qty: 2, obo: true });
  // A public request's ping to a seller with a listing for the event: no new-post broadcast by email (B4.6).
  inAppOnly(w.ok(BOB.userId, { type: "saveInterest", data: { eventId: ev, qty: 1, budget: "40", note: "", expires: dateAfter(w.now, 5) } }).notes, "a request's ping to a seller");
  // A reservation at the asking price, and the buyer's cancel.
  const taken = takeOf(w, CAT.userId, l);
  inAppOnly(taken.notes, "a reservation");
  inAppOnly(w.ok(CAT.userId, { type: "cancel", requestId: must(taken.id, "Cat's reservation") }).notes, "the buyer cancels");
  // A declined offer, a released hold and a declined counter.
  inAppOnly(w.ok(ANN.userId, { type: "decline", requestId: must(offerOn(w, DAN.userId, l, "30").id, "Dan's offer") }).notes, "a declined offer");
  inAppOnly(w.ok(ANN.userId, { type: "release", requestId: must(takeOf(w, EVE.userId, l).id, "Eve's reservation") }).notes, "a released hold");
  const fay = must(offerOn(w, FAY.userId, l, "30").id, "Fay's offer");
  w.ok(ANN.userId, { type: "counter", requestId: fay, amount: "33" });
  inAppOnly(w.ok(FAY.userId, { type: "respond", requestId: fay, accept: false }).notes, "a declined counter");
  // Paused and resumed with an open offer (no one started looking meanwhile).
  must(offerOn(w, BOB.userId, l, "30").id, "Bob's offer");
  inAppOnly(w.ok(ANN.userId, { type: "pauseListing", listingId: l }).notes, "a pause");
  inAppOnly(w.ok(ANN.userId, { type: "resumeListing", listingId: l }).notes, "a resume");
  // A problem report and its resolution, on a paid reservation.
  const paid = must(takeOf(w, CAT.userId, l).id, "Cat's second reservation");
  w.ok(CAT.userId, { type: "markPaid", requestId: paid });
  inAppOnly(w.ok(CAT.userId, { type: "reportProblem", kind: "ticket", id: paid, reason: "The seller hasn't sent it" }).notes, "a problem report");
  inAppOnly(w.ok(CAT.userId, { type: "resolveProblem", kind: "ticket", id: paid }).notes, "a problem resolved");
  // The last ticket of a listing reserved: the open offer it can no longer cover closes. (Each listing below has its own event: one
  // holding per tier.)
  const last = w.listTickets(ANN, w.addEvent(ANN, { title: "Winter Gala" }), { qty: 1, obo: true });
  must(offerOn(w, FAY.userId, last, "30").id, "Fay's offer on the last ticket");
  const lastTaken = takeOf(w, EVE.userId, last);
  inAppOnly(lastTaken.notes, "the last ticket reserved");
  expect(lastTaken.notes.map((n) => n.userId).sort()).toEqual([ANN.userId, FAY.userId].sort());
  // A hold that lapses unpaid: the sweep tells the buyer and the seller.
  const lapse = w.listTickets(ANN, w.addEvent(ANN, { title: "Spring Mixer" }), { qty: 1 });
  must(takeOf(w, DAN.userId, lapse).id, "Dan's reservation");
  w.advance(3 * HOUR);
  inAppOnly(w.sweep().notes, "a lapsed hold");
  // A listing closed with an open offer on it.
  inAppOnly(w.ok(ANN.userId, { type: "withdraw", listingId: l }).notes, "a closed listing");
  // Goods: declined, consent, a pickup time, released, cancelled, paused, resumed, picked up, and an item closed.
  const it = must(w.ok(ANN.userId, chair(w)).id, "the chair");
  const g1 = must(w.ok(BOB.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).id, "Bob's request");
  const g2 = must(w.ok(CAT.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).id, "Cat's request");
  inAppOnly(w.ok(ANN.userId, { type: "declineItemReq", id: g2 }).notes, "a declined goods request");
  w.ok(ANN.userId, { type: "acceptItemReq", id: g1, shareContact: false });
  inAppOnly(w.ok(BOB.userId, { type: "itemConsent", id: g1, side: "buyer" }).notes, "contact details shared");
  inAppOnly(w.ok(BOB.userId, { type: "setPickup", id: g1, at: wallAfter(w.now, 2, "18:00") }).notes, "a pickup time");
  inAppOnly(w.ok(ANN.userId, { type: "releaseItemReq", id: g1 }).notes, "a released item hold");
  inAppOnly(w.ok(DAN.userId, { type: "cancelItemReq", id: must(w.ok(DAN.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).id, "Dan's request") }).notes, "a cancelled goods request");
  const g4 = must(w.ok(EVE.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).id, "Eve's request");
  inAppOnly(w.ok(ANN.userId, { type: "pauseItem", id: it }).notes, "a paused item");
  inAppOnly(w.ok(ANN.userId, { type: "resumeItem", id: it }).notes, "a resumed item");
  w.ok(ANN.userId, { type: "acceptItemReq", id: g4, shareContact: false });
  inAppOnly(w.ok(EVE.userId, { type: "itemPickedUp", id: g4 }).notes, "a pickup");
  const shelf = must(w.ok(ANN.userId, chair(w, { title: "Bookshelf" })).id, "the bookshelf");
  w.ok(FAY.userId, { type: "requestItem", id: shelf, msg: "", shareContact: false });
  inAppOnly(w.ok(ANN.userId, { type: "withdrawItem", id: shelf }).notes, "a closed item");
  return w;
}

/**
 * Invite to pay (follow-on B5): a request to buy is tagged for the seller; an invitation for its buyer, whether it answers a request to
 * buy or goes to a public request's poster; a late payment report for the seller. Everything else in the flow stays in the app: a
 * reservation, a release, a withdrawn request, a declined or withdrawn invitation, a pause, a resume, a lapse, a close, and units that
 * come back or go for good.
 */
function inviteToPay(): ServerWorld {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ask = (who: string, listingId: string, amount = "") => w.ok(who, { type: "requestToBuy", listingId, qty: 1, amount, msg: "", member: false });
  const ev = w.addEvent(ANN);
  const l = w.listTickets(ANN, ev, { qty: 2, obo: true });
  // A request to buy: the seller answers it.
  const asked = ask(BOB.userId, l);
  const bob = must(asked.id, "Bob's request to buy");
  expect(bob).toMatch(ID.request);
  expect(tagsOf(asked.notes)).toEqual([{ to: ANN.userId, kind: "buy.requested", ref: bob }]);
  // An invitation: the buyer reserves it. The reservation, and its release, reach the seller in the app only.
  expect(tagsOf(w.ok(ANN.userId, { type: "invite", requestId: bob }).notes)).toEqual([{ to: BOB.userId, kind: "buy.invited", ref: bob }]);
  inAppOnly(w.ok(BOB.userId, { type: "reserve", requestId: bob, member: false }).notes, "an invitation reserved");
  inAppOnly(w.ok(BOB.userId, { type: "cancel", requestId: bob }).notes, "an unpaid reservation released by its buyer");
  // A request with an offer is a request to buy too. Withdrawn by its buyer, or declined by the seller: in the app only.
  const offered = ask(CAT.userId, l, "30");
  const cat = must(offered.id, "Cat's request with an offer");
  expect(tagsOf(offered.notes)).toEqual([{ to: ANN.userId, kind: "buy.requested", ref: cat }]);
  inAppOnly(w.ok(CAT.userId, { type: "cancel", requestId: cat }).notes, "a request to buy withdrawn");
  inAppOnly(w.ok(ANN.userId, { type: "decline", requestId: must(ask(DAN.userId, l).id, "Dan's request to buy") }).notes, "a request to buy declined");
  // An invitation the buyer declines, and one the seller withdraws.
  const eve = must(ask(EVE.userId, l).id, "Eve's request to buy");
  expect(tagsOf(w.ok(ANN.userId, { type: "invite", requestId: eve }).notes)).toEqual([{ to: EVE.userId, kind: "buy.invited", ref: eve }]);
  inAppOnly(w.ok(EVE.userId, { type: "cancel", requestId: eve }).notes, "an invitation declined");
  const fay = must(ask(FAY.userId, l).id, "Fay's request to buy");
  w.ok(ANN.userId, { type: "invite", requestId: fay });
  inAppOnly(w.ok(ANN.userId, { type: "decline", requestId: fay }).notes, "an invitation withdrawn");
  // Paused and resumed with a request to buy and an invitation open (no one started looking meanwhile); then both lapse.
  must(ask(BOB.userId, l).id, "Bob's second request to buy");
  w.ok(ANN.userId, { type: "invite", requestId: must(ask(CAT.userId, l).id, "Cat's second request to buy") });
  const paused = w.ok(ANN.userId, { type: "pauseListing", listingId: l });
  inAppOnly(paused.notes, "a pause");
  expect(paused.notes.map((n) => n.userId).sort()).toEqual([BOB.userId, CAT.userId].sort());
  const back = w.ok(ANN.userId, { type: "resumeListing", listingId: l });
  inAppOnly(back.notes, "a resume");
  expect(back.notes.map((n) => n.userId).sort()).toEqual([BOB.userId, CAT.userId].sort());
  w.advance(7 * HOUR);
  const lapsed = w.sweep();
  inAppOnly(lapsed.notes, "a request to buy and an invitation that lapsed");
  expect(lapsed.notes.map((n) => n.userId).sort()).toEqual([BOB.userId, CAT.userId].sort());
  // A listing closed with a request to buy and an invitation on it.
  must(ask(DAN.userId, l).id, "Dan's second request to buy");
  w.ok(ANN.userId, { type: "invite", requestId: must(ask(EVE.userId, l).id, "Eve's second request to buy") });
  const closed = w.ok(ANN.userId, { type: "withdraw", listingId: l });
  inAppOnly(closed.notes, "a closed listing");
  expect(closed.notes.map((n) => n.userId).sort()).toEqual([DAN.userId, EVE.userId].sort());
  // The last ticket: two invitations, one reservation. The other buyer hears nothing until it comes back (in the app), and when it's
  // paid for, a request it can never cover closes (in the app) beside the seller's tagged "payment reported".
  const last = w.listTickets(ANN, w.addEvent(ANN, { title: "Winter Gala" }), { qty: 1 });
  const bobLast = must(ask(BOB.userId, last).id, "Bob's request for the last ticket");
  const catLast = must(ask(CAT.userId, last).id, "Cat's request for the last ticket");
  must(ask(EVE.userId, last).id, "Eve's request for the last ticket");
  w.ok(ANN.userId, { type: "invite", requestId: bobLast });
  w.ok(ANN.userId, { type: "invite", requestId: catLast });
  const held = w.ok(BOB.userId, { type: "reserve", requestId: bobLast, member: false });
  inAppOnly(held.notes, "the last ticket reserved");
  expect(held.notes.map((n) => n.userId)).toEqual([ANN.userId]);
  const freed = w.ok(BOB.userId, { type: "cancel", requestId: bobLast });
  inAppOnly(freed.notes, "the last ticket released");
  expect(freed.notes.map((n) => n.userId).sort()).toEqual([ANN.userId, CAT.userId].sort());
  w.ok(CAT.userId, { type: "reserve", requestId: catLast, member: false });
  const paid = w.ok(CAT.userId, { type: "markPaid", requestId: catLast });
  expect(tagsOf(paid.notes)).toEqual([{ to: ANN.userId, kind: "payment.reported", ref: catLast }]);
  expect(paid.notes.map((n) => n.userId).sort()).toEqual([ANN.userId, EVE.userId].sort());
  // A reservation that lapses unpaid (in the app), then its buyer says they paid after it ended: the seller checks.
  const late = w.listTickets(ANN, w.addEvent(ANN, { title: "Spring Mixer" }), { qty: 1 });
  const dan = must(ask(DAN.userId, late).id, "Dan's request to buy");
  w.ok(ANN.userId, { type: "invite", requestId: dan });
  w.ok(DAN.userId, { type: "reserve", requestId: dan, member: false });
  w.advance(20 * MIN);
  inAppOnly(w.sweep().notes, "a lapsed reservation");
  expect(tagsOf(w.ok(DAN.userId, { type: "reportProblem", kind: "ticket", id: dan, reason: E.LATE_PAYMENT }).notes)).toEqual([{ to: ANN.userId, kind: "payment.late", ref: dan }]);
  inAppOnly(w.ok(DAN.userId, { type: "resolveProblem", kind: "ticket", id: dan }).notes, "a late payment marked resolved");
  // A public request's poster invited on a listing that stays open to everyone: tagged with the new record's id.
  const ball = w.addEvent(ANN, { title: "Fall Ball" });
  const fayIso = w.requestFor(FAY, ball, { budget: "40" });
  const open = w.listTickets(ANN, ball, { qty: 1 }); // Fay hears it opened up (a match)
  const invited = w.ok(ANN.userId, { type: "inviteRequester", isoId: fayIso, listingId: open, qty: 1 });
  const fayInvite = must(invited.id, "Fay's invitation");
  expect(fayInvite).toMatch(ID.request);
  expect(tagsOf(invited.notes)).toEqual([{ to: FAY.userId, kind: "buy.invited", ref: fayInvite }]);
  // Listed for Eve's request and invited in one change: Eve hears once, about the invitation; Bob's request hears it opened up.
  const social = w.addEvent(ANN, { title: "Summer Social" });
  const bobIso = w.requestFor(BOB, social, { budget: "40" });
  const eveIso = w.requestFor(EVE, social, { budget: "40" });
  const both = w.ok(ANN.userId, { type: "seq", steps: [{ action: listStep(social) }, { action: { type: "inviteRequester", isoId: eveIso, listingId: "@0", qty: 1 }, optional: true }] });
  expect(tagsOf(both.notes)).toEqual(tags(
    { to: BOB.userId, kind: "match.listing", ref: bobIso },
    { to: EVE.userId, kind: "buy.invited", ref: must(both.steps?.[1]?.id, "the seq's invitation") },
  ));
  return w;
}

const WORLDS = { exchange, heldReply, goods, matches, resumed, shares, inApp, inviteToPay };

describe("the engine's email tags (noteTo's meta)", () => {
  it("an offer is tagged for the seller; a counter, an acceptance, a missing payment and a transfer for the buyer; a reported payment for the seller", () => {
    exchange();
  });

  it("a held reply is tagged for its requester", () => {
    heldReply();
  });

  it("goods: a request or offer is tagged for the seller unless it waits as a backup; an acceptance for the buyer", () => {
    goods();
  });

  it("matches: a new listing is tagged for each public request and alert it fits, a new item for each goods request, with the interest's id", () => {
    matches();
  });

  it("a resumed listing or item is tagged for those who started looking while it was paused", () => {
    resumed();
  });

  it("shares are tagged with the share's id; a listing or item made and shared in one change keeps only the share's tag for its requester", () => {
    shares();
  });

  it("everything else stays in the app: no other notification has a kind or a ref", () => {
    inApp();
  });

  it("invite to pay: a request to buy is tagged for the seller, an invitation for its buyer, a late payment report for the seller; the rest stays in the app", () => {
    inviteToPay();
  });

  it("covers every emailed kind, and every tag is one the email jobs accept, naming the record its email links to (email/kinds.ts)", () => {
    const notes = Object.values(WORLDS).flatMap((make) => make().notes);
    const tagged = notes.filter((n) => "kind" in n);
    expect([...new Set(tagged.map((n) => n.kind))].sort()).toEqual([...EMAIL_KIND_LIST].sort());
    for (const n of tagged) {
      const kind = n.kind;
      if (!isEmailKind(kind)) throw new Error(`not an emailed kind: ${String(kind)}`);
      const rule = EMAIL_KINDS[kind];
      expect(n.ref, kind).toMatch(ID[rule.ref]);
      // Matches and shares name their listing or item in the link (the email's one link); exchange steps name the request in ref.
      if (rule.link === "eventListing" && rule.category === "match") expect(n.link.listing ?? "", kind).toMatch(ID.listing);
      if (rule.link === "item") {
        if (rule.category === "match") expect([n.link.name, n.link.id ?? ""], kind).toEqual(["item", expect.stringMatching(ID.item)]);
      }
    }
    const rows = emailJobRows(tagged.map((n) => ({ id: n.id, userId: n.userId, kind: n.kind, ref: n.ref, link: n.link })));
    expect(rows.map((r) => [r.id, r.user_id, r.kind, r.ref])).toEqual(tagged.map((n) => [n.id, n.userId, n.kind, n.ref]));
  });

  it("noteTo keeps a tag only as a pair of strings, and nothing else from meta", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const link = { name: "activity", tab: "todo" };
    const ref = "r0123456789abcdef";
    const add = (meta: unknown): EngineNotification => w.run(() => {
      const doc = structuredClone(w.doc);
      E.noteTo(doc, ANN.userId, "Hello", link, meta as NoteMeta);
      return must(doc.notifications[0], "the note");
    });
    expect(add({ kind: "offer.received", ref })).toStrictEqual({ id: expect.any(String), userId: ANN.userId, text: "Hello", link, at: expect.any(Number), read: false, kind: "offer.received", ref });
    for (const meta of [undefined, null, {}, { kind: "offer.received" }, { ref }, { kind: 1, ref }, { kind: "offer.received", ref: [ref] }, "offer.received"]) {
      expect(Object.keys(add(meta)).filter((k) => k === "kind" || k === "ref"), JSON.stringify(meta) ?? "undefined").toEqual([]);
    }
    // Only kind and ref: nothing else in meta reaches the note.
    expect(add({ kind: "offer.received", ref, userId: BOB.userId, text: "Changed", read: true, via: ["email"], link: { name: "x" } })).toStrictEqual({
      id: expect.any(String), userId: ANN.userId, text: "Hello", link, at: expect.any(Number), read: false, kind: "offer.received", ref,
    });
  });

  it("tags at exactly the planned call sites in the engine's source: the 16 emailed kinds, at 19 sites", () => {
    const src = readFileSync(join(TOOL, "engine", "index.js"), "utf8");
    const sites = [...src.matchAll(/\{ kind: "([a-z.]+)", ref: [^}]+ \}/g)].map((m) => m[1] ?? "");
    const counts: Record<string, number> = {};
    for (const k of sites) counts[k] = (counts[k] ?? 0) + 1;
    // The listing and item matches are told from two places each: when posted, and when resumed for those who started looking meanwhile.
    // An invitation too (follow-on B5): in answer to a request to buy (invite), and to a public request's poster (inviteRequester).
    expect(EMAIL_KIND_LIST).toHaveLength(16);
    expect(sites).toHaveLength(19);
    expect(counts).toEqual(Object.fromEntries(EMAIL_KIND_LIST.map((k) => [k, k === "match.listing" || k === "match.item" || k === "buy.invited" ? 2 : 1])));
  });
});

describe("drain passes a tag on only when it fits email_jobs (engine-port.ts)", () => {
  it("as the store runs the port: the seller's note keeps the offer's kind and id beside the fields the table keeps", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    const l = w.listTickets(ANN, ev, { qty: 1, obo: true });
    const parsed = enginePort.parse({ type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false });
    if (!parsed.ok) throw new Error(parsed.error);
    const doc = w.doc as unknown as WorldDoc;
    const out = enginePort.run({ doc, people: w.people.map(rowOf), now: w.now }, () => {
      const res = enginePort.reduce(doc, BOB.userId, parsed.action);
      if (res.error !== undefined) throw new Error(res.error);
      return { id: must(res.result?.id, "the offer"), notes: enginePort.drain(res.state) };
    });
    expect(out.notes).toStrictEqual([{
      id: expect.stringMatching(/^[0-9a-f]{16}$/), userId: ANN.userId, text: expect.stringMatching(/ offered \$30 each for 1 ticket for Spring Formal /),
      link: { name: "activity", tab: "todo" }, at: expect.any(Number), kind: "offer.received", ref: out.id,
    }]);
  });

  it("drops a malformed tag but never its note: wrong case, shape or length, one field without the other, or not a string", () => {
    const ok = { kind: "offer.received", ref: "r0123456789abcdef" };
    const cases: [string, Record<string, unknown>, boolean][] = [
      ["well formed", ok, true],
      ["the shortest kind and ref", { kind: "a.b", ref: "-" }, true],
      ["three words, 40 characters, a 48-character ref", { kind: `${"a".repeat(13)}.${"b".repeat(12)}.${"c".repeat(13)}`, ref: "z".repeat(48) }, true],
      ["a capital letter in the kind", { ...ok, kind: "Offer.received" }, false],
      ["one word", { ...ok, kind: "offer" }, false],
      ["four words", { ...ok, kind: "a.b.c.d" }, false],
      ["a 41-character kind", { ...ok, kind: `${"a".repeat(20)}.${"b".repeat(20)}` }, false],
      ["a digit in the kind", { ...ok, kind: "offer.received2" }, false],
      ["a trailing newline in the kind", { ...ok, kind: "offer.received\n" }, false],
      ["a capital letter in the ref", { ...ok, ref: "R0123456789ABCDEF" }, false],
      ["a space in the ref", { ...ok, ref: "r0123 456" }, false],
      ["a 49-character ref", { ...ok, ref: "r".repeat(49) }, false],
      ["an empty ref", { ...ok, ref: "" }, false],
      ["a trailing newline in the ref", { ...ok, ref: "r0123456789abcdef\n" }, false],
      ["a kind without a ref", { kind: ok.kind }, false],
      ["a ref without a kind", { ref: ok.ref }, false],
      ["a number", { ...ok, kind: 42 }, false],
      ["a list, which a pattern alone would read as its one string", { ...ok, kind: [ok.kind] }, false],
      ["an object that prints as a ref", { ...ok, ref: { toString: () => ok.ref } }, false],
      ["nulls", { kind: null, ref: null }, false],
    ];
    const link = { name: "activity", tab: "todo" };
    const notes = cases.map(([, tag], k) => ({ id: `n${String(k).padStart(15, "0")}`, userId: ANN.userId, text: `Note ${k}`, link, at: T0 + k, read: false, via: ["email"], ...tag }));
    const doc = { ...E.emptyWorld(), notifications: notes };
    const out = enginePort.drain(doc as unknown as WorldDoc);
    expect(doc.notifications).toEqual([]);
    expect(out).toStrictEqual(cases.map(([, tag, kept], k) => ({
      id: `n${String(k).padStart(15, "0")}`, userId: ANN.userId, text: `Note ${k}`, link, at: T0 + k, ...(kept ? { kind: tag["kind"], ref: tag["ref"] } : {}),
    })));
    expect(out.filter((n) => "kind" in n).length, cases.filter(([, , kept]) => kept).map(([what]) => what).join("; ")).toBe(3);
  });

  it("checks the same patterns as email_jobs' CHECKs in schema.sql", () => {
    const ddl = readFileSync(join(TOOL, "schema.sql"), "utf8");
    const kind = /\bkind\s+TEXT\s+NOT NULL CHECK \(kind ~ '([^']+)' AND char_length\(kind\) <= (\d+)\)/.exec(ddl);
    const ref = /\bref\s+TEXT\s+NOT NULL CHECK \(ref ~ '([^']+)'\)/.exec(ddl);
    expect([kind?.[1], Number(kind?.[2]), ref?.[1]]).toEqual([NOTE_KIND.source, NOTE_KIND_MAX, NOTE_REF.source]);
  });
});

describe("View.email is its owner's alone (types.ts; helpers/contract.ts)", () => {
  it("the projection makes no email envelope for anyone, and a view never carries a note's tag", () => {
    const w = exchange();
    // The notes as a store that kept the tags would read them: the projection allowlists a notification's fields.
    const stored = w.notesFor(ANN.userId).map((n) => ({ id: n.id, userId: n.userId, text: n.text, link: n.link, at: n.at, read: false, kind: n.kind, ref: n.ref }));
    expect(stored.filter((n) => n.kind !== undefined).length).toBeGreaterThan(0);
    const ann = viewOf(w, ANN, { notifications: stored as ViewNotification[] });
    expect(contractViolations(ann, ANN.userId)).toEqual([]);
    expect(ann.notifications).toHaveLength(stored.length);
    expect(ann.notifications.filter((n) => "kind" in n || "ref" in n)).toEqual([]);
    expect(JSON.stringify(ann)).not.toMatch(/offer\.received|payment\.reported|"kind":"(offer|counter|reply|payment|transfer|item|match|share|buy)\./);
    for (const who of [ANN, BOB, CAT, FAY]) expect("email" in viewOf(w, who), who.name).toBe(false);
    const g = guestViewOf(w);
    expect(guestContractViolations(g)).toEqual([]);
    expect(Object.keys(g)).not.toContain("email");
    expect(Object.keys(g)).not.toContain("notifications");
  });

  it("the contract takes the owner's own envelope, and refuses anyone else's address, other keys or types, and states that can't happen", () => {
    const w = exchange();
    const v = viewOf(w, ANN);
    const own: ViewEmail = { available: true, mode: "capture", address: emailOf(ANN), exchange: true, matches: false, reconfirm: false, paused: false };
    const with_ = (email: unknown, view: View = v): View => ({ ...view, email: email as ViewEmail });
    expect(contractViolations(with_(own), ANN.userId)).toEqual([]);
    expect(contractViolations(with_({ ...own, address: emailOf(ANN).toUpperCase() }), ANN.userId)).toEqual([]); // the same mailbox, as Google may case it
    expect(contractViolations(with_({ ...own, available: false, mode: null, exchange: false }), ANN.userId)).toEqual([]);
    expect(contractViolations(with_({ ...own, mode: "provider", exchange: false, reconfirm: true }), ANN.userId)).toEqual([]);
    // Anyone else's address, or none while the viewer has one.
    expect(contractViolations(with_({ ...own, address: emailOf(BOB) }), ANN.userId)).toEqual(["email.address: not the viewer's own sign-in address"]);
    expect(contractViolations(with_({ ...own, address: null, exchange: false }), ANN.userId)).toEqual(["email.address: not the viewer's own sign-in address"]);
    // Other keys (anything stored with the choices, such as the consent version or the sign-in), a missing one, other types.
    expect(contractViolations(with_({ ...own, consentVersion: "v1" }), ANN.userId)).toEqual([`email keys: ${[...VIEW_EMAIL_KEYS, "consentVersion"].join(",")}`]);
    const { reconfirm: _gone, ...short } = own;
    expect(contractViolations(with_(short), ANN.userId)).toEqual([`email keys: ${VIEW_EMAIL_KEYS.filter((k) => k !== "reconfirm").join(",")}`, "email.reconfirm: not a boolean"]);
    expect(contractViolations(with_({ ...own, exchange: "yes" }), ANN.userId)).toEqual(["email.exchange: not a boolean"]);
    expect(contractViolations(with_({ ...own, mode: "smtp" }), ANN.userId)).toEqual(["email.mode: not capture, provider or null"]);
    expect(contractViolations(with_({ ...own, available: false }), ANN.userId)).toEqual(["email.mode: set exactly while email is available"]);
    expect(contractViolations(with_({ ...own, mode: null }), ANN.userId)).toEqual(["email.mode: set exactly while email is available"]);
    expect(contractViolations(with_({ ...own, address: 42 }), ANN.userId)).toEqual(["email.address: not a string or null"]);
    expect(contractViolations(with_("on"), ANN.userId)).toEqual(["email: not an object"]);
    expect(emailViolations(null, emailOf(ANN))).toEqual(["email: not an object"]);
    expect(emailViolations([own], emailOf(ANN))).toEqual(["email: not an object"]);
    // On while a changed address waits to be turned on again, or with no address at all.
    expect(contractViolations(with_({ ...own, matches: true, reconfirm: true }), ANN.userId)).toEqual(["email: a category on while it waits to be turned on again for a new address"]);
    const noAddress: View = { ...v, viewer: { ...v.viewer, email: null } };
    expect(contractViolations(with_({ ...own, address: null }, noAddress), ANN.userId)).toEqual(["email: a category on without an address"]);
    expect(contractViolations(with_({ ...own, address: null, exchange: false }, noAddress), ANN.userId)).toEqual([]);
    // Paused: a choice that's on while no dispatcher has worked lately. Never while email is available, or with nothing on.
    const pausedWrong = ["email.paused: only while email isn't available and a category is on"];
    expect(contractViolations(with_({ ...own, available: false, mode: null, paused: true }), ANN.userId)).toEqual([]);
    expect(contractViolations(with_({ ...own, paused: true }), ANN.userId)).toEqual(pausedWrong);
    expect(contractViolations(with_({ ...own, available: false, mode: null, exchange: false, paused: true }), ANN.userId)).toEqual(pausedWrong);
    expect(contractViolations(with_({ ...own, paused: "yes" }), ANN.userId)).toEqual(["email.paused: not a boolean"]);
    const { paused: _never, ...before } = own;
    expect(contractViolations(with_(before), ANN.userId)).toEqual([`email keys: ${VIEW_EMAIL_KEYS.filter((k) => k !== "paused").join(",")}`, "email.paused: not a boolean"]);
    // Only `email` joins the view's keys.
    expect(contractViolations({ ...v, emailPrefs: own } as unknown as View, ANN.userId)).toEqual([expect.stringMatching(/^view keys: .*,emailPrefs$/)]);
  });

  it("a guest view never has one: the guest contract refuses it", () => {
    const g = guestViewOf(exchange());
    const own: ViewEmail = { available: true, mode: "capture", address: emailOf(ANN), exchange: true, matches: false, reconfirm: false, paused: false };
    expect(guestContractViolations({ ...g, email: own } as unknown as GuestView)).toEqual([
      `guest view keys: ${[...Object.keys(g), "email"].join(",")}`,
      "guest view: email (follow-on B4: a signed-in owner's only)",
    ]);
  });

  it("types: View.email is the owner's ViewEmail, and a guest view has no email field", () => {
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
    const ownerOnly: Equal<View["email"], ViewEmail | undefined> = true;
    const guestNone: "email" extends keyof GuestView ? false : true = true;
    expect([ownerOnly, guestNone]).toEqual([true, true]);
  });
});
