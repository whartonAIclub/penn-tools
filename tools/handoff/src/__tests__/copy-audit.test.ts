// The live copy audit (C-DESIGN.md §8.4, §9.1). A corpus of live actions covers every type a live world runs, each accepted
// at least once and refused at least once, plus every refused legacy type: the core ticket flow, offers and counters, held
// replies, the disputed Paid, the ticket-file method, requests, alerts and shares, goods from post to pickup, seq, expiry
// sweeps, and invite to pay (follow-on B5: request to buy, invite, reserve, and what the switch of step S3 turns on). No toast, error, notification, history line or reason it produces, and no text the view helpers show for it, may
// read as sample data or a simulation; and "verified" may appear only as "not verified" (or "isn't verified").
// The people are labelled test accounts; no database and no sign-in.
import { beforeAll, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { LiveWorld } from "../../engine/index.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, EVERYONE, HOUR, LiveTestWorld, MIN, dateAfter, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const BANNED = /\b(demo|simulat\w*|illustrative|fictional|reviewer|sample)\b/i;
const REFUSED = ["request", "sellerReport", "buyerReport", "consent", "orgApprove", "orgDecline", "orgConfirm", "setPolicy", "reviewMissing",
  "reviewProblem", "clock", "seen", "feedbackGiven", "markFeedSeen", "setAlertPrefs", "suggestEvent", "readNote", "readAll"];

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}
const id = (w: LiveTestWorld, actor: string, action: Parameters<LiveTestWorld["ok"]>[1], what: string): string => must(w.ok(actor, action).id, what);

/** Every string value in a value, with where it was found. */
function strings(value: unknown, where: string, out: [string, string][]): void {
  if (typeof value === "string") out.push([where, value]);
  else if (Array.isArray(value)) value.forEach((v, k) => strings(v, `${where}[${k}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, `${where}.${k}`, out);
}

interface Corpus {
  worlds: LiveTestWorld[];
  /** [where, text]: toasts, errors, steps, notifications and everything stored in the documents. */
  engineText: [string, string][];
  /** [where, text]: what the view helpers show for the final documents, for every viewer. */
  viewText: [string, string][];
}

function tickets(): LiveTestWorld {
  const t = new LiveTestWorld();
  // Events, trains and treks people add, and createEvent's refusals.
  const gala = t.addEvent(ANN, { title: "Spring Formal", notes: "Black tie. Doors at 7.", venue: "Huntsman Hall", namesChecked: true });
  const train = id(t, ANN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(t.now, 2, "06:00"), openUntil: wallAfter(t.now, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }, "train");
  id(t, BOB.userId, { type: "createEvent", kind: "trek", title: "Iceland Trek", club: "Nordic Club", start: wallAfter(t.now, 40, "08:00"), attend: "members", tiers: [{ label: "Spot", price: "1200" }] }, "trek");
  const base = { type: "createEvent", kind: "event", title: "Gala", club: "WGA", cat: "Parties", start: wallAfter(t.now, 10), tiers: [{ label: "GA", price: "40" }] };
  // Forms round 2: no ticket types is now an event's one implicit ticket type, so a refused face value stands in for it; a date that has
  // passed and a train's departure are refused in their own words too.
  for (const bad of [{ title: "x" }, { start: "soon" }, { tiers: [], face: "abc" }, { start: "2020-01-01" }, { kind: "party" }, { officialUrl: "ftp://x" }, { deadline: wallAfter(t.now, 12) },
    { kind: "train", title: "Northeast Regional", club: null, start: wallAfter(t.now, 0, "12:10"), tiers: [] }]) t.no(ANN.userId, { ...base, ...bad });
  const typo = t.addEvent(CAT, { title: "Sprng Formal" });
  t.no(ANN.userId, { type: "removeEvent", eventId: typo });
  t.ok(DAN.userId, { type: "joinAlert", eventId: typo, qty: 1, max: "" }); // private records never block removal: the alert is
  t.ok(EVE.userId, { type: "addHolding", eventId: typo, tier: "t1", qty: 1, paid: "40" }); // turned off and the ticket stays
  t.ok(CAT.userId, { type: "removeEvent", eventId: typo });
  t.no(CAT.userId, { type: "removeEvent", eventId: typo });
  t.no(CAT.userId, { type: "removeEvent", eventId: gala });

  // Holdings and listings.
  const h = id(t, ANN.userId, { type: "addHolding", eventId: gala, tier: "t1", qty: 3, paid: "40" }, "holding");
  t.no(ANN.userId, { type: "addHolding", eventId: gala, tier: "t1", qty: 1, paid: "40" });
  t.no(ANN.userId, { type: "list", holdingId: h, qty: 1, ask: "45", method: "name" });
  const l1 = id(t, ANN.userId, { type: "list", holdingId: h, qty: 1, ask: "35", method: "name", payHandle: "@ann-lee", note: "Can't make it after all." }, "L1");
  const l2 = id(t, ANN.userId, { type: "list", holdingId: h, qty: 2, ask: "38", method: "name", obo: true, minOffer: "25", payHandle: "@ann-lee" }, "L2");
  t.no(ANN.userId, { type: "addThen", add: { eventId: train, tier: "t1", qty: 1, paid: "89" }, then: { type: "withdraw" } });
  const lt = id(t, ANN.userId, { type: "addThen", add: { eventId: train, tier: "t1", qty: 1, paid: "89" }, then: { type: "list", qty: 1, ask: "80", method: "file", file: null, departsAt: wallAfter(t.now, 3, "14:11"), payHandle: "@ann-lee" } }, "train listing");

  // The core flow, each step also refused once.
  t.no(ANN.userId, { type: "take", listingId: l1, qty: 1, amount: "", msg: "", member: false });
  const r1 = t.take(BOB, l1);
  t.no(ANN.userId, { type: "markPaid", requestId: r1 });
  t.ok(BOB.userId, { type: "markPaid", requestId: r1 });
  t.no(BOB.userId, { type: "confirmPayment", requestId: r1 });
  t.ok(ANN.userId, { type: "confirmPayment", requestId: r1 });
  t.no(BOB.userId, { type: "markTransferred", requestId: r1 });
  t.ok(ANN.userId, { type: "markTransferred", requestId: r1 });
  t.no(ANN.userId, { type: "buyerReceived", requestId: r1 });
  t.ok(BOB.userId, { type: "buyerReceived", requestId: r1 });
  // Each step pressed again from a tab that hadn't caught up (journey review F2).
  t.no(BOB.userId, { type: "markPaid", requestId: r1 });
  t.no(ANN.userId, { type: "confirmPayment", requestId: r1 });
  t.no(ANN.userId, { type: "markTransferred", requestId: r1 });
  t.no(BOB.userId, { type: "buyerReceived", requestId: r1 });
  t.no(BOB.userId, { type: "reportProblem", kind: "ticket", id: r1, reason: "It rained" });
  t.ok(BOB.userId, { type: "reportProblem", kind: "ticket", id: r1, reason: "The ticket didn't work" });
  t.no(ANN.userId, { type: "resolveProblem", kind: "ticket", id: r1 });
  t.ok(BOB.userId, { type: "resolveProblem", kind: "ticket", id: r1 });

  // Offers: counter and answer, accept, decline, and an offer closed when another buyer gets the last ticket.
  t.no(CAT.userId, { type: "offer", listingId: l2, qty: 1, amount: "40", msg: "", member: false });
  const o1 = id(t, CAT.userId, { type: "offer", listingId: l2, qty: 1, amount: "30", msg: "Would $30 work?", member: false }, "offer 1");
  t.no(ANN.userId, { type: "counter", requestId: o1, amount: "39" });
  t.ok(ANN.userId, { type: "counter", requestId: o1, amount: "34" });
  t.no(ANN.userId, { type: "respond", requestId: o1, accept: true });
  t.ok(CAT.userId, { type: "respond", requestId: o1, accept: true, member: false });
  const o3 = id(t, EVE.userId, { type: "offer", listingId: l2, qty: 1, amount: "31", msg: "", member: false }, "offer 3");
  t.ok(ANN.userId, { type: "decline", requestId: o3 });
  t.no(ANN.userId, { type: "decline", requestId: o3 });
  const o2 = id(t, DAN.userId, { type: "offer", listingId: l2, qty: 1, amount: "32", msg: "", member: false }, "offer 2");
  id(t, BOB.userId, { type: "offer", listingId: l2, qty: 1, amount: "29", msg: "", member: false }, "offer 4");
  t.no(BOB.userId, { type: "accept", requestId: o2 });
  t.ok(ANN.userId, { type: "accept", requestId: o2 }); // the last ticket: Bob's offer is closed
  t.no(ANN.userId, { type: "cancel", requestId: o1 });
  t.ok(CAT.userId, { type: "cancel", requestId: o1 });
  t.no(BOB.userId, { type: "release", requestId: o2 });
  t.ok(ANN.userId, { type: "release", requestId: o2 });

  // The disputed Paid: the buyer cancels one; the seller releases another after the wait.
  const d1 = t.take(EVE, l2);
  t.ok(EVE.userId, { type: "markPaid", requestId: d1 });
  t.no(EVE.userId, { type: "paymentMissing", requestId: d1 });
  t.ok(ANN.userId, { type: "paymentMissing", requestId: d1 });
  t.ok(EVE.userId, { type: "cancel", requestId: d1 });
  t.no(ANN.userId, { type: "confirmPayment", requestId: d1 }); // a stale "Payment received" on a reservation that has closed (F2)
  const d2 = t.take(DAN, l2);
  t.ok(DAN.userId, { type: "markPaid", requestId: d2 });
  t.ok(ANN.userId, { type: "paymentMissing", requestId: d2 });
  t.no(ANN.userId, { type: "release", requestId: d2 });
  t.advance(25 * HOUR);
  t.ok(ANN.userId, { type: "release", requestId: d2 });
  t.no(ANN.userId, { type: "release", requestId: d2 });

  // The ticket-file method: the seller sends the PDF or QR code.
  const rt = t.take(BOB, lt);
  t.ok(BOB.userId, { type: "markPaid", requestId: rt });
  t.ok(ANN.userId, { type: "confirmPayment", requestId: rt });
  t.ok(ANN.userId, { type: "markTransferred", requestId: rt });
  t.ok(BOB.userId, { type: "buyerReceived", requestId: rt });

  // Public requests, private alerts, shares and held replies.
  t.no(BOB.userId, { type: "saveInterest", data: { eventId: "__none", qty: 1, budget: "30", note: "", expires: dateAfter(t.now, 3) } });
  t.no(BOB.userId, { type: "saveInterest", data: { eventId: gala, qty: 1, budget: "50", note: "", expires: dateAfter(t.now, 3) } });
  const iso = id(t, DAN.userId, { type: "saveInterest", data: { eventId: gala, qty: 2, budget: "40", note: "Two together, please.", expires: dateAfter(t.now, 3) } }, "request");
  t.no(CAT.userId, { type: "joinAlert", eventId: gala, qty: 1, max: "99" });
  const alert = id(t, CAT.userId, { type: "joinAlert", eventId: gala, qty: 1, max: "37" }, "alert");
  t.no(BOB.userId, { type: "setAlert", id: alert, paused: true });
  t.ok(CAT.userId, { type: "setAlert", id: alert, paused: true });
  t.ok(CAT.userId, { type: "setAlert", id: alert, paused: false });
  const h2 = id(t, EVE.userId, { type: "addHolding", eventId: gala, tier: "t1", qty: 3, paid: "40" }, "Eve's holding");
  const l3 = id(t, EVE.userId, { type: "list", holdingId: h2, qty: 1, ask: "36", method: "name", payHandle: "@eve-park" }, "L3"); // reaches the request and the alert
  t.no(ANN.userId, { type: "shareListing", isoId: iso, listingId: l3 });
  const share = id(t, EVE.userId, { type: "shareListing", isoId: iso, listingId: l3 }, "share");
  t.ok(EVE.userId, { type: "withdrawShare", id: share });
  t.no(EVE.userId, { type: "withdrawShare", id: share });
  t.no(BOB.userId, { type: "isoReply", isoId: iso, holdingId: h2, qty: 1, counter: false, price: "", method: "name", namesChecked: true, file: null, payHandle: "@bob", note: "", membersOnly: false });
  const held = id(t, EVE.userId, { type: "isoReply", isoId: iso, holdingId: h2, qty: 1, counter: false, price: "", method: "name", namesChecked: true, file: null, payHandle: "@eve-park", note: "Got one for you.", membersOnly: false }, "held reply");
  t.ok(DAN.userId, { type: "respond", requestId: held, accept: false });
  t.ok(DAN.userId, { type: "closeInterest", id: iso, reason: "cancelled" });
  t.no(DAN.userId, { type: "closeInterest", id: iso });

  // §3.7: a requester over the per-person limit hears it when answering the reply (review P3), and a buyer who already holds an
  // unpaid reservation can't have an offer accepted.
  t.ok(CAT.userId, { type: "addHolding", eventId: gala, tier: "t1", qty: 3, paid: "40" }); // Cat's private holding of 3
  const iso2 = id(t, CAT.userId, { type: "saveInterest", data: { eventId: gala, qty: 2, budget: "35", note: "", expires: dateAfter(t.now, 4) } }, "Cat's request");
  const held2 = id(t, EVE.userId, { type: "isoReply", isoId: iso2, holdingId: h2, qty: 2, counter: false, price: "", method: "name", namesChecked: true, file: null, payHandle: "@eve-park", note: "", membersOnly: false }, "held reply 2");
  t.no(CAT.userId, { type: "respond", requestId: held2, accept: true, member: false });
  t.ok(CAT.userId, { type: "respond", requestId: held2, accept: false });
  const o5 = id(t, DAN.userId, { type: "offer", listingId: l2, qty: 1, amount: "30", msg: "", member: false }, "offer 5");
  t.take(DAN, l3);
  t.no(ANN.userId, { type: "accept", requestId: o5 });

  // seq: list, then share (the optional share doesn't fit), and a malformed one.
  t.ok(EVE.userId, { type: "seq", steps: [{ action: { type: "list", holdingId: h2, qty: 1, ask: "40", method: "name", payHandle: "@eve-park" } }, { action: { type: "shareListing", isoId: iso2, listingId: "@0" }, optional: true }] });
  t.no(EVE.userId, { type: "seq", steps: [] });
  t.no(EVE.userId, { type: "seq", steps: [{ action: { type: "list", holdingId: h2, qty: 1, ask: "40", method: "name", payHandle: "@eve-park" } }, { action: { type: "shareListing", isoId: iso2, listingId: "@0" } }] });

  // The seller edits, pauses and resumes a listing with an open offer on it (Dan's $30): each refused, and accepted, at least once.
  t.no(BOB.userId, { type: "editListing", listingId: l2, ask: "36" }); // not Bob's
  t.no(ANN.userId, { type: "editListing", listingId: l2, ask: "30" }); // down to Dan's open offer
  t.ok(ANN.userId, { type: "editListing", listingId: l2, ask: "36", note: "Two seats together." });
  t.no(ANN.userId, { type: "editListing", listingId: l2, ask: "36", note: "Two seats together." }); // nothing changed
  t.no(BOB.userId, { type: "pauseListing", listingId: l2 });
  t.ok(ANN.userId, { type: "pauseListing", listingId: l2 }); // Dan hears his offer stays open
  t.no(ANN.userId, { type: "pauseListing", listingId: l2 });
  t.no(CAT.userId, { type: "take", listingId: l2, qty: 1, amount: "", msg: "", member: false });
  t.no(ANN.userId, { type: "accept", requestId: o5 });
  t.no(BOB.userId, { type: "resumeListing", listingId: l2 });
  t.ok(ANN.userId, { type: "resumeListing", listingId: l2 });
  t.no(ANN.userId, { type: "resumeListing", listingId: l2 });

  // Withdrawing a listing with an open offer on it.
  t.no(BOB.userId, { type: "withdraw", listingId: l2 });
  t.ok(ANN.userId, { type: "withdraw", listingId: l2 });

  // One-form Sell (§9l): Post ticket for a new event (its toast), the same event again (the twin's refusal), a bundle whose listing is
  // refused (nothing kept), and a ticket posted on the event that's there (the listing's own toast).
  const mixer = { kind: "event", title: "Rooftop Mixer", start: dateAfter(t.now, 12), face: "40" };
  t.ok(DAN.userId, { type: "postTicket", event: mixer, qty: 1, ask: "35", method: "file" });
  t.no(BOB.userId, { type: "postTicket", event: mixer, qty: 1, ask: "30", method: "file" });
  t.no(BOB.userId, { type: "postTicket", event: { ...mixer, title: "Rooftop Brunch" }, qty: 1, ask: "45", method: "file" });
  t.ok(BOB.userId, { type: "postTicket", eventId: must(t.doc.events.find((e) => e.title === "Rooftop Mixer"), "the mixer").id, qty: 1, ask: "30", method: "app" });

  // The server's sweep after offers, holds and requests lapse; a client can't sweep.
  t.no(ANN.userId, { type: "sweep" });
  t.advance(3 * DAY);
  t.sweep();

  // Every type a live world refuses.
  for (const type of REFUSED) t.no(BOB.userId, { type, requestId: r1, listingId: l1, eventId: gala, id: r1, hours: 1, policy: "official", outcome: "uphold", kind: "ticket", side: "buyer", email: true, at: t.now, data: { title: "A party", when: "2026-12-01" } });
  return t;
}

function goods(): LiveTestWorld {
  const g = new LiveTestWorld();
  g.no(ANN.userId, { type: "postItem", data: { title: "Desk lamp", cat: "Home & kitchen", cond: "Good", price: "10", area: "Fishtown", until: dateAfter(g.now, 5), photos: ["data:image/png;base64,iVBORw0KGgo="] } });
  const chair = g.postItem(ANN, { title: "Desk chair", obo: true, minOffer: "20", note: "Barely used." });
  const shelf = g.postItem(ANN, { title: "Bookshelf", price: "25" });
  const fridge = g.postItem(BOB, { title: "Mini fridge", cat: "Home & kitchen", price: "40" });
  g.no(ANN.userId, { type: "requestItem", id: chair, msg: "" });
  const g1 = id(g, DAN.userId, { type: "requestItem", id: chair, offer: "25", msg: "Can pick up Friday.", shareContact: false }, "G1");
  id(g, EVE.userId, { type: "requestItem", id: chair, msg: "", shareContact: true }, "G2");
  g.no(DAN.userId, { type: "acceptItemReq", id: g1, shareContact: true });
  g.ok(ANN.userId, { type: "acceptItemReq", id: g1, shareContact: true });
  g.no(ANN.userId, { type: "setPickup", id: g1, at: wallAfter(g.now, -1) });
  g.ok(DAN.userId, { type: "setPickup", id: g1, at: wallAfter(g.now, 2, "17:00") });
  g.ok(DAN.userId, { type: "itemConsent", id: g1, side: "buyer" });
  g.no(DAN.userId, { type: "itemConsent", id: g1, side: "buyer" });
  g.no(ANN.userId, { type: "itemPickedUp", id: g1 });
  g.ok(DAN.userId, { type: "itemPickedUp", id: g1 });
  const g3 = id(g, CAT.userId, { type: "requestItem", id: shelf, msg: "" }, "G3");
  g.no(CAT.userId, { type: "declineItemReq", id: g3 });
  g.ok(ANN.userId, { type: "declineItemReq", id: g3 });
  const g4 = id(g, CAT.userId, { type: "requestItem", id: shelf, msg: "" }, "G4");
  g.ok(ANN.userId, { type: "acceptItemReq", id: g4, shareContact: true });
  g.no(CAT.userId, { type: "releaseItemReq", id: g4 });
  g.ok(ANN.userId, { type: "releaseItemReq", id: g4 });
  const g5 = id(g, EVE.userId, { type: "requestItem", id: shelf, msg: "" }, "G5");
  g.no(ANN.userId, { type: "cancelItemReq", id: g5 });
  g.ok(EVE.userId, { type: "cancelItemReq", id: g5 });
  const g6 = id(g, DAN.userId, { type: "requestItem", id: fridge, msg: "" }, "G6");
  g.ok(BOB.userId, { type: "acceptItemReq", id: g6, shareContact: true });
  g.no(BOB.userId, { type: "withdrawItem", id: fridge });
  g.ok(ANN.userId, { type: "withdrawItem", id: shelf });
  const wanted = id(g, EVE.userId, { type: "saveInterest", data: { goods: { title: "Mini fridge", cat: "Home & kitchen" }, qty: 1, budget: "45", note: "", expires: dateAfter(g.now, 10) } }, "goods request");
  g.no(BOB.userId, { type: "shareItem", isoId: wanted, itemId: fridge });
  const small = g.postItem(CAT, { title: "Compact mini fridge", cat: "Home & kitchen", price: "30" }); // Eve hears about it
  g.ok(CAT.userId, { type: "shareItem", isoId: wanted, itemId: small });
  id(g, EVE.userId, { type: "requestItem", id: fridge, msg: "" }, "G7"); // a backup while Dan holds it
  // The seller edits, pauses and resumes an item with an open offer on it (Cat's $10).
  const lamp = g.postItem(ANN, { title: "Reading lamp", cat: "Home & kitchen", price: "15", obo: true, minOffer: "8" });
  const g8 = id(g, CAT.userId, { type: "requestItem", id: lamp, offer: "10", msg: "" }, "G8");
  g.no(BOB.userId, { type: "editItem", id: lamp, price: "12" }); // not Bob's
  g.no(ANN.userId, { type: "editItem", id: lamp, price: "10" }); // down to Cat's open offer
  g.ok(ANN.userId, { type: "editItem", id: lamp, price: "12", note: "LED bulb included." });
  g.no(BOB.userId, { type: "pauseItem", id: lamp });
  g.ok(ANN.userId, { type: "pauseItem", id: lamp }); // Cat hears her offer stays open
  g.no(ANN.userId, { type: "pauseItem", id: lamp });
  g.no(DAN.userId, { type: "requestItem", id: lamp, msg: "" });
  g.no(ANN.userId, { type: "acceptItemReq", id: g8, shareContact: true });
  g.no(BOB.userId, { type: "resumeItem", id: lamp });
  g.ok(ANN.userId, { type: "resumeItem", id: lamp });
  g.no(ANN.userId, { type: "resumeItem", id: lamp });
  // §9s item 6: the seller adds, replaces and removes the item's one photo. `pic` is the server's reference to the image it accepted
  // (the store puts it there; the bytes are in its own table): each of the two actions refused, and accepted, at least once.
  const PIC = { v: "0123456789abcdef", w: 1280, h: 960 };
  g.no(BOB.userId, { type: "setItemPhoto", id: lamp, pic: PIC }); // not Bob's
  g.no(ANN.userId, { type: "setItemPhoto", id: lamp }); // no image came with it
  g.ok(ANN.userId, { type: "setItemPhoto", id: lamp, pic: PIC });
  g.no(ANN.userId, { type: "setItemPhoto", id: lamp, pic: PIC }); // the photo it already has
  g.ok(ANN.userId, { type: "setItemPhoto", id: lamp, pic: { ...PIC, v: "fedcba9876543210" } }); // replaced
  g.no(BOB.userId, { type: "removeItemPhoto", id: lamp });
  g.ok(ANN.userId, { type: "removeItemPhoto", id: lamp });
  g.no(ANN.userId, { type: "removeItemPhoto", id: lamp }); // none left
  g.ok(ANN.userId, { type: "acceptItemReq", id: g8, shareContact: true });
  g.advance(3 * DAY);
  g.sweep(); // Dan's hold lapses; Eve's backup is active again
  g.advance(3 * DAY);
  g.sweep(); // nobody answered Eve in 48 hours
  return g;
}

/**
 * Invite to pay (follow-on B5): a request to buy, an invitation (also to a public request's poster, alone and as a seq step), a
 * reservation and its release, each accepted and refused; a partial quantity; the last ticket between invited buyers; a price change, a
 * pause, a resume and a close with requests and invitations open; the lapses; a late payment report. Then, switched on as step S3
 * switches it (test-only here), the old ways in ("I'll take it", an offer, a held reply) refused, a share's words, and a listing posted
 * without a way to be paid, whose seller is asked for one at the first invitation.
 */
function inviteToPay(): LiveTestWorld {
  const v = new LiveTestWorld();
  const ask = (listingId: string, qty = 1, amount = "", msg = "") => ({ type: "requestToBuy", listingId, qty, amount, msg, member: false });
  const reserve = (requestId: string) => ({ type: "reserve", requestId, member: false });

  // A listing of three. Requests to buy: refused for the seller, over the quantity, with an offer at the price or under the floor.
  const gala = v.addEvent(ANN, { title: "Winter Gala" });
  const l = v.listTickets(ANN, gala, { qty: 3, obo: true, minOffer: "25" });
  v.no(ANN.userId, ask(l));
  v.no(BOB.userId, ask(l, 4));
  v.no(BOB.userId, ask(l, 1, "35"));
  v.no(BOB.userId, ask(l, 1, "20"));
  const bob = id(v, BOB.userId, ask(l, 3, "", "All three, if you can."), "Bob's request to buy");
  v.no(BOB.userId, ask(l)); // already asked
  // The old answers don't fit it, and it can't be reserved before the seller invites.
  v.no(ANN.userId, { type: "accept", requestId: bob });
  v.no(ANN.userId, { type: "counter", requestId: bob, amount: "34" });
  v.no(BOB.userId, { type: "respond", requestId: bob, accept: true, member: false });
  v.no(BOB.userId, reserve(bob));
  v.no(BOB.userId, { type: "invite", requestId: bob }); // only the seller invites
  v.no(DAN.userId, { type: "invite", requestId: bob }); // a stranger
  // Cat asks with an offer, is invited at it (never under it) and reserves: nothing was held until now.
  const cat = id(v, CAT.userId, ask(l, 1, "30", "Would $30 work?"), "Cat's request with an offer");
  v.no(ANN.userId, { type: "invite", requestId: cat, price: "28" });
  v.ok(ANN.userId, { type: "invite", requestId: cat });
  v.no(ANN.userId, { type: "invite", requestId: cat }); // already invited
  v.no(CAT.userId, ask(l)); // already invited
  v.ok(CAT.userId, reserve(cat));
  v.no(CAT.userId, reserve(cat)); // a second tap
  // Two are left and Bob asked for three: the seller chooses how many, at the asking price or less.
  v.no(ANN.userId, { type: "invite", requestId: bob });
  v.no(ANN.userId, { type: "invite", requestId: bob, qty: 3 });
  v.no(ANN.userId, { type: "invite", requestId: bob, qty: 2, price: "40" });
  v.ok(ANN.userId, { type: "invite", requestId: bob, qty: 2 });
  v.ok(BOB.userId, reserve(bob));
  // While it's reserved the seller can't decline or release it, and nobody can ask for what isn't there. The buyer can let it go.
  v.no(ANN.userId, { type: "decline", requestId: bob });
  v.no(ANN.userId, { type: "release", requestId: bob });
  v.no(DAN.userId, ask(l));
  v.no(ANN.userId, { type: "cancel", requestId: bob });
  v.ok(BOB.userId, { type: "cancel", requestId: bob });
  v.no(BOB.userId, reserve(bob)); // released
  // Cat's goes through the steps every reservation does.
  v.ok(CAT.userId, { type: "markPaid", requestId: cat });
  v.ok(ANN.userId, { type: "confirmPayment", requestId: cat });
  v.ok(ANN.userId, { type: "markTransferred", requestId: cat });
  v.ok(CAT.userId, { type: "buyerReceived", requestId: cat });
  // Bob again, for one, paid: it can't be declined or cancelled any more.
  const bob2 = id(v, BOB.userId, ask(l), "Bob's second request");
  v.ok(ANN.userId, { type: "invite", requestId: bob2 });
  v.ok(BOB.userId, reserve(bob2));
  v.ok(BOB.userId, { type: "markPaid", requestId: bob2 });
  v.no(ANN.userId, { type: "decline", requestId: bob2 });
  v.no(BOB.userId, { type: "cancel", requestId: bob2 });
  // The last ticket: Dan and Eve are both invited, Cat has asked. Dan reserves it; Eve can't, and Cat can't be invited, meanwhile.
  const dan = id(v, DAN.userId, ask(l), "Dan's request");
  const eve = id(v, EVE.userId, ask(l, 1, "28"), "Eve's request with an offer");
  const cat2 = id(v, CAT.userId, ask(l), "Cat's second request");
  v.ok(ANN.userId, { type: "invite", requestId: dan });
  v.ok(ANN.userId, { type: "invite", requestId: eve });
  v.ok(DAN.userId, reserve(dan));
  v.no(EVE.userId, reserve(eve));
  v.no(ANN.userId, { type: "invite", requestId: cat2 });
  // Dan lets it go: Eve hears it's back. Dan is invited again; Eve reserves and pays, and what can't be covered any more closes.
  v.ok(DAN.userId, { type: "cancel", requestId: dan });
  const dan2 = id(v, DAN.userId, ask(l), "Dan's second request");
  v.ok(ANN.userId, { type: "invite", requestId: dan2 });
  v.ok(EVE.userId, reserve(eve));
  v.ok(EVE.userId, { type: "markPaid", requestId: eve });
  v.no(DAN.userId, reserve(dan2)); // another buyer bought it first
  v.no(ANN.userId, { type: "invite", requestId: cat2 }); // closed

  // A price change, a pause, a resume and a close with a request to buy and an invitation open.
  const mixer = v.addEvent(ANN, { title: "Spring Mixer" });
  const l2 = v.listTickets(ANN, mixer, { qty: 2, obo: true });
  const c = id(v, CAT.userId, ask(l2, 1, "30"), "Cat's offer on the second listing");
  v.no(ANN.userId, { type: "editListing", listingId: l2, ask: "28" }); // under the open offer
  const d = id(v, DAN.userId, ask(l2), "Dan's request on the second listing");
  v.ok(ANN.userId, { type: "invite", requestId: d });
  v.no(ANN.userId, { type: "editListing", listingId: l2, ask: "32" }); // under the invitation
  v.ok(ANN.userId, { type: "pauseListing", listingId: l2 });
  v.no(ANN.userId, { type: "invite", requestId: c });
  v.no(DAN.userId, reserve(d));
  v.no(EVE.userId, ask(l2));
  v.ok(ANN.userId, { type: "resumeListing", listingId: l2 });
  // Declined by the seller, withdrawn by the seller, withdrawn by the buyer, declined by the buyer.
  v.ok(ANN.userId, { type: "decline", requestId: c });
  v.ok(ANN.userId, { type: "decline", requestId: d });
  v.no(ANN.userId, { type: "decline", requestId: d });
  v.no(CAT.userId, reserve(c));
  v.no(DAN.userId, reserve(d));
  const e = id(v, EVE.userId, ask(l2), "Eve's request on the second listing");
  const b = id(v, BOB.userId, ask(l2), "Bob's request on the second listing");
  v.ok(ANN.userId, { type: "invite", requestId: b });
  v.ok(EVE.userId, { type: "cancel", requestId: e });
  v.ok(BOB.userId, { type: "cancel", requestId: b });
  v.no(EVE.userId, reserve(e));
  v.no(BOB.userId, reserve(b));
  id(v, CAT.userId, ask(l2), "Cat's second request on the second listing");
  const d2 = id(v, DAN.userId, ask(l2), "Dan's second request on the second listing");
  v.ok(ANN.userId, { type: "invite", requestId: d2 });
  v.ok(ANN.userId, { type: "withdraw", listingId: l2 }); // both close
  v.no(DAN.userId, reserve(d2));
  v.no(EVE.userId, ask(l2));

  // Lapses: a reservation left unpaid, then its buyer says they paid after it ended; a request and an invitation nobody answered.
  const ball = v.addEvent(ANN, { title: "Fall Ball" });
  const l3 = v.listTickets(ANN, ball, { qty: 1 });
  const e3 = id(v, EVE.userId, ask(l3), "Eve's request for the Fall Ball");
  const b3 = id(v, BOB.userId, ask(l3), "Bob's request for the Fall Ball");
  const c3 = id(v, CAT.userId, ask(l3), "Cat's request for the Fall Ball");
  v.ok(ANN.userId, { type: "invite", requestId: b3 });
  v.ok(ANN.userId, { type: "invite", requestId: c3 });
  v.ok(CAT.userId, reserve(c3));
  v.no(EVE.userId, { type: "reportProblem", kind: "ticket", id: e3, reason: E.LATE_PAYMENT }); // nothing was ever reserved
  v.advance(20 * MIN);
  v.sweep(); // Cat's reservation ends unpaid; Bob hears the ticket is back
  v.no(CAT.userId, reserve(c3));
  v.ok(CAT.userId, { type: "reportProblem", kind: "ticket", id: c3, reason: E.LATE_PAYMENT });
  v.no(CAT.userId, { type: "reportProblem", kind: "ticket", id: c3, reason: E.LATE_PAYMENT });
  v.ok(CAT.userId, { type: "resolveProblem", kind: "ticket", id: c3 });
  v.advance(7 * HOUR);
  v.sweep(); // Eve's request and Bob's invitation end
  v.no(BOB.userId, reserve(b3));
  v.no(EVE.userId, reserve(e3));
  v.no(ANN.userId, { type: "invite", requestId: e3 });

  // A public request's poster invited from a listing that stays open to everyone; then listed and invited in one change.
  const social = v.addEvent(ANN, { title: "Summer Social" });
  const iso = v.requestFor(DAN, social, { note: "One, please." });
  const l4 = v.listTickets(ANN, social, { qty: 2 });
  v.no(BOB.userId, { type: "inviteRequester", isoId: iso, listingId: l4, qty: 1 }); // not Bob's listing
  v.no(ANN.userId, { type: "inviteRequester", isoId: iso, listingId: l4, qty: 2 }); // Dan asked for one
  v.no(ANN.userId, { type: "inviteRequester", isoId: iso, listingId: l4, qty: 1, price: "40" });
  const rd = id(v, ANN.userId, { type: "inviteRequester", isoId: iso, listingId: l4, qty: 1 }, "Dan's invitation");
  v.no(ANN.userId, { type: "inviteRequester", isoId: iso, listingId: l4, qty: 1 }); // already invited
  v.ok(DAN.userId, reserve(rd));
  const picnic = v.addEvent(ANN, { title: "Class Picnic" });
  const eveIso = v.requestFor(EVE, picnic);
  const h = id(v, ANN.userId, { type: "addHolding", eventId: picnic, tier: "t1", qty: 1, paid: "40" }, "Ann's picnic ticket");
  v.ok(ANN.userId, { type: "seq", steps: [{ action: { type: "list", holdingId: h, qty: 1, ask: "35", method: "name", payHandle: "@ann-lee" } }, { action: { type: "inviteRequester", isoId: eveIso, listingId: "@0", qty: 1 }, optional: true }] });

  // Switched on, as step S3 switches it: the old ways in are refused with where to go instead; a share says "ask to buy it"; and a
  // listing can be posted without a way to be paid, which the first invitation then asks for.
  E.setInviteSwitch(true);
  try {
    const bobIso = v.requestFor(BOB, social);
    v.no(BOB.userId, { type: "take", listingId: l4, qty: 1, amount: "", msg: "", member: false });
    v.no(BOB.userId, { type: "offer", listingId: l4, qty: 1, amount: "30", msg: "", member: false });
    const h2 = id(v, EVE.userId, { type: "addHolding", eventId: social, tier: "t1", qty: 1, paid: "40" }, "Eve's social ticket");
    v.no(EVE.userId, { type: "isoReply", isoId: bobIso, holdingId: h2, qty: 1, counter: false, price: "", method: "name", namesChecked: true, file: null, payHandle: "@eve-park", note: "", membersOnly: false });
    v.ok(ANN.userId, { type: "shareListing", isoId: bobIso, listingId: l4 });
    const h3 = id(v, CAT.userId, { type: "addHolding", eventId: social, tier: "t1", qty: 1, paid: "40" }, "Cat's social ticket");
    const l5 = id(v, CAT.userId, { type: "list", holdingId: h3, qty: 1, ask: "35", method: "name" }, "Cat's listing, with no way to be paid yet");
    const wants = id(v, BOB.userId, ask(l5), "Bob's request to Cat");
    v.no(CAT.userId, { type: "invite", requestId: wants }); // a way to be paid first

    // The Sell and Request follow-up (§9m, §9n). Post request: a new event made with its request (its toast), the same event again (the
    // twin's refusal, in a buyer's words), a bundle whose request is refused (nothing kept), and a request on the event that's there.
    // Then Post ticket with no transfer method and no quantity, and an exchange on it from asking to "Received": the toasts,
    // notifications and history lines of a listing that promises no method are in the audit too.
    const oysters = { kind: "event", title: "Oysters", start: dateAfter(v.now, 12) };
    v.ok(DAN.userId, { type: "postRequest", event: oysters });
    v.no(EVE.userId, { type: "postRequest", event: oysters });
    v.no(EVE.userId, { type: "postRequest", event: { ...oysters, title: "Clambake" }, budget: "lots" });
    const oystersId = must(v.doc.events.find((e) => e.title === "Oysters"), "the oysters event").id;
    v.ok(EVE.userId, { type: "postRequest", eventId: oystersId, qty: 2 });
    const plain = id(v, BOB.userId, { type: "postTicket", eventId: oystersId, ask: "30" }, "Bob's ticket, with no transfer method");
    const fromDan = id(v, DAN.userId, ask(plain), "Dan's request to Bob");
    v.ok(BOB.userId, { type: "invite", requestId: fromDan });
    v.ok(DAN.userId, reserve(fromDan));
    v.ok(DAN.userId, { type: "markPaid", requestId: fromDan });
    v.ok(BOB.userId, { type: "confirmPayment", requestId: fromDan });
    v.ok(BOB.userId, { type: "markTransferred", requestId: fromDan });
    v.ok(DAN.userId, { type: "buyerReceived", requestId: fromDan });

    // "I have this" in one submission (§9v item 2, SELL5-M3): a ticket listed for a request and its poster invited; the same answer again
    // (one listing: refused); a request that closed before the answer applied (listed, no invitation, said so); an invitation from a
    // listing the seller already has.
    const fair = v.addEvent(CAT, { title: "Spring Fair" }); // (Ann has added the five events a day allows)
    const danIso = v.requestFor(DAN, fair);
    v.ok(BOB.userId, { type: "answerRequest", isoId: danIso, ask: "30", note: "", obo: false });
    v.no(BOB.userId, { type: "answerRequest", isoId: danIso, ask: "30", note: "", obo: false });
    const eveFair = v.requestFor(EVE, fair);
    v.ok(EVE.userId, { type: "closeInterest", id: eveFair, reason: "cancelled" });
    v.ok(DAN.userId, { type: "answerRequest", isoId: eveFair, ask: "28", note: "", obo: false });
    v.ok(ANN.userId, { type: "answerRequest", isoId: bobIso, listingId: l4, qty: 1, price: "" });
  } finally {
    E.setInviteSwitch(null);
  }
  return v;
}

/** What the view helpers show, for every viewer, in every state a world went through (each at its own time). */
function viewText(w: LiveTestWorld, label: string, out: [string, string][]): void {
  w.outcomes.forEach((o, n) => {
    if (o.res.error === undefined) E.withEngine({ doc: o.res.state, people: w.people, now: o.now }, () => helperText(o.res.state, (where, v) => strings(v, `${label} ${where} @${n}`, out)));
  });
}
/** The helpers' words for one state (inside withEngine, which installed it). */
function helperText(doc: LiveWorld, add: (where: string, v: unknown) => void): void {
  for (const ev of E.EVENTS) {
    add(`event ${ev.title}`, [ev.policyNote, ev.blurb, ev.path, ev.payment, ev.statusNote, ev.sourcesNote, ev.tag, E.POLICY[ev.policy], E.transferTag(ev), E.access(ev), E.fmtRange(ev)]);
    for (const t of ev.tiers ?? []) add(`tier ${t.label}`, [t.src, E.priceBasis(t.src)]);
    for (const who of EVERYONE) {
      const sum = E.eventSummary(doc, ev, who.userId);
      add(`summary ${ev.title} for ${who.name}`, [sum.state, E.priceParts(ev, sum)]);
    }
  }
  // (SELL5-M1: share messages left this audit with outward Share, §9v item 3: the shared market builds none.)
  for (const l of doc.listings) add(`listing ${l.id}`, E.listingState(doc, l));
  for (const r of doc.requests) { const e = E.rState(r); add(`request ${r.id}`, [e, E.rStatus(r, e), E.myReqLabel(r)]); }
  for (const it of doc.goods) add(`item ${it.title}`, E.itemState(doc, it));
  for (const g of doc.goodsReqs) { const it = doc.goods.find((x) => x.id === g.itemId); if (it) add(`goods request ${g.id}`, E.gState(g, it)); }
  for (const h of doc.holdings) add(`holding ${h.id}`, E.SRC[h.source]);
  for (const who of EVERYONE) add(`needs action for ${who.name}`, E.needsAction(doc, who.userId).map((x) => x.why));
  add("clubs", E.CLUB_MENU.map((c) => c.label));
}

let corpus: Corpus;
beforeAll(() => {
  const worlds = [tickets(), goods(), inviteToPay()];
  const engineText: [string, string][] = [];
  worlds.forEach((w, k) => {
    w.outcomes.forEach((o, n) => strings({ toast: o.res.toast, error: o.res.error, steps: o.res.steps }, `world ${k} #${n} ${o.action.type}`, engineText));
    strings(w.notes.map((x) => x.text), `world ${k} notifications`, engineText);
    strings(w.doc, `world ${k} document`, engineText);
  });
  const vt: [string, string][] = [];
  worlds.forEach((w, k) => viewText(w, `world ${k}`, vt));
  corpus = { worlds, engineText, viewText: vt };
});

describe("the live copy audit", () => {
  it("covers every live type, accepted and refused, and every type a live world refuses", () => {
    const accepted = new Set<string>(); const refused = new Set<string>();
    for (const w of corpus.worlds) for (const o of w.outcomes) (o.res.error === undefined ? accepted : refused).add(String(o.action.type));
    expect(E.LIVE_TYPES.filter((t) => !accepted.has(t))).toEqual([]);
    expect(E.LIVE_TYPES.filter((t) => !refused.has(t))).toEqual([]);
    expect(REFUSED.filter((t) => !refused.has(t))).toEqual([]);
    // The view text covers every record in the final documents, and each viewer has had something to do.
    corpus.worlds.forEach((w, k) => {
      const covered = (prefix: string): boolean => corpus.viewText.some(([where]) => where.startsWith(`world ${k} ${prefix} `));
      const missing = [
        ...w.doc.events.filter((e) => !e.removedAt).map((e) => `event ${e.title}`), ...w.doc.listings.map((l) => `listing ${l.id}`),
        ...w.doc.requests.map((r) => `request ${r.id}`), ...w.doc.goods.map((it) => `item ${it.title}`), ...w.doc.goodsReqs.map((g) => `goods request ${g.id}`),
        ...w.doc.holdings.map((h) => `holding ${h.id}`),
      ].filter((prefix) => !covered(prefix));
      expect(missing, `world ${k}`).toEqual([]);
    });
    expect(EVERYONE.filter((p) => !corpus.viewText.some(([where]) => where.includes(` needs action for ${p.name} `))).map((p) => p.name)).toEqual([]);
  });

  it("no toast, error, notification, history line or reason reads as sample data or a simulation", () => {
    expect(corpus.engineText.filter(([, text]) => BANNED.test(text)).map(([where, text]) => `${where}: ${text}`)).toEqual([]);
  });

  it("nothing the view helpers show for live records does either", () => {
    expect(corpus.viewText.filter(([, text]) => BANNED.test(text)).map(([where, text]) => `${where}: ${text}`)).toEqual([]);
  });

  it('says "verified" only to say something isn\'t', () => {
    const claims = [...corpus.engineText, ...corpus.viewText].filter(([, text]) => {
      for (const m of text.matchAll(/\bverif\w*/gi)) if (!/(\bnot |\bisn't )$/i.test(text.slice(0, m.index))) return true;
      return false;
    });
    expect(claims.map(([where, text]) => `${where}: ${text}`)).toEqual([]);
  });

  it("records payments and transfers as what each person said (C-DESIGN §8.3)", () => {
    const history = corpus.engineText.filter(([where]) => /\.history\[\d+\]\.text$/.test(where)).map(([, text]) => text);
    for (const line of ["Buyer said they paid $35 (self-reported)", "Seller confirmed the payment arrived", "Seller asked Wharton Graduate Association to change the name (self-reported)",
      "Buyer confirmed they received it", "Seller says the payment hasn't arrived (Handoff can't see payments)", "Buyer withdrew after the seller said the payment didn't arrive",
      "Released by the seller: the payment didn't arrive", "Seller sent it (self-reported)"]) {
      expect(history, line).toContain(line);
    }
    expect(corpus.worlds[0]?.doc.holdings.filter((h) => h.source === "transferred").length).toBeGreaterThan(0);
  });
});
