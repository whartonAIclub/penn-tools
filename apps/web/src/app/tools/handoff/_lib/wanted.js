// Wanted for a signed-out visitor: the guest view's `wanted` (live public requests without who asked, their note or their budget).
// - guestWantedLive: a request still shows while it hasn't ended and, for an event, while requests for that event are open.
// - guestWantedRows: the engine's wantedNow for a guest: the shared category, search, club and goods category, and Wanted's sort
//   without the budget (a guest never gets one).
// §9s item 1: Wanted has no "Needed by" control in the shared market, so d.need is never read here either: a state kept with it (a
// guest's choices across sign-in) opens the same list. A request's own deadline and its event's cutoff still end it (guestWantedLive).
// A Wanted card's lines, signed in or not (§9s item 7, the shared market's cards):
// - wantedWhen: the event's date (with a train's departure time) and how many, which the card groups on one line; an item request's
//   category and "1 item".
// - wantedNeed: a stated budget ("Up to $30"; a guest's view has none), and the deadline only where it says something: earlier than
//   the event's own cutoff (a request runs to that cutoff unless its buyer chose an earlier date, so the date never shows twice), or an
//   item request's, which is its only date.
// Pure functions over the engine (CLOCK): unit-tested in wanted.test.ts. They were in HandoffPrototype.jsx until step SELL4-L1.
import {
  EV, CLOCK, atMs, catOf, catLabel, clubOf, clubOrgs, CLUB_CATS, demandAllowed, fmtDay, fmtRange, fmtWhen, plural, unitOf, money, requestEndMs,
  cutoffMs, eventClubs
} from "@penntools/tool-handoff/engine";

export const guestWantedLive = w => (!w.expires || atMs(w.expires) > CLOCK) && (w.eventId ? !!EV[w.eventId] && !EV[w.eventId].removedAt && demandAllowed(EV[w.eventId]) : !!w.goods);
export const guestWantedTitle = w => w.eventId ? EV[w.eventId].title : w.goods.title;
/** What a guest's search reads of a request: its event's or item's name, the event's club and category, the item's category. */
export const guestReqText = w => { const ev = w.eventId ? EV[w.eventId] : null; return [guestWantedTitle(w), ev && eventClubs(ev).join(" "), ev && catLabel(ev.cat), w.goods && w.goods.cat].filter(Boolean).join(" ").toLowerCase(); }; // eventClubs (§9x item 5): its club, or the ones named on its listings
/**
 * Wanted's rows for a guest, newest first or soonest deadline first.
 * @param {object} s  The guest view.
 * @param {{ cat: string, q: string, goodsCat: string, club: string | null, sortW: string }} d  App's discovery state.
 */
export function guestWantedRows(s, d) {
  const cat = d.cat, ql = d.q.trim().toLowerCase(), clubOn = !!clubOf(d.club) && CLUB_CATS.includes(cat);
  const rows = s.wanted.filter(w => {
    if (!guestWantedLive(w)) return false;
    const ev = w.eventId ? EV[w.eventId] : null;
    if (cat !== "all" && (w.goods ? "goods" : catOf(ev)) !== cat) return false;
    if (cat === "goods" && d.goodsCat !== "All" && w.goods.cat !== d.goodsCat) return false;
    if (clubOn && !(ev && eventClubs(ev).some(c => clubOrgs(d.club).includes(c)))) return false; // §9x item 5: eventClubs, as on Available
    return !ql || guestReqText(w).includes(ql);
  });
  const due = w => w.expires ? atMs(w.expires) : Infinity;
  return rows.sort(d.sortW === "deadline" ? (a, b) => due(a) - due(b) || b.createdAt - a.createdAt : (a, b) => b.createdAt - a.createdAt);
}

/**
 * A Wanted card's date and quantity, shown together: { when, qty }. An event: its date as its cards show it (fmtRange: a train's
 * departure time, a trek's days) and its tickets or spots. An item request: its category and "1 item". An older request for an event
 * that isn't on Handoff: the date it gave, or "Flexible dates".
 * @param {{ qty: number, goods?: { cat?: string } | null, missing?: { when?: string, flexible?: boolean } }} i  a request (signed in) or a guest's row
 * @param {object | null} ev  its event, if it has one
 */
export function wantedWhen(i, ev) {
  if (i.goods) return { when: i.goods.cat || null, qty: "1 item" };
  if (ev) return { when: fmtRange(ev), qty: plural(i.qty, unitOf(ev)) };
  const miss = i.missing || {};
  return { when: miss.flexible || !miss.when ? "Flexible dates" : fmtDay(miss.when), qty: plural(i.qty, "ticket") };
}

/**
 * What a Wanted card adds about the need: { budget, until }, each null when it has nothing to say.
 * budget: "Up to $30" ("… reimbursement" for a trip spot) when the request states one; blank is no budget, never $0. A guest's row
 * never has one. until: "Needed by Fri, Nov 20" when the request ends before its event's own cutoff (its buyer chose an earlier date);
 * a request that runs to its event's cutoff says nothing more, since the card already shows the event's date. An item request's, or an
 * older one's for an event not on Handoff (unless it's that event's own day or later), always shows: it's the card's only deadline.
 */
export function wantedNeed(i, ev) {
  const budget = typeof i.budget === "number" ? `Up to ${money(i.budget)}${ev && ev.premium ? " reimbursement" : ""}` : null;
  if (!i.expires) return { budget, until: null };
  const words = `Needed by ${fmtWhen(i.expires)}`;
  if (ev) return { budget, until: requestEndMs(i, ev) < cutoffMs(ev) ? words : null };
  const miss = (!i.goods && i.missing) || {};
  return { budget, until: miss.when && !miss.flexible && atMs(i.expires) >= atMs(miss.when) ? null : words };
}
