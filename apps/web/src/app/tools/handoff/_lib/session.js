// What Handoff keeps for this tab across a page load (C-CONTRACT §5, §7), and the page App is showing:
// - a guest's browsing choices across the sign-in round trip (keepDiscovery, keptDiscovery, forgetDiscovery; RETURN_KEY, KeptDiscovery);
// - a form kept when a session ends mid-form (a "signed_out" answer): each mounted form's snapshot (useDraftSource), kept by the live
//   link (keepDraft, called from _lib/live-link.ts) and given back by App to the same account only (readDraft, draftFor, draftWaits,
//   forgetDraft; DRAFT_KEY, KeptDraft);
// - the page App is showing, as a return target (setCurrentPlace): where a kept form comes back to when no form names a place.
// Each of the two keys is in this tab's sessionStorage, read once and removed, ignored after 15 minutes, and never in the URL. Signed in,
// nothing else is kept in browser storage.
import { useEffect, useRef } from "react";
import { GOODS_CATS } from "@penntools/tool-handoff/engine";
import { LIVE, GUEST } from "./mode";
import { DISC_LABEL, DISC_VIEWS, returnHash, settledHash } from "./routes";

/**
 * A guest's browsing choices, kept across the sign-in round trip under RETURN_KEY (C-CONTRACT §7). keptDiscovery reads them back,
 * checking every value, and gives { side, disc }.
 * @typedef {object} KeptDiscovery
 * @property {1} v  The format.
 * @property {number} at  When they were kept (ms): ignored 15 minutes later.
 * @property {string} side  Which of Available and Wanted ("explore", "isos") was last shown.
 * @property {{ cat: string, q: string, goodsCat: string, club: string | null, sortA: string, sortW: string }} disc
 *   The category, search, goods category, club and sorts (App's disc). §9r: no availability choice. Available's All / Available /
 *   Nothing listed selector is gone, and a state kept with one (`avail`) before that comes back without it: the normal Available, with
 *   its search. §9s item 1: no date-range filter either. The "Next 7 days / Next 30 days" controls are gone from both boards, and a
 *   state kept with one (`when`, `need`) comes back without it, with its category, its search and the rest as they were.
 */
/**
 * A form kept when its session ended (keepDraft), under DRAFT_KEY (C-CONTRACT §5). readDraft gives it back while it's valid.
 * @typedef {object} KeptDraft
 * @property {1} v  The format.
 * @property {number} at  When it was kept (ms): it comes back within DRAFT_TTL, and a guest's page removes it then.
 * @property {string} viewer  The account it belongs to: only that account's page restores it (draftFor).
 * @property {string} place  Where it comes back: a return target's hash, without "#" (returnHash).
 * @property {Record<string, object>} data  The open forms' values, by form: list, sell, post, take, alert, addEvent, terms (a seller's
 *   edit of their listing or item: { for: "listing:<id>" | "item:<id>", price, obo, min, note }, back at that card in My activity).
 */

/* The return target (where the page opens after signing in, carried in the URL's hash: returnHash, returnParams and initialView) is in
   routes.js. Across that round trip this tab keeps what the visitor had chosen while browsing (the category, search, club and sorts, and
   which of Available and Wanted they were on): one sessionStorage key, which the next Handoff page reads once and removes, and ignores after
   15 minutes. Nothing typed into a form is kept (a guest has none: every form asks for sign-in before it opens), and none of it goes in the
   URL. Signed in, nothing is kept in browser storage. */
export const RETURN_KEY = "penntools-handoff-signin-return";
export function keepDiscovery(disc, side) {
  const { cat, q, goodsCat, club, sortA, sortW } = disc;
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ v: 1, at: Date.now(), side, disc: { cat, q, goodsCat, club, sortA, sortW } })); } catch (e) {}
}
export function forgetDiscovery() { try { sessionStorage.removeItem(RETURN_KEY); } catch (e) {} }
/** @returns {{ side: string | null, disc: KeptDiscovery["disc"] } | null} */
export function keptDiscovery() {
  let o = null; try { o = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null"); } catch (e) { return null; }
  if (!o || typeof o !== "object" || o.v !== 1 || typeof o.at !== "number" || !(Date.now() - o.at < 15 * 60e3) || !o.disc || typeof o.disc !== "object") return null;
  const d = o.disc, one = (v, ok, dflt) => ok.includes(v) ? v : dflt;
  return { side: DISC_VIEWS.includes(o.side) ? o.side : null, disc: {
    cat: one(d.cat, Object.keys(DISC_LABEL), "all"), q: typeof d.q === "string" ? d.q.slice(0, 200) : "",
    goodsCat: one(d.goodsCat, ["All", ...Object.keys(GOODS_CATS)], "All"), club: typeof d.club === "string" && /^[a-z0-9]{1,48}$/i.test(d.club) ? d.club : null,
    // §9r, §9s item 1: a kept `avail`, `when` or `need` is not read (those controls are gone; App's DISC0 leaves each one off)
    sortA: one(d.sortA, ["newest", "price"], "newest"), sortW: one(d.sortW, ["newest", "deadline", "budget"], "newest") } };
}
/* A session that ends mid-form (a "signed_out" answer to a change or a refresh; R6). Before the page reloads into the guest view, what's
   typed in the open form goes to this tab's sessionStorage under one key, never into the URL, and the address bar's hash becomes that
   form's place (returnHash: the page and public ids only), so the guest page shows that form's sign-in prompt and the sign-in comes back
   there. The next signed-in page reads the key and removes it, and restores the form only for the same account, within 15 minutes, at
   that place. Confirmations (the "I have this…" boxes) are never kept: they're asked again. */
export const DRAFT_KEY = "penntools-handoff-draft", DRAFT_TTL = 15 * 60e3; // a kept form comes back within 15 minutes, and is never kept longer
const draftSources = new Map(); // the mounted forms' snapshots, by role: "page" (Sell a ticket, Sell an item, Post a request), "take", "alert", "event", "terms" (a seller's edit form)
let currentPlace = () => ({ name: "explore" }); // the page being shown, as a return target: App sets it as it renders (setCurrentPlace)
/**
 * App sets the page it's showing as it renders (placeOf(view)): a function, read only when a session ends here with no form naming a place.
 * @param {() => object} place
 */
export function setCurrentPlace(place) { currentPlace = place; }
/* A form's snapshot for keepDraft while it's mounted (live, signed in): snap() gives { place, data } (place: where it comes back; null
   inside another form, whose place it shares) or null (nothing to keep). */
export function useDraftSource(role, snap) {
  const ref = useRef(snap); ref.current = snap;
  useEffect(() => {
    if (!LIVE || GUEST) return;
    const get = () => ref.current(); draftSources.set(role, get);
    return () => { if (draftSources.get(role) === get) draftSources.delete(role); };
  }, [role]);
}
/**
 * Keeps the open forms' values when this account's session ends (the live link, on "signed_out"): the address's hash becomes the place
 * the page's own form names (or, with none, the page shown: currentPlace), and the values, if any, go under DRAFT_KEY for this account.
 * @param {string} me  The signed-in account.
 */
export function keepDraft(me) {
  let place = null; const data = {};
  for (const role of ["page", "take", "alert", "event", "terms"]) { // a page's own form names the place; a dialog in it adds its values
    const get = draftSources.get(role); let o = null; try { o = get ? get() : null; } catch (e) {}
    if (!o) continue; if (!place && o.place) place = o.place; if (o.data) Object.assign(data, o.data);
  }
  const hash = returnHash(place || currentPlace()); // with nothing typed, the page you were on (My activity, say) is still where you come back
  try { window.history.replaceState(null, "", window.location.pathname + window.location.search + "#" + hash); } catch (e) {}
  try { if (Object.keys(data).length) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, at: Date.now(), viewer: me, place: hash, data })); } catch (e) {}
}
/** @returns {KeptDraft | null} */
export function readDraft() {
  let o = null; try { o = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { return null; }
  return o && typeof o === "object" && o.v === 1 && typeof o.at === "number" && Date.now() - o.at < DRAFT_TTL && typeof o.viewer === "string"
    && typeof o.place === "string" && o.data && typeof o.data === "object" ? o : null;
}
export function forgetDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {} }
/**
 * Whether an address's hash (without "#") is a kept form's place: the place itself; what the guest page's address became once it loaded
 * (settledHash: the page, and the listing a form was open on), which the site header's own Sign in comes back to; or the page alone. An
 * address at another listing isn't that form's place.
 * @param {string} here
 * @param {string} place
 */
export const draftAt = (here, place) => here === place || here === settledHash(place) || here === place.split("?")[0];
/**
 * The kept form a signed-in page restores: the same account's, at the place the address names (draftAt). An address without its
 * sign-in and action params takes the kept place's.
 * @param {string} me
 * @returns {KeptDraft | null}
 */
export function draftFor(me) {
  const d = readDraft(); if (!d || d.viewer !== me) return null;
  return draftAt((window.location.hash || "").slice(1), d.place) ? d : null;
}
/* Whether a guest's sign-in prompt leads back to a kept form (it then says so). */
export const draftWaits = t => { const d = readDraft(); return !!d && d.place === returnHash(t); };
