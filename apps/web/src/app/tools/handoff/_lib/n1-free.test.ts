// SELL6-N1 (USER-INSTRUCTIONS §9x item 1, "$0 tickets"), the page's rules for a free ticket that need no page:
// - _lib/answer.js: a price of $0 asks for no way to be paid on "List and invite" (payAskedToInvite), and the form says "You'll invite
//   Dan to take 1 ticket for free. Nothing to pay." (answerSummary), never "to pay $0";
// - _lib/sell.js: the line by the button doesn't wait for a payment (sellConfirm);
// - _lib/free.js: the exchange card's words and steps for a free ticket, and, for a priced one, word for word what they were.
// Pure functions: no DOM, no server, no sign-in.
import { describe, expect, it } from "vitest";
import { answerHint, answerLead, answerSummary, freeAsk, payAskedToInvite } from "./answer";
import { askBtn, askHead, askNoteExample, askWords, askedNote, cardSteps, freeWords, invitedNote, priceHead, problemReasons, reserveNext, reservesNext } from "./free";
import { sellConfirm } from "./sell";

describe("List and invite at $0", () => {
  it("a price of $0 is a free ticket; anything else, or nothing typed, isn't", () => {
    for (const ask of ["0", " 0 ", "0.00", 0]) expect(freeAsk(ask), String(ask)).toBe(true);
    for (const ask of ["", "  ", "abc", "-3", "0.5", "1", "30", "$0", null, undefined]) expect(freeAsk(ask), String(ask)).toBe(false); // "$0": the field takes the amount alone (its "$" is the field's own), as the price check does
  });
  it("no way to be paid is asked for a free ticket; a paid one still asks when none is saved", () => {
    expect(payAskedToInvite({ ask: "0", saved: 0 })).toBe(false);
    expect(payAskedToInvite({ ask: "30", saved: 0 })).toBe(true);
    expect(payAskedToInvite({ ask: "", saved: 0 })).toBe(true); // no price yet: the form still asks, as before
    expect(payAskedToInvite({ ask: "30", saved: 1 })).toBe(false);
    expect(payAskedToInvite({ ask: "0", saved: 2 })).toBe(false);
  });
  it("before the tap: \"You'll invite Dan to take 1 ticket for free. Nothing to pay.\"", () => {
    expect(answerSummary({ ask: "0", listQty: 1, isoQty: 1, budget: 40, first: "Dan", unit: "ticket" })).toEqual({
      qty: 1, total: 0, free: true, lead: "You'll invite Dan to take 1 ticket", line: "for free. Nothing to pay.", notes: [],
      hold: "Inviting holds nothing: your listing stays open to everyone until someone reserves it.",
    });
    const two = answerSummary({ ask: "0", listQty: 3, isoQty: 2, budget: null, first: "Dan", unit: "ticket" });
    expect(two).toMatchObject({ qty: 2, total: 0, free: true, lead: "You'll invite Dan to take 2 tickets", notes: ["The other ticket stays open to everyone."] });
    expect(JSON.stringify(two)).not.toMatch(/to pay \$|\$0/);
    // A priced ticket reads as before, and carries no `free`.
    const paid = answerSummary({ ask: "30", listQty: 1, isoQty: 1, budget: 40, first: "Dan", unit: "ticket" });
    expect(paid).toMatchObject({ total: 30, lead: "You'll invite Dan to pay $30", line: "for 1 ticket." });
    expect(paid).not.toHaveProperty("free");
  });
  it("the form's opening line and its hint", () => {
    expect(answerLead("Dan", true)).toBe("Set your price. You'll invite Dan as soon as it's listed.");
    expect(answerLead("Dan", false)).toBe("Set your price. You'll invite Dan to pay as soon as it's listed.");
    expect(answerHint("", "Dan")).toBe("Enter your price to see what you'll invite Dan to pay."); // before a price is typed: unchanged
  });
  it("the line by the button: a free ticket goes to the buyer once they reserve it", () => {
    expect(sellConfirm("ticket", "", true)).toBe("Posting confirms you have this ticket. Send the ticket to the buyer once they reserve it.");
    expect(sellConfirm("ticket", "name", true)).toBe("Posting confirms you have this ticket and will request the name change as soon as the buyer reserves it.");
    expect(sellConfirm("ticket", "")).toBe("Posting confirms you have this ticket. Send the ticket to the buyer after payment.");
    expect(sellConfirm("ticket", "name")).toBe("Posting confirms you have this ticket and will request the name change as soon as the buyer pays.");
  });
});

describe("the exchange card's words", () => {
  it("a priced ticket: word for word what the card said before", () => {
    expect(freeWords(false)).toEqual({ toPay: " to pay", thenPay: ", then pay", busy: "Another buyer is paying for it right now", busyShort: "Another buyer is paying right now",
      reserveBtn: "Reserve and pay", inviteBtn: "Invite to pay" });
    expect(priceHead({ gratis: false, total: 30, to: "Ann" })).toBe("$30 to Ann");
    expect(reserveNext({ gratis: false, holdFor: "15 minutes", S: "Ann", total: 30 })).toBe("Reserve it to hold it for 15 minutes, then pay Ann $30");
    expect(reservesNext({ gratis: false, B: "Dan", total: 30 })).toBe("Dan reserves it and pays you $30, or declines");
    expect(askedNote(false)).toBe("Nothing is held yet, and you'll see where to pay once you reserve.");
    expect(invitedNote({ gratis: false, holdFor: "15 minutes", S: "Ann" })).toBe("Not held yet: it's yours once you reserve it, then you have 15 minutes to pay. Ann may invite others too.");
    expect(askWords({ gratis: false, S: "Ann" })).toBe("This asks Ann to invite you to pay. Nothing is held, and you'll see where to pay once you reserve.");
    expect([askBtn(false), askHead({ gratis: false, S: "Ann" }), askNoteExample(false)]).toEqual(["Request to buy", "Request to buy from Ann", "e.g. I can pay right away."]);
  });
  it("a free listing's own button, its form's heading and its note's example: nobody buys or pays", () => {
    expect([askBtn(true), askBtn(true, "ticket"), askHead({ gratis: true, S: "Ann" }), askNoteExample(true)]).toEqual(["Request this ticket", "Request this ticket", "Request this ticket from Ann", "e.g. I'd love to go."]);
  });
  it("a free ticket: nobody pays, nothing says where or when to pay", () => {
    expect(freeWords(true)).toEqual({ toPay: "", thenPay: "", busy: "Another buyer has reserved it", busyShort: "Another buyer has reserved it", reserveBtn: "Reserve", inviteBtn: "Invite" });
    const said = [priceHead({ gratis: true, total: 0, to: "Ann" }), reserveNext({ gratis: true, holdFor: "15 minutes", S: "Ann", total: 0 }), reservesNext({ gratis: true, B: "Dan", total: 0 }),
      askedNote(true), invitedNote({ gratis: true, holdFor: "15 minutes", S: "Ann" }), askWords({ gratis: true, S: "Ann" })];
    expect(said).toEqual(["Free", "Reserve it: it's free, so there's nothing to pay", "Dan reserves it, or declines", "Nothing is held yet. It's free, so there's nothing to pay.",
      "Not held yet: it's yours once you reserve it. Ann may invite others too.", "This asks Ann to invite you. Nothing is held until you reserve it, and there's nothing to pay: it's free."]);
    for (const t of said) expect(t).not.toMatch(/\$0|where to pay|minutes to pay|then pay|pays you/);
  });
  it("the steps: a free ticket has no Paid step; any other card's steps are as they were", () => {
    expect(cardSteps({ nf: true, offerish: false, isoReply: false, freeFlow: true })).toEqual({ steps: ["Invited", "Reserved", "Delivered", "Received"],
      done: { requested: 0, invited: 1, confirmed: 2, sent: 3, completed: 4 } });
    expect(cardSteps({ nf: true, offerish: false, isoReply: false, freeFlow: false })).toEqual({ steps: ["Invited", "Reserved", "Paid", "Delivered", "Received"],
      done: { pending: 0, countered: 0, proposed: 0, requested: 0, invited: 1, accepted: 2, paid: 3, confirmed: 3, sent: 4, completed: 5 } });
    expect(cardSteps({ nf: false, offerish: true, isoReply: true, freeFlow: false })).toMatchObject({ steps: ["Held reply", "Reserved", "Paid", "Delivered", "Received"], done: { accepted: 2, completed: 5 } });
    expect(cardSteps({ nf: false, offerish: false, isoReply: false, freeFlow: false })).toMatchObject({ steps: ["Reserved", "Paid", "Delivered", "Received"], done: { accepted: 1, paid: 2, confirmed: 2, sent: 3, completed: 4 } });
  });
  it("\"There's a problem\" offers no reason about paying on a free ticket", () => {
    const seller = ["The buyer hasn't paid", "The buyer stopped responding", "Something else"], buyer = ["The seller hasn't sent it", "Turned away at the door", "The ticket didn't work", "Something else"];
    expect(problemReasons(seller, true)).toEqual(["The buyer stopped responding", "Something else"]);
    expect(problemReasons(buyer, true)).toEqual(buyer);
    expect(problemReasons(seller, false)).toEqual(seller);
  });
});
