// The development preview's own pages and dialogs (moved unchanged from HandoffPrototype.jsx). App renders them only off the live
// route, and gets them through the preview's kit (its preview prop, built in _preview/HandoffPreview.jsx), so the live route's chunk
// carries none of them: the first-visit welcome (WelcomeSheet), the sample account's profile (ProfilePage), Help with About this
// preview (HowPage, HOW_FAQ), the project brief (ReviewerPage), the rule self-tests (SelfTestPage), the organizer preview (ClubsPage),
// the feedback form and its results (FeedbackModal and ResultsPage, with FB, SCORE_LBL, lbl, EMPTY_FB and Choice), and the feedback
// runtime they read (useRuntime). Imports: ui and requests, the engine, and the rule self-tests (runSelfTests) from the preview's
// fixtures. Nothing here reads LIVE or GUEST, and nothing imports HandoffPrototype.jsx.
import React, { useState, useEffect, useRef } from "react";
import {
  BRAND, RULES, TAKE_HOLD, OFFER_HOLD, CLOCK, PEOPLE, POLICY, EVENTS, EV, CLUBS, fmtDay, fmtDate, fmtMs, fmtRange, money, plural, SRC,
  tierOf, isAddOn, hasMemberTiers, canAcquire, rState, reserves, baseSt, strikesOf, holdingFree, isExpired, isMissingIso, selfReported,
  demandFor, unitOf, eventSummary, RSTATUS, NY_TZ
} from "@penntools/tool-handoff/engine";
import { runSelfTests } from "@penntools/tool-handoff/preview";
import { Icon, Avatar, StateBadge, useDialog, onRadioKeys, rov, copyText } from "../_components/ui";
import { REVIEW, AlertOptIn } from "../_components/requests";

/* The imported prototype has no shared feedback service in PennTools.
   FeedbackModal uses its copy-answers fallback without transmitting responses. */
export function useRuntime() {
  return { ready: true, db: null, uid: null, canResults: false };
}

export function WelcomeSheet({ onClose, me }) {
  const dref = useRef(null); useDialog(dref, onClose);
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" ref={dref} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <h2 id="welcome-title">Welcome to the Handoff demo</h2>
        <div className="form-stack" style={{ marginTop: 12 }}>
          <p style={{ fontSize: 15 }}>Classmates pass on tickets they can't use, and sell secondhand stuff, at fair prices.</p>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, fontSize: 14 }}>
            <li>The listings and people are made up, and what you do stays in this browser.</li>
            <li>You're {PEOPLE[me].first}, a sample account. Switch to {PEOPLE[me === "u_priya" ? "u_jordan" : "u_priya"].first} from the top-right menu to try the other side.</li>
          </ul>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => onClose()}>Got it</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfilePage({ s, me, go, switchTo, dispatch }) {
  const p = PEOPLE[me];
  const held = s.holdings.filter(h => h.userId === me && h.qty > 0);
  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      <div className="page-head" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Avatar id={me} size={56} />
        <div style={{ minWidth: 0 }}><h1>{p.name}</h1><div className="muted">{p.tag} · {p.role.toLowerCase()}</div></div>
        <span className="spacer" />
        <button className="btn" onClick={() => switchTo(me === "u_priya" ? "u_jordan" : "u_priya")}><Icon name="users" size={16} />Use {PEOPLE[me === "u_priya" ? "u_jordan" : "u_priya"].first}'s account</button>
      </div>
      <p className="chip tone-warn" style={{ margin: "0 0 10px", justifySelf: "start" }}><Icon name="alert" size={13} />Identity, memberships and holdings are simulated, not verified.</p>
      <div className="cards2">
        {[["School identity", p.school, "A pilot would use school sign-in."], ["Student status", p.status, "Separate from identity: partners and alumni may differ."], ["Club memberships", p.memberships.join(", ") || "None", "Decide which members-only trips you can join. For members-only student tickets, you confirm membership yourself (not checked)."], ["Venmo or PayPal", p.pay || "None", "Shown to a buyer once they reserve your ticket."], ["Upheld reports", `${strikesOf(s, me)} of ${RULES.strikesToPause}`, `${RULES.strikesToPause} upheld reports pause trading (demo rule).`]].map(([k, v, d]) => (
          <div className="panel" key={k} style={{ display: "grid", gap: 6 }}><div className="eyebrow">{k}</div><b>{v}</b><span className="muted" style={{ fontSize: 13 }}>{d}</span></div>
        ))}
      </div>
      <div className="panel" style={{ display: "grid", gap: 10, marginTop: 14 }}><AlertOptIn s={s} me={me} dispatch={dispatch} idp="pf-al" /></div>
      <div className="panel" style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <h3 style={{ fontSize: 18 }}>Tickets and spots you hold</h3>
        {held.length === 0 ? <p className="muted">None.</p> : held.map(h => { const ev = EV[h.eventId]; const t = h.tier ? tierOf(ev, h.tier) : null; return (
          <div key={h.id} className="lhead" style={{ alignItems: "center" }}>
            <button className="linkish" onClick={() => go("event", { id: ev.id })}><b>{ev.title}</b> <span className="muted">· {plural(h.qty, t && t.addOn ? "add-on" : unitOf(ev))}{t && ev.tiers.length > 1 && (t.addOn || !hasMemberTiers(ev)) ? ` · ${t.label}` : ""} · {holdingFree(s, h)} unlisted</span></button>
            <span className="chip">{SRC[h.source]}</span>
          </div>); })}
        <p className="muted" style={{ fontSize: 13 }}>In a pilot, proof of a ticket would come from the ticketing app or the organizer, not from what students claim.</p>
      </div>
    </div>
  );
}

/* ============================================================
   HOW IT WORKS (student-facing)
   ============================================================ */
/* Student FAQ, in the order a newcomer asks. Answers lead with the direct answer; prototype caveats only where the real product would differ. */
const HOW_FAQ = [
  ["The basics", [
    ["What is Handoff?", "A place for Wharton students to pass on tickets they can't use (club events, treks, trains, concerts and games) at no more than they paid, and to find ones they want. Every ticket for an event is in one list, and you get an alert when something you're looking for is listed. Goods does the same for secondhand stuff like move-out furniture."],
    ["How is it different from the WhatsApp group?", "Same students, less scrolling: one list per event, requests that sellers can answer with a listing that fits, prices capped at what the seller paid, and a clear next step for both of you until it's done. You can share any listing back into a group chat in one tap."],
  ]],
  ["Getting a ticket", [
    ["Get notified or post a request: what's the difference?", "Get notified is private. On an event page, say how many you want and, if you like, the most you'd pay; you get an in-app alert when a matching listing appears. Nobody else sees it or your price, and it doesn't count as demand. Post a request is public: classmates see your name, what you need, how many, your budget and your deadline, and anyone who has one can tap “I have this” to share a listing that fits or list one for you. Neither holds a ticket, and neither is a queue: when something's listed, everyone it matches hears at once, and the first to tap “I'll take it” gets the ticket. You can edit, pause or remove an alert, and edit, mark fulfilled or cancel a request, in My activity."],
    ["What do ISO and OBO mean?", `ISO is group-chat shorthand for “in search of”: on Handoff that's a request (Post a request). OBO is “or best offer”: the seller takes offers below their price and can accept, counter once or decline. Offers last ${RULES.offerHours} hours (${RULES.offerHoursSoon} within a day of the event).`],
    ["What does “Members only” mean?", "The ticket is for that club's members. Before you reserve or offer, you confirm you're a member. Handoff doesn't check, but the club can: non-members can be turned away at the door, even with a ticket."],
  ]],
  ["Selling", [
    ["How do I sell a ticket I can't use?", "Tap Sell, pick the event, set a price up to what you paid, choose how you'll transfer it and add your Venmo or PayPal. Classmates with a matching request or alert hear right away, and on a request you can tap “I have this” to share your listing with them. When someone reserves it, they pay you and tap “Paid”; you tap “Payment received” and transfer it. For a PDF or QR code, Handoff sends the file for you."],
    ["How much can I charge?", "Up to what you paid, and never more than face value for that ticket type. You can ask less or take offers. Goods have no cap: the seller sets the price."],
    ["Do I need the club's OK?", "Only if names are checked at entry: then it moves by a name change, and Handoff drafts the email you send the club. Club trips and treks always go through the organizer. Each event shows a tag, and you can flag a transfer restriction under Additional details when you sell."],
  ]],
  ["Payment and safety", [
    ["How do I pay or get paid?", "The buyer pays the seller before the transfer, on Venmo or PayPal, and taps “Paid”. Handoff never holds the money. Goods are paid at pickup."],
    ["What if something goes wrong?", `Once you've paid, tap “There's a problem” (open until the event ends, including “Turned away at the door”). Handoff reviews reports: an upheld report gives the other person a strike, and ${RULES.strikesToPause} pause their account.`],
    ["Who sees my contact details?", "When a ticket is reserved, you and the seller see each other's email, so it can be transferred. Nobody else does. Goods pickups are a neighborhood, never an address. Meet somewhere public and check the item before you pay."],
    ["Does it cost anything?", "Handoff charges no fees. Some club trips charge their own name-change fee, and the event page shows it."],
  ]],
  ["Goods", [
    ["How does Goods work?", `The same idea for secondhand stuff. The seller sets a price (some take offers), a pickup area and a pickup-by date. When they accept, it's held for you for ${RULES.goodsHoldHours} hours while you agree a pickup time; then you pick it up, pay, and tap "I've picked it up".`],
  ]],
];/* Help: about this preview (sample data, the sample account, what's simulated, the reviewer pages), then the FAQ. */
export function HowPage({ go, me, openFeedback }) {
  const other = PEOPLE[me === "u_priya" ? "u_jordan" : "u_priya"];
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div className="eyebrow">Help</div>
        <h1 style={{ marginTop: 6 }}>How Handoff works</h1>
      </div>
      <section className="panel" aria-labelledby="about-preview" style={{ display: "grid", gap: 10, marginBottom: 22, maxWidth: "75ch", fontSize: 14.5 }}>
        <h2 id="about-preview" style={{ fontSize: 18 }}>About this preview</h2>
        <p>This local preview uses sample people, listings and activity. Your changes are saved only in this browser.</p>
        <p>You're browsing as {PEOPLE[me].name}, a sample account. It isn't signed in or tied to anyone's real identity, tickets or club memberships, and Handoff doesn't verify its sample memberships. To try the other side, switch to {other.first} from the profile menu, top right.</p>
        <p>Payments, ticket delivery and organizer actions are simulated, and labeled where they appear. No money moves and nothing is sent.</p>
        <div className="actions">
          <button className="btn btn-sm" onClick={() => go("reviewers")}><Icon name="info" size={14} />Project brief</button>
          <button className="btn btn-sm" onClick={() => go("clubs")}><Icon name="shield" size={14} />Organizer preview</button>
          <button className="btn btn-sm" onClick={openFeedback}><Icon name="chat" size={14} />Give feedback</button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>{BRAND} is an independent student prototype, not affiliated with or endorsed by the University of Pennsylvania, the Wharton School, CampusGroups or any club.</p>
      </section>
      <div className="steps3">
        <div className="step-card"><span className="n">1</span><h3>Find it or list it</h3><p>Tap “I'll take it” or make an offer. Nothing listed? Get notified, or post a request with your budget. Can't go? List yours for up to what you paid.</p></div>
        <div className="step-card"><span className="n">2</span><h3>Reserve and pay</h3><p>It's held for you for {TAKE_HOLD} ({OFFER_HOLD} if the seller accepts your offer). Pay the seller right away and tap “Paid”.</p></div>
        <div className="step-card"><span className="n">3</span><h3>Transfer, then received</h3><p>The seller confirms the payment and transfers it. You tap “Received”.</p></div>
      </div>
      {HOW_FAQ.map(([group, items]) => (
        <section className="sec" key={group}>
          <h2 style={{ marginBottom: 8 }}>{group}</h2>
          {items.map(([q, a]) => (
            <details className="xsec" key={q}><summary><span><b>{q}</b></span></summary><div className="xsec-body"><p style={{ fontSize: 14.5 }}>{a}</p></div></details>
          ))}
        </section>
      ))}
      <div className="actions" style={{ marginTop: 18 }}><button className="btn btn-primary" onClick={() => go("explore", { browse: "all" })}>Browse tickets<Icon name="arrow" size={16} /></button><button className="btn" onClick={() => go("goods")}>Browse goods<Icon name="arrow" size={16} /></button><button className="btn" onClick={() => go("post")}><Icon name="hand" size={16} />Post a request</button></div>
      {/* The one quiet community line, as on the normal route's Help (its independence note is in About this preview, above). */}
      <p className="muted help-foot">Built for Wharton classmates.</p>
    </div>
  );
}

/* ============================================================
   FOR REVIEWERS: project brief, demo route, limits, admin queue
   ============================================================ */
export function ReviewerPage({ s, me, go, dispatch, switchTo, openFeedback, resetDemo }) {
  const missing = s.interests.filter(i => isMissingIso(i) && i.status === "open");
  const suggested = s.suggestions || [];
  const brief = [
    ["Problem and first users", <p>Popular club events and trips sell out, plans change, and tickets change hands in WhatsApp groups with no check on price, no sign of which tickets are members-only, and no clear record of who has the spot. First users: Wharton MBA students who want or can't use a ticket.</p>],
    ["What Handoff helps them do", <p>Find a ticket and hold it with “I'll take it” (15 minutes to pay), or make an offer the seller can accept, counter once or decline. Members-only tickets are labeled, and buyers confirm they're members (Handoff doesn't check). The buyer pays the seller first (Venmo or PayPal); the seller confirms and transfers it by its method (Handoff delivers PDF and QR files; names checked at entry mean a name change), and the buyer confirms receipt. When nothing's listed, buyers get notified (a private alert with an optional private max) or post a public request with a budget and a deadline; sellers answer “I have this” by sharing a listing that fits, listing one for them, or holding one at their budget. Club trips and operator-run treks keep an organizer approval step. Handoff never holds money. Goods, an option under Available, demos move-out sales.</p>],
    ["What works and what's simulated", <ul><li><b>Works, in this browser:</b> listings with a transfer method, “I'll take it” reservations, offers with one counter, private alerts and public requests, “I have this” (shared listings and held replies), pay-first handoffs (Paid, Payment received, delivered, Received), ticket files fingerprinted so they can't be listed twice, goods pickups with a 48-hour hold, a "Needs your attention" list and "There's a problem" reports with strikes, with rule checks for counts, price limits, policies and deadlines, plus eligibility for trips and treks; members-only tickets rely on the buyer's confirmation.</li><li><b>Simulated:</b> accounts and memberships, payments (self-reported), file delivery and email, the Handoff review, the trips' organizer step, notifications, event details and policies. No money moves.</li><li><b>Not shared:</b> activity stays in each viewer's browser. Sharing the link shares the demo, not anyone's listings.</li></ul>],
    ["Smallest real pilot", <p>A few popular, sold-out events, with students who already post offers and “ISO” requests in group chats. It needs school sign-in, a shared database that enforces these rules, and email alerts. Organizers would only need to be involved for events that check names.</p>],
    ["Main open dependencies", <ul><li>Whether students will use it instead of the group chat</li><li>Whether Goods belongs in the same product, or tickets alone come first</li><li>Payment: buyers now pay first (the founders' tracker) on Venmo or PayPal; whether to hold payment through Handoff later (see the roadmap below)</li><li>Each event's real transfer and ticket-tier rules</li><li>Payment stays outside Handoff, so Handoff can't refund anyone</li><li>Student-government guidance on resale</li><li>Train tickets: Amtrak's terms say its tickets aren't transferable. Decide whether Handoff should carry them</li></ul>],
    ["Next milestone", <p>Test with students on a few sold-out events, agree a pilot scope, and build the shared version.</p>],
  ];
  const buyer = PEOPLE.u_priya.first; // the default sample account
  const live = [
    ["Reserve and pay", `As ${buyer}, tap “I'll take it” on Dana's concert ticket: it's held for 15 minutes. Tap “Paid”, use the dashed controls to simulate Dana confirming the payment and transferring it, then tap “Received”.`, "u_priya", () => go("event", { id: "e_concert" })],
    ["Confirm a payment", "As Jordan, Chris says he paid $60 for your Africa Business Forum pass. Tap “Payment received”, copy the pre-written email to the club, then tap “I've emailed the club”.", "u_jordan", () => go("activity", { tab: "todo" })],
    ["Offer and counter", "As Jordan, Sam offered $90 for your $100 Vets Gala ticket. Counter once (say $95), then simulate Sam accepting and paying.", "u_jordan", () => go("activity", { tab: "todo" })],
    ["Answer a request", "As Jordan, open Sam's request for the Wine Club tasting. Under “I have this”, choose “Or hold one for them at their budget”: it goes to Sam at his $35 budget, held for his answer. (Or create a listing for his request: it's shared with him.)", "u_jordan", () => go("iso", { id: "iso-sam1" })],
  ];
  const route = [
    ["A held reply waiting for you", `As ${buyer}, Leah is holding a WGA Winter Ball ticket for your request, at your $40 budget. Accept it and pay; Handoff delivers the QR code once Leah confirms (simulated).`, "u_priya", () => go("activity", { tab: "todo" })],
    ["A full-price take beats offers", `As ${buyer}, make an offer on Nia's Flyers seat. Then, as Jordan, tap “I'll take it” on the same seat: ${buyer}'s offer is declined automatically.`, "u_priya", () => go("event", { id: "e_flyers" })],
    ["Unpaid reservations go back on sale", "Reserve a ticket, then use “+15 min” on the demo clock (account menu): the hold ends and the ticket is live again.", "u_priya", () => go("event", { id: "e_concert" })],
    ["Something goes wrong", "On a reserved or paid match, tap “There's a problem” (buyers can pick “Turned away at the door”). The dashed review controls simulate Handoff upholding it: an upheld report is a strike, and two pause the account.", "u_jordan", () => go("activity", { tab: "todo" })],
    ["Trip swap (organizer step always on)", `As ${buyer}, request Jordan's Euro Ski Trip spot. As Jordan, accept it, tap "I've sent it to the organizer", then use the dashed organizer controls on the request (or the Organizer preview, under Ski & Snowboard Club).`, "u_priya", () => go("event", { id: "e_euro" })],
    ["Get notified or post a request", "Search \"formal\": with no results, post a request prefilled with the search. On an event with nothing listed (try WGA Winter Ball), “Get notified” saves a private alert with your own max instead. Neither holds anything.", "u_priya", () => go("explore", { browse: "all", q: "formal" })],
    ["A trek with an operator", "Colombia Trek: Alex lists a standard spot and Chris the coffee-region extension, both open to offers. Treks run by an outside operator always include the operator step, because the operator updates the traveler list.", "u_priya", () => go("event", { id: "e_colombia" })],
    ["A fictional buyer on Goods", "As Jordan, Leah's $35 offer on your office chair is waiting. Accept it, then use the dashed control to simulate Leah confirming pickup. The item is marked sold and other open requests close.", "u_jordan", () => go("item", { id: "g6" })],
    ["Train tickets", `Leah is selling an Amtrak eTicket for Thanksgiving week. Reserve it as ${buyer}: Amtrak's rule (tickets aren't transferable) shows as the buyer's risk, and the eTicket PDF is delivered once Leah confirms payment. NJ TRANSIT paper one-ways are handed over in person.`, "u_priya", () => go("event", { id: "e_amtrak" })],
  ];  const rows = [
    ["Rules: inventory, trip eligibility, price caps, policy, request lifecycle", "Working, in this browser (self-tested)", "Same rules enforced server-side"],
    ["Offers, reservations, public requests, private alerts", "Working, saved in this browser only. Another person's copy doesn't see them.", "Shared database"],
    ["Offers below the asking price (OBO)", "Seller opts in, with an optional lowest offer. Tickets: offers last 6 hours (1 hour within a day of the event); the seller accepts, counters once or declines, and a full-price “I'll take it” wins. Goods: one round. Never above the asking price; not for club trips paid in installments.", "Same; check the windows work with real notifications"],
    ["Goods (second use case)", "Post, request or offer, hold, set a pickup time, confirm pickup; item requests alert on category, a similar name and budget. Items and sellers are fictional.", "Decide whether Goods ships with tickets; add reporting and prohibited-item rules"],
    ["Pay-first handoffs", "“I'll take it” holds a ticket 15 minutes (2 hours when the seller accepts an offer); the buyer pays the seller's Venmo or PayPal and taps “Paid”; the seller taps “Payment received” and transfers it (file, app transfer, name change or in person); the buyer taps “Received”. Fictional accounts' steps can be simulated (labeled).", "Same, with real accounts and pay links; later, payment held by Handoff"],
    ["Identity, student status, memberships", "Simulated demo accounts; buyers confirm their own membership for members-only student tickets (not checked)", "School sign-in; club rosters"],
    ["Ownership of spots", "Demo holdings or self-reported; never verified", "Proof from the ticketing app, or the organizer's list where names are checked"],
    ["Organizer step", "Club trips and operator-run treks only: approval and confirmation are simulated with dashed controls. Other tickets with names checked at entry move by a name change the seller requests (Handoff drafts the email).", "Organizer confirmation where clubs agree to it"],
    ["Ticket files (PDF or QR)", "Fingerprinted in the browser so the same file can't be listed twice; hidden until the seller confirms payment, then delivered (simulated). The demo keeps only the name and fingerprint.", "Encrypted storage; delivery in the app and by email"],
    ["Train tickets", "Amtrak eTickets and NJ TRANSIT paper one-ways listable, direct only, with each operator's rules shown as the buyer's risk", "Decide whether to carry Amtrak at all (its terms say tickets aren't transferable); re-check rules before launch"],
    ["Notifications", "In-app bell, plus opt-in email or text (simulated: nothing is sent)", "Real email and text delivery"],
    ["Deadlines", "Demo clock plus illustrative rules: 15-minute reservations (2 hours when the seller accepts an offer), 6-hour offers (1 hour within a day of the event); 48h / 72h for trips", "Rules agreed with each organizer"],
    ["Event data, prices, policies", "Real clubs; illustrative dates, demo prices and policies, public sources linked", "Organizer-entered and confirmed"],
    ["Share links", "Copy text or open WhatsApp; the link needs access to this prototype and opens the shared demo. Things you created link to their event page instead.", "Public preview pages"],
    ["Contact sharing", "Shared when a ticket is reserved (the seller needs the buyer's email to transfer it). Trips: both people must agree; fictional accounts agree automatically (labeled).", "Same"],
    ["Editing vs sharing vs a live marketplace", "Editing the source, sharing this conversation and sharing the link are different things. None of them syncs activity between people.", "A shared database and sign-in"],
    ["Payments", "None held. The buyer pays the seller's Venmo or PayPal before the transfer and taps “Paid”; the seller confirms.", "Pay links first; later, checkout through Handoff with the money held until after the event (see roadmap)"],
    ["Problems", "\"There's a problem\" until the event ends (incl. \"Turned away at the door\"); a simulated Handoff review can uphold it: a strike, and two pause the account.", "A named reviewer, evidence and an appeal path"],
    ["Goods pictures", "Drawn demo images for the sample items; sellers can add up to 4 real photos (the first is the cover), resized and kept in their browser", "Photo upload to shared storage"],
    ["Tester feedback", "Manual copy only in PennTools; answers are not saved or sent automatically", "Same, plus pilot usage data"],
  ];
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div className="eyebrow">For reviewers, partners and PWIF</div>
        <h1 style={{ marginTop: 6 }}>Project brief</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: "70ch" }}>{BRAND} helps students find a ticket for a Wharton club event, or pass on one they can no longer use, at no more than they paid. The scope is tickets: club events first. For trains, the demo lists Amtrak eTickets, which students already pass on in group chats, even though Amtrak's terms say they aren't transferable (shown as the buyer's risk), and NJ TRANSIT paper one-ways, where we found no rule either way. Most tickets follow a pay-first flow: “I'll take it” or an offer, the buyer pays the seller, the seller transfers it (a file, an app transfer, a name change or in person) and the buyer confirms. Trips and operator-run treks always go through the organizer. Sellers can take offers below their price (OBO), with one counter. Goods, an option under Available, demos the second thing students trade in the same chats, secondhand items, and requests for tickets and goods share one board, Wanted. The aim is easier discovery and coordination than today's group chats. Demand, willingness to pay and differentiation aren't proven yet. It's a student prototype: no club has signed up.</p>
      </div>

      <section className="sec brief" aria-label="Brief">
        {brief.map(([h, body]) => <div className="panel" key={h}><h3>{h}</h3>{body}</div>)}
      </section>

      <section className="sec">
        <h2>Two kinds of partner</h2>
        <div className="brief">
          <div className="panel"><h3>Club pilot partner</h3>
            <p>A club whose members use {BRAND} for a few of its events. It shares its actual transfer rules and deadlines, and, only for events that check names (and for trips), can confirm swaps in its own system. It tells us what saved effort and what added work.</p>
            <div className="actions"><button className="btn btn-sm" onClick={() => go("clubs")}><Icon name="shield" size={14} />Open the organizer preview</button></div></div>
          <div className="panel"><h3>Project collaborator</h3>
            <p>Someone who helps build and validate the first real pilot. The proposed work:</p>
            <ul><li>Define the pilot scope together: which events and communities</li><li>Build the shared version: school sign-in, a database that enforces these rules, and email alerts</li><li>Test it with students, and measure whether matches end with the buyer confirming they have the ticket</li></ul></div>
        </div>
        <div className="callout" style={{ marginTop: 12 }}><b>To discuss, nothing agreed yet:</b> roles and decision-making, time commitment and availability, ownership or compensation, timeline, and which clubs to approach first. No club or collaborator has committed to anything.</div>
      </section>

      <section className="sec">
        <h2>Live demo in four steps</h2>
        <ol className="route">{live.map(([t, d, who, fn], k) => (
          <li key={t}><span className="k">{k + 1}</span><span><b>{t}</b><br /><span className="muted" style={{ fontSize: 13.5 }}>{d}</span></span><button className="btn btn-sm" onClick={() => { switchTo(who); fn(); }}>Go as {PEOPLE[who].first}</button></li>))}
        </ol>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>About four minutes. Everything here is simulated and saved only in this browser.</p>
      </section>

      <section className="sec">
        <h2>More detail</h2>
        <details className="xsec">
          <summary><span><b>Longer guided scenarios</b><small>Optional: the organizer step, backups, requests and train tickets</small></span></summary>
          <div className="xsec-body">
            <ol className="route" style={{ margin: 0, padding: 0 }}>{route.map(([t, d, who, fn], k) => (
              <li key={t}><span className="k">{k + 1}</span><span><b>{t}</b><br /><span className="muted" style={{ fontSize: 13.5 }}>{d}</span></span><button className="btn btn-sm" onClick={() => { switchTo(who); fn(); }}>Go as {PEOPLE[who].first}</button></li>))}
            </ol>
          </div>
        </details>

        <details className="xsec">
          <summary><span><b>Demo clock and rule checks</b><small>Move time to see expiry; run the rule self-tests</small></span></summary>
          <div className="xsec-body">
            <p>Demo date: <b>{fmtMs(CLOCK)}</b>. It's fixed so deadlines behave the same for every reviewer; move it to see expiry.</p>
            <div className="actions"><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "clock", hours: RULES.holdMinutes / 60 })}>+{RULES.holdMinutes} min</button><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "clock", hours: 2 })}>+2 hours</button><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "clock", hours: 24 })}>+1 day</button><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "clock", hours: 72 })}>+3 days</button><button className="btn btn-sm" onClick={() => dispatch({ type: "clock", reset: true })}>Reset clock</button></div>
            <p style={{ margin: 0, fontSize: 14 }}><b>Tickets</b> (everything except club trips and operator-run treks):</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              <li>“I'll take it”, or the buyer accepting a counter or a held reply, reserves it for {TAKE_HOLD}: they're in the app and can pay right away. When the seller accepts an offer, the buyer gets {OFFER_HOLD}, since they may not see it at once. Unpaid, it goes back on sale (a held reply closes instead). One unpaid reservation per event per buyer.</li>
              <li>Offers, counters and held replies wait {RULES.offerHours} hours for an answer ({RULES.offerHoursSoon} hour if the ticket is used within a day), then expire. Sharing a listing with a request holds nothing.</li>
              <li>A full-price “I'll take it” or an accepted offer declines the other offers the listing can no longer cover. There are no backups.</li>
              <li>After “Paid”, nothing expires on its own. If something goes wrong, either person reports it until the event ends; an upheld “The buyer hasn't paid” puts the ticket back on sale.</li>
            </ul>
            <p style={{ margin: 0, fontSize: 14 }}><b>Club trips and operator-run treks</b> (the organizer step):</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              <li>Sellers have {RULES.sellerResponseHours} hours to answer a request, then {RULES.startOfficialHours} hours after accepting to start the organizer's steps, or the hold lapses.</li>
              <li>Other requests wait as backups while a spot is held, and become active again if the match falls through; none is accepted automatically.</li>
              <li>At the transfer cutoff, requests that hadn't reached the organizer expire; swaps already with the organizer stay open until the event starts.</li>
            </ul>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              <li>Expiry of reservations, offers and requests to buy is saved right away, so rewinding the clock or changing a policy can't revive them. Public requests end on their deadline against the demo clock (rewinding it brings one back); private alerts have no deadline.</li>
              <li>These are illustrative demo rules, not club policy.</li>
            </ul>
            <p className="muted" style={{ fontSize: 13 }}>Reset demo data clears listings, requests and the clock in this browser only. Feedback is not saved here; copied answers remain wherever you chose to keep them.</p>
            <div className="actions"><button className="btn btn-sm" onClick={resetDemo}><Icon name="refresh" size={14} />Reset demo data</button><button className="btn btn-sm" onClick={() => go("selftest")}><Icon name="flask" size={14} />Run rule self-tests</button></div>
          </div>
        </details>

        <details className="xsec">
          <summary><span><b>What works and what's simulated, in full</b><small>Area by area, and what a pilot would need instead</small></span></summary>
          <div className="xsec-body">
            <div className="tbl-wrap"><table className="data">
              <thead><tr><th>Area</th><th>In this prototype</th><th>Needed for a pilot</th></tr></thead>
              <tbody>{rows.map(r => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
            </table></div>
            <p className="scroll-hint" style={{ marginTop: 0 }}>This is a browser-only prototype. A real service must enforce these rules on a server.</p>
          </div>
        </details>

        <details className="xsec">
          <summary><span><b>Evidence to collect, revenue and open questions</b><small>Hypotheses only; nothing has been measured</small></span></summary>
          <div className="xsec-body two-col">
            <div className="panel prose" style={{ fontSize: 14.5 }}>
              <h3>Hypotheses and evidence to collect</h3>
              <ul>
                <li>Students list spots they can't use (listings per event)</li>
                <li>Demand is reached before deadlines (time to first request)</li>
                <li>Matches complete: the buyer confirms they have it (completed ÷ accepted)</li>
                <li>Organizers are comfortable with it, or don't need to be involved (officer interviews)</li>
                <li>Users come back for the next event (repeat use)</li>
                <li>An organization sees enough value to pay (willingness-to-pay interviews)</li>
              </ul>
            </div>
            <div className="panel prose" style={{ fontSize: 14.5 }}>
              <h3>Revenue model: hypotheses only</h3>
              <p>No Handoff fees are planned for a pilot. That isn't a permanent commitment. To investigate: club or student-association subscriptions for cancellation and waitlist tools, and campus licensing. Transaction fees may conflict with face-value rules and aren't assumed.</p>
              <p className="muted">Exchange volume, money recovered by sellers and platform revenue are different numbers. None have been measured.</p>
            </div>
            <div className="panel prose" style={{ fontSize: 14.5 }}>
              <h3>Dependencies and open questions</h3>
              <ul>
                <li><b>Payment vs handoff:</b> buyers pay sellers first, outside Handoff (Venmo or PayPal). Handoff's review can strike an account but can't refund anyone. Unresolved for a real pilot.</li>
                <li>Which events check names at the door, and whether those organizers will update names</li>
                <li>Each club's actual transfer, tier and refund rules</li>
                <li>Student-government guidance on resale</li>
                <li>Train tickets: Amtrak's terms say its tickets aren't transferable, and listing them could matter to reviewers and to Penn; whether NJ TRANSIT paper tickets can be passed on is unconfirmed</li>
              </ul>
              <p className="muted">For PWIF: tie the next phase to the pilot milestone above. Check current award criteria and deadlines on the official site before applying.</p>
            </div>
          </div>
        </details>

        <details className="xsec">
          <summary><span><b>Events not on Handoff: review queue</b><small>Simulated admin: {plural(missing.length, "request")} and {plural(suggested.length, "suggested event")}</small></span></summary>
          <div className="xsec-body">
            <p className="muted" style={{ fontSize: 13.5 }}>Neither creates an event. A reviewer would check the source, then add one shared event record that listings and requests attach to. Links are kept as given and prove nothing about eligibility or availability.</p>
            {missing.length + suggested.length === 0 ? <div className="empty" style={{ padding: 18 }}>Nothing to review.</div> : (
              <div className="stack" style={{ paddingBottom: 0 }}>{[
                ...missing.map(i => ({ id: i.id, kind: "Request", title: i.missing.title, review: i.review || "reviewing", sourceUrl: i.missing.sourceUrl, meta: `${PEOPLE[i.userId].name} · ${plural(i.qty, "ticket")}${i.missing.club ? ` · ${i.missing.club}` : ""} · ${i.missing.flexible || !i.missing.when ? "flexible dates" : fmtDay(i.missing.when)} · ${isExpired(i) ? "expired" : "expires " + fmtDate(i.expires)}` })),
                ...suggested.map(g => ({ id: g.id, kind: "Suggested by someone with a ticket", title: g.title, review: g.review, sourceUrl: g.sourceUrl, meta: `${PEOPLE[g.userId].name}${g.club ? ` · ${g.club}` : ""} · ${g.flexible || !g.when ? "date not given" : fmtDay(g.when)}` })),
              ].map(x => (
                <div className="panel" key={x.id} style={{ display: "grid", gap: 8 }}>
                  <div className="lhead"><span><b>{x.title}</b> <span className="chip">{x.kind}</span></span><span className={"chip tone-" + REVIEW[x.review].tone}>{REVIEW[x.review].label}</span></div>
                  <span className="muted" style={{ fontSize: 13.5 }}>{x.meta}</span>
                  {x.sourceUrl && <span style={{ fontSize: 13.5, overflowWrap: "anywhere" }}>Link given (unchecked): <a href={x.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{x.sourceUrl.replace(/^https?:\/\//, "").slice(0, 70)}</a></span>}
                  <div className="actions">{["onboarding", "duplicate", "unsupported", "reviewing"].map(o => <button key={o} className="btn btn-sm btn-demo" disabled={x.review === o} onClick={() => dispatch({ type: "reviewMissing", id: x.id, outcome: o })}>{REVIEW[o].label}</button>)}</div>
                </div>))}</div>
            )}
          </div>
        </details>

        <details className="xsec">
          <summary><span><b>Comparable products</b><small>Not yet evaluated for usefulness or activity at Wharton</small></span></summary>
          <div className="xsec-body prose" style={{ maxWidth: "none" }}>
            <ul>
              <li><b>Theatr</b> (New York): last-minute ticket resale capped at what the seller paid, with offers and alerts. It screens proof of purchase and holds the buyer's payment, paying the seller after the show. A close model for the price cap. <a href="https://help.theatr-app.com/en/articles/13061246-how-the-marketplace-works" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li><b>Student Seats:</b> student ticket exchange with school-email sign-in; it holds the buyer's payment until the buyer confirms they got the ticket. <a href="https://thecrimsonwhite.com/114791/sports/how-student-seats-is-tackling-ticket-scams/" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li><b>Rumie:</b> a students-only (.edu) campus marketplace for furniture, clothes and student tickets, pitched as easier than GroupMe or Instagram. The closest model for Goods. <a href="https://www.rumieapp.com" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li><b>Tixel:</b> fan-to-fan ticket resale with price caps and waitlists; the cap allows some markup in North America.</li>
              <li><b>Poshmark:</b> buyers make offers below the listed price, and the seller accepts, declines or counters. Handoff's ticket offers work the same way, with one counter, and expire in 6 hours (1 hour within a day of the event).</li>
              <li><b>Facebook Marketplace</b> and class group chats: where move-out goods sell today. Goods would compete with both; whether a classmates-only network is enough of a reason to switch isn't tested.</li>
            </ul>
            <p className="muted">Waitlists, verification and price caps exist elsewhere and aren't claimed as unique here. How much any of these are used by Wharton students hasn't been checked. None of these lead with what they don't do; their limits sit in FAQ answers and policy pages, which is how Handoff now handles them too.</p>
          </div>
        </details>

        <details className="xsec">
          <summary><span><b>Payments and ticket delivery: roadmap</b><small>Research, October 2026. Only the first step is in the demo (simulated).</small></span></summary>
          <div className="xsec-body prose" style={{ maxWidth: "none" }}>
            <ul>
              <li><b>Today (demo and a first pilot):</b> the buyer pays the seller first on Venmo or PayPal and taps “Paid”; the seller confirms and then transfers it. Handoff doesn't hold money. Reports go to a Handoff review (simulated here): upheld reports are strikes, and two pause the account.</li>
              <li><b>Next: checkout through Handoff.</b> A marketplace payment service such as Stripe Connect handles card payments and seller payouts (cards cost about 2.9% + 30¢ each, plus Connect fees). Stripe doesn't offer escrow, but payouts can be held and released later. Tickets would pay out after the event if nobody disputes (Theatr pays about two business days after the show); goods after pickup is confirmed. Handoff would carry refunds and chargebacks. <a href="https://docs.stripe.com/connect/manual-payouts" target="_blank" rel="noopener noreferrer">Stripe</a> · <a href="https://help.theatr-app.com/en/articles/16768132-why-haven-t-i-received-my-payout" target="_blank" rel="noopener noreferrer">Theatr</a></li>
              <li><b>Ticket files (QR or PDF):</b> in the demo, a file is fingerprinted so it can't be listed twice and is shown to the buyer only after the seller confirms payment. A static code can still be copied and used by the seller, so the safest route stays the club or ticketing app moving the name. Rotating barcodes exist for this reason. <a href="https://help.ticketmaster.co.uk/hc/en-us/articles/13756245361297-SafeTix" target="_blank" rel="noopener noreferrer">Ticketmaster</a></li>
              <li><b>Open questions:</b> seller sign-up for payouts (identity checks; international students), events marked "non-transferable", Penn's rules on using its name, and disputes raised after an event.</li>
            </ul>
          </div>
        </details>

        <details className="xsec">
          <summary><span><b>Why not just WhatsApp?</b><small>The case against the status quo, and its main advantage</small></span></summary>
          <div className="xsec-body">
            <div className="tbl-wrap"><table className="data">
              <thead><tr><th>Need</th><th>Club WhatsApp group</th><th>{BRAND}</th></tr></thead>
              <tbody>
                <tr><td>Find tickets for one event</td><td>Scroll back through chat</td><td className="yes">One list per event</td></tr>
                <tr><td>Ask for something sold out</td><td>“ISO” messages get buried</td><td className="yes">Requests with a deadline, and private alerts</td></tr>
                <tr><td>Price fairness</td><td>Anything goes</td><td className="yes">Never above what was paid, per tier</td></tr>
                <tr><td>Who can take it</td><td>Unclear</td><td className="yes">Members-only tickets labeled; buyers confirm membership (not checked). Trips: eligibility checked</td></tr>
                <tr><td>Where a swap stands</td><td>DMs and memory</td><td className="yes">Next step, who acts and deadline</td></tr>
                <tr><td>Already where students are</td><td className="yes">Yes, free and familiar</td><td className="no">Needs adoption (share links help)</td></tr>
              </tbody>
            </table></div>
            <p className="scroll-hint" style={{ marginTop: 0 }}>On a phone, scroll the table sideways.</p>
          </div>
        </details>

        <details className="xsec">
          <summary><span><b>Research findings and sources</b><small>Public pages, October 2026</small></span></summary>
          <div className="xsec-body prose" style={{ maxWidth: "none" }}>
            <p className="muted">Club names and event types are real; listings, people, demo prices and transfer policies here are illustrative.</p>
            <ul>
              <li>Wine Club no-shows lose good standing for the year unless they tried to sell 24+ hours ahead. <a href="https://groups.wharton.upenn.edu/Wine/club_signup" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>Club events price in tiers, e.g. the 2025 Vets Gala at $100 / $120 / $140. <a href="https://groups.wharton.upenn.edu/Veterans/rsvp?id=122452" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>WGA has said its tickets are non-refundable and once pointed resellers to a Facebook group. <a href="https://groups.wharton.upenn.edu/wga/rsvp.aspx?id=100879" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>Personal ticket sales can't be marketed on official MBA listservs. <a href="https://mbastudentlife.wharton.upenn.edu/event-planning/marketing/" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>Ski trips: Euro (Jan 9–16, 130+ people) and US (Feb 3–7, 1,000+); membership required. <a href="https://groups.wharton.upenn.edu/skisnowboard/keydates/" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>Leadership Ventures: $4,000–$4,600 (Antarctica $8,400), ranked placement, own waitlist. <a href="https://leadership.wharton.upenn.edu/mba-leadership-ventures/" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>Amtrak's terms say tickets aren't transferable, and tickets bought from an unauthorized third party are voided with no travel or refund. <a href="https://www.amtrak.com/api/terms-and-conditions.html" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>NJ TRANSIT one-way tickets expire 30 days after purchase and aren't refundable; app tickets are tied to one account and phone. <a href="https://njtransit.com/tickets/train-tickets" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>The 2024 Colombia trek was run by a travel operator and approved by WHALASA; its listing says transfers go only through the operator, up to 30 days before the trip. 2026 terms aren't public. <a href="https://www.wetravel.com/trips/official-wharton-colombia-trek-2024-wonder-travel-36924295" target="_blank" rel="noopener noreferrer">Source</a></li>
              <li>Not found publicly: rules on resale above face value, an official name-change process for club events, ski trip prices, and whether NJ TRANSIT paper tickets may be passed on.</li>
            </ul>
          </div>
        </details>
        <div className="actions" style={{ marginTop: 14 }}><button className="btn btn-sm" onClick={openFeedback}><Icon name="chat" size={14} />Give feedback</button></div>
      </section>
    </div>
  );
}

/* Self-test page: runs the rules against a fresh seed. */
export function SelfTestPage({ s }) {
  const [res, setRes] = useState(null);
  useEffect(() => { setRes(runSelfTests(s)); }, []);
  const pass = res ? res.filter(r => r.pass).length : 0;
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div className="eyebrow">Reviewer tools</div>
        <h1 style={{ marginTop: 6 }}>Rule self-tests</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: "64ch" }}>These run the same rules the app uses against a fresh demo seed in your browser. They don't change your demo state or feedback.</p>
      </div>
      {!res ? <p className="muted">Running…</p> : <>
        <p style={{ marginBottom: 12 }}><b className={pass === res.length ? "pass" : "fail"}>{pass} of {res.length} passed</b></p>
        <div className="tbl-wrap"><table className="data"><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
          <tbody>{res.map(r => <tr key={r.name}><td>{r.name}</td><td className={r.pass ? "pass" : "fail"}>{r.pass ? "Pass" : "Fail"}</td><td>{r.detail}</td></tr>)}</tbody></table></div>
        <div className="actions" style={{ marginTop: 12 }}><button className="btn btn-sm" onClick={() => setRes(runSelfTests(s))}><Icon name="refresh" size={14} />Run again</button></div>
      </>}
    </div>
  );
}

/* ============================================================
   ORGANIZER PREVIEW (account menu; only for the optional organizer step)
   ============================================================ */
export function ClubsPage({ s, go, dispatch, initialClub }) {
  const [club, setClub] = useState(CLUBS.includes(initialClub) ? initialClub : "Ski & Snowboard Club"); // its trips are the ones that reach an organizer
  const evs = EVENTS.filter(e => e.club === club).sort((a, b) => a.start.localeCompare(b.start));
  const ids = new Set(evs.map(e => e.id));
  const reqs = s.requests.filter(r => ids.has(r.eventId));
  const queue = reqs.filter(r => ["approval", "registration"].includes(baseSt(rState(r)))); // incl. swaps paused by a rule change: they're already with the organizer
  const swapped = reqs.filter(r => rState(r).st === "completed").reduce((t, r) => t + r.qty, 0);
  const released = s.listings.filter(l => ids.has(l.eventId) && !isAddOn(EV[l.eventId], l)).reduce((t, l) => t + l.listed, 0); // spots, not add-ons
  const waiting = evs.reduce((t, e) => t + demandFor(s, e).requests, 0); // live public requests in this browser; private alerts are never counted
  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      <div className="page-head">
        <div className="eyebrow">Organizer step: trips and treks</div>
        <h1 style={{ marginTop: 6 }}>Organizer preview</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: "64ch" }}>In this demo, event tickets move directly between students and never reach this queue (where names are checked, the seller emails the club for the name change). This is what an officer might see for club trips and operator-run treks, which always go through the trip leads or operator. Use it in organizer interviews. It's a preview, not a working organizer account.</p>
      </div>
      <div className="org-note"><Icon name="alert" size={18} /><span>Everything here is simulated. Approvals, confirmations and rule changes save in this browser only and don't touch any registration system.</span></div>
      <div className="field" style={{ maxWidth: 340, marginBottom: 18 }}>
        <label htmlFor="org-club">Viewing as organizer of</label>
        <select id="org-club" value={club} onChange={e => setClub(e.target.value)}>{CLUBS.map(c => <option key={c}>{c}</option>)}</select>
      </div>
      <div className="stat-grid">
        <div className="stat"><b>{released}</b><span>listed by students</span></div>
        <div className="stat"><b>{swapped}</b><span>handed off, directly or through you</span></div>
        <div className="stat"><b>{queue.length}</b><span>sent to you by sellers</span></div>
        <div className="stat"><b>{waiting}</b><span>public requests from students (private alerts aren't counted)</span></div>
      </div>
      <section className="sec">
        <div className="section-head"><h2>Waiting on the organizer</h2></div>
        {queue.length === 0 ? <div className="empty">Nothing waiting. Trip and trek swaps show up here once a seller sends one to the organizer.</div>
          : <div className="stack" style={{ paddingBottom: 0 }}>{queue.map(r => {
              const l = s.listings.find(x => x.id === r.listingId); const ev = EV[r.eventId]; const st = rState(r).st; const bst = baseSt(rState(r)); const el = canAcquire(r.buyerId, ev, l); const tier = l.tier ? tierOf(ev, l.tier) : null;
              return (
                <div className="panel" key={r.id}>
                  <div className="lhead"><h3><button className="linkish" onClick={() => go("event", { id: ev.id })}>{ev.title}</button></h3><span className={"chip tone-" + RSTATUS[st].tone}>{RSTATUS[st].label}</span></div>
                  <div className="req-top" style={{ marginTop: 10 }}>
                    <Avatar id={l.sellerId} size={28} /><b>{PEOPLE[l.sellerId].name}</b><Icon name="arrow" size={16} style={{ color: "var(--muted)" }} /><Avatar id={r.buyerId} size={28} /><b>{PEOPLE[r.buyerId].name}</b>
                    <span className="muted" style={{ fontSize: 13 }}>· {plural(r.qty, isAddOn(ev, l) ? "add-on" : unitOf(ev))} at {money(l.ask)}{ev.premium ? " reimbursement" : ` (paid ${money(l.paid)}${tier && ev.tiers.length > 1 ? `, ${tier.label}` : ""})`}</span>
                  </div>
                  <div className="chips" style={{ marginTop: 10 }}>
                    <span className="chip tone-good"><Icon name="check" size={13} />{ev.premium ? "Within amount paid" : "At or below price paid"}</span>
                    <span className={"chip " + (el.ok ? "tone-good" : "tone-bad")}>{el.ok ? (r.topUp ? `Non-member · ${money(r.topUp)} top-up due` : "Eligible (simulated membership)") : "Not eligible"}</span>
                    {selfReported(s, l) && <span className="chip tone-warn">Seller-reported ticket · check your roster</span>}
                    {rState(r).afterCutoff && <span className="chip tone-warn">Cutoff passed · your call</span>}
                  </div>
                  <div className="demo-ctl" style={{ marginTop: 12 }}><div className="eyebrow">Simulated organizer actions</div><div className="actions">
                    {bst === "approval" && <><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "orgApprove", requestId: r.id })}>Approve swap</button><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "orgDecline", requestId: r.id })}>Decline</button></>}
                    {bst === "registration" && <button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "orgConfirm", requestId: r.id })}>Confirm registration updated</button>}
                  </div></div>
                </div>);
            })}</div>}
      </section>
      <section className="sec">
        <div className="section-head"><h2>Your events</h2><span className="muted" style={{ fontSize: 13 }}>Switching an event to official process only pauses its open listings and requests (simulated)</span></div>
        <div className="tbl-wrap"><table className="data">
          <thead><tr><th>Event</th><th>Date</th><th>Requests</th><th>Available</th><th>Held</th><th>Transferred</th><th>Transfer rule</th></tr></thead>
          <tbody>{evs.map(e => {
            const er = reqs.filter(r => r.eventId === e.id); const sum = eventSummary(s, e);
            return (
              <tr key={e.id}>
                <td><button className="linkish" onClick={() => go("event", { id: e.id })}><b>{e.title}</b></button><div style={{ marginTop: 4 }}><StateBadge state={sum.state} /></div></td>
                <td>{fmtRange(e)}</td>
                <td className="num">{demandFor(s, e).requests}</td>
                <td className="num">{sum.spots}</td>
                <td className="num">{er.filter(r => reserves(rState(r))).reduce((t, r) => t + r.qty, 0)}</td>
                <td className="num">{er.filter(r => rState(r).st === "completed").reduce((t, r) => t + r.qty, 0)}</td>
                <td><select id={"pol-" + e.id} aria-label={"Transfer rule for " + e.title} value={e.policy} onChange={x => dispatch({ type: "setPolicy", eventId: e.id, policy: x.target.value })}>
                  {Object.entries(POLICY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select></td>
              </tr>);
          })}</tbody>
        </table></div>
        <p className="scroll-hint">On a phone, scroll the table sideways.</p>
      </section>
      <section className="sec prose">
        <h2>Questions to ask organizers</h2>
        <ol>
          <li>How many spots went unused or no-showed at your last sold-out event?</li>
          <li>How do you handle cancellations today, and how long does it take?</li>
          <li>Do you check names at the door? If so, would you update a name when a ticket changes hands?</li>
          <li>Can member-priced tickets go to non-members? With a top-up?</li>
          <li>For trips: how do deposits, installments and name changes work when someone drops?</li>
          <li>Would you be comfortable with students handing off tickets directly for one event this semester? What would worry you?</li>
        </ol>
      </section>
    </div>
  );
}

/* ============================================================
   FEEDBACK (manual copy in this PennTools prototype; no shared saving).
   v2 separates behavior, opinion and pilot commitment; v1 records still display.
   ============================================================ */
const FB = {
  role: ["Which best describes you?", [["buyer", "I look for spots"], ["seller", "I pass on spots"], ["organizer", "Club organizer"], ["other", "Other"]]],
  recent: ["When did you last try to get or pass on a spot for a club event or trip?", [["month", "This month"], ["semester", "This semester"], ["earlier", "Earlier"], ["never", "Never"]]],
  eventType: ["What kind of event was it?", [["tasting", "Tasting or dinner"], ["gala", "Gala or party"], ["trip", "Trip"], ["conference", "Conference"], ["sports", "Sports"], ["show", "Show"], ["other", "Other"]]],
  did: ["What did you actually do?", [["chat", "Posted in a group chat"], ["friends", "Asked friends"], ["club", "Used the club's waitlist"], ["gaveup", "Gave up"], ["unused", "Let the spot go unused"], ["other", "Something else"]]],
  clear: ["Was it clear whether the transfer was allowed?", [["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]],
  pilot: ["Would you take part in a pilot for 3–5 club events?", [["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]]],
  // v1 labels, kept so older responses display correctly
  history: ["", [["bought", "Tried to get one"], ["sold", "Tried to pass one on"], ["both", "Both"], ["neither", "Neither"]]],
  outcome: ["", [["worked", "Worked out"], ["gaveup", "Never found a spot"], ["unused", "Spot went unused"], ["club", "Club's waitlist handled it"]]],
  use: ["", [["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]]],
  role1: ["", [["student", "Student"], ["organizer", "Club organizer"], ["other", "Other"]]],
};
const SCORE_LBL = ["", "Worse", "Same", "A bit better", "Better", "Much better"];
const lbl = (k, v) => { const o = (FB[k] || ["", []])[1].find(x => x[0] === v); return o ? o[1] : "–"; };
const EMPTY_FB = { role: "", recent: "", eventType: "", did: "", stalled: "", clear: "", pilot: "", score: 0, contact: "", consent: false, tester: "" };

function Choice({ k, value, onChange }) {
  const [q, opts] = FB[k];
  return (
    <div className="field">
      <span className="q-label" id={"fbq-" + k}>{q}</span>
      <div className="pills" role="radiogroup" aria-labelledby={"fbq-" + k} onKeyDown={onRadioKeys}>
        {opts.map(([v, l], idx) => <button type="button" key={v} role="radio" aria-checked={value === v} tabIndex={rov(value === v, idx, !!value)} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

export function FeedbackModal({ rt, onClose, onDone }) {
  const [a, setA] = useState(EMPTY_FB);
  const [phase, setPhase] = useState("form");
  const [copied, setCopied] = useState(false);
  const taRef = useRef(null);
  const set = (k, v) => setA(p => ({ ...p, [k]: v }));
  const tried = a.recent && a.recent !== "never";
  const valid = a.role && a.recent && (!tried || (a.eventType && a.did)) && a.pilot && (!a.contact.trim() || a.consent);
  const dref = useRef(null); useDialog(dref, onClose);
  const summary = () => [`${BRAND} prototype feedback`, `Role: ${lbl("role", a.role)}`, `Last attempt: ${lbl("recent", a.recent)}`,
    tried ? `Event type: ${lbl("eventType", a.eventType)}` : null, tried ? `What they did: ${lbl("did", a.did)}` : null, a.stalled.trim() ? `Where it stalled: ${a.stalled.trim()}` : null,
    tried ? `Transfer permission clear: ${lbl("clear", a.clear)}` : null, `Pilot: ${lbl("pilot", a.pilot)}`, a.score ? `Opinion vs WhatsApp: ${a.score}/5` : null,
    a.contact.trim() && a.consent ? `Contact (consented): ${a.contact.trim()}` : null].filter(Boolean).join("\n");

  async function submit(e) {
    e.preventDefault();
    if (!valid || phase === "saving") return;
    setPhase("saving");
    const body = { v: 2, ...a, stalled: a.stalled.trim(), contact: a.consent ? a.contact.trim() : "", tester: a.tester.trim(), at: Date.now() };
    if (rt.db && rt.uid) {
      try {
        await rt.db.doc("feedback/" + rt.uid).set({ lastAt: body.at });
        await rt.db.collection("feedback/" + rt.uid + "/responses").add(body);
        setPhase("saved"); onDone(); return;
      } catch (err) { /* fall through to copy/paste */ }
    }
    setPhase("fallback"); onDone();
  }

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" ref={dref} role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <div className="lhead" style={{ alignItems: "center" }}>
          <h2 id="fb-title">{phase === "saved" ? "Thank you" : "Your real experience"}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        {phase === "saved" && <div className="form-stack" style={{ marginTop: 14 }}>
          <p>Saved. Answers are visible only to the prototype's owner and are never shown publicly or quoted without your consent.</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={onClose}>Back to the demo</button>
            {rt.canResults && <button className="btn" onClick={() => { setA(EMPTY_FB); setPhase("form"); }}>Record another interview</button>}
          </div>
        </div>}
        {phase === "fallback" && <div className="form-stack" style={{ marginTop: 14 }}>
          <p>This copy of the prototype can't save answers. Copy them and send them to whoever shared this link.</p>
          <textarea ref={taRef} readOnly value={summary()} rows={9} aria-label="Your answers" />
          <div className="actions">
            <button className="btn btn-primary" onClick={async () => setCopied(await copyText(summary(), taRef.current))}><Icon name="copy" size={15} />{copied ? "Copied" : "Copy answers"}</button>
            <button className="btn" onClick={onClose}>Done</button>
          </div>
        </div>}
        {(phase === "form" || phase === "saving") && <form className="form-stack" style={{ marginTop: 14 }} onSubmit={submit}>
          <p className="muted" style={{ fontSize: 13.5 }}>Answer about what actually happened, not the demo. Answers are not saved here; review and copy them to share manually.</p>
          <Choice k="role" value={a.role} onChange={v => set("role", v)} />
          <Choice k="recent" value={a.recent} onChange={v => set("recent", v)} />
          {tried && <div className="q-group">
            <Choice k="eventType" value={a.eventType} onChange={v => set("eventType", v)} />
            <Choice k="did" value={a.did} onChange={v => set("did", v)} />
            <div className="field"><label htmlFor="fb-stalled">Where did it stall or take extra work? (optional)</label>
              <textarea id="fb-stalled" value={a.stalled} maxLength={500} onChange={e => set("stalled", e.target.value)} placeholder="e.g. Nobody replied in the chat until the day before." /></div>
            <Choice k="clear" value={a.clear} onChange={v => set("clear", v)} />
          </div>}
          <div className="q-group">
            <Choice k="pilot" value={a.pilot} onChange={v => set("pilot", v)} />
            <div className="field">
              <span className="q-label" id="fbq-score">Opinion (optional): compared with a club group chat, this is…</span>
              <div className="scale" role="radiogroup" aria-labelledby="fbq-score" onKeyDown={onRadioKeys}>
                {[1, 2, 3, 4, 5].map((n, idx) => <button type="button" key={n} role="radio" aria-checked={a.score === n} tabIndex={rov(a.score === n, idx, !!a.score)} className={a.score === n ? "on" : ""} onClick={() => set("score", a.score === n ? 0 : n)}><b>{n}</b>{SCORE_LBL[n]}</button>)}
              </div>
            </div>
          </div>
          <div className="q-group">
            <div className="field"><label htmlFor="fb-contact">Email, if you'd like to hear about a pilot (optional)</label>
              <input id="fb-contact" type="email" value={a.contact} onChange={e => set("contact", e.target.value)} placeholder="you@school.edu" /></div>
            {a.contact.trim() && <label className="check" htmlFor="fb-consent"><input id="fb-consent" type="checkbox" checked={a.consent} onChange={e => set("consent", e.target.checked)} /><span>I agree to be contacted about a pilot. My email is visible only to the prototype's owner.</span></label>}
            {rt.canResults && <div className="field"><label htmlFor="fb-tester">Interviewer only: tester note (optional)</label>
              <input id="fb-tester" type="text" value={a.tester} onChange={e => set("tester", e.target.value)} placeholder="e.g. J.L., Wine Club VP" /></div>}
          </div>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={!valid || phase === "saving"}>{phase === "saving" ? "Preparing…" : "Review answers"}</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
          {!valid && <span className="help">{a.contact.trim() && !a.consent ? "Tick the consent box, or clear your email." : "Answer the role, last-attempt and pilot questions to submit."}</span>}
        </form>}
      </div>
    </div>
  );
}

export function ResultsPage({ rt, openFeedback }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  async function load() {
    if (!rt.db) return;
    setErr(null);
    try {
      const parents = await rt.db.collection("feedback").get();
      const all = [];
      for (const p of parents.docs) { const r = await rt.db.collection("feedback/" + p.id + "/responses").get(); r.docs.forEach(d => all.push({ id: d.id, ...d.data() })); }
      all.sort((x, y) => (y.at || 0) - (x.at || 0)); setRows(all);
    } catch (e) { setErr("Couldn't load responses. Try Refresh."); }
  }
  useEffect(() => { load(); }, [rt.db]);
  if (!rt.canResults) return <div className="wrap"><div className="page-head"><h1>Feedback results</h1><p className="muted" style={{ marginTop: 8 }}>Only the people who run this prototype can see results.</p></div></div>;
  if (!rt.db) return <div className="wrap"><div className="page-head"><h1>Feedback results</h1><p className="muted" style={{ marginTop: 8 }}>Results are stored when the prototype is opened from its claude.ai link.</p></div></div>;
  const list = rows || []; const n = list.length;
  const v2 = list.filter(r => r.v === 2), v1 = list.filter(r => r.v !== 2);
  const count = (arr, f) => arr.filter(f).length;
  const tried = count(v2, r => ["month", "semester"].includes(r.recent)) + count(v1, r => ["bought", "sold", "both"].includes(r.history));
  const stuck = count(v2, r => ["gaveup", "unused"].includes(r.did)) + count(v1, r => ["gaveup", "unused"].includes(r.outcome));
  const unclear = count(v2, r => ["no", "unsure"].includes(r.clear));
  const pilotYes = count(list, r => r.pilot === "yes"), pilotMaybe = count(list, r => r.pilot === "maybe");
  const scored = list.filter(r => r.score); const avg = scored.length ? scored.reduce((t, r) => t + r.score, 0) / scored.length : 0;
  const contacts = count(list, r => r.contact);
  const behaviour = r => r.v === 2 ? `${lbl("recent", r.recent)}${r.eventType ? " · " + lbl("eventType", r.eventType) : ""}${r.did ? " · " + lbl("did", r.did) : ""}` : `${lbl("history", r.history)}${r.outcome ? " · " + lbl("outcome", r.outcome) : ""}`;
  const text = [`${BRAND} feedback: ${n} responses (${v2.length} current form, ${v1.length} earlier form).`,
    `Behavior: ${tried} tried to get or pass on a spot recently; ${stuck} said the last attempt failed or the spot went unused.`,
    v2.length ? `${unclear} of ${v2.length} weren't sure the transfer was allowed.` : null,
    `Pilot: ${pilotYes} yes, ${pilotMaybe} maybe.`, scored.length ? `Opinion vs group chat: ${avg.toFixed(1)}/5 (${scored.length} rated).` : null,
    `${contacts} consented to pilot contact.`].filter(Boolean).join("\n");
  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      <div className="page-head">
        <div className="eyebrow">Visible only to you</div>
        <h1 style={{ marginTop: 6 }}>Feedback results</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: "64ch" }}>Real responses, exactly as collected. Behavior, opinion and pilot interest are kept separate. Don't quote anyone publicly without their consent.</p>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={load}><Icon name="refresh" size={15} />Refresh</button>
          <button className="btn" onClick={openFeedback}><Icon name="chat" size={15} />Record an interview</button>
          {n > 0 && <button className="btn btn-primary" onClick={async () => setCopied(await copyText(text))}><Icon name="copy" size={15} />{copied ? "Copied" : "Copy summary"}</button>}
        </div>
      </div>
      {err && <div className="org-note"><Icon name="alert" size={18} /><span>{err}</span></div>}
      {rows === null && !err && <p className="muted">Loading responses…</p>}
      {rows !== null && n === 0 && <div className="empty">No responses yet. Share the link with testers, or record an interview.</div>}
      {n > 0 && <>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Behavior</div>
        <div className="stat-grid">
          <div className="stat"><b>{n}</b><span>responses ({v1.length} on the earlier form)</span></div>
          <div className="stat"><b>{tried}</b><span>tried to get or pass on a spot recently</span></div>
          <div className="stat"><b>{stuck}</b><span>gave up or let a spot go unused</span></div>
          <div className="stat"><b>{v2.length ? `${unclear}/${v2.length}` : "–"}</b><span>unsure whether transfer was allowed</span></div>
        </div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Pilot commitment and opinion</div>
        <div className="stat-grid">
          <div className="stat"><b>{pilotYes}</b><span>would join a pilot ({pilotMaybe} maybe)</span></div>
          <div className="stat"><b>{contacts}</b><span>consented to pilot contact</span></div>
          <div className="stat"><b>{scored.length ? avg.toFixed(1) : "–"}</b><span>opinion vs group chat, out of 5 ({scored.length} rated)</span></div>
        </div>
        <div className="section-head"><h2>Every response</h2></div>
        <div className="tbl-wrap"><table className="data">
          <thead><tr><th>When</th><th>Role</th><th>Behavior</th><th>Where it stalled</th><th>Permission clear</th><th>Pilot</th><th>Opinion</th><th>Contact / note</th></tr></thead>
          <tbody>{list.map(r => (
            <tr key={r.id}>
              <td className="num">{r.at ? new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: NY_TZ }) : "–"}{r.v !== 2 ? " · v1" : ""}</td>
              <td>{r.v === 2 ? lbl("role", r.role) : lbl("role1", r.role)}</td>
              <td>{behaviour(r)}</td>
              <td style={{ minWidth: 180 }}>{r.v === 2 ? (r.stalled || "–") : (r.missing || "–")}</td>
              <td>{r.v === 2 ? lbl("clear", r.clear) : "–"}</td>
              <td>{lbl("use", r.pilot)}</td>
              <td className="num">{r.score ? `${r.score}/5` : "–"}{r.v !== 2 && r.use ? ` · would use: ${lbl("use", r.use)}` : ""}</td>
              <td>{[r.contact, r.tester].filter(Boolean).join(" · ") || "–"}</td>
            </tr>))}</tbody>
        </table></div>
        <p className="scroll-hint">Scroll sideways for more columns.</p>
      </>}
    </div>
  );
}
