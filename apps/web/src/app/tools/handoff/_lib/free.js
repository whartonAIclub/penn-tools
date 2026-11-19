// A free ticket's words on the exchange cards and forms (USER-INSTRUCTIONS §9x item 1, SELL6-N1, live).
// An exchange agreed at $0 has a total of zero: nothing is paid, so nobody is asked for a way to be paid or shown where to pay, the
// two payment steps are skipped (the engine's reserve puts a free reservation straight at the stage where the seller sends the
// ticket), and no sentence says to pay, or that a payment was made or confirmed. Everything else reads as for any ticket: the
// invitation holds nothing, the reservation holds the ticket, the seller sends it, the buyer confirms receipt.
// Each function takes `gratis` (the exchange, or the listing it would be for, is at $0) and returns the words for either case; for a
// priced ticket they are, word for word, what the cards said before. Pure functions: unit-tested in n1-free.test.ts.
import { money } from "@penntools/tool-handoff/engine";

/** Short pieces a sentence is built with: "Invite Dan" + toPay, "reserve it" + thenPay; another buyer's hold; the reserve button. */
export const freeWords = gratis => ({
  toPay: gratis ? "" : " to pay",
  thenPay: gratis ? "" : ", then pay",
  busy: gratis ? "Another buyer has reserved it" : "Another buyer is paying for it right now",
  busyShort: gratis ? "Another buyer has reserved it" : "Another buyer is paying right now",
  reserveBtn: gratis ? "Reserve" : "Reserve and pay",
  inviteBtn: gratis ? "Invite" : "Invite to pay",
});
/** The card's top line: what it comes to and for whom ("$30 to Ann", "$30 to you"), or "Free". */
export const priceHead = ({ gratis, total, to }) => (gratis ? "Free" : `${money(total)} to ${to}`);
/** The invited buyer's next step. */
export const reserveNext = ({ gratis, holdFor, S, total }) => (gratis ? "Reserve it: it's free, so there's nothing to pay" : `Reserve it to hold it for ${holdFor}, then pay ${S} ${money(total)}`);
/** The seller's line while their invitation waits. */
export const reservesNext = ({ gratis, B, total }) => (gratis ? `${B} reserves it, or declines` : `${B} reserves it and pays you ${money(total)}, or declines`);
/** Under a request to buy, for its buyer: nothing is held (and where to pay shows only once it's reserved; for a free one, nothing is paid). */
export const askedNote = gratis => (gratis ? "Nothing is held yet. It's free, so there's nothing to pay." : "Nothing is held yet, and you'll see where to pay once you reserve.");
/** Under an invitation, for its buyer. */
export const invitedNote = ({ gratis, holdFor, S }) => (gratis ? `Not held yet: it's yours once you reserve it. ${S} may invite others too.` : `Not held yet: it's yours once you reserve it, then you have ${holdFor} to pay. ${S} may invite others too.`);
/** A listing's own button and its form's heading: nobody "buys" a free ticket, so it's asked for ("Request this ticket"). */
export const askBtn = (gratis, unit = "ticket") => (gratis ? `Request this ${unit}` : "Request to buy");
export const askHead = ({ gratis, unit = "ticket", S }) => (gratis ? `Request this ${unit} from ${S}` : `Request to buy from ${S}`);
/** The example in the request's optional note: nothing about paying for a free ticket. */
export const askNoteExample = gratis => (gratis ? "e.g. I'd love to go." : "e.g. I can pay right away.");
/** What "Request to buy" says it does, before it's sent. */
export const askWords = ({ gratis, S }) => (gratis ? `This asks ${S} to invite you. Nothing is held until you reserve it, and there's nothing to pay: it's free.` : `This asks ${S} to invite you to pay. Nothing is held, and you'll see where to pay once you reserve.`);
/**
 * The card's progress steps and how far each state is along them. A free ticket's exchange has no "Paid" step: Invited, Reserved,
 * Delivered, Received. freeFlow: a $0 record of the invitation flow that is before its reservation or skipped the payment steps
 * (one reserved at $0 before §9x keeps the older steps, which it went through).
 * @param {{ nf: boolean, offerish: boolean, isoReply: boolean, freeFlow: boolean }} o
 */
export function cardSteps({ nf, offerish, isoReply, freeFlow }) {
  if (freeFlow) return { steps: ["Invited", "Reserved", "Delivered", "Received"], done: { requested: 0, invited: 1, confirmed: 2, sent: 3, completed: 4 } };
  const o = offerish || nf ? 1 : 0;
  return { steps: [...(nf ? ["Invited"] : offerish ? [isoReply ? "Held reply" : "Offer"] : []), "Reserved", "Paid", "Delivered", "Received"],
    done: { pending: 0, countered: 0, proposed: 0, ...(nf ? { requested: 0, invited: 1 } : {}), accepted: o + 1, paid: o + 2, confirmed: o + 2, sent: o + 3, completed: o + 4 } };
}
/** The reasons "There's a problem" offers: none about paying on a free ticket's exchange. */
export const problemReasons = (opts, gratis) => (gratis ? opts.filter(o => !/\bpa(y|id)\b/i.test(o)) : opts);
