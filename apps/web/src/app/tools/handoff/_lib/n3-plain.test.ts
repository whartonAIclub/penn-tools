// SELL6-N3 (USER-INSTRUCTIONS §9x item 4): no routine ticket-verification disclaimers. The page's plain words with no page in them
// (_lib/plain.js, and the profile's note in _lib/profile.js):
// - Help's one explanation, word for word;
// - an exchange's history lines by who acted: "Buyer marked paid", "Seller confirmed payment", "Seller marked ticket sent", "Buyer
//   confirmed receipt"; the engine's stored text is the input and never changes; one person reporting and the other confirming stay
//   two different lines; a simulated account's line, a dispute, a refusal and a name-change request keep their own words;
// - the Payment row's words, with the seller's confirmation said only once it's made;
// - an event's source and a face value's basis without "not checked by Handoff"; a seller's own ticket without "self-reported";
// - the server's toast for a ticket listed on a new event; "Tickets you've added" without its long explanation.
// Pure functions; the stored strings are written here as the engine writes them (tools/handoff/engine/index.js: markPaid,
// confirmPayment, markTransferred, buyerReceived, normalizeEvent, priceBasis, postTicket).
import { describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import { FACE_CHIP, HELP_VERIFY, HELP_VERIFY_Q, PROGRESS, basisLine, holdingSource, paidWords, plainToast, progressLine, sourceLine } from "./plain";
import { ADDED_NOTE, ADDED_TITLE } from "./profile";

const DISCLAIMER = /not verified|self-reported|unverified|not checked by Handoff|can't see (your )?tickets?|can't check|doesn't check/i;

describe("Help keeps one explanation (9x item 4)", () => {
  it("is the instruction's sentence, word for word", () => {
    expect(HELP_VERIFY).toBe("Handoff doesn't verify tickets or process payments. Payment and ticket delivery happen directly between buyer and seller.");
    expect(HELP_VERIFY_Q).toMatch(/\?$/);
  });
});

describe("an exchange's progress, by who acted (9x item 4)", () => {
  it("the four steps read \"Buyer marked paid\", \"Seller confirmed payment\", \"Seller marked ticket sent\", \"Buyer confirmed receipt\"", () => {
    expect(PROGRESS).toEqual({ paid: "Buyer marked paid", confirmed: "Seller confirmed payment", sent: "Seller marked ticket sent", received: "Buyer confirmed receipt" });
    expect(progressLine("Buyer said they paid $20 (self-reported)")).toBe("Buyer marked paid ($20)");
    expect(progressLine("Seller confirmed the payment arrived")).toBe("Seller confirmed payment");
    expect(progressLine("Seller sent it (self-reported)")).toBe("Seller marked ticket sent");
    expect(progressLine("Buyer confirmed they received it")).toBe("Buyer confirmed receipt");
  });
  it("what the buyer said they paid, and how, stays with the line", () => {
    expect(progressLine("Buyer said they paid $20 by Venmo (self-reported)")).toBe("Buyer marked paid ($20 by Venmo)");
    expect(progressLine("Buyer said they paid $1,250.50 by Zelle (self-reported)")).toBe("Buyer marked paid ($1,250.50 by Zelle)");
  });
  it("reporting and confirming stay two different lines: \"marked\" is never \"confirmed\"", () => {
    const paid = progressLine("Buyer said they paid $20 by Venmo (self-reported)"), confirmed = progressLine("Seller confirmed the payment arrived");
    expect(paid).not.toMatch(/confirmed/i);
    expect(confirmed).not.toMatch(/marked/i);
    const sent = progressLine("Seller sent it (self-reported)"), got = progressLine("Buyer confirmed they received it");
    expect(sent).not.toMatch(/confirmed|received/i);
    expect(got).not.toMatch(/marked/i);
    expect(new Set([paid, confirmed, sent, got]).size).toBe(4);
  });
  it("an older listing's specific way keeps what the seller did", () => {
    expect(progressLine("Seller transferred it in Ticketmaster or AXS (self-reported)")).toBe("Seller marked ticket sent (transferred in Ticketmaster or AXS)");
    expect(progressLine("Seller handed over the paper ticket (self-reported)")).toBe("Seller marked ticket handed over");
    // A name change is the organizer's step, still pending once the seller has asked: it isn't "sent".
    expect(progressLine("Seller asked GCC to change the name (self-reported)")).toBe("Seller asked GCC to change the name");
  });
  it("no routine disclaimer is left on any step, and nothing else about a line changes", () => {
    const stored = [
      "Asked to buy 1 ticket at $20 each: nothing is held",
      "Seller invited the buyer to pay $20 each for 1 ticket: not held until the buyer reserves it",
      "Buyer reserved it at $20 each: held 15 minutes for payment",
      "Buyer reserved it, free: nothing to pay",
      "Buyer said they paid $20 by Venmo (self-reported)",
      "Seller confirmed the payment arrived",
      "Seller sent it (self-reported)",
      "Buyer confirmed they received it",
      "Buyer confirmed they're a GCC member (not checked by Handoff)",
      "Declined by seller", "Reservation released", "Released by the seller: the payment didn't arrive",
    ];
    for (const t of stored) expect(progressLine(t), t).not.toMatch(DISCLAIMER);
    expect(progressLine("Buyer confirmed they're a GCC member (not checked by Handoff)")).toBe("Buyer confirmed they're a GCC member"); // the buyer's own confirmation stays
    for (const t of [stored[0], stored[1], stored[2], stored[3], stored[9], stored[10], stored[11]]) expect(progressLine(t!)).toBe(t);
  });
  it("a dispute's line and a simulated account's line read as stored", () => {
    expect(progressLine("Seller says the payment hasn't arrived (Handoff can't see payments)")).toBe("Seller says the payment hasn't arrived (Handoff can't see payments)");
    expect(progressLine("Simulated: Maya Patel (fictional account) said they paid")).toBe("Simulated: Maya Patel (fictional account) said they paid");
    expect(progressLine("Simulated: Maya Patel (fictional account) confirmed receipt")).toBe("Simulated: Maya Patel (fictional account) confirmed receipt");
  });
  it("takes anything: no line, or not a string, is an empty line", () => {
    expect(progressLine(undefined)).toBe("");
    expect(progressLine(null)).toBe("");
    expect(progressLine("")).toBe("");
  });
});

describe("the Payment row once the buyer has said they paid (9x item 4)", () => {
  it("says who marked it paid, how much and with which app; the seller's confirmation only once it's made", () => {
    expect(paidWords({ isB: true, B: "Jordan", S: "Maya", amount: "$20", via: "Venmo", confirmed: false })).toEqual({ said: "You marked $20 paid by Venmo", confirmed: "" });
    expect(paidWords({ isB: true, B: "Jordan", S: "Maya", amount: "$20", via: "Venmo", confirmed: true })).toEqual({ said: "You marked $20 paid by Venmo", confirmed: "Maya confirmed payment" });
    expect(paidWords({ isB: false, B: "Jordan", S: "Maya", amount: "$20", via: "Zelle", confirmed: false })).toEqual({ said: "Jordan marked $20 paid by Zelle", confirmed: "" });
    expect(paidWords({ isB: false, B: "Jordan", S: "Maya", amount: "$20", via: "Zelle", confirmed: true })).toEqual({ said: "Jordan marked $20 paid by Zelle", confirmed: "You confirmed payment" });
  });
  it("an exchange from before payment methods names no app, and no line carries a routine disclaimer", () => {
    const w = paidWords({ isB: true, B: "Jordan", S: "Maya", amount: "$12", confirmed: true });
    expect(w).toEqual({ said: "You marked $12 paid", confirmed: "Maya confirmed payment" });
    expect(`${w.said} ${w.confirmed}`).not.toMatch(/can't see payments|self-reported|says they/i);
  });
});

describe("an event's source and a ticket's source, without the routine caveats (9x item 4)", () => {
  it("an event's head says who added it, not that its details aren't checked", () => {
    expect(sourceLine("Added by Maya P. · details not checked by Handoff")).toBe("Added by Maya P.");
    expect(sourceLine("Added by A classmate · details not checked by Handoff")).toBe("Added by A classmate");
    expect(sourceLine("Added by Maya P.")).toBe("Added by Maya P.");
    expect(sourceLine(undefined)).toBe("");
  });
  it("reads the engine's own note for a live event", () => {
    const ev = E.normalizeEvent({ id: "ev-0000000000000001", kind: "event", title: "Fall Gala", start: "2026-12-02", tiers: [{ id: "t1", label: "Ticket", price: 30 }] } as unknown as Parameters<typeof E.normalizeEvent>[0]);
    expect(ev.sourcesNote).toMatch(/details not checked by Handoff$/); // stored and engine words are unchanged
    expect(sourceLine(ev.sourcesNote)).toMatch(/^Added by /);
    expect(sourceLine(ev.sourcesNote)).not.toMatch(DISCLAIMER);
  });
  it("a face value says who entered it", () => {
    expect(basisLine("entered by Maya, not checked by Handoff")).toBe("entered by Maya");
    expect(basisLine("entered by Maya")).toBe("entered by Maya");
    expect(FACE_CHIP).toBe("Face values as entered");
  });
  it("a seller's own ticket says nothing for one they entered, and where it came from for one received in Handoff", () => {
    expect(holdingSource("self-reported")).toBe("");
    expect(holdingSource("transferred")).toBe("received through Handoff");
    expect(holdingSource(undefined)).toBe("");
    expect(E.SRC["self-reported"]).toBe("self-reported, not verified"); // the engine's label (the preview's) is unchanged
  });
  it("the toast for a ticket listed on a new event drops \"Handoff doesn't check its details\"; other toasts are as sent", () => {
    expect(plainToast("Ticket listed. Its event is new on Handoff: it shows as added by you, and Handoff doesn't check its details."))
      .toBe("Ticket listed. Its event is new on Handoff and shows as added by you.");
    expect(plainToast("Ticket listed. Its train is new on Handoff: it shows as added by you, and Handoff doesn't check its details."))
      .toBe("Ticket listed. Its train is new on Handoff and shows as added by you.");
    expect(plainToast("Request posted. Matches show at the bell and in My activity.")).toBe("Request posted. Matches show at the bell and in My activity.");
    expect(plainToast("Payment marked as sent. Maya confirms it arrived, then they send you the ticket.")).toBe("Payment marked as sent. Maya confirms it arrived, then they send you the ticket.");
    expect(plainToast(undefined)).toBe(undefined);
  });
  // Added on resuming SELL6-N3: the toast after adding an event, a train or a trek in its own form ("A trek? Add it with its details",
  // which Sell and Request still offer) is the server's own text (liveAddEvent) and said the same caption; the form's description had
  // already dropped it. A note the form adds after the server's words stays.
  it("the toast after adding an event, a train or a trek in its own form drops \"Handoff doesn't check its details\" too", () => {
    for (const k of ["Event", "Train", "Trek"]) {
      expect(plainToast(`${k} added. It shows as added by you, and Handoff doesn't check its details.`)).toBe(`${k} added. It shows as added by you.`);
      expect(plainToast(`${k} added. It shows as added by you, and Handoff doesn't check its details. No ticket is listed yet.`)).toBe(`${k} added. It shows as added by you. No ticket is listed yet.`);
      expect(plainToast(`${k} added. It shows as added by you, and Handoff doesn't check its details.`)).not.toMatch(DISCLAIMER);
    }
    expect(plainToast("Trek added.")).toBe("Trek added.");
  });
});

describe("\"Tickets you've added\" has no long explanation (9x item 4)", () => {
  it("the note under it says only who sees the list", () => {
    expect(ADDED_TITLE).toBe("Tickets you've added");
    expect(ADDED_NOTE).toBe("Only you see this list.");
    expect(ADDED_NOTE).not.toMatch(DISCLAIMER);
    expect(ADDED_NOTE.length).toBeLessThan(40);
  });
});
