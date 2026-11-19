// Who may do what in live (C-DESIGN.md §3.2, §9.1), table-driven, on the server's path: parseAction, then the engine as the
// signed-in user, on a world built through the live engine. For every action a client can send:
// - the allowed actor succeeds;
// - a stranger, the other party and the wrong side are refused with the engine's own message, and nothing changes;
// - every refusal comes from the engine (the action passed the input gate: its shape was fine, only the actor was wrong).
// Also: nobody can act without a session; the server's sweep isn't a client action; every type live refuses is refused by
// the gate and again by the engine. The people are labelled test accounts; no database and no sign-in of any kind.
import { describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action } from "../../engine/index.js";
import { LIVE_ACTIONS, NOT_AVAILABLE_ERROR, parseAction } from "../live.js";
import { FAY, PEOPLE6, ServerWorld } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, EVE, HOUR, type TestPerson, dateAfter, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const REFUSED = ["request", "sellerReport", "buyerReport", "consent", "orgApprove", "orgDecline", "orgConfirm", "setPolicy", "reviewMissing",
  "reviewProblem", "clock", "seen", "feedbackGiven", "markFeedSeen", "setAlertPrefs", "suggestEvent", "readNote", "readAll"];

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}

/**
 * Ann's market: her Spring Formal (10 days ahead; $40 and $60 tiers; 4 per person), a listing of 2 general-admission tickets
 * at $35 that takes offers from $20, and 2 VIP tickets she hasn't listed (`spare`). Everyone else starts with nothing.
 */
function market() {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = w.addEvent(ANN, { tiers: [{ label: "General admission", price: "40" }, { label: "VIP", price: "60" }] });
  const l = w.listTickets(ANN, ev, { qty: 2, obo: true, minOffer: "20" });
  const spare = must(w.ok(ANN.userId, { type: "addHolding", eventId: ev, tier: "t2", qty: 2, paid: "50" }).id, "Ann's spare holding");
  return { w, ev, l, spare };
}
/** Cat's open offer of $30 on Ann's listing. */
function offered() {
  const m = market();
  const r = must(m.w.ok(CAT.userId, { type: "offer", listingId: m.l, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
  return { ...m, r };
}
/** Bob's reservation on Ann's listing, at each step of the quick flow. */
function reserved(step: "accepted" | "paid" | "confirmed" | "sent" | "completed" = "accepted") {
  const m = market();
  const r = m.w.take(BOB, m.l);
  const order = ["accepted", "paid", "confirmed", "sent", "completed"];
  const steps: [string, TestPerson, string][] = [["paid", BOB, "markPaid"], ["confirmed", ANN, "confirmPayment"], ["sent", ANN, "markTransferred"], ["completed", BOB, "buyerReceived"]];
  for (const [reached, who, type] of steps) if (order.indexOf(step) >= order.indexOf(reached)) m.w.ok(who.userId, { type, requestId: r });
  return { ...m, r };
}
/** Bob's request to buy one of Ann's tickets at her price (follow-on B5): nothing is held. */
function asked() {
  const m = market();
  const r = must(m.w.ok(BOB.userId, { type: "requestToBuy", listingId: m.l, qty: 1, amount: "", msg: "", member: false }).id, "request to buy");
  return { ...m, r };
}
/** Dan's public request for Ann's event (1 at up to $40). */
function requested() {
  const m = market();
  const iso = m.w.requestFor(DAN, m.ev, { budget: "40" });
  return { ...m, iso };
}
/** Ann's desk chair, and Bob's request for it (he hasn't agreed to share his contact). */
function itemRequested(accept = false) {
  const w = new ServerWorld({ people: PEOPLE6 });
  const it = w.postItem(ANN);
  const g = must(w.ok(BOB.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).id, "goods request");
  if (accept) w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
  return { w, it, g };
}

interface Row {
  /** Who may: one fresh world per allowed actor. */
  allowed: readonly TestPerson[];
  /** [actor, the engine's refusal, who they are] on the same world, which a refusal must leave unchanged. */
  refused: readonly [TestPerson, string, string][];
  build(): { w: ServerWorld; action: Action };
}

const ONLY_SELLER_ACCEPTS = "Only the seller can accept.";
const ROWS: Record<string, Row> = {
  // ── Anyone signed in, acting as themselves ──
  createEvent: {
    allowed: [CAT, FAY],
    refused: [],
    build: () => { const w = new ServerWorld({ people: PEOPLE6 }); return { w, action: { type: "createEvent", kind: "event", title: "Spring Formal", club: "WGA", cat: "Parties", start: wallAfter(w.now, 10), tiers: [{ label: "GA", price: "40" }] } }; },
  },
  addHolding: {
    allowed: [BOB, CAT],
    refused: [],
    build: () => { const m = market(); return { w: m.w, action: { type: "addHolding", eventId: m.ev, tier: "t1", qty: 1, paid: "40" } }; },
  },
  addThen: {
    allowed: [BOB, CAT],
    refused: [],
    // Protocol 2 (follow-on B1): buyers pay with the seller's profile methods, which the page saves before a first listing: Cat's here.
    build: () => { const m = market(); m.w.people = m.w.people.map((p) => (p.userId === CAT.userId ? { ...p, payMethods: [{ kind: "venmo", value: "cat-moore" }] } : p));
      return { w: m.w, action: { type: "addThen", add: { eventId: m.ev, tier: "t1", qty: 1, paid: "40" }, then: { type: "list", qty: 1, ask: "35", method: "app", file: null } } }; },
  },
  // One-form Sell (§9l): Post ticket, for a ticket of the actor's own, here with a new event made with it. Anyone signed in.
  postTicket: {
    allowed: [BOB, CAT],
    refused: [],
    build: () => { const m = market(); m.w.people = m.w.people.map((p) => (p.userId === CAT.userId ? { ...p, payMethods: [{ kind: "venmo", value: "cat-moore" }] } : p));
      return { w: m.w, action: { type: "postTicket", event: { kind: "event", title: "Rooftop Mixer", start: dateAfter(m.w.now, 12) }, qty: 1, ask: "30", method: "file", file: null } }; },
  },
  // One-form Request (§9m item 3): Post request, a request of the actor's own, here with a new event made with it. Anyone signed in.
  postRequest: {
    allowed: [BOB, FAY],
    refused: [],
    build: () => { const m = market(); return { w: m.w, action: { type: "postRequest", event: { kind: "event", title: "Oysters", start: dateAfter(m.w.now, 12) } } }; },
  },
  postItem: {
    allowed: [BOB, FAY],
    refused: [],
    build: () => { const w = new ServerWorld({ people: PEOPLE6 }); return { w, action: { type: "postItem", data: { title: "Lamp", cat: "Home & kitchen", cond: "Good", price: "10", area: "Fishtown", until: dateAfter(w.now, 10), note: "", photos: [] } } }; },
  },
  saveInterest: {
    allowed: [BOB, FAY],
    refused: [],
    build: () => { const m = market(); return { w: m.w, action: { type: "saveInterest", data: { eventId: m.ev, qty: 1, budget: "40", note: "", expires: dateAfter(m.w.now, 5) } } }; },
  },
  joinAlert: {
    allowed: [BOB, FAY],
    refused: [],
    build: () => { const m = market(); return { w: m.w, action: { type: "joinAlert", eventId: m.ev, qty: 1, max: "30" } }; },
  },
  take: {
    allowed: [BOB, CAT],
    refused: [[ANN, "You can't buy your own listing.", "the seller"]],
    build: () => { const m = market(); return { w: m.w, action: { type: "take", listingId: m.l, qty: 1, amount: "", msg: "", member: false } }; },
  },
  offer: {
    allowed: [BOB, CAT],
    refused: [[ANN, "You can't buy your own listing.", "the seller"]],
    build: () => { const m = market(); return { w: m.w, action: { type: "offer", listingId: m.l, qty: 1, amount: "30", msg: "", member: false } }; },
  },
  // Invite to pay (follow-on B5): anyone but the seller may ask to buy; it holds nothing.
  requestToBuy: {
    allowed: [BOB, CAT],
    refused: [[ANN, "You can't buy your own listing.", "the seller"]],
    build: () => { const m = market(); return { w: m.w, action: { type: "requestToBuy", listingId: m.l, qty: 1, amount: "", msg: "", member: false } }; },
  },
  requestItem: {
    allowed: [BOB, CAT],
    refused: [[ANN, "You can't request your own item.", "the seller"]],
    build: () => { const w = new ServerWorld({ people: PEOPLE6 }); const it = w.postItem(ANN); return { w, action: { type: "requestItem", id: it, msg: "", shareContact: false } }; },
  },
  isoReply: {
    allowed: [ANN],
    refused: [[DAN, "That's your own request.", "the requester"], [CAT, "Choose a ticket you hold for this event.", "a stranger with someone else's ticket"]],
    build: () => { const m = requested(); return { w: m.w, action: { type: "isoReply", isoId: m.iso, holdingId: m.spare, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, note: "", membersOnly: false } }; },
  },
  // Inviting a public request's poster to pay (follow-on B5): only on a listing of the actor's own.
  inviteRequester: {
    allowed: [ANN],
    refused: [[CAT, "Choose one of your listings.", "a stranger"], [DAN, "Choose one of your listings.", "the requester"]],
    build: () => { const m = requested(); return { w: m.w, action: { type: "inviteRequester", isoId: m.iso, listingId: m.l, qty: 1 } }; },
  },
  // §9v item 2 (SELL5-M3): "I have this" in one submission: a ticket of the actor's own, listed for someone else's request.
  answerRequest: {
    allowed: [ANN],
    refused: [[DAN, "That's your own request.", "the requester"], [CAT, "Choose a ticket you hold.", "a stranger listing someone else's ticket"]],
    build: () => { const m = requested(); return { w: m.w, action: { type: "answerRequest", isoId: m.iso, holdingId: m.spare, qty: 1, ask: "35", note: "", obo: false } }; },
  },
  seq: {
    allowed: [ANN],
    refused: [[CAT, "Choose a ticket you hold.", "a stranger listing someone else's ticket"], [DAN, "Choose a ticket you hold.", "the requester"]],
    build: () => { const m = requested(); return { w: m.w, action: { type: "seq", steps: [{ action: { type: "list", holdingId: m.spare, qty: 1, ask: "35", method: "app", file: null } }, { action: { type: "shareListing", isoId: m.iso, listingId: "@0" }, optional: true }] } }; },
  },

  // ── The record's owner ──
  removeEvent: {
    allowed: [ANN],
    refused: [[BOB, "Only the person who added an event can remove it.", "someone else"], [FAY, "Only the person who added an event can remove it.", "a stranger"]],
    build: () => { const w = new ServerWorld({ people: PEOPLE6 }); const ev = w.addEvent(ANN); return { w, action: { type: "removeEvent", eventId: ev } }; },
  },
  list: {
    allowed: [ANN],
    refused: [[BOB, "Choose a ticket you hold.", "a buyer"], [FAY, "Choose a ticket you hold.", "a stranger"]],
    build: () => { const w = new ServerWorld({ people: PEOPLE6 }); const ev = w.addEvent(ANN); const h = must(w.ok(ANN.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 2, paid: "40" }).id, "holding");
      return { w, action: { type: "list", holdingId: h, qty: 1, ask: "35", method: "app", file: null } }; },
  },
  withdraw: {
    allowed: [ANN],
    refused: [[BOB, "Listing not found.", "a buyer with a reservation on it"], [FAY, "Listing not found.", "a stranger"]],
    build: () => { const m = reserved(); return { w: m.w, action: { type: "withdraw", listingId: m.l } }; },
  },
  withdrawItem: {
    allowed: [ANN],
    refused: [[BOB, "Item not found.", "a buyer with a request on it"], [FAY, "Item not found.", "a stranger"]],
    build: () => { const m = itemRequested(); return { w: m.w, action: { type: "withdrawItem", id: m.it } }; },
  },
  // A seller's edit, pause and resume (C-CONTRACT §8): the seller only. To anyone else, a buyer with a reservation or an open offer
  // on it included, the listing or item isn't theirs to find.
  editListing: {
    allowed: [ANN],
    refused: [[BOB, "Listing not found.", "a buyer with a reservation on it"], [CAT, "Listing not found.", "a buyer with an open offer on it"], [FAY, "Listing not found.", "a stranger"]],
    build: () => { const m = reserved(); m.w.ok(CAT.userId, { type: "offer", listingId: m.l, qty: 1, amount: "25", msg: "", member: false });
      return { w: m.w, action: { type: "editListing", listingId: m.l, ask: "32", obo: true, minOffer: "20", note: "Row C." } }; },
  },
  pauseListing: {
    allowed: [ANN],
    refused: [[BOB, "Listing not found.", "a buyer with a reservation on it"], [CAT, "Listing not found.", "a buyer with an open offer on it"], [FAY, "Listing not found.", "a stranger"]],
    build: () => { const m = reserved(); m.w.ok(CAT.userId, { type: "offer", listingId: m.l, qty: 1, amount: "25", msg: "", member: false }); return { w: m.w, action: { type: "pauseListing", listingId: m.l } }; },
  },
  resumeListing: {
    allowed: [ANN],
    refused: [[BOB, "Listing not found.", "a buyer with a reservation on it"], [FAY, "Listing not found.", "a stranger"]],
    build: () => { const m = reserved(); m.w.ok(ANN.userId, { type: "pauseListing", listingId: m.l }); return { w: m.w, action: { type: "resumeListing", listingId: m.l } }; },
  },
  editItem: {
    allowed: [ANN],
    refused: [[BOB, "Item not found.", "a buyer with a request on it"], [FAY, "Item not found.", "a stranger"]],
    build: () => { const m = itemRequested(); return { w: m.w, action: { type: "editItem", id: m.it, price: "35", obo: false, minOffer: "", note: "Barely used." } }; },
  },
  // §9s item 6: an item's photo is its seller's to set, replace or remove. The image comes beside the action (w.photo: the server's
  // reference to it, attached after parseAction as the store does); to anyone else the item isn't theirs, image or no image.
  setItemPhoto: {
    allowed: [ANN],
    refused: [[BOB, "Item not found.", "a buyer with a request on it"], [FAY, "Item not found.", "a stranger"]],
    build: () => { const m = itemRequested(); m.w.photo = { v: "0123456789abcdef", w: 1280, h: 960 }; return { w: m.w, action: { type: "setItemPhoto", id: m.it } }; },
  },
  removeItemPhoto: {
    allowed: [ANN],
    refused: [[BOB, "Item not found.", "a buyer with a request on it"], [FAY, "Item not found.", "a stranger"]],
    build: () => { const m = itemRequested(); m.w.photo = { v: "0123456789abcdef", w: 1280, h: 960 }; m.w.ok(ANN.userId, { type: "setItemPhoto", id: m.it }); m.w.photo = null;
      return { w: m.w, action: { type: "removeItemPhoto", id: m.it } }; },
  },
  pauseItem: {
    allowed: [ANN],
    refused: [[BOB, "Item not found.", "a buyer with a request on it"], [FAY, "Item not found.", "a stranger"]],
    build: () => { const m = itemRequested(); return { w: m.w, action: { type: "pauseItem", id: m.it } }; },
  },
  resumeItem: {
    allowed: [ANN],
    refused: [[BOB, "Item not found.", "a buyer with a request on it"], [FAY, "Item not found.", "a stranger"]],
    build: () => { const m = itemRequested(); m.w.ok(ANN.userId, { type: "pauseItem", id: m.it }); return { w: m.w, action: { type: "resumeItem", id: m.it } }; },
  },
  setAlert: {
    allowed: [FAY],
    refused: [[ANN, "Alert not found.", "the event's seller"], [BOB, "Alert not found.", "a stranger"]],
    build: () => { const m = market(); const al = must(m.w.ok(FAY.userId, { type: "joinAlert", eventId: m.ev, qty: 1, max: "30" }).id, "alert"); return { w: m.w, action: { type: "setAlert", id: al, paused: true } }; },
  },
  closeInterest: {
    allowed: [DAN],
    refused: [[ANN, "Not found.", "a seller who could answer it"], [FAY, "Not found.", "a stranger"]],
    build: () => { const m = requested(); return { w: m.w, action: { type: "closeInterest", id: m.iso, reason: "cancelled" } }; },
  },
  shareListing: {
    allowed: [ANN],
    refused: [[CAT, "Choose one of your listings.", "a stranger"], [DAN, "Choose one of your listings.", "the requester"]],
    build: () => { const m = requested(); return { w: m.w, action: { type: "shareListing", isoId: m.iso, listingId: m.l } }; },
  },
  shareItem: {
    allowed: [ANN],
    refused: [[CAT, "Choose one of your items.", "a stranger"], [EVE, "Choose one of your items.", "the requester"]],
    build: () => {
      const w = new ServerWorld({ people: PEOPLE6 });
      const iso = must(w.ok(EVE.userId, { type: "saveInterest", data: { qty: 1, budget: "45", note: "", expires: dateAfter(w.now, 10), goods: { title: "Desk chair", cat: "Furniture" } } }).id, "goods request");
      const it = w.postItem(ANN);
      return { w, action: { type: "shareItem", isoId: iso, itemId: it } };
    },
  },
  withdrawShare: {
    allowed: [ANN],
    refused: [[DAN, "Share not found.", "the requester"], [FAY, "Share not found.", "a stranger"]],
    build: () => { const m = requested(); const x = must(m.w.ok(ANN.userId, { type: "shareListing", isoId: m.iso, listingId: m.l }).id, "share"); return { w: m.w, action: { type: "withdrawShare", id: x } }; },
  },
  resolveProblem: {
    allowed: [BOB],
    refused: [[ANN, "Only the person who reported it can mark it resolved.", "the other party"], [FAY, "Only the person who reported it can mark it resolved.", "a stranger"]],
    build: () => { const m = reserved("paid"); m.w.ok(BOB.userId, { type: "reportProblem", kind: "ticket", id: m.r, reason: "The seller hasn't sent it" }); return { w: m.w, action: { type: "resolveProblem", kind: "ticket", id: m.r } }; },
  },

  // ── The seller, as a party ──
  counter: {
    allowed: [ANN],
    refused: [[CAT, "Only the seller can counter.", "the buyer"], [FAY, "Only the seller can counter.", "a stranger"]],
    build: () => { const m = offered(); return { w: m.w, action: { type: "counter", requestId: m.r, amount: "33" } }; },
  },
  accept: {
    allowed: [ANN],
    refused: [[CAT, ONLY_SELLER_ACCEPTS, "the buyer"], [FAY, ONLY_SELLER_ACCEPTS, "a stranger"]],
    build: () => { const m = offered(); return { w: m.w, action: { type: "accept", requestId: m.r } }; },
  },
  decline: {
    allowed: [ANN],
    refused: [[CAT, "Only the seller can decline.", "the buyer"], [FAY, "Only the seller can decline.", "a stranger"]],
    build: () => { const m = offered(); return { w: m.w, action: { type: "decline", requestId: m.r } }; },
  },
  // An invitation to pay (follow-on B5): the seller's answer to a request to buy. To anyone else but its buyer, the request isn't there.
  invite: {
    allowed: [ANN],
    refused: [[BOB, "Only the seller can send an invitation.", "the buyer"], [FAY, "Request not found.", "a stranger"]],
    build: () => { const m = asked(); return { w: m.w, action: { type: "invite", requestId: m.r } }; },
  },
  confirmPayment: {
    allowed: [ANN],
    refused: [[BOB, "Only the seller can confirm the payment.", "the buyer"], [FAY, "Only the seller can confirm the payment.", "a stranger"]],
    build: () => { const m = reserved("paid"); return { w: m.w, action: { type: "confirmPayment", requestId: m.r } }; },
  },
  paymentMissing: {
    allowed: [ANN],
    refused: [[BOB, "Only the seller can say the payment hasn't arrived.", "the buyer"], [FAY, "Only the seller can say the payment hasn't arrived.", "a stranger"]],
    build: () => { const m = reserved("paid"); return { w: m.w, action: { type: "paymentMissing", requestId: m.r } }; },
  },
  markTransferred: {
    allowed: [ANN],
    refused: [[BOB, "Only the seller can mark it transferred.", "the buyer"], [FAY, "Only the seller can mark it transferred.", "a stranger"]],
    build: () => { const m = reserved("confirmed"); return { w: m.w, action: { type: "markTransferred", requestId: m.r } }; },
  },
  release: {
    allowed: [ANN],
    refused: [[BOB, "Only the seller can release the hold.", "the buyer"], [FAY, "Only the seller can release the hold.", "a stranger"]],
    build: () => { const m = reserved(); return { w: m.w, action: { type: "release", requestId: m.r } }; },
  },
  acceptItemReq: {
    allowed: [ANN],
    refused: [[BOB, ONLY_SELLER_ACCEPTS, "the buyer"], [FAY, ONLY_SELLER_ACCEPTS, "a stranger"]],
    build: () => { const m = itemRequested(); return { w: m.w, action: { type: "acceptItemReq", id: m.g, shareContact: true } }; },
  },
  declineItemReq: {
    allowed: [ANN],
    refused: [[BOB, "Only the seller can decline.", "the buyer"], [FAY, "Only the seller can decline.", "a stranger"]],
    build: () => { const m = itemRequested(); return { w: m.w, action: { type: "declineItemReq", id: m.g } }; },
  },
  releaseItemReq: {
    allowed: [ANN],
    refused: [[BOB, "Only the seller can release the hold.", "the buyer"], [FAY, "Only the seller can release the hold.", "a stranger"]],
    build: () => { const m = itemRequested(true); return { w: m.w, action: { type: "releaseItemReq", id: m.g } }; },
  },

  // ── The buyer, as a party ──
  respond: {
    allowed: [CAT],
    refused: [[ANN, "Only the buyer can answer.", "the seller"], [FAY, "Only the buyer can answer.", "a stranger"]],
    build: () => { const m = offered(); m.w.ok(ANN.userId, { type: "counter", requestId: m.r, amount: "33" }); return { w: m.w, action: { type: "respond", requestId: m.r, accept: true, member: false } }; },
  },
  // Reserving an invitation (follow-on B5): the invited buyer only. To the seller, another buyer and a stranger it isn't theirs to find.
  reserve: {
    allowed: [BOB],
    refused: [[ANN, "Invitation not found.", "the seller"], [CAT, "Invitation not found.", "another buyer"], [FAY, "Invitation not found.", "a stranger"]],
    build: () => { const m = asked(); m.w.ok(ANN.userId, { type: "invite", requestId: m.r }); return { w: m.w, action: { type: "reserve", requestId: m.r, member: false } }; },
  },
  markPaid: {
    allowed: [BOB],
    refused: [[ANN, "Only the buyer can mark it paid.", "the seller"], [FAY, "Only the buyer can mark it paid.", "a stranger"]],
    build: () => { const m = reserved(); return { w: m.w, action: { type: "markPaid", requestId: m.r } }; },
  },
  buyerReceived: {
    allowed: [BOB],
    refused: [[ANN, "Only the buyer can confirm they received it.", "the seller"], [FAY, "Only the buyer can confirm they received it.", "a stranger"]],
    build: () => { const m = reserved("sent"); return { w: m.w, action: { type: "buyerReceived", requestId: m.r } }; },
  },
  cancel: {
    allowed: [BOB],
    refused: [[ANN, "Request not found.", "the seller"], [FAY, "Request not found.", "a stranger"]],
    build: () => { const m = reserved(); return { w: m.w, action: { type: "cancel", requestId: m.r } }; },
  },
  cancelItemReq: {
    allowed: [BOB],
    refused: [[ANN, "Request not found.", "the seller"], [FAY, "Request not found.", "a stranger"]],
    build: () => { const m = itemRequested(); return { w: m.w, action: { type: "cancelItemReq", id: m.g } }; },
  },
  itemPickedUp: {
    allowed: [BOB],
    refused: [[ANN, "Only the buyer can confirm pickup.", "the seller"], [FAY, "Only the buyer can confirm pickup.", "a stranger"]],
    build: () => { const m = itemRequested(true); return { w: m.w, action: { type: "itemPickedUp", id: m.g } }; },
  },

  // ── Either party ──
  setPickup: {
    allowed: [BOB, ANN],
    refused: [[FAY, "Only the buyer or seller can set the pickup time.", "a stranger"], [CAT, "Only the buyer or seller can set the pickup time.", "another buyer"]],
    build: () => { const m = itemRequested(true); return { w: m.w, action: { type: "setPickup", id: m.g, at: wallAfter(m.w.now, 2, "17:00") } }; },
  },
  itemConsent: {
    allowed: [BOB],
    refused: [[ANN, "You can only share your own contact details.", "the seller, for the buyer's side"], [FAY, "You can only share your own contact details.", "a stranger"]],
    build: () => { const m = itemRequested(true); return { w: m.w, action: { type: "itemConsent", id: m.g, side: "buyer" } }; },
  },
  reportProblem: {
    allowed: [BOB, ANN],
    refused: [[FAY, "Only the buyer or seller can report a problem.", "a stranger"], [CAT, "Only the buyer or seller can report a problem.", "another buyer"]],
    build: () => { const m = reserved("paid"); return { w: m.w, action: { type: "reportProblem", kind: "ticket", id: m.r, reason: "Something else" } }; },
  },
};

describe("who may do what (C-DESIGN §3.2)", () => {
  it("has a row for every action a client can send", () => {
    expect(Object.keys(ROWS).sort()).toEqual([...LIVE_ACTIONS].sort());
  });

  it.each(Object.entries(ROWS))("%s: the allowed actor succeeds; the stranger, the other party and the wrong side are refused by the engine", (type, row) => {
    const { w, action } = row.build();
    expect(action.type).toBe(type);
    const before = JSON.stringify(w.doc);
    for (const [who, error, label] of row.refused) {
      expect(w.no(who.userId, action), `${type} by ${label}`).toBe(error);
      expect(JSON.stringify(w.doc), `${type} by ${label} changed the world`).toBe(before);
    }
    expect(w.invalid, `${type}: every refusal is the engine's, not the input gate's`).toEqual([]);
    for (const who of row.allowed) {
      const fresh = row.build();
      fresh.w.ok(who.userId, fresh.action);
      expect(fresh.w.invalid).toEqual([]);
    }
  });

  it("the other side of a two-sided step: each party may share only their own contact details", () => {
    const m = itemRequested(true);
    expect(m.w.no(BOB.userId, { type: "itemConsent", id: m.g, side: "seller" })).toBe("You can only share your own contact details.");
    expect(m.w.no(ANN.userId, { type: "itemConsent", id: m.g, side: "buyer" })).toBe("You can only share your own contact details.");
    m.w.ok(BOB.userId, { type: "itemConsent", id: m.g, side: "buyer" });
    expect(m.w.no(BOB.userId, { type: "itemConsent", id: m.g, side: "buyer" })).toBe("You've already agreed.");
  });

  it("owners edit only their own: another person's public request can't be edited, or answered with someone else's ticket", () => {
    const m = requested();
    expect(m.w.no(FAY.userId, { type: "saveInterest", data: { id: m.iso, eventId: m.ev, qty: 1, budget: "30", note: "", expires: dateAfter(m.w.now, 5) } })).toBe("Request not found.");
    expect(m.w.no(ANN.userId, { type: "saveInterest", data: { id: m.iso, eventId: m.ev, qty: 1, budget: "30", note: "", expires: dateAfter(m.w.now, 5) } })).toBe("Request not found.");
    m.w.ok(DAN.userId, { type: "saveInterest", data: { id: m.iso, eventId: m.ev, qty: 1, budget: "30", note: "", expires: dateAfter(m.w.now, 5) } });
  });

  it("a release after a disputed payment: only the seller, and only after the waiting time (C-DESIGN §8.3)", () => {
    const m = reserved("paid");
    m.w.ok(ANN.userId, { type: "paymentMissing", requestId: m.r });
    expect(m.w.no(BOB.userId, { type: "release", requestId: m.r })).toBe("Only the seller can release the hold.");
    expect(m.w.no(ANN.userId, { type: "release", requestId: m.r })).toMatch(/^You can release it after /);
    m.w.advance(25 * HOUR);
    expect(m.w.no(FAY.userId, { type: "release", requestId: m.r })).toBe("Only the seller can release the hold.");
    m.w.ok(ANN.userId, { type: "release", requestId: m.r });
  });

  it("the buyer may cancel a paid reservation only after the seller said the money didn't arrive", () => {
    const m = reserved("paid");
    expect(m.w.no(BOB.userId, { type: "cancel", requestId: m.r })).toMatch(/^You've marked it paid/);
    m.w.ok(ANN.userId, { type: "paymentMissing", requestId: m.r });
    expect(m.w.no(ANN.userId, { type: "cancel", requestId: m.r })).toBe("Request not found.");
    m.w.ok(BOB.userId, { type: "cancel", requestId: m.r });
  });
});

describe("no session, the server's sweep, and the types live refuses", () => {
  it("nobody can act without a signed-in user: every client action is refused for a null actor", () => {
    const m = reserved();
    const refusals = LIVE_ACTIONS.map((type) => [type, m.w.no(null, { type, requestId: m.r, listingId: m.l, eventId: m.ev, id: m.r, qty: 1, data: {}, steps: [] })] as const);
    expect(refusals.filter(([, e]) => e !== "Sign in to do that.")).toEqual([]);
  });

  it("the sweep is the server's: the input gate refuses it, the engine refuses it from a user and runs it with no actor", () => {
    const m = reserved();
    expect(parseAction({ type: "sweep" })).toMatchObject({ ok: false, error: NOT_AVAILABLE_ERROR });
    expect(m.w.run(() => E.reduce(m.w.doc, BOB.userId, { type: "sweep" }).error)).toBe(NOT_AVAILABLE_ERROR);
    expect(m.w.sweep().res.error).toBeUndefined();
  });

  it("every type live refuses is refused by the input gate, and again by the engine", () => {
    const m = reserved();
    for (const type of REFUSED) {
      const action: Action = { type, requestId: m.r, listingId: m.l, eventId: m.ev, id: m.r, hours: 1, policy: "official", outcome: "uphold", kind: "ticket", side: "buyer", email: true, at: m.w.now };
      expect(parseAction(action), type).toMatchObject({ ok: false, error: NOT_AVAILABLE_ERROR });
      expect(m.w.run(() => E.reduce(m.w.doc, ANN.userId, action).error), type).toBe(NOT_AVAILABLE_ERROR);
      expect(m.w.run(() => E.reduce(m.w.doc, BOB.userId, action).error), type).toBe(NOT_AVAILABLE_ERROR);
    }
  });

  it("simulate never lets one person act for another: the gate drops it, so the engine judges the actor alone", () => {
    const m = reserved("sent");
    // In the preview a seller could simulate a made-up buyer's receipt; live drops the flag, and the seller isn't the buyer.
    expect(m.w.no(ANN.userId, { type: "buyerReceived", requestId: m.r, simulate: true })).toBe("Only the buyer can confirm they received it.");
    const o = offered();
    expect(o.w.no(CAT.userId, { type: "accept", requestId: o.r, simulate: true })).toBe(ONLY_SELLER_ACCEPTS);
    // And the engine refuses simulate itself if it ever got through (the second line of defense).
    expect(o.w.run(() => E.reduce(o.w.doc, ANN.userId, { type: "accept", requestId: o.r, simulate: true }).error)).toBe(NOT_AVAILABLE_ERROR);
  });
});
