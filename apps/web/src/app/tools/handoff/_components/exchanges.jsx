// An exchange, from either side (moved unchanged from HandoffPrototype.jsx): its card (HandoffCard picks QuickCard, the ticket flow:
// reserve or offer, pay, transfer and receive; or LegacyCard), "There's a problem" (ProblemBox), and a seller's listing with its
// requests and shares (ListingPanel, with the sale-attempt record, SaleRecord). Imports: ui, requests and payments.
// Live (follow-on B1): at the payment stage the buyer's card holds one payment block (the amount, the seller, the deadline, each method
// copied with the reservation with Copy, "Paid with" when there are two, and "I've sent payment"); the seller's card shows the same
// methods, and "Payment received" stays the seller's own step. An exchange reserved before B1 shows its listing's handle word for word.
// LegacyCard (club trips and operator-run treks: request, the seller accepts, the organizer's steps) is preview-only: every live
// request is created with flow "quick" (the engine's take, offer and isoReply), and the older request flow isn't a live action
// (LIVE_TYPES), so on the live route HandoffCard always shows QuickCard.
// Live only (EP-ui): a seller's Edit, Pause and Resume of their own listing (ListingPanel) or item (ItemPanel, goods.jsx), with the edit
// form they share (TermsForm), and the pending-offer rule on an exchange card while its listing is paused (C-CONTRACT §8). The preview
// never shows them: its reducer answers these actions "Unknown action.".
// Live only (follow-on B2): "Close listing" / "Close item", the withdrawal in one inline step (CloseStep: what happens, an optional reason
// only the seller sees, Close or Keep it), then the closed card's "List again" (Sell, filled in with this listing and the tickets the close
// gave back) or "Post again"; a ticket that comes back to a closed listing goes back to the seller, never on sale. The preview keeps
// "Withdraw listing" and its confirmation.
// Live only (§9q items 1 to 3; the rules are _lib/manage.js): an ordinary ticket's listing panel is the short one: the event, one status
// line in place of the row of counters ("1 ticket available · $25"), the cards that wait for the seller first, then Edit and Close (no
// Share since §9v item 3; a listing just posted leads them with Done),
// and no Pause (one paused before keeps Resume); the close step says what closing ends, with how many. A routine delivery (no recorded
// method, or the old form's "PDF or QR code") shows its seller no method and no explanation until sending is the next step: "Send the
// ticket to <buyer>", with "I've sent it". Trains, treks, a specific method (a name change, an app transfer) and Goods are as they were.
import React, { useState, useEffect, useRef } from "react";
import {
  RULES, TAKE_HOLD, OFFER_HOLD, CLOCK, PEOPLE, EV, fmtWhen, fmtMs, fmtRange, money, ago, untilText, plural, parseMoney, isAddOn, orgLabel,
  DIRECT_LABEL, orgWho, OrgWho, commitment, access, membersOnlyListing, FINAL, rState, flowFor, reserves, isOpenReq, baseSt,
  requestDeadlines, reqPrice, isQuick, METHODS, disputeEnd, listingNumbers, listingState, selfReported, liveRequest, PROBLEMS, unitOf, cap1,
  rStatus, checkMinOffer, askCap, departed, listingPaused, pausedUnits, atMs, closesAt, cutoffMs, PAY_LABELS, formatPayMethod, CLOSE_REASONS,
  holdingFree, saleEndedWhy, LATE_PAYMENT, NO_PAY_METHODS, holdLen, holdEnd, inviteFlowOn, lapsedReason, tierOf, faceOf,
  methodOf, transferWords, totalOf, qtyLine, memberClubOf, orgOf, listingRestrictions, // orgOf, listingRestrictions: §9v items 4 and 5 (a listing's club; its restrictions in plain words)
  freeDeal, freeSkipped // §9x item 1 (SELL6-N1): a free ticket's exchange (agreed at $0; reserved without the payment steps)
} from "@penntools/tool-handoff/engine";
import { freeWords, priceHead, reserveNext, reservesNext, askedNote, invitedNote, cardSteps, problemReasons } from "../_lib/free"; // §9x item 1: its words
import { progressLine, paidWords } from "../_lib/plain"; // §9x item 4 (SELL6-N3, live): an exchange's steps in plain words, no routine "not verified"
import { LIVE } from "../_lib/mode";
import { ordinaryTicket, routineTransfer, listingStatus, needsSeller, sendStep, closeText } from "../_lib/manage";
import { inviteFromListing } from "../_lib/answer"; // §9v item 2 (SELL5-M3): "I have this" from a listing, as one answerRequest
import { demoElement, focusSoon } from "../_lib/dom";
import { useDraftSource } from "../_lib/session";
import { Icon, Avatar, copyText, Timeline, Confirm } from "./ui";
import { closedAs } from "./requests";
import { PayRows, amountDigits, listingPaidTo, payKindsText, PayMethodsEditor, PaySummary, payEditorFrom, payEditorMethods, payEditorErrors, payEditorDirty, payErrorField, payFocusId } from "./payments";

/* "There's a problem" on a match: report, see the report, and what to do next. Nobody else reviews it in this prototype. */
export function ProblemBox({ x, kind, role, other, dispatch, canReport, cancelHint, done, late, free = false }) { // free (§9x item 1): a free ticket's exchange: nothing was or will be paid, so its guidance and reasons don't mention paying
  const [open, setOpen] = useState(false); const [reason, setReason] = useState("");
  const lateHead = useRef(null);
  useEffect(() => { if (open && late && lateHead.current) lateHead.current.focus(); }, [open]);
  const p = x.problem && !x.problem.resolvedAt ? x.problem : null;
  if (p) {
    const mine = p.role === role; const o = PEOPLE[other].first;
    // A buyer who reported holds off paying; a buyer the seller reported is asked to reply (and pay if they already have it).
    // Live (follow-on B5), a payment sent after the reservation ended (LATE_PAYMENT): nothing was reserved again, so the two sort it out
    // directly: the money back, or a new invitation if the seller still has the ticket.
    const guide = p.reason === LATE_PAYMENT ? (mine ? `Talk to ${o} directly: ask for the money back, or for a new invitation if they still have it. Nothing was reserved again` : `Check whether ${o}'s payment arrived, then sort it out with them directly: send it back, or invite them again if you still have it. Nothing was reserved again, and your listing is as it was`)
      : free ? (role === "buyer" && !mine ? `Reply to ${o}: if something's holding it up, say what` : `Talk to ${o} first`)
      : role === "buyer" && mine ? (done ? `Talk to ${o} first. If you've already paid, ask them to make it right` : `Don't pay until it's sorted. Talk to ${o} first`) : role === "buyer" ? `Reply to ${o}: if you have it and haven't paid, pay them; if something's holding it up, say what` : `Talk to ${o} first`;
    return (
      <div id={"pb-open-" + x.id} tabIndex={-1} className="callout warn" style={{ display: "grid", gap: 6 }}>
        <span><b>{mine ? "You reported a problem" : `${PEOPLE[p.by].first} reported a problem`}:</b> {p.reason}.</span>
        <span style={{ fontSize: 13.5 }}>{guide}. {cancelHint} {LIVE ? "Handoff records the report and tells the other person; it doesn't review reports during the pilot." : `Handoff reviews reports: an upheld report gives a strike, and ${RULES.strikesToPause} strikes pause an account.`}</span>
        {mine && <div><button className="btn btn-sm" onClick={() => dispatch({ type: "resolveProblem", kind, id: x.id })}>Mark resolved</button></div>}
        {!LIVE && <div className="demo-ctl" style={{ marginTop: 4 }}>
          <div className="eyebrow">Reviewer controls · simulated Handoff review</div>
          <div className="actions"><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "reviewProblem", kind, id: x.id, outcome: "uphold" })}>Uphold: strike for {mine ? PEOPLE[other].first : "you"}</button><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "reviewProblem", kind, id: x.id, outcome: "dismiss" })}>Dismiss</button></div>
        </div>}
      </div>
    );
  }
  const reviewed = x.problem && x.problem.review ? <span className="muted" style={{ fontSize: 13 }}>Handoff review (simulated): report {x.problem.review}.</span> : null;
  // Live (follow-on B5): the buyer of a reservation that ended unpaid, who paid anyway. One reason, said in one step; the seller is told, and
  // nothing is reserved again (the engine's reportProblem with LATE_PAYMENT). Focus goes to the words as it opens, then to the report.
  if (late) {
    const o = PEOPLE[other].first;
    if (!open) return <div><button className="btn btn-ghost btn-sm" data-late-open="" onClick={() => setOpen(true)}><Icon name="alert" size={14} />{LATE_PAYMENT}</button></div>;
    return (
      <div className="next" data-late-form="" style={{ background: "none", border: "1px solid var(--line)" }}>
        <p ref={lateHead} tabIndex={-1} style={{ margin: 0 }}><b>Paid after the reservation ended?</b> Tell {o}. Handoff can't see payments and nothing is reserved again: {o} sorts it out with you directly, by sending the money back or by inviting you again if they still have it.</p>
        <div className="actions"><button className="btn btn-sm btn-primary" data-late-report="" onClick={async () => { const r = await dispatch({ type: "reportProblem", kind, id: x.id, reason: LATE_PAYMENT }); if (!r.error) { setOpen(false); focusSoon("pb-open-" + x.id); } }}>Report late payment</button><button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
      </div>
    );
  }
  if (!canReport) return reviewed;
  if (!open) return <div>{reviewed}{reviewed && " "}<button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}><Icon name="alert" size={14} />There's a problem</button></div>;
  const opts = problemReasons(PROBLEMS[kind === "goods" ? "goods" : "ticket"][role], free);
  return (
    <div className="next" style={{ background: "none", border: "1px solid var(--line)" }}>
      <div className="field"><label htmlFor={"pb-" + x.id}>What went wrong?</label>
        <select id={"pb-" + x.id} value={reason} onChange={e => setReason(e.target.value)}><option value="">Choose…</option>{opts.map(o => <option key={o}>{o}</option>)}</select>
        <span className="help">{LIVE ? `${PEOPLE[other].first} gets a notification. Handoff doesn't review reports during the pilot, and a report doesn't cancel anything by itself.` : `${PEOPLE[other].first} gets a notification and Handoff reviews it. It doesn't cancel anything by itself.`}</span></div>
      <div className="actions"><button className="btn btn-sm btn-primary" disabled={!reason} onClick={async () => { const r = await dispatch({ type: "reportProblem", kind, id: x.id, reason }); if (!r.error) { setOpen(false); setReason(""); } }}>Report problem</button><button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  );
}

/* The invitation's price, as the server checks it (the engine's invite): more than $0, no more than the asking price, and no less than the
   buyer's own offer. tried: after a first Send, an empty price says so too. B: the buyer's first name; u: the unit ("ticket"). */
export function invitePriceError(price, r, l, B, u, tried = false) {
  const pm = parseMoney(price);
  return String(price).trim() === "" ? (tried ? `Enter the price per ${u}.` : null) : pm.error ? pm.error
    : pm.value <= 0 && l.ask > 0 ? "Enter more than $0."
    : pm.value > l.ask ? `You're asking ${money(l.ask)}. Invite at that price or less, or change the listing's price first.`
    : r.isOffer && pm.value < r.price ? `${B} offered ${money(r.price)}. Invite at that price or more.` : null;
}
/* Simplification batch: where the invitation starts, the values the server uses when nothing is changed: how many (what was asked, capped
   by what's free now: most) and the price (what was asked or offered, never above today's asking price). priceOpen: the price starts as its
   field rather than a summary line when that start isn't one the server takes (the asking price lowered below the buyer's offer since). */
export function inviteStart(r, l, most) {
  const price = String(Math.min(r.price, l.ask));
  return { qty: Math.max(1, Math.min(r.qty, most)), price, priceOpen: invitePriceError(price, r, l, "", "ticket") !== null };
}
/* Live (follow-on B5): the seller's invitation to pay, confirmed in the request's own card: how many and at what price, that inviting holds
   nothing and isn't exclusive, and, at the first invitation with no payment method saved, where buyers pay (saved once to the profile;
   later invitations show it as one line with Change). The server checks everything again (invite): its refusal shows above the buttons
   with focus on it, and everything typed stays. Escape or Cancel closes it with focus back on "Invite to pay" (onClose).
   forIso: "I have this" on a public request uses the same form for its poster, with no request to buy before it (inviteRequester); r is
   then what the request asks for ({ id, buyerId, qty, price: the asking price }).
   Simplification batch (SIM5): what the server would use if nothing changed shows as a compact summary, how many ("For 2 tickets"), the
   price ("At $35 per ticket") and the saved payment method, each with its own Change that opens its field in place with the focus in it;
   "Send invitation" stays the one primary action. A price the server wouldn't take as it stands opens as its field, with why. */
export function InviteForm({ r, l, ev, s, most, dispatch, saveProfile, onClose, forIso, flash }) { // flash (§9v item 2, the request's page): says a refusal when this form is gone by then (the request closed or was filled, so its panel went)
  const B = PEOPLE[r.buyerId].first, u = unitOf(ev), idp = "iv-" + r.id;
  const saved = s.viewer && Array.isArray(s.viewer.payMethods) ? s.viewer.payMethods : [];
  const own = typeof l.payHandle === "string" && l.payHandle.trim() ? l.payHandle : ""; // a listing posted before Batch 1 is paid at its own handle
  // §9x item 1 (SELL6-N1): a free ticket (the listing asks $0, so the invitation can only be at $0): nothing is paid, so the form asks
  // for no way to be paid and shows none, and it invites the buyer, not "to pay".
  const gratis = l.ask === 0, W = freeWords(gratis);
  const [start] = useState(() => inviteStart(r, l, most));
  const [qty, setQty] = useState(start.qty);
  const [price, setPrice] = useState(start.price);
  const [qtyOpen, setQtyOpen] = useState(false); // how many, as its field (Change); until then the summary line
  const [priceOpen, setPriceOpen] = useState(start.priceOpen); // the price, as its field (Change, or a start the server wouldn't take)
  const [payOpen, setPayOpen] = useState(() => saved.length === 0 && !own && !gratis); // the fields at the first invitation; after that the saved line with Change
  const [paySt, setPaySt] = useState(() => payEditorFrom(saved));
  const [tried, setTried] = useState(false); // after a first Send, every problem shows beside its field
  const [err, setErr] = useState(""); // the server's refusal, above the buttons
  const busy = useRef(false), head = useRef(null), errRef = useRef(null);
  // The form opens with the focus on its heading. At a first invitation with nothing saved (§9q item 5), where the one thing to
  // type is the payment method, the focus goes to the open editor's first field instead: the Venmo username, ready to type.
  useEffect(() => { const el = payOpen && !saved.length ? demoElement(payFocusId(idp, paySt)) : null; if (el) el.focus(); else if (head.current) head.current.focus(); }, []);
  const n = Math.max(1, Math.min(qty, most)); // a newer view can leave fewer
  const pm = parseMoney(price), blankP = price.trim() === "";
  const priceErr = invitePriceError(price, r, l, B, u, tried);
  if (priceErr && !priceOpen) setPriceOpen(true); // a newer view (the asking price changed) can turn the summary's price into one the server refuses
  const payErrs = payOpen && !gratis ? payEditorErrors(paySt, !own) : [];
  const focusId = id => setTimeout(() => { const el = demoElement(id); if (el) el.focus(); }, 0);
  const focusErr = () => setTimeout(() => { if (errRef.current) errRef.current.focus(); }, 0);
  const change = (id, label, open) => <> · <button type="button" id={id} className="linkish pay-change" aria-label={label} onClick={open}>Change</button></>;
  const submit = async e => {
    e.preventDefault(); if (busy.current) return; // a second press while the first is still out
    setErr("");
    if (blankP || priceErr) { setTried(true); setPriceOpen(true); focusId(idp + "-price"); return; }
    const bad = payErrs.findIndex(Boolean);
    if (bad >= 0) { setTried(true); focusId(payErrorField(idp, paySt, bad, payErrs[bad])); return; }
    busy.current = true;
    try {
      // The payment method first, saved once to the profile, so the invitation is never sent without one.
      if (!gratis && payOpen && payEditorDirty(paySt, saved)) {
        const p = await saveProfile(payEditorMethods(paySt), true);
        if (p.error) { setErr(p.error); focusErr(); return; }
        setPayOpen(false);
      }
      // §9v item 2 (SELL5-M3): "I have this" sends answerRequest (from this listing), which says exactly why when the request closed meanwhile.
      const res = await dispatch(forIso ? inviteFromListing({ isoId: forIso.id, listingId: l.id, qty: n, price }) : { type: "invite", requestId: r.id, qty: n, price: price.trim() }, true);
      if (res.error) { if (!head.current && flash) { flash(res.error, "error"); return; } if (res.error === NO_PAY_METHODS) { setPaySt(payEditorFrom([])); setPayOpen(true); } setErr(res.error); focusErr(); return; } // the answer's newer view can take this form away (a request that closed meanwhile): its words then show as a message
      onClose(true, res.toast);
    } finally { busy.current = false; }
  };
  return (
    <form className="next" data-invite-form={r.id} style={{ background: "none", border: "1px solid var(--line)", gap: 14 }} onSubmit={submit} noValidate aria-labelledby={idp + "-h"}
      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(false); } }}>
      <h4 id={idp + "-h"} ref={head} tabIndex={-1} style={{ fontSize: 16, margin: 0 }}>Invite {B}{W.toPay}</h4>
      {most > 1 && qtyOpen ? <div className="field" style={{ maxWidth: 300 }}><label htmlFor={idp + "-qty"}>How many</label>
          <select id={idp + "-qty"} value={n} onChange={e => setQty(Number(e.target.value))} aria-describedby={idp + "-qty-msg"}>{Array.from({ length: most }, (_, k) => <option key={k + 1} value={k + 1}>{k + 1}</option>)}</select>
          <span id={idp + "-qty-msg"} className="help">{B} asked for {plural(r.qty, u)}.{r.qty > most ? ` Only ${most} are available right now.` : ""}</span></div>
        : <p id={idp + (most > 1 ? "-qty-sum" : "-qty-msg")} className="pay-sum">For <b>{plural(n, u)}</b>{r.qty > most ? ` · ${B} asked for ${r.qty}, and only ${most} ${most === 1 ? "is" : "are"} available right now` : ""}
            {most > 1 && change(idp + "-qty-change", "Change how many", () => { setQtyOpen(true); focusId(idp + "-qty"); })}</p>}
      {gratis ? <p id={idp + "-price-sum"} className="pay-sum" data-free=""><b>Free</b> · {B} pays nothing</p>
        : priceOpen ? <div className="field" style={{ maxWidth: 300 }}><label htmlFor={idp + "-price"}>Price per {u}</label>
          <div className="money"><span>$</span><input id={idp + "-price"} type="text" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} aria-invalid={!!priceErr} aria-describedby={idp + "-price-msg"} /></div>
          <span id={idp + "-price-msg"} className={priceErr ? "err" : "help"}>{priceErr || `${r.isOffer ? `${B} offered ${money(r.price)}. ` : ""}You're asking ${money(l.ask)}${!blankP && !pm.error ? `; ${B} would pay you ${money(pm.value * n)} in all` : ""}.`}</span></div>
        : <p id={idp + "-price-sum"} className="pay-sum">At <b>{money(pm.value)}</b> per {u}{n > 1 ? ` · ${money(pm.value * n)} in all` : ""}{r.isOffer ? ` · ${B}'s offer (you're asking ${money(l.ask)})` : pm.value < l.ask ? ` (you're asking ${money(l.ask)})` : ""}
            {change(idp + "-price-change", "Change the price", () => { setPriceOpen(true); focusId(idp + "-price"); })}</p>}
      {gratis ? null : own && !saved.length ? <p className="pay-sum" style={{ margin: 0 }}>Payment details: <b className="num">{own}</b></p>
        : payOpen ? <><PayMethodsEditor idp={idp} st={paySt} setSt={setPaySt} errs={payErrs} show={tried} />
            <p className="help" style={{ margin: 0 }}>{saved.length ? "Saved in Handoff settings, for every listing." : "Asked once: it's saved in Handoff settings for every listing. A buyer sees it only after they reserve."}</p></>
        : <PaySummary methods={saved} idp={idp} onChange={() => { const st0 = payEditorFrom(saved); setPaySt(st0); setPayOpen(true); focusId(payFocusId(idp, st0)); }} />}
      <p className="help" data-invite-words="" style={{ margin: 0 }}>Inviting doesn't hold the {u}. The first buyer you invite who reserves it gets it, so you can invite others too.</p>
      {err && <p ref={errRef} id={idp + "-err"} className="err" role="alert" tabIndex={-1} style={{ margin: 0 }}>{err}</p>}
      <div className="actions">
        <button type="submit" className="btn btn-sm btn-primary" data-invite-send="" aria-describedby={err ? idp + "-err" : undefined}>Send invitation</button>
        <button type="button" className="btn btn-sm" onClick={() => onClose(false)}>Cancel</button>
      </div>
    </form>
  );
}

/* A match in Christine's flow, for either side: (offer or ISO reply) -> reserved, pay within the hold -> paid -> delivered
   -> received. Made-up accounts can't click, so the demo account on the other side can simulate their step (labeled).
   Live (follow-on B5), a record of the invitation flow (r.inviteFlow): request to buy -> the seller's invitation (nothing held, not
   exclusive) -> the buyer's own "Reserve and pay" (the hold, with the payment block) -> the same paid, delivered and received steps.
   One primary action per state: the seller's "Invite to pay" (the form above), the buyer's "Reserve and pay", then "I've sent payment".
   During the hold the seller waits (no Release); the buyer can release it. A refusal of Reserve is said in the card, with focus on it;
   when the record ends while focus was in its card, focus goes to the reason. */
function QuickCard({ r, role, s, dispatch, go, saveProfile, flash }) {
  const [ask, setAsk] = useState(null); const opener = useRef(null);
  const [ctr, setCtr] = useState(null); // a counter-offer being typed (seller)
  const [copied, setCopied] = useState("");
  const [via, setVia] = useState(null); // live, two payment methods: the one the buyer says they paid with ("Paid with"), the preferred until changed
  const [memberOk, setMemberOk] = useState(false); // a members-only ticket: the buyer confirms membership before accepting a reply or counter
  // Focus: into the counter field when it opens; back to "Counter" on cancel, or to the status after sending.
  const ctrIn = useRef(null), ctrBtn = useRef(null), chipRef = useRef(null), tlRef = useRef(null), ctrWas = useRef(false), ctrSent = useRef(false);
  useEffect(() => { const on = ctr !== null; if (on && !ctrWas.current) { if (ctrIn.current) ctrIn.current.focus(); } else if (!on && ctrWas.current) { const t = ctrSent.current ? (tlRef.current || chipRef.current) : ctrBtn.current; ctrSent.current = false; if (t) t.focus(); } ctrWas.current = on; }, [ctr !== null]);
  // Follow-on B5 (the invitation flow): the seller's invitation form is open (inv); the last refusal of "Reserve and pay" (nfErr).
  const [inv, setInv] = useState(false); const [nfErr, setNfErr] = useState("");
  const invBtn = useRef(null), payRef = useRef(null), whyRef = useRef(null), rootRef = useRef(null), hadFocus = useRef(false), wasOpen = useRef(null);
  useEffect(() => { setNfErr(""); }, [r.status, r.blockedAt]); // a refusal belongs to the state it was said in
  // The form closes when its request can't be invited any more (answered, withdrawn or ended, the listing paused, or nothing free now).
  useEffect(() => {
    if (!inv) return;
    const l2 = s.listings.find(x => x.id === r.listingId);
    if (rState(r).st !== "requested" || !l2 || listingPaused(s, l2) || listingNumbers(s, l2).available < 1) setInv(false);
  });
  // When the record ends while focus was in its card (its time ran out, or the control just pressed went with the state), focus goes to
  // the reason, never to the page; focus that has moved somewhere else stays there.
  useEffect(() => {
    if (!LIVE || r.inviteFlow !== true) return;
    const open = !FINAL.includes(rState(r).st), was = wasOpen.current; wasOpen.current = open;
    if (was !== true || open || !hadFocus.current) return;
    const a = document.activeElement;
    if (a && a !== document.body && !(rootRef.current && rootRef.current.contains(a))) return;
    const t = whyRef.current || chipRef.current; if (t) t.focus();
  });
  const ev = EV[r.eventId]; const l = s.listings.find(x => x.id === r.listingId);
  // Live: a view always carries a request's listing and event, but if one ever doesn't, the card says so instead of failing.
  if (!l || !ev) return <div className="req"><p className="muted" style={{ margin: 0 }}>This exchange's listing isn't available any more.</p></div>;
  const e = shownState(r, l); const st = e.st; const b = baseSt(e);
  const seller = PEOPLE[l.sellerId], buyer = PEOPLE[r.buyerId]; const S = seller.first, B = buyer.first;
  const isB = role === "buyer"; const other = isB ? l.sellerId : r.buyerId; const u = unitOf(ev);
  // Sell and Request follow-up (§9m item 1, live): a listing posted with no transfer method promises none (the engine's methodOf), so
  // nothing here names one for it. tw: the neutral rule in this reader's voice (the seller: "Send the ticket to the buyer after
  // payment."), or null for a listing with a recorded method, which reads exactly as before. The preview's listings always have one.
  // §9x item 1 (SELL6-N1, live): a free ticket's exchange. gratis: it's agreed at $0, so nothing is paid: its words ask nobody to pay
  // and show nowhere to pay. skipPay: it's past its reservation without the payment steps (the engine's freeSkipped): no "Paid" step,
  // no payment row, and until the seller sends it the buyer may release it. (One reserved at $0 before this keeps the older steps.)
  const gratis = LIVE && freeDeal(r), skipPay = LIVE && freeSkipped(r), W = freeWords(gratis);
  const mk = methodOf(l), tw = LIVE ? transferWords(l, role === "buyer" ? "buyer" : "seller", gratis) : null;
  const m = mk ? METHODS[mk] : tw ? { label: "", verb: `send the ${unitOf(ev)}` } : METHODS.file; const total = totalOf(r, l);
  // §9q item 3 (live): the seller of an ordinary ticket with a routine delivery (no recorded method, or the old form's "PDF or QR code")
  // reads no Transfer line while there's nothing to send: the instruction is the next step once they've confirmed the payment. The
  // buyer's card, and a listing with a specific method or a train's or trek's rules, read as before.
  const quietTransfer = LIVE && !isB && routineTransfer(ev, l);
  const nf = r.inviteFlow === true; // follow-on B5: a request to buy, then the seller's invitation, then the buyer's own reservation
  const offerish = !nf && (r.isOffer || r.isoReply); const o = offerish || nf ? 1 : 0;
  // Live (C-DESIGN §8.3): the seller said a paid reservation's money hasn't arrived. The buyer can cancel; after releaseAfter the seller can release it.
  const disputed = LIVE && st === "paid" && !!r.payDisputedAt && !r.paymentConfirmedAt, canRelease = disputed && CLOCK >= r.releaseAfter;
  // Live: the seller has paused this listing (C-CONTRACT §8). An open offer or counter stays open with its own deadline, but nobody can
  // accept or counter it until the seller resumes the listing: the seller can still decline, the buyer withdraw or decline. Everything
  // already agreed goes on, and a ticket that comes back stays off sale.
  const paused = LIVE && listingPaused(s, l), waitsResume = paused && (st === "pending" || st === "countered");
  // Follow-on B5: before the reservation (pre) nothing is held. busyNow: another buyer's reservation has what this one needs for now, so
  // the seller can't invite and the buyer can't reserve until it comes back (the engine's words say so, with how long the record stays open).
  const nb = listingNumbers(s, l), pre = nf && (st === "requested" || st === "invited");
  const most = Math.min(r.qty, nb.available); // what an invitation could be for right now
  const busyNow = pre && !paused && (st === "invited" ? nb.available < r.qty : nb.available < 1);
  const holdFor = pre ? holdLen({ holdUntil: holdEnd(ev, CLOCK, l, true) }, CLOCK) : ""; // the hold a reservation made now would get ("15 minutes", less near a cutoff)
  const needMember = nf && isB && st === "invited" && membersOnlyListing(ev, l) && !r.memberConfirmed;
  const showInv = inv && nf && !isB && st === "requested" && !paused && most >= 1;
  const org = u ==="spot" ? "the organizer" : "the club"; // a trek's organizer may be a travel operator, not a club (readiness RB-6)
  const sentBtn = { app: "Transferred", name: `I've emailed ${org}`, inperson: "Handed over", file: LIVE ? "I've sent it" : "Transferred" }[l.method] || (tw ? "I've sent it" : "Transferred");
  // Live (follow-on B1): where to pay is the exchange's own copy, taken as it was reserved (r.pay: its two parties, from the reservation on),
  // never the seller's profile now. One reserved before B1 has none and reads its listing's own handle, word for word ("other"). The buyer's
  // button is "I've sent payment" (markPaid, with the method when there are two); "Payment received" stays the seller's own step.
  const pay = !LIVE ? null : Array.isArray(r.pay) && r.pay.length ? r.pay : l.payHandle ? [{ kind: "other", value: l.payHandle }] : [];
  const viaKind = pay && pay.length === 2 ? (pay.some(m => m.kind === via) ? via : pay[0].kind) : null;
  const paidKind = LIVE && r.paidVia && r.paidVia !== "other" ? r.paidVia : null, paidTo = paidKind && pay ? pay.find(m => m.kind === paidKind) : null;
  const legacyHandle = pay && pay.length === 1 && pay[0].kind === "other" ? pay[0].value : l.payHandle; // the words before B1, kept for exchanges from then
  const PAID_BTN = LIVE ? "I've sent payment" : "Paid";
  const kinds = LIVE ? payKindsText(l.payKinds) : null; // before committing (a counter, a held reply): which ways the seller takes
  // The card's steps (cardSteps: as they were, or, for a free ticket's exchange before its reservation or past it without the payment
  // steps, Invited, Reserved, Delivered, Received: no "Paid").
  const { steps, done: doneMap } = cardSteps({ nf, offerish: !!offerish, isoReply: !!r.isoReply, freeFlow: gratis && nf && (pre || skipPay) });
  const waitOn = disputed ? (isB ? `${S} says the payment hasn't arrived` : canRelease ? "Your turn: release it or confirm the payment" : `Waiting: ${B} can check or cancel`)
    : pre && paused ? (isB ? "Paused by the seller" : st === "requested" ? "Your turn: resume to invite, or decline" : `Paused: ${B} can reserve once you resume`)
    : busyNow ? W.busyShort
    : waitsResume ? (isB ? "Paused by the seller" : st === "pending" ? "Your turn: resume to accept, or decline" : `Paused: ${B} can accept once you resume`) : {
    requested: isB ? `Waiting for ${S} to invite you` : `Your turn: invite${W.toPay}, or decline`,
    invited: isB ? `Your turn: reserve it${W.thenPay}` : `Waiting for ${B} to reserve it`,
    pending: isB ? `Waiting for ${S} to answer` : "Your turn: accept, counter or decline",
    countered: isB ? "Your turn: answer the counter" : `Waiting for ${B} to answer`,
    proposed: isB ? "Your turn: accept or decline" : `Waiting for ${B} to answer`,
    accepted: isB ? `Your turn: pay, then tap “${PAID_BTN}”` : `Waiting for ${B} to pay`,
    paid: isB ? `Waiting for ${S} to confirm payment` : "Your turn: confirm the payment",
    confirmed: isB ? `Waiting for ${S} to ${m.verb}` : `Your turn: ${m.verb}`,
    sent: isB ? "Your turn: confirm you got it" : `Waiting for ${B} to confirm`,
  }[b];
  const deliver = { file: LIVE ? `${S} sends ${isB ? "you" : B} the PDF or QR code` : `Handoff sends ${isB ? "you" : B} the ticket file`, app: `${S} transfers it to ${isB ? "your" : `${B}'s`} email in Ticketmaster or AXS`, name: `${S} asks ${orgOf(ev, l)} to put it in ${isB ? "your" : `${B}'s`} name`, inperson: `${S} hands over the paper ticket` }[l.method] || (tw ? `${S} sends ${isB ? "you" : B} the ${u}` : `${S} sends it`);
  const nextFor = { // only the current step's text is built: later steps refer to prices that don't exist yet
    pending: () => waitsResume ? (isB ? `Wait for ${S} to resume the listing, or withdraw your offer of ${money(r.price)}` : `Resume the listing to accept or counter ${B}'s offer of ${money(r.price)}, or decline it`)
      : isB ? `${S} accepts, counters once or declines your offer of ${money(r.price)}` : `Accept ${B}'s offer of ${money(r.price)} (they then have ${OFFER_HOLD} to pay), counter once, or decline`,
    countered: () => waitsResume ? (isB ? `Wait for ${S} to resume the listing, or decline their counter of ${money(r.counterPrice)}` : `Resume the listing so ${B} can accept your counter of ${money(r.counterPrice)}`)
      : isB ? `${S} countered at ${money(r.counterPrice)}. Accept to reserve it for ${TAKE_HOLD} and pay right away${kinds ? ` (${S} takes ${kinds})` : ""}, or decline` : `${B} accepts or declines your counter of ${money(r.counterPrice)}`,
    proposed: () => isB ? `${S} is holding ${plural(r.qty, u)} for you at ${money(r.price)}${r.isCounter ? " (a different price from your budget)" : ""}. Accept to reserve it for ${TAKE_HOLD} and pay right away${kinds ? ` (${S} takes ${kinds})` : ""}, or decline` : `${B} accepts or declines your reply`,
    accepted: () => (isB ? `Pay ${S} ${money(total)}, then tap “${PAID_BTN}”` : `${B} pays you ${money(total)}, then taps “${PAID_BTN}”`) + (r.topUp ? `. The ${money(r.topUp * r.qty)} non-member top-up goes to ${ev.club} when it changes the name` : ""),
    paid: () => disputed ? (isB ? `${S} says your payment hasn't arrived. If you paid, contact ${S}: Handoff can't see payments. If you didn't, you can cancel. ${S} can release the ${u} after ${fmtMs(r.releaseAfter)}`
        : canRelease ? `The payment still hasn't arrived? You can release the ${u} now, or confirm the payment if it turns up` : `${B} can cancel, or contact you if they paid. You can release the ${u} after ${fmtMs(r.releaseAfter)} if the payment still hasn't arrived`)
      : isB ? `${S} confirms your payment arrived. Then ${deliver}` : `Check ${paidKind ? PAY_LABELS[paidKind] : "Venmo or PayPal"} for ${money(total)} from ${B}, then tap “Payment received”${LIVE ? ". Not there? Tap “Payment hasn't arrived”" : ""}`,
    confirmed: () => isB ? cap1(deliver) : { app: `Transfer it in Ticketmaster or AXS to ${B}'s email (below), then tap “Transferred”`, name: `Email ${orgOf(ev, l)} to put it in ${B}'s name (draft below), then tap “I've emailed ${org}”`, inperson: `Hand ${B} the paper ticket, then tap “Handed over”`, ...(LIVE ? { file: `Send ${B} the PDF or QR code (their email is below), then tap “I've sent it”` } : {}) }[l.method] || (tw ? sendStep(B, u, !!buyer.contact) : undefined),
    sent: () => isB ? { file: "Open your ticket file and check it, then tap “Received”", app: "Accept the transfer in Ticketmaster or AXS, then tap “Received”", name: `Tap “Received” once ${orgOf(ev, l)} confirms it's in your name`, inperson: "Check the ticket, then tap “Received”" }[l.method] || (tw ? `Check you have the ${u}, then tap “Received”` : undefined) : `${B} confirms they received it`,
  }; const next = nextFor[b] ? nextFor[b]() : null;
  const dl = requestDeadlines(r);
  // Follow-on B5, before the reservation: the next step, and one note under it ([text, tone]). An invitation says the plan's sentence
  // (not held, how long to pay once reserved, others may be invited too); a paused listing or another buyer's hold says the engine's words.
  const until = pre ? fmtMs(r.expiresAt) : "";
  const preNext = !pre ? null : st === "requested"
    ? (isB ? (paused ? `Wait for ${S} to resume the listing, or withdraw your request` : `${S} invites you${W.toPay}, or declines`)
      : paused ? `Resume the listing to invite ${B}, or decline` : busyNow ? `Invite ${B} if it comes back, or decline` : `Invite ${B}${W.toPay}, or decline`)
    : (isB ? (paused ? `Wait for ${S} to resume the listing, or decline the invitation` : busyNow ? "Wait in case it comes back, or decline the invitation" : reserveNext({ gratis, holdFor, S, total }))
      : reservesNext({ gratis, B, total }));
  const preNote = !pre ? null : st === "requested"
    ? (isB ? (paused ? [`${S} paused this listing. Your request stays open until ${until}, but they can't invite you until they resume the listing.`, "warn"] : [askedNote(gratis), ""])
      : paused ? [`You paused this listing. Resume it to invite ${B}: their request stays open until ${until}.`, "warn"]
      : busyNow ? [`${W.busy}. You can invite ${B} if it comes back: their request stays open until ${until}.`, "warn"] : null)
    : (isB ? (paused ? [`${S} has paused this listing, so you can't reserve it right now. Your invitation stays open until ${until}.`, "warn"]
        : busyNow ? [`${W.busy}. Your invitation stays open until ${until} in case it comes back.`, "warn"]
        : [invitedNote({ gratis, holdFor, S }), ""])
      : paused ? [`You paused this listing, so ${B} can't reserve it until you resume it. Their invitation stays open until ${until}.`, "warn"]
      : busyNow ? [`${W.busy}. ${B}'s invitation stays open until ${until} in case it comes back.`, "warn"]
      : [`Not held: it's ${B}'s once they reserve it. You can invite other buyers too; the first to reserve gets it.`, ""]);
  // "Reserve and pay": the server's one atomic step. Reserved, focus goes to the payment block; refused, the reason is said in the card
  // (or by the state the answer's view brought: paused, another buyer paying, ended) and focus goes to it.
  const reserve = async () => {
    setNfErr("");
    const res = await dispatch({ type: "reserve", requestId: r.id, ...(memberOk ? { member: true } : {}) });
    if (res.error) setNfErr(res.error);
    setTimeout(() => { const t = res.error ? whyRef.current || tlRef.current || chipRef.current : payRef.current || tlRef.current; if (t) t.focus(); }, 0);
  };
  const closeInvite = (sent, toast) => {
    setInv(false);
    if (sent && toast && flash) flash(toast);
    setTimeout(() => { const t = sent ? tlRef.current || chipRef.current : invBtn.current; if (t) t.focus(); }, 0);
  };
  // An unpaid hold cut short by the train's departure, the event's start or the transfer cutoff (the engine's holdEnd) ends with it, and
  // nothing goes back on sale then: its deadline says what happens instead (readiness RB-8).
  const holdCut = b !== "accepted" || typeof r.holdUntil !== "number" ? null
    : r.departsAt && r.holdUntil >= atMs(r.departsAt) ? "then the train leaves"
    : r.holdUntil >= cutoffMs(ev) ? (ev.deadline ? "then the transfer window closes" : ev.openUntil ? "then the tickets expire" : "then the event starts") : null;
  const paidStage = ["paid", "confirmed", "sent", "completed"].includes(b);
  // Copy buttons say when the clipboard refuses too, and a live region reads the result out.
  const copy = async (k, text) => { const ok = await copyText(text, null); setCopied(ok ? k : "fail:" + k); setTimeout(() => setCopied(""), ok ? 2000 : 4000); };
  const copyLbl = (k, idle) => copied === k ? "Copied" : copied === "fail:" + k ? "Couldn't copy" : idle;
  // §9v item 5: the listing's restrictions as the buyer reads them (live; the preview keeps its own flag, l.restricted, below).
  const restr = LIVE ? listingRestrictions(ev, l) : l.restricted ? [{ kind: "flagged", text: "" }] : [];
  const subject = `Name change for ${ev.title}`;
  const draft = `Hi, I can't make ${ev.title} and have passed my ${u} to ${buyer.name} (${buyer.contact}). Could you change the registration from my name to theirs? Thanks, ${seller.name}`;
  const mid = Math.round((r.price + l.ask) / 2); const canSimCounter = r.isOffer && mid > r.price && mid < l.ask;
  const ctrPm = ctr === null || ctr.trim() === "" ? null : parseMoney(ctr);
  const ctrErr = !ctrPm ? null : ctrPm.error ? "Counter: " + ctrPm.error : ctrPm.value <= r.price || ctrPm.value >= l.ask ? `Between ${money(r.price)} and ${money(l.ask)}.` : null;
  // A listing its seller closed (withdrawn; "Close listing" in live, follow-on B2) puts nothing back on sale: an unpaid reservation that
  // ends goes back to the seller, and the card says so to both (the preview says "withdrawn").
  const shut = !!l.withdrawnAt && !r.isoReply, shutWord = LIVE ? "closed" : "withdrawn";
  // Live: once nothing more can be sold (the train has left, the event has started, the transfer window closed), what comes back stays with
  // the seller, and the cancel and release confirmations say so, as the engine's toasts do (W1 fix, OBS-2).
  const endedWhy = LIVE && !shut && !r.isoReply ? saleEndedWhy(ev, l) : null;
  const ended = endedWhy ? endedWhy.charAt(0).toLowerCase() + endedWhy.slice(1).replace(/\.$/, "") : null;
  const unpaidWhy = r.isoReply ? "unpaid, the held reply closes" : holdCut || (shut ? (isB ? `unpaid, the reservation ends and the listing stays ${shutWord}` : "unpaid, it comes back to you")
    : paused ? "unpaid, the reservation ends and the listing stays paused" : "unpaid reservations go back on sale");
  // Live, the buyer at the payment stage (follow-on B1): one block with the amount, who to pay and by when, each method with Copy, the
  // amount with Copy (digits only), "Paid with" when there are two (the preferred one chosen), and the one primary "I've sent payment".
  const payBlock = LIVE && isB && b === "accepted" && !FINAL.includes(st) && typeof dl.next === "number" ? (
    <div ref={payRef} tabIndex={-1} className="pay-block" role="group" aria-labelledby={"pay-h-" + r.id} data-pay-block={r.id}>
      <p id={"pay-h-" + r.id} className="pay-lead"><b>Send {money(total)} to {seller.name} by {fmtMs(dl.next)}</b> ({untilText(dl.next)}) · {unpaidWhy}{r.topUp ? `. The ${money(r.topUp * r.qty)} non-member top-up goes to ${ev.club} when it changes the name` : ""}</p>
      <dl className="facts pay-rows">
        {pay.length > 0 ? <PayRows pay={pay} from={S} copy={copy} copyLbl={copyLbl} /> : <><dt>Where</dt><dd>Ask {S} how to pay them: their payment details aren't in Handoff.</dd></>}
        <dt>Amount</dt><dd><span className="num pay-dest">{money(total)}</span> <button type="button" className="btn btn-sm pay-copy" data-copy="amount" onClick={() => copy("amount", amountDigits(total))}><Icon name="copy" size={14} />{copyLbl("amount", "Copy amount")}</button></dd>
      </dl>
      {pay.length === 2 && <fieldset className="pay-via"><legend>Paid with</legend>
        <div className="actions">{pay.map(pm => <label key={pm.kind} className="check" htmlFor={`via-${r.id}-${pm.kind}`}><input id={`via-${r.id}-${pm.kind}`} type="radio" name={"via-" + r.id} checked={viaKind === pm.kind} onChange={() => setVia(pm.kind)} /><span>{PAY_LABELS[pm.kind]}</span></label>)}</div></fieldset>}
      {st === "accepted" && !ask && <div className="actions"><button className="btn btn-primary btn-sm" data-sent-payment="" onClick={() => dispatch({ type: "markPaid", requestId: r.id, ...(viaKind ? { via: viaKind } : {}) })}><Icon name="check" size={14} />{PAID_BTN}</button></div>}
      <p className="muted" data-pay-note="" style={{ margin: 0, fontSize: 12.5 }}>Tap it once you've sent the money. {S} then confirms it arrived.</p>{/* §9x item 4: no routine "Handoff can't see payments" (Help says it once) */}
    </div>) : null;
  // The Payment row (live): the seller's card at the payment stage shows the same methods; once the buyer has said they paid, both cards say
  // how they said they paid, and "payment received" only after the seller confirms it. An exchange from before B1 keeps its words.
  const payFact = !LIVE ? null : b === "accepted"
    ? <>{B} pays you {money(total)}{pay.length ? " with:" : "."}{pay.length > 0 && <dl className="facts pay-rows"><PayRows pay={pay} /></dl>}</>
    : (w => <span data-paid-fact={r.id}>{w.said}{(paidTo || (!paidKind && legacyHandle)) ? <> to <span className="num">{paidTo ? formatPayMethod(paidTo) : legacyHandle}</span></> : null}{w.confirmed ? <> · <span data-paid-confirmed="">{w.confirmed}</span></> : null}</span>)(
        // §9x item 4: who marked it paid, and, only once they have, that the seller confirmed it ("You marked $20 paid by Venmo to @maya ·
        // Maya confirmed payment"); no routine "Handoff can't see payments". An exchange from before B1 names its listing's own handle.
        paidWords({ isB, B, S, amount: money(total), via: paidKind ? PAY_LABELS[paidKind] : null, confirmed: !!r.paymentConfirmedAt }));

  return (
    <div className="req" ref={rootRef} onFocus={() => { hadFocus.current = true; }} onBlur={e2 => { if (!e2.currentTarget.contains(e2.relatedTarget)) hadFocus.current = false; }}>
      <span className="sr" role="status" aria-live="polite">{copied.startsWith("fail:") ? "Couldn't copy. Select the text on screen instead." : copied ? "Copied to clipboard" : ""}</span>
      <div className="req-top">
        <Avatar id={other} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{isB ? `From ${seller.name} · ${plural(r.qty, u)}` : `${buyer.name} · ${plural(r.qty, u)}`}</b>
          <div className="muted" style={{ fontSize: 13 }}>{priceHead({ gratis, total, to: isB ? S : "you" })}{r.isOffer ? ` · offer (asking ${money(l.ask)})` : r.isoReply ? ` · held for ${isB ? "your" : "their"} request` : nf && r.price !== l.ask ? ` · ${money(r.price)} each (asking ${money(l.ask)})` : gratis ? "" : " · asking price"}{nf && r.fromIso ? ` · for ${isB ? "your" : "their"} request` : ""}{nf && r.wantedQty ? ` · asked for ${r.wantedQty}` : ""}{b === "countered" ? ` · countered at ${money(r.counterPrice)}` : ""}{r.topUp ? ` + ${money(r.topUp * r.qty)} top-up to the club` : ""} · {ago(r.createdAt)}</div>
        </div>
        {(doneMap[b] == null || rStatus(r, e).label === "Disputed") && <span ref={chipRef} tabIndex={-1} className={"chip tone-" + rStatus(r, e).tone}>{rStatus(r, e).label}</span>}
      </div>
      {r.msg && <div className="quote">“{r.msg}”</div>}
      {/* §9v item 5 (live): the buyer reads the listing's restrictions in plain words on their card (listingRestrictions: members
          only, a name change, the seller's own words, an older listing's flag); the preview keeps its flag chip. */}
      {/* §9x item 4 (live): no "Seller says they have it · not verified" chip. Every ticket on Handoff is one its seller says they have,
          so the chip was on every exchange; the preview, which also has sample tickets, keeps it. */}
      {!FINAL.includes(st) && (r.departsAt || (isB && (restr.length > 0 || (!LIVE && selfReported(s, l))))) && <div className="chips">{r.departsAt && <span className="chip">Train departs {fmtWhen(r.departsAt)}</span>}{isB && (LIVE ? restr.map(x => <span key={x.kind} className="chip restrict-chip" data-restriction={x.kind}><Icon name="lock" size={13} />{x.text}</span>) : l.restricted && <span className="chip tone-warn"><Icon name="alert" size={13} />Seller flagged a transfer restriction</span>)}{!LIVE && isB && selfReported(s, l) && <span className="chip tone-warn">Seller says they have it · not verified</span>}</div>}
      {doneMap[b] != null && <div ref={tlRef} tabIndex={-1}><Timeline steps={steps} done={doneMap[b]} nowLabel={st === "paused" ? "Paused" : waitOn} /></div>}
      {e.reason && FINAL.concat(["paused"]).includes(st) && <div ref={nf ? whyRef : undefined} tabIndex={nf ? -1 : undefined} data-ended-why={nf ? r.id : undefined} className={"callout " + (st === "paused" ? "warn" : "")}>{e.reason}{/[.!?]$/.test(e.reason) ? "" : nf ? "." : ""}</div>}
      {/* Follow-on B5, before the reservation: the next step, when the request or invitation ends, and that nothing is held; or the
          seller's invitation form in their place. */}
      {showInv ? <InviteForm r={r} l={l} ev={ev} s={s} most={most} dispatch={dispatch} saveProfile={saveProfile} onClose={closeInvite} />
        : pre && <div className="next" data-invite-step={st}>
          <dl className="facts">
            <dt>Next step</dt><dd><b>{preNext}</b></dd>
            {/* §9n: the invited buyer's total, before they reserve: the quantity times the agreed price ("$50 to Ann · 2 tickets · $25 each"). */}
            {isB && st === "invited" && (gratis ? <><dt>Total</dt><dd data-total={r.id} data-free=""><b>Free</b> · nothing to pay{r.qty > 1 ? ` for ${plural(r.qty, u)}` : ""}</dd></>
              : <><dt>Total</dt><dd data-total={r.id}><b>{money(total)}</b> to {S}{r.qty > 1 ? ` · ${qtyLine(r.qty, reqPrice(r, l), u)}` : ""}</dd></>)}
            {typeof dl.next === "number" && <><dt>Deadline</dt><dd>{fmtMs(dl.next)} ({untilText(dl.next)}) · then the {st === "requested" ? "request" : "invitation"} ends</dd></>}
            {isB && st === "invited" && !gratis && <><dt>Payment</dt><dd>{kinds ? `${S} takes ${kinds}. ` : ""}You'll see where to pay once you reserve it.</dd></>}{/* §9x item 1: a free ticket has no payment row */}
            {/* §9v item 5 (live): before the buyer reserves, the ticket's restrictions in plain words (none: no row). */}
            {LIVE && isB && st === "invited" && restr.length > 0 && <><dt>{restr.length === 1 ? "Restriction" : "Restrictions"}</dt><dd data-restrictions={r.id}>{restr.map(x => x.text).join(" · ")}</dd></>}
            {/* §9m item 1: a listing that promises no method says the neutral rule from the request and the invitation on. */}
            {tw && !quietTransfer && <><dt>Transfer</dt><dd data-transfer-rule="">{tw}</dd></>}
          </dl>
          {preNote && <div ref={paused || busyNow ? whyRef : undefined} tabIndex={-1} className={"callout " + preNote[1]} data-invite-note={paused ? "paused" : busyNow ? "blocked" : st}>{preNote[0]}</div>}
          {nfErr && !paused && !busyNow && <p ref={whyRef} tabIndex={-1} className="err" data-nf-err="" style={{ margin: 0 }}>{nfErr}</p>}
        </div>}
      {/* The pending-offer rule, in words, while the seller has the listing paused (C-CONTRACT §8). */}
      {waitsResume && <div className="callout warn">{isB
        ? (st === "pending" ? `${S} paused this listing. Your offer stays open until the deadline below, but ${S} can't accept or counter it until they resume the listing. You can still withdraw it, and you'll get a notification when they resume it.`
          : `${S} paused this listing. Their counter-offer stays open until the deadline below, but you can't accept it until they resume the listing. You can still decline it, and you'll get a notification when they resume it.`)
        : (st === "pending" ? `You paused this listing. ${B}'s offer stays open until the deadline below, but you can't accept or counter it until you resume the listing. You can still decline it.`
          : `You paused this listing. Your counter-offer stays open until the deadline below, but ${B} can't accept it until you resume the listing.`)}</div>}

      {next && !FINAL.includes(st) && (
        <div className="next">
          {payBlock}
          <dl className="facts">
            {!payBlock && <><dt>Next step</dt><dd><b>{!LIVE && isB && b === "accepted" ? (l.payHandle ? <>Pay {money(total)} to <span className="num">{l.payHandle}</span> on Venmo or PayPal, then tap “Paid”.</> : <>Pay {S} {money(total)} on Venmo or PayPal, then tap “Paid”.</>) : next}</b>{!LIVE && isB && b === "accepted" && l.payHandle && <> <button className="btn btn-sm" style={{ marginLeft: 4 }} onClick={() => copy("handle", l.payHandle)}><Icon name="copy" size={14} />{copyLbl("handle", "Copy handle")}</button></>}</dd></>}
            {/* A disputed payment's time is when the seller may release it: the seller's own card says "you", and once it has come the
                next step already says so, so the seller's card drops it rather than show a "Deadline (passed)" nobody missed. The buyer's
                payment block (live) already says the reservation's deadline. */}
            {dl.next && !(canRelease && !isB) && !payBlock && <><dt>Deadline</dt><dd>{fmtMs(dl.next)} ({untilText(dl.next)}) · {b === "accepted" ? unpaidWhy : disputed ? (isB ? `then ${S} can release it` : "then you can release it") : "then it expires"}</dd></>}
            {skipPay && <><dt>Payment</dt><dd data-free-payment={r.id}>Free: nothing to pay</dd></>}{/* §9x item 1: no payment was asked for, made or confirmed */}
            {!skipPay && ((b === "accepted" && !isB) || paidStage) && <><dt>Payment</dt><dd>{LIVE ? payFact : b === "accepted"
              ? <>{B} pays you at <span className="num">{l.payHandle}</span>.</>
              : <>{money(total)} to <span className="num">{l.payHandle}</span> · {r.paidSimulated ? "simulated" : "self-reported"}{r.paymentConfirmedAt ? `, confirmed by ${isB ? S : "you"}${r.confirmSimulated ? " (simulated)" : ""}` : ""}</>}</dd></>}
            {!(isB && ["paid", "confirmed", "sent"].includes(b)) && tw && !quietTransfer && <><dt>Transfer</dt><dd data-transfer-rule="">{tw}</dd></>}
            {!(isB && ["paid", "confirmed", "sent"].includes(b)) && !tw && !quietTransfer && <><dt>Transfer</dt><dd>{m.label}{l.method !== "file" ? "" : LIVE ? (isB ? `: ${S} sends it to you after confirming your payment` : ": you send it to the buyer yourself after you confirm their payment")
              : r.deliveredAt ? (isB ? `: delivered to you by Handoff` : `: Handoff delivered ${l.file ? l.file.name : "the file"}`) : isB ? ": Handoff sends you the file once the payment is confirmed" : `: your file${l.file ? ` (${l.file.name})` : ""} stays hidden until you confirm the payment`}</dd></>}
            {(b === "accepted" || paidStage) && (!LIVE || PEOPLE[other].contact) && <><dt>Contact</dt><dd>{PEOPLE[other].name}: <span className="num">{PEOPLE[other].contact}</span> <span className="muted">{LIVE ? "(shared with each other for this exchange)" : "(demo address, shared when it was reserved)"}</span></dd></>}
          </dl>
          {!isB && b === "confirmed" && (l.method === "app" || (LIVE && l.method === "file") || !!tw) && buyer.contact && <div className="actions" data-send-to="" style={{ alignItems: "center" }}><span>{l.method === "file" || tw ? "Send it to" : "Transfer to"} <b className="num">{buyer.contact}</b></span><button className="btn btn-sm" onClick={() => copy("email", buyer.contact)}><Icon name="copy" size={14} />{copyLbl("email", "Copy email")}</button></div>}
          {!isB && b === "confirmed" && l.method === "name" && <div className="field"><span className="label">Send this to {orgOf(ev, l)} from your own email</span><div className="share-preview" style={{ whiteSpace: "pre-wrap" }}><b>{subject}</b>{"\n"}{draft}</div><div className="actions"><a className="btn btn-sm btn-primary" href={"mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(draft)}><Icon name="mail" size={14} />Open in email</a><button className="btn btn-sm" onClick={() => copy("draft", draft)}><Icon name="copy" size={14} />{copyLbl("draft", "Copy text")}</button></div></div>}
        </div>
      )}
      {!LIVE && l.method === "file" && r.deliveredAt && isB && <div className="callout good"><Icon name="ticket" size={15} /> <b>Your ticket: {l.file ? l.file.name : "ticket file"}</b> · delivered in Handoff and by email (simulated; this demo doesn't store the file itself).</div>}
      {st === "completed" && <div className="callout good"><b>{isB ? "Done." : `Done: ${B} received it.`}</b>{r.receiptSimulated && <span className="chip tone-warn" style={{ marginLeft: 6 }}>Simulated: fictional buyer's confirmation</span>}{isB && (LIVE || skipPay ? <> If it doesn't work at the door, tap “There's a problem” (open until the event ends).</> : <> Handoff doesn't hold money: if it doesn't work at the door, tap “There's a problem” (open until the event ends).</>)}</div>}{/* §9x item 4 (live): a finished exchange says what to do if the ticket fails, not what Handoff doesn't check or hold (Help says that once) */}

      {ask === "cancel" && pre ? <Confirm text={st === "requested" ? "Withdraw your request? Nothing was held." : "Decline the invitation? Nothing was held."} label={st === "requested" ? "Yes, withdraw" : "Yes, decline"} onYes={() => { dispatch({ type: "cancel", requestId: r.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : ask === "withdrawInv" ? <Confirm text={`Withdraw the invitation? ${B} can't reserve it any more. Nothing was held.`} label="Yes, withdraw" onYes={() => { dispatch({ type: "decline", requestId: r.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : ask === "cancel" && nf && (st === "accepted" || (st === "confirmed" && skipPay)) ? <Confirm text={shut ? `Release the reservation? It goes back to ${S}, who has ${shutWord} the listing.` : ended ? `Release the reservation? It goes back to ${S} (${ended}).` : paused ? `Release the reservation? It goes back to ${S}, who has paused the listing.` : "Release the reservation? It goes back on sale."} label="Yes, release" onYes={() => { dispatch({ type: "cancel", requestId: r.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : ask === "cancel" ? <Confirm text={st === "pending" ? "Withdraw your offer?" : disputed ? `Cancel the reservation? Do this only if you didn't pay ${S}. ${r.isoReply ? "The held reply closes." : shut ? `It goes back to ${S}, who has ${shutWord} the listing.` : ended ? `It goes back to ${S} (${ended}).` : paused ? `It goes back to ${S}, who has paused the listing.` : "It goes back on sale."}` : r.isoReply ? "Cancel the reservation? The held reply closes." : shut ? `Cancel the reservation? It goes back to ${S}, who has ${shutWord} the listing.` : ended ? `Cancel the reservation? It goes back to ${S} (${ended}).` : paused ? `Cancel the reservation? It goes back to ${S}, who has paused the listing.` : "Cancel the reservation? It goes back on sale."} label="Yes, cancel" onYes={() => { dispatch({ type: "cancel", requestId: r.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : ask === "release" ? <Confirm text={`Release the reservation? ${B} loses it${r.isoReply ? " and the reply closes" : l.withdrawnAt ? (LIVE ? " and it comes back to you (the listing stays closed)" : " (the listing stays withdrawn)") : ended ? ` and it comes back to you (${ended})` : paused ? " and it comes back to you (the listing stays paused until you resume it)" : access(ev).ok ? " and it goes back on sale" : " (the listing stays paused)"}.${disputed ? " Handoff can't see payments: release it only if the money really didn't arrive." : ""}`} label="Yes, release" onYes={() => { dispatch({ type: "release", requestId: r.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : <div className="actions">
            {/* While the listing is paused, an open offer can only be declined (C-CONTRACT §8). */}
            {!isB && st === "pending" && (waitsResume ? <button className="btn btn-sm" onClick={() => dispatch({ type: "decline", requestId: r.id })}>Decline</button> : ctr === null ? <>
              <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "accept", requestId: r.id })}><Icon name="check" size={14} />Accept {money(r.price)}</button>
              <button ref={ctrBtn} className="btn btn-sm" onClick={() => setCtr(String(mid > r.price && mid < l.ask ? mid : ""))}>Counter</button>
              <button className="btn btn-sm" onClick={() => dispatch({ type: "decline", requestId: r.id })}>Decline</button></>
              : <div className="actions" style={{ alignItems: "end" }}>
                  <div className="field" style={{ maxWidth: 220 }}><label htmlFor={"ctr-" + r.id}>Your counter (one only)</label>
                    <div className="money"><span>$</span><input ref={ctrIn} id={"ctr-" + r.id} type="text" inputMode="decimal" value={ctr} onChange={ev2 => setCtr(ev2.target.value)} aria-invalid={!!ctrErr} aria-describedby={"ctr-msg-" + r.id} /></div>
                    <span id={"ctr-msg-" + r.id} className={ctrErr ? "err" : "help"}>{ctrErr || `Between ${money(r.price)} and ${money(l.ask)}.`}</span></div>
                  <button className="btn btn-primary btn-sm" disabled={!ctrPm || !!ctrErr} onClick={async () => { const res = await dispatch({ type: "counter", requestId: r.id, amount: ctr }); if (!res.error) { ctrSent.current = true; setCtr(null); } }}>Send counter</button>
                  <button className="btn btn-sm" onClick={() => setCtr(null)}>Cancel</button></div>)}
            {isB && (st === "countered" || st === "proposed") && <>
              {/* A counter on a paused listing can't be accepted until it's resumed, only declined (C-CONTRACT §8). */}
              {!waitsResume && membersOnlyListing(ev, l) && !r.memberConfirmed && <div className="callout warn" style={{ display: "grid", gap: 8, flexBasis: "100%" }}>
                <span data-member-rule="">This ticket is only for {memberClubOf(ev, l)} members. Non-members can be turned away at the door, even with a ticket.</span>
                <label className="check" htmlFor={"mb-" + r.id}><input id={"mb-" + r.id} type="checkbox" checked={memberOk} onChange={e2 => setMemberOk(e2.target.checked)} /><span>I'm a {memberClubOf(ev, l)} member</span></label></div>}
              {LIVE && !waitsResume && <p className="help email-note" data-email-note={r.id} style={{ flexBasis: "100%", margin: 0 }}>Accepting reserves it: you and the seller can then see each other's PennTools email.</p>}
              {!waitsResume && <button className="btn btn-primary btn-sm" disabled={membersOnlyListing(ev, l) && !r.memberConfirmed && !memberOk} onClick={() => dispatch({ type: "respond", requestId: r.id, accept: true, member: memberOk })}><Icon name="check" size={14} />Accept {money(st === "countered" ? r.counterPrice : r.price)}</button>}
              <button className="btn btn-sm" onClick={() => dispatch({ type: "respond", requestId: r.id, accept: false })}>Decline</button></>}
            {/* Follow-on B5: the seller answers a request to buy ("Invite to pay" opens the form above; none while paused or while another
                buyer's reservation has it), or withdraws an invitation; the invited buyer reserves (one press), or declines. */}
            {nf && !isB && st === "requested" && !showInv && <>
              {!paused && most >= 1 && <button ref={invBtn} className="btn btn-primary btn-sm" data-invite={r.id} onClick={() => setInv(true)}>{W.inviteBtn}</button>}
              <button className="btn btn-sm" data-decline-request={r.id} onClick={() => dispatch({ type: "decline", requestId: r.id })}>Decline</button></>}
            {nf && !isB && st === "invited" && <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk("withdrawInv")}>Withdraw invitation</button>}
            {nf && isB && st === "invited" && <>
              {needMember && !paused && !busyNow && <div className="callout warn" style={{ display: "grid", gap: 8, flexBasis: "100%" }}>
                <span data-member-rule="">This ticket is only for {memberClubOf(ev, l)} members. Non-members can be turned away at the door, even with a ticket.</span>
                <label className="check" htmlFor={"mb-" + r.id}><input id={"mb-" + r.id} type="checkbox" checked={memberOk} onChange={e2 => setMemberOk(e2.target.checked)} /><span>I'm a {memberClubOf(ev, l)} member</span></label></div>}
              {/* §9q item 4: the email disclosure, at the step it's about. From the reservation to the transfer the two parties' views
                  carry each other's PennTools sign-in email (the server's CONTACT_REVEAL: accepted, paid, confirmed, sent), and the
                  Contact row below shows it to both; before the reservation neither has it. */}
              {!paused && !busyNow && <p className="help email-note" data-email-note={r.id} style={{ flexBasis: "100%", margin: 0 }}>When you reserve, you and the seller can see each other's PennTools email.</p>}
              {!paused && !busyNow && <button className="btn btn-primary btn-sm" data-reserve={r.id} disabled={needMember && !memberOk} onClick={reserve}><Icon name="check" size={14} />{W.reserveBtn}</button>}
              <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk("cancel")}>Decline</button></>}
            {isB && st === "accepted" && !payBlock && <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "markPaid", requestId: r.id })}><Icon name="check" size={14} />{PAID_BTN}</button>}
            {!isB && st === "paid" && <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "confirmPayment", requestId: r.id })}><Icon name="check" size={14} />Payment received</button>}
            {LIVE && !isB && st === "paid" && !r.payDisputedAt && <button className="btn btn-sm" onClick={() => dispatch({ type: "paymentMissing", requestId: r.id })}>Payment hasn't arrived</button>}
            {!isB && st === "confirmed" && <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "markTransferred", requestId: r.id })}><Icon name="check" size={14} />{sentBtn}</button>}
            {isB && st === "sent" && <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "buyerReceived", requestId: r.id })}><Icon name="check" size={14} />Received</button>}
            {/* §9x item 1: a free reservation skipped the payment steps, so until the seller sends the ticket its buyer may still release it. */}
            {isB && (st === "pending" || (nf && st === "requested") || st === "accepted" || disputed || (nf && st === "confirmed" && skipPay)) && <button ref={opener} className="btn btn-sm btn-ghost btn-danger" data-release={nf && (st === "accepted" || st === "confirmed") ? r.id : undefined} onClick={() => setAsk("cancel")}>{st === "pending" ? "Withdraw offer" : st === "requested" ? "Withdraw request" : nf && (st === "accepted" || st === "confirmed") ? "Release reservation" : "Cancel reservation"}</button>}
            {/* During a hold of the invitation flow the seller waits: no Release (the engine refuses it); the line below says until when. */}
            {!isB && ((st === "accepted" && !nf) || canRelease) && <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk("release")}>{canRelease ? "Release the ticket" : "Release reservation"}</button>}
            {nf && !isB && st === "accepted" && typeof r.holdUntil === "number" && <span className="muted" data-held-for={r.id} style={{ fontSize: 13.5 }}>It's reserved for {B} until {fmtMs(r.holdUntil)}. If they don't pay by then, it comes back to you on its own.</span>}
          </div>}
      <ProblemBox x={r} kind="ticket" role={role} other={other} dispatch={dispatch} done={paidStage} canReport={(b === "accepted" || paidStage) && CLOCK <= disputeEnd(ev)} cancelHint={isB ? (st === "accepted" || (skipPay && st === "confirmed") ? (nf ? "If it can't be fixed, release the reservation." : "If it can't be fixed, cancel the reservation.") : "") : (st === "accepted" && !nf ? "If it can't be fixed, release it." : "")}
        late={LIVE && nf && isB && !gratis && typeof r.acceptedAt === "number" && ["expired", "released", "cancelled"].includes(b) && CLOCK <= disputeEnd(ev)} free={gratis} />
      {!LIVE && isB && !seller.demo && ["pending", "paid", "confirmed"].includes(st) && (
        <div className="demo-ctl">
          <div className="eyebrow">Reviewer controls · fictional seller</div>
          <div className="actions">
            {st === "pending" && <><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "accept", requestId: r.id, simulate: true })}>Simulate {S} accepting</button>{canSimCounter && <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "counter", requestId: r.id, amount: String(mid), simulate: true })}>Simulate {S} countering at {money(mid)}</button>}</>}
            {st === "paid" && <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "confirmPayment", requestId: r.id, simulate: true })}>Simulate {S} confirming payment</button>}
            {st === "confirmed" && <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "markTransferred", requestId: r.id, simulate: true })}>Simulate {S} {{ app: "transferring it", name: "emailing the club", inperson: "handing it over" }[l.method] || "transferring it"}</button>}
          </div>
        </div>
      )}
      {!LIVE && !isB && !buyer.demo && ["countered", "proposed", "accepted", "sent"].includes(st) && (
        <div className="demo-ctl">
          <div className="eyebrow">Reviewer controls · fictional buyer</div>
          <div className="actions">
            {(st === "countered" || st === "proposed") && <><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "respond", requestId: r.id, accept: true, simulate: true })}>Simulate {B} accepting</button><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "respond", requestId: r.id, accept: false, simulate: true })}>Simulate {B} declining</button></>}
            {st === "accepted" && <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "markPaid", requestId: r.id, simulate: true })}>Simulate {B} paying</button>}
            {st === "sent" && <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "buyerReceived", requestId: r.id, simulate: true })}>Simulate {B} confirming receipt</button>}
          </div>
        </div>
      )}
      {/* §9x item 4 (live): each step in plain words, by who acted ("Buyer marked paid", "Seller confirmed payment", "Seller marked ticket
          sent", "Buyer confirmed receipt": progressLine). The stored history is unchanged; the preview shows it as stored. */}
      {r.history && r.history.length > 0 && <details><summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>History</summary><ul className="history" data-history={r.id}>{r.history.map((x, k) => <li key={k}>{fmtMs(x.at)} · {LIVE ? progressLine(x.text) : x.text}</li>)}</ul></details>}
    </div>
  );
}
export function HandoffCard(props) { return props.r.flow === "quick" ? <QuickCard {...props} /> : <LegacyCard {...props} />; }
/* What a card says of a record (rState). An unpaid hold that this page's own clock has ended before the server's stored lapse reached it
   gets the reason the server stores (the engine's lapsedReason): on a listing the seller paused or closed it never reads "…so it went back
   on sale.", not even until the next refresh (FINAL-1: rb-check B1 saw it for a moment). Pure: no DOM. */
export function shownState(r, l) {
  const e = rState(r);
  return e.st === "expired" && !FINAL.includes(r.status) && typeof e.reason === "string" ? { ...e, reason: lapsedReason(e.reason, l) } : e;
}
/* Club trips and operator-run treks: request -> seller accepts -> organizer approval / registration (the older flow). */
function LegacyCard({ r, role, s, dispatch, go }) {
  const [ask, setAsk] = useState(null); const opener = useRef(null); // the Release or Cancel button, for focus after "Keep it"
  const ev = EV[r.eventId]; const l = s.listings.find(x => x.id === r.listingId);
  const e = rState(r); const st = e.st; const flow = r.flow || flowFor(ev, l, r); // pending requests: the path the listing will take
  const peer = flow === "peer";
  const seller = PEOPLE[l.sellerId], buyer = PEOPLE[r.buyerId];
  const other = role === "seller" ? r.buyerId : l.sellerId;
  const consent = r.consent || {}, reports = r.reports || {};
  const hand = !!ev.paperTicket; // paper train tickets change hands in person
  const steps = peer ? ["Requested", "Accepted · held", hand ? "Handed over" : "Sent", "Handed off"]
    : flow === "approval" ? ["Requested", "Accepted · held", "Organizer approval", "Name change pending", "Registration confirmed"] : ["Requested", "Accepted · held", "Name change pending", "Registration confirmed"];
  const doneMap = peer ? { pending: 1, waiting: 1, accepted: 2, sent: 3, completed: 4 }
    : flow === "approval" ? { pending: 1, waiting: 1, accepted: 2, approval: 2, registration: 3, completed: 5 } : { pending: 1, waiting: 1, accepted: 2, registration: 2, completed: 4 };
  const dl = requestDeadlines(r);
  const price = ev.premium ? `${money(l.ask)} reimbursement · ${money(commitment(ev, l.ask, l.paid) + (r.topUp || 0))} total commitment` : `${money(reqPrice(r, l) * r.qty)} to seller${r.isOffer ? ` (offer · asking ${money(l.ask)})` : ""}${r.topUp ? ` + ${money(r.topUp * r.qty)} top-up to club` : ""}`;
  const illus = t => "Illustrative: " + t; // club processes and payment rules are demo data, not confirmed with the club
  const payText = peer ? `${role === "buyer" ? `Pay ${seller.first} directly once you have it (Venmo, Zelle or cash)` : `${buyer.first} pays you directly after receiving it`}. Handoff doesn't handle payment yet.` : illus(ev.payment);
  const b = baseSt(e);
  const backupN = s.requests.filter(o => o.listingId === l.id && o.id !== r.id && rState(o).st === "waiting").length;
  const endLbl = r.departsAt ? " · train departs" : ev.openUntil ? (ev.paperTicket ? " · ticket expires" : " · end of travel week") : " · event start";
  const sentWhere = ev.paperTicket ? "In person: the paper ticket changes hands. Check the date and stations before paying."
    : ev.cat === "Travel" ? "The seller forwards the eTicket (PDF or barcode); it stays in the seller's name. Check the train, date and stations before paying." : "Directly between you: a transfer in the ticketing app, or the ticket's QR code or PDF";

  let info = null;
  if (st === "pending") info = { next: role === "seller" ? `Accept or decline ${buyer.first}'s request` : `${seller.first} accepts or declines your request`, who: `${seller.name} (seller)`, where: "Here on Handoff" };
  if (st === "waiting") info = { next: role === "seller" ? `Nothing for now. If the current match falls through, ${buyer.first}'s request becomes active again and you can accept or decline it.` : "Another request is being processed. You're next in line if it falls through.", who: "No one yet: this is a backup request", where: "Here on Handoff" };
  if (st === "accepted") info = peer
    ? { next: role === "seller" ? (hand ? `Hand the ticket to ${buyer.first}, then tap "I've handed it over"` : `Send it to ${buyer.first}, then tap "I've sent it"`) : `${seller.first} ${hand ? "hands you the ticket" : "sends it to you"}`, who: `${seller.name} (seller)`, where: sentWhere }
    : { next: flow === "approval" ? `Send the swap to ${ev.club} for approval, then tap "I've sent it to the organizer"` : ev.organizerRequired ? `Release it through the trek operator's process, then tap "I've released it through the operator"` : `Release it through ${ev.club}'s process, then tap "I've released it through the club"`, who: `${seller.name} (seller)`, where: illus(ev.path) };
  if (st === "sent") info = { next: role === "buyer" ? `Check you have it, then tap "I've got it"` : `${buyer.first} confirms they have it`, who: `${buyer.name} (buyer)`, where: "Here on Handoff" };
  if (st === "approval") info = { next: `${ev.club} approves or declines the swap${r.topUp ? ` (incl. the ${money(r.topUp)} top-up)` : ""}`, who: `${ev.club} organizer`, where: illus(ev.path) };
  if (st === "registration") info = ev.organizerRequired
    ? { next: "The trek operator registers the new traveler and confirms", who: "Trek operator", where: `The operator's traveler list, outside Handoff. ${buyer.first} watches for the operator's confirmation.` }
    : { next: `${ev.club} updates the registration and confirms`, who: `${ev.club} organizer`, where: `${ev.club}'s registration, outside Handoff. ${buyer.first} watches for the organizer's confirmation.` };
  if (st === "paused") info = e.from === "pending" || e.from === "waiting"
    ? { next: "Nothing until the policy changes back. The seller can't accept meanwhile.", who: "No one yet", where: "Here on Handoff" }
    : e.from === "accepted"
      ? { next: `Nothing moves until the policy changes back. ${role === "seller" ? "You can" : `${seller.first} can`} release the hold meanwhile.`, who: `${seller.name} (seller)`, where: "Here on Handoff" }
      : { next: "The organizer already has this swap and decides what happens under its new policy", who: `${ev.club} organizer`, where: illus(ev.path) };

  // What the in-progress step is waiting on, in the card's own words.
  const waitOn = {
    pending: role === "seller" ? "Your turn: accept or decline" : `Waiting for ${seller.first} to accept`,
    waiting: "Backup: next in line",
    accepted: peer ? (role === "seller" ? `Your turn: ${hand ? "hand it over" : "send it"}` : `Waiting for ${seller.first} to ${hand ? "hand it over" : "send it"}`)
      : role === "seller" ? `Your turn: start ${ev.organizerRequired ? "the operator's" : "the club's"} steps` : `Waiting for ${seller.first} to start the ${ev.organizerRequired ? "operator's" : "club's"} steps`,
    sent: role === "buyer" ? "Your turn: confirm you got it" : `Waiting for ${buyer.first} to confirm`,
    approval: `Waiting for ${ev.club} to approve`,
    registration: `Waiting for ${orgWho(ev)} to confirm`,
  }[b];
  const cancelText = b === "pending" ? "Cancel this request? The seller won't be able to accept it." :
    b === "waiting" ? "Withdraw your backup request? You won't be considered if the current match falls through." :
    b === "accepted" ? "Cancel this match? It goes back to the seller." :
    b === "sent" ? `Cancel even though ${seller.first} says they ${hand ? "handed it over" : "sent it"}? Sort it out with them directly. It goes back to the seller on Handoff.` :
    b === "approval" ? `Cancel this swap? If you already contacted ${ev.club}, tell them too. It goes back to the seller.` :
    `Cancel even though registration may already be updated? You'll need to sort it out with ${orgWho(ev)} directly. It goes back to the seller on Handoff.`;

  return (
    <div className="req">
      <div className="req-top">
        <Avatar id={other} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{role === "seller" ? `${buyer.name} wants ${plural(r.qty, isAddOn(ev, l) ? "add-on" : unitOf(ev))}` : `From ${seller.name} · ${plural(r.qty, isAddOn(ev, l) ? "add-on" : unitOf(ev))}`}</b>
          <div className="muted" style={{ fontSize: 13 }}>{price} · requested {ago(r.createdAt)}</div>
        </div>
        <span className={"chip tone-" + rStatus(r, e).tone}>{rStatus(r, e).label}</span>
      </div>
      {r.msg && <div className="quote">“{r.msg}”</div>}
      {!FINAL.includes(st) && <div><span className={"chip " + (peer ? "tone-good" : "tone-accent")}>{peer ? DIRECT_LABEL : orgLabel(ev)}</span>{l.restricted && <span className="chip tone-warn" style={{ marginLeft: 6 }}><Icon name="alert" size={13} />Seller flagged a transfer restriction</span>}</div>}
      {selfReported(s, l) && <div><span className="chip tone-warn">Seller says they have it · not verified</span></div>}
      {doneMap[b] != null && <Timeline steps={steps} done={doneMap[b]} nowLabel={st === "paused" ? "Paused" : waitOn} />}
      {e.reason && FINAL.concat(["paused"]).includes(st) && <div className={"callout " + (st === "paused" ? "warn" : "")}>{e.reason}</div>}
      {e.afterCutoff && <div className="callout warn">The transfer cutoff passed while this was with {b === "approval" ? ev.club : orgWho(ev)}. It got there in time, so {b === "approval" ? ev.club : orgWho(ev)} decides; Handoff can't extend the cutoff.</div>}
      {st === "pending" && r.restoredAt && <div className="callout">This was a backup request. It's active again because it became available. {role === "seller" ? "You haven't accepted it yet." : `${seller.first} hasn't accepted it yet.`}</div>}

      {info && (
        <div className="next">
          <dl className="facts">
            <dt>Next step</dt><dd><b>{info.next}</b></dd>
            <dt>Who acts</dt><dd>{info.who}</dd>
            {dl.next && <><dt>{st === "waiting" ? "Backup ends" : "Deadline"}</dt><dd>{fmtMs(dl.next)} ({untilText(dl.next)}){st === "pending" ? " · seller response, demo rule" : st === "accepted" ? (peer ? (hand ? " · seller hands it over, demo rule" : " · seller sends it, demo rule") : " · start the organizer's steps, demo rule") : st === "registration" || st === "sent" ? endLbl : st === "waiting" ? (ev.deadline ? " · transfer cutoff" : endLbl) : ""}</dd></>}
            {dl.cutoff && st !== "waiting" && st !== "sent" && <><dt>{peer ? "Transfer cutoff" : "Organizer cutoff"}</dt><dd>{fmtMs(dl.cutoff)} (illustrative)</dd></>}
            <dt>Where</dt><dd>{info.where}</dd>
            {["accepted", "sent", "approval", "registration"].includes(b) && <><dt>Payment</dt><dd>{payText}</dd></>}
          </dl>
          {(reports.seller || reports.buyer) && <div className="chips">
            {reports.seller && <span className="chip tone-muted">{seller.first}: {peer ? (hand ? "handed it over" : "sent it") : flow === "approval" ? "sent to organizer" : "released it"} · {r.sendSimulated ? "simulated (fictional account)" : "self-reported"}</span>}
            {reports.buyer && <span className="chip tone-muted">{buyer.first}: sees registration · self-reported</span>}
          </div>}
        </div>
      )}

      {st === "completed" && peer && <div className="callout good"><b>Handed off</b>{r.receiptSimulated && <span className="chip tone-warn" style={{ marginLeft: 6 }}>Simulated: fictional buyer's confirmation</span>}<br />{role === "buyer" ? `You confirmed you have it. Pay ${seller.first} directly if you haven't yet.` : `${buyer.first} confirmed they have it and pays you directly.`} Handoff doesn't handle payment yet, so it can't protect or reverse it.</div>}
      {st === "completed" && !peer && <div className="callout good"><b>Registration confirmed</b> <span className="chip tone-warn" style={{ marginLeft: 4 }}>Simulated in this demo</span><br />{OrgWho(ev)} has confirmed {role === "buyer" ? "your" : `${buyer.first}'s`} registration. {ev.premium ? `${role === "buyer" ? `Your ${money(l.ask)} reimbursement to ${seller.first}` : `${buyer.first}'s ${money(l.ask)} reimbursement to you`}, and the remaining payments to the club, are paid directly. Handoff doesn't handle payment yet, so it can't protect or reverse them.` : `${role === "buyer" ? `Pay ${seller.first} directly if you haven't yet.` : `${buyer.first} pays you directly.`} Handoff doesn't handle payment yet, so it can't protect or reverse it.`}</div>}

      {["accepted", "sent", "approval", "registration", "completed"].includes(b) && (
        <div className="next" style={{ background: "none", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="mail" size={16} /><b>Contact details</b></div>
          {consent.buyer && consent.seller
            ? <span>{seller.name}: <span className="num">{seller.contact}</span> · {buyer.name}: <span className="num">{buyer.contact}</span> <span className="muted">(demo addresses)</span></span>
            : <span className="muted">Shared only when both of you agree. {consent[role] ? `You agreed. Waiting for ${PEOPLE[other].first}.` : consent[role === "seller" ? "buyer" : "seller"] ? `${PEOPLE[other].first} agreed. Share yours to see each other's details.` : "Neither of you has shared yet."}</span>}
          {!PEOPLE[other].demo && consent[role === "seller" ? "buyer" : "seller"] && <span className="chip tone-warn" style={{ justifySelf: "start" }}>Simulated: {PEOPLE[other].first} is a fictional account that agrees automatically. Real participants choose for themselves.</span>}
          {!consent[role] && <div><button className="btn btn-sm" onClick={() => dispatch({ type: "consent", requestId: r.id, side: role })}>Share my contact with {PEOPLE[other].first}</button></div>}
        </div>
      )}
      <ProblemBox x={r} kind="ticket" role={role} other={other} dispatch={dispatch} done={b === "completed"} canReport={["accepted", "sent", "approval", "registration", "completed"].includes(b)} cancelHint={role === "buyer" ? (isOpenReq(e) ? "If it can't be fixed, cancel the match." : "") : (st === "accepted" ? "If it can't be fixed, release it." : "")} />

      {ask === "cancel" ? <Confirm text={cancelText} label="Yes, cancel" onYes={() => { dispatch({ type: "cancel", requestId: r.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : ask === "release" ? <Confirm text={`Release the hold? ${buyer.first} loses the match and it comes back to you${l.withdrawnAt ? " (the listing stays withdrawn)" : access(ev).ok ? ", available again" : " (the listing stays paused)"}.${backupN ? ` ${plural(backupN, "backup request")} that still ${backupN === 1 ? "qualifies becomes" : "qualify become"} active again for you to accept or decline.` : ""}`} label="Yes, release" onYes={() => { dispatch({ type: "release", requestId: r.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : <div className="actions">
            {role === "seller" && st === "pending" && !l.withdrawnAt && <>
              <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "accept", requestId: r.id, shareContact: true })}><Icon name="check" size={14} />{r.isOffer ? `Accept ${money(reqPrice(r, l))} · share my contact` : "Accept · share my contact"}</button>
              <button className="btn btn-sm" onClick={() => dispatch({ type: "decline", requestId: r.id })}>Decline</button></>}
            {role === "seller" && st === "accepted" && <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "sellerReport", requestId: r.id })}><Icon name="check" size={14} />{peer ? (hand ? "I've handed it over" : "I've sent it") : flow === "approval" ? "I've sent it to the organizer" : ev.organizerRequired ? "I've released it through the operator" : "I've released it through the club"}</button>}
            {role === "seller" && (st === "accepted" || (st === "paused" && e.from === "accepted")) && <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk("release")}>Release hold</button>}
            {role === "buyer" && st === "sent" && <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "buyerReceived", requestId: r.id })}><Icon name="check" size={14} />I've got it</button>}
            {role === "buyer" && b === "registration" && !reports.buyer && <button className="btn btn-sm" onClick={() => dispatch({ type: "buyerReport", requestId: r.id })}>I can see my registration</button>}
            {role === "buyer" && isOpenReq(e) && <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk("cancel")}>{b === "pending" ? "Cancel request" : b === "waiting" ? "Withdraw request" : "Cancel match"}</button>}
            {role === "buyer" && <button className="btn btn-ghost btn-sm" onClick={() => go("event", { id: ev.id })}>View event</button>}
          </div>}
      {role === "seller" && st === "sent" && !buyer.demo && (
        <div className="demo-ctl">
          <div className="eyebrow">Reviewer controls · fictional buyer</div>
          <div className="actions"><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "buyerReceived", requestId: r.id, simulate: true })}>Simulate {buyer.first} confirming receipt</button></div>
        </div>
      )}
      {role === "buyer" && !seller.demo && (st === "pending" || st === "accepted") && (
        <div className="demo-ctl">
          <div className="eyebrow">Reviewer controls · fictional seller</div>
          <div className="actions">{st === "pending"
            ? <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "accept", requestId: r.id, simulate: true })}>Simulate {seller.first} accepting</button>
            : <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "sellerReport", requestId: r.id, simulate: true })}>Simulate {seller.first} {peer ? (hand ? "handing it over" : "sending it") : `starting ${ev.organizerRequired ? "the operator's" : "the club's"} steps`}</button>}</div>
        </div>
      )}
      {(b === "approval" || b === "registration") && (
        <div className="demo-ctl">
          <div className="eyebrow">Reviewer controls · simulated {ev.organizerRequired && b !== "approval" ? "trek operator" : "organizer"}</div>
          <div className="actions">
            {b === "approval" && <><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "orgApprove", requestId: r.id })}>Simulate organizer approval</button><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "orgDecline", requestId: r.id })}>Simulate organizer decline</button></>}
            {b === "registration" && <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "orgConfirm", requestId: r.id })}>Simulate {ev.organizerRequired ? "operator" : "organizer"} confirmation</button>}
          </div>
        </div>
      )}
      {r.history && r.history.length > 0 && <details><summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>History</summary><ul className="history">{r.history.map((x, k) => <li key={k}>{fmtMs(x.at)} · {x.text}</li>)}</ul></details>}
    </div>
  );
}

function SaleRecord({ l, ev, s }) {
  const [copied, setCopied] = useState(false); const ta = useRef(null);
  const rec = l.record; if (!rec) return null;
  const stl = listingState(s, l);
  const text = [`Handoff sale-attempt record (prototype, demo clock)`, `Event: ${ev.title}, ${ev.club}`, `Event starts: ${fmtMs(rec.eventStart)}`, `Listing: ${plural(rec.qty, unitOf(ev))} at ${money(rec.ask)}`, `Listed: ${fmtMs(rec.listedAt)} (${rec.hoursBefore >= 48 ? Math.floor(rec.hoursBefore / 24) + " days" : rec.hoursBefore + " hours"} before the event)`, `At least 24 hours ahead: ${rec.meets24 ? "yes" : "no"}`, `Current status: ${stl.label}`, ...(l.history || []).map(x => `Later change: ${fmtMs(x.at)} · ${x.text}`), `Evidence of a listing attempt only. Not an organizer-approved exemption or a guarantee of good standing.`].join("\n");
  return (
    <div className="record">
      <div className="lhead" style={{ alignItems: "center" }}><b>Sale-attempt record</b><button className="btn btn-sm" onClick={async () => setCopied(await copyText(text, ta.current))}><Icon name="copy" size={14} />{copied ? "Copied" : "Copy record"}</button></div>
      <dl className="facts">
        <dt>Listed</dt><dd>{fmtMs(rec.listedAt)} · fixed at listing time</dd>
        <dt>Event starts</dt><dd>{fmtMs(rec.eventStart)}</dd>
        <dt>24h+ ahead</dt><dd>{rec.meets24 ? `Yes (${rec.hoursBefore >= 48 ? Math.floor(rec.hoursBefore / 24) + " days" : rec.hoursBefore + " hours"} before)` : `No (${rec.hoursBefore} hours before)`}</dd>
        <dt>Status now</dt><dd>{stl.label}</dd>
        {(l.history || []).length > 0 && <><dt>Changes</dt><dd>{l.history.map((x, k) => <span key={k} style={{ display: "block" }}>{fmtMs(x.at)} · {x.text}</span>)}</dd></>}
      </dl>
      <span className="muted" style={{ fontSize: 12.5 }}>Evidence that you tried to sell, under {ev.club}'s published no-show rule. Not an organizer-approved exemption or a guarantee of good standing.</span>
      <textarea ref={ta} readOnly value={text} rows={7} hidden aria-label="Record text" />
    </div>
  );
}

/* Live: a seller edits their own listing or item for what happens next (C-CONTRACT §8: editListing, editItem): the price, offers (OBO
   and the lowest offer) and the description. Anything already reserved, offered or requested keeps its price. A wrong value says why
   beside its field at once, and a missing one once Save is pressed; nothing is sent until each is right, and an edit that changes
   nothing says so. The server checks everything again: its refusal shows above the buttons and everything typed stays (sending the
   same change again reuses its request id: useLiveLink). Saved, the form closes, the server's toast says so, and focus goes back to
   the Edit button (onClose). Escape or Cancel closes it unsaved. ListingPanel and ItemPanel (goods.jsx) pass their own words and rules:
   capErr, the listing's price cap; openErr, an open offer or request the price can't undercut.
   A session that ends while it's open keeps what's typed for after sign-in (keepDraft, as the posting forms do: C-CONTRACT §5), for
   this account only, back at the record's card in My activity (place; tag names the record, "listing:<id>" or "item:<id>"), where the
   panel opens it again with those values (draft), once. */
export function TermsForm({ idp, x, priceKey, hTag = "h4", title, priceLabel, priceHelp, priceMissing, capErr, openErr, oboOk, oboHelp, noteLabel, notePlaceholder, keepNote, nothing, onSave, onClose, place, tag, draft }) {
  // Kept values (draft) come back only for this record, each as the form's own type; anything else starts from the record as stored.
  const k = draft && typeof draft === "object" && draft.for === tag ? draft : null;
  const kept = (key, max) => k && typeof k[key] === "string" ? k[key].slice(0, max) : null;
  const [price, setPrice] = useState(() => kept("price", 20) ?? String(x[priceKey]));
  const [obo, setObo] = useState(() => k && typeof k.obo === "boolean" ? k.obo : !!x.obo);
  const [min, setMin] = useState(() => kept("min", 20) ?? (typeof x.minOffer === "number" ? String(x.minOffer) : ""));
  const [note, setNote] = useState(() => kept("note", 280) ?? String(x.note || ""));
  useDraftSource("terms", () => place && tag ? { place, data: { terms: { for: tag, price, obo, min, note } } } : null);
  const [tried, setTried] = useState(false); // after a first Save, a missing price says so beside its field too
  const [err, setErr] = useState(""); // the server's refusal, or "nothing changed", above the buttons
  const head = useRef(null), errRef = useRef(null);
  useEffect(() => { if (head.current) head.current.focus(); }, []);
  const H = hTag;
  const pm = parseMoney(price), blank = price.trim() === "";
  const priceErr = blank ? (tried ? priceMissing : null) : pm.error || capErr(pm.value) || openErr(pm.value);
  const offers = oboOk && obo && !pm.error && pm.value > 0; // offers end at a $0 price, as when listing
  const mo = offers && !priceErr ? checkMinOffer(min, pm.value) : { value: null };
  // What would change, as the server compares it: an untouched description is sent as it is (left out), a typed one trimmed.
  const was = { price: x[priceKey], obo: !!x.obo, min: typeof x.minOffer === "number" ? x.minOffer : null, note: String(x.note || "") };
  const noteOut = note === was.note ? was.note : note.trim();
  const changed = !pm.error && (pm.value !== was.price || offers !== was.obo || (offers && mo.value !== was.min) || noteOut !== was.note);
  const problems = [(blank || priceErr) && idp + "-price", mo.error && idp + "-min"].filter(Boolean); // in the form's order
  const focusErr = () => setTimeout(() => { if (errRef.current) errRef.current.focus(); }, 0);
  const submit = async e => {
    e.preventDefault(); setErr("");
    if (problems.length) { setTried(true); setTimeout(() => { const el = demoElement(problems[0]); if (el) el.focus(); }, 0); return; }
    if (!changed) { setErr(nothing); focusErr(); return; }
    const r = await onSave({ price: price.trim(), obo: offers, ...(offers ? { minOffer: min.trim() } : {}), ...(noteOut !== was.note ? { note: noteOut } : {}) });
    if (r.error) { setErr(r.error); focusErr(); return; }
    onClose(true);
  };
  return (
    <form className="next" data-terms="" style={{ background: "none", border: "1px solid var(--line)", marginTop: 12, gap: 14 }} onSubmit={submit} noValidate aria-labelledby={idp + "-h"}
      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(false); } }}>
      <H id={idp + "-h"} ref={head} tabIndex={-1} style={{ fontSize: 16 }}>{title}</H>
      <div className="field" style={{ maxWidth: 300 }}><label htmlFor={idp + "-price"}>{priceLabel}</label>
        <div className="money"><span>$</span><input id={idp + "-price"} type="text" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} aria-invalid={!!priceErr} aria-describedby={idp + "-price-msg"} /></div>
        <span id={idp + "-price-msg"} className={priceErr ? "err" : "help"}>{priceErr || priceHelp}</span></div>
      {oboOk && <div className="field">
        <label className="check" htmlFor={idp + "-obo"}><input id={idp + "-obo"} type="checkbox" checked={obo} onChange={e => setObo(e.target.checked)} aria-describedby={idp + "-obo-help"} /><span><b>Open to offers (OBO)</b>: let buyers offer less than your price.</span></label>
        <span className="help" id={idp + "-obo-help"}>{oboHelp}</span></div>}
      {oboOk && obo && <div className="field" style={{ maxWidth: 300 }}><label htmlFor={idp + "-min"}>Lowest offer you'd consider (optional)</label>
        <div className="money"><span>$</span><input id={idp + "-min"} type="text" inputMode="decimal" value={min} onChange={e => setMin(e.target.value)} aria-invalid={!!mo.error} aria-describedby={idp + "-min-msg"} /></div>
        <span id={idp + "-min-msg"} className={mo.error ? "err" : "help"}>{mo.error || "Shown to buyers as \"offers from $X\". Leave blank to see any offer below your price."}</span></div>}
      <div className="field"><label htmlFor={idp + "-note"}>{noteLabel}</label>
        <textarea id={idp + "-note"} value={note} maxLength={280} onChange={e => setNote(e.target.value)} placeholder={notePlaceholder} /></div>
      <p className="help" style={{ margin: 0 }}>{keepNote}</p>
      {err && <p ref={errRef} id={idp + "-err"} className="err" role="alert" tabIndex={-1} style={{ margin: 0 }}>{err}</p>}
      <div className="actions">
        <button type="submit" className="btn btn-sm btn-primary" aria-describedby={err ? idp + "-err" : undefined}>Save changes</button>
        <button type="button" className="btn btn-sm" onClick={() => onClose(false)}>Cancel</button>
      </div>
    </form>
  );
}

/* Live (follow-on B2): closing a listing or an item, in one inline step that takes the place of the withdrawal's confirmation (so nothing is
   added): what happens (text), an optional reason with nothing chosen (Sold elsewhere, No longer selling: the engine's CLOSE_REASONS, seen
   only by the seller), then "Close listing" / "Close item" or "Keep it". It takes focus as it opens, so a screen reader reads what happens and
   Tab reaches the reasons, then Close. Escape or Keep it closes it and puts focus back on the button that opened it (returnTo). onClose(reason)
   sends the change (reason null when none is chosen); the panel says what came of it. */
/* A closed listing's or item's first words on its seller's card: "Closed", or with the reason they gave ("Closed: sold elsewhere"). */
export const closedLine = x => { const k = x && x.closeReason; return typeof k === "string" && Object.prototype.hasOwnProperty.call(CLOSE_REASONS, k) ? `Closed: ${CLOSE_REASONS[k].toLowerCase()}` : "Closed"; };
export function CloseStep({ idp, what, text, onClose, onKeep, returnTo }) {
  const [why, setWhy] = useState("");
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.focus({ preventScroll: true }); }, []);
  const keep = () => { onKeep(); setTimeout(() => { if (returnTo && returnTo.current) returnTo.current.focus(); }, 0); };
  return (
    <div ref={box} className="confirm close-step" role="group" aria-labelledby={idp + "-cl-text"} tabIndex={-1} data-close-step=""
      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); keep(); } }}>
      <span id={idp + "-cl-text"}>{text}</span>
      <fieldset className="close-why">
        <legend>Reason (optional)</legend>
        <div className="actions">{Object.keys(CLOSE_REASONS).map(k => <label key={k} className="check" htmlFor={`${idp}-cl-${k}`}>
          <input id={`${idp}-cl-${k}`} type="radio" name={idp + "-cl-why"} value={k} checked={why === k} onChange={() => setWhy(k)} aria-describedby={idp + "-cl-help"} /><span>{CLOSE_REASONS[k]}</span></label>)}</div>
        <span id={idp + "-cl-help"} className="help">Only you see it.</span>
      </fieldset>
      <div className="actions">
        <button type="button" id={idp + "-cl-yes"} className="btn btn-sm btn-danger" onClick={() => onClose(why || null)}>Close {what}</button>
        <button type="button" className="btn btn-sm" onClick={keep}>Keep it</button>
      </div>
    </div>
  );
}

export function ListingPanel({ l, s, me, dispatch, go, openShare, flash, termsDraft, saveProfile, here = false, fresh = false, freshNote = null, onDone = null }) { // freshNote (§9v item 2, SELL5-M3): what "List and invite" did, in place of "Ticket listed." ("Ticket listed. Dan is invited to pay.", or why no invitation went out) // fresh (§9s item 5, §9v item 3): Post ticket just made this listing, so the panel says "Ticket listed." and leads its actions with onDone's "Done" (back to browsing), the one prominent next action; here: on its event's own page ("Your listing", §9q item 1), so the title needn't name the event; termsDraft: an edit kept when the session ended (keepDraft), for this listing's card in My activity; saveProfile: the payment method asked at a first invitation (follow-on B5)
  const [ask, setAsk] = useState(false); const opener = useRef(null);
  const ev = EV[l.eventId]; const reqs = s.requests.filter(r => r.listingId === l.id); const nb = listingNumbers(s, l); const stl = listingState(s, l);
  const pendingN = reqs.filter(r => { const e = rState(r); return isOpenReq(e) && !reserves(e); }).length; // pending, backup or paused requests that hold nothing
  const backupsN = reqs.filter(r => baseSt(rState(r)) === "waiting").length;
  const shares = (s.responses || []).filter(x => x.listingId === l.id && x.status === "open"); // requests you shared it with ("I have this")
  // Withdrawing a share removes its row (the whole list with the last one), so focus moves to the next row's Withdraw, or to the title.
  const titleRef = useRef(null);
  const withdrawShare = async (x, k) => {
    if ((await dispatch({ type: "withdrawShare", id: x.id })).error) return;
    const rest = shares.filter(y => y.id !== x.id), next = rest[Math.min(k, rest.length - 1)];
    setTimeout(() => { const t = (next && demoElement("lp-wd-" + next.id)) || titleRef.current; if (t) t.focus(); }, 0);
  };
  // Live: the seller's own Edit, Pause and Resume (C-CONTRACT §8), never on a reply held for one request. Edit and Pause while it can still
  // sell something (not withdrawn, its event open, its train not gone, not all transferred); Resume while the pause is what keeps it off
  // sale (listingPaused). A pause with open offers or counters asks first: they stay open with their deadlines, but can't be accepted or
  // countered until it's resumed. A refusal (another tab got there first, or the listing has since closed) stays below the buttons, with
  // focus on it; after a pause or resume focus goes to the button that undoes it. An edit kept when the session ended (termsDraft, this
  // listing's) opens the form again with what was typed, once: closing it drops the kept values.
  const tag = "listing:" + l.id;
  const [kept, setKept] = useState(() => LIVE && termsDraft && termsDraft.for === tag ? termsDraft : null);
  const [manage, setManage] = useState(() => kept ? "edit" : null); // "edit" (the form) or "pause" (its confirmation)
  const [said, setSaid] = useState(""); // the last refusal of Pause or Resume
  const pauseBtn = useRef(null);
  const idp = "lp-" + l.id;
  const own = LIVE && l.sellerId === me && !l.isoReplyFor;
  const open = !l.withdrawnAt && access(ev).ok && !departed(l) && nb.completed < l.listed;
  const paused = own && listingPaused(s, l), offSale = paused ? pausedUnits(s, l) : 0;
  // §9q items 1 and 2 (live): an ordinary ticket's panel is the short one (simple), and an active one has no Pause: Close ends it, and
  // the seller lists again if plans change. One paused before keeps Resume (and Edit, and Close). Trains, treks and add-ons keep Pause.
  const simple = own && ordinaryTicket(ev, l);
  const canEdit = own && open, canPause = own && open && !l.pausedAt && !simple;
  useEffect(() => { if ((manage === "edit" && !canEdit) || (manage === "pause" && !canPause)) setManage(null); }, [manage, canEdit, canPause]); // a newer view (another tab, the event's start) closes what no longer applies
  const offers = reqs.filter(r => ["pending", "countered"].includes(rState(r).st)); // a pause keeps them open, unanswerable until it's resumed
  // Follow-on B5: open requests to buy and invitations hold nothing. A pause keeps them open until their deadlines (nobody can invite or
  // reserve meanwhile); closing the listing closes them; and the price can't drop below an invitation's or an offer's amount.
  const nfOn = LIVE && inviteFlowOn();
  const asks = reqs.filter(r => r.inviteFlow === true && ["requested", "invited"].includes(rState(r).st));
  const asksStay = n => `${n === 1 ? "The open request or invitation stays" : `The ${n} open requests and invitations stay`} open until ${n === 1 ? "its deadline" : "their deadlines"}`;
  const invTop = asks.filter(r => rState(r).st === "invited" || r.isOffer).reduce((t, r) => !t || r.price > t.price ? r : t, null);
  const pauseOrResume = async type => {
    setSaid("");
    const r = await dispatch({ type, listingId: l.id }, true);
    setManage(null);
    if (r.error) { setSaid(r.error); focusSoon(idp + "-said"); return; }
    if (r.toast && flash) flash(r.toast);
    if (type === "pauseListing") focusSoon(idp + "-resume");
    else setTimeout(() => { const el = demoElement(idp + "-pause") || demoElement(idp + "-edit"); if (el) el.focus(); }, 0); // an ordinary ticket has no Pause to go back to (§9q item 2): Edit
  };
  // The edit form's rules, as the server applies them: never above the face value (askCap; forms round 2: what the seller paid no longer
  // caps it, and without a face value nothing does), and never at or below an open offer or
  // counter, which the seller answers first.
  const cap = own ? askCap(ev, s.holdings.find(h => h.id === l.holdingId) || { paid: l.paid, tier: l.tier }) : 0;
  const top = offers.reduce((t, r) => { const c = rState(r).st === "countered", amt = c ? r.counterPrice : r.price; return !t || amt > t.amt ? { amt, counter: c } : t; }, null);
  const u = unitOf(ev);
  // Live (follow-on B2): "Close listing" while it can still sell something (as Edit), even with everything left held: holds and paid
  // exchanges go on, open offers are declined, and what nobody holds comes back to the seller (CloseStep says so first). A refusal (another
  // tab closed it first) stays below the buttons, as Pause's does. Closed, the card says so, with the reason if one was given, what's back
  // with the seller, and "List again": Sell, filled in with this listing and the tickets the seller now holds unlisted (exactly what came
  // back), while its event and train still allow a listing. Focus goes there after closing: the toast can't hold the way back (it's
  // aria-hidden and gone in 5 seconds).
  const canClose = own && open;
  useEffect(() => { if (ask && own && !canClose) setAsk(false); }, [ask, own, canClose]); // a newer view (another tab, the event's start) ends the step
  const holding = own ? s.holdings.find(h => h.id === l.holdingId) || null : null;
  const back = holding ? holdingFree(s, holding) : 0;
  const again = own && !!l.withdrawnAt && back > 0 && access(ev).ok && !departed(l);
  const closeIt = async reason => {
    setSaid("");
    const r = await dispatch({ type: "withdraw", listingId: l.id, ...(reason ? { reason } : {}) }, true);
    setAsk(false);
    if (r.error) { setSaid(r.error); focusSoon(idp + "-said"); return; }
    if (r.toast && flash) flash(r.toast);
    setTimeout(() => { const el = demoElement(idp + "-again") || demoElement(idp + "-closed"); if (el) el.focus(); }, 0);
  };
  const listAgain = () => go("list", { eventId: ev.id, from: "activity", carry: { me, note: l.note || "", tickets: {
    eventId: ev.id, pickEvent: false, holdingId: holding.id, hId: holding.id, qty: back, ask: String(l.ask), askOwn: true, askEdited: true,
    addTier: "", addQty: 1, addPaid: "", viaOrg: !!l.viaOrganizer, risk: !!l.restricted, departs: l.departsAt || "", obo: !!l.obo,
    minOffer: typeof l.minOffer === "number" ? String(l.minOffer) : "", memberTicket: !!l.membersOnly, memberClub: typeof l.memberClub === "string" ? l.memberClub : "", moreOpen: false,
    dlv: { method: l.method || "", file: null, fileErr: "" } } } });
  const closedWords = n => `${plural(n, u)} ${n === 1 ? "is" : "are"} back with you.`;
  // Where new reservations on it are paid: live, a listing's own handle (posted before Batch 1) only while its seller has no saved methods,
  // which reservations copy first (W1 fix, OBS-1); the preview keeps its sample handles.
  const paidTo = LIVE ? listingPaidTo(l, s.viewer && s.viewer.payMethods) : l.payHandle;
  // The panel's parts, named, so its two layouts put them in their own order. §9q items 1 to 3 (live), an ordinary ticket (simple): the
  // short panel leads with the event and one status line in place of the row of counters (listingStatus), then the cards that wait for
  // the seller (needsSeller: what My activity lists as needing them), then Edit and Close (§9v item 3: no Share; a fresh listing's Done
  // first), the other cards, and the history,
  // collapsed. A routine delivery names no method and explains nothing here (routineTransfer); a specific one keeps its label.
  // Everything else (a train, a trek, an add-on, the preview) keeps the panel it had.
  const dim = ["withdrawn", "transferred", "closed"].includes(stl.key) ? { background: "var(--surface-2)" } : null;
  const needIds = simple ? needsSeller(s, me, l) : [];
  const sorted = [...reqs].sort((a, b) => FINAL.includes(rState(a).st) - FINAL.includes(rState(b).st) || (baseSt(rState(a)) === "pending" && baseSt(rState(b)) === "pending" ? reqPrice(b, l) - reqPrice(a, l) : 0));
  const cardOf = r => <HandoffCard key={r.id} r={r} role="seller" s={s} dispatch={dispatch} go={go} saveProfile={saveProfile} flash={flash} />;
  // The development preview's Share listing. The shared market has none (§9v item 3, SELL5-M1): a listing's ordinary URL is its link.
  const shareBtn = !LIVE && stl.key === "available"
    && <button className="btn btn-sm" onClick={() => openShare({ type: "listing", id: l.id })}><Icon name="share" size={14} />Share listing</button>;
  // §9v item 3 (live): a listing Post ticket just made leads its actions with Done, the one prominent next action (back to browsing). A
  // buyer who waits for the seller (needIds) would come first, and then there's no Done.
  const doneBtn = simple && fresh && !!onDone && needIds.length === 0 && <button type="button" id={idp + "-done"} className="btn btn-sm btn-primary lp-done" onClick={onDone}>Done</button>;
  const pausedNote = paused && <div className="callout warn" style={{ marginTop: 10 }}><b>Paused.</b> {nfOn ? "Classmates can't ask to buy it or reserve it until you resume it." : "Classmates can't reserve it or make offers until you resume it."}{nb.reserved ? " Reservations already made continue." : ""}{asks.length ? ` ${asksStay(asks.length)}, but you can't invite and buyers can't reserve until you resume it.` : ""}{offers.length ? ` ${offers.length === 1 ? "The open offer stays" : `The ${offers.length} open offers stay`} open until ${offers.length === 1 ? "its deadline" : "their deadlines"}, but you can't accept or counter ${offers.length === 1 ? "it" : "them"} until you resume it.` : ""}</div>;
  const closedNote = own && l.withdrawnAt && <div className="callout close-done" style={{ marginTop: 10 }} data-closed={l.id}>
        <p id={idp + "-closed"} tabIndex={-1} style={{ margin: 0 }}><b>{closedLine(l)}.</b>{back > 0 ? ` ${closedWords(back)}` : ""}{nb.reserved ? " Reservations already made continue; if one ends unpaid, it comes back to you." : ""}</p>
        {again && <div className="actions" style={{ marginTop: 8 }}><button type="button" id={idp + "-again"} className="btn btn-sm" onClick={listAgain}>List again</button></div>}
      </div>;
  const policyNote = stl.key === "paused" && <div className="callout warn" style={{ marginTop: 10 }}>{access(ev).why} New requests and acceptances are off until the policy changes back.</div>;
  const saleRec = ev.noShowRule && l.record && <div style={{ marginTop: 10 }}><SaleRecord l={l} ev={ev} s={s} /></div>;
  const noBuyers = reqs.length === 0 && stl.key === "available" && <div className="muted" style={{ marginTop: 12, fontSize: 13.5 }}>{isQuick(ev) ? "No buyers yet." : "No requests yet."} {isAddOn(ev, l) ? "Add-ons don't answer requests or alerts; classmates find it on the event page." : "Classmates with a matching request or alert get an in-app alert when a listing is posted."}</div>;
  const sharesList = shares.length > 0 && <div className="shared-list" style={{ marginTop: 10 }}><h4 className="sub-h">Shared with {plural(shares.length, "request")}</h4>
        <ul>{shares.map((x, k) => { const i = s.interests.find(y => y.id === x.isoId); return i && (
          <li key={x.id} className="shared-row"><Avatar id={i.userId} size={24} /><span className="shared-main"><button className="linkish" onClick={() => go("iso", { id: i.id })}><b>{PEOPLE[i.userId].name}</b>'s request</button><span className="muted"> · {plural(i.qty, unitOf(ev))}{i.budget != null ? `, up to ${money(i.budget)}` : ""} · shared {ago(x.createdAt)}{liveRequest(s, i) ? "" : ` · ${i.status === "open" ? "ended" : closedAs(i).toLowerCase()}`}</span></span>
            <button id={"lp-wd-" + x.id} className="btn btn-sm btn-ghost" onClick={() => withdrawShare(x, k)} aria-label={`Withdraw: stop sharing with ${PEOPLE[i.userId].name}'s request`}>Withdraw</button></li>); })}</ul></div>;
  const manageArea = canEdit && manage === "edit" ? <TermsForm idp={idp + "-ed"} x={l} priceKey="ask" title="Edit price and description"
          priceLabel={ev.premium ? "Reimbursement you're asking for" : `Asking price per ${u}`} priceHelp={ev.premium ? `No more than you've paid so far (${money(cap)}).` : Number.isFinite(cap) ? `Up to the face value, ${money(cap)}.` : ""}
          priceMissing={ev.premium ? "Enter the reimbursement you're asking for." : `Enter your asking price per ${u}.`}
          capErr={p => p > cap ? (ev.premium ? `Reimbursement can't be more than you've paid (${money(cap)}).` : `Asking price can't be more than the face value (${money(cap)}).`) : null}
          openErr={p => top && p <= top.amt ? (top.counter ? `You countered an offer at ${money(top.amt)}. Keep the price above ${money(top.amt)} until the buyer answers it.` : `There's an open offer of ${money(top.amt)} on this listing. Keep the price above ${money(top.amt)}, or answer the offer first.`)
            : invTop && p < invTop.price ? (rState(invTop).st === "invited" ? `You've invited ${PEOPLE[invTop.buyerId].first} at ${money(invTop.price)}. Keep the price at ${money(invTop.price)} or more, or withdraw the invitation first.` : `There's an open offer of ${money(invTop.price)} on this listing. Keep the price at ${money(invTop.price)} or more, or answer the request first.`) : null}
          oboOk={!ev.premium} oboHelp={nfOn ? `An offer comes as a request to buy at the buyer's price: you invite them to pay at that price or more, or decline. Requests last ${RULES.offerHours} hours (${RULES.offerHoursSoon} if the event is less than a day away).` : `You accept, counter once or decline each offer. Offers last ${RULES.offerHours} hours (${RULES.offerHoursSoon} if the event is less than a day away), and a full-price “I'll take it” still wins.`}
          noteLabel="Description for buyers (optional)" notePlaceholder="e.g. Can send it today." nothing="Nothing changed: the listing already has that price and description."
          keepNote={nfOn ? "Changes apply from now on: reservations, invitations and offers already made keep their prices. Classmates see the new terms on the listing; no one is notified." : "Changes apply from now on: reservations and offers already made keep their prices. Classmates see the new terms on the listing; no one is notified."}
          onSave={async v => { const r = await dispatch({ type: "editListing", listingId: l.id, ask: v.price, obo: v.obo, ...(v.minOffer !== undefined ? { minOffer: v.minOffer } : {}), ...(v.note !== undefined ? { note: v.note } : {}) }, true); if (!r.error && r.toast && flash) flash(r.toast); return r; }}
          place={{ name: "activity", open: tag }} tag={tag} draft={kept}
          onClose={() => { setKept(null); setManage(null); focusSoon(idp + "-edit"); }} />
        : manage === "pause" && canPause ? <div style={{ marginTop: 12 }}><Confirm text={!offers.length && asks.length ? `Pause this listing? Classmates can't ask to buy it or reserve it until you resume it. ${asksStay(asks.length)}, but you can't invite and buyers can't reserve meanwhile, and ${asks.length === 1 ? "its buyer is" : "their buyers are"} told.`
            : `Pause this listing? Classmates can't reserve it or make offers until you resume it. ${offers.length === 1 ? "The open offer stays" : `The ${offers.length} open offers stay`} open until ${offers.length === 1 ? "its deadline" : "their deadlines"}, but you can't accept or counter ${offers.length === 1 ? "it" : "them"} meanwhile, and ${offers.length === 1 ? "its buyer is" : "their buyers are"} told.${asks.length ? ` ${asksStay(asks.length)} too.` : ""}`}
          label="Yes, pause" onYes={() => pauseOrResume("pauseListing")} onNo={() => setManage(null)} returnTo={pauseBtn} /></div>
        : !l.withdrawnAt && (ask
        ? <div style={{ marginTop: 12 }}>{canClose
            ? <CloseStep idp={idp} what="listing" onClose={closeIt} onKeep={() => setAsk(false)} returnTo={opener}
                text={simple ? closeText({ left: Math.max(0, l.listed - nb.reserved - nb.completed), unit: u, requests: asks.filter(r => rState(r).st === "requested").length, invitations: asks.filter(r => rState(r).st === "invited").length, offers: Math.max(0, pendingN - asks.length), reserved: nb.reserved })
                  : `Close this listing? ${(left => left ? `${plural(left, u)} ${left === 1 ? "comes" : "come"} back to you, and classmates can't ${nfOn ? `ask to buy ${left === 1 ? "it" : "them"}` : `reserve ${left === 1 ? "it" : "them"} or make offers`}.` : nfOn ? "Classmates can't ask to buy it any more." : "Classmates can't reserve it or make offers any more.")(Math.max(0, l.listed - nb.reserved - nb.completed))}${pendingN - asks.length > 0 ? ` ${pendingN - asks.length === 1 ? "The open offer is" : `The ${pendingN - asks.length} open offers are`} declined.` : ""}${asks.length ? ` ${asks.length === 1 ? "The open request or invitation is closed, and its buyer is" : `The ${asks.length} open requests and invitations are closed, and their buyers are`} told.` : ""}${nb.reserved ? " Reservations already made continue; if one ends unpaid, it comes back to you." : ""}`} />
            : <Confirm text={`Withdraw this listing? ${pendingN ? `${plural(pendingN, isQuick(ev) ? "open offer" : "open request")} without a hold will be declined${backupsN ? ` (${backupsN === 1 ? "1 is a backup" : `${backupsN} are backups`})` : ""}. ` : ""}${nb.reserved ? "Held matches continue until they finish or you release them." : ""}`} label="Yes, withdraw" onYes={() => { dispatch({ type: "withdraw", listingId: l.id }); setAsk(false); }} onNo={() => setAsk(false)} returnTo={opener} />}</div>
        : <div className="actions" style={{ marginTop: 12 }}>
            {doneBtn}
            {canEdit && <button id={idp + "-edit"} className="btn btn-sm" onClick={() => { setSaid(""); setManage("edit"); }}>Edit listing</button>}
            {paused ? <button id={idp + "-resume"} className="btn btn-sm" onClick={() => pauseOrResume("resumeListing")}>Resume listing</button>
              : canPause && <button ref={pauseBtn} id={idp + "-pause"} className="btn btn-sm" onClick={() => { setSaid(""); if (offers.length || asks.length) setManage("pause"); else pauseOrResume("pauseListing"); }}>Pause listing</button>}
            {!simple && shareBtn}{/* the development preview only (§9v item 3) */}
            {canClose ? <button ref={opener} id={idp + "-close"} className="btn btn-sm btn-ghost btn-danger" onClick={() => { setSaid(""); setAsk(true); }}>Close listing</button>
              : !own && (nb.available > 0 || offSale > 0) && <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk(true)}>Withdraw listing</button>}
          </div>);
  const saidNote = said && <p id={idp + "-said"} className="err" role="alert" tabIndex={-1} style={{ margin: "10px 0 0" }}>{said}</p>;
  const historyBox = l.history && l.history.length > 0 && <details style={{ marginTop: 10 }}><summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>Listing history</summary><ul className="history">{l.history.map((x, k) => <li key={k}>{fmtMs(x.at)} · {x.text}</li>)}</ul></details>;
  if (simple) {
    const face = faceOf(tierOf(ev, l.tier)), need = r => needIds.includes(r.id);
    // Every card keeps its place among this one list's keyed children, so a card that stops waiting for the seller (invited, confirmed,
    // sent) moves below the buttons as the same card: what's open in it stays open, and focus set after the change lands in it.
    const card = r => <div key={r.id} className={need(r) ? "lp-card lp-need" : "lp-card"} data-needs-you={need(r) ? "" : undefined}>{cardOf(r)}</div>;
    return (
      <div className="panel lp-simple" data-manage={l.id} style={dim}>
        <div className="lhead">
          <h3>{here ? <span ref={titleRef} tabIndex={-1}>Your listing</span> : <button ref={titleRef} className="linkish" onClick={() => go("event", { id: ev.id })}>{ev.title}</button>}</h3>
          {/* The status line says what's available, held, transferred or closed; the chip stays for what it can't say (Paused, a closed transfer window). */}
          {!["available", "reserved", "transferred", "withdrawn"].includes(stl.key) && <span className={"chip tone-" + stl.tone}>{stl.label}</span>}
        </div>
        {fresh && !l.withdrawnAt && <p className="lp-listed" data-listed="" data-listed-note={freshNote ? "" : undefined}><Icon name="check" size={15} /><span>{freshNote || "Ticket listed."}</span></p>}
        <p className="lp-status" data-status-line="">{listingStatus({ listed: l.listed, available: nb.available, reserved: nb.reserved, completed: nb.completed, paused: offSale, closed: !!l.withdrawnAt, ask: l.ask, unit: u })}</p>
        <div className="muted lp-meta">{here ? "Listed " : `${fmtRange(ev)} · listed `}{ago(l.createdAt)}{face != null ? ` · face value ${money(face)}` : ""}{!routineTransfer(ev, l) && methodOf(l) ? ` · ${METHODS[l.method].label}` : ""}{paidTo ? ` · paid to ${paidTo}` : ""}{l.obo ? " · OBO" : ""}</div>
        {pausedNote}
        {closedNote}
        {[
          needIds.length > 0 && <h4 key="needs-h" className="sub-h lp-needs-h">Needs your response</h4>,
          ...sorted.filter(need).map(card),
          <React.Fragment key="manage">{manageArea}{saidNote}{noBuyers}{sharesList}</React.Fragment>,
          ...sorted.filter(r => !need(r)).map(card),
        ]}
        {historyBox}
      </div>
    );
  }
  return (
    <div className="panel" data-manage={LIVE ? l.id : undefined} style={dim}>
      <div className="lhead">
        <h3><button ref={titleRef} className="linkish" onClick={() => go("event", { id: ev.id })}>{ev.title}</button></h3>
        <span className={"chip tone-" + stl.tone}>{stl.label}</span>
      </div>
      {/* Sell and Request follow-up (live). §9n: a multi-ticket listing reads "2 tickets · $25 each" (qtyLine; one ticket reads as
          before). §9m item 1: a listing with no recorded transfer method names none here (the engine's methodOf), and its seller reads
          the neutral rule under it; a recorded one shows as before. The preview's listings always have one. */}
      <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{fmtRange(ev)} · {LIVE && !ev.premium && l.listed > 1 ? <span data-qty-line="">{qtyLine(l.listed, l.ask, isAddOn(ev, l) ? "add-on" : u)}</span> : <>{money(l.ask)}{ev.premium || LIVE ? "" : " each"}</>}{ev.premium ? " reimbursement" : LIVE ? (f => f != null ? `${l.listed > 1 ? "" : " each"} (face value ${money(f)})` : l.listed > 1 ? "" : " each")(faceOf(tierOf(ev, l.tier))) : ` (original price ${money(l.paid)})`} · listed {ago(l.createdAt)}{(lbl => lbl ? ` · ${lbl}` : "")(isQuick(ev) ? (methodOf(l) ? METHODS[l.method].label : LIVE ? "" : METHODS.file.label) : (l.viaOrganizer ? orgLabel(ev) : DIRECT_LABEL).toLowerCase())}{paidTo ? ` · paid to ${paidTo}` : ""}{l.obo ? " · OBO" : ""}{l.isoReplyFor ? " · held for one request" : ""}{isAddOn(ev, l) ? " · add-on" : ""}{l.departsAt ? ` · train departs ${fmtWhen(l.departsAt)}` : ""}</div>
      {LIVE && own && isQuick(ev) && !l.withdrawnAt && transferWords(l, "seller") && <p className="muted transfer-rule" data-transfer-rule="" style={{ fontSize: 13.5, margin: "4px 0 0" }}>{transferWords(l, "seller")}</p>}
      <div className="chips" style={{ marginTop: 8 }}>
        <span className="chip">{l.listed} listed</span><span className="chip tone-good">{nb.available} available</span>{offSale > 0 && <span className="chip tone-warn">{offSale} paused</span>}<span className="chip tone-warn">{nb.reserved} held</span><span className="chip">{nb.completed} transferred</span>
      </div>
      {pausedNote}
      {closedNote}
      {policyNote}
      {saleRec}
      {noBuyers}
      {sharesList}
      {sorted.map(cardOf)}
      {manageArea}
      {saidNote}
      {historyBox}
    </div>
  );
}
