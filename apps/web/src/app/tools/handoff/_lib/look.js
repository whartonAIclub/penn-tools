// The picture a card leads with on Available and Wanted, and an event's own page (USER-INSTRUCTIONS §9x item 2, SELL6-N2; the rule
// §9s item 7 had before §9v's row icons, without its month/day tile). Chosen from Handoff's own icons, in the browser, from the view the
// page already holds, so one event has one icon and one colour wherever it shows (both boards, its page, a search's rows, signed in or
// out). Display only: nothing is stored or sent, and neither the event's category nor what the category row narrows by is touched.
//   1. An explicit category. A train and a trek wear the icon of the row they are listed under (the train, the mountain: BOARD_ROW). An
//      ordinary event that states a category wears that category's icon and colour (a party the music note, food and drink the glass,
//      a conference the globe, sports the trophy, a show the ticket).
//   2. Otherwise an obvious word in its title (TITLE_CUES, §9s item 7's list): "White Wine Varietals" is food and drink, "Spring Formal"
//      a party, "Comedy Night" a show. Conservative: whole words only, no word that often means something else, and a cue only borrows
//      a category's picture. A card listed under Events never borrows the train or the mountain, which belong to the Trains and Treks
//      rows, so a picture never points at a row the card isn't in.
//   3. Otherwise the neutral ticket in Handoff's own blue (no guess, and no date tile: the date is on the card's own line).
// Goods: the seller's photo when the page has one. Otherwise the item's category icon and colour where the category has a picture of
// its own (sofa, house, monitor, shirt, book), else the shopping bag (no category, Other, and Sports & outdoor, whose mountain is the
// Treks row's now).
// Pure functions over the engine: unit-tested in look.test.ts, m4-cards.test.ts and n2-cards.test.ts.
import { CATS, GOODS_CATS, catOf } from "@penntools/tool-handoff/engine";
import { BOARD_ROW, CAT_ICON, hasOwn } from "./routes";

/**
 * A look, as every function here returns it. kind "icon": an icon and its colour. kind "photo": a seller's photo (src), which keeps
 * its item's icon and colour for when it can't be had. cat: the row category the card is listed under ("events", "trains", "treks",
 * "goods"), never changed by the picture. of: the event or item category whose picture this is ("Food & drink", "Furniture"), or null.
 * from: "kind" (the row category alone: a train, a trek, the bag), "category" (the event's or item's own), "title" (a cue in the
 * name), "none" (the neutral ticket) or "photo".
 * @typedef {{ kind: "icon" | "photo", icon: string, color: string, cat: string, of: string | null, from: string, src?: string | undefined }} Look
 */

const COLOR = { events: "var(--accent)", trains: "var(--c-train)", treks: "var(--c-travel)", goods: "var(--c-food)" };
/**
 * Each listed category's icon (the row's own) and colour: a train's, a trek's, the neutral ticket and the bag.
 * @type {Readonly<Record<"events" | "trains" | "treks" | "goods", Readonly<{ icon: string, color: string }>>>}
 */
export const BOARD_LOOK = Object.freeze(/** @type {Record<"events" | "trains" | "treks" | "goods", Readonly<{ icon: string, color: string }>>} */ (Object.fromEntries(
  BOARD_ROW.filter(([k]) => k !== "all").map(([k, , icon]) => [k, Object.freeze({ icon, color: COLOR[/** @type {keyof typeof COLOR} */ (k)] })]))));

/** The categories an ordinary event can state or be cued into: every event category but the two with rows of their own. */
export const EVENT_CATS = Object.freeze(Object.keys(CATS).filter(c => c !== "Travel" && c !== "Treks & trips"));

/**
 * [category, words]: the first category with one of its words in the title wins, so the order settles a title with two cues ("Jazz
 * Brunch" is food and drink). Whole words in any case; a phrase must appear as written. Kept short and obvious on purpose: a word
 * that often means something else ("game", "night", "club", "play") is not a cue, and an event with no cue gets the neutral ticket.
 * (§9s item 7's list, SELL4-L4, as it was. Its Travel and Treks & trips words are still found by titleCue, but eventLook and
 * requestLook pass them over: a card listed under Events never wears the train or the mountain.)
 */
export const TITLE_CUES = Object.freeze([
  ["Travel", ["amtrak", "acela", "septa", "nj transit", "njt", "train", "trains", "regional rail", "northeast regional", "keystone"]],
  ["Treks & trips", ["trek", "treks", "trip", "trips", "retreat", "getaway", "expedition", "excursion", "safari"]],
  ["Sports", ["vs", "match", "game day", "gameday", "basketball", "football", "soccer", "hockey", "baseball", "lacrosse", "tennis", "golf",
    "volleyball", "rugby", "squash", "marathon", "half marathon", "5k", "10k", "relays", "regatta", "tournament", "eagles", "phillies",
    "sixers", "76ers", "flyers"]],
  ["Food & drink", ["wine", "wines", "beer", "beers", "brunch", "dinner", "lunch", "breakfast", "tasting", "oyster", "oysters", "cocktail",
    "cocktails", "happy hour", "bbq", "barbecue", "food", "feast", "pizza", "sushi", "coffee", "whiskey", "bourbon", "sake", "dumplings",
    "tacos", "supper", "pub crawl", "bar crawl"]],
  ["Shows", ["show", "shows", "comedy", "improv", "stand up", "standup", "theatre", "theater", "musical", "opera", "ballet", "film",
    "movie", "screening", "cinema", "broadway", "cabaret", "a cappella", "acapella", "magic"]],
  ["Conferences", ["conference", "summit", "forum", "symposium", "panel", "lecture", "keynote", "career fair", "expo", "hackathon",
    "workshop", "seminar", "convention", "case competition"]],
  ["Parties", ["party", "parties", "gala", "ball", "formal", "prom", "dance", "rave", "dj", "concert", "festival", "fest", "mixer", "social",
    "soiree", "disco", "karaoke", "jazz", "band", "orchestra", "symphony", "celebration", "bash"]],
].map(r => Object.freeze(r)));

/** The title as words for matching: lower case, accents dropped, anything but letters and digits a single space, a space at each end. */
const asWords = t => " " + String(t == null ? "" : t).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";

/**
 * The category an obvious word in the title points to, or null. only: the categories that count (a cue for any other is passed over,
 * and a later one may still match).
 * @param {unknown} title
 * @param {readonly string[] | null} [only]
 * @returns {string | null}
 */
export function titleCue(title, only = null) {
  const w = asWords(title);
  if (w.trim() === "") return null;
  for (const [cat, words] of TITLE_CUES) if ((!only || only.includes(/** @type {string} */ (cat))) && /** @type {string[]} */ (words).some(x => w.includes(" " + x + " "))) return /** @type {string} */ (cat);
  return null;
}

/**
 * The row category an event is listed under (the engine's catOf: Trains, Treks or Events); Events when there is none to read.
 * @param {object | null | undefined} ev
 * @returns {"events" | "trains" | "treks"}
 */
export const eventKind = ev => /** @type {"events" | "trains" | "treks"} */ (ev ? catOf(ev) : "events");

/**
 * A row category's own look: the train, the mountain, the bag; for Events the neutral ticket (from "none": nothing said what it is).
 * @param {"events" | "trains" | "treks" | "goods"} k
 * @returns {Look}
 */
const kindLook = k => ({ kind: "icon", icon: BOARD_LOOK[k].icon, color: BOARD_LOOK[k].color, cat: k, of: null, from: k === "events" ? "none" : "kind" });

/**
 * An ordinary event category's look, under Events: its icon and colour. from: "category" (the event's own) or "title" (a cue).
 * @param {string} c  one of EVENT_CATS
 * @param {string} from
 * @returns {Look}
 */
const catLookOf = (c, from) => ({ kind: "icon", icon: hasOwn(CAT_ICON, c) ? /** @type {Record<string, string>} */ (CAT_ICON)[c] : BOARD_LOOK.events.icon, color: /** @type {Record<string, string>} */ (CATS)[c], cat: "events", of: c, from });

/**
 * An event's look, the same wherever it shows (Available's cards and rows, Wanted's cards, the event's page, signed in or out).
 * @param {object | null | undefined} ev  The event as a view holds it, or null (only its category and its title are read).
 * @returns {Look}
 */
export function eventLook(ev) {
  const k = eventKind(ev);
  if (k !== "events" || !ev) return kindLook(k);
  const e = /** @type {{ cat?: unknown, title?: unknown }} */ (ev);
  if (typeof e.cat === "string" && EVENT_CATS.includes(e.cat)) return catLookOf(e.cat, "category");
  const cue = titleCue(e.title, EVENT_CATS);
  return cue ? catLookOf(cue, "title") : kindLook("events");
}

/** The Goods categories with a picture of their own; any other item wears the bag. */
const GOODS_ICON_CATS = Object.freeze(["Furniture", "Home & kitchen", "Electronics", "Clothing", "Books & supplies"]);

/**
 * An item's look (Goods): its category's icon and colour, or the bag; the seller's photo when the page has its address.
 * @param {unknown} [cat]  the item's (or a Goods request's) category, if it states one
 * @param {string | null} [photo]
 * @returns {Look}
 */
export function itemLook(cat = null, photo = null) {
  const own = typeof cat === "string" && GOODS_ICON_CATS.includes(cat) && hasOwn(GOODS_CATS, cat) ? /** @type {Record<string, string[]>} */ (GOODS_CATS)[cat] : null;
  /** @type {Look} */
  const base = own ? { kind: "icon", icon: /** @type {string} */ (own[0]), color: /** @type {string} */ (own[1]), cat: "goods", of: /** @type {string} */ (cat), from: "category" } : kindLook("goods");
  return typeof photo === "string" && photo ? { ...base, kind: "photo", src: photo, from: "photo" } : base;
}

/**
 * A look in a few characters, the same for the same picture wherever it's drawn (the page sets it as data-look): "icon:wine" or "photo".
 * @param {Look | null | undefined} l
 * @returns {string}
 */
export const lookKey = l => !l ? "" : l.kind === "photo" ? "photo" : `icon:${l.icon}`;

/**
 * A request's look on Wanted: its event's (eventLook), or for a Goods request its item category's (itemLook), or the seller's photo of
 * the item its card points to (photo: that photo's address). An older request for an event that isn't on Handoff (i.missing) is an
 * event: a cue in the name it gave, else the neutral ticket.
 * @param {object | null | undefined} i  The request as a view holds it (only its goods and missing are read).
 * @param {object | null | undefined} ev  Its event, or null.
 * @param {string | null} [photo]
 * @returns {Look}
 */
export function requestLook(i, ev, photo = null) {
  const r = /** @type {{ goods?: { cat?: unknown } | null, missing?: { title?: unknown } | null } | null | undefined} */ (i);
  if (r && r.goods) return itemLook(r.goods.cat, photo);
  if (ev) return eventLook(ev);
  const cue = titleCue(r && r.missing ? r.missing.title : "", EVENT_CATS);
  return cue ? catLookOf(cue, "title") : kindLook("events");
}
