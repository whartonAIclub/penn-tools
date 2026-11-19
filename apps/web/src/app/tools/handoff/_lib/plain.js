// Plain words (USER-INSTRUCTIONS §9x item 4; SELL6-N3, live): Handoff offers no ticket verification, and it used to say so wherever a
// ticket showed: a "Seller says they have it · not verified" chip on every listing and exchange, "self-reported, not verified" beside
// a seller's own tickets, "Handoff can't see tickets, so your listing shows as not verified" on Sell, "(self-reported)" after each
// step of an exchange, "details not checked by Handoff" in every event's head, and a long note under "Tickets you've added". An
// ordinary listing carries no warning just because verification isn't offered, so the shared market's pages no longer say any of it.
// One explanation stays, in Help (HELP_VERIFY).
//
// This is presentation only. Nothing stored changes: a holding keeps its source, an event its note of who added it, an exchange its
// history as the server wrote it, and the engine, the server and every record read as before (the pilot report too). The page shows
// those records in plainer words:
// - progressLine: an exchange's history line, who acted in natural words: "Buyer marked paid", "Seller confirmed payment", "Seller
//   marked ticket sent", "Buyer confirmed receipt". One person reporting a step ("marked") and the other confirming it ("confirmed")
//   stay two different lines. A simulated account's line, a refusal, a release or a dispute reads as it was stored.
// - paidWords: the Payment row once the buyer has said they paid: "You marked $20 paid by Venmo", and "Maya confirmed payment" only
//   once the seller has.
// - sourceLine, basisLine: who added an event and who entered its face value, without "not checked by Handoff".
// - holdingSource: beside a seller's own ticket, nothing for one they entered themselves; "received through Handoff" for one a
//   completed exchange gave them.
// - plainToast: the server's "Ticket listed." for a new event, and its "Trek added." (or event, or train) from the form that adds one,
//   without "Handoff doesn't check its details".
// What stays, on purpose: a ticket's real restrictions ("GCC members only", a name change, the seller's own words) and the buyer's
// own confirmation they ask for, an organizer's pending step, a train's carrier rule, the words at a dispute or a late payment (where
// "Handoff can't see payments" says why the two people sort it out themselves), Penn sign-in wording, and every "Simulated" label.
// The development preview keeps all its own words. Pure functions: unit-tested in n3-plain.test.ts.

/** Help's one explanation (§9x item 4), word for word, and its question. */
export const HELP_VERIFY_Q = "Does Handoff verify tickets or handle payments?";
export const HELP_VERIFY = "Handoff doesn't verify tickets or process payments. Payment and ticket delivery happen directly between buyer and seller.";

/** The four steps of an exchange, by who acted: the buyer and the seller each report one and confirm the other's. */
export const PROGRESS = Object.freeze({ paid: "Buyer marked paid", confirmed: "Seller confirmed payment", sent: "Seller marked ticket sent", received: "Buyer confirmed receipt" });

const SENT = Object.freeze({
  "sent it": PROGRESS.sent,
  "transferred it in Ticketmaster or AXS": `${PROGRESS.sent} (transferred in Ticketmaster or AXS)`,
  "handed over the paper ticket": "Seller marked ticket handed over",
});
/**
 * An exchange's history line as the page shows it. The stored text is the engine's and never changes; these are its four routine
 * steps in plainer words, with what the buyer said they paid kept ("Buyer marked paid ($20 by Venmo)"). A seller's request to the
 * organizer for a name change keeps its own words (the organizer's step is still pending). Any other line is as stored, less a
 * trailing "(self-reported)" or "(not checked by Handoff)": the step itself, and who took it, stay.
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function progressLine(text) {
  const t = typeof text === "string" ? text : "";
  let m = /^Buyer said they paid(?: (\S.*?))? \(self-reported\)$/.exec(t);
  if (m) return m[1] ? `${PROGRESS.paid} (${m[1]})` : PROGRESS.paid;
  if (t === "Seller confirmed the payment arrived") return PROGRESS.confirmed;
  if (t === "Buyer confirmed they received it") return PROGRESS.received;
  m = /^Seller (\S.*?) \(self-reported\)$/.exec(t);
  if (m && Object.prototype.hasOwnProperty.call(SENT, m[1])) return SENT[m[1]];
  return t.replace(/\s*\((?:self-reported|not checked by Handoff)\)\s*$/, "");
}

/**
 * The Payment row of an exchange once the buyer has said they paid: { said, confirmed }. said: who marked it paid, how much and
 * with which app ("You marked $20 paid by Venmo"; the page adds where it went). confirmed: "Maya confirmed payment" once the seller
 * has, "" until then. The two stay apart: a payment the buyer marked isn't one the seller confirmed.
 * @param {{ isB: boolean, B: string, S: string, amount: string, via?: string | null, confirmed?: boolean }} p  B, S: the buyer's and the seller's first names; amount: the total, as money
 */
export function paidWords({ isB, B, S, amount, via = null, confirmed = false }) {
  return { said: `${isB ? "You" : B} marked ${amount} paid${via ? ` by ${via}` : ""}`, confirmed: confirmed ? `${isB ? S : "You"} confirmed payment` : "" };
}

/** An event's source line: who added it ("Added by Maya P."), without the routine "· details not checked by Handoff". */
export const sourceLine = note => String(note == null ? "" : note).replace(/\s*·\s*details not checked by Handoff\s*$/, "");
/** Where a face value comes from ("entered by Maya"), without the routine ", not checked by Handoff". */
export const basisLine = text => String(text == null ? "" : text).replace(/,\s*not checked by Handoff\s*$/, "");
/** Beside a seller's own ticket: nothing for one they entered themselves (every ticket starts that way); where a completed exchange
    in Handoff gave it to them, that it came through Handoff. The stored source is unchanged. */
export const holdingSource = source => (source === "transferred" ? "received through Handoff" : "");
/** The chip over an event's several face values: they are as someone entered them. */
export const FACE_CHIP = "Face values as entered";
/** The server's toast for a ticket listed on a new event, without "and Handoff doesn't check its details" (the request's toast
    already reads this way: "… is new on Handoff and shows as added by you."), and the same for its toast after an event, a train or a
    trek is added in its own form ("Trek added. It shows as added by you."; a note the form adds after it stays). Any other toast is as
    the server said it. */
export const plainToast = text => (typeof text === "string" ? text
  .replace(/ is new on Handoff: it shows as added by you, and Handoff doesn't check its details\.$/, " is new on Handoff and shows as added by you.")
  .replace(/^(Event|Train|Trek) added\. It shows as added by you, and Handoff doesn't check its details\./, "$1 added. It shows as added by you.") : text);
