// The WhatsApp-short ISO and the Sell and payment polish (USER-INSTRUCTIONS §9q items 4 and 5), the server half.
// (a) A posted request says where matches show: at the bell and in My activity (email is the page's to add, only while it's on).
// (b) A members-only ticket for an event that names no club takes the club its seller names: stored on the listing, shown to every
//     buyer and to a signed-out visitor before they ask, and used in the buyer's confirmation, which the server still requires.
//     Without a name it's refused as before; an event with a club keeps its own.
// (c) Payment methods: Venmo and Zelle are the kinds offered as new; PayPal stays a kind the server takes, so a person who saved it
//     keeps it and every exchange keeps the details it was reserved with.
// (d) Email: the two parties of a ticket exchange see each other's email from the reservation to the transfer, and not before.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { parseAction } from "../live.js";
import { ask, invite, must, on, reqOf, reserve, resetEngine, setMethods, textsFor } from "./helpers/invite.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, EVE, T0, dateAfter, type LiveTestWorld } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as E.Action;
const DAY19 = dateAfter(T0, 19);
const NEW = (title: string, date: string, over: Record<string, unknown> = {}) => ({ kind: "event", title, start: date, ...over });
const SELL = (over: Record<string, unknown>) => act({ type: "postTicket", ask: "30", note: "", obo: false, ...over });
const REQ = (over: Record<string, unknown>) => act({ type: "postRequest", ...over });
const listingOf = (w: LiveTestWorld, id: string) => must(w.doc.listings.find((l) => l.id === id), `listing ${id}`);
const WHERE = "Matches show at the bell and in My activity.";

describe("a posted request says where matches show (9q item 4)", () => {
  it("names the bell and My activity, for an event on Handoff and for a new one", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(E.MATCHES_WHERE).toBe(WHERE);
    // A new event, made with the request: name and date only.
    const fresh = w.ok(DAN.userId, REQ({ event: NEW("Oysters", DAY19) }));
    expect(fresh.toast).toBe(`Request posted. ${WHERE} Its event is new on Handoff and shows as added by you.`);
    expect(w.doc.events).toHaveLength(1);
    expect(w.doc.interests).toHaveLength(1);
    expect(w.doc.interests[0]).toMatchObject({ qty: 1, budget: null, status: "open" }); // one ticket, no budget
    // An event on Handoff: with nothing listed, and with a seller who is told.
    const ev = must(w.doc.events[0], "event").id;
    expect(w.ok(CAT.userId, REQ({ eventId: ev })).toast).toBe(`Request posted. ${WHERE}`);
    w.ok(ANN.userId, SELL({ eventId: ev }));
    expect(w.ok(BOB.userId, REQ({ eventId: ev })).toast).toBe(`Request posted. 1 seller with a listing for this event was told. ${WHERE}`);
    // The older action says the same in the live market.
    const second = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Open Mic", start: dateAfter(T0, 21) })).id, "event");
    expect(w.ok(EVE.userId, act({ type: "saveInterest", data: { eventId: second, qty: 1, budget: "", note: "" } })).toast).toBe(`Request posted. ${WHERE}`);
    // The message never promises email: that is the page's to add, only while the buyer has it on and it's available.
    for (const o of w.outcomes) expect(o.res.toast ?? "").not.toMatch(/email/i);
  });
});

describe("a members-only ticket names its club when the event names none (9q item 5)", () => {
  it("is refused without a club's name, as before, and with a name that isn't one", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const open = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Quiz Night", start: DAY19 })).id, "event");
    expect(w.no(EVE.userId, SELL({ eventId: open, membersOnly: true }))).toBe(E.NO_ORG_MEMBERS);
    expect(w.no(EVE.userId, SELL({ eventId: open, membersOnly: true, memberClub: "" }))).toBe(E.NO_ORG_MEMBERS);
    expect(w.no(EVE.userId, SELL({ eventId: open, membersOnly: true, memberClub: "Q" }))).toBe(E.NO_MEMBER_CLUB);
    expect(w.no(EVE.userId, SELL({ eventId: open, membersOnly: true, memberClub: "??" }))).toBe(E.NO_MEMBER_CLUB);
    expect(w.doc.listings).toHaveLength(0);
    // A new event made with the ticket still needs its own club for a members-only ticket.
    expect(w.no(EVE.userId, SELL({ event: NEW("Open Mixer", DAY19), membersOnly: true }))).toBe(E.NO_ORG_MEMBERS);
  });

  it("stores the named club on the listing, shows it to every buyer and visitor, and asks the buyer to confirm it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const open = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Quiz Night", start: DAY19 })).id, "event");
    const done = w.ok(EVE.userId, SELL({ eventId: open, membersOnly: true, memberClub: "  Quiz   League " }));
    const l = listingOf(w, must(done.id, "listing"));
    expect(l).toMatchObject({ membersOnly: true, memberClub: "Quiz League" });
    expect("method" in l).toBe(false); // still no promised delivery method: an eligibility rule, not a transfer rule
    const ev = must(w.doc.events.find((e) => e.id === open), "event");
    expect(ev.club ?? "").toBe(""); // the event itself is unchanged
    w.run(() => {
      expect(E.memberClubOf(E.EV[open], l)).toBe("Quiz League");
      expect(E.membersOnlyListing(must(E.EV[open], "event"), l)).toBe(true);
    });
    // Before anyone asks: a signed-in classmate's view and a signed-out visitor's both carry the named club.
    expect(viewOf(w, DAN).listings.find((x) => x.id === l.id)).toMatchObject({ membersOnly: true, memberClub: "Quiz League" });
    expect(guestViewOf(w).listings.find((x) => x.id === l.id)).toMatchObject({ membersOnly: true, memberClub: "Quiz League" });
    // The server still enforces it: no request without the buyer's confirmation, and the words name the club.
    expect(w.no(DAN.userId, act({ type: "requestToBuy", listingId: l.id, qty: 1, msg: "", member: false }))).toBe("This ticket is for Quiz League members. Confirm you're a member to continue.");
    const r = ask(w, DAN, l.id, { member: true });
    expect(reqOf(w, r).memberConfirmed).toBe(true);
    expect(reqOf(w, r).history.map((h) => h.text)).toContain("Buyer confirmed they're a Quiz League member (not checked by Handoff)");
  });

  it("an event with a club keeps its own, and a name sent for it is dropped", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const club = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Wine Tasting", club: "Wharton Wine Club", start: DAY19 })).id, "event");
    const l = listingOf(w, must(w.ok(CAT.userId, SELL({ eventId: club, membersOnly: true, memberClub: "Some Other Club" })).id, "listing"));
    expect(l.membersOnly).toBe(true);
    expect("memberClub" in l).toBe(false);
    w.run(() => expect(E.memberClubOf(E.EV[club], l)).toBe("Wharton Wine Club"));
    expect(w.no(DAN.userId, act({ type: "requestToBuy", listingId: l.id, qty: 1, msg: "", member: false }))).toBe("This ticket is for Wharton Wine Club members. Confirm you're a member to continue.");
    // A ticket that isn't members-only never carries a club, whatever is sent.
    const plain = listingOf(w, must(w.ok(ANN.userId, SELL({ eventId: club, memberClub: "Quiz League" })).id, "listing"));
    expect("memberClub" in plain).toBe(false);
    expect("membersOnly" in plain).toBe(false);
    // A new event made with the ticket: the club typed for the event is the ticket's club.
    const fresh = listingOf(w, must(w.ok(EVE.userId, SELL({ event: NEW("Members Tasting", dateAfter(T0, 22), { club: "Wharton Wine Club" }), membersOnly: true })).id, "listing"));
    expect(fresh.membersOnly).toBe(true);
    expect("memberClub" in fresh).toBe(false);
  });

  it("the input gate takes the club's name with a listing, and nothing unsafe", () => {
    const base = { type: "postTicket", eventId: "ev-0123456789abcdef", qty: 1, ask: "30", note: "", obo: false, membersOnly: true };
    const ok = parseAction({ ...base, memberClub: "Quiz League" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((ok.action as unknown as Record<string, unknown>).memberClub).toBe("Quiz League");
    expect(parseAction({ ...base, memberClub: null }).ok).toBe(true);
    expect(parseAction({ ...base, memberClub: 7 }).ok).toBe(false);
    expect(parseAction({ ...base, memberClub: "x".repeat(400) }).ok).toBe(false);
  });
});

describe("payment methods: Venmo and Zelle are offered as new; PayPal is kept (9q item 5)", () => {
  it("names the kinds offered as new, and the refusal for none names only those", () => {
    expect([...E.PAY_NEW_KINDS]).toEqual(["venmo", "zelle"]);
    expect([...E.PAY_KINDS]).toEqual(["venmo", "zelle", "paypal"]); // PayPal is still a kind the server takes
    expect(E.NO_PAY_METHODS).toBe("Add how buyers can pay you: Venmo or Zelle.");
    expect(E.NO_PAY_METHODS).not.toMatch(/PayPal/);
  });

  it("a person with PayPal saved keeps it, can save it again, and their exchange keeps it", () => {
    expect(E.checkPayMethods([{ kind: "paypal", value: "ann.lee" }])).toEqual({ ok: true, methods: [{ kind: "paypal", value: "ann.lee" }] });
    expect(E.checkPayMethods([{ kind: "paypal", value: "ann.lee" }, { kind: "venmo", value: "@ann-lee" }])).toEqual({ ok: true, methods: [{ kind: "paypal", value: "ann.lee" }, { kind: "venmo", value: "ann-lee" }] });
    const w = new ServerWorld({ people: PEOPLE6 });
    setMethods(w, ANN, [{ kind: "paypal", value: "ann.lee" }]);
    const l = must(w.ok(ANN.userId, SELL({ event: NEW("Spring Gala", DAY19) })).id, "listing");
    const r = ask(w, DAN, l); invite(w, ANN, r); reserve(w, DAN, r);
    expect(reqOf(w, r).pay).toEqual([{ kind: "paypal", value: "ann.lee" }]);
    // The seller switches to Venmo afterwards: the exchange keeps what it was reserved with, and the next one copies the new method.
    setMethods(w, ANN, [{ kind: "venmo", value: "ann-lee" }]);
    w.ok(DAN.userId, act({ type: "markPaid", requestId: r }));
    expect(reqOf(w, r).pay).toEqual([{ kind: "paypal", value: "ann.lee" }]);
    const l2 = must(w.ok(ANN.userId, SELL({ event: NEW("Summer Gala", dateAfter(T0, 25)) })).id, "listing");
    const r2 = ask(w, BOB, l2); invite(w, ANN, r2); reserve(w, BOB, r2);
    expect(reqOf(w, r2).pay).toEqual([{ kind: "venmo", value: "ann-lee" }]); // a saved method carries into the next paid exchange
  });

  it("posting needs no method; the first invitation asks for one, in the new words", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    setMethods(w, CAT, []);
    const l = must(w.ok(CAT.userId, SELL({ event: NEW("Spring Gala", DAY19) })).id, "listing");
    const r = ask(w, DAN, l);
    expect(w.no(CAT.userId, act({ type: "invite", requestId: r }))).toBe("Add how buyers can pay you: Venmo or Zelle.");
    setMethods(w, CAT, [{ kind: "zelle", value: "cat@upenn.edu" }]);
    invite(w, CAT, r); reserve(w, DAN, r);
    expect(reqOf(w, r).pay).toEqual([{ kind: "zelle", value: "cat@upenn.edu" }]);
  });
});

describe("email: each party sees the other's from the reservation to the transfer, and not before (9q item 4)", () => {
  const contactOf = (w: LiveTestWorld, viewer: typeof ANN, other: typeof ANN) => (viewOf(w, viewer).people[other.userId] as { contact?: string } | undefined)?.contact ?? null;
  it("before the reservation neither has it; once reserved both do; a third account and a visitor never do", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const l = must(w.ok(ANN.userId, SELL({ event: NEW("Spring Gala", DAY19) })).id, "listing");
    const r = ask(w, DAN, l);
    expect([contactOf(w, DAN, ANN), contactOf(w, ANN, DAN)]).toEqual([null, null]); // a request to buy
    invite(w, ANN, r);
    expect([contactOf(w, DAN, ANN), contactOf(w, ANN, DAN)]).toEqual([null, null]); // invited, not reserved: still nothing
    reserve(w, DAN, r);
    const seller = contactOf(w, DAN, ANN), buyer = contactOf(w, ANN, DAN);
    expect(typeof seller).toBe("string"); expect(typeof buyer).toBe("string"); // reserved: each sees the other's
    expect(seller).toMatch(/@/); expect(buyer).toMatch(/@/);
    expect(contactOf(w, BOB, ANN)).toBeNull(); expect(contactOf(w, BOB, DAN)).toBeNull(); // a third account: neither
    expect(JSON.stringify(guestViewOf(w))).not.toContain(String(seller));
    expect(JSON.stringify(guestViewOf(w))).not.toContain(String(buyer));
    // Through payment and sending they stay; once the buyer confirms receipt the exchange is over and they go.
    w.ok(DAN.userId, on("markPaid", r)); w.ok(ANN.userId, on("confirmPayment", r));
    expect([contactOf(w, DAN, ANN), contactOf(w, ANN, DAN)]).toEqual([seller, buyer]);
    w.ok(ANN.userId, on("markTransferred", r)); w.ok(DAN.userId, on("buyerReceived", r));
    expect([contactOf(w, DAN, ANN), contactOf(w, ANN, DAN)]).toEqual([null, null]);
    expect(textsFor(w.notes, DAN).join("\n")).not.toContain(String(seller)); // no notification ever carried it
  });
});
