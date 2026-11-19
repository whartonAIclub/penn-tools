// One-form Sell (USER-INSTRUCTIONS §9l, live): the rules of "Sell a ticket"'s one form that need no page. The form is one search field
// ("What ticket are you selling?"), a date only when the ticket's event is new, the asking price, the quantity and one action, "Post
// ticket", which sends the event (when it's new) and the listing together (the engine's postTicket). Here:
// - what the search offers (sellOptions: events open to list now, as the engine's suggestEvents ranks them) and how each reads (optionMeta);
// - which state the field is in (sellMode): an event on Handoff is only ever the seller's own tap, and a typed name becomes a new event
//   only by their choice, or when nothing on Handoff resembles it. Nothing is ever merged;
// - a new event as typed (NEW0, newValues), what would stop it (newEventIssues, in the server's words, with the exact-twin rule the
//   server enforces: eventTwin), what the server is sent (newEventAction) and the event the rest of the form reads meanwhile (draftEvent).
// Sell and Request follow-up (USER-INSTRUCTIONS §9m, §9n, live), at the end of this file:
// - no promised delivery method on an ordinary event's ticket: what Sell sends (sellMethod) and the line by its button (sellConfirm);
// - Sell's compact payment row (payRowNames);
// - quantity: the count beside "Optional details" (qtyNote), a multi-ticket listing's line (listingQtyLine), and the buyer's choice
//   and total (buyerQtyChoices, clampQty, buyerTotal);
// - "Request a ticket (ISO)" as one form on the same search field: its words (WHAT, whatHelp, whatError), a new event's issues at
//   its own fields (newEventIssues' idp and request), and what "Post request" sends (requestAction: the engine's postRequest).
// Sell fields, the forgiving search and the club's place (USER-INSTRUCTIONS §9s items 3 and 4, live), at the end of this file too:
// - the search ranks by how well a name matches, whatever the word order and with half-typed words (sellOptions: the engine's
//   suggestEvents with `loose`), the seller's own unlisted tickets leading among equal matches;
// - the asking price is on the form before any event is chosen: what follows a change of event (askAfterEvent) and what's said under
//   the field, a price above the chosen event's face value included (askIssue);
// - a new ordinary event's date sits beside the price (dateBesideAsk), and its club or organizer sits in Optional details until a
//   restriction the seller chose needs a club that isn't known (clubPlace).
// The optional club, kept (USER-INSTRUCTIONS §9x item 5, SELL6-N3): a club or organizer as it's saved (clubAsSaved: trimmed, and a
// club already on Handoff in its own spelling, whatever capitals were typed), on Sell (a new event's, a listing's) and, new, with a
// new ordinary event made through Request a ticket (requestAction, requestNew). A club restricts nothing and is never required to post.
// Pure functions over the engine's catalog (EVENTS, CLOCK): unit-tested in sell.test.ts, k2-forms.test.ts, l2-sell.test.ts and n3-club.test.ts.
import {
  EVENTS, CLOCK, DAY, access, atMs, cleanUrl, dotJoin, eventTwin, eventWhen, normalizeEvent, parseMoney, suggestEvents, TWIN_EVENT, TWIN_TRAIN,
  TWIN_EVENT_REQUEST, TWIN_TRAIN_REQUEST, METHODS, SEND_AFTER_PAYMENT, SEND_ONCE_RESERVED, PAY_KINDS, PAY_LABELS, isQuick, methodsFor, namesCheckedFor, plural, money, qtyLine, buyerMax, totalOf,
  membersOnlyListing, memberClubName, NO_MEMBER_CLUB, restrictionText, NO_RESTRICTION_TEXT
} from "@penntools/tool-handoff/engine";

/* A name's letters and digits, as the engine's suggestions count them; a name is recognizable from three (suggestEvents). */
export const nameChars = t => (String(t == null ? "" : t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join("");
export const nameReady = t => Array.from(nameChars(t)).length >= 3;
const one = v => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const chars = v => Array.from(one(v)).length;
const worded = v => /[\p{L}\p{N}]/u.test(String(v));

/**
 * The events the search field offers for what's typed: up to `max`, each one its own row (two seatings or departures of one name are
 * never merged). From three letters or digits, the engine's suggestions, ranked by how well the name matches (§9s item 4: the same
 * name first, then names holding every typed word, then those sharing at least half; the words in any order and any of them half
 * typed, so "night oys" and "oys night" both find Oysters Night; among equal matches a date entered, then the seller's own unlisted
 * tickets, then the soonest). Before that, what's open to list now: the events whose name holds what's typed (all of them for an
 * empty field), the seller's own unlisted tickets first (held: how many they hold unlisted for an event), then the soonest. Closed,
 * removed and ended events are never offered.
 * @param {string} text  what's typed
 * @param {string} [when]  a new event's date (or a train's departure), once entered
 * @param {(ev: import("@penntools/tool-handoff/engine").EngineEvent) => number} [held]
 * @param {number} [max]
 * @returns {import("@penntools/tool-handoff/engine").EngineEvent[]}
 */
export function sellOptions(text, when, held = () => 0, max = 5) {
  if (nameReady(text)) return suggestEvents(text, when, { max, loose: true, first: e => held(e) > 0 });
  const key = nameChars(text);
  return EVENTS.filter(e => !e.unsupported && access(e).ok && (!key || nameChars(e.title).includes(key)))
    .map(e => ({ e, mine: held(e) > 0 ? 0 : 1, at: atMs(e.openUntil || e.start) }))
    .sort((a, b) => a.mine - b.mine || a.at - b.at || a.e.title.localeCompare(b.e.title) || (a.e.id < b.e.id ? -1 : 1))
    .slice(0, Math.max(0, max)).map(r => r.e);
}
/* A match under its name: its date (with its start or departure time when one is known; a date-only event's 11:59 PM close is never
   shown as a time: eventWhen), then where it is and who runs it, when known. */
export const optionMeta = ev => dotJoin(eventWhen(ev), ev.venue, ev.club);

/**
 * The state of the event field.
 * - "picked": an event on Handoff, chosen by the seller's own tap (or the page the form was opened from). Never set from a name.
 * - "new": the typed name is a new event, made together with the listing, so its date shows. That's the seller's explicit choice
 *   (isNew: "a different event, date or showing"), or a recognizable name that nothing on Handoff resembles (matches 0), or a name whose
 *   date is already entered (when), so editing the name doesn't take the date away.
 * - "search": still choosing: matches show, and nothing can be posted.
 * @param {{ picked: boolean, isNew: boolean, text: string, matches: number, when: string }} f
 * @returns {"picked" | "new" | "search"}
 */
export function sellMode({ picked, isNew, text, matches, when }) {
  if (picked) return "picked";
  if (!nameReady(text)) return "search";
  return isNew || matches === 0 || !!when ? "new" : "search";
}

/* A new event as the form holds it: an ordinary event by its date alone (it ends at 11:59 PM that day), or a train by its departure
   date and time. Everything else is optional: a face value (given, the price can't be above it), category, venue or stations, the
   organizer, the per-person limit, names checked at the door (tickets then move by a name change with the organizer) and a link. */
export const NEW0 = Object.freeze({ kind: "event", date: "", start: "", face: "", cat: "", club: "", venue: "", perPerson: "", namesChecked: false, officialUrl: "" });
export const NEW_PER_PERSON = Object.freeze({ event: 4, train: 2 }); // the server's defaults
/** Values kept for the form (a draft, the Goods switch) as its own: only its keys, each of its type; any other kind is an event. */
export function newValues(src) {
  const o = { ...NEW0 };
  if (src && typeof src === "object") for (const k of Object.keys(NEW0)) if (typeof src[k] === typeof NEW0[k]) o[k] = src[k];
  if (o.kind !== "train") o.kind = "event";
  return o;
}
/* Whether any of a new event's optional details is filled in ("Optional details" then opens by itself for a kept form). The club or
   organizer isn't one of them (§9y, SELL7-O1: it's on the form itself again, as in §9q item 5; §9s item 4 had put it in Optional
   details). */
export const newMoreUsed = nd => !!(nd.face || nd.cat || nd.venue || nd.officialUrl || nd.namesChecked || (nd.perPerson && nd.perPerson !== String(NEW_PER_PERSON[nd.kind])));
export const NEW_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const newWhen = nd => (nd.kind === "train" ? nd.start : nd.date);

/**
 * What would stop a new event (createEvent's rules, in its words), by field, in the form's order: [field id, missing, wrong]. A
 * missing answer shows once "Post ticket" was tried; a wrong one at once. The server checks everything again. The exact twin of an
 * event that's open on Handoff (eventTwin: the same name on the same date; a train with the same name and departure) is wrong at the
 * date: the seller chooses that event, or says what's different in the name.
 * The field ids start with idp: "r" on Sell a ticket, "iso" on Request a ticket (§9m item 3), where the twin's words are the
 * request's (request: "…Choose it to post your request there…").
 * membersOnly (§9q item 5): the seller ticked "Members-only ticket", so the club the form's "Club or organizer" names is needed
 * (the same field: optional until eligibility needs it, as with names checked at the door).
 * @param {string} text  the typed name
 * @param {typeof NEW0} nd
 * @param {number} [now]  the clock (ms)
 * @param {{ idp?: string, request?: boolean, membersOnly?: boolean }} [form]  whose fields these are
 * @returns {Array<[string, string | null, string | null]>}
 */
export function newEventIssues(text, nd, now = CLOCK, { idp = "r", request = false, membersOnly = false, nameChange = false } = {}) { // nameChange (§9v item 5): the seller chose an organizer name change, which needs the organizer too
  const train = nd.kind === "train", out = [];
  const nameOk = nameReady(text) && chars(text) <= 120 && worded(text);
  out.push([idp + "-what", nameOk ? null : train ? "Name the train, like “Amtrak Northeast Regional: Philadelphia → New York” (3 to 120 characters)." : "Type the event's name (3 to 120 characters).", null]);
  const when = newWhen(nd), ms = when ? atMs(when) : NaN;
  let wrong = null;
  if (when && train) wrong = !Number.isFinite(ms) ? "Enter a date and time." : ms > now + 548 * DAY ? "The departure has to be within the next 18 months." : ms < now + 30 * 60e3 ? "The departure has to be at least 30 minutes from now." : null;
  else if (when) wrong = !NEW_DATE.test(when) || !Number.isFinite(ms) ? "Enter a date." : ms <= now ? "Choose today or a later date." : ms > now + 548 * DAY ? "The date has to be within the next 18 months." : null;
  if (when && !wrong && nameOk && eventTwin(nd.kind, text, when)) wrong = train ? (request ? TWIN_TRAIN_REQUEST : TWIN_TRAIN) : request ? TWIN_EVENT_REQUEST : TWIN_EVENT;
  out.push([idp + (train ? "-start" : "-date"), when ? null : train ? "Enter the departure date and time." : "Enter the date.", wrong]);
  const pm = nd.face.trim() === "" ? null : parseMoney(nd.face);
  out.push([idp + "-face", null, pm && pm.error ? pm.error : pm && pm.value > 5000 ? "Face values can be at most $5,000." : null]);
  if (!train) {
    const club = one(nd.club), clubOk = chars(club) >= 2 && chars(club) <= 80 && worded(club);
    out.push([idp + "-club", club ? null : nd.namesChecked ? "Add the club or organizer: with names checked at the door, tickets move by a name change with them."
      : membersOnly ? "Add the club: a members-only ticket is for its members." : nameChange ? "Add the club or organizer: they change the name on the ticket." : null,
      club && !clubOk ? "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank." : null]);
  }
  out.push([idp + "-url", null, cleanUrl(nd.officialUrl).error || null]);
  return out;
}
/* The fields of a new event that always sit in "Optional details" (it opens when one of them stops a post): by form (idp), and
   Sell's own. The club or organizer isn't one of them: it's on the form itself (§9y: clubPlace, below). */
export const newMoreIds = idp => ["face", "cat", "venue", "pp", "names", "url"].map(k => idp + "-" + k);
export const NEW_MORE = newMoreIds("r");

/**
 * The new event as "Post ticket" sends it (postTicket's `event`: createEvent's fields). Nothing optional is guessed.
 * @param {string} text  the typed name
 * @param {typeof NEW0} nd
 */
export function newEventAction(text, nd) {
  const opt = { face: nd.face.trim() || null, venue: nd.venue.trim() || null, perPerson: nd.perPerson ? Number(nd.perPerson) : null, officialUrl: nd.officialUrl.trim() || null };
  return nd.kind === "train" ? { kind: "train", title: text, start: nd.start, ...opt }
    : { kind: "event", title: text, club: clubAsSaved(nd.club), cat: nd.cat || null, start: nd.date, namesChecked: nd.namesChecked, ...opt }; // clubAsSaved (§9x item 5): trimmed, and a club already on Handoff in its own spelling
}

/* The event the rest of the form reads while the seller's event is new (or not chosen yet): what createEvent would store for what's
   typed so far, read as every stored event is (normalizeEvent), so the price cap, the transfer methods and the per-person limit follow
   the same rules as for an event on Handoff. It exists only in the form: nothing is stored or shown to anyone until "Post ticket". */
export const DRAFT_ID = "@new";
/**
 * @param {string} text  the typed name
 * @param {typeof NEW0} nd
 * @param {string} me  the seller
 * @returns {import("@penntools/tool-handoff/engine").EngineEvent}
 */
export function draftEvent(text, nd, me) {
  const train = nd.kind === "train", pm = nd.face.trim() === "" ? null : parseMoney(nd.face);
  return normalizeEvent({
    id: DRAFT_ID, kind: train ? "train" : "event", title: one(text), start: newWhen(nd), venue: one(nd.venue), attend: "all",
    ...(train ? { cat: "Travel", methods: ["file"] } : { club: one(nd.club), cat: nd.cat, ...(nd.namesChecked ? { namesChecked: true } : {}) }),
    tiers: [{ id: "t1", label: "Ticket", price: pm && !pm.error && pm.value <= 5000 ? pm.value : null }],
    ...(nd.perPerson ? { perPerson: Number(nd.perPerson) } : {}), createdBy: me,
  });
}

/* ---------- Sell and Request follow-up (USER-INSTRUCTIONS §9m, §9n) ---------- */

/* §9m item 1. The ways this event's ticket can change hands (the engine's methodsFor; none for an event that isn't a quick one). With
   several, the event is an ordinary one: its seller is asked for none and promises none, so Sell sends no method and the listing
   stores none (the engine's deliveryFor). With exactly one, that way is the event's own rule and is kept, set without asking: a
   train's eTicket, a trek's or a names-checked event's organizer name change. */
export const transferWays = ev => (ev && isQuick(ev) ? methodsFor(ev, namesCheckedFor(ev, false)) : []);
/** The transfer method Sell a ticket sends for this event: its one valid way, or "" (none) for an ordinary event. */
export const sellMethod = ev => { const ways = transferWays(ev); return ways.length === 1 ? ways[0] : ""; };
/** The line by "Post ticket" (hu: "ticket", "spot" or "add-on"): the neutral rule, or the event's one way in its own words. */
export const sellConfirm = (hu, method, free = false) => method && METHODS[method] ? `Posting confirms you have this ${hu} and will ${METHODS[method].verb} as soon as the buyer ${free ? "reserves it" : "pays"}.`
  : `Posting confirms you have this ${hu}. ${free ? SEND_ONCE_RESERVED : SEND_AFTER_PAYMENT}`; // free (§9x item 1): a $0 ticket waits for no payment

/* §9m item 2. Sell's compact payment row: the saved methods by name ("Venmo or Zelle"), never where to pay (a buyer sees that once
   they reserve). A handle saved before methods had kinds is named without guessing a provider. "" when nothing is saved: the row then
   offers "Add payment method". */
export function payRowNames(methods) {
  const ms = Array.isArray(methods) ? methods.filter(m => m && typeof m.kind === "string") : [];
  if (!ms.length) return "";
  const kinds = ms.filter(m => PAY_KINDS.includes(m.kind)).map(m => PAY_LABELS[m.kind]);
  return kinds.length ? kinds.join(" or ") : "your saved payment details";
}

/* §9n. Quantity starts at one and sits in "Optional details". From two up the count shows beside those words, open or closed. */
export const qtyNote = (qty, unit) => (qty >= 2 ? plural(qty, unit) : "");
/** A multi-ticket listing's line, "2 tickets · $25 each" (the engine's qtyLine); "" for one ticket, which reads as before. */
export const listingQtyLine = (n, ask, unit) => (n >= 2 ? qtyLine(n, ask, unit) : "");
/** The quantities a buyer may choose on a listing: 1 to what they may take now (the engine's buyerMax: what's available, within the
    per-person limit, counting what they hold and have reserved). [] when that's one or none: the quantity is 1 and no control shows. */
export function buyerQtyChoices(s, me, l) {
  const n = l ? buyerMax(s, me, l) : 0;
  return n >= 2 ? Array.from({ length: n }, (_, i) => i + 1) : [];
}
/** A quantity as the form may hold it: within 1 and what the buyer may take now. */
export const clampQty = (q, max) => Math.max(1, Math.min(Number.isInteger(q) ? q : 1, Math.max(1, max)));
/** The buyer's total before they reserve: quantity times the agreed price (the engine's totalOf), in words, with "2 tickets · $25 each"
    from two up. */
export function buyerTotal(qty, each, unit) {
  const amount = totalOf({ qty, price: each }, { ask: each });
  return { amount, total: money(amount), detail: qty >= 2 ? qtyLine(qty, each, unit) : "" };
}

/* §9m item 3. "What ticket are you …?": one search field, on Sell a ticket and on Request a ticket (ISO). Its rules are the same
   (sellOptions, sellMode, optionMeta, newEventIssues, draftEvent); its words say which form it's in. */
const WHAT_SHARED = {
  holder: "e.g. Spring Formal",
  helpEmpty: "Type its name. Events and trains already on Handoff show up as you type.", helpShort: "Keep typing its name.",
  helpPick: "Is it one of these? Tap it. If not, tap “isn't one of these”.",
  errShort: "Type the event's name (3 to 120 characters).", errPick: "Choose your event from the list, or tap “isn't one of these” to add it as a new one.",
  newSub: "Add it as a different event, date or showing", dateHelp: "It closes at 11:59 PM that day.",
};
export const WHAT = Object.freeze({
  sell: Object.freeze({ ...WHAT_SHARED, label: "What ticket are you selling?",
    headNew: "Already on Handoff? Tap one to list your ticket there instead.", headOpen: "On Handoff now. Tap yours, or type its name.",
    helpNewSome: "Adding it as a new one, together with your ticket when you post.", helpNewNone: "New on Handoff: it's added together with your ticket when you post.",
    errEmpty: "Type the event your ticket is for.", twinUse: "List on that one", trainHelp: "Its listings close when it leaves." }),
  // §9q item 4: the request form says nothing about Handoff adding the event with the request (helpNewSome, helpNewNone: no words).
  request: Object.freeze({ ...WHAT_SHARED, label: "What ticket are you looking for?",
    headNew: "Already on Handoff? Tap one to post your request there instead.", headOpen: "On Handoff now. Tap the one you want, or type its name.",
    helpNewSome: "", helpNewNone: "",
    errEmpty: "Type the event you want a ticket for.", twinUse: "Post on that one", trainHelp: "Requests for it end when it leaves." }),
});
/** The field's help line. form: "sell" or "request"; mode: sellMode's; matches: how many events show under it. */
export function whatHelp(form, mode, text, matches) {
  const w = WHAT[form];
  if (mode !== "search") return matches ? w.helpNewSome : w.helpNewNone;
  return !String(text || "").trim() ? w.helpEmpty : !nameReady(text) ? w.helpShort : w.helpPick;
}
/** What the field says once the form was tried with no event chosen (search mode); null before a try. */
export function whatError(form, text, tried) {
  const w = WHAT[form];
  return !tried ? null : !String(text || "").trim() ? w.errEmpty : !nameReady(text) ? w.errShort : w.errPick;
}
/**
 * What "Post request" sends: the engine's postRequest, on the event the buyer tapped (eventId) or with the new one (event), so a
 * new event and its request are stored together or not at all. The quantity as chosen (1 unless changed); a blank budget goes
 * blank (no budget, never $0); a date goes only when the buyer chose an earlier one (left out, the server runs the request to the
 * event's cutoff).
 * §9q item 4: a new event goes with its name and its date (a train: its departure) and nothing else. The request form has no
 * new-event details any more, so none can ride along, not even from a form kept before (requestNew).
 * §9x item 5 (SELL6-N3): one optional detail is back, a new ordinary event's "Club or organizer" (§9y: on the form itself, under the
 * date; it was in Optional details).
 * Named, it goes with the event as it's saved (clubAsSaved), so the event and the request are stored together with it; blank, no
 * club is sent and the event names none. A train names no organizer. Nothing else rides along.
 * @param {{ eventId: string, text: string, nd: typeof NEW0, qty: number, budget: string, note: string, until: string }} f
 */
export function requestAction({ eventId, text, nd, qty, budget, note, until }) {
  const club = nd.kind === "train" ? "" : clubAsSaved(nd.club);
  const event = () => (nd.kind === "train" ? { kind: "train", title: text, start: nd.start } : { kind: "event", title: text, start: nd.date, ...(club ? { club } : {}) });
  return { type: "postRequest", ...(eventId ? { eventId } : { event: event() }), qty, budget: String(budget || "").trim(), note: String(note || "").trim(), ...(until ? { expires: until } : {}) };
}
/** A new event as the request form holds it (§9q item 4): its kind, its date or departure and (§9x item 5) an ordinary event's club
    or organizer, as typed. Every other detail is as not given, whatever a kept form brings, so nothing the form doesn't show is
    checked, read or sent. */
export const requestNew = nd => { const train = !!nd && nd.kind === "train"; return { ...NEW0, kind: train ? "train" : "event", date: nd && typeof nd.date === "string" ? nd.date : "", start: nd && typeof nd.start === "string" ? nd.start : "",
  club: !train && nd && typeof nd.club === "string" ? nd.club : "" }; };

/* §9q item 4. The request form's one "Optional details": what it says beside those words while closed, so the defaults (one ticket,
   any price, until the event's cutoff) and anything the buyer chose stay in view. From two tickets up the count shows on its own
   (qtyNote, §9n), so it's left out here. budget: a number, or null for none (an explicit $0 is a budget); until: the date's words,
   "" before an event is chosen. */
export function isoMoreHint({ qty, unit, budget, until }) {
  return [qty >= 2 ? null : plural(1, unit), budget == null ? "any price" : `up to ${money(budget)}`, until ? `until ${until}` : null].filter(Boolean).join(" · ");
}

/* §9q item 5. "Club or organizer": the clubs already on Handoff that hold what's typed (letters and digits, any case), each once, as
   it's most often spelled; the ones starting with it first, then the club with more events, then by name. Nothing before a letter
   or digit is typed, nothing for a train's operator, and nothing once the name is exactly one of them. The field takes any text. */
export function clubOptions(text, max = 5) {
  const key = nameChars(text); if (!key) return [];
  const seen = new Map(); // by letters and digits: { n: events, names: spelling -> count }
  for (const e of EVENTS) {
    const c = one(e.club); if (!c || e.cat === "Travel" || e.unsupported) continue;
    const k = nameChars(c); if (!k) continue;
    const row = seen.get(k) || { k, n: 0, names: new Map() }; row.n++; row.names.set(c, (row.names.get(c) || 0) + 1); seen.set(k, row);
  }
  if (seen.has(key)) return [];
  const best = row => [...row.names.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  return [...seen.values()].filter(r => r.k.includes(key)).map(r => ({ name: best(r), starts: r.k.startsWith(key) ? 0 : 1, n: r.n }))
    .sort((a, b) => a.starts - b.starts || b.n - a.n || a.name.localeCompare(b.name)).slice(0, Math.max(0, max)).map(r => r.name);
}
/**
 * §9x item 5 (SELL6-N3). A club or organizer as it's saved with a new event or a listing: what was typed, with the spaces around it
 * gone and runs of them single. A name that's already a club on Handoff, whatever its capitals, spacing or punctuation ("gcc",
 * "G.C.C."), is saved in that club's own spelling (its most used one, as the suggestions show it), so one club stays one club in By
 * club. Any other name is kept as typed: the field takes free text. Blank stays blank: a club is optional and restricts nothing.
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function clubAsSaved(text) {
  const typed = one(text), key = nameChars(typed);
  if (!typed || !key) return typed;
  const names = new Map(); // the spellings on Handoff of this very club -> how many events use each
  for (const e of EVENTS) { const c = one(e.club); if (c && e.cat !== "Travel" && !e.unsupported && nameChars(c) === key) names.set(c, (names.get(c) || 0) + 1); }
  if (!names.size) return typed;
  return [...names.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}
/* §9q item 5. "Members-only ticket" (Optional details) is offered for any ordinary event's ticket, with a club or without: where the
   event names none, the seller names the club right there. Not for a train (no club has members there), and not where the event or
   the ticket type is members-only already (said above the form). */
export const memberTicketOffer = (ev, tier) => !!ev && isQuick(ev) && ev.cat !== "Travel" && !ev.nonWharton && !membersOnlyListing(ev, { tier });
/** What's wrong with the club a seller names for a members-only ticket, in the server's words (memberClubName); null when it's right. */
export const memberClubError = name => (!one(name) ? "Name the club whose members can use this ticket." : memberClubName(name) ? null : NO_MEMBER_CLUB);

/* ---------- Sell fields and the club's place (USER-INSTRUCTIONS §9s items 3 and 4) ---------- */

/**
 * §9s item 3. The asking price after the event changes (a tap on a match, Change, the event the form opened with). The price field
 * is on the form before any event is chosen, so a price the seller entered themselves (own), or one carried from Sell an item
 * (carried), is theirs whatever the event: it stays exactly as typed. A starting value they never typed (an event's face value)
 * doesn't follow to another event. Nothing is ever lowered to fit: a price above the next event's face value is said at the field
 * (askIssue).
 * @param {{ ask: string, own: boolean, carried: string | null }} p  ask: the field now; own: the seller typed it; carried: a price
 *   waiting from Sell an item, or null
 * @returns {{ ask: string, own: boolean }}  the field after the change, and whether it counts as the seller's own
 */
export function askAfterEvent({ ask, own, carried }) {
  if (carried != null) return { ask: String(carried), own: true };
  const typed = own && String(ask == null ? "" : ask).trim() ? String(ask) : "";
  return { ask: typed, own: typed !== "" };
}
/**
 * §9s item 3. What the line under "Asking price" says is wrong, in the server's words: nothing while the price is fine; that it's
 * missing, once "Post" was tried; that it isn't an amount; or that it's above the chosen event's face value (over), which the page
 * says beside the price as typed and announces. $0 is a price.
 * @param {string} text  the field as typed
 * @param {number | null | undefined} cap  the face value that caps this ticket; null while no event or ticket type is chosen, and
 *   Infinity for an event with no face value: no cap either way
 * @param {{ unit?: string, tried?: boolean }} [o]
 * @returns {{ msg: string | null, over: boolean }}
 */
export function askIssue(text, cap, { unit = "ticket", tried = false } = {}) {
  const t = String(text == null ? "" : text);
  if (!t.trim()) return { msg: tried ? `Enter your asking price per ${unit}.` : null, over: false };
  const pm = parseMoney(t);
  if (pm.error) return { msg: pm.error, over: false };
  const over = cap != null && Number.isFinite(cap) && pm.value > cap;
  return { msg: over ? `Asking price can't be more than the face value (${money(cap)}).` : null, over };
}
/** §9s item 3. A new ordinary event's date sits beside the asking price (one row where they fit; the page stacks them on a narrow
    phone). Not a train's departure (a date and time needs the width), and not while the date has an event on Handoff to point at
    (twin: that message and its button need the width too). An event on Handoff shows its date in its summary instead. */
export const dateBesideAsk = ({ mode, kind, twin }) => mode === "new" && kind !== "train" && !twin;
/**
 * Where "Club or organizer" shows on Sell a ticket, for a new ordinary event or for an event on Handoff that names no club (the
 * listing's club). §9y (SELL7-O1): always "form", on the form itself right under the event (a new one's date), "(optional)" until a
 * restriction needs it (members only, or a name change, with no club named: required then, in the same place, with the focus brought
 * to it). §9s item 4 had it in Optional details ("more") until a restriction needed it; Optional details no longer holds it. One field
 * with one value. A train names no organizer (null).
 * @param {{ kind: string, need: boolean, reveal: boolean }} f  need: names checked at the door, or a members-only ticket; reveal:
 *   such a restriction was chosen while no club was named (it no longer moves the field)
 * @returns {"form" | null}
 */
export const clubPlace = ({ kind }) => (kind === "train" ? null : "form");

/* ---------- The club and the ticket's restrictions (USER-INSTRUCTIONS §9v items 4 and 5, SELL5-M2) ---------- */

/* "This ticket has restrictions." in Optional details: one entry point, unticked. Ticked, the seller picks what applies (one or more):
   members only (only a club's members can use it), an organizer name change (the organizer must change the name on the ticket), or
   something else, in their own short words. Each is said to buyers in plain words before they ask to buy or reserve (the engine's
   listingRestrictions); with none, buyers read nothing about restrictions. A club is informational: a ticket for a GCC event is open to
   everyone unless one of these applies. */
/** @type {Readonly<{ on: boolean, members: boolean, name: boolean, other: boolean, text: string }>} */
export const RESTRICT0 = Object.freeze({ on: false, members: false, name: false, other: false, text: "" });
/* The seller's words a kept or carried form's older flag ("Flag a transfer restriction", re-listing an older listing) brings back. */
export const FLAG_WORDS = "The ticket's terms may not allow resale or a name change";
/**
 * The restrictions as a form holds them, from a kept or carried form (its own `restrict`, or the older fields it may still carry:
 * memberTicket, a new event's namesChecked, a name-change method, the older flag `risk`), each of its type; the words at most 80
 * characters.
 * @returns {typeof RESTRICT0}
 */
export function restrictValues(src) {
  const o = src && typeof src === "object" ? src : {};
  const r = o.restrict && typeof o.restrict === "object" ? o.restrict : null;
  const b = v => v === true, cut = v => (typeof v === "string" ? v.slice(0, 80) : "");
  if (r) return { on: b(r.on), members: b(r.members), name: b(r.name), other: b(r.other), text: cut(r.text) };
  const members = b(o.memberTicket), name = !!(o.nd && o.nd.namesChecked === true) || !!(o.dlv && o.dlv.method === "name"), other = b(o.risk);
  return { on: members || name || other, members, name, other, text: other ? FLAG_WORDS : "" };
}
/**
 * What "This ticket has restrictions" offers for this event's ticket, or null where it isn't offered: a train (its carrier's rule is
 * its own, shown already) or anything that isn't an ordinary ticket. members: a club's members only (memberTicketOffer: not where the
 * event or the ticket type is members-only already, which buyers read anyway); name: an organizer name change (not where the event
 * already needs one); other: the seller's own words.
 * @returns {{ members: boolean, name: boolean, other: boolean } | null}
 */
export function restrictOffer(ev, tier) {
  if (!ev || !isQuick(ev) || ev.cat === "Travel" || ev.premium) return null;
  return { members: memberTicketOffer(ev, tier), name: !ev.namesChecked && !ev.methods && !ev.nonWharton, other: true };
}
const chosen = (r, offer) => ({ members: !!(offer && r.on && offer.members && r.members), name: !!(offer && r.on && offer.name && r.name), other: !!(offer && r.on && offer.other && r.other) });
/** Whether the club or organizer has to be named: a members-only ticket (whose members?) or a name change (who changes it?), and only
    while the event names none (evClub: its club, "" when none). Never for the seller's own words. */
export const restrictNeedsClub = (r, offer, evClub) => { const c = chosen(r, offer || { members: true, name: true, other: true }); return !one(evClub) && (c.members || c.name); };
/**
 * What stops a post, by field, in the form's order: [field id, missing, wrong] (shown as Sell's other fields are: a missing answer once
 * Post was tried, a wrong one at once). "r-restrict": ticked with nothing chosen; "r-restrict-text": the seller's own words, missing or
 * not 3 to 80 characters with a letter or digit (the engine's restrictionText). Unticked, nothing counts.
 * @returns {Array<[string, string | null, string | null]>}
 */
export function restrictIssues(r, offer) {
  const c = chosen(r, offer), t = one(r.text);
  return [
    // Nothing ticked at all is said; a carried choice the event already covers (List again on a names-checked event's listing) is no error.
    ["r-restrict", r.on && offer && !c.members && !c.name && !c.other && !(r.members || r.name || r.other) ? "Choose the restriction, or untick “This ticket has restrictions.”" : null, null],
    ["r-restrict-text", c.other && !t ? "Describe the restriction in a few words." : null, c.other && t && !restrictionText(t) ? NO_RESTRICTION_TEXT : null],
  ];
}
/** What Post ticket sends for them, in the engine's fields: membersOnly; a name change (method "name", names checked); the words. */
export function restrictBody(r, offer) {
  const c = chosen(r, offer), t = one(r.text);
  return { membersOnly: c.members, ...(c.name ? { method: "name", namesChecked: true } : {}), ...(c.other && t ? { restriction: t } : {}) };
}
/** A club the seller names on their listing, for an event on Handoff that names none (§9v item 4: the event is never changed): sent as
    the listing's club, and as the members-only club too when the ticket is members-only. Nothing when blank. */
export const listingClubBody = (text, membersOnly) => { const c = clubAsSaved(text); return c ? { club: c, ...(membersOnly ? { memberClub: c } : {}) } : {}; }; // clubAsSaved (§9x item 5): a club already on Handoff in its own spelling
