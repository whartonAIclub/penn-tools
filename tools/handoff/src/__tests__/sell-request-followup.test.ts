// The Sell and Request follow-up (USER-INSTRUCTIONS §9m, §9n), the server half.
// (a) An ordinary event's ticket carries no promised delivery method unless its seller chose one: it posts with none, stores none,
//     and every party reads the neutral rule ("Send the ticket to the buyer after payment."). A listing with a recorded method keeps
//     it, word for word. Names checked at the door, members-only tickets, trains and treks keep their rules.
// (b) "Post request" is one action, postRequest: a request on an event the buyer chose (eventId) or on a new one made with it
//     (event: createEvent's fields), stored together or not at all, never merged into another event. Quantity defaults to 1, the
//     budget to none, and the deadline to the event's cutoff.
// (c) Quantity: N same-price tickets are one listing; a buyer may ask for as many as are available and the event's per-person limit
//     still allows (buyerMax); reserving 1 of 2 leaves 1 at the same price; a total is quantity × price.
// The retry and double-submit half (request ids, the world's lock) is in post-request-store.test.ts, against a throwaway schema.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { seed } from "../../engine/preview.js";
import { ID, INVALID_ACTION_ERROR, LIVE_ACTIONS, SEQ_STEP_TYPES, parseAction } from "../live.js";
import type { GuestView, View } from "../types.js";
import { ask, invite, invited, must, numbers, on, reqOf, reserve, resetEngine, setMethods, textsFor } from "./helpers/invite.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, LiveTestWorld, T0, dateAfter, wallAfter, type TestPerson } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as E.Action;
const NEUTRAL = "Send the ticket to the buyer after payment.";
/** Words that would promise a specific way of handing a ticket over. */
const PROMISES = /PDF|QR code|Ticketmaster|AXS|name change|paper ticket|in the app/i;
const GALA_DAY = dateAfter(T0, 19);
/** A new ordinary event as the forms name it: its name and its date. */
const NEW = (title: string, date: string, over: Record<string, unknown> = {}) => ({ kind: "event", title, start: date, ...over });
const TRAIN = (title: string, departs: string) => ({ kind: "train", title, start: departs });
const TREK = (title: string, start: string) => ({ kind: "trek", title, club: "Japan Trek Club", start, tiers: [{ label: "Spot", price: "1200" }] });
/** "Post ticket" as the Sell form sends it after the follow-up: no transfer method. */
const SELL = (over: Record<string, unknown>) => act({ type: "postTicket", ask: "30", note: "", obo: false, ...over });
/** "Post request" as the Request form sends it: nothing but the event, unless said otherwise. */
const REQ = (over: Record<string, unknown>) => act({ type: "postRequest", ...over });
const NOT_SAVED = "Not saved: a later step didn't go through.";
const TWIN_REQ = "An event with this name on that date is already on Handoff. Choose it to post your request there, or add what's different to the name if yours is a different showing.";
const TWIN_TRAIN_REQ = "A train with this name and departure is already on Handoff. Choose it to post your request there.";
const TWIN_TREK_REQ = "A trek with this name and start is already on Handoff. Choose it to post your request there.";
const NEW_EVENT_REQ_TOAST = "Request posted. Matches show at the bell and in My activity. Its event is new on Handoff and shows as added by you."; // §9q item 4: where matches show

const listingOf = (w: LiveTestWorld, id: string) => must(w.doc.listings.find((l) => l.id === id), `listing ${id}`);
const isoOf = (w: LiveTestWorld, id: string) => must(w.doc.interests.find((i) => i.id === id), `request ${id}`);
const counts = (w: LiveTestWorld) => ({ events: w.doc.events.filter((e) => !e.removedAt).length, requests: w.doc.interests.length, listings: w.doc.listings.length });
/** Runs fn as the browser does for one person: their view installed, at the server's time. */
function inBrowser<T>(w: LiveTestWorld, who: TestPerson, fn: (v: View, s: E.WorldState) => T): T {
  const v = viewOf(w, who);
  E.setLiveClock(() => v.serverNow);
  E.applyWorld(v as unknown as E.WorldState);
  try { return fn(v, v as unknown as E.WorldState); } finally { E.setLiveClock(null); E.applyWorld(null); }
}
const seenBy = (w: LiveTestWorld, who: TestPerson) => inBrowser(w, who, (v, s) => ({
  events: v.events.map((e) => e.id), listings: v.listings.map((l) => l.id), requests: v.interests.map((i) => i.id),
  cards: E.availableFor(s, who.userId, { ...E.DISC0 }).cards.map((c) => c.key), wanted: E.wantedFor(s, { ...E.DISC0 }).map((i) => i.id),
}));
const guestSees = (w: LiveTestWorld): { events: string[]; listings: string[]; g: GuestView } => { const g = guestViewOf(w); return { events: g.events.map((e) => e.id), listings: g.listings.map((l) => l.id), g }; };
/** Every sentence the world has produced so far: toasts, refusals, notifications and both kinds of history. */
const everyWord = (w: LiveTestWorld): string => [
  ...w.outcomes.map((o) => o.res.toast ?? o.res.error ?? ""), ...w.notes.map((n) => n.text),
  ...w.doc.listings.flatMap((l) => (l.history ?? []).map((h) => h.text)), ...w.doc.requests.flatMap((r) => (r.history ?? []).map((h) => h.text)),
].join("\n");

// ── (a) No promised delivery method ─────────────────────────────────────────────────────────────────────────────────────────────

describe("an ordinary event's ticket carries no promised delivery method (9m item 1)", () => {
  it("posts with no method, by every way of listing, and stores none", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    // Post ticket with a new event, with no method at all, and with the blank one a form would send.
    const a = w.ok(ANN.userId, SELL({ event: NEW("Spring Gala", GALA_DAY) }));
    const ev = must(w.doc.events[0], "the event").id;
    const b = w.ok(BOB.userId, SELL({ eventId: ev, ask: "28", method: "" }));
    // The older ways of listing do the same: add-and-list, and a ticket already held.
    const c = w.ok(CAT.userId, act({ type: "addThen", add: { eventId: ev, tier: "t1", qty: 1 }, then: { type: "list", qty: 1, ask: "27", note: "", obo: false, file: null } }));
    const h = must(w.ok(DAN.userId, act({ type: "addHolding", eventId: ev, tier: "t1", qty: 1 })).id, "holding");
    const d = w.ok(DAN.userId, act({ type: "list", holdingId: h, qty: 1, ask: "26", note: "", obo: false }));
    expect(w.invalid).toEqual([]);
    for (const done of [a, b, c, d]) {
      const l = listingOf(w, must(done.id, "listing"));
      expect(l.method).toBeUndefined();
      expect("method" in l).toBe(false); // no key at all: nothing was promised
      expect(l.namesChecked).toBeUndefined();
    }
    expect(a.toast).toBe("Ticket listed. Its event is new on Handoff: it shows as added by you, and Handoff doesn't check its details.");
    expect(b.toast).toMatch(/^Ticket listed\. /);
    // The seller's view, a classmate's and a visitor's: none carries a method for these listings.
    expect(viewOf(w, ANN).listings.every((l) => l.method === undefined)).toBe(true);
    expect(viewOf(w, EVE).listings.map((l) => l.method)).toEqual([undefined, undefined, undefined, undefined]);
    expect(JSON.stringify(guestViewOf(w))).not.toMatch(/"method"/);
    // An organizer on the event changes nothing: three ways would be valid there, and still none is promised.
    const club = w.ok(EVE.userId, SELL({ event: NEW("Rooftop Mixer", GALA_DAY, { club: "Wharton Social Committee" }) }));
    expect("method" in listingOf(w, must(club.id, "listing"))).toBe(false);
  });

  it("the engine gives every party the neutral rule, and no method's words", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const l = listingOf(w, must(w.ok(ANN.userId, SELL({ event: NEW("Spring Gala", GALA_DAY) })).id, "listing"));
    expect(E.SEND_AFTER_PAYMENT).toBe(NEUTRAL);
    expect(E.methodOf(l)).toBeNull();
    expect(E.transferWords(l, "seller")).toBe(NEUTRAL);
    expect(E.transferWords(l, "buyer")).toBe("The seller sends you the ticket after payment.");
    expect(E.transferWords(l)).toBe("The seller sends the ticket to the buyer after payment.");
    for (const who of ["seller", "buyer", undefined] as const) expect(E.transferWords(l, who)).not.toMatch(PROMISES);
    // The same from each person's copy in the browser.
    for (const who of [ANN, BOB]) inBrowser(w, who, (v) => {
      const mine = must(v.listings.find((x) => x.id === l.id), "the listing in the view") as unknown as E.Listing;
      expect(E.methodOf(mine)).toBeNull();
      expect(E.transferWords(mine, who === ANN ? "seller" : "buyer")).toBe(who === ANN ? NEUTRAL : "The seller sends you the ticket after payment.");
    });
  });

  it("a whole paid exchange on it never names a method: toasts, notifications, history and the next steps", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    setMethods(w, ANN, [{ kind: "venmo", value: "ann-lee" }]);
    const lid = must(w.ok(ANN.userId, SELL({ event: NEW("Spring Gala", GALA_DAY), qty: 1 })).id, "listing");
    const r = ask(w, BOB, lid);
    invite(w, ANN, r);
    reserve(w, BOB, r);
    const paid = w.ok(BOB.userId, on("markPaid", r));
    expect(paid.toast).toBe("Payment marked as sent. Ann confirms it arrived, then they send you the ticket.");
    const confirmed = w.ok(ANN.userId, on("confirmPayment", r));
    expect(confirmed.toast).toBe("Payment confirmed. Now send the ticket to Bob, then tap “I've sent it”.");
    expect(textsFor(confirmed.notes, BOB)).toEqual(["Ann confirmed your payment for Spring Gala. Next: they send you the ticket."]);
    expect(w.run(() => E.needsAction(w.doc, ANN.userId).map((x) => x.why))).toEqual(["send the ticket"]);
    const sent = w.ok(ANN.userId, on("markTransferred", r));
    expect(sent.toast).toBe("Marked done. Bob taps \"Received\" once they have it.");
    expect(textsFor(sent.notes, BOB)).toEqual(["Ann says they sent it. Tap \"Received\" once you have it."]);
    expect(reqOf(w, r).history.map((x) => x.text)).toContain("Seller sent it (self-reported)");
    w.ok(BOB.userId, on("buyerReceived", r));
    expect(reqOf(w, r).status).toBe("completed");
    // Nothing anyone was told, and nothing kept, names a way of handing it over.
    expect(everyWord(w)).not.toMatch(PROMISES);
    for (const who of [ANN, BOB, CAT]) expect(JSON.stringify(viewOf(w, who))).not.toMatch(PROMISES);
    // The payment details were the seller's saved method, copied when it was reserved, and only the two of them have them.
    expect(reqOf(w, r).pay).toEqual([{ kind: "venmo", value: "ann-lee" }]);
    expect(JSON.stringify(viewOf(w, CAT))).not.toContain("ann-lee");
  });

  it("an ordinary listing posts with no payment method saved; the seller is asked at the first invitation", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const lid = must(w.ok(CAT.userId, SELL({ event: NEW("Spring Gala", GALA_DAY) })).id, "listing"); // Cat has saved no way to be paid
    const r = ask(w, BOB, lid);
    expect(w.no(CAT.userId, act({ type: "invite", requestId: r }))).toBe(E.NO_PAY_METHODS);
    setMethods(w, CAT, [{ kind: "zelle", value: "cat@example.invalid" }]);
    invite(w, CAT, r);
    reserve(w, BOB, r);
    expect(reqOf(w, r).pay).toEqual([{ kind: "zelle", value: "cat@example.invalid" }]);
  });
});

describe("a listing with a recorded method keeps it (9m item 1: existing listings)", () => {
  it("a stored listing's method is still in every view and still worded in the exchange", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    const lid = w.listTickets(ANN, ev, { method: "app" }); // as listings were posted before the follow-up
    const before = JSON.stringify(listingOf(w, lid));
    expect(listingOf(w, lid).method).toBe("app");
    expect(must(viewOf(w, BOB).listings.find((l) => l.id === lid), "Bob's copy").method).toBe("app");
    expect(E.methodOf(listingOf(w, lid))).toBe("app");
    expect(E.transferWords(listingOf(w, lid), "seller")).toBeNull(); // its own words stand; nothing neutral replaces them
    expect(E.transferWords(listingOf(w, lid), "buyer")).toBeNull();
    const r = invited(w, ANN, BOB, lid);
    reserve(w, BOB, r);
    expect(w.ok(BOB.userId, on("markPaid", r)).toast).toBe("Payment marked as sent. Ann confirms it arrived, then they transfer it to your email in Ticketmaster or AXS.");
    const confirmed = w.ok(ANN.userId, on("confirmPayment", r));
    expect(confirmed.toast).toBe("Payment confirmed. Now transfer it in Ticketmaster or AXS.");
    expect(textsFor(confirmed.notes, BOB)).toEqual(["Ann confirmed your payment for Spring Formal. Next: they transfer it in Ticketmaster or AXS."]);
    expect(w.run(() => E.needsAction(w.doc, ANN.userId).map((x) => x.why))).toEqual(["transfer it in Ticketmaster or AXS"]);
    expect(JSON.stringify({ ...listingOf(w, lid), history: undefined })).toBe(JSON.stringify({ ...JSON.parse(before), history: undefined })); // nothing rewrote it
  });

  it("a PDF or QR code listing from before reads as it did, and a new listing beside it promises nothing", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Spring Gala", start: GALA_DAY })).id, "event");
    const old = w.listTickets(ANN, ev, { method: "file", paid: "", ask: "30" });
    const neu = must(w.ok(CAT.userId, SELL({ eventId: ev, ask: "29" })).id, "new listing");
    setMethods(w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    const rOld = invited(w, ANN, BOB, old); reserve(w, BOB, rOld);
    expect(w.ok(BOB.userId, on("markPaid", rOld)).toast).toBe("Payment marked as sent. Ann confirms it arrived, then they send you the PDF or QR code.");
    expect(w.ok(ANN.userId, on("confirmPayment", rOld)).toast).toBe("Payment confirmed. Now send the PDF or QR code to Bob yourself, then tap “I've sent it”.");
    // No stored record changed shape: the old one has its method, the new one has none.
    expect(viewOf(w, DAN).listings.map((l) => [l.id, l.method]).sort()).toEqual([[old, "file"], [neu, undefined]].sort());
  });

  it("a method that is sent is still checked and kept, as before", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const app = w.ok(ANN.userId, SELL({ event: NEW("Spring Gala", GALA_DAY), method: "app" }));
    expect(listingOf(w, must(app.id, "listing")).method).toBe("app");
    // One that isn't valid for the event is refused in the same words, and a name change still needs an organizer.
    expect(w.no(BOB.userId, SELL({ event: NEW("Winter Gala", GALA_DAY), method: "inperson" }))).toBe("Choose how you'll transfer it.");
    expect(w.no(BOB.userId, SELL({ event: NEW("Winter Gala", GALA_DAY), method: "name" }))).toBe(E.NO_ORG_NAME);
    expect(counts(w)).toEqual({ events: 1, requests: 0, listings: 1 });
  });
});

describe("what keeps its method or its rule (9m item 1: eligibility and organizer name changes)", () => {
  it("names checked at the door: an organizer name change, set without asking, for the event's flag and for the seller's answer", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const checked = NEW("Winter Ball", GALA_DAY, { club: "Wharton Graduate Association", namesChecked: true });
    const done = w.ok(ANN.userId, SELL({ event: checked }));
    const l = listingOf(w, must(done.id, "listing"));
    expect(l).toMatchObject({ method: "name", namesChecked: true });
    expect(E.methodOf(l)).toBe("name");
    expect(E.transferWords(l, "seller")).toBeNull();
    expect(w.no(BOB.userId, SELL({ eventId: l.eventId, method: "file" }))).toBe("Names are checked at entry, so it has to go through an organizer name change.");
    // The seller's own answer on a club's event that doesn't say so itself.
    const club = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Rooftop Mixer", club: "Wharton Social Committee", start: GALA_DAY })).id, "event");
    const mine = w.ok(CAT.userId, SELL({ eventId: club, namesChecked: true }));
    expect(listingOf(w, must(mine.id, "listing"))).toMatchObject({ method: "name", namesChecked: true });
    // With no organizer there is nobody to change a name.
    const open = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Open Mic", start: GALA_DAY })).id, "event");
    expect(w.no(DAN.userId, SELL({ eventId: open, namesChecked: true }))).toBe(E.NO_ORG_NAME);
    // A name-change exchange keeps its words.
    const r = invited(w, ANN, BOB, l.id); reserve(w, BOB, r);
    w.ok(BOB.userId, on("markPaid", r));
    expect(w.ok(ANN.userId, on("confirmPayment", r)).toast).toBe("Payment confirmed. Now request the name change.");
  });

  it("members-only is an eligibility rule, kept apart from any method", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    // A members-only event, and a member ticket on an open club event: both post with no method.
    const closed = w.ok(ANN.userId, SELL({ event: NEW("Members Mixer", GALA_DAY, { club: "Wharton Wine Club", attend: "members" }) }));
    const club = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Wine Tasting", club: "Wharton Wine Club", start: dateAfter(T0, 20) })).id, "event");
    const marked = w.ok(CAT.userId, SELL({ eventId: club, membersOnly: true }));
    for (const done of [closed, marked]) expect("method" in listingOf(w, must(done.id, "listing"))).toBe(false);
    expect(listingOf(w, must(marked.id, "listing")).membersOnly).toBe(true);
    // The buyer confirms membership before asking, as before.
    for (const id of [must(closed.id, "a"), must(marked.id, "b")]) {
      expect(w.no(DAN.userId, act({ type: "requestToBuy", listingId: id, qty: 1, msg: "", member: false }))).toBe("This ticket is for Wharton Wine Club members. Confirm you're a member to continue.");
      const r = must(w.ok(DAN.userId, act({ type: "requestToBuy", listingId: id, qty: 1, msg: "", member: true })).id, "request");
      expect(reqOf(w, r).memberConfirmed).toBe(true);
    }
    // And it still needs a club to be a member of.
    const open = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Open Mic", start: GALA_DAY })).id, "event");
    expect(w.no(EVE.userId, SELL({ eventId: open, membersOnly: true }))).toBe(E.NO_ORG_MEMBERS);
  });

  it("a train is an e-ticket and a trek a name change, as they were, and neither can go another way", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const train = w.ok(ANN.userId, SELL({ ask: "28", event: TRAIN("Amtrak Keystone: Philadelphia → Harrisburg", wallAfter(T0, 4, "09:05")) }));
    expect(listingOf(w, must(train.id, "listing")).method).toBe("file");
    const trek = w.ok(BOB.userId, SELL({ ask: "1100", event: TREK("Japan Trek", wallAfter(T0, 20, "08:00")) }));
    expect(listingOf(w, must(trek.id, "listing")).method).toBe("name");
    for (const done of [train, trek]) expect(E.transferWords(listingOf(w, must(done.id, "l")), "seller")).toBeNull();
    expect(w.no(CAT.userId, SELL({ ask: "28", method: "app", event: TRAIN("Amtrak Keystone: Philadelphia → Harrisburg", wallAfter(T0, 5, "09:05")) }))).toBe("Choose how you'll transfer it.");
    expect(w.no(CAT.userId, SELL({ ask: "900", method: "file", event: TREK("Iceland Trek", wallAfter(T0, 40, "08:00")) }))).toBe("Names are checked at entry, so it has to go through an organizer name change.");
    // A train keeps its two-per-person limit and closes when it leaves.
    expect(w.no(CAT.userId, SELL({ qty: 3, ask: "28", event: TRAIN("Amtrak Keystone: Philadelphia → Harrisburg", wallAfter(T0, 5, "09:05")) }))).toBe("Enter between 1 and 2 tickets (2 per person).");
    w.advance(5 * DAY);
    expect(w.no(DAN.userId, act({ type: "requestToBuy", listingId: must(train.id, "l"), qty: 1, msg: "" }))).toBe("The train has left.");
  });

  it("the preview still asks how a ticket will be transferred", () => {
    E.applyWorld(null); // the sample catalog, as the preview's page has it
    const s = seed();
    let tried = 0;
    // Every sample event with several valid ways: someone adds a ticket for it, then lists it without choosing one.
    for (const ev of E.EVENTS.slice()) {
      if (!E.isQuick(ev) || !E.access(ev).ok || E.methodsFor(ev, E.namesCheckedFor(ev, false)).length < 2) continue;
      const tier = must((ev.tiers ?? []).find((t) => !t.addOn && typeof t.price === "number"), `a ticket type of ${ev.title}`);
      for (const userId of Object.keys(E.PEOPLE)) {
        const added = E.reduce(s, userId, act({ type: "addHolding", eventId: ev.id, tier: tier.id, qty: 1, paid: String(tier.price) }));
        if (added.error !== undefined) continue; // this person can't add one here (they hold one already, or aren't eligible): try the next
        const out = E.reduce(added.state, userId, act({ type: "list", holdingId: must(added.result, "holding").id, qty: 1, ask: String(tier.price), note: "", obo: false, payHandle: "@someone" }));
        expect(out.error, `${ev.title} by ${userId}`).toBe("Choose how you'll transfer it.");
        // With a way chosen, the same listing goes through (a name change and a Ticketmaster or AXS transfer need no upload).
        expect(E.reduce(added.state, userId, act({ type: "list", holdingId: must(added.result, "holding").id, qty: 1, ask: String(tier.price), note: "", obo: false, payHandle: "@someone", method: "app" })).error, ev.title).toBeUndefined();
        tried++;
        break;
      }
    }
    expect(tried).toBeGreaterThan(0); // the sample catalog has such events, so this checked something
  });
});

// ── (b) Post request ────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("Post request: a new event and its request, stored together (9m item 3)", () => {
  it("is one live action, sent by itself (never a seq step)", () => {
    expect(E.LIVE_TYPES).toContain("postRequest");
    expect(LIVE_ACTIONS).toContain("postRequest");
    expect(E.SEQ_STEP_TYPES).not.toContain("postRequest");
    expect(SEQ_STEP_TYPES).not.toContain("postRequest");
    for (const t of ["createEvent", "saveInterest", "postTicket", "seq"]) expect(E.LIVE_TYPES, t).toContain(t);
  });

  it("stores the event and the request in one change, with the defaults: 1 ticket, no budget, until the event's cutoff", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const done = w.ok(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY) }));
    expect(w.invalid).toEqual([]);
    expect(w.outcomes).toHaveLength(1); // one change, not two
    expect(counts(w)).toEqual({ events: 1, requests: 1, listings: 0 });
    const ev = must(w.doc.events[0], "the event"), i = must(w.doc.interests[0], "the request");
    expect(ev).toMatchObject({ kind: "event", title: "Oysters", start: GALA_DAY, createdBy: ANN.userId });
    expect(i).toMatchObject({ userId: ANN.userId, eventId: ev.id, kind: "iso", status: "open", qty: 1, budget: null, note: "", expires: GALA_DAY });
    // The answer is the request; the steps name what was made.
    expect(done.id).toBe(i.id);
    expect(done.id).toMatch(ID.iso);
    expect(done.steps).toEqual([{ type: "createEvent", ok: true, id: ev.id }, { type: "saveInterest", ok: true, id: i.id }]);
    expect(done.toast).toBe(NEW_EVENT_REQ_TOAST);
    expect(done.toast).not.toContain("Oysters"); // toasts go into the actions log, which never quotes what was typed
    expect(done.notes).toEqual([]);
    // It runs until 11:59 PM Philadelphia time on the event's day.
    w.run(() => expect(E.requestEndMs(i, must(E.EV[ev.id], "event"))).toBe(E.wallToMs(`${GALA_DAY}T23:59`)));
    w.advance(19 * DAY + 11 * 60 * 60_000); // 11 PM that day: still looking
    expect(seenBy(w, BOB).wanted).toEqual([i.id]);
    w.advance(61 * 60_000); // past midnight
    expect(seenBy(w, BOB).wanted).toEqual([]);
  });

  it("takes a quantity, a budget, a note and an earlier date, each checked as a request always was", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const early = dateAfter(T0, 12);
    const done = w.ok(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY, { face: "40" }), qty: 2, budget: "35", note: "Two together, please.", expires: early }));
    expect(isoOf(w, must(done.id, "request"))).toMatchObject({ qty: 2, budget: 35, note: "Two together, please.", expires: early });
    // A blank budget is no budget: never $0.
    const blank = w.ok(BOB.userId, REQ({ event: NEW("Clambake", GALA_DAY), budget: "" }));
    expect(isoOf(w, must(blank.id, "request")).budget).toBeNull();
    const none = w.ok(CAT.userId, REQ({ event: NEW("Lobster Roll Night", GALA_DAY), budget: null }));
    expect(isoOf(w, must(none.id, "request")).budget).toBeNull();
  });

  it("a second account sees the event only together with its request", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(seenBy(w, BOB)).toMatchObject({ events: [], requests: [], wanted: [] });
    const done = w.ok(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY) }));
    const ev = must(w.doc.events[0], "the event").id;
    expect(seenBy(w, BOB)).toMatchObject({ events: [ev], requests: [done.id], wanted: [done.id], listings: [], cards: [] });
    const guest = guestViewOf(w);
    expect(guest.events.map((e) => e.id)).toEqual([ev]);
    expect(JSON.stringify(guest)).not.toContain(ANN.name); // the visitor's view still names nobody
  });

  it("a refused bundle stores nothing: no event, no request, no notification, and nobody's view changes", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const before = JSON.stringify(w.doc);
    const good = NEW("Oysters", GALA_DAY);
    // [what's wrong, the action, the refusal, the part that failed]
    const bad: [string, E.Action, string | RegExp, "event" | "request"][] = [
      ["no date", REQ({ event: NEW("Oysters", "") }), "Enter the date.", "event"],
      ["a date that has passed", REQ({ event: NEW("Oysters", dateAfter(T0, -1)) }), "Choose today or a later date.", "event"],
      ["a date that isn't one", REQ({ event: NEW("Oysters", "next Friday") }), "Enter the date.", "event"],
      ["a date more than 18 months away", REQ({ event: NEW("Oysters", dateAfter(T0, 600)) }), "The date has to be within the next 18 months.", "event"],
      ["a name too short to be one", REQ({ event: NEW("x", GALA_DAY) }), "Give the event a name (3 to 120 characters).", "event"],
      ["a face value that isn't an amount", REQ({ event: NEW("Oysters", GALA_DAY, { face: "forty" }) }), /^Face value: /, "event"],
      ["more tickets than one person may hold", REQ({ event: good, qty: 5 }), "Ask for between 1 and 4 tickets (the per-person limit for this event).", "request"],
      ["a budget that isn't an amount", REQ({ event: good, budget: "lots" }), /^Budget: /, "request"],
      ["a budget above the face value just entered", REQ({ event: NEW("Oysters", GALA_DAY, { face: "40" }), budget: "45" }), "The face value is $40, so keep your budget at or below it.", "request"],
      ["a date after the event's own", REQ({ event: good, expires: dateAfter(T0, 25) }), "A request can't outlast the event's transfer deadline.", "request"],
      ["a date that has passed, for the request", REQ({ event: good, expires: dateAfter(T0, -2) }), "Choose a deadline in the future.", "request"],
    ];
    for (const [what, action, error, part] of bad) {
      const out = w.act(ANN.userId, action);
      if (typeof error === "string") expect(out.res.error, what).toBe(error); else expect(out.res.error, what).toMatch(error);
      // Which part failed, for the page to put the words at the right field; the event is never reported as saved.
      expect(out.res.steps, what).toEqual(part === "event" ? [{ type: "createEvent", ok: false, error: out.res.error }]
        : [{ type: "createEvent", ok: false, error: NOT_SAVED }, { type: "saveInterest", ok: false, error: out.res.error }]);
      expect(JSON.stringify(w.doc), what).toBe(before);
      expect(out.notes, what).toEqual([]);
    }
    expect(w.invalid).toEqual([]); // each of those reached the engine: the rules refused them, in their own words
    // What isn't a shape the page sends never reaches the engine at all.
    for (const qty of [0, -1, 1.5, 100]) expect(w.no(ANN.userId, REQ({ event: good, qty })), String(qty)).toBe(INVALID_ACTION_ERROR);
    expect(w.no(ANN.userId, REQ({ event: good, expires: "2026-02-30" }))).toBe(INVALID_ACTION_ERROR);
    expect(JSON.stringify(w.doc)).toBe(before);
    expect(counts(w)).toEqual({ events: 0, requests: 0, listings: 0 });
    expect(w.notes).toEqual([]);
    expect(seenBy(w, BOB)).toMatchObject({ events: [], requests: [], wanted: [], cards: [] });
    expect(guestSees(w)).toMatchObject({ events: [], listings: [] });
    // And the same bundle, once it's right, goes through: the refusals left nothing in its way.
    w.ok(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY, { face: "40" }), budget: "40" }));
    expect(counts(w)).toEqual({ events: 1, requests: 1, listings: 0 });
  });

  it("refused bundles don't count toward the five events a person may add in a day; stored ones do", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    for (let k = 0; k < 6; k++) w.no(ANN.userId, REQ({ event: NEW(`Refused Night ${k}`, GALA_DAY), budget: "lots" }));
    for (let k = 1; k <= 5; k++) w.ok(ANN.userId, REQ({ event: NEW(`Open Mic ${k}`, dateAfter(T0, 10 + k)) }));
    expect(w.no(ANN.userId, REQ({ event: NEW("Open Mic 6", dateAfter(T0, 16)) }))).toBe("You've added 5 events in the last 24 hours, the most Handoff allows. Try again later.");
    expect(counts(w)).toEqual({ events: 5, requests: 5, listings: 0 });
  });

  it("needs exactly one of an event on Handoff and a new one", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Rooftop Mixer", start: dateAfter(T0, 12) })).id, "event");
    const before = JSON.stringify(w.doc);
    const NEITHER = "Choose the event you want a ticket for, or name a new one.";
    expect(w.no(ANN.userId, REQ({}))).toBe(NEITHER);
    expect(w.invalid).toEqual([]);
    expect(w.no(ANN.userId, REQ({ eventId: ev, event: NEW("Oysters", GALA_DAY) }))).toBe(INVALID_ACTION_ERROR); // no shape the page sends
    expect(w.invalid).toHaveLength(1);
    const raw = new LiveTestWorld({ doc: w.doc, people: PEOPLE6 });
    expect(raw.no(ANN.userId, REQ({ eventId: ev, event: NEW("Oysters", GALA_DAY) }))).toBe(NEITHER); // and the engine would refuse it too
    expect(raw.no(ANN.userId, REQ({ event: "Oysters" }))).toBe(NEITHER);
    expect(JSON.stringify(w.doc)).toBe(before);
  });

  it("runs in a live world only, for a signed-in person, and drops what it doesn't read", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(w.no(null, REQ({ event: NEW("Oysters", GALA_DAY) }))).toBe("Sign in to do that.");
    expect(w.no("", REQ({ event: NEW("Oysters", GALA_DAY) }))).toBe("Sign in to do that.");
    expect(counts(w)).toEqual({ events: 0, requests: 0, listings: 0 });
    // The input gate keeps only a request's own fields: no id to edit, no item, nothing unknown.
    const parsed = parseAction({ type: "postRequest", event: NEW("Oysters", GALA_DAY), qty: 1, id: "iso-0123456789abcdef", goods: { title: "Chair", cat: "Furniture" }, userId: BOB.userId, simulate: true });
    expect(parsed.ok && Object.keys(parsed.action).sort()).toEqual(["event", "qty", "type"]);
  });
});

describe("Post request on an event that's already on Handoff: the buyer's tap joins it (9m item 3)", () => {
  it("posts there and never adds an event; the defaults follow that event", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Comedy Night", start: GALA_DAY })).id, "event");
    const done = w.ok(BOB.userId, REQ({ eventId: ev }));
    expect(counts(w)).toEqual({ events: 1, requests: 1, listings: 0 });
    expect(isoOf(w, must(done.id, "request"))).toMatchObject({ userId: BOB.userId, eventId: ev, qty: 1, budget: null, expires: GALA_DAY });
    expect(done.steps).toEqual([{ type: "saveInterest", ok: true, id: done.id }]); // nothing else was made
    expect(done.toast).toMatch(/^Request posted\. /);
    expect(done.toast).not.toMatch(/new on Handoff/);
    // An event with an earlier transfer deadline: the request stops there.
    const cut = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Wine Tasting", start: GALA_DAY, deadline: wallAfter(T0, 15, "17:00") })).id, "event");
    expect(isoOf(w, must(w.ok(BOB.userId, REQ({ eventId: cut })).id, "request")).expires).toBe(dateAfter(T0, 15));
    // A train: until it leaves.
    const dep = wallAfter(T0, 6, "09:05");
    const train = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "train", title: "Amtrak Keystone: Philadelphia → Harrisburg", start: dep })).id, "train");
    const forTrain = isoOf(w, must(w.ok(BOB.userId, REQ({ eventId: train })).id, "request"));
    expect(forTrain.expires).toBe(dep.slice(0, 10));
    w.run(() => expect(E.requestEndMs(forTrain, must(E.EV[train], "train"))).toBe(E.wallToMs(dep)));
  });

  it("a classmate with a listing for it is told, as for any request", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const lid = must(w.ok(ANN.userId, SELL({ event: NEW("Comedy Night", GALA_DAY), ask: "25" })).id, "listing");
    const ev = listingOf(w, lid).eventId;
    const done = w.ok(BOB.userId, REQ({ eventId: ev }));
    expect(textsFor(done.notes, ANN)).toHaveLength(1);
    expect(textsFor(done.notes, ANN)[0]).toMatch(/is looking for 1 ticket for Comedy Night\./);
  });

  it("one request per person and event: posting again updates it, never doubles it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Comedy Night", start: GALA_DAY })).id, "event");
    const first = w.ok(BOB.userId, REQ({ eventId: ev }));
    const again = w.ok(BOB.userId, REQ({ eventId: ev, qty: 2 }));
    expect(again.id).toBe(first.id);
    expect(again.toast).toBe("Request updated. You have one request for this event.");
    expect(counts(w)).toEqual({ events: 1, requests: 1, listings: 0 });
    expect(isoOf(w, must(first.id, "request")).qty).toBe(2);
  });

  it("refuses an event that was removed, is over, or isn't there, and adds nothing", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const gone = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Oystrs", start: GALA_DAY })).id, "event");
    w.ok(ANN.userId, act({ type: "removeEvent", eventId: gone }));
    const soon = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Comedy Night", start: dateAfter(T0, 1) })).id, "event");
    const before = JSON.stringify(w.doc);
    expect(w.no(BOB.userId, REQ({ eventId: gone }))).toBe("This event was removed.");
    expect(w.no(BOB.userId, REQ({ eventId: "ev-0123456789abcdef" }))).toBe("Choose an event.");
    expect(JSON.stringify(w.doc)).toBe(before);
    w.advance(2 * DAY);
    expect(w.no(BOB.userId, REQ({ eventId: soon }))).toBe("The event is over.");
    expect(counts(w)).toEqual({ events: 1, requests: 0, listings: 0 });
  });
});

describe("the same event twice: never merged, never doubled (9m item 3)", () => {
  it("an exact twin of an open event is refused with the choice spelled out; tapping the match posts there", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.ok(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY) }));
    const ev = must(w.doc.events[0], "event").id;
    const before = JSON.stringify(w.doc);
    for (const title of ["Oysters", "oysters", "  OYSTERS ", "Oysters!"]) {
      const out = w.act(BOB.userId, REQ({ event: NEW(title, GALA_DAY) }));
      expect(out.res.error, title).toBe(TWIN_REQ);
      expect(out.res.steps, title).toEqual([{ type: "createEvent", ok: false, error: TWIN_REQ }]);
    }
    expect(TWIN_REQ).not.toContain("Oysters"); // refusals go into the actions log: never the name that was typed
    expect(E.TWIN_EVENT_REQUEST).toBe(TWIN_REQ);
    expect(JSON.stringify(w.doc)).toBe(before); // nothing of Bob's was stored, and nothing was joined for him
    // Bob's own tap on the match is what joins it.
    w.ok(BOB.userId, REQ({ eventId: ev }));
    expect(counts(w)).toEqual({ events: 1, requests: 2, listings: 0 });
    expect(new Set(w.doc.interests.map((i) => i.eventId))).toEqual(new Set([ev]));
    // An event a seller made with Post ticket is a twin too, and the other way round.
    expect(w.no(CAT.userId, SELL({ event: NEW("Oysters", GALA_DAY) }))).toBe(E.TWIN_EVENT);
    w.ok(CAT.userId, SELL({ event: NEW("Clambake", GALA_DAY) }));
    expect(w.no(DAN.userId, REQ({ event: NEW("clambake", GALA_DAY) }))).toBe(TWIN_REQ);
  });

  it("the same buyer sending the same new event again as a new change (a lost answer, then a changed quantity) ends with one event and one request", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const first = w.ok(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY) }));
    expect(w.no(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY), qty: 2 }))).toBe(TWIN_REQ);
    expect(w.no(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY) }))).toBe(TWIN_REQ);
    expect(counts(w)).toEqual({ events: 1, requests: 1, listings: 0 });
    // Their tap on the match (what the form offers after the refusal) updates the one request they have.
    const again = w.ok(ANN.userId, REQ({ eventId: must(w.doc.events[0], "event").id, qty: 2 }));
    expect(again.id).toBe(first.id);
    expect(counts(w)).toEqual({ events: 1, requests: 1, listings: 0 });
  });

  it("a different date, a different departure or a name with something added is its own event; seatings and departures stay apart", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.ok(ANN.userId, REQ({ event: NEW("Oysters", GALA_DAY) }));
    w.ok(BOB.userId, REQ({ event: NEW("Oysters", dateAfter(T0, 26)) })); // the same name a week later
    w.ok(CAT.userId, REQ({ event: NEW("Oysters (9:30 PM seating)", GALA_DAY) })); // another seating that day, told apart by its name
    w.ok(DAN.userId, REQ({ event: NEW("Oysters 2026", GALA_DAY) })); // a longer name is another name: nothing fuzzy
    expect(counts(w)).toEqual({ events: 4, requests: 4, listings: 0 });
    expect(new Set(w.doc.interests.map((i) => i.eventId)).size).toBe(4);
    // Trains: the same name at another time is another departure; at the same minute it's the same train.
    const day = dateAfter(T0, 6), name = "Amtrak Northeast Regional: Philadelphia → New York";
    const am = w.ok(ANN.userId, REQ({ event: TRAIN(name, `${day}T09:05`) }));
    const pm = w.ok(BOB.userId, REQ({ event: TRAIN(name, `${day}T15:10`) }));
    expect(w.no(CAT.userId, REQ({ event: TRAIN("amtrak northeast regional: philadelphia -> new york", `${day}T09:05`) }))).toBe(TWIN_TRAIN_REQ);
    expect(am.toast).toBe("Request posted. Matches show at the bell and in My activity. Its train is new on Handoff and shows as added by you."); // §9q item 4
    // Each request runs until its own train leaves.
    const [iAm, iPm] = [isoOf(w, must(am.id, "am")), isoOf(w, must(pm.id, "pm"))];
    w.run(() => {
      expect(E.requestEndMs(iAm, must(E.EV[iAm.eventId as string], "am train"))).toBe(E.wallToMs(`${day}T09:05`));
      expect(E.requestEndMs(iPm, must(E.EV[iPm.eventId as string], "pm train"))).toBe(E.wallToMs(`${day}T15:10`));
    });
    // A trek with the same name and start is the same trek.
    w.ok(DAN.userId, REQ({ event: TREK("Japan Trek", wallAfter(T0, 20, "08:00")) }));
    expect(w.no(EVE.userId, REQ({ event: TREK("Japan Trek", wallAfter(T0, 20, "08:00")) }))).toBe(TWIN_TREK_REQ);
  });
});

describe("the actions Post request is made of keep working", () => {
  it("createEvent alone still adds an event with nothing on it, and saveInterest still posts and edits a request", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Oysters", start: GALA_DAY })).id, "event");
    expect(counts(w)).toEqual({ events: 1, requests: 0, listings: 0 });
    const iso = must(w.ok(BOB.userId, act({ type: "saveInterest", data: { eventId: ev, qty: 1, budget: "", note: "" } })).id, "request");
    w.ok(BOB.userId, act({ type: "saveInterest", data: { id: iso, eventId: ev, qty: 2, budget: "20", note: "" } }));
    expect(isoOf(w, iso)).toMatchObject({ qty: 2, budget: 20 });
    w.ok(BOB.userId, act({ type: "closeInterest", id: iso, reason: "cancelled" }));
    expect(isoOf(w, iso).status).toBe("closed");
  });
});

// ── (c) Quantity ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("quantity (9n)", () => {
  it("Post ticket and Post request default to one when the quantity is left out", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const l = w.ok(ANN.userId, act({ type: "postTicket", ask: "25", event: NEW("Comedy Night", GALA_DAY) }));
    expect(w.invalid).toEqual([]);
    expect(listingOf(w, must(l.id, "listing")).listed).toBe(1);
    expect(must(w.doc.holdings[0], "the ticket").qty).toBe(1);
    const i = w.ok(BOB.userId, act({ type: "postRequest", eventId: listingOf(w, must(l.id, "listing")).eventId }));
    expect(isoOf(w, must(i.id, "request")).qty).toBe(1);
  });

  it("two same-price tickets are one listing, and its line reads \"2 tickets · $25 each\"", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const done = w.ok(ANN.userId, SELL({ event: NEW("Comedy Night", GALA_DAY), qty: 2, ask: "25" }));
    expect(counts(w)).toEqual({ events: 1, requests: 0, listings: 1 });
    const l = listingOf(w, must(done.id, "listing"));
    expect(l).toMatchObject({ listed: 2, ask: 25 });
    expect(E.qtyLine(2, 25)).toBe("2 tickets · $25 each");
    expect(E.qtyLine(1, 25)).toBe("1 ticket · $25");
    expect(E.qtyLine(3, 12.5, "spot")).toBe("3 spots · $12.50 each");
    // One listing, for a visitor too (SELL5-M1: its share link's check was removed with outward Share, §9v item 3; its ordinary URL
    // opens it for anyone the guest view holds it for, below).
    inBrowser(w, ANN, (_v, s) => {
      expect(E.qtyLine(E.listingNumbers(s, must(s.listings.find((x) => x.id === l.id), "copy")).available, l.ask)).toBe("2 tickets · $25 each");
    });
    expect(must(guestViewOf(w).listings[0], "the visitor's copy")).toMatchObject({ id: l.id, ask: 25, available: 2 });
  });

  it("a buyer is offered a quantity only when they may take more than one: what's available, and the per-person limit", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    setMethods(w, ANN, [{ kind: "venmo", value: "ann-lee" }]);
    const two = must(w.ok(ANN.userId, SELL({ event: NEW("Comedy Night", GALA_DAY, { perPerson: 2 }), qty: 2, ask: "25" })).id, "listing");
    const ev = listingOf(w, two).eventId;
    const one = must(w.ok(CAT.userId, SELL({ eventId: ev, qty: 1, ask: "24" })).id, "listing");
    const max = (who: TestPerson, lid: string) => inBrowser(w, who, (_v, s) => E.buyerMax(s, who.userId, must(s.listings.find((x) => x.id === lid), "listing") as E.Listing));
    expect(max(BOB, two)).toBe(2); // two available, and Bob may hold two
    expect(max(BOB, one)).toBe(1); // only one there: no choice to offer
    expect(max(ANN, one)).toBe(0); // Ann already holds her two for this event
    // Bob reserves one of the two: one is left for anyone, and Bob may take one more.
    const r = invited(w, ANN, BOB, two); reserve(w, BOB, r);
    expect(max(DAN, two)).toBe(1);
    expect(max(BOB, one)).toBe(1);
    w.ok(BOB.userId, on("markPaid", r)); w.ok(ANN.userId, on("confirmPayment", r)); w.ok(ANN.userId, on("markTransferred", r)); w.ok(BOB.userId, on("buyerReceived", r));
    setMethods(w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    const r2 = invited(w, CAT, BOB, one); reserve(w, BOB, r2);
    expect(max(BOB, two)).toBe(0); // Bob holds one and has reserved another: at the limit
    // The server agrees with what the page would offer.
    expect(w.no(BOB.userId, act({ type: "requestToBuy", listingId: two, qty: 1, msg: "" }))).toBe("That would take you over 2 per person for this event, counting tickets you hold or have reserved.");
    expect(w.no(DAN.userId, act({ type: "requestToBuy", listingId: two, qty: 2, msg: "" }))).toBe("Choose between 1 and 1 ticket.");
    // On the server's own document it gives the same answers.
    expect(w.run(() => E.buyerMax(w.doc, DAN.userId, listingOf(w, two)))).toBe(1);
    expect(w.run(() => E.buyerMax(w.doc, BOB.userId, listingOf(w, two)))).toBe(0);
  });

  it("reserving 1 of 2 leaves 1 available at the same price, on the same listing and link", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    setMethods(w, ANN, [{ kind: "venmo", value: "ann-lee" }]);
    const lid = must(w.ok(ANN.userId, SELL({ event: NEW("Comedy Night", GALA_DAY), qty: 2, ask: "25" })).id, "listing");
    const r = ask(w, BOB, lid); // one, the default
    expect(reqOf(w, r).qty).toBe(1);
    invite(w, ANN, r);
    expect(numbers(w, lid)).toEqual({ reserved: 0, completed: 0, available: 2 }); // an invitation holds nothing
    const held = reserve(w, BOB, r);
    expect(held.toast).toMatch(/^Reserved for 15 minutes\. Pay Ann \$25 now, /);
    expect(numbers(w, lid)).toEqual({ reserved: 1, completed: 0, available: 1 });
    expect(listingOf(w, lid)).toMatchObject({ listed: 2, ask: 25 });
    expect(counts(w).listings).toBe(1);
    // A second account and a visitor: the same listing, one ticket, the same price.
    expect(must(viewOf(w, CAT).listings.find((l) => l.id === lid), "Cat's copy")).toMatchObject({ ask: 25, numbers: { available: 1, reserved: 1 } });
    expect(must(guestViewOf(w).listings.find((l) => l.id === lid), "the visitor's copy")).toMatchObject({ ask: 25, available: 1 });
    inBrowser(w, CAT, (_v, s) => { // the link still opens it: the guest view holds it, with one available (above; guestSees, its old test, went with Share)
      expect(E.qtyLine(E.listingNumbers(s, must(s.listings.find((x) => x.id === lid), "copy")).available, 25)).toBe("1 ticket · $25");
    });
    // The other one sells to someone else at the same price; then nothing is left.
    const r2 = invited(w, ANN, CAT, lid); reserve(w, CAT, r2);
    expect(reqOf(w, r2).price).toBe(25);
    expect(numbers(w, lid)).toEqual({ reserved: 2, completed: 0, available: 0 });
  });

  it("the total is quantity × price, before reserving and after", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    setMethods(w, ANN, [{ kind: "venmo", value: "ann-lee" }]);
    const lid = must(w.ok(ANN.userId, SELL({ event: NEW("Comedy Night", GALA_DAY), qty: 2, ask: "25" })).id, "listing");
    const r = ask(w, BOB, lid, { qty: 2 });
    const l = listingOf(w, lid);
    expect(E.totalOf(reqOf(w, r), l)).toBe(50);
    expect(E.totalOf({ qty: 2 }, l)).toBe(50); // a quantity not yet sent, at the asking price
    expect(E.totalOf({ qty: 1 }, l)).toBe(25);
    invite(w, ANN, r);
    // The buyer's copy of the invitation, before anything is held: the same total.
    inBrowser(w, BOB, (v) => {
      const mine = must(v.requests.find((x) => x.id === r), "Bob's invitation"), copy = must(v.listings.find((x) => x.id === lid), "the listing");
      expect(mine).toMatchObject({ status: "invited", qty: 2, price: 25 });
      expect(E.totalOf(mine as unknown as E.TicketRequest, copy as unknown as E.Listing)).toBe(50);
    });
    expect(reserve(w, BOB, r).toast).toMatch(/Pay Ann \$50 now/);
    expect(reqOf(w, r).history.map((h) => h.text).join("\n")).not.toMatch(/\$100/);
    w.ok(BOB.userId, on("markPaid", r));
    expect(reqOf(w, r).history.map((h) => h.text)).toContain("Buyer said they paid $50 by Venmo (self-reported)");
    // An offer the seller agreed to: the total follows the agreed price.
    const obo = must(w.ok(CAT.userId, SELL({ eventId: l.eventId, qty: 2, ask: "30", obo: true })).id, "listing");
    setMethods(w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    const offer = ask(w, DAN, obo, { qty: 2, amount: "20" });
    expect(E.totalOf(reqOf(w, offer), listingOf(w, obo))).toBe(40);
  });
});
