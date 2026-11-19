// "I have this" on a ticket request in one submission (USER-INSTRUCTIONS §9v item 2, SELL5-M3, live): the rules of the request page's
// answer and of the Sell form made for a request that need no page.
// - Which answer the request page leads with (listAndInviteOffered): invite the requester from a listing of yours that fits; or, with
//   none (and nothing already open with them), "List and invite <first name>", the Sell form for the request.
// - What either sends (answerAction, inviteFromListing): one action, the engine's answerRequest, which lists the ticket and invites the
//   requester in one change (or invites them from the listing), so a double tap or a resend makes one listing and one invitation.
// - What the form says before the tap (answerSummary): "You'll invite Dan to pay $30 for 1 ticket." (§9w, SELL5-M4): how many the requester is invited for (one unless more are listed, never more
//   than they asked for), the total, a price over their budget, and that inviting holds nothing.
// - Where it lands (answerLanding): "Ticket listed. Invitation sent to Dan." (§9w) or, when the request closed meanwhile, exactly why no
//   invitation went out, in the server's words.
// Pure functions: unit-tested in m3-answer.test.ts.
import { money, parseMoney, plural } from "@penntools/tool-handoff/engine";

/** "List and invite" leads only when you could list a ticket here, no listing of yours can invite them, and you have nothing open with them. */
export const listAndInviteOffered = ({ canCreate, invitable, dealing }) => !!canCreate && !invitable && !dealing;

/* What answerRequest takes from the Sell form, besides the request: the listing's own fields. Never an event (the request's is the one),
   another type, or a listing to invite from (that's inviteFromListing). */
const NOT_BODY = new Set(["type", "eventId", "event", "isoId", "holdingId", "tier", "listingId", "price"]);
/** The Sell form for a request: the ticket you hold (holdingId) or the type of the one you add (tier, where the event has several). */
export function answerAction({ isoId, holdingId = "", tier = "", body = {} }) {
  const out = { type: "answerRequest", isoId, ...(holdingId ? { holdingId } : tier ? { tier } : {}) };
  for (const [k, v] of Object.entries(body)) if (!NOT_BODY.has(k)) out[k] = v;
  return out;
}
/** "Invite <first name> to pay" on a listing you already have, from the request's page. */
export const inviteFromListing = ({ isoId, listingId, qty, price }) => ({ type: "answerRequest", isoId, listingId, qty, price: String(price == null ? "" : price).trim() });

export const HOLDS_NOTHING = "Inviting holds nothing: your listing stays open to everyone until someone reserves it.";
/** §9x item 1 (SELL6-N1): the price typed is $0, a free ticket. Nothing is paid, so the form asks for no way to be paid and its words
 *  invite nobody to pay. Empty, or not an amount: false (the price field says what's wrong).
 * @param {string | number | null | undefined} ask */
export function freeAsk(ask) {
  const typed = String(ask == null ? "" : ask).trim(); if (!typed) return false;
  const pm = parseMoney(typed); return !pm.error && pm.value === 0;
}
/** Whether the Sell form for a request must ask how buyers pay before it can invite: only for a paid ticket, with no method saved.
 * @param {{ ask: string | number | null | undefined, saved: number }} o saved: how many payment methods the seller has saved */
export const payAskedToInvite = ({ ask, saved }) => !freeAsk(ask) && !(saved > 0);
/** What the form says above "List and invite <first>", or null while the price can't be sent: not an amount, or above the event's face
 *  value (cap: the form's own cap for this ticket, or null when there's none), which the price field says. budget: the request's, or null.
 * @param {{ ask: string | number | null | undefined, listQty: number, isoQty: number, budget: number | null | undefined, first: string, unit: string, cap?: number | null }} o */
export function answerSummary({ ask, listQty, isoQty, budget, first, unit, cap = null }) {
  const typed = String(ask == null ? "" : ask).trim(); if (!typed) return null;
  const pm = parseMoney(typed); if (pm.error) return null;
  if (cap != null && Number.isFinite(cap) && pm.value > cap) return null; // never a total the form won't send
  const qty = Math.max(1, Math.min(listQty || 1, isoQty || 1)), total = pm.value * qty, rest = (listQty || 1) - qty;
  const notes = [
    rest > 0 && (rest === 1 ? `The other ${unit} stays open to everyone.` : `The other ${plural(rest, unit)} stay open to everyone.`),
    (isoQty || 1) > qty && `${first} asked for ${isoQty}.`,
    budget != null && pm.value > budget && `That's above ${first}'s budget of ${money(budget)}.`,
  ].filter(Boolean);
  // §9x item 1: at $0 nobody is invited to pay: "You'll invite Dan to take 1 ticket for free. Nothing to pay."
  if (total === 0) return { qty, total, free: true, lead: `You'll invite ${first} to take ${plural(qty, unit)}`, line: "for free. Nothing to pay.", notes, hold: HOLDS_NOTHING };
  return { qty, total, lead: `You'll invite ${first} to pay ${money(total)}`, line: `for ${plural(qty, unit)}.`, notes, hold: HOLDS_NOTHING }; // §9w: the total for how many (each ticket at the price entered)
}
/** What the form says there instead while there's no total: enter a price, or fix the one entered (the price field says what's wrong). */
export const answerHint = (ask, first) => String(ask == null ? "" : ask).trim() ? `Fix the price above to see what you'll invite ${first} to pay.` : `Enter your price to see what you'll invite ${first} to pay.`;
/** The form's opening line for a request: what posting does, in words that fit a free ticket too (§9x item 1). */
export const answerLead = (first, free) => free ? `Set your price. You'll invite ${first} as soon as it's listed.` : `Set your price. You'll invite ${first} to pay as soon as it's listed.`;

/** Where "List and invite" lands: the line the new listing shows, from the answer's steps (the server's words when no invitation went out). */
export function answerLanding(steps, first, unit) {
  const Unit = unit.charAt(0).toUpperCase() + unit.slice(1);
  const inv = (Array.isArray(steps) ? steps : []).find(x => x && x.type === "inviteRequester");
  if (inv && inv.ok) return { invited: true, note: `${Unit} listed. Invitation sent to ${first}.` }; // §9w
  if (inv && typeof inv.error === "string" && inv.error) return { invited: false, note: `Your ${unit} is listed. ${inv.error}` };
  return { invited: false, note: `${Unit} listed.` };
}
