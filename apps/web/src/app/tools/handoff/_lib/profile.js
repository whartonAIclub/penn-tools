// Handoff settings, simplified (USER-INSTRUCTIONS §9v item 6; SELL5-M5): the words the page says that need no page. Identity is the
// PennTools account's (its id and name); Handoff has no usernames of its own, no name to pick and no onboarding.
// - publicNameLine: "On your listings and requests, signed-in classmates see you as Maya P." (the public form of the account's name:
//   first name and last initial; a signed-out visitor sees no names at all).
// - WHO_SEES: what "Who can see my details?" explains, collapsed under the line, as the server's projection does it
//   (tools/handoff/src/project.ts: people(), CONTACT_REVEAL, GOODS_CONTACT, PAY_REVEAL, payKinds): who sees your full name, when ticket
//   buyers and sellers see each other's email, how Goods contact consent works, and who sees which payment apps you take versus where to
//   pay you. The buyer-facing disclosures at reservation are the exchange's own and unchanged.
// - addedTickets: "Tickets you've added", the account's own tickets with something left (a view's holdings are only ever the viewer's).
//   Hidden when there are none; otherwise collapsed with a count (total), and per event its name, how many, the tier when the event has
//   more than one, and how many aren't listed only when that says something: "2 unlisted" when some are listed, "not listed" when none
//   are, nothing when all are listed or in exchanges (never "0 unlisted"). ADDED_NOTE says only that the list is private (§9x item 4:
//   it no longer explains that the tickets are self-reported; Help says once that Handoff verifies no tickets).
// Pure functions over the engine: unit-tested in m5-profile.test.ts.
import { EV, holdingFree, plural, publicName, tierOf, unitOf } from "@penntools/tool-handoff/engine";

const NAME_LEAD = "On your listings and requests, signed-in classmates see you as ";
/**
 * The one line about your public name: { lead, name, end, text } (the page shows the name in bold).
 * @param {string | null | undefined} fullName  the PennTools account's name
 */
export function publicNameLine(fullName) {
  const name = publicName(fullName), end = name.endsWith(".") ? "" : "."; // "Maya P." already ends the sentence
  return { lead: NAME_LEAD, name, end, text: NAME_LEAD + name + end };
}

export const WHO_TITLE = "Who can see my details?";
/** @type {ReadonlyArray<{ key: "name" | "email" | "goods" | "pay", label: string, text: string }>} */
export const WHO_SEES = Object.freeze([
  { key: "name", label: "Your full name", text: "Only classmates you trade with see your full name: a request to buy, an invitation to pay or a reservation between you, an item request or offer, or a listing shared with a request (I have this)." },
  { key: "email", label: "Your email, for tickets", text: "The buyer and the seller see each other's from the moment a ticket is reserved until the buyer confirms they received it." },
  { key: "goods", label: "Your email, for Goods", text: "Shared only if you both agree: the buyer when asking for the item, the seller when accepting, or either of you later. Then you see each other's while it's held and after pickup." },
  { key: "pay", label: "How you're paid", text: "Signed-in classmates see which payment apps you take. Only a buyer who has reserved your ticket sees where to pay you, and that exchange keeps those details even if you change them later." },
]);

export const ADDED_TITLE = "Tickets you've added";
// §9x item 4 (SELL6-N3): the long explanation is gone ("…and Handoff can't check it: these are tickets you entered yourself, or that you
// and a seller confirmed in Handoff."). What stays is who sees the list; Help says once that Handoff verifies no tickets.
export const ADDED_NOTE = "Only you see this list.";

/**
 * "Tickets you've added": { rows, total }. rows: { id, eventId, title, qty, line } per ticket you hold with something left, in the
 * view's order; total: how many tickets (or spots) in all. None (rows empty, total 0) hides the section.
 * @param {{ holdings: any[], listings: any[], requests?: any[] }} s  the view as App holds it
 * @param {string} me  the viewer
 * @param {Record<string, any>} [events]  the catalog (EV)
 */
export function addedTickets(s, me, events = EV) {
  const rows = [];
  for (const h of s.holdings || []) {
    if (h.userId !== me || !(h.qty > 0)) continue;
    const ev = events[h.eventId]; if (!ev) continue;
    const t = h.tier ? tierOf(ev, h.tier) : null;
    const free = ev.removedAt ? null : holdingFree(s, h);
    const status = ev.removedAt ? "event removed" : free === 0 ? null : free >= h.qty ? "not listed" : `${free} unlisted`;
    const line = [plural(h.qty, unitOf(ev)), t && (ev.tiers || []).length > 1 ? t.label : null, status].filter(Boolean).join(" · ");
    rows.push({ id: h.id, eventId: ev.id, title: ev.title, qty: h.qty, line });
  }
  return { rows, total: rows.reduce((n, r) => n + r.qty, 0) };
}
