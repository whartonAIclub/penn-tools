// One card layout on Available and Wanted (USER-INSTRUCTIONS §9v item 1, with §9w; SELL5-M4, the shared market): the words a card says
// that need no page. Every card leads with a compact coloured header (its row category's icon, look.js, and one line: how many are
// available, or how many are wanted and any stated budget), then the event's or item's name, its date once, and on Available the price.
// - wantedHead: a Wanted card's header line, "2 tickets wanted · Up to $30 each" (a budget is per ticket; a visitor's view has none).
// - cardNote: a request's note shows on its card only when it's short; a longer one is read on the request's page.
// - showsMatch: "A listing may match" is shown to the requester, on their own card (§9w); the request's page names it too.
// - faceCaption: Available's price line names the face value only when it isn't the price shown ("Spots from $900 · Face value $900"
//   said the same thing twice).
// - membersTag: a members-only event names its club on its card, in the words buyers read before reserving ("GCC members only"); a club
//   alone restricts nothing and is plain text on the card's date line.
// §9x item 3 (SELL6-N2): a card's status is secondary, and each thing is said once.
// - ownCard: the owner's own listing on Available wears a small "Your listing" label where the others have their pill (it was a pill
//   that said "You've listed 1 ticket" above a line that said "1 ticket available"). What is actually so is said once, under the price:
//   how many are available, how many a buyer holds, how many are paused. A viewer's own request or reservation keeps its pill.
// - cardPrice: the price a card shows. The owner's own reads as the price alone (the label says whose it is); a free ticket reads
//   "Free" (§9x item 1), never "$0".
// §9y (SELL7-O1): a card's club is on its own quiet line under the date, and a tap on it applies it in By club.
// - cardClubs: the clubs that line names: what By club and the search read (the engine's eventClubs).
// - clubKeyFor: By club's key for one of them, so the tap applies it; null for a club By club doesn't list (plain text then).
// Pure functions over the engine: unit-tested in m4-cards.test.ts, n2-cards.test.ts and o1-club.test.ts.
import { CLUB_MENU, eventClubs, money, plural, squash, unitOf } from "@penntools/tool-handoff/engine";

/**
 * A Wanted card's header line: how many are wanted, then a stated budget ("Up to $30", per ticket: "each" when more than one is wanted;
 * a trip spot's is a reimbursement). { qty, budget, text }; budget is null when none was stated (blank is no budget, never $0).
 * @param {{ qty?: number, budget?: number | null, goods?: object | null, missing?: object | null }} i  a request (signed in) or a guest's row
 * @param {object | null} ev  its event, if it has one
 */
export function wantedHead(i, ev) {
  const n = i.goods ? 1 : Math.max(1, Number(i.qty) || 1);
  const qty = `${plural(n, i.goods ? "item" : unitOf(ev))} wanted`;
  const budget = typeof i.budget === "number" ? `Up to ${money(i.budget)}${ev && /** @type {{ premium?: boolean }} */ (ev).premium ? " reimbursement" : ""}${n > 1 ? " each" : ""}` : null;
  return { qty, budget, text: budget ? `${qty} · ${budget}` : qty };
}

/** The longest note a Wanted card shows; a longer one is on the request's page. */
export const CARD_NOTE_MAX = 60;
/**
 * The note a Wanted card shows, trimmed, or null (none, or longer than CARD_NOTE_MAX).
 * @param {unknown} note
 * @returns {string | null}
 */
export const cardNote = note => { const t = typeof note === "string" ? note.trim() : ""; return t && t.length <= CARD_NOTE_MAX ? t : null; };

/**
 * Whether a Wanted card shows "A listing may match": on the requester's own card only.
 * @param {{ userId?: string }} i
 * @param {string | null | undefined} me
 */
export const showsMatch = (i, me) => !!me && !!i && i.userId === me;

/**
 * Available's caption under the price: the face value, unless it's the very price shown.
 * @param {string | null | undefined} face  "Face value $25", "Face value $20–$30", or nothing
 * @param {string} price  the price as shown ("$25")
 */
export const faceCaption = (face, price) => !face ? "" : face === `Face value ${price}` ? "" : face;

/**
 * A members-only event's tag on its card: "<club> members only" ("Members only" when it names no club); null for any other event.
 * @param {{ attend?: string, club?: string } | null | undefined} ev
 * @returns {string | null}
 */
export const membersTag = ev => ev && ev.attend === "members" ? (ev.club ? `${ev.club} members only` : "Members only") : null;

/**
 * §9y. The clubs a card names on its own line: an event's own club, or, for an event that names none, the clubs its sellers named on
 * their open listings (eventClubs: what By club and the search read, so the card matches what they find). For a request for an event
 * not on Handoff (ev null), the club its requester typed, trimmed. None for a train (its carrier isn't a club) or blank text.
 * @param {{ cat?: string, club?: string } | null | undefined} ev
 * @param {string | null | undefined} [typed]
 * @returns {string[]}
 */
export function cardClubs(ev, typed = null) {
  if (ev) return ev.cat === "Travel" ? [] : eventClubs(/** @type {never} */ (ev)).filter(Boolean);
  const c = typeof typed === "string" ? typed.replace(/\s+/g, " ").trim() : "";
  return c ? [c] : [];
}
/**
 * §9y. By club's key for a club a card names, so a tap on it applies it: the club in By club's menu with that very name, else one
 * spelled alike ("gcc" and "GCC" are one club there); null when By club doesn't list it.
 * @param {string | null | undefined} name
 * @returns {string | null}
 */
export function clubKeyFor(name) {
  const n = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!n) return null;
  const names = (/** @type {{ label: string, orgs?: string[] }} */ c) => c.orgs || [c.label];
  const s = squash(n);
  const c = CLUB_MENU.find(x => names(x).includes(n)) || (s ? CLUB_MENU.find(x => names(x).some(o => squash(o) === s)) : null);
  return c ? c.k : null;
}

/** The small label on the owner's own card, a ticket's or an item's. */
export const OWN_LABEL = "Your listing";
/**
 * The owner's own listing as its card on Available says it, or null when the card isn't about the viewer's listing (someone else's
 * tickets are on it, or the viewer has a request or a reservation of their own there, which keeps its pill).
 * { label: "Your listing", status }: status is what is actually so, said once: "1 ticket available", "1 ticket available · 1 ticket
 * held for a buyer", "1 ticket held for a buyer", "1 ticket paused" ("" when there is nothing to say).
 * @param {{ state?: { key?: string } | null, myOpen?: object | null, ownMain?: object | null, ownUnit?: string, ownAvail?: number, ownReserved?: number, ownPaused?: number } | null | undefined} sum  the engine's eventSummary for this viewer
 * @returns {{ label: string, status: string } | null}
 */
export function ownCard(sum) {
  if (!sum || !sum.state || sum.state.key !== "mine" || sum.myOpen || !sum.ownMain) return null;
  const u = sum.ownUnit || "ticket";
  const status = [sum.ownAvail ? `${plural(sum.ownAvail, u)} available` : null, sum.ownReserved ? `${plural(sum.ownReserved, u)} held for a buyer` : null,
    sum.ownPaused ? `${plural(sum.ownPaused, u)} paused` : null].filter(Boolean).join(" · ");
  return { label: OWN_LABEL, status };
}
/**
 * The price a card shows, from the engine's price pieces (priceParts' main: what comes before the figure, the figure, what follows).
 * own: the viewer's own listing, which leads with the figure ("$25", "$25 per ticket"), not "Your listing: $25". A figure of $0 is a
 * free ticket: "Free", alone.
 * @param {{ pre?: readonly string[], bold?: readonly string[], post?: readonly string[] }} main
 * @param {{ own?: boolean }} [o]
 * @returns {{ pre: string, bold: string, post: string }}
 */
export function cardPrice(main, { own = false } = {}) {
  const j = (/** @type {readonly string[] | undefined} */ xs) => (xs || []).join("");
  const bold = j(main.bold);
  if (bold === money(0)) return { pre: "", bold: "Free", post: "" };
  return { pre: own ? "" : j(main.pre), bold, post: j(main.post) };
}
/**
 * The line under the owner's price: the status once, then the face value when the event gives one that isn't the price shown.
 * @param {{ status: string }} own  ownCard's
 * @param {string | null | undefined} sub  the engine's caption ("1 ticket available · face value $25")
 * @param {string} price  the price as shown ("$25", "Free")
 */
export function ownSub(own, sub, price) {
  const face = String(sub || "").split(" · ").find(x => /^face value /i.test(x)) || "";
  const cap = face ? face.charAt(0).toUpperCase() + face.slice(1) : "";
  const shown = faceCaption(cap, price); // "" when it's the very price shown
  return [own.status, shown && own.status ? face : shown].filter(Boolean).join(" · ");
}
