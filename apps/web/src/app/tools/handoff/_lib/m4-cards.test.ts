// SELL5-M4 (USER-INSTRUCTIONS §9v item 1, with §9w folded in): Available and Wanted easy to scan. The page's rules with no page in them:
// - the category row: each of the five has an icon from Handoff's own set and a visible label (grid All, ticket Events, train Trains,
//   mountain Treks, bag Goods) (routes.js BOARD_ROW);
// - a card's visual is its row category's icon (or a Goods seller's photo), the same on Available and Wanted: no guessed title cue, no
//   month/day tile (§9v supersedes §9s item 7's tile rules) (look.js). §9x item 2 (SELL6-N2) restores the choice of icon (a stated
//   category, then a cue in the title, then the neutral ticket; an item's category icon), still without a date tile and still the same
//   on both boards: the four expectations that pinned "no cue" below now pin that (recorded in suite-changes-live.md, "Final batch (9x)" >
//   "Step SELL6-N2"); the rule's own tests are in n2-cards.test.ts;
// - a Wanted card's header line leads with how many are wanted and any stated budget, "2 tickets wanted · Up to $30 each" (§9w); a note
//   shows on the card only when it's short (longer ones are on the request page); a match is shown to the requester (cards.js);
// - Available's price line says the face value only when it isn't the price itself, and a members-only event names its club (cards.js);
// - "List and invite" says "You'll invite Dan to pay $30 for 1 ticket." before the tap and lands "Ticket listed. Invitation sent to Dan."
//   (§9w; answer.js).
// Pure functions over the engine; no DOM, no server, no sign-in.
import { describe, expect, it } from "vitest";
import { BOARD_ROW, DISC_CATS } from "./routes";
import { BOARD_LOOK, eventKind, eventLook, itemLook, lookKey, requestLook } from "./look";
import { CARD_NOTE_MAX, cardNote, faceCaption, membersTag, showsMatch, wantedHead } from "./cards";
import { answerHint, answerLanding, answerSummary } from "./answer";

/** An event as a view holds it; only what the rules read matters here. */
const ev = (title: string, start: string, over: Record<string, unknown> = {}) => Object.freeze({ id: "ev-00000000000000c1", kind: "event", title, club: "", cat: "", start, attend: "all", tiers: [], ...over });
const TRAIN = ev("Acela PHL to NYC", "2026-11-22T09:05", { kind: "train", cat: "Travel" });
const TREK = ev("Lisbon Spring Trek", "2026-12-26T08:00", { kind: "trek", cat: "Treks & trips", club: "Wharton Travel Club" });
const GALA = ev("Fall Gala", "2026-12-01", { cat: "Parties", club: "GCC" });
const OYSTERS = ev("Oysters Night", "2026-11-25");
const VAGUE = ev("L1 Something", "2026-11-28");
const PHOTO = "/tools/handoff/photo/g0000000000000001?v=0123456789abcdef";

describe("the category row: an icon and a visible label on each of the five (9v item 1)", () => {
  it("grid All, ticket Events, train Trains, mountain Treks, bag Goods, in that order", () => {
    expect(BOARD_ROW).toEqual([["all", "All", "grid"], ["events", "Events", "ticket"], ["trains", "Trains", "train"], ["treks", "Treks", "mountain"], ["goods", "Goods", "bag"]]);
  });
  it("the same keys and labels as the categories the boards narrow by", () => {
    expect(BOARD_ROW.map(([k, l]) => [k, l])).toEqual(DISC_CATS.map(([k, l]) => [k, l]));
  });
});

describe("a card's visual is the same on both boards (9v item 1); since 9x item 2 it is chosen again: a stated category, a cue in the title, else the row's own icon", () => {
  it("an event's kind is the row category it's listed under", () => {
    expect(eventKind(TRAIN)).toBe("trains");
    expect(eventKind(TREK)).toBe("treks");
    expect(eventKind(GALA)).toBe("events");
    expect(eventKind(OYSTERS)).toBe("events");
    expect(eventKind(null)).toBe("events");
  });
  it("each kind's look uses the row's icon for it", () => {
    for (const [k, , icon] of BOARD_ROW) if (k !== "all") expect(BOARD_LOOK[k as keyof typeof BOARD_LOOK].icon, k).toBe(icon);
  });
  it("no month/day tile; a stated category or a cue in the title chooses the icon again (9x item 2; 9v had: no guessed title cue)", () => {
    expect(eventLook(OYSTERS)).toEqual({ kind: "icon", icon: "wine", color: "var(--c-wine)", cat: "events", of: "Food & drink", from: "title" }); // 9v: the ticket; 9x: wine again, from the title
    expect(eventLook(GALA).icon).toBe("music");                      // 9v: the ticket; 9x: the Parties category's music note again
    expect(eventLook(VAGUE)).toMatchObject({ kind: "icon", icon: "ticket" }); // was the NOV 28 tile
    expect(eventLook(ev("Comedy Night", "2026-11-28")).icon).toBe("ticket");
    expect(eventLook(TRAIN)).toMatchObject({ kind: "icon", icon: "train", cat: "trains" });
    expect(eventLook(TREK)).toMatchObject({ kind: "icon", icon: "mountain", cat: "treks" }); // was the plane
    expect(eventLook(null)).toMatchObject({ kind: "icon", icon: "ticket" });
  });
  it("a request shows exactly its event's look, so one event looks the same on Available and Wanted", () => {
    for (const e of [TRAIN, TREK, GALA, OYSTERS, VAGUE]) expect(requestLook({ eventId: e.id, qty: 2, budget: 40 }, e)).toEqual(eventLook(e));
    expect(requestLook({ qty: 1, missing: { title: "Wine Club tasting", when: "2026-12-04" } }, null)).toEqual(eventLook(ev("Wine Club tasting", "2026-12-04"))); // an older request for an event not on Handoff: an event of that name (9v: eventLook(null))
  });
  it("Goods: the seller's real photo, else the item category's icon, else the bag, the same on both boards (9x item 2; 9v had: the bag whatever the category)", () => {
    expect(itemLook()).toEqual({ kind: "icon", icon: "bag", color: BOARD_LOOK.goods.color, cat: "goods", of: null, from: "kind" });
    expect(requestLook({ goods: { title: "Bike lock", cat: "Sports & outdoor" }, qty: 1 }, null)).toEqual(itemLook()); // was the mountain (Sports & outdoor)
    expect(requestLook({ goods: { title: "Sofa", cat: "Furniture" }, qty: 1 }, null)).toEqual(itemLook("Furniture")); // 9v: the bag; 9x: the sofa again
    expect(requestLook({ goods: { title: "Sofa", cat: "Furniture" }, qty: 1 }, null).icon).toBe("sofa");
    expect(itemLook(null, PHOTO)).toMatchObject({ kind: "photo", src: PHOTO, icon: "bag", from: "photo" });
    expect(requestLook({ goods: { title: "Desk lamp", cat: "Home & kitchen" }, qty: 1 }, null, PHOTO)).toEqual(itemLook("Home & kitchen", PHOTO));
    expect(itemLook("")).toEqual(itemLook());
    expect(requestLook({ eventId: GALA.id, qty: 1 }, GALA, PHOTO)).toEqual(eventLook(GALA)); // a photo never replaces an event's look
  });
  it("names each look one way wherever it's drawn: an icon's name or a photo", () => {
    const keys = new Set([TRAIN, TREK, GALA, OYSTERS, VAGUE, null].map((e) => lookKey(eventLook(e))));
    expect([...keys].sort()).toEqual(["icon:mountain", "icon:music", "icon:ticket", "icon:train", "icon:wine"]); // 9v: mountain, ticket, train
    expect(lookKey(itemLook())).toBe("icon:bag");
    expect(lookKey(itemLook(null, PHOTO))).toBe("photo");
  });
  it("is display only: the event is left as it was", () => {
    const before = JSON.stringify(GALA);
    eventLook(GALA); requestLook({ eventId: GALA.id, qty: 1 }, GALA);
    expect(JSON.stringify(GALA)).toBe(before);
  });
});

describe("Wanted's header line: how many are wanted and any stated budget (9w)", () => {
  it("leads with the quantity, then the budget per ticket", () => {
    expect(wantedHead({ qty: 2, budget: 30 }, GALA)).toEqual({ qty: "2 tickets wanted", budget: "Up to $30 each", text: "2 tickets wanted · Up to $30 each" });
    expect(wantedHead({ qty: 1, budget: 30 }, GALA)).toEqual({ qty: "1 ticket wanted", budget: "Up to $30", text: "1 ticket wanted · Up to $30" });
    expect(wantedHead({ qty: 1, budget: 0 }, GALA).text).toBe("1 ticket wanted · Up to $0"); // an explicit $0 is what was stated
  });
  it("no budget stated, or a visitor's view (which has none): the quantity alone", () => {
    expect(wantedHead({ qty: 1, budget: null }, OYSTERS)).toEqual({ qty: "1 ticket wanted", budget: null, text: "1 ticket wanted" });
    expect(wantedHead({ qty: 2 }, OYSTERS).text).toBe("2 tickets wanted");
  });
  it("a trip spot, an item, an older request for an event not on Handoff", () => {
    expect(wantedHead({ qty: 1, budget: 900 }, { ...TREK, premium: true }).text).toBe("1 spot wanted · Up to $900 reimbursement");
    expect(wantedHead({ qty: 2, budget: 900 }, TREK).text).toBe("2 spots wanted · Up to $900 each");
    expect(wantedHead({ qty: 1, budget: 20, goods: { title: "Bike lock", cat: "Sports & outdoor" } }, null).text).toBe("1 item wanted · Up to $20");
    expect(wantedHead({ qty: 1, missing: { title: "Old one" } }, null).text).toBe("1 ticket wanted");
  });
});

describe("a note shows on the card only when it's short; longer ones are on the request page (9w)", () => {
  it("keeps a short note, trimmed", () => {
    expect(cardNote("Two of us are hoping to sit together.")).toBe("Two of us are hoping to sit together.");
    expect(cardNote("  A U-lock, any brand.  ")).toBe("A U-lock, any brand.");
    expect(cardNote("x".repeat(CARD_NOTE_MAX))).toBe("x".repeat(CARD_NOTE_MAX));
  });
  it("leaves a longer note, or none, off the card", () => {
    expect(CARD_NOTE_MAX).toBe(60);
    expect(cardNote("x".repeat(CARD_NOTE_MAX + 1))).toBeNull();
    for (const n of ["", "   ", null, undefined]) expect(cardNote(n)).toBeNull();
  });
});

describe("a potential match is shown to the requester (9w)", () => {
  it("on the requester's own card only", () => {
    expect(showsMatch({ userId: "u1" }, "u1")).toBe(true);
    expect(showsMatch({ userId: "u1" }, "u2")).toBe(false);
    expect(showsMatch({ userId: "u1" }, null)).toBe(false);
  });
});

describe("Available's lines: no redundant caption, and a real restriction named", () => {
  it("the face value only when it isn't the price shown", () => {
    expect(faceCaption("Face value $25", "$24")).toBe("Face value $25");
    expect(faceCaption("Face value $900", "$900")).toBe("");
    expect(faceCaption("Face value $20–$30", "$20")).toBe("Face value $20–$30");
    expect(faceCaption("", "$40")).toBe("");
    expect(faceCaption(null, "$40")).toBe("");
  });
  it("a members-only event names its club, in the words buyers read before reserving", () => {
    expect(membersTag({ attend: "members", club: "GCC" })).toBe("GCC members only");
    expect(membersTag({ attend: "members", club: "" })).toBe("Members only");
    expect(membersTag({ attend: "all", club: "GCC" })).toBeNull(); // a club alone restricts nothing
    expect(membersTag(null)).toBeNull();
  });
});

describe("List and invite: who you'll invite and what they pay, then what happened (9w)", () => {
  it("before the tap: \"You'll invite Dan to pay $30 for 1 ticket.\"", () => {
    expect(answerSummary({ ask: "30", listQty: 1, isoQty: 1, budget: 40, first: "Dan", unit: "ticket" })).toMatchObject({ lead: "You'll invite Dan to pay $30", line: "for 1 ticket." });
    expect(answerSummary({ ask: "30", listQty: 2, isoQty: 2, budget: null, first: "Dan", unit: "ticket" })).toMatchObject({ total: 60, lead: "You'll invite Dan to pay $60", line: "for 2 tickets." });
  });
  it("what it says while there's no total", () => {
    expect(answerHint("", "Dan")).toBe("Enter your price to see what you'll invite Dan to pay.");
    expect(answerHint("50", "Dan")).toBe("Fix the price above to see what you'll invite Dan to pay.");
  });
  it("after: \"Ticket listed. Invitation sent to Dan.\"; the outcome when no invitation could go out is kept", () => {
    expect(answerLanding([{ type: "postTicket", ok: true }, { type: "inviteRequester", ok: true }], "Dan", "ticket")).toEqual({ invited: true, note: "Ticket listed. Invitation sent to Dan." });
    const why = "Dan's request closed before it reached them, so no invitation went out.";
    expect(answerLanding([{ type: "postTicket", ok: true }, { type: "inviteRequester", ok: false, error: why }], "Dan", "ticket")).toEqual({ invited: false, note: `Your ticket is listed. ${why}` });
  });
});
