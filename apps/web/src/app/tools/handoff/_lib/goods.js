// Simplified Goods (USER-INSTRUCTIONS §9q item 6, live): the rules of "Sell an item" and of an item's words that need no page.
// - The form: an item's name and price are enough ("Item name *", "Price *"). Its category, approximate pickup area, condition, pickup
//   deadline, offers and description wait under "Optional details", and none of them is sent unless the seller set it (itemAction), so
//   nothing is ever guessed for them (no "Good", no "Other", no area). What stops posting (itemIssues) is the name, the price, and a
//   wrong date or lowest offer.
// - Dates: the listing expires ITEM_EXPIRY_DAYS on unless the seller picks another day ("Listing expires in 14 days · Change":
//   expiryLine, itemExpiry). A pickup deadline is its own optional field; when the seller sets one the listing closes after that day,
//   and only then is the date worded "Pickup by" (the engine's hasPickupBy: also true of every item posted before this).
// - An item's words wherever it shows (its card, its page, the seller's panel, My activity, a visitor's pages): each leaves out the
//   category, condition and pickup area an item doesn't state (itemKind, itemWhere, itemOver, itemEnds, …). An item that states them
//   all, as every earlier item does, reads exactly as it did.
// Pure functions over the engine (CLOCK): unit-tested in goods.test.ts. The preview never calls the form's half: its form is as it was.
import {
  CLOCK, DAY, RULES, ITEM_EXPIRY_DAYS, ITEM_MAX_DAYS, atMs, isoDate, fmtDate, fmtDay, plural, parseMoney, checkMinOffer, dotJoin, hasPickupBy,
} from "@penntools/tool-handoff/engine";

/** The live form before anything is typed: nothing optional is chosen (the condition included), and both dates are the defaults. */
export const GOODS0 = Object.freeze({ title: "", cat: "", cond: "", price: "", obo: false, minOffer: "", area: "", until: "", expires: "", note: "", photos: [] });
const text = v => String(v == null ? "" : v);

/** The line beside "Post item" that takes the place of a tick: what posting confirms. */
export const GOODS_CONFIRM = `Posting confirms it's yours to sell and that you'll answer requests within ${RULES.sellerResponseHours} hours. Pickup and payment happen between you and the buyer, outside Handoff.`;

/** The listing's default last day: ITEM_EXPIRY_DAYS on (the New York date). */
export const defaultExpiry = (now = CLOCK) => isoDate(now + ITEM_EXPIRY_DAYS * DAY);
/**
 * The day the listing closes as the form stands: the pickup deadline when the seller set one, else the expiry day they picked, else
 * the default.
 * @param {{ until?: string, expires?: string }} d
 */
export const itemExpiry = (d, now = CLOCK) => d.until || d.expires || defaultExpiry(now);
/** Whole days from today (New York) to the end of that date: 14 for the default. */
export const daysTo = (date, now = CLOCK) => Math.round((atMs(date) - atMs(isoDate(now))) / DAY);
/**
 * Why a date the seller picked can't be used, in the form's words, or null: its day mustn't be over, and it is at most
 * ITEM_MAX_DAYS on (the server's own rule; the date fields offer tomorrow onwards, as before).
 * @param {string} date  "YYYY-MM-DD", or "" for none
 */
export function itemDateIssue(date, now = CLOCK) {
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(atMs(date))) return "Pick a date.";
  if (atMs(date) <= now) return "Pick a date in the future.";
  if (atMs(date) > atMs(isoDate(now + ITEM_MAX_DAYS * DAY))) return `Pick a date within ${ITEM_MAX_DAYS} days.`;
  return null;
}
/**
 * "Listing expires in 14 days", as the form stands. With a pickup deadline: "… in 5 days, with your pickup deadline" (the listing
 * closes after that day). While the date in force is wrong, no count is made up: "Listing expires on the day you choose".
 * @param {{ until?: string, expires?: string }} d
 */
export function expiryLine(d, now = CLOCK) {
  const date = itemExpiry(d, now);
  if (itemDateIssue(date, now)) return "Listing expires on the day you choose";
  const n = daysTo(date, now);
  return `Listing expires ${n < 1 ? "today" : `in ${plural(n, "day")}`}${d.until ? ", with your pickup deadline" : ""}`;
}

/**
 * What stops "Post item", in the form's order: [{ id, what, more }] (id: the field to focus; what: its name in "Check: …"; more: it
 * sits under Optional details, which then opens). A name and a price are all a seller has to give.
 * @param {typeof GOODS0} d
 */
export function itemIssues(d, now = CLOCK) {
  const pm = parseMoney(d.price), obo = !!d.obo && !pm.error && pm.value > 0;
  return [
    !text(d.title).trim() && { id: "g-title", what: "item name" },
    pm.error && { id: "g-price", what: "price" },
    !d.until && itemDateIssue(d.expires, now) && { id: "g-expires", what: "expiry day" },
    itemDateIssue(d.until, now) && { id: "g-until", what: "pickup deadline", more: true },
    obo && checkMinOffer(d.minOffer, pm.value).error && { id: "g-min", what: "lowest offer", more: true },
  ].filter(Boolean);
}

/**
 * What "Post item" sends: the name and the price, and each optional detail only when the seller set it. An untouched form sends
 * exactly { title, price }: no category, condition, area or date. `until` is the pickup deadline; `expires` goes only when there is
 * no deadline and the seller changed the expiry day.
 * @param {typeof GOODS0} d
 */
export function itemAction(d) {
  const pm = parseMoney(d.price), obo = !!d.obo && !pm.error && pm.value > 0;
  const data = { title: text(d.title), price: text(d.price) };
  if (d.cat) data.cat = d.cat;
  if (d.cond) data.cond = d.cond;
  if (text(d.area).trim()) data.area = text(d.area);
  if (obo) { data.obo = true; if (text(d.minOffer).trim()) data.minOffer = text(d.minOffer); }
  if (d.until) data.until = d.until; else if (d.expires) data.expires = d.expires;
  if (text(d.note).trim()) data.note = text(d.note);
  return { type: "postItem", data };
}

/** Whether anything under "Optional details" is set (it then opens with the form: a kept form, "Post again", an item for a request). */
export const itemMoreUsed = d => !!(d.cat || d.cond || text(d.area).trim() || d.until || d.obo || text(d.note).trim());
/**
 * The line beside a closed "Optional details": what it holds, or what stands once the seller set something there, so nothing that
 * will be published hides behind it ("Electronics · Like new · University City · pickup by Fri, Nov 20 · open to offers").
 * @param {typeof GOODS0} d
 */
export function itemMoreHint(d) {
  if (!itemMoreUsed(d)) return "Category, pickup area, condition, pickup deadline, offers, description";
  return dotJoin(d.cat, d.cond, text(d.area).trim(), d.until && !itemDateIssue(d.until) && `pickup by ${fmtDay(d.until)}`, d.obo && "open to offers", text(d.note).trim() && "a description");
}

/* ---------- An item's words, wherever it shows: only what it states ---------- */
/** A card's first line: "Electronics · Like new", either alone, or "" (the line is then left out). */
export const itemKind = it => dotJoin(it.cat, it.cond);
/** A card's second line: "University City · pickup by Nov 30, 2026", the area alone, "Pickup by Nov 30, 2026" alone, or "". Never an expiry as a pickup date. */
export const itemWhere = it => (hasPickupBy(it) ? (it.area ? `${it.area} · pickup by ${fmtDate(it.until)}` : `Pickup by ${fmtDate(it.until)}`) : it.area || "");
/** The line over an item's title: "Goods · Electronics · Like new", down to "Goods". */
export const itemOver = it => dotJoin("Goods", it.cat, it.cond);
/** The item's last day, as its page says it: "Pickup by Mon, Nov 30" where its seller chose one, else "Listing expires Mon, Nov 30". */
export const itemEnds = it => (hasPickupBy(it) ? `Pickup by ${fmtDay(it.until)}` : `Listing expires ${fmtDay(it.until)}`);
/** The same for My activity's line: "pickup by Nov 30, 2026" or "listing expires Nov 30, 2026". */
export const itemEndsShort = it => (hasPickupBy(it) ? `pickup by ${fmtDate(it.until)}` : `listing expires ${fmtDate(it.until)}`);
/** The seller's panel: "pickup in Rittenhouse by Nov 30, 2026", as it always read; without a deadline or an area, what there is. */
export const itemPanelWhere = it => (hasPickupBy(it) ? (it.area ? `pickup in ${it.area} by ${fmtDate(it.until)}` : `pickup by ${fmtDate(it.until)}`)
  : dotJoin(it.area && `pickup in ${it.area}`, `listing expires ${fmtDate(it.until)}`));
/** "I have this", one of the seller's own items: "your item · Good · pickup in Rittenhouse", down to "your item". */
export const itemOwnLine = it => dotJoin("your item", it.cond, it.area && `pickup in ${it.area}`);
/** Where the two meet, in a step's words: "meet in Rittenhouse somewhere public" or "meet somewhere public". */
export const itemMeet = it => (it.area ? `meet in ${it.area} somewhere public` : "meet somewhere public");
/** A held item's "Where" row. */
export const itemWhereRow = it => (it.area ? `Pickup in ${it.area}. Agree the exact spot together.` : "Agree the spot together.");
/** An item past its last day. */
export const itemOverWords = it => (hasPickupBy(it) ? "The pickup window is over." : "This listing has expired.");
/** What a visitor's search reads of an item (no area or note): only what it states. */
export const guestItemText = it => [it.title, it.cat, it.cond].filter(Boolean).join(" ").toLowerCase();

/**
 * "Post again" from a closed item: the form filled in with what that item states, and nothing it doesn't. Its pickup deadline comes
 * along only when its seller chose one and it's still ahead; an expiry never does (the new listing gets its own 14 days).
 * @param {import("@penntools/tool-handoff/engine").Item} it
 */
export const postAgainGoods = (it, now = CLOCK) => ({
  title: it.title, cat: it.cat || "", cond: it.cond || "", price: String(it.price), obo: !!it.obo, minOffer: typeof it.minOffer === "number" ? String(it.minOffer) : "",
  area: it.area || "", until: hasPickupBy(it) && atMs(it.until) > now + DAY ? it.until : "", expires: "", photos: [],
});
