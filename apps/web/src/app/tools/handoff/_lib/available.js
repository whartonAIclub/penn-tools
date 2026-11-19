// Available in the shared market, without the All / Available / Nothing listed selector (USER-INSTRUCTIONS §9r, live).
// - The feed is what can be taken now: the events with a ticket anyone could take, and the goods on sale. Nothing chooses between
//   "available" and "nothing listed" any more, and a choice kept from before is never read (a guest's choices across sign-in:
//   _lib/session.js keeps none; here d.avail is ignored).
// - A search, or a club, still finds an event that's on Handoff with no tickets: a row under the grid with its name, its date and
//   "Request a ticket" (requestLabel), which opens Request a ticket (ISO) with that event chosen. Only while requests for it are open
//   (the engine's demandAllowed): after its cutoff (its day, its departure or its transfer deadline) it isn't in Available at all.
// - Every event is its own row, so two seatings of one show or two departures of one train stay apart, each with its own time.
// This file is the signed-out visitor's half (the guest view's records: listings open to take, with how many are left) and the row's
// words; a signed-in viewer's Available is the engine's availableNow, by the same rules. Pure functions over the engine (CLOCK):
// unit-tested in available.test.ts. The development preview keeps its selector and the engine's availableFor.
// §9s item 1: the event-date control ("Next 7 days / Next 30 days") is gone from the shared market as well, so d.when is never read
// here either: a state kept with it opens the same feed. An event's own date, deadline or departure still decides what shows.
import { EVENTS, CLOCK, access, atMs, evText, catOf, clubOf, clubOrgs, CLUB_CATS, demandAllowed, pickupOver, unitOf, aUnit, eventClubs } from "@penntools/tool-handoff/engine";
import { guestItemText } from "./goods";

/** A guest view's listings open to take now (the server sends only those; the clock also closes a train that has left or a window that has shut). */
export const guestOpenListings = (s, ev) => access(ev).ok ? s.listings.filter(l => l.eventId === ev.id && l.available > 0 && !(l.departsAt && atMs(l.departsAt) <= CLOCK)) : [];
/** How many tickets a guest view holds for an event that anyone signed in could take now. */
export const guestStock = (s, ev) => guestOpenListings(s, ev).reduce((t, l) => t + l.available, 0);

/**
 * The engine's exploreRows for a guest: the same filters and order, with each event's stock from the guest listings. Closed events leave
 * the list unless a search names them (guestAvailable then leaves them out of its rows: requests for them are closed).
 * @param {object} s  The guest view.
 * @param {{ q?: string, kind?: string, club?: string[] | null }} [o]  kind: a discovery category; club: its organizer names.
 */
export function guestEventRows(s, { q = "", kind = "all", club = null } = {}) {
  const ql = q.toLowerCase().trim(), rank = r => r.stock > 0 ? 0 : r.a.ok ? 2 : 5;
  return EVENTS.map(ev => ({ ev, a: access(ev), stock: guestStock(s, ev) })).filter(({ ev, a }) => {
    if (ql && !evText(ev).includes(ql)) return false;
    if (!ql && (a.kind === "closed" || a.kind === "official")) return false; // closed events leave the list; a search still reads them
    if (kind !== "all" && catOf(ev) !== kind) return false; // "goods" matches no event
    if (club && !eventClubs(ev).some(c => club.includes(c))) return false; // §9x item 5: its own club, or the ones named on its listings when it names none (the engine's eventClubs; the search reads them too: evText)
    return true;
  }).sort((x, y) => rank(x) - rank(y) || (x.ev.openUntil || x.ev.start).localeCompare(y.ev.openUntil || y.ev.start));
}

/**
 * Available for a guest, by the rules of the engine's availableNow: event cards with stock and items on sale, newest or cheapest
 * first; then, for a search or a club, rows for events with nothing to take while requests for them are open. By club is about
 * events, so goods leave the grid while a club is chosen. d.avail and d.when (the removed selector's and the removed event-date
 * control's choices) are never read, so evFilters is always false.
 * @param {object} s  The guest view.
 * @param {{ cat: string, q: string, goodsCat: string, club: string | null, sortA: string }} d  App's discovery state.
 */
export function guestAvailable(s, d) {
  const cat = d.cat, q = d.q.trim(), ql = q.toLowerCase(), events = cat !== "goods";
  const clubOn = !!clubOf(d.club) && CLUB_CATS.includes(cat);
  const evFilters = false; // §9s item 1: no event filter is left in the shared market
  const rows = events ? guestEventRows(s, { q, kind: cat, club: clubOn ? clubOrgs(d.club) : null }) : [];
  const evCards = rows.filter(r => r.stock > 0).map(({ ev, stock }) => {
    const open = guestOpenListings(s, ev);
    return { key: ev.id, ev, stock, at: Math.max(...open.map(l => l.createdAt)), price: Math.min(...open.map(l => l.ask)) };
  });
  const goodsOn = cat === "goods" || (cat === "all" && !clubOn && !evFilters);
  const items = !goodsOn ? [] : s.goods.filter(it => !pickupOver(it) && (cat !== "goods" || d.goodsCat === "All" || it.cat === d.goodsCat) && (!ql || guestItemText(it).includes(ql)))
    .map(it => ({ key: it.id, it, at: it.createdAt, price: it.price }));
  const by = d.sortA === "price" ? (a, b) => a.price - b.price || b.at - a.at : (a, b) => b.at - a.at;
  const lookup = !events ? [] : rows.filter(r => r.stock === 0 && (!!q || clubOn) && demandAllowed(r.ev));
  return { cards: [...evCards, ...items].sort(by), lookup, clubOn, evFilters };
}

/** The row's own action for an event with nothing to take: "Request a ticket", or a spot on a trek. */
export const requestLabel = ev => `Request ${aUnit(unitOf(ev))}`;
/** The line under the rows' heading, signed in or not. */
export const LOOKUP_HINT = "Request a ticket, get notified privately, or open one for its details.";
