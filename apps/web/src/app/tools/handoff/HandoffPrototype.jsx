"use client";

// Handoff's UI, imported from the founder's HTML export (November 4, 2026). One app, two modes:
// - live (/tools/handoff): the shared market. The view comes from the server (page.tsx), every change goes through the
//   act server action, and nothing personal is kept in this browser (C-DESIGN §6.3; C-CONTRACT.md). Signed out, it's the
//   guest view: the server's published facts only, read-only, and every action that needs an account asks for PennTools
//   sign-in first, then comes back to the same listing, request or form (guest mode, C-CONTRACT.md §7).
// - preview (/tools/handoff/preview, development only): the sample demo, saved in this browser, for development and the
//   browser suites. Its entry is _preview/HandoffPreview.jsx, which renders App with the preview's kit: the sample data and the
//   preview's own pages (_preview/pages.jsx). Handoff.tsx loads it in a chunk of its own, and this file imports none of it. See
//   tools/handoff/PROTOTYPE.md for provenance.
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./Handoff.module.css";
// Handoff's engine (tools/handoff/engine): the rules, the reducer and the JSX-free view helpers.
import {
  BRAND, STORE_KEY, HOUR, DAY, RULES, TAKE_HOLD, OFFER_HOLD, CLOCK, PEOPLE, DEMO_USERS, CATS,
  EVENTS, EV, applyWorld, uid, cleanUrl, atMs, fmtDay, fmtDate, fmtWhen, fmtMs, fmtRange, money, isoDate,
  ago, plural, parseMoney, SRC, tierOf, isAddOn, orgLabel, DIRECT_LABEL, faceMax, faceOf, faceName, FaceName, faceText,
  paidToDate, remaining, commitment, closesAt, cutoffMs, access, demandAllowed, demandCap,
  membersOnlyListing, hasMemberTiers, mayHoldMemberTier, honorAttend, canAcquire, askCap, rState,
  isOpenReq, baseSt, personLoad, personCap, checkOffer, checkMinOffer,
  needsTrain, isQuick, METHODS, namesCheckedFor, methodsFor, offerEnd, strikesOf, tradingPaused,
  listingNumbers, holdingFree, isExpired, isLive, isoTitle, selfReported, isoMatches,
  liveRequest, publicListingsFor, demandFor, requestMatch, matchRecipients, requestersIn, myAlertFor, myRequestFor,
  alertText, sharesFor, PAUSED_MSG, GOODS_CATS, CONDITIONS, pickupOver,
  goodsFits, goodsMatches, requestMatchItem, catOf, unitOf, UnitOf, aUnit,
  cap1, myReqLabel, eventSummary, alertVia, reduce, catLabel, transferTag, rStatus,
  CLUB_MENU, clubOf, clubOrgs, CLUB_CATS, DISC0, exploreRows, squash, availableFor, availableNow, MAX_PHOTOS, wantedFor, wantedNow, evText,
  shareText, needsAction,
  setLiveClock, nyParts, publicName, reserves, listingPaused, pausedUnits, openLen, holdEnd, holdLen, listingState,
  inviteFlowOn, NO_PAY_METHODS, LATE_PAYMENT, dotJoin, priceParts, requestUntil, requestEndMs, fmtUntil, isDateOnly, suggestEvents, eventWhen, eventOption, askPrefill,
  itemPrice, isFreePrice, eventTwin, TWIN_EVENT, TWIN_TRAIN, TWIN_EVENT_REQUEST, TWIN_TRAIN_REQUEST, methodOf, transferWords, buyerMax, memberClubOf, memberClubName, NO_LISTING_CLUB, listingRestrictions, listingClubOf, // §9v items 4 and 5
  hasPickupBy, ITEM_MAX_DAYS
} from "@penntools/tool-handoff/engine";
// Handoff's own modules (_lib: a private folder, never a route). mode: which Handoff is showing (LIVE, GUEST), set by App as it renders.
// dom: lookups inside Handoff's root, for focus and sharing. routes: the pages (ROUTES), the lists derived from them, the sign-in return
// target and the other navigation rules. session: what this tab keeps across a page load (a guest's browsing choices across sign-in, a
// form kept when a session ends) and the page App is showing. live-link: the live page's link to the server (useLiveLink), typed
// against the server's own types.
import { LIVE, GUEST, setMode } from "./_lib/mode";
import { demoRoot, demoQuery, demoQueryAll, demoElement, demoShareUrl, focusSoon, demoLayer, setLayer } from "./_lib/dom";
import {
  CAT_ICON, catLook, hasOwn, RECORD_PAGES, FORM_PAGES, PREVIEW_PAGES, GATE_ASK, GUEST_PAGES, SECTION_OF, PAGE_OF, FORM_FROM_PAGES, returnHash, settledHash, addressOf,
  placeOf, initialView, DISC_CATS, DISC_LABEL, DISC_VIEWS, VIEW_LABEL, discFor, linkFrom, leaveTo, backToText, discClear, emptyTitle, BOARD_ROW
} from "./_lib/routes";
import {
  keepDiscovery, forgetDiscovery, keptDiscovery, useDraftSource, readDraft, forgetDraft, draftFor, draftWaits, DRAFT_TTL, setCurrentPlace
} from "./_lib/session";
import { useLiveLink, installLive, asGuest, settled, RELOADING } from "./_lib/live-link";
// sell: the rules of Sell a ticket's one form (one-form Sell, §9l): what its search offers, when a typed name is a new event, what stops one.
// And the follow-up's (§9m, §9n): no promised method on an ordinary event's ticket, the payment row, quantity, and Request a ticket's one form.
import {
  sellOptions, optionMeta, sellMode, nameReady, NEW_PER_PERSON, NEW_MORE, newValues, newMoreUsed, newWhen, newEventIssues, newEventAction, draftEvent,
  WHAT, whatHelp, whatError, newMoreIds, sellMethod, sellConfirm, payRowNames, qtyNote, listingQtyLine, buyerQtyChoices, clampQty, buyerTotal, requestAction,
  requestNew, isoMoreHint, clubOptions, memberTicketOffer, memberClubError, // §9q items 4 and 5: the short request form; the club field; Members-only
  RESTRICT0, restrictValues, restrictOffer, restrictIssues, restrictBody, listingClubBody, // §9v items 4 and 5: "This ticket has restrictions" and a listing's club
  askAfterEvent, askIssue, dateBesideAsk, clubPlace // §9s items 3 and 4: the price before the event and what's said under it, the date beside it, the club's place
} from "./_lib/sell";
// manage: an ordinary ticket's Manage listing rules (§9q items 1 to 3); here, the seller's own listings shown on their event's page.
import { ownListings } from "./_lib/manage";
// goods: simplified Goods (§9q item 6): what Sell an item sends and what stops it, its expiry line, and an item's words that say only what it states.
import {
  GOODS0, GOODS_CONFIRM, defaultExpiry, expiryLine, itemAction, itemDateIssue, itemExpiry, itemIssues, itemMoreHint, itemMoreUsed, itemKind, itemOver, itemEnds, itemOwnLine
} from "./_lib/goods";
// available: Available without the availability selector (§9r): a signed-out visitor's Available, and the words of a row for an event with
// no tickets ("Request a ticket"). A signed-in viewer's is the engine's availableNow.
import { guestOpenListings, guestEventRows, guestAvailable, requestLabel, LOOKUP_HINT } from "./_lib/available";
// wanted: a signed-out visitor's Wanted (which of the guest view's requests still show, their titles, and the rows for the category, the
// search, the club and the sort). No "Needed by" there or signed in (§9s item 1): a signed-in viewer's Wanted is the engine's wantedNow.
// And (§9s item 7) a Wanted card's lines, signed in or not: the date with how many, and the budget or an earlier deadline when there is one.
import { guestWantedLive, guestWantedTitle, guestWantedRows, wantedWhen, wantedNeed } from "./_lib/wanted";
// look: the picture a card leads with (§9v item 1: its row category's icon, or a Goods seller's photo), the same on Available and Wanted
// (Cover, BoardBand). cards: the one card layout's words (§9v item 1, §9w): Wanted's header line, short notes, who sees a match, the
// face value only when it adds something, a members-only event's club.
import { requestLook, eventLook, itemLook } from "./_lib/look"; // §9x item 2 (SELL6-N2): the picture is chosen again (a stated category, a cue in the title, the neutral ticket); an item's is its category's
import { wantedHead, cardNote, showsMatch, faceCaption, membersTag, ownCard, cardPrice, ownSub, cardClubs } from "./_lib/cards"; // §9x item 3: the owner's "Your listing" label, the price a card leads with
// §9v item 6 (SELL5-M5): Handoff settings' public-name line, "Who can see my details?" and "Tickets you've added" (_lib/profile.js).
import { publicNameLine, WHO_TITLE, WHO_SEES, ADDED_TITLE, ADDED_NOTE, addedTickets } from "./_lib/profile";
// confirm: what a page concealed until its account is confirmed says (conceal-fix). Whether it starts concealed is Handoff.tsx's (unconfirmed).
import { holdStatus } from "./_lib/confirm";
// photo: a Goods item's one photo (§9s item 6): resized and re-encoded in this browser before it's sent (shrinkPhoto).
import { shrinkPhoto, photoSize, photoSrc } from "./_lib/photo";
// answer: "I have this" on a ticket request in one submission (§9v item 2, SELL5-M3): which answer leads, what it sends (the engine's
// answerRequest), the quantity and total said before the tap, and where it lands.
import { listAndInviteOffered, answerAction, answerSummary, answerHint, answerLanding, freeAsk, payAskedToInvite, answerLead } from "./_lib/answer";
import { askWords, askBtn, askHead, askNoteExample, freeWords } from "./_lib/free"; // §9x item 1 (SELL6-N1): a free ticket's words
// plain: no routine "not verified" (§9x item 4, SELL6-N3): Help's one explanation, an event's source without "not checked by Handoff",
// a seller's own ticket without "self-reported, not verified", the server's new-event toast.
import { HELP_VERIFY_Q, HELP_VERIFY, sourceLine, holdingSource, FACE_CHIP, plainToast } from "./_lib/plain";
// The feature modules (_components, also private): ui (the shared building blocks), requests (a public request's and a private alert's
// cards, Get notified), payments (how a seller is paid: the methods editor, its one-line summary, an exchange's payment rows; live),
// exchanges (an exchange's card, a seller's listing panel), goods (goods cards, the item page) and activity (My activity). Each imports
// only the ones before it, and none imports this file. _lib/format: deadline wording.
import { deadlineText, demoDay } from "./_lib/format";
import {
  priceLines, Icon, Avatar, StateBadge, Cover, BoardBand, OwnTag, CardClub, useDialog, onRadioKeys, rov, TypeSwitch, copyText, TransferChip, PolicyDetails, ListingTerms,
  CostBreakdown, BackButton, Confirm, Req, PostedNote
} from "./_components/ui";
import { AlertDialog, REVIEW, IsoCard, RequestManage, AlertCard, answerable, AlertOptIn } from "./_components/requests";
import { HandoffCard, InviteForm, ListingPanel } from "./_components/exchanges";
import { PayMethodsEditor, PaySummary, payEditorFrom, payEditorKept, payEditorErrors, payEditorMethods, payEditorDirty, payErrorField, payBeforeText, payFocusId } from "./_components/payments";
import { ItemCover, goodsRuleFor, GoodsCard, BoardGoodsCard, ItemPage, ItemGallery } from "./_components/goods";
import { ActivityPage } from "./_components/activity";

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22) ? "full" : false; } }
/* The preview's first state: the demo saved in this browser, or else a fresh sample market (seed: the preview kit's, passed by App). */
function loadState(seed) {
  // feedSeen (What's new's seen marks): no view shows them since the UI update; a saved store keeps them for saved data and the rule checks.
  try { const raw = lsGet(STORE_KEY); if (raw) { const s = JSON.parse(raw); if (s && s.v === 11) return { suggestions: [], goods: [], goodsReqs: [], strikes: {}, alertPrefs: {}, responses: [], feedSeen: {}, ...s }; } } catch (e) {}
  return seed();
}
/* The shared building blocks (Icon, Avatar, StateBadge, Cover, useDialog, TypeSwitch, PolicyDetails, priceLines and the rest): _components/ui.jsx. */

/* The four kinds of interest, from general demand to a confirmed registration. Each is a separate step; none implies the next. */
const INTEREST_STEPS = [
  ["Request or alert", "Says what you're looking for (a public request, or a private alert), so you hear when a match is listed. It doesn't buy or hold anything."],
  ["Request", "Asks for one specific ticket that's listed. The seller decides."],
  ["Held for you", "The seller accepted, so it's held for you while they send it."],
  ["Handed off", "The seller sends it and you confirm you have it. If the seller added the organizer step, the organizer confirms instead (simulated)."],
];
function InterestSteps({ compact }) {
  return (
    <div className={compact ? "panel" : ""} style={compact ? { display: "grid", gap: 10, padding: 16 } : null}>
      {compact && <b style={{ fontSize: 14 }}>Request or alert, request to buy, held, handed off</b>}
      <ol className={"isteps" + (compact ? "" : " wide")}>
        {INTEREST_STEPS.map(([t, d], k) => <li key={t}><span className="n" aria-hidden="true">{k + 1}</span><span><b>{t}</b><span className="muted">{d}</span></span></li>)}
      </ol>
    </div>
  );
}

/* The development preview's own pages and dialogs, and the feedback runtime they read (useRuntime): _preview/pages.jsx. App gets them
   through the preview's kit (its preview prop), which only the preview's entry, _preview/HandoffPreview.jsx, passes. */

/* ============================================================
   LIVE MODE (C-DESIGN §4.7, §6.3; C-CONTRACT.md §1, §4, §5)
   The normal route is the shared market: the server sends the view, every change goes through its act action, and the page
   keeps nothing personal in this browser. The development preview keeps the sample demo. LIVE says which one is showing
   (_lib/mode.js: App sets it as it renders, with GUEST). The link to the server is in _lib/live-link.ts (useLiveLink: views, changes,
   retries and refreshes), and what this tab keeps across a page load in _lib/session.js (a guest's browsing choices across sign-in, and a
   form kept when a session ends: useDraftSource, draftFor).
   ============================================================ */
// Both modes (USER-INSTRUCTIONS §4.2-4.3): the subtitle beneath the wordmark, and each discovery view's one action heading (its h1).
const BRAND_SUBTITLE = "Student-to-student exchange";
const DISC_HEADING = { explore: "Find tickets, trip spots and more from classmates", isos: "See what classmates are looking for" };

/* Guest mode (USER-INSTRUCTIONS §5 items 1-2; C-CONTRACT.md §7): a signed-out visitor gets the server's guest view and browses it,
   read-only. GUEST is set by App as it renders, like LIVE. An action that needs to know who you are asks for PennTools sign-in at that
   moment, saying why in one sentence, then the page opens where you were. Nothing is ever sent to the server's act for a guest (should a
   change come anyway, the live link refuses it: SIGN_IN_FIRST, in _lib/live-link.ts). */
const SIGN_IN_ASKS = {
  take: ["Sign in to reserve", "Reserving holds it for you while you pay the seller, so Handoff needs to know it's you."],
  offer: ["Sign in to make an offer", "The seller sees who's offering and answers you in Handoff."],
  notify: ["Sign in to get notified", "A private alert belongs to your account: only you see it, and its alerts come to you in Handoff."],
  post: ["Sign in to post a request", "Classmates see who's asking, so a request needs your account."],
  sell: ["Sign in to sell", "Your listing shows who's selling, and buyers pay you directly."],
  share: ["Sign in to answer this request", "Sharing a listing or an item with a classmate shows them who you are."],
  request: ["Sign in to request this item", "The seller sees who's asking and answers you in Handoff."],
  activity: ["Sign in to see My activity", "It holds your listings, requests, alerts and exchanges."],
  notes: ["Sign in to see your notifications", "News about your listings, requests, alerts and exchanges comes to your account in Handoff."],
  profile: ["Sign in to see your Handoff settings", "They hold how buyers pay you and the tickets you've added."],
};
/* Follow-on B5 (invite to pay), once the engine's switch is on: a guest's button on a listing reads "Request to buy", so its prompt says
   that. The return target is the same (do=take), which opens the request form. */
const SIGN_IN_ASKS_INVITE = {
  take: ["Sign in to request to buy", "The seller sees who's asking and answers you in Handoff. Nothing is held until you reserve."],
};
const signInAsk = act => (LIVE && inviteFlowOn() && SIGN_IN_ASKS_INVITE[act]) || SIGN_IN_ASKS[act] || SIGN_IN_ASKS.sell;
/* A layout effect in the browser; nothing on a server render (the page mounts in the browser only, but checks render it on a server). */
const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
/* A New York wall time for a datetime-local field ("YYYY-MM-DDTHH:MM") from an instant: live forms' earliest times. */
const nyLocal = ms => { const p = nyParts(ms), z = n => String(n).padStart(2, "0"); return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`; };
/* Live: the address once a link's page has opened (settledHash, in _lib/routes.js): the page, and the listing a shared link points at;
   a sign-in's or an action's params leave. replaceState: no history entry, and no hashchange.
   sync (a link opened in this tab, App's hashchange handler): the address is written even when nothing leaves it. The site's router
   (Next.js) learns an address only from replaceState or pushState, never from a hash the browser changed itself, so without this it
   kept the address from before the link and put that back at its next update (a router refresh, a dev Fast Refresh): the listing's
   id, or the whole "#ev-…", left the address while the page still showed the event, and a reload lost the place (SELL3-K4). */
const settleAddress = sync => { const h = window.location.hash, to = settledHash(h); if (sync || to !== h) try { window.history.replaceState(null, "", window.location.pathname + window.location.search + to); } catch (e) {} };

/* ============================================================
   APP
   ============================================================ */
/* The pages App shows (view.name: ROUTES), the view an address opens (initialView) and the place it comes back to (placeOf) are in
   _lib/routes.js, with the lists of page names below (RECORD_PAGES, SECTION_OF…), each derived from ROUTES. */

/**
 * mode "live" (the normal route): initial is the viewer's view from page.tsx, api the page's server actions (act, refresh, markRead,
 * saveMyProfile), localSignIn whether this server signs in with the local development provider rather than Google. A guest view
 * (initial.guest: a signed-out visitor) is the read-only guest mode, and signIn starts the platform's sign-in, coming back to the URL it
 * is given (null: this server has no sign-in yet). Without them (the development preview) it's the sample demo, saved in this browser,
 * and preview is the preview's kit (_preview/HandoffPreview.jsx): the sample market (seed) and its ids (SEED_IDS), the feedback runtime
 * (useRuntime), and the preview's own pages and dialogs. App reads the kit only off the live route, which has none. unconfirmed (live,
 * signed in): Handoff.tsx's answer to "must this page wait until the account signed in now is confirmed?" (a render Next's router cache
 * brought back, one that may have been fetched earlier, or a signal heard while the app's code loaded: conceal-fix, conceal-fix-2), asked
 * as App first renders and again once its link is listening.
 * @param {{ mode?: string, initial?: import("@penntools/tool-handoff").View | import("@penntools/tool-handoff").GuestView | null, api?: import("./_lib/live-link").LiveApi | null, localSignIn?: boolean, signIn?: ((callbackUrl: string) => Promise<unknown>) | null, preview?: import("./_preview/HandoffPreview").PreviewKit | null, unconfirmed?: (() => boolean) | null }} [props] initial and api: the view and actions, as above
 */
function App({ mode = "preview", initial = null, api = null, localSignIn = false, signIn = null, preview = null, unconfirmed = null } = {}) {
  const live = mode === "live" && !!initial && !!api;
  const guest = live && initial.guest === true; // a signed-out visitor: the server's guest view, read-only (C-CONTRACT §7)
  setMode(live, guest);
  const skew = useRef(0); // live: the server's clock minus this browser's
  // Live: the view, installed before anything below reads the catalog. Nothing personal is read from or written to this browser's storage
  // (a guest's browsing choices ride in this tab's sessionStorage across a sign-in, and only then: keepDiscovery).
  const [s, setS] = useState(() => live ? installLive(guest ? asGuest(initial) : initial, skew) : (setLiveClock(null), loadState(preview.seed)));
  const sRef = useRef(s);
  // Live: what a guest had chosen while browsing, back from the sign-in round trip (keptDiscovery). Read here; removed once mounted.
  const [kept] = useState(() => live ? keptDiscovery() : null);
  const [me, setMe] = useState(() => { if (live) return guest ? null : initial.viewer.id; const v = lsGet("penntools-handoff-prototype-me"); return PEOPLE[v] && PEOPLE[v].demo ? v : "u_priya"; }); // live: the session's account, never a sample one; a guest has none
  // Live, signed in: a form this account was filling in when its session ended, kept for this place (draftFor; removed once mounted).
  const [draft] = useState(() => live && !guest ? draftFor(initial.viewer.id) : null);
  const [view, setView] = useState(() => {
    const { search, ...v } = initialView(draft ? "#" + draft.place : undefined); // search: a form that starts from the kept search (Available's "Post a request for …", "Sell a ticket")
    const w = search && kept && kept.disc.q.trim() ? { ...v, text: kept.disc.q.trim() } : v; // the form's own search field starts with it, as signed in (Explore's post; §9m item 3: no "Add an event" detour)
    const x = w.name === "goods" ? { name: "explore" } : w; // "#goods": Available with Goods chosen
    return draft ? { ...x, draft: draft.data } : x; // the kept form opens filled in: its page reads view.draft
  });
  // Discovery (category, search, club, Featured, goods category, each side's filters and sort) lives here, not in a view, so it carries
  // across Available and Wanted and back from an event page. The preview also keeps the search in this browser, as before.
  const [disc, setDiscRaw] = useState(() => ({ ...DISC0, q: live ? "" : lsGet(Q_KEY) || "", cat: ["goods", "item"].includes(initialView().name) ? "goods" : "all", ...(kept ? kept.disc : {}) })); // a shared item link's back button lands on Goods
  const setDisc = patch => setDiscRaw(d => ({ ...d, ...(typeof patch === "function" ? patch(d) : patch) }));
  // The discovery view you were last on: an event page's back button returns there, filters and all.
  const [lastDisc, setLastDisc] = useState(() => { if (kept && kept.side) return kept.side; const n = initialView().name; return DISC_VIEWS.includes(n) ? n : "explore"; });
  const [toast, setToast] = useState(null);
  const flash = (msg, kind) => setToast({ msg: LIVE ? plainToast(msg) : msg, kind, id: uid() }); // plainToast (§9x item 4, live): a new event's "Ticket listed." without "Handoff doesn't check its details"
  const [menu, setMenu] = useState(null);
  const [fbOpen, setFbOpen] = useState(false);
  const [share, setShare] = useState(null);
  // One short orientation on a first visit to the preview (remembered in this browser only); never over the self-test page.
  const [welcome, setWelcome] = useState(() => !live && (window.location.hash || "") !== "#selftest" && !lsGet("penntools-handoff-prototype-welcome"));
  const closeWelcome = () => { lsSet("penntools-handoff-prototype-welcome", "1"); setWelcome(false); };
  const rt = preview ? preview.useRuntime() : null; // the preview's feedback runtime; the live route has none (a mounted App's preview never changes)
  // Live, signed in (conceal-fix): a page that may not belong to the account signed in now (a render Next's router cache brought back, one
  // fetched earlier, or the tab hidden or signed out elsewhere while this code loaded) starts concealed until a refresh confirms the viewer
  // (Handoff.tsx decides, where Next commits the page; _lib/confirm.ts; useLiveLink's hold). A fresh render never conceals.
  const [restored] = useState(() => live && !guest && typeof unconfirmed === "function" && unconfirmed());
  const link = useLiveLink({ live, guest, initial, api, me, s, sRef, setS, flash, skew, restored, unconfirmed: live && !guest ? unconfirmed : null });
  // While concealed (hold), nothing of this account's is on the page: the content isn't rendered before it was first shown, and afterwards
  // stays mounted out of the page (Keep), so it comes back as it was. statusFocus: Try again had the focus, which the page heading then takes.
  const hold = live && !guest ? link.hold : null;
  const shownOnce = useRef(false); if (!hold) shownOnce.current = true;
  const statusFocus = useRef(false);
  applyWorld(s);
  setCurrentPlace(() => placeOf(view)); // where a session that ends here comes back to, when no form names a place (keepDraft)
  // Guest mode: the action that asked for sign-in and where to come back to ({ act, target }), shown as a dialog (SignInDialog).
  const [signInAsk, setSignInAsk] = useState(null);
  const askSignIn = (act, target) => { setMenu(null); setSignInAsk({ act, target }); };
  // Live, once mounted: the kept browsing choices have been read (above), so they go; and a return target's params leave the URL, so a
  // reload or a copied link doesn't reopen a form ("#ev-…?listing=…&do=take" becomes "#ev-…?listing=…"). The page itself stays, and
  // with it the listing a shared link points at (settleAddress), so a reload or a copied address still says which one was followed.
  // A kept form (keepDraft): a signed-in page has read it (above), for this account only, so it goes, whatever the account. A guest's page
  // leaves it for the sign-in, but only for its 15 minutes: once they're up it can't come back, so it's removed then (now, if they're up
  // already), and the page redraws, so a sign-in prompt stops promising it.
  const [, draftGone] = useState(0);
  useEffect(() => {
    if (!live) return;
    forgetDiscovery();
    let lapse = null;
    if (!guest) forgetDraft();
    else { const d = readDraft(); if (!d) forgetDraft(); else lapse = setTimeout(() => { forgetDraft(); draftGone(n => n + 1); }, Math.min(DRAFT_TTL, Math.max(0, d.at + DRAFT_TTL - Date.now()))); }
    link.whenIdle(() => settleAddress()); // once no Handoff call is out (_lib/call-gate.ts; at mount none is yet)
    return () => clearTimeout(lapse);
  }, []);
  // Live: a transfer window closing or an event starting changes what a page offers with nothing stored at that moment, and a page with no
  // deadline of its own learned it only at its next 30-second redraw. It redraws just after the next such time among the events it holds,
  // by its clock (the server's, D45) (readiness RB-9).
  const [edge, setEdge] = useState(0);
  useEffect(() => {
    if (!live) return;
    const now = CLOCK; let next = Infinity;
    for (const ev of Object.values(EV)) for (const t of [closesAt(ev), cutoffMs(ev)]) if (t > now && t < next) next = t;
    if (!(next - now <= 6 * HOUR)) return; // later ones are scheduled by a later redraw
    const t = setTimeout(() => setEdge(k => k + 1), next - now + 250);
    return () => clearTimeout(t);
  }, [s, edge]);

  const fullWarned = useRef(false); // a full browser store (mostly item photos) is said once, not silently ignored
  useEffect(() => { if (live) return; if (lsSet(STORE_KEY, JSON.stringify(s)) === "full" && !fullWarned.current) { fullWarned.current = true; flash("This browser's demo storage is full (mostly item photos), so new changes won't be kept after a reload. Use Reset demo in the account menu to clear it.", "error"); } }, [s]);
  useEffect(() => { if (!live) lsSet("penntools-handoff-prototype-me", me); }, [me]);
  useEffect(() => { if (!live) lsSet(Q_KEY, disc.q); }, [disc.q]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.kind === "error" ? 9000 : 5000); return () => clearTimeout(t); }, [toast]);
  /* After navigating, move focus to the new page's heading so keyboard and screen-reader users land in the right place. */
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    if (demoQuery('[aria-modal="true"]')) return; // a dialog opened with the navigation (the preview's share sheet after listing) keeps focus
    const h = demoQuery("[data-handoff-content] h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }, [view]);
  useEffect(() => { const k = e => { if (e.key === "Escape") setMenu(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  // The subtitle (both modes) shows only where the header row has room for all of it. Where it would be cut short, it's left out, as
  // the header's earlier subtitle was on narrow screens. Measured, since the room depends on which header buttons show their words.
  const brandRef = useRef(null);
  useBrowserLayoutEffect(() => {
    const area = brandRef.current, tag = area && area.querySelector(".brand-tag"); if (!tag || typeof ResizeObserver === "undefined") return;
    // Cut short means any overflow at all (its text wider than its box, measured unrounded), since even 1px shows as an ellipsis.
    const fit = () => { area.classList.remove("nosub"); const r = document.createRange(); r.selectNodeContents(tag); if (tag.scrollWidth > tag.clientWidth || r.getBoundingClientRect().width > tag.getBoundingClientRect().width + 0.05) area.classList.add("nosub"); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(area.parentElement);
    return () => ro.disconnect();
  }, [shownOnce.current]); // a page that started concealed has its header only once it's first shown
  // Revealed after Try again (which had the focus and is gone now): the page heading takes the focus, unless Keep gave it back to what had it.
  useBrowserLayoutEffect(() => {
    if (hold || !statusFocus.current) return;
    statusFocus.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    const h = demoQuery("[data-handoff-content] h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }, [!!hold]);

  const navSeq = useRef(0); // counts navigations, so opening My activity again starts at its overview
  const emptyPost = useRef(null); // Available's empty state's own Post a request while it's on screen (useEmptyPost): the header's does the same
  // "goods" is Available with Goods chosen; "new" (What's new, removed in the UI update) is Available too. Going to Available or Wanted
  // keeps the category and search; older links that name a browsing option or a Wanted filter (browse, show) set the category, club or
  // Featured they meant (discFor).
  // A page opened from My activity, or from another event, item or request page (linkFrom), keeps that origin (its back button) through a posting form
  // opened from it: the form names its page (from and fromId; the event page's own links give only eventId, a request's Edit only edit),
  // carries the origin, passes it on through a Tickets & trips | Goods switch, and hands it back when it returns to that page (Cancel or
  // posting). Any other navigation starts without one. (FORM_PAGES: the posting forms; PAGE_OF: a record page as a form's from names it.)
  const formPage = p => { const id = p.fromId || (p.from === "event" ? p.eventId : p.from === "request" ? p.edit : null); return p.from && id ? p.from + ":" + id : null; };
  const pageOf = (name, p) => FORM_PAGES.includes(name) ? formPage(p) : Object.prototype.hasOwnProperty.call(PAGE_OF, name) && p.id ? PAGE_OF[name] + ":" + p.id : null;
  const keepOrigin = (name, p) => { const here = view.origin && p.origin === undefined && (FORM_PAGES.includes(name) || FORM_PAGES.includes(view.name)) ? pageOf(view.name, view) : null;
    return here && pageOf(name, p) === here ? { ...p, origin: view.origin } : p; };
  const go = (to, params = {}) => {
    const name = to === "goods" || to === "new" ? "explore" : to;
    if (DISC_VIEWS.includes(name)) { setDisc(d => discFor(to, params, d)); setLastDisc(name); }
    setView({ ...keepOrigin(name, params), name, seq: ++navSeq.current }); setMenu(null); demoRoot()?.scrollTo({ top: 0 }); // a notification's link carries its own name
  };
  // Live: a link opened in this tab while Handoff shows (an address pasted or a bookmark, or Back and Forward over such entries) changes only
  // the hash, so the browser loads nothing and the page stayed as it was. It opens now as a fresh load would (initialView), and a return
  // target's params then leave the address, as at mount. The app's own replaceState calls fire no hashchange, so this can't loop, and it
  // adds no history entries (readiness RC-1).
  // A listing's link opened this way: the view this tab holds may be older than the link (a listing posted or closed since its last
  // refresh), where a fresh load would have a fresh one. So the event page opens saying nothing about that listing (checking, below),
  // fresh availability is asked for (the link's refreshNow), and the page decides once that's answered: it never says "isn't open", or
  // points at the listing as available, from the old view first. linkCheck: the navigation (view.seq) being checked; any other
  // navigation meanwhile ends the wait.
  const goRef = useRef(go); goRef.current = go;
  const linkRef = useRef(link); linkRef.current = link;
  const viewNow = useRef(view); viewNow.current = view; // the page shown now, for an address written once the calls out have answered
  const linkSeq = useRef(-1); // the last navigation a link opened in this tab (its address is settled by the handler; addressOf, below)
  const [linkCheck, setLinkCheck] = useState(null);
  const checking = live && linkCheck !== null && linkCheck === view.seq;
  useEffect(() => {
    if (!live) return;
    const open = () => {
      const v = initialView(); delete v.search; // a kept search belongs to a sign-in round trip (mount), not to a link
      setSignInAsk(null); // (the shared market has no Share sheet to close: §9v item 3)
      const check = v.name === "event" && !!v.listing;
      if (check) setLinkCheck(navSeq.current + 1); // set before the navigation it names (go counts it), so no render shows this link's listing unchecked
      goRef.current(v.name, v);
      linkSeq.current = navSeq.current; // this navigation's address is the link's own, settled here (not addressOf's, below)
      linkRef.current.whenIdle(() => settleAddress(true)); // once no Handoff call is out (_lib/call-gate.ts). Always written: the site's router learns this link's address only from replaceState (settleAddress, sync)
      if (check) { const seq = navSeq.current; linkRef.current.refreshNow().then(() => setLinkCheck(c => c === seq ? null : c)); }
    };
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  // §9v (SELL5-M2; the orchestrator's addendum to item 3): live, the address follows the page as people move around inside Handoff
  // (addressOf: the page's ordinary public URL, an event's with the listing it points at; never anything typed), so copying the address
  // bar gives the listing, item, event or request on screen, which opens the same page for a classmate or a visitor. replaceState: no
  // history entry and no hashchange, so the link handler above never runs for it and Back works as before; the site's router learns it
  // (settleAddress's note). Not for the first view (the address the page was opened with, settled at mount: a sign-in's return included)
  // and not for a view a link opened (linkSeq: the handler settles that address itself, keeping an older link's own words, like #goods).
  // SELL5-M5 (9v addendum 2; flows-a F5): written once every Handoff call that's out has answered (link.whenIdle, _lib/call-gate.ts). The
  // site's router hears replaceState as a navigation, which drops every server action queued behind the one that's out, so written at
  // once it lost the bell's markRead when a refresh was out (shown read, never stored) and a change pressed just before the tap (never
  // sent; the page left busy). Usually nothing is out and it's written at once, as before; otherwise the page shown last is written.
  useEffect(() => {
    if (!live || view.seq == null || view.seq === linkSeq.current) return;
    link.whenIdle(() => {
      const v = viewNow.current; if (v.seq == null || v.seq === linkSeq.current) return; // a link opened since: the handler settles its address
      const to = addressOf(v);
      if (!to || to === window.location.hash) return;
      try { window.history.replaceState(null, "", window.location.pathname + window.location.search + to); } catch (e) {}
    });
  }, [view]);
  /* All changes go through the reducer: the server's, through act (live), or this browser's against the latest state, not the last
     render (the preview). Either way the answer is a Promise: callers that read the result await it. extra (live): { photo }, a Goods
     photo sent beside the change (§9s item 6); the preview has its own photos and takes none. */
  const dispatch = (a, quiet, extra) => {
    if (live) return link.dispatch(a, quiet, extra);
    const res = reduce(sRef.current, me, a);
    if (res.error) { if (!quiet) flash(res.error, "error"); return settled(res); }
    sRef.current = res.state; setS(res.state);
    if (res.toast && !quiet) flash(res.toast);
    return settled(res);
  };
  const switchTo = id => {
    if (id === me) return;
    setMe(id);
    const unread = sRef.current.notifications.filter(x => x.userId === id && !x.read).length;
    flash(`Now using ${PEOPLE[id].first}'s sample account` + (unread ? ` · ${plural(unread, "new notification")}` : ""));
  };
  // A reset also clears the search, category and filters.
  const resetDemo = () => { const fresh = preview.seed(); sRef.current = fresh; setS(fresh); setMe("u_priya"); lsSet(Q_KEY, ""); setDiscRaw({ ...DISC0 }); go("explore"); flash("Demo listings, requests and clock reset in this browser. Feedback is not saved in this PennTools prototype."); };

  // origin: where an event, item or request page was opened from when that isn't a discovery view (My activity, or another event, item
  // or request page via linkFrom, nested with that page's own origin), for its back button (BackButton); pages that don't take it ignore it.
  // openShare: the development preview's own Share sheet only. The shared market has no outward Share (§9v item 3, SELL5-M1): no Share
  // button and no WhatsApp or copy-link sheet anywhere; a record's ordinary URL is its link, and posting ends on its page with Done.
  const ctx = { s, me, go, dispatch, switchTo, openShare: live ? null : setShare, flash, rt, origin: view.origin, saveProfile: link.saveProfile, deleteData: link.deleteData, localSignIn };
  // Live: the view holds only this account's notifications (the newest 100) and the count of every unread one. A guest has none.
  const myNotes = guest ? [] : live ? s.notifications : s.notifications.filter(n => n.userId === me);
  const unread = guest ? 0 : live ? s.unreadCount || 0 : myNotes.filter(n => !n.read).length;
  // Another account, a signed-out session or a new release: nothing of this account's stays on screen while the page reloads.
  if (link.stale) return <div className={styles.frame}><div className={styles.root} data-handoff-root><p className="wrap reloading" role="status">{RELOADING[link.stale]}</p></div></div>;

  let page;
  // Guest mode: the guest pages read only the guest view (C-CONTRACT §7). Pages that are all about you (the posting forms, My activity,
  // Profile), reached by a link, are a sign-in prompt for that page instead.
  const gctx = { s, go, ask: askSignIn, origin: view.origin };
  // draft (view.draft): what a form held when the session ended, back after sign-in (keepDraft); only on the page's first render.
  const dr = view.draft || {};
  if (guest) {
    if (view.name === "event") page = <GuestEventPage {...gctx} back={lastDisc} id={view.id} focusListing={view.listing} checking={checking} nav={view.seq} key={view.id} />;
    else if (view.name === "item") page = <GuestItemPage {...gctx} back={lastDisc} id={view.id} key={"item" + view.id} />;
    else if (view.name === "isos") page = <GuestWanted {...gctx} disc={disc} setDisc={setDisc} />;
    else if (view.name === "iso") page = <GuestIsoPage {...gctx} id={view.id} key={"iso" + view.id} />;
    else if (view.name === "how") page = <LiveHelp go={go} ask={askSignIn} />;
    else if (hasOwn(GATE_ASK, view.name)) page = <GuestGate view={view} go={go} signIn={signIn} localSignIn={localSignIn} disc={disc} side={lastDisc} key={view.name} />;
    else page = <GuestExplore {...gctx} disc={disc} setDisc={setDisc} emptyPost={emptyPost} />; // "explore", and any name it doesn't know
  }
  // listing: point at one listing on the event page (a shared listing); notify: open its Get notified dialog (from a lookup row); resume:
  // reopen "I'll take it" or "Make offer" there, back from sign-in; checking: that listing's link was opened in this tab and fresh
  // availability isn't in yet, so the page says nothing about it (App's hashchange handler).
  else if (view.name === "event") page = <EventPage {...ctx} back={lastDisc} id={view.id} focusListing={view.listing} listed={view.listed} listedNote={view.listedNote} checking={checking} openAlert={!!view.notify} resume={view.resume} draft={view.draft} nav={view.seq} key={view.id} />;
  else if (view.name === "list") page = <ListPage {...ctx} initial={view.eventId} initialText={view.text} forIso={view.forIso} from={view.from} fromId={view.fromId} back={lastDisc} typeFocus={view.typeFocus} carry={view.carry || dr.list} evDraft={dr.addEvent} key={"list" + me + (view.eventId || "") + (view.forIso || "") + (view.text || "")} />; // a half-filled form (and its pay handle) belongs to the account that started it; forIso: listing for one request; from, fromId: the page Cancel returns to (leaveTo); carry: what the Tickets & trips | Goods switch brought (sellCarry), or the kept form (dr.list, the same shape)
  else if (view.name === "post") page = <PostIsoPage {...ctx} initialEvent={view.eventId} initialText={view.text} market={view.market} initialCat={view.cat} editId={view.edit} from={view.from} fromId={view.fromId} back={lastDisc} draft={dr.post} evDraft={dr.addEvent} key={"post" + me + (view.eventId || "") + (view.text || "") + (view.market || "") + (view.cat || "") + (view.edit || "")} />;
  else if (view.name === "isos") page = <IsoBoard {...ctx} disc={disc} setDisc={setDisc} />;
  else if (view.name === "item") page = <ItemPage {...ctx} id={view.id} back={lastDisc} resume={view.resume} posted={!!view.posted} key={"item" + view.id} />;
  else if (view.name === "sell") page = <SellPage {...ctx} initialTitle={view.title} initialCat={view.cat} forIso={view.forIso} from={view.from} fromId={view.fromId} back={lastDisc} typeFocus={view.typeFocus} carry={view.carry || dr.sell} key={"sell" + me + (view.title || "") + (view.cat || "") + (view.forIso || "")} />;
  else if (view.name === "iso") page = <IsoPage {...ctx} id={view.id} posted={!!view.posted} key={"iso" + me + view.id} />; // posted (§9v item 3, live): Post request just made it (this visit only, never in the address)
  else if (view.name === "activity") page = <ActivityPage key={me + ":" + (view.seq || 0)} {...ctx} initialOpen={view.open} draft={view.draft} />; // every visit starts at the overview, or at one card (open: "iso:<id>"); old links still pass a tab; draft: a seller's edit kept when the session ended, back at its card
  else if (live && PREVIEW_PAGES.includes(view.name)) page = <Explore {...ctx} disc={disc} setDisc={setDisc} emptyPost={emptyPost} />; // the preview's own pages
  else if (view.name === "how") page = live ? <LiveHelp go={go} ask={askSignIn} /> : <preview.HowPage go={go} me={me} openFeedback={() => setFbOpen(true)} />;
  else if (view.name === "reviewers") page = <preview.ReviewerPage {...ctx} openFeedback={() => setFbOpen(true)} resetDemo={resetDemo} />;
  else if (view.name === "profile") page = live ? <LiveProfile {...ctx} /> : <preview.ProfilePage {...ctx} />;
  else if (view.name === "clubs") page = <preview.ClubsPage {...ctx} initialClub={view.club} key={"clubs" + (view.club || "")} />;
  else if (view.name === "results") page = <preview.ResultsPage rt={rt} openFeedback={() => setFbOpen(true)} />;
  else if (view.name === "selftest") page = <preview.SelfTestPage s={s} />;
  else page = <Explore {...ctx} disc={disc} setDisc={setDisc} emptyPost={emptyPost} />; // "explore", and any name it doesn't know (an older "#explore?do=add" too: the empty state no longer offers "Add an event", §9s item 2)
  const discSide = view.name === "isos" ? "isos" : page.type === Explore || page.type === GuestExplore ? "explore" : null; // which view the intro and discovery header serve

  // The project brief, organizer preview and feedback open from Help (and the account menu; #reviewers, #clubs), not the main nav.
  // The main nav is one switch between two content views: Available (listings: events, trains, treks and goods) and Wanted (requests).
  // My activity and Help (the FAQ) are buttons beside the bell and Handoff settings (the preview: its sample-account menu).
  const modes = [["explore", "Available", "ticket"], ["isos", "Wanted", "hand"]];
  const todoN = guest ? 0 : needsAction(s, me).length; // shown on the My activity button
  const section = SECTION_OF[view.name] || view.name; // which side of the switch a page belongs to
  const curIso = view.name === "iso" && !guest ? s.interests.find(i => i.id === view.id) : null;
  const curWant = view.name === "iso" && guest ? s.wanted.find(w => w.id === view.id) || null : null; // a guest's request page: its anonymized summary
  const onGoods = ["item", "sell"].includes(view.name) || (!!discSide && disc.cat === "goods");
  const goodsSide = onGoods || (view.name === "post" && view.market === "goods") || !!(curIso && curIso.goods) || !!(curWant && curWant.goods); // header buttons follow the side you're on
  // The header's Sell and Post a request keep their labels and open the form that fits the page: the goods forms on the Goods side; an
  // event page's own event, or the event of the request whose page this is; anywhere else no event (you choose one). Each form's Cancel
  // returns to the page it came from (leaveTo): an event, request or item page, My activity, Help, Project brief, Organizer preview (its
  // club), Profile and alerts or Feedback results; from Available or Wanted, the last browsing view.
  const isoHere = curIso && (curIso.kind === "iso" || curIso.userId === me) ? curIso : null; // someone else's private alert reads "not found": never use it
  const reqHere = isoHere || curWant; // the request whose page this is (a guest's: the summary)
  const formFrom = view.name === "event" && EV[view.id] ? { from: "event", fromId: view.id } : reqHere ? { from: "request", fromId: reqHere.id }
    : view.name === "item" ? { from: "item", fromId: view.id } : view.name === "activity" ? { from: "activity" }
    : FORM_FROM_PAGES.includes(view.name) ? { from: view.name, ...(view.name === "clubs" && view.club ? { fromId: view.club } : {}) } : {};
  const formEv = formFrom.from === "event" ? view.id : reqHere && !reqHere.goods && EV[reqHere.eventId] ? reqHere.eventId : null;
  // Where Sell and Post a request go: signed in, there; a guest is asked to sign in first, and comes back to that form.
  const sellTo = goodsSide ? ["sell", formFrom] : ["list", formEv ? { eventId: formEv, ...formFrom } : formFrom];
  const postTo = ["post", goodsSide ? { market: "goods", cat: disc.cat === "goods" && disc.goodsCat !== "All" ? disc.goodsCat : undefined, ...formFrom } : formEv ? { eventId: formEv, ...formFrom } : formFrom];
  const sellHere = () => guest ? askSignIn("sell", { name: sellTo[0], ...sellTo[1] }) : go(...sellTo);
  // On Available's empty state, Post a request is that state's own (from the search, and for a guest kept across the sign-in): where the
  // header's has its words, the empty state shows none of its own, so the header's does what it would (useEmptyPost).
  const postHere = () => { const own = discSide === "explore" ? emptyPost.current : null; if (own) return own(); return guest ? askSignIn("post", { name: postTo[0], ...postTo[1] }) : go(...postTo); };
  // A guest's bell asks for sign-in and comes back to the page it was pressed on (a record page, or one of GUEST_PAGES; else Available).
  const here = RECORD_PAGES.includes(view.name) ? { name: view.name, id: view.id } : GUEST_PAGES.includes(view.name) ? { name: view.name } : { name: "explore" };

  const content = (<>
      <header className="top">
        <div className="wrap">
          <div className={"top-row" + (live ? " live-row" : "")}>
            {/* The subtitle is the button's sibling, so the button keeps its visible name "Handoff" (its label "Handoff home"). It sits
                beneath the name in the header's understated style, in both modes, and is left out where it would be cut short (nosub). */}
            <div ref={brandRef} className="brand-area under">
              <button className="brand" onClick={() => go("explore")} aria-label={BRAND + " home"}>
                <span className="brand-mark"><Icon name="ticket" size={17} /></span>
                <span className="brand-name">{BRAND}</span>
              </button>
              <span className="brand-tag">{BRAND_SUBTITLE}</span>
            </div>
            <span className="spacer" />
            {/* A guest's Post a request, Sell and My activity ask for sign-in first (a dialog), and come back to that form or page.
                One-form Sell (§9l item 1, live): Sell first and Request second, each with its word at every width: on a phone the pair is
                a row of its own under the name (.main-acts in .live-row), since both words don't fit beside the four round buttons. The
                second button keeps its accessible name, "Post a request (…)", which holds its word. The preview keeps Post a request, then Sell. */}
            {live ? <div className="main-acts">
              <button className="btn btn-primary" onClick={sellHere} aria-label="Sell" aria-haspopup={guest ? "dialog" : undefined}><Icon name="plus" size={16} /><span className="sell-label">Sell</span></button>
              <button className="btn req-btn" onClick={postHere} aria-label="Post a request (what you're looking for)" title="Post a request" aria-haspopup={guest ? "dialog" : undefined}><Icon name="hand" size={16} /><span className="req-label">Request</span></button>
            </div> : <>
              <button className="btn hide-xs" onClick={postHere} aria-label="Post a request (what you're looking for)" title="Post a request" aria-haspopup={guest ? "dialog" : undefined}><Icon name="hand" size={16} /><span className="post-label">Post a request</span></button>
              <button className="btn btn-primary" onClick={sellHere} aria-label="Sell" aria-haspopup={guest ? "dialog" : undefined}><Icon name="plus" size={16} /><span className="sell-label">Sell</span></button>
            </>}
            <button className={"btn activity-btn" + (view.name === "activity" ? " on" : "")} onClick={() => guest ? askSignIn("activity", { name: "activity" }) : go("activity")} aria-current={view.name === "activity" && !guest ? "page" : undefined} aria-haspopup={guest ? "dialog" : undefined} aria-label={todoN ? `My activity, ${todoN} need${todoN === 1 ? "s" : ""} your action` : "My activity"}>
              <Icon name="inbox" size={16} /><span className="activity-label">My activity</span>{todoN > 0 && <span className="action-count" aria-hidden="true">{todoN}</span>}
            </button>
            <button className={"icon-btn" + (view.name === "how" ? " on" : "")} onClick={() => go("how")} aria-current={view.name === "how" ? "page" : undefined} aria-label="Help"><Icon name="help" size={18} /></button>
            {/* Signed in: the bell, then (live) the Handoff settings control or (the preview) its sample-account menu. Live, PennTools' own
                header holds the account itself (its avatar, account settings and Log out), so Handoff shows no second avatar or name: its
                settings control opens Handoff settings directly (amendment 9h). A guest's bell asks for sign-in; a guest has no settings
                control (the site header has Sign in, and a #profile link shows the sign-in prompt). */}
            {guest && <button className="icon-btn" onClick={() => askSignIn("notes", here)} aria-haspopup="dialog" aria-label="Notifications (sign in to see yours)"><Icon name="bell" size={18} /></button>}
            {!guest && <>
            <div style={{ position: "relative" }}>
              <button className="icon-btn" onClick={() => setMenu(m => m === "bell" ? null : "bell")} aria-label={`Notifications, ${unread} unread`} aria-expanded={menu === "bell"}>
                <Icon name="bell" size={18} />{unread > 0 && <span className="dot">{unread}</span>}
              </button>
              {menu === "bell" && (
                <div className="pop" role="dialog" aria-label="Notifications">
                  <div className="notif-head">{live
                    ? <span><b>Notifications</b><small className="muted" style={{ display: "block", fontSize: 12 }}>In the app</small></span>
                    : <span><b>{PEOPLE[me].first}'s notifications</b><small className="muted" style={{ display: "block", fontSize: 12 }}>In the app{alertVia(s, me).map(k => ` · ${k}`).join("")} (simulated) · <button className="linkish" style={{ fontSize: 12, textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => go("profile")}>Email or text alerts</button></small></span>}
                    <button className="btn btn-ghost btn-sm" disabled={live && unread === 0} onClick={() => dispatch({ type: "readAll" }, true)}>Mark all read</button></div>
                  <div className="notif-list">
                    {myNotes.length === 0 && <div style={{ padding: 18 }} className="muted">Nothing yet.</div>}
                    {myNotes.map(n => (
                      <button key={n.id} className={"notif" + (n.read ? "" : " unread")} onClick={() => { dispatch({ type: "readNote", id: n.id }, true); if (n.link) go(n.link.name, n.link); }}>
                        <span className="ud" /><span>{n.text}<time>{ago(n.at)}{n.via ? ` · also by ${n.via.join(" and ")} (simulated)` : ""}</time></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {live ? <button className={"icon-btn" + (view.name === "profile" ? " on" : "")} onClick={() => go("profile")} aria-current={view.name === "profile" ? "page" : undefined} aria-label="Handoff settings" title="Handoff settings"><Icon name="settings" size={18} /></button>
            : <div style={{ position: "relative" }}>
              <button className="persona-btn" onClick={() => setMenu(m => m === "reviewer" ? null : "reviewer")} aria-expanded={menu === "reviewer"} aria-label={`Account menu: ${PEOPLE[me].name} (sample account)`}>
                <Avatar id={me} size={28} /><span className="hide-md">{PEOPLE[me].first}</span><Icon name="chev" size={14} />
              </button>
              {menu === "reviewer" && (
                <div className="pop" role="dialog" aria-label="Account menu">
                  <div className="pop-sec">
                    <div className="eyebrow">Sample accounts (not signed in)</div>
                    {DEMO_USERS.map(id => (
                      <button key={id} className={"pop-item" + (me === id ? " on" : "")} onClick={() => { switchTo(id); setMenu(null); }} aria-pressed={me === id}>
                        <Avatar id={id} size={30} /><span><b>{PEOPLE[id].name}</b><small>{PEOPLE[id].role} · sample memberships: {PEOPLE[id].memberships.join(", ")}</small></span>
                      </button>
                    ))}
                  </div>
                  <div className="pop-sec">
                    <div className="eyebrow">Demo clock · {fmtMs(CLOCK)}</div>
                    <div className="actions">
                      <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "clock", hours: RULES.holdMinutes / 60 })}>+{RULES.holdMinutes} min</button>
                      <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "clock", hours: 2 })}>+2 hours</button>
                      <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "clock", hours: 24 })}>+1 day</button>
                     <button className="btn btn-sm" onClick={() => dispatch({ type: "clock", reset: true })}>Reset clock</button>
                    </div>
                  </div>
                  <div className="pop-sec">
                    <div className="eyebrow">Reviewer tools</div>
                    <button className="pop-item" onClick={() => go("reviewers")}><Icon name="info" />Project brief and what's simulated</button>
                   <button className="pop-item" onClick={() => go("profile")}><Icon name="users" />Profile and alerts</button>
                   <button className="pop-item" onClick={() => { setFbOpen(true); setMenu(null); }}><Icon name="chat" />Give feedback</button>
                    {rt.canResults && <button className="pop-item" onClick={() => go("results")}><Icon name="check" />Feedback results</button>}
                    <button className="pop-item" onClick={() => { resetDemo(); setMenu(null); }}><Icon name="refresh" /><span>Reset demo data<small>Listings, requests and clock in this browser. Feedback is copied manually.</small></span></button>
                  </div>
                </div>
              )}
            </div>}
            </>}
          </div>
          <div className="mode-row">
            <nav className="mode-switch" aria-label="Main">
              {modes.map(([k, label, icon]) => (
                <button key={k} className={section === k ? "on" : ""} aria-current={view.name === k ? "page" : section === k ? "true" : undefined} onClick={() => go(k)}><Icon name={icon} size={16} />{label}</button>
              ))}
            </nav>
          </div>
        </div>
      </header>
      {menu && <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setMenu(null)} />}
      {/* Available and Wanted open with their intro (the page's h1, where focus lands after navigating), then the shared category row and
          search. Both keep their places across the two views, so the discovery header's own state (the preview's Filters panel) carries over. */}
      <div data-handoff-content>{discSide && <DiscIntro side={discSide} disc={disc} go={go} ask={askSignIn} />}{discSide && <DiscoveryHeader side={discSide} disc={disc} setDisc={setDisc} />}{page}</div>
      {fbOpen && !live && <preview.FeedbackModal rt={rt} onClose={() => setFbOpen(false)} onDone={() => dispatch({ type: "feedbackGiven" }, true)} />}
      {share && !live && <ShareSheet target={share} s={s} seedIds={preview.SEED_IDS} onClose={() => setShare(null)} />}
      {guest && signInAsk && <SignInDialog ask={signInAsk} signIn={signIn} localSignIn={localSignIn} disc={disc} side={lastDisc} onClose={() => setSignInAsk(null)} />}
      {welcome && !live && !share && !fbOpen && <preview.WelcomeSheet onClose={closeWelcome} me={me} />}
      <div className="sr" aria-live="polite" aria-atomic="true">{live && link.busy ? "Saving…" : toast && toast.kind !== "error" ? toast.msg : ""}</div>
      <div className="sr" aria-live="assertive" aria-atomic="true">{toast && toast.kind === "error" ? toast.msg : ""}</div>
      {toast && <Toast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
    </>);
  // Live and signed in, the content is kept by Keep: out of the page while concealed (the status shows instead), and not rendered at all
  // until it has first been shown. The preview and a guest's page render it in place, as before.
  return (
    <div className={styles.frame}><div className={styles.root} data-handoff-root data-busy={live && link.busy ? "" : undefined} data-guest={guest ? "" : undefined} data-confirming={hold ? "" : undefined}>
      {hold && <Confirming hold={hold} retry={link.retry} statusFocus={statusFocus} />}
      {live && !guest ? shownOnce.current && <Keep hidden={!!hold}>{content}</Keep> : content}
    </div></div>
  );
}
/* Live, signed in (conceal-fix): the app's content, rendered through a portal into a box of its own that this puts in the page while the
   account is confirmed and takes out of the page while it's concealed. Out of the page, none of it is shown, read out or in the page's
   HTML, yet it stays mounted, so typed values, open forms and dialogs come back as they were, with the scroll position and the focus.
   React never moves the box (it doesn't own where it is), so taking it out is safe; dialogs rendered through a portal go into it too
   (demoLayer). The box is placed from its host's ref, which React sets before the content's own layout effects run, so they find the
   content in the page. A server render (the render checks) has no document: the content goes in place. */
function Keep({ hidden, children }) {
  const [box] = useState(() => typeof document === "undefined" ? null : Object.assign(document.createElement("div"), { className: "keep" }));
  const host = useRef(null), saved = useRef(null), hide = useRef(hidden);
  hide.current = hidden;
  const place = useRef(h => { host.current = h; if (h && box && !hide.current && box.parentNode !== h) h.appendChild(box); }).current;
  useBrowserLayoutEffect(() => {
    const h = host.current; if (!h || !box) return;
    const root = h.closest("[data-handoff-root]");
    if (hidden) {
      if (!box.parentNode) return;
      const a = document.activeElement;
      saved.current = { focus: a && box.contains(a) ? a : null, top: root ? root.scrollTop : 0 };
      box.remove();
    } else if (box.parentNode !== h) {
      h.appendChild(box);
      const sv = saved.current; saved.current = null;
      if (sv && root) root.scrollTop = sv.top;
      if (sv && sv.focus && sv.focus.isConnected) sv.focus.focus({ preventScroll: true });
    }
  }, [hidden]);
  useBrowserLayoutEffect(() => { if (!box) return; setLayer(box); return () => setLayer(null); }, []);
  if (!box) return children;
  return <><div ref={place} className="keep" />{createPortal(children, box)}</>;
}
/* The toast: at the bottom of the page area, unless there it would cover the payment block's one primary action ("I've sent payment",
   data-sent-payment), as it did on a phone right after reserving (W1 fix, MY-1): then it shows at the top instead, when that spot is clear
   of it. Both spots are measured, not guessed, as it appears (before it's painted) and again while it shows: on scroll, on resize and every
   quarter second, since the page can change under it. Nothing else about it changes: its words, how long it stays and its close button.
   (§9s item 5: the "Ticket listed" dialog it also kept clear of no longer opens by itself, so the payment block is the one thing left.) */
const TOAST_AVOID = "[data-sent-payment]";
function Toast({ toast, onClose }) {
  const ref = useRef(null); const [top, setTop] = useState(false);
  useBrowserLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const root = el.closest("[data-handoff-root]") || document;
      const avoid = [...root.querySelectorAll(TOAST_AVOID)].map(b => b.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      if (!avoid.length) { setTop(false); return; }
      const was = el.classList.contains("toast-top");
      el.classList.remove("toast-top"); const low = el.getBoundingClientRect();
      el.classList.add("toast-top"); const high = el.getBoundingClientRect();
      el.classList.toggle("toast-top", was); // as rendered: React's className stays the truth
      const covers = r => avoid.some(a => a.left < r.right + 8 && a.right > r.left - 8 && a.top < r.bottom + 8 && a.bottom > r.top - 8);
      setTop(covers(low) && !covers(high));
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(place); };
    place();
    const every = setInterval(soon, 250);
    window.addEventListener("scroll", soon, true); window.addEventListener("resize", soon);
    return () => { clearInterval(every); if (frame) cancelAnimationFrame(frame); window.removeEventListener("scroll", soon, true); window.removeEventListener("resize", soon); };
  }, []);
  return <div ref={ref} className={"toast" + (toast.kind === "error" ? " error" : "") + (top ? " toast-top" : "")} aria-hidden="true"><Icon name={toast.kind === "error" ? "alert" : "check"} size={16} /><span>{toast.msg}</span><button className="btn btn-ghost btn-sm" style={{ color: "inherit", padding: "2px 6px" }} onClick={onClose} tabIndex={-1}>{"✕"}</button></div>;
}
/* Live, signed in (conceal-fix): what a concealed page shows instead of its content (holdStatus, in words with no name or other account
   detail), as a status, and Try again once the check is late or has failed. */
function Confirming({ hold, retry, statusFocus }) {
  const { text, retry: offer } = holdStatus(hold);
  return (
    <div className="wrap confirming">
      <p role="status">{text}</p>
      {offer && <button type="button" className="btn btn-sm" onClick={retry} onFocus={() => { statusFocus.current = true; }} onBlur={e => { if (e.relatedTarget) statusFocus.current = false; }}>Try again</button>}
    </div>
  );
}
const CLUB_ALL = { k: "all", label: "All clubs" }; // By club's first option: no club filter

/* Discovery: Available and Wanted share one category row and one search, kept in App so they carry across the two. The categories
   (DISC_CATS, DISC_LABEL), the two views (DISC_VIEWS) and where older links land (discFor) are in _lib/routes.js. */
const Q_KEY = "penntools-handoff-prototype-q";
const clubsMatching = find => { const f = squash(find); return CLUB_MENU.filter(c => !f || [c.label, c.short, ...(c.orgs || [])].some(n => n && squash(n).includes(f))); };
/* By club ▾: a button that opens a small, non-modal popover with a club search over a list: All clubs, then the clubs. Focus stays in
   the search while the arrow keys move through the list (aria-activedescendant); the highlighted option (from the keys, the pointer or
   the first match of a search) is the one Enter picks, and a click picks too; focus then goes back to the button. Escape, a click
   outside or tabbing away closes it. Opened by touch, it doesn't raise the on-screen keyboard: the search is a tap away. The popover
   stays within the page's width, and its list gives up height to stay above the page's bottom edge. */
function ClubMenu({ pick, choose }) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const [active, setActive] = useState(-1); // the highlighted option, which Enter picks; none until a key, the pointer or a search
  const btn = useRef(null), pop = useRef(null), input = useRef(null), list = useRef(null), touch = useRef(false);
  const sel = clubOf(pick); // the chosen club; "all" (no club filter) leaves the button reading "By club"
  const clubs = clubsMatching(find);
  const opts = [CLUB_ALL, ...clubs];
  const act = active < opts.length ? active : -1;
  const current = () => Math.max(0, opts.findIndex(o => o.k === pick)); // the selected option, or All events
  // Keep By club out from under the sticky header, so the popover opens below it and focus returns to it in view.
  const reveal = () => { const b = btn.current, hdr = demoQuery("header.top"); if (!b || !hdr) return; const gap = b.getBoundingClientRect().top - hdr.getBoundingClientRect().bottom - 8; if (gap < 0) demoRoot()?.scrollBy({ top: gap }); };
  const openMenu = keys => {
    if (keys) touch.current = false;
    setFind(""); setActive(keys ? Math.max(0, [CLUB_ALL, ...CLUB_MENU].findIndex(o => o.k === pick)) : -1); setOpen(true);
  };
  const close = refocus => { setOpen(false); if (refocus) { reveal(); btn.current?.focus({ preventScroll: true }); } };
  const take = k => { choose(k); close(true); };
  const onKeys = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = opts.length; setActive(act < 0 ? (e.key === "ArrowDown" ? current() : n - 1) : (act + (e.key === "ArrowDown" ? 1 : n - 1)) % n); }
    else if (e.key === "Enter" && act >= 0) { e.preventDefault(); take(opts[act].k); }
  };
  useLayoutEffect(() => {
    if (!open) return;
    // Under its button, shifted left where it would pass the page's right edge (keeping the 16px page margin); on short screens
    // the list shrinks (to 120px at least, and it still scrolls) so the popover ends above the page's bottom edge.
    // On opening, a short screen (a phone held sideways) first scrolls the page up, at most until the popover meets the sticky header
    // (focus is in the popover then; closing it brings By club back into view).
    const place = first => {
      const p = pop.current, l = list.current, root = demoRoot(), hdr = demoQuery("header.top"); if (!p || !l || !root) return;
      p.style.left = "0px"; l.style.maxHeight = "";
      let r = p.getBoundingClientRect(); const f = root.getBoundingClientRect(), bottom = f.top + root.clientHeight - 12;
      const shift = Math.min(Math.max(0, r.right - (f.left + root.clientWidth - 16)), Math.max(0, r.left - (f.left + 16)));
      if (shift) p.style.left = -shift + "px";
      const room = first && hdr ? r.top - hdr.getBoundingClientRect().bottom - 6 : 0;
      if (r.bottom > bottom && room > 0) { root.scrollBy({ top: Math.min(room, r.bottom - bottom) }); r = p.getBoundingClientRect(); }
      if (r.bottom > bottom) l.style.maxHeight = Math.max(120, l.clientHeight - (r.bottom - bottom)) + "px";
    };
    const onResize = () => place(false); // a resize (or a phone's toolbar moving) only refits the list: it never scrolls the page
    reveal(); place(true);
    (touch.current ? pop.current : input.current)?.focus({ preventScroll: true });
    const outside = e => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside, true); window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", onResize); };
  }, [open]);
  useEffect(() => { // keep the highlighted option (or, until there is one, the checked one) in view, scrolling only the list
    const o = act >= 0 ? opts[act] : opts.find(x => x.k === pick); const l = list.current, el = l && o && l.querySelector("#club-opt-" + o.k); if (!el) return;
    if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop - 6;
    else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight + 6;
  }, [open, act, find]);
  const option = (o, i) => (
    <div key={o.k} id={"club-opt-" + o.k} role="option" aria-selected={pick === o.k} className={"pop-item club-opt" + (pick === o.k ? " on" : "") + (i === act ? " active" : "")}
      onMouseMove={() => { if (i !== act) setActive(i); }} onClick={() => take(o.k)}>
      <Icon name="check" size={16} /><span>{o.label}</span>
    </div>
  );

  return (
    <div className="club-menu">
      <button ref={btn} type="button" className={"rail-menu" + (sel ? " on" : "")} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "club-pop" : undefined}
        aria-label={sel ? `By club: ${sel.label}` : undefined} title={sel ? sel.label : undefined}
        onPointerDown={e => { touch.current = e.pointerType === "touch"; }} onMouseDown={e => { if (open) e.preventDefault(); /* the search keeps focus until the click closes it */ }}
        onClick={e => open ? close(true) : openMenu(e.detail === 0)}
        onKeyDown={e => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); openMenu(true); } }}>
        <Icon name="users" size={15} /><span className="rail-label">{sel ? sel.label : "By club"}</span><Icon name="chev" size={14} style={open ? { transform: "rotate(180deg)" } : undefined} />
      </button>
      {open && (
        <div ref={pop} id="club-pop" className="club-pop" role="dialog" aria-label="By club" tabIndex={-1} onKeyDown={onKeys}
          onMouseDown={e => { if (e.target !== input.current) e.preventDefault(); /* clicks on the list, its heading or padding leave focus in the search */ }}
          onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
          <div className="club-find">
            <label className="search" htmlFor="club-q">
              <Icon name="search" size={16} />
              <input ref={input} id="club-q" type="text" role="combobox" aria-expanded="true" aria-controls="club-list" aria-autocomplete="list" aria-activedescendant={act >= 0 ? "club-opt-" + opts[act].k : undefined}
                aria-label="Search clubs" placeholder="Search clubs" autoComplete="off" spellCheck={false} value={find}
                onChange={e => { const v = e.target.value; setFind(v); setActive(!v.trim() ? -1 : clubsMatching(v).length ? 1 : 0); }} />
            </label>
          </div>
          <div ref={list} id="club-list" className="club-list" role="listbox" aria-label="By club" tabIndex={-1}>
            {option(CLUB_ALL, 0)}
            {clubs.length > 0 && (
              <div className="club-group" role="group" aria-label="Clubs">
                <div className="eyebrow" aria-hidden="true">Clubs</div>
                {clubs.map((c, i) => option(c, i + 1))}
              </div>
            )}
          </div>
          <p className="club-none" role="status">{!clubs.length ? `No clubs match “${find.trim()}”.` : ""}</p>{/* always there, so a screen reader hears it change */}
        </div>
      )}
    </div>
  );
}
/* Wanted's Post a request: the request form, or the goods one (with the Goods filter's category) while Goods is chosen. */
const wantedPost = d => d.cat === "goods" ? { market: "goods", cat: d.goodsCat !== "All" ? d.goodsCat : undefined } : {};
/* Each discovery view's intro, right above its category row and search: one action heading (the page's h1, DISC_HEADING), with no
   separate view name or description; the development preview adds its sample-data note with the demo date, which the normal route never
   shows. The preview's Wanted adds its own Post a request (.post-cta) wherever the header's has no words: at 860px and below it is an
   icon (.post-label hidden), and on phones it is hidden (.hide-xs). So one Post a request with words shows at any width. The shared
   market's header has Request with its word at every width (one-form Sell, §9l), so its Wanted has no second one (§9w, SELL5-M4: one
   Request posting action on mobile wherever the header's is visible). */
function DiscIntro({ side, disc, go, ask }) { // ask: a guest's sign-in prompt (GUEST)
  const post = side === "isos" && !LIVE;
  return (
    <section className={"wrap disc-intro" + (post ? " has-post" : "")} aria-labelledby="disc-h">
      <h1 id="disc-h">{DISC_HEADING[side]}</h1>
      {!LIVE && <p className="preview-note">Sample data · demo date {demoDay()}</p>}
      {post && <button type="button" className="btn btn-primary btn-sm post-cta" aria-haspopup={GUEST ? "dialog" : undefined} onClick={() => GUEST ? ask("post", { name: "post", ...wantedPost(disc) }) : go("post", wantedPost(disc))}><Icon name="hand" size={15} />Post a request</button>}
    </section>
  );
}
/* The discovery header, in the same place on Available and Wanted (under the view's intro, above the results). Category, search, club
   and goods category carry across the two views. The shared market's is BrowseHeader (§9s item 1): the search, the category row
   directly below it, then By club, the goods category and the sort. The development preview keeps its own (PreviewDiscoveryHeader):
   the category row, then a toolbar with the search, By club and Featured (where clubs apply), the goods category (Goods), Filters
   (each side's own, in a panel that names its side) and sort. */
const SORTS = { explore: [["newest", "Newest first"], ["price", "Price: low to high"]], isos: [["newest", "Newest first"], ["deadline", "Soonest deadline"], ["budget", "Highest budget"]] };
/* After Reset filters (the preview's panel's, or its empty state's), and after an empty state's way out in the shared market ("Show all
   categories", "Show all clubs": §9s item 2): focus moves to the control named (the preview's Filters button; the category row's All,
   or By club), and the page scrolls up just enough that it and the search it keeps are both out from under the sticky header. On
   phones the search sits a row above. */
function revealDiscTools(btn) {
  if (!btn) return; btn.focus({ preventScroll: true });
  const hdr = demoQuery("header.top"), search = demoQuery(".disc .search");
  const top = Math.min(btn.getBoundingClientRect().top, search ? search.getBoundingClientRect().top : Infinity);
  const covered = (hdr ? hdr.getBoundingClientRect().bottom : 0) + 8 - top;
  if (covered > 0) demoRoot()?.scrollBy({ top: -covered });
}
/* §9y (live, SELL7-O1): a club tapped on a card (CardClub) is applied in By club, as if picked there: the search, the category and the
   sort stay, the results narrow to that club on both boards, and the focus goes to By club, brought out from under the sticky header,
   so the narrowed results read from the top and the club is cleared where it was applied. */
const clubTap = setDisc => k => { setDisc({ club: k }); setTimeout(() => revealDiscTools(demoQuery(".disc .club-menu > button")), 0); };
function DiscoveryHeader(props) { return LIVE ? <BrowseHeader {...props} /> : <PreviewDiscoveryHeader {...props} />; }
/* §9s item 1 (the shared market): the search, then All · Events · Trains · Treks · Goods as a row of its own directly below it, on
   Available and Wanted alike, then By club (where clubs apply), the Goods category (within Goods) and the sort. No Filters button or
   panel, no category chip and no "Next 7 days / Next 30 days" control. The row is a radio group: All is chosen until another is; the
   chosen one is filled, outlined and bold, and says so to a screen reader (aria-checked); the arrow keys move the choice; and each
   option is a full-height touch target (CSS). The choice lives in App's disc, so it carries across the two boards with the search.
   §9v item 1 (SELL5-M4): each option is an icon from Handoff's set and its visible label (BOARD_ROW: grid All, ticket Events, train
   Trains, mountain Treks, bag Goods); the icon is decorative, so each option's name is its label. The chosen one is filled (not by its
   colour alone: a solid fill against outlined ones, and bold). On a phone the icon sits above the label, and the row may wrap on the
   narrowest screens rather than cut a label short (CSS). */
function BrowseHeader({ side, disc, setDisc }) {
  const searchRef = useRef(null);
  const d = disc, cat = hasOwn(DISC_LABEL, d.cat) ? d.cat : "all", clubs = CLUB_CATS.includes(cat);
  const sortKey = side === "explore" ? "sortA" : "sortW";
  // A guest sees no budgets, so Wanted has no budget sort.
  const sorts = GUEST && side === "isos" ? SORTS.isos.filter(([k]) => k !== "budget") : SORTS[side];
  const sortVal = GUEST && side === "isos" && d.sortW === "budget" ? "newest" : d[sortKey];
  return (
    <section className="wrap disc disc-live" aria-label="Search and filters">
      <label className={"search" + (d.q ? " has-text" : "")} htmlFor="q">
        <Icon name="search" size={16} />
        <input ref={searchRef} id="q" type="text" autoComplete="off" aria-label="Search events, items or requests" placeholder="Search events, items or requests" value={d.q} onChange={e => setDisc({ q: e.target.value })} />
        {d.q && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setDisc({ q: "" }); searchRef.current?.focus(); }}><Icon name="x" size={14} /></button>}
      </label>
      <div className="disc-row">
        <div className="cat-row" role="radiogroup" aria-label="Show" onKeyDown={onRadioKeys}>
          {BOARD_ROW.map(([k, label, icon]) => <button key={k} id={"f-type-" + k} type="button" role="radio" aria-checked={cat === k} tabIndex={cat === k ? 0 : -1} className={cat === k ? "on" : ""} onClick={() => setDisc({ cat: k })}><Icon name={icon} size={18} /><span className="cat-label">{label}</span></button>)}
        </div>
        <div className="disc-tools">
          {clubs && <ClubMenu pick={clubOf(d.club) ? d.club : "all"} choose={k => setDisc({ club: k === "all" ? null : k })} />}
          {cat === "goods" && <select id="f-goods-cat" aria-label="Goods category" value={d.goodsCat} onChange={e => setDisc({ goodsCat: e.target.value })}>
            {["All", ...Object.keys(GOODS_CATS)].map(c => <option key={c} value={c}>{c === "All" ? "All goods" : c}</option>)}
          </select>}
          <select id="f-sort" aria-label="Sort" value={sortVal} onChange={e => setDisc({ [sortKey]: e.target.value })}>
            {sorts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}
/* The development preview's discovery header (the preview keeps its own controls): the category row, then a toolbar with the search, By
   club and Featured (where clubs apply), the goods category (Goods), Filters (each side's own filters, in a panel that names its side:
   Available's availability and event date, Wanted's needed-by) and the sort. */
function PreviewDiscoveryHeader({ side, disc, setDisc }) {
  const [open, setOpen] = useState(false); // the Filters panel; closing it keeps the filters on
  const searchRef = useRef(null), filtersBtn = useRef(null);
  const d = disc, clubs = CLUB_CATS.includes(d.cat);
  const hasFilters = side === "isos" || (side === "explore" && d.cat !== "goods"); // goods have their category menu instead
  const nOn = !hasFilters ? 0 : side === "explore" ? (d.avail !== "all") + (d.when !== "any") : +(d.need !== "any"); // shown on Filters
  const sortKey = side === "explore" ? "sortA" : "sortW";
  const sorts = SORTS[side], sortVal = d[sortKey];
  // Reset filters then disables itself, so focus moves to the Filters button; it and the kept search come out from under the sticky header.
  const reset = () => { setDisc(side === "explore" ? { avail: "all", when: "any" } : { need: "any" }); revealDiscTools(filtersBtn.current); };
  const filtersEl = hasFilters && <button type="button" ref={filtersBtn} className={"btn btn-sm filter-btn" + (nOn ? " applied" : "")} aria-expanded={open} aria-controls="disc-filter-panel" onClick={() => setOpen(o => !o)}>
    <Icon name="sliders" size={15} />Filters{nOn ? ` (${nOn})` : ""}<Icon name="chev" size={14} style={open ? { transform: "rotate(180deg)" } : undefined} />
  </button>;
  const sortEl = sorts && <select id="f-sort" aria-label="Sort" value={sortVal} onChange={e => setDisc({ [sortKey]: e.target.value })}>
    {sorts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select>;
  return (
    <section className="wrap disc" aria-label="Search and filters">
      <div className="disc-cats" role="group" aria-label="Category">
        {DISC_CATS.map(([k, label, icon]) => <button key={k} type="button" className={d.cat === k ? "on" : ""} aria-pressed={d.cat === k} onClick={() => setDisc({ cat: k })}><Icon name={icon} size={15} />{label}</button>)}
      </div>
      <div className="disc-tools">
        <label className={"search" + (d.q ? " has-text" : "")} htmlFor="q">
          <Icon name="search" size={16} />
          <input ref={searchRef} id="q" type="text" autoComplete="off" aria-label="Search events, items or requests" placeholder="Search events, items or requests" value={d.q} onChange={e => setDisc({ q: e.target.value })} />
          {d.q && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setDisc({ q: "" }); searchRef.current?.focus(); }}><Icon name="x" size={14} /></button>}
        </label>
        {clubs && <ClubMenu pick={clubOf(d.club) ? d.club : "all"} choose={k => setDisc({ club: k === "all" ? null : k })} />}
        {side === "explore" && clubs && <button type="button" className={"btn btn-sm disc-toggle" + (d.featured ? " on" : "")} aria-pressed={d.featured} onClick={() => setDisc({ featured: !d.featured })}><Icon name="star" size={15} />Featured</button>}{/* the preview's curated picks */}
        {d.cat === "goods" && <select id="f-goods-cat" aria-label="Goods category" value={d.goodsCat} onChange={e => setDisc({ goodsCat: e.target.value })}>
          {["All", ...Object.keys(GOODS_CATS)].map(c => <option key={c} value={c}>{c === "All" ? "All goods" : c}</option>)}
        </select>}
        {filtersEl}{sortEl}
        {hasFilters && <div id="disc-filter-panel" className="filter-panel" role="group" aria-labelledby="disc-filter-h" hidden={!open}>
          <span id="disc-filter-h" className="disc-panel-h">{side === "explore" ? "Available filters" : "Wanted filters"}</span>
          {side === "explore" ? <>
            <div className="seg avail-seg" role="radiogroup" aria-label="Show events" onKeyDown={onRadioKeys}>
              {[["all", "All", null], ["available", "Available", "var(--good)"], ["waitlist", "Nothing listed", "var(--muted)"]].map(([k, lbl, c]) => (
                <button key={k} type="button" role="radio" aria-checked={d.avail === k} tabIndex={d.avail === k ? 0 : -1} className={d.avail === k ? "on" : ""} onClick={() => setDisc({ avail: k })}>{c && <i className="dot" style={{ background: c }} aria-hidden="true" />}{lbl}</button>))}
            </div>
            <div className="ev-filters"><select id="f-when" aria-label="Event date" value={d.when} onChange={e => setDisc({ when: e.target.value })}>
              <option value="any">Any date</option><option value="week">Next 7 days</option><option value="month">Next 30 days</option>
            </select></div>
          </> : <div className="ev-filters"><label className="disc-lbl" htmlFor="f-need">Needed by</label><select id="f-need" value={d.need} onChange={e => setDisc({ need: e.target.value })}>
              <option value="any">Any time</option><option value="week">Next 7 days</option><option value="month">Next 30 days</option>
            </select></div>}
          <button type="button" className="btn btn-sm btn-ghost" disabled={!nOn} onClick={reset}><Icon name="x" size={14} />Reset filters</button>
          {side === "explore" && d.cat === "all" && <span className="disc-panel-note">These filter events, trains and treks. Goods are hidden while one is on.</span>}
        </div>}
      </div>
    </section>
  );
}
/* Events with nothing to take, found by a search or a club (in the preview, also by its Nothing listed filter): a lookup that leads to
   the event page, never a buyable card. Each says why there's nothing to take (none listed, every listed one held for a buyer, not on
   sale yet, or closed) and the viewer's own step there, if any, with the two ways to wait for one: Get notified (opens the event page's
   private alert) and Post a request (public).
   Live (§9r): the rows are only the events whose requests are still open (availableNow: never one past its cutoff), each with its name
   and date, and each leads with "Request a ticket" (requestLabel), which opens Request a ticket (ISO) with that event chosen. */
function LookupRows({ s, rows, go, also, me }) { // also: below cards, so it says these matched too
  return (
    <section className="lookup" aria-labelledby="lookup-h">
      <div><h2 id="lookup-h">{also ? "Also matching, with nothing available" : "Nothing available right now"}</h2><p className="muted">{LIVE ? LOOKUP_HINT : "Get notified privately, post a request, or open one for its details."}</p></div>
      <ul className="lookup-list">{rows.map(({ ev, sum }) => { const wait = demandAllowed(ev) && honorAttend(me, ev).ok;
        // No stock here, so a public listing with a ticket on it is one held for a buyer, or (live) paused by its seller: say that (or let the
        // viewer's own step say it), never "none listed".
        const held = sum.a.ok && (publicListingsFor(s, ev).some(l => !isAddOn(ev, l) && listingNumbers(s, l).reserved > 0) || sum.pausedOthers > 0 || sum.ownPaused > 0);
        const why = sum.a.kind === "notonsale" ? "Not on sale yet" : !sum.a.ok ? sum.a.short : !held ? `No ${unitOf(ev)}s listed` : sum.state.key === "mine" ? null : sum.state.label;
        return (
        <li key={ev.id} className="lookup-row" data-ev={ev.id}>
          <Cover ev={ev} className="lookup-ic" size={18} />
          <div className="lookup-main"><b>{ev.title}</b><span className="muted">{dotJoin(fmtRange(ev), ev.club)}</span></div>
          <span className="chips">{why && <span className="chip">{why}</span>}{sum.state.key === "mine" && <span className="chip tone-warn">{sum.state.label}</span>}</span>
          <span className="lookup-act">
            {LIVE && wait && <button className="btn btn-sm btn-primary" onClick={() => go("post", { eventId: ev.id })} aria-label={`${requestLabel(ev)}: ${ev.title}`}><Icon name="hand" size={14} />{requestLabel(ev)}</button>}
            <button className="btn btn-sm" onClick={() => go("event", { id: ev.id })} aria-label={`View event: ${ev.title}`}>View event</button>
            {wait && <button className="btn btn-sm" onClick={() => go("event", { id: ev.id, notify: true })} aria-label={`Get notified: ${ev.title}`}><Icon name="bell" size={14} />Get notified</button>}
            {!LIVE && wait && <button className="btn btn-sm" onClick={() => go("post", { eventId: ev.id })} aria-label={`Post a request: ${ev.title}`}><Icon name="hand" size={14} />Post a request</button>}
          </span>
        </li>); })}</ul>
    </section>
  );
}
/* The preview's Available empty state invites a request for what the category holds: on All, every kind (tickets, trip spots and items); on a category,
   its own kind. */
const availEmptyHint = cat => cat === "goods" ? "Looking for something? Post a request and you'll get an in-app alert when a matching item is posted. It doesn't hold anything."
  : cat === "all" ? "Looking for a ticket, a trip spot or an item? Post a request so classmates who have one can find you. You'll get an alert when a match is listed."
  : `Looking for ${cat === "treks" ? "a trip spot" : "a ticket"}? Post a request so classmates who have one can find you. You'll get an alert when one is listed.`;
/* Available's empty state has its own Post a request, which starts the form from the search (and the goods category). In the shared
   market it shows at every width (§9s item 2: the empty state's one action); in the preview, like Wanted's intro button, only where the
   header's Post a request has no words (860px and below: CSS). Either way the header's button does the same thing while this empty
   state is on screen: the page registers its post in App's ref (emptyPost) here, and App's header reads it. post: the empty state's
   own, or null while there are results. */
function useEmptyPost(emptyPost, post) {
  useEffect(() => { if (!emptyPost) return; emptyPost.current = post; return () => { if (emptyPost.current === post) emptyPost.current = null; }; });
}
/* §9s item 2 (the shared market): an empty Available or Wanted, signed in or not, is short. One line (emptyTitle: "Nothing listed right
   now." / "No requests right now.", or what the search matched nothing of, with the category or club that narrowed it). On Available,
   one action, "Post a request" (post: the request form, starting from the search; a guest signs in first and the search rides along
   in this tab). Wanted has none of its own: Request is in the header. Where a category or a club narrowed the results, one way to
   clear it (discClear: it keeps the search; focus goes to the category row's All, or to By club). No "Sell a ticket" here (Sell leads
   the header), no explanation, and no "Add an event" on its own. The preview keeps its own empty states. */
function BrowseEmpty({ side, disc, setDisc, post }) {
  const q = disc.q.trim(), short = q.length > 28 ? q.slice(0, 27) + "…" : q;
  const way = discClear(disc);
  const clear = () => { setDisc(way.patch); revealDiscTools(demoQuery(way.focus === "club" ? ".disc .club-menu > button" : "#f-type-all")); };
  return (
    <div className="empty" data-empty={side} style={{ marginBottom: side === "isos" ? 40 : 28 }}>
      <b style={{ color: "var(--ink)", fontSize: 16 }}>{emptyTitle(side, disc)}</b>
      {(post || way) && <div className="actions empty-acts">
        {post && <button className="btn btn-primary empty-req" aria-haspopup={GUEST ? "dialog" : undefined} onClick={post}><Icon name="hand" size={16} />Post a request{q ? ` for "${short}"` : ""}</button>}
        {way && <button className="btn empty-clear" onClick={clear}>{way.label}</button>}
      </div>}
    </div>
  );
}
/* Available: one grid of event and goods cards with stock and price, then lookup rows for matching events with nothing listed. */
function Explore({ s, me, go, disc, setDisc, emptyPost }) { // emptyPost: see useEmptyPost
  const d = disc, q = d.q.trim(), goods = d.cat === "goods";
  // §9r (live): no availability filter, and rows only while requests are open. §9s item 1: no event-date filter either. minute: a cutoff
  // that passes while the page is open changes nothing in the view, so the feed is worked out again when the clock's minute turns (App
  // redraws right after a cutoff, and every 30 s).
  const minute = LIVE ? Math.floor(CLOCK / 60e3) : 0;
  const { cards, lookup, clubOn, featOn, evFilters } = useMemo(() => LIVE ? availableNow(s, me, d) : availableFor(s, me, d), [s, me, d, minute]);
  const club = clubOn ? clubOf(d.club) : null;
  // A club with no events on Handoff gets its own message, not "no matches". (A search can't find any either: it includes closed events.)
  const clubEmpty = !!club && exploreRows(s, me, { club: clubOrgs(d.club) }).length === 0 && exploreRows(s, me, { club: clubOrgs(d.club), q }).length === 0;
  // The preview's empty state (its own filters; the shared market's is BrowseEmpty): the Filters panel's availability and date filters
  // alone can hide every match, so Reset filters clears just those, as the panel's does, keeping the search, category, club and
  // Featured. "Clear search and filters" shows only when it would clear more than that.
  const narrowed = clubOn || featOn || evFilters || (goods && d.goodsCat !== "All");
  const clearAll = () => setDisc({ q: "", club: null, featured: false, avail: "all", when: "any", goodsCat: "All" }); // the category stays
  const resetFilters = () => { setDisc({ avail: "all", when: "any" }); revealDiscTools(demoQuery(".disc .filter-btn")); };
  const clearsMore = !!q || clubOn || featOn || (goods && d.goodsCat !== "All");
  const short = q.length > 28 ? q.slice(0, 27) + "…" : q;
  // Live (§9m item 3): a ticket search that matched nothing ("Post a request for "Oysters"") opens Request a ticket (ISO) itself, with
  // the search typed into its "What ticket are you looking for?" field: the event isn't on Handoff, so the form asks its date right
  // there and adds it together with the request on "Post request" (it replaced the "Add an event" detour of §9k). Goods, and a
  // request with no search text, open their form as before; an event that's known but has nothing listed has its own row (LookupRows).
  const post = () => go("post", goods ? { market: "goods", text: q, cat: d.goodsCat !== "All" ? d.goodsCat : undefined } : { text: q });
  const empty = !clubEmpty && cards.length === 0 && lookup.length === 0;
  useEmptyPost(emptyPost, empty ? post : null);
  const previewTitle = q ? `Nothing listed matches "${q}"${narrowed ? " with these filters" : ""}.` : `Nothing listed${d.cat !== "all" ? ` in ${DISC_LABEL[d.cat]}` : ""}${narrowed ? " with these filters" : ""} right now.`;
  return (
    <div className="wrap" style={{ paddingBottom: 36 }}>
      {/* The heading is in the intro above the controls (DiscIntro); Goods' pickup-and-pay rule is on each item page and the Sell an item form. */}
      <p className="sr" role="status">{clubEmpty ? "" : `${plural(cards.length, "result")}${lookup.length ? `, and ${plural(lookup.length, "event")} with nothing listed` : ""}`}</p>
      {clubEmpty ? (
        <div className="empty" style={{ marginBottom: 28 }}>
          <b style={{ color: "var(--ink)", fontSize: 16 }}>No {club.label} events on Handoff right now.</b>
          <span>When there are, their tickets will show here.</span>
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => setDisc({ club: null })}><Icon name="grid" size={16} />See all events</button>
          </div>
        </div>
      ) : empty ? (LIVE ? <BrowseEmpty side="explore" disc={d} setDisc={setDisc} post={post} /> : (
        <div className="empty" style={{ marginBottom: 28 }}>
          <b style={{ color: "var(--ink)", fontSize: 16 }}>{previewTitle}</b>
          <span>{availEmptyHint(d.cat)}</span>
          <div className={"actions" + (evFilters || clearsMore ? "" : " only-post")} style={{ justifyContent: "center" }}>
            <button className="btn btn-primary empty-post" onClick={post}><Icon name="hand" size={16} />Post a request{q ? ` for "${short}"` : ""}</button>
            {evFilters && <button className="btn" onClick={resetFilters}>Reset filters</button>}
            {clearsMore && <button className="btn" onClick={clearAll}>Clear search and filters</button>}
          </div>
        </div>
      )
      ) : <>
        {cards.length > 0 && <div className="grid">{cards.map(c => c.ev ? <EventCard key={c.key} ev={c.ev} sum={c.sum} onOpen={() => go("event", { id: c.ev.id })} onClub={clubTap(setDisc)} /> : <GoodsCard key={c.key} it={c.it} s={s} me={me} onOpen={() => go("item", { id: c.it.id })} />)}</div>}
        {lookup.length > 0 && <LookupRows s={s} rows={lookup} go={go} also={cards.length > 0} me={me} />}
      </>}
    </div>
  );
}

/* §9v item 1 (live, SELL5-M4): an event's card on Available, signed in or signed out, in the boards' one layout. The compact coloured
   header (BoardBand: its picture, chosen by look.js since §9x item 2, and how many are available; the owner's own card wears a small
   "Your listing" label there instead, §9x item 3), then the name, its date once with its club as plain text, a
   members-only event's restriction in words with a lock ("GCC members only", as buyers read it before reserving), and the price, large,
   with the face value only when it isn't that very price. No "Trip" tag: the mountain says it. Distinct seatings and departures are
   distinct cards, each with its own time.
   §9y (SELL7-O1): the club is no longer on the date line. It has its own quiet line under the date, with By club's people icon
   (CardClub: the event's own club, or the one its sellers named on their listings when it names none), and a tap on it applies it in
   By club (onClub). A train's carrier, which is no club, stays on its date line. */
function BoardEventCard({ ev, state, own = null, price, sub, onOpen, onClub = null }) { // own (§9x item 3): the viewer's own listing (cards.js ownCard): a small "Your listing" label where the pill is, and its status once, in sub
  const look = eventLook(ev), tag = membersTag(ev);
  return (
    <article className="ecard bcard" onClick={onOpen} data-ev={ev.id} data-kind={look.cat} data-own={own ? "" : undefined}>
      <BoardBand look={look}>{own ? <OwnTag /> : <StateBadge state={state} />}</BoardBand>
      <div className="ebody">
        <h3><button className="stretch" onClick={e => { e.stopPropagation(); onOpen(); }}>{ev.title}</button></h3>
        <span className="sr">{own ? own.label : state.label}.</span>
        <span className="meta">{dotJoin(fmtRange(ev), ev.cat === "Travel" ? ev.club : null)}</span>
        <CardClub names={cardClubs(ev)} onClub={onClub} />
        {tag && <span className="meta restrict-line" data-restriction="members"><Icon name="lock" size={13} />{tag}</span>}
        <span className="price-line"><span className="price">{price}</span>{sub && <span className="sub">{sub}</span>}</span>
      </div>
    </article>
  );
}
function EventCard({ ev, sum, onOpen, onClub = null }) {
  const pl = priceLines(ev, sum);
  if (LIVE) { // §9x items 1 and 3: the owner's own card leads with its price and says its status once; a free ticket reads "Free"
    const pp = priceParts(ev, sum), own = ownCard(sum), p = cardPrice(pp.main, { own: !!own });
    return <BoardEventCard ev={ev} state={sum.state} own={own} price={<>{p.pre}<b>{p.bold}</b>{p.post}</>} sub={own ? ownSub(own, pp.sub, p.bold) : faceCaption(pp.sub, p.bold)} onOpen={onOpen} onClub={onClub} />;
  }
  return (
    <article className="ecard" onClick={onOpen} data-ev={ev.id}>
      <Cover ev={ev} size={48}><StateBadge state={sum.state} />{ev.premium ? <span className="tag2">Trip</span> : ev.attend === "members" ? <span className="tag2">Members only</span> : null}</Cover>
      <div className="ebody">
        <h3><button className="stretch" onClick={e => { e.stopPropagation(); onOpen(); }}>{ev.title}</button></h3>
        <span className="sr">{sum.state.label}.</span>
        {ev.club && <span className="meta">{ev.club}</span>}
        <span className="meta">{fmtRange(ev)}</span>
        <span className="price-line"><span>{pl.main}</span><span className="sub">{pl.sub}</span></span>
      </div>
    </article>
  );
}

/* ============================================================
   EVENT DETAIL
   ============================================================ */
/* The back button of an event, item or request page (BackButton): _components/ui.jsx. */
/* A page's links to other event, item and request pages, which come back here: linkFrom, in _lib/routes.js. */
/* Live: a listing's link opened in a tab that doesn't hold its event (yet): the page waits for the fresh view before it says anything
   about it, "Event not found" included (App's hashchange handler: checking). The heading takes the focus, as on any page. */
function LinkChecking() {
  return <div className="wrap"><div className="page-head"><h1 className="sr">Opening a listing</h1><p className="muted" role="status">Checking this listing…</p></div></div>;
}
function EventPage({ s, me, id, go, dispatch, openShare, back = "explore", focusListing, listed = null, listedNote = null, checking = false, openAlert, resume, draft, nav, origin, flash, saveProfile }) { // saveProfile: "Your listing"'s first invitation (the seller's payment method, follow-on B5); back: the discovery view you came from (App's lastDisc); origin: see BackButton; draft: a reserve, offer or alert form kept when the session ended (keepDraft); checking: focusListing's link opened in this tab, fresh availability not in yet (App)
  const ev = Object.prototype.hasOwnProperty.call(EV, id) ? EV[id] : null;
  const goHere = linkFrom(go, { name: "event", id }, origin); // a request row's page comes back here, and this page keeps its own way back
  // Get notified's dialog (opened here, or straight away from a lookup row's Get notified), and the listing a link pointed at.
  const [alertOpen, setAlertOpen] = useState(() => !!openAlert);
  const [hl, setHl] = useState(null);
  // §9q item 1 (live): the viewer's own ordinary listings here show as "Your listing" (ownListings, below), and a link to one of them
  // points at that panel, where its Edit and Close are, rather than at its row. ownShown: the ones shown on this visit, so a
  // listing closed here stays on the page to say so.
  const ownShown = useRef(new Set());
  const showListing = lid => {
    const mine = LIVE ? demoQuery(`[data-own-listing] [data-manage="${CSS.escape(lid)}"]`) : null;
    if (mine) { mine.scrollIntoView({ block: "start", behavior: "smooth" }); const h = mine.querySelector("h3 [tabindex]"); if (h) h.focus({ preventScroll: true }); setHl(lid); return; }
    const el = demoElement("lst-" + lid); if (!el) return; el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); setHl(lid); };
  // resume ("take" or "offer"): back from sign-in, the listing's form opens again, once, as its button would (resumeRef, set below).
  const resumeRef = useRef(null), resumed = useRef(false);
  // While that listing's link is being checked (checking), nothing is pointed at, the last link's highlight included; once it's answered,
  // the listing is pointed at if it's open.
  useEffect(() => { if (!focusListing) return; if (checking) { setHl(null); return; } const t = setTimeout(() => { showListing(focusListing); if (resume && !resumed.current && resumeRef.current) { resumed.current = true; resumeRef.current(focusListing, resume); } }, 0); return () => clearTimeout(t); }, [focusListing, nav, checking]); // after the page's own heading focus
  const [reqFor, setReqFor] = useState(null);
  const [reqQty, setReqQty] = useState(1);
  const [reqMsg, setReqMsg] = useState("");
  const [reqOk, setReqOk] = useState(false);
  const [reqOffer, setReqOffer] = useState(""); // OBO listings: optional offer below the ask
  const [reqShare, setReqShare] = useState(true); // agree up front to share contact details if accepted
  const [reqMode, setReqMode] = useState("take"); // student tickets: "take" (I'll take it) or "offer"; trips and treks use the request form
  const [reqMember, setReqMember] = useState(false); // members-only ticket: the buyer confirms they're a member (Handoff doesn't check)
  useEffect(() => { setReqMember(false); }, [reqFor && reqFor.id]);
  const [offerTried, setOfferTried] = useState(false); // "Send offer" pressed with no offer typed: the field says what's missing
  useEffect(() => { setOfferTried(false); }, [reqFor && reqFor.id, reqMode]);
  // R6: an open reserve or offer form is kept if the session ends (keepDraft), and comes back with sign-in at this listing ("do": the form).
  useDraftSource("take", () => reqFor && reqFor.eventId === id && Object.prototype.hasOwnProperty.call(EV, id) && isQuick(EV[id])
    ? { place: { name: "event", id, listing: reqFor.id, do: reqMode }, data: { take: { listing: reqFor.id, mode: reqMode, qty: reqQty, offer: reqOffer, msg: reqMsg } } } : null);
  const alertDraft = useRef(draft && draft.alert && draft.alert.eventId === id ? draft.alert : null); // the Get notified dialog's, used once
  const reqHead = useRef(null);
  const lastFor = useRef(null); const justSent = useRef(false);
  // Opening moves focus to the form; closing returns it to your new reservation card after sending, or to that listing's row.
  useEffect(() => {
    if (reqFor) { lastFor.current = reqFor.id; if (reqHead.current) { reqHead.current.focus(); reqHead.current.scrollIntoView({ block: "start", behavior: "smooth" }); } }
    else if (lastFor.current) {
      const t = (justSent.current && demoElement("my-res-head")) || demoElement("rq-mine-" + lastFor.current) || demoElement("rq-open-" + lastFor.current) || demoElement("listed-head");
      lastFor.current = null; justSent.current = false; if (t) { t.focus(); if (t.id === "my-res-head") t.scrollIntoView({ block: "start", behavior: "smooth" }); }
    }
  }, [reqFor && reqFor.id]);
  useEffect(() => { if (ev && !(s.seen || {})[id]) dispatch({ type: "seen", id }, true); }, [id]);
  useEffect(() => { lastFor.current = null; setReqFor(null); }, [me]); // an open request form belongs to the account that opened it (no focus move on a switch)
  // Live: an open reserve form follows the newest view. Its listing's counts come from the server, so it takes the fresh copy, and it
  // closes when the listing has gone (withdrawn, or taken by someone else) after a refresh or a refusal.
  useEffect(() => {
    if (!LIVE || !reqFor) return;
    const cur = s.listings.find(l => l.id === reqFor.id);
    if (!cur || cur.withdrawnAt || listingNumbers(s, cur).available < 1) setReqFor(null);
    else if (cur !== reqFor) { setReqFor(cur); setReqQty(q => clampQty(q, Math.min(listingNumbers(s, cur).available, inviteFlowOn() ? buyerMax(s, me, cur) : Infinity))); } // §9n: within what this buyer may take now
  }, [s]);
  // The phone shortcut to the listings hides while they're on screen.
  const [listInView, setListInView] = useState(false);
  useEffect(() => {
    const el = demoElement("listed-spots"); if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setListInView(e.isIntersecting), { threshold: 0.1 }); io.observe(el);
    return () => io.disconnect();
  }, [id]);
  // Live: your reservation's card goes on its own when its time runs out. Focus inside it fell to the page itself; it moves to the line
  // that says the reservation ended (the card's data-res, the line's data-lapsed), unless focus is somewhere else (readiness RB-2).
  // The line comes with the view that stores the lapse, which can be a moment after the page's own clock took the card away.
  const cardWas = useRef(null);
  useEffect(() => {
    if (!LIVE) return;
    const card = demoQuery("[data-res]"), now = card ? card.getAttribute("data-res") : null, was = cardWas.current;
    if (now) { cardWas.current = now; return; } // a card is showing
    if (!was) return;
    if (!demoQuery(`[data-lapsed="${was}"]`)) { // gone for another reason (kept until another card shows), or its line isn't here yet
      // Follow-on B5: you ended it yourself (withdrew the request, declined the invitation, released the reservation), so no line comes:
      // focus goes back to that listing's button, or to the listings' heading.
      const own = s.requests.find(r => r.id === was && r.inviteFlow === true && r.status === "cancelled");
      if (own) { cardWas.current = null; const f = document.activeElement; if (!f || f === document.body) { const t = demoElement("rq-open-" + own.listingId) || demoElement("listed-head"); if (t) t.focus(); } }
      return;
    }
    cardWas.current = null;
    const a = document.activeElement;
    if (a && a !== document.body) return; // focus is somewhere else on purpose
    const h = demoElement("lapsed-head"); if (h) h.focus();
  });
  if (!ev) return checking ? <LinkChecking /> : <div className="wrap"><p style={{ padding: 40 }}>Event not found.{LIVE ? " It may have been removed from Handoff." : ""}</p></div>;
  // Live: an event its creator removed stays readable for the records that refer to it (yours, such as a ticket you added), with
  // nothing to do on it: the server refuses every action there (C-CONTRACT §2, D43).
  if (LIVE && ev.removedAt) return (
    <div className="wrap" data-ev={ev.id}>
      <BackButton back={back} origin={origin} go={go} s={s} me={me} />
      <div className="ev-top"><Cover ev={ev} className="thumb" size={34} /><div className="titleblock">{(ev.club || ev.cat) && <div className="tclub">{dotJoin(ev.club, catLabel(ev.cat))}</div>}<h1>{ev.title}</h1>
        <div className="ev-facts"><span className="tline"><Icon name="calendar" size={15} />{fmtRange(ev)}</span></div></div></div>
      <div className="callout warn" style={{ maxWidth: "70ch" }}>This event was removed from Handoff by the person who added it, so nothing can be listed, reserved or requested for it. Anything of yours that refers to it stays in My activity and Handoff settings.</div>
    </div>
  );
  const sum = eventSummary(s, ev, me); const a = sum.a; const pl = priceLines(ev, sum);
  const att = honorAttend(me, ev);
  const shareable = !LIVE; // §9v item 3: the shared market has no outward Share (its link is the page's ordinary URL); the preview keeps its sheet
  const heldForMe = l => s.requests.some(r => r.listingId === l.id && r.buyerId === me && isOpenReq(rState(r))); // the viewer's own reservation keeps its row on screen
  // Live: the seller's own paused listing keeps its row too, marked paused (it has nothing to take, so no one else sees a row for it).
  const listings = s.listings.filter(l => l.eventId === id && (a.ok || !l.withdrawnAt) && (listingNumbers(s, l).available > 0 || (!l.withdrawnAt && heldForMe(l)) || (LIVE && l.sellerId === me && listingPaused(s, l))));
  const quick = isQuick(ev);
  // Follow-on B5 (invite to pay), once the engine's switch is on: a ticket is asked for ("Request to buy"), never taken or offered on;
  // the seller invites, and only "Reserve and pay" on the invitation holds it. The preview keeps the old flow.
  const nfOn = LIVE && quick && inviteFlowOn();
  // §9q item 1 (live): the seller's own ordinary listings for this event, shown as "Your listing" above the listings: the one a link
  // points at (their own shared link), those still in play, and any closed on this visit. The row below still shows what classmates see.
  const mine = LIVE ? ownListings(s, me, ev, checking ? null : focusListing, ownShown.current) : [];
  mine.forEach(l => ownShown.current.add(l.id));
  // §9v item 3 (live): where Post ticket lands (listed: this visit's new listing). "Your listing" says "Ticket listed." and offers the one
  // prominent next action, Done (back to browsing), so while that's on screen the page's other buttons are its ordinary ones.
  const calm = LIVE && !!listed && mine.some(l => l.id === listed);
  // The viewer's own private alert and public request here (one of each at most), and the listings sellers shared with that request.
  const myAlert = myAlertFor(s, me, id), myIso = myRequestFor(s, me, id);
  const shared = myIso && liveRequest(s, myIso) ? sharesFor(s, myIso).map(x => ({ x, l: s.listings.find(l => l.id === x.listingId) })).filter(o => o.l) : [];
  const sharedIds = new Set(shared.map(o => o.l.id));
  const myHoldings = s.holdings.filter(h => h.userId === me && h.eventId === id && h.qty > 0);
  const myFree = myHoldings.reduce((t, h) => t + holdingFree(s, h), 0);
  const openReq = lid => s.requests.find(r => r.listingId === lid && r.buyerId === me && isOpenReq(rState(r)));
  // Follow-on B5: with several open at once (requests to buy hold nothing, so a buyer may ask on more than one listing), the card
  // shown here is the one that needs them: an unpaid reservation, then an invitation they can reserve, then the newest.
  const mineOpen = nfOn ? s.requests.filter(r => r.eventId === id && r.buyerId === me && r.flow === "quick" && isOpenReq(rState(r))) : [];
  const urgent = mineOpen.find(r => baseSt(rState(r)) === "accepted") || mineOpen.find(r => r.inviteFlow === true && baseSt(rState(r)) === "invited" && !r.blockedAt) || null;
  const myReq = urgent || s.requests.find(r => r.eventId === id && r.buyerId === me && (isOpenReq(rState(r)) || rState(r).st === "completed")); // newest first
  const myReqSt = myReq ? rState(myReq) : null;
  const inlineCard = !!myReq && myReq.flow === "quick" && isOpenReq(myReqSt); // your reservation or offer, with "Paid" and the pay handle, right on this page
  // Live: your newest exchange here, when it's a reservation whose time ran out unpaid in the last 30 minutes. The page says so, why, and
  // what to do if you paid, where its card was, rather than only drop the card (readiness RB-1); My activity keeps it after that.
  const newest = LIVE ? s.requests.find(r => r.eventId === id && r.buyerId === me && r.flow === "quick") : null; // newest first
  // Once the server has stored it (its reason is then the right one, a paused listing's included).
  // Follow-on B5: the same for the newest request to buy, invitation or reservation of the new flow that ended on its own or was ended by
  // the seller in the last 30 minutes (declined, withdrawn, closed, bought by someone else), unless you've asked for that listing again.
  const endedAt = r => { const h = r.history && r.history[r.history.length - 1]; return h && typeof h.at === "number" ? h.at : typeof r.holdUntil === "number" ? r.holdUntil : r.expiresAt; };
  const endedNew = LIVE ? s.requests.find(r => r.eventId === id && r.buyerId === me && r.inviteFlow === true && ["expired", "declined", "released"].includes(r.status) && CLOCK - endedAt(r) < 30 * 60e3 && !openReq(r.listingId)) : null;
  const lapsed = endedNew || (newest && newest.status === "expired" && typeof newest.holdUntil === "number" && CLOCK - newest.holdUntil < 30 * 60e3 ? newest : null);
  const lapsedWhat = !lapsed ? "" : lapsed.inviteFlow !== true || typeof lapsed.acceptedAt === "number" ? "reservation" : typeof lapsed.invitedAt === "number" ? "invitation" : "request";
  const lapsedSeller = lapsed ? PEOPLE[(s.listings.find(l => l.id === lapsed.listingId) || {}).sellerId] || null : null;
  // Live: a link to one listing (a shared listing, "#ev-…?listing=…") that isn't open to take now: the page says so, with its state when
  // this view has it (readiness RC-4), as the guest page says it in its own words. Not while that link is being checked (checking): the
  // view may predate the listing.
  const followed = LIVE && focusListing && !checking && !listings.some(l => l.id === focusListing) && !mine.some(l => l.id === focusListing) ? s.listings.find(l => l.id === focusListing && l.eventId === id) || "gone" : null;
  // One unpaid reservation per event at a time (the take rule), so nothing else counts as reservable until it's paid.
  const hasUnpaid = quick && s.requests.some(r => r.buyerId === me && r.eventId === id && r.flow === "quick" && baseSt(rState(r)) === "accepted");
  // Spots this viewer could still request: eligible, not already requested, and within the per-person limit.
  const canReqSpots = a.ok && (nfOn || !hasUnpaid) && personLoad(s, me, id) < personCap(ev) ? s.listings.filter(l => l.eventId === id && l.sellerId !== me && !l.withdrawnAt && !openReq(l.id) && !isAddOn(ev, l) && !tradingPaused(s, l.sellerId) && canAcquire(me, ev, l).ok).reduce((t, l) => t + listingNumbers(s, l).available, 0) : 0;
  // Public demand: live requests only (never private alerts or a simulated count), the viewer's own first, then the newest.
  const demand = demandFor(s, ev);
  const wanted = s.interests.filter(i => i.eventId === id && liveRequest(s, i)).sort((x, y) => (y.userId === me) - (x.userId === me) || y.createdAt - x.createdAt);
  const canWait = demandAllowed(ev) && att.ok; // Get notified and Post a request are open here
  // Nothing anyone else listed (and nothing of the viewer's own in play): the page says so once and offers the two ways to wait. With no
  // listing rows at all (emptyHere) that's the listings section's empty state; otherwise (not on sale yet, only add-ons left) the booking panel.
  const noStock = (a.ok || a.kind === "notonsale") && sum.otherSpots === 0 && !sum.ownMain && !myReq;
  const emptyHere = noStock && a.ok && !ev.nonTransferable && listings.length === 0;
  const memberTiers = hasMemberTiers(ev); // member / non-member pricing isn't shown: each listing shows only its original price
  const scrollTo = elId => { const el = demoElement(elId); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const toListings = () => { scrollTo("listed-spots"); const h = demoElement("listed-head"); if (h) h.focus({ preventScroll: true }); }; // focus moves with the scroll
  const unit = unitOf(ev);
  // Why nothing listed by others can be taken right now: paused by its seller (live, C-CONTRACT §8), or held for a buyer.
  const notNow = [sum.pausedOthers > 0 && `${plural(sum.pausedOthers, "listed " + unit)} ${sum.pausedOthers === 1 ? "is" : "are"} paused by the seller for now.`,
    sum.reservedOthers > 0 && `${plural(sum.reservedOthers, "listed " + unit)} ${sum.reservedOthers === 1 ? "is" : "are"} held for a buyer. If that falls through, it can open up again.`].filter(Boolean).join(" ");
  // Back from sign-in (resume): "I'll take it" or "Make offer" on that listing opens its form exactly when that button would be there and
  // enabled for this account (the same tests as the listing row below); otherwise the listing is only pointed at. Nothing is sent.
  resumeRef.current = (lid, mode) => {
    const l = listings.find(x => x.id === lid); if (!l || !quick) return;
    const b = blockFor(l);
    if (openReq(l.id) || l.sellerId === me || b.members || b.block || listingNumbers(s, l).available < 1 || (nfOn ? false : mode === "offer" ? !l.obo : hasUnpaid)) return;
    // The same form kept when the session ended (keepDraft) comes back as typed: how many (within what's left), the offer and the note.
    // Follow-on B5: either return value opens the one "Request to buy" form (an offer is a field in it).
    const k = draft && draft.take && draft.take.listing === lid && (nfOn || draft.take.mode === mode) ? draft.take : null;
    setReqFor(l); setReqMode(nfOn ? "take" : mode); setReqQty(k ? clampQty(Math.floor(Number(k.qty)) || 1, Math.min(listingNumbers(s, l).available, nfOn ? buyerMax(s, me, l) : Infinity)) : 1);
    setReqMsg(k && typeof k.msg === "string" ? k.msg : ""); setReqOffer(k && typeof k.offer === "string" ? k.offer : "");
  };

  function blockFor(l) {
    if (l.sellerId === me) return { block: "This is your listing." };
    if (!a.ok) return { block: a.why };
    if (quick && tradingPaused(s, l.sellerId)) return { block: `This seller can't trade right now after ${RULES.strikesToPause} upheld reports (demo rule).` };
    const el = canAcquire(me, ev, l);
    if (!el.ok) return { block: el.reason, members: true }; // shown as a plain "Members only" tag, not an explanation
    return { topUp: el.topUp || 0, needsMember: !!el.needsMember };
  }
  // "Looking for a ticket?": Get notified (private: only the viewer sees it or its max) and Post a request (public). With an alert, it
  // says what the alert is set to; Edit reopens the dialog. Rendered once: in the listings section's empty state (emptyHere), in the
  // booking panel when the event isn't on sale yet or only add-ons are left, otherwise in its own panel.
  const lookingFor = <>
    <h3 className="intent-h">Looking for {aUnit(unit)}?</h3>
    {myAlert && <p className="intent-alert"><Icon name="bell" size={15} /><span>Your private alert is {!demandAllowed(ev) ? "inactive" : myAlert.paused ? "paused" : "on"}: {alertText(myAlert, ev)}{canWait && <> · <button id="al-edit" type="button" className="linkish" aria-haspopup="dialog" onClick={() => setAlertOpen(true)}>Edit<span className="sr"> your private alert</span></button></>}</span></p>}
    {myIso && !isExpired(myIso) && liveRequest(s, myIso) && <p className="intent-alert"><Icon name="hand" size={15} /><span>Your public request is up: {plural(myIso.qty, unit)}{myIso.budget != null ? `, up to ${money(myIso.budget)}${ev.premium ? " reimbursement" : ""}` : ""}, needed {deadlineText(myIso)}.</span></p>}
    {myIso && isExpired(myIso) && <p className="reason" style={{ marginTop: 0 }}>Your request ended {fmtDate(myIso.expires)}. Edit it to set a new deadline.</p>}
    {!myAlert && !myIso && <p className="muted intent-p">Get a private alert when a matching listing appears, or post a public request classmates can answer.</p>}
    {canWait ? <div className="actions">
        {!myAlert && <button id="al-open" type="button" className={"btn" + (calm ? "" : " btn-primary")} aria-haspopup="dialog" onClick={() => setAlertOpen(true)}><Icon name="bell" size={16} />Get notified</button>}
        <button type="button" id={LIVE ? "ev-post" : undefined} className="btn" onClick={() => go("post", myIso ? { edit: myIso.id, eventId: id, from: "event" } : { eventId: id, from: "event" })}><Icon name="hand" size={16} />{myIso ? "Edit your request" : "Post a request"}</button>
        {/* Live (forms round 2, §9j): the buyer's own request closes right here, in one press (the same closeInterest as its card's); focus
            goes to Post a request, which takes Edit's place (its id is live only: the preview's page is as it was). */}
        {LIVE && myIso && <button type="button" id="ev-stop" className="btn" onClick={async () => { if (!(await dispatch({ type: "closeInterest", id: myIso.id, reason: "cancelled" })).error) focusSoon("ev-post"); }}><Icon name="x" size={16} />No longer looking</button>}
      </div>
      : <p className="reason" style={{ marginTop: 0 }}>{!att.ok ? att.reason : `Alerts and requests are off. ${a.why}`}</p>}
  </>;

  return (
    <div className="wrap" data-ev={ev.id}>
      <BackButton back={back} origin={origin} go={go} s={s} me={me} />
      <div className="ev-top">
        <Cover ev={ev} className="thumb" size={34} />
        <div className="titleblock">
          <div className="tclub">{dotJoin(ev.club, catLabel(ev.cat))}{ev.club || ev.cat ? " · " : ""}<span data-ev-source="">{LIVE ? sourceLine(ev.sourcesNote) /* §9x item 4: who added it, without "details not checked by Handoff" */ : ev.nonTransferable ? "not affiliated · demo page" : ev.cat === "Travel" ? "not affiliated · demo listing" : ev.nonWharton ? "not affiliated · illustrative event" : "illustrative listing"}</span></div>
          <h1>{ev.title}</h1>
          <div className="ev-facts">
            <span className="tline"><Icon name="calendar" size={15} />{fmtRange(ev)}</span>
            {ev.venue && <span className="tline"><Icon name="pin" size={15} /><span style={{ overflowWrap: "anywhere" }}>{ev.venue}</span></span>}{/* an event added without a venue has no venue line (readiness RC-11) */}
          </div>
          <div className="chips" style={{ marginTop: 4 }}>
            <StateBadge state={sum.state} />
            {transferTag(ev).label !== sum.state.label && <TransferChip ev={ev} />}
            {ev.attend === "members" && <span className="chip">Members only</span>}
          </div>
        </div>
        {shareable && <button className="btn btn-sm hide-sm" onClick={() => openShare({ type: "event", id })}><Icon name="share" size={14} />Share</button>}
      </div>

      <div className="ev-layout">
        <div>
          <p className="ev-body">{ev.blurb}</p>

          {ev.premium && (
            <section style={{ marginTop: 22 }}>
              <div className="section-head"><h2>What the trip costs</h2><span className="muted" style={{ fontSize: 13 }}>The deposit is not the trip price</span></div>
              <div className="panel" style={{ display: "grid", gap: 14 }}>
                <CostBreakdown ev={ev} />
                <div className="two-col">
                  <div><b style={{ fontSize: 13.5 }}>Included</b><ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13.5 }}>{ev.price.includes.map(x => <li key={x}>{x}</li>)}</ul></div>
                  <div><b style={{ fontSize: 13.5 }}>Not included</b><ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13.5 }}>{ev.price.excludes.map(x => <li key={x}>{x}</li>)}</ul></div>
                </div>
                <div className="callout"><b>Eligibility:</b> {ev.eligibility}</div>
              </div>
            </section>
          )}

          {/* §9q item 1 (live): "Your listing": the seller's own Manage listing panel (Edit, Close and every buyer's card), right here. */}
          {mine.length > 0 && <div className="own-listing" data-own-listing={mine.map(l => l.id).join(" ")}>
            {/* fresh (§9s item 5, §9v item 3): the listing Post ticket just made (listed: this visit only, never in the address) says "Ticket listed." here, with Done, which goes back to browsing. */}
            {/* listedNote (§9v item 2, SELL5-M3): what "List and invite" did, said where it lands ("Ticket listed. Invitation sent to Dan." since §9w, or why no invitation went out); this visit only, never in the address. */}
            {mine.map(l => <ListingPanel key={l.id} l={l} s={s} me={me} dispatch={dispatch} go={go} openShare={openShare} flash={flash} saveProfile={saveProfile} here fresh={!!listed && l.id === listed} freshNote={!!listed && l.id === listed ? listedNote : null} onDone={() => go(back)} />)}
          </div>}
          {followed && <div className="callout" style={{ marginTop: 18 }} data-followed={focusListing}>The listing you followed isn't open to take right now{followed === "gone" ? ": it may be held for a buyer, sold, paused or withdrawn." : ` (${listingState(s, followed).label}).`}</div>}
          {!ev.nonTransferable && a.kind !== "notonsale" && <section style={{ marginTop: 22 }} id="listed-spots">
            <div className="section-head"><h2 id="listed-head" tabIndex={-1}>Available {unit}s</h2>
              <span className="muted" style={{ fontSize: 13 }}>{ev.premium ? "Reimbursement can't exceed what the seller paid" : LIVE ? (faceText(ev) ? `Each ${unit} is capped at its face value` : "") : `Each ${unit} is capped at what its seller paid`}</span></div>{/* forms round 2 (live): the face value caps prices, where one is given */}
            {!ev.premium && ev.tiers.length > 1 && !memberTiers && <div className="chips" style={{ marginBottom: 12 }}>{ev.tiers.map(t => <span key={t.id} className="chip">{t.label}{faceOf(t) != null ? ` ${money(t.price)}` : ""}</span>)}<span className="chip tone-muted">{LIVE ? FACE_CHIP : "Illustrative prices · see Sources"}</span></div>}
            <div className="panel">
              {/* Nothing here to take: one message, with Get notified and Post a request right under it (on phones the rail comes later). */}
              {emptyHere && <div className="ev-empty">
                <p className="booking-none"><b>{notNow ? "None available right now" : `No ${unit}s listed right now`}</b>{notNow ? <span className="muted"> {notNow}</span> : null}</p>
                <div className="intent">{lookingFor}</div>
              </div>}
              {listings.length === 0 && !emptyHere && <div className="muted" style={{ padding: "4px 0" }}>
                {a.ok && sum.ownMain ? `Your listed ${sum.ownReserved === 1 ? `${unit} is` : `${unit}s are`} held for a buyer. Follow it under My activity.`
                  : a.ok ? `${notNow ? notNow + " " : "Nothing available right now."}` : a.why}
              </div>}
              {hasUnpaid && !nfOn && listings.some(l => l.sellerId !== me && !openReq(l.id)) && <div className="muted" style={{ fontSize: 13.5, paddingBottom: 6 }}>Pay for your reservation first: you can hold one unpaid {unit} per event at a time.</div>}
              {listings.map(l => {
                const b = blockFor(l); const mine = openReq(l.id); const nb = listingNumbers(s, l); const tier = l.tier ? tierOf(ev, l.tier) : null;
                // Live: paused by its seller. The seller's own row says how many it keeps off sale; a buyer whose offer or counter waits on it
                // reads that it's paused (their card below says what that means); a buyer with a reservation still reads it's held for them.
                const pz = LIVE && listingPaused(s, l) && !(mine && reserves(rState(mine))), lu = isAddOn(ev, l) ? "add-on" : unit;
                return (
                  <div className={"listing" + (hl === l.id ? " hl" : "")} key={l.id} id={"lst-" + l.id} tabIndex={-1} data-lid={l.id}>{/* a shared listing's "View listing" scrolls here */}
                    <Avatar id={l.sellerId} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <div className="who">{PEOPLE[l.sellerId].name}{l.sellerId === me && <span className="chip tone-accent" style={{ marginLeft: 8 }}>You</span>}</div>
                      <div className="note">{pz ? (l.sellerId === me ? `Paused${pausedUnits(s, l) ? ` · ${plural(pausedUnits(s, l), lu)} off sale` : ""}${nb.reserved ? ` · ${nb.reserved} held` : ""}` : `Paused by the seller${nb.reserved ? ` · ${nb.reserved} held` : ""}`)
                        : nb.available === 0 && mine && (mine.inviteFlow !== true || reserves(rState(mine))) ? `${UnitOf(ev)} held for you`
                        /* §9n (live): several tickets at one price read "2 tickets · $25 each"; one reads "1 ticket available", as before. */
                        : <>{LIVE && a.ok && listingQtyLine(nb.available, l.ask, lu) ? <span data-qty-line="">{listingQtyLine(nb.available, l.ask, lu)}</span> : `${plural(nb.available, lu)} ${a.ok ? "available" : "listed"}`}{nb.reserved ? ` · ${nb.reserved} held` : ""}</>}{tier && ev.tiers.length > 1 && (tier.addOn || !memberTiers) ? ` · ${tier.label}${tier.addOn ? "" : " " + unit}` : ""} · listed {ago(l.createdAt)}</div>
                      {sharedIds.has(l.id) && <div className="note"><span className="chip tone-good"><Icon name="check" size={13} />Shared with your request · not held for you</span></div>}
                      {/* §9m item 1 (live): a listing with no recorded transfer method shows no method chip: its seller promised none. */}
                      <div className="note">{!(ev.namesChecked || ev.methods || ev.premium || ev.organizerRequired) && (!LIVE || !isQuick(ev) || methodOf(l)) && <span className={"chip " + (l.viaOrganizer ? "tone-accent" : "tone-good")} style={{ marginRight: 6 }}>{isQuick(ev) ? (METHODS[l.method] || METHODS.file).label : l.viaOrganizer ? orgLabel(ev) : DIRECT_LABEL}</span>}{l.obo && <span className="chip tone-accent" style={{ marginRight: 6 }}>OBO · {l.minOffer ? `offers from ${money(l.minOffer)}` : "open to offers"}</span>}{!LIVE && quick && membersOnlyListing(ev, l) && ev.attend !== "members" && <span className="chip" data-members="" style={{ marginRight: 6 }}>Members only{l.memberClub ? `: ${l.memberClub}` : ""}</span>}{isAddOn(ev, l) && <span className="chip" style={{ marginRight: 6 }}>Add-on only, not a trek spot</span>}{!LIVE && l.restricted && <span className="chip tone-warn" style={{ marginRight: 6 }}><Icon name="alert" size={13} />Seller flagged a transfer restriction</span>}{strikesOf(s, l.sellerId) > 0 && <span className="chip tone-bad" style={{ marginLeft: 6 }}>{plural(strikesOf(s, l.sellerId), "upheld report")}</span>}</div>
                      {/* §9v items 4 and 5 (live): the club named on the listing (plain text, no warning) and its restrictions in plain words ("GCC
                          members only", "The organizer must change the name on the ticket", the seller's own words); none: nothing. What the
                          event's own head already says for every listing (members only by the event, names checked at its door) isn't repeated. */}
                      {LIVE && <ListingTerms ev={ev} l={l} own />}
                      {l.departsAt && <div className="note"><b style={{ color: "var(--ink)" }}>Train departs {fmtWhen(l.departsAt)}</b></div>}
                      {l.note && <div className="note">“{l.note}”</div>}
                      {ev.premium && <div className="note">Total commitment for the replacement: <b style={{ color: "var(--ink)" }}>{money(commitment(ev, l.ask, l.paid))}</b></div>}
                      {/* §9x item 4 (live): no "not verified" chip. Every listing is a ticket its seller says they have, so it was on every row. */}
                      {!LIVE && selfReported(s, l) && <div className="note"><span className="chip tone-warn">Seller says they have it · not verified</span></div>}
                      {!a.ok && <div className="note">{plural(nb.available, isAddOn(ev, l) ? "add-on" : unit)} listed, not requestable while {a.short.toLowerCase()}.</div>}
                      {b.block && !b.members && l.sellerId !== me && <div className="reason">{b.block}</div>}
                      {b.topUp > 0 && <div className="note">+ {money(b.topUp)} non-member top-up, paid to {ev.club}</div>}
                    </div>
                    <div className="l-act" style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                      <div className="ask">{LIVE && l.ask === 0 && !ev.premium ? "Free" : money(l.ask)}{ev.premium ? <small>reimbursement to seller</small> : LIVE ? (f => f != null ? <small>face value {money(f)}</small> : null)(faceOf(tierOf(ev, l.tier))) : <small>original price {money(l.paid)}</small>}</div>{/* live: never what the seller paid (forms round 2) */}
                      {mine ? <>
                          <span id={"rq-mine-" + l.id} tabIndex={-1} className="chip tone-accent">{myReqLabel(mine)}</span>
                          {/* A full-price "I'll take it" replaces the buyer's own open offer. */}
                          {quick && !nfOn && ["pending", "countered"].includes(baseSt(rState(mine))) && nb.available > 0 && <button id={"rq-open-" + l.id} className="btn btn-sm" disabled={!!b.block || hasUnpaid} onClick={() => { setReqFor(l); setReqMode("take"); setReqQty(Math.min(mine.qty, nb.available)); setReqMsg(""); setReqOffer(""); }}>I'll take it at {money(l.ask)}</button>}
                        </>
                        : l.sellerId === me ? null
                        : b.members ? <span className="chip">Members only</span>
                        /* Follow-on B5: one action, which asks the seller and holds nothing (an offer is a field in its form). */
                        : nfOn ? <button id={"rq-open-" + l.id} className={"btn btn-sm" + (calm ? "" : " btn-primary")} data-ask={l.id} disabled={!!b.block} onClick={() => { setReqFor(l); setReqMode("take"); setReqQty(1); setReqMsg(""); setReqOffer(""); }}>{askBtn(l.ask === 0, unit)}</button>
                        : quick ? <div className="actions" style={{ justifyContent: "flex-end" }}>
                            <button id={"rq-open-" + l.id} className="btn btn-primary btn-sm" disabled={!!b.block || hasUnpaid} onClick={() => { setReqFor(l); setReqMode("take"); setReqQty(1); setReqMsg(""); setReqOffer(""); }}>I'll take it</button>
                            {l.obo && <button className="btn btn-sm" disabled={!!b.block} onClick={() => { setReqFor(l); setReqMode("offer"); setReqQty(1); setReqMsg(""); setReqOffer(""); }}>Make offer</button>}</div>
                        : <button id={"rq-open-" + l.id} className="btn btn-primary btn-sm" disabled={!!b.block} onClick={() => { setReqFor(l); setReqQty(1); setReqMsg(""); setReqOk(false); setReqOffer(""); setReqShare(true); }}>{l.obo ? "Request or offer" : `Request this ${isAddOn(ev, l) ? "add-on" : unit}`}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            {reqFor && nfOn && (() => {
              // Follow-on B5 (invite to pay): "Request to buy" asks the seller to invite you. It holds nothing and shows no payment details:
              // how many, an optional offer where the seller takes them, an optional short note, and what happens next in one sentence.
              const b = blockFor(reqFor); const nb = listingNumbers(s, reqFor); const S = PEOPLE[reqFor.sellerId].first;
              const typed = !!reqFor.obo && reqOffer.trim() !== "";
              const off = typed ? checkOffer(reqOffer, reqFor.ask, true, reqFor.minOffer, true) : { price: reqFor.ask };
              const offAmt = typed ? parseMoney(reqOffer) : null; // at or above the asking price: this form's own words (there is no "I'll take it" here)
              const offErr = !typed ? null : offAmt && !offAmt.error && offAmt.value >= reqFor.ask ? `An offer has to be below ${money(reqFor.ask)}. To ask at that price, leave it blank.` : off.error || null;
              const each = offErr ? reqFor.ask : off.price;
              const evR = transferTag(ev).restricted;
              // §9n: the quantity is 1, and a choice shows only when this buyer may take more than one (buyerQtyChoices: what's available,
              // within the per-person limit, counting what they hold and have reserved). The total shows with it, before anything is sent.
              const qtys = buyerQtyChoices(s, me, reqFor), qty = clampQty(reqQty, qtys.length), tot = buyerTotal(qty, each, unit);
              const rule = transferWords(reqFor, "buyer"); // §9m item 1: a listing that promises no method says the neutral rule
              const sendAsk = async () => {
                if (offErr) { const el = demoElement("rq-offer"); if (el) el.focus(); return; }
                const r = await dispatch({ type: "requestToBuy", listingId: reqFor.id, qty, ...(typed ? { amount: reqOffer.trim() } : {}), msg: reqMsg.trim(), ...(b.needsMember ? { member: reqMember } : {}) });
                if (!r.error) { justSent.current = true; setReqFor(null); }
              };
              return (
                <div className="panel" style={{ marginTop: 14, borderColor: "var(--accent)" }} data-ask-form={reqFor.id}>
                  <div className="lhead"><h3 ref={reqHead} tabIndex={-1} style={{ fontSize: 18 }}>{askHead({ gratis: reqFor.ask === 0, unit, S })}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setReqFor(null)} aria-label="Close"><Icon name="x" size={16} /></button></div>
                  <div className="form-stack" style={{ marginTop: 12 }}>
                    {qtys.length > 0 && <div className="field" style={{ maxWidth: 160 }}><label htmlFor="rq-qty">{unit === "ticket" ? "Tickets" : "Spots"}</label>
                      <select id="rq-qty" value={qty} onChange={e => setReqQty(+e.target.value)}>{qtys.map(n => <option key={n} value={n}>{n}</option>)}</select></div>}
                    {reqFor.obo && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="rq-offer">Your offer per {unit} (optional)</label>
                      <div className="money"><span>$</span><input id="rq-offer" type="text" inputMode="decimal" value={reqOffer} onChange={e => setReqOffer(e.target.value)} placeholder={`Asking ${reqFor.ask}`} aria-invalid={!!offErr} aria-describedby="rq-offer-msg" /></div>
                      <span id="rq-offer-msg" className={offErr ? "err" : "help"}>{offErr || `${S} takes offers below ${money(reqFor.ask)}${reqFor.minOffer ? `, from ${money(reqFor.minOffer)}` : ""}. Leave blank to ask at ${money(reqFor.ask)}.`}</span></div>}
                    {/* §9x item 1 (SELL6-N1): a free ticket has no total to pay: "Free", and the words below ask for no payment. */}
                    {each === 0 ? <p style={{ margin: 0 }} data-total="" data-free=""><b>Free</b> · nothing to pay{qty > 1 ? ` for ${plural(qty, unit)}` : ""}</p>
                      : <p style={{ margin: 0 }} data-total=""><b>Total {tot.total}</b> to {S}{tot.detail ? ` (${tot.detail})` : ""}{typed && !offErr ? ` if ${S} agrees` : ""} · no Handoff fee</p>}
                    {/* §9v item 5 (live): the ticket's restrictions in plain words, before the buyer asks (a train's carrier rule stays its
                        own line); the members-only one is the confirmation below, which names the club. None: nothing. */}
                    {LIVE ? <>{evR && <div className="callout warn">{transferTag(ev).line}</div>}<ListingTerms ev={ev} l={reqFor} list skip={b.needsMember ? ["members"] : null} /></>
                      : (reqFor.restricted || evR) && <div className="callout warn">{evR ? transferTag(ev).line : `${S} flagged a transfer restriction: the ticket's terms may not allow resale or a name change. Check before you pay.`}</div>}
                    <div className="field"><label htmlFor="rq-msg">Note to {S} (optional)</label>
                      <textarea id="rq-msg" rows={2} value={reqMsg} maxLength={140} onChange={e => setReqMsg(e.target.value)} placeholder={askNoteExample(reqFor.ask === 0)} aria-describedby="rq-msg-help" />
                      <span id="rq-msg-help" className="help">Up to 140 characters. Only {S} sees it.</span></div>
                    <p className="callout" data-ask-words="" style={{ margin: 0 }}>{askWords({ gratis: each === 0, S })}</p>
                    {rule && <p className="help" data-transfer-rule="" style={{ margin: 0 }}>{rule}</p>}
                    {b.needsMember && <div className="callout warn" style={{ display: "grid", gap: 8 }}>
                      <span data-member-rule="">This ticket is only for {memberClubOf(ev, reqFor)} members. Non-members can be turned away at the door, even with a ticket.</span>
                      <label className="check" htmlFor="rq-member"><input id="rq-member" type="checkbox" checked={reqMember} onChange={e => setReqMember(e.target.checked)} /><span>I'm a {memberClubOf(ev, reqFor)} member</span></label></div>}
                    <div className="actions">
                      <button className="btn btn-primary" data-ask-send="" disabled={!!b.block || !!offErr || (b.needsMember && !reqMember)} onClick={sendAsk}>Send request</button>
                      <button className="btn" onClick={() => setReqFor(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              ); })()}
            {reqFor && isQuick(ev) && !nfOn && (() => {
              // "I'll take it" reserves at the asking price; "Make offer" waits for the seller's answer.
              const b = blockFor(reqFor); const nb = listingNumbers(s, reqFor); const S = PEOPLE[reqFor.sellerId].first;
              const offerMode = reqMode === "offer";
              const off = offerMode ? checkOffer(reqOffer, reqFor.ask, true, reqFor.minOffer, true) : { price: reqFor.ask };
              const offErr = !offerMode ? null : reqOffer.trim() === "" ? "Enter your offer." : off.error || (!off.isOffer ? "Enter an offer below the asking price." : null);
              const each = offerMode && !offErr ? off.price : reqFor.ask;
              const lasts = openLen(offerEnd(ev, CLOCK, reqFor), CLOCK); // the rule's hours, or the minutes left before a cutoff, as the server's toast says
              // The hold "I'll take it" gives: 15 minutes, or less when the train's departure, the event's start or the transfer cutoff comes
              // first, in the words the server's toast uses (holdEnd, holdLen; readiness RB-3).
              const holdFor = holdLen({ holdUntil: holdEnd(ev, CLOCK, reqFor, true) }, CLOCK);
              const myOffer = openReq(reqFor.id);
              const then = { file: LIVE ? `${S} sends you the PDF or QR code` : "Handoff sends you the ticket file", app: `${S} transfers it to your email in Ticketmaster or AXS`, name: `${S} asks ${ev.club} to put it in your name`, inperson: `${S} hands you the paper ticket` }[reqFor.method] || `${S} sends it`;
              // An offer that isn't typed yet is asked for beside the field (nothing is sent); one that's typed but wrong already says why there.
              const showOffErr = !!offErr && (reqOffer !== "" || offerTried);
              const sendTake = async () => {
                if (offerMode && offErr) { setOfferTried(true); setTimeout(() => { const el = demoElement("rq-offer"); if (el) el.focus(); }, 0); return; }
                const r = await dispatch({ type: offerMode ? "offer" : "take", listingId: reqFor.id, qty: reqQty, amount: reqOffer, msg: offerMode ? reqMsg.trim() : "", member: reqMember }); if (!r.error) { justSent.current = true; setReqFor(null); }
              };
              const evR = transferTag(ev).restricted;
              return (
                <div className="panel" style={{ marginTop: 14, borderColor: "var(--accent)" }}>
                  <div className="lhead"><h3 ref={reqHead} tabIndex={-1} style={{ fontSize: 18 }}>{offerMode ? `Make ${S} an offer` : `Reserve from ${S}`}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setReqFor(null)} aria-label="Close"><Icon name="x" size={16} /></button></div>
                  <div className="form-stack" style={{ marginTop: 12 }}>
                    {nb.available > 1 && <div className="field" style={{ maxWidth: 160 }}><label htmlFor="rq-qty">{unit === "ticket" ? "Tickets" : "Spots"}</label>
                      <select id="rq-qty" value={reqQty} onChange={e => setReqQty(+e.target.value)}>{Array.from({ length: nb.available }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></div>}
                    {offerMode && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="rq-offer">Your offer per {unit}</label>
                      <div className="money"><span>$</span><input id="rq-offer" type="text" inputMode="decimal" value={reqOffer} onChange={e => setReqOffer(e.target.value)} placeholder={`Asking ${reqFor.ask}`} aria-invalid={showOffErr} aria-describedby="rq-offer-msg" /></div>
                      <span id="rq-offer-msg" className={showOffErr ? "err" : "help"}>{showOffErr ? offErr : `Below ${money(reqFor.ask)}${reqFor.minOffer ? `, from ${money(reqFor.minOffer)}` : ""}.`}</span></div>}
                    {!offerMode && <p style={{ margin: 0 }}><b>Total {money(each * reqQty)}</b> to {S} · no Handoff fee</p>}
                    {/* Live (follow-on B1): which ways the seller takes, before committing; never where to pay (C-CONTRACT §2: payKinds). */}
                    {LIVE && <p className="pay-kinds" style={{ margin: 0 }}>{payBeforeText(reqFor, S)}</p>}
                    {(reqFor.restricted || evR) && <div className="callout warn">{evR ? transferTag(ev).line : `${S} flagged a transfer restriction: the ticket's terms may not allow resale or a name change. Check before you pay.`}</div>}
                    {offerMode && <div className="field"><label htmlFor="rq-msg">Note to {S} (optional)</label>
                      <textarea id="rq-msg" value={reqMsg} maxLength={280} onChange={e => setReqMsg(e.target.value)} placeholder="e.g. Can pay right away if you accept." /></div>}
                    {offerMode
                      ? <p className="help" style={{ margin: 0 }}>{S} has {lasts} to accept, counter once or decline. If {S} accepts, you have {OFFER_HOLD} to pay.</p>
                      : <ol className="next-steps" style={{ margin: 0 }}>
                          {/* Live: where to pay reaches a buyer only once it's reserved for them, in their exchange's own copy (C-CONTRACT §2). */}
                          {LIVE ? <li>It's yours for {holdFor}: pay {S}, then tap “I've sent payment”.</li>
                            : <li>It's yours for {holdFor}: pay <b className="num">{reqFor.payHandle}</b> on Venmo or PayPal, then tap “Paid”.</li>}
                          <li>{S} confirms, then {then}. Tap “Received”.{reqFor.method !== "file" ? ` ${S} sees your email.` : ""}</li>
                        </ol>}
                    {!offerMode && myOffer && <p className="help" style={{ marginTop: -6 }}>Reserving at the asking price replaces your open offer.</p>}
                    {b.needsMember && <div className="callout warn" style={{ display: "grid", gap: 8 }}>
                      <span data-member-rule="">This ticket is only for {memberClubOf(ev, reqFor)} members. Non-members can be turned away at the door, even with a ticket.</span>
                      <label className="check" htmlFor="rq-member"><input id="rq-member" type="checkbox" checked={reqMember} onChange={e => setReqMember(e.target.checked)} /><span>I'm a {memberClubOf(ev, reqFor)} member</span></label></div>}
                    <div className="actions">
                      <button className="btn btn-primary" disabled={!!b.block || (!!offErr && reqOffer.trim() !== "") || (b.needsMember && !reqMember)} onClick={sendTake}>{offerMode ? (offErr ? "Send offer" : `Send offer of ${money(each)}`) : `Reserve for ${holdFor}`}</button>
                      <button className="btn" onClick={() => setReqFor(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              ); })()}
            {inlineCard && !reqFor && <div style={{ marginTop: 18 }} data-res={myReq.id}>
              <div className="section-head"><h2 id="my-res-head" tabIndex={-1} style={{ fontSize: 19 }}>{["pending", "countered"].includes(baseSt(myReqSt)) ? "Your offer" : baseSt(myReqSt) === "proposed" ? "A reply to your request" : baseSt(myReqSt) === "requested" ? (myReq.price === 0 ? "Your request" : "Your request to buy") : baseSt(myReqSt) === "invited" ? "Your invitation" : "Your ticket"}</h2></div>
              <HandoffCard r={myReq} role="buyer" s={s} dispatch={dispatch} flash={flash} />
            </div>}
            {/* Follow-on B5: a request to buy or an invitation that ended held nothing, and says so; a reservation of the new flow that ended
                unpaid names the report that tells the seller you paid late (in its details), which never reserves anything again. */}
            {lapsed && !reqFor && <div className="callout warn" style={{ marginTop: 18 }} data-lapsed={lapsed.id} data-lapsed-what={lapsedWhat}>
              <h3 id="lapsed-head" tabIndex={-1} style={{ fontSize: 16 }}>Your {lapsedWhat} ended</h3>
              <p style={{ margin: "6px 0 0" }}>{lapsed.reason}{lapsed.inviteFlow === true && !/[.!?]$/.test(lapsed.reason || "") ? "." : ""}{lapsedWhat !== "reservation" ? " Nothing was held." : !lapsedSeller ? "" : lapsed.inviteFlow === true ? ` If you did pay ${lapsedSeller.first}, open the details and tap “${LATE_PAYMENT}” to tell them. Handoff can't see payments, and nothing is reserved again.` : ` If you did pay ${lapsedSeller.first}, contact them directly: Handoff can't see payments.`}</p>
              <div className="actions" style={{ marginTop: 10 }}><button className="btn btn-sm" onClick={() => go("activity", { open: "buy:" + lapsed.id })}>See details</button></div>
            </div>}
            {reqFor && !isQuick(ev) && (() => {
              const b = blockFor(reqFor); const nb = listingNumbers(s, reqFor);
              const off = checkOffer(reqOffer, reqFor.ask, reqFor.obo, reqFor.minOffer); const each = off.error ? reqFor.ask : off.price;
              const addOn = isAddOn(ev, reqFor); const ru = addOn ? "add-on" : unit; // an add-on is never called a spot
              return (
                <div className="panel" style={{ marginTop: 14, borderColor: "var(--accent)" }}>
                  <div className="lhead"><h3 ref={reqHead} tabIndex={-1} style={{ fontSize: 18 }}>Request from {PEOPLE[reqFor.sellerId].first}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setReqFor(null)} aria-label="Close request form"><Icon name="x" size={16} /></button></div>
                  <div className="form-stack" style={{ marginTop: 12 }}>
                    {!ev.premium && nb.available > 1 && (
                      <div className="field" style={{ maxWidth: 160 }}><label htmlFor="rq-qty">{addOn ? "Add-ons" : unit === "ticket" ? "Tickets" : "Spots"}</label>
                        <select id="rq-qty" value={reqQty} onChange={e => setReqQty(+e.target.value)}>
                          {Array.from({ length: nb.available }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                        </select></div>
                    )}
                    {reqFor.obo && !ev.premium && (
                      <div className="field" style={{ maxWidth: 300 }}><label htmlFor="rq-offer">Your offer per {ru} (optional)</label>
                        <div className="money"><span>$</span><input id="rq-offer" type="text" inputMode="decimal" value={reqOffer} onChange={e => setReqOffer(e.target.value)} placeholder={`Asking ${reqFor.ask}`} aria-invalid={!!off.error} aria-describedby="rq-offer-msg" /></div>
                        <span id="rq-offer-msg" className={off.error ? "err" : "help"}>{off.error || `${PEOPLE[reqFor.sellerId].first} is open to offers below ${money(reqFor.ask)}${reqFor.minOffer ? `, from ${money(reqFor.minOffer)}` : ""}. One round: they accept or decline. Leave blank to pay the asking price.`}</span></div>
                    )}
                    {(reqFor.restricted || transferTag(ev).restricted) && <div className="callout warn">{transferTag(ev).restricted ? transferTag(ev).line : `${PEOPLE[reqFor.sellerId].first} flagged a transfer restriction: the ticket's terms may not allow resale or a name change. Check before you pay.`}</div>}
                    {ev.premium ? <CostBreakdown ev={ev} reimb={reqFor.ask} paid={reqFor.paid} />
                      : <div className="breakdown-wrap"><table className="breakdown"><tbody>
                          <tr><td>To {PEOPLE[reqFor.sellerId].first} ({plural(reqQty, ru)} × {money(each)}{off.isOffer ? ", your offer" : ""})<span className="sub">Pay {PEOPLE[reqFor.sellerId].first} directly, once {reqFor.viaOrganizer ? (ev.organizerRequired ? "the operator confirms you" : "the club confirms you") : "you have it"}</span></td><td>{money(each * reqQty)}</td></tr>
                          {b.topUp > 0 && <tr><td>Top-up to the club<span className="sub">Non-member taking a member-priced ticket (illustrative rule)</span></td><td>{money(b.topUp * reqQty)}</td></tr>}
                          <tr className="total"><td>Your total{off.isOffer ? " if accepted" : ""}<span className="sub">No Handoff fee</span></td><td>{money((each + (b.topUp || 0)) * reqQty)}</td></tr>
                        </tbody></table></div>}
                    <div className="field"><label htmlFor="rq-msg">Note to {PEOPLE[reqFor.sellerId].first} (optional)</label>
                      <textarea id="rq-msg" value={reqMsg} maxLength={280} onChange={e => setReqMsg(e.target.value)} placeholder={reqFor.viaOrganizer ? "e.g. I can complete the organizer's steps this week." : "e.g. I can take it today."} /></div>
                    {ev.premium && <label className="check" htmlFor="rq-ok"><input id="rq-ok" type="checkbox" checked={reqOk} onChange={e => setReqOk(e.target.checked)} /><span>I meet the replacement requirements: {ev.eligibility}</span></label>}
                    <label className="check" htmlFor="rq-share"><input id="rq-share" type="checkbox" checked={reqShare} onChange={e => setReqShare(e.target.checked)} /><span>If {PEOPLE[reqFor.sellerId].first} accepts, share my contact details with them so they can send it to me.</span></label>
                    {(() => { const S = PEOPLE[reqFor.sellerId].first; return (
                      <div className="callout"><b>What happens next</b>
                        <ol className="next-steps">
                          <li>{S} has {RULES.sellerResponseHours} hours to accept. If they do, it's held for you.</li>
                          <li>{reqFor.viaOrganizer
                            ? ev.organizerRequired ? `${S} asks the trek operator to ${addOn ? "add the extension to your booking" : "register you as the traveler"} (simulated).`
                            : `${S} sends it through ${ev.club}, which ${ev.premium || ev.policy === "approval" || b.topUp ? "approves the swap and " : ""}updates the ${ev.premium ? "rooming list" : "name"} (simulated).`
                            : ev.paperTicket ? `${S} hands you the paper ticket in person.` : ev.cat === "Travel" ? `${S} forwards you the eTicket.` : `${S} sends it to you: a transfer in the ticketing app, or the QR code or PDF.`}</li>
                          <li>{reqFor.viaOrganizer
                            ? ev.premium ? `Once you're confirmed, you pay ${S} and the club directly. Illustrative: ${ev.payment}` : `Once ${ev.organizerRequired ? "the operator" : ev.club} confirms you, pay ${S} directly.`
                            : `Once you have it, pay ${S} directly (Venmo, Zelle or cash) and tap "I've got it".`}</li>
                        </ol>
                      </div>); })()}
                    <div className="actions">
                      <button className="btn btn-primary" disabled={(ev.premium && !reqOk) || !!off.error || !!b.block} onClick={async () => { const r = await dispatch({ type: "request", listingId: reqFor.id, qty: reqQty, msg: reqMsg.trim(), confirmEligible: reqOk, offer: off.isOffer ? reqOffer : undefined, shareContact: reqShare }); if (!r.error) setReqFor(null); }}>{off.isOffer ? `Send offer of ${money(off.price)}` : "Send request"}</button>
                      <button className="btn" onClick={() => setReqFor(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>}
        </div>

        <aside className="rail">
          <div className="panel booking" style={{ display: "grid", gap: 14 }}>
            <div><div style={{ fontSize: 15 }}>{pl.main}</div>{!(noStock && /^Nothing listed/.test(pl.sub)) && !(emptyHere && notNow) && <div className="muted" style={{ fontSize: 13 }}>{pl.sub}</div>}</div>
            {shared.length > 0 && <div className="callout good shared-you"><b>Shared with you</b>
              <ul>{shared.map(({ x, l }) => { const here = listings.some(y => y.id === l.id); return (
                <li key={x.id}>{PEOPLE[l.sellerId].name}'s listing, {money(l.ask)}{ev.premium ? " reimbursement" : ""} · {here ? <button type="button" className="linkish" onClick={() => showListing(l.id)}>View listing</button> : <span className="muted">{LIVE && listingPaused(s, l) ? "paused by the seller for now" : "no longer available"}</span>}</li>); })}</ul>
              <span className="muted">Not held for you: {nfOn ? "ask to buy it" : quick ? "take it or make an offer" : "send a request"} like anyone else.</span></div>}
            {myReq && !inlineCard && <div className={"callout" + (myReqSt.st === "completed" ? " good" : myReqSt.st === "waiting" ? " warn" : "")}>{myReq.flow !== "quick" ? "Your request" : myReq.isoReply ? "Reply to your request" : myReq.isOffer && ["pending", "countered"].includes(baseSt(myReqSt)) ? "Your offer" : "Your ticket"}: <b>{rStatus(myReq, myReqSt).label}</b>.{myReqSt.st === "waiting" ? " Another request is being processed. We'll let you know if it becomes available again." : ""} <button className="btn btn-sm" style={{ marginLeft: 4 }} onClick={() => go("activity", { open: "buy:" + myReq.id })}>See details</button></div>}
            {noStock && !emptyHere && <p className="booking-none"><b>{a.kind === "notonsale" ? "Not on sale yet" : notNow ? "None available right now" : `No ${unit}s listed right now`}</b>{a.kind === "notonsale" ? <span className="muted"> Nothing can be listed or bought until it is.</span> : null}</p>}
            {noStock && !emptyHere && <div className="intent">{lookingFor}</div>}
            {canReqSpots > 0 && <button className={"btn" + (calm ? "" : " btn-primary")} onClick={toListings}>See {plural(canReqSpots, unit)} you can {quick && !nfOn ? "reserve" : "request"}</button>}
            {/* Opens that listing's own card in My activity, where its Edit and Close are (live, C-CONTRACT §8); an ordinary ticket's are also on this page, under "Your listing" (§9q item 1). */}
            {sum.ownMain && <button className={"btn" + (calm ? "" : " btn-primary")} onClick={() => go("activity", { open: "listing:" + sum.ownMain.id })}><Icon name="ticket" size={16} />Manage your listing</button>}
           <PolicyDetails ev={ev} chip={false} />
          </div>

          {/* Looking for one: Get notified (a private alert, in a dialog) or Post a request (public), then what classmates have asked for. */}
          {!noStock && a.kind !== "official" && <div className="panel intent">{lookingFor}</div>}
          {a.kind !== "official" && a.kind !== "closed" && (
            <section className="panel demand" aria-labelledby="dm-h">
              <h3 id="dm-h" className="intent-h">Classmates looking</h3>
              <p className="demand-count">{demand.requests ? <><b>{plural(demand.requests, "request")} from {plural(demand.people, "classmate")}</b> · {plural(demand.units, unit)} wanted</> : "No public requests yet."}</p>
              {wanted.length > 0 && <ul className="mini-reqs">{wanted.slice(0, 3).map(i => { const mine = i.userId === me; return (
                <li key={i.id} className="mini-req" data-iso={i.id}>
                  <Avatar id={i.userId} size={26} />
                  <span className="mini-main"><b>{mine ? "You" : PEOPLE[i.userId].name}</b><span className="muted">{plural(i.qty, unit)}{i.budget != null ? ` · up to ${money(i.budget)}${ev.premium ? " reimbursement" : ""}` : LIVE ? "" : " · no budget given"} · {deadlineText(i)}</span></span>
                  {mine ? <button className="btn btn-sm" onClick={() => go("activity", { open: "iso:" + i.id })}>Your request</button>
                    : a.ok ? <button className="btn btn-sm" onClick={() => goHere("iso", { id: i.id })} aria-label={`I have this: ${PEOPLE[i.userId].name}'s request`}><Icon name="hand" size={14} />I have this</button> : null}
                </li>); })}</ul>}
              {demand.requests > 0 && <button type="button" className="linkish see-all" onClick={() => go("isos", { q: ev.title, cat: catOf(ev) })}>See all in Wanted<Icon name="arrow" size={14} /></button>}
            </section>
          )}

          {a.kind === "official" && (
            <div className="panel" style={{ display: "grid", gap: 8 }}>
              <h3 style={{ fontSize: 17 }}>{ev.officialTitle || "Use the official process"}</h3>
              <p style={{ fontSize: 13.5 }}>{ev.path}</p>
              {ev.officialUrl && <a className="btn btn-sm" href={ev.officialUrl} target="_blank" rel="noopener noreferrer"><Icon name="ext" size={14} />{ev.officialLinkLabel || "Official page"}</a>}
              <p className="reason" style={{ marginTop: 0 }}>Handoff doesn't list, request or match {unit}s here, and doesn't keep its own queue for this event.</p>
            </div>
          )}

          {a.kind !== "notonsale" && !(ev.premium && myHoldings.length === 0) && <div className="panel" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ fontSize: 17 }}>Can't go?</h3>
            {myHoldings.length > 0 && <p className="muted" style={{ fontSize: 13.5 }}>You have {plural(myHoldings.reduce((t, h) => t + h.qty, 0), unit)} here{myFree ? `, ${myFree} not listed yet` : ""}.</p>}
            {a.ok && !att.ok ? <p className="reason" style={{ marginTop: 0 }}>{att.reason}</p>
              : a.ok && ev.premium && myHoldings.length === 0 ? <p className="reason" style={{ marginTop: 0 }}>Trip spots come from the club's records and can't be self-reported in this demo. You don't hold a spot on this trip.</p>
              : a.ok && myHoldings.length > 0 && myFree === 0 ? <>
                  <p className="muted" style={{ fontSize: 13.5 }}>All your {unit}s here are listed or in a transfer.</p>
                  <button className="btn" onClick={() => go("activity", { tab: "listings" })}><Icon name="ticket" size={16} />Manage my listings</button>
                </>
              : a.ok && myHoldings.length === 0 && personLoad(s, me, id) >= personCap(ev) ? <p className="reason" style={{ marginTop: 0 }}>You don't hold {aUnit(unit)} here yet. Finish or cancel your reservation in My activity first.</p>
              : a.ok ? <>
                  <p className="muted" style={{ fontSize: 13.5 }}>{LIVE ? "List it here." : "List it for up to what you paid."} Classmates with a matching request or alert hear right away.</p>
                  <button className="btn" onClick={() => go("list", { eventId: id, from: "event", fromId: id })}><Icon name="ticket" size={16} />Sell my {unit}</button>
                  {ev.noShowRule && <p className="reason" style={{ marginTop: 0 }}>{ev.club}'s published rule counts an attempt to sell at least 24 hours ahead. Handoff keeps a timestamped record of your listing.</p>}
                </>
              : a.kind === "notonsale" ? <p className="reason" style={{ marginTop: 0 }}>Tickets aren't on sale yet, so there's nothing to list.</p>
              : <div className="callout warn"><b>{a.short}.</b> You can't list this {unit} on Handoff. {a.kind === "closed" ? (ev.cat === "Travel" ? "" : "Contact the organizer about cancellation.") : ev.nonTransferable ? `Cancel with ${ev.club} for a refund instead (see above).` : `Official process: ${ev.path}`}</div>}
          </div>}
          {shareable && <button className="btn btn-sm" onClick={() => openShare({ type: "event", id })}><Icon name="share" size={14} />Share this event</button>}
          {LIVE && <RemoveEvent ev={ev} s={s} dispatch={dispatch} go={go} />}
        </aside>
      </div>
      {canReqSpots > 0 && !reqFor && !listInView && !calm && <div className="sticky-cta"><button className="btn btn-primary" onClick={toListings}><Icon name="ticket" size={15} />See {plural(canReqSpots, unit)}</button></div>}
      {/* Saving or turning off swaps "Get notified" and "Edit", so focus then goes to whichever is there. */}
      {alertOpen && canWait && <AlertDialog ev={ev} s={s} me={me} dispatch={dispatch} flash={flash} draft={alertDraft.current} onClose={() => { alertDraft.current = null; setAlertOpen(false); }}
        onDone={() => setTimeout(() => { const el = demoElement("al-edit") || demoElement("al-open"); if (el) el.focus(); }, 0)} />}
    </div>
  );
}

/* Live: the person who added an event can remove it while nothing public refers to it (the view's canRemove: no listing, ticket request
   or public request was ever made for it). Private alerts and tickets people added never block it, which would show they exist:
   removing it turns those alerts off and tells their owners, and their tickets stay with them (C-CONTRACT §2, D43). */
function RemoveEvent({ ev, s, dispatch, go }) {
  const [ask, setAsk] = useState(false); const opener = useRef(null);
  const stored = (s.events || []).find(e => e.id === ev.id);
  if (!stored || !s.viewer || ev.addedBy !== s.viewer.id) return null;
  if (!stored.canRemove) return <p className="muted remove-note">You added this event. It stays now that listings or requests refer to it.</p>;
  return ask
    ? <Confirm text="Remove this event from Handoff? It's removed for everyone, and any private alerts for it are turned off." label="Yes, remove it"
        onYes={async () => { const r = await dispatch({ type: "removeEvent", eventId: ev.id }); setAsk(false); if (!r.error) go("explore"); }} onNo={() => setAsk(false)} returnTo={opener} />
    : <button ref={opener} type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk(true)}>Remove this event</button>;
}

/* Get notified's dialog (AlertDialog): _components/requests.jsx. */

/* ============================================================
   LIST MY SPOT
   ============================================================ */
/* Manual fallback when an event isn't on Handoff: a review item, not a new event. It sits inside the offer form,
   so it uses type="button" and handles Enter itself instead of submitting the offer. */
function SuggestEvent({ s, me, dispatch }) {
  const [d, setD] = useState({ title: "", club: "", when: "", flexible: false, sourceUrl: "" });
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const mine = (s.suggestions || []).filter(x => x.userId === me);
  const link = cleanUrl(d.sourceUrl);
  const submit = async () => { const r = await dispatch({ type: "suggestEvent", data: d }); if (!r.error) setD({ title: "", club: "", when: "", flexible: false, sourceUrl: "" }); };
  // One handler for every field here: Enter in any input (text, date, checkbox) suggests the event, never submits the offer.
  const onKey = e => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); if (d.title.trim() && (d.flexible || d.when) && !link.error) submit(); } };
  return (
    <details className="srcs" style={{ marginTop: 4 }}>
      <summary>Event not on Handoff?</summary>
      <div className="srcs-body form-stack" style={{ gap: 12 }} onKeyDown={onKey}>
        <span className="muted">Suggest it for review (simulated). Handoff adds each event once, so every listing and request for it shares one event page. If it's added, you can sell your ticket then.</span>
        <div className="field"><label htmlFor="sg-title">Event name</label>
          <input id="sg-title" type="text" value={d.title} maxLength={100} onChange={e => set("title", e.target.value)} placeholder="e.g. Spring formal" /></div>
        <div className="row2">
          <div className="field"><label htmlFor="sg-club">Organizer, if you know it</label>
            <input id="sg-club" type="text" value={d.club} maxLength={80} onChange={e => set("club", e.target.value)} /></div>
          <div className="field"><label htmlFor="sg-when">Date</label>
            <input id="sg-when" type="date" min={isoDate(CLOCK)} value={d.when} disabled={d.flexible} onChange={e => set("when", e.target.value)} />
            <label className="check" htmlFor="sg-flex"><input id="sg-flex" type="checkbox" checked={d.flexible} onChange={e => set("flexible", e.target.checked)} /><span>Not sure of the date</span></label></div>
        </div>
        <div className="field"><label htmlFor="sg-url">Official event link (optional)</label>
          <input id="sg-url" type="text" inputMode="url" value={d.sourceUrl} maxLength={300} onChange={e => set("sourceUrl", e.target.value)} placeholder="https://…" aria-invalid={!!link.error} aria-describedby="sg-url-msg" />
          <span id="sg-url-msg" className={link.error ? "err" : "help"}>{link.error || "Kept so a reviewer can check the source. A link doesn't show you're eligible, that transfers are allowed, or that tickets are available."}</span></div>
        <div><button type="button" className="btn btn-sm" disabled={!d.title.trim() || (!d.flexible && !d.when) || !!link.error} onClick={submit}>Suggest this event</button></div>
        {mine.length > 0 && <div style={{ display: "grid", gap: 6 }}>{mine.map(x => <span key={x.id}><b>{x.title}</b> <span className={"chip tone-" + REVIEW[x.review].tone}>{REVIEW[x.review].label}</span></span>)}</div>}
      </div>
    </details>
  );
}

/* Live: "Not listed? Add it" (C-DESIGN §7.3), the request form's way to add an event; since the one-form Sell (§9l) Sell a ticket adds a
   new event or train with its listing instead (ListPage), and opens this form only for a trek. Any signed-in classmate can add an event, a train or a trek that isn't on Handoff yet (at
   most 5 a day); it shows as added by them, and Handoff doesn't check its details. Events already on Handoff are suggested as the name is
   typed (suggestEvents, §9j item 2: up to three upcoming ones, the same name first, refined by the date), each with "Use this one", which
   hands the event back to the form that opened this one, as typed. The server checks every field and says what to fix. A dialog,
   in a portal so its form never sits inside the Sell or request form that opened it; once saved, that form continues with the new
   event chosen (onPick). */
const EF_KINDS = [["event", "Event", "ticket"], ["train", "Train", "train"], ["trek", "Trek", "plane"]];
const EF_PER_PERSON = { event: 4, train: 2, trek: 2 }; // the server's defaults
/* Values kept for a form (keepDraft) as its own: only the keys the form has, each of the same type as the form's default. */
const pickLike = (base, src) => { const o = { ...base }; if (src && typeof src === "object") for (const k of Object.keys(base)) if (typeof src[k] === typeof base[k]) o[k] = src[k]; return o; };
/* Forms round 2 (USER-INSTRUCTIONS §9i; was the simplification batch's layout). What the form needs shows at once: what it is, its name,
   who runs it where that's needed, and when: an ordinary event's date alone (it ends at 11:59 PM that day), a train's departure date and
   time (its listings close when it leaves), a trek's start. A trek also names its ticket types with their face values, as before. A train
   is one name (operator and route together) and its departure: no operator, validity window or ticket type, always an eTicket. Everything
   optional sits in one collapsed "Optional details" (it was "Add details"): an event's face value (one implicit ticket type; given, no
   ticket can be listed above it), category, venue, tickets per person, who can attend, transfer deadline, names checked, link and notes;
   a train's face value, stations, tickets per person, link and notes; a trek's end, venue, tickets per person, who can attend, deadline,
   link and notes. It opens by itself for a kept draft with something in it, and when a try to add finds a problem there. The organizer is
   optional for an ordinary event unless members-only or names checked needs one; a category left out stays unspecified (never guessed). */
const EF_MORE = { // the fields in "Optional details", by kind, in the form's order
  event: ["ef-tp-0", "ef-cat", "ef-venue", "ef-pp", "ef-attend", "ef-deadline", "ef-names", "ef-url", "ef-notes"],
  train: ["ef-tp-0", "ef-venue", "ef-pp", "ef-url", "ef-notes"],
  trek: ["ef-end", "ef-venue", "ef-pp", "ef-attend", "ef-deadline", "ef-url", "ef-notes"],
};
const efMoreUsed = (d, kind) => !!(d.venue || d.officialUrl || d.notes || (d.perPerson && d.perPerson !== String(EF_PER_PERSON[kind]))
  || (kind !== "trek" && d.face) || (kind === "event" && (d.cat || d.namesChecked)) || (kind !== "train" && (d.deadline || d.attend === "members")) || (kind === "trek" && d.end));
const EF_DATE = /^\d{4}-\d{2}-\d{2}$/;
/* A kept draft's values (keepDraft), as this form has them: one kept from the older form had an event's date and time in start, so its date
   is kept as the event's date; fields the form no longer has (a validity window, a ticket type) are left out. */
function efDraftValues(initialTitle, draft) {
  const d = pickLike({ title: initialTitle, club: "", cat: "", date: "", start: "", end: "", venue: "", attend: "all", perPerson: "", deadline: "", namesChecked: false, face: "", officialUrl: "", notes: "" }, draft && draft.d);
  const old = draft && draft.d && typeof draft.d.start === "string" ? draft.d.start.slice(0, 10) : "";
  if ((!draft || draft.kind === "event" || !draft.kind) && !d.date && EF_DATE.test(old)) d.date = old;
  return d;
}
function EventForm({ dispatch, flash, onClose, onPick, initialTitle = "", draft, place, kinds = null, toastNote = "" }) { // draft: as it was typed when a session ended (keepDraft); place: where it comes back to on its own (Available's empty state); kinds: the kinds it offers (one-form Sell: a trek only, since an event or a train is added with its ticket in Sell a ticket itself); toastNote: added to what it says once the event is added (Available's own Add an event: no ticket is listed yet)
  const KINDS = kinds ? EF_KINDS.filter(([k]) => kinds.includes(k)) : EF_KINDS;
  const [kind, setKind] = useState(() => draft && KINDS.some(([k]) => k === draft.kind) ? draft.kind : KINDS[0][0]);
  const [d, setD] = useState(() => efDraftValues(initialTitle, draft));
  const [tiers, setTiers] = useState(() => draft && Array.isArray(draft.tiers) && draft.tiers.length ? draft.tiers.slice(0, 3).map(t => pickLike({ label: "", price: "" }, t)) : [{ label: "", price: "" }]); // a trek's ticket types
  const [moreOpen, setMoreOpen] = useState(() => !!(draft && (draft.more === true || efMoreUsed(d, kind)))); // "Optional details": open for a kept draft that uses it
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false); // after a first "Add", a missing answer shows beside its field too
  useDraftSource("event", () => ({ place: place || null, data: { addEvent: { kind, d, tiers, more: moreOpen } } }));
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const setTier = (k, f, v) => setTiers(ts => ts.map((t, j) => j === k ? { ...t, [f]: v } : t));
  const dref = useRef(null), errRef = useRef(null); useDialog(dref, onClose);
  const train = kind === "train", trek = kind === "trek", event = kind === "event", noun = train ? "train" : trek ? "trek" : "event";
  const soonest = nyLocal(CLOCK + 30 * 60e3); // a train or trek at least 30 minutes away (the server's rule)
  // Forms round 2 (§9j item 2): the date fields start empty (nothing is chosen for you, today included) and take any day from now to 18
  // months on (the server's rule), so their pickers open on this year and reach the next ones; the range also keeps a typed year to four digits.
  const latest = CLOCK + 548 * DAY;
  const cats = Object.keys(CATS).filter(c => c !== "Travel" && c !== "Treks & trips");
  const when = event ? d.date : d.start; // an event's date alone means 11:59 PM that day (atMs)
  const startMs = when ? atMs(when) : NaN;
  // Forms round 2 (§9j item 2): as soon as the name is recognizable, up to three upcoming events already on Handoff (suggestEvents: the
  // same name first; the date, once entered, refines the order), each with "Use this one", so classmates post to the same event. Every
  // event is its own row with its date and time: separate seatings and departures stay separately selectable, and adding another stays
  // possible (a suggestion never stops "Add").
  const dupes = suggestEvents(d.title, when, { kind });
  // R6: what would stop the server (createEvent's rules, in its words), beside each field, before anything is sent: a wrong answer at
  // once, a missing one once "Add" was tried. The server still checks everything; anything it refuses shows above the buttons.
  const one = v => String(v).replace(/\s+/g, " ").trim(), chars = v => Array.from(one(v)).length, worded = v => /[\p{L}\p{N}]/u.test(v);
  const endMs = d.end ? atMs(d.end) : NaN, dlMs = d.deadline ? atMs(d.deadline) : NaN;
  const clubOk = chars(d.club) >= 2 && chars(d.club) <= 80 && worded(d.club);
  const clubNeed = trek || (event && (d.attend === "members" || d.namesChecked)); // an ordinary event may leave it out, unless a rule needs it; a train has none
  const issues = []; // [field id, missing, wrong], in the form's order
  issues.push(["ef-name", chars(d.title) >= 3 && chars(d.title) <= 120 && worded(d.title) ? null : train ? "Name the train, like “Amtrak Northeast Regional: Philadelphia → New York” (3 to 120 characters)." : `Give the ${noun} a name (3 to 120 characters).`, null]);
  if (trek) issues.push(["ef-club", clubOk ? null : "Add who runs the trek: the organizer or travel operator (2 to 80 characters).", null]);
  if (event) issues.push(["ef-club", one(d.club) || !clubNeed ? null : d.attend === "members" ? "Add the club or organizer: a members-only event is for their members." : "Add the club or organizer: with names checked at the door, tickets move by a name change with them.",
    one(d.club) && !clubOk ? "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank." : null]);
  if (event) issues.push(["ef-start", d.date ? null : "Enter the date.",
    !d.date ? null : !EF_DATE.test(d.date) || !Number.isFinite(startMs) ? "Enter a date." : startMs <= CLOCK ? "Choose today or a later date." : startMs > CLOCK + 548 * DAY ? "The date has to be within the next 18 months." : null]);
  else issues.push(["ef-start", d.start ? null : train ? "Enter the departure date and time." : "Enter the start date and time.",
    !d.start ? null : !Number.isFinite(startMs) ? "Enter a date and time." : startMs > CLOCK + 548 * DAY ? (train ? "The departure has to be within the next 18 months." : "The start has to be within the next 18 months.")
      : startMs < CLOCK + 30 * 60e3 ? (train ? "The departure has to be at least 30 minutes from now." : "The start has to be at least 30 minutes from now.") : null]);
  if (trek) tiers.forEach((t, k) => {
    issues.push(["ef-tl-" + k, one(t.label) && chars(t.label) <= 40 ? null : "Name this ticket type (up to 40 characters).", null]);
    const pm = t.price.trim() === "" ? null : parseMoney(t.price);
    issues.push(["ef-tp-" + k, pm ? null : "Enter its face value.", pm && pm.error ? pm.error : pm && pm.value > 5000 ? "Face values can be at most $5,000." : null]);
  });
  // In "Optional details": only a wrong answer can stop it, and then it opens.
  if (!trek) { const pm = d.face.trim() === "" ? null : parseMoney(d.face); issues.push(["ef-tp-0", null, pm && pm.error ? pm.error : pm && pm.value > 5000 ? "Face values can be at most $5,000." : null]); }
  if (trek) issues.push(["ef-end", null, !d.end ? null : !Number.isFinite(endMs) ? "Enter a date and time, or leave it blank." : Number.isFinite(startMs) && endMs < startMs ? "The end can't be before the start." : Number.isFinite(startMs) && endMs - startMs > 14 * DAY ? "The end has to be within 14 days of the start." : null]);
  if (!train) issues.push(["ef-deadline", null, !d.deadline ? null : !Number.isFinite(dlMs) ? "Enter a date and time, or leave it blank." : dlMs <= CLOCK ? "The transfer deadline has to be in the future."
    : Number.isFinite(startMs) && dlMs > startMs ? (event ? "The transfer deadline can't be after the event's date." : "The transfer deadline can't be after the start.") : null]);
  issues.push(["ef-url", null, cleanUrl(d.officialUrl).error || null]);
  const fm = Object.fromEntries(issues.map(([id, missing, wrong]) => [id, wrong || (tried ? missing : null)])); // what each field says now
  const bad = issues.find(([, missing, wrong]) => missing || wrong);
  const msgFor = (id, help, helpId) => fm[id] ? <span id={id + "-msg"} className="err">{fm[id]}</span> : help ? <span id={helpId} className="help">{help}</span> : null;
  const describe = (id, helpId) => fm[id] ? id + "-msg" : helpId;
  const save = async e => {
    e.preventDefault(); e.stopPropagation(); // a portal's submit still bubbles to the form that opened it
    if (saving) return;
    if (bad) { // nothing is sent: every problem shows beside its field, and focus goes to the first ("Optional details" opened if it's in there)
      setTried(true); const fid = bad[0];
      if (EF_MORE[kind].includes(fid)) setMoreOpen(true);
      setTimeout(() => { const el = demoElement(fid); if (!el) return; el.focus(); el.scrollIntoView({ block: "center" }); }, 0);
      return;
    }
    const opt = { venue: d.venue.trim() || null, perPerson: d.perPerson ? Number(d.perPerson) : null, officialUrl: d.officialUrl.trim() || null, notes: d.notes.trim() || null };
    // Forms round 2 (protocol 4): an event by its date, with no ticket types and its face value if given; a train by its name and departure;
    // a trek as before, with its named ticket types.
    const a = event ? { type: "createEvent", kind, title: d.title, club: d.club, cat: d.cat || null, start: d.date, deadline: d.deadline || null, attend: d.attend, face: d.face.trim() || null, namesChecked: d.namesChecked, ...opt }
      : train ? { type: "createEvent", kind, title: d.title, start: d.start, face: d.face.trim() || null, ...opt }
      : { type: "createEvent", kind, title: d.title, club: d.club, start: d.start, end: d.end || null, deadline: d.deadline || null, attend: d.attend, tiers: tiers.map(t => ({ label: t.label, price: t.price })), ...opt };
    setSaving(true); setErr("");
    const r = await dispatch(a, true);
    setSaving(false);
    if (r.error) { setErr(r.error); setTimeout(() => { if (errRef.current) errRef.current.focus(); }, 0); return; }
    if (r.toast) flash(toastNote ? `${r.toast} ${toastNote}` : r.toast);
    if (r.result) onPick(r.result.id); else onClose();
  };
  const seg = (lbl, value, opts, pick, desc) => <div className="seg" role="radiogroup" aria-labelledby={lbl} aria-describedby={desc} onKeyDown={onRadioKeys}>{opts.map(([k, text, icon], idx) => <button key={k} type="button" role="radio" aria-checked={value === k} tabIndex={rov(value === k, idx, opts.some(o => o[0] === value))} className={value === k ? "on" : ""} onClick={() => pick(k)}>{icon && <Icon name={icon} size={15} />}{text}</button>)}</div>;
  const root = demoLayer(); // live and signed in, the box App's content is in, so the dialog leaves the page with it while concealed (Keep)
  const dialog = (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal ev-form" ref={dref} role="dialog" aria-modal="true" aria-labelledby="ef-title" aria-describedby="ef-desc">
        <div className="lhead" style={{ alignItems: "center" }}><h2 id="ef-title">Add {noun === "event" ? "an event" : `a ${noun}`}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        <p id="ef-desc" className="muted ef-desc">Add it once, so every listing and request for it shares one page. It shows as added by you. Times are Philadelphia (Eastern) time.</p>{/* §9x item 4: no routine "Handoff doesn't check its details" */}
        <form className="form-stack" style={{ marginTop: 14, gap: 14 }} onSubmit={save} noValidate>
          {KINDS.length > 1 && <div className="field"><span className="label" id="ef-kind">What are you adding?</span>{seg("ef-kind", kind, KINDS, setKind)}</div>}
          <div className="field"><label htmlFor="ef-name">Name</label>
            <input id="ef-name" type="text" value={d.title} maxLength={120} onChange={e => set("title", e.target.value)} placeholder={train ? "e.g. Amtrak Northeast Regional: Philadelphia → New York" : trek ? "e.g. Japan Trek" : "e.g. Spring Formal"} aria-invalid={!!fm["ef-name"]} aria-describedby={describe("ef-name")} />{msgFor("ef-name")}</div>
          {dupes.length > 0 && <div className="callout ef-dupes" id="ef-dupes" role="status"><b>Already on Handoff?</b>
            <ul>{dupes.map(e => <li key={e.id} data-ev={e.id}><span className="ef-dupe"><b>{e.title}</b><span className="muted">{dotJoin(eventWhen(e), e.club)}</span></span><button type="button" className="btn btn-sm" aria-label={`Use this one: ${e.title}, ${eventWhen(e)}`} onClick={() => onPick(e.id)}>Use this one</button></li>)}</ul></div>}
          <div className="row2">
            {!train && <div className="field"><label htmlFor="ef-club">{trek ? "Organizer or travel operator" : clubNeed ? "Club or organizer" : "Club or organizer (optional)"}</label>
              <input id="ef-club" type="text" value={d.club} maxLength={80} onChange={e => set("club", e.target.value)} placeholder="e.g. Wharton Social Committee" aria-invalid={!!fm["ef-club"]} aria-describedby={describe("ef-club")} />{msgFor("ef-club")}</div>}
            <div className="field"><label htmlFor="ef-start">{event ? "Date" : train ? "Departs (ET)" : "Starts (ET)"}</label>
              {event
                ? <input key="date" id="ef-start" type="date" value={d.date} min={isoDate(CLOCK)} max={isoDate(latest - DAY)} onChange={e => set("date", e.target.value)} aria-invalid={!!fm["ef-start"]} aria-describedby={describe("ef-start", "ef-start-help")} />
                : <input key="time" id="ef-start" type="datetime-local" value={d.start} min={soonest} max={nyLocal(latest)} onChange={e => set("start", e.target.value)} aria-invalid={!!fm["ef-start"]} aria-describedby={describe("ef-start", train ? "ef-start-help" : undefined)} />}
              {msgFor("ef-start", event ? "It closes at 11:59 PM that day." : train ? "Its listings close when it leaves." : null, "ef-start-help")}</div>
          </div>
          {trek && <fieldset className="ef-tiers"><legend>Ticket types and face values</legend>
            {tiers.map((t, k) => (
              <div key={k} className="tier-row">
                <div className="field"><label htmlFor={"ef-tl-" + k}>Ticket type {tiers.length > 1 ? k + 1 : ""}</label>
                  <input id={"ef-tl-" + k} type="text" value={t.label} maxLength={40} onChange={e => setTier(k, "label", e.target.value)} placeholder={k === 0 ? "e.g. General admission" : "e.g. VIP"} aria-invalid={!!fm["ef-tl-" + k]} aria-describedby={describe("ef-tl-" + k)} />{msgFor("ef-tl-" + k)}</div>
                <div className="field"><label htmlFor={"ef-tp-" + k}>Face value</label>
                  <div className="money"><span>$</span><input id={"ef-tp-" + k} type="text" inputMode="decimal" value={t.price} onChange={e => setTier(k, "price", e.target.value)} aria-invalid={!!fm["ef-tp-" + k]} aria-describedby={describe("ef-tp-" + k)} /></div>{msgFor("ef-tp-" + k)}</div>
                {tiers.length > 1 && <button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove ticket type ${k + 1}`} onClick={() => setTiers(ts => ts.filter((_, j) => j !== k))}><Icon name="x" size={14} /></button>}
              </div>))}
            {tiers.length < 3 && <button type="button" className="linkish add-tier" onClick={() => setTiers(ts => [...ts, { label: "", price: "" }])}><Icon name="plus" size={14} />Add another ticket type</button>}
          </fieldset>}
          <div className="ef-more-head">
            <button type="button" id="ef-more-btn" className="linkish ef-more" aria-expanded={moreOpen} aria-controls="ef-more" onClick={() => setMoreOpen(o => !o)}>
              <Icon name="chev" size={14} style={moreOpen ? { transform: "rotate(180deg)" } : undefined} />Optional details</button>
            {!moreOpen && <span className="muted ef-more-hint">{event ? "Face value, category, venue, who can attend, link, notes" : train ? "Face value, stations, per-person limit, link, notes" : "End time, venue, who can attend, link, notes"}</span>}
          </div>
          <div id="ef-more" className="form-stack ef-more-body" role="group" aria-labelledby="ef-more-btn" hidden={!moreOpen}>
            <div className="row2">
              {!trek && <div className="field"><label htmlFor="ef-tp-0">Face value (optional)</label>
                <div className="money"><span>$</span><input id="ef-tp-0" type="text" inputMode="decimal" value={d.face} onChange={e => set("face", e.target.value)} aria-invalid={!!fm["ef-tp-0"]} aria-describedby={describe("ef-tp-0")} /></div>{msgFor("ef-tp-0")}</div>}
              {trek && <div className="field"><label htmlFor="ef-end">Ends (ET, optional)</label>
                <input id="ef-end" type="datetime-local" value={d.end} min={d.start || soonest} onChange={e => set("end", e.target.value)} aria-invalid={!!fm["ef-end"]} aria-describedby={describe("ef-end")} />{msgFor("ef-end")}</div>}
              {event && <div className="field"><label htmlFor="ef-cat">Category (optional)</label>
                <select id="ef-cat" value={d.cat} onChange={e => set("cat", e.target.value)}><option value="">Not specified</option>{cats.map(c => <option key={c}>{c}</option>)}</select></div>}
            </div>
            <div className="field"><label htmlFor="ef-venue">{train ? "Stations (optional)" : "Venue (optional)"}</label>
              <input id="ef-venue" type="text" value={d.venue} maxLength={120} onChange={e => set("venue", e.target.value)} placeholder={train ? "e.g. 30th Street → Penn Station" : "e.g. Houston Hall"} /></div>
            <div className="row2">
              <div className="field"><label htmlFor="ef-pp">Tickets per person</label>
                <select id="ef-pp" value={d.perPerson || String(EF_PER_PERSON[kind])} onChange={e => set("perPerson", e.target.value)}>{[1, 2, 3, 4].map(n => <option key={n} value={String(n)}>{n}</option>)}</select></div>
              {!train && <div className="field"><label htmlFor="ef-attend">Who can attend</label>
                <select id="ef-attend" value={d.attend} onChange={e => set("attend", e.target.value)}><option value="all">Anyone</option><option value="members">Members only</option></select></div>}
            </div>
            {!train && <div className="field"><label htmlFor="ef-deadline">Transfer deadline (ET, optional)</label>
              <input id="ef-deadline" type="datetime-local" value={d.deadline} min={nyLocal(CLOCK)} max={(event ? (EF_DATE.test(d.date) ? d.date + "T23:59" : "") : d.start) || undefined} onChange={e => set("deadline", e.target.value)} aria-invalid={!!fm["ef-deadline"]} aria-describedby={describe("ef-deadline", "ef-deadline-help")} />
              {msgFor("ef-deadline", "After this, tickets can't change hands on Handoff.", "ef-deadline-help")}</div>}
            {event && <label className="check" htmlFor="ef-names"><input id="ef-names" type="checkbox" checked={d.namesChecked} onChange={e => set("namesChecked", e.target.checked)} /><span>Names are checked at the door, so tickets move by a name change with the organizer</span></label>}
            <div className="field"><label htmlFor="ef-url">Official link (optional)</label>
              <input id="ef-url" type="text" inputMode="url" value={d.officialUrl} maxLength={300} onChange={e => set("officialUrl", e.target.value)} placeholder="https://…" aria-invalid={!!fm["ef-url"]} aria-describedby={describe("ef-url")} />{msgFor("ef-url")}</div>
            <div className="field"><label htmlFor="ef-notes">Notes (optional)</label>
              <textarea id="ef-notes" value={d.notes} maxLength={600} onChange={e => set("notes", e.target.value)} aria-describedby="ef-notes-help" />
              <span id="ef-notes-help" className="help">Shown on the event page with your name.</span></div>
          </div>
          {err && <p ref={errRef} className="err ef-err" role="alert" tabIndex={-1}>{err}</p>}
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={saving}><Icon name="plus" size={16} />{saving ? "Adding…" : `Add ${noun}`}</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
  return root ? createPortal(dialog, root) : dialog;
}
/* Live: the way into EventForm: a link under the request form's event picker ("Not listed? Add it"), a button, or (label) a link with
   words of its own: Sell a ticket's "A trek? Add it with its details" (one-form Sell, §9l). Available's empty state had one too ("Add an
   event") until §9s item 2 took it out: startOpen and toastNote were for that link, and nothing passes them now. */
function AddEvent({ dispatch, flash, onPick, label, linkId, kinds, toastNote, initialTitle, startOpen, draft, place }) { // §9x item 1 (SELL6-N1): its standalone "Add an event" button is gone (nothing offered it since §9s item 2); it opens only from a form's own link // startOpen: open at once (back from sign-in); draft: the dialog as typed when a session ended (keepDraft), which opens it again, once; place, kinds, toastNote: see EventForm
  const [kept, setKept] = useState(() => draft && typeof draft === "object" ? draft : null);
  const [open, setOpen] = useState(false);
  // Opened at once (startOpen, or a kept draft) only after the page's first commit: the dialog is a portal into the app's root, which a
  // first render doesn't have yet (it would render in place, inside the Sell or request form that holds this link).
  useEffect(() => { if (startOpen || kept) setOpen(true); }, []);
  const close = () => { setKept(null); setOpen(false); };
  return <>
    {label ? <button type="button" id={linkId} className="linkish what-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>{label}</button>
      : <p className="add-event"><button type="button" className="linkish" aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="plus" size={14} />Not listed? Add it</button></p>}
    {open && <EventForm dispatch={dispatch} flash={flash} initialTitle={initialTitle || ""} draft={kept} place={place} kinds={kinds} toastNote={toastNote} onClose={close} onPick={id => { close(); onPick(id); }} />}
  </>;
}

/* A ticket file is fingerprinted in the browser (SHA-256, or a simple fallback where the browser has no crypto API), so the same
   file can't be listed twice. The demo keeps only the name, size and fingerprint, never the file itself. */
async function fingerprintFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  try { const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf)); return Array.from(d.slice(0, 16)).map(x => x.toString(16).padStart(2, "0")).join(""); }
  catch (e) { let h = 2166136261 >>> 0, g = 5381; for (const x of buf) { h = Math.imul(h ^ x, 16777619) >>> 0; g = (Math.imul(g, 33) + x) >>> 0; } return h.toString(16).padStart(8, "0") + g.toString(16).padStart(8, "0"); }
}
/* How a student ticket will change hands: names checked at entry, transfer method, the ticket file (PDF or QR), and how buyers pay.
   Shared by "Sell a ticket" and an ISO reply ("I have this"). */
function useDelivery(me, init, saved) { // init: the values a Tickets & trips | Goods round trip brings back to Sell a ticket (sellCarry); saved: live, the viewer's payment methods
  const [method, setMethod] = useState(init ? init.method : ""); const [file, setFile] = useState(init ? init.file : null); const [fileErr, setFileErr] = useState(init ? init.fileErr : "");
  const [payHandle, setPayHandle] = useState(init ? init.payHandle || "" : PEOPLE[me].pay || ""); // the preview's one handle
  // Live (follow-on B1): buyers pay with the methods saved on your profile. With some saved, the form shows them as one line with Change;
  // with none, it asks for one here (payOpen), and posting saves it to your profile first, so the next listing won't ask. What was
  // typed comes back with the form (init.pay: the switch's carry, or a form kept when the session ended; the same account only).
  const keptPay = LIVE && init && init.pay && typeof init.pay === "object" ? init.pay : null;
  // Follow-on B5 (the invitation flow): a payment method is optional here. With none saved the form says it's asked at your first
  // invitation, with "Add it now" for a seller who'd rather give it up front (payLater).
  const [payOpen, setPayOpen] = useState(() => LIVE && (keptPay && payEditorKept(keptPay.st) ? !!keptPay.open : !(saved && saved.length) && !payLater()));
  const [paySt, setPaySt] = useState(() => (keptPay && payEditorKept(keptPay.st)) || payEditorFrom(LIVE ? saved : []));
  const [payErr, setPayErr] = useState(""); // the server's refusal of saving them, shown with the fields
  // Names checked at entry isn't asked separately: picking "Organizer name change" is the answer.
  return { nc: false, method, setMethod, file, setFile, fileErr, setFileErr, payHandle, setPayHandle, saved: LIVE ? saved || [] : null, payOpen, setPayOpen, paySt, setPaySt, payErr, setPayErr,
    reset: def => { setMethod(def || ""); setFile(null); setFileErr(""); } };
}
/* How it will change hands: the seller's choice among the event's valid ways, or its only one. auto: with several valid ways and none
   chosen, the first one stands. Since the Sell and Request follow-up (§9m item 1) live Sell a ticket asks for no method: an ordinary
   event's ticket is posted with none (sellMethod, _lib/sell.js), and DeliveryFields shows there only for an event with one valid way,
   where auto changes nothing. The preview and a held reply made before invite to pay keep the choice. */
const effMethodOf = (ev, d, auto = false) => { const allowed = methodsFor(ev, namesCheckedFor(ev, false)); return allowed.includes(d.method) ? d.method : allowed.length === 1 || auto ? allowed[0] : ""; };
/* Live: how buyers would pay, as the form stands: the saved methods (shown as a line), or the fields, which need at least one right method.
   The first problem, if any: { i, e } (payEditorErrors), for the form's "Not posted yet" list and its focus. */
const payLater = () => LIVE && inviteFlowOn(); // the invitation flow: the seller's payment method is asked at their first invitation, not when posting
const payOpenOf = d => d.payOpen || (!d.saved.length && !payLater()); // with nothing saved (removed in another tab, say), the fields show whatever was chosen
const payNeeded = d => !payLater() || d.saved.length > 0; // the fields can stay empty only when nothing is saved and it can be asked later
const payProblem = d => { if (!payOpenOf(d)) return null; const errs = payEditorErrors(d.paySt, payNeeded(d)); const i = errs.findIndex(Boolean); return i < 0 ? null : { i, e: errs[i] }; };
const payFieldOf = (idp, d, p) => payErrorField(idp + "-pay", d.paySt, p.i, p.e);
const deliveryReady = (ev, d) => { const m = effMethodOf(ev, d); return !!m && (m !== "file" || LIVE || (!!d.file && !d.fileErr)) && (LIVE ? !payProblem(d) : !!d.payHandle.trim()); }; // live: no file to upload
/* Live: before a listing or a held reply is sent, methods typed here are saved to the profile (saveMyProfile), unless they're what's saved
   already. Answers false when that was refused: its words then show with the fields, which keep what was typed. */
async function savePayFirst(d, saveProfile, idp) {
  if (!LIVE || !payOpenOf(d) || !payEditorDirty(d.paySt, d.saved)) return true;
  d.setPayErr("");
  const r = await saveProfile(payEditorMethods(d.paySt), true);
  if (r.error) { d.setPayErr(r.error); focusSoon(idp + "-pay-err"); return false; }
  d.setPayOpen(false); // saved: the line with Change shows them now
  return true;
}
const defaultMethod = ev => ev && ev.nonWharton ? "app" : ""; // concerts and games move as a Ticketmaster or AXS transfer
function DeliveryFields({ ev, s, d, idp = "r", showMissing = false, auto = false, pay = true }) { // showMissing: after a try to post, a missing method or file says so; auto: see effMethodOf; pay: false leaves out how buyers pay (live Sell a ticket shows it as its own compact row, SellPayRow)
  const allowed = methodsFor(ev, namesCheckedFor(ev, false)); const effMethod = effMethodOf(ev, d, auto);
  const noMethod = showMissing && !effMethod, noFile = !LIVE && showMissing && effMethod === "file" && !d.file && !d.fileErr;
  const [editPay, setEditPay] = useState(false);
  const focusPay = useRef(false); // "Change" hands focus to the handle field it reveals (the preview)
  const onFile = async e => {
    const fl = e.target.files && e.target.files[0]; e.target.value = ""; if (!fl) return;
    if (fl.size > 10 * 1024 * 1024) { d.setFileErr("That file is over 10 MB. Upload the ticket's PDF or a screenshot of its QR code."); return; }
    try { const hash = await fingerprintFile(fl); d.setFile({ name: fl.name, size: fl.size, hash }); d.setFileErr(s.listings.some(x => !x.withdrawnAt && x.file && x.file.hash === hash) ? "This ticket file is already listed on Handoff, so it can't be listed twice." : ""); }
    catch (err) { d.setFileErr("That file couldn't be read. Try again."); }
  };
  return (
    <>
      <div className="field"><span className="label" id={idp + "-mt-lbl"}>How you'll transfer it</span>
        {allowed.length === 1 ? <b style={{ fontSize: 14 }}>{METHODS[allowed[0]].label}</b>
          : <div className="seg" role="radiogroup" aria-labelledby={idp + "-mt-lbl"} aria-describedby={idp + "-mt-msg"} aria-invalid={noMethod || undefined} onKeyDown={onRadioKeys}>{allowed.map(k => <button key={k} id={`${idp}-mt-${k}`} type="button" role="radio" aria-checked={effMethod === k} tabIndex={effMethod === k || (!effMethod && k === allowed[0]) ? 0 : -1} className={effMethod === k ? "on" : ""} onClick={() => d.setMethod(k)}>{METHODS[k].label}</button>)}</div>}
        <span id={idp + "-mt-msg"} className={noMethod ? "err" : "help"}>{noMethod ? "Choose how you'll transfer it." : { file: LIVE ? "After the buyer pays and you confirm it, you send them the PDF or QR code yourself." : "Upload it now. Buyers can't see it; Handoff delivers it once you confirm their payment.", app: "After the buyer pays, you transfer it in Ticketmaster or AXS to their email.", name: `After the buyer pays, you email ${ev.club} (Handoff drafts it) to put it in their name.${ev.namesChecked ? " Names are checked at entry for this event." : ""}`, inperson: "After the buyer pays, you hand over the paper ticket in person." }[effMethod] || (allowed.includes("name") ? "Names checked at the door? Pick Organizer name change." : "")}</span></div>
      {effMethod === "file" && !LIVE && <div className="field"><span className="label">Ticket file (PDF or QR code)</span>
        <input id={idp + "-file"} type="file" accept="application/pdf,image/*" className="sr file-pick" onChange={onFile} aria-describedby={idp + "-file-msg"} aria-invalid={noFile || !!d.fileErr || undefined} />
        <label htmlFor={idp + "-file"} className="btn btn-sm" style={{ justifySelf: "start" }}><Icon name="plus" size={14} />{d.file ? "Replace file" : "Upload PDF or QR code"}</label>
        {(d.file || d.fileErr || noFile) && <span id={idp + "-file-msg"} className={d.fileErr || noFile ? "err" : "help"}>{d.fileErr || (noFile ? "Upload the ticket file, so Handoff can deliver it once the buyer pays." : `${d.file.name} · hidden from buyers until you confirm their payment.`)}</span>}</div>}
      {!pay ? null : LIVE ? <div className="field pay-field">
          {!payOpenOf(d) && !d.saved.length ? <p className="pay-sum" id={idp + "-pay-later"} data-pay-later="">How buyers pay you: asked when you first invite a buyer to pay. · <button type="button" id={idp + "-pay-add"} className="linkish pay-change" aria-label="Add how buyers pay you now" onClick={() => { d.setPayErr(""); d.setPayOpen(true); setTimeout(() => { const el = demoElement(payFocusId(idp + "-pay", d.paySt)); if (el) el.focus(); }, 0); }}>Add it now</button></p>
            : !payOpenOf(d) ? <PaySummary methods={d.saved} idp={idp + "-pay"} onChange={() => { d.setPaySt(payEditorFrom(d.saved)); d.setPayErr(""); d.setPayOpen(true); setTimeout(() => { const m = d.saved.find(x => x.kind !== "other"); const el = demoElement(m ? `${idp}-pay-v0` : `${idp}-pay-k0-venmo`); if (el) el.focus(); }, 0); }} />
            : <>
              <PayMethodsEditor idp={idp + "-pay"} st={d.paySt} setSt={d.setPaySt} errs={payEditorErrors(d.paySt, payNeeded(d))} show={showMissing} />
              <span className="help" id={idp + "-pay-note"}>{d.saved.length ? "Saved in Handoff settings when you post, for your other listings too. Exchanges already reserved keep the details they were reserved with." : payLater() ? "Optional for now: you're asked when you first invite a buyer to pay. A buyer sees where to send it only once they reserve. Saved in Handoff settings when you post." : "Buyers see which ways you take; where to send it, only once it's reserved for them. Saved in Handoff settings when you post, so your next listing won't ask."}</span>
              {d.saved.length > 0 && <div><button type="button" className="linkish pay-keep" onClick={() => { d.setPayOpen(false); d.setPayErr(""); setTimeout(() => { const el = demoElement(idp + "-pay-change"); if (el) el.focus(); }, 0); }}>Keep my saved methods</button></div>}
              {!d.saved.length && payLater() && <div><button type="button" className="linkish pay-keep" id={idp + "-pay-skip"} onClick={() => { d.setPaySt(payEditorFrom([])); d.setPayOpen(false); d.setPayErr(""); setTimeout(() => { const el = demoElement(idp + "-pay-add"); if (el) el.focus(); }, 0); }}>Add it later</button></div>}
              {d.payErr && <p id={idp + "-pay-err"} className="err" role="alert" tabIndex={-1} style={{ margin: 0 }}>{d.payErr}</p>}
            </>}
        </div>
      : editPay || !d.payHandle.trim()
        ? <div className="field" style={{ maxWidth: 340 }}><label htmlFor={idp + "-pay"}>Your Venmo or PayPal handle</label>
            <input id={idp + "-pay"} ref={el => { if (el && focusPay.current) { focusPay.current = false; el.focus(); } }} type="text" value={d.payHandle} maxLength={60} onChange={e => { setEditPay(true); d.setPayHandle(e.target.value); }} aria-invalid={!d.payHandle.trim()} aria-describedby={idp + "-pay-msg"} />
            <span id={idp + "-pay-msg"} className={d.payHandle.trim() ? "help" : "err"}>{d.payHandle.trim() ? "Shown to the buyer once they reserve." : "Add a handle, so the buyer can pay you."}</span></div>
        : <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Buyers pay you at <b className="num" style={{ color: "var(--ink)" }}>{d.payHandle}</b> (Venmo or PayPal) · <button type="button" className="linkish" aria-label="Change pay handle" style={{ textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => { focusPay.current = true; setEditPay(true); }}>Change</button></p>}
    </>
  );
}
/* Cancel on the posting forms, back to the page the form was opened from: leaveTo, in _lib/routes.js. */
/* The Tickets & trips | Goods switch on the two Sell forms (USER-INSTRUCTIONS §4.4, ACC-1): within one visit, what you typed comes with
   you. The asking price and the note are the same on both forms, so they carry across: the price once you've entered one (a ticket's
   default, what you paid, isn't carried), the note as it stands. Each form's own fields (a ticket's event, which ticket, its type, what
   you paid, quantity, departure, how buyers pay you and transfer settings; an item's name, photos, category, condition, offers and pickup)
   wait for the way back. Nothing is saved anywhere: the values ride on the switch's navigation (view.carry) and are gone once you leave
   the two forms. Confirmations are never carried (you confirm again before posting), and only the account that typed them gets them. */
const sellCarry = (carry, me) => carry && carry.me === me ? carry : null;
/* One-form Sell (live): what each of a new event's fields is called in "Not posted yet. Check: …" (their ids: _lib/sell.js). */
const NEW_WHAT = { "r-what": "event name", "r-date": "date", "r-start": "departure", "r-face": "face value", "r-club": "organizer", "r-url": "link" };
/* The same for any form's fields (Request a ticket's start with "iso-"). */
const newFieldName = id => NEW_WHAT["r-" + String(id).replace(/^[a-z]+-/, "")];
/* The event search field of the two posting forms (live): "What ticket are you selling?" on Sell a ticket (one-form Sell, §9l) and
   "What ticket are you looking for?" on Request a ticket (ISO) (§9m item 3), which reuses it whole: one text field whose matches (the
   events open on Handoff: sellOptions, each its own row with its date, its time where one is known, its venue and organizer) show
   under it; a tap on one chooses it (picked: the summary with Change, as when the form opens from an event's page); nothing is ever
   chosen for the person and nothing is merged. A name is a new event only by their tap on "isn't one of these", or when nothing on
   Handoff resembles it (mode, sellMode): then it stays as typed and its date shows right there (a train: its departure), with its
   exact twin on Handoff said at the date and offered ("List on that one" / "Post on that one"). A trek keeps its own form (trek:
   AddEvent's dispatch, flash and kept draft). The list never takes the focus (the field keeps it, so the keyboard stays up on a
   phone); Enter in the field picks the highlighted row and never posts the form. idp: the fields' id prefix ("r", "iso"); form: whose
   words (WHAT); held: Sell's "N unlisted" chips; onPick, onUnpick, onNew: the form's own steps for a tap, Change and "isn't one of these". */
function WhatField({ idp, form, picked, what, setWhat, setIsNew, nd, setNew, mode, rows, held = null, err, dateMsg, twin, onPick, onUnpick, onNew, trek, club = null, pair = false, beside = null }) { // Sell a ticket only (§9s items 3 and 4): club: { err, help } while a new event's "Club or organizer" is on the form itself (a restriction needs it); pair: the date sits in the wrapper that can hold the price; beside: the asking price field, while it's shown next to a new ordinary event's date
  const W = WHAT[form];
  const helpLine = whatHelp(form, mode, what, rows.length); // "" on the request form once the name is a new event (§9q item 4: no caption)
  const [open, setOpen] = useState(false); // the field has the focus: an empty one then lists what's on Handoff now
  const [act, setAct] = useState(-1); // the option the arrow keys are on
  if (picked) return (
    <div className="field what-field">
      <span className="label" id={idp + "-ev-lbl"}>{W.label}</span>
      <div className="sell-ev" aria-labelledby={idp + "-ev-lbl"} role="group">
        <span style={{ minWidth: 0 }}><b>{picked.title}</b><span className="muted">{dotJoin(fmtRange(picked), picked.venue, picked.club)}</span></span>
        <button type="button" id={idp + "-ev-change"} className="btn btn-sm btn-ghost" aria-label={`Change event (now ${picked.title})`} onClick={onUnpick}>Change</button>
      </div>
    </div>);
  const newTrain = nd.kind === "train", dateId = idp + (newTrain ? "-start" : "-date");
  const newRow = mode === "search" && nameReady(what); // the explicit "isn't one of these" row, after the matches
  const n = rows.length + (newRow ? 1 : 0);
  const shown = n > 0 && (!!what.trim() || open);
  const at = shown && act >= 0 && act < n ? act : -1;
  const pick = id => { setAct(-1); setOpen(false); onPick(id); };
  const chooseNew = () => { setAct(-1); onNew(); };
  const onKey = e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!n) return; e.preventDefault(); setOpen(true); setAct(at < 0 ? (e.key === "ArrowDown" ? 0 : n - 1) : (at + (e.key === "ArrowDown" ? 1 : n - 1)) % n); }
    else if (e.key === "Enter") { e.preventDefault(); if (at >= 0 && at < rows.length) pick(rows[at].id); else if (at >= 0 && newRow) chooseNew(); }
    else if (e.key === "Escape" && at >= 0) { e.stopPropagation(); setAct(-1); }
  };
  const trekLink = () => <AddEvent dispatch={trek.dispatch} flash={trek.flash} label="A trek? Add it with its details" linkId={idp + "-new-trek"} kinds={["trek"]} initialTitle={what} draft={trek.draft} onPick={pick} />;
  // §9s item 3 (Sell a ticket): a new ordinary event's date and the asking price share a row where they fit (.date-ask; under each
  // other on a narrow phone). A train's departure, and a date with its twin to point at, keep the full width (beside is null then).
  // On Sell (pair) the date is always the wrapper's first child, so the date input stays the same element, and keeps the focus,
  // when the price moves out from beside it while a date is being typed.
  const withAsk = field => (pair ? <div className={beside ? "date-ask" : undefined} data-date-ask={beside ? "" : undefined}>{field}{beside}</div> : field);
  return (
    <div className="field what-field">
      <label htmlFor={idp + "-what"}>{W.label}<Req /></label>
      <input id={idp + "-what"} type="text" role="combobox" autoComplete="off" spellCheck={false} maxLength={120} value={what} placeholder={W.holder}
        aria-expanded={shown} aria-controls={idp + "-what-list"} aria-autocomplete="list" aria-activedescendant={at < 0 ? undefined : at < rows.length ? idp + "-what-opt-" + rows[at].id : idp + "-what-new"}
        aria-required="true" aria-invalid={!!err} aria-describedby={err || helpLine ? idp + "-what-msg" : undefined}
        onChange={e => { const v = e.target.value; setWhat(v); setAct(-1); if (!v.trim()) setIsNew(false); }} onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setAct(-1); }} onKeyDown={onKey} />
      {/* The matches: each event its own row (two showings or departures of one name are two rows), then the person's own way out.
          A press on the list never takes the focus from the field (the keyboard stays up on a phone). */}
      {shown && <ul id={idp + "-what-list"} className="what-list" role="listbox" aria-label={mode === "new" ? "Already on Handoff" : "On Handoff"} onMouseDown={e => e.preventDefault()}>
        {mode === "new" && <li className="what-head" role="presentation">{W.headNew}</li>}
        {mode !== "new" && !what.trim() && <li className="what-head" role="presentation">{W.headOpen}</li>}
        {rows.map((e, i) => <li key={e.id} id={idp + "-what-opt-" + e.id} role="option" aria-selected={i === at} data-ev={e.id} className={"what-opt" + (i === at ? " active" : "")} onClick={() => pick(e.id)} onMouseMove={() => { if (i !== at) setAct(i); }}>
          <span className="what-opt-main"><b>{e.title}</b><span className="muted">{optionMeta(e)}</span></span>
          {held && held(e) > 0 && <span className="chip">{held(e)} unlisted</span>}
        </li>)}
        {newRow && <li id={idp + "-what-new"} role="option" aria-selected={at === rows.length} className={"what-opt what-opt-new" + (at === rows.length ? " active" : "")} onClick={chooseNew} onMouseMove={() => { if (at !== rows.length) setAct(rows.length); }}>
          <Icon name="plus" size={15} /><span className="what-opt-main"><b>“{what.trim()}” isn't one of these</b><span className="muted">{W.newSub}</span></span>
        </li>}
      </ul>}
      {(err || helpLine) && <span id={idp + "-what-msg"} className={err ? "err" : "help"}>{err || helpLine}</span>}
      {/* A new event: its date, right here (it ends at 11:59 PM that day); a train: its departure. Its exact twin on Handoff is
          said at the date, with the way to post there. A trek keeps its own form (organizer, start, named ticket types). */}
      {mode === "new" && <div className="what-new">
        {withAsk(<div className="field">
          <label htmlFor={dateId}>{newTrain ? "Departs (ET)" : "Date"}<Req /></label>
          {newTrain
            ? <input key="t" id={idp + "-start"} type="datetime-local" value={nd.start} min={nyLocal(CLOCK + 30 * 60e3)} max={nyLocal(CLOCK + 548 * DAY)} onChange={e => setNew("start", e.target.value)} aria-required="true" aria-invalid={!!dateMsg} aria-describedby={idp + "-start-msg"} />
            : <input key="d" id={idp + "-date"} type="date" value={nd.date} min={isoDate(CLOCK)} max={isoDate(CLOCK + 547 * DAY)} onChange={e => setNew("date", e.target.value)} aria-required="true" aria-invalid={!!dateMsg} aria-describedby={idp + "-date-msg"} />}
          <span id={dateId + "-msg"} className={dateMsg ? "err" : "help"}>{dateMsg || (newTrain ? W.trainHelp : W.dateHelp)}</span>
          {twin && <div><button type="button" id={idp + "-twin-use"} className="btn btn-sm" onClick={() => pick(twin.id)}>{W.twinUse}: {twin.title}, {eventWhen(twin)}</button></div>}
        </div>)}
        <p className="what-kind">
          {newTrain ? <button type="button" id={idp + "-kind-event"} className="linkish what-link" onClick={() => setNew("kind", "event")}>Not a train? A date is enough</button>
            : <button type="button" id={idp + "-kind-train"} className="linkish what-link" onClick={() => setNew("kind", "train")}>A train? Add its departure time</button>}
          {trekLink()}
        </p>
        {/* §9y (Sell a ticket, SELL7-O1): the new event's club or organizer is here, on the form itself right under its date,
            "(optional)" (§9s item 4 had it in Optional details). A restriction that needs a club (names checked at the door, or a
            members-only ticket) makes the same field required, in place (club.need). The clubs already on Handoff are offered as
            the seller types and any text is accepted. A train names none. */}
        {club && !newTrain && <ClubField id={idp + "-club"} label={club.need ? "Club or organizer" : "Club or organizer (optional)"} required={!!club.need} value={nd.club} onChange={v => setNew("club", v)} err={club.err} help={club.help} />}
      </div>}
      {mode !== "new" && trek.draft && <p className="what-kind">{trekLink()}</p>}
    </div>);
}
/* "Club or organizer" (§9q item 5): one text field that takes any name. As the seller types, the clubs already on Handoff that hold
   what's typed show under it (clubOptions); a tap, or the arrow keys and Enter, fills one in. The list never takes the focus (the
   field keeps it, so the keyboard stays up on a phone), and Enter fills in the highlighted club instead of posting the form.
   required: eligibility needs a club, so the label carries the required marker and the field aria-required. §9y (SELL7-O1): on the
   form itself wherever it's asked: Sell a ticket for a new event (WhatField, under its date) or for an event on Handoff that names
   no club (the listing's club, under the chosen event), and Request a ticket for a new event (under its date). */
const CLUB_HELP_NEW = "Who runs the event, if you know. It helps classmates find it by club and doesn't limit who can buy.";
const CLUB_HELP_LISTING = "This event has no club on Handoff yet. The one you name shows with your listing and under By club; it doesn't limit who can buy.";
function ClubField({ id, label, required = false, value, onChange, err, help = "", holder = "e.g. Wharton Social Committee" }) {
  const [open, setOpen] = useState(false); // the field has the focus
  const [act, setAct] = useState(-1); // the suggestion the arrow keys are on
  const rows = open ? clubOptions(value) : [], at = act >= 0 && act < rows.length ? act : -1;
  const pick = name => { onChange(name); setAct(-1); };
  const onKey = e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!rows.length) return; e.preventDefault(); setAct(at < 0 ? (e.key === "ArrowDown" ? 0 : rows.length - 1) : (at + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length); }
    else if (e.key === "Enter" && at >= 0) { e.preventDefault(); pick(rows[at]); }
    else if (e.key === "Escape" && rows.length) { e.stopPropagation(); setOpen(false); setAct(-1); }
  };
  const msg = err || help;
  return (
    <div className="field club-field">
      <label htmlFor={id}>{label}{required && <Req />}</label>
      <input id={id} type="text" role="combobox" autoComplete="off" maxLength={80} value={value} placeholder={holder} aria-required={required ? "true" : undefined}
        aria-expanded={rows.length > 0} aria-controls={id + "-list"} aria-autocomplete="list" aria-activedescendant={at < 0 ? undefined : id + "-opt-" + at}
        aria-invalid={!!err} aria-describedby={msg ? id + "-msg" : undefined}
        onChange={e => { onChange(e.target.value); setOpen(true); setAct(-1); }} onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setAct(-1); }} onKeyDown={onKey} />
      {rows.length > 0 && <ul id={id + "-list"} className="what-list club-list" role="listbox" aria-label="Clubs already on Handoff" onMouseDown={e => e.preventDefault()}>
        <li className="what-head" role="presentation">On Handoff already. Tap one, or keep typing your own.</li>
        {rows.map((name, i) => <li key={name} id={id + "-opt-" + i} role="option" aria-selected={i === at} data-club={name} className={"what-opt" + (i === at ? " active" : "")} onClick={() => pick(name)} onMouseMove={() => { if (i !== at) setAct(i); }}>
          <span className="what-opt-main"><b>{name}</b></span>
        </li>)}
      </ul>}
      {msg && <span id={id + "-msg"} className={err ? "err" : "help"}>{msg}</span>}
    </div>);
}
/* "This ticket has restrictions" (§9v item 5, live, SELL5-M2): one unticked entry point in Sell a ticket's Optional details. Ticked, the
   seller picks what applies, one or more: members only ("<club> members only" when the club is known), an organizer name change ("The
   organizer must change the name on the ticket"), or something else in their own short words (3 to 80 characters). Buyers read each in
   those words before they ask to buy or reserve. r, setR: the form's restrictions (RESTRICT0's shape); offer: which apply to this event
   (restrictOffer); club: the club that's known (the event's, a new event's, or the one named on the listing), "" when none; msg: what's
   wrong, by field id (restrictIssues); onClub(on, other): members only or a name change was ticked (on) or unticked, with other: whether
   one of them is still chosen (the form brings "Club or organizer" onto itself when one is needed and none is named: needClub). */
function RestrictFields({ r, setR, offer, club, msg, onClub }) {
  const clubNeeded = n => (offer.members && n.members) || (offer.name && n.name);
  const set = (k, on) => { const n = { ...r, [k]: on }; setR({ [k]: on }); if (k === "other") { if (on) focusSoon("r-restrict-text"); } else onClub(on, clubNeeded(n)); };
  const setOn = on => { setR({ on }); if (!on) onClub(false, false); else if (clubNeeded(r)) onClub(true, true); };
  const errMain = msg["r-restrict"] || null, errText = msg["r-restrict-text"] || null;
  return (
    <div className="field restrict-field" data-restrict="">
      <label className="check" htmlFor="r-restrict"><input id="r-restrict" type="checkbox" checked={r.on} onChange={e => setOn(e.target.checked)} aria-invalid={!!errMain} aria-describedby="r-restrict-msg" /><span><b>This ticket has restrictions</b></span></label>
      {r.on && <div className="restrict-opts" role="group" aria-label="What applies">
        {offer.members && <label className="check" htmlFor="r-rs-members"><input id="r-rs-members" type="checkbox" checked={r.members} onChange={e => set("members", e.target.checked)} /><span>{club ? `${club} members only` : "Members only"}<span className="muted"> · only {club ? club : "a club's"} members can use it</span></span></label>}
        {offer.name && <label className="check" htmlFor="r-rs-name"><input id="r-rs-name" type="checkbox" checked={r.name} onChange={e => set("name", e.target.checked)} /><span>The organizer must change the name on the ticket</span></label>}
        {offer.other && <label className="check" htmlFor="r-rs-other"><input id="r-rs-other" type="checkbox" checked={r.other} onChange={e => set("other", e.target.checked)} /><span>Something else</span></label>}
        {offer.other && r.other && <div className="field"><label htmlFor="r-restrict-text">The restriction, in a few words<Req /></label>
          <input id="r-restrict-text" type="text" maxLength={80} value={r.text} onChange={e => setR({ text: e.target.value })} placeholder="e.g. Student ID checked at the door"
            aria-required="true" aria-invalid={!!errText} aria-describedby="r-restrict-text-msg" />
          <span id="r-restrict-text-msg" className={errText ? "err" : "help"}>{errText || "Up to 80 characters. Buyers read it as you write it."}</span></div>}
      </div>}
      <span id="r-restrict-msg" className={errMain ? "err" : "help"}>{errMain || (r.on ? "Buyers read what you choose before they ask to buy." : "Only if one really applies, such as members only or a name change.")}</span>
    </div>);
}
/* A new event's own details in Sell a ticket's "Optional details" (createEvent's optional fields; none is needed to post): its face
   value, category, venue or stations, per-person limit, names checked at the door and link. Its club or organizer isn't here (§9y:
   it's on the form itself, under the date: WhatField; §9s item 4 had it here). §9q item 4: the request form asks for none of these.
   idp: "r"; fm: what's wrong at each field (newEventIssues); onNames: the form's step when "Names are checked at the door" is ticked
   or unticked (it needs the organizer). */
function NewEventMore({ idp, nd, setNew, fm, onNames = null, names = true }) { // names (§9v item 5): false on Sell a ticket, where an organizer name change is one of the ticket's restrictions
  const newTrain = nd.kind === "train", id = k => idp + "-" + k;
  return <>
    <b className="more-h" id={id("more-ev")}>{newTrain ? "This train (new on Handoff)" : "This event (new on Handoff)"}</b>
    <div className="row2">
      <div className="field"><label htmlFor={id("face")}>Face value (optional)</label>
        <div className="money"><span>$</span><input id={id("face")} type="text" inputMode="decimal" value={nd.face} onChange={e => setNew("face", e.target.value)} aria-invalid={!!fm[id("face")]} aria-describedby={id("face-msg")} /></div>
        <span id={id("face-msg")} className={fm[id("face")] ? "err" : "help"}>{fm[id("face")] || "What a new ticket costs. Given, nothing for it can be listed above it."}</span></div>
      {!newTrain && <div className="field"><label htmlFor={id("cat")}>Category (optional)</label>
        <select id={id("cat")} value={nd.cat} onChange={e => setNew("cat", e.target.value)}><option value="">Not specified</option>{Object.keys(CATS).filter(c => c !== "Travel" && c !== "Treks & trips").map(c => <option key={c}>{c}</option>)}</select></div>}
    </div>
    <div className="field"><label htmlFor={id("venue")}>{newTrain ? "Stations (optional)" : "Venue (optional)"}</label>
      <input id={id("venue")} type="text" value={nd.venue} maxLength={120} onChange={e => setNew("venue", e.target.value)} placeholder={newTrain ? "e.g. 30th Street → Penn Station" : "e.g. Houston Hall"} /></div>
    <div className="row2">
      <div className="field"><label htmlFor={id("pp")}>Tickets per person</label>
        <select id={id("pp")} value={nd.perPerson || String(NEW_PER_PERSON[nd.kind])} onChange={e => setNew("perPerson", e.target.value)}>{[1, 2, 3, 4].map(n => <option key={n} value={String(n)}>{n}</option>)}</select></div>
    </div>
    {!newTrain && names && <label className="check" htmlFor={id("names")}><input id={id("names")} type="checkbox" checked={nd.namesChecked} onChange={e => (onNames ? onNames(e.target.checked) : setNew("namesChecked", e.target.checked))} /><span>Names are checked at the door, so tickets move by a name change with the organizer</span></label>}
    <div className="field"><label htmlFor={id("url")}>Official link (optional)</label>
      <input id={id("url")} type="text" inputMode="url" value={nd.officialUrl} maxLength={300} onChange={e => setNew("officialUrl", e.target.value)} placeholder="https://…" aria-invalid={!!fm[id("url")]} aria-describedby={fm[id("url")] ? id("url-msg") : undefined} />{fm[id("url")] && <span id={id("url-msg")} className="err">{fm[id("url")]}</span>}</div>
  </>;
}
/* Sell a ticket's compact payment row (§9m item 2, live), on the form itself. With methods saved in Handoff settings: their names
   ("Buyers pay you with Venmo or Zelle") and Change; never where to pay, which a buyer sees only once they reserve. With none: "Add
   payment method". Either opens the same payment editor in place (PayMethodsEditor; §9q item 5: an empty one opens on Venmo with
   its username field focused, Zelle is the other choice, and PayPal shows only for a seller who saved it), saved to the profile when the
   ticket is posted (savePayFirst), with "Keep my saved methods" or "Add it later" to close it. Posting never needs it: a seller with
   none is asked at their first invitation to pay (InviteForm). d: the form's delivery state (useDelivery). */
function SellPayRow({ d, idp = "r", show, must = null }) { // must (§9v item 2, SELL5-M3): the first name of the requester this form invites, when nothing is saved: the editor stays on the form, required (an invitation needs a way to be paid)
  const names = payRowNames(d.saved);
  const focus = id => setTimeout(() => { const el = demoElement(id); if (el) el.focus(); }, 0);
  if (must) return (
    <div className="field pay-field" data-pay-row="required">
      <PayMethodsEditor idp={idp + "-pay"} st={d.paySt} setSt={d.setPaySt} errs={payEditorErrors(d.paySt, true)} show={show} />
      <span className="help" id={idp + "-pay-note"}>Needed to invite {must}: it's how buyers pay you. Asked once, and saved in Handoff settings when you post. A buyer sees where to send it only once they reserve.</span>
      {d.payErr && <p id={idp + "-pay-err"} className="err" role="alert" tabIndex={-1} style={{ margin: 0 }}>{d.payErr}</p>}
    </div>);
  if (!payOpenOf(d)) return names
    ? <p className="pay-sum pay-row-line" id={idp + "-pay-sum"} data-pay-row="saved">Buyers pay you with <b>{names}</b> · <button type="button" id={idp + "-pay-change"} className="linkish pay-change" aria-label="Change payment methods"
        onClick={() => { d.setPaySt(payEditorFrom(d.saved)); d.setPayErr(""); d.setPayOpen(true); focus(d.saved.some(x => x.kind !== "other") ? `${idp}-pay-v0` : `${idp}-pay-k0-venmo`); }}>Change</button></p>
    : <p className="pay-sum pay-row-line" id={idp + "-pay-later"} data-pay-later="" data-pay-row="none"><button type="button" id={idp + "-pay-add"} className="linkish pay-change pay-row-add" onClick={() => { d.setPayErr(""); d.setPayOpen(true); focus(payFocusId(idp + "-pay", d.paySt)); }}><Icon name="plus" size={14} />Add payment method</button><span className="muted"> · optional: you're asked when you first invite a buyer to pay</span></p>;
  return (
    <div className="field pay-field" data-pay-row="open">
      <PayMethodsEditor idp={idp + "-pay"} st={d.paySt} setSt={d.setPaySt} errs={payEditorErrors(d.paySt, payNeeded(d))} show={show} />
      <span className="help" id={idp + "-pay-note"}>{d.saved.length ? "Saved in Handoff settings when you post, for your other listings too. Exchanges already reserved keep the details they were reserved with." : "Optional for now: you're asked when you first invite a buyer to pay. A buyer sees where to send it only once they reserve. Saved in Handoff settings when you post."}</span>
      {d.saved.length > 0 && <div><button type="button" className="linkish pay-keep" onClick={() => { d.setPayOpen(false); d.setPayErr(""); focus(idp + "-pay-change"); }}>Keep my saved methods</button></div>}
      {!d.saved.length && <div><button type="button" className="linkish pay-keep" id={idp + "-pay-skip"} onClick={() => { d.setPaySt(payEditorFrom([])); d.setPayOpen(false); d.setPayErr(""); focus(idp + "-pay-add"); }}>Add it later</button></div>}
      {d.payErr && <p id={idp + "-pay-err"} className="err" role="alert" tabIndex={-1} style={{ margin: 0 }}>{d.payErr}</p>}
    </div>);
}
/* One-form Sell (USER-INSTRUCTIONS §9l, live). Selling an ordinary ticket is one form with one final action, "Post ticket":
   - "What ticket are you selling?" is one search field (it replaced the event menu and "Not listed? Add it"). As the seller types, the
     events already on Handoff that match show under it, each its own row with its date, its time where one is known, its venue and
     organizer (sellOptions, optionMeta). Tapping one chooses it (the summary with Change, as when the form opens from an event's page).
     Nothing is ever chosen for them, and nothing is merged: a name is a new event only when they tap "isn't one of these", or when
     nothing on Handoff resembles it (sellMode). Then the name stays as typed and its date shows right there (a train: its departure).
   - The form itself: the event (and its date when it's new), the asking price, and one compact row for how buyers pay (SellPayRow:
     the saved methods' names with Change, or "Add payment method"; never needed to post). What an event needs shows with them (its
     ticket type where it has several, an older train's departure, which of your tickets). Everything else is in "Optional details":
     a new event's face value, category, venue, organizer, per-person limit, names checked and link; the quantity (1; from two up its
     count shows beside the words "Optional details", open or closed: §9n); offers; the note; the members-only and restriction flags.
   - §9s items 3 to 5: both required fields are on the form before anything is typed, and a price the seller entered follows every
     change of event (askAfterEvent); a price above the chosen event's face value is said beside it, announced, with the focus there
     (askIssue). A new ordinary event's date sits beside the price (dateBesideAsk). Its club or organizer is in Optional details and
     comes onto the form only when a restriction needs a club that isn't known (clubPlace). The search is forgiving about word
     order and half-typed words (sellOptions). Posting ends on the event's page at the new listing; no Share dialog opens by itself.
   - No transfer method is asked (§9m item 1). An ordinary event's ticket, which could change hands several ways, is posted with none
     and promises none: "Send the ticket to the buyer after payment." An event with one valid way keeps it, set without asking and
     named in Optional details and in the confirmation line (a train's eTicket; a trek's or a names-checked event's name change).
   - The confirmation is one line by the button, not a tick: no rule needs one (the server never read the old checkbox).
   - "Post ticket" sends one change: postTicket, with the event the seller chose (eventId) or the new one (event), so a new event and
     its listing are stored together or not at all; a ticket already held and unlisted is listed as before (list). Until then the new
     event exists only in this form (draftEvent): Cancel, leaving or a refusal leaves nothing behind. A refusal's words go to the field
     they're about; the same form sent again after an answer that never came reuses its request (unanswered), so it's stored once.
   A new train fits the same form (its name and departure). A new trek keeps "Add a trek" (its organizer, start and named ticket types),
   opened from the link under the date, and comes back here chosen. The preview keeps the form below as it was. */
function ListPage({ s, me, go, dispatch, saveProfile, initial, initialText, openShare, flash, forIso, from, fromId, back, typeFocus, carry, evDraft }) { // evDraft: "Add a trek" (the preview: none) as typed when a session ended (keepDraft); saveProfile: live, saves payment methods typed here; initialText: live, the name the search field starts with (Available's search)
  const cin = sellCarry(carry, me);
  // This form as you left it for Goods, if the event you'd chosen (if any) is still on Handoff; and a price entered on either form.
  const own = cin && cin.tickets && (!cin.tickets.eventId || Object.prototype.hasOwnProperty.call(EV, cin.tickets.eventId)) ? cin.tickets : null;
  const sharedPrice = cin && typeof cin.price === "string" ? cin.price : null;
  const [eventId, setEventId] = useState(own ? own.eventId : initial || ""); // no event is chosen for you: the event menu lists your own tickets first
  const [pickEvent, setPickEvent] = useState(own ? own.pickEvent : !initial); // from an event's page, the event shows as a summary until "Change"
  // Opened by the Tickets & trips | Goods switch: focus stays on the switch, after App's move to the page heading.
  useEffect(() => { if (!typeFocus) return; const t = setTimeout(() => { const el = demoElement("sell-type-tickets"); if (el) el.focus(); }, 0); return () => clearTimeout(t); }, []);
  // One-form Sell (live): the search field's text, whether the seller said it's a new event, and the new event as typed (NEW0).
  const [what, setWhat] = useState(() => own && typeof own.what === "string" ? own.what : !initial && typeof initialText === "string" ? initialText.slice(0, 120) : "");
  const [isNew, setIsNew] = useState(() => !!(own && own.isNew));
  // §9v item 5 (SELL5-M2): names checked at the door is no longer a new event's own detail on Sell: an organizer name change is one of
  // the ticket's restrictions (restrict, below), kept on the listing. A kept form's older tick comes back as that choice (restrictValues).
  const [nd, setNd] = useState(() => LIVE ? { ...newValues(own && own.nd), namesChecked: false } : newValues(own && own.nd));
  const setNew = (k, v) => setNd(p => ({ ...p, [k]: v }));
  const heldN = e => s.holdings.filter(x => x.userId === me && x.eventId === e.id && x.qty > 0).reduce((t, x) => t + holdingFree(s, x), 0);
  // picked: the event on Handoff the seller chose (their tap, or the page the form opened from). Until then the form reads a draft
  // (draftEvent: what createEvent would store for what's typed so far), which exists only here. evKey: what the effects below follow.
  const picked = LIVE && Object.prototype.hasOwnProperty.call(EV, eventId) ? EV[eventId] : null;
  const isDraft = LIVE && !picked;
  const whatRows = isDraft ? sellOptions(what, newWhen(nd), heldN) : [];
  const mode = LIVE ? sellMode({ picked: !!picked, isNew, text: what, matches: whatRows.length, when: newWhen(nd) }) : null;
  const ev = LIVE ? picked || draftEvent(what, nd, me) : EV[eventId]; const u = unitOf(ev);
  const evKey = LIVE ? (picked ? eventId : "") : eventId;
  // An event just chosen shows as the summary, and focus goes to its Change (after the list's own focus, in the same commit).
  const focusChange = useRef(false);
  // §9s item 3 (live): when the price the seller already entered is above the chosen event's face value, the focus goes to the price,
  // where that's said, instead (overNow: set further down, once the form has read the event).
  const overNow = useRef(false);
  useEffect(() => { if (!focusChange.current || (LIVE ? !picked : pickEvent || !ev)) return; focusChange.current = false; const el = (LIVE && overNow.current && demoElement("r-ask")) || demoElement("r-ev-change"); if (el) el.focus(); });
  // "Create a listing for this request": the form starts from that request (its quantity, and its budget as the price, within the caps)
  // and shares the listing with it once posted. Only while the form is for that request's event and the request is still live.
  const iso0 = forIso ? s.interests.find(i => i.id === forIso && i.kind === "iso") : null;
  const iso = iso0 && iso0.eventId === eventId && iso0.userId !== me && liveRequest(s, iso0) ? iso0 : null;
  const mine = ev ? s.holdings.filter(h => h.userId === me && h.eventId === ev.id && h.qty > 0) : [];
  const [holdingId, setHoldingId] = useState(own ? own.holdingId : "");
  // Several of your tickets here still unlisted: you pick one, since they can differ in type, price paid and who may use them.
  const freeHeld = mine.filter(x => holdingFree(s, x) > 0);
  const h = mine.find(x => x.id === holdingId) || (freeHeld.length === 1 ? freeHeld[0] : freeHeld.length === 0 ? mine[0] || null : null);
  const free = h ? holdingFree(s, h) : 0;
  const [qty, setQty] = useState(own ? own.qty : 1);
  const [ask, setAsk] = useState(own ? (sharedPrice != null ? sharedPrice : own.ask) : "");
  const [note, setNote] = useState(cin ? cin.note || "" : "");
  const [ack, setAck] = useState(false);
  const [viaOrg, setViaOrg] = useState(own ? own.viaOrg : false); // optional organizer step; off by default (direct handoff)
  const [risk, setRisk] = useState(own ? own.risk : false); // optional seller flag: the ticket's terms may restrict transfers
  // Student tickets (Christine's flow): how it changes hands, the file, and how buyers pay (live: the saved payment methods; the preview: a handle).
  const dlv = useDelivery(me, own && own.dlv, s.viewer && s.viewer.payMethods);
  const { file, payHandle } = dlv;
  const [departs, setDeparts] = useState(own ? own.departs : ""); // Amtrak: the listed train's departure
  const [obo, setObo] = useState(own ? own.obo : false); // open to offers below the asking price (not for trips)
  const [minOffer, setMinOffer] = useState(own ? own.minOffer : ""); // optional floor shown to buyers
  // A first-time seller for this event says what they have (tier, how many, what they paid) in the same form; listing adds it first.
  const [addTier, setAddTier] = useState(own ? own.addTier : "");
  const [addQty, setAddQty] = useState(own ? own.addQty : 1);
  const [addPaid, setAddPaid] = useState(own ? own.addPaid : "");
  const [askEdited, setAskEdited] = useState(own ? own.askEdited || (sharedPrice != null && !!own.eventId) : false); // the asking price follows what you paid until you change it
  const [memberTicket, setMemberTicket] = useState(own ? own.memberTicket : false); // the seller marks a members-only ticket
  // §9q item 5: the club a members-only ticket is for where the event on Handoff names none (memberClub: it goes with the listing).
  // §9s item 4: a new event's "Club or organizer" sits in Optional details; clubReveal: a restriction that needs a club (a
  // members-only ticket, names checked at the door) was chosen while none was named, so the field shows on the form itself until
  // nothing needs it (clubPlace). A kept form that needs one and names none starts with it there.
  const [memberClub, setMemberClub] = useState(own && typeof own.memberClub === "string" ? own.memberClub.slice(0, 80) : "");
  // §9v items 4 and 5 (live, SELL5-M2): the ticket's restrictions ("This ticket has restrictions", unticked: restrictValues reads a kept
  // or carried form, its older flags included), and lclub: a club the seller names on the listing for an event on Handoff that names
  // none (never written to the event; a kept form's older members-only club comes back as it).
  const [restrict, setRestrict] = useState(() => restrictValues(own));
  const setR = patch => setRestrict(r => ({ ...r, ...patch }));
  const [lclub, setLclub] = useState(() => own && typeof own.lclub === "string" ? own.lclub.slice(0, 80) : own && typeof own.memberClub === "string" ? own.memberClub.slice(0, 80) : "");
  const [clubReveal, setClubReveal] = useState(() => { const k = newValues(own && own.nd), r = restrictValues(own); return !!(own && r.on && (r.members || r.name) && !k.club.trim() && !(typeof own.lclub === "string" ? own.lclub : own.memberClub || "").trim()); });
  const [tried, setTried] = useState(false); // after a first "Post", missing answers show as errors too
  const [moreOpen, setMoreOpen] = useState(own ? own.moreOpen || (LIVE && !!(restrictValues(own).on || own.obo || newMoreUsed(newValues(own.nd)))) : LIVE && !!(cin && cin.note)); // §9y: a kept club is on the form itself, so it doesn't open Optional details // "Optional details" (the preview: "Additional details"); open by itself for a kept form with something in it (live: a carried note too, since the note is in there)
  // One-form Sell (live): a refusal's words, shown at the field they're about while the form is as it was sent ({ msg, at, key }); and the
  // form as sent when its answer never came (unanswered): sent again unchanged, it reuses that request, so it's stored once.
  const [srvErr, setSrvErr] = useState(null);
  const unanswered = useRef(null);
  // The switch (sellCarry). askOwn: the asking price is your own entry (typed here, or carried from Sell an item), not a default from what
  // you paid; only then does it carry to Sell an item. A carried price waits for an event (carriedAsk): it becomes the asking price when
  // the first event is chosen (at once for an event the form opened with), as if typed here, and behaves like a typed one from then on
  // (askForHolding hands it to the ticket's own price below, for a ticket you already hold).
  const askOwn = useRef(own ? (sharedPrice != null && !!own.eventId) || own.askOwn : false);
  const carriedAsk = useRef(sharedPrice != null && !(own && own.eventId) ? sharedPrice : null);
  const askForHolding = useRef(own && own.eventId && !own.hId && sharedPrice != null ? { eventId: own.eventId, price: sharedPrice } : null); // { eventId, price }: for the ticket you pick next
  // The two effects below run when the event or the ticket changes. A form brought back by the switch already holds both, so their first
  // run is skipped; so is a run with nothing changed (React's development re-run of an effect).
  const evRan = useRef(own ? own.eventId : undefined), hRan = useRef(own ? own.hId : undefined);
  const keepTyped = useRef(false); // set as "Add an event" hands back an event (AddEvent's onPick): see the event effect below

  // A first-time seller says which ticket type they have (when the event has more than one) and what they paid: neither is guessed.
  useEffect(() => {
    if (evRan.current === evKey) return; evRan.current = evKey;
    // Forms round 2 (§9j item 2, live): an event chosen in "Add an event" ("Use this one", or one just added) comes back to this form as
    // it was typed (keepTyped): whether you're open to offers and your lowest offer, and the quantity (within what the new event allows:
    // the effect below), stay, with the note and the price you entered (askAfterEvent: a price you typed follows any change of event, as it
    // did; a starting value doesn't). What belongs to one event's ticket starts again, as for any other change of event: which ticket and
    // its type, how it's transferred, the flags in Optional details, and the confirmation (you confirm again).
    // One-form Sell (live): the same when the seller taps a match in the search field, or Change (pick, unpick): evKey is the chosen
    // event, or "" while the form reads its draft, where the price field already shows, so a price waiting for an event shows at once.
    const keep = LIVE && keepTyped.current; keepTyped.current = false;
    setHoldingId(""); if (!keep) setQty(1); setAck(false); setViaOrg(!!(ev && (ev.premium || ev.organizerRequired))); setRisk(false); dlv.reset(defaultMethod(ev)); setDeparts(""); if (!keep) { setObo(false); setMinOffer(""); } setAskEdited(false); setMemberTicket(false); setMemberClub(""); setRestrict({ ...RESTRICT0 }); setLclub(""); setClubReveal(!LIVE && !!nd.namesChecked && !nd.club.trim()); setTried(false); if (ev && !ev.premium) { setAddTier(ev.tiers.length === 1 ? ev.tiers[0].id : ""); setAddPaid(""); if (!keep) setAddQty(iso && !LIVE ? Math.max(1, Math.min(iso.qty, personCap(ev) - personLoad(s, me, ev.id))) : 1); } // live (§9v item 2): one ticket for a request too, unless the seller chooses more
    // Live (§9s item 3): the price field is on the form before any event is chosen, so a price the seller entered (or one carried
    // from Sell an item) follows every change of event exactly as typed, and a starting value they never typed (another event's face
    // value) doesn't (askAfterEvent). A price above the next event's face value is said at the field (askIssue), never changed.
    if (LIVE) {
      const kept = askAfterEvent({ ask, own: askOwn.current, carried: carriedAsk.current });
      carriedAsk.current = null; askOwn.current = kept.own; askForHolding.current = kept.own ? { eventId: evKey, price: kept.ask } : null;
      setAsk(kept.ask); setAskEdited(kept.own);
      return;
    }
    // The preview: a price carried from Sell an item waits for an event to be chosen.
    askOwn.current = false; askForHolding.current = null;
    if (carriedAsk.current != null && evKey) { const p = carriedAsk.current; carriedAsk.current = null; setAsk(p); setAskEdited(true); askOwn.current = true; askForHolding.current = { eventId: evKey, price: p }; }
  }, [evKey]);
  // For a request: its quantity (up to what you hold unlisted) and its budget as the price, never above what you paid (askCap). A price
  // carried from Sell an item takes the place of that default once (askForHolding).
  useEffect(() => {
    const k = h && h.id; if (hRan.current === k) return; hRan.current = k;
    if (h && ev) {
      const c = askCap(ev, h), p = askForHolding.current && askForHolding.current.eventId === eventId ? askForHolding.current.price : null; askForHolding.current = null; askOwn.current = p != null;
      const dflt = iso && iso.budget != null ? Math.min(iso.budget, c) : c; // forms round 2: without a face value (live) there's no cap, so no default
      setAsk(p != null ? p : Number.isFinite(dflt) ? String(dflt) : ""); setQty(iso && !LIVE ? Math.max(1, Math.min(iso.qty, holdingFree(s, h))) : 1); // live (§9v item 2): one ticket for a request too
    } else setQty(1);
  }, [h && h.id]);

  const a = ev ? (isDraft ? { ok: true, kind: "unknown" } : access(ev)) : null; // a draft's date is checked at its own field (newEventIssues)
  const att = ev ? honorAttend(me, ev) : { ok: true };
  const newSeller = !!(ev && a.ok && att.ok && mine.length === 0 && !ev.premium);
  const addT = ev && !ev.premium ? tierOf(ev, addTier) : null;
  // A first-time seller can only add what the per-person limit leaves room for (an open reservation counts).
  const room = newSeller ? personCap(ev) - (addT && addT.addOn ? 0 : personLoad(s, me, ev.id)) : null;
  useEffect(() => { if (room >= 1 && addQty > room) setAddQty(room); }, [room, addQty]); // a type change can lower the room left (add-ons don't count toward the limit), and a request's quantity can be more than it
  // Forms round 2 (live): "What you paid" isn't asked. The face value alone caps the price (askCap), and without one there's no cap.
  const addPm = parseMoney(addPaid);
  const addErr = LIVE || !newSeller || !addT ? null : addPm.error ? addPm.error : addPm.value > addT.price ? `Face value for this ticket is ${money(addT.price)}.` : null;
  const cap = newSeller ? (LIVE ? (addT ? askCap(ev, { tier: addT.id, paid: null }) : null) : addT && !addPm.error ? Math.min(addPm.value, addT.price) : null) : h && ev ? askCap(ev, h) : null;
  // A first-time seller's price follows what they paid until they change it (the preview); for a request, their budget when that's lower.
  // Live: the price is the seller's own, starting from a request's budget (within the face value) when the form is for one; else
  // (§9j item 3) from the ticket type's face value where the event gives one (askPrefill), as a ticket you already hold does: a start
  // the seller changes freely, until they type their own. Without a face value it starts empty.
  const askStr = newSeller && !askEdited ? (LIVE ? (iso && iso.budget != null && !ask ? String(cap != null && Number.isFinite(cap) ? Math.min(iso.budget, cap) : iso.budget) : ask || askPrefill(ev, addTier))
    : iso && iso.budget != null && addPaid.trim() && !addPm.error && iso.budget < addPm.value ? String(iso.budget) : addPaid) : ask;
  const pm = parseMoney(askStr);
  const askErr = (newSeller ? !!addErr : !h) ? null : pm.error ? pm.error : cap != null && pm.value > cap ? (ev.premium ? `Reimbursement can't be more than you've paid (${money(cap)}).` : LIVE ? `Asking price can't be more than the face value (${money(cap)}).` : `Asking price can't be more than you paid (${money(cap)}).`) : null;
  const listQty = newSeller ? addQty : qty;
  const train = ev && needsTrain(ev);
  const depErr = !train || !departs ? null : atMs(departs) <= CLOCK ? "That train has already left." : atMs(departs) < atMs(ev.start) || atMs(departs) > closesAt(ev) ? `Pick a train between ${fmtDay(ev.start)} and ${fmtDay(ev.openUntil || ev.start)}.` : null;
  const minErr = obo && ev && !ev.premium && !askErr && pm.value != null ? checkMinOffer(minOffer, pm.value).error : null;
  const quick = isQuick(ev);
  // Sell and Request follow-up (§9m item 1, live): the event's one valid way (a train's eTicket, a trek's or a names-checked event's
  // organizer name change), or none at all for an ordinary event, whose seller is asked for none and promises none (sellMethod).
  const effMethod = !ev || !quick ? "" : LIVE ? sellMethod(ev) : effMethodOf(ev, dlv);
  const quickOk = !quick || deliveryReady(ev, dlv);
  // §9v item 2 (live, SELL5-M3): a form for someone's request lists the ticket and invites them in one submission, and every invitation
  // needs a way to be paid (the engine's rule), so with none saved the payment editor is on the form and required (SellPayRow's must);
  // saved first, as for Post ticket. isoSum: who is invited to pay what, for how many, said above "List and invite <first name>".
  const isoB = iso ? PEOPLE[iso.userId].first : "";
  // §9x item 1 (SELL6-N1): a free ticket (the price typed is $0) is paid for by nobody, so the form asks for no way to be paid, on a
  // form for a request (payMust) or any other: the payment row gives way to one line saying so, and nothing typed there is saved.
  const freeTicket = LIVE && quick && freeAsk(askStr);
  const payMust = LIVE && !!iso && quick && payAskedToInvite({ ask: askStr, saved: dlv.saved ? dlv.saved.length : 0 });
  const payMustProblem = payMust ? (errs => { const k = errs.findIndex(Boolean); return k < 0 ? null : { i: k, e: errs[k] }; })(payEditorErrors(dlv.paySt, true)) : null;
  const tierMissing = newSeller && !addT; // the event has several ticket types and none is chosen yet
  const canPost = ev && a.ok && (newSeller ? !tierMissing && !addErr && room >= 1 && addQty <= room : h && free > 0) && !askErr && !minErr && ack && quickOk && (!train || (departs && !depErr)); // the preview's (live: canSubmit, below)
  const tierId = newSeller ? addTier : h && h.tier;
  // One-form Sell (live): what "Post ticket" sends, as the form stands. A ticket being added: postTicket, on the event the seller chose
  // (eventId) or with the new one (event), so both are stored together or not at all; a ticket already held and unlisted: list, as
  // before. Handoff never holds the ticket file, and buyers pay with the seller's saved methods, so neither is sent. postKey: the form
  // as it would be sent, which says whether a refusal's words still apply (srv) and whether this is the form whose answer never came
  // (retrying: sent again it reuses that request, so the exact-twin check, which that very request may by now trip, stands aside).
  // §9q item 5: "Members-only ticket" is offered for any ordinary event's ticket (memberTicketOffer) and counts only while it is
  // (memberOn). Its club is the event's own (a new event's: the form's "Club or organizer", required then), or, for an event on
  // Handoff that names none (clubAsked), the one the seller names right at the tick: it goes with the listing (memberClub) and
  // buyers read it before they ask or reserve. The server checks it again and still asks each buyer to confirm.
  // §9v items 4 and 5 (live, SELL5-M2): "This ticket has restrictions" (restrictOffer: members only, an organizer name change, or the
  // seller's own words; none for a train) replaced "Members-only ticket" and "Flag a transfer restriction". rBody: what it sends.
  // The club or organizer: an event's own when it names one (shown in its summary, never asked); a new event's "Club or organizer"
  // (nd.club, in Optional details); or, for an event on Handoff that names none (lclubOn), one the seller may name on their own
  // listing (lclub: never written to the event). It's required only while members only or a name change is chosen and no club is
  // known (clubRule), and then it shows on the form itself (clubPlace) with the focus in it; it goes back when nothing needs it.
  const rOffer = LIVE ? restrictOffer(ev, tierId) : null;
  const rBody = LIVE ? restrictBody(restrict, rOffer) : null;
  const memberOn = LIVE ? rBody.membersOnly : memberTicket;
  const clubRule = LIVE && (rBody.membersOnly || !!rBody.namesChecked);
  const lclubOn = LIVE && !!ev && !isDraft && !ev.club && ev.cat !== "Travel" && isQuick(ev);
  const lclubNeed = lclubOn && clubRule;
  const lclubMsg = !lclubOn ? null : lclub.trim() ? (memberClubName(lclub) ? null : NO_LISTING_CLUB) : lclubNeed && tried ? (rBody.membersOnly ? "Name the club whose members can use this ticket." : "Name the organizer who changes the name on the ticket.") : null;
  const clubAsked = lclubOn && memberOn; // the members-only club is the one named on the listing
  // §9s item 4: a new ordinary event's "Club or organizer". It's needed once the ticket is members-only or needs a name change (§9v:
  // clubNeed). §9y (SELL7-O1): it's always on the form itself (clubAt: clubPlace), optional until then and required in place after.
  // needClub: such a restriction was ticked (on) or unticked; other: another one still needs the club (the focus goes to the field).
  const clubNeed = isDraft && mode === "new" && nd.kind !== "train" && clubRule;
  const clubAt = isDraft && mode === "new" ? clubPlace({ kind: nd.kind, need: clubNeed, reveal: clubReveal }) : lclubOn ? clubPlace({ kind: "event", need: lclubNeed, reveal: clubReveal }) : null;
  const needClub = (on, other) => { const named = isDraft ? nd.club : lclubOn ? lclub : ev && ev.club; if (on && !String(named || "").trim()) { setClubReveal(true); focusSoon("r-club"); } else if (!on && !other) setClubReveal(false); };
  const liveBody = LIVE ? { qty: listQty, ask: askStr, note: note.trim(), ...(effMethod ? { method: effMethod, namesChecked: effMethod === "name" } : {}), ...rBody, ...(lclubOn ? listingClubBody(lclub, rBody.membersOnly) : {}), obo: !ev.premium && obo, minOffer: obo ? minOffer : undefined, departsAt: train ? departs : undefined } : null; // an ordinary event's ticket: no method is sent, so none is stored (§9m item 1), unless the seller chose a name change (§9v item 5)
  const postA = !LIVE ? null : isDraft ? { type: "postTicket", event: newEventAction(what, nd), ...liveBody }
    : newSeller ? { type: "postTicket", eventId: ev.id, ...(ev.tiers.length > 1 ? { tier: addTier } : {}), ...liveBody }
    : h ? { type: "list", holdingId: h.id, viaOrganizer: viaOrg, ...liveBody } : null;
  const postKey = postA ? JSON.stringify(postA) : null;
  const retrying = !!postKey && unanswered.current === postKey;
  const srv = srvErr && srvErr.key === postKey ? srvErr : null;
  // A new event: what would stop it, by field (newEventIssues: the server's rules and words, the exact twin included), and the open event it
  // would be a twin of, offered right at the date ("List on that one").
  const newIssues = LIVE && mode === "new" ? newEventIssues(what, nd, CLOCK, { membersOnly: memberOn, nameChange: !!rBody.namesChecked }).map(x => retrying && (x[2] === TWIN_EVENT || x[2] === TWIN_TRAIN) ? [x[0], x[1], null] : x) : [];
  const fmNew = Object.fromEntries(newIssues.map(([id, missing, wrong]) => [id, wrong || (tried ? missing : null)]));
  const twin = LIVE && mode === "new" && !retrying && newWhen(nd) && nameReady(what) ? eventTwin(nd.kind, what, newWhen(nd)) : null;
  const newTrain = nd.kind === "train", dateId = newTrain ? "r-start" : "r-date";
  const dateMsg = srv && srv.at === "date" ? srv.msg : fmNew[dateId];
  const whatErr = !LIVE || picked ? null : srv && srv.at === "what" ? srv.msg : mode === "new" ? fmNew["r-what"] : whatError("sell", what, tried); // its help line: whatHelp (WhatField)
  const preview = (newSeller ? !tierMissing && !addErr : h) && !askErr ? { ask: pm.value, paid: ev.premium ? paidToDate(ev) : LIVE ? null : newSeller ? addPm.value : h.paid } : null; // live: what was paid isn't shown
  // What still stops posting, in the form's order. A missing answer shows as an error once "Post" was tried; a wrong one at once.
  // A try to post opens Additional details when anything in it is missing.
  const askBlocked = newSeller ? tierMissing || !!addErr : !h; // the asking price can't be checked before the ticket is known
  // §9s item 3 (live): what the line under the price says (askIssue): missing once Post was tried, not an amount, or above the chosen
  // event's face value (askOver). That last one is said beside the price as typed and announced; the price itself is never changed.
  const askSaid = LIVE ? askIssue(askStr, askBlocked ? null : cap, { unit: u, tried }) : null;
  const askOver = !!askSaid && askSaid.over;
  overNow.current = askOver && !(newSeller && ev.tiers.length > 1); // several ticket types: no cap is known until the type is chosen (this render may still hold the last event's type)
  const msg = {
    hold: tried && mine.length > 1 && !h ? `Choose which ${u} you're listing.` : null,
    tier: tried && tierMissing ? "Choose your ticket type." : null,
    paid: !newSeller || LIVE ? null : !addPaid.trim() ? (tried ? `Enter what you paid per ${u}.` : null) : addPm.error || addErr,
    ask: askSaid ? askSaid.msg : !String(askStr).trim() ? (tried ? (ev && ev.premium ? "Enter the reimbursement you're asking for." : `Enter your asking price per ${u}.`) : null) : pm.error || (askBlocked ? null : askErr),
    dep: !train ? null : !departs ? (tried ? "Add your train's departure date and time." : null) : depErr,
    ack: tried && !ack ? "Confirm this to post." : null,
  };
  const lineConfirm = LIVE && quick; // one-form Sell: the confirmation is a line by the button, not a tick (every live event is quick)
  const problems = !ev || !a.ok || !att.ok ? [] : [
    // One-form Sell (live): the event first: nothing chosen yet, or what's missing or wrong in a new one (in Optional details: more).
    isDraft && mode === "search" && { id: "r-what", what: "event" },
    ...(isDraft && mode === "new" ? newIssues.filter(([, missing, wrong]) => missing || wrong).map(([id]) => ({ id, more: NEW_MORE.includes(id), what: NEW_WHAT[id] })) : []), // §9y: the club is on the form itself
    mine.length > 1 && !h && { id: "hold-" + (freeHeld[0] || mine[0]).id, what: `which ${u}` },
    tierMissing && { id: "a-tier", what: "ticket type" },
    newSeller && !LIVE && (addPm.error || addErr) && { id: "a-paid", what: "what you paid" },
    newSeller && room >= 1 && addQty > room && { id: "a-qty", more: LIVE, what: "quantity" }, // live (§9n): the quantity sits in Optional details
    (pm.error || (!askBlocked && askErr)) && { id: "r-ask", what: ev.premium ? "reimbursement" : "asking price" },
    train && (!departs || depErr) && { id: "r-dep", what: "train departure" },
    // The preview: how it changes hands and how buyers pay sit in its details. Live (§9m items 1 and 2): no transfer method is asked (an
    // ordinary event's ticket has none; any other event's one way is set for it), and how buyers pay is a row of the form itself, which
    // stops a post only while its editor is open with something wrong in it.
    !LIVE && quick && !effMethod && { id: "r-mt-" + methodsFor(ev, namesCheckedFor(ev, false))[0], more: true, what: "transfer method" },
    !LIVE && quick && effMethod === "file" && (!dlv.file || dlv.fileErr) && { id: "r-file", more: true, what: "ticket file" },
    quick && !LIVE && !payHandle.trim() && { id: "r-pay", more: true, what: "pay handle" },
    quick && LIVE && !freeTicket && (p => p && { id: payFieldOf("r", dlv, p), what: "how buyers pay you" })(payMust ? payMustProblem : payProblem(dlv)),
    minErr && { id: "r-min", more: true, what: "lowest offer" },
    // §9v items 4 and 5 (live): the club named on the listing (where the event names none), then the restrictions' own fields.
    lclubOn && (!!lclubMsg || (lclubNeed && !lclub.trim())) && { id: "r-club", what: "club or organizer" }, // §9y: on the form itself
    ...(LIVE ? restrictIssues(restrict, rOffer).filter(([, missing, wrong]) => missing || wrong).map(([id]) => ({ id, more: true, what: id === "r-restrict" ? "the restriction" : "the restriction's words" })) : []),
    !lineConfirm && !ack && { id: "r-ack", what: "confirmation" },
  ].filter(Boolean);
  const moreNeeds = problems.filter(p => p.more).map(p => p.what);
  const rMsg = LIVE ? Object.fromEntries(restrictIssues(restrict, rOffer).map(([id, missing, wrong]) => [id, wrong || (tried ? missing : null)])) : {};
  const draftL = preview && ev ? { id: "preview", eventId: ev.id, sellerId: me, listed: listQty, ask: preview.ask, tier: tierId, viaOrganizer: viaOrg, ...(quick ? { method: effMethod, membersOnly: memberOn } : {}), ...(LIVE ? { ...rBody, ...(lclubOn ? listingClubBody(lclub, rBody.membersOnly) : {}) } : {}), obo: !ev.premium && obo && preview.ask > 0, minOffer: minErr ? null : checkMinOffer(minOffer, preview.ask).value, ...(train && departs && !depErr ? { departsAt: departs } : {}) } : null;
  const recipients = draftL && !isDraft ? matchRecipients(s, draftL) : []; // a draft event isn't in the market: no one can be waiting for it
  const isoFit = iso && draftL ? requestMatch(s, iso, draftL) : null; // will it be shared with the request? (only a real fit is)
  const addOnH = !!(ev && tierId && (tierOf(ev, tierId) || {}).addOn); const hu = addOnH ? "add-on" : u; // what this holding is called
  const isoSum = LIVE && iso ? answerSummary({ ask: askStr, listQty, isoQty: iso.qty, budget: iso.budget, first: isoB, unit: hu, cap: askBlocked ? null : cap }) : null; // §9v item 2: no total for a price above the face value (the price field says why)
  const memberTiers = !!ev && hasMemberTiers(ev); // member / non-member labels aren't shown
  // Forms round 2 (live): what "Optional details" holds, the members-only flag (club events) and the transfer-restriction flag; neither
  // applies to a train (its own tag already says to check the carrier's rules), so it isn't shown there.
  const liveMore = !!ev && ((quick && !ev.nonWharton && ev.cat !== "Travel" && !!ev.club && !membersOnlyListing(ev, { tier: tierId })) || (!ev.premium && !(ev.tag && ev.tag.restricted)));
  const postable = !!(ev && a.ok && ((newSeller && room >= 1) || (h && free > 0))); // the listing's fields and Post show; otherwise Cancel alone (and View event)
  const canSubmit = LIVE ? postable && problems.length === 0 : canPost; // live: nothing in the form's list of what still stops it
  // Cancel: a form made for someone's request returns to that request; any other goes back where it was opened (leaveTo).
  const cancel = () => iso ? go("iso", { id: iso.id }) : leaveTo(go, { from, fromId, back });
  // Goods (the switch): Sell an item with your price (if you've entered one) and the note, and this form kept for the way back (sellCarry).
  // The same snapshot is what's kept if the session ends here (keepDraft), and it comes back after sign-in as a carry would.
  const carryNow = () => ({ ...(cin || {}), me, price: carriedAsk.current != null ? carriedAsk.current : askOwn.current ? String(askStr) : undefined, note,
    tickets: { eventId: LIVE ? evKey : eventId, pickEvent, ...(LIVE ? { what, isNew, nd } : {}), holdingId, hId: h ? h.id : null, qty, ask, askOwn: askOwn.current, askEdited, addTier, addQty, addPaid, viaOrg, risk, departs, obo, minOffer, memberTicket, memberClub, moreOpen, ...(LIVE ? { restrict, lclub } : {}), // §9v items 4 and 5 (live): the restrictions and a listing's club
      dlv: { method: dlv.method, file: dlv.file, fileErr: dlv.fileErr, ...(LIVE ? { pay: { open: dlv.payOpen, st: dlv.paySt } } : { payHandle: dlv.payHandle }) } } });
  const toGoods = () => go("sell", { from, fromId, typeFocus: true, carry: carryNow() });
  useDraftSource("page", () => ({ place: { name: "list", eventId: initial, from, fromId, forIso }, data: { list: carryNow() } }));
  // One-form Sell (live): the search field's choices. pick: the seller's tap on a match (or the arrow keys and Enter): that event is
  // chosen, with what was typed below it kept (keepTyped). unpick: Change, back to the field as it was typed. chooseNew: "isn't one of
  // these": the typed name is a new event, and focus goes to its date. The list never takes the focus (the field keeps it), so the
  // keyboard stays up on a phone; Enter in the field picks the highlighted row and never posts the form.
  // (The field itself, its list and its keys: WhatField, which Request a ticket shares.)
  const pick = id => { keepTyped.current = true; focusChange.current = true; setEventId(id); };
  const unpick = () => { keepTyped.current = true; setEventId(""); focusSoon("r-what"); };
  const chooseNew = () => { setIsNew(true); focusSoon(dateId); };
  // §9s item 3 (live): the asking price, on the form before any event is chosen. For a new ordinary event it sits beside the date
  // (askBeside: WhatField shows it there, unless the date has a long message to show); otherwise in its own row under the event.
  // What's wrong is said right under it; a price above the chosen event's face value is announced (role="alert"), and choosing such
  // an event puts the focus in the field (overNow, above).
  const askField = LIVE && postable ? <div className="field ask-field"><label htmlFor="r-ask">Asking price per {u}<Req /></label>
    <div className="money"><span>$</span><input id="r-ask" type="text" inputMode="decimal" value={askStr} onChange={e => { askOwn.current = true; carriedAsk.current = null; askForHolding.current = null; if (newSeller) setAskEdited(true); setAsk(e.target.value); }} aria-required="true" aria-invalid={!!msg.ask} aria-describedby="r-ask-msg" /></div>
    <span id="r-ask-msg" className={msg.ask ? "err" : "help"} role={askOver ? "alert" : undefined}>{msg.ask || (cap != null && Number.isFinite(cap) ? `Up to the face value, ${money(cap)}.` : "")}</span></div> : null;
  const askBeside = !!askField && isDraft && dateBesideAsk({ mode, kind: nd.kind, twin: !!twin || (!!dateMsg && dateMsg.length > 70) });
  const submit = async e => {
    e.preventDefault();
    if (!canSubmit) { // nothing is posted: show every error, open Additional details if needed, and take focus to the first problem
      setTried(true); const p = problems[0]; if (!p) return;
      if (problems.some(x => x.more)) setMoreOpen(true);
      setTimeout(() => { const el = demoElement(p.id); if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center" }); } }, 0);
      return;
    }
    // Live: payment methods typed here are saved to the profile first (follow-on B1); a refusal stops here, with its words by the fields.
    // §9v item 2: on a form for a request the editor is on the form whenever nothing is saved (payMust), so what's typed there is saved.
    if (quick && !freeTicket && !(await savePayFirst(payMust ? { ...dlv, payOpen: true } : dlv, saveProfile, "r"))) { if (!LIVE) setMoreOpen(true); return; } // live: the payment row is on the form itself; a free ticket (§9x item 1) has none
    // Live: Handoff never holds the ticket file (the seller sends it after the payment), so none is sent; nor a handle: buyers pay with the
    // seller's saved methods, copied onto each exchange as it's reserved (the preview keeps its one handle per listing).
    const listA = { type: "list", qty: listQty, ask: askStr, note: note.trim(), viaOrganizer: viaOrg, restricted: risk, ...(quick ? { method: effMethod, namesChecked: effMethod === "name", file: effMethod === "file" && !LIVE ? file : null, ...(LIVE ? {} : { payHandle }), membersOnly: memberTicket } : {}), obo: !ev.premium && obo, minOffer: obo ? minOffer : undefined, departsAt: train ? departs : undefined };
    // A first-time seller's ticket is added and listed in one step, so a failed listing never leaves a stray ticket behind. One-form Sell
    // (live): that one step is postA (postTicket: with a new event too, when the ticket's event is new; a held ticket: list).
    const listing = LIVE ? postA : newSeller ? { type: "addThen", add: { eventId: ev.id, tier: addTier, qty: addQty, paid: addPaid }, then: listA } : { ...listA, holdingId: h.id };
    if (LIVE && !iso) {
      const key = postKey, r = await dispatch(postA);
      if (r.error) { // nothing was stored (an answer that never came: perhaps; the same form sent again settles it). Its words go where they apply.
        unanswered.current = r.code === "lost" ? key : null;
        const part = (r.steps || []).some(x => x.type === "createEvent" && !x.ok && x.error === r.error) ? (/\b(date|departure)\b/i.test(r.error) ? "date" : "what") : "post";
        setSrvErr(r.code === "lost" ? null : { msg: r.error, at: part, key });
        if (r.code !== "lost") focusSoon(part === "date" ? dateId : part === "what" ? "r-what" : "r-post-err");
        return;
      }
      unanswered.current = null; setSrvErr(null);
      const made = (r.steps || []).find(x => x.type === "createEvent" && x.ok); // the new event, when this made one
      // §9s item 5: posting ends on the event's page at the new listing ("Your listing", which says "Ticket listed."; a train's or a
      // trek's own row), with the server's "Ticket listed. …" as the toast. No Share dialog opens by itself: Share is on that page and
      // in My activity, for when the seller wants it. listed: this visit's new listing (never in the address).
      go("event", { id: made ? made.id : ev.id, listing: r.result.id, listed: r.result.id });
      return;
    }
    if (iso && LIVE) { // §9v item 2 (SELL5-M3): "List and invite <first name>": listed and invited in one change (answerRequest)
      // A ticket you hold and haven't listed is listed from its holding; one you add, with its type where the event has several. Nothing
      // else is sent: the request's event is the one. A refusal keeps nothing and shows by the button; an answer that never came: the same
      // form sent again reuses its request (live-link), so the server applies it once. Where it lands says what happened, in the server's
      // words when the request closed meanwhile (the ticket is listed, and no invitation went out).
      const a = answerAction({ isoId: iso.id, holdingId: !newSeller && h ? h.id : "", tier: newSeller && ev.tiers.length > 1 ? addTier : "", body: liveBody });
      const key = postKey, r = await dispatch(a);
      if (r.error) {
        unanswered.current = r.code === "lost" ? key : null;
        setSrvErr(r.code === "lost" ? null : { msg: r.error, at: "post", key });
        if (r.code !== "lost") focusSoon("r-post-err");
        return;
      }
      unanswered.current = null; setSrvErr(null);
      go("event", { id: ev.id, listing: r.result.id, listed: r.result.id, listedNote: answerLanding(r.steps, isoB, hu).note }); // lands as Post ticket does, with what happened
      return;
    }
    const r = await dispatch(listing);
    if (r.error) return;
    if (iso) { // made for a request: share it with them (only if it really fits; the listing stays up either way), then show it on the event page
      const B = PEOPLE[iso.userId].first; const sh = await dispatch({ type: "shareListing", isoId: iso.id, listingId: r.result.id }, true);
      flash(sh.error ? `Listed, but not shared with ${B}'s request: ${sh.error.replace(/^This listing doesn't fit the request\. /, "")}` : `Listed and shared with ${B}'s request. Nothing is held: they ${quick ? "take it or make an offer" : "send a request"} like anyone else.`, sh.error ? "error" : undefined);
      go("event", { id: ev.id, listing: r.result.id });
      return;
    }
    go("event", { id: ev.id }); if (openShare) openShare({ type: "listing", id: r.result.id, justListed: true });
  };

  return (
    <div className="wrap">
      <div className="page-head">
        {!LIVE && <div className="eyebrow">{PEOPLE[me].name}</div>}{/* live (forms round 2, L): PennTools' header shows who is signed in */}
        <h1 style={{ marginTop: 6 }}>Sell a {ev ? u : "ticket"}</h1>
        {/* Forms round 2 (§9j item 3, live): one short line. How reserving and paying work is said where the seller acts on them: the
            confirmation below, how buyers pay, and each request to buy and invitation. The preview keeps its opening. */}
        {LIVE ? <p className="muted sell-lead" style={{ marginTop: 6, maxWidth: "62ch" }}>{iso ? answerLead(isoB, freeTicket) : "Choose your event and set your price."}</p>
          : <p className="muted" style={{ marginTop: 6, maxWidth: "62ch" }}>Can't go? List it at or below what you paid. {!ev || quick ? <>The first buyer to tap “I'll take it” has {TAKE_HOLD} to pay you, then you transfer it.</> : <>Buyers send a request. You have {RULES.sellerResponseHours} hours to accept, then the organizer moves the spot.</>}</p>}
      </div>
      <form className={"form-layout sell-form" + (LIVE ? " one-form" : "")} onSubmit={submit} noValidate={LIVE || undefined}>
        <div className="panel form-stack">
          {/* Tickets & trips | Goods: Goods opens Sell an item, a separate form; the price and note carry over and this form waits for the
              way back (sellCarry). Not on a form made for a request. */}
          {!forIso && <TypeSwitch value="tickets" onPick={toGoods} label="What you're selling" idp="sell" />}
          {iso && <div className="callout for-req" data-for-req=""><b>For {PEOPLE[iso.userId].name}'s request: {plural(iso.qty, u)}{iso.budget != null ? `, up to ${money(iso.budget)}${ev.premium ? " reimbursement" : ""}` : ""}.</b>{LIVE ? "" : " Once it's posted, it's shared with them."}</div>}{/* live (§9v item 2): what posting does is said above its button (isoSum) */}
          {/* §9v item 2 (live): the request this form was opened for closed while it was open (a newer view says so): nothing is invited, and
              the form is an ordinary Sell from here, which it says rather than change silently. */}
          {LIVE && forIso && !iso && (iso0 ? iso0.eventId === eventId : eventId === initial) && <div className="callout warn" data-req-closed="">That request is no longer open, so no invitation will go out. You can still post your {ev ? u : "ticket"} for everyone.</div>}
          {/* 1. Event. One-form Sell (live): the search field "What ticket are you selling?", its matches, and a new event's date; or the
              chosen event as a summary with Change (from an event's page it's chosen already). The preview keeps its event menu. */}
          {LIVE ? <><WhatField idp="r" form="sell" picked={picked} what={what} setWhat={setWhat} setIsNew={setIsNew} nd={nd} setNew={setNew} mode={mode} rows={whatRows} held={heldN} pair beside={askBeside ? askField : null}
            club={clubAt === "form" && isDraft ? { need: clubNeed, err: fmNew["r-club"], help: !clubNeed ? CLUB_HELP_NEW : memberOn ? "A members-only ticket is for this club's members, so it needs the club." : "The organizer changes the name on the ticket, so name them." } : null}
            err={whatErr} dateMsg={dateMsg} twin={twin} onPick={pick} onUnpick={unpick} onNew={chooseNew} trek={{ dispatch, flash, draft: evDraft }} />
            {/* §9v item 4 and §9y (SELL7-O1): an event on Handoff that names no club. The seller may name one on their own listing, here
                on the form under the chosen event, "(optional)" (it was in Optional details); buyers see it with the listing and By club
                finds the event under it. Members only or a name change chosen with no club named makes it required, in place, with the
                focus in it. It's kept on this listing only, never on the event; an event that names its club shows it in the summary
                above and asks nothing. */}
            {lclubOn && clubAt === "form" && <ClubField id="r-club" label={lclubNeed ? "Club or organizer" : "Club or organizer (optional)"} required={lclubNeed} value={lclub} onChange={setLclub} err={lclubMsg}
              help={!lclubNeed ? CLUB_HELP_LISTING : memberOn ? "A members-only ticket is for this club's members, so it needs the club." : "The organizer changes the name on the ticket, so name them."} />}</>
          : <div className="field">
            {ev && !pickEvent ? <>
              <span className="label" id="r-ev-lbl">Event</span>
              <div className="sell-ev" aria-labelledby="r-ev-lbl" role="group">
                <span style={{ minWidth: 0 }}><b>{ev.title}</b><span className="muted">{dotJoin(fmtRange(ev), ev.club)}</span></span>
                <button type="button" id="r-ev-change" className="btn btn-sm btn-ghost" aria-label={`Change event (now ${ev.title})`} onClick={() => { setPickEvent(true); setTimeout(() => { const el = demoElement("r-ev"); if (el) el.focus(); }, 0); }}>Change</button>
              </div>
            </> : <>
              <label htmlFor="r-ev">Event</label>
              <select id="r-ev" value={eventId} onChange={e => setEventId(e.target.value)} aria-describedby={ev ? "r-ev-meta" : undefined}>
                <option value="">Choose an event…</option>
                {(() => { // events you can list now, yours first (a deep link to another event still shows it)
                  const heldN = e => s.holdings.filter(x => x.userId === me && x.eventId === e.id && x.qty > 0).reduce((t, x) => t + holdingFree(s, x), 0);
                  const opts = EVENTS.filter(e => access(e).ok || e.id === eventId);
                  const yours = opts.filter(e => heldN(e) > 0), rest = opts.filter(e => heldN(e) === 0);
                  // Forms round 2 (§9j item 2, live): each option names its date, with the actual start or departure time when one is known
                  // (eventOption; a date-only event's 11:59 PM close is never shown as a time), so two seatings or departures tell apart.
                  const opt = e => <option key={e.id} value={e.id} disabled={!access(e).ok}>{LIVE ? eventOption(e) : e.title}{heldN(e) ? ` · ${heldN(e)} unlisted` : ""}{!access(e).ok ? ` (${access(e).short.toLowerCase()})` : ""}</option>;
                  return yours.length ? <><optgroup label="Your tickets">{yours.map(opt)}</optgroup><optgroup label="All events">{rest.map(opt)}</optgroup></> : rest.map(opt);
                })()}
              </select>
              {ev && <span className="help" id="r-ev-meta">{dotJoin(fmtRange(ev), ev.club)}</span>}
            </>}
            <SuggestEvent s={s} me={me} dispatch={dispatch} />
          </div>}
          {/* What matters for this event, briefly: its transfer rule, and who can use the ticket or what a trip's replacement owes. (Live: for
              an event on Handoff; a new one has no rules to show yet.) */}
          {ev && !isDraft && <div className="sell-context">
            <PolicyDetails ev={ev} compact={a.ok} />
            {a.ok && att.ok && ev.premium && h && <span className="muted">The replacement owes {ev.club} the rest of the trip ({money(remaining(ev, paidToDate(ev)))}{ev.price.fee ? ` plus a ${money(ev.price.fee)} change fee` : ""}) on top of your reimbursement. Who can take it: {ev.eligibility.split(". ")[0].replace(/\.$/, "")}.</span>}
            {a.ok && att.ok && quick && !ev.nonWharton && ev.cat !== "Travel" && membersOnlyListing(ev, { tier: tierId, membersOnly: memberOn }) && <span className="muted" data-member-line=""><b style={{ color: "var(--ink)" }}>Members only:</b> buyers confirm they're {ev.club || (LIVE ? lclub : memberClub).replace(/\s+/g, " ").trim() || "the club's"} members before reserving.</span>}
          </div>}
          {ev && a.ok && !att.ok && <div className="callout warn">{att.reason} You can't hold or list a {u} here.</div>}

          {ev && a.ok && att.ok && mine.length === 1 && (() => { const x = mine[0]; const t = x.tier ? tierOf(ev, x.tier) : null; return (
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Your {u}: <b style={{ color: "var(--ink)" }}>{plural(x.qty, t && t.addOn ? "add-on" : u)}{t && ev.tiers.length > 1 && (t.addOn || !memberTiers) ? ` · ${t.label}` : ""}{ev.premium ? ` · paid so far ${money(askCap(ev, x))}` : LIVE || x.paid == null ? "" : ` · paid ${money(x.paid)}`}</b>{LIVE ? (holdingSource(x.source) ? ` · ${holdingSource(x.source)}` : "") : ` · ${SRC[x.source]}`}</p>); })()}{/* §9x item 4 (live): no "self-reported, not verified" beside your own ticket */}
          {ev && a.ok && att.ok && mine.length > 1 && (
            <div className="field"><span className="label" id="hold-lbl">Which {u}?</span>
              <div className="form-stack" style={{ gap: 8 }} role="radiogroup" aria-labelledby="hold-lbl" aria-describedby={msg.hold ? "hold-msg" : undefined}>
                {mine.map(x => { const f = holdingFree(s, x); const t = x.tier ? tierOf(ev, x.tier) : null; return (
                  <label key={x.id} className={"holding" + (h && h.id === x.id ? " on" : "")}>
                    <input id={"hold-" + x.id} type="radio" name="holding" checked={!!h && h.id === x.id} onChange={() => setHoldingId(x.id)} />
                    <span><b>{plural(x.qty, u)}{t && (t.addOn || !memberTiers) ? ` · ${t.label}` : ""}</b> <span className="muted">· {f} unlisted{ev.premium ? ` · paid so far ${money(askCap(ev, x))}` : LIVE || x.paid == null ? "" : ` · paid ${money(x.paid)}`}</span>{LIVE ? (holdingSource(x.source) ? <><br /><span className="muted" style={{ fontSize: 12.5 }}>{cap1(holdingSource(x.source))}</span></> : null) : <><br /><span className="muted" style={{ fontSize: 12.5 }}>Source: {SRC[x.source]}</span></>}</span>
                  </label>); })}
              </div>
              {msg.hold && <span id="hold-msg" className="err">{msg.hold}</span>}</div>
          )}

          {ev && a.ok && att.ok && mine.length === 0 && ev.premium && <div className="callout warn">Trip spots come from the club's records and can't be self-reported in this demo. You don't hold a spot on this trip.</div>}
          {ev && a.ok && h && free === 0 && <div className="callout warn">All {plural(h.qty, u)} you hold here {h.qty === 1 ? "is" : "are"} already listed or in a transfer. Manage it from My activity.</div>}
          {newSeller && room < 1 && <div className="callout warn">You already hold or have requested the maximum for this event ({personCap(ev)} per person). Finish or cancel your reservation in My activity first.</div>}

          {postable && (() => {
            const maxQ = newSeller ? Math.max(1, Math.min(personCap(ev), room)) : free; // within the per-person limit, or what you hold unlisted
            // One-form Sell (§9l item 3, live) and its follow-up (§9m, §9n): the form itself is the price (with what this event needs: its
            // ticket type where it has several, an older train's departure) and one compact row for how buyers pay; everything else is in
            // Optional details, the quantity (1) included, whose count shows beside those words from two up; then the one-line
            // confirmation and the one action. An ordinary event's ticket is asked for no transfer method and promises none: the line by
            // the button is the neutral rule (sellConfirm). The preview keeps the layout below (its live branches are no longer reached).
            if (LIVE) { const count = qtyNote(listQty, hu); return (
            <>
              {newSeller && ev.tiers.length > 1 && <div className="field"><label htmlFor="a-tier">Ticket type<Req /></label>
                <select id="a-tier" value={addTier} onChange={e => setAddTier(e.target.value)} aria-required="true" aria-invalid={!!msg.tier} aria-describedby="a-tier-msg">
                  <option value="" disabled>Choose your ticket type…</option>
                  {ev.tiers.map(t => <option key={t.id} value={t.id} disabled={t.memberOnly && !mayHoldMemberTier(me, ev)}>{t.label}{faceOf(t) != null ? ` · ${money(t.price)}` : ""}</option>)}
                </select>
                <span id="a-tier-msg" className={msg.tier ? "err" : "help"}>{msg.tier || "As on your ticket: types differ in price, and some are for members only."}</span></div>}
              {/* The asking price (askField), unless it's beside a new event's date above (§9s item 3). */}
              {!askBeside && <div className="row2">{askField}</div>}
              {train && <div className="field"><label htmlFor="r-dep">Your train departs (ET)<Req /></label>
                <input id="r-dep" type="datetime-local" value={departs} min={ev.start} max={ev.openUntil} onChange={e => setDeparts(e.target.value)} aria-required="true" aria-invalid={!!msg.dep} aria-describedby="r-dep-msg" />
                <span id="r-dep-msg" className={msg.dep ? "err" : "help"}>{msg.dep || "Your listing closes when this train leaves. Add the train name or number in the note."}</span></div>}
              {/* How buyers pay you: one compact row (§9m item 2). Posting never needs it. */}
              {quick && !freeTicket && <SellPayRow d={dlv} show={tried} must={payMust ? isoB : null} />}
              {quick && freeTicket && <p className="pay-sum pay-row-line" id="r-pay-free" data-pay-row="free">Free ticket: there's nothing to pay, so no payment method is needed.</p>}
              <details className="srcs sell-more" open={moreOpen} onToggle={e => setMoreOpen(e.currentTarget.open)}>
                {/* §9n: from two up, the count stays beside the words, open or closed. */}
                <summary>Optional details{count ? <b className="more-count" id="r-qty-count" data-qty-count=""> · {count}</b> : null}{moreNeeds.length > 0 ? <span className={tried ? "err" : "sell-needs"}> · needed: {moreNeeds.join(", ")}</span> : !moreOpen ? <span className="muted sell-more-hint"> · {isDraft && mode === "new" ? "face value, venue, " : ""}{count ? "" : "quantity, "}offers, a note{rOffer ? ", restrictions" : ""}</span> : null}</summary>
                <div className="form-stack" style={{ marginTop: 12, gap: 14 }}>
                  {/* A new event's own details (createEvent's optional fields): none is needed to post. §9v item 5: names checked at the
                      door is no longer one of them on Sell; a name change is one of the ticket's restrictions, below. */}
                  {isDraft && mode === "new" && <>
                    <NewEventMore idp="r" nd={nd} setNew={setNew} fm={fmNew} names={false} />
                    <b className="more-h" id="r-more-l">Your listing</b>
                  </>}
                  {/* How many (§9n): one, unless the seller chooses more, within the per-person limit or what they hold unlisted. Several
                      tickets at one price are one listing with one link. */}
                  <div className="field sell-qty">
                    {maxQ > 1 ? <>
                      <label htmlFor={newSeller ? "a-qty" : "r-qty"}>Quantity</label>
                      {newSeller
                        ? <select id="a-qty" value={addQty} onChange={e => setAddQty(+e.target.value)} aria-describedby="r-qty-help">{Array.from({ length: maxQ }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
                        : <select id="r-qty" value={qty} onChange={e => setQty(+e.target.value)} aria-describedby="r-qty-help">{Array.from({ length: maxQ }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>}
                    </> : <><span className="label">Quantity</span><span className="sell-static">1 {hu}</span></>}
                    <span className="help" id="r-qty-help">{newSeller ? (personCap(ev) === 1 ? "One per person for this event." : `Up to ${maxQ}: ${personCap(ev)} per person, counting what you hold or have requested here.`) : `You have ${plural(free, "unlisted " + hu)}.`}{maxQ > 1 ? " Several at one price are one listing with one link." : ""}</span>
                  </div>
                  {/* Offers (§9j item 3's words; what they involve shows once it's ticked), then the note. */}
                  <div className="field">
                    <label className="check" htmlFor="r-obo"><input id="r-obo" type="checkbox" checked={obo} onChange={e => setObo(e.target.checked)} aria-describedby={obo ? "r-obo-help" : undefined} /><span>Open to offers</span></label>
                    {obo && <span className="help" id="r-obo-help">{quick && inviteFlowOn() ? `Buyers can offer less than your price. An offer comes as a request to buy at the buyer's price: you invite them to pay at that price or more, or decline. Requests last ${RULES.offerHours} hours (${RULES.offerHoursSoon} if the event is less than a day away).` : `Buyers can offer less than your price. You accept, counter once or decline each offer. Offers last ${RULES.offerHours} hours (${RULES.offerHoursSoon} if the event is less than a day away), and a full-price “I'll take it” still wins. If you accept one, the buyer has ${OFFER_HOLD} to pay, since they may not see it at once.`}</span>}
                  </div>
                  {obo && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="r-min">Lowest offer you'd consider (optional)</label>
                    <div className="money"><span>$</span><input id="r-min" type="text" inputMode="decimal" value={minOffer} onChange={e => setMinOffer(e.target.value)} aria-invalid={!!minErr} aria-describedby="r-min-msg" /></div>
                    <span id="r-min-msg" className={minErr ? "err" : "help"}>{minErr || "Shown to buyers as \"offers from $X\"."}</span></div>}
                  <div className="field"><label htmlFor="r-note">Note for buyers (optional)</label>
                    <textarea id="r-note" value={note} maxLength={280} onChange={e => setNote(e.target.value)} placeholder={ev.cat === "Travel" ? "e.g. Northeast Regional 171, coach" : "e.g. Can send it today."} /></div>
                  {/* §9m item 1: only an event with one valid way says how its ticket changes hands (a train's eTicket; a trek's or a
                      names-checked event's organizer name change): its own rule, set without asking. An ordinary event's ticket shows
                      nothing here: no "How you'll transfer it", no choices. How buyers pay is the row above. */}
                  {quick && !!effMethod && <DeliveryFields ev={ev} s={s} d={dlv} showMissing={tried} auto pay={false} />}
                  {/* §9v item 5: one unticked entry point, "This ticket has restrictions" (it replaced "Members-only ticket" and "Flag a
                      transfer restriction"). Ticked, the seller picks what applies: members only, an organizer name change, or their own
                      short words. Only what's needed is asked: the club, where it isn't known, comes onto the form (needClub, clubPlace).
                      Buyers read each in plain words before they ask to buy or reserve, and still confirm membership. Nothing for a
                      train: its carrier's rule is its own (restrictOffer). */}
                  {rOffer && <RestrictFields r={restrict} setR={setR} offer={rOffer} club={(ev.club || (isDraft ? nd.club : lclub)).replace(/\s+/g, " ").trim()} msg={rMsg}
                    onClub={(on, other) => needClub(on, other)} />}
                </div>
              </details>
              {/* The confirmation: one line by the button. An ordinary event's ticket: "Send the ticket to the buyer after payment."
                  (no method is named or promised); an event with one valid way names it. No tick: no rule needs one. */}
              {lineConfirm ? <p id="r-confirm" className="sell-confirm">{sellConfirm(hu, (LIVE && rBody.method) || effMethod, freeTicket)}{obo ? ` You'll answer offers within ${RULES.offerHours} hours.` : ""}</p>
                : <div className="field"><label className="check" htmlFor="r-ack"><input id="r-ack" type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} aria-invalid={!!msg.ack} aria-describedby={msg.ack ? "r-ack-msg" : undefined} /><span>I have this {hu} and will send it to the buyer I accept.</span></label>
                  {msg.ack && <span id="r-ack-msg" className="err">{msg.ack}</span>}</div>}
              {/* §9v item 2 (SELL5-M3): before "List and invite <first name>", how many they're invited for and the total, and that the invitation
                  holds nothing; said as the price or the quantity changes. */}
              {iso && <div className="iso-sum" id="r-iso-sum" data-iso-sum="" aria-live="polite">{isoSum
                ? <><p className="iso-sum-lead"><b>{isoSum.lead}</b> {isoSum.line}</p>{isoSum.notes.map(t => <p key={t} className="iso-sum-note">{t}</p>)}<p className="iso-sum-hold">{isoSum.hold}</p></>
                : <p className="iso-sum-hold">{answerHint(askStr, isoB)}</p>}</div>}
              {srv && srv.at === "post" && <p id="r-post-err" className="err" role="alert" tabIndex={-1} style={{ margin: 0 }}>{srv.msg}</p>}
              <div className="actions"><button type="submit" className="btn btn-primary" data-list-invite-send={iso ? "" : undefined} aria-describedby={iso ? "r-iso-sum" : undefined}><Icon name="ticket" size={16} />{iso ? `List and invite ${isoB}` : `Post ${listQty === 1 ? hu : `${listQty} ${hu}s`}`}</button>
                <button type="button" className="btn" onClick={cancel}>Cancel</button></div>
              <p className="err" role="status" style={{ margin: 0 }}>{tried && problems.length > 0 ? `Not posted yet. Check: ${problems.map(p => p.what).join(", ")}.` : ""}</p>
            </>
            ); }
            return (
            <>
              {/* A ticket you're adding for the first time: only what Handoff can't know, its type (when there are several) and what you paid. */}
              {newSeller && <>
                <p className="muted sell-note">{ev.cat === "Travel" ? `You're adding this ticket for the first time. Handoff can't see it, so buyers check the ${ev.paperTicket ? "paper ticket" : "eTicket"} before paying.` : "You're adding this ticket for the first time. Handoff can't see tickets, so your listing shows as not verified."}</p>
                {(!LIVE || ev.tiers.length > 1) && <div className="row2">
                  {ev.tiers.length > 1 && <div className="field"><label htmlFor="a-tier">Ticket type</label>
                    <select id="a-tier" value={addTier} onChange={e => setAddTier(e.target.value)} aria-invalid={!!msg.tier} aria-describedby="a-tier-msg">
                      <option value="" disabled>Choose your ticket type…</option>
                      {ev.tiers.map(t => <option key={t.id} value={t.id} disabled={t.memberOnly && !mayHoldMemberTier(me, ev)}>{t.label}{faceOf(t) != null ? ` · ${money(t.price)}` : ""}</option>)}
                    </select>
                    <span id="a-tier-msg" className={msg.tier ? "err" : "help"}>{msg.tier || "As on your ticket: types differ in price, and some are for members only."}</span></div>}
                  {/* Forms round 2 (live): "What you paid" and its face-value link are gone; the face value alone caps the price. */}
                  {!LIVE && <div className="field"><label htmlFor="a-paid">What you paid per {u}</label>
                    <div className="money"><span>$</span><input id="a-paid" type="text" inputMode="decimal" value={addPaid} onChange={e => setAddPaid(e.target.value)} aria-invalid={!!msg.paid} aria-describedby="a-paid-msg" /></div>
                    <span id="a-paid-msg" className={msg.paid ? "err" : "help"}>{msg.paid || (addT ? `Up to its face value, ${money(addT.price)}. Your price can't be higher.` : "Up to face value. Your price can't be higher.")}</span>
                  </div>}
                </div>}
              </>}
              {/* 2-3. Quantity and asking price. */}
              <div className="row2">
                <div className="field">
                  {maxQ > 1 ? <>
                    <label htmlFor={newSeller ? "a-qty" : "r-qty"}>Quantity</label>
                    {newSeller
                      ? <select id="a-qty" value={addQty} onChange={e => setAddQty(+e.target.value)} aria-describedby="r-qty-help">{Array.from({ length: maxQ }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
                      : <select id="r-qty" value={qty} onChange={e => setQty(+e.target.value)} aria-describedby="r-qty-help">{Array.from({ length: maxQ }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>}
                  </> : <><span className="label">Quantity</span><span className="sell-static">1 {hu}</span></>}
                  <span className="help" id="r-qty-help">{newSeller ? (personCap(ev) === 1 ? "One per person for this event." : `Up to ${maxQ}: ${personCap(ev)} per person, counting what you hold or have requested here.`) : `You have ${plural(free, "unlisted " + hu)}.`}</span>
                </div>
                <div className="field"><label htmlFor="r-ask">{ev.premium ? "Reimbursement you're asking for" : `Asking price per ${u}`}</label>
                  <div className="money"><span>$</span><input id="r-ask" type="text" inputMode="decimal" value={askStr} onChange={e => { askOwn.current = true; carriedAsk.current = null; askForHolding.current = null; if (newSeller) setAskEdited(true); setAsk(e.target.value); }} aria-invalid={!!msg.ask} aria-describedby="r-ask-msg" /></div>
                  <span id="r-ask-msg" className={msg.ask ? "err" : "help"}>{msg.ask || (ev.premium ? `No more than you've paid so far (${money(askCap(ev, h))}). No Handoff fee.` : LIVE ? (cap != null && Number.isFinite(cap) ? `Up to the face value, ${money(cap)}.` : "") : newSeller ? "What you paid, or less." : `You paid ${money(h.paid)}. Ask that or less.`)}</span></div>
              </div>
              {/* Forms round 2 (live): the price and whether you're open to offers go together; the rest waits in Optional details.
                  §9j item 3: the checkbox reads "Open to offers", and what offers involve (how they're answered, the lowest one you'd
                  consider) shows only once it's checked. */}
              {LIVE && !ev.premium && <div className="field">
                <label className="check" htmlFor="r-obo"><input id="r-obo" type="checkbox" checked={obo} onChange={e => setObo(e.target.checked)} aria-describedby={obo ? "r-obo-help" : undefined} /><span>Open to offers</span></label>
                {obo && <span className="help" id="r-obo-help">{quick && inviteFlowOn() ? `Buyers can offer less than your price. An offer comes as a request to buy at the buyer's price: you invite them to pay at that price or more, or decline. Requests last ${RULES.offerHours} hours (${RULES.offerHoursSoon} if the event is less than a day away).` : quick ? `Buyers can offer less than your price. You accept, counter once or decline each offer. Offers last ${RULES.offerHours} hours (${RULES.offerHoursSoon} if the event is less than a day away), and a full-price “I'll take it” still wins. If you accept one, the buyer has ${OFFER_HOLD} to pay, since they may not see it at once.` : "Buyers can offer less than your price. You accept or decline each offer. One round, no counter-offers."}</span>}
              </div>}
              {LIVE && !ev.premium && obo && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="r-min">Lowest offer you'd consider (optional)</label>
                <div className="money"><span>$</span><input id="r-min" type="text" inputMode="decimal" value={minOffer} onChange={e => setMinOffer(e.target.value)} aria-invalid={!!minErr} aria-describedby="r-min-msg" /></div>
                <span id="r-min-msg" className={minErr ? "err" : "help"}>{minErr || "Shown to buyers as \"offers from $X\"."}</span></div>}
              {train && <div className="field"><label htmlFor="r-dep">Your train departs{LIVE ? " (ET)" : ""}</label>
                <input id="r-dep" type="datetime-local" value={departs} min={ev.start} max={ev.openUntil} onChange={e => setDeparts(e.target.value)} aria-invalid={!!msg.dep} aria-describedby="r-dep-msg" />
                <span id="r-dep-msg" className={msg.dep ? "err" : "help"}>{msg.dep || "Your listing closes when this train leaves. Add the train name or number in the note."}</span></div>}
              {/* 4. Note. */}
              <div className="field"><label htmlFor="r-note">Note for buyers (optional)</label>
                <textarea id="r-note" value={note} maxLength={280} onChange={e => setNote(e.target.value)} placeholder={ev.premium ? "e.g. Happy to walk you through the trip leads' process." : train ? "e.g. Northeast Regional 171, coach" : viaOrg ? "e.g. Happy to help with the club's steps." : "e.g. Can send it today."} /></div>
              {/* Simplification batch: live, how it changes hands (required) and how buyers pay show in the form, not folded away. */}
              {quick && LIVE && <DeliveryFields ev={ev} s={s} d={dlv} showMissing={tried} />}
              {/* Offers, flags and the longer explanations (the preview: transfer and payment settings too). Its summary names anything still needed. */}
              {/* Forms round 2 (live): "Optional details" (it was "Additional details (optional)"), shown only when something in it applies. */}
              {(!LIVE || liveMore) && <details className="srcs sell-more" open={moreOpen} onToggle={e => setMoreOpen(e.currentTarget.open)}>
                <summary>{LIVE ? "Optional details" : "Additional details"}{moreNeeds.length > 0 ? <span className={tried ? "err" : "sell-needs"}> · needed: {moreNeeds.join(", ")}</span> : null}</summary>
                <div className="form-stack" style={{ marginTop: 12, gap: 14 }}>
                  {quick && !LIVE && <DeliveryFields ev={ev} s={s} d={dlv} showMissing={tried} />}
                  {quick && !ev.nonWharton && ev.cat !== "Travel" && !!ev.club && !membersOnlyListing(ev, { tier: tierId }) && // club events only (an event naming no club has no members-only tickets); a members-only event or ticket type says so above
                    <label className="check" htmlFor="r-member"><input id="r-member" type="checkbox" checked={memberTicket} onChange={e => setMemberTicket(e.target.checked)} /><span><b>Members-only ticket</b>: only {ev.club} members can use it. Buyers confirm they're members before reserving.</span></label>}
                  {!LIVE && !ev.premium && <div className="field">
                    <label className="check" htmlFor="r-obo"><input id="r-obo" type="checkbox" checked={obo} onChange={e => setObo(e.target.checked)} aria-describedby="r-obo-help" /><span><b>Open to offers (OBO)</b>: let buyers offer less than your price.</span></label>
                    <span className="help" id="r-obo-help">{quick && LIVE && inviteFlowOn() ? `An offer comes as a request to buy at the buyer's price: you invite them to pay at that price or more, or decline. Requests last ${RULES.offerHours} hours (${RULES.offerHoursSoon} if the event is less than a day away).` : quick ? `You accept, counter once or decline each offer. Offers last ${RULES.offerHours} hours (${RULES.offerHoursSoon} if the event is less than a day away), and a full-price “I'll take it” still wins. If you accept one, the buyer has ${OFFER_HOLD} to pay, since they may not see it at once.` : "You accept or decline each offer. One round, no counter-offers."}</span>
                  </div>}
                  {!LIVE && !ev.premium && obo && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="r-min">Lowest offer you'd consider (optional)</label>
                    <div className="money"><span>$</span><input id="r-min" type="text" inputMode="decimal" value={minOffer} onChange={e => setMinOffer(e.target.value)} aria-invalid={!!minErr} aria-describedby="r-min-msg" /></div>
                    <span id="r-min-msg" className={minErr ? "err" : "help"}>{minErr || "Shown to buyers as \"offers from $X\"."}</span></div>}
                  {!quick && !ev.noOrganizer && !ev.organizerRequired && !ev.premium && <div className="field">
                    <label className="check" htmlFor="r-org"><input id="r-org" type="checkbox" checked={viaOrg} aria-describedby="r-org-help" onChange={e => setViaOrg(e.target.checked)} /><span><b>Organizer approval required</b>: {ev.club} has to approve the swap or put the buyer's name on it, for example if names are checked at the door.</span></label>
                    <span className="help" id="r-org-help">{viaOrg ? `Buyers see "${orgLabel(ev)}". Illustrative club step: ${ev.path}` : "Off: you send it to the buyer yourself."}</span>
                  </div>}
                  {!ev.premium && !(ev.tag && ev.tag.restricted) && <div className="field">
                    <label className="check" htmlFor="r-risk"><input id="r-risk" type="checkbox" checked={risk} onChange={e => setRisk(e.target.checked)} aria-describedby="r-risk-help" /><span><b>Flag a transfer restriction</b>: the ticket's terms may not allow resale or a name change.</span></label>
                    <span className="help" id="r-risk-help">Buyers see "Seller flagged a transfer restriction" and are asked to check before paying.</span>
                  </div>}
                  {ev.premium && <>
                    <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>You've paid {money(askCap(ev, h))} so far: {h.paidAdj ? "what you reimbursed, plus installments you've paid the club since (demo figures)." : "from the organizer's schedule (demo figures)."}</p>
                    <div className="field"><span className="label">What the replacement commits to</span>
                      <CostBreakdown ev={ev} reimb={pm.error ? 0 : pm.value} paid={paidToDate(ev)} /></div>
                    <div className="callout"><b>Replacement requirements:</b> {ev.eligibility}<br /><b>Transfer deadline:</b> {fmtWhen(ev.deadline)} (illustrative)</div>
                  </>}
                  {ev.noShowRule && <div className="callout">{ev.club}'s published rule counts an effort to sell at least 24 hours before the event. Handoff saves a timestamped record when you list. It's evidence of an attempt, not an exemption.</div>}
                </div>
              </details>}
              <div className="field"><label className="check" htmlFor="r-ack"><input id="r-ack" type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} aria-invalid={!!msg.ack} aria-describedby={msg.ack ? "r-ack-msg" : undefined} /><span>{viaOrg
                ? (ev.organizerRequired ? `I have this ${hu}. It moves when ${ev.policy === "approval" ? `${ev.club} approves and ` : ""}the trek operator updates the traveler's booking.` : `I have this ${hu}. It moves when ${ev.club} ${ev.premium || ev.policy === "approval" ? "approves and " : ""}updates the ${ev.premium ? "rooming list" : "name"}.`)
                : quick ? `I have this ${hu} and will ${!effMethod ? "transfer it" : effMethod === "file" && !LIVE ? "confirm the payment" : METHODS[effMethod].verb} as soon as the buyer pays.${obo ? ` I'll answer offers within ${RULES.offerHours} hours.` : ""}`
                : `I have this ${hu} and will ${ev.paperTicket ? "hand it" : ev.cat === "Travel" ? "forward it" : "send it"} to the buyer I accept. I'll answer requests within ${RULES.sellerResponseHours} hours.`}</span></label>
                {msg.ack && <span id="r-ack-msg" className="err">{msg.ack}</span>}</div>
              <div className="actions"><button type="submit" className="btn btn-primary"><Icon name="ticket" size={16} />Post {listQty === 1 ? hu : `${listQty} ${hu}s`}</button>
                <button type="button" className="btn" onClick={cancel}>Cancel</button></div>
              <p className="err" role="status" style={{ margin: 0 }}>{tried && problems.length > 0 ? `Not posted yet. Check: ${problems.map(p => p.what).join(", ")}.` : ""}</p>
            </>
            );
          })()}
          {/* Nothing to post yet (no event chosen) or here (not tradeable, can't attend, the limit reached, nothing unlisted): Cancel all the same. */}
          {!postable && <div className="actions">
            {ev && !a.ok && <button type="button" className="btn" onClick={() => go("event", { id: ev.id })}>{a.kind === "official" ? "View event and official process" : "View event"}</button>}
            <button type="button" className="btn" onClick={cancel}>Cancel</button></div>}
        </div>

        <aside className="rail">
          <div className="eyebrow">Students will see</div>
          {ev && a.ok && preview ? (
            <div className="panel">
              <div className="listing" style={{ padding: 0 }}>
                <Avatar id={me} size={34} />
                <div style={{ minWidth: 0 }}><div className="who">{PEOPLE[me].name}</div>
                  {/* Live (§9n, §9m item 1): several tickets read "2 tickets · $25 each"; a ticket with no transfer method shows no method chip. */}
                  <div className="note">{LIVE && listingQtyLine(listQty, preview.ask, hu) ? <span data-qty-line="">{listingQtyLine(listQty, preview.ask, hu)}</span> : `${plural(listQty, hu)} available`} · just now{train && departs ? ` · train departs ${fmtWhen(departs)}` : ""}</div>
                  <div className="note">{(!LIVE || !quick || !!effMethod) && <span className={"chip " + (viaOrg ? "tone-accent" : "tone-good")}>{quick ? (effMethod ? METHODS[effMethod].label : "Transfer method not chosen") : viaOrg ? orgLabel(ev) : DIRECT_LABEL}</span>}{obo && !ev.premium && <span className="chip tone-accent" style={{ marginLeft: 6 }}>OBO</span>}{!LIVE && quick && ev.attend !== "members" && (memberOn || membersOnlyListing(ev, { tier: tierId })) && <span className="chip" style={{ marginLeft: 6 }}>Members only</span>}{addOnH &&<span className="chip" style={{ marginLeft: 6 }}>Add-on only, not a trek spot</span>}{!LIVE && risk && <span className="chip tone-warn" style={{ marginLeft: 6 }}>Seller flagged a transfer restriction</span>}</div>
                  {/* §9v items 4 and 5 (live): the club named on the listing, and the restrictions as buyers will read them (none: nothing). */}
                  {LIVE && <ListingTerms ev={ev} l={draftL} />}</div>
                <div className="ask">{money(preview.ask)}{ev.premium ? <small>reimbursement</small> : LIVE ? (cap != null && Number.isFinite(cap) ? <small>face value {money(cap)}</small> : null) : <small>you paid {money(preview.paid)}</small>}</div>
              </div>
              {addOnH
                ? <div style={{ marginTop: 14, fontSize: 13.5 }} className="muted">This is an add-on, not a spot, so it doesn't answer requests or alerts. Classmates find it on the event page.</div>
                : isDraft ? <div style={{ marginTop: 14, fontSize: 13.5 }} className="muted">{mode === "new" ? "Its event is new on Handoff, so no one is waiting for it yet. It's added together with this listing when you post." : "Choose your event to see who would hear about it."}</div>
                : <div style={{ marginTop: 14, fontSize: 13.5 }} className="muted">{(k => k ? <><b style={{ color: "var(--ink)" }}>{plural(k, "classmate")}</b> with a matching request would hear right away, plus anyone with a matching private alert.</> : "No one has a matching request yet. Anyone with a matching private alert would hear right away.")(requestersIn(recipients))}</div>}
              {isoFit && !LIVE && <div className={"callout " + (isoFit.ok ? "good" : "warn")} style={{ marginTop: 12 }}>{isoFit.ok
                ? `Fits ${PEOPLE[iso.userId].first}'s request${isoFit.partial ? ` (${isoFit.reasons[isoFit.reasons.length - 1].replace(/\.$/, "").toLowerCase()})` : ""}: it's shared with them when you post.`
                : `As it is, it won't be shared with ${PEOPLE[iso.userId].first}'s request: ${isoFit.reasons.join(" ")}`}</div>}
            </div>
          ) : <div className="empty">{ev && a.ok ? (LIVE && (tierMissing || !String(askStr).trim()) ? `Enter ${tierMissing ? "your ticket type and " : ""}your asking price to preview your listing.` : LIVE && askErr ? "Change your asking price to preview your listing." : newSeller && (tierMissing || !addPaid.trim()) ? `Enter ${tierMissing ? "your ticket type and " : ""}what you paid to preview your listing.` : `Finish your ${u}'s details to preview your listing.`) : `Pick an event and the ${ev ? u : "ticket"} you have to preview your listing.`}</div>}
          {/* §9x item 4 (SELL6-N3, live): no first-time note here any more ("Handoff can't see tickets, so your listing shows as not
              verified."; a train's said buyers check the eTicket). A listing shows no such label now, and Help says it once. */}
          <div className="callout">{ev && !quick ? "No Handoff fees. The buyer pays you directly once the organizer confirms them." : LIVE ? `No Handoff fees. The buyer pays you directly, with one of your payment methods, before you ${effMethod ? "transfer it" : "send the " + hu}.` : "No Handoff fees. The buyer pays you (Venmo or PayPal) before you transfer it."}</div>
        </aside>
      </form>
    </div>
  );
}

/* ============================================================
   GOODS: browse, item, sell, request card
   ============================================================ */
/* The goods cards, the item page, the seller's item panel and a request to buy an item: _components/goods.jsx. Below: Sell an item. */
function SellPage({ s, me, go, dispatch, initialTitle, initialCat, openShare, flash, forIso, from, fromId, back, typeFocus, carry }) {
  // "Sell an item for this request": starts from the request (what, category, its budget as the price) and shares the item once posted, if it fits.
  const iso = forIso ? s.interests.find(i => i.id === forIso && i.kind === "iso" && i.goods && i.userId !== me && liveRequest(s, i)) || null : null;
  // Tickets & trips opens Sell a ticket for the event of the page you came from (an event, or an event's request), else none; if you
  // were on Sell a ticket earlier in this visit, it comes back as you left it (sellCarry).
  const fromIso = from === "request" ? s.interests.find(i => i.id === fromId && (i.kind === "iso" || i.userId === me)) : null;
  const fromEv = from === "event" ? fromId : fromIso && !fromIso.goods ? fromIso.eventId : null;
  // Opened by the Tickets & trips | Goods switch: focus stays on the switch, after App's move to the page heading.
  useEffect(() => { if (!typeFocus) return; const t = setTimeout(() => { const el = demoElement("sell-type-goods"); if (el) el.focus(); }, 0); return () => clearTimeout(t); }, []);
  // What the switch brought (sellCarry): this form as you left it for Tickets & trips, a price entered on either form, and the note.
  const cin = sellCarry(carry, me);
  const priceIn = useRef(!!cin && typeof cin.price === "string"); // the price is one you entered (here or on Sell a ticket): only then does it carry over
  const [d, setD] = useState(() => {
    // Live (§9q item 6): nothing optional is chosen for the seller (GOODS0: no condition, no pickup deadline; `until` is the pickup
    // deadline, `expires` the expiry day once changed). The preview keeps its form's defaults ("Good", pickup by two weeks on).
    const d0 = LIVE ? { ...GOODS0, title: initialTitle || "", cat: GOODS_CATS[initialCat] ? initialCat : "", price: iso && iso.budget != null ? String(iso.budget) : "" }
      : { title: initialTitle || "", cat: GOODS_CATS[initialCat] ? initialCat : "", cond: "Good", price: iso && iso.budget != null ? String(iso.budget) : "", obo: false, minOffer: "", area: "", until: isoDate(CLOCK + 14 * DAY), note: "", photos: [] };
    return cin ? { ...d0, ...(cin.goods || {}), ...(typeof cin.price === "string" ? { price: cin.price } : {}), note: cin.note || "" } : d0;
  });
  // This form as it stands, in the switch's shape (sellCarry); the same snapshot is kept if the session ends here (keepDraft).
  const carryNow = () => ({ ...(cin || {}), me, price: priceIn.current ? d.price : undefined, note: d.note, goods: { title: d.title, cat: d.cat, cond: d.cond, price: d.price, obo: d.obo, minOffer: d.minOffer, area: d.area, until: d.until, ...(LIVE ? { expires: d.expires } : {}), photos: d.photos } });
  const toTickets = () => go("list", { ...(fromEv && Object.prototype.hasOwnProperty.call(EV, fromEv) ? { eventId: fromEv } : {}), from, fromId, typeFocus: true, carry: carryNow() });
  useDraftSource("page", () => ({ place: { name: "sell", cat: initialCat, from, fromId, forIso }, data: { sell: carryNow() } }));
  const [ack, setAck] = useState(false);
  const [tried, setTried] = useState(false); // after a first "Post item", a missing answer shows beside its field (a wrong one shows at once)
  const [photoErr, setPhotoErr] = useState("");
  // Live (§9s item 6): one optional photo, beside the price. A chosen picture is resized and re-encoded in this browser (shrinkPhoto: at
  // most 1280 px on the long side, a JPEG of at most 300 KB, its camera data such as the location left behind) and shown here; nothing
  // leaves the browser until Post item, which sends it beside the one change. It lives in this state only, never in `d`: a kept draft,
  // the Tickets & trips switch and "Post again" carry no image, and it goes when the account changes.
  const [pic, setPic] = useState(null); // { data (base64), url (data: address), w, h, bytes }
  const [picBusy, setPicBusy] = useState(false);
  const [picErr, setPicErr] = useState("");
  const picInput = useRef(null);
  useEffect(() => { setPic(null); setPicErr(""); }, [me]);
  const pickPhoto = () => { setPicErr(""); if (picInput.current) picInput.current.click(); };
  const onPhoto = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    setPicBusy(true); setPicErr("");
    const out = await shrinkPhoto(f);
    setPicBusy(false);
    if (out.error) { setPicErr(out.error); return; } // a photo chosen before stays as it was
    setPic(out); focusSoon("g-photo-replace");
  };
  const dropPhoto = () => { setPic(null); setPicErr(""); focusSoon("g-photo-add"); };
  const [moreOpen, setMoreOpen] = useState(() => LIVE && itemMoreUsed(d)); // live: "Optional details", open for a form that starts with something in it (kept, "Post again", an item for a request)
  const [expOpen, setExpOpen] = useState(() => LIVE && !!d.expires && !d.until); // live: the expiry day's field, behind "Listing expires in 14 days · Change"
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  // Photos are resized in the browser (longest side 800px, JPEG) so they fit in demo storage; nothing is uploaded anywhere.
  const shrink = f => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f); const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, 800 / Math.max(img.width, img.height)); const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      } catch (err) { reject(err); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
  const onPhotos = async e => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length) return;
    const room = MAX_PHOTOS - d.photos.length;
    const imgs = files.filter(f => /^image\//.test(f.type));
    if (!imgs.length) { setPhotoErr("Choose image files (JPEG, PNG or similar)."); return; }
    let err = imgs.length > room ? `Only ${plural(room, "photo")} added: up to ${MAX_PHOTOS} per item.` : "";
    const added = [];
    for (const f of imgs.slice(0, room)) {
      try { const out = await shrink(f); if (out.length > 400000) err = "A photo was too large even after resizing, so it was skipped."; else added.push(out); }
      catch (x) { err = "A photo couldn't be read, so it was skipped."; }
    }
    // Keep the total small enough for this browser's storage.
    const next = [...d.photos]; let total = next.reduce((t, x) => t + x.length, 0);
    for (const a of added) { if (next.length >= MAX_PHOTOS || total + a.length > 1200000) { err = "Those photos are too large together; some were skipped."; break; } next.push(a); total += a.length; }
    set("photos", next); setPhotoErr(err);
  };
  const pm = parseMoney(d.price);
  const priceErr = d.price === "" ? null : pm.error;
  const obo = d.obo && !pm.error && pm.value > 0;
  const minErr = obo ? checkMinOffer(d.minOffer, pm.value).error : null;
  const untilErr = !d.until ? null : atMs(d.until) <= CLOCK ? "Pick a date in the future." : atMs(d.until) > atMs(isoDate(CLOCK + 60 * DAY)) ? "Pick a date within 60 days." : null;
  // Live (§9q item 6): a name and a price are enough (itemIssues: those two, and a wrong date or lowest offer). The listing's last day
  // is the pickup deadline when the seller set one (`until`), else the expiry day (`expires`; 14 days on until changed).
  const expErr = LIVE && !d.until ? itemDateIssue(d.expires) : null;
  const ready = LIVE ? itemIssues(d).length === 0 : d.title.trim() && d.cat && !pm.error && !minErr && d.area.trim() && d.until && !untilErr && ack;
  const moreShown = moreOpen || (LIVE && (!!untilErr || !!minErr)); // a wrong date or lowest offer inside never hides behind the closed line
  const expShown = !d.until && (expOpen || !!expErr);
  // "Change": the expiry day's field; with a pickup deadline set, that date is the one in force, so it opens Optional details at it.
  const changeExpiry = () => { if (d.until) { setMoreOpen(true); focusSoon("g-until"); return; } const o = !expShown; setExpOpen(o); if (o) focusSoon("g-expires"); };
  const free = LIVE && !pm.error && pm.value === 0; // live (forms round 2): an explicit $0 is shown as "Free" everywhere, and takes no offers
  // Live (§9q item 6): the form leads with the item's name and its price, and nothing else is needed.
  const missing = (LIVE ? [!d.title.trim() && "the item's name", d.price === "" && "a price"]
    : [!d.title.trim() && "what you're selling", !d.cat && "a category", d.price === "" && "a price", !d.area.trim() && "a pickup area", !d.until && "a pickup-by date", !ack && "the confirmation"]).filter(Boolean);
  // What stops posting, in the form's order (R6), as Sell a ticket does it: Post item shows each beside its field and focuses the first.
  const need = {
    title: tried && !d.title.trim() ? "Name the item." : null, cat: tried && !d.cat ? "Choose a category." : null,
    price: d.price === "" ? (tried ? "Enter a price, or 0 to give it away." : null) : priceErr,
    area: tried && !d.area.trim() ? "Add a pickup area, like a neighborhood or building (not an address)." : null,
    until: !d.until ? (tried && !LIVE ? "Choose a pickup-by date." : null) : untilErr, ack: tried && !ack ? "Confirm this to post." : null,
  };
  const problems = (LIVE ? itemIssues(d)
    : [!d.title.trim() && { id: "g-title", what: "what you're selling" }, !d.cat && { id: "g-cat", what: "category" }, pm.error && { id: "g-price", what: "price" }, minErr && { id: "g-min", what: "lowest offer" },
    !d.area.trim() && { id: "g-area", what: "pickup area" }, (!d.until || untilErr) && { id: "g-until", what: "pickup-by date" }, !ack && { id: "g-ack", what: "confirmation" }]).filter(Boolean);
  const mo = obo && !minErr ? checkMinOffer(d.minOffer, pm.value).value : null;
  // The preview card. Live: until a price is entered it says "Your price" (noPrice), never "Free": only an explicit 0 is free.
  // Live (§9q item 6): the card shows only what the seller has stated, as buyers will read it: no category, condition or area made up for it.
  const draft = LIVE ? { id: "preview", sellerId: me, title: d.title.trim() || "Your item", ...(d.cat ? { cat: d.cat } : {}), ...(d.cond ? { cond: d.cond } : {}), price: pm.error ? 0 : pm.value, ...(pm.error ? { noPrice: true } : {}), obo, ...(mo ? { minOffer: mo } : {}),
      ...(d.area.trim() ? { area: d.area.trim() } : {}), until: itemDateIssue(itemExpiry(d)) ? defaultExpiry() : itemExpiry(d), ...(d.until ? {} : { noPickupBy: true }), note: d.note, ...(pic ? { photos: [pic.url] } : {}), createdAt: CLOCK, history: [] }
    : { id: "preview", sellerId: me, title: d.title.trim() || "Your item", cat: d.cat || "Other", cond: d.cond, price: pm.error ? 0 : pm.value, obo, ...(mo ? { minOffer: mo } : {}), area: d.area.trim() || "Pickup area", until: d.until && !untilErr ? d.until : isoDate(CLOCK + DAY), note: d.note, ...(d.photos.length ? { photos: d.photos } : {}), createdAt: CLOCK, history: [] };
  const fits = (LIVE || d.cat) && d.title.trim() && !pm.error ? new Set(s.interests.filter(i => isLive(i) && goodsFits(i, draft)).map(i => i.userId)).size : 0; // live: an item with no category fits a request by its name
  const isoFit = iso ? requestMatchItem(s, iso, draft) : null; // will it be shared with the request? (only a real fit is)
  const submit = async e => {
    e.preventDefault();
    if (LIVE && picBusy) { setPicErr("Still preparing your photo. Post again in a moment."); return; }
    if (!ready) { // nothing is posted: every problem shows beside its field, and focus goes to the first
      setTried(true); const p = problems[0];
      if (problems.some(x => x.more)) setMoreOpen(true); // live: a wrong field under Optional details shows
      if (p && p.id === "g-expires") setExpOpen(true);
      if (p) setTimeout(() => { const el = demoElement(p.id); if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center" }); } }, 0);
      return;
    }
    // Live (§9q item 6): the name and the price, and each optional detail only when it's set (itemAction); never the preview's `photos`.
    // §9s item 6: a chosen photo goes beside the change (extra), and a refusal about it is said beside the photo too.
    const post = LIVE ? itemAction(d) : { type: "postItem", data: { ...d, obo } };
    const extra = LIVE && pic ? { photo: pic.data } : undefined;
    const photoSaid = r => { if (LIVE && r.error && /photo/i.test(r.error)) setPicErr(r.error); };
    if (iso && LIVE) { // live, for a request: posted and shared in one change; the share is optional, so the item stays up if it doesn't fit
      const B = PEOPLE[iso.userId].first;
      const r = await dispatch({ type: "seq", steps: [{ action: post }, { action: { type: "shareItem", isoId: iso.id, itemId: "@0" }, optional: true }] }, true, extra);
      if (r.error) { flash(r.error, "error"); photoSaid(r); return; }
      const sh = (r.steps || [])[1] || {};
      flash(sh.ok ? `Posted and shared with ${B}'s request. Nothing is held: they request it or make an offer like anyone else.` : `Posted, but not shared with ${B}'s request: ${String(sh.error || "it doesn't fit.").replace(/^This item doesn't fit the request\. /, "")}`, sh.ok ? undefined : "error");
      go("item", { id: r.result.id, posted: true }); return; // §9v item 3: lands as Post item does ("Item posted.", Done)
    }
    const r = await dispatch(post, false, extra); if (r.error) { photoSaid(r); return; }
    if (iso) { const B = PEOPLE[iso.userId].first; const sh = await dispatch({ type: "shareItem", isoId: iso.id, itemId: r.result.id }, true);
      flash(sh.error ? `Posted, but not shared with ${B}'s request: ${sh.error.replace(/^This item doesn't fit the request\. /, "")}` : `Posted and shared with ${B}'s request. Nothing is held: they request it or make an offer like anyone else.`, sh.error ? "error" : undefined);
      go("item", { id: r.result.id }); return; }
    // §9s item 5, §9v item 3 (live): "Item posted" is the toast and the line at the top of the item's own page, with Done (posted: this
    // visit only, never in the address); the shared market has no Share. The preview keeps its dialog.
    go("item", { id: r.result.id, ...(LIVE ? { posted: true } : {}) }); if (!LIVE && openShare) openShare({ type: "item", id: r.result.id, justListed: true });
  };
  return (
    <div className="wrap">
      <div className="page-head">
        {!LIVE && <div className="eyebrow">{PEOPLE[me].name}</div>}{/* live (forms round 2, L): PennTools' header shows who is signed in */}
        <h1 style={{ marginTop: 6 }}>Sell an item</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: "62ch" }}>Moving out or clearing space? Post it for classmates. You set the price (and can take offers); the buyer picks it up and pays you directly.</p>
      </div>
      <form className="form-layout" onSubmit={submit} noValidate={LIVE || undefined}>{/* live (§9q item 6): the two dates' ranges are checked here, in words, beside each field (the browser's own check would stop Post item without them, also for a date in a closed part of the form) */}
        <div className="panel form-stack">
          {!forIso && <TypeSwitch value="goods" onPick={toTickets} label="What you're selling" idp="sell" />}
          {iso && <div className="callout for-req"><b>For {PEOPLE[iso.userId].name}'s request: {iso.goods.title} ({iso.goods.cat}){iso.budget != null ? `, up to ${money(iso.budget)}` : ""}.</b> Once it's posted, it's shared with them if it fits.</div>}
          {/* Live (§9q item 6): a name and a price are enough. "Item name *" and "Price *" lead (the asterisk is for the eye; the label
              says "(required)" to screen readers and the field carries aria-required), with an explicit $0 shown as "Free". Under them,
              "Listing expires in 14 days · Change": the listing's last day, two weeks on until the seller picks another (at most 60
              days on). Everything else waits under one collapsed "Optional details": the category, the condition, an approximate pickup
              area, a pickup deadline, offers and the description. None of them has a default: what the seller doesn't state isn't sent,
              stored or shown (no "Good", no "Other", no area), and a date reads "Pickup by" only where they chose one, in which case
              the listing closes after that day. Closed, the line beside it says what stands; it opens by itself while a date or a
              lowest offer in it is wrong. No tick: the line above the button says what posting confirms. §9s item 6: "Add photo
              (optional)" sits beside the price (one photo, kept by Handoff in its own table; see pic above). The preview keeps its form,
              below. */}
          {LIVE ? <>
            <div className="field"><label htmlFor="g-title">Item name<Req /></label>
              <input id="g-title" type="text" value={d.title} maxLength={80} onChange={e => set("title", e.target.value)} placeholder="e.g. 27-inch monitor, or IKEA desk" aria-required="true" aria-invalid={!!need.title} aria-describedby={need.title ? "g-title-msg" : undefined} />
              {need.title && <span id="g-title-msg" className="err">{need.title}</span>}</div>
            <div className="g-main-row">
              <div className="field"><label htmlFor="g-price">Price<Req /></label>
                <div className="money"><span>$</span><input id="g-price" type="text" inputMode="decimal" value={d.price} onChange={e => { priceIn.current = true; set("price", e.target.value); }} aria-required="true" aria-invalid={!!need.price} aria-describedby="g-price-msg" /></div>
                <span id="g-price-msg" className={need.price ? "err" : "help"}>{need.price || (free ? "Shown as Free." : "Enter 0 to give it away: it shows as Free.")}</span></div>
              <div className="g-photo-field" data-busy={picBusy ? "" : undefined}>
                <input ref={picInput} id="g-photo" type="file" accept="image/*" className="sr" tabIndex={-1} aria-hidden="true" onChange={onPhoto} />
                {pic ? <div className="g-photo-tile">
                    <img id="g-photo-img" src={pic.url} alt="Your photo" width={pic.w} height={pic.h} />
                    <div className="g-photo-acts">
                      <button type="button" id="g-photo-replace" className="linkish" aria-label="Replace photo" aria-describedby="g-photo-msg" disabled={picBusy} onClick={pickPhoto}>Replace</button>
                      <button type="button" id="g-photo-remove" className="linkish" aria-label="Remove photo" disabled={picBusy} onClick={dropPhoto}>Remove</button>
                    </div>
                  </div>
                  : <button type="button" id="g-photo-add" className="g-photo-add" aria-describedby="g-photo-msg" disabled={picBusy} onClick={pickPhoto}><Icon name="camera" size={20} /><span>Add photo <span className="opt">(optional)</span></span></button>}
              </div>
              <span id="g-photo-msg" className={"g-photo-msg " + (picErr ? "err" : "help")} aria-live="polite">{picBusy ? "Preparing your photo…" : picErr || (pic ? `Resized to ${photoSize(pic.bytes)}, without its location data.` : "")}</span>
            </div>
            <div className="field iso-until g-expiry">
              <p className="iso-until-line"><span id="g-exp-line">{expiryLine(d)}</span> <span className="iso-until-act">· <button type="button" id="g-exp-change" className="linkish" aria-expanded={d.until ? moreShown : expShown} aria-controls={d.until ? "g-more" : "g-exp-box"} onClick={changeExpiry}>Change<span className="sr"> when the listing expires</span></button></span></p>
              <div id="g-exp-box" className="field" hidden={!expShown}>
                <label htmlFor="g-expires">Listing expires at the end of</label>
                <input id="g-expires" type="date" min={isoDate(CLOCK + DAY)} max={isoDate(CLOCK + ITEM_MAX_DAYS * DAY)} value={d.expires || defaultExpiry()} onChange={e => set("expires", e.target.value)} aria-invalid={!!expErr} aria-describedby="g-expires-msg" />
                <span id="g-expires-msg" className={expErr ? "err" : "help"}>{expErr || `Any day up to ${fmtDay(isoDate(CLOCK + ITEM_MAX_DAYS * DAY))}. After it, the item leaves Available.`}</span>
              </div>
            </div>
            <div className="ef-more-head">
              <button type="button" id="g-more-btn" className="linkish ef-more" aria-expanded={moreShown} aria-controls="g-more" onClick={() => setMoreOpen(!moreShown)}>
                <Icon name="chev" size={14} style={moreShown ? { transform: "rotate(180deg)" } : undefined} />Optional details</button>
              {!moreShown && <span className="muted ef-more-hint" id="g-more-hint">{itemMoreHint(d)}</span>}
            </div>
            <div id="g-more" className="form-stack ef-more-body" role="group" aria-labelledby="g-more-btn" hidden={!moreShown}>
              <div className="row2">
                <div className="field"><label htmlFor="g-cat">Category (optional)</label>
                  <select id="g-cat" value={d.cat} onChange={e => set("cat", e.target.value)}><option value="">Not stated</option>{Object.keys(GOODS_CATS).map(c => <option key={c}>{c}</option>)}</select></div>
                <div className="field"><label htmlFor="g-cond">Condition (optional)</label>
                  <select id="g-cond" value={d.cond} onChange={e => set("cond", e.target.value)}><option value="">Not stated</option>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div className="row2">
                <div className="field"><label htmlFor="g-area">Pickup area (approximate, optional)</label>
                  <input id="g-area" type="text" value={d.area} maxLength={60} onChange={e => set("area", e.target.value)} placeholder="e.g. University City, or Huntsman Hall" aria-describedby="g-area-help" />
                  <span className="help" id="g-area-help">A neighborhood or building, never your address.</span></div>
                <div className="field"><label htmlFor="g-until">Pickup deadline (optional)</label>
                  <input id="g-until" type="date" min={isoDate(CLOCK + DAY)} max={isoDate(CLOCK + ITEM_MAX_DAYS * DAY)} value={d.until} onChange={e => set("until", e.target.value)} aria-invalid={!!untilErr} aria-describedby="g-until-msg" />
                  <span id="g-until-msg" className={untilErr ? "err" : "help"}>{untilErr || "Only if it has to go by a day, like a move-out. Buyers then see \"Pickup by\" that day, and the listing closes after it."}</span></div>
              </div>
              <div className="field">
                <label className="check" htmlFor="g-obo"><input id="g-obo" type="checkbox" checked={d.obo} onChange={e => set("obo", e.target.checked)} aria-describedby={d.obo ? "g-obo-help" : undefined} /><span>Open to offers</span></label>
                {d.obo && <span className="help" id="g-obo-help">{free ? "A free item takes no offers." : "Buyers can offer less than your price. You accept or decline each offer."}</span>}
              </div>
              {d.obo && !free && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="g-min">Lowest offer you'd consider (optional)</label>
                <div className="money"><span>$</span><input id="g-min" type="text" inputMode="decimal" value={d.minOffer} onChange={e => set("minOffer", e.target.value)} aria-invalid={!!minErr} aria-describedby="g-min-msg" /></div>
                <span id="g-min-msg" className={minErr ? "err" : "help"}>{minErr || "Shown to buyers as \"offers from $X\". Leave blank to see any offer below your price."}</span></div>}
              <div className="field"><label htmlFor="g-note">Description (optional)</label>
                <textarea id="g-note" value={d.note} maxLength={280} onChange={e => set("note", e.target.value)} placeholder="e.g. 2023 model, works well, charger included." aria-describedby="g-note-help" />
                <span id="g-note-help" className="help">Say what a buyer would want to know: the model or size, how old it is, what's included and any wear.</span></div>
            </div>
            <p id="g-confirm" className="sell-confirm">{GOODS_CONFIRM}</p>
          </> : <>
          <div className="field"><label htmlFor="g-title">What are you selling?</label>
            <input id="g-title" type="text" value={d.title} maxLength={80} onChange={e => set("title", e.target.value)} placeholder="e.g. IKEA desk, white, 120 cm" aria-invalid={!!need.title} aria-describedby={need.title ? "g-title-msg" : undefined} />
            {need.title && <span id="g-title-msg" className="err">{need.title}</span>}</div>
          <div className="field"><span className="label">Photos (up to {MAX_PHOTOS}, recommended)</span>
            <input id="g-photo" type="file" accept="image/*" multiple className="sr file-pick" onChange={onPhotos} disabled={d.photos.length >= MAX_PHOTOS} aria-describedby="g-photo-help" aria-label={d.photos.length ? "Add more photos" : "Add photos"} />
            <div className="photo-pick">
              {d.photos.map((p, k) => <div className="thumb-wrap" key={k}><img src={p} alt={`Your photo ${k + 1}`} />{k === 0 && <span className="cover-tag">Cover</span>}<button type="button" className="btn btn-sm btn-ghost x" aria-label={`Remove photo ${k + 1}`} onClick={() => {
                const last = k === d.photos.length - 1; set("photos", d.photos.filter((_, j) => j !== k)); setPhotoErr("");
                // Removing the last thumbnail unmounts the focused button: hand focus to the previous one, or to the picker.
                if (last) setTimeout(() => { const xs = demoQueryAll(".photo-pick .thumb-wrap .x"); const t = xs[k - 1] || demoElement("g-photo"); if (t) t.focus(); }, 0);
              }}><Icon name="x" size={14} /></button></div>)}
              {d.photos.length < MAX_PHOTOS && <label className="btn btn-sm" htmlFor="g-photo"><Icon name="plus" size={14} />{d.photos.length ? "Add more" : "Add photos"}</label>}
            </div>
            <span id="g-photo-help" className={photoErr ? "err" : "help"}>{photoErr || "Real photos help buyers decide; the first is the cover. On a phone you can take them with the camera. They're resized and saved only in this browser."}</span>
            <span className="sr" aria-live="polite" aria-atomic="true">{photoErr}</span></div>
          <div className="row2">
            <div className="field"><label htmlFor="g-cat">Category</label>
              <select id="g-cat" value={d.cat} onChange={e => set("cat", e.target.value)} aria-invalid={!!need.cat} aria-describedby={need.cat ? "g-cat-msg" : undefined}><option value="">Choose a category…</option>{Object.keys(GOODS_CATS).map(c => <option key={c}>{c}</option>)}</select>
              {need.cat && <span id="g-cat-msg" className="err">{need.cat}</span>}</div>
            <div className="field"><label htmlFor="g-cond">Condition</label>
              <select id="g-cond" value={d.cond} onChange={e => set("cond", e.target.value)}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="field" style={{ maxWidth: 300 }}><label htmlFor="g-price">Price</label>
            <div className="money"><span>$</span><input id="g-price" type="text" inputMode="decimal" value={d.price} onChange={e => { priceIn.current = true; set("price", e.target.value); }} aria-invalid={!!need.price} aria-describedby="g-price-msg" /></div>
            <span id="g-price-msg" className={need.price ? "err" : "help"}>{need.price || "Your price. Enter 0 to give it away."}</span></div>
          <div className="field">
            <label className="check" htmlFor="g-obo"><input id="g-obo" type="checkbox" checked={d.obo} onChange={e => set("obo", e.target.checked)} aria-describedby="g-obo-help" /><span><b>Open to offers (OBO)</b>: let buyers offer less than your price.</span></label>
            <span className="help" id="g-obo-help">You accept or decline each offer.</span>
          </div>
          {d.obo && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="g-min">Lowest offer you'd consider (optional)</label>
            <div className="money"><span>$</span><input id="g-min" type="text" inputMode="decimal" value={d.minOffer} onChange={e => set("minOffer", e.target.value)} aria-invalid={!!minErr} aria-describedby="g-min-msg" /></div>
            <span id="g-min-msg" className={minErr ? "err" : "help"}>{minErr || "Shown to buyers as \"offers from $X\". Leave blank to see any offer below your price."}</span></div>}
          <div className="row2">
            <div className="field"><label htmlFor="g-area">Pickup area</label>
              <input id="g-area" type="text" value={d.area} maxLength={60} onChange={e => set("area", e.target.value)} placeholder="e.g. Rittenhouse" aria-invalid={!!need.area} aria-describedby="g-area-help" />
              <span className={need.area ? "err" : "help"} id="g-area-help">{need.area || "A neighborhood or building, never your address."}</span></div>
            <div className="field"><label htmlFor="g-until">Pickup by</label>
              <input id="g-until" type="date" min={isoDate(CLOCK + DAY)} max={isoDate(CLOCK + 60 * DAY)} value={d.until} onChange={e => set("until", e.target.value)} aria-invalid={!!need.until} aria-describedby="g-until-msg" />
              <span id="g-until-msg" className={need.until ? "err" : "help"}>{need.until || "The listing closes after this day, like a move-out date."}</span></div>
          </div>
          <div className="field"><label htmlFor="g-note">Note (optional)</label>
            <textarea id="g-note" value={d.note} maxLength={280} onChange={e => set("note", e.target.value)} placeholder="e.g. Third floor, no elevator. Can help carry it down." /></div>
          </>}
          {/* Live (§9q item 6): no tick; the line above the button says what posting confirms (GOODS_CONFIRM), as on Sell a ticket. */}
          {!LIVE && <div className="field"><label className="check" htmlFor="g-ack"><input id="g-ack" type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} aria-invalid={!!need.ack} aria-describedby={need.ack ? "g-ack-msg" : undefined} /><span>This is mine to sell, and I'll answer requests within {RULES.sellerResponseHours} hours. Pickup and payment happen between me and the buyer, outside Handoff.</span></label>
            {need.ack && <span id="g-ack-msg" className="err">{need.ack}</span>}</div>}
          {/* Post item always answers: with anything missing or wrong it posts nothing and says what, beside each field (R6). */}
          <div className="actions"><button type="submit" className="btn btn-primary" aria-describedby={(tried ? problems.length : missing.length) ? "g-missing" : undefined}><Icon name="tag" size={16} />Post item</button>
            <button type="button" className="btn" onClick={() => iso ? go("iso", { id: iso.id }) : leaveTo(go, { from, fromId, back })}>Cancel</button></div>
          {tried && problems.length > 0 ? <p id="g-missing" className="err" role="status" style={{ margin: 0 }}>Not posted yet. Check: {problems.map(p => p.what).join(", ")}.</p>
            : missing.length > 0 && <span id="g-missing" className="help">Still needed: {missing.join(", ")}.</span>}
        </div>
        <aside className="rail">
          <div className="eyebrow">Students will see</div>
          <GoodsCard it={draft} s={s} me={me} preview />
          <div className="muted" style={{ fontSize: 13.5 }}>{(LIVE || d.cat) && d.title.trim() ? <><b style={{ color: "var(--ink)" }}>{plural(fits, "classmate")}</b> with a matching request would get {LIVE ? "an" : "a simulated"} in-app alert.</> : LIVE ? "Add a name to see who's looking." : "Add a name and category to see who's looking."}</div>
          {isoFit && <div className={"callout " + (isoFit.ok ? "good" : "warn")}>{isoFit.ok ? `Fits ${PEOPLE[iso.userId].first}'s request: it's shared with them when you post.` : `As it is, it won't be shared with ${PEOPLE[iso.userId].first}'s request: ${isoFit.reasons.join(" ")}`}</div>}
       </aside>
      </form>
    </div>
  );
}

/* ============================================================
   REQUESTS ("Looking for"; ISO, "in search of", in group-chat terms): post, board, detail
   ============================================================ */
/* Post a request: public, with what (an event on Handoff, one that isn't yet, or an item), how many, a public budget, a deadline and an
   optional note. Before posting it shows listings or items that already fit (requestMatch), so nobody posts what they could just take.
   editId (My activity's Edit): the form opens filled in and updates that request; its event or item type can't change.
   One-form Request (USER-INSTRUCTIONS §9m item 3, live; a ticket request that isn't an edit: `one` below). "Request a ticket (ISO)" is
   one form with one final action, "Post request", built as Sell a ticket is:
   - The event is Sell's search field (WhatField, with Sell's rules: sellOptions, sellMode, optionMeta), "What ticket are you looking
     for?": the events on Handoff that match show under it, each its own row with its date, its time where one is known, its venue and
     organizer (two seatings or departures of one name stay two rows); a tap chooses one. Nothing is chosen for the buyer and nothing
     is merged. A name is a new event only by their tap on "isn't one of these", or when nothing on Handoff resembles it: then it stays
     as typed and its date shows right there (a train: its departure). From an event's page that event is chosen already, with Change.
     The event menu and "Not listed? Add it" are gone, and Available's "Post a request for …" opens this form with the search typed in.
   - "Post request" sends one change: the engine's postRequest, on the event the buyer tapped (eventId) or with the new one (event), so
     a new event and its request are stored together or not at all. Until then the new event exists only in this form (draftEvent):
     Cancel, leaving or a refusal leaves nothing behind. A refusal's words go to the field they're about; the same form sent again
     after an answer that never came reuses its request (unanswered), so it's stored once.
   - Defaults: one ticket (the quantity sits in "Optional details"; from two up its count shows beside those words: §9n), no budget
     ("Add max budget"; blank is never $0) and the event's cutoff as the deadline ("Looking until … · Change" for an earlier date).
   Editing a request and a Goods request keep saveInterest and their own fields. The preview keeps its form. */
function PostIsoPage({ s, me, go, dispatch, flash, initialEvent, initialText, market, initialCat, editId, from, fromId, back = "isos", draft, evDraft }) { // draft: this form as typed when a session ended (keepDraft); evDraft: its "A trek? Add it with its details" (the preview: none), kept the same way; initialText: live, the name the search field starts with (Available's "Post a request for …")
  const editing = editId ? s.interests.find(i => i.id === editId && i.userId === me && i.kind === "iso" && i.status === "open") || null : null;
  const E = editing || {}, EM = E.missing || {}, EG = E.goods || null;
  const K = draft && typeof draft === "object" ? pickLike({ mode: "", eventId: "", gTitle: "", gCat: "", qty: 1, budget: "", note: "", exp: "", until: "", more: false, what: "", isNew: false }, draft) : null; // only its own keys, each as typed (until, more: the live form's date and its "Optional details"; what, isNew: its search field)
  const [mode, setMode] = useState(editing ? (EG ? "goods" : E.eventId ? "listed" : "missing") : K && (K.mode === "goods" || K.mode === "listed") ? K.mode : market === "goods" ? "goods" : initialText && !initialEvent && !LIVE ? "missing" : "listed");
  const ticketMode = useRef(mode === "missing" ? "missing" : "listed"); // Tickets & trips' last form (an event on Handoff or not), for a Goods round trip
  // Switching between the event and unlisted-event forms (the link) moves focus to the new form's first field; the link that was clicked
  // can unmount. A Tickets & trips | Goods switch leaves focus on the chosen radio (the radio group pattern).
  const modeWas = useRef(mode); const bySwitch = useRef(false);
  useEffect(() => { if (modeWas.current !== mode && !bySwitch.current) { const t = demoElement(mode === "goods" ? "iso-gtitle" : mode === "listed" ? "iso-ev" : "iso-title"); if (t) t.focus(); } modeWas.current = mode; bySwitch.current = false; }, [mode]);
  const [eventId, setEventId] = useState(editing ? E.eventId || "" : K && K.eventId ? K.eventId : initialEvent || "");
  // Live (forms round 2, §9j): started from an event's page (or kept with its event), the event shows as a summary with Change, as on Sell a ticket.
  const [pickEvent, setPickEvent] = useState(() => !(K && K.eventId ? K.eventId : initialEvent));
  const focusChange = useRef(false); // an event just added through "Not listed? Add it": focus goes to its summary's Change, where the link was
  useEffect(() => { if (!focusChange.current || pickEvent || !EV[eventId]) return; focusChange.current = false; const el = demoElement("iso-ev-change"); if (el) el.focus(); });
  // One-form Request (live): the search field's text (Available's "Post a request for …" starts it; a kept form brings its own back),
  // whether the buyer said it's a new event, and the new event as typed (NEW0). srvErr: a refusal's words, shown at the field they're
  // about while the form is as it was sent ({ msg, at, key }); unanswered: the form as sent when its answer never came (sent again
  // unchanged, it reuses that request, so it's stored once).
  const [what, setWhat] = useState(() => K ? K.what.slice(0, 120) : LIVE && !editing && market !== "goods" && !initialEvent && typeof initialText === "string" ? initialText.slice(0, 120) : "");
  const [isNew, setIsNew] = useState(() => !!(K && K.isNew));
  // §9q item 4: the request form asks a new event's name and date only, so that's all it holds of one. Any other detail a form
  // kept before this brings back is dropped (requestNew): nothing the form doesn't show is checked, read or sent.
  // §9x item 5 (SELL6-N3): plus one optional detail, an ordinary event's club or organizer (in Optional details), which requestNew keeps.
  const [ndAll, setNd] = useState(() => newValues(draft && typeof draft === "object" ? draft.nd : null));
  const nd = requestNew(ndAll);
  const setNew = (k, v) => setNd(p => ({ ...p, [k]: v }));
  const [srvErr, setSrvErr] = useState(null);
  const unanswered = useRef(null);
  const [title, setTitle] = useState(editing ? EM.title || "" : market === "goods" ? "" : initialText || "");
  const [gTitle, setGTitle] = useState(K ? K.gTitle : EG ? EG.title : market === "goods" ? initialText || "" : ""); // an item request: what item
  const [gCat, setGCat] = useState(K && hasOwn(GOODS_CATS, K.gCat) ? K.gCat : EG ? EG.cat : GOODS_CATS[initialCat] ? initialCat : "");
  const [club, setClub] = useState(EM.club || "");
  const [details, setDetails] = useState(EM.details || "");
  const [whenDate, setWhenDate] = useState(EM.when || "");
  const [flexible, setFlexible] = useState(editing && E.missing ? !!EM.flexible : true);
  const [qty, setQty] = useState(K && Number.isInteger(K.qty) && K.qty >= 1 ? K.qty : E.qty || 1);
  const [budget, setBudget] = useState(K ? K.budget : E.budget != null ? String(E.budget) : "");
  const [note, setNote] = useState(K ? K.note : E.note || "");
  // Live (forms round 2, §9j): the budget hides behind "Add max budget" (open for one already given), the note sits in "Optional details"
  // (open for one already written), and the deadline is a date the buyer may choose ("" until they do: untilDflt below). Editing starts
  // from the request's own date while it's still ahead.
  const [budgetOpen, setBudgetOpen] = useState(() => budget !== "");
  const [moreOpen, setMoreOpen] = useState(() => note !== "" || !!(K && K.more) || (LIVE && !!editing && !EG)); // §9q item 4: editing a ticket request opens on what it edits (they're all in Optional details now)
  const [until, setUntil] = useState(() => K && EF_DATE.test(K.until) ? K.until : editing && editing.expires && !isExpired(editing) ? editing.expires.slice(0, 10) : "");
  const [untilOpen, setUntilOpen] = useState(() => !!(K && EF_DATE.test(K.until)));
  const [expPick, setExp] = useState(K && ["keep", "3", "7", "14", "30", "event"].includes(K.exp) && (K.exp !== "keep" || (editing && !isExpired(editing))) ? K.exp : editing && !isExpired(editing) ? "keep" : null); // editing: keep its deadline unless you pick another
  const [tried, setTried] = useState(false); // after a first "Post request", a missing answer shows beside its field (a wrong one shows at once)
  useDraftSource("page", () => ({ place: { name: "post", eventId: initialEvent, market, cat: initialCat, edit: editId, from, fromId }, data: { post: { mode, eventId, gTitle, gCat, qty, budget, note, exp: expPick || "", until, more: moreOpen, ...(LIVE ? { what, isNew, nd } : {}) } } })); // the typed name and the new event's fields: the same account only, never in a URL
  const [sourceUrl, setSourceUrl] = useState(EM.sourceUrl || "");
  const link = cleanUrl(sourceUrl);

  // One-form Request (live; see above). picked: the event on Handoff the buyer chose (their tap, or the page the form opened from).
  // Until then, once a new event's name and date are right, the form reads a draft of it (draftEvent: what createEvent would store),
  // which exists only here: the deadline's default (its cutoff), the per-person limit and the face value's cap follow it.
  const one = LIVE && mode === "listed" && !editing;
  const picked = one && hasOwn(EV, eventId) ? EV[eventId] : null;
  const rows = one && !picked ? sellOptions(what, newWhen(nd)) : [];
  const wmode = one ? sellMode({ picked: !!picked, isNew, text: what, matches: rows.length, when: newWhen(nd) }) : null;
  const dateId = "iso-" + (nd.kind === "train" ? "start" : "date");
  // A new event: what would stop it, by field (newEventIssues: the server's rules and words, with the request's words for an exact twin).
  const rawIssues = one && wmode === "new" ? newEventIssues(what, nd, CLOCK, { idp: "iso", request: true }) : [];
  const isTwin = w => w === TWIN_EVENT_REQUEST || w === TWIN_TRAIN_REQUEST;
  const whenOk = rawIssues.length > 0 && rawIssues.every(([id, missing, wrong]) => id === "iso-what" ? !missing : id === dateId ? !missing && (!wrong || isTwin(wrong)) : true);
  const drafted = whenOk ? draftEvent(what, nd, me) : null;
  const ev = mode === "listed" ? (one ? picked || drafted : EV[eventId]) : null;
  // Until you pick one, the deadline follows the event: a train request matches only trains leaving by its deadline (spotMatch), so it
  // starts at the end of the travel week; anything else starts at a week.
  const exp = expPick || (ev && needsTrain(ev) ? "event" : "7");
  const qtyCap = ev ? personCap(ev) : RULES.maxSpotsPerPerson; // a request can't ask for more than one person may hold
  const a = ev ? (ev === drafted ? { ok: true, kind: "unknown" } : access(ev)) : null; // a draft's date is checked at its own field (newEventIssues)
  const existing = editing || (ev ? myRequestFor(s, me, ev.id) : null); // posting for an event you already asked about updates that request; a private alert stays separate
  const att = ev ? honorAttend(me, ev) : { ok: true };
  const cap = ev ? demandCap(ev) : null;
  const bpm = (LIVE ? budget.trim() : budget) === "" ? null : parseMoney(budget); // live: only spaces is blank too (no budget)
  const budgetErr = bpm && bpm.error ? bpm.error : cap != null && bpm && bpm.value > cap ? (ev.premium ? `Sellers can't ask more than they've paid (${money(cap)}).` : LIVE ? `${FaceName(ev)} is ${money(cap)}, so keep your budget at or below it.` : `The top ticket price is ${money(cap)}. Offers above it aren't allowed.`) : null; // forms round 2 (live): the face value's words; none given, no cap (Infinity)
  const blocked = mode === "listed" && ev && (!att.ok || a.kind === "official" || a.kind === "closed"); // goods mode: a missing name or category is explained by the reducer's error
  const needBudget = !LIVE && mode === "listed" && !!ev && isQuick(ev); // the preview: sellers can hold one at this price. Live (§9j): a budget is optional, and blank means any price
  // Cancel goes back where you came from: the request's card (My activity or its page) when editing, else the page the form was opened from
  // (leaveTo). The event page's own links name no fromId, so their event is the form's.
  const leave = () => editing && from === "activity" ? go("activity", { open: "iso:" + editing.id }) : editing && from === "request" ? go("iso", { id: editing.id })
    : leaveTo(go, { from, fromId: fromId || (from === "event" ? initialEvent || E.eventId : undefined), back });

  const EXP_PICKS = { 3: "In 3 days", 7: "In 1 week", 14: "In 2 weeks", 30: "In 1 month" }; // the deadline menu's choices (a month: items only)
  // The deadline: kept (editing), the event's transfer deadline (lim), or a pick from now. A pick past lim is cut to it, and the help says
  // so (cut: the pick's label); the request saves the shorter date.
  const expOf = () => {
    if (exp === "keep" && editing && editing.expires) return { date: editing.expires };
    const lim = ev ? isoDate(cutoffMs(ev) - 60e3) : null;
    if (exp === "event" && ev) return { date: lim };
    const out = isoDate(CLOCK + (Number(exp) || 7) * DAY); // "event" without an event (mode switched) falls back to a week
    return lim && out > lim ? { date: lim, cut: EXP_PICKS[exp] || null } : { date: out };
  };
  // Live (forms round 2, §9j): "Looking until …". A ticket request runs to its event's cutoff unless the buyer chooses an earlier date
  // (untilMax: the cutoff's date, requestUntil; never later); an item request names a date, a week on until changed, within the 60 days a
  // request may last. A date alone ends at 11:59 PM that day, and the event's own cutoff ends a request sooner (requestEndMs). A request
  // being edited keeps the date it has, even one an older form saved a day past the cutoff.
  const today = isoDate(CLOCK);
  const untilMax = mode === "goods" ? isoDate(CLOCK + 59 * DAY) : ev ? requestUntil(ev) : null;
  const untilDflt = mode === "goods" ? isoDate(CLOCK + 7 * DAY) : untilMax;
  const untilKept = !!editing && until === (editing.expires || "").slice(0, 10);
  const untilErr = !LIVE || !until || untilKept || !untilMax ? null
    : !EF_DATE.test(until) || !Number.isFinite(atMs(until)) || until < today || until > untilMax ? `Choose a date from today to ${fmtDay(untilMax)}.` : null;
  const untilDate = until && !untilErr ? until : untilDflt; // the date the request would have: null until a ticket request has its event
  const untilWords = !untilDate ? "" : mode === "goods" ? fmtDay(untilDate) : fmtUntil(requestEndMs({ expires: untilDate }, ev));
  const untilWhy = !ev || !untilDate ? "" : atMs(untilDate) < cutoffMs(ev) ? "That's the end of the day you chose."
    : ev.deadline ? "That's the event's transfer deadline." : ev.openUntil ? (ev.paperTicket ? "That's when the ticket expires." : "That's the end of the travel week.")
    : ev.kind === "train" ? "That's when the train leaves." : isDateOnly(ev.start) ? "That's the end of the event's day." : ev.kind === "trek" ? "That's when the trek starts." : "That's when the event starts.";
  const expDate = () => LIVE ? untilDate : expOf().date;
  // Another event: a date chosen for the last one stays only while this one allows it (never past its cutoff).
  const pickEv = id => { setEventId(id); const e2 = EV[id]; if (LIVE && until && (!e2 || until > requestUntil(e2))) { setUntil(""); setUntilOpen(false); } };
  // A train request's deadline also limits which trains it matches, so the deadline's help says when it rules some or all of them out.
  const byMs = expDate() ? atMs(expDate()) : NaN;
  const trainNote = !ev || !needsTrain(ev) ? "" : byMs < atMs(ev.start) ? ` Trains for this event leave between ${fmtDay(ev.start)} and ${fmtDay(ev.openUntil || ev.start)}, so no train can match it.` : byMs < closesAt(ev) ? ` Trains leaving after ${fmtDate(expDate())} won't match it.` : "";
  // Supply that already fits this draft: public listings the request would match (quantity, budget, eligibility, a train's departure
  // before the deadline), or available items in the category with a similar name within budget.
  const budgetNow = bpm && !bpm.error ? bpm.value : null;
  const fits = ev && a.ok ? publicListingsFor(s, ev).filter(l => requestMatch(s, { userId: me, eventId: ev.id, qty: Math.min(qty, qtyCap), budget: budgetNow, expires: expDate() }, l).ok) : [];
  const fitUnits = fits.reduce((t, l) => t + listingNumbers(s, l).available, 0);
  const goodsNow = mode === "goods" && gTitle.trim() && gCat ? s.goods.filter(it => requestMatchItem(s, { userId: me, goods: { title: gTitle, cat: gCat }, budget: budgetNow }, it).ok) : [];

  // What stops posting, in the form's order (R6): Post request shows each beside its field and focuses the first, sending nothing. (A wrong
  // budget already says so at once, and keeps Post request off.)
  // One-form Request (live): what "Post request" sends, as the form stands (requestAction: the engine's postRequest, with the event
  // the buyer chose or the new one). postKey: the form as it would be sent, which says whether a refusal's words still apply (srv) and
  // whether this is the form whose answer never came (retrying: sent again it reuses that request, so the exact-twin check, which that
  // very request may by now trip, stands aside).
  const postA = one ? requestAction({ eventId: picked ? picked.id : "", text: what, nd, qty: Math.min(qty, qtyCap), budget, note, until: until && !untilErr ? until : "" }) : null;
  const postKey = postA ? JSON.stringify(postA) : null;
  const retrying = !!postKey && unanswered.current === postKey;
  const srv = srvErr && srvErr.key === postKey ? srvErr : null;
  const newIssues = rawIssues.map(x => retrying && isTwin(x[2]) ? [x[0], x[1], null] : x);
  const fmNew = Object.fromEntries(newIssues.map(([id, missing, wrong]) => [id, wrong || (tried ? missing : null)]));
  // The open event a new one would be a twin of, offered right at the date ("Post on that one").
  const twin = one && wmode === "new" && !retrying && newWhen(nd) && nameReady(what) ? eventTwin(nd.kind, what, newWhen(nd)) : null;
  const dateMsg = srv && srv.at === "date" ? srv.msg : fmNew[dateId];
  const whatErr = !one || picked ? null : srv && srv.at === "what" ? srv.msg : wmode === "new" ? fmNew["iso-what"] : whatError("request", what, tried);
  // The search field's choices (WhatField): the buyer's tap on a match, Change, and "isn't one of these" (focus goes to the date).
  const pick = id => { focusChange.current = true; pickEv(id); setPickEvent(false); };
  const unpick = () => { setEventId(""); focusSoon("iso-what"); };
  const chooseNew = () => { setIsNew(true); focusSoon(dateId); };
  const problems = mode === "listed" ? (one ? [
      !picked && wmode === "search" && { id: "iso-what", what: "event" },
      ...(wmode === "new" ? newIssues.filter(([, missing, wrong]) => missing || wrong).map(([id]) => ({ id, more: newMoreIds("iso").includes(id), what: newFieldName(id) })) : []), // §9y: a new event's optional club is on the form itself
      untilErr && { id: "iso-until", more: true, what: "date" }, // §9q item 4: the earlier end sits in Optional details
    ] : [!ev && { id: "iso-ev", what: "event" }, needBudget && budget.trim() === "" && { id: "iso-budget", what: "budget" }, untilErr && { id: "iso-until", more: LIVE, what: "date" }]).filter(Boolean)
    : mode === "goods" ? [!gTitle.trim() && { id: "iso-gtitle", what: "item" }, !gCat && { id: "iso-gcat", what: "category" }, untilErr && { id: "iso-until", what: "date" }].filter(Boolean) : [];
  const moreNeeds = problems.filter(p => p.more).map(p => p.what);
  const need = tried ? {
    ev: mode === "listed" && !ev ? "Choose an event." : null, budget: needBudget && budget.trim() === "" ? `Add your budget per ${unitOf(ev)}: sellers see it and can hold one for you at that price.` : null,
    gTitle: mode === "goods" && !gTitle.trim() ? "Describe the item you're looking for." : null, gCat: mode === "goods" && !gCat ? "Choose a category." : null,
  } : {};

  async function submit(e) {
    e.preventDefault();
    if (problems.length) { setTried(true); const p = problems[0]; if (p.id === "iso-until") setUntilOpen(true); if (problems.some(x => x.more)) setMoreOpen(true); setTimeout(() => { const el = demoElement(p.id); if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center" }); } }, 0); return; }
    if (one) { // one change: the request, with its event when that's new (postRequest); a refusal stores nothing, and its words go where they apply
      const key = postKey, r = await dispatch(postA, true); // quiet: this form says the answer itself, with where matches show (§9q item 4)
      if (r.error) { // an answer that never came: perhaps stored; the same form sent again settles it (it reuses the request)
        flash(r.error, "error");
        unanswered.current = r.code === "lost" ? key : null;
        const part = (r.steps || []).some(x => x.type === "createEvent" && !x.ok && x.error === r.error) ? (/\b(date|departure)\b/i.test(r.error) ? "date" : "what") : "post";
        setSrvErr(r.code === "lost" ? null : { msg: r.error, at: part, key });
        if (r.code !== "lost") focusSoon(part === "date" ? dateId : part === "what" ? "iso-what" : "iso-post-err");
        return;
      }
      unanswered.current = null; setSrvErr(null);
      // Posted (§9q item 4): the server's words say where matches show (the bell and My activity).
      flash(typeof r.toast === "string" ? r.toast : "");
      if (from === "activity") go("activity", { open: "iso:" + r.result.id });
      else if (from === "event" && picked) go("event", { id: picked.id }); // back to the event, where "Classmates looking" now lists it
      else go("iso", { id: r.result.id, posted: true }); // §9v item 3: its page says "Request posted.", with Done (this visit only)
      return;
    }
    const q = Math.min(qty, qtyCap); const id = editing ? { id: editing.id } : {};
    // Live (§9j): a ticket request names a date only when the buyer chose one, or to change the one it has; left out, the server runs it to
    // the event's cutoff. A blank budget is sent blank: no budget.
    const data = mode === "listed"
      ? (LIVE ? { ...id, eventId, qty: q, budget: budget.trim(), note: note.trim(), ...(until || editing ? { expires: untilDate } : {}) } : { ...id, eventId, qty: q, budget, note: note.trim(), expires: expDate() })
      : mode === "goods" ? { ...id, qty: 1, budget: LIVE ? budget.trim() : budget, note: note.trim(), expires: expDate(), goods: { title: gTitle, cat: gCat } }
      : { ...id, qty: q, budget, note: note.trim(), expires: expDate(), missing: { title, club, when: whenDate, flexible, details, sourceUrl } };
    const r = await dispatch({ type: "saveInterest", data });
    if (r.error) return;
    if (from === "activity") go("activity", { open: "iso:" + r.result.id });
    else if (from === "event" && ev) go("event", { id: ev.id }); // back to the event, where "Classmates looking" now lists it
    else go("iso", { id: r.result.id, ...(LIVE && !editing ? { posted: true } : {}) }); // §9v item 3 (live): a new request's page says "Request posted."
  }

  if (editId && !editing) return <div className="wrap"><div className="page-head"><h1>Request not found</h1><p className="muted" style={{ marginTop: 8 }}>It may have been closed already. Closed requests can't be edited: post a new one.</p><div className="actions" style={{ marginTop: 14 }}><button className="btn" onClick={() => go("activity")}>My activity</button></div></div></div>;
  return (
    <div className="wrap">
      <div className="page-head">
        {/* Live (forms round 2): no line above the title (PennTools' header shows who is signed in), and the title says ISO, the group-chat word. */}
        {!LIVE && <div className="eyebrow">Looking for something? · {PEOPLE[me].name}</div>}
        <h1 style={LIVE ? undefined : { marginTop: 6 }}>{editing ? "Edit your request" : (mode === "goods" ? "Request an item" : `Request ${aUnit(unitOf(ev))}`) + (LIVE ? " (ISO)" : "")}</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: "64ch" }}>Tell classmates what you're looking for.</p>
      </div>
      <form className="form-layout" onSubmit={submit} noValidate={LIVE || undefined}>{/* live: the date field's range is checked here, in words, beside the field (the browser's own check would stop Post request without them, and would refuse a kept date) */}
        <div className="panel form-stack">
          {!editing && (() => { // the entry point picks the kind of request; Tickets & trips | Goods switches it, and the link an event on Handoff or not
            const to = (k, viaSwitch) => { // a deadline the new form doesn't offer goes back to its default
              if (k !== "goods") ticketMode.current = k; bySwitch.current = !!viaSwitch && k !== mode; setMode(k); setTried(false); // the other form hasn't been tried yet
              if ((k !== "listed" && expPick === "event") || (k !== "goods" && expPick === "30")) setExp(null);
              if (LIVE && k !== mode) { setUntil(""); setUntilOpen(false); } // live: a date chosen for the other kind of request doesn't carry over
            };
            return <>
              <TypeSwitch value={mode === "goods" ? "goods" : "tickets"} onPick={t => to(t === "goods" ? "goods" : ticketMode.current, true)} label="What you're looking for" idp="post" />
              {/* Live: a missing event is added to Handoff ("Not listed? Add it", under the event menu); unlisted-event requests are preview only. */}
              {mode !== "goods" && !LIVE && <p className="muted" style={{ margin: 0, fontSize: 13.5 }}><button type="button" className="linkish" style={{ textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => to(mode === "listed" ? "missing" : "listed")}>{mode === "listed" ? "Event not on Handoff?" : "Pick an event on Handoff instead"}</button></p>}
            </>;
          })()}

          {mode === "goods" ? (
            <>
              <div className="row2">
                <div className="field"><label htmlFor="iso-gtitle">What item?</label>
                  <input id="iso-gtitle" type="text" value={gTitle} maxLength={80} onChange={e => setGTitle(e.target.value)} placeholder={LIVE ? "e.g. Monitor, or office chair" : "e.g. Office chair"} aria-invalid={!!need.gTitle} aria-describedby={need.gTitle ? "iso-gtitle-msg" : undefined} />
                  {need.gTitle && <span id="iso-gtitle-msg" className="err">{need.gTitle}</span>}</div>
                <div className="field"><label htmlFor="iso-gcat">Category</label>
                  <select id="iso-gcat" value={gCat} onChange={e => setGCat(e.target.value)} aria-invalid={!!need.gCat} aria-describedby={need.gCat ? "iso-gcat-msg" : undefined}><option value="">Choose a category…</option>{Object.keys(GOODS_CATS).map(c => <option key={c}>{c}</option>)}</select>
                  {need.gCat && <span id="iso-gcat-msg" className="err">{need.gCat}</span>}</div>
              </div>
              <span className="help" style={{ marginTop: -8 }}>You're alerted when someone posts an item in this category with a similar name, within your budget (or open to offers down to it).</span>
              {goodsNow.length > 0 && <div className="callout good supply"><b>{goodsNow.length === 1 ? "1 item is" : `${goodsNow.length} items are`} already listed{budgetNow != null ? " within your budget" : ""}.</b> {editing ? "Request it or make an offer on its page." : "You might not need to post."}
                <span className="actions" style={{ marginTop: 8 }}>{goodsNow.slice(0, 3).map(it => <button key={it.id} type="button" className="btn btn-sm" onClick={() => go("item", { id: it.id })}>View item: {it.title} · {itemPrice(it.price)}{it.obo ? " OBO" : ""}</button>)}</span></div>}
            </>
          ) : mode === "listed" ? (
            <>
              {editing && ev ? <div className="field"><span className="label" id="iso-ev-lbl">Event</span>
                  <div className="sell-ev" role="group" aria-labelledby="iso-ev-lbl"><span style={{ minWidth: 0 }}><b>{ev.title}</b><span className="muted">{dotJoin(fmtRange(ev), ev.club)}</span></span></div>
                  <span className="help">A request stays with its event. To ask about another one, post a new request.</span></div>
                /* One-form Request (§9m item 3, live): Sell's search field, "What ticket are you looking for?": its matches, a new event's
                   date right there, or the chosen event as a summary with Change (from an event's page it's chosen already). */
                : one ? <><WhatField idp="iso" form="request" picked={picked} what={what} setWhat={setWhat} setIsNew={setIsNew} nd={nd} setNew={setNew} mode={wmode} rows={rows}
                    err={whatErr} dateMsg={dateMsg} twin={twin} onPick={pick} onUnpick={unpick} onNew={chooseNew} trek={{ dispatch, flash, draft: evDraft }} />
                  {/* §9x item 5 and §9y (SELL7-O1): a new ordinary event's club or organizer, the one detail of a new event this form asks,
                      on the form itself right under its date (it was in Optional details). Optional: the clubs on Handoff are suggested as
                      it's typed and any name is taken (ClubField); it's saved with the event when the request posts (requestAction), and
                      blank posts just the same. It restricts nothing. Not for a train, and not for an event on Handoff, whose own club
                      shows in its summary above. */}
                  {wmode === "new" && nd.kind !== "train" && <ClubField id="iso-club" label="Club or organizer (optional)" value={nd.club} onChange={v => setNew("club", v)} err={fmNew["iso-club"]} help={CLUB_HELP_NEW} />}</>
                : <div className="field">{/* the preview's event menu */}
                    <label htmlFor="iso-ev">Event</label>
                    <select id="iso-ev" value={eventId} onChange={e => pickEv(e.target.value)} aria-invalid={!!need.ev} aria-describedby={need.ev ? "iso-ev-msg" : undefined}>
                      <option value="">Choose an event…</option>
                      {EVENTS.map(e => { const ax = access(e); const off = ax.kind === "official" || ax.kind === "closed";
                        return <option key={e.id} value={e.id} disabled={off}>{LIVE ? eventOption(e) : e.title}{off ? ` (${ax.short.toLowerCase()})` : ""}</option>; })}
                    </select>
                    {need.ev && <span id="iso-ev-msg" className="err">{need.ev}</span>}
                  </div>}
              {ev && ev !== drafted && <PolicyDetails ev={ev} compact />}
              {ev && !att.ok && <div className="callout warn">{att.reason}</div>}
              {existing && !editing && <div className="callout">You already have a request for this event{isExpired(existing) ? ` (it ended ${fmtDate(existing.expires)})` : ""}. Posting updates it, so classmates see one request from you.{myAlertFor(s, me, ev.id) ? " Your private alert stays as it is." : ""}</div>}
              {fits.length > 0 && <div className="callout good supply"><b>{plural(fitUnits, unitOf(ev))} already listed{budgetNow != null ? " within your budget" : ""}.</b> {(t => editing ? cap1(t) : "You might not need to post: " + t)(`${isQuick(ev) ? (LIVE && inviteFlowOn() ? "ask to buy one" : "take one or make an offer") : "send a request"} on the event page.`)}
                <span className="actions" style={{ marginTop: 8 }}><button type="button" className="btn btn-sm" onClick={() => go("event", { id: ev.id, listing: fits[0].id })}>View event<Icon name="arrow" size={14} /></button></span></div>}
            </>
          ) : (
            <>
              <div className="field"><label htmlFor="iso-title">What is it?</label>
                <input id="iso-title" type="text" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} placeholder="e.g. Spring formal tickets" /></div>
              <div className="row2">
                <div className="field"><label htmlFor="iso-club">Organizer, if you know it</label>
                  <input id="iso-club" type="text" value={club} maxLength={80} onChange={e => setClub(e.target.value)} placeholder="e.g. Social Committee" /></div>
                <div className="field"><label htmlFor="iso-date">Date</label>
                  <input id="iso-date" type="date" min={isoDate(CLOCK)} value={whenDate} disabled={flexible} onChange={e => setWhenDate(e.target.value)} />
                  <label className="check" htmlFor="iso-flex"><input id="iso-flex" type="checkbox" checked={flexible} onChange={e => setFlexible(e.target.checked)} /><span>I'm flexible on dates</span></label></div>
              </div>
              <div className="field"><label htmlFor="iso-details">Details (optional)</label>
                <textarea id="iso-details" value={details} maxLength={280} onChange={e => setDetails(e.target.value)} placeholder="e.g. Two seats together, any night." /></div>
              <div className="field"><label htmlFor="iso-url">Official event link (optional)</label>
                <input id="iso-url" type="text" inputMode="url" value={sourceUrl} maxLength={300} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" aria-invalid={!!link.error} aria-describedby="iso-url-msg" />
                <span id="iso-url-msg" className={link.error ? "err" : "help"}>{link.error || "Helps a reviewer find the event. It doesn't show you're eligible, that transfers are allowed, or that tickets exist."}</span></div>
              <div className="callout warn">This posts demand only. It doesn't create an event. Handoff reviews it, and matching can start once the event is added to Handoff.</div>
            </>
          )}

          {/* Live (§9q item 4): a ticket request is as short as a group-chat post: the event's name (its date too when it's new) and
              "Post request". Everything else sits under ONE collapsed "Optional details": how many (1), the max budget (blank: any
              price; it's public, so its label says so), an earlier end ("Looking until …" is the event's cutoff unless changed) and
              the note. Closed, the line beside it says what stands (isoMoreHint: "1 ticket · any price · until …"; from two up the
              count shows on its own, §9n); it opens by itself while something in it is wrong. No new-event details are asked here.
              An item request keeps its layout ("Add max budget", "Looking until … · Change", then the note). The preview keeps its
              form, below. */}
          {LIVE ? <>
            {mode === "goods" && <div className="row2">
              {budgetOpen ? <div className="field"><label htmlFor="iso-budget">{mode === "goods" ? "Max budget (public, optional)" : `Max budget per ${unitOf(ev)} (public, optional)`}</label>
                  <div className="money"><span>$</span><input id="iso-budget" type="text" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} aria-invalid={!!budgetErr} aria-describedby="iso-budget-msg" /></div>
                  <span id="iso-budget-msg" className={budgetErr ? "err" : "help"}>{budgetErr || (mode === "goods" ? "Items above it won't alert you, unless the seller takes offers down to it. Blank: any price." : `${ev && faceText(ev) ? `Up to ${faceName(ev)} (${money(faceMax(ev))}). ` : ""}Listings above it won't match. Blank: any price.`)}</span></div>
                : <div className="field iso-add"><p className="add-event"><button type="button" id="iso-budget-add" className="linkish" onClick={() => { setBudgetOpen(true); focusSoon("iso-budget"); }}><Icon name="plus" size={14} />Add max budget</button></p></div>}
            </div>}
            {mode === "goods" && untilDate && <div className="field iso-until">
              <p className="iso-until-line"><span id="iso-until-text">Looking until <b>{untilWords}</b></span> <span className="iso-until-act">· <button type="button" id="iso-until-change" className="linkish" aria-expanded={untilOpen || !!untilErr} aria-controls="iso-until-box" onClick={() => { const o = !(untilOpen || !!untilErr); setUntilOpen(o); if (o) focusSoon("iso-until"); }}>Change<span className="sr"> how long you're looking</span></button></span></p>
              <div id="iso-until-box" className="field" hidden={!(untilOpen || !!untilErr)}>
                <label htmlFor="iso-until">{mode === "goods" ? "Look until the end of" : "Stop looking earlier, at the end of"}</label>
                <input id="iso-until" type="date" value={until} min={today} max={untilMax || undefined} onChange={e => setUntil(e.target.value)} aria-invalid={!!untilErr} aria-describedby="iso-until-msg" />
              </div>
              <span id="iso-until-msg" className={untilErr ? "err" : "help"}>{untilErr || `${untilWhy ? untilWhy + " " : ""}After that, your request leaves Wanted and stops alerting you.${untilOpen ? ` You can choose any day up to ${fmtDay(untilMax)}.` : ""}${trainNote}`}</span>
            </div>}
            {(() => { const short = mode !== "goods", count = short ? qtyNote(Math.min(qty, qtyCap), unitOf(ev)) : "", shown = moreOpen || (short && (!!budgetErr || !!untilErr)); return <>
            <div className="ef-more-head">
              <button type="button" id="iso-more-btn" className="linkish ef-more" aria-expanded={shown} aria-controls="iso-more" onClick={() => setMoreOpen(!shown)}>
                <Icon name="chev" size={14} style={shown ? { transform: "rotate(180deg)" } : undefined} />Optional details</button>
              {count && <b className="more-count" id="iso-qty-count" data-qty-count="">{count}</b>}
              {moreNeeds.length > 0 ? <span className={tried ? "err" : "sell-needs"}>needed: {moreNeeds.join(", ")}</span>
                : !shown && <span className="muted ef-more-hint" id="iso-more-hint">{short ? isoMoreHint({ qty: Math.min(qty, qtyCap), unit: unitOf(ev), budget: budgetNow, until: untilWords }) : "A note for classmates"}</span>}{/* §9y: a new event's club is on the form itself, so this line doesn't repeat it */}
            </div>
            <div id="iso-more" className="form-stack ef-more-body" role="group" aria-labelledby="iso-more-btn" hidden={!shown}>
              {mode !== "goods" && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="iso-qty">{unitOf(ev) === "ticket" ? "Tickets" : "Spots"} needed</label>
                <select id="iso-qty" value={Math.min(qty, qtyCap)} onChange={e => setQty(+e.target.value)}>{Array.from({ length: qtyCap }, (_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}</select>
                {ev && ev.perPerson && <span className="help">{ev.perPerson} per person for this event.</span>}</div>}
              {short && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="iso-budget">Max budget per {unitOf(ev)} (public, optional)</label>
                <div className="money"><span>$</span><input id="iso-budget" type="text" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} aria-invalid={!!budgetErr} aria-describedby="iso-budget-msg" /></div>
                <span id="iso-budget-msg" className={budgetErr ? "err" : "help"}>{budgetErr || `${ev && faceText(ev) ? `Up to ${faceName(ev)} (${money(faceMax(ev))}). ` : ""}Listings above it won't match. Blank: any price.`}</span></div>}
              {short && untilDate && <div className="field iso-until">
                <label htmlFor="iso-until">Stop looking earlier, at the end of (optional)</label>
                <input id="iso-until" type="date" value={until} min={today} max={untilMax || undefined} onChange={e => setUntil(e.target.value)} aria-invalid={!!untilErr} aria-describedby="iso-until-msg" />
                <span id="iso-until-msg" className={untilErr ? "err" : "help"}>{untilErr || <><span id="iso-until-text">Looking until <b>{untilWords}</b></span>. {untilWhy ? untilWhy + " " : ""}After that, your request leaves Wanted and stops alerting you. You can choose any day up to {fmtDay(untilMax)}.{trainNote}</>}</span>
              </div>}
              <div className="field"><label htmlFor="iso-note">Note (optional)</label>
                <input id="iso-note" type="text" value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="e.g. Can take it today" aria-describedby="iso-note-help" />
                <span id="iso-note-help" className="help">Shown with your request.</span></div>
            </div>
            </>; })()}
          </> : <>
          <div className="row2">
            {mode !== "goods" && <div className="field"><label htmlFor="iso-qty">{unitOf(ev) === "ticket" ? "Tickets" : "Spots"} needed</label>
              <select id="iso-qty" value={Math.min(qty, qtyCap)} onChange={e => setQty(+e.target.value)}>{Array.from({ length: qtyCap }, (_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}</select>
              {ev && ev.perPerson && <span className="help">{ev.perPerson} per person for this event.</span>}</div>}
            {/* The budget's visibility is in its label, once (USER-INSTRUCTIONS §4.4); the help keeps the price cap (a preview trip: what the club
                gets on top). A trip's or an organizer-run event's budget is optional (the preview only: every live event is a quick one). */}
            <div className="field"><label htmlFor="iso-budget">{mode === "goods" ? "Maximum budget (public, optional)" : ev && ev.premium ? "Maximum reimbursement per spot (public, optional)" : `Maximum budget per ${unitOf(ev)} (public${ev && !needBudget ? ", optional" : ""})`}</label>
              <div className="money"><span>$</span><input id="iso-budget" type="text" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} aria-invalid={!!(budgetErr || need.budget)} aria-describedby="iso-budget-msg" /></div>
              <span id="iso-budget-msg" className={budgetErr || need.budget ? "err" : "help"}>{budgetErr || need.budget || (mode === "goods" ? "Items above it won't alert you, unless the seller takes offers down to it." : !ev ? (LIVE ? "Never above the face value, where the event gives one." : "Never above face value.") : ev.premium ? `On top, the club gets ${money(remaining(ev))} in remaining payments and ${money(ev.price.fee)} in fees.`
                : LIVE ? (faceText(ev) ? `Up to ${faceName(ev)} (${money(faceMax(ev))}).` : "") : `Up to the top ticket price (${money(faceMax(ev))}).`)}</span></div>{/* forms round 2 (live): only where the event gives a face value */}
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="iso-exp">Deadline</label>
              <select id="iso-exp" value={exp} onChange={e => setExp(e.target.value)} aria-describedby="iso-exp-msg">
                {editing && editing.expires && !isExpired(editing) && <option value="keep">Keep {fmtDate(editing.expires)}</option>}
                {["3", "7", "14", ...(mode === "goods" ? ["30"] : [])].map(k => <option key={k} value={k}>{EXP_PICKS[k]}</option>)}
                {ev && <option value="event">{ev.openUntil ? (ev.paperTicket ? "When the ticket expires" : "At the end of the travel week") : "At the transfer deadline"}</option>}
              </select>
              {/* When the event's transfer deadline comes before the picked time, the deadline is that date, and the help says so. */}
              <span id="iso-exp-msg" className="help">Needed by {fmtDate(expDate())}{expOf().cut ? `, the transfer deadline (sooner than ${expOf().cut.toLowerCase()})` : ""}. Then it leaves Wanted and stops alerting you.{trainNote}</span></div>
            <div className="field"><label htmlFor="iso-note">Note (optional)</label>
              <input id="iso-note" type="text" value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="e.g. Can take it today" /></div>
          </div>
          </>}
          {!LIVE && <AlertOptIn s={s} me={me} dispatch={dispatch} idp="iso-al" compact />}
          <p className="help post-note">Posting a request doesn't reserve anything.</p>
          {srv && srv.at === "post" && <p id="iso-post-err" className="err" role="alert" tabIndex={-1} style={{ margin: 0 }}>{srv.msg}</p>}
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={blocked || !!budgetErr || (mode === "missing" && !!link.error)}><Icon name="hand" size={16} />{existing ? "Update request" : "Post request"}</button>
            <button type="button" className="btn" onClick={leave}>Cancel</button>
          </div>
          <p className="err" role="status" style={{ margin: 0 }}>{tried && problems.length > 0 ? `Not ${existing ? "updated" : "posted"} yet. Check: ${problems.map(p => p.what).join(", ")}.` : ""}</p>
        </div>
        <aside className="rail">
          {/* §9q item 4 (live): the email line left this form for the step it's about: the buyer reads it right before "Reserve and
              pay", on the invitation (the exchange's card). An item request keeps its own line; the preview keeps both. */}
          {(!LIVE || mode === "goods") && <div className="callout">{mode === "goods" ? "Your contact details stay private until you both agree to share them." : "Your email is shared only with a seller once a ticket is reserved for you."}</div>}
          {mode === "listed" && ev && ev !== drafted && demandAllowed(ev) && att.ok && <div className="callout">{LIVE ? "Rather not post publicly?" : "Rather keep your budget to yourself?"} <button type="button" className="linkish" style={{ textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => go("event", { id: ev.id, notify: true })}>Get notified instead</button>: a private alert that posts nothing.</div>}
        </aside>
      </form>
    </div>
  );
}

/* A public request's card (IsoCard), its owner's controls (RequestManage), a private alert's card (AlertCard) and whether a request can
   be answered (answerable): _components/requests.jsx. Deadline wording (deadlineText, demoDay): _lib/format.js. */

/* One request as a compact text card in Available's card style, read top to bottom: what (linked to the event's own page, or the request
   page for an unlisted event or an item); who asked and when, with the category; the dates or the item; a short note (an unlisted event's
   details when there's no note); then a footer with the need (how many, the public budget, the deadline) and the action area. "A listing
   may match" only when one really fits (requestMatch, requestMatchItem) and opens that listing on the event page, or the item. One
   action: "I have this" (someone else's request, when it can be answered; otherwise "View request"), or "Your request" (yours, in My
   activity). The match link sits outside .req-side, so the row's action stays the first button there. */
function RequestRow({ i, s, me, go }) {
  const ev = i.eventId ? EV[i.eventId] : null, gd = i.goods || null, mine = i.userId === me, unlisted = !ev && !gd, miss = i.missing || {};
  const where = gd ? `Secondhand · ${gd.cat}` : ev ? dotJoin(fmtRange(ev), ev.club) : [miss.flexible || !miss.when ? "Flexible dates" : fmtDay(miss.when), miss.club].filter(Boolean).join(" · ");
  const fit = ev ? publicListingsFor(s, ev).find(l => requestMatch(s, i, l).ok) : gd ? s.goods.find(it => requestMatchItem(s, i, it).ok) : null;
  const note = i.note || (unlisted ? miss.details : "");
  const tid = "rq-t-" + i.id;
  // The category chip's icon in the category's color, as on Available's cards; an unlisted event has no category yet (the plain ticket).
  const [catIcon, catColor] = gd ? (GOODS_CATS[gd.cat] || GOODS_CATS.Other) : ev ? catLook(ev.cat) : ["ticket", null];
  return (
    <li className="req-row" data-iso={i.id}>
      <div className="req-main">
        <h3 id={tid}><button className="linkish" onClick={() => ev ? go("event", { id: ev.id }) : go("iso", { id: i.id })}>{isoTitle(i)}</button></h3>
        <div className="req-by"><Avatar id={i.userId} size={22} /><span className="req-who">{PEOPLE[i.userId].name}</span><span>· {ago(i.createdAt)}</span><span className="chip req-cat"><Icon name={catIcon} size={13} style={catColor ? { color: catColor } : undefined} />{gd ? "Goods" : DISC_LABEL[ev ? catOf(ev) : "events"]}</span></div>
        <p className="req-meta">{where}</p>
        {note && <p className="req-note">“{note}”</p>}
        {unlisted && <p className="req-flag"><Icon name="info" size={14} />Event not on Handoff yet</p>}
      </div>
      <div className="req-foot">
        {/* Live (forms round 2, §9j): a request with no budget says nothing about one: how many leads, as on a guest's row. */}
        <p className="req-budget">{i.budget != null ? <>Up to <b>{money(i.budget)}</b>{ev && ev.premium ? " reimbursement" : ""}</> : LIVE ? <b>{gd ? "1 item" : plural(i.qty, unitOf(ev))}</b> : "No budget given"}
          <span className="req-sub">{i.budget == null && LIVE ? deadlineText(i) : <>{gd ? "1 item" : plural(i.qty, unitOf(ev))} · {deadlineText(i)}</>}</span></p>
        <div className="req-acts">
          {fit && <button className="req-match" onClick={() => ev ? go("event", { id: ev.id, listing: fit.id }) : go("item", { id: fit.id })} aria-describedby={tid}><Icon name="check" size={14} />{ev ? "A listing may match · view listing" : "An item may match · view item"}</button>}
          <div className="req-side">
            {mine ? <button className="btn btn-sm" onClick={() => go("activity", { open: "iso:" + i.id })} aria-describedby={tid}>Your request</button>
              : !answerable(i) ? <button className="btn btn-sm" onClick={() => go("iso", { id: i.id })} aria-describedby={tid}>View request</button>
              : <button className="btn btn-sm btn-primary" onClick={() => go("iso", { id: i.id })} aria-describedby={tid}><Icon name="hand" size={14} />I have this</button>}
          </div>
        </div>
      </div>
    </li>
  );
}
/* §9s item 7 (live, signed in; the preview keeps RequestRow): one request on Wanted, closer to Available's cards. It leads with a small
   tile and the event's or item's name. The tile is the request's look (_lib/look.js): its event's own, the same as on Available, or for
   a Goods request its category's icon or the seller's real photo of the item the card points to. Under the name, the date and how many
   together; the club; then a stated budget and a deadline only when it's earlier than the event's own end (wantedNeed), so no date shows
   twice. No category chip. Then the note, a real match ("A listing may match · view listing", as before), and a footer with who asked,
   quietly, and the one action: "I have this" (outlined, at least 44 px tall), "Your request" or "View request", as RequestRow's. */
/* §9v item 1 and §9w (live, signed in; SELL5-M4): a Wanted card in the boards' one layout, Available's header and title hierarchy.
   - The coloured header (BoardBand): the request's picture (its event's, the same as on Available: look.js, §9x item 2; a Goods
     request's category icon or the bag, or on the requester's own card the seller's photo of the item that may match) and one line that leads with how many
     are wanted and any stated budget: "2 tickets wanted · Up to $30 each" (wantedHead).
   - The name, which opens this request (its page has View event); the event's date once (a departure's time kept), with the club; an
     earlier deadline when the buyer chose one (wantedNeed); a short note (cardNote: a longer one is read on the request's page).
   - "A listing may match" on the requester's own card only (showsMatch).
   - A footer with who asked, quietly, and the one action: "I have this" (outlined, at least 44 px), "Your request" or "View request".
   The whole card opens the request (its name is the card's link), and its buttons stay their own.
   §9y (SELL7-O1): the club has its own line under the date, as on Available (CardClub; for a request for an event not on Handoff, the
   club its requester typed), and a tap on it applies it in By club (onClub). A train's carrier stays on its date line. */
function WantedCard({ i, s, me, go, onClub = null }) {
  const ev = i.eventId ? EV[i.eventId] : null, gd = i.goods || null, mine = i.userId === me, unlisted = !ev && !gd, miss = i.missing || {};
  const fit = !showsMatch(i, me) ? null : ev ? publicListingsFor(s, ev).find(l => requestMatch(s, i, l).ok) : gd ? s.goods.find(it => requestMatchItem(s, i, it).ok) : null;
  const look = requestLook(i, ev, gd && fit ? photoSrc(fit) : null);
  const { when } = wantedWhen(i, ev), until = wantedNeed(i, ev).until, head = wantedHead(i, ev);
  const note = cardNote(i.note || (unlisted ? miss.details : "")), carrier = ev && ev.cat === "Travel" ? ev.club : null, clubs = gd ? [] : cardClubs(ev, ev ? null : miss.club);
  const tid = "rq-t-" + i.id;
  return (
    <li className="req-row wcard bcard" data-iso={i.id} data-kind={look.cat}>
      <BoardBand look={look}><span className="state want" data-want=""><i />{head.qty}{head.budget && <> · {head.budget}</>}</span></BoardBand>
      <div className="wc-body">
        <h3 id={tid}><button className="stretch" onClick={() => go("iso", { id: i.id })}>{isoTitle(i)}</button></h3>
        {(when || carrier) && <p className="meta wc-when">{dotJoin(when, carrier)}</p>}
        <CardClub names={clubs} onClub={onClub} />
        {until && <p className="wc-need">{until}</p>}
        {note && <p className="req-note">“{note}”</p>}
        {unlisted && <p className="req-flag"><Icon name="info" size={14} />Event not on Handoff yet</p>}
        {fit && <button className="req-match" onClick={() => ev ? go("event", { id: ev.id, listing: fit.id }) : go("item", { id: fit.id })} aria-describedby={tid}><Icon name="check" size={14} />{ev ? "A listing may match · view listing" : "An item may match · view item"}</button>}
      </div>
      <div className="req-foot wc-foot">
        <p className="wc-by"><Avatar id={i.userId} size={20} /><span className="req-who">{PEOPLE[i.userId].name}</span><span>· {ago(i.createdAt)}</span></p>
        <div className="req-acts"><div className="req-side">
          {mine ? <button className="btn btn-sm" onClick={() => go("activity", { open: "iso:" + i.id })} aria-describedby={tid}>Your request</button>
            : !answerable(i) ? <button className="btn btn-sm" onClick={() => go("iso", { id: i.id })} aria-describedby={tid}>View request</button>
            : <button className="btn btn-sm btn-quiet" onClick={() => go("iso", { id: i.id })} aria-describedby={tid}><Icon name="hand" size={15} />I have this</button>}
        </div></div>
      </div>
    </li>
  );
}
/* The preview's Wanted empty state: what hides the requests and the ways out. The Filters panel's one filter here (Needed by) can hide
   every match of a search: Reset filters clears just that, as the panel's does, keeping the search, category, club and goods category,
   and moves focus to Filters (revealDiscTools); "Clear search and filters" shows only when it would clear more than that. No Post a
   request of its own: the page's one is right above (the header's, or the intro's at 860px and below), so there's one. The shared
   market's, signed in or not, is BrowseEmpty (§9s item 2). */
function WantedEmpty({ disc, setDisc }) {
  const q = disc.q.trim(), needOn = disc.need !== "any";
  const clubOn = !!clubOf(disc.club) && CLUB_CATS.includes(disc.cat), goodsCatOn = disc.cat === "goods" && disc.goodsCat !== "All";
  const narrowed = needOn || clubOn || goodsCatOn; // what hides requests besides the search
  const clearsMore = !!q || clubOn || goodsCatOn;
  const resetFilters = () => { setDisc({ need: "any" }); revealDiscTools(demoQuery(".disc .filter-btn")); };
  return (
    <div className="empty" style={{ marginBottom: 40 }}>
      <b style={{ color: "var(--ink)", fontSize: 16 }}>{q ? `No requests match "${q}"${narrowed ? " with these filters" : ""}.` : narrowed ? "No requests match these filters." : `No requests${disc.cat !== "all" ? ` in ${DISC_LABEL[disc.cat]}` : ""} right now.`}</b>
      <span>Looking for something yourself? Post a request so classmates who have one can find you.</span>
      {(needOn || clearsMore) && <div className="actions" style={{ justifyContent: "center" }}>
        {needOn && <button className="btn" onClick={resetFilters}>Reset filters</button>}
        {clearsMore && <button className="btn" onClick={() => setDisc({ q: "", club: null, need: "any", goodsCat: "All" })}>Clear search and filters</button>}
      </div>}
    </div>
  );
}
/* Wanted: what classmates are looking for, as compact request cards. Expired, closed and unactionable requests never show (liveRequest);
   owners still find theirs in My activity. */
function IsoBoard({ s, me, go, disc, setDisc }) {
  const rows = useMemo(() => LIVE ? wantedNow(s, disc) : wantedFor(s, disc), [s, disc]); // §9s item 1: the shared market has no "Needed by"
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      {/* The heading (and, in the preview, the demo date) is in the intro above the controls (DiscIntro), with its own Post a request at 860px and below. */}
      <p className="sr" role="status">{plural(rows.length, "request")}</p>
      {rows.length === 0 ? (LIVE ? <BrowseEmpty side="isos" disc={disc} setDisc={setDisc} /> : <WantedEmpty disc={disc} setDisc={setDisc} />)
        : <ul className={"req-list" + (LIVE ? " board-grid" : "")}>{rows.map(i => LIVE ? <WantedCard key={i.id} i={i} s={s} me={me} go={go} onClub={clubTap(setDisc)} /> : <RequestRow key={i.id} i={i} s={s} me={me} go={go} />)}</ul>}
    </div>
  );
}

/* The second way to answer a request for a student ticket, unchanged in behavior: hold one for that person at their budget (capped at
   what you paid) or one other price. It becomes a listing just for them, held until they accept (then reserved for them while they pay)
   or until the answer window ends; there are no offers on held replies. Shown under "I have this" on the request page. */
function IsoReplyPanel({ i, s, me, go, dispatch, saveProfile }) {
  const ev = EV[i.eventId]; const u = unitOf(ev); const B = PEOPLE[i.userId].first;
  const holds = s.holdings.filter(h => h.userId === me && h.eventId === ev.id && holdingFree(s, h) > 0 && !(tierOf(ev, h.tier) || {}).addOn && !((tierOf(ev, h.tier) || {}).memberOnly && !mayHoldMemberTier(me, ev)));
  const anyHeld = s.holdings.some(h => h.userId === me && h.eventId === ev.id && h.qty > 0);
  const tiersOk = (ev.tiers || []).filter(t => !t.addOn && !(t.memberOnly && !mayHoldMemberTier(me, ev)));
  const [open, setOpen] = useState(false); const [hid, setHid] = useState(""); const [qty, setQty] = useState(1);
  const [memberTicket, setMemberTicket] = useState(false); // the seller marks a members-only ticket, as on the Sell form
  const [counter, setCounter] = useState(false); const [price, setPrice] = useState(""); const [note, setNote] = useState("");
  // Holding a ticket you haven't added yet: say what you paid right here (it's added when you send).
  const [addTier, setAddTier] = useState(() => (tiersOk[0] || {}).id || ""); const [addPaid, setAddPaid] = useState(() => tiersOk[0] ? String(tiersOk[0].price) : "");
  const d = useDelivery(me, null, s.viewer && s.viewer.payMethods); const [dep, setDep] = useState("");
  const [payTried, setPayTried] = useState(false); // live: "Hold for B" pressed while how buyers pay you isn't right yet: its fields say what's missing
  // Focus: into the form when it opens; back to the button that opened it on close, or to "You're holding one" after sending.
  const headRef = useRef(null), openerRef = useRef(null), doneRef = useRef(null), wasOpen = useRef(false);
  useEffect(() => { if (open) { if (headRef.current) headRef.current.focus(); } else if (wasOpen.current) { const t = doneRef.current || openerRef.current; if (t) t.focus(); } wasOpen.current = open; }, [open]);
  const replied = s.listings.find(l => l.isoReplyFor === i.id && l.sellerId === me && !l.withdrawnAt);
  if (replied) return <div className="rsp-hold"><h3 ref={doneRef} tabIndex={-1} className="rsp-sub">You're holding one for {B}</h3><p className="muted" style={{ fontSize: 13.5 }}>{plural(replied.listed, u)} at {money(replied.ask)}, held until {B} answers. Follow it under My activity.</p><button className="btn btn-sm" onClick={() => go("activity", { open: "listing:" + replied.id })}>Open in My activity</button></div>;
  // Follow-on B5: a reply is now an invitation to pay on one of your listings (above), so no new held reply starts; one made before
  // the switch keeps its line above and finishes as it was.
  if (LIVE && inviteFlowOn()) return null;
  // Every ticket you have here is already listed or in a transfer: share that listing above instead.
  if (!holds.length && (anyHeld || !tiersOk.length)) return null;
  // Say up front why a held reply can't go through, instead of after the form is filled in (a paused account is explained above).
  if (tradingPaused(s, me)) return null;
  // Live: the requester's own load is theirs to know; they meet the per-person limit when they answer (C-CONTRACT §3, D44).
  if (!LIVE && personLoad(s, i.userId, ev.id) >= personCap(ev)) return <p className="reason rsp-hold">{B} already holds or has requested the maximum for this event ({personCap(ev)} per person), so nothing can be held for them.</p>;
  const fresh = !holds.length;
  const h = fresh ? null : holds.find(x => x.id === hid) || holds[0];
  const addT = fresh ? tierOf(ev, addTier) : null; const addPm = parseMoney(addPaid);
  const addErr = !fresh || !addT ? null : addPm.error ? addPm.error : addPm.value > addT.price ? `Face value for this ticket is ${money(addT.price)}.` : null;
  const cap = fresh ? (addErr || !addT ? 0 : Math.min(addPm.value, addT.price)) : askCap(ev, h); const base = i.budget != null ? Math.min(i.budget, cap) : cap;
  const maxQ = fresh ? Math.min(i.qty, personCap(ev)) : Math.min(holdingFree(s, h), i.qty);
  const pm = counter ? parseMoney(price) : { value: base };
  const priceErr = !counter ? null : price.trim() === "" ? "Enter your price." : pm.error || (pm.value <= 0 ? "Enter more than $0." : pm.value > cap ? `Up to what you paid (${money(cap)}).` : null);
  const train = needsTrain(ev);
  const depErr = !train ? null : !dep ? "Add your train's departure." : atMs(dep) <= CLOCK ? "That train has already left." : atMs(dep) < atMs(ev.start) || atMs(dep) > closesAt(ev) ? `Pick a train between ${fmtDay(ev.start)} and ${fmtDay(ev.openUntil || ev.start)}.`
    : i.expires && atMs(dep) > atMs(i.expires) ? `The train leaves ${fmtWhen(dep)}, after ${B}'s ${fmtDate(i.expires)} deadline.` : null; // the reducer's check, said before sending
  const lasts = openLen(offerEnd(ev, CLOCK, train && !depErr ? { departsAt: dep } : null), CLOCK); // as the server's toast says it
  if (!open) return (
    <div className="rsp-hold">
      <button ref={openerRef} type="button" className="linkish rsp-hold-btn" aria-expanded="false" onClick={() => { setOpen(true); setQty(1); }}><Icon name="clock" size={15} />Or hold one for them at their budget (they have {lasts} to accept)</button>
      <p className="muted" style={{ fontSize: 13 }}>{fresh ? `It's held for ${B} at their budget${i.budget != null ? ` (${money(i.budget)})` : ""}, or what you paid if that's lower, or one other price you propose.` : `It's held for ${B} at ${money(base)}${i.budget != null && cap < i.budget ? " (what you paid, under their budget)" : " (their budget)"}, or one other price you propose.`} If they accept, it's reserved for them for {TAKE_HOLD} while they pay you.</p>
    </div>);
  return (
    <div className="rsp-hold form-stack" style={{ gap: 14 }}>
      <div className="lhead"><h3 ref={headRef} tabIndex={-1} className="rsp-sub">Hold one for {B}</h3><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" size={16} /></button></div>
      {fresh && <div className="row2">
        {tiersOk.length > 1 && <div className="field"><label htmlFor="ir-tier">Ticket type</label><select id="ir-tier" value={addTier} onChange={e => { setAddTier(e.target.value); const t = tierOf(ev, e.target.value); if (t) setAddPaid(String(t.price)); }}>{tiersOk.map(t => <option key={t.id} value={t.id}>{t.label} · {money(t.price)}</option>)}</select></div>}
        <div className="field"><label htmlFor="ir-paid">What you paid per {u}</label><div className="money"><span>$</span><input id="ir-paid" type="text" inputMode="decimal" value={addPaid} onChange={e => setAddPaid(e.target.value)} aria-invalid={!!addErr} aria-describedby="ir-paid-msg" /></div>
          <span id="ir-paid-msg" className={addErr ? "err" : "help"}>{addErr || "Up to face value. Handoff can't see tickets, so your reply shows as not verified."}</span></div>
      </div>}
      {holds.length > 1 && <div className="field"><label htmlFor="ir-h">Your {u}</label><select id="ir-h" value={h.id} onChange={e => setHid(e.target.value)}>{holds.map(x => <option key={x.id} value={x.id}>{x.tier && !hasMemberTiers(ev) ? tierOf(ev, x.tier).label : UnitOf(ev)} · paid {money(x.paid)}</option>)}</select></div>}
      {maxQ > 1 && <div className="field" style={{ maxWidth: 160 }}><label htmlFor="ir-q">How many</label><select id="ir-q" value={Math.min(qty, maxQ)} onChange={e => setQty(+e.target.value)}>{Array.from({ length: maxQ }, (_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}</select></div>}
      <div className="field"><span className="label" id="ir-p">Price per {u}</span>
        <div className="seg" role="radiogroup" aria-labelledby="ir-p" onKeyDown={onRadioKeys}>{[[false, `At ${money(base)}`], [true, "Propose another price"]].map(([v, lbl]) => <button key={lbl} type="button" role="radio" aria-checked={counter === v} tabIndex={counter === v ? 0 : -1} className={counter === v ? "on" : ""} onClick={() => setCounter(v)}>{lbl}</button>)}</div>
        {counter && <div className="money" style={{ maxWidth: 200, marginTop: 6 }}><span>$</span><input type="text" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} aria-label="Your price" aria-invalid={!!priceErr && price !== ""} /></div>}
        <span className={priceErr && price !== "" ? "err" : "help"}>{priceErr && price !== "" ? priceErr : `Never above what you paid (${money(cap)}). One price only: ${B} accepts or declines.`}</span></div>
      {train && <div className="field"><label htmlFor="ir-dep">Your train departs</label>
        <input id="ir-dep" type="datetime-local" value={dep} min={ev.start} max={ev.openUntil} onChange={e => setDep(e.target.value)} aria-invalid={!!depErr && dep !== ""} aria-describedby="ir-dep-msg" />
        <span id="ir-dep-msg" className={depErr && dep !== "" ? "err" : "help"}>{depErr && dep !== "" ? depErr : `${B} sees the departure, and the reply closes when the train leaves. Add the train name or number in the note.`}</span></div>}
      {!ev.nonWharton && ev.cat !== "Travel" && !!ev.club && (() => { const inherent = membersOnlyListing(ev, { tier: fresh ? addTier : h && h.tier }); return ( // club events only, as on the Sell form (an event naming no club has none)
        <label className="check" htmlFor="ir-member"><input id="ir-member" type="checkbox" checked={inherent || memberTicket} disabled={inherent} onChange={e => setMemberTicket(e.target.checked)} /><span><b>Members-only ticket</b>: only {ev.club} members can use it. {B} confirms they're a member before accepting.{inherent ? ` Set by ${ev.attend === "members" ? "this members-only event" : "the ticket type"}.` : ""}</span></label>); })()}
      <DeliveryFields ev={ev} s={s} d={d} idp="ir" showMissing={payTried} />
      <div className="field"><label htmlFor="ir-note">Note to {B} (optional)</label><input id="ir-note" type="text" value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="e.g. Can transfer tonight." /></div>
      <div className="callout">{B} has {lasts} to accept. If they do, it's reserved for them for {TAKE_HOLD} while they pay you, then you transfer it.</div>
      <div className="actions">
        {/* Live: how buyers pay you is asked beside its fields when missing (not by a disabled button), then saved to the profile first. */}
        <button className="btn btn-primary" disabled={!!priceErr || !!depErr || !!addErr || (LIVE ? !effMethodOf(ev, d) : !deliveryReady(ev, d))} onClick={async () => {
          if (LIVE) { const p = payProblem(d); if (p) { setPayTried(true); focusSoon(payFieldOf("ir", d, p)); return; } if (!(await savePayFirst(d, saveProfile, "ir"))) return; }
          const n = Math.min(qty, maxQ);
          const reply = { type: "isoReply", isoId: i.id, qty: n, counter, price, method: effMethodOf(ev, d), namesChecked: effMethodOf(ev, d) === "name", file: LIVE ? null : d.file, ...(LIVE ? {} : { payHandle: d.payHandle }), departsAt: train ? dep : undefined, note: note.trim(), membersOnly: memberTicket };
          // A ticket added here is added and sent in one step, so a failed reply leaves nothing behind.
          const r = await (fresh ? dispatch({ type: "addThen", add: { eventId: ev.id, tier: addTier, qty: n, paid: addPaid }, then: reply }) : dispatch({ ...reply, holdingId: h.id })); if (!r.error) setOpen(false); }}>Hold for {B}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>);
}

/* "I have this" on someone's request for an event. 1) Share a listing you already have: each of yours for this event, with requestMatch's
   verdict (only a real fit can be shared; a mismatch says why; one already shared can be withdrawn). With invite to pay on (live, quick
   events), a fitting listing can also invite the requester to pay, with the card's own invitation form. 2) Create a listing for this
   request: the Sell form, pre-filled within its caps, shares it once posted. 3) The earlier flow only (the preview), student tickets:
   hold one for them at their budget (IsoReplyPanel, which shows nothing once invite to pay is on). A share holds and changes nothing:
   the requester asks to buy it like anyone else (invite to pay), or takes it or offers (the earlier flow), or sends a request (an
   organizer's event). */
function RespondPanel({ i, s, me, go, dispatch, saveProfile, flash }) {
  const ev = EV[i.eventId]; const u = unitOf(ev); const B = PEOPLE[i.userId].first; const quick = isQuick(ev);
  // Follow-on B5 (live, once switched on): a fitting listing can also invite the requester to pay (inviteRequester), with the card's own
  // invitation form. Nothing is held and the listing stays open to everyone; sharing stays as the lighter answer.
  const nf = LIVE && quick && inviteFlowOn();
  const [invFor, setInvFor] = useState(null); // the listing whose invitation form is open
  const dealOf = l => nf ? s.requests.find(r => r.listingId === l.id && r.buyerId === i.userId && isOpenReq(rState(r))) || null : null;
  const closeInv = (lid, sent, toast) => { setInvFor(null); if (sent && toast && flash) flash(toast); focusSoon((sent ? "rsp-deal-" : "rsp-iv-") + lid); };
  const mine = publicListingsFor(s, ev).filter(l => l.sellerId === me);
  const shareOf = l => sharesFor(s, i).find(x => x.listingId === l.id && x.sellerId === me) || null;
  const paused = quick && tradingPaused(s, me);
  const holds = s.holdings.filter(h => h.userId === me && h.eventId === ev.id && h.qty > 0);
  const free = holds.reduce((t, h) => t + holdingFree(s, h), 0);
  // Listing for them: from a ticket you hold and haven't listed, or (not trips: their spots come from the club's records) one you add.
  const canCreate = !paused && honorAttend(me, ev).ok && (free > 0 || (!ev.premium && holds.length === 0 && personLoad(s, me, ev.id) < personCap(ev)));
  // §9v item 2 (live, SELL5-M3): with a listing of yours that fits, you invite them from it (its row, below); with none, and nothing
  // open with them already, the one prominent action is "List and invite <first name>": the Sell form for this request, which lists
  // your ticket and invites them in one submission (answerRequest).
  const canInvOf = l => { const m = requestMatch(s, i, l); const nb = listingNumbers(s, l); return nf && !dealOf(l) && m.ok && !paused && !(LIVE && listingPaused(s, l)) && nb.available > 0 && !isAddOn(ev, l); };
  const listInvite = nf && listAndInviteOffered({ canCreate, invitable: mine.filter(canInvOf).length, dealing: mine.filter(l => !!dealOf(l)).length });
  const act = async (a, next) => { const r = await dispatch(a); if (!r.error) focusSoon(next); };
  return (
    <section className="panel respond" aria-labelledby="rsp-h">
      <h2 id="rsp-h" className="rsp-h"><Icon name="hand" size={18} />I have this</h2>
      {nf ? <p className="muted rsp-p">{listInvite ? `List your ticket and invite ${B} to pay for it, in one step. You set the price.` :`Invite ${B} to pay for one of your listings, or share it with them.`}</p>/* simplification batch: the invitation form says once that nothing is held and others can be invited */
        : <p className="muted rsp-p">Share a listing with {B}. {quick ? "They'll see your listing and can take it or make an offer. Nothing is reserved until they do." : "They'll see your listing and can send a request. Nothing is held until you accept it."}</p>}
      {paused && <p className="reason" style={{ marginTop: 0 }}>{PAUSED_MSG}</p>}
      {mine.length > 0 ? <ul className="rsp-list">{mine.map(l => {
        const m = requestMatch(s, i, l); const sh = shareOf(l); const nb = listingNumbers(s, l); const tier = l.tier ? tierOf(ev, l.tier) : null;
        // Live: a listing you paused counts what the pause keeps off sale ("2 paused tickets"), not its 0 available, which reads as sold out.
        const lu = isAddOn(ev, l) ? "add-on" : u, off = LIVE && listingPaused(s, l) ? pausedUnits(s, l) : 0;
        // B5: what you and the requester already have open on this listing (you're its seller, so you see it), or whether you can invite them.
        const deal = dealOf(l), dealSt = deal ? baseSt(rState(deal)) : "";
        const canInv = nf && !deal && m.ok && !paused && !off && nb.available > 0 && !isAddOn(ev, l);
        return (
          <li key={l.id} className="rsp-item" data-lid={l.id}>
            <div className="rsp-main">
              <b>{off ? plural(off, "paused " + lu) : plural(nb.available, lu)} at {money(l.ask)}{ev.premium ? " reimbursement" : ""}</b>
              <span className="muted">{tier && ev.tiers.length > 1 ? `${tier.label} · ` : ""}your listing · listed {ago(l.createdAt)}{l.obo ? " · OBO" : ""}</span>
              {deal ? <span className="rsp-ok" data-rsp-deal={dealSt}><Icon name="check" size={14} />{dealSt === "invited" ? `You invited ${B}${freeWords(deal.price === 0).toPay} · not held until they reserve it` : dealSt === "requested" ? `${B} asked to buy this listing` : `${B} has an open exchange with you here`}</span>
                : sh ? <span className="rsp-ok"><Icon name="check" size={14} />Shared with {B} {ago(sh.createdAt)}</span>
                : m.ok ? <span className="rsp-ok"><Icon name="check" size={14} />{m.partial ? m.reasons[m.reasons.length - 1] : `Fits ${B}'s request`}</span>
                : <ul className="rsp-why" aria-label="Why it can't be shared">{m.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
            </div>
            {deal ? <span className="rsp-act"><span className="chip tone-good">{dealSt === "invited" ? "Invited" : dealSt === "requested" ? "Asked to buy" : "In progress"}</span><button id={"rsp-deal-" + l.id} type="button" className="btn btn-sm" onClick={() => go("activity", { open: "listing:" + l.id })}>{dealSt === "requested" ? "Review request" : "Open in My activity"}</button></span>
              : canInv ? <span className="rsp-act">
                  <button id={"rsp-iv-" + l.id} type="button" className="btn btn-sm btn-primary" data-invite-requester="" aria-expanded={invFor === l.id} onClick={() => setInvFor(invFor === l.id ? null : l.id)}>Invite {B}{freeWords(l.ask === 0).toPay}</button>
                  {sh ? <button id={"rsp-wd-" + l.id} type="button" className="btn btn-sm btn-ghost" aria-label={`Withdraw: stop sharing this listing with ${B}`} onClick={() => act({ type: "withdrawShare", id: sh.id }, "rsp-sh-" + l.id)}>Stop sharing</button>
                    : <button id={"rsp-sh-" + l.id} type="button" className="btn btn-sm" onClick={() => act({ type: "shareListing", isoId: i.id, listingId: l.id }, "rsp-wd-" + l.id)}>Share this listing</button>}
                </span>
              : sh ? <span className="rsp-act"><span className="chip tone-good">Shared</span><button id={"rsp-wd-" + l.id} type="button" className="btn btn-sm btn-ghost" aria-label={`Withdraw: stop sharing this listing with ${B}`} onClick={() => act({ type: "withdrawShare", id: sh.id }, "rsp-sh-" + l.id)}>Withdraw</button></span>
              : m.ok ? <button id={"rsp-sh-" + l.id} type="button" className="btn btn-sm btn-primary" disabled={paused} onClick={() => act({ type: "shareListing", isoId: i.id, listingId: l.id }, "rsp-wd-" + l.id)}>Share this listing</button>
              : <span className="chip tone-muted">Doesn't fit</span>}
            {canInv && invFor === l.id && <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
              <InviteForm r={{ id: "iso-" + l.id, buyerId: i.userId, qty: i.qty || 1, price: l.ask }} l={l} ev={ev} s={s} most={Math.min(i.qty || 1, nb.available)} dispatch={dispatch} saveProfile={saveProfile} forIso={i} flash={flash} onClose={(sent, toast) => closeInv(l.id, sent, toast)} /></div>}
          </li>); })}</ul>
        : listInvite ? null : <p className="rsp-none">You don't have a listing for this event{canCreate ? " yet" : ""}.</p>}
      {/* §9v item 2 (live): one submission. The form starts from the request (its event, one ticket), you set the price, and "List and
          invite <first name>" lists it and sends the invitation together. Nothing is held: the listing is open to everyone. */}
      {listInvite ? <div className="rsp-create rsp-list-invite">
          <button type="button" id="rsp-list-invite" className="btn btn-primary" data-list-invite="" onClick={() => go("list", { eventId: ev.id, forIso: i.id, from: "request", fromId: i.id })}><Icon name="ticket" size={16} />List and invite {B}</button>
          <span className="help">Starts from {B}'s request ({plural(i.qty, u)}{i.budget != null ? `, up to ${money(i.budget)}` : ""}). Your listing stays open to everyone until someone reserves it.</span></div>
        : nf && mine.length > 0 ? null
        : canCreate ? <div className="rsp-create">
          <button type="button" className="btn" onClick={() => go("list", { eventId: ev.id, forIso: i.id, from: "request", fromId: i.id })}><Icon name="plus" size={16} />Create a listing for this request</button>
          <span className="help">The Sell form starts from {B}'s request ({plural(i.qty, u)}{i.budget != null ? `, up to ${money(i.budget)}` : ""}){LIVE ? "" : ", never above what you paid,"} and shares it once it's posted.</span></div>
        : !paused && ev.premium && holds.length === 0 ? <p className="reason" style={{ marginTop: 0 }}>Trip spots come from the club's records, so only someone holding a spot on this trip can list one.</p> : null}
      {quick && <IsoReplyPanel i={i} s={s} me={me} go={go} dispatch={dispatch} saveProfile={saveProfile} />}
    </section>
  );
}
/* "I have this" on someone's request for an item: share one of your items in that category (only a real fit: same category, a similar
   name, within budget, available), or sell one for this request (the Sell form pre-filled, shared once posted if it fits). Live (§9q
   item 6): an item of yours that states no category is offered too, and fits by its name. */
function RespondGoods({ i, s, me, go, dispatch }) {
  const B = PEOPLE[i.userId].first; const gd = i.goods;
  const mine = s.goods.filter(it => it.sellerId === me && (!it.cat || it.cat === gd.cat) && !it.soldAt && !it.withdrawnAt && !pickupOver(it));
  const shareOf = it => sharesFor(s, i).find(x => x.itemId === it.id && x.sellerId === me) || null;
  const act = async (a, next) => { const r = await dispatch(a); if (!r.error) focusSoon(next); };
  return (
    <section className="panel respond" aria-labelledby="rsp-h">
      <h2 id="rsp-h" className="rsp-h"><Icon name="hand" size={18} />I have this</h2>
      <p className="muted rsp-p">Share an item with {B}. They'll see it and can request it or make an offer. Nothing is held until you accept.</p>
      {mine.length > 0 ? <ul className="rsp-list">{mine.map(it => {
        const m = requestMatchItem(s, i, it); const sh = shareOf(it);
        return (
          <li key={it.id} className="rsp-item" data-item={it.id}>
            <div className="rsp-main">
              <b>{it.title} · {itemPrice(it.price)}{it.obo ? " OBO" : ""}</b>
              <span className="muted">{itemOwnLine(it)}</span>
              {sh ? <span className="rsp-ok"><Icon name="check" size={14} />Shared with {B} {ago(sh.createdAt)}</span>
                : m.ok ? <span className="rsp-ok"><Icon name="check" size={14} />Fits {B}'s request</span>
                : <ul className="rsp-why" aria-label="Why it can't be shared">{m.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
            </div>
            {sh ? <span className="rsp-act"><span className="chip tone-good">Shared</span><button id={"rsp-wd-" + it.id} type="button" className="btn btn-sm btn-ghost" aria-label={`Withdraw: stop sharing this item with ${B}`} onClick={() => act({ type: "withdrawShare", id: sh.id }, "rsp-sh-" + it.id)}>Withdraw</button></span>
              : m.ok ? <button id={"rsp-sh-" + it.id} type="button" className="btn btn-sm btn-primary" onClick={() => act({ type: "shareItem", isoId: i.id, itemId: it.id }, "rsp-wd-" + it.id)}>Share this item</button>
              : <span className="chip tone-muted">Doesn't fit</span>}
          </li>); })}</ul>
        : <p className="rsp-none">You don't have an item in {gd.cat} on Goods.</p>}
      <div className="rsp-create">
        <button type="button" className="btn" onClick={() => go("sell", { title: gd.title, cat: gd.cat, forIso: i.id, from: "request", fromId: i.id })}><Icon name="tag" size={16} />Sell an item for this request</button>
        <span className="help">The form starts from {B}'s request ({gd.title}{i.budget != null ? `, up to ${money(i.budget)}` : ""}) and shares the item once it's posted, if it fits.</span></div>
    </section>
  );
}

/* §9x item 1 (SELL6-N1): a request's page once the request has ended and all this viewer's view has of it is that (closedRequests; a
   visitor's closedWanted): "This request is closed", what it was for (its event, public all along), and the ways on. Nothing about
   who asked, how many, their budget or note, or why it ended: none of that is in the view. The same page signed in and signed out. */
function ClosedRequest({ c, go }) {
  const ev = c.eventId && Object.prototype.hasOwnProperty.call(EV, c.eventId) ? EV[c.eventId] : null;
  return (
    <div className="wrap" data-closed-request={c.id}>
      <div className="page-head">
        <h1>This request is closed</h1>
        <p className="muted" style={{ marginTop: 8 }}>{ev ? <>It was for <b style={{ color: "var(--ink)" }}>{ev.title}</b>. </> : null}It's off Wanted and can't be answered any more.</p>
        <div className="actions" style={{ marginTop: 14 }}>
          {ev && <button className="btn" onClick={() => go("event", { id: ev.id })}>View event</button>}
          <button className="btn" onClick={() => go("isos")}>See Wanted</button>
        </div>
      </div>
    </div>
  );
}
/* A request's own page: the card, any listing or item that fits, and (for someone else's live request) "I have this". Your own request
   shows its controls instead. A private alert is never a public page: to anyone but its owner it's "not found", like a missing request. */
function IsoPage({ s, me, id, go, dispatch, openShare, origin, saveProfile, flash, posted = false }) { // posted (§9v item 3, live): Post request just made it
  const i = s.interests.find(x => x.id === id);
  const [alertOpen, setAlertOpen] = useState(false);
  const backBtn = <BackButton back="isos" origin={origin} go={go} s={s} me={me} />; // a request belongs to Wanted, unless My activity or another page opened it
  const goHere = linkFrom(go, { name: "iso", id }, origin); // an event or item page this one links to comes back here, and this page keeps its own way back
  // §9x item 1 (SELL6-N1): a public request that was open for everyone and has since ended (closed, fulfilled or past its deadline) is
  // named in the view by its id and its event alone (closedRequests), so its link says "This request is closed", to the seller who
  // answered it as to anyone else. A record this account could never see (someone's private alert, an id that never was) isn't
  // there, and reads "not found" as before.
  const gone = !i && LIVE ? (s.closedRequests || []).find(x => x.id === id) : null;
  if (gone) return <ClosedRequest c={gone} go={goHere} />;
  if (!i || (i.kind !== "iso" && i.userId !== me)) return <div className="wrap"><div className="page-head"><h1>Request not found</h1><p className="muted" style={{ marginTop: 8 }}>{LIVE ? "It may have been closed or removed, or it ended a while ago." : "It may have been removed, or it was created in someone else's browser. Demo activity isn't shared between people."}</p><div className="actions" style={{ marginTop: 14 }}><button className="btn" onClick={() => go("isos")}>See Wanted</button></div></div></div>;
  if (i.kind !== "iso" && !EV[i.eventId]) return <div className="wrap"><div className="page-head"><h1>Alert not found</h1><p className="muted" style={{ marginTop: 8 }}>Its event is no longer on Handoff.</p><div className="actions" style={{ marginTop: 14 }}><button className="btn" onClick={() => go("activity")}>My activity</button></div></div></div>;
  if (i.kind !== "iso") { const ev = EV[i.eventId]; return ( // your own private alert
    <div className="wrap" style={{ paddingBottom: 60 }}>
      {backBtn}
      <h1 className="sr">Your private alert: {ev.title}</h1>
      <div className="ev-layout"><div style={{ display: "grid", gap: 14 }}><AlertCard al={i} s={s} go={goHere} dispatch={dispatch} onEdit={() => setAlertOpen(true)} /></div></div>
      {alertOpen && demandAllowed(ev) && <AlertDialog ev={ev} s={s} me={me} dispatch={dispatch} flash={flash} onClose={() => setAlertOpen(false)} />}
    </div>); }
  const ev = i.eventId ? EV[i.eventId] : null; const gd = i.goods || null; const mine = i.userId === me; const live = liveRequest(s, i);
  const listed = isoMatches(s, i);
  const items = gd ? goodsMatches(s, i) : [];
  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      {backBtn}
      <h1 className="sr">Request: {isoTitle(i)}</h1>
      <div className="ev-layout">
        <div style={{ display: "grid", gap: 14 }}>
          {/* §9v item 3 (live): where Post request lands: "Request posted." and the one prominent next action, Done (back to Wanted). */}
          {LIVE && mine && posted && i.status === "open" && <PostedNote text="Request posted." onDone={() => go("isos")} />}
          {mine ? <RequestManage i={i} s={s} go={goHere} dispatch={dispatch} openShare={openShare} from="request" />
            : <IsoCard i={i} s={s} go={goHere} actions onShare={LIVE ? null : () => openShare({ type: "iso", id: i.id })} />}{/* actions: View event; the preview's Share too */}
          {/* §9x item 1: someone else's request that closed while this account still gets it whole (a seller who shared a listing with it). */}
          {LIVE && !mine && i.status !== "open" && <div className="callout" data-request-closed="">This request is closed.</div>}
          {mine && ev && listed.length > 0 && <div className="callout good"><b>{plural(listed.reduce((t, l) => t + listingNumbers(s, l).available, 0), unitOf(ev))} already listed that fit.</b> <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => goHere("event", { id: ev.id, listing: listed[0].id })}>{isQuick(ev) ? `View ${unitOf(ev)}s` : "View and request"}</button></div>}
          {mine && gd && items.length > 0 && <div className="callout good"><b>{plural(items.length, "item")} on Goods may fit.</b>
            <div className="actions" style={{ marginTop: 8 }}>{items.slice(0, 4).map(it => <button key={it.id} className="btn btn-sm" onClick={() => goHere("item", { id: it.id })}>{it.title} · {itemPrice(it.price)}{it.obo ? " OBO" : ""}</button>)}</div></div>}
          {gd && items.length === 0 && isLive(i) && <div className="callout">Nothing on Goods fits yet. {mine ? "You'll get an in-app alert when a matching item is posted." : `${PEOPLE[i.userId].first} gets an in-app alert when a matching item is posted.`}</div>}
          {!ev && !gd && <div className="callout warn">This event isn't on Handoff yet. Status: <b>{REVIEW[i.review || "reviewing"].label}</b>. Nothing can trade until it's added.{i.missing.sourceUrl && <> Link given: <a href={i.missing.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{i.missing.sourceUrl.replace(/^https?:\/\//, "").slice(0, 60)}</a> (not checked; it doesn't show eligibility or availability).</>}</div>}
          {ev && !access(ev).ok && <div className="callout warn">{access(ev).why}</div>}
          {isExpired(i) && <div className="callout warn">This request ended on {fmtDate(i.expires)}. It no longer gets alerts or matches.{mine ? " Edit it to set a new deadline, or post a new one." : ""}</div>}
        </div>
        <aside className="rail">
          {!mine && live && ev && access(ev).ok && <RespondPanel i={i} s={s} me={me} go={goHere} dispatch={dispatch} saveProfile={saveProfile} flash={flash} />}
          {!mine && live && gd && <RespondGoods i={i} s={s} me={me} go={goHere} dispatch={dispatch} />}
          {ev && <div className="panel" style={{ display: "grid", gap: 10 }}><div className="eyebrow">Event</div><h3 style={{ fontSize: 17 }}><button className="linkish" onClick={() => goHere("event", { id: ev.id })}>{ev.title}</button></h3><PolicyDetails ev={ev} compact /></div>}
        </aside>
      </div>
    </div>
  );
}
/* The preview's first-visit welcome (WelcomeSheet): _preview/pages.jsx. */
/* The development preview's Share sheet: share a listing, an item, a request or an event, as a message to copy or to open in WhatsApp.
   seedIds: the preview's sample ids (its kit's SEED_IDS), so the message says when something was made in this browser (shareText). The
   preview opens it from its Share buttons and right after a listing ("Listed! Share it in your group chat?", justListed). The shared
   market has none (§9v item 3, SELL5-M1): no Share button or sheet, signed in or not; App renders this only off the live route. */
function ShareSheet({ target, s, seedIds, onClose }) {
  const [copied, setCopied] = useState(false);
  const ta = useRef(null);
  const st = shareText(target, s, seedIds);
  const msg = st.text + "\n" + demoShareUrl() + (st.hash ? "#" + st.hash : "");
  const localPreview = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const dref = useRef(null); useDialog(dref, onClose);
  const wa = "https://wa.me/?text=" + encodeURIComponent(msg); // only opens WhatsApp with that text: the person picks the chat and sends it
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" ref={dref} role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="lhead" style={{ alignItems: "center" }}><h2 id="share-title">{target.justListed ? `Listed! Share it in your group chat?` : `Share ${target.type === "iso" ? "this request" : target.type === "listing" ? "this listing" : target.type === "item" ? "this item" : "this event"}`}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        <div className="form-stack" style={{ marginTop: 14 }}>
          {st.local &&<div className="callout warn">You created this in your own browser. Demo activity isn't shared, so other people won't see it. The link opens {st.hash === "goods" ? "the shared Goods page" : st.hash ? "the shared event page" : "the demo"} instead, and the message says so.</div>}
          <div className="share-preview">{msg}</div>
          {localPreview && <p className="help">This preview address opens only on this computer.</p>}
          <textarea ref={ta} readOnly value={msg} rows={6} hidden aria-label="Message to copy" />
          <p className="help" style={{ fontSize: 12.5 }}>{`Nothing is posted automatically, and the message has no names or contact details.${st.local ? "" : " In this prototype the link opens the shared demo, not your copy of it."}`}</p>
          <div className="actions">
            <button id="share-copy" className="btn btn-primary" onClick={async () => setCopied(await copyText(msg, ta.current))}><Icon name="copy" size={15} />{copied ? "Copied" : "Copy message"}</button>
            <a id="share-wa" className="btn" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="ext" size={15} />Open in WhatsApp</a>
            {target.justListed && <button className="btn btn-ghost" onClick={onClose}>Not now</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* An exchange's card (HandoffCard, QuickCard, ProblemBox) and a seller's listing panel (ListingPanel): _components/exchanges.jsx.
   My activity (ActivityPage): _components/activity.jsx. */

/* ============================================================
   PROFILE (live: LiveProfile; the preview's sample profile with its demo identity claims, ProfilePage, is in _preview/pages.jsx)
   ============================================================ */
/* The preview's email and text alert opt-in (AlertOptIn): _components/requests.jsx. */
/* Live: Handoff settings (C-DESIGN §10, C7 step 11; titled "Handoff settings" and opened directly by the header's settings control since
   amendment 9h; its route is still "profile", so #profile links land here). Forms round 2 (§9i, L): it no longer repeats the account's
   name and email, or says which sign-in they came from: PennTools' own header shows who is signed in, and PennTools manages both. How
   buyers pay you is the one thing you set (saveMyProfile; follow-on B1): one method, and optionally a second, the first preferred. Saved,
   it shows as one line with Change; with none saved, the fields show. Nothing asks for it before you need it: Sell a ticket asks only when
   none are saved. Then what others see (the public form of your name: #pf-public), and the tickets you've added.
   §9v item 6 (SELL5-M5): identity is the PennTools account's (no Handoff username, name to pick or onboarding). What others see is one
   line, "On your listings and requests, signed-in classmates see you as Maya P.", with the rest under a collapsed "Who can see my
   details?" (#pf-who) that says what the server's projection does (_lib/profile.js WHO_SEES). "Tickets you've added" (#pf-added) is
   hidden when you have none, and otherwise collapsed with a count; open, each event with how many and an unlisted count only when it
   says something, and one sentence that these are self-reported (no chip per row). The disclosures at reservation are unchanged. */
/* Review of PR #88: what Handoff keeps about you, and for how long (#pf-data), with "Delete my Handoff data" (deleteMyData). The
   server refuses it, in words, while a listing, item, request or exchange of yours is still open. */
const DATA_KEPT = "Handoff saves a profile for you (your PennTools name and email, and any payment methods you add) the first time you post, ask or change something here, not when you only look. It keeps it while you use Handoff. Your activity log is deleted after 7 days, and notifications you've read after 90. You can delete your Handoff data here once nothing of yours is still going on: your profile, notifications and activity log go. Your past trades stay with the classmates you traded with, as they were recorded: Handoff then shows you as \"A classmate\", but what was already written stays, such as a trade's history line with your first name and last initial, their notifications that mention you, and the payment method a ticket buyer was shown.";
function LiveProfile({ s, me, go, saveProfile, deleteData }) {
  const v = s.viewer || {}; const saved = Array.isArray(v.payMethods) ? v.payMethods : [];
  const [asking, setAsking] = useState(false); const [deleting, setDeleting] = useState(false);
  const [dataErr, setDataErr] = useState(""); const [dataNote, setDataNote] = useState("");
  const removeData = async () => {
    if (deleting || !deleteData) return;
    setDeleting(true); setDataErr(""); setDataNote("");
    const r = await deleteData();
    setDeleting(false); setAsking(false);
    if (r.error) setDataErr(r.error); else setDataNote(r.toast || "Deleted.");
  };
  const [open, setOpen] = useState(() => saved.length === 0); // the fields, or the saved line with Change
  const [st, setSt] = useState(() => payEditorFrom(saved));
  const [tried, setTried] = useState(false); // after a first Save, every problem shows beside its field
  // Nothing saved any more (the data was just deleted, here or in another tab): the empty fields, never a summary of nothing or the
  // old handle typed in.
  const none = saved.length === 0;
  useEffect(() => { if (none) { setOpen(true); setSt(payEditorFrom([])); setTried(false); } }, [none]);
  const [note, setNote] = useState(""); const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const errRef = useRef(null);
  const added = addedTickets(s, me); // §9v item 6: your own tickets with something left; none hides the section
  const nameLine = publicNameLine(v.name);
  const errs = payEditorErrors(st);
  const dirty = payEditorDirty(st, saved);
  const focus = id => setTimeout(() => { const el = demoElement(id); if (el) el.focus(); }, 0);
  const change = () => { const st0 = payEditorFrom(saved); setSt(st0); setTried(false); setErr(""); setNote(""); setOpen(true); focus(payFocusId("pf", st0)); };
  const cancel = () => { setOpen(false); setTried(false); setErr(""); focus("pf-change"); };
  const save = async e => {
    e.preventDefault(); if (saving || !dirty) return;
    setErr(""); setNote("");
    const bad = errs.findIndex(Boolean);
    if (bad >= 0) { setTried(true); focus(payErrorField("pf", st, bad, errs[bad])); return; }
    setSaving(true);
    const methods = payEditorMethods(st);
    const r = await saveProfile(methods);
    setSaving(false);
    if (r.error) { setErr(r.error); setTimeout(() => { if (errRef.current) errRef.current.focus(); }, 0); return; }
    setNote(r.toast || "Saved."); setTried(false);
    if (methods.length) { setOpen(false); focus("pf-change"); } else setSt(payEditorFrom([])); // removed: the fields, empty
  };
  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      <div className="page-head">
        <h1>Handoff settings</h1>
      </div>
      <div className="cards2">
        <form className="panel form-stack profile-form" onSubmit={save} noValidate aria-labelledby="pf-pay-h">
          <h2 id="pf-pay-h" style={{ fontSize: 18 }}>Payment methods</h2>
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>How buyers pay you for tickets, outside Handoff: {saved.some(m => m.kind === "paypal") ? "Venmo, Zelle, or the PayPal you saved" : "Venmo or Zelle"}. Add one now, or when you first invite a buyer to pay; your listings use what's saved here.</p>
          {open ? <PayMethodsEditor idp="pf" st={st} setSt={x => { setSt(x); setErr(""); setNote(""); }} errs={errs} show={tried} canClear={saved.length > 0} />
            : <PaySummary methods={saved} idp="pf" onChange={change} />}
          {err && <p ref={errRef} id="pf-err" className="err" role="alert" tabIndex={-1} style={{ margin: 0 }}>{err}</p>}
          <p className="help" role="status" style={{ margin: 0 }}>{note}</p>
          {open && <div className="actions"><button type="submit" className="btn btn-primary" disabled={saving || !dirty} aria-describedby={err ? "pf-err" : undefined}>{saving ? "Saving…" : "Save payment methods"}</button>
            {saved.length > 0 && <button type="button" className="btn" onClick={cancel}>Cancel</button>}</div>}
        </form>
        <div className="panel" style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <div className="eyebrow">What others see</div>
          <p id="pf-public-line" style={{ fontSize: 14, margin: 0 }}>{nameLine.lead}<b id="pf-public">{nameLine.name}</b>{nameLine.end}</p>
          <details id="pf-who" className="srcs pf-who">
            <summary>{WHO_TITLE}</summary>
            <ul className="pf-who-list">{WHO_SEES.map(w => <li key={w.key} data-who={w.key}><b>{w.label}.</b> {w.text}</li>)}</ul>
          </details>
        </div>
      </div>
      {added.rows.length > 0 && <details id="pf-added" className="xsec pf-added" style={{ marginTop: 14 }}>
        <summary><h2 className="pf-added-h">{ADDED_TITLE}</h2><span className="pf-count">{added.total}</span></summary>
        <div className="xsec-body">
          <ul className="pf-added-list">{added.rows.map(r => <li key={r.id}><button className="linkish" onClick={() => go("event", { id: r.eventId })}><b>{r.title}</b> <span className="muted">· {r.line}</span></button></li>)}</ul>
          <p id="pf-added-note" className="muted" style={{ fontSize: 13, margin: 0 }}>{ADDED_NOTE}</p>
        </div>
      </details>}
      {deleteData && <section id="pf-data" className="panel" style={{ display: "grid", gap: 8, marginTop: 14 }} aria-labelledby="pf-data-h">
        <h2 id="pf-data-h" style={{ fontSize: 18, margin: 0 }}>Your Handoff data</h2>
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>{DATA_KEPT}</p>
        <div className="actions">
          {asking
            ? <><button type="button" className="btn btn-danger" disabled={deleting} onClick={removeData}>{deleting ? "Deleting…" : "Yes, delete my Handoff data"}</button>
              <button type="button" className="btn" disabled={deleting} onClick={() => setAsking(false)}>Cancel</button></>
            : <button type="button" className="btn btn-ghost btn-danger" onClick={() => { setAsking(true); setDataErr(""); setDataNote(""); }}>Delete my Handoff data…</button>}
        </div>
        {dataErr && <p id="pf-data-err" className="err" role="alert" style={{ margin: 0 }}>{dataErr}</p>}
        <p className="help" role="status" style={{ margin: 0 }}>{dataNote}</p>
      </section>}
    </div>
  );
}
/* Live: Help, about the real product (USER-INSTRUCTIONS §4.6): posting, requests and private alerts, reservations, payments made directly
   between students, transfers done by hand, and what Handoff records but doesn't check. */
/* nf: follow-on B5 switched on (the engine's inviteFlowOn): a buyer asks, the seller invites, and only "Reserve and pay" holds it. */
const liveFaq = nf => [
  ["Buying", [
    ["How do I get a ticket?", nf ? `Open the event and tap “Request to buy”. Nothing is held yet: the seller sees who's asking and invites you to pay, or declines. Once you're invited, tap “Reserve and pay”. That holds it for you for up to ${TAKE_HOLD} (the page shows the exact time) and shows where to pay. Pay the seller, then tap “I've sent payment”. The seller confirms the payment arrived and transfers the ticket, and you tap “Received”. A seller may invite more than one buyer, so it's yours only once you reserve it. If the seller takes offers, you can ask to buy at a lower price. A free ticket has no payment step: once you're invited, tap “Reserve”, the seller sends it, and you tap “Received”.`
      : `Open the event and tap “I'll take it”. It shows which ways the seller takes payment (such as Venmo or Zelle). It's held for you for ${TAKE_HOLD}: pay the seller (where to send it appears once it's reserved for you), then tap “I've sent payment”. The seller confirms the payment arrived and transfers the ticket, and you tap “Received”. If the seller takes offers, you can offer less; if they accept, you have ${OFFER_HOLD} to pay.`],
    ...(nf ? [["What if I don't pay in time, or change my mind?", `Before you pay, tap “Release reservation” and the hold ends right away. If the time runs out first, the reservation ends on its own. Either way, the ticket can then go to another buyer. If you paid after it ended, open the ended reservation, tap “${LATE_PAYMENT}” and sort it out with the seller: Handoff never takes a ticket back from someone else.`]] : []),
    ["Post a request or get notified: what's the difference?", "A request (an ISO, “in search of”) is public: classmates see your name, what you need, how many and how long you're looking, plus a maximum budget if you add one, and anyone with a ticket can share a listing with you. With no budget, listings at any price match; you always see a ticket's price before you reserve it. A request runs until the event's transfer cutoff unless you choose an earlier date, and “No longer looking” closes it sooner. Get notified is a private alert on an event, with an optional private price limit: nobody else sees it. Neither reserves anything, and you can change or remove either one in My activity. A match shows at the bell and in My activity. If the event isn't on Handoff yet, type its name and its date in the request form: it's added together with your request."], // forms round 2 (§9j): an optional budget, the cutoff as the default deadline, "No longer looking"; §9m item 3: a new event is added with its request
  ]],
  ["Selling", [
    ["How do I sell a ticket I can't use?", nf ? `Tap Sell and type what you're selling. If it's already on Handoff, tap it; if it isn't, add its date. Set your price and tap “Post ticket”: a new event is added together with your listing. Selling more than one at the same price? Set the quantity in Optional details: they're one listing. Classmates with a matching request or alert hear about it in the app. When a buyer asks to buy it, tap “Invite to pay”. The first time, you add how buyers pay you (Venmo or Zelle, or both), unless you already added it on the Sell form; it's saved in Handoff settings, and you can change it there anytime. Inviting doesn't hold the ticket, so you can invite more than one buyer: the first one who reserves it gets it and has up to ${TAKE_HOLD} to pay, and while they do it stays reserved for them. Each reservation keeps the payment details it was made with. Then check that their payment arrived, tap “Payment received”, send the ticket to the buyer yourself, and tap the button that says you did. Giving a ticket away? Set the price to $0: no payment method is asked, and once a buyer reserves it you send it and tap the same button.`
      : "Tap Sell and type what you're selling. If it's already on Handoff, tap it; if it isn't, add its date. Set your price and tap “Post ticket”: a new event is added together with your listing. The first time, add how buyers pay you (Venmo or Zelle, or both); it's saved in Handoff settings for your next listings, and you can change it there anytime. Each reservation keeps the payment details it was made with. Classmates with a matching request or alert hear about it in the app. When someone reserves it, check that their payment arrived, tap “Payment received”, transfer the ticket yourself, and tap the button that says you did."],
    ["How much can I charge?", "Up to the face value, where the event gives one; otherwise you set the price. Goods have no cap either, and an item posted at $0 shows as Free."], // forms round 2: what you paid no longer caps it; step F2c: Free
    // §9x item 1 (SELL6-N1): no standalone "add an event" is offered anywhere; an event comes with its first ticket or request (it was "Can I add an event?").
    ["What if my event isn't on Handoff yet?", "Type its name in Sell or Request and add its date: the event is added together with your ticket or your request (up to 5 new events a day). It shows who added it, so check the organizer's own page for its rules. Club trips with payment schedules and organizer-run approvals can't be added yet."],
  ]],
  ["Payments, transfers and safety", [
    // §9x item 4 (SELL6-N3): the one explanation that Handoff verifies no tickets and processes no payments, word for word (HELP_VERIFY).
    // It was "Does Handoff handle the money or the ticket?", and the other answers no longer repeat it.
    [HELP_VERIFY_Q, HELP_VERIFY],
    ["What if the payment doesn't arrive?", "The seller taps “Payment hasn't arrived”. The buyer can then cancel, or contact the seller if they did pay. If it still hasn't arrived after the waiting time, the seller can release the ticket. Handoff doesn't decide who's right: the two of you sort it out."],
    ["What if something goes wrong?", "Tap “There's a problem” on the exchange. Handoff records it and tells the other person. Reports aren't reviewed during the pilot, and a report doesn't cancel anything by itself."],
    ["Who sees my details?", `Classmates see your first name and last initial. When you deal with someone (${nf ? "a request to buy, an invitation" : "an offer"}, a reservation, an item request, or “I have this” on their request), the two of you also see each other's full name. Emails are shared only for an exchange: once a ticket is reserved, or for an item when you both agree to share them. Anyone signed in sees which ways a seller takes payment; the buyer sees where to pay once it's reserved. Sellers are asked to give a neighborhood or building for goods pickups, not an address. Someone who isn't signed in sees only what's open, with prices and how many: never names, notes, budgets or contact details.`],
  ]],
  ["About Handoff", [
    ["How will I hear about things?", "In the app: the bell at the top shows your notifications. Handoff doesn't send email or texts."],
    ["What time zone are times in?", "Philadelphia (Eastern) time, wherever you are."],
    ["Who can use it?", "Anyone who signs in to PennTools with a Penn account during the pilot. Members-only tickets rely on the buyer confirming they're a member."],
    ["Do I need to sign in?", `Not to look around. ${nf ? "Asking to buy, reserving" : "Reserving, offers"}, selling, requests, alerts and My activity use your PennTools sign-in: one account for buying and selling. Sign in from a Handoff button and you come back to where you were.`],
    ["Does it cost anything?", "No. Handoff charges no fees."],
  ]],
];
function LiveHelp({ go, ask }) { // ask: a guest's sign-in prompt (GUEST)
  const nf = inviteFlowOn();
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div className="eyebrow">Help</div>
        <h1 style={{ marginTop: 6 }}>How Handoff works</h1>
      </div>
      <div className="steps3">
        <div className="step-card"><span className="n">1</span><h3>Find it or list it</h3><p>{nf ? "Tap “Request to buy”, and the seller invites you to pay." : "Tap “I'll take it” or make an offer."} Nothing listed? Get notified, or post a request. Can't go? List yours.</p></div>
        <div className="step-card"><span className="n">2</span><h3>Reserve and pay</h3>{nf ? <p>Invited? Tap “Reserve and pay”: it's held for you for up to {TAKE_HOLD}. Pay the seller directly and tap “I've sent payment”.</p> : <p>It's held for you for {TAKE_HOLD} ({OFFER_HOLD} if the seller accepts your offer). Pay the seller directly and tap “I've sent payment”.</p>}</div>
        <div className="step-card"><span className="n">3</span><h3>Transfer, then received</h3><p>The seller confirms the payment and transfers it. You tap “Received”.</p></div>
      </div>
      {liveFaq(nf).map(([group, items]) => (
        <section className="sec" key={group}>
          <h2 style={{ marginBottom: 8 }}>{group}</h2>
          {items.map(([q, a]) => (
            <details className="xsec" key={q}><summary><span><b>{q}</b></span></summary><div className="xsec-body"><p style={{ fontSize: 14.5 }} data-help-verify={a === HELP_VERIFY ? "" : undefined}>{a}</p></div></details>
          ))}
        </section>
      ))}
      <div className="actions" style={{ marginTop: 18 }}><button className="btn btn-primary" onClick={() => go("explore")}>Browse tickets<Icon name="arrow" size={16} /></button><button className="btn" onClick={() => go("goods")}>Browse goods<Icon name="arrow" size={16} /></button><button className="btn" aria-haspopup={GUEST ? "dialog" : undefined} onClick={() => GUEST ? ask("post", { name: "post", from: "how" }) : go("post")}><Icon name="hand" size={16} />Post a request</button></div>
      <p className="muted help-foot">Built for Wharton classmates. {BRAND} is an independent student project, not affiliated with or endorsed by the University of Pennsylvania, the Wharton School or any club.</p>
    </div>
  );
}

/* ============================================================
   GUEST MODE (USER-INSTRUCTIONS §5 items 1-2; C-CONTRACT.md §7)
   A signed-out visitor browses the server's guest view: its events, the listings and items anyone signed in could take right now (with
   how many are left), and live public requests without who asked. It has no people, notes, budgets, venues, links, holds or history,
   so these pages read only those records and never say who: "a classmate". They can't tell "nothing listed" from "all held", so a row
   says "None available right now" (an empty Available's one line is the same signed in or not: "Nothing listed right now.", §9s
   item 2). Every action that needs to know who you are asks for PennTools sign-in first (ask: App's
   askSignIn, a dialog), then the page opens at the same listing, request or form. Nothing a guest does is sent as a change.
   ============================================================ */
// guestOpenListings (a guest view's listings open to take now), and a guest's Available (guestEventRows, guestAvailable; §9r): _lib/available.js.
// A guest's Wanted (guestWantedLive, guestWantedTitle, guestWantedRows; §9s item 1: no "Needed by"): _lib/wanted.js.
/* guestItemText (what a guest's search reads of an item: no area or note, and only what the item states): _lib/goods.js, read by _lib/available.js. */
const guestFace = ev => { const ps = (ev.tiers || []).map(t => t.price).filter(Number.isFinite); if (!ps.length) return ""; const lo = Math.min(...ps), hi = Math.max(...ps); return `Face value ${lo === hi ? money(hi) : `${money(lo)}–${money(hi)}`}`; };
/* A guest page's way back: the page it was opened from (an event, item or request page), or the browsing view. */
function GuestBack({ back, origin, go, s }) {
  const o = origin && typeof origin === "object" ? origin : null;
  const up = o && o.origin && typeof o.origin === "object" ? { origin: o.origin } : {};
  const ev = o && o.name === "event" && Object.prototype.hasOwnProperty.call(EV, o.id) ? EV[o.id] : null;
  const it = o && o.name === "item" ? s.goods.find(x => x.id === o.id) || null : null;
  const rq = o && o.name === "iso" ? s.wanted.find(x => x.id === o.id) || null : null;
  const [label, to] = ev ? [ev.title, () => go("event", { id: ev.id, ...up })] : it ? [it.title, () => go("item", { id: it.id, ...up })]
    : rq ? ["A classmate's request", () => go("iso", { id: rq.id, ...up })] : [VIEW_LABEL[back] || "Available", () => go(back || "explore")];
  return <button type="button" className="btn btn-ghost btn-sm back" onClick={to}><Icon name="back" size={15} />{label}</button>;
}
function GuestNotFound({ title, text, label, onBack }) {
  return <div className="wrap"><div className="page-head"><h1>{title}</h1><p className="muted" style={{ marginTop: 8 }}>{text}</p><div className="actions" style={{ marginTop: 14 }}><button className="btn" onClick={onBack}>{label}</button></div></div></div>;
}
/* §9v item 1 (SELL5-M4): a visitor's cards on Available are the signed-in ones (BoardEventCard, BoardGoodsCard), from the guest view:
   how many are available and the lowest price, never who sells; an item's price ("Free" at an explicit $0) and when it was posted. */
function GuestEventCard({ ev, stock, price, onOpen, onClub = null }) {
  const u = unitOf(ev), label = `${plural(stock, u)} available`;
  const p = cardPrice({ pre: [UnitOf(ev) + "s from "], bold: [money(price)], post: [] }); // §9x item 1: a free ticket reads "Free"
  return <BoardEventCard ev={ev} state={{ key: "available", label, tone: "good" }} price={<>{p.pre}<b>{p.bold}</b>{p.post}</>} sub={faceCaption(guestFace(ev), p.bold)} onOpen={onOpen} onClub={onClub} />;
}
function GuestGoodsCard({ it, onOpen }) {
  return <BoardGoodsCard it={it} st={{ key: "available", label: "Available", tone: "good" }} sub={`Posted ${ago(it.createdAt)}`} onOpen={onOpen} />;
}
/* A guest's Available (guestEventRows, guestAvailable: the guest view's event cards with stock, items on sale and rows for events with
   no tickets, by the rules of the engine's availableNow, §9r): _lib/available.js. */
/* §9r: a row leads with "Request a ticket" (it asks for sign-in, then opens Request a ticket (ISO) with that event chosen). Only events
   whose requests are open are rows (guestAvailable), so each has it. */
function GuestLookupRows({ rows, go, ask, also }) { // also: below cards, so it says these matched too
  return (
    <section className="lookup" aria-labelledby="lookup-h">
      <div><h2 id="lookup-h">{also ? "Also matching, with nothing available" : "Nothing available right now"}</h2><p className="muted">{LOOKUP_HINT}</p></div>
      <ul className="lookup-list">{rows.map(({ ev, a }) => { const wait = demandAllowed(ev); return (
        <li key={ev.id} className="lookup-row" data-ev={ev.id}>
          <Cover ev={ev} className="lookup-ic" size={18} />
          <div className="lookup-main"><b>{ev.title}</b><span className="muted">{dotJoin(fmtRange(ev), ev.club)}</span></div>
          <span className="chips"><span className="chip">{a.ok ? "None available right now" : a.short}</span></span>
          <span className="lookup-act">
            {wait && <button className="btn btn-sm btn-primary" aria-haspopup="dialog" onClick={() => ask("post", { name: "post", eventId: ev.id })} aria-label={`${requestLabel(ev)}: ${ev.title}`}><Icon name="hand" size={14} />{requestLabel(ev)}</button>}
            <button className="btn btn-sm" onClick={() => go("event", { id: ev.id })} aria-label={`View event: ${ev.title}`}>View event</button>
            {wait && <button className="btn btn-sm" aria-haspopup="dialog" onClick={() => ask("notify", { name: "event", id: ev.id, do: "notify" })} aria-label={`Get notified: ${ev.title}`}><Icon name="bell" size={14} />Get notified</button>}
          </span>
        </li>); })}</ul>
    </section>
  );
}
/* Available for a guest. */
function GuestExplore({ s, go, ask, disc, setDisc, emptyPost }) { // emptyPost: see useEmptyPost
  const d = disc, q = d.q.trim(), goods = d.cat === "goods";
  const minute = Math.floor(CLOCK / 60e3); // as Explore's: a row leaves when its event's cutoff passes with the page open
  const { cards, lookup, clubOn } = useMemo(() => guestAvailable(s, d), [s, d, minute]);
  const club = clubOn ? clubOf(d.club) : null;
  const clubEmpty = !!club && guestEventRows(s, { club: clubOrgs(d.club) }).length === 0 && guestEventRows(s, { club: clubOrgs(d.club), q }).length === 0;
  // search: after sign-in the form starts from this search, kept in this tab for the round trip (never in the URL).
  const post = () => ask("post", { name: "post", ...(goods ? { market: "goods", cat: d.goodsCat !== "All" ? d.goodsCat : undefined } : {}), search: !!q });
  const empty = !clubEmpty && cards.length === 0 && lookup.length === 0;
  useEmptyPost(emptyPost, empty ? post : null);
  return (
    <div className="wrap" style={{ paddingBottom: 36 }}>
      <p className="sr" role="status">{clubEmpty ? "" : `${plural(cards.length, "result")}${lookup.length ? `, and ${plural(lookup.length, "event")} with nothing available` : ""}`}</p>
      {clubEmpty ? (
        <div className="empty" style={{ marginBottom: 28 }}>
          <b style={{ color: "var(--ink)", fontSize: 16 }}>No {club.label} events on Handoff right now.</b>
          <span>When there are, their tickets will show here.</span>
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => setDisc({ club: null })}><Icon name="grid" size={16} />See all events</button>
          </div>
        </div>
      ) : empty ? (
        <BrowseEmpty side="explore" disc={d} setDisc={setDisc} post={post} />
      ) : <>
        {cards.length > 0 && <div className="grid">{cards.map(c => c.ev ? <GuestEventCard key={c.key} ev={c.ev} stock={c.stock} price={c.price} onOpen={() => go("event", { id: c.ev.id })} onClub={clubTap(setDisc)} /> : <GuestGoodsCard key={c.key} it={c.it} onOpen={() => go("item", { id: c.it.id })} />)}</div>}
        {lookup.length > 0 && <GuestLookupRows rows={lookup} go={go} ask={ask} also={cards.length > 0} />}
      </>}
    </div>
  );
}
/* An event page for a guest: the event's published facts, its open listings (ticket type, price, how many, offers, members-only, a
   flagged restriction, a train's departure), and how many classmates are looking. */
function GuestEventPage({ s, id, go, ask, back = "explore", focusListing, checking = false, nav, origin }) { // checking: focusListing's link opened in this tab, fresh availability not in yet (App): nothing is said about that listing until it is
  const ev = Object.prototype.hasOwnProperty.call(EV, id) ? EV[id] : null;
  const [hl, setHl] = useState(null);
  const showListing = lid => { const el = demoElement("lst-" + lid); if (!el) return; el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); setHl(lid); };
  useEffect(() => { if (!focusListing) return; if (checking) { setHl(null); return; } const t = setTimeout(() => showListing(focusListing), 0); return () => clearTimeout(t); }, [focusListing, nav, checking]);
  const [listInView, setListInView] = useState(false); // the phone shortcut to the listings hides while they're on screen
  useEffect(() => {
    const el = demoElement("listed-spots"); if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setListInView(e.isIntersecting), { threshold: 0.1 }); io.observe(el);
    return () => io.disconnect();
  }, [id]);
  if (!ev) return checking ? <LinkChecking /> : <GuestNotFound title="Event not found" text="It may have ended or been removed. Signed in, you may see more." label="See Available" onBack={() => go("explore")} />;
  const a = access(ev), u = unitOf(ev);
  const listings = guestOpenListings(s, ev), stock = listings.reduce((t, l) => t + l.available, 0);
  const wanted = s.wanted.filter(w => w.eventId === id && guestWantedLive(w)), units = wanted.reduce((t, w) => t + w.qty, 0);
  const canWait = demandAllowed(ev);
  const missed = !!focusListing && !checking && !listings.some(l => l.id === focusListing); // a link to a listing that isn't open to take right now (once fresh availability is in)
  const state = !a.ok ? { label: a.short, tone: "bad" } : stock > 0 ? { label: `${plural(stock, u)} available`, tone: "good" } : { label: "None available right now", tone: "warn" };
  const from = listings.length ? Math.min(...listings.map(l => l.ask)) : null, face = guestFace(ev);
  const toListings = () => { const el = demoElement("listed-spots"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); const h = demoElement("listed-head"); if (h) h.focus({ preventScroll: true }); };
  const lookingFor = <>
    <h3 className="intent-h">Looking for {aUnit(u)}?</h3>
    <p className="muted intent-p">Get a private alert when a matching listing appears, or post a public request classmates can answer.</p>
    {canWait ? <div className="actions">
        <button type="button" className="btn btn-primary" aria-haspopup="dialog" onClick={() => ask("notify", { name: "event", id, do: "notify" })}><Icon name="bell" size={16} />Get notified</button>
        <button type="button" className="btn" aria-haspopup="dialog" onClick={() => ask("post", { name: "post", eventId: id, from: "event", fromId: id })}><Icon name="hand" size={16} />Post a request</button>
      </div>
      : <p className="reason" style={{ marginTop: 0 }}>Alerts and requests are off. {a.why}</p>}
  </>;
  return (
    <div className="wrap" data-ev={ev.id}>
      <GuestBack back={back} origin={origin} go={go} s={s} />
      <div className="ev-top">
        <Cover ev={ev} className="thumb" size={34} />
        <div className="titleblock">
          <div className="tclub">{dotJoin(ev.club, catLabel(ev.cat))}{ev.club || ev.cat ? " · " : ""}<span data-ev-source="">{sourceLine(ev.sourcesNote)}</span></div>{/* §9x item 4: "Added by a classmate", without "details not checked by Handoff" */}
          <h1>{ev.title}</h1>
          <div className="ev-facts"><span className="tline"><Icon name="calendar" size={15} />{fmtRange(ev)}</span></div>
          <div className="chips" style={{ marginTop: 4 }}>
            <StateBadge state={state} />
            {transferTag(ev).label !== state.label && <TransferChip ev={ev} />}
            {ev.attend === "members" && <span className="chip">Members only</span>}
          </div>
        </div>
      </div>

      <div className="ev-layout">
        <div>
          {missed && <div className="callout" style={{ marginTop: 18 }}>The listing you followed isn't open to take right now: it may be held for a buyer, sold or withdrawn. Signed in, you may see more.</div>}
          <section style={{ marginTop: 22 }} id="listed-spots">
            <div className="section-head"><h2 id="listed-head" tabIndex={-1}>Available {u}s</h2>
              <span className="muted" style={{ fontSize: 13 }}>{faceText(ev) ? `Each ${u} is capped at its face value` : ""}</span></div>{/* forms round 2: the face value caps prices, where one is given */}
            {ev.tiers.length > 1 && <div className="chips" style={{ marginBottom: 12 }}>{ev.tiers.map(t => <span key={t.id} className="chip">{t.label}{faceOf(t) != null ? ` ${money(t.price)}` : ""}</span>)}<span className="chip tone-muted">{FACE_CHIP}</span></div>}
            <div className="panel">
              {listings.length === 0 && (a.ok
                ? <div className="ev-empty"><p className="booking-none"><b>None available right now</b></p><div className="intent">{lookingFor}</div></div>
                : <div className="muted" style={{ padding: "4px 0" }}>{a.why}</div>)}
              {listings.map(l => { const tier = l.tier ? tierOf(ev, l.tier) : null, members = membersOnlyListing(ev, l) && ev.attend !== "members"; return (
                <div className={"listing guest" + (hl === l.id ? " hl" : "")} key={l.id} id={"lst-" + l.id} tabIndex={-1} data-lid={l.id}>
                  <div style={{ minWidth: 0 }}>
                    {/* §9n: several tickets at one price read "2 tickets · $25 each"; one reads "1 ticket available", as before. */}
                    <div className="who">{listingQtyLine(l.available, l.ask, u) ? <span data-qty-line="">{listingQtyLine(l.available, l.ask, u)}</span> : `${plural(l.available, u)} available`}{tier && ev.tiers.length > 1 ? ` · ${tier.label}` : ""}</div>
                    <div className="note">Listed {ago(l.createdAt)} by a classmate</div>
                    {l.obo && <div className="note"><span className="chip tone-accent" style={{ marginRight: 6 }}>OBO · open to offers</span></div>}
                    {/* §9v items 4 and 5: the club named on the listing (plain text), and its restrictions in plain words: "GCC members only",
                        "The organizer must change the name on the ticket", an older listing's flag, and only that its seller noted words of
                        their own (read once signed in). None: nothing. A GCC event's open ticket reads no warning. */}
                    <ListingTerms ev={ev} l={l} own noted={l.restrictionNoted === true} />
                    {l.departsAt && <div className="note"><b style={{ color: "var(--ink)" }}>Train departs {fmtWhen(l.departsAt)}</b></div>}
                  </div>
                  <div className="l-act" style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <div className="ask">{l.ask === 0 ? "Free" : money(l.ask)}{l.ask !== 0 && <small>per {u}</small>}</div>{/* §9x item 1: a free ticket's price reads "Free" */}
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      {/* Follow-on B5, once the switch is on: one button, "Request to buy" (an offer is a field in its form); the return target stays do=take. */}
                      <button className="btn btn-primary btn-sm" aria-haspopup="dialog" onClick={() => ask("take", { name: "event", id, listing: l.id, do: "take" })}>{inviteFlowOn() ? askBtn(l.ask === 0, u) : "I'll take it"}</button>
                      {l.obo && !inviteFlowOn() && <button className="btn btn-sm" aria-haspopup="dialog" onClick={() => ask("offer", { name: "event", id, listing: l.id, do: "offer" })}>Make offer</button>}
                    </div>
                  </div>
                </div>); })}
            </div>
            <p className="guest-note">Signed in, you'll also see who's selling and their notes, and the venue if the event lists one.</p>
          </section>
        </div>

        <aside className="rail">
          <div className="panel booking" style={{ display: "grid", gap: 14 }}>
            <div><div style={{ fontSize: 15 }}>{from != null ? <>{UnitOf(ev)}s from <b>{money(from)}</b></> : face || (a.ok ? "None available right now" : a.short)}</div>{(from != null ? face : face && (a.ok ? "None available right now" : a.short)) ? <div className="muted" style={{ fontSize: 13 }}>{from != null ? face : a.ok ? "None available right now" : a.short}</div> : null}</div>{/* forms round 2: an event may give no face value */}
            {stock > 0 && <button className="btn btn-primary" onClick={toListings}>See {plural(stock, u)}</button>}
            <PolicyDetails ev={ev} chip={false} />
          </div>
          {!(a.ok && listings.length === 0) && a.kind !== "official" && <div className="panel intent">{lookingFor}</div>}
          {a.kind !== "official" && a.kind !== "closed" && (
            <section className="panel demand" aria-labelledby="dm-h">
              <h3 id="dm-h" className="intent-h">Classmates looking</h3>
              <p className="demand-count">{wanted.length ? <><b>{plural(wanted.length, "request")} from {plural(wanted.length, "classmate")}</b> · {plural(units, u)} wanted</> : "No public requests yet."}</p>
              {wanted.length > 0 && <button type="button" className="linkish see-all" onClick={() => go("isos", { q: ev.title, cat: catOf(ev) })}>See all in Wanted<Icon name="arrow" size={14} /></button>}
            </section>
          )}
          {a.kind !== "notonsale" && <div className="panel" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ fontSize: 17 }}>Can't go?</h3>
            {a.ok ? <>
                <p className="muted" style={{ fontSize: 13.5 }}>List it here. Classmates with a matching request or alert hear right away.</p>
                <button className="btn" aria-haspopup="dialog" onClick={() => ask("sell", { name: "list", eventId: id, from: "event", fromId: id })}><Icon name="ticket" size={16} />Sell my {u}</button>
              </>
              : <div className="callout warn"><b>{a.short}.</b> You can't list this {u} on Handoff.</div>}
          </div>}
        </aside>
      </div>
      {stock > 0 && !listInView && <div className="sticky-cta"><button className="btn btn-primary" onClick={toListings}><Icon name="ticket" size={15} />See {plural(stock, u)}</button></div>}
    </div>
  );
}
/* An item page for a guest: what it is, its price and its last day (a pickup-by date only where its seller chose one; §9q item 6); who
   sells it, where and their note need sign-in. */
function GuestItemPage({ s, id, go, ask, back = "explore", origin }) {
  const it = s.goods.find(x => x.id === id && !pickupOver(x));
  if (!it) return <GuestNotFound title="Item not found" text="It may have been sold or withdrawn, or it's on hold for a buyer. Signed in, you may see more." label="All goods" onBack={() => go("goods")} />;
  const request = () => ask("request", { name: "item", id: it.id, do: "request" });
  const free = isFreePrice(it.price), rule = goodsRuleFor(it); // an explicit $0 reads "Free", and nothing is paid (forms round 2)
  return (
    <div className="wrap">
      <GuestBack back={back} origin={origin} go={go} s={s} />
      <div className="ev-top">
        <ItemCover it={it} className="thumb" size={34} />
        <div className="titleblock">
          <div className="tclub">{itemOver(it)}</div>
          <h1>{it.title}</h1>
          <div className="ev-facts"><span className="tline"><Icon name="calendar" size={15} />{itemEnds(it)}</span></div>
          <div className="chips" style={{ marginTop: 4 }}><StateBadge state={{ label: "Available", tone: "good" }} />{it.obo && <span className="chip tone-accent">OBO · open to offers</span>}</div>
        </div>
      </div>
      <div className="ev-layout">
        <div>
          <ItemGallery it={it} />{/* §9s item 6: the item's photo, larger, as signed in (served to a visitor while the item is available) */}
          <section style={{ marginTop: 22 }}>
            <div className="section-head"><h2>Seller</h2></div>
            <div className="panel"><div className="listing guest" style={{ padding: 0, borderTop: 0 }}>
              <div style={{ minWidth: 0 }}><div className="who">Listed by a classmate</div><div className="note">Posted {ago(it.createdAt)}</div></div>
              <div className="l-act" style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                <div className="ask">{free ? "Free" : <>{money(it.price)}<small>asking</small></>}</div>
                <button className="btn btn-primary btn-sm" aria-haspopup="dialog" onClick={request}>{it.obo ? "Request or offer" : "Request"}</button>
              </div>
            </div></div>
            <p className="guest-note">Signed in, you'll also see who's selling, and the pickup area and note if they gave one.</p>
          </section>
        </div>
        <aside className="rail">
          <div className="panel booking" style={{ display: "grid", gap: 14 }}>
            <div><div style={{ fontSize: 15 }}><b>{itemPrice(it.price)}</b>{it.obo ? " or best offer" : ""}</div><div className="muted" style={{ fontSize: 13 }}>{free ? "Nothing to pay at pickup" : it.obo ? "Open to offers below the asking price" : "Fixed price"}</div></div>
            <button className="btn btn-primary" aria-haspopup="dialog" onClick={request}>{it.obo ? "Request or make an offer" : free ? "Request it (free)" : `Request at ${money(it.price)}`}</button>
            <div className={"policy " + rule.tone}><Icon name={rule.icon} size={20} /><div><b>{rule.label}</b>{rule.desc}</div></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
/* One request on Wanted for a guest, laid out as a signed-in viewer's (WantedCard, §9s item 7): the tile (its event's look, as on
   Available; an item request's category icon), what, the date with how many, the club, and a deadline only when it's earlier than the
   event's own end. Never who, their note, their budget or a match: none of that is in a guest's view (the tile never shows a seller's
   photo here, since the item it would come from is found by the request's private budget). "I have this" asks for sign-in and comes
   back to the request's page. */
/* §9v item 1 and §9w (SELL5-M4): the same card as signed in, from the guest view: the header line has how many are wanted (a visitor's
   view has no budget), the name opens the request's page, and the requester is "A classmate".
   §9y (SELL7-O1): the club on its own line under the date, which a tap applies in By club (CardClub), as signed in. */
function GuestRequestRow({ w, go, ask, onClub = null }) {
  const ev = w.eventId ? EV[w.eventId] : null, gd = w.goods || null, tid = "rq-t-" + w.id;
  const answerable = !!gd || access(ev).ok;
  const look = requestLook(w, ev), { when } = wantedWhen(w, ev), until = wantedNeed(w, ev).until, head = wantedHead(w, ev);
  const carrier = ev && ev.cat === "Travel" ? ev.club : null, clubs = ev ? cardClubs(ev) : [];
  return (
    <li className="req-row wcard bcard" data-iso={w.id} data-kind={look.cat}>
      <BoardBand look={look}><span className="state want" data-want=""><i />{head.text}</span></BoardBand>
      <div className="wc-body">
        <h3 id={tid}><button className="stretch" onClick={() => go("iso", { id: w.id })}>{guestWantedTitle(w)}</button></h3>
        {(when || carrier) && <p className="meta wc-when">{dotJoin(when, carrier)}</p>}
        <CardClub names={clubs} onClub={onClub} />
        {until && <p className="wc-need">{until}</p>}
      </div>
      <div className="req-foot wc-foot">
        <p className="wc-by"><span className="req-who">A classmate</span><span>· {ago(w.createdAt)}</span></p>
        <div className="req-acts"><div className="req-side">
          {answerable ? <button className="btn btn-sm btn-quiet" aria-haspopup="dialog" onClick={() => ask("share", { name: "iso", id: w.id })} aria-describedby={tid}><Icon name="hand" size={15} />I have this</button>
            : <button className="btn btn-sm" onClick={() => go("iso", { id: w.id })} aria-describedby={tid}>View request</button>}
        </div></div>
      </div>
    </li>
  );
}
/* Wanted for a guest (its rows: _lib/wanted.js): the same empty state as signed in (BrowseEmpty). */
function GuestWanted({ s, go, ask, disc, setDisc }) {
  const rows = useMemo(() => guestWantedRows(s, disc), [s, disc]);
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <p className="sr" role="status">{plural(rows.length, "request")}</p>
      {rows.length === 0 ? <BrowseEmpty side="isos" disc={disc} setDisc={setDisc} />
        : <ul className="req-list board-grid">{rows.map(w => <GuestRequestRow key={w.id} w={w} go={go} ask={ask} onClub={clubTap(setDisc)} />)}</ul>}
    </div>
  );
}
/* A request's page for a guest: the same anonymized summary, and "I have this", which asks for sign-in. */
function GuestIsoPage({ s, id, go, ask, origin }) {
  const w = s.wanted.find(x => x.id === id);
  const goHere = linkFrom(go, { name: "iso", id }, origin); // the event page it links to comes back here
  // §9x item 1 (SELL6-N1): a public request that isn't open any more (the view's closedWanted: its id and its event alone; or one this
  // page's own clock has ended since the last refresh) says "This request is closed". An id the view doesn't know reads "not found",
  // in words that guess no outcome: "fulfilled" is said only where it's recorded, and only to the request's owner.
  const gone = w && !guestWantedLive(w) ? { id: w.id, eventId: w.eventId || null } : !w ? (s.closedWanted || []).find(x => x.id === id) : null;
  if (gone) return <ClosedRequest c={gone} go={goHere} />;
  if (!w) return <GuestNotFound title="Request not found" text="It may have been removed, or it ended a while ago. Signed in, you may see more." label="See Wanted" onBack={() => go("isos")} />;
  const ev = w.eventId ? EV[w.eventId] : null, gd = w.goods || null, u = gd ? "item" : unitOf(ev), answerable = !!gd || access(ev).ok;
  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      <GuestBack back="isos" origin={origin} go={go} s={s} />
      <h1 className="sr">Request: {guestWantedTitle(w)}</h1>
      <div className="ev-layout">
        <div style={{ display: "grid", gap: 14 }}>
          <div className="iso">
            <div className="lhead" style={{ alignItems: "center" }}>
              <span className="tag">Looking for · {gd ? "an item" : plural(w.qty, u)}</span>
              {gd ? <span className="chip">{gd.cat}</span> : !access(ev).ok ? <span className="chip tone-muted">{access(ev).short}</span> : null}
            </div>
            <h3>{ev ? <button className="linkish" onClick={() => goHere("event", { id: ev.id })}>{ev.title}</button> : gd.title}</h3>
            {gd ? <div className="tline"><Icon name={itemLook(gd.cat).icon} size={15} /><span>Secondhand · {gd.cat}</span></div>
              : <div className="tline"><Icon name="calendar" size={15} /><span>{dotJoin(fmtRange(ev), ev.club)}</span></div>}
            <div className="tline"><Icon name="clock" size={15} />{w.expires ? `Needed ${deadlineText(w)}` : "No deadline"}</div>
            <div className="tline"><Icon name="users" size={15} /><span>Posted {ago(w.createdAt)} by a classmate</span></div>
          </div>
          <p className="guest-note">Signed in, you'll also see who's asking, their note and budget, and you can share {gd ? "an item" : "a listing"} with them.</p>
        </div>
        <aside className="rail">
          {answerable && <div className="panel" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ fontSize: 17 }}>Have {gd ? "one" : aUnit(u)}?</h3>
            <p className="muted" style={{ fontSize: 13.5 }}>{gd ? "Share your item with this request. Nothing is held: they request it like anyone else." : inviteFlowOn() && ev && isQuick(ev) ? "Invite them to pay for your listing, or share it with their request. Nothing is held until they reserve it." : "Share your listing with this request. Nothing is held: they take it or make an offer like anyone else."}</p>
            <button className="btn btn-primary" aria-haspopup="dialog" onClick={() => ask("share", { name: "iso", id: w.id })}><Icon name="hand" size={16} />I have this</button>
          </div>}
          {ev && <div className="panel" style={{ display: "grid", gap: 10 }}><div className="eyebrow">Event</div><h3 style={{ fontSize: 17 }}><button className="linkish" onClick={() => goHere("event", { id: ev.id })}>{ev.title}</button></h3><PolicyDetails ev={ev} compact /></div>}
        </aside>
      </div>
    </div>
  );
}
/* A sign-in prompt: the action, why it needs your account, where you'll come back to, and how this server signs in (PennTools' Google
   sign-in with a Penn account; a local development sign-in, which isn't a Penn account; or none yet, which leaves browsing). Sign in
   keeps what you'd chosen while browsing for the round trip (keepDiscovery, in _lib/session.js) and starts the platform's sign-in with
   the return target (returnHash; where it says you'll come back to: backToText, both in _lib/routes.js). */
function SignInBody({ act, target, signIn, localSignIn, disc, side, onCancel, cancelLabel = "Not now", whyId }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [, why] = signInAsk(act);
  const start = async () => {
    if (!signIn || busy) return;
    setBusy(true); setErr("");
    keepDiscovery(disc, side);
    const hash = "#" + returnHash(target);
    // The address bar's hash becomes the return target first, so the page comes back to the same place however the round trip ends:
    // next-auth's client reloading this page (it does when the answer has a hash, and that reload can win over its own navigation),
    // a sign-in that comes back on another host, or Back from the provider.
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search + hash); } catch (e) {}
    try { await signIn(window.location.pathname + hash); } // the callbackUrl: this page and its in-app place only; on success the browser goes to sign-in
    catch (e) { forgetDiscovery(); setBusy(false); setErr("Sign-in didn't open. Check your connection and try again."); }
  };
  return <>
    <p id={whyId} className="signin-why">{why}</p>
    {signIn ? <>
        <p className="signin-back">After you sign in, you'll come back to {backToText(target)}{draftWaits(target) ? ", with what you'd typed" : ""}.</p>
        <p className={"signin-note" + (localSignIn ? " warn" : "")}><Icon name="info" size={14} /><span>{localSignIn ? "This server uses a local development sign-in, not a Penn account." : "You sign in to PennTools with your Penn Google account: one account for buying, selling, requests and alerts."}</span></p>
      </>
      : <p className="callout warn signin-off">Sign-in isn't available on this server yet, so this can't be done here for now. You can keep browsing.</p>}
    {err && <p className="err" role="alert">{err}</p>}
    <div className="actions signin-acts">
      {signIn && <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>{busy ? "Opening sign-in…" : "Sign in"}</button>}
      <button type="button" className={signIn ? "btn btn-ghost" : "btn"} onClick={onCancel}>{signIn ? cancelLabel : "Keep browsing"}</button>
    </div>
  </>;
}
/* The prompt as a dialog, at the action (focus moves in, Tab stays inside, Escape or Not now closes it and focus goes back). */
function SignInDialog({ ask, signIn, localSignIn, disc, side, onClose }) {
  const dref = useRef(null); useDialog(dref, onClose);
  const [title] = signInAsk(ask.act);
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal signin-modal" ref={dref} role="dialog" aria-modal="true" aria-labelledby="si-title" aria-describedby="si-why">
        <div className="lhead" style={{ alignItems: "center" }}><h2 id="si-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        <SignInBody act={ask.act} target={ask.target} signIn={signIn} localSignIn={localSignIn} disc={disc} side={side} onCancel={onClose} whyId="si-why" />
      </div>
    </div>
  );
}
/* A page that's all about you (a posting form, My activity, Profile), reached by a link while signed out: its sign-in prompt (which one:
   GATE_ASK, from ROUTES' gate). */
function GuestGate({ view, go, signIn, localSignIn, disc, side }) {
  const act = GATE_ASK[view.name];
  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      <div className="page-head"><h1>{SIGN_IN_ASKS[act][0]}</h1></div>
      <div className="panel signin-panel"><SignInBody act={act} target={view} signIn={signIn} localSignIn={localSignIn} disc={disc} side={side} onCancel={() => go("explore")} cancelLabel="Browse Available" /></div>
    </div>
  );
}
/* The preview's own pages (_preview/pages.jsx; App renders them off the live route, from the preview's kit): the sample account's
   profile (ProfilePage), Help with About this preview (HowPage, HOW_FAQ), the project brief (ReviewerPage), the rule self-tests
   (SelfTestPage), the organizer preview (ClubsPage), and the feedback form and its results (FeedbackModal, ResultsPage). */

export default App;
