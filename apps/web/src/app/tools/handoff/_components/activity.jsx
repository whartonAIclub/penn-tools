// My activity (moved unchanged from HandoffPrototype.jsx): an overview of what needs you, your active listings, items, purchases,
// public requests and private alerts, and past activity, each row opening its detailed card in place of the overview (ActivityPage,
// with ACT_ORDER, ACT_ACTIONS and attnStep). Imports: ui, _lib/format, requests, exchanges and goods.
import React, { useState, useEffect, useRef } from "react";
import {
  DAY, CLOCK, PEOPLE, EV, atMs, fmtDate, fmtWhen, fmtMs, fmtRange, money, untilText, plural, isAddOn, access, demandAllowed,
  membersOnlyListing, FINAL, rState, flowFor, baseSt, requestDeadlines, reqPrice, listingNumbers, listingState, isExpired, isoTitle,
  isoMatches, sharesFor, GFINAL, gState, itemOf, goodsRespondBy, itemState, goodsMatches, unitOf, cap1, transferTag, rStatus, needsAction,
  listingPaused, itemPaused, itemPrice, eventWhen, memberClubOf, listingRestrictions
} from "@penntools/tool-handoff/engine";
import { LIVE } from "../_lib/mode";
import { demoRoot, demoQuery } from "../_lib/dom";
import { RECORD_PAGES } from "../_lib/routes";
import { demoDay } from "../_lib/format";
import { itemEndsShort } from "../_lib/goods";
import { Icon } from "./ui";
import { AlertDialog, REVIEW, closedAs, RequestManage, AlertCard } from "./requests";
import { HandoffCard, ListingPanel } from "./exchanges";
import { ItemPanel, gStatus, GoodsReqCard } from "./goods";

/* My activity: an overview, then one card at a time. "Needs your attention" is exactly needsAction's list (the header badge counts
   the same), soonest deadline first: a sale that needs you opens its listing or item, with every request on it; a purchase opens the
   exchange. Below it are your other active listings, items, purchases, public requests ("Looking for") and private alerts ("Get
   notified"), each shown once, and a collapsed "Past activity" (closed requests say whether they were fulfilled or cancelled). A row
   reads: what it is; one short status and its deadline; one action named for where it leads, which opens the existing detailed card
   (payments, progress, transfer details and every action) in place of the overview; then any critical note, and a link to a listing
   or item that really matches. A request's card can be edited, marked fulfilled or cancelled and lists what sellers shared with it;
   an alert's card can be edited, paused or removed. Event, item and request pages opened from here have a back button to it. */
const ACT_ORDER = { Selling: 0, Buying: 1, "Looking for": 2, "Get notified": 2 };
/* The action on an Active row, then on a Past row, by what the row opens (a private alert is an "iso" row that says Get notified). */
const ACT_ACTIONS = { listing: ["Manage listing", "View listing"], item: ["Manage item", "View item"], buy: ["View exchange", "View exchange"], gbuy: ["View exchange", "View exchange"],
  iso: ["Manage request", "View request"], alert: ["Manage alert", "View alert"] };
/* A row that needs you: one short status and an action named for where it leads ([status, action]). Display only: needsAction decides
   which rows need you and why, and its words stay on demo controls and on anything not named here. Live: an open offer or request on
   something the seller paused says so (C-CONTRACT §8: it can be declined, or accepted once it's resumed). */
function attnStep(s, t) {
  const why = t.why || "", seller = t.role === "seller";
  if (why === "a problem was reported") return ["Problem reported", "View report"];
  if (why === "the buyer says they paid after the reservation ended") return ["Late payment reported", "View report"]; // follow-on B5: nothing was reserved again
  if (/\(demo\)$/.test(why)) return [cap1(why), "View exchange"];
  if (t.kind === "goods") {
    const g = t.x, it = itemOf(s, g); if (!it) return [cap1(why), "View exchange"];
    const st = gState(g, it).st;
    if (seller && st === "pending" && LIVE && itemPaused(it)) return g.isOffer ? ["Offer open · item paused", "Review offer"] : ["Request open · item paused", "Review request"];
    if (seller && st === "pending") return g.isOffer ? ["New offer", "Review offer"] : ["New request", "Review request"];
    if (st === "accepted" && !g.pickupAt) return ["Pickup time needed", "Arrange pickup"];
    if (st === "accepted" && !seller) return ["Ready for pickup", "Pickup details"];
  } else {
    const r = t.x, st = rState(r).st, l = s.listings.find(x => x.id === r.listingId), ev = EV[r.eventId];
    if (!l || !ev) return [cap1(why), "View exchange"]; // a view always carries both; never fail if one doesn't
    const o = PEOPLE[seller ? r.buyerId : l.sellerId].first; // the other side's first name
    if (seller && st === "pending" && LIVE && listingPaused(s, l)) return ["Offer open · listing paused", "Review offer"];
    if (seller && st === "pending") return r.isOffer ? ["New offer", "Review offer"] : ["New request", "Review request"];
    if (!seller && st === "sent") return ["Sent to you", "Delivery details"];
    if (r.flow === "quick") {
      // Follow-on B5 (invite to pay): a request to buy is the seller's turn, an invitation the buyer's; nothing is held in either.
      if (seller && st === "requested") return listingPaused(s, l) ? ["Request open · listing paused", "Review request"] : [r.price === 0 ? `${o} wants your ticket` : `${o} wants to buy`, "Review request"]; // §9x item 1: nobody buys a free ticket
      if (!seller && st === "invited") return r.price === 0 ? ["Invited", "Reserve"] : ["Invited to pay", "Reserve and pay"]; // §9x item 1: a free ticket isn't paid for
      if (seller && st === "paid") return [`${o} says they paid`, "Check payment"];
      if (seller && st === "confirmed") return ["Transfer due", "Transfer details"];
      if (!seller && st === "accepted") return ["Payment due", "Payment details"];
      if (!seller && st === "countered") return [`${o} countered`, "Review counter-offer"];
      if (!seller && st === "proposed") return [`${o} replied`, `Reply to ${o}`];
    } else if (seller && st === "accepted") {
      return (r.flow || flowFor(ev, l, r)) === "peer" ? [ev.paperTicket ? "Ready to hand over" : "Ready to send", "Transfer details"] : ["Organizer steps to start", "Organizer steps"];
    }
  }
  return [cap1(why), "View exchange"];
}
export function ActivityPage({ s, me, go, dispatch, openShare, flash, saveEmail, saveProfile, initialOpen, draft }) { // draft: forms kept when the session ended (keepDraft); saveEmail: the alert dialog's "Also email me matches" (follow-on B4); saveProfile: the payment method a seller is asked for at a first invitation (follow-on B5)
  // { type, id, from, part }: the card shown instead of the overview; "from" is the row that opened it, "part" what to focus in the card
  // ("shared": a request's shared listings). A link can open one card ("iso:<id>").
  const [open, setOpen] = useState(() => { const k = typeof initialOpen === "string" ? initialOpen.indexOf(":") : -1; return k > 0 ? { type: initialOpen.slice(0, k), id: initialOpen.slice(k + 1) } : null; });
  // A seller's edit of a listing or item kept when the session ended: the return target opened its card (initialOpen), whose panel
  // opens the edit form again with what was typed. Only that first card gets it; leaving the card drops it.
  const termsKept = useRef(draft && draft.terms && typeof draft.terms === "object" ? draft.terms : null);
  const [alertFor, setAlertFor] = useState(null); // the event whose private alert is being edited (its dialog)
  const [pastOpen, setPastOpen] = useState(false);
  const detail = useRef(null), returnTo = useRef(null);
  const price = (ev, amount, qty) => `${money(amount)}${ev && ev.premium ? " reimbursement" : qty > 1 ? " each" : ""}`;
  const unitFor = (ev, l) => l && isAddOn(ev, l) ? "add-on" : unitOf(ev); // a trek's extension is an add-on, not a spot
  // A finished exchange with an open problem report stays active, as the cards mark it "Disputed".
  const disputed = (x, st) => st === "completed" && !!(x.problem && !x.problem.resolvedAt);
  // A row whose item, listing or event isn't in the view (a view always carries them) is left out rather than failing the page.
  const attn = needsAction(s, me).filter(t => t.kind === "goods" ? !!itemOf(s, t.x) : !!EV[t.x.eventId] && s.listings.some(x => x.id === t.x.listingId)).map(t => {
    const seller = t.role === "seller", [status, action] = attnStep(s, t);
    if (t.kind === "goods") {
      const g = t.x, it = itemOf(s, g), st = gState(g, it).st;
      return { key: "att:" + g.id, open: seller ? { type: "item", id: it.id } : { type: "gbuy", id: g.id }, at: t.at, title: it.title, label: seller ? "Selling" : "Buying",
        meta: [PEOPLE[seller ? g.buyerId : it.sellerId].name, `${itemPrice(g.price)}${g.isOffer ? " offer" : ""}`], status, action, tone: "accent", // live: an explicit $0 reads "Free" (forms round 2)
        due: st === "pending" ? goodsRespondBy(g, it) : st === "accepted" ? g.holdUntil || atMs(it.until) : null };
    }
    const r = t.x, l = s.listings.find(x => x.id === r.listingId), ev = EV[r.eventId], b = baseSt(rState(r)), dl = requestDeadlines(r);
    return { key: "att:" + r.id, open: seller ? { type: "listing", id: l.id } : { type: "buy", id: r.id }, at: t.at, title: ev.title, evId: ev.id, label: seller ? "Selling" : "Buying",
      meta: [PEOPLE[seller ? r.buyerId : l.sellerId].name, plural(r.qty, unitFor(ev, l)), price(ev, b === "countered" ? r.counterPrice : reqPrice(r, l), r.qty)], status, action, tone: "accent",
      due: dl.next && dl.who === t.role && !(r.payDisputedAt && !r.paymentConfirmedAt) ? dl.next : null, // a disputed payment's release time is when the seller may release it, not a due date
      notes: [r.departsAt && `Train departs ${fmtWhen(r.departsAt)}`, !seller && ["countered", "proposed"].includes(b) && membersOnlyListing(ev, l) && !r.memberConfirmed && `Members only: ${memberClubOf(ev, l)}`,
        // §9v item 5 (live): the ticket's restrictions in plain words (a train's carrier rule first, as before); the preview keeps its flag.
        ...(!seller && LIVE ? [transferTag(ev).restricted && transferTag(ev).label, ...listingRestrictions(ev, l).filter(x => x.kind !== "members").map(x => x.text)]
          : [!seller && (l.restricted ? "Seller flagged a transfer restriction" : transferTag(ev).restricted && transferTag(ev).label)])] };
  }).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || b.at - a.at); // the nearest deadline first; rows without one after them, newest first
  // Everything else of yours, once: a listing or item that needs you is already above.
  const shown = new Set(attn.map(x => x.open.type + ":" + x.open.id));
  const active = [], past = [];
  const add = (x, done) => { if (!shown.has(x.open.type + ":" + x.open.id)) (done ? past : active).push(x); };
  s.listings.filter(l => l.sellerId === me && EV[l.eventId]).forEach(l => {
    const ev = EV[l.eventId], st = listingState(s, l);
    // A closed, transferred or withdrawn listing is past only once no match on it is still in progress (organizer steps outlive the cutoff).
    add({ key: "listing:" + l.id, open: { type: "listing", id: l.id }, at: l.createdAt, title: ev.title, evId: ev.id, label: "Selling", meta: [plural(l.listed, unitFor(ev, l)), price(ev, l.ask, l.listed)], status: st.label, tone: st.tone },
      ["transferred", "closed", "withdrawn"].includes(st.key) && !listingNumbers(s, l).reserved && !s.requests.some(r => r.listingId === l.id && disputed(r, rState(r).st)));
  });
  s.goods.filter(it => it.sellerId === me).forEach(it => {
    const st = itemState(s, it);
    add({ key: "item:" + it.id, open: { type: "item", id: it.id }, at: it.createdAt, title: it.title, label: "Selling", meta: [`${itemPrice(it.price)}${it.obo ? " OBO" : ""}`], status: st.label, tone: st.tone },
      ["sold", "withdrawn", "closed"].includes(st.key) && !s.goodsReqs.some(g => g.itemId === it.id && disputed(g, gState(g, it).st)));
  });
  s.requests.filter(r => r.buyerId === me && EV[r.eventId]).forEach(r => {
    const l = s.listings.find(x => x.id === r.listingId), ev = EV[r.eventId], e = rState(r), st = rStatus(r, e); if (!l) return;
    const held = LIVE && ["pending", "countered"].includes(e.st) && listingPaused(s, l); // an open offer or counter the seller's pause keeps waiting
    const asked = LIVE && r.inviteFlow === true && ["requested", "invited"].includes(e.st) && listingPaused(s, l); // follow-on B5: a request to buy or an invitation the pause keeps waiting
    add({ key: "buy:" + r.id, open: { type: "buy", id: r.id }, at: r.createdAt, title: ev.title, evId: ev.id, label: "Buying", meta: [plural(r.qty, unitFor(ev, l)), price(ev, baseSt(e) === "countered" ? r.counterPrice : reqPrice(r, l), r.qty)],
      status: held ? (e.st === "countered" ? "Counter-offer · listing paused" : "Offer pending · listing paused") : asked ? (e.st === "invited" ? (r.price === 0 ? "Invited · listing paused" : "Invited to pay · listing paused") : "Request to buy · listing paused") : st.label, tone: st.tone },
      FINAL.includes(e.st) && !disputed(r, e.st));
  });
  s.goodsReqs.filter(g => g.buyerId === me).forEach(g => {
    const it = itemOf(s, g); if (!it) return; const e = gState(g, it), st = gStatus(g, e);
    const held = LIVE && ["pending", "waiting"].includes(e.st) && itemPaused(it); // an open request or backup the seller's pause keeps waiting
    add({ key: "gbuy:" + g.id, open: { type: "gbuy", id: g.id }, at: g.createdAt, title: it.title, label: "Buying", meta: [`${itemPrice(g.price)}${g.isOffer ? " offer" : ""}`], status: held ? `${st.label} · item paused` : st.label, tone: st.tone },
      GFINAL.includes(e.st) && !disputed(g, e.st));
  });
  s.interests.filter(i => i.userId === me && (!i.eventId || EV[i.eventId])).forEach(i => {
    const ev = i.eventId ? EV[i.eventId] : null;
    const over = !!ev && access(ev).kind === "closed"; // the event started or its transfer window closed: nothing left to wait for
    const fits = isoMatches(s, i), spots = fits.reduce((t, l) => t + listingNumbers(s, l).available, 0), items = goodsMatches(s, i).length; // the card's "possible match"
    // The row's "View match" (exactly when its status reports a match): the event at its first matching listing with stock, or the first item.
    const fit = fits.find(l => listingNumbers(s, l).available > 0), match = fit ? ["event", { id: ev.id, listing: fit.id }] : items ? ["item", { id: goodsMatches(s, i)[0].id }] : null;
    if (i.kind !== "iso") { // a private alert (older saved states may call it a waitlist): only you ever see it
      const st = i.status !== "open" ? { label: i.closedReason === "fulfilled" ? "Fulfilled" : "Removed", tone: "muted" } : !demandAllowed(ev) ? { label: access(ev).short, tone: "muted" }
        : i.paused ? { label: "Paused", tone: "warn" } : spots ? { label: `On · matches ${plural(spots, unitOf(ev))} listed`, tone: "good" }
        : access(ev).kind === "notonsale" ? { label: "On · not on sale yet", tone: "good" } : { label: "On", tone: "good" };
      add({ key: "iso:" + i.id, open: { type: "iso", id: i.id }, at: i.createdAt, title: isoTitle(i), evId: ev ? ev.id : null, label: "Get notified",
        meta: ["Private", plural(i.qty || 1, unitOf(ev)), i.max != null ? `up to ${money(i.max)}${ev.premium ? " reimbursement" : ""}` : "any price"], status: st.label, tone: st.tone, match }, i.status !== "open" || over);
      return;
    }
    const st = i.status !== "open" ? { label: closedAs(i), tone: "muted" } : isExpired(i) ? { label: `Expired ${fmtDate(i.expires)}`, tone: "muted" }
      : spots ? { label: `Possible match: ${plural(spots, unitOf(ev))} available`, tone: "good" } : items ? { label: `Possible match: ${plural(items, "item")} on Goods`, tone: "good" }
      : ev && !access(ev).ok ? { label: access(ev).short, tone: "muted" } : !ev && !i.goods ? REVIEW[i.review || "reviewing"]
      : { label: i.expires ? `Open · expires ${fmtDate(i.expires)}` : "Open", tone: "muted" };
    const shared = i.status === "open" ? sharesFor(s, i).length : 0; // listings or items sellers shared with it
    add({ key: "iso:" + i.id, open: { type: "iso", id: i.id }, at: i.createdAt, title: isoTitle(i), evId: ev ? ev.id : null, label: "Looking for",
      meta: [!i.goods && plural(i.qty, unitOf(ev)), i.budget != null && `up to ${money(i.budget)}${ev && ev.premium ? " reimbursement" : ""}`], status: st.label, tone: st.tone,
      match, shared: shared ? `${plural(shared, i.goods ? "item" : "listing")} shared with you` : null }, i.status !== "open" || isExpired(i) || over);
  });
  active.sort((a, b) => ACT_ORDER[a.label] - ACT_ORDER[b.label] || b.at - a.at);
  past.sort((a, b) => b.at - a.at);
  // Forms round 2 (§9j item 5; live): two events of one name (two departures of a train, two seatings of a show) would read alike in
  // these rows, so a row whose event shares its name with another event among your rows also says when: the date, and the actual start
  // or departure time when one is known (eventWhen, as in the Sell and Request menus). Rows of differently named events are as they were.
  if (LIVE) {
    const all = [...attn, ...active, ...past], byName = new Map();
    for (const x of all) if (x.evId) byName.set(x.title, (byName.get(x.title) || new Set()).add(x.evId));
    for (const x of all) if (x.evId && byName.get(x.title).size > 1 && EV[x.evId]) x.when = eventWhen(EV[x.evId]);
  }

  // An event, item or request page a card opens gets a back button to My activity that reopens this card (BackButton). Anything else
  // passes through as is: Edit opens the request form, which has its own way back here (from: "activity").
  const goOut = (to, params = {}) => go(to, RECORD_PAGES.includes(to) && open ? { ...params, origin: { name: "activity", open: open.type + ":" + open.id } } : params);
  // The full card for what's open, looked up afresh, so it stays put (showing the result) after an action moves it between sections.
  // Only this account's own: a card a link opened stays in the view across an account switch, and the other account gets its overview.
  const dim = closed => closed ? { background: "var(--surface-2)" } : null;
  const card = (() => {
    if (!open) return null;
    if (open.type === "listing") { const l = s.listings.find(x => x.id === open.id && x.sellerId === me); return l && EV[l.eventId] && <ListingPanel l={l} s={s} me={me} dispatch={dispatch} go={goOut} openShare={openShare} flash={flash} termsDraft={termsKept.current} saveProfile={saveProfile} />; }
    if (open.type === "item") { const it = s.goods.find(x => x.id === open.id && x.sellerId === me); return it && <ItemPanel it={it} s={s} me={me} dispatch={dispatch} go={goOut} openShare={openShare} flash={flash} termsDraft={termsKept.current} />; }
    if (open.type === "buy") {
      const r = s.requests.find(x => x.id === open.id && x.buyerId === me); if (!r || !EV[r.eventId]) return null; const ev = EV[r.eventId];
      return (
        <div className="panel" style={dim(FINAL.includes(rState(r).st) && rState(r).st !== "completed")}>
          <div className="lhead"><h3><button className="linkish" onClick={() => goOut("event", { id: ev.id })}>{ev.title}</button></h3>
            <span className="muted" style={{ fontSize: 13 }}>{fmtRange(ev)}</span></div>
          <HandoffCard r={r} role="buyer" s={s} dispatch={dispatch} go={goOut} flash={flash} />
        </div>
      );
    }
    if (open.type === "gbuy") {
      const g = s.goodsReqs.find(x => x.id === open.id && x.buyerId === me), it = g && itemOf(s, g); if (!it) return null; const st = gState(g, it).st;
      return (
        <div className="panel" style={dim(GFINAL.includes(st) && st !== "completed")}>
          <div className="lhead"><h3><button className="linkish" onClick={() => goOut("item", { id: it.id })}>{it.title}</button></h3>
            <span className="muted" style={{ fontSize: 13 }}>Goods · {itemEndsShort(it)}</span></div>
          <GoodsReqCard g={g} role="buyer" s={s} dispatch={dispatch} go={goOut} />
        </div>
      );
    }
    const i = s.interests.find(x => x.id === open.id && x.userId === me);
    if (!i || (i.eventId && !EV[i.eventId])) return null;
    return i.kind !== "iso" ? <AlertCard al={i} s={s} go={goOut} dispatch={dispatch} onEdit={() => setAlertFor(i.eventId)} />
      : <RequestManage i={i} s={s} go={goOut} dispatch={dispatch} openShare={openShare} from="activity" />;
  })();
  const show = (x, part) => { termsKept.current = null; returnTo.current = null; setOpen({ ...x.open, from: x.key, part }); demoRoot()?.scrollTo({ top: 0 }); };
  const back = () => { termsKept.current = null; returnTo.current = open; if (open && !open.from && past.some(x => x.open.type === open.type && x.open.id === open.id)) setPastOpen(true); setOpen(null); }; // a card a link or a page's "My activity" back button reopened (no row here opened it) whose row is under Past: open Past, so focus returns to that row
  // Focus: into the card's title when it opens (from a row's "N shared with you", the card's list of what was shared, scrolled into
  // view); back to the row that opened it (or one opening the same thing) on the way back.
  // A card opened by a link (initialOpen) takes focus after the app's own move to the page heading: its title, or, when it opened with a
  // kept edit (a seller's, back after sign-in), that edit form's heading, brought into view.
  const firstRun = useRef(true);
  useEffect(() => {
    const first = firstRun.current; firstRun.current = false;
    if (open) { const d = detail.current, h = d && ((open.part === "shared" && d.querySelector(".shared-list .sub-h")) || d.querySelector("h3")); if (h) { h.setAttribute("tabindex", "-1");
      if (first) { const f = d.querySelector('form[data-terms] > [tabindex="-1"]'); setTimeout(() => { if (f && f.isConnected) { f.focus({ preventScroll: true }); f.scrollIntoView({ block: "nearest" }); } else h.focus({ preventScroll: true }); }, 0); }
      else { h.focus({ preventScroll: true }); if (open.part) h.scrollIntoView({ block: "nearest" }); } } return; }
    const was = returnTo.current; returnTo.current = null; if (!was) return;
    const seen = el => el && !el.closest("[hidden]") ? el : null; // a row now under a closed Past activity: its toggle instead
    const t = seen(demoQuery(`[data-act-key="${was.from}"]`)) || seen(demoQuery(`[data-act-open="${was.type}:${was.id}"]`))
      || (demoQuery(`#act-past [data-act-open="${was.type}:${was.id}"]`) && demoQuery(".act-toggle")) || demoQuery("[data-handoff-content] h1");
    if (t) { if (t.matches("h1")) t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); t.scrollIntoView({ block: "center" }); }
  }, [open]);

  // The heading, with the honest note that this is sample data on the demo clock (beside it on wide screens, under it on phones).
  const head = <div className="page-head act-head"><div>{!LIVE && <div className="eyebrow">{PEOPLE[me].name}</div>}<h1 style={LIVE ? undefined : { marginTop: 6 }}>My activity</h1></div>{!LIVE && <p className="preview-note">Sample data · demo date {demoDay()}</p>}</div>;
  if (open && card) return (
    <div className="wrap act-page">
      {head}
      <button type="button" className="btn btn-ghost btn-sm act-back" onClick={back}><Icon name="back" size={15} />All activity</button>
      <div ref={detail} className="stack">{card}</div>
      {/* Turning the alert off removes Edit, which opened the dialog, so focus goes to the card's title rather than the page heading. */}
      {alertFor && demandAllowed(EV[alertFor]) && <AlertDialog ev={EV[alertFor]} s={s} me={me} dispatch={dispatch} saveEmail={saveEmail} flash={flash} onClose={() => setAlertFor(null)}
        onDone={() => setTimeout(() => { const d = detail.current, t = d && !d.contains(document.activeElement) && d.querySelector("h3 button"); if (t) t.focus(); }, 0)} />}
    </div>
  );
  // A row: what it is and its context; one status and its deadline; one action named for where it leads (it opens the row's card, and
  // stays the row's first button); then any critical note, "View match" (a listing or item that really fits) and what sellers shared.
  const row = (x, sec) => {
    const todo = sec === "attn", notes = (x.notes || []).filter(Boolean);
    const action = x.action || ACT_ACTIONS[x.label === "Get notified" ? "alert" : x.open.type][sec === "past" ? 1 : 0];
    return (
      <li key={x.key} className={"act-row" + (todo ? " todo" : "")}>
        <div className="act-main">
          <div className="act-title"><b>{x.title}</b></div>
          <p className="act-sub"><span className="act-kind">{x.label}</span>{(x.when || x.meta.some(Boolean)) && <span className="act-meta">{[x.when, ...x.meta].filter(Boolean).join(" · ")}</span>}</p>
        </div>
        <div className="act-stage">
          <span className={"chip act-status tone-" + x.tone}>{x.status}</span>
          {x.due && <span className={"chip act-due" + (x.due - CLOCK < DAY ? " tone-warn" : "")} title={fmtMs(x.due)}><Icon name="clock" size={13} />Due {untilText(x.due)}</span>}
        </div>
        <button type="button" className={"btn btn-sm" + (todo ? " btn-primary" : "")} data-act-key={x.key} data-act-open={x.open.type + ":" + x.open.id} aria-label={`${action}: ${x.title}${x.when ? `, ${x.when}` : ""} (${x.label.toLowerCase()}, ${x.status})`} onClick={() => show(x)}>{action}<Icon name="arrow" size={14} /></button>
        {(notes.length > 0 || x.match || x.shared) && <div className="act-extra">
          {notes.map(n => <span key={n} className="chip tone-warn"><Icon name="alert" size={13} />{n}</span>)}
          {x.match && <button type="button" className="linkish act-match" aria-label={`View match: ${x.title}`} onClick={() => go(x.match[0], { ...x.match[1], origin: { name: "activity" } })}>View match<Icon name="arrow" size={14} /></button>}
          {x.shared && <button type="button" className="chip tone-good act-match" aria-label={`${x.shared}: ${x.title}`} onClick={() => show(x, "shared")}><Icon name="check" size={13} />{x.shared}</button>}
        </div>}
      </li>
    );
  };
  return (
    <div className="wrap act-page">
      {head}
      <section className="act-sec attn" aria-labelledby="act-attn">
        <div className="act-sec-head"><h2 id="act-attn" className="act-h">Needs your attention{attn.length > 0 && <span className="count todo">{attn.length}</span>}</h2>{attn.length > 1 && <span className="act-hint">Soonest deadline first</span>}</div>
        {attn.length ? <ul className="act-list">{attn.map(x => row(x, "attn"))}</ul>
          : <p className="act-empty">Nothing needs you right now. When it's your turn on an offer, a reservation or a handoff, it shows up here.</p>}
      </section>
      <section className="act-sec active" aria-labelledby="act-active">
        <h2 id="act-active" className="act-h">Active<span className="count">{active.length}</span></h2>
        {active.length ? <ul className="act-list">{active.map(x => row(x, "active"))}</ul>
          /* A brand-new account (nothing anywhere yet) is told how to start, with the header's Sell and Post a request destinations from
             here; "other" only when something above needs you. */
          : !attn.length && !past.length ? <p className="act-empty">Nothing here yet. What you sell, reserve, ask for or get notified about shows up here. To start, <button type="button" className="linkish" onClick={() => go("list", { from: "activity" })}>sell something</button> or <button type="button" className="linkish" onClick={() => go("post", { from: "activity" })}>post a request</button>.</p>
          : <p className="act-empty">No {attn.length ? "other " : ""}active listings, purchases, requests or alerts. What you sell, reserve, ask for or get notified about shows up here.</p>}
      </section>
      <section className="act-sec past" aria-labelledby="act-past-h">
        <h2 id="act-past-h" className="act-h"><button type="button" className="act-toggle" aria-expanded={pastOpen} aria-controls="act-past" onClick={() => setPastOpen(o => !o)}>
          Past activity<span className="count">{past.length}</span><Icon name="chev" size={16} style={pastOpen ? { transform: "rotate(180deg)" } : undefined} /></button></h2>
        <div id="act-past" hidden={!pastOpen}>
          {past.length ? <ul className="act-list">{past.map(x => row(x, "past"))}</ul> : <p className="act-empty">Nothing here yet. Completed, cancelled and expired activity moves here.</p>}
        </div>
      </section>
    </div>
  );
}
