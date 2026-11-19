// Handoff's pages and the rules that name them. App shows one page at a time, its view (ViewState below): view.name is one of ROUTES'
// names, set by go() or read from the address's hash (initialView). ROUTES says, for each page, which side of the main switch it's on,
// how it comes back as a sign-in's return target, what a guest gets there, whether it's the development preview's own, the id a record
// page takes and how a posting form opened there names it. The lists of page names the app tests against are derived from it (RECORD_PAGES,
// FORM_PAGES, RETURN_PAGES, PREVIEW_PAGES, GATE_ASK, GUEST_PAGES, SECTION_OF, PAGE_OF, FORM_FROM_PAGES), so a new page is one entry here.
// Three lists stay written out because they differ from the table on purpose (each says why): RETURN_FROM, and initialView's preview
// hashes and its preview id patterns.
// Beside the table: the return target (returnHash, returnParams, initialView: a privacy boundary, public ids and fixed words only,
// C-CONTRACT §7), what stays in the address once a link has opened (settledHash: the page, and a shared listing's id), the place a
// session comes back to (placeOf), the links between record pages (linkFrom), a posting form's Cancel
// (leaveTo), the sign-in prompt's "you'll come back to …" (backToText), and the discovery categories (DISC_CATS, discFor).
import { EV, CATS, GOODS_CATS, clubOf, CLUB_CATS } from "@penntools/tool-handoff/engine";
import { LIVE } from "./mode";

/**
 * App's view: the page shown and its params. go(name, params) sets it, adding seq; initialView reads one from the address's hash (or a
 * kept form's place, draftFor). Each page reads the params it takes; any others ride along unread.
 * @typedef {object} ViewState
 * @property {string} name  The page: one of ROUTES' names, not an alias (go, initialView and App map those).
 * @property {number} [seq]  Counts navigations (go): My activity, keyed by it, starts at its overview on every visit.
 * @property {string} [id]  A record page's id: the event's, the item's (initialView drops "item-") or the request's.
 * @property {string} [listing]  An event page: the listing a link points at.
 * @property {boolean} [notify]  An event page: open its Get notified dialog.
 * @property {"take" | "offer" | "request"} [resume]  An event or item page: reopen that form, back from sign-in.
 * @property {boolean} [add]  Available, from an older "#explore?do=add" (it came back from sign-in to the empty state's "Add an
 *   event"). Nothing reads it since §9s item 2 took that invitation out of the empty state: the address still opens Available.
 * @property {string} [eventId]  Sell a ticket or Post a request: the event it starts with.
 * @property {string} [forIso]  Sell a ticket or Sell an item: the request it answers (shared with it once posted).
 * @property {"goods"} [market]  Post a request: on the Goods side.
 * @property {string} [cat]  Post a request or Sell an item: a goods category. Going to Available or Wanted: a category there (discFor).
 * @property {string} [edit]  Post a request: the request it edits.
 * @property {string} [text]  Post a request: what it starts from (the search, "Post a request for …": the name its search field
 *   starts with; an item request: the item's name). Sell a ticket (one-form Sell): the name its search field starts with (Available's
 *   search, from the empty state's "Sell a ticket").
 * @property {string} [title]  Sell an item: the name it starts with.
 * @property {string} [from]  A posting form: the page its Cancel returns to (leaveTo): "event", "request" or "item" (with fromId),
 *   "activity", or one of FORM_FROM_PAGES.
 * @property {string} [fromId]  With from: that page's id, or Organizer preview's club.
 * @property {object} [origin]  An event, item or request page: where it was opened from, for its back button (BackButton, linkFrom).
 * @property {string} [open]  My activity: the card to open ("type:id"). As a return target, only a listing's or an item's card
 *   ("listing:<id>", "item:<id>": where a seller's edit kept when the session ended comes back; returnHash, initialView).
 * @property {string} [club]  Organizer preview: its club.
 * @property {boolean} [typeFocus]  A Sell form: focus the Tickets & trips | Goods switch (just switched).
 * @property {object} [carry]  A Sell form: what that switch brought along (sellCarry).
 * @property {object} [draft]  A form kept when the session ended (keepDraft): its page reads it on its first render.
 * @property {string} [browse]  Available, from an older link (discFor): a former Browse option.
 * @property {string} [show]  Wanted, from an older link (discFor): its former Tickets / Goods filter.
 * @property {string} [q]  Available or Wanted (discFor): the search.
 */

/**
 * A page App can show, or an older name for one (alias). Fields an entry leaves out are null or false (route()).
 * @typedef {object} Route
 * @property {string} title  What people call it.
 * @property {"discovery" | "record" | "form" | "page" | null} kind  "discovery": Available or Wanted, which share the category row and
 *   search; "record": one event, item or request, by its id; "form": a posting form; "page": any other page; null: an alias.
 * @property {"explore" | "isos" | null} section  The main switch's side it's on, Available or Wanted (App's section). null: neither.
 * @property {"id" | "name" | null} ret  As a sign-in's return target, or the place a session that ends here comes back to (returnHash,
 *   placeOf): "id", the record's page by its id; "name", the page by its name, with its own params; null: Available instead.
 * @property {boolean} guest  A guest sees its guest version (App's guest pages).
 * @property {string | null} gate  A page that's all about you: a guest gets this sign-in prompt instead (a SIGN_IN_ASKS key; GuestGate).
 * @property {boolean} preview  The development preview's own page: on the normal route it, and any link to it, opens Available.
 * @property {RegExp | null} id  A record page's id, as the server checks a live one (tools/handoff/src/live.ts ID).
 * @property {string | null} from  A posting form opened here says so with this word (view.from, and for a record its id in fromId), and
 *   its Cancel comes back here (leaveTo, App's formFrom).
 * @property {string | null} alias  An older name: the page it stands for (go maps "goods" and "new", initialView "faq" and "new", and App
 *   "goods", choosing Goods too).
 */

/* Each event category's icon (Cover, the discovery categories below, request cards). */
export const CAT_ICON = { Parties: "music", "Food & drink": "wine", "Treks & trips": "plane", Conferences: "globe", Sports: "trophy", Shows: "ticket", Travel: "train" };
/* An event category's [icon, color]; an event added without one (simplification batch: unspecified) gets the plain ticket look. */
export const catLook = c => [hasOwn(CAT_ICON, c) ? CAT_ICON[c] : "ticket", hasOwn(CATS, c) ? CATS[c] : "var(--accent)"];

/* The return target: where the page opens after signing in, carried in the URL's hash so it survives the sign-in round trip (even one
   that lands on another host). It holds the page and public ids only (an event, listing, request or item id) and fixed words, never
   anything typed (C-CONTRACT §7). returnHash builds it from a target ({ name, id, listing, eventId, market, cat, from, fromId, forIso,
   edit, do, search, and My activity's open when it's a listing's or an item's card }), dropping anything that isn't one of those;
   initialView reads it back (returnParams) and checks every part again. RETURN_IDS are the server's live id patterns
   (tools/handoff/src/live.ts ID). */
export const RETURN_IDS = { event: /^ev-[0-9a-f]{16}$/, listing: /^l[0-9a-f]{16}$/, iso: /^iso-[0-9a-f]{16}$/, item: /^g[0-9a-f]{16}$/ };
const RETURN_DO = ["take", "offer", "notify", "request", "add"];
/* RETURN_FROM: the from values a return target may carry, C-CONTRACT §7's list: the record pages with their ids, My activity and Help.
   It's narrower than FORM_FROM_PAGES on purpose, which also has Profile and the preview's own pages: a guest is never on those (Profile
   asks for sign-in, the preview's pages open Available), so no sign-in starts in a form opened there. A form opened from Profile and kept
   when its session ended (keepDraft) comes back with its Cancel going to the last browsing view. */
export const RETURN_FROM = { event: RETURN_IDS.event, request: RETURN_IDS.iso, item: RETURN_IDS.item, activity: null, how: null }; // a form's Cancel goes back there (leaveTo)
export const hasOwn = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
const fromOk = (from, fromId) => hasOwn(RETURN_FROM, from) && (RETURN_FROM[from] ? RETURN_FROM[from].test(fromId || "") : !fromId);

/** @returns {Route} */
const route = (title, kind, more) => ({ title, kind, section: null, ret: null, guest: false, gate: null, preview: false, id: null, from: null, alias: null, ...more });
/** @returns {Route} */
const alias = (to, title) => route(title, null, { alias: to });
/**
 * Every page App shows (view.name), and the older names links and hashes still use.
 * @type {Record<string, Route>}
 */
export const ROUTES = {
  // The two sides of the main switch. Anything that isn't a return target comes back as Available (returnHash, placeOf).
  explore: route("Available", "discovery", { section: "explore", guest: true }),
  isos: route("Wanted", "discovery", { section: "isos", ret: "name", guest: true }),
  // One event, item or request: its page by its id (an item's hash is "item-" and its id).
  event: route("An event's page", "record", { section: "explore", ret: "id", guest: true, id: RETURN_IDS.event, from: "event" }),
  item: route("An item's page", "record", { section: "explore", ret: "id", guest: true, id: RETURN_IDS.item, from: "item" }),
  iso: route("A request's page", "record", { section: "isos", ret: "id", guest: true, id: RETURN_IDS.iso, from: "request" }),
  // The posting forms: a guest is asked to sign in first.
  list: route("Sell a ticket", "form", { section: "explore", ret: "name", gate: "sell" }),
  sell: route("Sell an item", "form", { section: "explore", ret: "name", gate: "sell" }),
  post: route("Post a request", "form", { section: "isos", ret: "name", gate: "post" }),
  // Beside the switch: the header's My activity, Help and Handoff settings (the route keeps its name "profile", so #profile links still
  // open it; the preview's account menu opens its sample profile here).
  activity: route("My activity", "page", { ret: "name", gate: "activity", from: "activity" }),
  profile: route("Handoff settings", "page", { ret: "name", gate: "profile", from: "profile" }),
  how: route("Help", "page", { ret: "name", guest: true, from: "how" }),
  // The development preview's own pages.
  selftest: route("Rule self-tests", "page", { preview: true }),
  reviewers: route("Project brief", "page", { preview: true, from: "reviewers" }),
  clubs: route("Organizer preview", "page", { preview: true, from: "clubs" }),
  results: route("Feedback results", "page", { preview: true, from: "results" }),
  // Older names.
  goods: alias("explore", "Available, with Goods chosen"),
  new: alias("explore", "What's new (removed in the UI update): Available"),
  faq: alias("how", "Help"),
};
/* The lists derived from ROUTES (routes.test.ts pins each one). */
const names = test => Object.keys(ROUTES).filter(n => test(ROUTES[n], n));
/* One event, item or request, by its id: event, item, iso. */
export const RECORD_PAGES = names(r => r.kind === "record");
/* The posting forms: list (Sell a ticket), sell (Sell an item), post (Post a request). */
export const FORM_PAGES = names(r => r.kind === "form");
/* The pages a return target names by name, with their own params (returnHash keeps only the allowed ones): isos, the three forms,
   activity, profile, how. A record page comes back by its id, anything else as Available. */
export const RETURN_PAGES = names(r => r.ret === "name");
export const PREVIEW_PAGES = names(r => r.preview); // the preview's own pages: on the normal route their links open Available
/* A page that's all about you, reached by a link while signed out: the sign-in prompt a guest gets instead (GuestGate). */
export const GATE_ASK = Object.fromEntries(names(r => !!r.gate).map(n => [n, ROUTES[n].gate]));
/* The pages besides the records that a guest browses by name: explore, isos, how. A guest's bell comes back to the page it was pressed
   on when it's one of these or a record page, and to Available from anywhere else (a sign-in prompt). */
export const GUEST_PAGES = names(r => r.guest && r.kind !== "record");
/* A record or form page's side of the main switch (App's section): Available for an event or item page and the two Sell forms, Wanted
   for a request's page and Post a request. Any other page is its own side. */
export const SECTION_OF = Object.fromEntries(names((r, n) => !!r.section && r.section !== n).map(n => [n, ROUTES[n].section]));
/* A record page as a posting form's from names it (with its id in fromId): event, item, request. App's keepOrigin compares a form's
   page with the page it came from. */
export const PAGE_OF = Object.fromEntries(RECORD_PAGES.map(n => [n, ROUTES[n].from]));
/* The other pages a posting form names by name, so its Cancel returns there (leaveTo, App's formFrom): Profile, Help and the preview's
   Project brief, Organizer preview (with its club) and Feedback results. My activity is one too, but both test it on their own first. */
export const FORM_FROM_PAGES = names((r, n) => r.kind === "page" && !!r.from && n !== "activity");

/* The return target's hash (without "#") for a target: a view (ViewState) or a sign-in prompt's target, which may add do and search. */
export function returnHash(t) {
  const q = [], put = (k, v) => q.push(k + "=" + encodeURIComponent(v));
  const base = t.name === "event" && RETURN_IDS.event.test(t.id || "") ? t.id : t.name === "iso" && RETURN_IDS.iso.test(t.id || "") ? t.id
    : t.name === "item" && RETURN_IDS.item.test(t.id || "") ? "item-" + t.id : RETURN_PAGES.includes(t.name) ? t.name : "explore";
  if (t.name === "event" && RETURN_IDS.listing.test(t.listing || "")) put("listing", t.listing);
  // My activity at one listing's or item's card (open "listing:<id>" or "item:<id>"): a seller's edit kept when the session ended
  // comes back there (keepDraft). Any other card, or anything that isn't such an id, is left out.
  const card = t.name === "activity" && typeof t.open === "string" ? /^(listing|item):(.*)$/.exec(t.open) : null;
  if (card && RETURN_IDS[card[1]].test(card[2])) put(card[1], card[2]);
  if (RETURN_IDS.event.test(t.eventId || "")) put("event", t.eventId);
  if (t.market === "goods") put("market", "goods");
  if (hasOwn(GOODS_CATS, t.cat)) put("cat", t.cat);
  if (fromOk(t.from, t.fromId)) { put("from", t.from); if (t.fromId) put("fromId", t.fromId); }
  if (RETURN_IDS.iso.test(t.forIso || "")) put("for", t.forIso); // a Sell form made for a request
  if (RETURN_IDS.iso.test(t.edit || "")) put("edit", t.edit); // Post a request editing that request
  if (RETURN_DO.includes(t.do)) put("do", t.do);
  if (t.search === true) put("search", "1"); // the form starts from the search the visitor had (kept for the round trip: keepDiscovery), never typed text in the URL
  return base + (q.length ? "?" + q.join("&") : "");
}
export function returnParams(qs) {
  const p = new URLSearchParams(qs), get = k => p.get(k) || "", out = {};
  if (RETURN_IDS.listing.test(get("listing"))) out.listing = get("listing");
  if (RETURN_IDS.item.test(get("item"))) out.item = get("item"); // My activity: an item's card (returnHash)
  if (RETURN_IDS.event.test(get("event"))) out.eventId = get("event");
  if (get("market") === "goods") out.market = "goods";
  if (hasOwn(GOODS_CATS, get("cat"))) out.cat = get("cat");
  if (fromOk(get("from"), get("fromId"))) { out.from = get("from"); if (get("fromId")) out.fromId = get("fromId"); }
  if (RETURN_IDS.iso.test(get("for"))) out.forIso = get("for");
  if (RETURN_IDS.iso.test(get("edit"))) out.edit = get("edit");
  if (RETURN_DO.includes(get("do"))) out.do = get("do");
  if (get("search") === "1") out.search = true;
  return out;
}
/* The address a link leaves once its page has opened (live; App, at mount and when a link opens in the tab). A shared listing's link
   ("#ev-…?listing=…") keeps its listing: a public id the link already carries, so a reload, a copied address, Back and Forward and the
   site header's own Sign in still say which listing was followed. Everything else after the page is a sign-in's or an action's and
   leaves, as before: do, search, a form's event, side and origin, My activity's card, and anything that isn't a checked param.
   hash: with or without its "#", and given back the same way. */
export function settledHash(hash) {
  const lead = hash.startsWith("#") ? "#" : "", full = hash.slice(lead.length), cut = full.indexOf("?");
  if (cut < 0) return hash;
  const page = full.slice(0, cut), p = returnParams(full.slice(cut + 1));
  return lead + page + (RETURN_IDS.event.test(page) && p.listing ? "?listing=" + p.listing : "");
}

/* §9v (SELL5-M2; the orchestrator's addendum to item 3, "Keep ordinary URLs usable when pasted into a chat"): the address a page writes
   for itself as people move around inside Handoff (live; App writes it with replaceState after each navigation that isn't a link opening),
   so copying the address bar gives the page you're on: the same ordinary public URL a pasted link uses. An event's page, with the listing
   it points at (the link §9k keeps); an item's; a request's; or a board or another page by its name. Public ids and fixed words only:
   never a search, a form's text, a draft, an origin, an action's or a sign-in's params, or My activity's card. null where a view has no
   such URL (an id that isn't a live one, the preview's own pages, a name it doesn't know): the address is then left as it is. */
const NAMED_ADDRESS = ["explore", "isos", "how", "activity", "profile", "list", "sell", "post"];
export function addressOf(v) {
  if (!v || typeof v !== "object" || typeof v.name !== "string") return null;
  if (v.name === "event") return RETURN_IDS.event.test(v.id || "") ? "#" + v.id + (RETURN_IDS.listing.test(v.listing || "") ? "?listing=" + v.listing : "") : null;
  if (v.name === "item") return RETURN_IDS.item.test(v.id || "") ? "#item-" + v.id : null;
  if (v.name === "iso") return RETURN_IDS.iso.test(v.id || "") ? "#" + v.id : null;
  return NAMED_ADDRESS.includes(v.name) ? "#" + v.name : null;
}

/* The page a view shows, as a return target (keepDraft's place when no form names one): a record's page by its id, or a page by its name
   with its own params (returnHash keeps only the allowed ones). */
export const placeOf = v => RECORD_PAGES.includes(v.name) ? { name: v.name, id: v.id } : RETURN_PAGES.includes(v.name) ? v : { name: "explore" };
/* The view an address's hash opens. Two of its lists are written out rather than read from ROUTES, since they differ on purpose:
   - The record ids (iso-…, item-…) take the preview's looser patterns, in both modes, so the preview's sample ids (iso-p1, item-g1) open
     too; a live page whose record isn't in its view shows that page's not-found state. A return target only ever names live ids
     (RETURN_IDS), and an event opens by its id in this view's catalog (EV) or, live, by a live event id.
   - The pages it opens by name in both modes are the ones the preview always has (its links and browser suites use them). #list and
     #profile open by name on the normal route only, as return targets (the line before), and in the preview they open Available, as they
     always have; the preview's own pages open by name in the preview only (on the normal route, Available, two lines before). */
export function initialView(hash = window.location.hash) { // hash: the address's, or a kept form's place (draftFor)
  // Live: a sign-in's return target can follow the page with its own params ("#ev-…?listing=…&do=take", returnHash); each is checked.
  const full = (hash || "").slice(1), cut = LIVE ? full.indexOf("?") : -1;
  const h = cut >= 0 ? full.slice(0, cut) : full, p = cut >= 0 ? returnParams(full.slice(cut + 1)) : {};
  // An event page can point at a listing and reopen "I'll take it", "Make offer" or Get notified; a form gets its event, side and origin.
  const evp = () => ({ ...(p.listing ? { listing: p.listing } : {}), ...(p.do === "take" || p.do === "offer" ? { resume: p.do } : {}), ...(p.do === "notify" ? { notify: true } : {}) });
  const form = () => { const { listing, item, do: d, ...rest } = p; return rest; }; // eventId, market, cat, from, fromId, search
  if (Object.prototype.hasOwnProperty.call(EV, h)) return { name: "event", id: h, ...evp() }; // not EV[h]: "#constructor" would match Object's prototype
  if (LIVE && /^ev-[0-9a-f]{16}$/.test(h)) return { name: "event", id: h, ...evp() }; // a live event that isn't in this view: its not-found page
  if (/^iso-[a-z0-9-]+$/i.test(h)) return { name: "iso", id: h };
  if (/^item-[a-z0-9]+$/i.test(h)) return { name: "item", id: h.slice(5), ...(p.do === "request" ? { resume: "request" } : {}) };
  if (LIVE && PREVIEW_PAGES.includes(h)) return { name: "explore" };
  if (LIVE && (h === "list" || h === "profile")) return { name: h, ...form() };
  // Live: My activity at one listing's or item's card (returnHash), where a seller's edit kept when the session ended opens again.
  if (h === "activity" && (p.listing || p.item)) return { name: "activity", open: p.listing ? "listing:" + p.listing : "item:" + p.item };
  if (["selftest", "reviewers", "how", "clubs", "goods", "isos", "sell", "post", "activity"].includes(h)) return { name: h, ...(h === "sell" || h === "post" ? form() : {}) };
  if (h === "faq") return { name: "how" };
  if (h === "new") return { name: "explore" }; // What's new was removed in the UI update: an old #new link opens Available
  return { name: "explore", ...(p.do === "add" ? { add: true } : {}) }; // add: from an older link; nothing reads it now (§9s item 2)
}

/* Discovery: Available and Wanted share one category row and one search, kept in App so they carry across the two.
   Trains and Treks are the train and trek event categories (catOf), Events every other event, Goods the secondhand items. */
export const DISC_CATS = [["all", "All", "grid"], ["events", "Events", "ticket"], ["trains", "Trains", CAT_ICON.Travel], ["treks", "Treks", CAT_ICON["Treks & trips"]], ["goods", "Goods", "bag"]];
export const DISC_LABEL = Object.fromEntries(DISC_CATS.map(([k, l]) => [k, l]));
/* §9v item 1 (the shared market, SELL5-M4): the category row's five, each with an icon from Handoff's own set beside its visible label:
   grid for All, ticket for Events, train for Trains, mountain for Treks, shopping bag for Goods. The same keys and labels as DISC_CATS
   (which the development preview keeps for its own row); a card's picture is its category's icon from here (look.js BOARD_LOOK). */
export const BOARD_ROW = Object.freeze([["all", "All", "grid"], ["events", "Events", "ticket"], ["trains", "Trains", "train"], ["treks", "Treks", "mountain"], ["goods", "Goods", "bag"]].map(r => Object.freeze(r)));
/* §9s items 1 and 2 (the shared market). (Until then the five were the first group of a Filters panel, with its count, Reset filters
   and "Filtered by" words: discFiltersOn, discReset, discFilterWords, removed with the panel.) All · Events · Trains · Treks · Goods is a visible row directly below the search on Available
   and Wanted (All by default; the choice carries across the two boards with the search). There is no Filters button or panel, and no
   "Next 7 days / Next 30 days" control on either board: nothing in the shared market reads an event-date, needed-by or availability
   choice (d.when, d.need and d.avail are the preview's), so a state kept with one narrows nothing and is never named.
   What can narrow the results besides the search: the category (with Goods' own category) and, where clubs apply, the club.
   - discScope: that, for the title of an empty state (" in Trains", " from Wharton Wine Club", " in Events from Wharton Wine Club").
   - discClear: the one way out an empty state offers when a category or a club narrowed it: its words, what it clears (never the
     search or a sort) and what takes the focus afterwards (the category row, or By club). null when nothing narrowed the results.
   - emptyTitle: an empty board's one line: "Nothing listed right now." (Available) or "No requests right now." (Wanted), with what
     narrowed it; or what the search matched nothing of. */
const narrowing = d => {
  const cat = hasOwn(DISC_LABEL, d.cat) && d.cat !== "all" ? d.cat : null;
  const goodsCat = cat === "goods" && hasOwn(GOODS_CATS, d.goodsCat) ? d.goodsCat : null;
  const club = CLUB_CATS.includes(d.cat) ? clubOf(d.club) : null;
  return { cat, goodsCat, club };
};
export function discScope(d) {
  const { cat, goodsCat, club } = narrowing(d);
  return (cat ? ` in ${goodsCat || DISC_LABEL[cat]}` : "") + (club ? ` from ${club.label}` : "");
}
export function discClear(d) {
  const { cat, club } = narrowing(d);
  if (!cat && !club) return null;
  const all = { cat: "all", goodsCat: "All" };
  if (cat && club) return { label: "Clear category and club", patch: { ...all, club: null }, focus: "cat" };
  return cat ? { label: "Show all categories", patch: all, focus: "cat" } : { label: "Show all clubs", patch: { club: null }, focus: "club" };
}
export function emptyTitle(side, d) {
  const q = d.q.trim(), scope = discScope(d);
  if (side === "isos") return q ? `No requests match "${q}"${scope}.` : `No requests${scope} right now.`;
  return q ? `Nothing listed matches "${q}"${scope}.` : `Nothing listed${scope} right now.`;
}
export const DISC_VIEWS = ["explore", "isos"]; // Available, Wanted (What's new was removed in the UI update; go() maps "new" to Available)
export const VIEW_LABEL = { explore: "Available", isos: "Wanted", activity: "My activity" };
/* Older links land where they meant: go("goods"); go("explore", { browse }) with a former Browse option (featured, all, a club,
   trains, treks, goods); go("isos", { show }) with Wanted's former Tickets / Goods filter. A `q` sets the search. */
export function discFor(to, p, d) {
  const n = { ...d }; const b = to === "explore" ? p.browse : null;
  if (to === "goods") n.cat = "goods";
  else if (b === "goods" || b === "trains" || b === "treks") n.cat = b;
  else if (b === "featured" || b === "all" || clubOf(b)) { n.featured = b === "featured"; n.club = clubOf(b) ? b : null; if (!CLUB_CATS.includes(n.cat)) n.cat = "all"; }
  if (to === "isos" && p.show) n.cat = p.show === "goods" ? "goods" : "all";
  // "See all in Wanted" from an event page: that event's category and name, with no club or deadline filter hiding its requests.
  if (p.cat && Object.prototype.hasOwnProperty.call(DISC_LABEL, p.cat)) { n.cat = p.cat; n.club = null; n.featured = false; n.need = "any"; }
  if (typeof p.q === "string") n.q = p.q;
  return n;
}

/* A page's links to other event, item and request pages (here: this page, { name: "event" | "item" | "iso", id }; origin: its own way
   back): the page a link opens goes back here, and from here on to where this page came from (BackButton). A link to this same page keeps
   its origin; links elsewhere, and links that name their own origin, pass through unchanged. */
export const linkFrom = (go, here, origin) => (to, p = {}) => {
  if (!RECORD_PAGES.includes(to) || p.origin !== undefined) return go(to, p);
  if (to === here.name && p.id === here.id) return go(to, origin ? { ...p, origin } : p);
  return go(to, { ...p, origin: origin ? { ...here, origin } : { ...here } });
};
/* Cancel on the posting forms (Sell a ticket, Sell an item, Post a request), also after a Tickets & trips | Goods switch: back to the page
   the form was opened from (an event, request or item page, My activity, or one of FORM_FROM_PAGES: Help, Project brief, Organizer preview
   with its club, Profile and alerts, Feedback results), otherwise to the browsing view you were last on (back). */
export function leaveTo(go, { from, fromId, back }) {
  if (from === "event" && fromId) return go("event", { id: fromId });
  if (from === "request" && fromId) return go("iso", { id: fromId });
  if (from === "item" && fromId) return go("item", { id: fromId });
  if (from === "activity") return go("activity");
  if (FORM_FROM_PAGES.includes(from)) return go(from, from === "clubs" && fromId ? { club: fromId } : {});
  return go(back || "explore");
}
/* Where a sign-in prompt says you'll come back to (SignInBody), for its target. */
export const backToText = t => t.name === "event" ? (t.listing ? "this listing" : "this event") : t.name === "iso" ? "this request" : t.name === "item" ? "this item"
  : t.name === "activity" ? "My activity" : t.name === "profile" ? "Handoff settings" : FORM_PAGES.includes(t.name) ? "the form" : "this page";
