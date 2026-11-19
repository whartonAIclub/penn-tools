// Public requests and private alerts (moved unchanged from HandoffPrototype.jsx): a request's card (IsoCard, with REVIEW and closedAs),
// its owner's controls (RequestManage), a private alert's card (AlertCard), Get notified's dialog (AlertDialog), whether a request can
// be answered now (answerable), and the preview's email and text alert opt-in (AlertOptIn: it renders only off the live route).
// Imports: ui, and _lib/format for the deadline wording.
import React, { useState, useRef } from "react";
import { flushSync } from "react-dom";
import {
  PEOPLE, EV, fmtDay, fmtDate, fmtMs, fmtRange, money, ago, plural, parseMoney, access, demandAllowed, demandCap, rState, isOpenReq,
  personCap, isQuick, listingNumbers, isExpired, isoTitle, isoMatches, liveRequest, myAlertFor, alertText, sharesFor, GOODS_CATS, GFINAL,
  gState, itemState, goodsMatches, unitOf, aUnit, listingPaused, itemPaused, inviteFlowOn, dotJoin, faceName, FaceName, itemPrice, MATCHES_WHERE
} from "@penntools/tool-handoff/engine";
import { LIVE } from "../_lib/mode";
import { demoElement } from "../_lib/dom";
import { useDraftSource } from "../_lib/session";
import { deadlineText } from "../_lib/format";
import { itemLook } from "../_lib/look"; // §9x item 2 (live): a Goods request's icon here is the one its card wears on Wanted
import { Icon, Avatar, useDialog, Confirm } from "./ui";

/* Get notified: a private alert for one event, how many and an optional private max per unit (blank: any price). Only its owner sees it:
   it posts nothing publicly, holds nothing and never counts as demand. Save creates or updates it (joinAlert); Pause or Resume and Turn off
   change the open one (setAlert, closeInterest). A dialog: focus moves in, Tab stays inside, Escape or Close dismisses it. */
export function AlertDialog({ ev, s, me, dispatch, onClose, onDone, draft }) { // draft: its values when a session ended in it (keepDraft), back after sign-in
  const al = myAlertFor(s, me, ev.id); const u = unitOf(ev); const lim = personCap(ev); const top = demandCap(ev);
  const k = draft && draft.eventId === ev.id ? draft : null;
  const [qty, setQty] = useState(() => Math.min(k && Number.isInteger(k.qty) && k.qty >= 1 ? k.qty : (al && al.qty) || 1, lim));
  const [max, setMax] = useState(() => k && typeof k.max === "string" ? k.max : al && al.max != null ? String(al.max) : "");
  useDraftSource("alert", () => ({ place: { name: "event", id: ev.id, do: "notify" }, data: { alert: { eventId: ev.id, qty, max } } }));
  const pm = max.trim() === "" ? null : parseMoney(max);
  const err = pm && pm.error ? pm.error : pm && pm.value > top ? (ev.premium ? `Sellers can't ask more than they've paid so far (${money(top)}).` : LIVE ? `${FaceName(ev)} is ${money(top)}, so keep your maximum at or below it.` : `The top ${u} price is ${money(top)}. Keep your maximum at or below it.`) : null; // forms round 2 (live): the face value's words; none given, no cap (Infinity)
  const dref = useRef(null); useDialog(dref, onClose);
  // The answer comes after an await, outside the click's own render: close the dialog now (its focus goes back), so onDone's focus
  // move runs after it, as it did when changes were synchronous.
  const done = res => { if (!res.error) { flushSync(onClose); if (onDone) onDone(); } };
  const save = async e => {
    e.preventDefault(); if (err) return;
    const r = await dispatch({ type: "joinAlert", eventId: ev.id, qty, max: max.trim() });
    if (r.error) return;
    done(r);
  };
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal alert-modal" ref={dref} role="dialog" aria-modal="true" aria-labelledby="al-title" aria-describedby="al-desc">
        <div className="lhead" style={{ alignItems: "center" }}><h2 id="al-title">{al ? "Your private alert" : "Get notified"}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        <p className="muted al-ev">{ev.title} · {fmtRange(ev)}</p>
        <p id="al-desc" className="al-desc"><Icon name="lock" size={15} /><span>Only you see this. You'll get an in-app alert when a matching listing appears. It doesn't hold {aUnit(u)} or post anything publicly.</span></p>
        <form className="form-stack" style={{ marginTop: 14, gap: 14 }} onSubmit={save} noValidate>
          <div className="field al-qty"><label htmlFor="al-qty">How many {u}s</label>
            <select id="al-qty" value={qty} onChange={e => setQty(+e.target.value)} aria-describedby="al-qty-help">{Array.from({ length: lim }, (_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}</select>
            <span id="al-qty-help" className="help">{ev.perPerson ? `Up to ${lim}: the per-person limit for this event.` : `Up to ${lim} per person.`}</span></div>
          <div className="field al-max"><label htmlFor="al-max">{ev.premium ? "Maximum reimbursement per spot (optional, private)" : `Maximum price per ${u} (optional, private)`}</label>
            <div className="money"><span>$</span><input id="al-max" type="text" inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} aria-invalid={!!err} aria-describedby="al-max-msg" /></div>
            <span id="al-max-msg" className={err ? "err" : "help"}>{err || (LIVE && !Number.isFinite(top) ? "Blank means any price. Never shown to anyone." : top > 0 ? `Blank means any price. Never shown to anyone; up to ${money(top)}${ev.premium ? ", what sellers have paid so far" : LIVE ? `, ${faceName(ev)}` : ", the top ticket price"}.` : "Leave it blank for now: sellers can't ask more than they've paid so far ($0).")}</span></div>
          {al && al.paused && <div className="callout warn">Paused: it won't alert you until you resume it.</div>}
          {!LIVE && <AlertOptIn s={s} me={me} dispatch={dispatch} idp="al-via" compact />}
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={!!err}><Icon name="bell" size={15} />{al ? "Save" : "Turn on alert"}</button>
            {al && <button type="button" className="btn" onClick={() => dispatch({ type: "setAlert", id: al.id, paused: !al.paused })}>{al.paused ? "Resume" : "Pause"}</button>}
            {al && <button type="button" className="btn btn-ghost btn-danger" onClick={async () => done(await dispatch({ type: "closeInterest", id: al.id }))}>Turn off alert</button>}
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const REVIEW = { reviewing: { label: "Awaiting Handoff review", tone: "muted" }, onboarding: { label: "Being added (simulated)", tone: "accent" }, duplicate: { label: "Duplicate", tone: "muted" }, unsupported: { label: "Not supported", tone: "bad" } };
/* A public request as a card: what, when, who, their public budget, the deadline and any listing or item that already fits.
   `children` holds the owner's own controls (RequestManage); actions adds View event for everyone else, and onShare (the development
   preview only) its Share. The shared market has no outward Share (§9v item 3, SELL5-M1): a request's ordinary URL is its link, and
   requestShareable is false there whatever the request. */
export const closedAs = i => ({ fulfilled: "Fulfilled", cancelled: "Cancelled" })[i.closedReason] || "Closed";
export const requestShareable = (s, i) => !LIVE && i.status === "open";
export function IsoCard({ i, s, go, compact, linkIso, actions = false, onShare, children }) {
  const ev = i.eventId ? EV[i.eventId] : null; const gd = i.goods || null; const expired = isExpired(i); const open = i.status === "open";
  const miss = i.missing || {}; // an unlisted event's request (the preview only)
  const when = ev ? fmtRange(ev) : gd ? null : miss.flexible || !miss.when ? "Flexible dates" : fmtDay(miss.when);
  const matches = isoMatches(s, i);
  const spots = matches.reduce((t, l) => t + listingNumbers(s, l).available, 0);
  const items = gd ? goodsMatches(s, i) : [];
  const fit = matches.find(l => listingNumbers(s, l).available > 0); // the first fitting listing with one left (My activity's View match opens it too)
  // A match cue opens the match: the listing on its event page, or the item. A compact card (an item page's "Classmates looking") keeps
  // a plain chip: its match is the page you're on.
  const cue = (text, open) => compact || !open ? <span className="chip tone-good"><Icon name="bell" size={13} />{text}</span>
    : <button type="button" className="chip tone-good iso-match" onClick={open}><Icon name="bell" size={13} />{text}<Icon name="arrow" size={13} /></button>;
  return (
    <div className={"iso" + (expired || !open ? " dim" : "")}>
      <div className="lhead" style={{ alignItems: "center" }}>
        <span className="tag">Looking for · {gd ? "an item" : plural(i.qty, unitOf(ev))}</span>
        {!open ? <span className="chip">{closedAs(i)}</span> : expired ? <span className="chip">Expired {fmtDate(i.expires)}</span>
          : ev ? (access(ev).ok ? null : <span className="chip tone-muted">{access(ev).short}</span>)
          : gd ? <span className="chip">{gd.cat}</span>
          : <span className={"chip tone-" + REVIEW[i.review || "reviewing"].tone}>{REVIEW[i.review || "reviewing"].label}</span>}
      </div>
      <h3><button className="linkish" onClick={() => go(ev && compact && !linkIso ? "event" : "iso", ev && compact && !linkIso ? { id: ev.id } : { id: i.id })}>{isoTitle(i)}</button></h3>
      {gd ? <div className="tline"><Icon name={LIVE ? itemLook(gd.cat).icon : (GOODS_CATS[gd.cat] || GOODS_CATS.Other)[0]} size={15} /><span>Secondhand · {gd.cat}</span></div>
        : <div className="tline"><Icon name="calendar" size={15} /><span>{when}{!ev && miss.club ? ` · ${miss.club}` : ev && ev.club ? ` · ${ev.club}` : ""}</span></div>}
      <div className="tline"><Avatar id={i.userId} size={20} /><span>{PEOPLE[i.userId].name}{i.budget != null ? ` · up to ${money(i.budget)}${ev && ev.premium ? " reimbursement" : ""}` : LIVE ? "" : " · no budget given"}</span></div>{/* live (forms round 2): no budget, nothing said */}
      {i.note && <div className="quote">“{i.note}”</div>}
      {!ev && !gd && miss.details && <div className="quote">{miss.details}</div>}
      {!compact && <div className="tline"><Icon name="clock" size={15} />{!i.expires ? "No deadline" : open && !expired ? `Needed ${deadlineText(i)}` : `${expired ? "Ended" : "Deadline was"} ${fmtDate(i.expires)}`}</div>}
      {spots > 0 && cue(`Possible match: ${plural(spots, unitOf(ev))} available${spots < i.qty ? ` (covers ${spots} of ${i.qty})` : ""}`, ev && fit ? () => go("event", { id: ev.id, listing: fit.id }) : null)}
      {items.length > 0 && cue(`Possible match: ${plural(items.length, "item")} on Goods`, () => go("item", { id: items[0].id }))}
      {children}
      {(actions || onShare) && (ev || (onShare && requestShareable(s, i))) && <div className="actions">
        {ev && <button className="btn btn-sm" onClick={() => go("event", { id: ev.id })}>View event</button>}
        {onShare && requestShareable(s, i) && <button className="btn btn-sm" onClick={onShare}><Icon name="share" size={14} />Share</button>}
      </div>}
    </div>
  );
}

/* Your own public request: the card everyone sees, the listings or items sellers shared with you (each points at the listing on its event
   page, or the item, where the usual I'll take it / Make offer / Request applies), and Edit, Mark fulfilled or Cancel request. Closing it
   takes it off Wanted at once; My activity keeps it under Past activity with the reason.
   Live (follow-on B2): Mark fulfilled and Cancel request take one press, with the engine's toast (a request holds nothing, and nobody else's
   commitment changes), and a closed request offers "Post again": Post a request, filled in with this one (its event, or its item and
   category; how many, the budget and the note; the deadline starts over: the event's cutoff), where focus goes once it's closed. A private
   alert stays apart (AlertCard). The preview keeps its confirmations.
   Live (forms round 2, §9j): Cancel request is labelled "No longer looking" and comes first. */
export function RequestManage({ i, s, go, dispatch, openShare, from }) {
  const [ask, setAsk] = useState(null); const fulBtn = useRef(null), canBtn = useRef(null);
  const ev = i.eventId ? EV[i.eventId] : null; const gd = i.goods || null; const open = i.status === "open"; const u = gd ? "item" : unitOf(ev);
  const shares = sharesFor(s, i).map(x => ({ x, l: x.listingId ? s.listings.find(l => l.id === x.listingId) : null, it: x.itemId ? s.goods.find(g => g.id === x.itemId) : null })).filter(o => o.l || o.it);
  const editable = open && (!ev || demandAllowed(ev));
  const close = reason => { dispatch({ type: "closeInterest", id: i.id, reason }); setAsk(null); };
  const rid = "rm-" + i.id;
  const closeNow = async reason => { if (!(await dispatch({ type: "closeInterest", id: i.id, reason })).error) setTimeout(() => { const el = demoElement(rid + "-again") || demoElement(rid + "-closed"); if (el) el.focus(); }, 0); };
  const canAgain = LIVE && !open && (gd ? !!gd.cat : !!ev && demandAllowed(ev));
  // Post again rides the form's own way of starting filled in (its draft, as a form kept when a session ended comes back), for this account.
  const postAgain = () => go("post", { ...(from === "request" ? { from: "request", fromId: i.id } : { from: "activity" }), ...(gd ? { market: "goods" } : { eventId: ev.id }),
    draft: { post: { mode: gd ? "goods" : "listed", eventId: ev ? ev.id : "", gTitle: gd ? gd.title : "", gCat: gd ? gd.cat : "", qty: i.qty || 1, budget: i.budget != null ? String(i.budget) : "", note: i.note || "", exp: "" } } });
  return (
    <IsoCard i={i} s={s} go={go}>
      <div className="shared-list">
        <h4 className="sub-h" tabIndex={-1}>{shares.length ? `${plural(shares.length, gd ? "item" : "listing")} shared with you` : "Shared with you"}</h4>{/* My activity's "N shared with you" link focuses it */}
        {shares.length ? <ul>{shares.map(({ x, l, it }) => {
          // Yours already (an open offer or reservation on it) still links there; otherwise it shows while anyone could take it.
          const dealing = l ? s.requests.some(r => r.listingId === l.id && r.buyerId === i.userId && isOpenReq(rState(r))) : s.goodsReqs.some(g => g.itemId === it.id && g.buyerId === i.userId && !GFINAL.includes(gState(g, it).st));
          const on = dealing || (l ? listingNumbers(s, l).available > 0 && !l.withdrawnAt && access(ev).ok : itemState(s, it).key === "available");
          const paused = !on && LIVE && (l ? listingPaused(s, l) : itemPaused(it)); // live: its seller paused it, so it can open up again (C-CONTRACT §8)
          return (
            <li key={x.id} className="shared-row">
              <Avatar id={x.sellerId} size={24} />
              <span className="shared-main"><b>{PEOPLE[x.sellerId].name}</b> {l ? `shared their listing: ${plural(listingNumbers(s, l).available || l.listed, u)} at ${money(l.ask)}${ev.premium ? " reimbursement" : l.obo ? " or best offer" : ""}` : `shared "${it.title}": ${itemPrice(it.price)}${it.obo ? " or best offer" : ""}`}<span className="muted"> · {ago(x.createdAt)}{dealing ? (l ? " · you have an offer or reservation open on it" : " · you've requested it") : on ? "" : paused ? " · paused by the seller for now" : " · no longer available"}{x.partial && on && !dealing ? " · covers part of what you asked for" : ""}</span></span>
              {on && <button className="btn btn-sm" onClick={() => l ? go("event", { id: l.eventId, listing: l.id }) : go("item", { id: it.id })}>{l ? "View listing" : "View item"}</button>}
            </li>); })}</ul>
          : <p className="muted" style={{ fontSize: 13.5 }}>{open && liveRequest(s, i) ? (LIVE && !gd
            // §9q item 4 (live, a ticket request): where a match shows, kept on the request's own card: the bell and My activity (the
            // engine's MATCHES_WHERE).
            ? <span data-matches-where="">Nothing yet. A classmate with {aUnit(u)} can share a listing with your request. {MATCHES_WHERE}</span>
            : `Nothing yet. A classmate with ${gd ? "one" : aUnit(u)} can share ${gd ? "it" : "a listing"} with your request, and you'll get an alert.`) : "Nothing was shared with this request."}</p>}
        {shares.length > 0 && open && <p className="muted" style={{ fontSize: 13 }}>Nothing is held for you: {gd ? "request it or make an offer" : ev && isQuick(ev) ? (LIVE && inviteFlowOn() ? "ask to buy it" : "take it or make an offer") : "send a request"} like anyone else.</p>}
      </div>
      {/* §9x item 1 (live): its page says "This request is closed", then what its owner recorded: "Fulfilled" only where a receipt or the
          owner said so (closedReason), "Cancelled" where they closed it; never a guess. */}
      {!open && <div className="callout"><span id={rid + "-closed"} tabIndex={-1}>{LIVE && <b data-request-closed="">This request is closed. </b>}{closedAs(i)}{i.closedAt ? ` ${fmtMs(i.closedAt)}` : ""}. It's off Wanted and won't alert you.</span>
        {canAgain && <div className="actions" style={{ marginTop: 8 }}><button type="button" id={rid + "-again"} className="btn btn-sm" onClick={postAgain}>Post again</button></div>}</div>}
      {open && (ask ? <Confirm text={ask === "cancelled" ? "Cancel this request? It leaves Wanted and stops alerting you. Listings shared with you stay up; nothing you reserved changes." : "Mark this request fulfilled? It leaves Wanted and stops alerting you."}
          label={ask === "cancelled" ? "Yes, cancel it" : "Yes, mark fulfilled"} onYes={() => close(ask)} onNo={() => setAsk(null)} returnTo={ask === "cancelled" ? canBtn : fulBtn} />
        : <div className="actions">
            {/* Live (forms round 2, §9j): the close action comes first and says what it means for the buyer, "No longer looking" (it was
                "Cancel request", last and quiet): the same one-press closeInterest, cancelled. The preview keeps its button and confirmation. */}
            {LIVE && <button ref={canBtn} id={rid + "-stop"} className="btn btn-sm" onClick={() => closeNow("cancelled")}><Icon name="x" size={14} />No longer looking</button>}
            {editable && <button className="btn btn-sm" onClick={() => go("post", { edit: i.id, from, ...(gd ? { market: "goods" } : ev ? { eventId: ev.id } : {}) })}>Edit</button>}
            <button ref={fulBtn} className="btn btn-sm" onClick={() => LIVE ? closeNow("fulfilled") : setAsk("fulfilled")}><Icon name="check" size={14} />Mark fulfilled</button>
            {!LIVE && <button ref={canBtn} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk("cancelled")}>Cancel request</button>}
            {ev && <button className="btn btn-sm" onClick={() => go("event", { id: ev.id })}>View event</button>}
            {requestShareable(s, i) && <button className="btn btn-sm" onClick={() => openShare({ type: "iso", id: i.id })}><Icon name="share" size={14} />Share</button>}
          </div>)}
    </IsoCard>
  );
}

/* Your private alert, which only you ever see: how many, your private max (or any price), on or paused, and any listing that matches now.
   Edit opens the same dialog as the event page; Pause or Resume and Remove change it at once. */
export function AlertCard({ al, s, go, dispatch, onEdit }) {
  const [ask, setAsk] = useState(false); const opener = useRef(null);
  const ev = EV[al.eventId]; const open = al.status === "open"; const live = open && demandAllowed(ev);
  const fits = isoMatches(s, al), spots = fits.reduce((t, l) => t + listingNumbers(s, l).available, 0);
  const fit = fits.find(l => listingNumbers(s, l).available > 0); // "Matches now" opens it on the event page, as My activity's View match does
  const status = !open ? (al.closedReason === "fulfilled" ? "Fulfilled" : "Removed") : !demandAllowed(ev) ? access(ev).short : al.paused ? "Paused" : "On";
  return (
    <div className={"iso" + (live ? "" : " dim")}>
      <div className="lhead" style={{ alignItems: "center" }}>
        <span className="tag">Get notified · private</span>
        <span className={"chip tone-" + (status === "On" ? "good" : status === "Paused" ? "warn" : "muted")}>{status}</span>
      </div>
      <h3><button className="linkish" onClick={() => go("event", { id: ev.id })}>{ev.title}</button></h3>
      <div className="tline"><Icon name="calendar" size={15} /><span>{dotJoin(fmtRange(ev), ev.club)}</span></div>
      <div className="tline"><Icon name="bell" size={15} /><span>{alertText(al, ev)} · only you see this</span></div>
      <p className="muted" style={{ fontSize: 13.5 }}>You get an in-app alert when a matching listing appears. It doesn't hold {aUnit(unitOf(ev))} or post anything publicly.</p>
      {live && !al.paused && spots > 0 && fit && <button type="button" className="chip tone-good iso-match" onClick={() => go("event", { id: ev.id, listing: fit.id })}><Icon name="bell" size={13} />Matches now: {plural(spots, unitOf(ev))} listed<Icon name="arrow" size={13} /></button>}
      {!open && <div className="callout">{status}{al.closedAt ? ` ${fmtMs(al.closedAt)}` : ""}. It won't alert you again.</div>}
      {open && (ask ? <Confirm text="Remove this alert? You won't get alerts for this event." label="Yes, remove it" onYes={() => { dispatch({ type: "closeInterest", id: al.id }); setAsk(false); }} onNo={() => setAsk(false)} returnTo={opener} />
        : <div className="actions">
            {live && <button className="btn btn-sm" aria-haspopup="dialog" onClick={onEdit}>Edit</button>}
            {live && <button className="btn btn-sm" onClick={() => dispatch({ type: "setAlert", id: al.id, paused: !al.paused })}>{al.paused ? "Resume" : "Pause"}</button>}
            <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk(true)}>Remove</button>
            <button className="btn btn-sm" onClick={() => go("event", { id: ev.id })}>View event</button>
          </div>)}
    </div>
  );
}

/* Can someone answer this request with a ticket or item now? Not while its event isn't on Handoff yet, or isn't on sale (nothing to list). */
export const answerable = i => !!i.goods || (!!i.eventId && access(EV[i.eventId]).ok);

/* Opt in to email or text alerts on top of the in-app bell (simulated: nothing is sent). */
export function AlertOptIn({ s, me, dispatch, idp = "al", compact }) {
  const p = (s.alertPrefs || {})[me] || {}; const P = PEOPLE[me];
  if (!P || !P.demo) return null;
  return (
    <fieldset className={"alert-optin" + (compact ? " compact" : "")}>
      <legend>{compact ? "Also alert me by" : "Alerts"}</legend>
      <label className="check" htmlFor={idp + "-email"}><input id={idp + "-email"} type="checkbox" checked={!!p.email} onChange={e => dispatch({ type: "setAlertPrefs", email: e.target.checked })} /><span>Email <span className="muted">{P.contact}</span></span></label>
      <label className="check" htmlFor={idp + "-text"}><input id={idp + "-text"} type="checkbox" checked={!!p.text} onChange={e => dispatch({ type: "setAlertPrefs", text: e.target.checked })} /><span>Text <span className="muted">{P.phone}</span></span></label>
      <span className="help">{compact ? "Simulated: nothing is sent." : "You always get alerts here in the app. Email and text are simulated in this demo: nothing is sent."}</span>
    </fieldset>
  );
}
