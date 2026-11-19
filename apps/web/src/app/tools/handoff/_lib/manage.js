// Manage listing for ordinary tickets (USER-INSTRUCTIONS §9q items 1 to 3, live): the rules of the seller's listing panel that need no
// page (_components/exchanges.jsx's ListingPanel and QuickCard, and the event page's "Your listing"). Here:
// - which listings are ordinary tickets (ordinaryTicket: a ticket for an event; never a train's, a trek's or an add-on, whose rules and
//   panels stay as they were), and which of them have a routine delivery (routineTransfer: no recorded method, or the old form's
//   default "PDF or QR code"), so their seller reads no method badge and no delivery explanation until sending is the next step;
// - the short status that takes the place of the row of counters (listingStatus: "1 ticket available · $25", with held, paused and
//   transferred counts only when there are any);
// - which buyers' cards go to the top (needsSeller: exactly what My activity lists under "Needs your attention" for this listing);
// - the step after the seller confirms a payment (sendStep: "Send the ticket to Ann …", with the existing "I've sent it");
// - what the close confirmation says closing ends, with how many (closeEnds, closeText);
// - the listings shown as "Your listing" on their event's page, which is where a seller's own shared link opens (ownListings).
// Pure functions over the engine: unit-tested in manage.test.ts. The preview never calls them: its panels are as they were.
import { isAddOn, listingNumbers, listingState, methodOf, money, needsAction, plural } from "@penntools/tool-handoff/engine";

/**
 * An ordinary ticket: a student's ticket for an event. Never a train's or a trek's (their carrier and organizer rules stay), a club
 * trip's, or a trek's add-on.
 * @param {import("@penntools/tool-handoff/engine").EngineEvent | null | undefined} ev
 * @param {{ tier: string | null } | null | undefined} l
 */
export const ordinaryTicket = (ev, l) => !!ev && !!l && ev.kind === "event" && !ev.premium && !ev.organizerRequired && !isAddOn(ev, l);

/**
 * An ordinary ticket whose delivery is routine: its seller promised no method, or it carries the old Sell form's default ("PDF or QR
 * code"). A method that changes what the seller or the buyer has to do (an organizer name change, a Ticketmaster or AXS transfer, a
 * paper ticket) is specific, and stays wherever it showed.
 * @param {import("@penntools/tool-handoff/engine").EngineEvent | null | undefined} ev
 * @param {(Pick<import("@penntools/tool-handoff/engine").Listing, "method"> & { tier: string | null }) | null | undefined} l
 */
export const routineTransfer = (ev, l) => ordinaryTicket(ev, l) && (methodOf(l) === null || methodOf(l) === "file");

/**
 * The listing's short status: what's available and its price first, then what's paused, held or transferred, each only when there is
 * some. "1 ticket available · $25"; "1 ticket available · 1 held · $25 each"; "1 ticket transferred · $25"; "Closed · 1 held · $25 each".
 * @param {{ listed: number, available: number, reserved: number, completed: number, paused?: number, closed?: boolean, ask: number, unit?: string }} n
 *   listed: as posted; available, reserved, completed: the engine's listingNumbers; paused: its pausedUnits; closed: its seller closed it.
 * @returns {string}
 */
export function listingStatus({ listed, available, reserved, completed, paused = 0, closed = false, ask, unit = "ticket" }) {
  const parts = [];
  const count = (k, word) => { if (k > 0) parts.push(parts.length ? `${k} ${word}` : `${plural(k, unit)} ${word}`); };
  if (closed) parts.push("Closed"); else count(available, "available");
  count(paused, "paused"); count(reserved, "held"); count(completed, "transferred");
  if (!parts.length) parts.push(`${plural(listed, unit)} listed`); // off sale with its event (the transfer window closed, the event started): the chip beside it says why
  return [...parts, `${money(ask)}${listed > 1 ? " each" : ""}`].join(" · ");
}

/**
 * The requests on this listing that wait for its seller, as My activity's "Needs your attention" has them (the engine's needsAction):
 * a request to buy to answer, a payment to confirm, a ticket to send, a reported problem. Their cards go to the top of the panel.
 * @param {import("@penntools/tool-handoff/engine").WorldState} s
 * @param {string} me
 * @param {{ id: string }} l
 * @returns {string[]} request ids
 */
export function needsSeller(s, me, l) {
  return needsAction(s, me).filter(t => t.kind !== "goods" && t.role === "seller" && t.x.listingId === l.id).map(t => t.x.id);
}

/**
 * The seller's step once they've confirmed the payment, for a listing with no recorded method: who to send it to, then the existing
 * "I've sent it". (A recorded method keeps its own instruction: QuickCard.)
 * @param {string} buyer  the buyer's first name
 * @param {string} unit  "ticket" or "spot"
 * @param {boolean} hasEmail  the buyer's email shows below it
 */
export const sendStep = (buyer, unit, hasEmail) => `Send the ${unit} to ${buyer}${hasEmail ? " (their email is below)" : ""}, then tap “I've sent it”`;

const listOf = xs => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/**
 * What closing ends, with how many: requests to buy the seller hasn't answered, invitations nobody has reserved yet, and open offers.
 * None of them holds anything. "" when there are none.
 * @param {{ requests?: number, invitations?: number, offers?: number }} n
 */
export function closeEnds({ requests = 0, invitations = 0, offers = 0 } = {}) {
  const items = [requests > 0 && plural(requests, "pending request"), invitations > 0 && plural(invitations, "invitation"), offers > 0 && plural(offers, "open offer")].filter(Boolean);
  const total = requests + invitations + offers;
  return total > 0 ? `Closing ends ${listOf(items)}: ${total === 1 ? "that buyer is" : "those buyers are"} told.` : "";
}
/**
 * The close confirmation's words: what comes back, what closing ends (closeEnds), and that reservations and paid exchanges go on.
 * @param {{ left: number, unit?: string, requests?: number, invitations?: number, offers?: number, reserved?: number }} n
 *   left: tickets neither held nor transferred; reserved: tickets held for buyers or paid for (the engine's listingNumbers).
 */
export function closeText({ left, unit = "ticket", requests = 0, invitations = 0, offers = 0, reserved = 0 }) {
  const ends = closeEnds({ requests, invitations, offers });
  return ["Close this listing?",
    left > 0 ? `${plural(left, unit)} ${left === 1 ? "comes" : "come"} back to you, and classmates can't ask to buy ${left === 1 ? "it" : "them"}.` : "Classmates can't ask to buy it any more.",
    ends, reserved > 0 ? "Reservations already made continue; if one ends unpaid, it comes back to you." : ""].filter(Boolean).join(" ");
}

/**
 * The seller's own ordinary listings shown as "Your listing" on their event's page (where their own shared link opens), with Edit and
 * Close right there: the one the link points at, whatever its state; those still in play (something available, paused or held);
 * and any already showing on this visit (shown), so one closed here stays to say so.
 * @param {import("@penntools/tool-handoff/engine").WorldState} s
 * @param {string} me
 * @param {import("@penntools/tool-handoff/engine").EngineEvent} ev
 * @param {string | null | undefined} focusId  the listing a link points at
 * @param {Set<string>} [shown]
 */
export function ownListings(s, me, ev, focusId, shown) {
  return s.listings.filter(l => l.eventId === ev.id && l.sellerId === me && !l.isoReplyFor && ordinaryTicket(ev, l)
    && (l.id === focusId || (shown && shown.has(l.id)) || !["transferred", "closed", "withdrawn"].includes(listingState(s, l).key) || listingNumbers(s, l).reserved > 0));
}
