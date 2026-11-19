// The input gate (C-DESIGN.md §3.3, §9.1; live.ts). parseAction admits exactly the pilot's action types, in the shapes the UI
// sends, unchanged; refuses everything else before the store takes a lock; and drops fields the engine doesn't read.
// - The allowlist is the engine's own list (LIVE_TYPES without the server's sweep), and every type has a schema.
// - What the UI sends (each call site in HandoffPrototype.jsx and C-CONTRACT.md §3) passes unchanged, and the engine then
//   accepts it: a scenario sends every live type through the server's path.
// - Refused: other types, more than 16 KB, photos, ticket files, unlisted-event requests, bad or prototype ids, characters the
//   database can't store, numbers that aren't finite whole numbers, dates that don't exist, malformed seq.
// - The corpus property: every action the engine accepted during runSelfTests, with preview ids mapped to live-shaped ones,
//   passes too, unchanged except for what live deliberately refuses (a ticket file, photos, an unlisted event) or drops (simulate).
// No database and no sign-in: labelled test accounts with made-up ids.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action } from "../../engine/index.js";
import { runSelfTests, seed } from "../../engine/preview.js";
import type { EnginePort } from "../engine-port.js";
import {
  FILE_ERROR, ID, INVALID_ACTION_ERROR, LIVE_ACTIONS, MAX_ACTION_BYTES, NOT_AVAILABLE_ERROR, PHOTOS_ERROR, SEQ_ERROR, SEQ_STEP_TYPES, TEXT_ERROR,
  TOO_LARGE_ERROR, UNLISTED_EVENT_ERROR, actionIds, parseAction, type IdKind, type LiveAction,
} from "../live.js";
import { ServerWorld, FAY, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, EVE, LiveTestWorld, type TestPerson, dateAfter, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

/** §3.2's "Refused in live" types (the reducer's cases outside LIVE_TYPES). */
const REFUSED = ["request", "sellerReport", "buyerReport", "consent", "orgApprove", "orgDecline", "orgConfirm", "setPolicy", "reviewMissing",
  "reviewProblem", "clock", "seen", "feedbackGiven", "markFeedSeen", "setAlertPrefs", "suggestEvent", "readNote", "readAll"];
const json = (v: unknown): string => JSON.stringify(v);
/** JSON with every object's keys sorted: zod writes keys in its schema's order, which says nothing about the content. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  : x));
/** Live-shaped ids for the tests' hand-made actions. */
const idFor = (kind: Exclude<IdKind, "tier">, seedText: string): string => {
  const hex = createHash("sha256").update(`${kind}:${seedText}`).digest("hex").slice(0, 16);
  return { event: "ev-", listing: "l", request: "r", holding: "h", iso: "iso-", item: "g", goodsReq: "gr", share: "rsp-" }[kind] + hex;
};
const L1 = idFor("listing", "1"), R1 = idFor("request", "1"), H1 = idFor("holding", "1"), EV1 = idFor("event", "1");
const ISO1 = idFor("iso", "1"), IT1 = idFor("item", "1"), GR1 = idFor("goodsReq", "1"), RSP1 = idFor("share", "1");
const ok = (raw: unknown): LiveAction => {
  const r = parseAction(raw);
  if (!r.ok) throw new Error(`parseAction refused ${json(raw).slice(0, 200)}: ${r.error} (${r.why})`);
  return r.action;
};
const refusal = (raw: unknown): { error: string; why: string } => {
  const r = parseAction(raw);
  if (r.ok) throw new Error(`parseAction accepted ${json(raw).slice(0, 200)}`);
  return { error: r.error, why: r.why };
};

afterEach(() => {
  E.setActionTap(null);
  E.setLiveClock(null);
  E.applyWorld(null);
});

// C5's real port takes these as they are (a compile-time check: this file doesn't type-check otherwise).
void (parseAction satisfies EnginePort["parse"]);
void (actionIds satisfies EnginePort["actionIds"]);

describe("the allowlist (LIVE_ACTIONS)", () => {
  it("is the engine's LIVE_TYPES without the server's sweep: 54 types, and the seq steps are the engine's", () => {
    expect([...LIVE_ACTIONS]).toEqual(E.LIVE_TYPES.filter((t) => t !== "sweep"));
    // 40, plus a seller's edit, pause and resume for listings and items, plus invite to pay's four (follow-on B5): requestToBuy, invite,
    // inviteRequester and reserve, placed after isoReply; plus Post ticket (one-form Sell, §9l): postTicket, placed after addThen; plus
    // Post request (one-form Request, §9m): postRequest, placed after postTicket; plus an item's photo (§9s item 6): setItemPhoto and
    // removeItemPhoto, placed after editItem, and neither a seq step; plus "I have this" in one submission (§9v item 2, SELL5-M3):
    // answerRequest, placed after reserve, never a seq step.
    expect(LIVE_ACTIONS).toHaveLength(55);
    expect(LIVE_ACTIONS[LIVE_ACTIONS.indexOf("reserve") + 1]).toBe("answerRequest");
    expect(SEQ_STEP_TYPES).not.toContain("answerRequest");
    expect(LIVE_ACTIONS.slice(LIVE_ACTIONS.indexOf("editItem") + 1, LIVE_ACTIONS.indexOf("editItem") + 3)).toEqual(["setItemPhoto", "removeItemPhoto"]);
    expect(SEQ_STEP_TYPES.filter((t) => ["setItemPhoto", "removeItemPhoto"].includes(t))).toEqual([]);
    expect(LIVE_ACTIONS[LIVE_ACTIONS.indexOf("addThen") + 1]).toBe("postTicket");
    expect(LIVE_ACTIONS[LIVE_ACTIONS.indexOf("postTicket") + 1]).toBe("postRequest");
    expect(SEQ_STEP_TYPES).not.toContain("postRequest"); // nothing follows a request: it's always sent by itself
    expect(SEQ_STEP_TYPES).toContain("postTicket"); // "post, then share with this request", as addThen is
    expect(LIVE_ACTIONS.slice(LIVE_ACTIONS.indexOf("isoReply") + 1, LIVE_ACTIONS.indexOf("isoReply") + 5)).toEqual(["requestToBuy", "invite", "inviteRequester", "reserve"]);
    expect(SEQ_STEP_TYPES).toContain("inviteRequester"); // after the step that lists the ticket; the other three are never seq steps
    expect(SEQ_STEP_TYPES.filter((t) => ["requestToBuy", "invite", "reserve"].includes(t))).toEqual([]);
    expect([...SEQ_STEP_TYPES]).toEqual([...E.SEQ_STEP_TYPES]);
    expect(Object.isFrozen(LIVE_ACTIONS)).toBe(true);
  });

  it("refuses every other type, the server's sweep, and anything that isn't an action, as not available", () => {
    for (const type of [...REFUSED, "sweep", "hack", "", "TAKE", "take ", "constructor", "__proto__", "toString"]) {
      expect(refusal({ type, requestId: R1, listingId: L1, id: R1, eventId: EV1 }).error, type).toBe(NOT_AVAILABLE_ERROR);
    }
    for (const raw of [null, undefined, 42, "take", [], [{ type: "take" }], { listingId: L1 }, { type: 5 }, { type: ["take"] }, Object.create({ type: "take", listingId: L1, qty: 1 })]) {
      expect(refusal(raw).error, json(raw) ?? String(raw)).toBe(NOT_AVAILABLE_ERROR);
    }
  });
});

/**
 * Every call site that sends an action (HandoffPrototype.jsx after phase B's merge, and C-CONTRACT.md §3 for the new live
 * forms), in the shape it sends, on the server's path: parseAction, then the engine. Each must pass parseAction unchanged.
 */
function uiScenario(): { w: ServerWorld; sent: { label: string; actor: TestPerson; action: Action; engine: "ok" | string }[] } {
  const w = new ServerWorld({ people: PEOPLE6 });
  const sent: { label: string; actor: TestPerson; action: Action; engine: "ok" | string }[] = [];
  const send = (label: string, actor: TestPerson, action: Action): string | undefined => {
    sent.push({ label, actor, action, engine: "ok" });
    return w.ok(actor.userId, action).id;
  };
  const sendRefused = (label: string, actor: TestPerson, action: Action, error: string): void => {
    sent.push({ label, actor, action, engine: error });
    expect(w.no(actor.userId, action), label).toBe(error);
  };
  const id = (v: string | undefined, what: string): string => { if (!v) throw new Error(`no id from ${what}`); return v; };
  const now = w.now;
  // Protocol 2 (follow-on B1): the Sell form and the held reply send no handle; buyers pay with the seller's profile methods.
  const listing = (o: Record<string, unknown>) => ({ type: "list", qty: 1, ask: "35", note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false, minOffer: undefined, departsAt: undefined, ...o });

  // EventForm (C-CONTRACT §3, Sell and Post a request): an event, an eTicket train, a trek; one removed again.
  const gala = id(send("EventForm: event", ANN, { type: "createEvent", kind: "event", title: "Spring Formal", club: "Wharton Graduate Association", cat: "Parties",
    start: wallAfter(now, 10), end: wallAfter(now, 10, "23:30"), venue: "Huntsman Hall", attend: "all", tiers: [{ label: "General admission", price: "40" }, { label: "VIP", price: "75" }],
    perPerson: 4, deadline: wallAfter(now, 9, "12:00"), namesChecked: false, officialUrl: "https://example.invalid/formal", notes: "Black tie.\nDoors at 7." }), "gala");
  send("EventForm: train", BOB, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", cat: "Travel", start: wallAfter(now, 2, "06:00"),
    openUntil: wallAfter(now, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] });
  send("EventForm: trek", CAT, { type: "createEvent", kind: "trek", title: "Iceland Trek", club: "Nordic Club", start: wallAfter(now, 40, "08:00"), attend: "members", tiers: [{ label: "Spot", price: "1200" }] });
  const typo = id(send("EventForm: minimal", FAY, { type: "createEvent", kind: "event", title: "Sprng Formal", club: "WGA", cat: "Parties", start: wallAfter(now, 10), tiers: [{ label: "GA", price: "40" }] }), "typo");
  send("Remove event", FAY, { type: "removeEvent", eventId: typo });
  // Forms round 2 (protocol 4): what the event form sends now. An event by its date alone with an optional face value and no ticket
  // types; a train as one name and one departure. The older shapes above stay valid (stored events, older callers).
  const dated = id(send("EventForm: event by date", ANN, { type: "createEvent", kind: "event", title: "Rooftop Mixer", club: "", cat: null, start: dateAfter(now, 12), deadline: wallAfter(now, 11, "12:00"),
    attend: "all", venue: "Houston Hall", face: "25", perPerson: 4, namesChecked: false, officialUrl: null, notes: null }), "dated");
  send("EventForm: event by date, no face value", DAN, { type: "createEvent", kind: "event", title: "Book Swap", club: "", cat: null, start: dateAfter(now, 13), deadline: null, attend: "all", venue: null, face: null, perPerson: null, namesChecked: false, officialUrl: null, notes: null });
  send("EventForm: train, one departure", BOB, { type: "createEvent", kind: "train", title: "Amtrak Northeast Regional: Philadelphia → New York", start: wallAfter(now, 3, "08:05"), venue: null, face: "", perPerson: null, officialUrl: null, notes: null });
  send("ListPage: addThen list, no price paid", ANN, { type: "addThen", add: { eventId: dated, tier: "t1", qty: 1 }, then: listing({ ask: "25" }) });
  // Forms round 2 (§9j): what "Request a ticket (ISO)" sends on its short path: the event and how many, a blank budget and no date
  // (the engine runs it to the event's cutoff); and with an earlier date the buyer chose.
  send("PostIsoPage: saveInterest, no budget and no date", CAT, { type: "saveInterest", data: { eventId: dated, qty: 1, budget: "", note: "" } });
  send("PostIsoPage: saveInterest, no budget, an earlier date", EVE, { type: "saveInterest", data: { eventId: dated, qty: 2, budget: "", note: "", expires: dateAfter(now, 4) } });

  // ListPage: a first-time seller adds and lists in one step; a seller with a ticket lists it.
  const l1 = id(send("ListPage: addThen list", ANN, { type: "addThen", add: { eventId: gala, tier: "t1", qty: 2, paid: "40" }, then: listing({ qty: 2, obo: true, minOffer: "20" }) }), "l1");
  const h2 = id(send("addHolding", ANN, { type: "addHolding", eventId: gala, tier: "t2", qty: 1, paid: "75" }), "h2");
  const l2 = id(send("ListPage: list", ANN, { ...listing({ ask: "70" }), holdingId: h2 }), "l2");

  // The reserve panel and QuickCard: take, pay, confirm, transfer, receive.
  const r1 = id(send("EventPage: take", BOB, { type: "take", listingId: l1, qty: 1, amount: "", msg: "", member: false }), "r1");
  send("QuickCard: markPaid", BOB, { type: "markPaid", requestId: r1 });
  send("QuickCard: confirmPayment", ANN, { type: "confirmPayment", requestId: r1 });
  send("QuickCard: markTransferred", ANN, { type: "markTransferred", requestId: r1 });
  send("QuickCard: buyerReceived", BOB, { type: "buyerReceived", requestId: r1 });
  send("ProblemBox: reportProblem (ticket)", BOB, { type: "reportProblem", kind: "ticket", id: r1, reason: "The ticket didn't work" });
  send("ProblemBox: resolveProblem (ticket)", BOB, { type: "resolveProblem", kind: "ticket", id: r1 });

  // Offers: counter and answer, then cancel; decline; accept, then release.
  const o1 = id(send("EventPage: offer", CAT, { type: "offer", listingId: l1, qty: 1, amount: "30", msg: "Would $30 work?", member: false }), "o1");
  send("QuickCard: counter", ANN, { type: "counter", requestId: o1, amount: "33" });
  send("QuickCard: respond (accept)", CAT, { type: "respond", requestId: o1, accept: true, member: false });
  send("QuickCard: cancel", CAT, { type: "cancel", requestId: o1 });
  const o2 = id(send("EventPage: offer 2", DAN, { type: "offer", listingId: l1, qty: 1, amount: "25", msg: "", member: false }), "o2");
  send("QuickCard: decline", ANN, { type: "decline", requestId: o2 });
  const o3 = id(send("EventPage: offer 3", EVE, { type: "offer", listingId: l1, qty: 1, amount: "31", msg: "", member: false }), "o3");
  send("QuickCard: accept", ANN, { type: "accept", requestId: o3 });
  send("QuickCard: release", ANN, { type: "release", requestId: o3 });

  // The disputed Paid (C-DESIGN §8.3): the seller says the money hasn't arrived; the buyer cancels.
  const d1 = id(send("EventPage: take 2", FAY, { type: "take", listingId: l1, qty: 1, amount: "", msg: "Paying now.", member: false }), "d1");
  send("QuickCard: markPaid 2", FAY, { type: "markPaid", requestId: d1 });
  send("QuickCard: paymentMissing", ANN, { type: "paymentMissing", requestId: d1 });
  send("QuickCard: cancel after a dispute", FAY, { type: "cancel", requestId: d1 });

  // Post a request (PostIsoPage), held replies (IsoReplyPanel) and shares (the request page).
  const iso = id(send("PostIsoPage: saveInterest", DAN, { type: "saveInterest", data: { eventId: gala, qty: 1, budget: "40", note: "Two together, please.", expires: dateAfter(now, 5) } }), "iso");
  send("PostIsoPage: edit", DAN, { type: "saveInterest", data: { id: iso, eventId: gala, qty: 1, budget: "38", note: "", expires: dateAfter(now, 5) } });
  sendRefused("PostIsoPage: no event chosen", DAN, { type: "saveInterest", data: { qty: 1, budget: "38", note: "", expires: dateAfter(now, 5), eventId: "__none" } }, "Choose an event.");
  const reply = { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, departsAt: undefined, note: "Got one for you.", membersOnly: false };
  const held = id(send("IsoReplyPanel: addThen isoReply", EVE, { type: "addThen", add: { eventId: gala, tier: "t1", qty: 1, paid: "40" }, then: reply }), "held");
  send("QuickCard: respond (decline)", DAN, { type: "respond", requestId: held, accept: false });
  const evesHolding = id(w.doc.holdings.find((h) => h.userId === EVE.userId)?.id, "Eve's holding");
  send("IsoReplyPanel: isoReply", EVE, { ...reply, counter: true, price: "38", note: "", holdingId: evesHolding });
  const share = id(send("Request page: shareListing", ANN, { type: "shareListing", isoId: iso, listingId: l1 }), "share");
  send("ListingPanel: withdrawShare", ANN, { type: "withdrawShare", id: share });
  // Cat sells for the first time: the page saves Cat's method to the profile first (saveMyProfile), then posts.
  w.people = w.people.map((p) => (p.userId === CAT.userId ? { ...p, payMethods: [{ kind: "venmo", value: "cat-moore" }] } : p));
  send("ListPage for a request: seq", CAT, { type: "seq", steps: [
    { action: { type: "addThen", add: { eventId: gala, tier: "t1", qty: 1, paid: "40" }, then: listing({}) } },
    { action: { type: "shareListing", isoId: iso, listingId: "@0" }, optional: true },
  ] });
  send("RequestManage: closeInterest", DAN, { type: "closeInterest", id: iso, reason: "cancelled" });

  // Get notified (AlertDialog, AlertCard).
  const alert = id(send("AlertDialog: joinAlert", FAY, { type: "joinAlert", eventId: gala, qty: 2, max: "" }), "alert");
  send("AlertCard: pause", FAY, { type: "setAlert", id: alert, paused: true });
  send("AlertCard: resume", FAY, { type: "setAlert", id: alert, paused: false });
  send("AlertDialog: update", FAY, { type: "joinAlert", eventId: gala, qty: 1, max: "30" });
  send("AlertCard: turn off", FAY, { type: "closeInterest", id: alert });

  // Goods: SellPage, the item page, GoodsReqCard, ItemPanel; a goods request shared with seq and on its own.
  const item = (o: Record<string, unknown>) => ({ type: "postItem", data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", obo: false, minOffer: "", area: "Rittenhouse", until: dateAfter(now, 14), note: "", photos: [], ...o } });
  const chair = id(send("SellPage: postItem", ANN, item({ obo: true, minOffer: "20" })), "chair");
  const wanted = id(send("PostIsoPage: goods saveInterest", EVE, { type: "saveInterest", data: { qty: 1, budget: "45", note: "", expires: dateAfter(now, 10), goods: { title: "Mini fridge", cat: "Home & kitchen" } } }), "wanted");
  send("SellPage for a request: seq", BOB, { type: "seq", steps: [
    { action: item({ title: "Compact mini fridge", cat: "Home & kitchen", cond: "Like new", price: "40", area: "Fishtown" }) },
    { action: { type: "shareItem", isoId: wanted, itemId: "@0" }, optional: true },
  ] });
  const fridge = id(send("SellPage: postItem 2", ANN, item({ title: "Mini fridge", cat: "Home & kitchen", price: "35" })), "fridge");
  send("Request page: shareItem", ANN, { type: "shareItem", isoId: wanted, itemId: fridge });
  // ItemPanel: the seller edits the item for what happens next, pauses it and resumes it (C-CONTRACT §8).
  send("ItemPanel: editItem", ANN, { type: "editItem", id: fridge, price: "32", obo: false, minOffer: "", note: "Works well." });
  // §9s item 6: the item's one photo. The action names only the item; the image travels beside it, and the server's reference to it
  // is attached after parseAction (ServerWorld.photo, as store.ts does). Post item with a photo is the same postItem as without one.
  w.photo = { v: "0123456789abcdef", w: 1280, h: 960 };
  send("SellPage: postItem with a photo", ANN, item({ title: "Floor lamp", price: "12" }));
  send("ItemPanel: setItemPhoto", ANN, { type: "setItemPhoto", id: fridge });
  w.photo = null;
  send("ItemPanel: removeItemPhoto", ANN, { type: "removeItemPhoto", id: fridge });
  send("ItemPanel: pauseItem", ANN, { type: "pauseItem", id: fridge });
  send("ItemPanel: resumeItem", ANN, { type: "resumeItem", id: fridge });
  const g1 = id(send("ItemPage: requestItem with an offer", BOB, { type: "requestItem", id: chair, offer: "25", msg: "Can pick up Friday.", shareContact: false }), "g1");
  send("ItemPage: requestItem", CAT, { type: "requestItem", id: chair, offer: undefined, msg: "", shareContact: true });
  send("GoodsReqCard: acceptItemReq", ANN, { type: "acceptItemReq", id: g1, shareContact: true });
  send("GoodsReqCard: setPickup", BOB, { type: "setPickup", id: g1, at: wallAfter(now, 2, "17:00") });
  send("GoodsReqCard: itemConsent", BOB, { type: "itemConsent", id: g1, side: "buyer" });
  send("ProblemBox: reportProblem (goods)", BOB, { type: "reportProblem", kind: "goods", id: g1, reason: "The item isn't as described" });
  send("ProblemBox: resolveProblem (goods)", BOB, { type: "resolveProblem", kind: "goods", id: g1 });
  send("GoodsReqCard: itemPickedUp", BOB, { type: "itemPickedUp", id: g1 });
  const shelf = id(send("SellPage: postItem 3", ANN, item({ title: "Bookshelf", price: "25" })), "shelf");
  const g2 = id(send("ItemPage: requestItem 2", DAN, { type: "requestItem", id: shelf, msg: "", shareContact: false }), "g2");
  send("GoodsReqCard: declineItemReq", ANN, { type: "declineItemReq", id: g2 });
  const g3 = id(send("ItemPage: requestItem 3", EVE, { type: "requestItem", id: shelf, msg: "", shareContact: true }), "g3");
  send("GoodsReqCard: acceptItemReq 2", ANN, { type: "acceptItemReq", id: g3, shareContact: true });
  send("GoodsReqCard: releaseItemReq", ANN, { type: "releaseItemReq", id: g3 });
  const g4 = id(send("ItemPage: requestItem 4", FAY, { type: "requestItem", id: shelf, msg: "", shareContact: false }), "g4");
  send("GoodsReqCard: cancelItemReq", FAY, { type: "cancelItemReq", id: g4 });
  send("ItemPanel: withdrawItem", ANN, { type: "withdrawItem", id: shelf });

  // ListingPanel: the seller edits the listing for what happens next (one refused by the price cap), pauses and resumes it (C-CONTRACT §8).
  send("ListingPanel: editListing", ANN, { type: "editListing", listingId: l2, ask: "65", obo: true, minOffer: "50", note: "Row C, on the aisle." });
  sendRefused("ListingPanel: editListing over the cap", ANN, { type: "editListing", listingId: l2, ask: "80", obo: true, minOffer: "50", note: "Row C, on the aisle." }, "Asking price can't be more than the face value ($75)."); // forms round 2: the face value alone caps an edit
  send("ListingPanel: pauseListing", ANN, { type: "pauseListing", listingId: l2 });
  send("ListingPanel: resumeListing", ANN, { type: "resumeListing", listingId: l2 });

  // ListingPanel: withdraw; EventForm, then the Sell form continues with the new event (one seq).
  send("ListingPanel: withdraw", ANN, { type: "withdraw", listingId: l2 });
  send("EventForm then ListPage: seq", FAY, { type: "seq", steps: [
    { action: { type: "createEvent", kind: "event", title: "Spring Gala", club: "Wharton Arts Club", cat: "Shows", start: wallAfter(now, 20), attend: "all", tiers: [{ label: "Seat", price: "20" }] } },
    { action: { type: "addThen", add: { eventId: "@0", tier: "t1", qty: 1, paid: "20" }, then: listing({ ask: "20" }) } },
  ] });

  // One-form Sell (USER-INSTRUCTIONS §9l): "Post ticket" as the Sell form sends it. A new event made with its listing (the event form's
  // fields, by date); the same event sent again by a classmate whose page didn't know it (refused: they choose it); an event on Handoff
  // the seller tapped; and, for a classmate's request, Post ticket then the share, as one seq.
  const showcase = { kind: "event", title: "Winter Showcase", club: "", cat: null, start: dateAfter(now, 15), deadline: null, attend: "all", face: null, namesChecked: false, venue: null, perPerson: null, officialUrl: null, notes: null };
  const posting = (o: Record<string, unknown>) => ({ type: "postTicket", qty: 1, ask: "30", note: "", restricted: false, method: "file", namesChecked: false, file: null, membersOnly: false, obo: false, minOffer: undefined, departsAt: undefined, ...o });
  send("ListPage: postTicket, a new event", EVE, posting({ event: showcase }));
  sendRefused("ListPage: postTicket, the same new event again", DAN, posting({ event: showcase, ask: "28" }), E.TWIN_EVENT);
  const showcaseId = id(w.doc.events.find((e) => e.title === "Winter Showcase")?.id, "the showcase");
  send("ListPage: postTicket, an event on Handoff", DAN, posting({ eventId: showcaseId, ask: "28", method: "app" }));
  const iso3 = id(send("PostIsoPage: saveInterest 3", CAT, { type: "saveInterest", data: { eventId: showcaseId, qty: 1, budget: "", note: "" } }), "iso3");
  send("ListPage for a request: seq with postTicket", FAY, { type: "seq", steps: [
    { action: posting({ eventId: showcaseId, ask: "25" }) },
    { action: { type: "shareListing", isoId: iso3, listingId: "@0" }, optional: true },
  ] });

  // The Sell and Request follow-up (USER-INSTRUCTIONS §9m, §9n): what the two one-form pages send. Post ticket for an ordinary event
  // with no transfer method and no quantity (the engine reads one ticket, and the listing promises no method). "Post request" for a new
  // event made with it (nothing but the event); the same new event sent again by a classmate whose page didn't know it (refused: they
  // choose it); and an event on Handoff the buyer tapped, with a quantity, a budget, a note and an earlier date.
  send("ListPage: postTicket, no method and no quantity", ANN, { type: "postTicket", eventId: showcaseId, ask: "27", note: "", obo: false });
  const oysters = { kind: "event", title: "Oysters", club: "", cat: null, start: dateAfter(now, 16), deadline: null, attend: "all", face: null, namesChecked: false, venue: null, perPerson: null, officialUrl: null, notes: null };
  send("PostIsoPage: postRequest, a new event", BOB, { type: "postRequest", event: oysters });
  sendRefused("PostIsoPage: postRequest, the same new event again", DAN, { type: "postRequest", event: oysters, qty: 2 }, E.TWIN_EVENT_REQUEST);
  const oystersId = id(w.doc.events.find((e) => e.title === "Oysters")?.id, "the oysters event");
  send("PostIsoPage: postRequest, an event on Handoff", DAN, { type: "postRequest", eventId: oystersId, qty: 2, budget: "20", note: "Two together.", expires: dateAfter(now, 9) });

  // Invite to pay (follow-on B5; FOLLOWON-PLAN §2.5), in the shapes the page sends from step S2 on: a buyer asks to buy (at the asking
  // price, or with an offer), the seller invites (as asked, or for a quantity and price), the buyer reserves; a seller invites a public
  // request's poster on a listing of their own, alone and as the step after the one that lists the ticket.
  const q1 = id(send("EventPage: requestToBuy with an offer", EVE, { type: "requestToBuy", listingId: l1, qty: 1, amount: "30", msg: "Would $30 work?", member: false }), "q1");
  const q2 = id(send("EventPage: requestToBuy", DAN, { type: "requestToBuy", listingId: l1, qty: 1, amount: "", msg: "", member: false }), "q2");
  send("QuickCard: invite for a quantity and price", ANN, { type: "invite", requestId: q1, qty: 1, price: "32" });
  send("QuickCard: invite", ANN, { type: "invite", requestId: q2 });
  send("QuickCard: reserve", DAN, { type: "reserve", requestId: q2, member: false });
  const q1Due = w.run(() => E.fmtMs(w.doc.requests.find((r) => r.id === q1)?.expiresAt ?? 0));
  sendRefused("QuickCard: reserve after another buyer did", EVE, { type: "reserve", requestId: q1, member: false },
    `Another buyer is paying for it right now. Your invitation stays open until ${q1Due} in case it comes back.`);
  const iso2 = id(send("PostIsoPage: saveInterest 2", FAY, { type: "saveInterest", data: { eventId: gala, qty: 1, budget: "75", note: "", expires: dateAfter(now, 5) } }), "iso2");
  const catsListing = id(w.doc.listings.find((l) => l.sellerId === CAT.userId && !l.withdrawnAt)?.id, "Cat's listing");
  send("Request page: inviteRequester", CAT, { type: "inviteRequester", isoId: iso2, listingId: catsListing, qty: 1, price: "" });
  send("ListPage for a request: seq with an invitation", BOB, { type: "seq", steps: [ // Bob holds a general admission ticket already (r1): a VIP one
    { action: { type: "addThen", add: { eventId: gala, tier: "t2", qty: 1, paid: "75" }, then: listing({ ask: "70" }) } },
    { action: { type: "inviteRequester", isoId: iso2, listingId: "@0", qty: 1 }, optional: true },
  ] });
  // "I have this" in one submission (§9v item 2, SELL5-M3): the Sell form for a request ("List and invite"), with a ticket the seller
  // adds and a restriction; and the invitation from a listing the seller already has.
  // (Cat's request for the showcase, iso3; Bob holds no showcase ticket yet.)
  send("ListPage for a request: answerRequest (List and invite)", BOB, { type: "answerRequest", isoId: iso3, qty: 1, ask: "26", note: "", obo: false, restriction: "Student ID at the door" });
  send("Request page: answerRequest from a listing", ANN, { type: "answerRequest", isoId: iso3, listingId: id(w.doc.listings.find((l) => l.sellerId === ANN.userId && l.eventId === showcaseId && !l.withdrawnAt)?.id, "Ann's showcase listing"), qty: 1, price: "" });
  return { w, sent };
}

describe("what the UI sends", () => {
  const { w, sent } = uiScenario();

  it("passes parseAction unchanged, and the engine then accepts it (or answers with its own message)", () => {
    const changed = sent.filter(({ action }) => canon(ok(action)) !== canon(action)).map(({ label }) => label);
    expect(changed).toEqual([]);
    expect(w.invalid).toEqual([]); // every refusal in the scenario came from the engine, not from the gate
  });

  it("covers every live action type", () => {
    const types = new Set(sent.map(({ action }) => action.type));
    expect(LIVE_ACTIONS.filter((t) => !types.has(t))).toEqual([]);
    expect(sent.length).toBeGreaterThanOrEqual(60);
  });

  it("drops what the engine doesn't read: simulate, unknown fields, a second step's holdingId, prototype keys", () => {
    const take = { type: "take", listingId: L1, qty: 1, amount: "", msg: "", member: false };
    expect(ok({ ...take, simulate: true, extra: "x", sellerId: "user-ann", status: "completed" })).toEqual(take);
    expect(ok({ type: "confirmPayment", requestId: R1, simulate: true })).toEqual({ type: "confirmPayment", requestId: R1 });
    const addThen = ok({ type: "addThen", add: { eventId: EV1, tier: "t1", qty: 1, paid: "40", holdingId: H1 }, then: { type: "list", qty: 1, ask: "35", holdingId: H1, method: "app" } });
    expect(addThen).toEqual({ type: "addThen", add: { eventId: EV1, tier: "t1", qty: 1, paid: "40" }, then: { type: "list", qty: 1, ask: "35", method: "app" } });
    const polluted = JSON.parse(`{"type":"take","listingId":"${L1}","qty":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"bad":1}}}`) as unknown;
    const parsed = ok(polluted);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.keys(parsed).sort()).toEqual(["listingId", "qty", "type"]);
    expect((parsed as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("refusals", () => {
  it("photos: none, or an empty list (DEVIATIONS.md D3); any photo is refused with the pilot's wording", () => {
    const post = (data: Record<string, unknown>) => ({ type: "postItem", data: { title: "Lamp", cat: "Home & kitchen", cond: "Good", price: "10", area: "Fishtown", until: "2026-11-20", ...data } });
    ok(post({}));
    ok(post({ photos: [] }));
    expect(refusal(post({ photos: ["data:image/png;base64,iVBORw0KGgo="] })).error).toBe(PHOTOS_ERROR);
    expect(refusal(post({ photos: [""] })).error).toBe(PHOTOS_ERROR);
    expect(refusal(post({ photo: "data:image/png;base64,iVBORw0KGgo=" })).error).toBe(PHOTOS_ERROR);
    expect(refusal({ type: "seq", steps: [{ action: post({ photos: ["x"] }) }] }).error).toBe(PHOTOS_ERROR);
  });

  it("ticket files: file is null or absent; a file is refused wherever a listing or reply is made", () => {
    const file = { name: "ticket.pdf", size: 1000, hash: "5be8a90d1c37f2e4" };
    const list = { type: "list", holdingId: H1, qty: 1, ask: "35", method: "file" };
    ok({ ...list, file: null });
    ok(list);
    expect(refusal({ ...list, file }).error).toBe(FILE_ERROR);
    expect(refusal({ type: "isoReply", isoId: ISO1, holdingId: H1, qty: 1, method: "file", file }).error).toBe(FILE_ERROR);
    expect(refusal({ type: "addThen", add: { eventId: EV1, tier: "t1", qty: 1, paid: "40" }, then: { ...list, file } }).error).toBe(FILE_ERROR);
    expect(refusal({ ...list, file: "ticket.pdf" }).error).toBe(FILE_ERROR);
  });

  it("requests for events that aren't on Handoff are refused; \"__none\" reaches the engine (DEVIATIONS.md D2)", () => {
    const missing = { type: "saveInterest", data: { qty: 1, budget: "40", expires: "2026-11-20", missing: { title: "A party", flexible: true } } };
    expect(refusal(missing).error).toBe(UNLISTED_EVENT_ERROR);
    expect(ok({ type: "saveInterest", data: { qty: 1, budget: "40", expires: "2026-11-20", eventId: "__none" } }).type).toBe("saveInterest");
    // An event and an item at once is no request the UI makes.
    expect(refusal({ type: "saveInterest", data: { qty: 1, eventId: EV1, expires: "2026-11-20", goods: { title: "Chair", cat: "Furniture" } } }).error).toBe(INVALID_ACTION_ERROR);
    // "__none" is only saveInterest's: nowhere else is it an id.
    expect(refusal({ type: "joinAlert", eventId: "__none" }).error).toBe(INVALID_ACTION_ERROR);
    expect(refusal({ type: "addHolding", eventId: "__none", tier: "t1", qty: 1, paid: "40" }).error).toBe(INVALID_ACTION_ERROR);
  });

  it("ids must match their kind's pattern: bad, prototype, oversized and mixed-up ids are refused", () => {
    const where: [string, (v: string) => unknown][] = [
      ["take.listingId", (v) => ({ type: "take", listingId: v, qty: 1 })],
      ["accept.requestId", (v) => ({ type: "accept", requestId: v })],
      ["list.holdingId", (v) => ({ type: "list", holdingId: v, qty: 1, ask: "35" })],
      ["removeEvent.eventId", (v) => ({ type: "removeEvent", eventId: v })],
      ["joinAlert.eventId", (v) => ({ type: "joinAlert", eventId: v })],
      ["setAlert.id", (v) => ({ type: "setAlert", id: v, paused: true })],
      ["withdrawItem.id", (v) => ({ type: "withdrawItem", id: v })],
      ["acceptItemReq.id", (v) => ({ type: "acceptItemReq", id: v })],
      ["withdrawShare.id", (v) => ({ type: "withdrawShare", id: v })],
      ["shareListing.isoId", (v) => ({ type: "shareListing", isoId: v, listingId: L1 })],
      ["shareItem.itemId", (v) => ({ type: "shareItem", isoId: ISO1, itemId: v })],
      ["saveInterest.data.id", (v) => ({ type: "saveInterest", data: { id: v, qty: 1, eventId: EV1, expires: "2026-11-20" } })],
      ["addHolding.tier", (v) => ({ type: "addHolding", eventId: EV1, tier: v, qty: 1, paid: "40" })],
      ["addThen.add.eventId", (v) => ({ type: "addThen", add: { eventId: v, tier: "t1", qty: 1 }, then: { type: "list", qty: 1 } })],
      ["postTicket.eventId", (v) => ({ type: "postTicket", eventId: v, qty: 1, ask: "35" })],
      ["editListing.listingId", (v) => ({ type: "editListing", listingId: v, ask: "35" })],
      ["resumeListing.listingId", (v) => ({ type: "resumeListing", listingId: v })],
      ["pauseItem.id", (v) => ({ type: "pauseItem", id: v })],
      ["editItem.id", (v) => ({ type: "editItem", id: v, price: "30" })],
    ];
    const bad = ["constructor", "__proto__", "toString", "hasOwnProperty", "", " ", "l", "l1234", `${L1}0`, "lABCDEF0123456789", `${L1} `, ` ${L1}`,
      `${L1}\n`, "x".repeat(5000), "@0", "@1", "' OR 1=1 --", "t4", "t0", "T1", "ev-", null, 5, true, { id: L1 }, [L1]];
    const accepted: string[] = [];
    for (const [label, build] of where) {
      for (const v of bad) {
        if (label === "addHolding.tier" && v === "") continue; // none chosen: the engine asks for the tier (below)
        if (parseAction(build(v as string)).ok) accepted.push(`${label} = ${json(v)}`);
      }
    }
    expect(accepted).toEqual([]);
    expect(ok({ type: "addHolding", eventId: EV1, tier: "", qty: 1, paid: "40" }).type).toBe("addHolding");
    // Each kind's id where another kind's goes.
    const mixed: string[] = [];
    const sample: Record<Exclude<IdKind, "tier">, string> = { event: EV1, listing: L1, request: R1, holding: H1, iso: ISO1, item: IT1, goodsReq: GR1, share: RSP1 };
    const expected: [string, Exclude<IdKind, "tier">][] = [["take.listingId", "listing"], ["accept.requestId", "request"], ["list.holdingId", "holding"], ["removeEvent.eventId", "event"],
      ["setAlert.id", "iso"], ["withdrawItem.id", "item"], ["acceptItemReq.id", "goodsReq"], ["withdrawShare.id", "share"],
      ["editListing.listingId", "listing"], ["resumeListing.listingId", "listing"], ["pauseItem.id", "item"], ["editItem.id", "item"], ["postTicket.eventId", "event"]];
    for (const [label, kind] of expected) {
      const build = where.find(([l]) => l === label)?.[1];
      if (!build) throw new Error(label);
      for (const [other, v] of Object.entries(sample)) {
        const passed = parseAction(build(v)).ok;
        if (passed !== (other === kind)) mixed.push(`${label} with a ${other} id: ${passed ? "accepted" : "refused"}`);
      }
    }
    expect(mixed).toEqual([]);
    // A problem's id is a ticket request's or a goods request's, as its kind says.
    ok({ type: "reportProblem", kind: "ticket", id: R1, reason: "Something else" });
    ok({ type: "reportProblem", kind: "goods", id: GR1, reason: "Something else" });
    expect(refusal({ type: "reportProblem", kind: "goods", id: R1, reason: "Something else" }).error).toBe(INVALID_ACTION_ERROR);
    expect(refusal({ type: "resolveProblem", kind: "ticket", id: GR1 }).error).toBe(INVALID_ACTION_ERROR);
    // Every pattern names exactly its live ids (the engine makes them: a prefix and 16 hex characters).
    E.withEngine({ doc: E.emptyWorld(), people: [], now: Date.UTC(2026, 10, 10) }, () => {
      for (let k = 0; k < 50; k++) {
        const hex = E.uid();
        expect(ID.event.test(`ev-${hex}`) && ID.listing.test(`l${hex}`) && ID.request.test(`r${hex}`) && ID.holding.test(`h${hex}`) && ID.iso.test(`iso-${hex}`)
          && ID.item.test(`g${hex}`) && ID.goodsReq.test(`gr${hex}`) && ID.share.test(`rsp-${hex}`)).toBe(true);
      }
    });
  });

  it("caps an action at 16 KB of UTF-8 JSON, before reading its fields", () => {
    const base = { type: "take", listingId: L1, qty: 1, junk: "" };
    const room = MAX_ACTION_BYTES - new TextEncoder().encode(json(base)).length;
    expect(ok({ ...base, junk: "x".repeat(room) }).type).toBe("take"); // exactly 16 KB: read, and the unknown field dropped
    expect(refusal({ ...base, junk: "x".repeat(room + 1) }).error).toBe(TOO_LARGE_ERROR);
    expect(refusal({ ...base, junk: "é".repeat(Math.ceil((room + 1) / 2)) }).error).toBe(TOO_LARGE_ERROR); // bytes, not characters
    expect(refusal({ type: "seq", steps: [{ action: { type: "postItem", data: { note: "x".repeat(MAX_ACTION_BYTES) } } }] }).error).toBe(TOO_LARGE_ERROR);
    const cycle: Record<string, unknown> = { type: "take", listingId: L1, qty: 1 };
    cycle["self"] = cycle;
    expect(refusal(cycle).error).toBe(INVALID_ACTION_ERROR);
    expect(refusal({ type: "take", listingId: L1, qty: 1, big: 10n }).error).toBe(INVALID_ACTION_ERROR);
  });

  it("text: within its limit, and no character the database can't store (NUL, a lone surrogate) or other control characters", () => {
    const take = (msg: string) => ({ type: "take", listingId: L1, qty: 1, msg });
    ok(take("Line one\nline two\tand a tab\r\n😀 émoji"));
    ok(take("x".repeat(1000)));
    expect(refusal(take("x".repeat(1001))).error).toBe(INVALID_ACTION_ERROR);
    for (const bad of ["a\u0000b", "a\ud800b", "a\udc00b", "\ud83d", "a\u0001b", "a\u0008b", "a\u000bb", "a\u001bb", "a\u007fb"]) {
      expect(refusal(take(bad)).error, json(bad)).toBe(TEXT_ERROR);
    }
    // Everywhere text goes: titles, notes, labels, handles, amounts, nested in add, then and data, and in seq steps.
    for (const raw of [
      { type: "createEvent", kind: "event", title: "Gala\u0000", club: "WGA", start: "", tiers: [] },
      { type: "createEvent", kind: "event", title: "Gala", club: "WGA", start: "", tiers: [{ label: "G\ud800A", price: "40" }] },
      { type: "postItem", data: { note: "\u0000" } },
      { type: "saveInterest", data: { qty: 1, eventId: EV1, note: "\ud800" } },
      { type: "addThen", add: { eventId: EV1, tier: "t1", qty: 1, paid: "4\u00000" }, then: { type: "list", qty: 1 } },
      { type: "list", holdingId: H1, qty: 1, note: "@ann\u0000" },
      { type: "seq", steps: [{ action: { type: "list", holdingId: H1, qty: 1, note: "\u0007" } }] },
    ]) expect(refusal(raw).error, json(raw)).toBe(TEXT_ERROR);
    // Protocol 2 (follow-on B1): a payment handle is no field of a listing or a held reply any more. It's dropped with the other unknown
    // fields, whatever it holds, so nothing typed with a listing is stored as where to pay.
    for (const raw of [{ type: "list", holdingId: H1, qty: 1, payHandle: "@ann\u0000" }, { type: "isoReply", isoId: ISO1, holdingId: H1, qty: 1, payHandle: "@ann" },
      { type: "addThen", add: { eventId: EV1, tier: "t1", qty: 1, paid: "40" }, then: { type: "list", qty: 1, payHandle: "@ann" } }]) {
      const parsed = parseAction(raw);
      expect(parsed.ok, json(raw)).toBe(true);
      expect(JSON.stringify(parsed.ok ? parsed.action : null), json(raw)).not.toContain("payHandle");
    }
  });

  it("numbers are finite whole numbers in range, and flags are booleans", () => {
    for (const qty of [NaN, Infinity, -Infinity, 1.5, 0, -1, 100, "1", null, 1e20]) {
      expect(parseAction({ type: "take", listingId: L1, qty }).ok, String(qty)).toBe(false);
    }
    for (const member of ["true", 1, null]) expect(parseAction({ type: "take", listingId: L1, qty: 1, member }).ok, String(member)).toBe(false);
    expect(parseAction({ type: "respond", requestId: R1 }).ok).toBe(false); // respond says which way
    expect(parseAction({ type: "createEvent", kind: "event", title: "Gala", club: "WGA", start: "", tiers: [], perPerson: 2.5 }).ok).toBe(false);
  });

  it("dates and times must exist; an empty one is left to the engine's message", () => {
    const until = (v: string) => ({ type: "postItem", data: { until: v } });
    for (const v of ["2026-11-20", ""]) ok(until(v));
    for (const v of ["2026-02-30", "2026-13-01", "2026-11-31", "tomorrow", "2026-11-20T10:00", "20261120", "2026-1-2", " 2026-11-20"]) expect(parseAction(until(v)).ok, v).toBe(false);
    const at = (v: string) => ({ type: "setPickup", id: GR1, at: v });
    for (const v of ["2026-11-20T17:00", ""]) ok(at(v));
    for (const v of ["2026-11-20T25:00", "2026-11-20T17:60", "2026-02-29T10:00", "2026-11-20", "2026-11-20T17:00:00Z", "5pm"]) expect(parseAction(at(v)).ok, v).toBe(false);
    for (const v of ["2026-11-31", "soon"]) expect(parseAction({ type: "saveInterest", data: { qty: 1, eventId: EV1, expires: v } }).ok, v).toBe(false);
    for (const v of ["2026-02-30T10:00", "noon"]) expect(parseAction({ type: "list", holdingId: H1, qty: 1, departsAt: v }).ok, v).toBe(false);
    // createEvent's times are the engine's to check, with a message for each field.
    ok({ type: "createEvent", kind: "event", title: "Gala", club: "WGA", start: "soon", tiers: [] });
  });

  it("the date check closes a hole: the engine alone would keep an impossible date, and the record would never end", () => {
    const w = new LiveTestWorld();
    const id = w.ok(ANN.userId, { type: "postItem", data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", obo: false, area: "Rittenhouse", until: "2026-02-30", note: "" } }).id;
    w.advance(400 * 24 * 3600e3);
    const state = w.run(() => { const it = w.doc.goods.find((x) => x.id === id); return it ? E.itemState(w.doc, it).key : null; });
    expect(state).toBe("available"); // a year later its pickup window still hasn't ended
    expect(parseAction({ type: "postItem", data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", area: "Rittenhouse", until: "2026-02-30" } }).ok).toBe(false);
  });
});

const list = { type: "list", holdingId: H1, qty: 1, ask: "35" };
const share = (listingId: string) => ({ type: "shareListing", isoId: ISO1, listingId });

describe("seq", () => {
  it("takes 1 to 3 steps of the step types, the first never optional, each naming only earlier steps", () => {
    ok({ type: "seq", steps: [{ action: list }] });
    ok({ type: "seq", steps: [{ action: list }, { action: share("@0"), optional: true }] });
    ok({ type: "seq", steps: [{ action: { type: "createEvent", kind: "event", title: "Gala", club: "WGA", start: "", tiers: [] } },
      { action: { type: "addThen", add: { eventId: "@0", tier: "t1", qty: 1 }, then: { type: "list", qty: 1 } } }, { action: share("@1"), optional: true }] });
    ok({ type: "seq", steps: [{ action: list }, { action: { type: "saveInterest", data: { qty: 1, eventId: "@0", expires: "" } } }] }); // ids inside data
    const refusedSeq = (raw: unknown): string => refusal(raw).error;
    expect(refusedSeq({ type: "seq", steps: [] })).toBe(SEQ_ERROR);
    expect(refusedSeq({ type: "seq", steps: [{ action: list }, { action: list }, { action: list }, { action: list }] })).toBe(SEQ_ERROR);
    expect(refusedSeq({ type: "seq" })).toBe(SEQ_ERROR);
    expect(refusedSeq({ type: "seq", steps: [{ action: list, optional: true }] })).toBe(SEQ_ERROR);
    expect(refusedSeq({ type: "seq", steps: [{ action: { type: "seq", steps: [{ action: list }] } }] })).toBe(SEQ_ERROR);
    for (const type of ["take", "accept", "withdraw", "removeEvent", "sweep", "request"]) {
      expect(refusedSeq({ type: "seq", steps: [{ action: { type, listingId: L1, requestId: R1, eventId: EV1, qty: 1 } }] }), type).toBe(SEQ_ERROR);
    }
    // References: only to earlier steps, only in id fields, never outside seq.
    expect(refusal({ type: "seq", steps: [{ action: share("@0") }] }).error).toBe(INVALID_ACTION_ERROR);
    expect(refusal({ type: "seq", steps: [{ action: list }, { action: share("@1") }] }).error).toBe(INVALID_ACTION_ERROR);
    expect(refusal({ type: "seq", steps: [{ action: list }, { action: list }, { action: share("@2") }] }).error).toBe(INVALID_ACTION_ERROR);
    expect(refusal({ type: "seq", steps: [{ action: list }, { action: share("@3") }] }).error).toBe(INVALID_ACTION_ERROR);
    expect(refusal(share("@0")).error).toBe(INVALID_ACTION_ERROR);
    expect(ok({ type: "seq", steps: [{ action: list }, { action: { ...list, note: "@0" } }] })).toBeTruthy(); // free text is just text
    expect(refusal({ type: "seq", steps: [{ action: list }, { action: { type: "addHolding", eventId: EV1, tier: "@0", qty: 1 } }] }).error).toBe(INVALID_ACTION_ERROR);
  });

  it("parses each step with its own schema and drops what the steps don't read", () => {
    const a = ok({ type: "seq", extra: 1, steps: [{ action: { ...list, simulate: true }, optional: false, x: 1 }, { action: share("@0"), optional: true }] });
    expect(a).toEqual({ type: "seq", steps: [{ action: list, optional: false }, { action: share("@0"), optional: true }] });
  });
});

describe("actionIds (the actions log)", () => {
  it("keeps only record ids, keyed by where they are; never amounts, text or contact details", () => {
    expect(actionIds(ok({ type: "take", listingId: L1, qty: 2, amount: "30", msg: "call me at 555-0100" }))).toEqual({ listingId: L1 });
    expect(actionIds(ok({ type: "addThen", add: { eventId: EV1, tier: "t1", qty: 1, paid: "40" }, then: { type: "isoReply", isoId: ISO1, qty: 1, payHandle: "@ann", note: "hi" } })))
      .toEqual({ "add.eventId": EV1, "add.tier": "t1", "then.isoId": ISO1 });
    expect(actionIds(ok({ type: "saveInterest", data: { id: ISO1, eventId: EV1, qty: 1, budget: "40", note: "x", expires: "2026-11-20" } }))).toEqual({ "data.id": ISO1, "data.eventId": EV1 });
    expect(actionIds(ok({ type: "saveInterest", data: { eventId: "__none", qty: 1, expires: "2026-11-20" } }))).toEqual({});
    expect(actionIds(ok({ type: "seq", steps: [{ action: list }, { action: share("@0"), optional: true }] })))
      .toEqual({ "steps.0.type": "list", "steps.0.holdingId": H1, "steps.1.type": "shareListing", "steps.1.isoId": ISO1, "steps.1.listingId": "@0" });
    expect(actionIds(ok({ type: "createEvent", kind: "event", title: "Gala", club: "WGA", start: "", tiers: [{ label: "GA", price: "40" }] }))).toEqual({});
  });

  it("for everything the UI sends, holds only id-shaped values", () => {
    const { sent } = uiScenario();
    const idLike = (v: string): boolean => /^@[0-2]$/.test(v) || Object.values(ID).some((p) => p.test(v)) || LIVE_ACTIONS.includes(v as never);
    const leaks = sent.flatMap(({ label, action }) => Object.entries(actionIds(ok(action))).filter(([, v]) => !idLike(v)).map(([k, v]) => `${label} ${k}=${v}`));
    expect(leaks).toEqual([]);
  });
});

/** The live shape of a self-test action: preview ids mapped to live-shaped ones, field by field, by the id's kind. */
function toLive(action: Action, tiersOf: (eventId: string) => readonly string[]): Action {
  const live = (kind: Exclude<IdKind, "tier">, v: unknown): unknown => (typeof v === "string" ? idFor(kind, v) : v);
  const idKind = (type: string, field: string, o: Record<string, unknown>): Exclude<IdKind, "tier"> | "tier" | null => {
    switch (field) {
      case "eventId": return "event";
      case "listingId": return "listing";
      case "requestId": return "request";
      case "holdingId": return "holding";
      case "isoId": return "iso";
      case "itemId": return "item";
      case "tier": return "tier";
      case "id":
        if (type === "withdrawItem" || type === "requestItem") return "item";
        if (type === "setAlert" || type === "closeInterest" || type === "saveInterest") return "iso";
        if (type === "withdrawShare") return "share";
        if (type === "reportProblem" || type === "resolveProblem") return o["kind"] === "goods" ? "goodsReq" : "request";
        return "goodsReq"; // acceptItemReq, declineItemReq, releaseItemReq, cancelItemReq, itemPickedUp, itemConsent, setPickup
      default: return null;
    }
  };
  const map = (o: Record<string, unknown>, type: string, eventId: unknown): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      const kind = idKind(type, k, o);
      if (kind === "tier") {
        const tiers = typeof eventId === "string" ? tiersOf(eventId) : [];
        out[k] = `t${Math.min(3, Math.max(1, tiers.indexOf(String(v)) + 1))}`;
      } else if (kind) out[k] = live(kind, v);
      else if (v && typeof v === "object" && !Array.isArray(v) && (k === "add" || k === "then" || k === "data")) out[k] = map(v as Record<string, unknown>, k === "then" ? String((v as Record<string, unknown>)["type"]) : type, (v as Record<string, unknown>)["eventId"] ?? eventId);
      else out[k] = v;
    }
    return out;
  };
  return map(action, action.type, action["eventId"]) as Action;
}

describe("the corpus property: what the engine accepted in the self-tests", () => {
  it("passes parseAction once its ids are live-shaped, unchanged but for what live drops (simulate) or refuses (files, photos, unlisted events)", () => {
    E.applyWorld(null); // the sample catalog, for its events' tier ids
    const tierIds = new Map(E.EVENTS.map((ev) => [ev.id, (ev.tiers ?? []).map((t) => t.id)] as const));
    const tiersOf = (eventId: string): readonly string[] => tierIds.get(eventId) ?? [];
    const corpus: Action[] = [];
    E.setActionTap((_actor, action, res, depth) => { if (depth === 0 && res.error === undefined) corpus.push(JSON.parse(JSON.stringify(action)) as Action); });
    const results = runSelfTests(seed());
    E.setActionTap(null);
    expect(results.filter((r) => !r.pass)).toEqual([]);

    const live = corpus.filter((a) => LIVE_ACTIONS.includes(a.type as never));
    const problems: string[] = [];
    const counts = { checked: 0, files: 0, photos: 0, unlisted: 0, simulate: 0 };
    for (const original of live) {
      const a = toLive(original, tiersOf);
      const expected = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
      if ("simulate" in expected) { delete expected["simulate"]; counts.simulate++; }
      // Deliberate live refusals: each must be refused with its own message, then pass in the live shape the UI sends.
      const then = expected["then"] as Record<string, unknown> | undefined;
      const data = expected["data"] as Record<string, unknown> | undefined;
      const withFile = expected["file"] && typeof expected["file"] === "object" ? expected : then && then["file"] && typeof then["file"] === "object" ? then : null;
      if (withFile) {
        const r = parseAction(a);
        if (r.ok || r.error !== FILE_ERROR) problems.push(`${a.type} with a ticket file wasn't refused as a file`);
        withFile["file"] = null; counts.files++;
      }
      if (data && Array.isArray(data["photos"]) && (data["photos"] as unknown[]).length > 0) {
        const r = parseAction(a);
        if (r.ok || r.error !== PHOTOS_ERROR) problems.push(`${a.type} with photos wasn't refused as photos`);
        data["photos"] = []; counts.photos++;
      }
      if (data && data["missing"] !== undefined) {
        const r = parseAction(a);
        if (r.ok || r.error !== UNLISTED_EVENT_ERROR) problems.push(`${a.type} for an unlisted event wasn't refused as one`);
        counts.unlisted++;
        continue;
      }
      const r = parseAction(expected);
      counts.checked++;
      if (!r.ok) problems.push(`${json(a).slice(0, 160)}: ${r.error} (${r.why})`);
      else if (canon(r.action) !== canon(expected)) problems.push(`${a.type} changed: ${json(expected).slice(0, 160)} -> ${json(r.action).slice(0, 160)}`);
    }
    expect(problems).toEqual([]);
    // The property has teeth: hundreds of actions, and each deliberate refusal, occur.
    expect(counts.checked).toBeGreaterThan(250);
    expect(counts.files).toBeGreaterThan(0);
    expect(counts.photos).toBeGreaterThan(0);
    expect(counts.unlisted).toBeGreaterThan(0);
    expect(counts.simulate).toBeGreaterThan(0);
    // The self-tests never send these (live's new types, and a few steps they don't take); uiScenario sends every type. Invite to
    // pay's four (follow-on B5) are live only: the preview, where the self-tests run, answers them "Unknown action.".
    const covered = new Set(live.map((a) => a.type));
    expect(LIVE_ACTIONS.filter((t) => !covered.has(t))).toEqual(["createEvent", "removeEvent", "postTicket", "postRequest", "editListing", "pauseListing", "resumeListing", "decline", "paymentMissing",
      "requestToBuy", "invite", "inviteRequester", "reserve", "answerRequest", // answerRequest: §9v item 2 (SELL5-M3), live only
      "editItem", "setItemPhoto", "removeItemPhoto", "pauseItem", "resumeItem", "declineItemReq", "itemConsent", "resolveProblem", "seq"]); // setItemPhoto, removeItemPhoto: §9s item 6, live only
  });
});
