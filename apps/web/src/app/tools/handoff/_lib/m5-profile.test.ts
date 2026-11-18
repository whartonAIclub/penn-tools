// SELL5-M5 (USER-INSTRUCTIONS §9v item 6): Handoff settings, simplified. The page's words and rules with no page in them (profile.js):
// - the one line about your public name: "On your listings and requests, signed-in classmates see you as Maya P.";
// - "Who can see my details?", collapsed, explaining what the server's projection does (tools/handoff/src/project.ts): when a trading
//   partner sees a full name, when ticket buyers and sellers see each other's email (from the reservation), how Goods contact consent
//   works, and who sees which payment apps you take versus where to pay you;
// - "Tickets you've added": hidden when there are none; otherwise a count for its collapsed heading, and per event its name, how many,
//   and an unlisted count only when it says something ("1 unlisted", "not listed"; never "0 unlisted"), with ONE sentence saying these
//   are self-reported (no per-row "self-reported, not verified").
import { describe, expect, it } from "vitest";
import { ADDED_NOTE, ADDED_TITLE, addedTickets, publicNameLine, WHO_SEES, WHO_TITLE } from "./profile";

const ev = (id: string, title: string, over: Record<string, unknown> = {}) => ({ id, kind: "event", title, club: "", cat: "", start: "2026-12-01", attend: "all", tiers: [{ id: "t1", label: "General admission", price: 25 }], ...over });
const EVS: Record<string, ReturnType<typeof ev>> = {
  "ev-0000000000000001": ev("ev-0000000000000001", "Oysters Night"),
  "ev-0000000000000002": ev("ev-0000000000000002", "Fall Gala", { tiers: [{ id: "t1", label: "Standing", price: 25 }, { id: "t2", label: "Table", price: 60 }] }),
  "ev-0000000000000003": ev("ev-0000000000000003", "Lisbon Spring Trek", { kind: "trek", cat: "Treks & trips" }),
  "ev-0000000000000004": ev("ev-0000000000000004", "Jazz Night"),
};
const hold = (id: string, eventId: string, qty: number, over: Record<string, unknown> = {}) => ({ id, userId: "u-me", eventId, tier: "t1", qty, source: "self-reported", ...over });
const listing = (holdingId: string, listed: number) => ({ id: "l-" + holdingId + "-" + listed, holdingId, sellerId: "u-me", listed, transferred: 0, status: "active", qty: listed });

describe("the public name line (9v item 6)", () => {
  it("names the public form of the account's PennTools name, in the user's words", () => {
    const l = publicNameLine("Maya Patel");
    expect(l.text).toBe("On your listings and requests, signed-in classmates see you as Maya P.");
    expect(l.lead + l.name + l.end).toBe(l.text);
    expect(l.name).toBe("Maya P.");
    expect(publicNameLine("Handoff Test A").text).toBe("On your listings and requests, signed-in classmates see you as Handoff A.");
    expect(publicNameLine("Local Developer").name).toBe("Local D."); // the local login keeps its identity
  });
});

describe("Who can see my details? (9v item 6)", () => {
  it("is one collapsed question with the four answers the projection gives, in this order", () => {
    expect(WHO_TITLE).toBe("Who can see my details?");
    expect(WHO_SEES.map((w) => w.key)).toEqual(["name", "email", "goods", "pay"]);
    for (const w of WHO_SEES) { expect(w.label.length).toBeGreaterThan(3); expect(w.text.length).toBeLessThan(260); } // brief
  });
  it("full name: only someone you trade with (a request to buy, an invitation to pay or a reservation, an item request or offer, a shared listing)", () => {
    const t = WHO_SEES.find((w) => w.key === "name")!.text;
    expect(t).toMatch(/full name/i);
    expect(t).toMatch(/request to buy/); expect(t).toMatch(/invitation to pay/); expect(t).toMatch(/item request or offer/); expect(t).toMatch(/I have this/);
  });
  it("ticket email: buyer and seller, from the reservation until the buyer confirms they received it (CONTACT_REVEAL: accepted to sent)", () => {
    const t = WHO_SEES.find((w) => w.key === "email")!.text;
    expect(t).toMatch(/buyer and the seller/); expect(t).toMatch(/reserved/); expect(t).toMatch(/received/);
  });
  it("Goods email: only when both agree (the buyer when asking, the seller when accepting, or either later), while held and after pickup", () => {
    const t = WHO_SEES.find((w) => w.key === "goods")!.text;
    expect(t).toMatch(/both agree/); expect(t).toMatch(/asking/); expect(t).toMatch(/accepting/); expect(t).toMatch(/held/); expect(t).toMatch(/pickup/);
  });
  it("payment: signed-in classmates see which apps; only a buyer who reserved sees where to pay, kept in that exchange", () => {
    const t = WHO_SEES.find((w) => w.key === "pay")!.text;
    expect(t).toMatch(/[Ss]igned-in classmates see which payment apps you take/);
    expect(t).toMatch(/Only a buyer who has reserved/); expect(t).toMatch(/where to pay you/); expect(t).toMatch(/even if you change them later/);
  });
});

describe("Tickets you've added (9v item 6)", () => {
  it("is hidden when there are none: no rows, a zero total", () => {
    expect(addedTickets({ holdings: [], listings: [], requests: [] }, "u-me", EVS)).toEqual({ rows: [], total: 0 });
    // someone else's, an empty one, or one whose event isn't in the view: still none
    const s = { holdings: [hold("h1", "ev-0000000000000001", 2, { userId: "u-other" }), hold("h2", "ev-0000000000000001", 0), hold("h3", "ev-00000000000000ff", 1)], listings: [], requests: [] };
    expect(addedTickets(s, "u-me", EVS)).toEqual({ rows: [], total: 0 });
  });
  it("names each event with how many, and an unlisted count only when it says something (never \"0 unlisted\")", () => {
    const s = {
      holdings: [hold("h1", "ev-0000000000000001", 2), hold("h2", "ev-0000000000000002", 3, { tier: "t2" }), hold("h3", "ev-0000000000000003", 1), hold("h4", "ev-0000000000000004", 1, { source: "transferred" })],
      listings: [listing("h1", 2), listing("h2", 1)], requests: [],
    };
    const r = addedTickets(s, "u-me", EVS);
    expect(r.total).toBe(7);
    expect(r.rows.map((x) => [x.title, x.line])).toEqual([
      ["Oysters Night", "2 tickets"],                     // all listed: no unlisted count at all
      ["Fall Gala", "3 tickets · Table · 2 unlisted"],    // some listed; the tier, since the event has two
      ["Lisbon Spring Trek", "1 spot · not listed"],      // none listed
      ["Jazz Night", "1 ticket · not listed"],            // bought in Handoff: the same line, no per-row source chip
    ]);
    for (const x of r.rows) expect(x.line).not.toMatch(/\b0 unlisted\b/);
    expect(r.rows.map((x) => x.eventId)).toEqual(["ev-0000000000000001", "ev-0000000000000002", "ev-0000000000000003", "ev-0000000000000004"]);
  });
  it("an event that was removed says so instead of a count", () => {
    const r = addedTickets({ holdings: [hold("h1", "ev-0000000000000001", 1)], listings: [], requests: [] }, "u-me", { "ev-0000000000000001": ev("ev-0000000000000001", "Oysters Night", { removedAt: 1 }) });
    expect(r.rows[0]!.line).toBe("1 ticket · event removed");
  });
  // SELL6-N3 (§9x item 4): the long explanation under "Tickets you've added" is gone. This test expected one sentence that said the
  // list is private AND that Handoff can't check tickets "you entered yourself" (§9v item 6); it now expects the one sentence to say
  // only that the list is private, with no verification caveat (Help says that once).
  it("says in one sentence that the list is private, and no longer explains that the tickets are self-reported (9x item 4)", () => {
    expect(ADDED_TITLE).toBe("Tickets you've added");
    expect(ADDED_NOTE.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length).toBe(1);
    expect(ADDED_NOTE).toMatch(/^Only you see this/);
    expect(ADDED_NOTE).toBe("Only you see this list.");
    expect(ADDED_NOTE).not.toMatch(/can't check|you entered yourself|self-reported|verified/i);
  });
});
