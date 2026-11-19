// SELL5-M2 (USER-INSTRUCTIONS §9v items 4 and 5), the engine's rules behind Sell's "Club or organizer" and "This ticket has restrictions":
// - a club is informational: a ticket for an event its club is known for is open to everyone unless a real restriction applies, and
//   reads no warning; where the event names no club, the seller may name one on their own listing, never on the shared event;
// - a listing's restrictions are the concrete conditions, in plain words: "<club> members only" (the buyer still confirms they're a
//   member), "The organizer must change the name on the ticket" (it needs the organizer: the event's club, or the one the seller names),
//   or the seller's own short words (3 to 80 characters, one line); with none reported or known, there's nothing to read;
// - listings stored before keep their terms (members only, names checked, the old "flagged a transfer restriction") and read in the same
//   words; the old action shape (restricted) is still accepted, so stored actions replay;
// - the generic "Rules not confirmed" wording is gone from the engine (an event's tag, its policy note, the catalog);
// - the views: a signed-in classmate reads the club and the restriction's words; a signed-out visitor reads the club and whether the
//   organizer changes the name, and only that the seller noted a restriction (its words are the seller's own text, like a note).
// Labelled test accounts with made-up ids; no database and no sign-in of any kind.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action } from "../../engine/index.js";
import { contractViolations, guestContractViolations } from "./helpers/contract.js";
import { FAY, PEOPLE6, ServerWorld, guestViewOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, T0, dateAfter } from "./helpers/worlds.js";

afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}
const act = (a: Record<string, unknown>) => a as unknown as Action;
const post = (eventId: string, more: Record<string, unknown> = {}) => act({ type: "postTicket", eventId, qty: 1, ask: "25", note: "", obo: false, ...more });
type Market = { w: ServerWorld; gcc: string; bare: string };
/** A GCC event and an event that names no club, both added by Ann. */
function market(): Market {
  const w = new ServerWorld({ people: PEOPLE6 });
  const gcc = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Fall Gala", club: "GCC", start: dateAfter(T0, 15) })).id, "gcc");
  const bare = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Oysters Night", start: dateAfter(T0, 9) })).id, "bare");
  return { w, gcc, bare };
}
const listing = (w: ServerWorld, id: string) => must(w.doc.listings.find((l) => l.id === id), "listing") as unknown as Record<string, unknown>;
/** The restriction lines buyers read for a stored listing, as the engine says them. */
const lines = (w: ServerWorld, id: string) => w.run(() => { const l = listing(w, id); return E.listingRestrictions(must(E.EV[String(l.eventId)], "event"), l as never).map((r) => r.text); });

describe("a club is informational (9v item 4)", () => {
  it("a ticket for a GCC event, with nothing restricted, has no restriction and no warning, and anyone may ask to buy it", () => {
    const { w, gcc } = market();
    const id = must(w.ok(BOB.userId, post(gcc)).id, "listing");
    expect(lines(w, id)).toEqual([]);
    w.run(() => {
      const ev = must(E.EV[gcc], "event");
      expect(E.transferTag(ev).label).toBe(""); // no "Rules not confirmed" (or any) tag
      expect(E.membersOnlyListing(ev, listing(w, id) as never)).toBe(false);
    });
    expect(w.ok(CAT.userId, act({ type: "requestToBuy", listingId: id, qty: 1, msg: "" })).id).toBeTruthy(); // no member confirmation asked
  });
  it("where the event names no club, the seller may name one on the listing; the shared event is never changed", () => {
    const { w, bare } = market();
    const id = must(w.ok(BOB.userId, post(bare, { club: "  Wharton   Wine Club " })).id, "listing");
    expect(listing(w, id).club).toBe("Wharton Wine Club");
    const stored = must(w.doc.events.find((e) => e.id === bare), "event") as unknown as Record<string, unknown>;
    expect("club" in stored).toBe(false);
    expect(lines(w, id)).toEqual([]); // a club named is no restriction
    w.run(() => expect(E.listingClubOf(must(E.EV[bare], "event"), listing(w, id) as never)).toBe("Wharton Wine Club"));
  });
  it("a club sent for an event that has one is dropped (the event's own is used), and a club that isn't one is refused", () => {
    const { w, gcc, bare } = market();
    const id = must(w.ok(BOB.userId, post(gcc, { club: "Something Else" })).id, "listing");
    expect("club" in listing(w, id)).toBe(false);
    expect(w.no(BOB.userId, post(bare, { club: "x" }))).toBe(E.NO_LISTING_CLUB);
  });
});

describe("a listing's restrictions, in plain words (9v item 5)", () => {
  it("members only on a GCC event reads \"GCC members only\", and the buyer still confirms they're a member", () => {
    const { w, gcc } = market();
    const id = must(w.ok(BOB.userId, post(gcc, { membersOnly: true })).id, "listing");
    expect(lines(w, id)).toEqual(["GCC members only"]);
    expect(w.no(CAT.userId, act({ type: "requestToBuy", listingId: id, qty: 1, msg: "" }))).toMatch(/GCC members\. Confirm you're a member/);
    expect(w.ok(CAT.userId, act({ type: "requestToBuy", listingId: id, qty: 1, msg: "", member: true })).id).toBeTruthy();
  });
  it("members only where the event names no club takes the club the seller named on the listing", () => {
    const { w, bare } = market();
    expect(w.no(BOB.userId, post(bare, { membersOnly: true }))).toBe(E.NO_ORG_MEMBERS); // no club anywhere: refused, as before
    const id = must(w.ok(BOB.userId, post(bare, { membersOnly: true, club: "GCC" })).id, "listing");
    expect(listing(w, id)).toMatchObject({ membersOnly: true, memberClub: "GCC", club: "GCC" });
    expect(lines(w, id)).toEqual(["GCC members only"]);
  });
  it("an organizer name change needs the organizer: the event's club, or one the seller names on the listing", () => {
    const { w, gcc, bare } = market();
    const nameChange = { method: "name", namesChecked: true };
    expect(w.no(BOB.userId, post(bare, nameChange))).toBe(E.NO_ORG_NAME);
    const onBare = must(w.ok(BOB.userId, post(bare, { ...nameChange, club: "Oyster Society" })).id, "listing");
    expect(listing(w, onBare)).toMatchObject({ method: "name", namesChecked: true, club: "Oyster Society" });
    expect(lines(w, onBare)).toEqual([E.NAME_CHANGE_RULE]);
    expect(E.NAME_CHANGE_RULE).toBe("The organizer must change the name on the ticket");
    const onGcc = must(w.ok(CAT.userId, post(gcc, nameChange)).id, "listing");
    expect(lines(w, onGcc)).toEqual([E.NAME_CHANGE_RULE]);
    w.run(() => expect(E.orgOf(must(E.EV[bare], "event"), listing(w, onBare) as never)).toBe("Oyster Society"));
  });
  it("another short restriction is stored as one line, 3 to 80 characters, and read as the seller wrote it", () => {
    const { w, gcc } = market();
    const id = must(w.ok(BOB.userId, post(gcc, { restriction: "  Student ID checked\nat the door " })).id, "listing");
    expect(listing(w, id).restriction).toBe("Student ID checked at the door");
    expect(lines(w, id)).toEqual(["Student ID checked at the door"]);
    expect(w.no(CAT.userId, post(gcc, { restriction: "x".repeat(81) }))).toBe(E.NO_RESTRICTION_TEXT); // a refusal stores nothing, so Cat can try again
    expect(w.no(CAT.userId, post(gcc, { restriction: "ab" }))).toBe(E.NO_RESTRICTION_TEXT);
    expect(w.no(CAT.userId, post(gcc, { restriction: "!!!" }))).toBe(E.NO_RESTRICTION_TEXT);
    const none = must(w.ok(CAT.userId, post(gcc, { restriction: "  " })).id, "listing"); // blank: none
    expect("restriction" in listing(w, none)).toBe(false);
    expect(lines(w, none)).toEqual([]);
  });
  it("several at once read in a fixed order: members, name change, the seller's words", () => {
    const { w, gcc } = market();
    const id = must(w.ok(BOB.userId, post(gcc, { membersOnly: true, method: "name", namesChecked: true, restriction: "Black tie" })).id, "listing");
    expect(lines(w, id)).toEqual(["GCC members only", E.NAME_CHANGE_RULE, "Black tie"]);
  });
  it("a train's own carrier rule stays the event's (its tag), and a train ticket takes no name change", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const tr = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "train", title: "Acela PHL to NYC", start: `${dateAfter(T0, 5)}T09:05` })).id, "train");
    w.run(() => { const ev = must(E.EV[tr], "event"); expect(E.transferTag(ev).restricted).toBe(true); expect(E.transferTag(ev).label).toMatch(/carrier's rules/); });
    const id = must(w.ok(BOB.userId, post(tr, { departsAt: `${dateAfter(T0, 5)}T09:05` })).id, "listing");
    expect(lines(w, id)).toEqual([]);
  });
});

describe("listings stored before keep their terms, in the new words", () => {
  it("members only, names checked and the old flag still show and still apply; the old action shape replays", () => {
    const { w, gcc, bare } = market();
    // The page's old shapes: membersOnly with memberClub, a name change, and the old "restricted" flag.
    const m = must(w.ok(BOB.userId, post(bare, { membersOnly: true, memberClub: "Ski Club" })).id, "members");
    const n = must(w.ok(BOB.userId, post(gcc, { method: "name", namesChecked: true })).id, "names");
    const f = must(w.ok(CAT.userId, post(gcc, { restricted: true })).id, "flagged");
    expect(listing(w, m)).toMatchObject({ membersOnly: true, memberClub: "Ski Club" });
    expect("club" in listing(w, m)).toBe(false);
    expect(listing(w, f).restricted).toBe(true);
    expect(lines(w, m)).toEqual(["Ski Club members only"]);
    expect(lines(w, n)).toEqual([E.NAME_CHANGE_RULE]);
    expect(lines(w, f)).toEqual([E.FLAGGED_RULE]);
    expect(E.FLAGGED_RULE).toMatch(/^The seller flagged a transfer restriction: the ticket's terms may not allow resale or a name change/);
    expect(w.no(FAY.userId, act({ type: "requestToBuy", listingId: m, qty: 1, msg: "" }))).toMatch(/Ski Club members/); // still enforced: a buyer who doesn't confirm is refused
    const before = JSON.stringify(w.doc.listings);
    viewOf(w, FAY); guestViewOf(w); w.sweep(); // reading never rewrites a stored listing
    expect(JSON.stringify(w.doc.listings)).toBe(before);
  });
  it("an event stored with names checked reads the name-change rule on its listings", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Spring Formal", club: "WGA", start: dateAfter(T0, 12), namesChecked: true })).id, "event");
    const id = must(w.ok(BOB.userId, post(ev)).id, "listing");
    expect(lines(w, id)).toEqual([E.NAME_CHANGE_RULE]);
  });
});

describe("no generic \"Rules not confirmed\" wording", () => {
  it("an event a person added has no tag and no policy note saying so; the catalog and the policy names don't either", () => {
    const { w, bare, gcc } = market();
    w.run(() => {
      for (const id of [bare, gcc]) {
        const ev = must(E.EV[id], "event");
        expect(E.transferTag(ev)).toMatchObject({ label: "", line: "" });
        expect(ev.policyNote).toBe("");
      }
    });
    const words = JSON.stringify([E.POLICY, E.EVENTS, E.normalizeEvent({ id: "ev-0000000000000001", kind: "event", title: "X Party", start: dateAfter(T0, 3), policy: "unknown" } as never)]);
    expect(words).not.toMatch(/rules not confirmed/i);
  });
});

describe("the views", () => {
  it("a signed-in classmate reads the listing's club and its restriction's words; the contract holds", () => {
    const { w, bare } = market();
    const id = must(w.ok(BOB.userId, post(bare, { club: "GCC", restriction: "Student ID checked at the door" })).id, "listing");
    const v = viewOf(w, FAY);
    const l = must(v.listings.find((x) => x.id === id), "listing in view");
    expect(l).toMatchObject({ club: "GCC", restriction: "Student ID checked at the door" });
    expect(contractViolations(v, FAY.userId)).toEqual([]);
  });
  it("a visitor reads the club and the name-change rule, and only that a restriction was noted, never its words, when they look like contact details", () => { // SELL6-N1 (§9x item 1): ordinary restriction words now reach a visitor (n1-closed-requests.test.ts); these, with a phone number, still don't
    const { w, bare, gcc } = market();
    const a = must(w.ok(BOB.userId, post(bare, { club: "GCC", method: "name", namesChecked: true })).id, "a");
    const b = must(w.ok(BOB.userId, post(gcc, { restriction: "Call me at 555 0100 first" })).id, "b");
    const g = guestViewOf(w);
    expect(must(g.listings.find((x) => x.id === a), "a")).toMatchObject({ club: "GCC", namesChecked: true });
    const gb = must(g.listings.find((x) => x.id === b), "b");
    expect(gb).toMatchObject({ restrictionNoted: true });
    expect(JSON.stringify(g)).not.toMatch(/555 0100|Call me/);
    expect(guestContractViolations(g)).toEqual([]);
  });
  it("the page protocol moved to 8 with the new listing fields (open pages reload)", () => {
    expect(E.HANDOFF_PROTOCOL).toBe(10); // 8 with this step; SELL5-M3 (§9v item 2, answerRequest) made it 9 and SELL6-N1 (§9x item 1) 10, so a page of 7 still reloads
  });
});
