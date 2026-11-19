// Handoff's engine: the marketplace rules, the reducer and the JSX-free view helpers,
// run by both the browser (HandoffPrototype.jsx) and the server (tools/handoff/src).
// Exported as "@penntools/tool-handoff/engine" and typed by the hand-written index.d.ts.
//
// The code below was moved out of HandoffPrototype.jsx by a script that keeps every declaration as it was,
// adds `export`, and makes two changes the move needs: priceLines' text is priceParts here (the JSX adds the
// bold), and shareText takes the seed's ids as a parameter. Rules for this module:
// - Plain ES-module JavaScript: no JSX, no "use client" and no build step.
// - No window, document or localStorage outside a typeof guard (the server runs it).
// - Never import ./preview.js (sample data and self-tests); server code must not load it.
// - Import the shared state by name (import { CLOCK } from ...), never by destructuring a namespace object:
//   CLOCK changes, and only a named import stays live.
// - Every naive "YYYY-MM-DDTHH:MM" string is New York wall time (./time.js), on the server and in every browser.
// - A live world (mode "live": the shared market) runs on the server only inside withEngine; see LIVE WORLD at the end.

import { wallToMs, nyParts, nyIsoDate, NY_TZ } from "./time.js";
export { wallToMs, nyParts, nyIsoDate, NY_TZ };

/** The protocol number in every view and action. A client whose number differs reloads. 2 (follow-on B1's page): payment methods
    (saveMyProfile takes payMethods only; the view's legacy handle fields left). 3 (follow-on B5's page): invite to pay, switched on
    in the same save as INVITE_FLOW_LIVE, so a page still open on the old flow reloads into the new one. 4 (forms round 2): an event by
    its date alone, one implicit ticket type with an optional face value, a train as one departure, no "what you paid", so a page still
    open on the old forms reloads into the new ones. 5 (one-form Sell, §9l): the page's Sell a ticket is one form that posts with
    postTicket, so a page still open on the old Sell form (the event menu and "Not listed? Add it") reloads into the new one. 6 (the
    Sell and Request follow-up, §9m and §9n): Sell a ticket sends no transfer method for an ordinary event and Request a ticket is one
    form that posts with postRequest, so a page still open on the old forms (which would store "PDF or QR code" for a seller who never
    chose it, or add an event before its request) reloads into the new ones. 7 (simplified Goods, §9q item 6): Sell an item posts with
    a name and a price and states nothing its seller didn't choose, so a page still open on the old form (which would store "Good" and
    a pickup-by date for a seller who never chose them, and has no words for an item without a category, a condition or an area)
    reloads into the new one. 8 (§9v items 4 and 5, SELL5-M2): Sell a ticket's "This ticket has restrictions" (members only, an
    organizer name change, or the seller's own short words) and a club named on a listing for an event that names none (list and
    postTicket take `club` and `restriction`; the old "Flag a transfer restriction" is no longer sent), so a page still open on the old
    form reloads into the new one. Stored listings and the old action shape (`restricted`) are kept and still read. 9 (§9v item 2,
    SELL5-M3): "I have this" on a ticket request in one submission (answerRequest: list a ticket for the request and invite its poster,
    or invite them from a listing of yours), so a page still open on the old two-step answer (list and share, then invite) reloads into
    the new one. inviteRequester, shareListing and seq are unchanged, so stored actions replay. 10 (§9x item 1, SELL6-N1): a free
    ticket skips the payment steps (reserve answers "confirmed" for a $0 invitation, with no payment details), a view names the public
    requests that closed (closedRequests; a guest's closedWanted) and a guest's listing carries its seller's restriction words, so a
    page still open on the older code (which would show payment words on a free reservation and "not found" for a closed request)
    reloads into the new one. No action's shape changed: every stored action replays as it was. */
export const HANDOFF_PROTOCOL = 10;

/* ============================================================
   CONFIG
   Clubs and event types are real Wharton ones, researched from public
   pages (Oct 2026). Each event's `sources` holds only facts found
   there. Everything else (unpublished dates, demo prices, transfer
   policies, listings, people, holdings) is illustrative demo data.
   This is a browser-only prototype: every rule below runs in the
   viewer's browser. A real service must enforce them server-side.
   ============================================================ */
export const BRAND = "Handoff";
/* Beside the brand: who it's for, as one small label naming the community, not the school (Help says Handoff isn't affiliated with or
   endorsed by Wharton). It sits beside the wordmark (beneath it on narrow screens), outside the Handoff home button. */
export const COMMUNITY = "Wharton community";
export const STORE_KEY = "penntools-handoff-prototype-v11";           // PennTools prototype state only; feedback uses the manual-copy fallback. v9: Christine's ticket flow; v10: 15-minute holds; v11: official-only event removed
export const DEMO_BASE = wallToMs("2026-10-20T09:00"); // the preview's demo clock starts at 9 AM in Philadelphia, whatever this machine's zone
export const DEMO_YEAR = 2026;
export const HOUR = 3600e3, DAY = 24 * HOUR;
/* Stamps carry a few ms of ordering ticks past the demo clock; deadlines count from the clock's own minute, so "+15 min" ends a 15-minute hold. */
export const onClock = ms => Math.floor(ms / 60e3) * 60e3;
/* Illustrative demo rules, not club policy. Documented on the reviewer page. */
/* goodsHoldHours: an accepted goods request holds the item this long for the two people to agree a pickup time;
   once agreed, the hold runs to a day after that time. Keeps one buyer from tying up an item until its final pickup-by date. */
/* holdMinutes, offerHoldHours, offerHours, offerHoursSoon, strikesToPause: Christine's workflow (Oct 2026 tracker) for
   student-to-student tickets. A reservation the buyer makes themselves ("I'll take it", or accepting a counter or an ISO reply)
   lasts holdMinutes: they're in the app and can pay right away. When the seller accepts the buyer's offer, the buyer may not see
   it at once, so it lasts offerHoldHours. An offer (or a counter, or an ISO reply) lasts offerHours, or offerHoursSoon when the
   event is less than a day away; strikesToPause upheld reports pause an account. Trips and treks keep the older clocks. */
/* payDisputeHours, payDisputeHoursSoon: once the seller says a paid reservation's money hasn't arrived (paymentMissing), the
   buyer may cancel, and after this long the seller may release it: payDisputeHoursSoon when the ticket is used within a day.
   Handoff can't see payments, so it doesn't decide who is right (C-DESIGN.md §8.3). */
export const RULES = { sellerResponseHours: 48, startOfficialHours: 72, maxSpotsPerPerson: 4, goodsHoldHours: 48, holdMinutes: 15, offerHoldHours: 2, offerHours: 6, offerHoursSoon: 1, strikesToPause: 2, payDisputeHours: 24, payDisputeHoursSoon: 1 };
export const TAKE_HOLD = `${RULES.holdMinutes} minutes`;    // "I'll take it", or the buyer accepting a counter or an ISO reply
export const OFFER_HOLD = `${RULES.offerHoldHours} hours`;  // the seller accepting the buyer's offer
export let CLOCK = DEMO_BASE; // the engine's clock, set by applyWorld(): the demo clock in the preview, the live clock in a live world (NaN between withEngine runs)

/* People. Identity, student status and memberships are separate, simulated claims. */
export const PEOPLE = {
  u_priya:  { name: "Langston Chen", first: "Langston", tag: "WG'28", role: "Buyer",  color: "#2563A8", demo: true, contact: "priya.shah@example.edu", phone: "(215) 555-0142", pay: "@Priya-Shah-WG28", school: "Wharton MBA", status: "Student", memberships: ["Wharton Wine Club", "Ski & Snowboard Club"] },
  u_jordan: { name: "Jordan Kim", first: "Jordan", tag: "WG'27", role: "Seller", color: "#0E7C66", demo: true, contact: "jordan.kim@example.edu", phone: "(215) 555-0187", pay: "@Jordan-Kim-WG27", school: "Wharton MBA", status: "Student", memberships: ["Wharton Wine Club", "PE/VC Club", "Ski & Snowboard Club", "Veterans Club"] },
  o_alex:  { name: "Alex R.",  first: "Alex",  color: "#7C4DBA", contact: "alex.r@example.edu", pay: "@Alex-R-demo",  status: "Student", memberships: ["Wharton Wine Club"] },
  o_sam:   { name: "Sam O.",   first: "Sam",   color: "#B4532A", contact: "sam.o@example.edu", pay: "@Sam-O-demo",   status: "Student", memberships: ["Veterans Club", "Wharton Wine Club"] },
  o_dana:  { name: "Dana L.",  first: "Dana",  color: "#A23B63", contact: "dana.l@example.edu", pay: "@Dana-L-demo",  status: "Student", memberships: ["Veterans Club"] },
  o_chris: { name: "Chris M.", first: "Chris", color: "#3E6B2F", contact: "chris.m@example.edu", pay: "@Chris-M-demo", status: "Student", memberships: [] },
  o_leah:  { name: "Leah W.",  first: "Leah",  color: "#1F6FB2", contact: "leah.w@example.edu", pay: "@Leah-W-demo",  status: "Student", memberships: ["Veterans Club", "PE/VC Club"] },
  o_tomas: { name: "Tomás G.", first: "Tomás", color: "#8A6A10", contact: "tomas.g@example.edu", pay: "@Tomas-G-demo", status: "Partner", memberships: [] },
  o_nia:   { name: "Nia B.",   first: "Nia",   color: "#0E7C86", contact: "nia.b@example.edu", pay: "@Nia-B-demo",   status: "Student", memberships: ["Ski & Snowboard Club"] },
};
export const DEMO_USERS = ["u_priya", "u_jordan"];

/* Ticket categories group by what the thing is, not which club runs it (a gala, a cultural night and a boat party are all parties),
   so new clubs fit without new buckets. Based on what students actually trade in group chats (Oct 2026). */
export const CATS = { Parties: "var(--c-social)", "Food & drink": "var(--c-wine)", "Treks & trips": "var(--c-travel)", Conferences: "var(--c-culture)", Shows: "var(--c-food)", Sports: "var(--c-sports)", Travel: "var(--c-train)" };

/* What's known about an event's transfer rules. By default students hand off directly (seller sends, buyer confirms).
   The organizer step (approval and a name change on the registration) is optional: the seller turns it on per listing.
   Only "official" blocks Handoff, because there the organizer itself reallocates the seat. */
export const POLICY = {
  permitted: { label: "Transferable", short: "Transferable", tone: "good", icon: "check", select: "Seller picks a buyer",
    desc: "Students pass on tickets directly: the seller sends it and the buyer confirms. If names are checked at entry, the seller can add the organizer step when offering." },
  approval:  { label: "Club asks to approve swaps", short: "Club asks to approve", tone: "warn", icon: "shield", select: "Seller picks a buyer; the club approves if the organizer step is on",
    desc: "This club says it wants to approve swaps (illustrative). Turning on the organizer step when offering sends the swap through the club. Handoff shows this but doesn't enforce it." },
  official:  { label: "Official process only", short: "Official process only", tone: "bad", icon: "lock", select: "Organizer allocates (e.g. its own waitlist)",
    desc: "The organizer fills open spots itself, for example from its own waitlist. Handoff doesn't match students here. It points you to the official process." },
  // §9v item 5 (SELL5-M2): no generic "rules not confirmed" wording anywhere. An event with no stated rule shows no transfer tag at all
  // (transferTag); this name is only the preview's organizer simulation's choice.
  unknown:   { label: "No rule stated", short: "No rule stated", tone: "muted", icon: "help", select: "Seller picks a buyer",
    desc: "The organizer hasn't stated a transfer rule. The seller can hand it off directly, or add the organizer step when offering if names are checked at entry." },
};

/* Events. tiers: every non-trip event has at least one; memberOnly tiers are member-priced.
   tierRule: what happens when a member-priced ticket goes to a non-member ("members" = not allowed; "topup" = organizer-approved top-up). */
/* namesChecked: names are checked at entry (a registration or guest list), so a ticket can only move by an organizer name change (illustrative).
   methods: the only ways a ticket can change hands, when fixed by the ticket itself (train eTickets, paper tickets). */
export const PAY_DEFAULT = "Pay the seller once it's reserved for you (Venmo or PayPal), then tap “Paid”. Handoff doesn't hold the money.";
export const EVENTS = [
  { id: "e_wine", title: "Monthly Tasting: Northern Rhône Syrah", club: "Wharton Wine Club", cat: "Food & drink", start: "2026-11-12T19:00", venue: "Center City tasting room (shared on registration)",
    attend: "members", tiers: [{ id: "std", label: "Member ticket", price: 35, src: "demo price" }], namesChecked: true,
    policy: "permitted", soldOut: true, interestSeed: 9, cap: 56, deadline: "2026-11-11T19:00", noShowRule: true,
    blurb: "The club’s members-only monthly tasting. Seats go fast, and the club’s published no-show rule makes finding a replacement matter.",
    path: "Tell the Wine Club board you can’t attend and who is taking your seat. The club updates its registration list.",
    payment: PAY_DEFAULT, officialUrl: "https://groups.wharton.upenn.edu/Wine/club_signup",
    sources: [{ text: "Events are members-only. A no-show loses good standing for the academic year unless they made an effort to sell their ticket at least 24 hours in advance.", url: "https://groups.wharton.upenn.edu/Wine/club_signup" },
              { text: "500+ members; tastings typically seat 50–60.", url: "https://magazine.wharton.upenn.edu/digital/wharton-the-best-time-to-imbibe-wine/" }] },
  { id: "e_wine_fg", title: "Friendsgiving Wine Social", club: "Wharton Wine Club", cat: "Food & drink", start: "2026-11-17T19:00", venue: "Location shared on registration",
    attend: "members", tiers: [{ id: "std", label: "Member ticket", price: 10, src: "2025 price" }], perPerson: 1, namesChecked: true,
    policy: "permitted", soldOut: true, interestSeed: 12, cap: 120, deadline: "2026-11-16T19:00", noShowRule: true,
    blurb: "A low-cost, one-ticket-per-member social before Thanksgiving break. Cheap tickets still sell out, and no-shows still count.",
    path: "Tell the Wine Club board who is taking your ticket. One ticket per person.",
    payment: PAY_DEFAULT, officialUrl: "https://groups.wharton.upenn.edu/Wine/club_signup",
    sources: [{ text: "The 2025 Friendsgiving social was $10, one ticket per person.", url: "https://groups.wharton.upenn.edu/Wine/rsvp?id=123089" }] },
  { id: "e_vets", title: "Vets Gala", club: "Veterans Club", cat: "Parties", start: "2026-11-05T19:00", venue: "Venue shared on registration",
    attend: "all", tierRule: "members", namesChecked: true, // member-priced tickets stay with members (no non-member top-up in the student flow)
    tiers: [{ id: "member", label: "Member", price: 100, memberOnly: true, src: "2025 price" }, { id: "early", label: "Non-member early bird", price: 120, src: "2025 price" }, { id: "regular", label: "Non-member", price: 140, src: "2025 price" }],
    policy: "approval", soldOut: true, interestSeed: 18, cap: 420, deadline: "2026-11-02T23:59",
    blurb: "The Veterans Club’s fall gala, open to all students.",
    path: "Send the club the replacement’s name and email. The club approves and updates the guest list.",
    payment: PAY_DEFAULT,
    sources: [{ text: "2025 gala at the Franklin Institute: $100 members, $120 non-member early bird, $140 non-member; 412 registered.", url: "https://groups.wharton.upenn.edu/Veterans/rsvp?id=122452" }] },
  { id: "e_wabf", title: "Wharton Africa Business Forum", club: "Wharton African Students Association", cat: "Conferences", start: "2026-11-06T09:00", end: "2026-11-07T17:00", venue: "Huntsman Hall",
    attend: "all", tiers: [{ id: "std", label: "General pass", price: 60, src: "demo price" }], namesChecked: true,
    policy: "permitted", soldOut: false, interestSeed: 3, cap: 800, deadline: "2026-11-04T23:59",
    blurb: "The long-running student-run forum on business in Africa. Tickets are still on sale from the organizers.",
    path: "Email the forum team the attendee’s new name; badges are printed from the registration list.",
    payment: PAY_DEFAULT,
    sources: [{ text: "The 2025 forum, its 32nd year, ran Nov 7–8 at Huntsman Hall.", url: "https://forum.whartonafrica.com" }] },
  { id: "e_wga_ball", title: "WGA Winter Ball", club: "Wharton Graduate Association", cat: "Parties", start: "2026-12-03T21:00", venue: "Venue announced on registration",
    attend: "all", tiers: [{ id: "std", label: "Ticket", price: 40, src: "2021 price" }],
    policy: "unknown", soldOut: true, interestSeed: 31, cap: 900, deadline: null,
    blurb: "The WGA’s December ball. WGA has said its event tickets are non-refundable, so students who can’t go look for someone to take their ticket.",
    path: "Not confirmed. Contact WGA about cancellations.", payment: PAY_DEFAULT,
    sources: [{ text: "WGA has stated that tickets to its events are non-refundable (2015 ball page) and pointed resellers to the “Wharton Market” Facebook group.", url: "https://groups.wharton.upenn.edu/wga/rsvp.aspx?id=100879" },
              { text: "The 2021 Winter Ball was $40.", url: "https://groups.wharton.upenn.edu/wga/rsvp_boot?id=111808" }] },
  { id: "e_pevc", title: "PE/VC Winter Gala", club: "PE/VC Club", cat: "Parties", start: "2026-12-04T19:30", venue: "Center City hotel (shared on registration)",
    attend: "all", tierRule: "members", namesChecked: true,
    tiers: [{ id: "member", label: "Member", price: 95, memberOnly: true, src: "demo price" }, { id: "nonmember", label: "Non-member", price: 120, src: "2024 price" }],
    policy: "approval", soldOut: true, interestSeed: 22, cap: 600, deadline: "2026-12-01T23:59",
    blurb: "One of the biggest club galas of the fall.",
    path: "Send the swap to the club’s events team, who approve it and update the guest list.", payment: PAY_DEFAULT,
    sources: [{ text: "The 2024 gala at the Four Seasons listed $120 for non-members; about 600 registered.", url: "https://groups.wharton.upenn.edu/PEVCC/rsvp?id=119694" }] },
  { id: "e_sixers", title: "76ers Night Out", club: "Sports Business Club", cat: "Sports", start: "2026-11-18T19:00", venue: "Wells Fargo Center",
    attend: "all", tiers: [{ id: "std", label: "Subsidized ticket", price: 10, src: "past price" }],
    policy: "approval", soldOut: true, interestSeed: 7, cap: 60, deadline: "2026-10-19T17:00",
    blurb: "Subsidized group seats. In this demo the transfer window has already closed (illustrative cutoff), to show what happens after a deadline.",
    path: "Illustrative: name changes have closed. Contact the club about cancellations.", payment: PAY_DEFAULT,
    sources: [{ text: "Past Sixers club outings sold subsidized tickets, for example $10.", url: "https://groups.wharton.upenn.edu/WHAMBAA/rsvp?id=105099" }] },
  { id: "e_euro", title: "Euro Ski Trip", club: "Ski & Snowboard Club", cat: "Treks & trips", start: "2027-01-09T08:00", end: "2027-01-16T12:00", venue: "European resort (announced to members)",
    attend: "members", premium: true, policy: "approval", soldOut: true, interestSeed: 26, cap: 130, deadline: "2026-12-01T23:59",
    price: { currency: "USD", total: 2900, fee: 50, feeNote: "Rooming-list change fee, paid by the replacement to the club", note: "Demo figures. The club doesn’t publish trip prices.",
      schedule: [{ label: "Deposit", amount: 500, due: "2026-09-30" }, { label: "Installment", amount: 1200, due: "2026-10-15" }, { label: "Final payment", amount: 1200, due: "2026-11-30" }],
      includes: ["7 nights lodging", "Lift passes", "Club socials"], excludes: ["Flights", "Rentals", "Most meals"] },
    eligibility: "Ski & Snowboard Club members (membership is required for trips). The name on the rooming list must match the traveler.",
    blurb: "The smaller, scarcer of the club’s two winter trips: about 130 students and partners for a week at a European resort.",
    path: "1) Seller tells the trip leads who is replacing them. 2) Trip leads approve and update the rooming list. 3) Replacement pays the remaining balance and change fee to the club.",
    payment: "1) Trip leads approve. 2) Club confirms the rooming list. 3) Then reimburse the seller, and pay the remaining installment and change fee to the club by their due dates. Handoff doesn't hold or move money.",
    officialUrl: "https://groups.wharton.upenn.edu/skisnowboard/keydates/",
    sources: [{ text: "Euro Trip: Jan 9–16, 2027, 130+ students and partners. Club membership is required for trips.", url: "https://groups.wharton.upenn.edu/skisnowboard/keydates/" }] },
  { id: "e_us_ski", title: "US Ski Trip", club: "Ski & Snowboard Club", cat: "Treks & trips", start: "2027-02-03T08:00", end: "2027-02-07T12:00", venue: "West Coast mountain (announced to members)",
    attend: "members", premium: true, policy: "unknown", soldOut: false, notOnSale: true, interestSeed: 40, cap: 1000, deadline: null,
    price: { currency: "USD", total: 1950, fee: 0, note: "Demo figures. Prices haven’t been announced.",
      schedule: [{ label: "Deposit", amount: 400, due: "2026-11-20" }, { label: "Balance", amount: 1550, due: "2027-01-10" }],
      includes: ["Lodging", "Lift passes", "Club socials"], excludes: ["Flights", "Rentals"] },
    eligibility: "Ski & Snowboard Club members.",
    blurb: "One of the biggest trips of the year, with more than 1,000 students and partners. Sign-up hasn’t opened, so for now students can get notified or post a request.",
    path: "Sign-up details not announced.", payment: PAY_DEFAULT,
    officialUrl: "https://groups.wharton.upenn.edu/skisnowboard/keydates/",
    sources: [{ text: "US Trip: Feb 3–7, 2027, “over 1,000 students/partners”; sign-up TBA.", url: "https://groups.wharton.upenn.edu/skisnowboard/keydates/" }] },
  /* A student trek with a one-time ticket price (no installment schedule), sold in early-bird / standard / late-bird tiers plus a
     separately sold extension, as students trade them in group chats. Transfers go through the trek's travel operator (organizerRequired). */
  { id: "e_colombia", title: "Colombia Trek", club: "Colombia Trek", cat: "Treks & trips", start: "2026-11-21T08:00", end: "2026-11-27T18:00", venue: "Medellín and Cartagena (the 2024 route)",
    attend: "all", organizerRequired: true, perPerson: 2,
    tiers: [{ id: "early", label: "Early bird", price: 1240, src: "2024 listing's starting price" }, { id: "std", label: "Standard", price: 1390, src: "demo price" }, { id: "late", label: "Late bird", price: 1490, src: "demo price" }, { id: "coffee", label: "Coffee Region extension (add-on)", price: 350, src: "demo price", addOn: true }],
    policy: "permitted", soldOut: true, interestSeed: 14, cap: 400, deadline: "2026-10-22T23:59",
    policyNote: "The trek's travel operator handles name transfers. In 2024 that was the only accepted way: by email, copying the new traveler, up to 30 days before departure. Swaps arranged only between students weren't valid, so this listing always uses the organizer step.",
    blurb: "A student-led trek over Thanksgiving week: early-bird, standard and late-bird spots, plus an optional Coffee Region extension sold on its own. Dates, prices and the cutoff here are illustrative, based on the 2024 trek.",
    path: "The seller emails the trek's travel operator, copying the new traveler, who then registers with the operator and pays any difference (2024 process).",
    payment: "Pay the seller only once the operator confirms the new traveler is registered. Handoff doesn't hold or move money.",
    sources: [{ text: "2024 trek: run by a Colombian travel operator and approved by WHALASA; Medellín then Cartagena; Nov 22–27/28; listed from $1,240; international flights and tips not included. Transfers only through the operator, up to 30 days before the trip.", url: "https://www.wetravel.com/trips/official-wharton-colombia-trek-2024-wonder-travel-36924295" },
              { text: "WHALASA's sign-up page lists treks to Colombia, Peru and Mexico among member benefits.", url: "https://groups.wharton.upenn.edu/WHALASA/club_signup" }] },
  { id: "e_follies", title: "Wharton Follies", club: "Wharton Follies", cat: "Shows", start: "2027-02-12T19:30", venue: "Zellerbach Theatre, Annenberg Center",
    attend: "all", tiers: [{ id: "ga", label: "General admission", price: 28, src: "2024 GAPSA rate" }, { id: "premium", label: "Premium seat", price: 33, src: "2024 GAPSA rate" }],
    policy: "permitted", soldOut: false, notOnSale: true, interestSeed: 4, cap: 900, deadline: "2027-02-11T19:30",
    blurb: "The student-written musical comedy, with two shows in February. Tickets aren't on sale yet.",
    path: "Ticket holders pass tickets on directly; tell the Follies team if your ticket is in your name.", payment: PAY_DEFAULT,
    sources: [{ text: "Two February shows at Zellerbach Theatre; shows have sold out the theatre.", url: "https://magazine.wharton.upenn.edu/issues/spring-summer-2023/funny-business" },
              { text: "2024 GAPSA rates: $28 general admission, $33 premium.", url: "https://gapsa.upenn.edu/events/wharton-follies" }] },
  /* Non-Wharton events (priority 1 in the founders' tracker): bought on Ticketmaster or AXS, passed on by an app transfer.
     Not affiliated with the venue or team; dates and prices are illustrative. */
  { id: "e_concert", title: "Indie night at The Fillmore", club: "The Fillmore Philadelphia", nonWharton: true, cat: "Shows", start: "2026-11-13T20:00", venue: "The Fillmore Philadelphia, Fishtown",
    attend: "all", tiers: [{ id: "ga", label: "General admission", price: 55, src: "demo price" }],
    policy: "permitted", soldOut: true, interestSeed: 6, cap: 2500, deadline: null,
    blurb: "A sold-out indie show at The Fillmore. Tickets move as a Ticketmaster transfer to the buyer's email. The lineup, date and prices are illustrative.",
    path: "The seller transfers it in the Ticketmaster app to the buyer's email, and the buyer accepts it there.", payment: PAY_DEFAULT },
  { id: "e_flyers", title: "Flyers vs. Rangers", club: "Philadelphia Flyers", nonWharton: true, cat: "Sports", start: "2026-11-14T19:00", venue: "Wells Fargo Center",
    attend: "all", tiers: [{ id: "upper", label: "Upper level", price: 48, src: "demo price" }, { id: "lower", label: "Lower level", price: 95, src: "demo price" }],
    policy: "permitted", soldOut: false, interestSeed: 4, cap: 19000, deadline: null,
    blurb: "An NHL home game at Wells Fargo Center. Seats move as a Ticketmaster transfer to the buyer's email. The date and prices are illustrative.",
    path: "The seller transfers it in the Ticketmaster app (AXS at some venues) to the buyer's email.", payment: PAY_DEFAULT },
  /* Train tickets. Operators' rules come from their public pages (checked Oct 2026); dates, prices and listings are demo data.
     Amtrak eTickets are listed because students already pass them on in group chats, with Amtrak's own rule shown as the buyer's risk
     (setting nonTransferable: true instead shows a cancel-for-refund page and blocks listing). NJ TRANSIT paper one-ways change hands in person.
     Neither has an organizer step (noOrganizer). openUntil: listings stay open through the travel or validity window. */
  { id: "e_amtrak", title: "Amtrak: Philadelphia → New York, Thanksgiving week", club: "Amtrak", cat: "Travel", start: "2026-11-24T06:00", end: "2026-11-29T23:00", openUntil: "2026-11-29T23:00", rangePrefix: "Travel ", venue: "Philadelphia 30th Street Station → New York Penn Station",
    attend: "all", noOrganizer: true, perPerson: 2, methods: ["file"], tiers: [{ id: "coach", label: "Northeast Regional coach", price: 89, src: "demo price" }],
    policy: "permitted", soldOut: false, interestSeed: 6, cap: 0, deadline: null,
    tag: { label: "Transfer restricted · buyer's risk", tone: "warn", icon: "alert", line: "Amtrak's terms say tickets aren't transferable. Check before you buy.", restricted: true },
    policyNote: "Students pass these on by forwarding the eTicket, and the buyer confirms in Handoff. There's no organizer step. Amtrak's terms say tickets aren't transferable and that one bought from an unauthorized third party will be voided, with no travel and no refund.",
    blurb: "A common trip at Thanksgiving. Each listing shows its train's departure and closes when that train leaves.",
    path: "The seller forwards the eTicket (PDF or barcode). The ticket stays in the seller's name: we found no Amtrak process for changing it.",
    statusNote: "Amtrak's rules: from its public pages, checked Oct 2026. Not affiliated with Amtrak.",
    sourcesNote: "Amtrak's rules above come from its public pages, checked Oct 2026, and can change.",
    payment: "Pay when it's reserved; Handoff sends you the eTicket PDF once the seller confirms. Check the train, date and stations.",
    officialUrl: "https://www.amtrak.com/api/terms-and-conditions.html",
    ticketRules: [
      "Amtrak's terms say tickets aren't transferable and that a ticket bought from an unauthorized third party will be voided, with no travel and no refund. Buying one is at your own risk.",
      "The ticket stays in the seller's name. Conductors can ask for the eTicket barcode and photo ID, and Amtrak runs random ticket checks on board.",
      "Can't use it and nobody takes it? Cancel before departure for a refund: Flex 100%, Value 70%, Sale 50% (full refund within 24 hours of buying). Percentages can change.",
      "Never buy Amtrak eVouchers or credits from another person: Amtrak voids traded eVouchers.",
    ],
    sources: [{ text: "\"Tickets are not transferable.\" Tickets bought from an unauthorized third party are voided, with no travel or refund.", url: "https://www.amtrak.com/api/terms-and-conditions.html" },
              { text: "Flex: full refund; Value: 70%; Sale: 50%. Reserved fares cancelled within 24 hours of purchase, before departure, are refunded in full. Segments not cancelled before departure are forfeited.", url: "https://www.amtrak.com/refund-and-cancellation-policy" },
              { text: "Adults may be asked for photo ID; Amtrak runs random ticket verification checks on board.", url: "https://www.amtrak.com/passenger-identification" },
              { text: "eVouchers can only be redeemed by the person named on them; traded eVouchers are voided.", url: "https://www.amtrak.com/vouchers" }] },
  { id: "e_njt", title: "NJ TRANSIT paper one-way: Trenton → New York Penn", club: "NJ TRANSIT", cat: "Travel", start: "2026-10-19T05:00", end: "2026-11-18T23:59", openUntil: "2026-11-18T23:59", rangePrefix: "Valid ", paperTicket: true, venue: "Trenton Transit Center → New York Penn Station",
    attend: "all", noOrganizer: true, perPerson: 2, methods: ["inperson"], tiers: [{ id: "ow", label: "Paper one-way ticket", price: 21, src: "demo price" }],
    policy: "permitted", soldOut: false, interestSeed: 2, cap: 0, deadline: null,
    tag: { label: "Paper ticket · in person", tone: "muted", icon: "ticket", line: "A paper ticket, handed over in person." }, // §9v item 5: was "Rules not confirmed"
    policyNote: "Handed over in person: the seller gives the buyer the unused paper ticket, and the buyer confirms in Handoff. There's no organizer step. We found no NJ TRANSIT rule for or against passing a paper ticket on.",
    statusNote: "Expiry, refund and app-ticket rules: from NJ TRANSIT's public pages, checked Oct 2026. Passing a paper ticket on: not confirmed by NJ TRANSIT. Not affiliated with NJ TRANSIT.",
    sourcesNote: "The expiry, refund and app-ticket rules above come from NJ TRANSIT's public pages, checked Oct 2026. We found no NJ TRANSIT rule on passing a paper ticket to someone else.",
    blurb: "One way to New York: SEPTA to Trenton, then NJ TRANSIT. Only unused paper one-way tickets can be listed. In this demo the listed ticket was bought on Oct 19, so it's valid through Nov 18.",
    path: "The seller hands over the paper ticket in person. NJ TRANSIT doesn't register riders, so there's no name to change.",
    payment: "Pay when it's reserved, then meet to collect the paper ticket. Check the purchase date, stations and expiry.",
    officialUrl: "https://njtransit.com/tickets/train-tickets",
    ticketRules: [
      "Only unused paper one-way tickets, handed over in person. App tickets can't be listed: NJ TRANSIT ties them to one account and phone, and bans account sharing.",
      "One-ways aren't refundable and expire 30 days after purchase. Sellers: check the date. Buyers: see the ticket before you pay.",
      "Unconfirmed: we couldn't find an NJ TRANSIT rule on passing a paper ticket to someone else. Check with NJ TRANSIT before relying on it.",
      "Student and reduced-fare passes can't be listed. Neither can SEPTA fares to Trenton: they're on a Key card or are same-day, single-rider tickets.",
    ],
    sources: [{ text: "One-way tickets bought since July 1, 2024 expire 30 days after purchase and can't be exchanged.", url: "https://njtransit.com/tickets/train-tickets" },
              { text: "\"NJ TRANSIT does not issue refunds for one-way or round-trip tickets.\"", url: "https://www.njtransit.com/refunds" },
              { text: "App tickets: one device per account; sharing accounts to access tickets is prohibited.", url: "https://www.njtransit.com/tickets/app-and-mobile-tickets" }] },
];
export const EV = Object.assign(Object.create(null), Object.fromEntries(EVENTS.map(e => [e.id, e]))); // no prototype: EV["constructor"] is undefined
EVENTS.forEach(e => { e.basePolicy = e.policy; });
export const CLUBS = [...new Set(EVENTS.filter(e => e.cat !== "Travel" && !e.nonWharton).map(e => e.club))].sort(); // rail operators, venues and teams aren't clubs

/* Puts a state's world into the shared catalog (EVENTS, EV, PEOPLE, CLUBS, CLUB_MENU, CLUB_BY, FEATURED) and sets CLOCK.
   A live world (st.mode "live": the stored document on the server, a view in the browser) installs normalized copies of its
   own events, its people when it carries them (views do; on the server withEngine installs them), and the live clock
   (setLiveClock in the browser, withEngine on the server); with no live clock it throws. Any other state is the preview: the
   sample catalog, its demo clock and its organizer-preview policy overrides, as before. Never writes into st. */
export function applyWorld(st) {
  if (st && st.mode === "live") { installLive(st); return; }
  if (engineActive) throw new Error("Handoff: withEngine runs live worlds only, so the preview can't be applied inside it.");
  if (installed !== "preview") restoreFixtures();
  CLOCK = DEMO_BASE + ((st && st.clockOffset) || 0);
  const o = (st && st.policies) || {};
  EVENTS.forEach(e => { e.policy = o[e.id] || e.basePolicy; e.policyChanged = !!o[e.id] && o[e.id] !== e.basePolicy; });
}

/* ============================================================
   FORMATTING
   ============================================================ */
export const uid = () => installed === "live" ? liveUid() : Math.random().toString(36).slice(2, 9); // live: 16 hex characters from crypto
export const clone = o => JSON.parse(JSON.stringify(o));
/* Optional official link on a suggested or unlisted event: http(s) only, kept as given. It proves nothing about eligibility or availability. */
export function cleanUrl(v) {
  const t = String(v == null ? "" : v).trim();
  if (!t) return { value: null };
  if (t.length > 300 || !/^https?:\/\/[^\s<>"]+$/i.test(t)) return { error: "Enter a full link starting with https://, or leave it blank." };
  return { value: t };
}
/* Dates and times are New York wall time everywhere (time.js): the same instant and the same words on the server (UTC) and in
   any browser. A date alone means 23:59 that day. */
export const at = iso => new Date(atMs(iso));
export const atMs = iso => wallToMs(iso.length === 10 ? iso + "T23:59" : iso);
export const mon = d => d.toLocaleDateString("en-US", { month: "short", timeZone: NY_TZ });
export function fmtDay(iso, withYear) {
  const ms = atMs(iso); const year = withYear || nyParts(ms).year !== nyParts(CLOCK).year; // the year shows unless it's this year in New York
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: NY_TZ });
}
export const fmtDate = iso => at(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: NY_TZ });
export const fmtTime = iso => at(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: NY_TZ });
export const fmtWhen = iso => iso.length === 10 ? fmtDay(iso) : `${fmtDay(iso)}, ${fmtTime(iso)}`;
export const fmtMs = ms => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: NY_TZ });
/* Forms round 2: an ordinary event added by its date alone ("YYYY-MM-DD"). It ends at 11:59 PM that day (atMs), and shows by its date. */
export const isDateOnly = iso => typeof iso === "string" && iso.length === 10;
export function fmtRange(ev) {
  if (!ev.end) return isDateOnly(ev.start) ? fmtDay(ev.start) : `${fmtDay(ev.start)} · ${fmtTime(ev.start)}`;
  const s = nyParts(atMs(ev.start)), e = nyParts(atMs(ev.end)); const pre = ev.rangePrefix || ""; // train tickets: a travel or validity window, not an event
  const sm = mon(at(ev.start)), em = mon(at(ev.end));
  // Within one day: that day and its times ("Valid Sun, Nov 8 · 12:25 PM–3:25 PM"), as a range without an end shows its time; a range
  // of days alone would read "Nov 8–8, 2026" (readiness RB-7).
  if (s.year === e.year && s.month === e.month && s.day === e.day) return `${pre}${fmtDay(ev.start)} · ${fmtTime(ev.start)}–${fmtTime(ev.end)}`;
  if (s.year === e.year && s.month === e.month) return `${pre}${sm} ${s.day}–${e.day}, ${e.year}`;
  return `${pre}${sm} ${s.day}${s.year !== e.year ? ", " + s.year : ""} – ${em} ${e.day}, ${e.year}`;
}
/* Forms round 2 (USER-INSTRUCTIONS §9j item 2): an event's date as an event picker's option or a suggestion shows it, with its actual
   start or departure time when one is known ("Thu, Nov 19, 7:00 PM"). An event added by its date alone shows the date and nothing else:
   11:59 PM is when it closes, never a start time. A train ticket with a validity window (older) shows that window, as its page does,
   since its train's own departure is on each listing. eventOption: the option's words, "<name> · <when>". */
export const eventWhen = ev => ev.openUntil ? fmtRange(ev) : fmtWhen(ev.start);
export const eventOption = ev => `${ev.title} · ${eventWhen(ev)}`;
export const money =n => "$" + (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/* Forms round 2 (§9j item 4): a Goods item's price in words. In the shared market an explicit $0 reads "Free" wherever an item's price
   is shown or written (its card and page, the share message, notes, the match email, My activity, its history); what's stored stays
   the number 0. Only an item's price: a ticket listed at $0 and a $0 budget read "$0". The preview keeps "$0" for its sample items. */
export const isFreePrice = n => installed === "live" && n === 0;
export const itemPrice = n => isFreePrice(n) ? "Free" : money(n);
const sellingWords = it => isFreePrice(it.price) ? `is giving away "${it.title}" for free` : `is selling "${it.title}" for ${money(it.price)}${it.obo ? " OBO" : ""}`; // a match note's middle
export const isoDate = ms => nyIsoDate(ms); // the New York date
export function ago(ms) {
  const d = CLOCK - ms;
  if (Math.abs(d) < 60e3) return "just now";       // stamps carry a few ms of ordering ticks past CLOCK
  if (d < 0) { const f = -d; return f < DAY ? `in ${Math.max(1, Math.round(f / HOUR))}h` : `in ${Math.round(f / DAY)}d`; }
  if (d < HOUR) return Math.floor(d / 60e3) + "m ago";
  if (d < DAY) return Math.floor(d / HOUR) + "h ago";
  return Math.floor(d / DAY) + "d ago";
}
export function untilText(ms) {
  const d = ms - CLOCK; if (d <= 0) return "passed";
  if (d < HOUR) return `in ${plural(Math.max(1, Math.round(d / 60e3)), "minute")}`;
  if (d < DAY) return `in ${plural(Math.round(d / HOUR), "hour")}`;
  return `in ${plural(Math.round(d / DAY), "day")}`;
}
export const initials = n => n.split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
/* Strict money parsing: non-negative, at most two decimals. */
export function parseMoney(v) {
  const t = String(v == null ? "" : v).trim();
  if (t === "") return { error: "Enter an amount." };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: "Enter a non-negative amount with at most two decimals." };
  return { value: Number(t) };
}
export const isInt = q => Number.isInteger(q);
export const SRC = { seeded: "demo holding (simulated)", "self-reported": "self-reported, not verified", "transferred (simulated)": "transferred via Handoff (simulated)",
  transferred: "transferred in Handoff · both of you confirmed it, not independently checked" }; // "transferred": the live source (completeTransfer)

/* ============================================================
   RULES (single source of truth; every screen and the reducer use these)
   ============================================================ */
export const isMember = (userId, club) => ((PEOPLE[userId] || {}).memberships || []).includes(club);
export const tierOf = (ev, id) => (ev.tiers || []).find(t => t.id === id) || null;
/* An add-on (like a trek's optional extension) is sold on its own but isn't a spot: ISOs, alerts and "from" prices skip it. */
export const isAddOn = (ev, l) => !!(l.tier && (tierOf(ev, l.tier) || {}).addOn);
/* Chip labels for how a listing changes hands, in plain words. */
export const orgLabel = ev => ev.organizerRequired ? "Trek operator approves" : ev.premium ? "Trip leads approve" : "Organizer approval required";
export const DIRECT_LABEL = "Seller sends it";
/* Who does the organizer step: the club, or for an operator-run trek, the travel operator. */
export const orgWho = ev => ev.organizerRequired ? "the trek operator" : ev.club;
export const OrgWho = ev => ev.organizerRequired ? "The trek operator" : ev.club;
export const spotTiers = ev => { const t = ev.tiers.filter(x => !x.addOn); return t.length ? t : ev.tiers; }; // face value quotes spots, not add-ons
/* Forms round 2: a face value is optional. An event added without one has one implicit ticket type whose price is null: no face value,
   so no price cap. faceOf is a ticket type's face value or null; faceMax and faceMin are null when no ticket type has one. */
export const faceOf = t => t && typeof t.price === "number" && Number.isFinite(t.price) ? t.price : null;
export const hasFace = ev => !!ev && (!!ev.premium || spotTiers(ev).some(t => faceOf(t) != null));
const faces = ev => spotTiers(ev).map(faceOf).filter(x => x != null);
export const faceMax = ev => { if (ev.premium) return ev.price.total; const f = faces(ev); return f.length ? Math.max(...f) : null; };
export const faceMin = ev => { if (ev.premium) return ev.price.total; const f = faces(ev); return f.length ? Math.min(...f) : null; };
/* The face value as words, live: "the face value" or, where ticket types differ, "the top face value" (capitalized: FaceName). */
export const faceName = ev => faces(ev).length > 1 && faceMin(ev) !== faceMax(ev) ? "the top face value" : "the face value";
export const FaceName = ev => { const w = faceName(ev); return w.charAt(0).toUpperCase() + w.slice(1); };
/* "$40", "$40–$75", or "" without a face value: what a card or a message says, only where one exists. */
export const faceText = ev => { const lo = faceMin(ev), hi = faceMax(ev); return hi == null ? "" : lo === hi ? money(hi) : `${money(lo)}–${money(hi)}`; };
export const nonMemberFloor = ev => { const nm = (ev.tiers || []).filter(t => !t.memberOnly); return nm.length ? Math.min(...nm.map(t => t.price)) : null; };
/* Trips: the seller's payments as of now; a listing snapshots what the seller had paid when listing,
   and the replacement owes the rest of the trip price on top of the reimbursement. */
export const paidToDate = ev => ev.price.schedule.filter(p => atMs(p.due) <= CLOCK).reduce((t, p) => t + p.amount, 0);
export function remainingItems(ev, paid) {
  let cum = 0; const out = [];
  for (const p of ev.price.schedule) { const before = cum; cum += p.amount; if (cum > paid) out.push({ ...p, amount: cum - Math.max(before, paid) }); }
  return out;
}
export const remaining = (ev, paid) => remainingItems(ev, paid == null ? paidToDate(ev) : paid).reduce((t, p) => t + p.amount, 0);
export const commitment = (ev, reimb, paid) => reimb + remaining(ev, paid) + (ev.price.fee || 0);
/* When activity stops: the event's start, or the end of a train ticket's validity window. */
export const closesAt = ev => atMs(ev.openUntil || ev.start);
export const cutoffMs = ev => ev.deadline ? atMs(ev.deadline) : closesAt(ev);
/* Forms round 2 (USER-INSTRUCTIONS §9j): how long a request for an event runs when its buyer names no date: to the event's cutoff (its
   transfer deadline when it has one, else when it closes: a train's departure, an event's start, 11:59 PM on a date-only event's day).
   requestUntil is that cutoff's New York date, which is what a request stores (a date alone ends at 11:59 PM, and the event's own cutoff
   ends it sooner: liveRequest). A cutoff at midnight belongs to the day before; with under a minute of that day left, the cutoff's own date. */
export const requestUntil = ev => { const c = cutoffMs(ev), d = isoDate(c - 60e3); return atMs(d) > CLOCK ? d : isoDate(c); };
/* When a request really stops: the end of its own date, or its event's cutoff when that comes first (Infinity with neither). */
export const requestEndMs = (i, ev) => Math.min(i && i.expires ? atMs(i.expires) : Infinity, ev ? cutoffMs(ev) : Infinity);
/* That moment in words, "Thu, Nov 19, 11:59 PM" (the year only when it isn't this one): the form's "Looking until …". */
export const fmtUntil = ms => { const year = nyParts(ms).year !== nyParts(CLOCK).year;
  return new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), hour: "numeric", minute: "2-digit", timeZone: NY_TZ }); };

/* Event-level: can anyone transact on this event right now? */
/* Time is checked before policy, so a policy change can never reopen a closed window. */
export const eventStarted = ev => closesAt(ev) <= CLOCK;
export const cutoffPassed = ev => !!ev.deadline && atMs(ev.deadline) <= CLOCK;
/* What ended an event's window, in words: a validity window's tickets expire; forms round 2: a train added as one departure has left, and
   an event added by its date alone is over at 11:59 PM that day; anything else has started. */
export function endWords(ev) {
  if (ev.openUntil) return { short: "Tickets expired", why: "The listed tickets have expired.", unpaid: "The ticket expired before it was paid for.", undone: "The ticket expired before the handoff was completed." };
  if (ev.kind === "train") return { short: "Train left", why: "The train has left.", unpaid: "The train left before it was paid for.", undone: "The train left before the handoff was completed." };
  if (isDateOnly(ev.start)) return { short: "Event over", why: "The event is over.", unpaid: "The event ended before it was paid for.", undone: "The event ended before the handoff was completed." };
  return { short: "Event started", why: "The event has started.", unpaid: "The event started before it was paid for.", undone: "The event started before the handoff was completed." };
}
export function access(ev) {
  // Non-transferable tickets stay that way whatever the date, so the refund guidance never turns into "event started".
  if (ev.nonTransferable) return { ok: false, kind: "official", short: "Can't be passed on", why: `${ev.club}'s terms say its tickets aren't transferable, so Handoff doesn't list or match them.` };
  if (eventStarted(ev)) { const w = endWords(ev); return { ok: false, kind: "closed", short: w.short, why: w.why }; }
  if (cutoffPassed(ev)) return { ok: false, kind: "closed", short: "Transfer window closed", why: `The transfer window closed ${fmtWhen(ev.deadline)}.` };
  if (ev.policy === "official") return { ok: false, kind: "official", short: "Official process only", why: "The organizer reallocates places itself, so Handoff doesn't match students for this event." };
  if (ev.notOnSale) return { ok: false, kind: "notonsale", short: "Not on sale yet", why: "Tickets aren't on sale yet, so there's nothing to list or buy. You can still get notified or post a request." };
  return { ok: true, kind: ev.policy };
}
/* Alerts and ISOs are allowed wherever the window is open and the organizer doesn't run its own allocation. */
export const demandAllowed = ev => { const k = access(ev).kind; return k !== "closed" && k !== "official"; };
/* The most a request's public budget or an alert's private max can be: the top face value, or for trips what's been paid so far. */
export const demandCap = ev => { if (ev.premium) return paidToDate(ev); const f = faceMax(ev); return f == null ? Infinity : f; }; // forms round 2: no face value, no cap
/* Person-level: may this person attend the event at all? */
export function canAttend(userId, ev) {
  if (ev.attend === "members" && !isMember(userId, ev.club)) return { ok: false, reason: `Members only: attending requires ${ev.club} membership.` };
  return { ok: true };
}
/* A members-only ticket: the event is members-only, the ticket is member-priced, or the seller marked it so. */
export const membersOnlyListing = (ev, l) => !!(ev.attend === "members" || (l && (l.membersOnly || (l.tier && (tierOf(ev, l.tier) || {}).memberOnly))));
export const hasMemberTiers = ev => (ev.tiers || []).some(t => t.memberOnly);
/* Student tickets run on the honor system, so anyone may hold and pass on a member-priced one; trips still check the roster. */
export const mayHoldMemberTier = (userId, ev) => isQuick(ev) || isMember(userId, ev.club);
/* Same idea for waitlists, ISOs and self-reported tickets: student tickets confirm membership at reserve time, trips check it up front. */
export const honorAttend = (userId, ev) => isQuick(ev) ? { ok: true } : canAttend(userId, ev);
/* Person + ticket: may this person acquire this specific ticket (tier)? */
export function canAcquire(userId, ev, listing) {
  // Student tickets: membership is the buyer's word. They confirm it before reserving (needsMember), with a warning that
  // non-members can be turned away; Handoff doesn't check rosters. Trips and treks keep the organizer's eligibility rules.
  if (isQuick(ev)) return membersOnlyListing(ev, listing) ? { ok: true, topUp: 0, needsMember: true } : { ok: true, topUp: 0 };
  const att = canAttend(userId, ev); if (!att.ok) return att;
  const tier = listing && listing.tier ? tierOf(ev, listing.tier) : null;
  if (tier && tier.memberOnly && !isMember(userId, ev.club)) {
    // A non-member can take a member-priced ticket only through the organizer (who collects the top-up), so only when the seller turned that step on.
    if (ev.tierRule === "topup" && nonMemberFloor(ev) != null && listing && (listing.viaOrganizer || listing.method === "name")) {
      const topUp = nonMemberFloor(ev) - tier.price;
      return listing.viaOrganizer
        ? { ok: true, topUp, approval: true, reason: `Member-priced ticket. As a non-member you'd pay the club a ${money(topUp)} top-up, and the organizer must approve (illustrative rule).` }
        : { ok: true, topUp, reason: `Member-priced ticket. As a non-member you'd also pay ${ev.club} a ${money(topUp)} top-up when it changes the name (illustrative rule).` };
    }
    return { ok: false, reason: `Members only: this ticket is for ${ev.club} members${ev.tierRule === "topup" ? ", unless the seller sends it through the organizer for a top-up" : ""} (illustrative rule).` };
  }
  return { ok: true, topUp: 0 };
}
/* Price cap for a listing from a holding: purchase price, never above the tier's face value.
   Trips: what the club has received for the spot, adjusted by what a transferred-in holder actually reimbursed.
   Forms round 2 (live): what the seller paid is no longer asked or used. The ticket type's face value alone caps the price, for a new
   listing and for any later edit of an older one, and without a face value there's no cap (Infinity). The preview keeps its rule. */
export function askCap(ev, holding) {
  if (ev.premium) return paidToDate(ev) + ((holding && holding.paidAdj) || 0);
  const tier = tierOf(ev, holding.tier);
  const face = tier ? faceOf(tier) : faceMax(ev); const cap = face == null ? Infinity : face;
  return installed === "live" ? cap : Math.min(holding.paid, cap);
}
/* Forms round 2 (§9j item 3): what the Sell form's asking price starts from, for a ticket being added: its ticket type's face value
   where the event gives one (the most it can be listed for; the seller changes it freely), and nothing where it doesn't or while no
   ticket type is chosen. Never guessed. */
export const askPrefill = (ev, tierId) => { const f = ev && !ev.premium ? faceOf(tierOf(ev, tierId)) : null; return f == null ? "" : String(f); };

/* Requests: effective state after deadlines, policy changes and demo rules. */
/* Order matters: final > event start > participant deadlines > cutoff > policy pause.
   Swaps already with the organizer (approval/registration) survive the cutoff until the event starts:
   the organizer received them in time and decides. reduce() persists derived expiry (sweep) so a later
   policy change or clock rewind can't revive an expired request.
   "waiting" is a backup: the listing can't meet it while another match holds the spot (see settleRequests).
   A restored backup gets a fresh seller-response window from restoredAt. */
export const FINAL = ["completed", "declined", "cancelled", "released", "expired"];
/* A reservation that lapsed unpaid: the ticket goes back to its listing. While the seller has paused that listing it isn't on sale,
   so sweepExpiry stores HOLD_LAPSED_PAUSED instead (quickState doesn't see the listing); once the seller has closed (withdrawn) it, the
   ticket goes back to the seller, never on sale, and sweepExpiry stores HOLD_LAPSED_CLOSED (follow-on B2). */
const HOLD_LAPSED = "The reservation ended without payment, so it went back on sale.";
const HOLD_LAPSED_PAUSED = "The reservation ended without payment. The seller has paused the listing, so it isn't on sale right now.";
const HOLD_LAPSED_CLOSED = "The reservation ended without payment. The seller has closed the listing.";
const HOLD_LAPSED_REPLY = "The reservation ended without payment, so the reply closed."; // a reply held for one request: it closes
/* The reason an unpaid hold that ran out is stored with (sweepExpiry): quickState's HOLD_LAPSED, unless the seller has closed or paused the
   listing, where nothing goes back on sale. Exported for the pages: a card whose own clock ends a hold before the stored lapse reaches it
   says what will be stored, never "went back on sale" on a paused or closed listing (FINAL-1, rb-check B1). */
export const lapsedReason = (reason, l) => reason !== HOLD_LAPSED || !l ? reason : l.withdrawnAt ? HOLD_LAPSED_CLOSED : l.pausedAt ? HOLD_LAPSED_PAUSED : reason;
/* Follow-on B2 (live): why a seller closed a listing or an item (withdraw, withdrawItem): optional, stored only when given, and seen by the
   seller alone. Closing never counts as a sale, whatever the reason: it sets no soldAt and completes nothing. */
export const CLOSE_REASONS = Object.freeze({ soldElsewhere: "Sold elsewhere", noLongerSelling: "No longer selling" });
const closeReasonOk = r => r == null || (typeof r === "string" && Object.prototype.hasOwnProperty.call(CLOSE_REASONS, r));
const closedBy = reason => `Closed by seller${reason ? ": " + CLOSE_REASONS[reason].toLowerCase() : ""}`; // the seller's history line
/* Christine's flow (r.flow "quick"): pending (an offer) / countered / proposed (an ISO reply) wait for one answer until r.expiresAt;
   accepted (reserved) waits for payment until r.holdUntil; once the buyer says they paid (paid, confirmed, sent), nothing lapses
   on its own: if it goes wrong, either side reports a problem. */
export function quickState(r, ev) {
  if (["paid", "confirmed", "sent"].includes(r.status)) return { st: r.status };
  // Follow-on B5 (invite to pay): a request to buy waits for the seller's invitation, and an invitation for the buyer to reserve it,
  // until its own deadline or, when one comes first, a train's departure, the event's start or the transfer cutoff. One reason each.
  if (invitePre(r) && (CLOCK >= r.expiresAt || (r.departsAt && atMs(r.departsAt) <= CLOCK) || eventStarted(ev) || cutoffPassed(ev))) return { st: "expired", reason: r.status === "requested" ? REQUEST_LAPSED : INVITE_LAPSED };
  if (r.departsAt && atMs(r.departsAt) <= CLOCK) return { st: "expired", reason: "The train left before it was paid for." };
  if (eventStarted(ev)) return { st: "expired", reason: endWords(ev).unpaid };
  if (["pending", "countered", "proposed"].includes(r.status) && CLOCK >= r.expiresAt) return { st: "expired", reason: r.status === "pending" ? "The offer expired before the seller answered." : r.status === "countered" ? "The counter-offer expired before the buyer answered." : "The reply expired before the buyer answered." };
  // A hold that ran out once the transfer window had closed (holdEnd cuts a hold to the cutoff) didn't go back on sale: it says the window
  // closed, as a train's departure and the event's start do above (readiness RB-4).
  if (r.status === "accepted" && CLOCK >= r.holdUntil) return { st: "expired", reason: r.isoReply ? HOLD_LAPSED_REPLY : cutoffPassed(ev) ? `The transfer window closed ${fmtWhen(ev.deadline)} before it was paid for.` : HOLD_LAPSED };
  if (cutoffPassed(ev)) return { st: "expired", reason: `The transfer window closed ${fmtWhen(ev.deadline)} before it was paid for.` };
  if (ev.policy === "official") return { st: "paused", from: r.status, reason: `The organizer's policy changed to "${POLICY[ev.policy].label}". Nothing moves until it changes back.` };
  return { st: r.status };
}
export function rState(r) {
  if (FINAL.includes(r.status)) return { st: r.status, reason: r.reason };
  const ev = EV[r.eventId];
  if (r.flow === "quick") return quickState(r, ev);
  if (r.departsAt && atMs(r.departsAt) <= CLOCK) return { st: "expired", reason: "The train left before the handoff was completed." };
  if (eventStarted(ev)) return { st: "expired", reason: endWords(ev).undone };
  const blocked = ev.policy === "official"; // the seller couldn't act, so an expiry then isn't the seller's fault
  if (r.status === "pending" && CLOCK >= onClock(r.restoredAt || r.createdAt) + RULES.sellerResponseHours * HOUR) return { st: "expired", reason: blocked ? "Expired while the organizer's policy blocked transfers." : `The seller didn't respond within ${RULES.sellerResponseHours} hours (demo rule).` };
  if (r.status === "accepted" && CLOCK >= onClock(r.acceptedAt) + RULES.startOfficialHours * HOUR) return { st: "expired", reason: blocked ? "The hold lapsed while the organizer's policy blocked transfers." : r.flow === "peer" ? `The hold lapsed: the seller didn't send it within ${RULES.startOfficialHours} hours (demo rule).` : `The hold lapsed: the organizer's steps weren't started within ${RULES.startOfficialHours} hours (demo rule).` };
  if (cutoffPassed(ev) && ["pending", "accepted", "waiting"].includes(r.status)) return { st: "expired", reason: r.status === "waiting" ? `The transfer window closed ${fmtWhen(ev.deadline)} while this was a backup request.` : `The transfer window closed ${fmtWhen(ev.deadline)} before ${r.flow === "peer" ? "the seller sent it" : r.status === "pending" ? "the seller accepted" : "this reached the organizer"}.` };
  // A direct handoff the seller has already sent isn't paused: no organizer is involved, and the buyer can still confirm.
  if (ev.policy === "official" && r.status !== "sent") return { st: "paused", from: r.status, reason: `The organizer's policy changed to "${POLICY[ev.policy].label}". Nothing moves until it changes back or the organizer decides.`,
    afterCutoff: ["approval", "registration"].includes(r.status) && cutoffPassed(ev) };
  if (["approval", "registration"].includes(r.status) && cutoffPassed(ev)) return { st: r.status, afterCutoff: true };
  return { st: r.status };
}
export const RESERVING = ["accepted", "sent", "approval", "registration", "paid", "confirmed", "proposed"]; // "sent": waiting for the buyer to confirm; "proposed": an ISO reply held for that buyer's answer
/* Which path a match follows. Default "peer": the seller sends it and the buyer confirms. With the seller's optional
   organizer step on: "approval" for trips, when the club approves swaps, or when a top-up is due; otherwise "direct" (the club updates the name). */
export const flowFor = (ev, l, r) => !l.viaOrganizer ? "peer" : (ev.premium || ev.policy === "approval" || (r.topUp || 0) > 0 ? "approval" : "direct"); // trip leads always approve
export const reserves = e => RESERVING.includes(e.st) || (e.st === "paused" && RESERVING.includes(e.from));
export const isOpenReq = e => !FINAL.includes(e.st);
/* Follow-on B5 (invite to pay): a new-flow record that holds nothing yet, a request to buy or an invitation. Neither is in RESERVING,
   so neither takes stock, and several sellers can invite the same buyer; the per-person limit is checked when one is reserved. */
const invitePre = r => r.inviteFlow === true && (r.status === "requested" || r.status === "invited");
/* Why a request to buy or an invitation ended on its own (quickState, sweepExpiry's notes). */
const REQUEST_LAPSED = "The request ended before the seller sent an invitation.";
const INVITE_LAPSED = "The invitation ended before it was reserved.";
/* The hold a new-flow reservation gets: 15 minutes at most (reserve), also what invite-shape allows. */
const INVITE_HOLD_MS = 15 * 60e3;
/* The shape of a new-flow record (invariantViolations, "invite-shape"): the marker is true and only on a direct-payment ticket record;
   its status is one the new flow uses (never pending, countered or proposed: those are the older offer, counter and held reply); it was
   invited before it was reserved (a request to buy has neither stamp, an invitation has no reservation yet); its hold is 15 minutes at
   most; and it carries payment instructions only once it's reserved. */
const INVITE_STATUSES = ["requested", "invited", "accepted", "paid", "confirmed", "sent", "completed", "declined", "cancelled", "released", "expired"];
const inviteShapeOk = r => {
  const num = v => typeof v === "number" && Number.isFinite(v);
  if (r.inviteFlow !== true || r.flow !== "quick" || !INVITE_STATUSES.includes(r.status)) return false;
  if (r.invitedAt !== undefined && !num(r.invitedAt)) return false;
  if (r.acceptedAt !== undefined && !(num(r.acceptedAt) && num(r.invitedAt) && r.acceptedAt >= r.invitedAt)) return false;
  if (r.status === "requested" && (r.invitedAt !== undefined || r.acceptedAt !== undefined)) return false;
  if (r.status === "invited" && (r.invitedAt === undefined || r.acceptedAt !== undefined)) return false;
  if (["accepted", "paid", "confirmed", "sent", "completed", "released"].includes(r.status) && r.acceptedAt === undefined) return false;
  if (r.acceptedAt === undefined ? (r.holdUntil !== undefined || r.pay !== undefined || r.paidVia !== undefined) : !(num(r.holdUntil) && r.holdUntil - r.acceptedAt <= INVITE_HOLD_MS)) return false;
  return true;
};
/** Follow-on B5: the problem reason a buyer can report on their new-flow reservation that ended (reportProblem). */
export const LATE_PAYMENT = "I paid, but the reservation ended";
export const baseSt = e => e.st === "paused" ? e.from : e.st; // a policy pause keeps the underlying step
export function requestDeadlines(r) {
  const ev = EV[r.eventId]; const e = rState(r); const b = baseSt(e); // a policy pause doesn't stop these clocks
  if (r.flow === "quick") {
    if (["pending", "countered", "proposed"].includes(b)) return { next: r.expiresAt, who: b === "pending" ? "seller" : "buyer", cutoff: null };
    if (b === "requested" || b === "invited") return { next: r.expiresAt, who: b === "requested" ? "seller" : "buyer", cutoff: null }; // B5: the seller invites; the buyer reserves
    if (b === "accepted") return { next: r.holdUntil, who: "buyer", cutoff: null };
    if (b === "paid" && r.payDisputedAt && !r.paymentConfirmedAt) return { next: r.releaseAfter, who: "seller", cutoff: null }; // the seller said the money hasn't arrived: they may release it after this
    return { next: null, who: b === "paid" || b === "confirmed" ? "seller" : b === "sent" ? "buyer" : null, cutoff: null };
  }
  const dep = r.departsAt ? atMs(r.departsAt) : Infinity; // a train ticket's own departure ends everything
  const cut = Math.min(cutoffMs(ev), dep); const end = Math.min(closesAt(ev), dep);
  let next = null, who = null;
  if (b === "pending") { next = Math.min(onClock(r.restoredAt || r.createdAt) + RULES.sellerResponseHours * HOUR, cut); who = "seller"; }
  if (b === "waiting") { next = cut; who = null; }
  if (b === "accepted") { next = Math.min(onClock(r.acceptedAt) + RULES.startOfficialHours * HOUR, cut); who = "seller"; }
  if (b === "approval" || b === "registration") { next = end; who = "organizer"; }
  if (b === "sent") { next = end; who = "buyer"; }
  return { next, who, cutoff: ev.deadline ? cut : null };
}
/* Per-person cap: what someone holds plus what's reserved for them and what they've asked for. */
export function personLoad(s, userId, eventId, exceptRequestId) {
  const ev = EV[eventId]; const addOn = tier => !!(tier && (tierOf(ev, tier) || {}).addOn); // add-ons aren't spots, so they don't count
  const held = s.holdings.filter(h => h.userId === userId && h.eventId === eventId && !addOn(h.tier)).reduce((t, h) => t + h.qty, 0);
  // A request to buy or an invitation (follow-on B5) holds nothing and promises nothing, so it isn't counted until it's reserved.
  const inflight = s.requests.filter(r => r.buyerId === userId && r.eventId === eventId && r.id !== exceptRequestId && !invitePre(r) && isOpenReq(rState(r)) && !addOn((s.listings.find(l => l.id === r.listingId) || {}).tier)).reduce((t, r) => t + r.qty, 0);
  return held + inflight;
}
export const personCap = ev => ev.perPerson || RULES.maxSpotsPerPerson;

/* OBO ("or best offer"): a seller can let buyers offer below the asking price; one round, the seller accepts or declines.
   A request carries the agreed price (its offer, or the asking price). Offers are always below the ask, so ticket caps still hold. */
export const reqPrice = (r, l) => r.price != null ? r.price : l.ask;
/* Quantity (USER-INSTRUCTIONS §9n). A seller's N tickets for one event at one price are one listing (listed: N), with one link.
   qtyLine: how a count at a price reads, "2 tickets · $25 each" (one: "1 ticket · $25").
   totalOf: what a request or reservation comes to, its quantity times the agreed price (its own, or the listing's asking price when
   it has none yet: a quantity being chosen), which is what the buyer sees before reserving and what reserve asks them to pay.
   buyerMax: the most this person may ask for on a listing now, which is what requestToBuy would accept: what's available, and what
   the event's per-person limit still leaves them (what they hold and have reserved count; requests and invitations hold nothing).
   The page offers a quantity only when it's 2 or more. Works on the server's document and on a signed-in person's view. */
export const qtyLine = (qty, price, unit = "ticket") => `${plural(qty, unit)} · ${money(price)}${qty > 1 ? " each" : ""}`;
export const totalOf = (r, l) => reqPrice(r, l) * r.qty;
/* §9x item 1 (live, SELL6-N1): a free ticket. An exchange agreed at $0 each has a total of zero, so nothing is paid: its seller needs no
   way to be paid to invite the buyer (invite, inviteRequester, answerRequest), and reserving it (reserve) copies no payment details
   and skips both payment steps: the reservation goes straight to "confirmed", the stage where the seller sends the ticket, with no
   paidAt, paymentConfirmedAt or pay. Everything else is as for any ticket: the invitation holds nothing, the reservation holds the
   ticket (availability, the per-person limit, the member confirmation), and the buyer's "Received" completes it. freeDeal: the
   record is agreed at $0. freeSkipped: it's past the reservation without ever having been marked paid (one reserved at $0 before
   this, with payment details and the old steps, has paidAt or is still "accepted", and keeps those steps). */
export const freeDeal = r => !!r && r.flow === "quick" && r.price === 0;
export const freeSkipped = r => freeDeal(r) && r.paidAt === undefined && ["confirmed", "sent", "completed"].includes(r.status);
export function buyerMax(s, userId, l) {
  const ev = l ? EV[l.eventId] : null; if (!ev || !userId || l.sellerId === userId) return 0;
  return Math.max(0, Math.min(listingNumbers(s, l).available, personCap(ev) - personLoad(s, userId, ev.id)));
}
export function checkOffer(raw, ask, obo, minOffer, quick) {
  if (raw == null || String(raw).trim() === "") return { price: ask, isOffer: false };
  if (!obo) return { error: quick ? "This seller isn't taking offers. Tap “I'll take it” to reserve it at the asking price." : "This seller isn't taking offers. Send a request at the asking price." };
  const om = parseMoney(raw); if (om.error) return { error: "Offer: " + om.error };
  if (om.value <= 0) return { error: "Offer: enter more than $0." };
  if (om.value >= ask) return { error: `An offer has to be below the asking price (${money(ask)}). ${quick ? "To pay the asking price, tap “I'll take it” instead." : "To pay the asking price, send a request without an offer."}` };
  if (minOffer && om.value < minOffer) return { error: `This seller takes offers from ${money(minOffer)}.` };
  return { price: om.value, isOffer: true };
}
/* Seller's optional floor for offers, shown to buyers ("offers from $X"). Blank means any offer below the ask. */
export function checkMinOffer(raw, ask) {
  if (raw == null || String(raw).trim() === "") return { value: null };
  const m = parseMoney(raw); if (m.error) return { error: "Lowest offer: " + m.error };
  if (m.value <= 0 || m.value >= ask) return { error: `Lowest offer has to be above $0 and below your asking price (${money(ask)}).` };
  return { value: m.value };
}
/* A private alert's settings: how many (up to the per-person limit) and an optional max per unit, capped like a request's budget.
   A field left out keeps the alert's current value; a blank or null max means any price. */
export function alertFields(ev, a, cur) {
  const lim = personCap(ev), u = unitOf(ev);
  const qty = a.qty === undefined ? (cur && cur.qty) || 1 : a.qty;
  if (!isInt(qty) || qty < 1 || qty > lim) return { error: lim === 1 ? `You can be alerted for 1 ${u} (the per-person limit for this event).` : `Choose between 1 and ${lim} ${u}s${ev.perPerson ? " (the per-person limit for this event)" : ""}.` };
  let max = a.max === undefined && cur && cur.max != null ? cur.max : null;
  if (a.max != null && String(a.max).trim() !== "") { const pm = parseMoney(a.max); if (pm.error) return { error: "Maximum price: " + pm.error }; max = pm.value; }
  const top = demandCap(ev);
  if (max != null && max > top) return { error: ev.premium ? `Sellers can't ask more than they've paid (${money(top)}), so keep your maximum at or below it.`
    : installed === "live" ? `${FaceName(ev)} is ${money(top)}, so keep your maximum at or below it.` : `The top ${u} price is ${money(top)}, so keep your maximum at or below it.` }; // forms round 2: the face value's words, live
  return { qty, max };
}
/* An Amtrak eTicket is for one train (listing.departsAt, copied onto its requests): it closes when that train leaves. */
export const departed = l => !!l.departsAt && atMs(l.departsAt) <= CLOCK;
/* Why nothing more on a listing can be sold, in words (its train has left, the event has started or its tickets expired, its transfer
   window closed), or null while it could still sell. Only time ends a sale: a policy (the preview's) or a pause can change back, so neither
   does. Live, a ticket that comes back after that stays with its seller, and the release and a buyer's cancel say so (W1 fix, OBS-2). */
export const saleEndedWhy = (ev, l) => l && departed(l) ? "The train has left."
  : eventStarted(ev) ? endWords(ev).why
  : cutoffPassed(ev) ? `The transfer window closed ${fmtWhen(ev.deadline)}.` : null;
/* An eTicket on a train with a validity window names its own train on each listing (departsAt). Forms round 2: a train added as one
   departure is that train, so its listings don't (it closes when it leaves, as an event does at its start). */
export const needsTrain = ev => ev.cat === "Travel" && !ev.paperTicket && !!ev.openUntil;
/* Christine's student-to-student flow, for every ticket except club trips and operator-run treks (those keep the request and
   organizer-approval flow, because the club or operator holds the traveler list). "I'll take it" reserves at the asking price
   for RULES.holdMinutes; "Make offer" waits for the seller to accept, counter once or decline. The buyer pays first (live: with one
   of the seller's payment methods, copied onto the exchange as it's reserved; the preview: a Venmo or PayPal handle) and taps "I've sent
   payment" (the preview: "Paid"); the seller taps "Payment received" and transfers it by the listing's method; the buyer taps "Received". */
export const isQuick = ev => !!ev && !ev.premium && !ev.organizerRequired;
export const METHODS = {
  file:     { label: "PDF or QR code",               verb: "send the PDF or QR code" }, // the seller sends it after the payment (live); the preview simulates delivery
  app:      { label: "Ticketmaster or AXS transfer", verb: "transfer it in Ticketmaster or AXS" }, // never "in the app", which reads as Handoff (readiness RC-6)
  name:     { label: "Organizer name change",        verb: "request the name change" },
  inperson: { label: "In person (paper ticket)",     verb: "hand it over" },
};
/* Payment methods (follow-on B1; C-CONTRACT §2): how a seller is paid outside Handoff. A person saves one or two on their profile, the
   first preferred; each exchange keeps a copy taken as it's reserved (snapPay, live only). Kind "other" is a handle saved before B1 under
   "Venmo or PayPal": read word for word, never given a provider's name and never saved again. Handoff checks only the format: it doesn't
   process, hold, check or refund payments. checkPayMethods is the one check, for the page beside each field and for the store before it
   saves. */
export const PAY_KINDS = Object.freeze(["venmo", "zelle", "paypal"]);
/* §9q item 5: the kinds offered to someone adding a method now. PayPal stays a kind (PAY_KINDS): a person who saved it keeps and can
   re-save it, and every exchange keeps the payment details it was reserved with. It just isn't offered as a new choice. */
export const PAY_NEW_KINDS = Object.freeze(["venmo", "zelle"]);
export const PAY_LABELS = Object.freeze({ venmo: "Venmo", zelle: "Zelle", paypal: "PayPal", other: "Payment details" });
const PAY_ERRORS = Object.freeze({
  venmo: "Venmo: enter your username, like @ann-lee.",
  zelle: "Zelle: enter the email or US mobile number enrolled with Zelle.",
  paypal: "PayPal: up to 60 characters, on one line.",
  paypalEmpty: "PayPal: enter your PayPal username or email.",
  kind: "Choose Venmo, Zelle or PayPal.",
  many: "Save one or two ways to be paid.",
});
const PAY_UNSAFE = /[\u0000-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/; // line breaks, controls, half a character
/* One method's value as typed: { value } stored normalized, or { error } in the words shown beside its field. */
function payValue(kind, raw) {
  const err = { error: PAY_ERRORS[kind] };
  if (typeof raw !== "string" || raw.length > 400) return err;
  const s = raw.trim();
  if (PAY_UNSAFE.test(s)) return err;
  if (kind === "venmo") { const u = s.startsWith("@") ? s.slice(1) : s; return /^[A-Za-z0-9_-]{5,30}$/.test(u) ? { value: u } : err; }
  if (kind === "zelle") {
    if (s.includes("@")) { const e = s.toLowerCase(); return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? { value: e } : err; }
    const d = s.replace(/[\s().+-]/g, ""); const ten = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
    return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? { value: "+1" + ten } : err; // a US number: area code and exchange start 2-9
  }
  if (!s) return { error: PAY_ERRORS.paypalEmpty };
  return Array.from(s).length <= 60 ? { value: s } : err; // PayPal: as typed (a username or an email), as the handle always was
}
/** Checks the methods a person saves (C-CONTRACT §1 saveMyProfile): 0 to 2, of different kinds, each Venmo, Zelle or PayPal, never
    "other". Returns them normalized, in order (the first is preferred), or the first problem and which method it's about (null: the list). */
export function checkPayMethods(list) {
  if (!Array.isArray(list)) return { ok: false, index: null, error: PAY_ERRORS.kind };
  if (list.length > 2) return { ok: false, index: null, error: PAY_ERRORS.many };
  const methods = [], seen = new Set();
  for (let index = 0; index < list.length; index++) {
    const m = list[index]; const kind = m && typeof m === "object" && !Array.isArray(m) ? m.kind : undefined;
    if (!PAY_KINDS.includes(kind)) return { ok: false, index, error: PAY_ERRORS.kind };
    if (seen.has(kind)) return { ok: false, index, error: `You've already added ${PAY_LABELS[kind]}.` };
    const v = payValue(kind, m.value); if (v.error) return { ok: false, index, error: v.error };
    seen.add(kind); methods.push({ kind, value: v.value });
  }
  return { ok: true, methods };
}
/** A method's destination as people read it: "@ann-lee", "ann@upenn.edu", "(215) 555-0142"; PayPal and a legacy handle as typed. */
export function formatPayMethod(m) {
  if (!m || typeof m !== "object" || typeof m.value !== "string") return "";
  if (m.kind === "venmo") return "@" + m.value;
  if (m.kind === "zelle" && /^\+1\d{10}$/.test(m.value)) { const d = m.value.slice(2); return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; }
  return m.value;
}
/** A profile's methods as Handoff uses them: the saved ones (pay_methods; a known kind with a value, at most two, no kind twice), or when
    none are saved, a handle saved before B1 as one method of kind "other", word for word; or none. The store and the engine read
    profiles through it. */
export function readPayMethods(saved, legacyHandle) {
  const out = [], seen = new Set();
  for (const m of Array.isArray(saved) ? saved : []) {
    if (out.length === 2) break;
    if (!m || typeof m !== "object" || !PAY_KINDS.includes(m.kind) || seen.has(m.kind) || typeof m.value !== "string" || !m.value.trim() || m.value.length > 254) continue;
    seen.add(m.kind); out.push({ kind: m.kind, value: m.value });
  }
  if (out.length) return out;
  return typeof legacyHandle === "string" && legacyHandle.trim() ? [{ kind: "other", value: legacyHandle }] : [];
}
/* A person's methods in the engine (live: enginePeople installs them; the preview's sample people have none). */
const payMethodsOf = userId => { const p = PEOPLE[userId]; return p && Array.isArray(p.payMethods) ? p.payMethods : []; };
/* An exchange's payment snapshot (snapPay) is well formed: 1-2 methods of known kinds with values, and the method the buyer said they
   used (markPaid's via) one of them. */
const payShapeOk = r => (r.pay === undefined || (Array.isArray(r.pay) && r.pay.length >= 1 && r.pay.length <= 2
  && r.pay.every(m => !!m && (PAY_KINDS.includes(m.kind) || m.kind === "other") && typeof m.value === "string" && !!m.value.trim())))
  && (r.paidVia === undefined || (Array.isArray(r.pay) && r.pay.some(m => m.kind === r.paidVia)));
export const namesCheckedFor =(ev, answer) => !!ev.namesChecked || (!ev.methods && !!answer);
export const methodsFor = (ev, namesChecked) => ev.methods || (namesChecked ? ["name"] : ev.club ? ["file", "app", "name"] : ["file", "app"]); // names checked at entry: only a name change works; an event that names no organizer (simplification batch) has no one to change a name
/* Simplification batch: an ordinary event added live may leave out its organizer and its category (createEvent). What still needs an
   organizer says so: a name change goes through them, and a members-only event or ticket is for their members. */
export const NO_ORG_NAME = "A name change goes through the organizer, and this event doesn't name one. Choose another way to transfer it.";
export const NO_ORG_MEMBERS = "A members-only ticket is for a club's members, and this event doesn't name its club. Leave Members-only off.";
/* §9q item 5 (live): a members-only ticket for an event that names no club carries the club its seller named (listing.memberClub), so
   buyers read whose members it's for before they request or reserve. An event with a club keeps its own. memberClubOf: the club a
   members-only listing is for; memberClubName: a named club as stored (2 to 80 characters, one line), or null. */
export const NO_MEMBER_CLUB = "Name the club whose members can use this ticket (2 to 80 characters), or leave Members-only off.";
export const memberClubOf = (ev, l) => (ev && ev.club) || (l && typeof l.memberClub === "string" && l.memberClub) || "";
export function memberClubName(raw) { const c = oneLine(raw, 2, 80); return c && HAS_WORD.test(c) ? c : null; }
/* §9v items 4 and 5 (live, SELL5-M2): a club is informational, and a ticket's restrictions are the concrete conditions.
   - A club named on a listing (listing.club): where the event names none, its seller may name one, kept on their own listing and never
     written to the shared event (deliveryFor). It restricts nothing: a ticket tagged GCC is open to everyone unless a restriction below
     applies. listingClubOf: the event's club, else the one named on the listing (or, on an older listing, its members-only club); orgOf:
     who changes a name, in words ("the organizer" when no one is named).
   - What a buyer reads before they ask to buy or reserve (listingRestrictions), in plain words and in this order: "<club> members only"
     (the event's members-only rule, a member-priced ticket type or the seller's choice; the buyer still confirms they're a member), "The
     organizer must change the name on the ticket" (names checked at the event's door, or the seller's choice, which needs the organizer:
     the event's club or the one named on the listing), the seller's own short words (listing.restriction: one line, 3 to 80 characters;
     restrictionText), and, on a listing posted before this, the old seller flag (listing.restricted), in the words it was posted with.
     None reported or known: nothing. A train's carrier rule stays its event's own tag (transferTag), as before.
   Stored listings are never rewritten: an older one's members-only, names-checked and flag read through the same words. */
export const NAME_CHANGE_RULE = "The organizer must change the name on the ticket";
export const FLAGGED_RULE = "The seller flagged a transfer restriction: the ticket's terms may not allow resale or a name change";
export const RESTRICTION_MAX = 80;
export const NO_RESTRICTION_TEXT = `Describe the restriction in a few words (3 to ${RESTRICTION_MAX} characters), or leave it out.`;
export const NO_LISTING_CLUB = "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank.";
export function restrictionText(raw) { const t = oneLine(raw, 3, RESTRICTION_MAX); return t && HAS_WORD.test(t) ? t : null; }
export const listingClubOf = (ev, l) => (ev && ev.club) || (l && typeof l.club === "string" && l.club) || (l && l.membersOnly && typeof l.memberClub === "string" && l.memberClub) || "";
export const orgOf = (ev, l) => listingClubOf(ev, l) || "the organizer";
export function listingRestrictions(ev, l) {
  const out = [];
  if (!ev || !l) return out;
  if (isQuick(ev) && membersOnlyListing(ev, l)) { const c = memberClubOf(ev, l); out.push({ kind: "members", text: c ? `${c} members only` : "Members only" }); }
  if (isQuick(ev) && ev.cat !== "Travel" && (ev.namesChecked || l.namesChecked === true || l.method === "name")) out.push({ kind: "name", text: NAME_CHANGE_RULE });
  if (typeof l.restriction === "string" && l.restriction) out.push({ kind: "own", text: l.restriction });
  if (l.restricted === true) out.push({ kind: "flagged", text: FLAGGED_RULE });
  return out;
}
/* Sell and Request follow-up (USER-INSTRUCTIONS §9m item 1): an ordinary event's ticket carries no promised delivery method unless its
   seller chose one. A listing posted without one (live: deliveryFor) stores none, and everyone reads one neutral rule in their own
   voice (transferWords): the seller "Send the ticket to the buyer after payment.", the buyer and anyone else that the seller does.
   A listing with a recorded method keeps that method's words everywhere (METHODS and the exchange's own lines): one its seller chose
   before the follow-up, or the one way its event allows (a train's eTicket, a trek's or a names-checked event's organizer name
   change). Nothing rewrites a stored listing. */
export const SEND_AFTER_PAYMENT = "Send the ticket to the buyer after payment.";
export const SEND_ONCE_RESERVED = "Send the ticket to the buyer once they reserve it."; // §9x item 1: the same rule for a free ticket
/** The listing's recorded transfer method ("file", "app", "name", "inperson"), or null when it promises none. */
export const methodOf = l => l && typeof l.method === "string" && Object.prototype.hasOwnProperty.call(METHODS, l.method) ? l.method : null;
/** The neutral rule for a listing that promises no method, as `who` reads it ("seller", "buyer", or anyone else); null when the
    listing has a recorded method, whose own words stand. */
export const transferWords = (l, who, free = !!l && l.ask === 0) => methodOf(l) ? null
  : free ? (who === "seller" ? SEND_ONCE_RESERVED : who === "buyer" ? "The seller sends you the ticket once you reserve it." : "The seller sends the ticket to the buyer once it's reserved.") // §9x item 1: a free ticket waits for no payment (free: the listing's price is $0, or the exchange's own on its card)
  : who === "seller" ? SEND_AFTER_PAYMENT : who === "buyer" ? "The seller sends you the ticket after payment." : "The seller sends the ticket to the buyer after payment.";
/* Text parts joined with " · ", leaving out any that are empty (an event without an organizer or a category reads cleanly). */
export const dotJoin = (...xs) => xs.filter(Boolean).join(" · ");
/* Offers, counters and ISO replies: RULES.offerHours, or RULES.offerHoursSoon when the ticket is used within a day
   (the event, the train's departure, or the end of a pass's validity window). */
export const offerEnd = (ev, from, l) => { const f = onClock(from), dep = l && l.departsAt ? atMs(l.departsAt) : Infinity, use = Math.min(dep, closesAt(ev));
  return Math.min(f + (use - f < DAY ? RULES.offerHoursSoon : RULES.offerHours) * HOUR, cutoffMs(ev), dep); };
export const holdMs = byBuyer => byBuyer ? RULES.holdMinutes * 60e3 : RULES.offerHoldHours * HOUR;
export const holdEnd = (ev, from, l, byBuyer) => Math.min(onClock(from) + holdMs(byBuyer), cutoffMs(ev), l && l.departsAt ? atMs(l.departsAt) : Infinity);
// The hold actually given, for messages: shorter than the rule when the cutoff, event start or train comes first.
export const holdLen = (r, from) => { const m = Math.max(1, Math.round((r.holdUntil - onClock(from)) / 60e3)); return m % 60 ? plural(m, "minute") : plural(m / 60, "hour"); };
/* How long an offer, a counter or a held reply stays open, for messages (until: its offerEnd): the rule's whole hours ("6 hours"), or
   what's left when the transfer cutoff, the event or a train comes first ("8 minutes", "2 hours 30 minutes"). Counted from the start of
   the minute, as offerEnd counts; never more than is left, and at least a minute. The page says the same before sending. */
export const openLen = (until, from) => { const m = Math.max(1, Math.floor((until - onClock(from)) / 60e3)), h = Math.floor(m / 60), r = m % 60;
  return !h ? plural(r, "minute") : r ? `${plural(h, "hour")} ${plural(r, "minute")}` : plural(h, "hour"); };
export const disputeEnd = ev => ev.end ? atMs(ev.end) : ev.openUntil ? atMs(ev.openUntil) : atMs(ev.start) + 6 * HOUR; // reports stay open until the event ends
export const strikesOf = (s, id) => (s.strikes || {})[id] || 0;
export const tradingPaused = (s, id) => strikesOf(s, id) >= RULES.strikesToPause;
/* Inventory. Stored: listing.listed, holding.qty. Everything else is derived, so nothing double-counts.
   available is what anyone could take now: none while the listing is withdrawn, its train has left, or its seller paused it (live:
   pausedAt). A pause keeps the tickets with the listing (outstanding, holdingFree), so they can't be listed twice meanwhile. */
export function listingNumbers(s, l) {
  if (l.numbers && !engineActive) return l.numbers; // a live view: the server's counts (only the server sees every request); never trusted inside withEngine
  let reserved = 0, completed = 0;
  for (const r of s.requests) {
    if (r.listingId !== l.id) continue;
    const e = rState(r);
    if (e.st === "completed") completed += r.qty; else if (reserves(e)) reserved += r.qty;
  }
  const available = l.withdrawnAt || l.pausedAt || departed(l) ? 0 : Math.max(0, l.listed - reserved - completed);
  return { reserved, completed, available };
}
export const outstanding = (s, l) => { const n = listingNumbers(s, l); return l.withdrawnAt ? n.reserved : Math.max(0, l.listed - n.completed); };
export const holdingFree = (s, h) => Math.max(0, h.qty - s.listings.filter(l => l.holdingId === h.id).reduce((t, l) => t + outstanding(s, l), 0));
/* Live: the seller paused this listing (pausedAt), and the pause is what keeps it off sale: it isn't withdrawn, its train hasn't left,
   its event is open and not everything on it has been transferred. Its seller can resume it (resumeListing). Works on a view too. */
export const listingPaused = (s, l) => !!l.pausedAt && !l.withdrawnAt && !departed(l) && access(EV[l.eventId]).ok && listingNumbers(s, l).completed < l.listed;
/* How many tickets a pause is keeping off sale now (neither reserved nor transferred): what resuming would make available. */
export const pausedUnits = (s, l) => { if (!listingPaused(s, l)) return 0; const n = listingNumbers(s, l); return Math.max(0, l.listed - n.reserved - n.completed); };
export function listingState(s, l) {
  const n = listingNumbers(s, l); const a = access(EV[l.eventId]);
  if (l.withdrawnAt) { // live (follow-on B2): its seller closed it ("Close listing"); the preview keeps its words
    const live = installed === "live";
    return { key: "withdrawn", label: n.reserved ? (live ? "Closed · exchange still in progress" : "Withdrawn · match still in progress") : live ? "Closed" : "Withdrawn", tone: "muted" };
  }
  if (departed(l)) return n.completed > 0 ? { key: "transferred", label: "Transferred", tone: "muted" } : { key: "closed", label: "Train departed", tone: "muted" };
  // Paused by its seller, with tickets the pause keeps off sale (when everything left is held for buyers, that's what it says).
  // A key of its own: "paused" is the preview's policy change.
  if (pausedUnits(s, l) > 0) return { key: "sellerPaused", label: "Paused", tone: "warn" };
  // A pause that outlived the sale (the event started or its transfer window closed meanwhile) still keeps available at 0, but the
  // tickets left read as an unpaused listing's would: the closure ("Transfer window closed"), never "Closed" or "Transferred" (EPV E3).
  const left = l.pausedAt && !a.ok ? Math.max(0, l.listed - n.reserved - n.completed) : n.available;
  if (left > 0) {
    if (a.ok) return { key: "available", label: `${n.available} available`, tone: "good" };
    return a.kind === "closed" ? { key: "closed", label: a.short, tone: "muted" } : { key: "paused", label: "Paused by policy change", tone: "warn" };
  }
  if (n.reserved > 0) return { key: "reserved", label: "Held for a buyer", tone: "warn" };
  if (n.completed > 0) return { key: "transferred", label: "Transferred", tone: "muted" };
  return { key: "closed", label: "Closed", tone: "muted" };
}
export const availableListings = (s, eventId) => s.listings.filter(l => l.eventId === eventId && access(EV[l.eventId]).ok && listingNumbers(s, l).available > 0);
export const isExpired = i => !!i.expires && atMs(i.expires) <= CLOCK;
export const isLive = i => i.status === "open" && !isExpired(i);
/* (The old "N looking" figure, which added each event's simulated interestSeed, is gone: counts come from demandFor, and the seed field
   is kept only so saved states and the event records stay as they were.) */
export const isoTitle = i => i.eventId ? EV[i.eventId].title : i.goods ? i.goods.title : i.missing.title;
export const isMissingIso = i => !i.eventId && !i.goods; // an ISO for an event that isn't on Handoff yet (goes to the review queue)
export const holdingOf = (s, l) => s.holdings.find(h => h.id === l.holdingId) || {};
export const selfReported = (s, l) => (l.source !== undefined && !engineActive ? l.source : holdingOf(s, l).source) === "self-reported"; // a live view carries the holding's source

/* Is a budget enough? At or above the ask (plus any top-up), or, when the seller takes offers (OBO), enough for an offer
   at or above their lowest. Used for ticket ISOs, alerts and goods ISOs alike. */
export const withinBudget = (budget, x, extra = 0) => budget == null || budget >= x.ask + extra
  || (!!x.obo && budget - extra > 0 && budget - extra >= (x.minOffer || 0));
/* Can this ISO/alert be satisfied by this listing? Same test for alerts, "possible match" chips and callouts. */
export function isoFits(s, i, l) {
  const ev = EV[l.eventId];
  if (i.eventId !== ev.id || l.sellerId === i.userId || !access(ev).ok || listingNumbers(s, l).available < 1) return null;
  if (isAddOn(ev, l)) return null;
  const el = canAcquire(i.userId, ev, l); if (!el.ok) return null;
  if (!withinBudget(i.budget, l, el.topUp || 0)) return null;
  return { topUp: el.topUp || 0, partial: i.qty > listingNumbers(s, l).available };
}
/* "Possible match" listings for a request (requestMatch: the same test as Wanted's "A listing may match", including a train leaving
   after the deadline); a private alert uses its own quantity and max (alertMatch). */
export const isoMatches = (s, i) => i.eventId && isLive(i) ? s.listings.filter(l => i.kind === "alert" ? alertMatch(s, i, l).ok : requestMatch(s, i, l).ok) : [];

/* ---------- Public requests, private alerts and stock: one source for every view's counts and matches ---------- */
/* A public request anyone can act on now: an open, unexpired ISO whose event still takes demand (an unlisted event only while it's under review or being added). */
export const liveRequest = (s, i) => i.kind === "iso" && isLive(i) && (i.eventId ? !!EV[i.eventId] && demandAllowed(EV[i.eventId]) : !!i.goods || ["reviewing", "onboarding"].includes(i.review || "reviewing"));
/* An event's public listings: open to everyone, so not withdrawn and not an ISO reply held for one person. */
export const publicListingsFor = (s, ev) => s.listings.filter(l => l.eventId === ev.id && !l.isoReplyFor && !l.withdrawnAt);
/* Stock: spots anyone could take now on those listings (add-ons aren't spots; none while the event isn't open). */
export const stockFor = (s, ev) => access(ev).ok ? publicListingsFor(s, ev).filter(l => !isAddOn(ev, l)).reduce((t, l) => t + listingNumbers(s, l).available, 0) : 0;
/* Public demand, each count for what it is: live requests, distinct people, units wanted. Never alerts or the simulated seed. */
export const demandFor = (s, ev) => { const rs = s.interests.filter(i => i.eventId === ev.id && liveRequest(s, i)); return { requests: rs.length, people: new Set(rs.map(i => i.userId)).size, units: rs.reduce((t, i) => t + i.qty, 0) }; };
/* Does this listing answer a need? isoFits's rules, with a plain reason for each mismatch. Still ok when it covers fewer than
   wanted (partial, with a "Covers N of M" note). `you` words it for the viewer's own alert; `by` is a request's deadline. */
export function spotMatch(s, need, l) {
  const ev = EV[l.eventId]; const u = unitOf(ev); const lu = isAddOn(ev, l) ? "add-on" : u; const reasons = [];
  const who = need.you ? "you" : (PEOPLE[need.userId] || { first: "the requester" }).first; const whose = need.you ? "your" : who + "'s";
  if (need.eventId !== ev.id) return { ok: false, partial: false, topUp: 0, reasons: ["It's for a different event."] };
  if (l.sellerId === need.userId) reasons.push(`It's ${whose} own listing.`);
  const a = access(ev); if (!a.ok) reasons.push(`${a.short}.`);
  const avail = listingNumbers(s, l).available;
  if (listingPaused(s, l)) reasons.push("It's paused."); // live: its seller paused it, so nothing on it can be taken until they resume it
  else if (avail < 1) reasons.push(`Nothing left on this listing (${listingState(s, l).label.toLowerCase()}).`);
  if (isAddOn(ev, l)) reasons.push(`It's an add-on, not ${aUnit(u)}.`);
  const el = canAcquire(need.userId, ev, l); const topUp = el.ok ? el.topUp || 0 : 0;
  if (!el.ok) reasons.push(`${cap1(who)} can't take it. ${el.reason}`);
  if (!withinBudget(need.max, l, topUp)) reasons.push(l.obo && l.minOffer && need.max - topUp > 0 && need.max - topUp < l.minOffer // OBO: a budget under the ask fits from the lowest offer up
    ? `Offers start at ${money(l.minOffer)}, above ${whose} ${money(need.max)} ${need.word}.`
    : `${money(l.ask)}${ev.premium ? " reimbursement" : ` per ${lu}`}${topUp ? ` plus a ${money(topUp)} top-up` : ""} is above ${whose} ${money(need.max)} ${need.word}.`);
  if (need.by && l.departsAt && atMs(l.departsAt) > atMs(need.by)) reasons.push(`The train leaves ${fmtWhen(l.departsAt)}, after ${whose} ${fmtDate(need.by)} deadline.`);
  const ok = reasons.length === 0; const partial = ok && need.qty > avail;
  if (partial) reasons.push(`Covers ${avail} of the ${plural(need.qty, u)} wanted.`);
  return { ok, partial, topUp, reasons };
}
/* A public request against a listing: its quantity, public budget and deadline. */
export const requestMatch = (s, i, l) => spotMatch(s, { userId: i.userId, eventId: i.eventId, qty: i.qty, max: i.budget, word: "budget", by: i.expires }, l);
/* A private alert against a listing: its own quantity and max (none: any price). A paused alert never matches. */
export const alertMatch = (s, al, l) => al.paused ? { ok: false, partial: false, topUp: 0, reasons: ["Your alert is paused."] }
  : spotMatch(s, { userId: al.userId, eventId: al.eventId, qty: al.qty || 1, max: al.max == null ? null : al.max, word: "max", you: true }, l);

/* Who gets alerted when a spot is listed: live interests, one per person, each by the test every view uses. A public request must match
   (requestMatch: eligibility, budget incl. top-up, and a train leaving by its deadline); a private alert uses its own quantity and max and
   never fires while paused (alertMatch). Requests go first, so someone with both is told once, as a requester. */
export function matchRecipients(s, listing) {
  const ev = EV[listing.eventId]; const seenU = new Set(); const out = [];
  if (isAddOn(ev, listing)) return out;
  for (const i of [...s.interests.filter(x => x.kind !== "alert"), ...s.interests.filter(x => x.kind === "alert")]) {
    if (i.eventId !== ev.id || !isLive(i) || i.userId === listing.sellerId || seenU.has(i.userId)) continue;
    const m = i.kind === "alert" ? alertMatch(s, i, listing) : requestMatch(s, i, listing); if (!m.ok) continue;
    seenU.add(i.userId); out.push({ interest: i, partial: m.partial, topUp: m.topUp });
  }
  return out;
}
/* People a new listing reaches through a public request, for the seller's toast and preview. Private alerts are never counted. */
export const requestersIn = rec => new Set(rec.filter(m => m.interest.kind === "iso").map(m => m.interest.userId)).size;
/* The viewer's own open private alert and public request for an event: at most one of each (saving again updates it). */
export const myAlertFor = (s, me, eventId) => s.interests.find(i => i.eventId === eventId && i.userId === me && i.kind === "alert" && i.status === "open") || null;
export const myRequestFor = (s, me, eventId) => s.interests.find(i => i.eventId === eventId && i.userId === me && i.kind === "iso" && i.status === "open") || null;
/* An alert's settings in words, for its owner only: "2 tickets, up to $120" or "1 spot, any price". */
export const alertText = (al, ev) => `${plural(al.qty || 1, unitOf(ev))}, ${al.max != null ? `up to ${money(al.max)}${ev.premium ? " reimbursement" : ""}` : "any price"}`;
/* Listings and items sellers have shared with a request ("I have this") and not taken back, newest first. A share holds nothing. */
export const sharesFor = (s, i) => (s.responses || []).filter(x => x.isoId === i.id && x.status === "open");
export const PAUSED_MSG = `This account can't trade after ${RULES.strikesToPause} upheld reports (demo rule).`;

/* ============================================================
   GOODS: second-hand items between classmates. No events, organizers, eligibility or price caps:
   the seller's price, optionally OBO. Request (or offer) -> seller accepts (reserved) -> buyer confirms
   pickup (sold). Payment and pickup happen outside Handoff.
   ============================================================ */
export const GOODS_CATS = { Furniture: ["sofa", "var(--c-food)"], "Home & kitchen": ["home", "var(--c-wine)"], Electronics: ["monitor", "var(--c-sports)"], Clothing: ["shirt", "var(--c-social)"], "Sports & outdoor": ["mountain", "var(--c-travel)"], "Books & supplies": ["book", "var(--c-culture)"], Other: ["grid", "var(--c-train)"] };
export const CONDITIONS = ["New", "Like new", "Good", "Fair"];
/* §9q item 6 (live): a name and a price are enough to post an item. Its category, condition and pickup area are stored only when the
   seller states them (no key otherwise: never a guessed "Good", "Other" or area), and every reader leaves out what isn't there. The
   listing expires ITEM_EXPIRY_DAYS on unless the seller picks another day (postItem's `expires`, at most ITEM_MAX_DAYS on). `until`
   stays the item's last day; it is a "pickup by" date only where the seller chose one (postItem's `until`, as the form always sent
   it, and every item stored before this). An item whose `until` is only its expiry carries noPickupBy, and is never worded "pickup
   by" or "pickup window". The preview's items always have every field. */
export const ITEM_EXPIRY_DAYS = 14, ITEM_MAX_DAYS = 60;
export const hasPickupBy = it => !it.noPickupBy;
export const itemEndNote = it => hasPickupBy(it) ? "the item's pickup-by date" : "when the listing expires"; // what an item's last day is, after a date
export const GFINAL = ["completed", "declined", "cancelled", "released", "expired"];
export const pickupOver = it => atMs(it.until) <= CLOCK; // `until` is a date: open through the end of that day
export function gState(g, it) {
  if (GFINAL.includes(g.status)) return { st: g.status, reason: g.reason };
  if (pickupOver(it)) return { st: "expired", reason: hasPickupBy(it) ? "The pickup window ended before pickup." : "The listing expired before pickup." };
  // The seller's response clock starts when a request becomes pending: at creation, or when a backup becomes active again.
  if (g.status === "pending" && CLOCK >= onClock(g.restoredAt || g.createdAt) + RULES.sellerResponseHours * HOUR) return { st: "expired", reason: `The seller didn't respond within ${RULES.sellerResponseHours} hours${demoRuleNote()}.` };
  // An accepted request holds the item only until its hold ends: no pickup time agreed in time, or a day past the agreed time.
  if (g.status === "accepted" && g.holdUntil && CLOCK >= g.holdUntil) return { st: "expired", reason: g.pickupAt ? "The agreed pickup time passed without a confirmed pickup, so the hold ended." : `No pickup time was agreed within ${RULES.goodsHoldHours} hours, so the hold ended${demoRuleNote()}.` };
  return { st: g.status }; // "waiting": a backup while another buyer holds the reservation; no response clock
}
/* "There's a problem": what each side can report, in plain words. */
export const PROBLEMS = {
  ticket: { buyer: ["The seller hasn't sent it", "Turned away at the door", "The ticket didn't work", "Something else"], seller: ["The buyer hasn't paid", "The buyer stopped responding", "Something else"] },
  goods: { buyer: ["The seller didn't show up", "The item isn't as described", "Something else"], seller: ["The buyer didn't show up or pay", "Something else"] },
};
/* When an accepted goods request's hold ends, the item opens up again. */
export const goodsHoldEnd = (it, acceptedAt) => Math.min(onClock(acceptedAt) + RULES.goodsHoldHours * HOUR, atMs(it.until));
export const itemOf = (s, g) => s.goods.find(x => x.id === g.itemId);
export const goodsRespondBy = (g, it) => Math.min(onClock(g.restoredAt || g.createdAt) + RULES.sellerResponseHours * HOUR, atMs(it.until)); // when a pending goods request lapses
export const reservedFor = (s, it) => s.goodsReqs.find(g => g.itemId === it.id && gState(g, it).st === "accepted") || null;
/* Live: the seller paused this item (pausedAt), and it's still open: not sold, withdrawn or past its pickup window. Nobody can request it
   or have a request accepted until its seller resumes it (resumeItem); a hold already agreed goes on. */
export const itemPaused = it => !!it.pausedAt && !it.soldAt && !it.withdrawnAt && !pickupOver(it);
/* Live (follow-on B2): why the seller can't close their item now: a buyer's hold (g, the accepted request), which closing never releases.
   withdrawItem refuses in these words, and the item's panel shows them beside its disabled "Close item". */
export const closeHeldWhy = (it, g) => `On hold for ${(PEOPLE[g.buyerId] || CLASSMATE).first} until ${fmtMs(g.holdUntil)}. You can close it once the hold ends${itemPaused(it) ? "" : "; Pause stops new requests now"}.`;
export function itemState(s, it) {
  if (it.state && !engineActive) return it.state; // a live view: the server's state (who holds it stays private); never trusted inside withEngine
  if (it.soldAt) return { key: "sold", label: "Sold", tone: "muted" };
  if (it.withdrawnAt) return { key: "withdrawn", label: installed === "live" ? "Closed" : "Withdrawn", tone: "muted" }; // live (follow-on B2): "Close item"
  if (pickupOver(it)) return { key: "closed", label: hasPickupBy(it) ? "Pickup window over" : "Listing expired", tone: "muted" };
  if (reservedFor(s, it)) return { key: "reserved", label: "On hold", tone: "warn" }; // a hold agreed before a pause goes on
  if (it.pausedAt) return { key: "sellerPaused", label: "Paused", tone: "warn" };
  return { key: "available", label: "Available", tone: "good" };
}
/* A goods ISO fits an item in the same category, within budget, whose title or note has every word the request names, give or take an
   ending ("office chair" ~ "Ergonomic office chairs"). One shared word isn't enough: "office" alone would make a bookshelf an office chair.
   An item that states no category (live, §9q item 6) has none to compare: it fits by those words alone, whatever the request's category,
   and so never fits (or alerts) a request merely for sharing a category; no category is not "Other". */
export const STOPWORDS = new Set(["the", "and", "for", "with", "any", "one", "set", "pair", "size", "used", "new", "good", "like"]);
export const words = t => ((t || "").toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length >= 3 && !STOPWORDS.has(w));
export const missingWords = (i, it) => { const have = words(it.title + " " + (it.note || "")); return words(i.goods.title).filter(w => !have.some(x => x.startsWith(w) || w.startsWith(x))); };
export const hasAllWords = (i, it) => words(i.goods.title).length > 0 && missingWords(i, it).length === 0;
export function goodsFits(i, it) {
  if (!i.goods || (it.cat && it.cat !== i.goods.cat) || it.sellerId === i.userId) return false;
  if (!withinBudget(i.budget, { ask: it.price, obo: it.obo, minOffer: it.minOffer })) return false; // OBO: a budget below the ask can still work
  return hasAllWords(i, it);
}
export const goodsMatches = (s, i) => i.goods && isLive(i) ? s.goods.filter(it => itemState(s, it).key === "available" && goodsFits(i, it)) : [];
/* A goods request against an item: goodsFits's rules plus availability, with a plain reason for each mismatch (goods are one each). */
export function requestMatchItem(s, i, it) {
  const who = (PEOPLE[i.userId] || { first: "the requester" }).first; const reasons = [];
  if (!i.goods) return { ok: false, partial: false, reasons: ["It isn't a request for an item."] };
  if (it.sellerId === i.userId) reasons.push(`It's ${who}'s own item.`);
  if (it.cat && it.cat !== i.goods.cat) reasons.push(`It's in ${it.cat}, not ${i.goods.cat}.`);
  else if (!hasAllWords(i, it)) { const miss = missingWords(i, it); reasons.push(miss.length && miss.length < words(i.goods.title).length
    ? `Its title or note matches only part of "${i.goods.title}" (not ${miss.map(w => `"${w}"`).join(" or ")}).` : `Nothing in its title or note matches "${i.goods.title}".`); }
  if (!withinBudget(i.budget, { ask: it.price, obo: it.obo, minOffer: it.minOffer })) reasons.push(it.obo && it.minOffer && i.budget > 0 && i.budget < it.minOffer
    ? `Offers start at ${money(it.minOffer)}, above ${who}'s ${money(i.budget)} budget.` : `${money(it.price)} is above ${who}'s ${money(i.budget)} budget.`);
  const st = itemState(s, it); if (st.key !== "available") reasons.push(`It isn't available (${st.label.toLowerCase()}).`);
  return { ok: reasons.length === 0, partial: false, reasons };
}

/* ---------- What's new (data only: its view, entry and unread dot were removed in the UI update) ---------- */
/* Discovery categories shared by Available and Wanted (and What's new's records below): trains, treks, and every other event category.
   Still used by Available, Wanted and the event page's "See all in Wanted". */
export const catOf = ev => ev.cat === "Travel" ? "trains" : ev.cat === "Treks & trips" ? "treks" : "events";
/* What's new for one viewer: the last week's new listings with stock (spots: an add-on isn't stock, as on Available), available items and
   live public requests from others, newest first, at most 30. A listing or item that fits one of the viewer's live requests or alerts is a
   "match" instead. Nothing is made up: each entry is a record that exists now, stamped when it was posted; unread means newer than the
   viewer's seen mark. No view shows it since the UI update; it stays for saved data and the rule checks. */
export function feedItems(s, me) {
  const since = CLOCK - 7 * DAY, seen = (s.feedSeen || {})[me] || 0, out = [];
  const add = x => { if (x.at > since) out.push({ ...x, unread: x.at > seen }); };
  const reqs = s.interests.filter(i => i.userId === me && liveRequest(s, i)), alerts = s.interests.filter(i => i.userId === me && i.kind === "alert" && isLive(i));
  const firstFit = (list, f, x) => { for (const i of list) { const m = f(s, i, x); if (m.ok) return { i, m }; } return null; };
  EVENTS.forEach(ev => { if (access(ev).ok) publicListingsFor(s, ev).forEach(l => {
    const n = listingNumbers(s, l).available; if (l.sellerId === me || n < 1 || isAddOn(ev, l)) return;
    const hit = firstFit(reqs.filter(i => i.eventId === ev.id), requestMatch, l) || firstFit(alerts.filter(i => i.eventId === ev.id), alertMatch, l);
    const via = hit && (hit.i.kind === "alert" ? "alert" : "request");
    add({ key: "listing:" + l.id, type: hit ? "match" : "listing", at: l.createdAt, cat: catOf(ev), eventId: ev.id, listingId: l.id, ...(hit ? { isoId: hit.i.id, via } : {}), title: ev.title, price: l.ask,
      text: `${hit ? `Matches your ${via}${hit.m.partial ? ` (covers ${n} of ${hit.i.qty})` : ""}: ` : ""}${PEOPLE[l.sellerId].name} listed ${plural(n, unitOf(ev))} at ${money(l.ask)}${ev.premium ? ` reimbursement (total commitment ${money(commitment(ev, l.ask, l.paid))})` : ""}` });
  }); });
  s.goods.forEach(it => {
    if (it.sellerId === me || itemState(s, it).key !== "available") return;
    const hit = firstFit(reqs.filter(i => i.goods), requestMatchItem, it);
    add({ key: "item:" + it.id, type: hit ? "match" : "item", at: it.createdAt, cat: "goods", goodsCat: it.cat, itemId: it.id, ...(hit ? { isoId: hit.i.id, via: "request" } : {}), title: it.title, price: it.price,
      text: `${hit ? "Matches your request: " : ""}${dotJoin(PEOPLE[it.sellerId].name, it.cond, it.area && `pickup in ${it.area}`)}` });
  });
  s.interests.forEach(i => {
    if (i.userId === me || !liveRequest(s, i)) return; const ev = i.eventId ? EV[i.eventId] : null;
    add({ key: "request:" + i.id, type: "request", at: i.createdAt, cat: i.goods ? "goods" : ev ? catOf(ev) : "events", ...(i.goods ? { goodsCat: i.goods.cat } : {}), isoId: i.id, ...(ev ? { eventId: ev.id } : {}), title: isoTitle(i), price: i.budget,
      text: `${PEOPLE[i.userId].name} is looking for ${i.goods ? "one" : plural(i.qty, unitOf(ev))}${i.budget != null ? `, up to ${money(i.budget)}${ev && ev.premium ? " reimbursement" : ""}` : ""}` });
  });
  return out.sort((a, b) => b.at - a.at || (a.key < b.key ? -1 : 1)).slice(0, 30);
}

/* One summary per event for cards and pages: a single primary state for this viewer, plus pricing.
   Spots the viewer listed are kept apart from spots others listed, so a card never says
   "your listing" and "nothing listed" at once. */
/* What's being passed on, in card and page copy: students say "ticket"; a trip or trek place is a "spot". */
export const unitOf = ev => ev && (ev.premium || ev.cat === "Treks & trips") ? "spot" : "ticket";
export const UnitOf = ev => unitOf(ev) === "ticket" ? "Ticket" : "Spot";
export const aUnit = u => (/^[aeiou]/.test(u) ? "an " : "a ") + u; // "a ticket", "a spot", "an add-on"
export const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
/* The viewer's own open request, in the same words on event cards and on the listing row. */
export const myReqLabel = r => { if (r.flow !== "quick") return "You requested this"; const b = baseSt(rState(r)); return b === "pending" ? "Your offer is open" : b === "countered" ? "A counter is waiting for you" : b === "proposed" ? "A reply is waiting for you" : b === "requested" ? (freeDeal(r) ? "You asked for this" : "You asked to buy this") : b === "invited" ? (freeDeal(r) ? "You're invited" : "You're invited to pay") : "You reserved this"; }; // §9x item 1: a free ticket isn't bought or paid for
export function eventSummary(s, ev, viewer) {
  const a = access(ev); const u = unitOf(ev);
  const rows = s.listings.filter(l => l.eventId === ev.id && !l.withdrawnAt).map(l => ({ l, n: listingNumbers(s, l) }));
  const live = rows.filter(x => x.n.available > 0);
  const avail = a.ok ? live : [];
  const spot = x => !isAddOn(ev, x.l); // buyer-facing counts and "from" prices are about spots; add-ons only show on the event page
  const sumAvail = xs => xs.reduce((t, x) => t + x.n.available, 0);
  const spots = sumAvail(avail.filter(spot));
  const others = avail.filter(x => x.l.sellerId !== viewer && spot(x)).map(x => ({ ...x, el: viewer ? canAcquire(viewer, ev, x.l) : { ok: true, topUp: 0 } }));
  const priced = others.filter(x => x.el.ok);
  const mySpots = sumAvail(priced);
  // Cards show every listed ticket; who can take which one shows on the listing itself ("Members only"), not on the card.
  const pool = priced.length ? priced : others;
  const best = pool.length ? pool.reduce((m, x) => (x.l.ask + (x.el.topUp || 0) < m.l.ask + (m.el.topUp || 0) ? x : m)) : null;
  const own = viewer ? rows.filter(x => x.l.sellerId === viewer) : [];
  const ownAll = viewer ? s.listings.filter(l => l.eventId === ev.id && l.sellerId === viewer).map(l => ({ l, n: listingNumbers(s, l) })) : []; // incl. withdrawn: a match can still be in progress
  const ownAvail = a.ok ? own.reduce((t, x) => t + x.n.available, 0) : 0;
  const ownReserved = ownAll.reduce((t, x) => t + x.n.reserved, 0);
  const ownDone = ownAll.reduce((t, x) => t + x.n.completed, 0);
  // Live: tickets the viewer's own paused listings keep off sale, and other sellers' (a pause takes them out of every count above).
  const ownPaused = own.reduce((t, x) => t + pausedUnits(s, x.l), 0);
  const pausedOthers = rows.filter(x => spot(x) && x.l.sellerId !== viewer && !x.l.isoReplyFor).reduce((t, x) => t + pausedUnits(s, x.l), 0);
  const ownMainRow = own.find(x => a.ok && x.n.available > 0) || ownAll.find(x => x.n.reserved > 0) || own.find(x => pausedUnits(s, x.l) > 0);
  const ownUnit = ownMainRow && !spot(ownMainRow) ? "add-on" : u; // a seller's own add-on listing is called an add-on
  const otherSpots = sumAvail(avail.filter(x => spot(x) && x.l.sellerId !== viewer));
  const myOpen = viewer ? s.requests.find(r => r.eventId === ev.id && r.buyerId === viewer && r.flow === "quick" && isOpenReq(rState(r))) || null : null; // newest first
  // Held for someone else: each listing's reserved count minus whatever the viewer holds on it, so it never goes negative. Public
  // listings only: a reply held for one requester (isoReplyFor) was never a listed ticket. Not a train that has left: a paid exchange on
  // it goes on between its two people, but nothing on it can open up again for anyone else (readiness RB-5; pausedUnits is 0 then too).
  const myHeldOn = id => viewer ? s.requests.filter(r => r.listingId === id && r.buyerId === viewer && reserves(rState(r))).reduce((t, r) => t + r.qty, 0) : 0;
  const reservedOthers = rows.filter(x => spot(x) && x.l.sellerId !== viewer && !x.l.isoReplyFor && !departed(x.l)).reduce((t, x) => t + Math.max(0, x.n.reserved - myHeldOn(x.l.id)), 0);
  const blockedListed = a.ok ? 0 : sumAvail(live.filter(spot));
  let state;
  if (a.kind === "closed") state = { key: "closed", label: a.short, tone: "bad" };
  else if (a.kind === "official") state = { key: "official", label: a.short, tone: "bad" };
  // No head counts on cards or badges: the old "N looking" added a simulated seed. Real demand is counted on the event page (demandFor).
  else if (a.kind === "notonsale") state = { key: "notonsale", label: "Not on sale yet", tone: "" };
  else if (myOpen) state = { key: "mine", label: myReqLabel(myOpen), tone: "warn" };
  else if (otherSpots > 0) state = { key: "available", label: `${plural(otherSpots, u)} available`, tone: "good" };
  else if (ownAvail > 0) state = { key: "mine", label: `You've listed ${plural(ownAvail, ownUnit)}`, tone: "good" };
  else if (ownPaused > 0) state = { key: "mine", label: "Your listing is paused", tone: "warn" };
  else if (ownReserved > 0) state = { key: "mine", label: `Your ${ownUnit} is held for a buyer`, tone: "warn" };
  else if (pausedOthers > 0) state = { key: "wanted", label: `${plural(pausedOthers, "listed " + u)} paused`, tone: "warn" }; // listed, but its seller isn't selling right now
  else if (reservedOthers > 0) state = { key: "wanted", label: `${plural(reservedOthers, "listed " + u)} held for a buyer`, tone: "warn" }; // listed, just none left to take
  else state = { key: "wanted", label: `No ${u}s listed`, tone: "warn" }; // nothing to take (no queue, so no "waitlist"); the event page offers Get notified and Post a request
  return { a, spots, otherSpots, mySpots, best, blockedListed, state, myOpen, cheapest: best ? best.l : null, topUp: best ? best.el.topUp || 0 : 0,
    ownMain: ownMainRow ? ownMainRow.l : null, ownUnit, ownAvail, ownReserved, ownDone, reservedOthers, ownPaused, pausedOthers };
}
/* Card and booking-panel price copy. Research provenance (which year a price is from) lives in SourceBody. */
/* The text of priceLines (in HandoffPrototype.jsx), without markup. main is { pre, bold, post }: each the list of text pieces
   the JSX renders in order (join("") for plain text), and priceLines bolds main.bold. */
export function priceParts(ev, sum) {
  if (ev.nonTransferable) return { main: { pre: [], bold: ["Not transferable"], post: [] }, sub: `Cancel with ${ev.club} for a refund instead` };
  // Trip figures carry their basis on the card (they're big numbers); ticket prices are demo data like everything else (see the demo strip and Sources).
  const basis = ev.premium ? ` · ${ev.price.note.includes("published") ? "published total" : "demo figures"}` : "";
  const u = unitOf(ev); const U = u === "ticket" ? "Tickets" : "Spots";
  // Forms round 2 (live): what a seller paid is never shown; the listing's face value is, only where the event gives one.
  const live = installed === "live", faceOfL = l => { const t = l.tier ? tierOf(ev, l.tier) : null; const f = t ? faceOf(t) : faceMax(ev); return f == null ? "" : `face value ${money(f)}`; };
  if (sum.state.key === "mine" && sum.myOpen) return { main: sum.myOpen.status === "countered" ? { pre: ["Counter "], bold: [money(sum.myOpen.counterPrice)], post: [] } : { pre: ["Your price "], bold: [money(sum.myOpen.price)], post: [] }, sub: "Next step in My activity" };
  if (sum.best) {
    const l = sum.best.l;
    if (ev.premium) return { main: { pre: ["Reimbursement from "], bold: [money(l.ask)], post: [] }, sub: `Total commitment ${money(commitment(ev, l.ask, l.paid))} incl. remaining payments and fees${basis}` };
    if (live) { const f = faceOfL(l); return { main: { pre: [U, " from "], bold: [money(l.ask)], post: [] }, sub: f ? f.charAt(0).toUpperCase() + f.slice(1) : "" }; }
    return { main: { pre: [U, " from "], bold: [money(l.ask)], post: [] }, sub: `Original price ${money(l.paid)}` };
  }
  if (sum.ownMain) {
    const l = sum.ownMain; const ou = sum.ownUnit || u;
    const where = [sum.ownAvail ? `${plural(sum.ownAvail, ou)} available` : null, sum.ownReserved ? `${plural(sum.ownReserved, ou)} held for a buyer` : null, sum.ownPaused ? `${plural(sum.ownPaused, ou)} paused` : null].filter(Boolean).join(" · ");
    if (ev.premium) return { main: { pre: ["Your listing: "], bold: [money(l.ask)], post: [" reimbursement"] }, sub: `${where} · replacement's total commitment ${money(commitment(ev, l.ask, l.paid))}${basis}` };
    return { main: { pre: ["Your listing: "], bold: [money(l.ask)], post: [l.listed > 1 ? ` per ${ou}` : ""] }, sub: live ? [where, faceOfL(l)].filter(Boolean).join(" · ") : `${where} · you paid ${money(l.paid)}` };
  }
  const listedNote = sum.blockedListed ? `${plural(sum.blockedListed, "listed " + u)} · ${sum.a.short.toLowerCase()}`
    : sum.pausedOthers ? `${plural(sum.pausedOthers, "listed " + u)} paused`
    : sum.reservedOthers ? `${plural(sum.reservedOthers, "listed " + u)} held for a buyer`
    : sum.ownDone ? `You transferred ${plural(sum.ownDone, u)}${installed === "live" ? "" : " (simulated)"}`
    : "Nothing listed";
  if (ev.premium) return { main: { pre: ["Trip price "], bold: [money(ev.price.total)], post: [] }, sub: `${listedNote}${basis}` };
  const fv = faceText(ev);
  if (!fv) return { main: { pre: [], bold: [listedNote], post: [] }, sub: "" }; // forms round 2: no face value given, so none is quoted
  return { main: { pre: ["Face value "], bold: [fv], post: [] }, sub: listedNote };
}
/* Where a tier price comes from, in plain words. Historical prices are never presented as current. */
export function priceBasis(src) {
  if (installed === "live") return `${src}, not checked by Handoff`; // a live tier's price is what the person who added the event entered
  if (/demo/i.test(src)) return "demo figure, not a real price";
  return `${src}, historical, not a current price`;
}

/* ============================================================
   REDUCER: every state change goes through here and is validated
   against fresh state, so double clicks and stale screens can't
   double-reserve or double-complete.
   ============================================================ */
/* Live: the clock, but always past the world's last stamp, so stamps stay unique and ordered across actions without running
   ahead of real time. Preview: the demo clock plus an ordering tick, as before. */
export const stampOf = n => n.mode === "live" ? (n.lastStamp = Math.max(CLOCK, (n.lastStamp || 0) + 1)) : CLOCK + (n.tick = (n.tick || 0) + 1);
/* Alerts always appear in the app; a demo account can also opt into email and text (simulated). */
export const alertVia = (s, id) => { const p = (s.alertPrefs || {})[id] || {}; return ["email", "text"].filter(k => p[k]); };
/* meta (follow-on B4): {kind, ref} tags a note that may also go by email to someone who turned that on: a step of an exchange that needs
   them, or a listing, item or share that may fit their request or alert (FOLLOWON-PLAN §2.4's kinds, such as "offer.received"), with
   the id of the record it's about. Only those call sites pass it; every other note stays in the app. The note keeps the two fields
   only, and only together; the store checks them again before it makes an email job (src/engine-port.ts drain, src/email/kinds.ts). */
export function noteTo(n, userId, text, link, meta) {
  if (!PEOPLE[userId] || !PEOPLE[userId].demo) return;            // preview: only the two demo accounts have inboxes; live: everyone has demo set
  if (n.notifications.some(x => x.userId === userId && x.text === text && !x.read)) return; // dedupe
  const via = alertVia(n, userId); // email / text copies the person opted into (simulated: nothing is sent)
  const tag = meta && typeof meta.kind === "string" && typeof meta.ref === "string" ? { kind: meta.kind, ref: meta.ref } : null;
  n.notifications.unshift({ id: uid(), userId, text, link, at: stampOf(n), read: false, ...(via.length ? { via } : {}), ...(tag || {}) });
}
/* Live: a listing or item posted for a request and shared with it in one change (seq: "list, then share") would tell the requester
   twice, that it opened up (or may match) and that it was shared. The share says more, so the earlier note goes. In live the document
   holds only this change's notifications (the store drains them after every change), so nothing older is touched; the preview keeps
   its notes as they were. */
function dropSameChange(n, userId, linkMatch) {
  if (n.mode !== "live") return;
  for (let k = n.notifications.length - 1; k >= 0; k--) { const x = n.notifications[k]; if (x.userId === userId && !x.read && x.link && linkMatch(x.link)) n.notifications.splice(k, 1); }
}
export const histOf = (n, obj, text) => { (obj.history = obj.history || []).push({ at: stampOf(n), text }); };
/* Live: a reservation that lapsed unpaid (stored by sweepExpiry, from "accepted") is told to its buyer, with what to do if they did pay
   outside Handoff, and to its seller. Nobody else is (D42). It ended at its hold's end, which holdEnd cut to a train's departure, the
   event's start or the transfer cutoff when one came first, and the words follow the reason stored (readiness RB-1). */
function noteLapse(n, r, l) {
  const ev = EV[r.eventId]; if (!ev) return;
  const at = typeof r.holdUntil === "number" ? ` at ${fmtMs(r.holdUntil)}` : "", lower = t => t.charAt(0).toLowerCase() + t.slice(1);
  const S = (PEOPLE[l.sellerId] || {}).first || "the seller", B = (PEOPLE[r.buyerId] || {}).name || CLASSMATE.name, what = plural(r.qty, isAddOn(ev, l) ? "add-on" : unitOf(ev));
  const [toBuyer, toSeller] = r.reason === HOLD_LAPSED ? [" without payment, so it went back on sale.", " without payment. It's back on sale."]
    : r.reason === HOLD_LAPSED_PAUSED ? [" without payment.", " without payment. It's back with you, and the listing stays paused until you resume it."]
    : r.reason === HOLD_LAPSED_CLOSED ? [" without payment.", " without payment. It's back with you."] // the seller closed the listing (follow-on B2)
    : r.reason === HOLD_LAPSED_REPLY ? [" without payment, so the reply closed.", " without payment, so your reply closed."]
    : [`: ${lower(r.reason)}`, `: ${lower(r.reason)}`]; // a train that left, the event's start, the transfer window closing
  noteTo(n, r.buyerId, `Your reservation for ${ev.title} ended${at}${toBuyer} If you did pay ${S}, contact them directly: Handoff can't see payments.`, { name: "event", id: ev.id });
  noteTo(n, l.sellerId, `${B}'s reservation of ${what} for ${ev.title} ended${at}${toSeller}`, { name: "activity", tab: "listings" });
}
/* Persist derived expiry, so later policy changes or clock rewinds can't revive it. Live: a reservation that lapsed unpaid tells its
   buyer and seller (noteLapse). A lapse on a listing its seller closed goes back to the seller, and one on a paused listing stays off sale,
   so neither is stored as "went back on sale" (follow-on B2, readiness RB-1). */
export function sweepExpiry(n) {
  n.requests.forEach(r => { if (!FINAL.includes(r.status)) { const e = rState(r); if (e.st === "expired") { const was = r.status, l = n.listings.find(x => x.id === r.listingId); r.status = "expired"; r.reason = lapsedReason(e.reason, l); histOf(n, r, "Expired: " + r.reason);
    if (n.mode === "live" && r.flow === "quick" && was === "accepted" && l) noteLapse(n, r, l);
    // Follow-on B5: a request to buy or an invitation that ended on its own is told to its buyer, in the app only (nothing was held).
    if (n.mode === "live" && r.inviteFlow === true && (was === "requested" || was === "invited") && EV[r.eventId]) noteTo(n, r.buyerId, was === "requested" ? `The seller didn't invite you before your request for ${EV[r.eventId].title} ended.` : `The invitation for ${EV[r.eventId].title} ended before it was reserved.`, { name: "event", id: r.eventId }); } } });
  const lapsed = []; // items whose holder's hold just ended: their backups become active again (not while the item is paused: resumeItem does it)
  (n.goodsReqs || []).forEach(g => { if (!GFINAL.includes(g.status)) { const it = n.goods.find(x => x.id === g.itemId); const e = it ? gState(g, it) : { st: "expired", reason: "The item no longer exists." }; if (e.st === "expired") { if (g.status === "accepted" && it && !pickupOver(it) && !it.pausedAt) lapsed.push(it); g.status = "expired"; g.reason = e.reason; histOf(n, g, "Expired: " + e.reason); } } });
  lapsed.forEach(it => {
    const back = n.goodsReqs.filter(g => g.itemId === it.id && g.status === "waiting");
    back.forEach(g => { g.status = "pending"; g.restoredAt = stampOf(n); histOf(n, g, "Active again: the other buyer's hold ended"); noteTo(n, g.buyerId, `"${it.title}" is available again and your ${g.isOffer ? "offer" : "request"} is active. ${PEOPLE[it.sellerId].first} can accept or decline it.`, { name: "item", id: it.id }); });
    if (back.length) noteTo(n, it.sellerId, `The hold on your ${it.title} ended. ${plural(back.length, "backup request")} ${back.length === 1 ? "is" : "are"} active again.`, { name: "item", id: it.id });
  });
  // Live (§9s item 6): an item that has ended (sold, closed by its seller, or past its last day) keeps no photo. Its reference goes
  // here, and the store deletes the bytes of every reference a change drops, in the same transaction.
  if (n.mode === "live") (n.goods || []).forEach(it => { if (it.pic !== undefined && (it.soldAt || it.withdrawnAt || pickupOver(it))) delete it.pic; });
}
/* Competing requests on one listing, re-checked after every change:
   - a pending request the listing can't meet while other matches hold its spots waits as a backup (it reserves nothing);
   - when a match fails and spots free up, backups that still qualify become pending again for the seller to decide.
     Nothing is ever accepted automatically, and cancelled or expired requests stay closed;
   - once spots are transferred for good, requests the listing can no longer meet are closed, even while a policy blocks
     the listing (a swap already sent or with the organizer can still complete then).
   Withdrawn listings are left alone; listings that are closed or blocked by policy only get that last check. */
export function settleRequests(n) {
  applyWorld(n); sweepExpiry(n);
  for (const l of n.listings) {
    if (l.withdrawnAt) continue;
    const ev = EV[l.eventId]; const open0 = access(ev).ok;
    if (isQuick(ev)) {
      // Christine's rule: once another buyer reserves it, offers the listing can no longer cover are declined (no backups).
      // A seller's pause (live) isn't that: open offers stay open, so they're measured against what's neither reserved nor
      // transferred, not against what's available while it's paused (none).
      const coverable = () => { const nb = listingNumbers(n, l); return l.pausedAt ? Math.max(0, l.listed - nb.reserved - nb.completed) : nb.available; };
      for (const r of n.requests.filter(x => x.listingId === l.id && ["pending", "countered"].includes(x.status) && !FINAL.includes(rState(x).st))) {
        if (r.qty > coverable()) { r.status = "declined"; r.reason = "Another buyer reserved it first"; histOf(n, r, "Closed: another buyer reserved it first"); noteTo(n, r.buyerId, `Another buyer reserved the ${unitOf(ev)} you made an offer on for ${ev.title}, so your offer is closed.`, { name: "event", id: ev.id }); }
      }
      // Follow-on B5 (invite to pay): requests to buy and invitations hold nothing, so another buyer's hold doesn't close them: it may
      // lapse. One the listing can never cover again (its units were paid for or handed over) is declined and its buyer told. An
      // invitation that needs units another buyer is holding right now is marked blockedAt, and nobody is told; when the units come
      // back the mark goes and the buyer gets one note. A seller's pause isn't a block (resumeListing tells buyers itself).
      for (const r of n.requests.filter(x => x.listingId === l.id && invitePre(x) && !FINAL.includes(rState(x).st))) {
        const nb = listingNumbers(n, l), u = isAddOn(ev, l) ? "add-on" : unitOf(ev);
        const firm = n.requests.filter(x => x.listingId === l.id && ["paid", "confirmed", "sent"].includes(baseSt(rState(x)))).reduce((t, x) => t + x.qty, 0);
        // A request to buy stays open while one unit could still be covered: the seller may invite its buyer for fewer than they asked.
        if ((r.status === "requested" ? 1 : r.qty) > l.listed - nb.completed - firm) {
          // §9x item 1: nobody buys a free ticket; one that's reserved is firm at once (it skips the payment steps), so the words say that.
          const got = freeDeal(r) ? "reserved" : "bought";
          const was = r.status; r.status = "declined"; r.reason = `Another buyer ${got} it first`; delete r.blockedAt; histOf(n, r, `Closed: another buyer ${got} it first`);
          noteTo(n, r.buyerId, `Another buyer ${got} the ${u} for ${ev.title} first, so your ${was === "invited" ? "invitation" : "request"} is closed.`, { name: "event", id: ev.id });
          continue;
        }
        if (r.status !== "invited" || l.pausedAt) continue;
        if (r.qty > nb.available) { if (!r.blockedAt) r.blockedAt = stampOf(n); }
        else if (r.blockedAt) { delete r.blockedAt; noteTo(n, r.buyerId, `The ${r.qty === 1 ? u : u + "s"} ${(PEOPLE[l.sellerId] || {}).first || "the seller"} invited you ${freeDeal(r) ? "to take for free" : "to pay for"}, for ${ev.title}, ${r.qty === 1 ? "is" : "are"} available again. Reserve by ${fmtMs(r.expiresAt)}: nothing is held until you do.`, { name: "event", id: ev.id }); }
      }
      // A held reply to a request is a listing for one buyer: once that match ends without a handoff, the listing closes.
      if (l.isoReplyFor) { const rs = n.requests.filter(x => x.listingId === l.id); if (rs.length && rs.every(x => FINAL.includes(rState(x).st)) && !rs.some(x => x.status === "completed")) { l.withdrawnAt = stampOf(n); histOf(n, l, "Closed: the reply didn't go through"); } }
      continue;
    }
    // By stored status, so requests shown as paused are included.
    const open = n.requests.filter(r => r.listingId === l.id && ["pending", "waiting"].includes(r.status) && !FINAL.includes(rState(r).st)).sort((x, y) => x.createdAt - y.createdAt);
    for (const r of open) {
      const nb = listingNumbers(n, l); const seller = PEOPLE[l.sellerId];
      const close = (reason, text) => { r.status = "declined"; r.reason = reason; histOf(n, r, "Closed: " + reason); noteTo(n, r.buyerId, text, { name: "event", id: ev.id }); };
      const u = isAddOn(ev, l) ? "add-on" : unitOf(ev);
      if (r.qty > l.listed - nb.completed) { close("Transferred to another student", `The ${u} you requested for ${ev.title} went to another student, so your request is closed.`); continue; }
      if (!open0) continue; // closed or blocked: no backups move until it reopens
      if (r.status === "pending" && r.qty > nb.available) {
        r.status = "waiting"; histOf(n, r, "On hold as a backup: another request is being processed");
        noteTo(n, r.buyerId, `Another request for ${ev.title} is being processed. Yours is next in line as a backup. We'll let you know if it becomes available again.`, { name: "activity", tab: "requests" });
        continue;
      }
      if (r.status === "waiting" && r.qty <= nb.available) {
        const el = canAcquire(r.buyerId, ev, l);
        if (!el.ok) { close("No longer eligible", `${cap1(aUnit(u))} for ${ev.title} opened up, but your backup request no longer fits the eligibility rules, so it's closed.`); continue; }
        if (!isAddOn(ev, l) && personLoad(n, r.buyerId, ev.id, r.id) + r.qty > personCap(ev)) { close(`Over the ${personCap(ev)}-per-person limit`, `${cap1(aUnit(u))} for ${ev.title} opened up, but your backup request would take you over ${personCap(ev)} per person, so it's closed.`); continue; }
        r.status = "pending"; r.restoredAt = stampOf(n); histOf(n, r, "Active again: it became available");
        noteTo(n, r.buyerId, `${cap1(aUnit(u))} for ${ev.title} is available again, so your backup request is active. ${seller.first} hasn't accepted it yet and has ${RULES.sellerResponseHours} hours to respond (demo rule).`, { name: "activity", tab: "requests" });
        noteTo(n, l.sellerId, `${PEOPLE[r.buyerId].name}'s backup request for ${ev.title} is active again. Accept or decline within ${RULES.sellerResponseHours} hours.`, { name: "activity", tab: "listings" });
      }
    }
  }
}
export function reduce(prev, actor, a) {
  reduceDepth++;
  try {
    const res = step(prev, actor, a);
    if (!res.error) settleRequests(res.state);
    if (actionTap) actionTap(actor, a, res, reduceDepth - 1); // tests only (setActionTap); depth 0 is the action as sent
    return res;
  } finally { reduceDepth--; }
}
export function step(prev, actor, a) {
  const n = clone(prev); applyWorld(n);
  const fail = msg => { applyWorld(prev); return { state: prev, error: msg }; };
  const stamp = () => stampOf(n);
  const note = (userId, text, link, meta) => noteTo(n, userId, text, link, meta); // meta: an emailed kind's tag (noteTo)
  const hist = (obj, text) => histOf(n, obj, text);
  const findR = id => n.requests.find(x => x.id === id);
  const listingOf = r => n.listings.find(x => x.id === r.listingId);
  const hasBackups = l => n.requests.some(o => o.listingId === l.id && rState(o).st === "waiting"); // a policy pause keeps backups on hold
  // What happens to a ticket that comes back to the seller: open again, or still blocked by the rules or a closed window. Live, only the
  // seller releases, so it's said to them; once nothing can be sold it stays with them, in those words (W1 fix, OBS-2).
  const endedWords = why => why.charAt(0).toLowerCase() + why.slice(1).replace(/\.$/, ""); // "The event has started." -> "the event has started"
  const backAgain = l => { if (l.isoReplyFor) return "The reply is closed."; if (l.withdrawnAt) return n.mode === "live" ? "It's back with you, and the listing stays closed." : "It's back with the seller. The listing stays withdrawn."; const ended = n.mode === "live" ? saleEndedWhy(EV[l.eventId], l) : null; if (ended) return `It's back with you (${endedWords(ended)}).`; const ax = access(EV[l.eventId]); if (ax.ok && l.pausedAt) return "It's back with you, and the listing stays paused until you resume it."; return ax.ok ? `It's available again.${hasBackups(l) ? " Backup requests that still qualify are active again." : ""}` : `It's back with the seller, but the listing stays paused: ${ax.why}`; };
  /* A second tab or device that hasn't caught up can press a reservation's step after it's done, or after the reservation has
     closed. Its refusal says what Handoff recorded, not that the step is still to come (journey review F2): the steps below say
     "already" for a step that's done, and this says why a closed reservation can't move. null while the reservation is open. */
  const closedQuick = e => FINAL.includes(e.st) && e.st !== "completed" ? ({ expired: "The reservation has ended.", cancelled: "This reservation was cancelled.", released: "This reservation was released.", declined: "This was declined." }[e.st] || "This reservation is closed.") : null;
  const didIt = (owner, first) => owner === actor ? "You've" : `${first} has`; // the preview's simulate acts for a made-up person
  /* Follow-on B5 (invite to pay). INVITE_INSTEAD: accept and counter never move a new-flow record (nor does respond, which answers
     its buyer in the buyer's words). heldFor: the seller can't
     end a reservation they invited (release, decline). None of the four new actions (requestToBuy, invite, inviteRequester, reserve)
     runs while the seller has the listing paused; each says so in its own words, with how long the request or invitation stays open. */
  const INVITE_INSTEAD = "Invite them to pay instead.";
  const heldFor = r => `It's reserved for ${(PEOPLE[r.buyerId] || CLASSMATE).first} until ${fmtMs(r.holdUntil)}. If they don't pay by then, it comes back to you on its own.`;
  /* The one place a transfer completes, for both paths: the buyer confirming a direct handoff, or the (simulated)
     organizer confirming a registration. Holdings and counts change exactly once; callers check the state first. */
  const completeTransfer = (r, how) => {
    const l = listingOf(r); const ev = EV[r.eventId]; const peer = r.flow === "peer" || r.flow === "quick";
    const h = n.holdings.find(x => x.id === l.holdingId);
    if (!h || h.qty < r.qty) return fail("The seller's holding doesn't cover this transfer.");
    h.qty -= r.qty;
    // A non-member who paid a top-up now holds a non-member ticket, priced at what they actually paid.
    const floorTier = r.topUp > 0 ? (ev.tiers || []).filter(t => !t.memberOnly).sort((x, y) => x.price - y.price)[0] : null;
    const newTier = floorTier ? floorTier.id : l.tier;
    // Trips: the buyer reimbursed l.ask for installments worth l.paid, so their own outlay runs (l.paid - l.ask) below the club's schedule.
    const paidAdj = ev.premium ? l.ask - (l.paid == null ? paidToDate(ev) : l.paid) : 0;
    // Merge only into an earlier Handoff transfer at the same price, never into a self-reported or seeded spot.
    const unitPaid = reqPrice(r, l) + (r.topUp || 0); // an accepted offer is what the buyer actually paid
    const src = n.mode === "live" ? "transferred" : "transferred (simulated)"; // live: both people confirmed it in Handoff, nothing more (SRC)
    const bh = n.holdings.find(x => x.userId === r.buyerId && x.eventId === ev.id && x.tier === newTier && x.source === src && (x.paidAdj || 0) === paidAdj && (ev.premium || x.paid === unitPaid));
    if (bh) bh.qty += r.qty; else n.holdings.push({ id: "h" + uid(), userId: r.buyerId, eventId: ev.id, tier: newTier, qty: r.qty, paid: ev.premium ? null : unitPaid, ...(paidAdj ? { paidAdj } : {}), source: src });
    // Stored as "completed" (final for inventory); shown as "Handed off" (direct) or "Registration confirmed" (organizer step).
    r.status = "completed"; r.completedAt = stamp(); hist(r, how);
    const u = isAddOn(ev, l) ? "add-on" : unitOf(ev);
    hist(l, `${plural(r.qty, u)} handed off to ${PEOPLE[r.buyerId].name}${r.receiptSimulated ? " (receipt simulated: fictional account)" : ""}`);
    // The buyer's open request and alert for the event: one this covers closes as fulfilled; one for more stays open for the rest.
    // An add-on doesn't answer a trek ISO.
    if (!isAddOn(ev, l)) n.interests.forEach(i => { if (i.eventId !== ev.id || i.userId !== r.buyerId || i.status !== "open") return; const left = (i.qty || 1) - r.qty;
      Object.assign(i, left > 0 ? { qty: left, updatedAt: r.completedAt } : { status: "closed", closedReason: "fulfilled", closedAt: r.completedAt }); });
    if (r.flow === "quick") { // paid up front, so receipt closes it
      note(l.sellerId, r.receiptSimulated ? `Simulated: ${PEOPLE[r.buyerId].first} (fictional account) confirmed receiving the ${u} for ${ev.title}.` : `${PEOPLE[r.buyerId].first} confirmed receiving the ${u} for ${ev.title}. All done.`, { name: "activity", tab: "listings" });
      return { state: n, toast: r.receiptSimulated ? `Received (simulated confirmation from ${PEOPLE[r.buyerId].first}, a fictional account).` : "Received. You're all set." };
    }
    if (peer) {
      note(l.sellerId, r.receiptSimulated ? `Simulated: ${PEOPLE[r.buyerId].first} (fictional account) confirmed having the ${u} for ${ev.title}.` : `${PEOPLE[r.buyerId].first} confirmed they have the ${u} for ${ev.title}. They pay you directly.`, { name: "activity", tab: "listings" });
      return { state: n, toast: r.receiptSimulated ? `Handed off (simulated confirmation from ${PEOPLE[r.buyerId].first}, a fictional account).` : "Handed off. Pay the seller directly if you haven't yet." };
    }
    note(r.buyerId, `${OrgWho(ev)} confirmed your registration for ${ev.title} (simulated). Pay ${PEOPLE[l.sellerId].first} directly if you haven't yet.`, { name: "activity", tab: "requests" });
    note(l.sellerId, `${OrgWho(ev)} confirmed ${PEOPLE[r.buyerId].first} is registered for ${ev.title} (simulated). They pay you directly.`, { name: "activity", tab: "listings" });
    return { state: n, toast: "Registration confirmed (simulated). The buyer pays the seller directly." };
  };
  /* Goods backups: while one buyer holds the reservation, other requests wait and reserve nothing (no response clock).
     When the reservation falls through, they become pending again, with a fresh response window for the seller. Never accepted automatically. */
  const restoreGoodsBackups = it => {
    const back = n.goodsReqs.filter(g => g.itemId === it.id && g.status === "waiting" && gState(g, it).st === "waiting");
    back.forEach(g => { g.status = "pending"; g.restoredAt = stamp(); hist(g, "Active again: the other buyer's hold fell through"); note(g.buyerId, `"${it.title}" is available again and your ${g.isOffer ? "offer" : "request"} is active. ${PEOPLE[it.sellerId].first} can accept or decline it.`, { name: "item", id: it.id }); });
    if (back.length) note(it.sellerId, `${plural(back.length, "backup request")} for your ${it.title} ${back.length === 1 ? "is" : "are"} active again. Accept or decline within ${RULES.sellerResponseHours} hours.`, { name: "item", id: it.id });
    return back.length;
  };
  const P = PEOPLE[actor] || { first: "Reviewer", name: "Reviewer" };
  const PAID = n.mode === "live" ? "I've sent payment" : "Paid"; // the buyer's button (live since follow-on B1's page; the preview keeps "Paid")
  const PAUSED = PAUSED_MSG;
  const SELLER_PAUSED = `This seller can't trade right now after ${RULES.strikesToPause} upheld reports (demo rule).`;
  // How a student ticket will change hands, checked the same way for listings and ISO replies.
  const deliveryFor = (ev, a, holderId) => {
    // §9v item 4 (live, SELL5-M2): a club its seller names on the listing, for an event that names none (never a train's: its name says
    // its operator). It's kept on the listing (club), never written to the shared event, and restricts nothing by itself; a members-only
    // ticket or a name change below can rest on it. A blank one is none; one that isn't a name is refused. An event with a club keeps
    // its own, and a club sent for it is dropped.
    let club = null;
    if (n.mode === "live" && !ev.club && ev.cat !== "Travel" && typeof a.club === "string" && a.club.trim() !== "") {
      club = memberClubName(a.club);
      if (!club) return { error: NO_LISTING_CLUB };
    }
    const nc = namesCheckedFor(ev, a.namesChecked); const allowed = methodsFor(ev, nc);
    if (!ev.club && !club && (nc || a.method === "name")) return { error: NO_ORG_NAME }; // simplification batch: no organizer to change the name (§9v: unless the listing names one)
    // §9q item 5 (live): a members-only ticket for an event that names no club is taken once its seller names the club (memberClub:
    // kept on the listing, shown to buyers before they request or reserve). Without a name it's refused as before; a name that isn't
    // one says so. An event with a club keeps its own, and a name sent for it is dropped. The preview keeps the refusal.
    // §9v item 5: the club named on the listing (club) counts as that name when no memberClub is sent.
    let memberClub = null;
    if (!ev.club && a.membersOnly) {
      const named = a.memberClub != null && a.memberClub !== "" ? a.memberClub : club;
      if (n.mode !== "live" || named == null || named === "") return { error: NO_ORG_MEMBERS };
      memberClub = memberClubName(named);
      if (!memberClub) return { error: NO_MEMBER_CLUB };
    }
    const more = { ...(memberClub ? { memberClub } : {}), ...(club ? { club } : {}) };
    const method = a.method || (allowed.length === 1 ? allowed[0] : null);
    // Sell and Request follow-up (USER-INSTRUCTIONS §9m item 1), live: an ordinary event's ticket, which could change hands in several
    // ways, may be posted without choosing one. It then carries no method at all (neutral, below): its seller promised no specific way,
    // and every party reads "Send the ticket to the buyer after payment." (transferWords). A method that is sent is checked and kept
    // as before, and the one valid way is still set without asking (a train's eTicket, a trek's or a names-checked event's name
    // change). The preview keeps asking.
    const neutral = !method && n.mode === "live";
    if (!neutral && (!method || !allowed.includes(method))) return { error: nc && a.method ? "Names are checked at entry, so it has to go through an organizer name change." : "Choose how you'll transfer it." };
    let file = null;
    if (method === "file" && n.mode !== "live") { // live: Handoff never holds the file; the seller sends it after confirming the payment
      const fl = a.file; if (!fl || !fl.hash || !fl.name) return { error: "Upload the ticket's PDF or QR code. Buyers don't see it until you confirm their payment." };
      if (!/^[0-9a-f]{8,64}$/.test(fl.hash)) return { error: "That file couldn't be read. Try uploading it again." };
      if (n.listings.some(x => !x.withdrawnAt && x.file && x.file.hash === fl.hash)) return { error: "This ticket file is already listed on Handoff, so it can't be listed twice." };
      file = { name: String(fl.name).slice(0, 120), size: Math.max(0, +fl.size || 0), hash: fl.hash };
    }
    if (n.mode === "live") {
      // Follow-on B1: buyers pay with the seller's saved methods (their profile), copied onto each exchange as it's reserved (snapPay),
      // so a new listing stores no destination. Since protocol 2 the server's parseAction drops a handle sent with a listing, so only
      // engine-level callers (tests building a listing from before B1) still reach the branch that keeps one: a legacy listing, whose
      // exchanges fall back to it when the seller has saved no methods.
      const typed = a.payHandle == null ? "" : String(a.payHandle).trim().slice(0, 60);
      if (typed) return { method, namesChecked: nc, file, payHandle: typed, ...more };
      // Follow-on B5, once switched on: posting no longer needs a method. The seller needs one when they send an invitation (invite,
      // inviteRequester: collected inline then), and a reservation copies it (snapPay). Until the switch, posting asks for it as before.
      if (!inviteOn && !payMethodsOf(holderId).length) return { error: NO_PAY_METHODS };
      return { method, namesChecked: nc, file, ...more };
    }
    const payHandle = String(a.payHandle == null ? (PEOPLE[holderId].pay || "") : a.payHandle).trim().slice(0, 60);
    if (!payHandle) return { error: "Add your Venmo or PayPal handle, so the buyer can pay you." };
    return { method, namesChecked: nc, file, payHandle };
  };
  /* Live (follow-on B1): the payment instructions an exchange keeps, taken once, as it's reserved ("accepted": take, accept, respond):
     the seller's saved methods at that moment, or else the listing's own handle (a listing posted before B1), word for word as "other".
     Nothing rewrites them afterwards: not a profile change, an Edit, a pause or a close. The preview keeps its sample handles. Returns a
     refusal when there's nothing to pay with, else null. */
  const snapPay = (r, l) => {
    if (n.mode !== "live" || r.pay) return null;
    const own = payMethodsOf(l.sellerId);
    if (own.length) r.pay = own.map(m => ({ kind: m.kind, value: m.value }));
    else if (typeof l.payHandle === "string" && l.payHandle.trim()) r.pay = [{ kind: "other", value: l.payHandle }];
    else return actor === l.sellerId ? NO_PAY_METHODS : "This seller hasn't added how to pay them yet.";
    return null;
  };
  // An eTicket is for one train: listings and ISO replies name it, and close when it leaves.
  const trainFor = (ev, raw) => {
    if (!needsTrain(ev)) return { departsAt: null };
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw || "")) return { error: "Add your train's departure date and time." };
    const dms = atMs(raw);
    if (dms <= CLOCK) return { error: "That train has already left." };
    if (dms < atMs(ev.start) || dms > closesAt(ev)) return { error: `Pick a train between ${fmtDay(ev.start)} and ${fmtDay(ev.openUntil || ev.start)}.` };
    return { departsAt: raw };
  };
  /* Live: a seller edits, pauses or resumes their own listing or item (editListing … resumeItem). An edit is for what happens next:
     every request carries the price agreed when it was made, so reservations, accepted offers, open offers and counters keep theirs.
     A pause stops anything new (reservations, offers, requests, accepting or countering) until the seller resumes it; what was
     already agreed goes on, and open offers and requests stay open with their own deadlines. */
  const soThat = (why, what) => `${why.replace(/\.$/, "")}, so ${what}.`; // "The event has started, so this listing can't be paused."
  // Why the seller's own listing can't be edited, paused or resumed now (done: "edited" …), or null.
  const listingShut = (l, done) => {
    const ev = EV[l.eventId];
    if (l.isoReplyFor) return `This is a reply held for one request, so it can't be ${done}. Withdraw it if it needs to change.`;
    if (l.withdrawnAt) return `This listing is closed, so it can't be ${done}.`; // its seller closed it ("Close listing", follow-on B2)
    const ax = access(ev); if (!ax.ok) return soThat(ax.why, `this listing can't be ${done}`);
    if (departed(l)) return `That train has already left, so this listing can't be ${done}.`;
    if (listingNumbers(n, l).completed >= l.listed) return `All the ${unitOf(ev)}s on this listing have been transferred, so it can't be ${done}.`;
    return null;
  };
  const itemShut = (it, done) => it.soldAt ? `This item was sold, so it can't be ${done}.` : it.withdrawnAt ? `This item is closed, so it can't be ${done}.`
    : pickupOver(it) ? (hasPickupBy(it) ? `Its pickup window is over, so it can't be ${done}.` : `This listing has expired, so it can't be ${done}.`) : null;
  /* An edit's price, offers and description, checked as listing or posting checks them (key: "ask" or "price"; capErr: the listing's
     price cap). A field left out keeps its value; minOffer "" or null removes the lowest offer. */
  const editTerms = (x, key, label, capErr, words = money) => { // words: how a price reads in the history (an item's: itemPrice)
    let price = x[key];
    if (a[key] !== undefined) { const pm = parseMoney(a[key]); if (pm.error) return { error: `${label}: ${pm.error}` }; price = pm.value; }
    const over = capErr(price); if (over) return { error: over };
    const obo = (a.obo === undefined ? !!x.obo : !!a.obo) && price > 0;
    let minOffer = null;
    if (obo) { const mo = checkMinOffer(a.minOffer === undefined ? (typeof x.minOffer === "number" ? String(x.minOffer) : "") : a.minOffer, price); if (mo.error) return { error: mo.error }; minOffer = mo.value; }
    const note = a.note === undefined ? String(x.note || "") : String(a.note).slice(0, 280).replace(/[\ud800-\udbff]$/, ""); // as listing does, never half a character
    const was = { price: x[key], obo: !!x.obo, minOffer: typeof x.minOffer === "number" ? x.minOffer : null, note: String(x.note || "") };
    const changes = [];
    if (price !== was.price) changes.push(`price ${words(was.price)} to ${words(price)}`);
    if (obo !== was.obo) changes.push(obo ? "offers on" : "offers off");
    if (obo && minOffer !== was.minOffer) changes.push(minOffer != null ? `lowest offer ${money(minOffer)}` : "no lowest offer");
    if (note !== was.note) changes.push("description");
    return { price, obo, minOffer, note, changes, repriced: price !== was.price };
  };
  const setTerms = (x, key, t) => { x[key] = t.price; x.obo = t.obo; if (t.minOffer != null) x.minOffer = t.minOffer; else delete x.minOffer; x.note = t.note; };
  /* A live world runs only the pilot's actions (LIVE_TYPES), for a signed-in actor (the server's sweep has none), on events it
     supports. The cases below still check who may act; this is the second line of defense after src/live.ts (C-DESIGN §3.3). */
  if (n.mode === "live") { const why = liveRefusal(n, actor, a); if (why) return fail(why); }
  /* Follow-on B5 (FOLLOWON-PLAN §2.7), once switched on: the first live step stamps the moment the invite flow began in this world, once
     (a refused step keeps nothing, so it's the first step that's saved). Every quick-flow record made after it carries inviteFlow, and
     one that doesn't is a violation (legacy-new); records from before keep the rules they were made under. */
  if (n.mode === "live" && inviteOn && !(n.inviteSince > 0)) n.inviteSince = stamp();

  /* Persist derived expiry before anything else, so this action validates against it. In a live world, when a request expired
     just now, also settle what that implies (settleRequests: a held reply whose match lapsed closes, offers a listing can no
     longer cover close), as the server's sweep would have: an action sent before any read swept the world meets the same state
     as one sent after it. Every stored document was settled when it was saved, so nothing else needs it (and the pass is
     costly at scale). */
  if (n.mode === "live") {
    const open = n.requests.filter(r => !FINAL.includes(r.status)).length;
    sweepExpiry(n);
    if (n.requests.filter(r => !FINAL.includes(r.status)).length !== open) settleRequests(n);
  } else sweepExpiry(n);
  n.suggestions = n.suggestions || []; // saved demo states from before event suggestions existed
  n.goods = n.goods || []; n.goodsReqs = n.goodsReqs || [];
  n.responses = n.responses || []; n.feedSeen = n.feedSeen || {}; // and from before shared listings and What's new (no view shows feedSeen since the UI update; kept for saved data and the rule checks)

  switch (a.type) {
    case "addHolding": {
      const ev = EV[a.eventId]; if (!ev) return fail("Choose an event.");
      if (ev.premium) return fail("Trip spots can't be self-reported in this demo.");
      const ax = access(ev); if (!ax.ok) return fail(ax.why);
      const att = honorAttend(actor, ev); if (!att.ok) return fail(att.reason);
      if (isQuick(ev) && tradingPaused(n, actor)) return fail(PAUSED);
      const tier = tierOf(ev, a.tier); if (!tier) return fail("Choose the ticket tier you bought.");
      if (tier.memberOnly && !mayHoldMemberTier(actor, ev)) return fail(`Only ${ev.club} members can hold a member-priced ticket.`);
      const max = personCap(ev) - (tier.addOn ? 0 : personLoad(n, actor, ev.id)); // add-ons aren't spots: they have their own per-person limit
      if (max < 1) return fail(`You already hold or have requested the maximum for this event (${personCap(ev)} per person).`);
      const u = tier.addOn ? "add-on" : unitOf(ev);
      if (!isInt(a.qty) || a.qty < 1 || a.qty > max) return fail(`Enter between 1 and ${max} ${u}s (${personCap(ev)} per person).`);
      // Forms round 2: live, what the seller paid is no longer asked (the face value alone caps a price, askCap). One sent anyway (an older
      // client, the tests) is checked and kept as before; without one the holding stores paid: null. The preview still asks for it.
      let paid = null;
      if (n.mode !== "live" || (a.paid != null && String(a.paid).trim() !== "")) {
        const pm = parseMoney(a.paid); if (pm.error) return fail("Price paid: " + pm.error);
        if (faceOf(tier) != null && pm.value > tier.price) return fail(`The ${tier.label.toLowerCase()} price is ${money(tier.price)}. You can't have paid more than face value.`);
        paid = pm.value;
      }
      if (n.holdings.some(h => h.userId === actor && h.eventId === ev.id && h.tier === tier.id && h.qty > 0)) return fail(`You've already added ${aUnit(u)} in this tier. ${n.mode === "live" ? "It can't be changed yet." : "Edit isn't supported in the demo."}`);
      const id = "h" + uid();
      n.holdings.push({ id, userId: actor, eventId: ev.id, tier: tier.id, qty: a.qty, paid, source: "self-reported" });
      return { state: n, toast: `${u === "add-on" ? "Add-on" : UnitOf(ev)} added. Next, set your price.`, result: { id } };
    }
    case "addThen": { // add a ticket and list it (or answer an ISO with it) in one go: if the second step fails, nothing is kept
      if (!a.then || !["list", "isoReply"].includes(a.then.type)) return fail("Unknown follow-up.");
      const r0 = reduce(n, actor, { ...a.add, type: "addHolding" }); if (r0.error) return fail(r0.error);
      const r1 = reduce(r0.state, actor, { ...a.then, holdingId: r0.result.id }); if (r1.error) return fail(r1.error);
      return r1;
    }
    /* One-form Sell (USER-INSTRUCTIONS §9l): "Post ticket". A ticket the seller is adding, listed in one go on an event they chose
       (eventId: their own tap on a match) or on a new one made with it (event: createEvent's fields). It runs the steps there already
       are (createEvent, then addThen with list), each with all its rules, on copies: if any part is refused, nothing is kept, so a new
       event never exists without its listing. A new event is never merged into another one, and is never added twice: an exact twin
       of an open event (eventTwin) is refused, and the seller chooses it or says what's different. The answer is the listing (result.id);
       steps name what was made (the new event, when there is one, then the listing), or which part was refused. Like every refusal
       and toast, its words never quote what was typed (they go into the actions log). */
    case "postTicket": {
      if (n.mode !== "live") return fail("Unknown action.");
      const fresh = !!a.event && typeof a.event === "object" && !Array.isArray(a.event), picked = typeof a.eventId === "string" && a.eventId !== "";
      if (fresh === picked || (a.event != null && !fresh)) return fail("Choose the event your ticket is for, or name a new one.");
      // A refusal says which part it was about, for the form to show it beside the right field; a new event is never reported as saved.
      const failAt = (part, msg) => { const f = fail(msg);
        if (fresh) f.steps = part === "event" ? [{ type: "createEvent", ok: false, error: msg }] : [{ type: "createEvent", ok: false, error: SEQ_NOT_SAVED }, { type: "list", ok: false, error: msg }];
        return f; };
      let cur = n, eventId = a.eventId;
      if (fresh) {
        const twin = eventTwin(a.event.kind, a.event.title, a.event.start);
        if (twin) return failAt("event", twin.kind === "train" ? TWIN_TRAIN : twin.kind === "trek" ? TWIN_TREK : TWIN_EVENT);
        const r0 = reduce(n, actor, { ...a.event, type: "createEvent" }); if (r0.error) return failAt("event", r0.error);
        cur = r0.state; eventId = r0.result.id;
        applyWorld(cur); // the catalog with the new event in it, for the ticket type below (each step installs the state it starts from)
      }
      const ev = EV[eventId];
      const many = !!ev && Array.isArray(ev.tiers) && ev.tiers.length > 1;
      const tier = typeof a.tier === "string" && a.tier ? a.tier : ev && Array.isArray(ev.tiers) && ev.tiers.length === 1 ? ev.tiers[0].id : "";
      if (many && !tier) return failAt("listing", "Choose your ticket type.");
      // What a listing reads, and nothing else: no price paid (forms round 2), no ticket file and no handle of its own (buyers pay with
      // the seller's saved methods). A transfer method left out is the event's one valid way, or, on an ordinary event, none at all
      // (§9m item 1: deliveryFor). A quantity left out is one (§9n).
      const qty = a.qty == null ? 1 : a.qty;
      const r1 = reduce(cur, actor, { type: "addThen", add: { eventId, tier, qty },
        then: { type: "list", qty, ask: a.ask, obo: a.obo, minOffer: a.minOffer, note: a.note, method: a.method, namesChecked: a.namesChecked, membersOnly: a.membersOnly, memberClub: a.memberClub, club: a.club, restricted: a.restricted, restriction: a.restriction, departsAt: a.departsAt } }); // club, restriction: §9v items 4 and 5
      if (r1.error) return failAt("listing", r1.error);
      const made = EV[eventId];
      return { state: r1.state, result: { id: r1.result.id },
        toast: fresh ? `${UnitOf(made)} listed. Its ${made.kind === "train" ? "train" : made.kind === "trek" ? "trek" : "event"} is new on Handoff: it shows as added by you, and Handoff doesn't check its details.` : r1.toast,
        steps: [...(fresh ? [{ type: "createEvent", ok: true, id: eventId }] : []), { type: "list", ok: true, id: r1.result.id }] };
    }
    /* Sell and Request follow-up (USER-INSTRUCTIONS §9m item 3): "Post request", built as Post ticket is. A public request on an event
       the buyer chose (eventId: their own tap on a match) or on a new one made with it (event: createEvent's fields). It runs the
       steps there already are (createEvent, then saveInterest), each with all its rules, on copies: if any part is refused, nothing
       is kept, so a new event never exists without its request. A new event is never merged into another one, and is never added
       twice: an exact twin of an open event (eventTwin) is refused, and the buyer chooses it or says what's different. Left out, the
       quantity is one, the budget is none (never $0) and the deadline is the event's cutoff (saveInterest: its transfer deadline, a
       train's departure, 11:59 PM New York time on a date-only event's day); an earlier date and a note are optional. On an event the
       buyer already has an open request for, it updates that one (one request per person and event, as saveInterest has it). The
       answer is the request (result.id); steps name what was made, or which part was refused. Editing a request stays saveInterest's. */
    case "postRequest": {
      if (n.mode !== "live") return fail("Unknown action.");
      const fresh = !!a.event && typeof a.event === "object" && !Array.isArray(a.event), picked = typeof a.eventId === "string" && a.eventId !== "";
      if (fresh === picked || (a.event != null && !fresh)) return fail("Choose the event you want a ticket for, or name a new one.");
      if (picked && !EV[a.eventId]) return fail("Choose an event.");
      // A refusal says which part it was about, for the form to show it beside the right field; a new event is never reported as saved.
      const failAt = (part, msg) => { const f = fail(msg);
        if (fresh) f.steps = part === "event" ? [{ type: "createEvent", ok: false, error: msg }] : [{ type: "createEvent", ok: false, error: SEQ_NOT_SAVED }, { type: "saveInterest", ok: false, error: msg }];
        return f; };
      let cur = n, eventId = a.eventId;
      if (fresh) {
        const twin = eventTwin(a.event.kind, a.event.title, a.event.start);
        if (twin) return failAt("event", twin.kind === "train" ? TWIN_TRAIN_REQUEST : twin.kind === "trek" ? TWIN_TREK_REQUEST : TWIN_EVENT_REQUEST);
        const r0 = reduce(n, actor, { ...a.event, type: "createEvent" }); if (r0.error) return failAt("event", r0.error);
        cur = r0.state; eventId = r0.result.id;
      }
      // What a request reads, and nothing else: no id (this never edits), no item, no unlisted event.
      const r1 = reduce(cur, actor, { type: "saveInterest", data: { eventId, qty: a.qty == null ? 1 : a.qty, budget: a.budget == null ? "" : a.budget, note: a.note,
        ...(a.expires != null && a.expires !== "" ? { expires: a.expires } : {}) } });
      if (r1.error) return failAt("request", r1.error);
      applyWorld(r1.state); // the catalog with the new event in it, for the words below
      const made = EV[eventId];
      return { state: r1.state, result: { id: r1.result.id },
        // §9q item 4: where matches show comes first (MATCHES_WHERE); that the new event shows as added by the buyer stays, shorter.
        toast: fresh ? `Request posted. ${MATCHES_WHERE} Its ${made.kind === "train" ? "train" : made.kind === "trek" ? "trek" : "event"} is new on Handoff and shows as added by you.` : r1.toast,
        steps: [...(fresh ? [{ type: "createEvent", ok: true, id: eventId }] : []), { type: "saveInterest", ok: true, id: r1.result.id }] };
    }
    /* ---------- Live only: events users add, and the server's sweep (C-DESIGN §7.3, §5.3) ---------- */
    case "createEvent": { // a real event, train or trek, added by any signed-in user (at most 5 a day); nothing about it is checked
      if (n.mode !== "live") return fail("Unknown action.");
      const r = addLiveEvent(n, actor, a, stamp); if (r.error) return fail(r.error);
      return { state: n, toast: r.toast, result: { id: r.id } };
    }
    case "removeEvent": { // only the person who added it, and only while nothing refers to it (a typo: remove it and add it again)
      if (n.mode !== "live") return fail("Unknown action.");
      const r = removeLiveEvent(n, actor, a, stamp); if (r.error) return fail(r.error);
      return { state: n, toast: r.toast };
    }
    case "sweep": // the server's expiry sweep, with no actor: sweepExpiry above stored what expired, and reduce settles the rest
      return actor === null ? { state: n } : fail("Unknown action.");
    case "seq": return runSeq(n, actor, a, fail); // up to 3 steps in one change, such as "list, then share": all or nothing, except optional steps
    case "list": {
      const h = n.holdings.find(x => x.id === a.holdingId); if (!h || h.userId !== actor) return fail("Choose a ticket you hold.");
      const ev = EV[h.eventId]; const ax = access(ev); if (!ax.ok) return fail(ax.why);
      const ht = h.tier ? tierOf(ev, h.tier) : null;
      if (ht && ht.memberOnly && !mayHoldMemberTier(actor, ev)) return fail("This member-priced ticket can't be listed by a non-member.");
      const free = holdingFree(n, h); const lu = ht && ht.addOn ? "add-on" : unitOf(ev);
      if (!isInt(a.qty) || a.qty < 1) return fail(`Enter a whole number of ${lu}s.`);
      if (a.qty > free) return fail(free === 0 ? `All your ${lu}s for this event are already listed or in a transfer.` : `You can list at most ${plural(free, lu)}: that's what you hold and haven't already listed.`);
      const pm = parseMoney(a.ask); if (pm.error) return fail("Asking price: " + pm.error);
      const mo = a.obo && !ev.premium ? checkMinOffer(a.minOffer, pm.value) : { value: null }; if (mo.error) return fail(mo.error);
      const cap = askCap(ev, h); // forms round 2 (live): the face value only, or no cap without one
      if (pm.value > cap) return fail(ev.premium ? `Reimbursement can't be more than you've paid (${money(cap)}).` : n.mode === "live" ? `Asking price can't be more than the face value (${money(cap)}).` : `Asking price can't be more than you paid (${money(cap)}).`);
      const paid = ev.premium ? paidToDate(ev) : h.paid == null ? null : h.paid; // a holding added without what was paid stores null
      const tr = trainFor(ev, a.departsAt); if (tr.error) return fail(tr.error); const departsAt = tr.departsAt;
      let dlv = null;
      if (isQuick(ev)) { if (tradingPaused(n, actor)) return fail(PAUSED); dlv = deliveryFor(ev, a, actor); if (dlv.error) return fail(dlv.error); }
      // §9v item 5 (live, SELL5-M2): the seller's own short restriction, one line of 3 to 80 characters (restrictionText); blank is none.
      let restriction = null;
      if (n.mode === "live" && isQuick(ev) && typeof a.restriction === "string" && a.restriction.trim() !== "") {
        restriction = restrictionText(a.restriction);
        if (!restriction) return fail(NO_RESTRICTION_TEXT);
      }
      const id = "l" + uid(); const created = stamp();
      // viaOrganizer: optional. Off = direct handoff (seller sends, buyer confirms). On = the organizer approves if needed and updates the name.
      // Trips always use it: the replacement owes the club the remaining balance, and the rooming list must match the traveler.
      // Train tickets never do: there's no organizer to update a name.
      // restricted: an optional seller flag that the ticket's terms may not allow resale (shown to buyers; changes nothing else). Since
      // §9v item 5 the page sends the seller's own words instead (restriction); the flag is still taken, so an older action replays.
      // membersOnly: the seller marks a member ticket; buyers then confirm they're members (member-priced tiers and members-only events count anyway).
      // club (§9v item 4): the club the seller named for an event that names none (deliveryFor); restriction: their own short words.
      const l = { id, eventId: ev.id, sellerId: actor, holdingId: h.id, listed: a.qty, ask: pm.value, paid, tier: h.tier, viaOrganizer: !isQuick(ev), ...(dlv ? { ...(dlv.method ? { method: dlv.method } : {}), ...(dlv.payHandle ? { payHandle: dlv.payHandle } : {}), ...(dlv.file ? { file: dlv.file } : {}), ...(dlv.namesChecked ? { namesChecked: true } : {}), ...(dlv.club ? { club: dlv.club } : {}) } : {}), ...(isQuick(ev) && a.membersOnly ? { membersOnly: true, ...(dlv && dlv.memberClub ? { memberClub: dlv.memberClub } : {}) } : {}), ...(a.restricted && !(ev.tag && ev.tag.restricted) ? { restricted: true } : {}), ...(restriction ? { restriction } : {}), obo: !ev.premium && !!a.obo && pm.value > 0, ...(mo.value ? { minOffer: mo.value } : {}), ...(departsAt ? { departsAt } : {}), note: (a.note || "").slice(0, 280), createdAt: created, history: [] };
      if (ev.noShowRule) {
        const hours = Math.floor((atMs(ev.start) - created) / HOUR);
        l.record = { listedAt: created, eventStart: atMs(ev.start), hoursBefore: hours, meets24: hours >= 24, qty: a.qty, ask: pm.value }; // written once, never edited
      }
      l.history.push({ at: created, text: `Listed ${plural(a.qty, lu)} at ${money(pm.value)}` });
      n.listings.unshift(l);
      const rec = matchRecipients(n, l);
      rec.forEach(m => note(m.interest.userId, `A ${unitOf(ev)} opened up for ${ev.title}: ${P.first} listed ${plural(a.qty, unitOf(ev))} at ${money(pm.value)}${ev.premium ? ` reimbursement (total commitment ${money(commitment(ev, pm.value, paid))})` : ""}.${m.partial ? ` It covers ${a.qty} of the ${m.interest.qty} you asked for.` : ""}${m.topUp ? ` As a non-member you'd add a ${money(m.topUp)} top-up.` : ""}${isQuick(ev) && membersOnlyListing(ev, l) ? " Members only: you'll confirm you're a member before reserving." : ""}`, { name: "event", id: ev.id, listing: id }, { kind: "match.listing", ref: m.interest.id })); // the link opens the event at this listing
      if (isAddOn(ev, l)) return { state: n, toast: "Add-on listed. Add-ons don't answer requests or alerts; classmates find it on the event page.", result: { id } };
      // Only public requests are counted; private alerts are alerted too, but never counted or singled out.
      const k = requestersIn(rec);
      return { state: n, toast: `${unitOf(ev) === "ticket" ? "Ticket" : "Spot"} listed. ${k ? `${plural(k, "classmate")} with a matching request ${k === 1 ? "was" : "were"} alerted (plus anyone with a matching private alert).` : "No one has a matching request yet; anyone with a matching private alert gets an in-app alert."}`, result: { id } };
    }
    case "withdraw": { // live (follow-on B2): "Close listing", with an optional reason only the seller sees; never a sale
      const live = n.mode === "live";
      const l = n.listings.find(x => x.id === a.listingId); if (!l || l.sellerId !== actor) return fail("Listing not found.");
      if (l.withdrawnAt) return fail(live ? "This listing is already closed." : "This listing is already withdrawn.");
      if (!closeReasonOk(a.reason)) return fail("Choose Sold elsewhere or No longer selling, or leave the reason out.");
      const ev = EV[l.eventId]; const u = isAddOn(ev, l) ? "add-on" : unitOf(ev);
      // What closing gives back to the seller: tickets neither held for a buyer nor handed over (a pause's included). Holds and paid
      // exchanges stay as they are (outstanding keeps them on the listing); a hold that ends later comes back to the seller too.
      const nb0 = listingNumbers(n, l); const back = Math.max(0, l.listed - nb0.reserved - nb0.completed);
      l.withdrawnAt = stamp(); if (live && a.reason) l.closeReason = a.reason;
      hist(l, live ? closedBy(a.reason) : "Withdrawn by seller");
      const q = isQuick(ev); let declined = 0, closedNew = 0;
      n.requests.forEach(r => { if (r.listingId !== l.id) return; const e = rState(r);
        // Follow-on B5: closing declines open requests to buy and invitations (they held nothing), in their own words.
        if (invitePre(r) && isOpenReq(e)) { const was = r.status; closedNew++; r.status = "declined"; r.reason = "The seller closed this listing"; delete r.blockedAt; hist(r, "Declined: the seller closed this listing"); note(r.buyerId, `${P.first} closed their listing for ${ev.title}, so your ${was === "invited" ? "invitation" : "request"} is closed.`, { name: "event", id: l.eventId }); return; }
        if (isOpenReq(e) && (!reserves(e) || baseSt(e) === "proposed")) { declined++; r.status = "declined"; r.reason = "Listing withdrawn"; hist(r, "Declined: listing withdrawn"); note(r.buyerId, `A listing you ${r.isOffer ? "made an offer on" : r.isoReply ? "were offered" : "requested"} for ${ev.title} was withdrawn.`, { name: "event", id: l.eventId }); } });
      if (!live) return { state: n, toast: q ? "Listing withdrawn. Open offers were declined; reservations already made continue." : "Listing withdrawn. Pending requests were declined; held matches continue." };
      const offers = (declined ? ` ${declined === 1 ? "The open offer was" : `${declined} open offers were`} declined.` : "") + (closedNew ? ` ${closedNew === 1 ? "The open request or invitation was" : `${closedNew} open requests and invitations were`} closed.` : "");
      const kept = nb0.reserved ? (back ? "; reservations already made continue." : " Reservations already made continue; if one ends unpaid, it comes back to you.") : back ? "." : "";
      return { state: n, toast: `Listing closed.${back ? ` ${plural(back, u)} ${back === 1 ? "is" : "are"} back with you` : ""}${kept}${offers}` };
    }
    /* ---------- Live only: a seller edits, pauses or resumes their own listing (see editTerms above) ---------- */
    case "editListing": { // the asking price, offers and note, for reservations and offers made from now on
      if (n.mode !== "live") return fail("Unknown action.");
      const l = n.listings.find(x => x.id === a.listingId); if (!l || l.sellerId !== actor) return fail("Listing not found.");
      const shutWhy = listingShut(l, "edited"); if (shutWhy) return fail(shutWhy);
      const ev = EV[l.eventId]; const h = n.holdings.find(x => x.id === l.holdingId);
      // Forms round 2: never above the ticket's face value (no cap without one). What the seller paid isn't used, an older listing's
      // included: an edit only changes what happens next, and reservations and offers already made keep their prices.
      const cap = askCap(ev, h || { paid: l.paid, tier: l.tier });
      const t = editTerms(l, "ask", "Asking price", p => p > cap ? `Asking price can't be more than the face value (${money(cap)}).` : null); if (t.error) return fail(t.error);
      // Open offers and counters stay below the asking price, as they were made: the price can't drop to one (answer it first).
      let top = null;
      n.requests.forEach(r => { if (r.listingId !== l.id) return; const st = rState(r).st; if (st !== "pending" && st !== "countered") return;
        const amt = st === "countered" ? r.counterPrice : r.price; if (!top || amt > top.amt) top = { amt, counter: st === "countered" }; });
      if (top && t.price <= top.amt) return fail(top.counter ? `You countered an offer at ${money(top.amt)}. Keep the price above ${money(top.amt)} until the buyer answers it.`
        : `There's an open offer of ${money(top.amt)} on this listing. Keep the price above ${money(top.amt)}, or answer the offer first.`);
      // Follow-on B5: an invitation keeps the price it was sent at, and a request to buy that carries an offer its amount, so the price
      // can't drop below the highest of them (it may equal it). A request at the asking price just follows the price down.
      let inv = null;
      n.requests.forEach(r => { if (r.listingId !== l.id || !invitePre(r) || !isOpenReq(rState(r)) || (r.status === "requested" && !r.isOffer)) return; if (!inv || r.price > inv.price) inv = r; });
      if (inv && t.price < inv.price) return fail(inv.status === "invited" ? `You've invited ${(PEOPLE[inv.buyerId] || CLASSMATE).first} at ${money(inv.price)}. Keep the price at ${money(inv.price)} or more, or withdraw the invitation first.`
        : `There's an open offer of ${money(inv.price)} on this listing. Keep the price at ${money(inv.price)} or more, or answer the request first.`);
      if (!t.changes.length) return fail("Nothing changed: the listing already has that price and description.");
      n.requests.forEach(r => { if (r.listingId === l.id && r.price == null) r.price = l.ask; }); // a request without its own price keeps the old one
      setTerms(l, "ask", t); hist(l, `Edited: ${t.changes.join(", ")}`);
      return { state: n, toast: `Listing updated.${t.repriced ? " Reservations and offers already made keep their prices." : ""}` };
    }
    case "pauseListing": { // nothing new until it's resumed; what was already agreed goes on, and open offers stay open
      if (n.mode !== "live") return fail("Unknown action.");
      const l = n.listings.find(x => x.id === a.listingId); if (!l || l.sellerId !== actor) return fail("Listing not found.");
      const shutWhy = listingShut(l, "paused"); if (shutWhy) return fail(shutWhy);
      if (l.pausedAt) return fail("This listing is already paused.");
      const ev = EV[l.eventId];
      // Follow-on B5: with invite to pay on, the history line and the toast name its steps (asking to buy, reserving), as the pause card does.
      l.pausedAt = stamp(); hist(l, inviteOn ? "Paused: no new requests or reservations until it's resumed" : "Paused: no new reservations or offers until it's resumed");
      // Each buyer with an open offer or counter on it hears that it can't be accepted meanwhile; it keeps its own deadline.
      const open = n.requests.filter(r => r.listingId === l.id && ["pending", "countered"].includes(rState(r).st));
      open.forEach(r => note(r.buyerId, rState(r).st === "countered"
        ? `${P.first} paused their listing for ${ev.title}, so you can't accept their counter-offer until they resume it. You can still decline it.`
        : `${P.first} paused their listing for ${ev.title}. Your offer stays open, but they can't accept it until they resume the listing.`, { name: "activity", tab: "requests" }));
      // Follow-on B5: requests to buy and invitations stay open too, with their deadlines; nothing can be invited or reserved meanwhile.
      const openNew = n.requests.filter(r => r.listingId === l.id && invitePre(r) && isOpenReq(rState(r)));
      openNew.forEach(r => note(r.buyerId, r.status === "invited"
        ? `${P.first} paused their listing for ${ev.title}, so you can't reserve it until they resume it. Your invitation stays open until ${fmtMs(r.expiresAt)}.`
        : `${P.first} paused their listing for ${ev.title}. Your request stays open until ${fmtMs(r.expiresAt)}, but they can't invite you until they resume the listing.`, { name: "activity", tab: "requests" }));
      const held = listingNumbers(n, l).reserved > 0;
      return { state: n, toast: `Listing paused. Classmates can't ${inviteOn ? "ask to buy it or reserve it" : "reserve it or make offers"} until you resume it.${held ? " Reservations already made continue." : ""}${open.length ? ` ${open.length === 1 ? "The open offer stays" : `The ${open.length} open offers stay`} open, but can't be accepted until you resume it.` : ""}${openNew.length ? ` ${openNew.length === 1 ? "The open request or invitation stays" : `The ${openNew.length} open requests and invitations stay`} open until ${openNew.length === 1 ? "its deadline" : "their deadlines"}.` : ""}` };
    }
    case "resumeListing": { // only while it could still sell something: never a withdrawn, closed or transferred one
      if (n.mode !== "live") return fail("Unknown action.");
      const l = n.listings.find(x => x.id === a.listingId); if (!l || l.sellerId !== actor) return fail("Listing not found.");
      if (l.withdrawnAt) return fail("This listing is closed, so it can't be resumed."); // closed by its seller (follow-on B2): List again makes a new one
      if (!l.pausedAt) return fail("This listing isn't paused.");
      const shutWhy = listingShut(l, "resumed"); if (shutWhy) return fail(shutWhy);
      const ev = EV[l.eventId]; const u = unitOf(ev); const since = l.pausedAt;
      delete l.pausedAt; hist(l, inviteOn ? "Resumed: open to requests and reservations again" : "Resumed: open to reservations and offers again");
      const told = new Set();
      n.requests.forEach(r => { if (r.listingId !== l.id) return; const st = rState(r).st; if (st !== "pending" && st !== "countered") return; told.add(r.buyerId);
        note(r.buyerId, st === "countered" ? `${P.first} resumed their listing for ${ev.title}, so you can accept their counter-offer again.`
          : `${P.first} resumed their listing for ${ev.title}, so they can accept your offer again.`, { name: "activity", tab: "requests" }); });
      // Follow-on B5: buyers with an open request to buy or invitation hear that it's back. An invitation whose units another buyer
      // holds right now stays marked (blockedAt), and says so; otherwise the mark goes here, so settling adds no second note.
      const free = listingNumbers(n, l).available;
      n.requests.forEach(r => { if (r.listingId !== l.id || !invitePre(r) || !isOpenReq(rState(r))) return; told.add(r.buyerId);
        if (r.status === "requested") { note(r.buyerId, `${P.first} resumed their listing for ${ev.title}, so they can invite you again. Your request is open until ${fmtMs(r.expiresAt)}.`, { name: "activity", tab: "requests" }); return; }
        if (r.qty > free) { if (!r.blockedAt) r.blockedAt = stamp(); note(r.buyerId, `${P.first} resumed their listing for ${ev.title}. ${freeDeal(r) ? "Another buyer has reserved it" : "Another buyer is paying for it right now"}; your invitation stays open until ${fmtMs(r.expiresAt)} in case it comes back.`, { name: "activity", tab: "requests" }); return; }
        delete r.blockedAt; note(r.buyerId, `${P.first} resumed their listing for ${ev.title}, so you can reserve it again. Your invitation is open until ${fmtMs(r.expiresAt)}.`, { name: "activity", tab: "requests" }); });
      // Classmates who started looking (or changed what they're looking for) while it was paused never heard of it: tell those it
      // matches now that it's available, without calling it newly listed. Anyone who heard about it before the pause isn't told again.
      const avail = listingNumbers(n, l).available;
      const late = avail > 0 ? matchRecipients(n, l).filter(m => !told.has(m.interest.userId) && (m.interest.updatedAt || m.interest.createdAt) >= since) : [];
      late.forEach(m => note(m.interest.userId, `A ${u} for ${ev.title} is available: ${P.first} has ${plural(avail, u)} at ${money(l.ask)}.${m.partial ? ` It covers ${avail} of the ${m.interest.qty} you asked for.` : ""}${membersOnlyListing(ev, l) ? " Members only: you'll confirm you're a member before reserving." : ""}`, { name: "event", id: ev.id, listing: l.id }, { kind: "match.listing", ref: m.interest.id }));
      const k = requestersIn(late); // public requests only: private alerts are told, never counted
      return { state: n, toast: `Listing resumed. ${avail ? `${plural(avail, u)} ${avail === 1 ? "is" : "are"} available again.` : "Everything left is held for buyers right now; if a hold ends, it goes back on sale."}${k ? ` ${plural(k, "classmate")} with a matching request ${k === 1 ? "was" : "were"} told.` : ""}` };
    }
    case "request": {
      const l = n.listings.find(x => x.id === a.listingId); if (!l) return fail("Listing not found.");
      const ev = EV[l.eventId]; const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (l.sellerId === actor) return fail("You can't request your own listing.");
      if (isQuick(ev)) return fail("Use “I'll take it” or “Make offer” for this ticket.");
      if (departed(l)) return fail("That train has already left.");
      const el = canAcquire(actor, ev, l); if (!el.ok) return fail(el.reason);
      const lu = isAddOn(ev, l) ? "add-on" : unitOf(ev);
      const num = listingNumbers(n, l); if (num.available < 1) return fail(`No ${lu}s are available on this listing.`);
      if (!isInt(a.qty) || a.qty < 1 || a.qty > num.available) return fail(`Request between 1 and ${plural(num.available, lu)}.`);
      if (n.requests.some(r => r.listingId === l.id && r.buyerId === actor && isOpenReq(rState(r)))) return fail("You already have an open request on this listing.");
      if (!isAddOn(ev, l) && personLoad(n, actor, ev.id) + a.qty > personCap(ev)) return fail(`That would take you over ${personCap(ev)} per person for this event, counting ${lu}s you hold and have requested.`);
      if (ev.premium && !a.confirmEligible) return fail("Confirm you meet the replacement requirements.");
      const off = checkOffer(a.offer, l.ask, l.obo, l.minOffer); if (off.error) return fail(off.error);
      const id = "r" + uid();
      // shareContact: the buyer agrees up front to share contact details if accepted, so the seller can send it without another round trip.
      const r = { id, listingId: l.id, eventId: ev.id, buyerId: actor, qty: a.qty, topUp: el.topUp || 0, price: off.price, ...(off.isOffer ? { isOffer: true } : {}), ...(l.departsAt ? { departsAt: l.departsAt } : {}), msg: (a.msg || "").slice(0, 280), status: "pending", createdAt: stamp(), consent: a.shareContact ? { buyer: true } : {}, reports: {}, history: [] };
      hist(r, (off.isOffer ? `Offered ${money(off.price)} each (asking ${money(l.ask)})` : "Requested") + (a.shareContact ? "; buyer agreed to share contact details if accepted" : "")); n.requests.unshift(r);
      const ru = isAddOn(ev, l) ? "add-on" : unitOf(ev);
      note(l.sellerId, off.isOffer ? `${P.name} offered ${money(off.price)} each (you're asking ${money(l.ask)}) for ${plural(a.qty, ru)} for ${ev.title}. Accept or decline within ${RULES.sellerResponseHours} hours.` : `${P.name} requested ${plural(a.qty, ru)} for ${ev.title}. Respond within ${RULES.sellerResponseHours} hours.`, { name: "activity", tab: "listings" });
      return { state: n, toast: off.isOffer ? `Offer of ${money(off.price)} sent to ${PEOPLE[l.sellerId].first}. If they accept, it's held for you at that price.` : `Request sent to ${PEOPLE[l.sellerId].first}. If they accept, it's held for you.`, result: { id } };
    }
    case "cancel": {
      const r = findR(a.requestId); if (!r || r.buyerId !== actor) return fail("Request not found.");
      const e = rState(r); if (!isOpenReq(e)) return fail("This request is already closed.");
      const l = listingOf(r); const b = baseSt(e);
      if (r.flow === "quick") {
        // Where the ticket goes: a held reply closes; otherwise it's back on sale, unless its seller has paused or closed the listing
        // (a closed listing's ticket goes back to the seller: follow-on B2), or nothing more can be sold (live: W1 fix, OBS-2).
        const back = r.isoReply ? " The reply is closed." : l.pausedAt || l.withdrawnAt || (n.mode === "live" && saleEndedWhy(EV[l.eventId], l)) ? "" : " It's back on sale.";
        if (b === "paid" && r.payDisputedAt && !r.paymentConfirmedAt) { // the seller said the money hasn't arrived (paymentMissing): the buyer may withdraw
          r.status = "cancelled"; r.reason = "Buyer withdrew after the seller said the payment didn't arrive"; hist(r, r.reason);
          note(l.sellerId, `${PEOPLE[r.buyerId].name} cancelled the reservation for ${EV[r.eventId].title} after you said the payment didn't arrive.`, { name: "activity", tab: "listings" });
          return { state: n, toast: `Reservation cancelled.${back} If you did pay, sort it out with ${PEOPLE[l.sellerId].first} directly: Handoff can't see payments.` };
        }
        // Follow-on B5 (invite to pay): the buyer withdraws a request to buy, declines an invitation, or releases an unpaid reservation,
        // also while the listing is paused. Nothing was held before the reservation, so only a release gives units back.
        // §9x item 1: a free reservation skipped the payment steps, so nothing was paid; until its seller sends the ticket the buyer may
        // still release it, as a buyer releases any reservation before paying. It goes back as any released ticket does.
        if (r.inviteFlow === true && b === "confirmed" && freeSkipped(r)) {
          r.status = "cancelled"; r.reason = "Reservation released"; hist(r, r.reason);
          note(l.sellerId, `${PEOPLE[r.buyerId].name} released their reservation for ${EV[r.eventId].title}.${back}`, { name: "activity", tab: "listings" });
          return { state: n, toast: `Reservation released.${back}` };
        }
        if (r.inviteFlow === true && (b === "requested" || b === "invited" || b === "accepted")) {
          const B = PEOPLE[r.buyerId].name, title = EV[r.eventId].title;
          r.status = "cancelled"; r.reason = b === "requested" ? "Request withdrawn" : b === "invited" ? "Invitation declined" : "Reservation released"; delete r.blockedAt; hist(r, r.reason);
          note(l.sellerId, b === "requested" ? `${B} withdrew their request to buy for ${title}.` : b === "invited" ? `${B} declined your invitation for ${title}.` : `${B} released their reservation for ${title} without paying.${back}`, { name: "activity", tab: "listings" });
          return { state: n, toast: b === "requested" ? "Request withdrawn." : b === "invited" ? "Invitation declined." : `Reservation released.${back}` };
        }
        if (!["pending", "countered", "proposed", "accepted"].includes(b)) return fail(freeSkipped(r) ? "The seller has sent it, so it can't be cancelled here. If something's wrong, tap \"There's a problem\"." : "You've marked it paid, so it can't be cancelled here. If something's wrong, tap \"There's a problem\"."); // §9x item 1: a free one was never marked paid
        r.status = "cancelled"; r.reason = b === "accepted" ? "Buyer cancelled the reservation" : b === "pending" ? "Buyer withdrew the offer" : "Buyer declined"; hist(r, r.reason);
        note(l.sellerId, `${PEOPLE[r.buyerId].name} ${b === "accepted" ? "cancelled their reservation" : b === "pending" ? "withdrew their offer" : "declined"} for ${EV[r.eventId].title}.`, { name: "activity", tab: "listings" });
        return { state: n, toast: b === "accepted" ? `Reservation cancelled.${back}` : b === "pending" ? "Offer withdrawn." : "Declined." };
      }
      r.status = "cancelled"; r.reason = b === "registration" ? "Cancelled by buyer after registration was requested" : b === "sent" ? `Cancelled by buyer after the seller marked it ${EV[r.eventId].paperTicket ? "handed over" : "sent"}` : b === "waiting" ? "Backup request withdrawn by buyer" : "Cancelled by buyer"; hist(r, r.reason);
      note(l.sellerId, b === "waiting" ? `${PEOPLE[r.buyerId].name} withdrew their backup request for ${EV[r.eventId].title}.` : `${PEOPLE[r.buyerId].name} cancelled their request for ${EV[r.eventId].title}.${b === "registration" ? ` Check with ${orgWho(EV[r.eventId])}: the registration may already have changed.` : b === "sent" ? ` You marked it as ${EV[r.eventId].paperTicket ? "handed over" : "sent"}, so check with them that it comes back to you.` : ""}`, { name: "activity", tab: "listings" });
      if (b === "waiting") return { state: n, toast: "Backup request withdrawn." };
      if (b === "pending") return { state: n, toast: "Request cancelled." };
      return { state: n, toast: `Cancelled. It's back with the seller.${hasBackups(l) ? " Backup requests that still qualify are active again." : ""}` };
    }
    case "accept": {
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      const l = listingOf(r);
      const simSeller = a.simulate && !PEOPLE[l.sellerId].demo && r.buyerId === actor; // a fictional seller can't click: the buyer may simulate their step (labeled)
      if (l.sellerId !== actor && !simSeller) return fail("Only the seller can accept.");
      if (r.inviteFlow === true) return fail(INVITE_INSTEAD); // follow-on B5: a new-flow record is never accepted, only invited and reserved
      if (r.flow === "quick") {
        const e = rState(r); if (e.st !== "pending") return fail(e.st === "paused" ? e.reason : e.st === "countered" ? "You countered: it's waiting on the buyer's answer." : `This offer is ${e.st}, so it can't be accepted.`);
        const ev = EV[r.eventId]; const ax = access(ev); if (!ax.ok) return fail(ax.why);
        if (l.withdrawnAt) return fail("This listing was withdrawn.");
        if (departed(l)) return fail("That train has already left.");
        if (l.pausedAt) return fail("You paused this listing. Resume it to accept offers."); // the offer stays open meanwhile
        const el = canAcquire(r.buyerId, ev, l); if (!el.ok) return fail(el.reason);
        if (listingNumbers(n, l).available < r.qty) return fail("Not enough left on this listing that isn't already reserved.");
        // Live: the buyer's other holdings and reservations are private, so the refusal names neither (C-DESIGN §3.7).
        if (personLoad(n, r.buyerId, ev.id, r.id) + r.qty > personCap(ev)) return fail(n.mode === "live" ? BUYER_LIMITS_MSG : `${PEOPLE[r.buyerId].first} would go over ${personCap(ev)} per person for this event.`);
        if (tradingPaused(n, l.sellerId) || tradingPaused(n, r.buyerId)) return fail(tradingPaused(n, actor) ? PAUSED : `${PEOPLE[tradingPaused(n, l.sellerId) ? l.sellerId : r.buyerId].first} can't trade right now (demo rule).`);
        if (n.requests.some(o => o.id !== r.id && o.buyerId === r.buyerId && o.eventId === ev.id && o.flow === "quick" && baseSt(rState(o)) === "accepted")) return fail(n.mode === "live" ? BUYER_LIMITS_MSG : `${PEOPLE[r.buyerId].first} already has an unpaid reservation for this event. They need to pay for it or cancel it first.`);
        const noPay = snapPay(r, l); if (noPay) return fail(noPay); // the reservation's payment instructions (follow-on B1)
        const now = stamp(); r.status = "accepted"; r.acceptedAt = now; r.holdUntil = holdEnd(ev, now, l, false); r.topUp = el.topUp || 0; // the buyer may not be in the app yet
        if (simSeller) r.acceptSimulated = true;
        const len = holdLen(r, now);
        hist(r, (simSeller ? `Simulated: ${PEOPLE[l.sellerId].name} (fictional account) accepted. ` : "") + `Offer accepted at ${money(r.price)}: reserved ${len} for payment`);
        if (!simSeller) note(r.buyerId, `${PEOPLE[l.sellerId].first} accepted your offer of ${money(r.price)} for ${ev.title}. It's reserved for you for ${len}: pay, then tap "${PAID}".`, { name: "activity", tab: "todo" }, { kind: "offer.accepted", ref: r.id });
        return { state: n, toast: simSeller ? `Simulated: ${PEOPLE[l.sellerId].first} (fictional account) accepted. It's reserved for you for ${len}: pay, then tap "Paid".` : `Offer accepted. ${PEOPLE[r.buyerId].first} has ${len} to pay you. Other offers it can't cover are declined.` };
      }
      const e = rState(r); if (e.st !== "pending") return fail(e.st === "paused" ? e.reason : e.st === "waiting" ? "This is a backup request. It can be accepted only if it becomes available again." : `This request is ${e.st}, so it can't be accepted.`);
      const ev = EV[r.eventId]; const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (l.withdrawnAt) return fail("This listing was withdrawn.");
      if (departed(l)) return fail("That train has already left.");
      const el = canAcquire(r.buyerId, ev, l); if (!el.ok) return fail(el.reason);
      const num = listingNumbers(n, l); if (num.available < r.qty) return fail("Not enough left on this listing that isn't already held for someone.");
      if (!isAddOn(ev, l) && personLoad(n, r.buyerId, ev.id, r.id) + r.qty > personCap(ev)) return fail(`${PEOPLE[r.buyerId].first} would go over ${personCap(ev)} per person for this event.`);
      r.status = "accepted"; r.acceptedAt = stamp(); r.topUp = el.topUp || 0;
      r.flow = flowFor(ev, l, r);
      // Contact details: each side agrees for itself (the buyer when requesting, the seller when accepting, or later).
      // Fictional accounts agree automatically in the demo: a labeled shortcut, never how real participants behave.
      const fict = id => !PEOPLE[id].demo;
      r.consent = { seller: !!a.shareContact || fict(l.sellerId), buyer: !!(r.consent && r.consent.buyer) || fict(r.buyerId) };
      r.consentAuto = fict(l.sellerId) || fict(r.buyerId);
      if (simSeller) r.acceptSimulated = true;
      hist(r, (simSeller ? `Simulated: ${PEOPLE[l.sellerId].name} (fictional account) accepted. ` : "") + (r.isOffer ? `Offer accepted at ${money(reqPrice(r, l))}: held for this buyer` : "Accepted: held for this buyer"));
      if (a.shareContact) hist(r, "Seller agreed to share contact details");
      [r.buyerId, l.sellerId].filter(fict).forEach(id => hist(r, `Simulated: ${PEOPLE[id].name} (fictional account) agrees to share contact details automatically`));
      if (!simSeller) note(r.buyerId, `${PEOPLE[l.sellerId].first} accepted your ${r.isOffer ? `offer of ${money(reqPrice(r, l))}` : "request"} for ${ev.title}. It's held for you. Next: ${r.flow === "peer" ? `${PEOPLE[l.sellerId].first} ${ev.paperTicket ? "hands you the paper ticket" : ev.cat === "Travel" ? "forwards you the eTicket" : "sends it to you"}, and you confirm when you have it` : r.flow === "approval" ? "organizer approval" : ev.organizerRequired ? "the trek operator registers you as the traveler" : "the club updates the registration"}.`, { name: "activity", tab: "requests" });
      // Competing requests the listing can no longer meet become backups in settleRequests(); count them for the toast.
      const after = listingNumbers(n, l);
      const backups = n.requests.filter(o => o.listingId === l.id && o.id !== r.id && rState(o).st === "pending" && o.qty > after.available && o.qty <= l.listed - after.completed).length;
      if (simSeller) return { state: n, toast: `Simulated: ${PEOPLE[l.sellerId].first} (fictional account) accepted. It's held for you.` };
      return { state: n, toast: `Accepted and held for ${PEOPLE[r.buyerId].first}. ${r.flow === "peer" ? (ev.paperTicket ? "Hand it over" : "Send it") : "Start the organizer's steps"} within ${RULES.startOfficialHours} hours.${backups ? ` ${plural(backups, "other request")} ${backups === 1 ? "is" : "are"} on hold as ${backups === 1 ? "a backup" : "backups"}.` : ""}` };
    }
    case "decline": {
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      const l = listingOf(r); if (l.sellerId !== actor) return fail("Only the seller can decline.");
      if (r.inviteFlow === true) { // follow-on B5: the seller declines a request to buy, or withdraws an invitation; never a reservation
        const e = rState(r), b = baseSt(e);
        if (!isOpenReq(e)) return fail(closedQuick(e) || "This is already closed.");
        if (b !== "requested" && b !== "invited") return fail(b === "accepted" ? heldFor(r) : freeSkipped(r) ? "It's reserved, so it can't be declined. If something's wrong, tap \"There's a problem\"." : "It's reserved and paid for, so it can't be declined. If something's wrong, tap \"There's a problem\".");
        r.status = "declined"; r.reason = b === "requested" ? "Declined by seller" : "Invitation withdrawn by the seller"; delete r.blockedAt; hist(r, r.reason);
        note(r.buyerId, b === "requested" ? `Your request to buy for ${EV[r.eventId].title} was declined.` : `${P.first} withdrew their invitation for ${EV[r.eventId].title}.`, { name: "event", id: r.eventId });
        return { state: n, toast: b === "requested" ? "Request declined." : "Invitation withdrawn." };
      }
      if (rState(r).st !== "pending") return fail("Only pending requests can be declined.");
      r.status = "declined"; r.reason = "Declined by seller"; hist(r, "Declined by seller");
      note(r.buyerId, `Your ${r.isOffer ? "offer" : "request"} for ${EV[r.eventId].title} was declined.`, { name: "event", id: r.eventId });
      return { state: n, toast: r.isOffer ? "Offer declined." : "Request declined." };
    }
    case "release": {
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      const l = listingOf(r); if (l.sellerId !== actor) return fail("Only the seller can release the hold.");
      const e = rState(r);
      if (e.st === "paid" && r.flow === "quick" && r.payDisputedAt && !r.paymentConfirmedAt) { // after paymentMissing's waiting time (C-DESIGN §8.3)
        if (CLOCK < r.releaseAfter) return fail(`You can release it after ${fmtMs(r.releaseAfter)} if the payment still hasn't arrived. ${PEOPLE[r.buyerId].first} can cancel before then.`);
        r.status = "released"; r.reason = "Released by the seller: the payment didn't arrive"; hist(r, r.reason);
        note(r.buyerId, `${PEOPLE[l.sellerId].first} released the reservation for ${EV[r.eventId].title}, saying the payment didn't arrive. If you did pay, contact them directly: Handoff can't see payments.`, { name: "activity", tab: "requests" });
        return { state: n, toast: `Released. ${backAgain(l)}` };
      }
      // Follow-on B5: the seller invited this buyer, so the reservation is the buyer's for its 15 minutes: it ends on its own.
      if (r.inviteFlow === true && baseSt(e) === "accepted") return fail(heldFor(r));
      if (!(e.st === "accepted" || (e.st === "paused" && e.from === "accepted"))) return fail(e.st === "paid" && r.flow === "quick" ? "The buyer says they paid. If the money hasn't arrived, tap “Payment hasn't arrived” first: they can then cancel, or you can release it after a while." : (r.flow === "quick" && closedQuick(e)) || "Only a hold that hasn't been sent or gone to the organizer can be released.");
      r.status = "released"; r.reason = "Seller released the hold"; hist(r, r.reason);
      note(r.buyerId, `${PEOPLE[l.sellerId].first} released the hold on ${EV[r.eventId].title}.`, { name: "activity", tab: "requests" });
      return { state: n, toast: `Hold released. ${backAgain(l)}` };
    }
    case "paymentMissing": { // the seller says a paid reservation's money hasn't arrived: the buyer may cancel, and after releaseAfter the seller may release it (C-DESIGN §8.3)
      const r = findR(a.requestId); if (!r || r.flow !== "quick") return fail("Not found.");
      const l = listingOf(r); const ev = EV[r.eventId];
      if (l.sellerId !== actor) return fail("Only the seller can say the payment hasn't arrived.");
      if (rState(r).st !== "paid") return fail("This is only for a reservation the buyer marked paid and you haven't confirmed.");
      if (r.payDisputedAt) return fail("You've already said the payment hasn't arrived.");
      const now = stamp(); const use = Math.min(r.departsAt ? atMs(r.departsAt) : Infinity, closesAt(ev)); // as offerEnd: sooner when the ticket is used within a day
      r.payDisputedAt = now; r.releaseAfter = onClock(now) + (use - now < DAY ? RULES.payDisputeHoursSoon : RULES.payDisputeHours) * HOUR;
      hist(r, "Seller says the payment hasn't arrived (Handoff can't see payments)");
      const S = PEOPLE[l.sellerId].first;
      note(r.buyerId, `${S} says your payment for ${ev.title} hasn't arrived. If you paid, contact ${S}: Handoff can't see payments. If you didn't, you can cancel. ${S} can release the ${unitOf(ev)} after ${fmtMs(r.releaseAfter)}.`, { name: "activity", tab: "todo" }, { kind: "payment.missing", ref: r.id });
      return { state: n, toast: `Noted. ${PEOPLE[r.buyerId].first} can cancel, and if the payment still hasn't arrived you can release it after ${fmtMs(r.releaseAfter)}. Handoff can't see payments, so it doesn't decide who's right.` };
    }
    case "consent": {
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      const l = listingOf(r); const side = a.side;
      if ((side === "seller" && l.sellerId !== actor) || (side === "buyer" && r.buyerId !== actor)) return fail("You can only share your own contact details.");
      // Sharing stays open after registration is confirmed (payment still happens between the two of you); it's never automatic.
      if (!["accepted", "sent", "approval", "registration", "completed"].includes(baseSt(rState(r)))) return fail("Contact sharing opens after the seller accepts.");
      if (r.consent[side]) return fail("You've already agreed.");
      r.consent[side] = true; hist(r, `${side === "seller" ? "Seller" : "Buyer"} agreed to share contact details`);
      note(side === "seller" ? r.buyerId : l.sellerId, `${P.first} agreed to share contact details for ${EV[r.eventId].title}.`, { name: "activity", tab: side === "seller" ? "requests" : "listings" });
      return { state: n, toast: "You agreed to share your contact details for this match." };
    }
    case "sellerReport": {
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      const l = listingOf(r);
      const simSeller = a.simulate && !PEOPLE[l.sellerId].demo && r.buyerId === actor; // fictional seller: the buyer may simulate this step (labeled)
      if (l.sellerId !== actor && !simSeller) return fail("Only the seller can report this.");
      if (r.flow === "quick") return fail("Confirm the payment first, then mark it transferred.");
      if (rState(r).st !== "accepted") return fail("This step is only for an accepted match.");
      const ev = EV[r.eventId];
      r.flow = r.flow || flowFor(ev, l, r); // fixed at acceptance, so the step the seller confirms is the step recorded
      r.reports.seller = stamp(); r.status = { peer: "sent", approval: "approval", direct: "registration" }[r.flow];
      if (simSeller) { r.sendSimulated = true; hist(r, `Simulated: ${PEOPLE[l.sellerId].name} (fictional account) reported the next step`); }
      hist(r, { peer: `Seller reported: ${ev.paperTicket ? "handed the ticket to" : "sent it to"} the buyer (self-reported)`, approval: "Seller reported: sent to organizer (self-reported)", direct: `Seller reported: released through ${ev.organizerRequired ? "the trek operator" : "the club"} (self-reported)` }[r.flow]);
      if (simSeller) return { state: n, toast: r.flow === "peer" ? `Simulated: ${PEOPLE[l.sellerId].first} (fictional account) ${ev.paperTicket ? "handed it over" : "sent it"}. Confirm once you have it.` : `Simulated: ${PEOPLE[l.sellerId].first} (fictional account) started ${orgWho(ev) === ev.club ? "the organizer's" : "the operator's"} steps.` };
      note(r.buyerId, { peer: `${PEOPLE[l.sellerId].first} says they ${ev.paperTicket ? "handed you the ticket" : ev.cat === "Travel" ? "forwarded you the eTicket" : `sent you the ${unitOf(ev)}`} for ${ev.title} (self-reported). Confirm in Handoff once you have it.`, approval: `${PEOPLE[l.sellerId].first} says they sent the swap to ${ev.club} (self-reported). Waiting for organizer approval.`, direct: `${PEOPLE[l.sellerId].first} says they released it through ${orgWho(ev)} (self-reported). Waiting for ${ev.organizerRequired ? "the operator" : "the organizer"} to register you.` }[r.flow], { name: "activity", tab: "requests" });
      return { state: n, toast: r.flow === "peer" ? `Marked as ${ev.paperTicket ? "handed over" : "sent"}. ${PEOPLE[r.buyerId].first} confirms once they have it.` : "Noted as self-reported. The organizer still has to act." };
    }
    case "buyerReceived": {
      // Direct handoff: the buyer confirms they have it, which completes the transfer. Fictional buyers can't click,
      // so the seller may simulate their confirmation (labeled as simulated in the UI).
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      const fictionalOk = a.simulate && !PEOPLE[r.buyerId].demo && listingOf(r).sellerId === actor;
      if (r.buyerId !== actor && !fictionalOk) return fail("Only the buyer can confirm they received it.");
      const e = rState(r);
      if (e.st !== "sent") return fail((r.flow === "quick" && (closedQuick(e) || (e.st === "completed" && `${didIt(r.buyerId, PEOPLE[r.buyerId].first)} already confirmed receiving it.`))) || "There's nothing to confirm yet: the seller hasn't marked it as sent.");
      if (a.simulate) r.receiptSimulated = true;
      return completeTransfer(r, a.simulate ? `Simulated: ${PEOPLE[r.buyerId].name} (fictional account) confirmed receipt` : "Buyer confirmed they received it");
    }
    case "buyerReport": {
      const r = findR(a.requestId); if (!r || r.buyerId !== actor) return fail("Request not found.");
      if (baseSt(rState(r)) !== "registration") return fail("This step is only while registration is pending.");
      if (r.reports.buyer) return fail("Already reported.");
      r.reports.buyer = stamp(); hist(r, "Buyer reported: sees registration (self-reported)");
      note(listingOf(r).sellerId, `${PEOPLE[r.buyerId].first} says they can see their registration for ${EV[r.eventId].title} (self-reported, not an organizer confirmation).`, { name: "activity", tab: "listings" });
      return { state: n, toast: "Noted as self-reported. It isn't an organizer confirmation." };
    }
    // Organizer actions also work while a policy change pauses the swap: it already reached the organizer, who decides.
    case "orgApprove": {
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      if (baseSt(rState(r)) !== "approval") return fail("This swap isn't waiting for approval.");
      const l = listingOf(r); const ev = EV[r.eventId];
      r.status = "registration"; hist(r, "Organizer approved (simulated)");
      note(r.buyerId, `${ev.club} approved the swap for ${ev.title} (simulated).${r.topUp ? ` Pay the ${money(r.topUp)} top-up to the club.` : ""} Next: ${ev.organizerRequired ? "the trek operator registers you as the traveler" : "the club updates the registration"}.`, { name: "activity", tab: "requests" });
      note(l.sellerId, `${ev.club} approved your swap with ${PEOPLE[r.buyerId].first} (simulated).`, { name: "activity", tab: "listings" });
      return { state: n, toast: "Organizer approval simulated." };
    }
    case "orgDecline": {
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      if (baseSt(rState(r)) !== "approval") return fail("This swap isn't waiting for approval.");
      const l = listingOf(r); const ev = EV[r.eventId];
      r.status = "declined"; r.reason = "Organizer declined (simulated)"; hist(r, r.reason);
      note(r.buyerId, `${ev.club} didn't approve the swap for ${ev.title} (simulated).`, { name: "event", id: ev.id });
      note(l.sellerId, `${ev.club} didn't approve your swap with ${PEOPLE[r.buyerId].first} (simulated). ${access(ev).ok && !l.withdrawnAt ? "It's available again." : "It's back with you."}`, { name: "activity", tab: "listings" });
      return { state: n, toast: `Organizer decline simulated. ${backAgain(l)}` };
    }
    case "orgConfirm": {
      const r = findR(a.requestId); if (!r) return fail("Request not found.");
      if (baseSt(rState(r)) !== "registration") return fail("Only a pending registration can be confirmed.");
      return completeTransfer(r, "Organizer confirmed registration (simulated)");
    }
    /* ---------- Christine's ticket flow: reserve or offer, pay first, then delivery ---------- */
    case "take": case "offer": {
      // Follow-on B5, once switched on: a live buyer asks first (requestToBuy), so nothing new is reserved or offered the old way.
      // Records made before the switch keep every later step (accept, counter, respond, markPaid …).
      if (n.mode === "live" && inviteOn) return fail("Handoff now asks the seller first. Tap Request to buy.");
      const l = n.listings.find(x => x.id === a.listingId); if (!l) return fail("Listing not found.");
      // Live: a held reply is for its requester, who answers it with respond. To anyone else (but its seller) it doesn't exist.
      if (n.mode === "live" && l.isoReplyFor && l.sellerId !== actor && (n.interests.find(i => i.id === l.isoReplyFor) || {}).userId !== actor) return fail("Listing not found.");
      const ev = EV[l.eventId]; const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (!isQuick(ev)) return fail("Trip and trek spots go through the organizer: send a request instead.");
      if (l.sellerId === actor) return fail("You can't buy your own listing.");
      if (l.withdrawnAt) return fail("This listing was withdrawn.");
      if (departed(l)) return fail("That train has already left.");
      if (l.pausedAt) return fail("The seller has paused this listing, so it can't be reserved or offered on right now.");
      if (tradingPaused(n, actor)) return fail(PAUSED);
      if (tradingPaused(n, l.sellerId)) return fail(SELLER_PAUSED);
      const el = canAcquire(actor, ev, l); if (!el.ok) return fail(el.reason);
      if (el.needsMember && !a.member) return fail(`This ticket is for ${memberClubOf(ev, l)} members. Confirm you're a member to continue.`);
      const lu = unitOf(ev); const num = listingNumbers(n, l);
      if (num.available < 1) return fail(`No ${lu}s are left on this listing.`);
      if (!isInt(a.qty) || a.qty < 1 || a.qty > num.available) return fail(`Choose between 1 and ${plural(num.available, lu)}.`);
      const mine = n.requests.find(r => r.listingId === l.id && r.buyerId === actor && isOpenReq(rState(r)));
      const mineOffer = mine && ["pending", "countered"].includes(baseSt(rState(mine)));
      if (mine && invitePre(mine)) return fail(mine.status === "invited" ? "You're already invited to pay for this. Reserve it to hold it." : "You've already asked to buy this."); // B5: one open record per listing
      if (a.type === "offer" && mine) return fail(mineOffer ? "You already have an active offer on this listing." : "You've already reserved this listing.");
      if (a.type === "take" && mine && !mineOffer) return fail("You've already reserved this listing.");
      if (a.type === "take" && n.requests.some(r => r.buyerId === actor && r.eventId === ev.id && r.flow === "quick" && baseSt(rState(r)) === "accepted")) return fail("You already have an unpaid reservation for this event. Pay for it or cancel it first.");
      if (personLoad(n, actor, ev.id, mine && mine.id) + a.qty > personCap(ev)) return fail(`That would take you over ${personCap(ev)} per person for this event, counting ${lu}s you hold, have reserved or have offered on.`);
      let price = l.ask;
      if (a.type === "offer") {
        if (!l.obo) return fail("This seller isn't taking offers.");
        const off = checkOffer(a.amount, l.ask, true, l.minOffer, true); if (off.error) return fail(off.error);
        if (!off.isOffer) return fail("Enter an offer below the asking price, or tap “I'll take it”.");
        price = off.price;
      }
      if (mine) { mine.status = "cancelled"; mine.reason = "Replaced by a full-price reservation"; hist(mine, mine.reason); } // a full-price take replaces the buyer's own open offer
      const now = stamp(); const id = "r" + uid(); const S = PEOPLE[l.sellerId].first;
      const r = { id, listingId: l.id, eventId: ev.id, buyerId: actor, qty: a.qty, topUp: el.topUp || 0, price, flow: "quick",
        ...(a.type === "offer" ? { isOffer: true, status: "pending", expiresAt: offerEnd(ev, now, l) } : { status: "accepted", acceptedAt: now, holdUntil: holdEnd(ev, now, l, true) }),
        ...(l.departsAt ? { departsAt: l.departsAt } : {}), ...(el.needsMember ? { memberConfirmed: true } : {}), msg: (a.msg || "").slice(0, 280), createdAt: now, consent: { buyer: true, seller: true }, reports: {}, history: [] };
      if (a.type === "take") { const noPay = snapPay(r, l); if (noPay) return fail(noPay); } // reserved now: its payment instructions (follow-on B1)
      n.requests.unshift(r);
      if (el.needsMember) hist(r, `Buyer confirmed they're a ${memberClubOf(ev, l)} member (not checked by Handoff)`);
      if (a.type === "offer") {
        const lasts = openLen(r.expiresAt, now); // the rule's hours, or the minutes left before a cutoff (never "1 hour" for 8 minutes)
        hist(r, `Offered ${money(price)} each (asking ${money(l.ask)})`);
        note(l.sellerId, `${P.name} offered ${money(price)} each for ${plural(a.qty, lu)} for ${ev.title} (you're asking ${money(l.ask)}). Accept, counter once or decline within ${lasts}.`, { name: "activity", tab: "todo" }, { kind: "offer.received", ref: id });
        return { state: n, toast: `Offer sent. ${S} has ${lasts} to accept, counter or decline.`, result: { id } };
      }
      const len = holdLen(r, now);
      hist(r, `Reserved at the asking price ("I'll take it"): held ${len} for payment`);
      note(l.sellerId, `${P.name} reserved ${plural(a.qty, lu)} for ${ev.title} at ${money(price)} each. They have ${len} to pay you and tap "${PAID}".`, { name: "activity", tab: "todo" });
      return { state: n, toast: `Reserved for ${len}. Pay ${S} ${money(price * a.qty)} now, then tap "${PAID}".`, result: { id } };
    }
    case "counter": {
      const r = findR(a.requestId); if (!r || r.flow !== "quick") return fail("Offer not found.");
      const l = listingOf(r); const ev = EV[r.eventId];
      const simSeller = a.simulate && !PEOPLE[l.sellerId].demo && r.buyerId === actor;
      if (l.sellerId !== actor && !simSeller) return fail("Only the seller can counter.");
      if (r.inviteFlow === true) return fail(INVITE_INSTEAD); // follow-on B5: the seller's answer to a new-flow request is an invitation, at any price up to the ask
      if (rState(r).st !== "pending" || !r.isOffer) return fail("Only an open offer can be countered, and only once.");
      if (l.pausedAt) return fail("You paused this listing. Resume it to counter offers."); // the offer stays open meanwhile
      const pm = parseMoney(a.amount); if (pm.error) return fail("Counter: " + pm.error);
      if (pm.value <= r.price || pm.value >= l.ask) return fail(`A counter has to be above the offer (${money(r.price)}) and below your asking price (${money(l.ask)}).`);
      if (tradingPaused(n, l.sellerId)) return fail(l.sellerId === actor ? PAUSED : SELLER_PAUSED);
      const now = stamp(); r.status = "countered"; r.counterPrice = pm.value; r.counteredAt = now; r.expiresAt = offerEnd(ev, now, l);
      if (simSeller) r.counterSimulated = true;
      const lasts = openLen(r.expiresAt, now);
      hist(r, `${simSeller ? `Simulated: ${PEOPLE[l.sellerId].name} (fictional account) countered` : "Seller countered"} at ${money(pm.value)} each (one counter allowed)`);
      if (!simSeller) note(r.buyerId, `${PEOPLE[l.sellerId].first} countered your offer for ${ev.title}: ${money(pm.value)} each. Accept or decline within ${lasts}. Accepting reserves it for ${TAKE_HOLD}, so accept when you can pay.`, { name: "activity", tab: "todo" }, { kind: "counter.received", ref: r.id });
      return { state: n, toast: simSeller ? `Simulated: ${PEOPLE[l.sellerId].first} (fictional account) countered at ${money(pm.value)}.` : `Counter sent: ${money(pm.value)} each. ${PEOPLE[r.buyerId].first} has ${lasts} to accept or decline.` };
    }
    case "respond": {
      // The buyer answers a seller's counter-offer or an ISO reply. Accepting reserves it for RULES.holdMinutes, like "I'll take it".
      const r = findR(a.requestId); if (!r || r.flow !== "quick") return fail("Not found.");
      const l = listingOf(r); const ev = EV[r.eventId];
      const simBuyer = a.simulate && !PEOPLE[r.buyerId].demo && l.sellerId === actor;
      if (r.buyerId !== actor && !simBuyer) return fail("Only the buyer can answer.");
      // Follow-on B5: nothing on a new-flow record is accepted or answered; the buyer reserves an invitation (the words are the buyer's).
      if (r.inviteFlow === true) return fail(r.status === "invited" && isOpenReq(rState(r)) ? (freeDeal(r) ? "You're already invited. Reserve it to hold it." : "You're already invited to pay for this. Reserve it to hold it.") : "There's nothing to answer.");
      const e = rState(r); if (!["countered", "proposed"].includes(e.st)) return fail(e.st === "paused" ? e.reason : "There's nothing to answer.");
      const what = e.st === "countered" ? "counter-offer" : "reply";
      if (!a.accept) {
        r.status = "declined"; r.reason = `Buyer declined the ${what}`; hist(r, simBuyer ? `Simulated: ${PEOPLE[r.buyerId].name} (fictional account) declined the ${what}` : r.reason);
        if (!simBuyer) note(l.sellerId, `${P.name} declined your ${what} for ${ev.title}.`, { name: "activity", tab: "listings" });
        return { state: n, toast: simBuyer ? `Simulated: ${PEOPLE[r.buyerId].first} (fictional account) declined.` : "Declined." };
      }
      const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (departed(l)) return fail("That train has already left.");
      if (l.pausedAt) return fail(`The seller has paused this listing, so you can't accept the ${what} right now. You can still decline it.`);
      if (tradingPaused(n, r.buyerId)) return fail(PAUSED);
      if (tradingPaused(n, l.sellerId)) return fail(SELLER_PAUSED);
      const el = canAcquire(r.buyerId, ev, l); if (!el.ok) return fail(el.reason);
      if (el.needsMember && !r.memberConfirmed && !a.member && !simBuyer) return fail(`This ticket is for ${memberClubOf(ev, l)} members. Confirm you're a member to continue.`);
      if (el.needsMember && !r.memberConfirmed) { r.memberConfirmed = true; hist(r, simBuyer ? `Simulated: ${PEOPLE[r.buyerId].name} (fictional account) confirmed membership` : `Buyer confirmed they're a ${memberClubOf(ev, l)} member (not checked by Handoff)`); }
      if (e.st === "countered" && listingNumbers(n, l).available < r.qty) return fail("Another buyer reserved it first.");
      if (personLoad(n, r.buyerId, ev.id, r.id) + r.qty > personCap(ev)) return fail(`That would go over ${personCap(ev)} per person for this event.`);
      if (n.requests.some(o => o.id !== r.id && o.buyerId === r.buyerId && o.eventId === ev.id && o.flow === "quick" && baseSt(rState(o)) === "accepted")) return fail("There's already an unpaid reservation for this event. Pay for it or cancel it first.");
      const noPay = snapPay(r, l); if (noPay) return fail(noPay); // the reservation's payment instructions (follow-on B1)
      if (e.st === "countered") r.price = r.counterPrice;
      const now = stamp(); r.status = "accepted"; r.acceptedAt = now; r.holdUntil = holdEnd(ev, now, l, true); r.topUp = el.topUp || 0;
      if (simBuyer) r.respondSimulated = true;
      const len = holdLen(r, now);
      hist(r, `${simBuyer ? `Simulated: ${PEOPLE[r.buyerId].name} (fictional account) accepted` : "Buyer accepted"} the ${what} at ${money(r.price)}: reserved ${len} for payment`);
      if (!simBuyer) note(l.sellerId, `${P.name} accepted your ${what} for ${ev.title} at ${money(r.price)}. They have ${len} to pay you.`, { name: "activity", tab: "listings" });
      return { state: n, toast: simBuyer ? `Simulated: ${PEOPLE[r.buyerId].first} (fictional account) accepted. It's reserved for them while they pay you.` : `Reserved for ${len}. Pay ${PEOPLE[l.sellerId].first} ${money(r.price * r.qty)} now, then tap "${PAID}".` };
    }
    case "markPaid": {
      const r = findR(a.requestId); if (!r || r.flow !== "quick") return fail("Not found.");
      const l = listingOf(r); const ev = EV[r.eventId];
      const simBuyer = a.simulate && !PEOPLE[r.buyerId].demo && l.sellerId === actor;
      if (r.buyerId !== actor && !simBuyer) return fail("Only the buyer can mark it paid.");
      const e = rState(r); if (e.st !== "accepted") return fail(e.st === "paused" ? e.reason : closedQuick(e) || (freeSkipped(r) ? "It's free, so there's nothing to pay." : ["paid", "confirmed", "sent", "completed"].includes(e.st) ? `${didIt(r.buyerId, PEOPLE[r.buyerId].first)} already marked it paid.` : "Only a reserved ticket can be marked paid.")); // §9x item 1: a free reservation has no payment step
      // Live (follow-on B1): which of the exchange's methods the buyer says they used (via, one of r.pay's kinds): implied when there's
      // one, asked for when there are two. An exchange reserved before B1 has no r.pay, so there's nothing to choose and via is ignored.
      // This is the buyer's word ("I've sent payment"); "Payment received" (confirmPayment) stays the seller's. Handoff checks neither.
      let via = null;
      if (n.mode === "live" && Array.isArray(r.pay) && r.pay.length) {
        const kinds = r.pay.map(m => m.kind);
        via = a.via == null || a.via === "" ? (kinds.length === 1 ? kinds[0] : null) : String(a.via);
        if (!kinds.includes(via)) return fail(`Choose how you paid: ${kinds.map(k => PAY_LABELS[k] || k).join(" or ")}.`);
      }
      r.status = "paid"; r.paidAt = stamp(); if (via) r.paidVia = via; if (simBuyer) r.paidSimulated = true;
      const amount = money(r.price * r.qty), named = via && via !== "other" ? PAY_LABELS[via] : null; // a legacy handle names no provider
      hist(r, simBuyer ? `Simulated: ${PEOPLE[r.buyerId].name} (fictional account) said they paid` : `Buyer said they paid ${amount}${named ? ` by ${named}` : ""} (self-reported)`);
      if (!simBuyer) note(l.sellerId, named ? `${P.name} says they sent ${amount} by ${named} for ${ev.title}. Check ${named}, then tap "Payment received".`
        : `${P.name} says they paid you ${amount} for ${ev.title}. Check Venmo or PayPal, then tap "Payment received".`, { name: "activity", tab: "todo" }, { kind: "payment.reported", ref: r.id });
      return { state: n, toast: simBuyer ? `Simulated: ${PEOPLE[r.buyerId].first} (fictional account) paid. Check it arrived, then tap "Payment received".` : `${n.mode === "live" ? "Payment marked as sent" : "Marked paid"}. ${PEOPLE[l.sellerId].first} confirms it arrived, then ${{ file: n.mode === "live" ? "they send you the PDF or QR code" : "Handoff sends you the ticket file", app: "they transfer it to your email in Ticketmaster or AXS", name: `they ask ${ev.club} to put it in your name`, inperson: "they hand it over" }[l.method] || `they send you the ${unitOf(ev)}`}.` }; // no method recorded (§9m): the neutral words
    }
    case "confirmPayment": {
      const r = findR(a.requestId); if (!r || r.flow !== "quick") return fail("Not found.");
      const l = listingOf(r); const ev = EV[r.eventId]; const B = PEOPLE[r.buyerId].first, S = PEOPLE[l.sellerId].first;
      const simSeller = a.simulate && !PEOPLE[l.sellerId].demo && r.buyerId === actor;
      if (l.sellerId !== actor && !simSeller) return fail("Only the seller can confirm the payment.");
      const e = rState(r); if (e.st !== "paid") return fail(closedQuick(e) || (freeSkipped(r) ? "It's free, so there's no payment to confirm." : ["confirmed", "sent", "completed"].includes(e.st) ? `${didIt(l.sellerId, S)} already confirmed this payment.` : "The buyer hasn't marked it paid yet.")); // §9x item 1
      const now = stamp(); r.paymentConfirmedAt = now; if (simSeller) r.confirmSimulated = true;
      hist(r, simSeller ? `Simulated: ${PEOPLE[l.sellerId].name} (fictional account) confirmed the payment` : "Seller confirmed the payment arrived");
      if (l.method === "file" && n.mode !== "live") { // preview: Handoff delivers the file (simulated); live: the seller sends it, below
        r.status = "sent"; r.deliveredAt = now;
        hist(r, `Handoff delivered the ticket file (${l.file ? l.file.name : "ticket"}) to the buyer in the app and by email (simulated)`);
        note(r.buyerId, `Your ticket for ${ev.title} is ready: ${l.file ? l.file.name : "the ticket file"}. Check it, then tap "Received".`, { name: "activity", tab: "todo" });
        return { state: n, toast: simSeller ? `Simulated: ${S} (fictional account) confirmed your payment. Handoff delivered the ticket file: check it, then tap "Received".` : `Payment confirmed. Handoff delivered the ticket file to ${B} (simulated).` };
      }
      r.status = "confirmed";
      // A listing posted with no method (§9m item 1) promises none: the neutral words, for the buyer and for the seller.
      const how = METHODS[l.method] || null;
      note(r.buyerId, `${S} confirmed your payment for ${ev.title}. Next: they ${how ? how.verb : `send you the ${unitOf(ev)}`}.`, { name: "activity", tab: "requests" });
      return { state: n, toast: simSeller ? `Simulated: ${S} (fictional account) confirmed your payment.` : `Payment confirmed. Now ${l.method === "file" ? `send the PDF or QR code to ${B} yourself, then tap “I've sent it”` : how ? how.verb : `send the ${unitOf(ev)} to ${B}, then tap “I've sent it”`}.` };
    }
    case "markTransferred": {
      const r = findR(a.requestId); if (!r || r.flow !== "quick") return fail("Not found.");
      const l = listingOf(r); const ev = EV[r.eventId]; const S = PEOPLE[l.sellerId].first;
      const simSeller = a.simulate && !PEOPLE[l.sellerId].demo && r.buyerId === actor;
      if (l.sellerId !== actor && !simSeller) return fail("Only the seller can mark it transferred.");
      // The preview "delivers" a ticket file itself (confirmPayment, above), so a file that went that way wasn't marked by anyone.
      const e = rState(r); if (e.st !== "confirmed") return fail(closedQuick(e) || (["sent", "completed"].includes(e.st) ? (r.reports && r.reports.seller ? `${didIt(l.sellerId, S)} already marked it as sent.` : "It's already been sent.") : "Confirm the payment first."));
      r.status = "sent"; r.deliveredAt = stamp(); r.reports.seller = r.deliveredAt; if (simSeller) r.sendSimulated = true;
      const did = { app: "transferred it in Ticketmaster or AXS", name: `asked ${orgOf(ev, l)} to change the name`, inperson: "handed over the paper ticket" }[l.method] || "sent it"; // orgOf: the event's club, or the one named on the listing (§9v item 4)
      hist(r, `${simSeller ? `Simulated: ${PEOPLE[l.sellerId].name} (fictional account)` : "Seller"} ${did} (self-reported)`);
      if (!simSeller) note(r.buyerId, { app: `${S} says they transferred the ticket for ${ev.title} to your email. Accept it in Ticketmaster or AXS, then tap "Received".`, name: `${S} asked ${ev.club} to put the ${unitOf(ev)} for ${ev.title} in your name. Tap "Received" once it's confirmed.`, inperson: `${S} says they handed you the ticket for ${ev.title}. Tap "Received".` }[l.method] || `${S} says they sent it. Tap "Received" once you have it.`, { name: "activity", tab: "todo" }, { kind: "transfer.sent", ref: r.id });
      return { state: n, toast: simSeller ? `Simulated: ${S} (fictional account) ${did}. Tap "Received" once you have it.` : `Marked done. ${PEOPLE[r.buyerId].first} taps "Received" once they have it.` };
    }
    case "isoReply": {
      // A held reply ("hold one for them at their budget"): a seller answers one buyer's request at the buyer's budget (capped at what the
      // seller paid) or one counter price. It becomes a listing just for that buyer, held until they answer; there are no offers on replies.
      // Follow-on B5, once switched on: a live seller answers a request by inviting the requester to pay on a listing (inviteRequester),
      // which holds nothing; a reply held before the switch keeps its terms. Also refused as addThen's or seq's follow-up step.
      if (n.mode === "live" && inviteOn) return fail("Reply by inviting them to pay on one of your listings.");
      const i = n.interests.find(x => x.id === a.isoId); if (!i || !i.eventId || i.kind !== "iso") return fail("Request not found.");
      if (!isLive(i)) return fail("This request has expired or closed.");
      if (i.userId === actor) return fail("That's your own request.");
      const ev = EV[i.eventId]; if (!isQuick(ev)) return fail("Trip and trek spots go through the organizer: list it, then share the listing with their request.");
      const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (tradingPaused(n, actor)) return fail(PAUSED);
      const h = n.holdings.find(x => x.id === a.holdingId); if (!h || h.userId !== actor || h.eventId !== ev.id) return fail("Choose a ticket you hold for this event.");
      const ht = h.tier ? tierOf(ev, h.tier) : null; if (ht && ht.addOn) return fail("Add-ons don't answer a request.");
      if (ht && ht.memberOnly && !mayHoldMemberTier(actor, ev)) return fail("This member-priced ticket can't be sold by a non-member.");
      const free = holdingFree(n, h); const lu = unitOf(ev);
      if (!isInt(a.qty) || a.qty < 1 || a.qty > Math.min(free, i.qty)) return fail(`Choose between 1 and ${plural(Math.min(free, i.qty), lu)}.`);
      if (n.listings.some(x => x.isoReplyFor === i.id && x.sellerId === actor && !x.withdrawnAt)) return fail("You've already replied to this request.");
      const cap = askCap(ev, h); const base = i.budget != null ? Math.min(i.budget, cap) : cap;
      if (!a.counter && !Number.isFinite(base)) return fail("Propose your price."); // forms round 2: no budget and no face value to start from
      let price = base;
      if (a.counter) { const pm = parseMoney(a.price); if (pm.error) return fail("Price: " + pm.error); if (pm.value <= 0) return fail("Price: enter more than $0."); if (pm.value > cap) return fail(n.mode === "live" ? `You can't ask more than the face value (${money(cap)}).` : `You can't ask more than you paid (${money(cap)}).`); price = pm.value; }
      // Live: the requester's eligibility and other tickets are private, so these refusals don't describe them (C-DESIGN §3.7).
      const el = canAcquire(i.userId, ev, { tier: h.tier, method: a.method }); if (!el.ok) return fail(n.mode === "live" ? "This request can't take that ticket. Share a listing instead." : `${PEOPLE[i.userId].first} can't take this ticket: ${el.reason}`);
      // Live checks the requester's per-person limit only when they answer the reply (respond: their own records, in their own
      // words), never here. A refusal here, however worded, would let the seller work out how many tickets they hold or have
      // asked for elsewhere, by trying smaller quantities (review P3; DEVIATIONS D44).
      if (n.mode !== "live" && personLoad(n, i.userId, ev.id) + a.qty > personCap(ev)) return fail(`${PEOPLE[i.userId].first} would go over ${personCap(ev)} per person for this event.`);
      const dlv = deliveryFor(ev, a, actor); if (dlv.error) return fail(dlv.error);
      const tr = trainFor(ev, a.departsAt); if (tr.error) return fail(tr.error); const dep = tr.departsAt ? { departsAt: tr.departsAt } : {};
      // The request's deadline is the latest train that fits it, as wherever it's matched (spotMatch).
      if (tr.departsAt && i.expires && atMs(tr.departsAt) > atMs(i.expires)) return fail(`The train leaves ${fmtWhen(tr.departsAt)}, after ${PEOPLE[i.userId].first}'s ${fmtDate(i.expires)} deadline.`);
      const now = stamp(); const lid = "l" + uid(); const rid = "r" + uid();
      const l = { id: lid, eventId: ev.id, sellerId: actor, holdingId: h.id, listed: a.qty, ask: price, paid: h.paid, tier: h.tier, viaOrganizer: false, ...(dlv.method ? { method: dlv.method } : {}), ...(dlv.payHandle ? { payHandle: dlv.payHandle } : {}), ...(dlv.file ? { file: dlv.file } : {}), ...(dlv.namesChecked ? { namesChecked: true } : {}), ...(a.membersOnly ? { membersOnly: true } : {}), ...dep, isoReplyFor: i.id, note: (a.note || "").slice(0, 280), createdAt: now, history: [{ at: now, text: `Replied to ${PEOPLE[i.userId].name}'s request with ${plural(a.qty, lu)} at ${money(price)}, held for their answer` }] };
      const r = { id: rid, listingId: lid, eventId: ev.id, buyerId: i.userId, qty: a.qty, topUp: el.topUp || 0, price, flow: "quick", isoReply: true, ...(a.counter && price !== base ? { isCounter: true } : {}), ...dep, msg: (a.note || "").slice(0, 280), status: "proposed", createdAt: now, expiresAt: offerEnd(ev, now, l), consent: { buyer: true, seller: true }, reports: {}, history: [] };
      hist(r, `${P.name} held one for this request at ${money(price)}${r.isCounter ? ` (a counter to the budget of ${money(i.budget)})` : ""}`);
      n.listings.unshift(l); n.requests.unshift(r);
      const lasts = openLen(r.expiresAt, now);
      note(i.userId, `${P.name} is holding ${plural(a.qty, lu)} for ${ev.title} for your request, at ${money(price)}${r.isCounter ? ` (your budget was ${money(i.budget)})` : ""}. Accept within ${lasts} to reserve it for ${TAKE_HOLD}, and pay right away.${membersOnlyListing(ev, l) ? ` Members only: you'll confirm you're a ${memberClubOf(ev, l)} member.` : ""}`, { name: "activity", tab: "todo" }, { kind: "reply.held", ref: rid });
      return { state: n, toast: `Sent to ${PEOPLE[i.userId].first}. If they accept within ${lasts}, it's reserved for them for ${TAKE_HOLD} while they pay you.`, result: { id: rid } };
    }
    /* ---------- Follow-on B5 (invite to pay), live only: ask, invite, reserve (FOLLOWON-PLAN §2.5) ----------
       A buyer asks to buy (requestToBuy); the seller invites them to pay (invite), or invites the poster of a public request on one of
       their listings (inviteRequester); the buyer reserves the invitation (reserve). Only reserve holds anything: requests and
       invitations take no stock (they aren't in RESERVING), show no payment details and can go to several buyers for the same ticket.
       Every record made here carries inviteFlow, and from "accepted" on it follows the steps every reservation does (markPaid …). */
    case "requestToBuy": {
      // At the asking price or, where the seller takes offers, with an offer below it. The seller answers with invite or decline.
      if (n.mode !== "live") return fail("Unknown action.");
      const l = n.listings.find(x => x.id === a.listingId); if (!l) return fail("Listing not found.");
      // A held reply (made before the switch) is for its requester, who answers it; to anyone else but its seller it doesn't exist.
      if (l.isoReplyFor && l.sellerId !== actor) return fail((n.interests.find(i => i.id === l.isoReplyFor) || {}).userId === actor ? "This one is already held for your request. Answer the reply instead." : "Listing not found.");
      const ev = EV[l.eventId]; const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (!isQuick(ev)) return fail("Trip and trek spots go through the organizer: send a request instead.");
      if (l.sellerId === actor) return fail("You can't buy your own listing.");
      if (l.withdrawnAt) return fail("This listing is closed.");
      if (departed(l)) return fail("That train has already left.");
      if (l.pausedAt) return fail("The seller has paused this listing, so you can't ask to buy it right now.");
      if (tradingPaused(n, actor)) return fail(PAUSED);
      if (tradingPaused(n, l.sellerId)) return fail(SELLER_PAUSED);
      const el = canAcquire(actor, ev, l); if (!el.ok) return fail(el.reason);
      if (el.needsMember && !a.member) return fail(`This ticket is for ${memberClubOf(ev, l)} members. Confirm you're a member to continue.`);
      const lu = unitOf(ev); const num = listingNumbers(n, l);
      if (num.available < 1) return fail(`No ${lu}s are left on this listing.`);
      if (!isInt(a.qty) || a.qty < 1 || a.qty > num.available) return fail(`Choose between 1 and ${plural(num.available, lu)}.`);
      // One open record per buyer and listing, whatever its stage.
      const mine = n.requests.find(r => r.listingId === l.id && r.buyerId === actor && isOpenReq(rState(r)));
      if (mine) { const b = baseSt(rState(mine)); return fail(b === "requested" ? (freeDeal(mine) ? "You've already asked for this." : "You've already asked to buy this.") : b === "invited" ? (freeDeal(mine) ? "You're already invited. Reserve it to hold it." : "You're already invited to pay for this. Reserve it to hold it.") : ["pending", "countered", "proposed"].includes(b) ? "You already have an active offer on this listing." : "You've already reserved this listing."); }
      // The per-person limit counts what the buyer holds and has reserved, never other requests or invitations (they hold nothing), and
      // an unpaid reservation elsewhere doesn't stop asking: both are checked again when an invitation is reserved.
      if (personLoad(n, actor, ev.id) + a.qty > personCap(ev)) return fail(`That would take you over ${personCap(ev)} per person for this event, counting ${lu}s you hold or have reserved.`);
      let price = l.ask, isOffer = false;
      if (a.amount != null && String(a.amount).trim() !== "") {
        if (!l.obo) return fail("This seller isn't taking offers. Ask to buy it at the asking price.");
        const om = parseMoney(a.amount); if (om.error) return fail("Offer: " + om.error);
        if (om.value <= 0) return fail("Offer: enter more than $0.");
        if (om.value >= l.ask) return fail(`An offer has to be below the asking price (${money(l.ask)}). To ask at that price, leave the offer out.`);
        if (l.minOffer && om.value < l.minOffer) return fail(`This seller takes offers from ${money(l.minOffer)}.`);
        price = om.value; isOffer = true;
      }
      const now = stamp(); const id = "r" + uid(); const S = PEOPLE[l.sellerId].first;
      const r = { id, listingId: l.id, eventId: ev.id, buyerId: actor, qty: a.qty, topUp: el.topUp || 0, price, flow: "quick", inviteFlow: true, ...(isOffer ? { isOffer: true } : {}), status: "requested", expiresAt: offerEnd(ev, now, l),
        ...(l.departsAt ? { departsAt: l.departsAt } : {}), ...(el.needsMember ? { memberConfirmed: true } : {}), msg: (a.msg || "").slice(0, 280), createdAt: now, consent: { buyer: true, seller: true }, reports: {}, history: [] };
      n.requests.unshift(r);
      if (el.needsMember) hist(r, `Buyer confirmed they're a ${memberClubOf(ev, l)} member (not checked by Handoff)`);
      const gratis = price === 0; // §9x item 1: a free ticket: nobody is asked to pay
      hist(r, isOffer ? `Asked to buy ${plural(a.qty, lu)}, offering ${money(price)} each (asking ${money(l.ask)}): nothing is held` : gratis ? `Asked for ${plural(a.qty, lu)}, listed for free: nothing is held` : `Asked to buy ${plural(a.qty, lu)} at ${money(price)} each: nothing is held`);
      note(l.sellerId, gratis ? `${P.name} wants ${plural(a.qty, lu)} for ${ev.title}, which you listed for free. Invite them, or decline, by ${fmtMs(r.expiresAt)}.`
        : `${P.name} wants ${plural(a.qty, lu)} for ${ev.title} ${isOffer ? `and offers ${money(price)} each (you're asking ${money(l.ask)})` : `at ${money(price)} each`}. Invite them to pay, or decline, by ${fmtMs(r.expiresAt)}.`, { name: "activity", tab: "todo" }, { kind: "buy.requested", ref: id });
      return { state: n, toast: `Request sent. Nothing is held: ${S} has until ${fmtMs(r.expiresAt)} to invite you${gratis ? "" : " to pay"}.`, result: { id } };
    }
    case "invite": {
      // The seller's answer to a request to buy: for up to the quantity asked, at the asking price or less (never below the buyer's
      // offer). The first invited buyer who reserves gets the ticket, so the seller can invite others for it too. The seller needs a
      // way to be paid by now; that check comes last, so once a method is saved (collected inline) the same invitation goes through.
      if (n.mode !== "live") return fail("Unknown action.");
      const r = findR(a.requestId); if (!r || r.flow !== "quick") return fail("Request not found.");
      const l = listingOf(r);
      if (l.sellerId !== actor) return fail(r.buyerId === actor ? "Only the seller can send an invitation." : "Request not found.");
      if (r.inviteFlow !== true) return fail("This one came before invitations. Accept, counter or decline it instead.");
      const e = rState(r), b = baseSt(e); const B = (PEOPLE[r.buyerId] || CLASSMATE).first;
      if (b !== "requested") return fail(b === "invited" ? `You've already invited ${B}.` : b === "expired" ? "This request has ended." : FINAL.includes(b) ? "This request is closed." : "It's already reserved.");
      const ev = EV[r.eventId]; const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (l.withdrawnAt) return fail("This listing is closed.");
      if (departed(l)) return fail("That train has already left.");
      if (l.pausedAt) return fail(`You paused this listing. Resume it to invite ${B}: their request stays open until ${fmtMs(r.expiresAt)}.`);
      if (tradingPaused(n, l.sellerId) || tradingPaused(n, r.buyerId)) return fail(tradingPaused(n, actor) ? PAUSED : `${B} can't trade right now (demo rule).`);
      const lu = unitOf(ev); const num = listingNumbers(n, l); const most = Math.min(r.qty, num.available);
      if (most < 1) return fail(`${l.ask === 0 ? "Another buyer has reserved it." : "Another buyer is paying for it right now."} You can invite ${B} if it comes back: their request stays open until ${fmtMs(r.expiresAt)}.`); // §9x item 1: nobody pays for a free ticket
      if (a.qty == null && r.qty > most) return fail(`Only ${plural(most, lu)} ${most === 1 ? "is" : "are"} available right now, and ${B} asked for ${r.qty}. Choose how many to invite them for.`);
      const qty = a.qty == null ? r.qty : a.qty;
      if (!isInt(qty) || qty < 1 || qty > most) return fail(`Choose between 1 and ${plural(most, lu)}.`);
      let price = Math.min(r.price, l.ask); // what the buyer asked at (or offered), never above today's asking price
      if (a.price != null && String(a.price).trim() !== "") {
        const pm = parseMoney(a.price); if (pm.error) return fail("Price: " + pm.error);
        if (pm.value <= 0 && l.ask > 0) return fail("Price: enter more than $0.");
        if (pm.value > l.ask) return fail(`You're asking ${money(l.ask)}. Invite at that price or less, or change the listing's price first.`);
        if (r.isOffer && pm.value < r.price) return fail(`${B} offered ${money(r.price)}. Invite at that price or more.`);
        price = pm.value;
      }
      // §9x item 1: a free ticket (the invitation's price is $0) needs no way to be paid, and its words ask nobody to pay.
      const gratis = price === 0;
      if (!gratis && !payMethodsOf(actor).length && !(typeof l.payHandle === "string" && l.payHandle.trim())) return fail(NO_PAY_METHODS);
      const now = stamp();
      if (qty < r.qty) r.wantedQty = r.qty;
      r.qty = qty; r.price = price; r.status = "invited"; r.invitedAt = now; r.expiresAt = offerEnd(ev, now, l); delete r.blockedAt;
      hist(r, `Seller invited the buyer to ${gratis ? `take ${plural(qty, lu)} for free` : `pay ${money(price)} each for ${plural(qty, lu)}`}${r.wantedQty ? ` (they asked for ${r.wantedQty})` : ""}: not held until the buyer reserves it`);
      note(r.buyerId, gratis ? `${P.first} invited you to take ${plural(qty, lu)} for ${ev.title} for free. It isn't held yet: reserve it by ${fmtMs(r.expiresAt)}. There's nothing to pay.`
        : `${P.first} invited you to pay ${money(price)} each for ${plural(qty, lu)} for ${ev.title}. It isn't held yet: reserve it by ${fmtMs(r.expiresAt)}, then you have up to ${TAKE_HOLD} to pay.`, { name: "activity", tab: "todo" }, { kind: "buy.invited", ref: r.id });
      return { state: n, toast: `Invitation sent. Nothing is held: it's ${B}'s once they reserve it, by ${fmtMs(r.expiresAt)}. You can invite others too.` };
    }
    case "inviteRequester": {
      // "I have this" on a public request: its poster is invited to pay on one of the seller's own public listings, as invite does, with
      // no request to buy before it. The listing stays open to everyone. Also a seq step, after the step that lists the ticket.
      // Live: the poster's eligibility, other tickets and reservations are private, so nothing here reads or describes them.
      if (n.mode !== "live") return fail("Unknown action.");
      const l = n.listings.find(x => x.id === a.listingId); if (!l || l.sellerId !== actor) return fail("Choose one of your listings.");
      if (l.isoReplyFor || l.withdrawnAt) return fail("Only a listing that's open to everyone can be used for an invitation.");
      const i = n.interests.find(x => x.id === a.isoId); if (!i || i.kind !== "iso" || !i.eventId) return fail("Request not found.");
      if (i.userId === actor) return fail("That's your own request.");
      if (!liveRequest(n, i)) return fail("This request has expired or closed.");
      if (i.eventId !== l.eventId) return fail("That listing is for a different event.");
      const ev = EV[l.eventId]; const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (!isQuick(ev)) return fail("Trip and trek spots go through the organizer: share the listing with their request instead.");
      if (isAddOn(ev, l)) return fail("Add-ons don't answer a request.");
      if (departed(l)) return fail("That train has already left.");
      if (l.pausedAt) return fail("You paused this listing. Resume it to invite them.");
      if (tradingPaused(n, actor)) return fail(PAUSED);
      const B = PEOPLE[i.userId] || CLASSMATE;
      const el = canAcquire(i.userId, ev, l); if (!el.ok) return fail("This request can't take that ticket. Share the listing instead.");
      // One open record per buyer and listing. The seller is a party to each of these, so naming its stage tells them nothing new.
      const open = n.requests.find(r => r.listingId === l.id && r.buyerId === i.userId && isOpenReq(rState(r)));
      if (open) { const b = baseSt(rState(open)); return fail(b === "requested" ? `${B.first} has already asked to buy this listing. Invite them from their request.` : b === "invited" ? `You've already invited ${B.first} on this listing.` : `${B.first} already has an open exchange with you on this listing.`); }
      const lu = unitOf(ev); const num = listingNumbers(n, l); const most = Math.min(i.qty || 1, num.available);
      if (most < 1) return fail(`No ${lu}s are available on this listing right now.`);
      if (!isInt(a.qty) || a.qty < 1 || a.qty > most) return fail(`Choose between 1 and ${plural(most, lu)}.`);
      let price = l.ask;
      if (a.price != null && String(a.price).trim() !== "") {
        const pm = parseMoney(a.price); if (pm.error) return fail("Price: " + pm.error);
        if (pm.value <= 0 && l.ask > 0) return fail("Price: enter more than $0.");
        if (pm.value > l.ask) return fail(`You're asking ${money(l.ask)}. Invite at that price or less, or change the listing's price first.`);
        price = pm.value;
      }
      // The request's deadline is the latest train that fits it, as wherever it's matched (spotMatch, isoReply).
      if (l.departsAt && i.expires && atMs(l.departsAt) > atMs(i.expires)) return fail(`The train leaves ${fmtWhen(l.departsAt)}, after ${B.first}'s ${fmtDate(i.expires)} deadline.`);
      // §9x item 1: a free ticket (the invitation's price is $0) needs no way to be paid, and its words ask nobody to pay.
      const gratis = price === 0;
      if (!gratis && !payMethodsOf(actor).length && !(typeof l.payHandle === "string" && l.payHandle.trim())) return fail(NO_PAY_METHODS);
      const now = stamp(); const id = "r" + uid();
      const r = { id, listingId: l.id, eventId: ev.id, buyerId: i.userId, qty: a.qty, topUp: el.topUp || 0, price, flow: "quick", inviteFlow: true, fromIso: i.id, status: "invited", invitedAt: now, expiresAt: offerEnd(ev, now, l),
        ...(l.departsAt ? { departsAt: l.departsAt } : {}), msg: "", createdAt: now, consent: { buyer: true, seller: true }, reports: {}, history: [] };
      n.requests.unshift(r);
      hist(r, `${P.name} invited the poster of a request to ${gratis ? `take ${plural(a.qty, lu)} for free` : `pay ${money(price)} each for ${plural(a.qty, lu)}`}: not held until the buyer reserves it`);
      hist(l, gratis ? `Invited ${B.name}, for their request` : `Invited ${B.name} to pay, for their request`);
      dropSameChange(n, i.userId, x => x.name === "event" && x.listing === l.id); // listed for this request in this change: one notification, the invitation
      note(i.userId, `${gratis ? `${P.name} invited you to take ${plural(a.qty, lu)} for ${ev.title} for free, for your request. It isn't held yet: reserve it by ${fmtMs(r.expiresAt)}. There's nothing to pay.`
        : `${P.name} invited you to pay ${money(price)} each for ${plural(a.qty, lu)} for ${ev.title}, for your request. It isn't held yet: reserve it by ${fmtMs(r.expiresAt)}, then you have up to ${TAKE_HOLD} to pay.`}${membersOnlyListing(ev, l) ? ` Members only: you'll confirm you're a ${memberClubOf(ev, l)} member.` : ""}`, { name: "activity", tab: "todo" }, { kind: "buy.invited", ref: id });
      return { state: n, toast: `Invitation sent to ${B.first}. Nothing is held: it's theirs once they reserve it, by ${fmtMs(r.expiresAt)}.`, result: { id } };
    }
    /* §9v item 2 (live, SELL5-M3): "I have this" on someone's ticket request, answered in one submission. The seller answers from one of
       their own open listings (listingId: its poster is invited to pay on it, exactly as inviteRequester does, for how many and at an
       optional lower price), or with a ticket listed for the request right here, on the request's event: one they hold and haven't listed
       (holdingId: list) or one they add (postTicket, with its ticket type where the event has several), with every rule of Sell. The poster
       is then invited to pay for it (inviteRequester, with every rule of an invitation: the seller's way to be paid, a train leaving by the
       request's deadline), for one ticket unless more were listed and never more than they asked for, at the listing's price. Nothing is
       held: the listing is open to everyone, and only a reservation holds a ticket (the poster reserves from the invitation).
       One change, all or nothing, with one exception, said in so many words: when the request is no longer open as this applies (closed,
       filled or past its deadline), a new listing is still posted, as the seller asked, and no invitation goes out (the second step says
       why, and so does the toast); from an existing listing nothing changes, and the refusal says why. One submission makes one listing:
       a second answer with a new ticket, while the first one's listing is open with tickets left (a double tap that got through, another
       tab), is refused; the same submission sent again is answered from the actions log (its request id). The listing keeps the request it
       was made for (forIso), which no view shows. result: the listing; steps: what each part did (list or postTicket, then
       inviteRequester). */
    case "answerRequest": {
      if (n.mode !== "live") return fail("Unknown action.");
      const i = n.interests.find(x => x.id === a.isoId); if (!i || i.kind !== "iso" || !i.eventId) return fail("Request not found.");
      if (i.userId === actor) return fail("That's your own request.");
      const B = PEOPLE[i.userId] || CLASSMATE;
      // Why no invitation can reach the poster now (their request isn't open any more), in the words the seller reads, or null.
      const gone = liveRequest(n, i) ? null : `${B.first}'s request ${i.status !== "open" ? (i.closedReason === "fulfilled" ? "was filled" : "closed") : "ended"}`;
      if (typeof a.listingId === "string" && a.listingId !== "") { // from a listing the seller already has
        if (gone) return fail(`${gone} before your invitation reached them, so nothing was sent.`);
        const own = n.listings.find(x => x.id === a.listingId);
        const qty = a.qty == null ? Math.max(1, own ? Math.min(i.qty || 1, listingNumbers(n, own).available) : 1) : a.qty;
        const r = reduce(n, actor, { type: "inviteRequester", isoId: i.id, listingId: a.listingId, qty, price: a.price });
        if (r.error) { const f = fail(r.error); f.steps = [{ type: "inviteRequester", ok: false, error: r.error }]; return f; }
        return { state: r.state, toast: r.toast, result: { id: a.listingId }, steps: [{ type: "inviteRequester", ok: true, id: r.result.id }] };
      }
      // A ticket listed for this request: one submission makes one listing (a resend with a new id, another tab).
      if (n.listings.some(l => l.sellerId === actor && l.forIso === i.id && !l.withdrawnAt && listingNumbers(n, l).available > 0)) return fail(`You've already listed a ticket for ${B.first}'s request.`);
      const held = typeof a.holdingId === "string" && a.holdingId !== "";
      if (held) { const h = n.holdings.find(x => x.id === a.holdingId); if (h && h.userId === actor && h.eventId !== i.eventId) return fail("That ticket is for a different event."); }
      // What a listing reads, as Sell sends it (a quantity left out is one), on the request's own event.
      const body = { qty: a.qty == null ? 1 : a.qty, ask: a.ask, obo: a.obo, minOffer: a.minOffer, note: a.note, method: a.method, namesChecked: a.namesChecked, membersOnly: a.membersOnly, memberClub: a.memberClub, club: a.club, restricted: a.restricted, restriction: a.restriction, departsAt: a.departsAt };
      const listA = held ? { type: "list", holdingId: a.holdingId, viaOrganizer: false, ...body } : { type: "postTicket", eventId: i.eventId, ...(typeof a.tier === "string" && a.tier ? { tier: a.tier } : {}), ...body };
      const r0 = reduce(n, actor, listA);
      if (r0.error) { const f = fail(r0.error); f.steps = [{ type: listA.type, ok: false, error: r0.error }]; return f; }
      const lid = r0.result.id, cur = r0.state;
      const l = cur.listings.find(x => x.id === lid); l.forIso = i.id;
      const ev = EV[l.eventId]; const u = isAddOn(ev, l) ? "add-on" : unitOf(ev);
      if (gone) { // listed as the seller asked; no invitation, and they're told exactly that
        const said = `${gone} before it reached them, so no invitation went out.`;
        return { state: cur, result: { id: lid }, toast: `Your ${u} is listed. ${said}`, steps: [{ type: listA.type, ok: true, id: lid }, { type: "inviteRequester", ok: false, error: said }] };
      }
      const r1 = reduce(cur, actor, { type: "inviteRequester", isoId: i.id, listingId: lid, qty: Math.min(l.listed, i.qty || 1) });
      if (r1.error) { const f = fail(r1.error); f.steps = [{ type: listA.type, ok: false, error: SEQ_NOT_SAVED }, { type: "inviteRequester", ok: false, error: r1.error }]; return f; }
      const r = r1.state.requests.find(x => x.id === r1.result.id);
      // §9w (SELL5-M4): "Ticket listed. Invitation sent to Dan.", as the page's landing line says it (words only: no protocol change).
      return { state: r1.state, result: { id: lid }, toast: `${u === "add-on" ? "Add-on" : UnitOf(ev)} listed. Invitation sent to ${B.first}. Nothing is held until someone reserves it: ${B.first} has until ${fmtMs(r.expiresAt)}.`,
        steps: [{ type: listA.type, ok: true, id: lid }, { type: "inviteRequester", ok: true, id: r1.result.id }] };
    }
    case "reserve": {
      // The one step that holds anything in the new flow, checked in one go against the document as it is now, in FOLLOWON-PLAN §2.5's
      // order, so of two buyers invited for the last ticket exactly one gets it (the store runs one action at a time per world). The
      // hold is 15 minutes at most, less when the transfer cutoff, the event or a train comes first (holdEnd), and the payment
      // instructions are copied now (snapPay): nothing before this step shows where to pay.
      if (n.mode !== "live") return fail("Unknown action.");
      const r = findR(a.requestId); if (!r || r.flow !== "quick" || r.buyerId !== actor) return fail("Invitation not found.");
      if (r.inviteFlow !== true) return fail("There's no invitation to reserve here.");
      const l = listingOf(r); const ev = EV[r.eventId]; const S = (PEOPLE[l.sellerId] || CLASSMATE).first;
      const e = rState(r), b = baseSt(e);
      // 1, 2: the buyer's own invitation, which hasn't ended (its deadline, the cutoff, the event's start, a departure: quickState).
      if (b !== "invited") return fail(["accepted", "paid", "confirmed", "sent", "completed"].includes(b) ? "You've already reserved it."
        : b === "requested" ? `${S} hasn't invited you to pay yet.`
        : b === "expired" ? (r.acceptedAt ? "The reservation has ended." : r.invitedAt ? "This invitation has ended." : "This request has ended.")
        : b === "declined" ? (r.reason === "Another buyer bought it first" || r.reason === "Another buyer reserved it first" ? r.reason + "." : r.reason === "The seller closed this listing" ? "The seller closed this listing." : r.invitedAt ? "The seller withdrew this invitation." : "This request was declined.")
        : b === "cancelled" ? (r.acceptedAt ? "You released this reservation." : r.invitedAt ? "You declined this invitation." : "You withdrew this request.")
        : "This reservation was released.");
      // 3: the listing is open, and not paused or departed.
      const ax = access(ev); if (!ax.ok) return fail(ax.why);
      if (l.withdrawnAt) return fail("The seller closed this listing.");
      if (departed(l)) return fail("That train has already left.");
      if (l.pausedAt) return fail(`${S} has paused this listing, so you can't reserve it right now. Your invitation stays open until ${fmtMs(r.expiresAt)}.`);
      if (tradingPaused(n, actor)) return fail(PAUSED);
      if (tradingPaused(n, l.sellerId)) return fail(SELLER_PAUSED);
      // 4: the buyer is eligible, and has confirmed membership where it's needed (when asking, or now).
      const el = canAcquire(actor, ev, l); if (!el.ok) return fail(el.reason);
      if (el.needsMember && !r.memberConfirmed && !a.member) return fail(`This ticket is for ${memberClubOf(ev, l)} members. Confirm you're a member to continue.`);
      // 5: the quantity is at most what's available now (an invitation never held it).
      const lu = unitOf(ev); const num = listingNumbers(n, l);
      // §9x item 1: a free ticket is reserved without a payment, so for one the words don't say another buyer is paying.
      const gratis = freeDeal(r);
      if (r.qty > num.available) return fail(`${gratis ? "Another buyer has reserved it." : "Another buyer is paying for it right now."} Your invitation stays open until ${fmtMs(r.expiresAt)} in case it comes back.`);
      // 6: the buyer's per-person limit, with what they hold and have reserved.
      if (personLoad(n, actor, ev.id, r.id) + r.qty > personCap(ev)) return fail(`That would take you over ${personCap(ev)} per person for this event, counting ${lu}s you hold or have reserved.`);
      // 7: one unpaid reservation per event at a time.
      if (n.requests.some(o => o.id !== r.id && o.buyerId === actor && o.eventId === ev.id && o.flow === "quick" && baseSt(rState(o)) === "accepted")) return fail("You already have an unpaid reservation for this event. Pay for it or release it first.");
      if (!gratis) { const noPay = snapPay(r, l); if (noPay) return fail(noPay); } // the reservation's payment instructions, as the seller has them now (a free one has none: nothing is paid)
      if (el.needsMember && !r.memberConfirmed) { r.memberConfirmed = true; hist(r, `Buyer confirmed they're a ${memberClubOf(ev, l)} member (not checked by Handoff)`); }
      const now = stamp(); r.status = "accepted"; r.acceptedAt = now; r.holdUntil = holdEnd(ev, now, l, true); r.topUp = el.topUp || 0; delete r.blockedAt;
      if (gratis) {
        // §9x item 1: the agreed total is zero, so payment entry and both payment steps are skipped: reserved, it's at the stage where
        // the seller sends the ticket ("confirmed": nothing lapses on its own from here, as after a confirmed payment), with no
        // paidAt, paymentConfirmedAt or payment details. The buyer may release it until it's sent (cancel); "Received" completes it.
        r.status = "confirmed";
        const how = METHODS[l.method] || null, B = PEOPLE[r.buyerId].first;
        hist(r, "Buyer reserved it, free: nothing to pay");
        note(l.sellerId, `${P.name} reserved ${plural(r.qty, lu)} for ${ev.title}. It's free, so there's nothing to pay. Now ${l.method === "file" ? `send the PDF or QR code to ${B} yourself, then tap “I've sent it”` : how ? how.verb : `send the ${lu} to ${B}, then tap “I've sent it”`}.`, { name: "activity", tab: "todo" });
        return { state: n, toast: `Reserved. It's free, so there's nothing to pay. Next: ${S} ${how ? `will ${how.verb}` : `sends you the ${lu}`}.`, result: { id: r.id } };
      }
      const len = holdLen(r, now);
      hist(r, `Buyer reserved it at ${money(r.price)} each: held ${len} for payment`);
      note(l.sellerId, `${P.name} reserved ${plural(r.qty, lu)} for ${ev.title} at ${money(r.price)} each. They have ${len} to pay you and tap "${PAID}".`, { name: "activity", tab: "todo" });
      return { state: n, toast: `Reserved for ${len}. Pay ${S} ${money(r.price * r.qty)} now, then tap "${PAID}".`, result: { id: r.id } };
    }
    case "reviewProblem": {
      // Simulated Handoff review of a report. Upheld: the person reported gets a strike; RULES.strikesToPause strikes pause their account.
      const isG = a.kind === "goods";
      const x = isG ? n.goodsReqs.find(g => g.id === a.id) : findR(a.id); if (!x || !x.problem || x.problem.resolvedAt) return fail("No open report on this match.");
      const sellerId = isG ? itemOf(n, x).sellerId : listingOf(x).sellerId; const target = x.problem.role === "buyer" ? sellerId : x.buyerId;
      const now = stamp(); x.problem.resolvedAt = now; x.problem.review = a.outcome === "uphold" ? "upheld" : "dismissed";
      if (a.outcome === "uphold") { n.strikes = n.strikes || {}; n.strikes[target] = (n.strikes[target] || 0) + 1; }
      const k = strikesOf(n, target);
      hist(x, a.outcome === "uphold" ? `Handoff review (simulated): report upheld; ${PEOPLE[target].name} now has ${plural(k, "strike")}` : "Handoff review (simulated): report dismissed");
      // The buyer tapped "Paid" but the money never came: an upheld report ends the match, so the seller can sell it again.
      const unpaid = !isG && a.outcome === "uphold" && x.flow === "quick" && x.problem.reason === "The buyer hasn't paid" && baseSt(rState(x)) === "paid";
      if (unpaid) { x.status = "released"; x.reason = "Payment didn't arrive (report upheld)"; hist(x, "Closed: the payment didn't arrive, so the ticket went back to the seller"); }
      [x.buyerId, sellerId].forEach(id => note(id, a.outcome === "uphold" ? `Handoff upheld the report on ${isG ? itemOf(n, x).title : EV[x.eventId].title} (simulated). ${PEOPLE[target].first} has ${plural(k, "strike")}${k >= RULES.strikesToPause ? " and can't trade" : ""}.` : `Handoff reviewed the report on ${isG ? itemOf(n, x).title : EV[x.eventId].title} and dismissed it (simulated).`, isG ? { name: "item", id: x.itemId } : { name: "activity" }));
      return { state: n, toast: a.outcome === "uphold" ? `Review simulated: upheld. ${PEOPLE[target].first} now has ${plural(k, "strike")}${k >= RULES.strikesToPause ? " and can't trade (demo rule)" : ""}.${unpaid ? ` The match is closed. ${backAgain(listingOf(x))}` : ""}` : "Review simulated: dismissed." };
    }    /* ---------- Goods ---------- */
    case "postItem": {
      const d = a.data || {};
      const live = n.mode === "live"; // §9q item 6: a name and a price are enough; the preview's form still asks for every field
      const given = v => v != null && v !== "";
      const title = (d.title || "").trim(); if (!title) return fail("Name the item.");
      // A category or a condition is checked when given, and stored only then: none is ever guessed.
      if (live ? given(d.cat) && !Object.prototype.hasOwnProperty.call(GOODS_CATS, d.cat) : !GOODS_CATS[d.cat]) return fail("Choose a category.");
      if (live ? given(d.cond) && !CONDITIONS.includes(d.cond) : !CONDITIONS.includes(d.cond)) return fail("Choose a condition.");
      const pm = parseMoney(d.price); if (pm.error) return fail("Price: " + pm.error);
      const obo = !!d.obo && pm.value > 0;
      const mo = obo ? checkMinOffer(d.minOffer, pm.value) : { value: null }; if (mo.error) return fail(mo.error);
      const area = (d.area || "").trim(); if (!area && !live) return fail("Add a pickup area, like a neighborhood or building (not an address).");
      // The item's last day. `until` is a pickup-by date its seller chose (the preview: always). Live, without one, the listing expires
      // on the day the seller picked (`expires`) or ITEM_EXPIRY_DAYS on, and the item says it has no pickup-by date (noPickupBy). A
      // pickup-by date is when the listing closes, so an expiry sent with one is not used.
      const byPickup = !live || given(d.until);
      const until = byPickup ? d.until : given(d.expires) ? d.expires : isoDate(CLOCK + ITEM_EXPIRY_DAYS * DAY);
      const dateWord = byPickup ? "a pickup-by date" : "an expiry date";
      if (!until || atMs(until) <= CLOCK) return fail(`Choose ${dateWord} in the future.`);
      if (atMs(until) > atMs(isoDate(CLOCK + ITEM_MAX_DAYS * DAY))) return fail(`Pick ${dateWord} within ${ITEM_MAX_DAYS} days.`); // the whole 60th day counts
      const id = "g" + uid();
      // Optional photos (up to MAX_PHOTOS), already downscaled in the browser: small JPEG/PNG/WebP data URLs only (they live in this browser's storage).
      const photos = Array.isArray(d.photos) ? d.photos : d.photo ? [d.photo] : [];
      if (photos.length > MAX_PHOTOS) return fail(`Add up to ${MAX_PHOTOS} photos.`);
      if (!photos.every(p => typeof p === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(p) && p.length <= 400000)) return fail("A photo couldn't be used. Try a smaller JPEG or PNG.");
      const size = photos.reduce((t, p) => t + p.length, 0);
      if (size > 1200000) return fail("Those photos are too large together. Remove one and try again.");
      // Everything lives in this browser's storage (about 5 MB), so cap all item photos together.
      if (size && n.goods.reduce((t, g) => t + photosOf(g).reduce((u, p) => u + p.length, 0), 0) + size > 3000000) return fail("This browser's demo storage is nearly full of photos. Post without photos, or reset the demo.");
      // Live (§9s item 6): one photo, kept by the server in a table of its own. The item holds only its reference (a.pic: the version and
      // size the server made from the bytes it accepted, never anything the page sent; parseAction drops a `pic` a client sends).
      const pic = live && picOk(a.pic) ? { pic: { v: a.pic.v, w: a.pic.w, h: a.pic.h } } : {};
      const it = { id, sellerId: actor, title: title.slice(0, 80), ...(given(d.cat) ? { cat: d.cat } : {}), ...(given(d.cond) ? { cond: d.cond } : {}), price: pm.value, obo, ...(mo.value ? { minOffer: mo.value } : {}), ...(area ? { area: area.slice(0, 60) } : {}), until, ...(byPickup ? {} : { noPickupBy: true }), note: (d.note || "").slice(0, 280), ...(photos.length ? { photos } : {}), ...pic, createdAt: stamp(), history: [] };
      hist(it, isFreePrice(pm.value) ? "Posted as free" : `Posted at ${money(pm.value)}${obo ? " OBO" : ""}`); n.goods.unshift(it);
      const told = new Set();
      n.interests.forEach(i => { if (isLive(i) && goodsFits(i, it) && !told.has(i.userId)) { told.add(i.userId); note(i.userId, `Possible match for your request "${i.goods.title}": ${P.first} ${sellingWords(it)}.`, { name: "item", id }, { kind: "match.item", ref: i.id }); } });
      return { state: n, toast: `Item posted.${told.size ? ` ${plural(told.size, "classmate")} with a matching request got an in-app alert.` : ""}`, result: { id } };
    }
    case "withdrawItem": { // live (follow-on B2): "Close item", with an optional reason only the seller sees; never a sale
      const live = n.mode === "live";
      const it = n.goods.find(x => x.id === a.id); if (!it || it.sellerId !== actor) return fail("Item not found.");
      if (it.soldAt || it.withdrawnAt) return fail("This item is already closed.");
      if (!closeReasonOk(a.reason)) return fail("Choose Sold elsewhere or No longer selling, or leave the reason out.");
      // Never a shortcut that releases a buyer's hold: the item can be closed once the hold ends, and Pause stops new requests meanwhile.
      const held = reservedFor(n, it);
      if (held) return fail(live ? closeHeldWhy(it, held) : "It's held for someone. Release that hold first.");
      it.withdrawnAt = stamp(); if (live && a.reason) it.closeReason = a.reason;
      hist(it, live ? closedBy(a.reason) : "Withdrawn by seller");
      let declined = 0;
      n.goodsReqs.forEach(g => { if (g.itemId === it.id && !GFINAL.includes(gState(g, it).st)) { declined++; g.status = "declined"; g.reason = "Item withdrawn"; hist(g, "Declined: item withdrawn"); note(g.buyerId, `"${it.title}" was withdrawn by the seller.`, { name: "goods" }); } });
      return { state: n, toast: !live ? "Item withdrawn. Open requests were declined." : `Item closed.${declined ? ` ${declined === 1 ? "The open request was" : `${declined} open requests were`} declined.` : ""}` };
    }
    /* ---------- Live only: a seller edits, pauses or resumes their own item (as for listings, above) ---------- */
    case "editItem": { // the price, offers and description, for requests and offers made from now on
      if (n.mode !== "live") return fail("Unknown action.");
      const it = n.goods.find(x => x.id === a.id); if (!it || it.sellerId !== actor) return fail("Item not found.");
      const shutWhy = itemShut(it, "edited"); if (shutWhy) return fail(shutWhy);
      const t = editTerms(it, "price", "Price", () => null, itemPrice); if (t.error) return fail(t.error);
      // Open requests keep the price they were made at: the price can't drop below one, or to an open offer (answer it first).
      const bad = n.goodsReqs.filter(g => g.itemId === it.id && ["pending", "waiting"].includes(gState(g, it).st) && (g.isOffer ? t.price <= g.price : t.price < g.price))
        .sort((x, y) => y.price - x.price)[0];
      if (bad) return fail(bad.isOffer ? `There's an open offer of ${money(bad.price)} on this item. Keep the price above ${money(bad.price)}, or answer the offer first.`
        : `A classmate asked for this item at ${money(bad.price)}. Keep the price at ${money(bad.price)} or more, or answer their request first.`);
      if (!t.changes.length) return fail("Nothing changed: the item already has that price and description.");
      n.goodsReqs.forEach(g => { if (g.itemId === it.id && g.price == null) g.price = it.price; }); // a request without its own price keeps the old one
      setTerms(it, "price", t); hist(it, `Edited: ${t.changes.join(", ")}`);
      return { state: n, toast: `Item updated.${t.repriced ? " Requests and offers already made keep their prices." : ""}` };
    }
    /* Live (§9s item 6): the seller adds, replaces or removes their item's one photo while it's still open. The bytes travel beside the
       action and live in the server's own table; a.pic is the reference the server made from them (never the page's). A photo set
       without bytes is refused, and so is anyone but the seller. */
    case "setItemPhoto": {
      if (n.mode !== "live") return fail("Unknown action.");
      const it = n.goods.find(x => x.id === a.id); if (!it || it.sellerId !== actor) return fail("Item not found.");
      const shutWhy = itemShut(it, "changed"); if (shutWhy) return fail(shutWhy.replace("so it can't be changed", "so its photo can't be changed"));
      if (!picOk(a.pic)) return fail("Choose a photo first.");
      const had = picOk(it.pic);
      if (had && it.pic.v === a.pic.v) return fail("That's the photo this item already has.");
      it.pic = { v: a.pic.v, w: a.pic.w, h: a.pic.h }; hist(it, had ? "Photo replaced" : "Photo added");
      return { state: n, toast: had ? "Photo replaced." : "Photo added." };
    }
    case "removeItemPhoto": {
      if (n.mode !== "live") return fail("Unknown action.");
      const it = n.goods.find(x => x.id === a.id); if (!it || it.sellerId !== actor) return fail("Item not found.");
      if (!picOk(it.pic)) return fail("This item has no photo.");
      delete it.pic; hist(it, "Photo removed");
      return { state: n, toast: "Photo removed." };
    }
    case "pauseItem": { // nobody can request it, and no request can be accepted, until it's resumed; a hold already agreed goes on
      if (n.mode !== "live") return fail("Unknown action.");
      const it = n.goods.find(x => x.id === a.id); if (!it || it.sellerId !== actor) return fail("Item not found.");
      const shutWhy = itemShut(it, "paused"); if (shutWhy) return fail(shutWhy);
      if (it.pausedAt) return fail("This item is already paused.");
      it.pausedAt = stamp(); hist(it, "Paused: no new requests until it's resumed");
      const open = n.goodsReqs.filter(g => g.itemId === it.id && ["pending", "waiting"].includes(gState(g, it).st));
      open.forEach(g => { const what = g.isOffer ? "offer" : "request"; note(g.buyerId, gState(g, it).st === "waiting"
        ? `${P.first} paused "${it.title}". Your backup ${what} stays in line until they resume it.`
        : `${P.first} paused "${it.title}". Your ${what} stays open, but they can't accept it until they resume it.`, { name: "item", id: it.id }); });
      const pending = open.filter(g => g.status === "pending").length;
      return { state: n, toast: `Item paused. Classmates can't request it until you resume it.${reservedFor(n, it) ? " The current hold continues." : ""}${pending ? ` ${pending === 1 ? "The open request stays" : `The ${pending} open requests stay`} open, but can't be accepted until you resume it.` : ""}` };
    }
    case "resumeItem": { // only while it can still be picked up: never a sold, withdrawn or expired one
      if (n.mode !== "live") return fail("Unknown action.");
      const it = n.goods.find(x => x.id === a.id); if (!it || it.sellerId !== actor) return fail("Item not found.");
      if (it.soldAt || it.withdrawnAt) return fail(itemShut(it, "resumed"));
      if (!it.pausedAt) return fail("This item isn't paused.");
      const shutWhy = itemShut(it, "resumed"); if (shutWhy) return fail(shutWhy);
      const since = it.pausedAt;
      delete it.pausedAt; hist(it, "Resumed: open to requests again");
      const told = new Set();
      n.goodsReqs.forEach(g => { if (g.itemId !== it.id || gState(g, it).st !== "pending") return; told.add(g.buyerId);
        note(g.buyerId, `${P.first} resumed "${it.title}", so they can accept your ${g.isOffer ? "offer" : "request"} again.`, { name: "item", id: it.id }); });
      const held = !!reservedFor(n, it);
      const k = held ? 0 : restoreGoodsBackups(it); // a hold that ended while it was paused: its backups are active again now
      if (!held) { // as for listings: those who started looking while it was paused hear about it, once
        const asked = new Set(n.goodsReqs.filter(g => g.itemId === it.id).map(g => g.buyerId));
        n.interests.forEach(i => { if (!isLive(i) || !goodsFits(i, it) || asked.has(i.userId) || told.has(i.userId) || (i.updatedAt || i.createdAt) < since) return; told.add(i.userId);
          note(i.userId, `Possible match for your request "${i.goods.title}": ${P.first} ${sellingWords(it)}.`, { name: "item", id: it.id }, { kind: "match.item", ref: i.id }); });
      }
      return { state: n, toast: `Item resumed. ${held ? "It's still on hold for a buyer; if that falls through, classmates can request it again." : "Classmates can request it again."}${k ? ` ${plural(k, "backup request")} ${k === 1 ? "is" : "are"} active again for you to accept or decline.` : ""}` };
    }
    case "requestItem": {
      const it = n.goods.find(x => x.id === a.id); if (!it) return fail("Item not found.");
      if (it.sellerId === actor) return fail("You can't request your own item.");
      const ist = itemState(n, it); if (["sold", "withdrawn", "closed"].includes(ist.key)) return fail(`This item is no longer available (${ist.label.toLowerCase()}).`);
      if (itemPaused(it)) return fail("The seller has paused this item, so it can't be requested right now."); // not even as a backup to a hold
      if (n.goodsReqs.some(g => g.itemId === it.id && g.buyerId === actor && !GFINAL.includes(gState(g, it).st))) return fail("You already have an open request on this item.");
      const off = checkOffer(a.offer, it.price, it.obo, it.minOffer); if (off.error) return fail(off.error);
      const id = "gr" + uid(); const backup = ist.key === "reserved"; // reserved for someone else: this one waits as a backup
      const g = { id, itemId: it.id, buyerId: actor, price: off.price, ...(off.isOffer ? { isOffer: true } : {}), msg: (a.msg || "").slice(0, 280), status: backup ? "waiting" : "pending", createdAt: stamp(), consent: a.shareContact ? { buyer: true } : {}, history: [] };
      hist(g, (off.isOffer ? `Offered ${money(off.price)} (asking ${money(it.price)})` : "Requested") + (backup ? "; on hold as a backup (held for another buyer)" : "") + (a.shareContact ? "; buyer agreed to share contact details if accepted" : "")); n.goodsReqs.unshift(g);
      note(it.sellerId, (off.isOffer ? `${P.name} offered ${money(off.price)} for your ${it.title} (you're asking ${money(it.price)}).` : isFreePrice(it.price) ? `${P.name} wants your ${it.title} (free).` : `${P.name} wants your ${it.title} at ${money(it.price)}.`) + (backup ? " It's a backup while the item is held for someone else." : ""), { name: "item", id: it.id }, backup ? null : { kind: "item.requested", ref: id }); // a backup has nothing to answer yet
      return { state: n, toast: (off.isOffer ? `Offer of ${money(off.price)} sent to ${PEOPLE[it.sellerId].first}.` : `Request sent to ${PEOPLE[it.sellerId].first}.`) + (backup ? " It's held for someone else, so yours waits as a backup. If that falls through, it becomes active again for the seller." : " If they accept, it's held for you."), result: { id } };
    }
    case "acceptItemReq": {
      const g = n.goodsReqs.find(x => x.id === a.id); if (!g) return fail("Request not found.");
      const it = itemOf(n, g);
      const simSeller = a.simulate && !PEOPLE[it.sellerId].demo && g.buyerId === actor; // fictional seller: the buyer may simulate their acceptance (labeled)
      if (it.sellerId !== actor && !simSeller) return fail("Only the seller can accept.");
      if (gState(g, it).st !== "pending") return fail("Only a pending request can be accepted.");
      if (it.withdrawnAt || it.soldAt) return fail("This item is closed.");
      if (itemPaused(it)) return fail("You paused this item. Resume it to accept requests."); // the request stays open meanwhile
      if (reservedFor(n, it)) return fail("It's already held for someone else. Release that hold first.");
      g.status = "accepted"; g.acceptedAt = stamp(); g.holdUntil = goodsHoldEnd(it, g.acceptedAt); delete g.pickupAt;
      const fict = id => !PEOPLE[id].demo; // fictional accounts agree to share contact details automatically (labeled)
      g.consent = { seller: !!a.shareContact || fict(it.sellerId), buyer: !!(g.consent && g.consent.buyer) || fict(g.buyerId) }; g.consentAuto = fict(it.sellerId) || fict(g.buyerId);
      if (simSeller) g.acceptSimulated = true;
      hist(g, (simSeller ? `Simulated: ${PEOPLE[it.sellerId].name} (fictional account) accepted. ` : "") + (g.isOffer ? `Offer accepted at ${money(g.price)}: held for this buyer` : "Accepted: held for this buyer"));
      if (a.shareContact) hist(g, "Seller agreed to share contact details");
      [g.buyerId, it.sellerId].filter(fict).forEach(id => hist(g, `Simulated: ${PEOPLE[id].name} (fictional account) agrees to share contact details automatically`));
      if (!simSeller) note(g.buyerId, `${PEOPLE[it.sellerId].first} accepted your ${g.isOffer ? `offer of ${money(g.price)}` : "request"} for ${it.title}. It's held for you: agree a pickup time${it.area ? ` in ${it.area}` : ""} by ${fmtMs(g.holdUntil)}, then confirm pickup in Handoff.`, { name: "item", id: it.id }, { kind: "item.accepted", ref: g.id });
      let held = 0; // the item's other pending requests wait as backups
      n.goodsReqs.forEach(o => { if (o.itemId === it.id && o.id !== g.id && gState(o, it).st === "pending") { held++; o.status = "waiting"; hist(o, "On hold as a backup: held for another buyer"); note(o.buyerId, `${PEOPLE[it.sellerId].first} is holding ${it.title} for another buyer. Your ${o.isOffer ? "offer" : "request"} is on hold as a backup; if that falls through, it becomes active again.`, { name: "item", id: it.id }); } });
      if (simSeller) return { state: n, toast: `Simulated: ${PEOPLE[it.sellerId].first} (fictional account) accepted. Agree a pickup time by ${fmtMs(g.holdUntil)}, or the hold ends.` };
      return { state: n, toast: `Held for ${PEOPLE[g.buyerId].first} ${isFreePrice(g.price) ? "(free)" : `at ${money(g.price)}`}. Agree a pickup time by ${fmtMs(g.holdUntil)}, or the hold ends.${held ? ` ${plural(held, "other request")} ${held === 1 ? "waits" : "wait"} as ${held === 1 ? "a backup" : "backups"}.` : ""}` };
    }
    case "declineItemReq": {
      const g = n.goodsReqs.find(x => x.id === a.id); if (!g) return fail("Request not found.");
      const it = itemOf(n, g); if (it.sellerId !== actor) return fail("Only the seller can decline.");
      if (!["pending", "waiting"].includes(gState(g, it).st)) return fail("Only a pending or backup request can be declined.");
      g.status = "declined"; g.reason = g.isOffer ? "Offer declined by seller" : "Declined by seller"; hist(g, g.reason);
      note(g.buyerId, `Your ${g.isOffer ? "offer" : "request"} for ${it.title} was declined.`, { name: "item", id: it.id });
      return { state: n, toast: g.isOffer ? "Offer declined." : "Request declined." };
    }
    case "releaseItemReq": {
      const g = n.goodsReqs.find(x => x.id === a.id); if (!g) return fail("Request not found.");
      const it = itemOf(n, g); if (it.sellerId !== actor) return fail("Only the seller can release the hold.");
      if (gState(g, it).st !== "accepted") return fail("Only a held item can be released.");
      g.status = "released"; g.reason = "Seller released the hold"; hist(g, g.reason);
      note(g.buyerId, `${PEOPLE[it.sellerId].first} released the hold on ${it.title}.`, { name: "item", id: it.id });
      if (itemPaused(it)) return { state: n, toast: "Hold released. The item stays paused until you resume it." }; // backups wait for resumeItem
      const k = restoreGoodsBackups(it);
      return { state: n, toast: `Hold released. The item is available again.${k ? ` ${plural(k, "backup request")} ${k === 1 ? "is" : "are"} active again for you to accept or decline.` : ""}` };
    }
    case "cancelItemReq": {
      const g = n.goodsReqs.find(x => x.id === a.id); if (!g || g.buyerId !== actor) return fail("Request not found.");
      const it = itemOf(n, g); const st = gState(g, it).st; if (GFINAL.includes(st)) return fail("This request is already closed.");
      g.status = "cancelled"; g.reason = st === "accepted" ? "Cancelled by buyer after it was held" : st === "waiting" ? "Backup withdrawn by buyer" : "Cancelled by buyer"; hist(g, g.reason);
      note(it.sellerId, `${PEOPLE[g.buyerId].name} ${st === "waiting" ? "withdrew their backup" : "cancelled their"} ${g.isOffer ? "offer" : "request"} for ${it.title}.`, { name: "item", id: it.id });
      const paused = itemPaused(it); // while the seller has it paused, backups wait for resumeItem and it isn't available again yet
      if (st === "accepted" && !paused) restoreGoodsBackups(it);
      return { state: n, toast: st === "accepted" && !paused ? "Cancelled. The item is available again." : st === "waiting" ? "Backup withdrawn." : "Cancelled." };
    }
    case "itemPickedUp": {
      // The buyer confirms pickup, which marks the item sold. Fictional buyers can't click, so the seller may simulate it (labeled).
      const g = n.goodsReqs.find(x => x.id === a.id); if (!g) return fail("Request not found.");
      const it = itemOf(n, g);
      const fictionalOk = a.simulate && !PEOPLE[g.buyerId].demo && it.sellerId === actor;
      if (g.buyerId !== actor && !fictionalOk) return fail("Only the buyer can confirm pickup.");
      if (gState(g, it).st !== "accepted") return fail("Pickup can only be confirmed for a held item.");
      g.status = "completed"; g.completedAt = stamp(); if (a.simulate) g.receiptSimulated = true;
      hist(g, a.simulate ? `Simulated: ${PEOPLE[g.buyerId].name} (fictional account) confirmed pickup` : "Buyer confirmed pickup");
      it.soldAt = stamp(); hist(it, isFreePrice(g.price) ? `Given to ${PEOPLE[g.buyerId].name} for free` : `Sold to ${PEOPLE[g.buyerId].name} for ${money(g.price)}${a.simulate ? " (pickup simulated: fictional account)" : ""}`);
      n.goodsReqs.forEach(o => { if (o.itemId === it.id && o.id !== g.id && !GFINAL.includes(gState(o, it).st)) { o.status = "declined"; o.reason = "Sold to another buyer"; hist(o, "Closed: sold to another buyer"); note(o.buyerId, `"${it.title}" was sold to another buyer.`, { name: "goods" }); } });
      n.interests.forEach(i => { if (i.userId === g.buyerId && i.status === "open" && i.goods && goodsFits({ ...i, budget: null }, it)) Object.assign(i, { status: "closed", closedReason: "fulfilled", closedAt: it.soldAt }); });
      note(it.sellerId, a.simulate ? `Simulated: ${PEOPLE[g.buyerId].first} (fictional account) picked up your ${it.title}.` : `${PEOPLE[g.buyerId].first} picked up your ${it.title}.`, { name: "item", id: it.id });
      return { state: n, toast: a.simulate ? `Marked sold (simulated pickup by ${PEOPLE[g.buyerId].first}, a fictional account).` : "Picked up. It's marked sold." };
    }
    case "itemConsent": {
      const g = n.goodsReqs.find(x => x.id === a.id); if (!g) return fail("Request not found.");
      const it = itemOf(n, g); const side = a.side;
      if ((side === "seller" && it.sellerId !== actor) || (side === "buyer" && g.buyerId !== actor)) return fail("You can only share your own contact details.");
      if (!["accepted", "completed"].includes(gState(g, it).st)) return fail("Contact sharing opens after the seller accepts.");
      if (g.consent[side]) return fail("You've already agreed.");
      g.consent[side] = true; hist(g, `${side === "seller" ? "Seller" : "Buyer"} agreed to share contact details`);
      note(side === "seller" ? g.buyerId : it.sellerId, `${P.first} agreed to share contact details for ${it.title}.`, { name: "item", id: it.id });
      return { state: n, toast: "You agreed to share your contact details for this item." };
    }
    case "setPickup": {
      // Either side sets (or changes) the pickup time; the hold then runs to a day after it, never past the item's pickup-by date.
      const g = n.goodsReqs.find(x => x.id === a.id); if (!g) return fail("Request not found.");
      const it = itemOf(n, g); const bySeller = it.sellerId === actor;
      if (!bySeller && g.buyerId !== actor) return fail("Only the buyer or seller can set the pickup time.");
      if (gState(g, it).st !== "accepted") return fail("A pickup time can be set once the seller accepts.");
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a.at || "")) return fail("Choose a pickup date and time.");
      const ms = atMs(a.at);
      if (ms <= CLOCK) return fail("Pick a time in the future.");
      if (ms > atMs(it.until)) return fail(`Pick a time by ${fmtDate(it.until)}, ${itemEndNote(it)}.`);
      g.pickupAt = a.at; g.holdUntil = Math.min(ms + DAY, atMs(it.until));
      hist(g, `Pickup time set by ${bySeller ? "seller" : "buyer"}: ${fmtWhen(a.at)}`);
      note(bySeller ? g.buyerId : it.sellerId, `${P.first} set the pickup time for ${it.title}: ${fmtWhen(a.at)}${it.area ? ` in ${it.area}` : ""}.`, { name: "item", id: it.id });
      return { state: n, toast: `Pickup set for ${fmtWhen(a.at)}. It stays held for ${bySeller ? PEOPLE[g.buyerId].first : "you"} until ${fmtMs(g.holdUntil)}.` };
    }
    case "reportProblem": {
      // A visible "There's a problem" route on a live or finished match. It records the issue and tells the other person;
      // the Handoff review that follows is simulated (reviewProblem), and no money moves.
      const isG = a.kind === "goods";
      const x = isG ? n.goodsReqs.find(g => g.id === a.id) : findR(a.id); if (!x) return fail("Match not found.");
      const it = isG ? itemOf(n, x) : null; const sellerId = isG ? it.sellerId : listingOf(x).sellerId;
      const role = x.buyerId === actor ? "buyer" : sellerId === actor ? "seller" : null; if (!role) return fail("Only the buyer or seller can report a problem.");
      const st = isG ? gState(x, it).st : baseSt(rState(x));
      if (!isG && a.reason === LATE_PAYMENT) {
        // Follow-on B5: a buyer who paid outside Handoff after their reservation ended says so here. It tells the seller, who keeps it
        // on their list until the buyer marks it resolved, and changes nothing else: the reservation stays ended, and a ticket that went
        // back on sale, or to another buyer, stays where it is. Only on a new-flow reservation (one that was reserved), until the event ends.
        if (n.mode !== "live" || role !== "buyer" || x.inviteFlow !== true || typeof x.acceptedAt !== "number" || !["expired", "released", "cancelled"].includes(st)) return fail("Choose what went wrong.");
        if (CLOCK > disputeEnd(EV[x.eventId])) return fail("Reports close when the event ends.");
        if (x.problem && !x.problem.resolvedAt) return fail("A problem is already reported on this match.");
        x.problem = { by: actor, role, reason: LATE_PAYMENT, at: stamp() }; hist(x, `Problem reported by the buyer: ${LATE_PAYMENT}`);
        const ended = st === "expired" && typeof x.holdUntil === "number" ? `, which ended at ${fmtMs(x.holdUntil)}` : " after it ended";
        note(sellerId, `${P.name} says they paid for their reservation for ${EV[x.eventId].title}${ended}. If the money arrived, sort it out with ${P.first} directly: Handoff can't see payments, and nothing was re-reserved.`, { name: "activity", tab: "listings" }, { kind: "payment.late", ref: x.id });
        return { state: n, toast: `Reported. ${PEOPLE[sellerId].first} has been told. Handoff can't see payments, so sort it out with them directly.` };
      }
      if (!["accepted", "paid", "confirmed", "sent", "approval", "registration", "completed"].includes(st)) return fail("You can report a problem once it's reserved or accepted.");
      if (!isG && CLOCK > disputeEnd(EV[x.eventId])) return fail("Reports close when the event ends.");
      if (x.problem && !x.problem.resolvedAt) return fail("A problem is already reported on this match.");
      if (!PROBLEMS[isG ? "goods" : "ticket"][role].includes(a.reason)) return fail("Choose what went wrong.");
      x.problem = { by: actor, role, reason: a.reason, at: stamp() }; hist(x, `Problem reported by the ${role}: ${a.reason}`);
      const other = role === "buyer" ? sellerId : x.buyerId; const title = isG ? it.title : EV[x.eventId].title;
      note(other, `${P.name} reported a problem with ${title}: "${a.reason}". Open the match to see it.`, isG ? { name: "item", id: it.id } : { name: "activity", tab: role === "buyer" ? "listings" : "requests" });
      return { state: n, toast: `Problem reported. ${PEOPLE[other].first} has been told.` };
    }
    case "resolveProblem": {
      const isG = a.kind === "goods";
      const x = isG ? n.goodsReqs.find(g => g.id === a.id) : findR(a.id); if (!x || !x.problem || x.problem.resolvedAt) return fail("No open problem on this match.");
      if (x.problem.by !== actor) return fail("Only the person who reported it can mark it resolved.");
      x.problem.resolvedAt = stamp(); hist(x, "Problem marked resolved");
      const sellerId = isG ? itemOf(n, x).sellerId : listingOf(x).sellerId; const other = x.buyerId === actor ? sellerId : x.buyerId;
      note(other, `${P.name} marked their problem report as resolved.`, isG ? { name: "item", id: x.itemId } : { name: "activity", tab: x.buyerId === actor ? "listings" : "requests" });
      return { state: n, toast: "Marked resolved." };
    }
    case "saveInterest": { // a public request ("Post a request"; ISO, "in search of", in group-chat terms)
      const d = a.data || {};
      // Edit (My activity): updates one of your own open requests in place, keeping its kind (event, unlisted event or item) and its event.
      const editing = d.id ? n.interests.find(i => i.id === d.id) : null;
      if (d.id && (!editing || editing.userId !== actor || editing.kind !== "iso" || editing.status !== "open")) return fail("Request not found.");
      if (editing && ((editing.eventId || null) !== (d.eventId || null) || !!editing.goods !== !!d.goods)) return fail("A request's event or item type can't change. Cancel it and post a new one.");
      const max = d.eventId && EV[d.eventId] ? personCap(EV[d.eventId]) : RULES.maxSpotsPerPerson; // a request can't ask for more than one person may hold
      const iu = unitOf(d.eventId && EV[d.eventId]);
      if (!isInt(d.qty) || d.qty < 1 || d.qty > max) return fail(`Ask for between 1 and ${max} ${max === 1 ? iu : iu + "s"}${d.eventId && EV[d.eventId] && EV[d.eventId].perPerson ? " (the per-person limit for this event)" : ""}.`);
      // Forms round 2 (USER-INSTRUCTIONS §9j), live: a deadline may be left out. An edit then keeps the request's own deadline while it's
      // still ahead; otherwise a request for an event runs until the event's requests stop (requestUntil: its transfer deadline, a train's
      // departure, an event's start, 11:59 PM on a date-only event's day). An item request still names its date. One given is checked as before.
      const kept = n.mode === "live" && !d.expires && editing && editing.expires && atMs(editing.expires) > CLOCK ? editing.expires : null;
      const ev0 = n.mode === "live" && !d.expires && !kept && !d.goods && d.eventId ? EV[d.eventId] || null : null; // its event, when the deadline comes from it
      const expires = kept || (ev0 ? requestUntil(ev0) : d.expires);
      if (!ev0 && (!expires || atMs(expires) <= CLOCK)) return fail("Choose a deadline in the future."); // from the event: its own state is checked below, in its words
      // A budget left blank is no budget (null): never $0, an offer or an agreement to pay. Live, a ticket request may leave it out too.
      let budget = null;
      if (d.budget !== "" && d.budget != null) { const pm = parseMoney(d.budget); if (pm.error) return fail("Budget: " + pm.error); budget = pm.value; }
      if (d.goods) { // a request for an item: a short description and a category, matched against Goods posts
        const title = (d.goods.title || "").trim(); if (!title) return fail("Describe the item you're looking for.");
        if (!GOODS_CATS[d.goods.cat]) return fail("Choose a category.");
        if (atMs(expires) > CLOCK + 60 * DAY) return fail("A request can last at most 60 days.");
        const fields = { goods: { title: title.slice(0, 80), cat: d.goods.cat }, budget, note: (d.note || "").slice(0, 200), expires };
        if (editing) { Object.assign(editing, fields, { updatedAt: stamp() }); return { state: n, toast: "Request updated.", result: { id: editing.id } }; }
        const id = "iso-" + uid(); const iso = { id, userId: actor, eventId: null, kind: "iso", ...fields, qty: 1, status: "open", createdAt: stamp() };
        n.interests.unshift(iso);
        const fits = n.goods.filter(it => itemState(n, it).key === "available" && goodsFits(iso, it)).length;
        return { state: n, toast: `Request posted.${fits ? ` ${plural(fits, "item")} on Goods may already fit.` : " You'll get an alert when a matching item is posted."}`, result: { id } };
      }
      if (d.eventId) {
        const ev = EV[d.eventId]; if (!ev) return fail("Choose an event.");
        const ax = access(ev);
        if (ax.kind === "official") return fail("This event is handled only through the official process, so requests aren't used here.");
        if (ax.kind === "closed") return fail(ax.why);
        const att = honorAttend(actor, ev); if (!att.ok) return fail(att.reason);
        if (atMs(expires) <= CLOCK) return fail("Choose a deadline in the future."); // the event's own date, with under a minute left
        if (atMs(expires) > cutoffMs(ev) + DAY) return fail("A request can't outlast the event's transfer deadline.");
        const cap = demandCap(ev);
        if (budget != null && budget > cap) return fail(ev.premium ? `Sellers can't ask more than they've paid (${money(cap)}).` : n.mode === "live" ? `${FaceName(ev)} is ${money(cap)}, so keep your budget at or below it.` : `The top ticket price is ${money(cap)}. Offers above it aren't allowed.`); // forms round 2: no face value, no cap (Infinity)
        // The preview's held reply starts from the buyer's budget, so it asks for one; live (invite to pay), the seller names the price.
        if (budget == null && isQuick(ev) && n.mode !== "live") return fail(`Add your budget per ${unitOf(ev)}: sellers see it and can hold one for you at that price.`);
        // Live or expired, it's updated, never duplicated. A private alert for the event is separate and stays as it is.
        const existing = n.interests.find(i => i.eventId === ev.id && i.userId === actor && i.kind === "iso" && i.status === "open");
        const data = { kind: "iso", qty: d.qty, budget, note: (d.note || "").slice(0, 200), expires };
        if (existing) { const was = isExpired(existing) ? "renewed" : "updated"; Object.assign(existing, data); existing.updatedAt = stamp(); return { state: n, toast: `Request ${was}. You have one request for this event.`, result: { id: existing.id } }; }
        const id = "iso-" + uid(); n.interests.unshift({ id, userId: actor, eventId: ev.id, status: "open", createdAt: stamp(), ...data });
        // Sellers with a listing for this event hear about it, so they can share it if it fits (demo accounts only have inboxes).
        const pinged = [...new Set(n.listings.filter(l => l.eventId === ev.id && l.sellerId !== actor && !l.withdrawnAt && !l.isoReplyFor && listingNumbers(n, l).available > 0).map(l => l.sellerId))];
        pinged.forEach(sid => note(sid, `${P.name} is looking for ${plural(d.qty, unitOf(ev))} for ${ev.title}${budget != null ? ` at up to ${money(budget)}${ev.premium ? " reimbursement" : ""}` : ""}. If your listing fits, share it with their request ("I have this").`, { name: "iso", id }));
        // §9q item 4 (live): the success message says where a match will show (MATCHES_WHERE); the page adds email only while it's on.
        return { state: n, toast: `Request posted.${pinged.length ? ` ${plural(pinged.length, "seller")} with a listing for this event ${pinged.length === 1 ? "was" : "were"} told.` : ""} ${n.mode === "live" ? MATCHES_WHERE : `You'll get an alert when a matching ${unitOf(ev)} is listed.`}`, result: { id } };
      }
      const m = d.missing || {}; if (!(m.title || "").trim()) return fail("Describe what you're looking for.");
      const link = cleanUrl(m.sourceUrl); if (link.error) return fail("Official link: " + link.error);
      const fields = { missing: { title: m.title.trim().slice(0, 100), club: (m.club || "").trim().slice(0, 80), when: m.flexible ? null : m.when || null, flexible: !!m.flexible || !m.when, details: (m.details || "").trim().slice(0, 280), sourceUrl: link.value }, qty: d.qty, budget, note: (d.note || "").slice(0, 200), expires };
      if (editing) { Object.assign(editing, fields, { updatedAt: stamp() }); return { state: n, toast: "Request updated. Nothing can trade until the event is on Handoff.", result: { id: editing.id } }; } // its review status stays
      const id = "iso-" + uid();
      n.interests.unshift({ id, userId: actor, eventId: null, kind: "iso", ...fields, review: "reviewing", status: "open", createdAt: stamp() });
      return { state: n, toast: "Request posted. It's waiting for review; nothing can trade until the event is added to Handoff.", result: { id } };
    }
    case "suggestEvent": {
      // Fallback when the event isn't on Handoff: a review item only. It never creates an event, listing or request,
      // so offers and ISOs for an event still attach to one shared record once it's added.
      const d = a.data || {};
      const title = (d.title || "").trim(); if (!title) return fail("Name the event.");
      if (!d.flexible && !d.when) return fail("Add the date, or tick 'Not sure of the date'.");
      const link = cleanUrl(d.sourceUrl); if (link.error) return fail("Official link: " + link.error);
      const id = "sug-" + uid();
      n.suggestions.unshift({ id, userId: actor, title: title.slice(0, 100), club: (d.club || "").trim().slice(0, 80), when: d.flexible ? null : d.when, flexible: !!d.flexible, sourceUrl: link.value, side: "offer", review: "reviewing", createdAt: stamp() });
      return { state: n, toast: "Event suggested for review (simulated). If it's added, you can list your ticket then.", result: { id } };
    }
    case "joinAlert": {
      // "Get notified": a private alert with a quantity and an optional max per unit. It holds nothing and posts nothing publicly, sits
      // beside any public request for the event, and saving it again updates it. Not a queue: everyone it matches hears at once.
      const ev = EV[a.eventId]; if (!ev) return fail("Event not found.");
      const ax = access(ev); if (!demandAllowed(ev)) return fail(ax.why);
      const att = honorAttend(actor, ev); if (!att.ok) return fail(att.reason);
      const ex = n.interests.find(i => i.eventId === ev.id && i.userId === actor && i.kind === "alert" && i.status === "open");
      const f = alertFields(ev, a, ex); if (f.error) return fail(f.error);
      const msg = "You'll get an in-app alert when a matching listing appears.";
      if (ex) { Object.assign(ex, f, { updatedAt: stamp() }); return { state: n, toast: ex.paused ? "Alert updated. It's paused, so it won't alert you until you resume it." : `Alert updated. ${msg}`, result: { id: ex.id } }; }
      const id = "iso-" + uid(); // budget stays null: the max is private and never shown as a public budget
      n.interests.unshift({ id, userId: actor, eventId: ev.id, kind: "alert", qty: f.qty, max: f.max, budget: null, note: "", expires: null, status: "open", createdAt: stamp() });
      return { state: n, toast: `Alert on. Only you can see it. ${msg}`, result: { id } };
    }
    case "setAlert": { // edit, pause or resume your own private alert
      const i = n.interests.find(x => x.id === a.id); if (!i || i.userId !== actor || i.kind !== "alert") return fail("Alert not found.");
      if (i.status !== "open") return fail("This alert was removed.");
      const f = alertFields(EV[i.eventId], a, i); if (f.error) return fail(f.error);
      const was = !!i.paused; Object.assign(i, f, a.paused === undefined ? {} : { paused: !!a.paused }, { updatedAt: stamp() });
      return { state: n, toast: i.paused ? (was ? "Alert updated. It's still paused." : "Alert paused. It won't alert you until you resume it.")
        : `${was ? "Alert resumed" : "Alert updated"}. You'll get an in-app alert when a matching listing appears.` };
    }
    case "closeInterest": {
      const i = n.interests.find(x => x.id === a.id); if (!i || i.userId !== actor) return fail("Not found.");
      if (i.status !== "open") return fail("Already closed.");
      if (a.reason != null && !["fulfilled", "cancelled"].includes(a.reason)) return fail("Say whether it was fulfilled or cancelled.");
      // The owner may say why it ended (My activity can show it); either way it leaves Wanted and stops alerting.
      Object.assign(i, { status: "closed", closedAt: stamp() }, a.reason ? { closedReason: a.reason } : {});
      return { state: n, toast: i.kind === "alert" ? "Alert removed. You won't get alerts for it." : a.reason === "fulfilled" ? "Marked fulfilled. It's off Wanted now."
        : a.reason === "cancelled" ? "Request cancelled. It's off Wanted now." : "Removed. You won't get alerts for it." };
    }
    /* "I have this" with a listing that's already up: the requester gets a pointer to it. Nothing is reserved, repriced or created:
       they reserve, offer or request the usual way. Refused unless the listing really fits the request (requestMatch). */
    case "shareListing": {
      const l = n.listings.find(x => x.id === a.listingId); if (!l || l.sellerId !== actor) return fail("Choose one of your listings.");
      if (l.isoReplyFor || l.withdrawnAt) return fail("Only a listing that's open to everyone can be shared.");
      const i = n.interests.find(x => x.id === a.isoId); if (!i || i.kind !== "iso" || !i.eventId) return fail("Request not found.");
      if (i.userId === actor) return fail("That's your own request.");
      if (!liveRequest(n, i)) return fail("This request has expired or closed.");
      const ev = EV[l.eventId]; if (isQuick(ev) && tradingPaused(n, actor)) return fail(PAUSED);
      const m = requestMatch(n, i, l); if (!m.ok) return fail("This listing doesn't fit the request. " + m.reasons.join(" "));
      if (n.responses.some(x => x.isoId === i.id && x.listingId === l.id && x.status === "open")) return fail("You've already shared this listing with this request.");
      // Follow-on B5, once switched on: a live buyer asks to buy (requestToBuy) where they used to reserve or offer.
      const id = "rsp-" + uid(); const avail = listingNumbers(n, l).available; const B = PEOPLE[i.userId]; const how = isQuick(ev) ? (n.mode === "live" && inviteOn ? "ask to buy it" : "reserve it or make an offer") : "send a request";
      n.responses.unshift({ id, isoId: i.id, listingId: l.id, sellerId: actor, createdAt: stamp(), status: "open", partial: m.partial });
      hist(l, `Shared with ${B.name}'s request`);
      dropSameChange(n, i.userId, x => x.name === "event" && x.listing === l.id); // listed for this request in this change: one notification, the share
      note(i.userId, `${P.name} shared a listing for ${ev.title} with your request: ${plural(avail, unitOf(ev))} at ${money(l.ask)}${ev.premium ? " reimbursement" : l.obo ? " or best offer" : ""}${m.partial ? ` (covers ${avail} of the ${i.qty} you asked for)` : ""}. It isn't held for you: ${how} on the event page.${isQuick(ev) && membersOnlyListing(ev, l) ? " Members only: you'll confirm you're a member before reserving." : ""}`, { name: "event", id: ev.id, listing: l.id }, { kind: "share.listing", ref: id });
      return { state: n, toast: `Shared with ${B.first}. Nothing is held: they ${how} like anyone else.`, result: { id } };
    }
    case "shareItem": {
      const it = n.goods.find(x => x.id === a.itemId); if (!it || it.sellerId !== actor) return fail("Choose one of your items.");
      const i = n.interests.find(x => x.id === a.isoId); if (!i || i.kind !== "iso" || !i.goods) return fail("Request not found.");
      if (i.userId === actor) return fail("That's your own request.");
      if (!liveRequest(n, i)) return fail("This request has expired or closed.");
      const m = requestMatchItem(n, i, it); if (!m.ok) return fail("This item doesn't fit the request. " + m.reasons.join(" "));
      if (n.responses.some(x => x.isoId === i.id && x.itemId === it.id && x.status === "open")) return fail("You've already shared this item with this request.");
      const id = "rsp-" + uid(); const B = PEOPLE[i.userId];
      n.responses.unshift({ id, isoId: i.id, itemId: it.id, sellerId: actor, createdAt: stamp(), status: "open", partial: false });
      hist(it, `Shared with ${B.name}'s request`);
      dropSameChange(n, i.userId, x => x.name === "item" && x.id === it.id); // posted for this request in this change: one notification, the share
      note(i.userId, `${P.name} shared "${it.title}" with your request for ${i.goods.title}: ${itemPrice(it.price)}${it.obo ? " OBO" : ""}${it.area ? `, pickup in ${it.area}` : ""}. It isn't held for you: ${isFreePrice(it.price) ? "request it" : "request it or make an offer"} on the item page.`, { name: "item", id: it.id }, { kind: "share.item", ref: id });
      return { state: n, toast: `Shared with ${B.first}. Nothing is held: they request it or make an offer like anyone else.`, result: { id } };
    }
    case "withdrawShare": {
      const x = n.responses.find(r => r.id === a.id); if (!x || x.sellerId !== actor) return fail("Share not found.");
      if (x.status !== "open") return fail("It's already withdrawn.");
      x.status = "withdrawn"; x.withdrawnAt = stamp();
      const what = x.itemId ? n.goods.find(g => g.id === x.itemId) : n.listings.find(l => l.id === x.listingId); const i = n.interests.find(y => y.id === x.isoId);
      if (what && i) hist(what, `Stopped sharing with ${PEOPLE[i.userId].name}'s request`);
      return { state: n, toast: `No longer shared. The ${x.itemId ? "item" : "listing"} itself is unchanged.` };
    }
    case "reviewMissing": {
      // Unlisted-event ISOs and suggested events share one review queue (simulated admin).
      const i = n.interests.find(x => x.id === a.id && isMissingIso(x)); const sg = n.suggestions.find(x => x.id === a.id);
      if (!i && !sg) return fail("Not an unlisted event.");
      if (!["reviewing", "onboarding", "duplicate", "unsupported"].includes(a.outcome)) return fail("Unknown outcome.");
      const msg = { onboarding: "Handoff is adding it (simulated). Nothing can trade until it's on Handoff.", duplicate: "It duplicates an existing post or event.", unsupported: "Handoff can't support it (e.g. not a student event or ticket).", reviewing: "It's back under review." }[a.outcome];
      if (i) { i.review = a.outcome; note(i.userId, `Your request for "${i.missing.title}" was reviewed: ${msg}`, { name: "iso", id: i.id }); }
      else { sg.review = a.outcome; note(sg.userId, `The event you suggested, "${sg.title}", was reviewed: ${msg}`, { name: "list" }); }
      return { state: n, toast: "Review outcome saved (simulated)." };
    }
    case "setPolicy": {
      const ev = EV[a.eventId]; if (!ev || !POLICY[a.policy]) return fail("Unknown policy.");
      const before = ev.policy;
      n.policies = n.policies || {}; if (a.policy === ev.basePolicy) delete n.policies[ev.id]; else n.policies[ev.id] = a.policy;
      applyWorld(n);
      if (before !== a.policy) {
        const blocked = p => p === "official";
        const text = `${ev.title}: the organizer's transfer rule is now "${POLICY[a.policy].label}" (simulated).${blocked(a.policy) ? " Open listings and requests are paused." : blocked(before) ? " Listing and requesting are open again." : ""}${ev.premium && !blocked(a.policy) ? " Trip swaps still go through the trip leads." : ""}`;
        const who = new Set(n.interests.filter(i => i.eventId === ev.id && isLive(i)).map(i => i.userId));
        const sentWho = new Set(); // direct handoffs already sent aren't paused, so these people get told that too
        n.requests.forEach(r => { if (r.eventId === ev.id && !FINAL.includes(r.status)) { who.add(r.buyerId); who.add(listingOf(r).sellerId); if (r.status === "sent") { sentWho.add(r.buyerId); sentWho.add(listingOf(r).sellerId); } } });
        n.listings.forEach(l => { if (l.eventId === ev.id && !l.withdrawnAt) who.add(l.sellerId); });
        const sentExtra = blocked(a.policy) ? " A handoff the seller has already sent isn't affected: the buyer can still confirm it." : "";
        who.forEach(u => note(u, text + (sentWho.has(u) ? sentExtra : ""), { name: "event", id: ev.id }));
      }
      return { state: n, toast: `${ev.title}: ${POLICY[a.policy].label.toLowerCase()} (simulated). Affected students were notified.` };
    }
    case "clock": {
      n.clockOffset = a.reset ? 0 : (n.clockOffset || 0) + a.hours * HOUR; applyWorld(n);
      sweepExpiry(n); // save what expired at the new time right away (and reopen anything whose hold ended)
      return { state: n, toast: `Demo clock: ${fmtMs(CLOCK)}` };
    }
    case "seen": { n.seen = { ...(n.seen || {}), [a.id]: true }; return { state: n }; }
    case "markFeedSeen": { // What's new: only the viewer's seen mark moves. No view sends it since the UI update; kept for saved data and the rule checks.
      if (typeof a.at !== "number" || !isFinite(a.at)) return fail("Nothing to mark as seen.");
      n.feedSeen = { ...(n.feedSeen || {}), [actor]: a.at }; return { state: n };
    }
    case "readNote": { const x = n.notifications.find(y => y.id === a.id); if (x) x.read = true; return { state: n }; }
    case "readAll": { n.notifications.forEach(x => { if (x.userId === actor) x.read = true; }); return { state: n }; }
    case "setAlertPrefs": {
      if (!PEOPLE[actor] || !PEOPLE[actor].demo) return fail("Only the demo accounts get alerts.");
      n.alertPrefs = n.alertPrefs || {}; const cur = n.alertPrefs[actor] || {};
      const next = { email: a.email == null ? !!cur.email : !!a.email, text: a.text == null ? !!cur.text : !!a.text };
      n.alertPrefs[actor] = next;
      const ch = [next.email && `email (${PEOPLE[actor].contact})`, next.text && `text (${PEOPLE[actor].phone})`].filter(Boolean);
      return { state: n, toast: ch.length ? `Alerts: in the app, plus ${ch.join(" and ")}. Simulated: nothing is sent.` : "Alerts: in the app only." };
    }
    case "feedbackGiven": { n.feedbackGiven = true; return { state: n }; }
    default: return fail("Unknown action.");
  }
}
export const catLabel = c => c === "Travel" ? "Trains" : c; // shown to students; "Travel" stays the internal key

/* Transfer rules in one tag a buyer can read at a glance: transferable, organizer approval required, or a restriction.
   How it's passed on, the deadline and sources stay one tap away. Sellers can add either flag to their own listing.
   Trips and operator-run treks always need the organizer, because it holds the traveler list. Trains carry their own tag (ev.tag). */
export function transferTag(ev) {
  const a = access(ev);
  if (a.kind === "closed") return { label: a.short, tone: "bad", icon: "clock", line: a.why };
  if (ev.nonTransferable) return { label: "Not transferable", tone: "bad", icon: "lock", line: `Cancel with ${ev.club} for a refund instead.` };
  if (ev.policy === "official") return { label: "Official process only", tone: "bad", icon: "lock", line: `${ev.club} fills open places itself, so Handoff points you there.` };
  if (ev.premium) return { label: "Organizer approval required", tone: "warn", icon: "shield", line: "The trip leads approve each swap." };
  if (ev.organizerRequired) return { label: "Organizer approval required", tone: "warn", icon: "shield", line: "The trek operator updates the traveler list." };
  if (ev.tag && !ev.policyChanged) return ev.tag;
  if (ev.policy === "approval") return isQuick(ev)
    ? { label: "Club approves name changes", tone: "warn", icon: "shield", line: `After payment, the seller emails ${ev.club} to put it in the buyer's name (Handoff drafts the email).` }
    : { label: "Club asks to approve swaps", tone: "warn", icon: "shield", line: "The organizer approves each swap." };
  if (ev.namesChecked) return { label: "Transferable by name change", tone: "good", icon: "check", line: `Names are checked at entry, so the seller asks ${ev.club} to change the name.` };
  // §9v item 5 (SELL5-M2): an event whose organizer stated no rule (every event a person adds) has no tag: no generic "Rules not
  // confirmed". What a ticket's own restrictions are is said where a buyer acts on it (listingRestrictions). label "" shows nothing.
  if (ev.policy === "unknown") return { label: "", tone: "muted", icon: "", line: "" };
  return { label: "Transferable", tone: "good", icon: "check", line: "" };
}

export const RSTATUS = {
  pending:      { label: "Requested", tone: "accent" },
  accepted:     { label: "Accepted · held for the buyer", tone: "warn" },
  sent:         { label: "Sent · buyer to confirm", tone: "warn" },
  approval:     { label: "Awaiting organizer approval", tone: "warn" },
  registration: { label: "Name change pending", tone: "warn" },
  completed:    { label: "Registration confirmed · simulated", tone: "good" },
  waiting:      { label: "Backup · next in line", tone: "muted" },
  paused:       { label: "Paused · club changed its rules", tone: "warn" },
  declined:     { label: "Declined", tone: "muted" },
  cancelled:    { label: "Cancelled", tone: "muted" },
  released:     { label: "Released by seller", tone: "muted" },
  expired:      { label: "Expired", tone: "muted" },
};
/* A completed direct handoff reads "Handed off"; one that went through the organizer reads "Registration confirmed".
   Train tickets are handed over in person, and a fictional buyer's simulated receipt says so. */
/* Christine's statuses: Offer pending / Countered -> Reserved -> Paid -> Delivered -> Closed (plus Expired, Declined, Disputed). */
export const QSTATUS = {
  pending:   { label: "Offer pending", tone: "accent" },
  countered: { label: "Countered · buyer to answer", tone: "accent" },
  proposed:  { label: "Held reply · buyer to answer", tone: "accent" },
  requested: { label: "Request to buy · seller to answer", tone: "accent" }, // follow-on B5: nothing is held
  invited:   { label: "Invited to pay · not held yet", tone: "accent" },
  accepted:  { label: "Reserved · awaiting payment", tone: "warn" },
  paid:      { label: "Paid · seller to confirm", tone: "warn" },
  confirmed: { label: "Payment received · transfer next", tone: "warn" },
  sent:      { label: "Delivered · buyer to confirm", tone: "warn" },
  completed: { label: "Closed · received", tone: "good" },
};
export const rStatus = (r, e) => {
  if (r.problem && !r.problem.resolvedAt && (isOpenReq(e) || e.st === "completed")) return { label: "Disputed", tone: "bad" }; // e.g. turned away at the door after "Received"
  // §9x item 1: a free ticket's two stages that would otherwise name a payment: its invitation, and its reservation (which skipped the payment steps).
  if (r.flow === "quick" && freeDeal(r) && e.st === "requested") return { label: "Request · seller to answer", tone: "accent" };
  if (r.flow === "quick" && freeDeal(r) && e.st === "invited") return { label: "Invited · not held yet", tone: "accent" };
  if (r.flow === "quick" && freeSkipped(r) && e.st === "confirmed") return { label: "Reserved · transfer next", tone: "warn" };
  if (r.flow === "quick") return e.st === "completed" && r.receiptSimulated ? { label: "Closed · simulated buyer", tone: "good" } : QSTATUS[e.st] || RSTATUS[e.st];
  if (e.st === "completed" && r.flow === "peer") return { label: r.receiptSimulated ? "Handed off · simulated buyer" : "Handed off", tone: "good" };
  if (e.st === "sent" && EV[r.eventId].paperTicket) return { label: "Handed over · buyer to confirm", tone: "warn" };
  return RSTATUS[e.st];
};

/* ============================================================
   EXPLORE
   ============================================================ */
/* Featured: a short, hand-picked list of demo events, shown with Available's Featured toggle. Curation, not a ranking. */
export const FEATURED = ["e_vets", "e_pevc", "e_wine_fg", "e_euro"];
/* By club's clubs: a first, curated list of CampusGroups clubs and organizers, shown by their CampusGroups names, alphabetically.
   `orgs` are the organizer names the club's events carry on Handoff when they differ from that name (the event records keep theirs,
   such as "PE/VC Club"); `short` is a shorter name for tight spots. The club search matches all three. By club filters by organizer,
   so a club's trek shows under All, Treks and that club alike. A club with no events on Handoff yet shows an empty state. */
export const CLUB_MENU = [
  { k: "beer", label: "Beer and Beverage Club" },
  { k: "cocktail", label: "Cocktail Club" },
  { k: "entrepreneurship", label: "Entrepreneurship Club" },
  { k: "follies", label: "Follies", orgs: ["Wharton Follies"] },
  { k: "pevc", label: "Private Equity & Venture Capital Club", short: "PE/VC Club", orgs: ["PE/VC Club"] },
  { k: "ski", label: "Ski & Snowboard Club" },
  { k: "tech", label: "Technology Club" },
  { k: "vets", label: "Veterans Club" },
  { k: "ai", label: "Wharton AI & Analytics Club", short: "AI & Analytics Club" },
  { k: "food", label: "Wharton Food Club", short: "Food Club", orgs: ["Wharton Food Club", "Food Club"] },
  { k: "wga", label: "Wharton Graduate Association (WGA)", short: "WGA", orgs: ["Wharton Graduate Association"] },
  { k: "pub", label: "Wharton MBA PUB", short: "MBA PUB", orgs: ["Wharton MBA PUB", "MBA Pub"] },
  { k: "scotch", label: "Wharton Scotch & Whiskey Club", short: "Scotch & Whiskey Club" },
  { k: "wine", label: "Wharton Wine Club", short: "Wine Club" },
].sort((a, b) => a.label.localeCompare(b.label));
export const CLUB_BY = Object.assign(Object.create(null), Object.fromEntries(CLUB_MENU.map(c => [c.k, c]))); // no prototype, like EV
export const clubOf = k => Object.prototype.hasOwnProperty.call(CLUB_BY, k) ? CLUB_BY[k] : null;
export const clubOrgs = k => { const c = clubOf(k); return c ? c.orgs || [c.label] : null; }; // the organizer names its events carry
export const CLUB_CATS = ["all", "events", "treks"]; // where By club and Featured apply: clubs run events and treks, not trains or goods
/* Each side keeps its own filters and sort: Available's availability, event date and sort; Wanted's "needed by" and sort. The three
   filters are the development preview's: the shared market has the category row and each side's sort, and reads none of avail, when
   and need (availableNow, wantedNow; §9r, §9s item 1). */
export const DISC0 = { cat: "all", q: "", goodsCat: "All", club: null, featured: false, avail: "all", when: "any", need: "any", sortA: "newest", sortW: "newest" };
/* What the shared search looks at, the same on Available and Wanted (and in the rule checks' feedFor): an event's name, club, category
   and venue; an item's name, category, pickup area and note; a request's own text (reqText, with Wanted). */
export const evText = ev => (ev.title + " " + eventClubs(ev).join(" ") + " " + ev.cat + " " + catLabel(ev.cat) + " " + ev.venue).toLowerCase(); // eventClubs (§9x item 5): its club, or the ones named on its listings
export const itemText = it => [it.title, it.cat, it.area, it.note].filter(Boolean).join(" ").toLowerCase(); // only what the item states (§9q item 6)
/* Which events Available considers, and in what order. Closed and official-process events leave the list; searching by name still finds
   them. kind: a discovery category; club: an organizer name, or a club's list of them. avail "available": events with spots others
   listed; "waitlist" (shown as Nothing listed): no stock at all. Each row carries its stock (stockFor). */
export function exploreRows(s, me, { q = "", ids = null, cat = "All", kind = "all", club = "All", when = "any", avail = "all" } = {}) {
  const qq = q.toLowerCase().trim();
  const rank = k => ({ available: 0, mine: 1, wanted: 2, quiet: 3, notonsale: 4, closed: 5, official: 6 })[k];
  return EVENTS.map(ev => ({ ev, sum: eventSummary(s, ev, me), stock: stockFor(s, ev) })).filter(({ ev, sum, stock }) => {
    if (qq && !evText(ev).includes(qq)) return false;
    if (!qq && ["closed", "official"].includes(sum.state.key)) return false;
    if (ids && !ids.includes(ev.id)) return false;
    if (cat !== "All" && ev.cat !== cat) return false;
    if (kind !== "all" && catOf(ev) !== kind) return false; // "goods" matches no event
    if (club !== "All" && !eventClubs(ev).some(c => (Array.isArray(club) ? club : [club]).includes(c))) return false; // §9x item 5: a club-less event counts under the clubs named on its listings
    const days = (atMs(ev.start) - CLOCK) / DAY;
    if (when === "week" && days > 7) return false;
    if (when === "month" && days > 30) return false;
    if (avail === "available" && !(sum.otherSpots > 0)) return false; // still open to take, even if the viewer has a request of their own there
    if (avail === "waitlist" && stock > 0) return false; // nothing anyone could take now: sold out, not on sale yet, or every listing held
    return true;
  }).sort((a, b) => rank(a.sum.state.key) - rank(b.sum.state.key) || (a.ev.openUntil || a.ev.start).localeCompare(b.ev.openUntil || b.ev.start));
}
export const rowsOnExplore = (s, me, o) => exploreRows(s, me, o).map(r => r.ev.id);
/* The club search ignores case, spacing and punctuation, so "pe/vc" finds PE/VC and "scotch and" finds Scotch & Whiskey. */
export const squash = t => t.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
/* Is this organizer (an event's, or one typed on a request for an unlisted event) one of the club's names? */
export const ofClub = (k, org) => !!org && (clubOrgs(k) || []).some(n => squash(n) === squash(org));
/* §9x item 5 (SELL6-N3; live): an event's affiliation, as By club and the search read it. An event that names its club: that club.
   One that names none: the clubs its sellers named on their own listings (§9v item 4: a listing's club, never written to the event),
   from the installed world's listings that are still up (not closed, and not a reply held for one person). LISTING_CLUBS is filled by
   installLive and stays empty in the preview, where a listing names no club. Display and filtering only: an affiliation never
   restricts who can buy (only a listing's own restrictions and a members-only event do). */
const LISTING_CLUBS = Object.create(null); // event id -> the clubs named on its listings, each once
export const eventClubs = ev => !ev ? [] : ev.club ? [ev.club] : LISTING_CLUBS[ev.id] || [];

/* Forms round 2 (USER-INSTRUCTIONS §9j item 2): "Add an event" suggests events already on Handoff as soon as a recognizable name is
   typed, so classmates post to the same event instead of adding it twice. At most `max` (three) upcoming events, ones still open to
   list and request (access), in this order:
   1. the same name, whatever its capitals, spacing or punctuation;
   2. names that hold every word typed;
   3. names that share at least half of the typed words, the most words first (one common word out of several, like "Night" or a
      club's name, isn't enough to be relevant).
   Words are the typed ones of three or more letters or digits, without the little ones (STOPWORDS); the last word typed may be half
   typed ("Spr" finds Spring), an earlier one has to be whole. A name is recognizable once it has three letters or digits. Within each
   group a date, when one is entered (`when`: a date, or a date and time), refines the order: the very start or departure that was
   entered, then that day, then the day before or after; a date that isn't one is ignored. Then what's being added (`kind`: a train
   before an event of the same name on the Train form), then the soonest. Every event is its own suggestion: two seatings or two
   departures of one name are never merged, and each is told apart by its date and time (eventWhen). */
const nameTokens = t => String(t == null ? "" : t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const dayNumber = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY;
const SUGGEST_WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
/* §9s item 4 (`loose`: the search field of Sell a ticket and Request a ticket). The same search, more forgiving about how a name is
   typed, so "night oys" and "oys night" both find Oysters Night:
   - any typed word may be half typed, not only the last, and each typed word takes a different word of the name;
   - the little words and the words under three letters, which the search above ignores, refine the order when they begin another
     word of the name ("night oy"), and are enough on their own when nothing longer was typed ("oy ni");
   - within a group the better match comes first: more of the typed words found, then more of them whole, then more of the little
     ones; then the date entered, then the events `first` picks out (Sell: those the seller holds unlisted tickets for), then the
     soonest.
   Every event is still its own suggestion, and nothing is merged or chosen. Without `loose` the search is exactly as above. */
export function suggestEvents(title, when, { max = 3, kind = null, loose = false, first = null } = {}) {
  const all = nameTokens(title), key = all.join("");
  if (Array.from(key).length < 3) return [];
  const big = x => Array.from(x).length >= 3 && !STOPWORDS.has(x);
  const typed = all.filter(big), last = all[all.length - 1], small = loose ? all.filter(x => !big(x)) : [];
  const w = typeof when === "string" && SUGGEST_WHEN.test(when) && nyIsoDate(Date.UTC(+when.slice(0, 4), +when.slice(5, 7) - 1, +when.slice(8, 10), 12)) === when.slice(0, 10) ? when : null; // a real date, as typed
  const day = w ? w.slice(0, 10) : null, n = w ? dayNumber(day) : 0;
  const near = e => { // 0: that very start or departure; 1: that day (or within its days); 2: a day off; 3: any other day
    if (!w) return 0;
    const first = e.start.slice(0, 10), final = (e.openUntil || e.end || e.start).slice(0, 10);
    if (w.length > 10 && !e.openUntil && !isDateOnly(e.start) && e.start === w) return 0;
    if (day >= first && day <= final) return 1;
    return Math.min(Math.abs(n - dayNumber(first)), Math.abs(n - dayNumber(final))) <= 1 ? 2 : 3;
  };
  const rows = [];
  for (const e of EVENTS) {
    if (e.unsupported || !access(e).ok) continue;
    const words = nameTokens(e.title), exact = words.join("") === key;
    let hits, whole = 0, extra = 0;
    if (!loose) hits = typed.filter(x => words.includes(x) || (x === last && words.some(y => y.startsWith(x)))).length;
    else { // each typed word takes one word of the name: a whole word first, then the start of one
      const left = words.slice(), take = test => { const i = left.findIndex(test); if (i >= 0) left.splice(i, 1); return i >= 0; };
      const rest = typed.filter(x => !take(y => y === x)); whole = typed.length - rest.length;
      hits = whole + rest.filter(x => take(y => y.startsWith(x))).length;
      extra = small.filter(x => take(y => y === x) || take(y => y.startsWith(x))).length;
    }
    const found = typed.length > 0 ? hits > 0 && hits * 2 >= typed.length : small.length > 0 && extra === small.length;
    if (!exact && !found) continue;
    rows.push({ e, group: exact ? 0 : typed.length === 0 || hits === typed.length ? 1 : 2, hits, whole, extra, near: near(e), mine: first && first(e) ? 0 : 1, kind: kind && e.kind !== kind ? 1 : 0, at: atMs(e.start) });
  }
  rows.sort((a, b) => a.group - b.group || b.hits - a.hits || b.whole - a.whole || b.extra - a.extra || a.near - b.near || a.mine - b.mine || a.kind - b.kind || a.at - b.at || a.e.title.localeCompare(b.e.title) || (a.e.id < b.e.id ? -1 : 1));
  return rows.slice(0, Math.max(0, max)).map(r => r.e);
}

/* One-form Sell (USER-INSTRUCTIONS §9l item 2): the open event that a new one would be an exact twin of, or null. A twin is the same
   kind of thing, with the same name (whatever its capitals, spacing or punctuation: suggestEvents' "exact", nothing looser), at the same
   time: an ordinary event on the same day, or at the same start when both give a time (two seatings stored with their times stay
   apart); a train or a trek at the same start date and time. Only events one can still list on count (not removed, over, or past their
   transfer deadline), and never an older train's validity window. Post ticket (postTicket) refuses to add a twin: the seller chooses
   the event that's there, or says what's different in the name. Nothing is ever merged for them, and a name that only resembles
   another is never a twin. The earliest match is returned (then the lowest id), the same on the server and in the browser. */
const sameOccurrence = (kind, a, b) => kind === "event" && (isDateOnly(a) || isDateOnly(b)) ? a.slice(0, 10) === b.slice(0, 10) : a === b;
export function eventTwin(kind, title, start) {
  const key = nameTokens(title).join("");
  if (!key || typeof start !== "string" || start.length < 10) return null;
  let hit = null;
  for (const e of EVENTS) {
    if ((e.kind || "event") !== kind || e.unsupported || e.openUntil || !access(e).ok) continue;
    if (nameTokens(e.title).join("") !== key || !sameOccurrence(kind, e.start, start)) continue;
    if (!hit || e.start < hit.start || (e.start === hit.start && e.id < hit.id)) hit = e;
  }
  return hit;
}
export const TWIN_EVENT = "An event with this name on that date is already on Handoff. Choose it to list your ticket there, or add what's different to the name if yours is a different showing.";
export const TWIN_TRAIN = "A train with this name and departure is already on Handoff. Choose it to list your ticket there.";
export const TWIN_TREK = "A trek with this name and start is already on Handoff. Choose it to list your spot there.";
/* The same refusal from Post request (postRequest; USER-INSTRUCTIONS §9m item 3), in a buyer's words. */
export const TWIN_EVENT_REQUEST = "An event with this name on that date is already on Handoff. Choose it to post your request there, or add what's different to the name if yours is a different showing.";
export const TWIN_TRAIN_REQUEST = "A train with this name and departure is already on Handoff. Choose it to post your request there.";
export const TWIN_TREK_REQUEST = "A trek with this name and start is already on Handoff. Choose it to post your request there.";

/* Available's grid and lookup rows for the shared discovery state. Cards: events with stock (spots anyone could take now) and goods on
   sale, newest or cheapest first. An event with nothing listed is never a card: a search or a club (or the preview's Nothing listed
   filter) lists it below the grid as a lookup row. By club, Featured and the event filters are about events, so goods leave the grid
   while one is on. The shared market calls availableNow (below), which has no availability filter (§9r). */
export function availableFor(s, me, d) {
  const cat = d.cat, q = d.q.trim(), ql = q.toLowerCase(), events = cat !== "goods";
  const clubOn = !!clubOf(d.club) && CLUB_CATS.includes(cat), featOn = d.featured && CLUB_CATS.includes(cat);
  const evFilters = events && (d.avail !== "all" || d.when !== "any");
  const rows = events ? exploreRows(s, me, { q, ids: featOn ? FEATURED : null, kind: cat, club: clubOn ? clubOrgs(d.club) : "All", when: d.when, avail: d.avail }) : [];
  const evCards = rows.filter(r => r.stock > 0).map(({ ev, sum }) => {
    const open = publicListingsFor(s, ev).filter(l => !isAddOn(ev, l) && listingNumbers(s, l).available > 0);
    // newest: its newest open listing; price: the "from" price the card shows (others' cheapest, or the viewer's own)
    return { key: ev.id, ev, sum, at: Math.max(...open.map(l => l.createdAt)), price: sum.best ? sum.best.l.ask : Math.min(...open.map(l => l.ask)) };
  });
  const goodsOn = cat === "goods" || (cat === "all" && !clubOn && !featOn && !evFilters);
  const items = !goodsOn ? [] : s.goods.filter(it => itemState(s, it).key === "available" && (cat !== "goods" || d.goodsCat === "All" || it.cat === d.goodsCat)
    && (!ql || itemText(it).includes(ql))).map(it => ({ key: it.id, it, at: it.createdAt, price: it.price }));
  const by = d.sortA === "price" ? (a, b) => a.price - b.price || b.at - a.at : (a, b) => b.at - a.at;
  const lookup = !events || d.avail === "available" ? [] : rows.filter(r => r.stock === 0 && (d.avail === "waitlist" || !!q || clubOn));
  return { cards: [...evCards, ...items].sort(by), lookup, clubOn, featOn, evFilters };
}
/* §9r (the shared market): Available without the All / Available / Nothing listed selector. The feed is what can be taken now: the
   events with a ticket anyone could take and the goods on sale. A search or a club still finds an event that's on Handoff with nothing
   to take, as a row under the grid with its name, its date and "Request a ticket", but only while requests for it are open
   (demandAllowed): after its cutoff (its day, its departure or its transfer deadline) it isn't in Available at all. Every event is its
   own row, so two seatings of one show or two departures of one train stay apart. d.avail is never read, so a state kept from before
   the selector went (a guest's choices across sign-in) opens the same feed. The preview keeps availableFor and its selector; a
   signed-out visitor's Available follows the same rules on the guest view (the page's _lib/available.js).
   §9s item 1: the "Next 7 days / Next 30 days" event-date control is gone from the shared market too, so d.when is never read either:
   a state kept with it opens the same feed, goods included, and evFilters is always false. An event's own date, its transfer
   deadline and a train's departure still decide what can be taken and requested (stockFor, access, demandAllowed). */
export function availableNow(s, me, d) {
  const a = availableFor(s, me, d.avail === "all" && d.when === "any" ? d : { ...d, avail: "all", when: "any" });
  return { ...a, lookup: a.lookup.filter(r => demandAllowed(r.ev)) };
}
/* Live (§9s item 6): an item's one photo is kept by the server in a table of its own, and the item holds only this reference:
   `pic` = { v: 16 hex characters of the image's SHA-256, w, h: its size in pixels }. picOk tests one; photoRefs lists a document's
   (item id and version), for the store to keep the table in step with the document. */
export const picOk = p => !!p && typeof p === "object" && typeof p.v === "string" && /^[0-9a-f]{16}$/.test(p.v)
  && Number.isInteger(p.w) && p.w >= 1 && p.w <= 4096 && Number.isInteger(p.h) && p.h >= 1 && p.h <= 4096;
export const photoRefs = doc => (doc && Array.isArray(doc.goods) ? doc.goods : []).filter(it => it && typeof it.id === "string" && picOk(it.pic)).map(it => ({ id: it.id, v: it.pic.v }));
/* Seller photos: up to MAX_PHOTOS per item, the first is the cover. Older saves kept a single `photo`. */
export const MAX_PHOTOS = 4;
export const photosOf = it => it.photos && it.photos.length ? it.photos : it.photo ? [it.photo] : [];
/* Wanted's rows: live public requests only (liveRequest: open, unexpired and still actionable), for the shared category, search, club
   and goods category, with Wanted's own "needed by" filter (the request's deadline) and sort. */
export const reqText = i => { const ev = i.eventId ? EV[i.eventId] : null, m = i.missing || {}; return [isoTitle(i), i.note, ev && eventClubs(ev).join(" "), ev && catLabel(ev.cat), i.goods && i.goods.cat, m.club, m.details, (PEOPLE[i.userId] || {}).name].filter(Boolean).join(" ").toLowerCase(); };
export function wantedFor(s, d) {
  const cat = d.cat, ql = d.q.trim().toLowerCase(), clubOn = !!clubOf(d.club) && CLUB_CATS.includes(cat), within = { week: 7, month: 30 }[d.need];
  const rows = s.interests.filter(i => {
    if (!liveRequest(s, i)) return false;
    const ev = i.eventId ? EV[i.eventId] : null;
    if (cat !== "all" && (i.goods ? "goods" : ev ? catOf(ev) : "events") !== cat) return false; // an unlisted event counts as an event
    if (cat === "goods" && d.goodsCat !== "All" && i.goods.cat !== d.goodsCat) return false;
    if (clubOn && !(ev ? eventClubs(ev).some(c => clubOrgs(d.club).includes(c)) : ofClub(d.club, i.missing && i.missing.club))) return false; // §9x item 5: eventClubs, as on Available
    if (within && !(i.expires && atMs(i.expires) - CLOCK <= within * DAY)) return false;
    return !ql || reqText(i).includes(ql);
  });
  const due = i => i.expires ? atMs(i.expires) : Infinity;
  return rows.sort(d.sortW === "deadline" ? (a, b) => due(a) - due(b) || b.createdAt - a.createdAt
    : d.sortW === "budget" ? (a, b) => (b.budget ?? -1) - (a.budget ?? -1) || b.createdAt - a.createdAt
    : (a, b) => b.createdAt - a.createdAt);
}
/* §9s item 1 (the shared market): Wanted without its "Needed by" control. The rows are every live public request for the category,
   search, club and goods category, in Wanted's sort. d.need is never read, so a state kept with it (a guest's choices across sign-in)
   opens the same list. A request's own deadline and its event's cutoff still end it (liveRequest). The preview keeps wantedFor and
   its control; a signed-out visitor's Wanted follows the same rules on the guest view (the page's _lib/wanted.js). */
export const wantedNow = (s, d) => wantedFor(s, d.need === "any" ? d : { ...d, need: "any" });

/* What's new for the shared category, search, club and goods category. `all` is the whole list, for the unread count and Mark seen.
   The search reads each update's own record (its event, item or request) with the same text as Available and Wanted, so one query
   finds the same things in all three. No view shows it since the UI update; it stays for saved data and the rule checks (search parity). */
export function feedFor(s, me, d) {
  const cat = d.cat, ql = d.q.trim().toLowerCase(), clubOn = !!clubOf(d.club) && CLUB_CATS.includes(cat);
  const all = feedItems(s, me);
  const orgOf = x => x.eventId ? EV[x.eventId].club : ((s.interests.find(i => i.id === x.isoId) || {}).missing || {}).club;
  const textOf = x => x.type === "request" ? reqText(s.interests.find(i => i.id === x.isoId)) : x.itemId ? itemText(s.goods.find(g => g.id === x.itemId)) : evText(EV[x.eventId]);
  const items = all.filter(x => (cat === "all" || x.cat === cat) && (cat !== "goods" || d.goodsCat === "All" || x.goodsCat === d.goodsCat)
    && (!clubOn || ofClub(d.club, orgOf(x)))
    && (!ql || textOf(x).includes(ql)));
  return { all, items };
}

/* ============================================================
   SHARE (the development preview only: explicit action; no names or contact details; never auto-posts)
   ============================================================ */
/* Share text, for the preview's own Share sheet. Seeded examples exist in every copy of the demo, so they can be linked directly.
   Anything created in this browser can't be: the message says so and links to the shared event page (or the demo home) instead.
   The shared market has no outward Share (USER-INSTRUCTIONS §9v item 3, SELL5-M1): no Share button and no WhatsApp or copy-link sheet,
   so a live world builds no share message, and asking for one is a mistake that says so. A record's ordinary URL is still its link. */
/* seedIds: the ids of the seeded examples (SEED_IDS in preview.js); a parameter because this module never loads the seed. */
export function shareText(t, s, seedIds) {
  if (installed === "live") throw new Error("Handoff: the shared market has no share messages (§9v item 3).");
  if (t.type === "event" || t.type === "listing") {
    const l = t.type === "listing" ? s.listings.find(x => x.id === t.id) : null;
    const ev = EV[l ? l.eventId : t.id];
    const a = access(ev);
    const local = !!l && !seedIds.has(l.id);
    let status; const u = unitOf(ev);
    const what = l && isAddOn(ev, l) ? `${tierOf(ev, l.tier).label}, not a trek spot` : null; // an add-on says what it is, since the text gets pasted into chats
    if (l) status = (local ? `I've listed ${what ? `an add-on (${what})` : `a ${u}`} in my copy of the Handoff demo (others can't see it): ` : what ? `Add-on for sale (${what}): ` : `${UnitOf(ev)} for sale: `) + (ev.premium ? `${money(l.ask)} reimbursement (total commitment ${money(commitment(ev, l.ask, l.paid))} incl. remaining payments and fees).` : `${money(l.ask)}${l.obo ? " or best offer" : ""} (paid ${money(l.paid)}).`) + (l.departsAt ? ` Train departs ${fmtWhen(l.departsAt)}.` : "");
    // Event shares don't quote availability: what this browser shows may include activity nobody else can see.
    else status = ev.nonTransferable ? `${ev.club} tickets can't be passed on. Cancel with ${ev.club} for a refund instead.`
      : !a.ok ? `${a.short}.${a.kind === "notonsale" ? " Get notified or post a request on Handoff to line up interest." : a.kind === "closed" ? "" : " Follow the organizer's process."}`
      : `See ${u}s for sale for this event, or post a request, on Handoff. Never above what the seller paid.`;
    // Train tickets: the operator's rule travels with the message, since that's where it gets pasted.
    const tt = transferTag(ev); // the event's transfer tag travels with the message (not repeated when the status line already says it)
    const rule = (a.ok || a.kind === "notonsale") && tt.label && tt.tone !== "good" ? `\n${tt.label}.${ev.cat === "Travel" ? ` Handoff isn't affiliated with ${ev.club}.` : ""}` : ""; // an event with no tag (§9v item 5) adds no line
    const flag = l && l.restricted ? "\nSeller flagged a transfer restriction: check the ticket's terms before paying." : "";
    return { text: `${ev.title}${ev.cat === "Travel" ? "" : ` (${ev.club})`}\n${fmtRange(ev)}\n${status}${membersOnlyListing(ev, l) ? (l && isQuick(ev) ? `\nMembers only: non-members can be turned away at the door.` : `\nMembers only.`) : ""}${rule}${flag}\n[Handoff prototype: ${ev.nonTransferable ? "demo page" : "illustrative listing"}]`, hash: ev.id, local };
  }
  if (t.type === "item") {
    const it = s.goods.find(x => x.id === t.id); const local = !seedIds.has(it.id);
    return { text: `${it.title}: ${money(it.price)}${it.obo ? ` or best offer${it.minOffer ? ` (from ${money(it.minOffer)})` : ""}` : ""}\n${it.cond} · pickup in ${it.area} by ${fmtDate(it.until)}${local ? "\nPosted in my copy of the Handoff demo (others can't see it)." : ""}\n[Handoff prototype: illustrative listing]`, hash: local ? "goods" : "item-" + it.id, local };
  }
  const i = s.interests.find(x => x.id === t.id); const ev = i.eventId ? EV[i.eventId] : null;
  const local = !seedIds.has(i.id) || i.updatedAt != null; // an edited seeded post no longer matches everyone else's copy
  if (i.goods) return { text: `Looking for: ${i.goods.title} (${i.goods.cat})${i.budget != null ? `, up to ${money(i.budget)}` : ""}.\nHave one? Share it on Handoff.${i.expires ? ` Needed by ${fmtDate(i.expires)}.` : ""}\n[Handoff prototype: ${local ? "demo post saved only in my browser" : "demo request"}]`, hash: local ? "goods" : i.id, local };
  const when = ev ? fmtRange(ev) : i.missing.flexible || !i.missing.when ? "flexible dates" : fmtDay(i.missing.when);
  return { text: `Looking for: ${plural(i.qty, unitOf(ev))} for ${isoTitle(i)} (${when})${i.budget != null ? `, up to ${money(i.budget)}${ev && ev.premium ? " reimbursement" : ""}` : ""}.\nHave one? Share it on Handoff.${i.expires ? ` Needed by ${fmtDate(i.expires)}.` : ""}\n[Handoff prototype: ${local ? "demo post saved only in my browser" : "demo request"}]`, hash: local ? (ev ? ev.id : null) : i.id, local };
}

/* What's waiting on this person right now, across tickets and goods, buying and selling. */
export function needsAction(s, me) {
  const out = [];
  const problemFor = x => x.problem && !x.problem.resolvedAt && x.problem.by !== me;
  s.requests.forEach(r => {
    const l = s.listings.find(x => x.id === r.listingId); if (!l || (l.sellerId !== me && r.buyerId !== me)) return;
    const st = rState(r).st; const role = l.sellerId === me ? "seller" : "buyer";
    const ev = EV[r.eventId];
    if (r.flow === "quick") {
      // A made-up counterpart never acts on their own, so their step stays here as a demo control.
      const oId = role === "seller" ? r.buyerId : l.sellerId; const o = PEOPLE[oId].first; const fict = !PEOPLE[oId].demo;
      // The seller said a paid reservation's money hasn't arrived (paymentMissing): the buyer can cancel; the seller waits, then may release it.
      const disputed = st === "paid" && !!r.payDisputedAt && !r.paymentConfirmedAt;
      // Live: while the seller has paused the listing, an open offer can only be declined (or wait for the resume), and nobody can
      // accept a counter: the seller's step says so, and the buyer has nothing to do.
      const paused = (st === "pending" || st === "countered") && listingPaused(s, l);
      const why = role === "seller"
        ? { pending: paused ? "resume the listing to accept, or decline" : "accept, counter or decline", requested: listingPaused(s, l) ? "resume the listing to invite them, or decline" : freeDeal(r) ? "invite them, or decline" : "invite them to pay, or decline", paid: disputed ? (CLOCK >= r.releaseAfter ? "release or confirm the payment" : null) : "confirm the payment", confirmed: { app: METHODS.app.verb, name: unitOf(ev) === "spot" ? "email the organizer" : "email the club", inperson: "hand it over" }[l.method] || (l.method ? "transfer it" : `send the ${unitOf(ev)}`), // a trek's organizer may be a travel operator (readiness RB-6); no method recorded (§9m): the neutral words
            accepted: fict ? `simulate ${o} paying (demo)` : null, countered: fict ? `simulate ${o}'s answer (demo)` : null, proposed: fict ? `simulate ${o}'s answer (demo)` : null, sent: fict ? `simulate ${o} confirming (demo)` : null }[st]
        : { accepted: s.mode === "live" ? "pay, then tap “I've sent payment”" : "pay, then tap “Paid”", countered: paused ? null : "answer the counter-offer", proposed: `answer ${o}'s reply`, sent: "confirm you got it",
            invited: listingPaused(s, l) || r.blockedAt ? null : freeDeal(r) ? "reserve it" : "reserve it, then pay", // follow-on B5: nothing to do while the listing is paused or another buyer holds the units; §9x item 1: a free one isn't paid for
            pending: fict ? `simulate ${o}'s answer (demo)` : null, paid: disputed ? "check your payment, or cancel" : fict ? `simulate ${o} confirming payment (demo)` : null, confirmed: fict ? `simulate ${o} transferring (demo)` : null }[st];
      const prob = ["accepted", "paid", "confirmed", "sent", "completed"].includes(st) && problemFor(r) ? "a problem was reported" : null;
      // Follow-on B5: a buyer's late-payment report on an ended reservation stays with the seller until the buyer marks it resolved.
      const late = role === "seller" && r.inviteFlow === true && problemFor(r) && r.problem.reason === LATE_PAYMENT ? "the buyer says they paid after the reservation ended" : null;
      if (why || prob || late) out.push({ kind: "ticket", x: r, role, why: why || prob || late, at: r.createdAt });
      return;
    }
    const peer = (r.flow || flowFor(ev, l, r)) === "peer"; // same wording as the card below it
    const why = role === "seller" && st === "pending" ? "accept or decline" : role === "seller" && st === "accepted" ? (peer ? (ev.paperTicket ? "hand it over" : "send it") : `start ${ev.organizerRequired ? "the operator's" : "the club's"} steps`)
      : role === "buyer" && st === "sent" ? "confirm you got it"
      // a made-up buyer never confirms on their own, so the match stays here with its demo control
      : role === "seller" && st === "sent" && !PEOPLE[r.buyerId].demo ? `simulate ${PEOPLE[r.buyerId].first} confirming (demo)`
      : ["accepted", "sent", "approval", "registration", "completed"].includes(st) && problemFor(r) ? "a problem was reported" : null;
    if (why) out.push({ kind: "ticket", x: r, role, why, at: r.createdAt });
  });
  s.goodsReqs.forEach(g => {
    const it = itemOf(s, g); if (!it || (it.sellerId !== me && g.buyerId !== me)) return;
    const st = gState(g, it).st; const role = it.sellerId === me ? "seller" : "buyer";
    const blocked = st === "pending" && (reservedFor(s, it) || {}).id && reservedFor(s, it).id !== g.id;
    const why = role === "seller" && st === "pending" && !blocked ? (itemPaused(it) ? "resume the item to accept, or decline" : "accept or decline")
      : st === "accepted" && !g.pickupAt ? "agree a pickup time"
      : role === "buyer" && st === "accepted" ? "pick it up and confirm"
      : role === "seller" && st === "accepted" && !PEOPLE[g.buyerId].demo ? `simulate ${PEOPLE[g.buyerId].first}'s pickup (demo)`
      : ["accepted", "completed"].includes(st) && problemFor(g) ? "a problem was reported" : null;
    if (why) out.push({ kind: "goods", x: g, role, why, at: g.createdAt });
  });
  return out.sort((a, b) => b.at - a.at);
}

/* ============================================================
   LIVE WORLD (C-DESIGN.md §2.2): the shared market on the server, and its views in the browser
   A live world is a document with mode "live" (emptyWorld; the store keeps one per world) or a view the server built from
   one. Its events are records people added (createEvent), its people are real accounts and its clock is real time. The
   rules above run on it unchanged, plus the live branches marked in them:
   - On the server everything happens inside withEngine. It installs the document's events, the people and the database's
     time, runs one synchronous function, and clears the shared state when it returns, so no two requests share it.
   - In the browser, setLiveClock gives the clock and applyWorld(view) installs the view's events and people. The browser
     only displays; the server decides.
   Every live person has demo set, which turns off every simulate and made-up-account branch, and an id with no profile
   reads "A classmate". Live ids are 16 hex characters, and stamps follow the real clock. LIVE_TYPES lists the actions a
   live world runs; the reducer refuses every other type there.
   ============================================================ */
let installed = "preview"; // what the shared catalog holds: "preview" (the sample data), "live", or "blank" between withEngine runs
let engineActive = false;  // inside withEngine: the server's run, which never trusts a view's fields or switches to the preview
let liveClock = null;      // the live clock: withEngine's time on the server, setLiveClock's function in the browser
let actionTap = null;      // tests only (setActionTap)
let reduceDepth = 0;       // how deeply reduce is nested (addThen and seq call it again)

/* Follow-on B5 (invite to pay; FOLLOWON-PLAN §2.5, §2.7): the switch, on since B5's page landed (one save, with HANDOFF_PROTOCOL 3).
   In a live world the first stored change stamps doc.inviteSince, take, offer and isoReply are refused, and the seller's payment
   method is collected at the first invitation instead of at posting. The four new actions (requestToBuy, invite, inviteRequester,
   reserve) work in a live world either way, and every record they make carries inviteFlow, so nothing that changes an existing
   record depends on the switch: exchanges made before it keep their terms and complete as they were. While it's off (a test's
   setInviteSwitch(false), for suites about those older records), a live world keeps the earlier flow: take, offer and isoReply
   work, nothing stamps doc.inviteSince, and posting needs a payment method. */
export const INVITE_FLOW_LIVE = true;
let inviteOn = INVITE_FLOW_LIVE;
/** Tests only: turns invite to pay on or off for the engine; null puts back INVITE_FLOW_LIVE. */
export function setInviteSwitch(on) { inviteOn = on == null ? INVITE_FLOW_LIVE : on === true; }
/** Whether invite to pay is the live flow (INVITE_FLOW_LIVE, or a test's setInviteSwitch). */
export const inviteFlowOn = () => inviteOn;

/* The sample catalog, so the preview gets it back after a live world was installed (one browser tab can switch routes). */
const FIXTURES = Object.freeze({ events: Object.freeze(EVENTS.slice()), clubs: Object.freeze(CLUBS.slice()), clubMenu: Object.freeze(CLUB_MENU.slice()),
  featured: Object.freeze(FEATURED.slice()), people: Object.freeze({ ...PEOPLE }) });
/** The preview's sample people, whatever catalog is installed: seed() names them from here, so the sample data is the same
    after a live world was installed, or between withEngine runs (when PEOPLE is empty). */
export const SAMPLE_PEOPLE = FIXTURES.people;
/* Anyone a live world refers to who has no profile (someone who deleted their Handoff data: a profile is saved by an account's first change). demo: no simulate branches. */
const CLASSMATE = Object.freeze({ name: "A classmate", first: "A classmate", color: "#64748B", demo: true, pay: "", payMethods: Object.freeze([]), memberships: Object.freeze([]) });
const LIVE_PEOPLE_FALLBACK = new Proxy(Object.create(null), { get: (target, key) => typeof key === "string" ? CLASSMATE : undefined });
const PALETTE = ["#2563A8", "#0E7C66", "#7C4DBA", "#B4532A", "#A23B63", "#3E6B2F", "#1F6FB2", "#8A6A10", "#0E7C86"]; // the sample people's avatar colors
const NOT_AVAILABLE = "That isn't available in Handoff.";
const BUYER_LIMITS_MSG = "This offer can't be accepted right now because of the buyer's limits for this event. You can decline it or let it expire.";
/* Follow-on B1: a seller with no saved payment method (and no handle typed with the listing) can't list, reply or accept. The page asks
   in the same words when a form needs a method and none is entered (_components/payments.jsx). */
export const NO_PAY_METHODS = "Add how buyers can pay you: Venmo or Zelle."; // §9q item 5: the two kinds offered as new (PAY_NEW_KINDS)
/* §9q item 4 (live): where a buyer hears about a match for their request, said once it's posted: a notification at the bell, and the
   request's own card in My activity. Email is added by the page, only while the buyer has it on and it's available (requestPostedWords). */
export const MATCHES_WHERE = "Matches show at the bell and in My activity.";

const fnv1a = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const clearKeys = o => { for (const k of Object.keys(o)) delete o[k]; };
const define = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); // never the __proto__ setter
const firstName = full => String(full == null ? "" : full).trim().split(/\s+/)[0] || "Classmate";
const demoRuleNote = () => installed === "live" ? "" : " (demo rule)";

/** The name public surfaces show (C-DESIGN §3.6): "Langston Chen" is "Langston C."; a one-word name stays as it is. */
export function publicName(fullName) {
  const parts = String(fullName == null ? "" : fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Classmate";
  if (parts.length === 1) return parts[0];
  const initial = Array.from(parts[parts.length - 1]).find(ch => /[\p{L}\p{N}]/u.test(ch));
  return initial ? `${parts[0]} ${initial.toUpperCase()}.` : parts[0];
}
/** A stable avatar color for a user id. */
export function colorFor(userId) { return PALETTE[fnv1a(String(userId)) % PALETTE.length]; }

/** The live clock in the browser: a function giving the time in ms (Date.now() plus the server's skew), or null to clear it. */
export function setLiveClock(fn) {
  if (fn !== null && typeof fn !== "function") throw new TypeError("Handoff: setLiveClock takes a function or null.");
  if (engineActive) throw new Error("Handoff: the live clock can't change inside withEngine.");
  liveClock = fn;
}

/** A new live world, as a world's document starts at version 0 (C-DESIGN §2.6). notifications is empty at rest. */
export function emptyWorld() {
  return { v: 11, mode: "live", format: 1, lastStamp: 0, inviteSince: 0,
    events: [], holdings: [], listings: [], requests: [], interests: [], responses: [], goods: [], goodsReqs: [],
    notifications: [],
    strikes: {}, policies: {}, alertPrefs: {}, seen: {}, feedSeen: {}, suggestions: [], feedbackGiven: false,
    clockOffset: 0, tick: 0 };
}

/**
 * Runs fn with the engine set up for one live world, on the server (C-DESIGN §2.2, §4.1): the document's events, the people
 * (profile rows: names become public names and payment handles stay; emails are never read) and the time in ms. fn must be
 * synchronous: whatever it does, the shared state is cleared when withEngine returns (EVENTS, EV, PEOPLE, CLUBS, CLUB_MENU,
 * CLUB_BY and FEATURED empty, CLOCK NaN, no live clock). A Promise from fn throws. withEngine can't be nested.
 */
export function withEngine(ctx, fn) {
  if (engineActive) throw new Error("Handoff: withEngine is already running, and it can't be nested.");
  if (!ctx || !ctx.doc || ctx.doc.mode !== "live") throw new Error("Handoff: withEngine runs live worlds only (doc.mode \"live\").");
  if (typeof ctx.now !== "number" || !Number.isFinite(ctx.now)) throw new Error("Handoff: withEngine needs the time (ctx.now, in ms).");
  if (typeof fn !== "function") throw new TypeError("Handoff: withEngine needs a function to run.");
  const now = ctx.now;
  engineActive = true;
  try {
    liveClock = () => now;
    enterLive();
    installPeople(enginePeople(ctx.people));
    applyWorld(ctx.doc);
    const out = fn();
    if (out !== null && (typeof out === "object" || typeof out === "function") && typeof out.then === "function") {
      Promise.resolve(out).catch(() => {}); // the caller gets the error below; a later rejection mustn't go unhandled
      throw new Error("Handoff: withEngine's function returned a Promise. Engine work must be synchronous: the shared state is cleared when withEngine returns.");
    }
    return out;
  } finally {
    blankCatalog(); Object.setPrototypeOf(PEOPLE, null); installed = "blank";
    CLOCK = NaN; liveClock = null; engineActive = false;
  }
}

/* Profile rows as the engine's people: public names in everything it writes (§3.6), the payment handle, and the payment methods
   (follow-on B1) that listings use and each reservation copies (snapPay): the row's payMethods as the store read them (readPeople:
   saved ones, or a legacy handle as one "other"), or for a row without them, as tests build, its handle read the same way. */
function enginePeople(rows) {
  const out = [];
  for (const row of rows || []) {
    if (!row || typeof row.userId !== "string" || !row.userId) continue;
    const full = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Classmate";
    const given = Array.isArray(row.payMethods) ? row.payMethods.filter(m => !!m && (PAY_KINDS.includes(m.kind) || m.kind === "other") && typeof m.value === "string" && !!m.value.trim()).slice(0, 2) : null;
    const payMethods = Object.freeze((given || readPayMethods(null, row.payHandle)).map(m => Object.freeze({ kind: m.kind, value: m.value })));
    out.push([row.userId, Object.freeze({ name: publicName(full), first: firstName(full), color: colorFor(row.userId), demo: true, pay: typeof row.payHandle === "string" ? row.payHandle : "", payMethods })]);
  }
  return out;
}
/* A view's person, as the browser installs it: whatever the server allowed this viewer to see, always with demo set. */
function viewPerson(id, p) {
  const o = p && typeof p === "object" ? p : {};
  const name = typeof o.name === "string" && o.name ? o.name : CLASSMATE.name;
  return Object.freeze({ name, first: typeof o.first === "string" && o.first ? o.first : firstName(name), color: typeof o.color === "string" && o.color ? o.color : colorFor(id), demo: true,
    ...(typeof o.contact === "string" ? { contact: o.contact } : {}), ...(typeof o.pay === "string" ? { pay: o.pay } : {}) });
}
function installPeople(entries) { clearKeys(PEOPLE); for (const [id, p] of entries) define(PEOPLE, id, p); }
function blankCatalog() {
  EVENTS.length = 0; CLUBS.length = 0; CLUB_MENU.length = 0; FEATURED.length = 0;
  clearKeys(EV); clearKeys(CLUB_BY); clearKeys(PEOPLE); clearKeys(LISTING_CLUBS);
}
/* The live catalog starts empty, and unknown people read "A classmate". */
function enterLive() {
  if (installed === "live") return;
  blankCatalog(); Object.setPrototypeOf(PEOPLE, LIVE_PEOPLE_FALLBACK); installed = "live";
}
function restoreFixtures() {
  blankCatalog();
  EVENTS.push(...FIXTURES.events); for (const e of FIXTURES.events) EV[e.id] = e;
  CLUBS.push(...FIXTURES.clubs); FEATURED.push(...FIXTURES.featured);
  for (const c of FIXTURES.clubMenu) { CLUB_MENU.push(c); CLUB_BY[c.k] = c; }
  Object.setPrototypeOf(PEOPLE, Object.prototype); Object.assign(PEOPLE, FIXTURES.people);
  installed = "preview";
}
/* applyWorld for a live world. EV holds every stored event, so no record's lookup can fail; EVENTS (and the club lists derived
   from it) leaves out removed ones. */
function installLive(st) {
  if (!liveClock) throw new Error("Handoff: a live world needs the live clock: setLiveClock in the browser, withEngine on the server.");
  const now = liveClock();
  if (typeof now !== "number" || !Number.isFinite(now)) throw new Error("Handoff: the live clock gave no time.");
  enterLive();
  if (st.people && typeof st.people === "object") installPeople(Object.keys(st.people).map(id => [id, viewPerson(id, st.people[id])]));
  EVENTS.length = 0; clearKeys(EV);
  for (const stored of Array.isArray(st.events) ? st.events : []) {
    if (!stored || typeof stored.id !== "string") continue;
    const ev = normalizeEvent(stored); define(EV, ev.id, ev);
    if (!ev.removedAt) EVENTS.push(ev);
  }
  CLUBS.length = 0; CLUBS.push(...[...new Set(EVENTS.filter(e => e.cat !== "Travel" && e.club).map(e => e.club))].sort()); // an event may name no organizer
  // §9x item 5: the clubs named on the listings of an event that names none (eventClubs), before the menu that reads them.
  clearKeys(LISTING_CLUBS);
  for (const l of Array.isArray(st.listings) ? st.listings : []) {
    const ev = l && typeof l.eventId === "string" ? EV[l.eventId] : null, c = l && typeof l.club === "string" ? l.club.replace(/\s+/g, " ").trim() : "";
    if (!ev || ev.removedAt || ev.club || ev.cat === "Travel" || !c || l.withdrawnAt || l.isoReplyFor) continue;
    const named = LISTING_CLUBS[ev.id] || []; if (!named.includes(c)) named.push(c); define(LISTING_CLUBS, ev.id, named);
  }
  CLUB_MENU.length = 0; clearKeys(CLUB_BY); for (const c of liveClubMenu(EVENTS)) { CLUB_MENU.push(c); define(CLUB_BY, c.k, c); }
  FEATURED.length = 0; // no curated picks in the shared market
  CLOCK = now;
}
/* By club's menu from the clubs of live events (trains' carriers aren't clubs). Names that differ only in case, spacing or
   punctuation are one club; it shows its most used spelling. Keys are safe in element ids and CSS selectors. */
function liveClubMenu(events) {
  const groups = new Map();
  for (const e of events) {
    if (e.cat === "Travel") continue;
    for (const name of eventClubs(e)) { // its own club, or (§9x item 5) the ones named on its listings when it names none
      const g = squash(name) || name.toLowerCase();
      const names = groups.get(g) || new Map(); names.set(name, (names.get(name) || 0) + 1); groups.set(g, names);
    }
  }
  const used = new Set(); const out = [];
  for (const g of [...groups.keys()].sort()) {
    const names = groups.get(g);
    const label = [...names].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))[0][0];
    let k = "c" + fnv1a(g).toString(36); while (used.has(k)) k += "x"; used.add(k);
    out.push({ k, label, orgs: [...names.keys()].sort() });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label, "en"));
}

/* ---------- Events people add (C-DESIGN §7.3) ---------- */
const TRAIN_TAG = Object.freeze({ label: "Check the carrier's rules · buyer's risk", tone: "warn", icon: "alert", line: "Carriers' rules on passing tickets on vary, and some don't allow it. Check before you buy.", restricted: true });
/* Fields only the preview's curated trips, treks and catalog use. createEvent never writes them, so a stored event with any of
   them didn't come from it: it's marked unsupported and the reducer refuses actions on it. */
const NOT_LIVE_FIELDS = ["premium", "price", "organizerRequired", "tierRule", "notOnSale", "nonTransferable", "eligibility", "noShowRule"];
const PER_PERSON_DEFAULT = { event: 4, train: 2, trek: 2 };
const text = v => typeof v === "string" ? v : "";

/**
 * A stored live event as every page reads it: the curated fields the preview's catalog has, filled for an event a person
 * added ("Added by <First L.> · details not checked by Handoff", tiers "entered by <first>", no stated transfer rule). Builds a
 * new object and never changes stored. Normalizing a normalized event gives the same event (the browser re-applies views).
 */
export function normalizeEvent(stored) {
  const e = stored && typeof stored === "object" ? stored : {};
  const kind = e.kind === "train" || e.kind === "trek" ? e.kind : "event";
  const train = kind === "train";
  const by = typeof e.createdBy === "string" ? e.createdBy : text(e.addedBy);
  const who = (by && PEOPLE[by]) || CLASSMATE;
  const shown = who === CLASSMATE ? CLASSMATE.name : publicName(who.name);
  const club = text(e.club), notes = text(e.notes);
  return {
    id: String(e.id), kind, title: text(e.title), club, cat: text(e.cat), start: text(e.start),
    ...(train ? (e.openUntil ? { end: text(e.openUntil), openUntil: text(e.openUntil), rangePrefix: "Valid " } : {}) : e.end ? { end: text(e.end) } : {}),
    venue: text(e.venue), attend: e.attend === "members" ? "members" : "all",
    tiers: (Array.isArray(e.tiers) ? e.tiers : []).map(t => ({ id: text(t && t.id), label: text(t && t.label), price: t && typeof t.price === "number" ? t.price : t && t.price === null ? null : NaN, src: `entered by ${who.first}` })), // forms round 2: null is no face value given
    perPerson: Number.isInteger(e.perPerson) && e.perPerson >= 1 && e.perPerson <= 4 ? e.perPerson : PER_PERSON_DEFAULT[kind],
    deadline: typeof e.deadline === "string" && e.deadline ? e.deadline : null,
    ...(e.namesChecked || kind === "trek" ? { namesChecked: true } : {}),
    ...(Array.isArray(e.methods) ? { methods: e.methods.slice() } : {}),
    ...(train ? { noOrganizer: true, tag: { ...TRAIN_TAG } } : {}),
    ...(train && e.paperTicket ? { paperTicket: true } : {}),
    ...(e.officialUrl ? { officialUrl: text(e.officialUrl) } : {}),
    ...(notes ? { notes } : {}),
    policy: "unknown", basePolicy: "unknown", policyChanged: false, soldOut: false,
    policyNote: "", // §9v item 5 (SELL5-M2): no generic "Transfer rules not confirmed" note; it read that for every event a person added
    blurb: notes ? `From ${shown}: ${notes}` : text(e.blurb), // a view may carry the blurb without the notes
    path: train ? "Arrange the handover with the seller and check the carrier's rules." : "Arrange the transfer with the seller and check the organizer's rules.",
    payment: PAY_DEFAULT, sources: [], statusNote: "",
    sourcesNote: `Added by ${shown} · details not checked by Handoff`,
    interestSeed: 0, cap: null, userAdded: true, addedBy: by,
    ...(typeof e.createdAt === "number" ? { createdAt: e.createdAt } : {}),
    ...(typeof e.removedAt === "number" ? { removedAt: e.removedAt } : {}),
    ...(e.unsupported === true || NOT_LIVE_FIELDS.some(k => e[k] != null && e[k] !== false) ? { unsupported: true } : {}),
  };
}

/**
 * True while a listing (in any state, held replies included), a ticket request or a public request (open or closed) refers to
 * the event: records that were public when they were made (a request always sits on a listing). removeEvent's rule, and a
 * view's canRemove. Private alerts and holdings never count, so neither tells the event's creator that one exists
 * (C-CONTRACT §2; review P2): removeEvent turns the alerts off and leaves the holdings, which can't be acted on after it.
 */
export function eventInPublicUse(s, eventId) {
  const refers = xs => (xs || []).some(x => x.eventId === eventId);
  return refers(s.listings) || refers(s.requests) || (s.interests || []).some(i => i.kind === "iso" && i.eventId === eventId);
}

const LIVE_EVENT_CAP = 5; // events one person may add in any 24 hours
const WALL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HAS_WORD = /[\p{L}\p{N}]/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/; // control characters other than tabs and line breaks
/* One line a person typed, whitespace collapsed; null when it's the wrong length or has control characters. */
function oneLine(v, min, max) {
  if (v == null) v = "";
  if (typeof v !== "string" || CONTROL.test(v)) return null;
  const t = v.replace(/\s+/g, " ").trim(); const len = Array.from(t).length;
  return len >= min && len <= max ? t : null;
}
/* Text that may run over several lines; null when it's too long or has control characters. */
function freeText(v, max) {
  if (v == null) v = "";
  if (typeof v !== "string" || CONTROL.test(v)) return null;
  const t = v.replace(/\r\n?/g, "\n").trim();
  return Array.from(t).length <= max ? t : null;
}
/* An optional "YYYY-MM-DDTHH:MM": undefined when blank, null when it isn't one, else the string and its instant. */
function wallField(v) {
  if (v == null || v === "") return undefined;
  if (typeof v !== "string" || !WALL_TIME.test(v)) return null;
  const ms = atMs(v); return Number.isFinite(ms) ? { value: v, ms } : null;
}
/* Forms round 2: an ordinary event's date alone, "YYYY-MM-DD": the string and its instant (11:59 PM that day, New York), or null. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function dateField(v) {
  if (typeof v !== "string" || !DATE_ONLY.test(v)) return null;
  const ms = atMs(v); return Number.isFinite(ms) ? { value: v, ms } : null;
}

/* createEvent's checks and record (C-DESIGN §7.3). Quick events only: nothing here can make a trip or an organizer-run trek.
   Forms round 2 (§9i): the page sends an ordinary event by its date alone, with no ticket types and an optional face value (`face`): it
   gets one implicit ticket type ("Ticket"), priced at the face value, or null without one (no price cap). A train is one departure: its
   name (operator and route in one) and when it leaves, always an eTicket, no operator, validity window or ticket type. A trek keeps its
   named ticket types with their face values. The older shapes (an ordinary event with a time, named ticket types, a train with a validity
   window) are still accepted, so stored events and older callers stay valid; the page no longer sends them. */
function addLiveEvent(n, actor, a, stamp) {
  const kind = a.kind;
  if (kind !== "event" && kind !== "train" && kind !== "trek") return { error: "Choose what you're adding: an event, a train or a trek." };
  const train = kind === "train", trek = kind === "trek";
  const oneTrain = train && (a.openUntil == null || a.openUntil === ""); // forms round 2: one departure, not a validity window
  if (!Array.isArray(n.events)) n.events = [];
  const mine = n.events.filter(e => e.createdBy === actor && e.createdAt > CLOCK - DAY).length; // removed ones count too
  if (mine >= LIVE_EVENT_CAP) return { error: `You've added ${LIVE_EVENT_CAP} events in the last 24 hours, the most Handoff allows. Try again later.` };
  const title = oneLine(a.title, 3, 120);
  if (!title || !HAS_WORD.test(title)) return { error: oneTrain ? "Name the train, like “Amtrak Northeast Regional: Philadelphia → New York” (3 to 120 characters)." : train ? "Name the operator and route, like “Amtrak: Philadelphia → New York” (3 to 120 characters)." : `Give the ${kind} a name (3 to 120 characters).` };
  // Simplification batch: an ordinary event may leave out its organizer (checked below against what needs one) and its category, which
  // is then stored as not given (no key), never guessed. Treks keep both; a train keeps its own category. Forms round 2: a train's name
  // says its operator, so none is asked; one that's given is checked and kept (a train with a validity window still needs it).
  const club = oneLine(a.club, 0, 80);
  if (club === null || (((train && !oneTrain) || trek || club) && (Array.from(club).length < 2 || !HAS_WORD.test(club)))) return { error: train ? "Add the operator, like “Amtrak” (2 to 80 characters)." : trek ? "Add who runs the trek: the organizer or travel operator (2 to 80 characters)." : "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank." };
  const cat = train ? "Travel" : trek ? "Treks & trips" : a.cat == null || a.cat === "" ? null : a.cat;
  if (cat !== null && !train && !trek && !(typeof cat === "string" && Object.prototype.hasOwnProperty.call(CATS, cat) && cat !== "Travel" && cat !== "Treks & trips")) return { error: "Choose a category from the list, or leave it blank." };
  const venue = oneLine(a.venue, 0, 120); if (venue === null) return { error: train ? "Keep the stations to 120 characters." : "Keep the venue to 120 characters." };
  const notes = freeText(a.notes, 600); if (notes === null) return { error: "Keep the notes to 600 characters, without special characters." };
  const link = cleanUrl(a.officialUrl); if (link.error) return { error: "Official link: " + link.error };
  // Forms round 2: an ordinary event by its date alone ends at 11:59 PM that day; one with a time (older) starts then.
  const dateOnly = kind === "event" && typeof a.start === "string" && DATE_ONLY.test(a.start);
  const start = dateOnly ? dateField(a.start) : wallField(a.start);
  if (!start) return { error: oneTrain ? "Enter the departure date and time." : train ? "Enter when the tickets start being valid (date and time)." : kind === "event" ? "Enter the date." : "Enter the start date and time." };
  if (start.ms > CLOCK + 548 * DAY) return { error: dateOnly ? "The date has to be within the next 18 months." : oneTrain ? "The departure has to be within the next 18 months." : "The start has to be within the next 18 months." };
  let end, openUntil, deadline;
  if (train && !oneTrain) { // a validity window: open to listings until it ends, however long ago it started
    openUntil = wallField(a.openUntil);
    if (!openUntil) return { error: "Enter when the tickets stop being valid (date and time)." };
    if (openUntil.ms <= start.ms) return { error: "The tickets have to stop being valid after they start." };
    if (openUntil.ms - start.ms > 60 * DAY) return { error: "Keep the validity window to 60 days." };
    if (openUntil.ms < CLOCK + 30 * 60e3) return { error: "The tickets have to stay valid for at least 30 more minutes." };
  } else if (oneTrain) { // one departure: open to listings until it leaves
    if (start.ms < CLOCK + 30 * 60e3) return { error: "The departure has to be at least 30 minutes from now." };
  } else {
    if (dateOnly) { if (start.ms <= CLOCK) return { error: "Choose today or a later date." }; }
    else if (start.ms < CLOCK + 30 * 60e3) return { error: "The start has to be at least 30 minutes from now." };
    if (dateOnly && a.end != null && a.end !== "") return { error: "Leave the end out: an event added by its date ends at 11:59 PM that day." };
    end = wallField(a.end);
    if (end === null) return { error: "Enter the end date and time, or leave it blank." };
    if (end && end.ms < start.ms) return { error: "The end can't be before the start." };
    if (end && end.ms - start.ms > 14 * DAY) return { error: "The end has to be within 14 days of the start." };
    deadline = wallField(a.deadline);
    if (deadline === null) return { error: "Enter the transfer deadline's date and time, or leave it blank." };
    if (deadline && deadline.ms <= CLOCK) return { error: "The transfer deadline has to be in the future." };
    if (deadline && deadline.ms > start.ms) return { error: dateOnly ? "The transfer deadline can't be after the event's date." : "The transfer deadline can't be after the start." };
  }
  const attend = train || a.attend == null || a.attend === "all" ? "all" : a.attend === "members" ? "members" : null;
  if (!attend) return { error: "Choose who can attend: anyone, or members only." };
  // What needs the organizer (simplification batch): a members-only event is for their members; names checked at the door means a
  // ticket moves by a name change with them.
  if (!club && attend === "members") return { error: "Add the club or organizer: a members-only event is for their members." };
  if (!club && !train && a.namesChecked === true) return { error: "Add the club or organizer: with names checked at the door, tickets move by a name change with them." };
  // Face values cap what sellers ask and what requests offer (askCap, demandCap), as entered.
  const raw = Array.isArray(a.tiers) ? a.tiers : [];
  const tiers = [];
  if (raw.length === 0 && !trek) {
    // Forms round 2: one implicit ticket type. Its face value is optional: given, it caps prices; left out, it's null and there's no cap.
    let price = null;
    if (a.face != null && String(a.face).trim() !== "") {
      const pm = parseMoney(a.face); if (pm.error) return { error: `Face value: ${pm.error.charAt(0).toLowerCase()}${pm.error.slice(1)}` };
      if (pm.value > 5000) return { error: "Face values can be at most $5,000." };
      price = pm.value;
    }
    tiers.push({ id: "t1", label: "Ticket", price });
  } else if (raw.length < 1 || raw.length > (train ? 1 : 3)) return { error: train ? "Add the ticket's face value." : "Add 1 to 3 ticket types, each with a name and a face value." };
  for (const t of raw) {
    const label = oneLine(t && t.label, 1, 40); if (!label) return { error: "Name each ticket type (up to 40 characters)." };
    // A ticket type is named by its place, never by the name typed for it: refusals go into the actions log, which doesn't
    // quote text from the request (review P4).
    const which = raw.length === 1 ? "Face value" : `Face value for ticket type ${tiers.length + 1}`;
    const pm = parseMoney(t.price); if (pm.error) return { error: `${which}: ${pm.error.charAt(0).toLowerCase()}${pm.error.slice(1)}` };
    if (pm.value > 5000) return { error: "Face values can be at most $5,000." };
    tiers.push({ id: "t" + (tiers.length + 1), label, price: pm.value });
  }
  const perPerson = a.perPerson == null ? PER_PERSON_DEFAULT[kind] : a.perPerson;
  if (!isInt(perPerson) || perPerson < 1 || perPerson > 4) return { error: "Choose a per-person limit from 1 to 4." };
  let methods = null, paper = false;
  if (oneTrain) methods = ["file"]; // forms round 2: always an eTicket, sent as a PDF or QR code; the ticket type isn't asked
  else if (train) {
    if (a.ticketType !== "eticket" && a.ticketType !== "paper") return { error: "Choose the ticket type: an eTicket for one train, or a paper ticket." };
    paper = a.ticketType === "paper"; methods = paper ? ["inperson"] : ["file"]; // an eTicket names its train on each listing (departsAt)
  }
  if (trek) methods = ["name"]; // the organizer changes the traveler's name
  const id = "ev-" + uid();
  n.events.push({ id, kind, title, ...(club ? { club } : {}), ...(cat ? { cat } : {}), start: start.value, ...(end ? { end: end.value } : {}), ...(openUntil ? { openUntil: openUntil.value } : {}),
    ...(venue ? { venue } : {}), attend, tiers, perPerson, deadline: deadline ? deadline.value : null,
    ...(trek || (!train && a.namesChecked === true) ? { namesChecked: true } : {}), ...(methods ? { methods } : {}), ...(paper ? { paperTicket: true } : {}),
    ...(train ? { noOrganizer: true, ...(oneTrain ? {} : { rangePrefix: "Valid " }) } : {}), ...(link.value ? { officialUrl: link.value } : {}), ...(notes ? { notes } : {}),
    policy: "unknown", createdBy: actor, createdAt: stamp() });
  return { id, toast: `${train ? "Train" : trek ? "Trek" : "Event"} added. It shows as added by you, and Handoff doesn't check its details.` };
}
function removeLiveEvent(n, actor, a, stamp) {
  const e = typeof a.eventId === "string" ? (n.events || []).find(x => x.id === a.eventId) : null;
  if (!e) return { error: "Event not found." };
  if (e.createdBy !== actor) return { error: "Only the person who added an event can remove it." };
  if (e.removedAt) return { error: "This event was already removed." };
  if (eventInPublicUse(n, e.id)) return { error: "This event can't be removed: listings or public requests refer to it." };
  const at = stamp(); e.removedAt = at;
  // Private records never block it (that would tell the creator they exist). Open alerts are turned off; self-reported tickets
  // stay with their owners, though nothing can be done with them on a removed event. Each owner is told; the creator's toast
  // speaks only of the creator's own.
  const hit = new Map();
  const mark = (userId, what) => { const x = hit.get(userId) || { alert: false, tickets: false }; x[what] = true; hit.set(userId, x); };
  for (const i of n.interests || []) if (i.eventId === e.id && i.kind === "alert" && i.status === "open") { i.status = "closed"; i.closedAt = at; mark(i.userId, "alert"); }
  for (const h of n.holdings || []) if (h.eventId === e.id && h.qty > 0) mark(h.userId, "tickets");
  const TICKETS = "The tickets you added for it stay in Handoff settings, but can't be listed.";
  for (const [userId, x] of hit) {
    if (userId === actor) continue;
    noteTo(n, userId, `${PEOPLE[actor].name} removed "${e.title}" from Handoff${x.alert ? ", so your alert for it is off." : "."}${x.tickets ? ` ${TICKETS}` : ""}`, { name: "activity" });
  }
  const mine = hit.get(actor);
  return { toast: `Event removed.${mine && mine.alert ? " Your alert for it is off." : ""}${mine && mine.tickets ? ` ${TICKETS}` : ""}` };
}

/* ---------- What a live world runs (C-DESIGN §3.2, §3.3) ---------- */
/** The action types a live world runs: every client action src/live.ts's parseAction accepts, plus the server's sweep.
    Everything else (the trip and organizer flow, simulated reviews, the demo clock, the preview's housekeeping) is refused
    in live, and so is any type added later until it's listed here. */
export const LIVE_TYPES = Object.freeze([
  "createEvent", "removeEvent", "addHolding", "addThen", "postTicket", "postRequest", "list", "withdraw", "editListing", "pauseListing", "resumeListing", // postTicket: one-form Sell (§9l); postRequest: one-form Request (§9m)
  "take", "offer", "counter", "accept", "decline", "respond", "markPaid", "confirmPayment", "paymentMissing", "markTransferred", "buyerReceived", "cancel", "release", "isoReply",
  "requestToBuy", "invite", "inviteRequester", "reserve", // follow-on B5 (invite to pay)
  "answerRequest", // §9v item 2 (SELL5-M3): "I have this" in one submission: list for a request and invite its poster, or invite from a listing; never a seq step
  "postItem", "withdrawItem", "editItem", "setItemPhoto", "removeItemPhoto", "pauseItem", "resumeItem", "requestItem", "acceptItemReq", "declineItemReq", "releaseItemReq", "cancelItemReq", "itemPickedUp", "itemConsent", "setPickup", // setItemPhoto, removeItemPhoto: §9s item 6
  "reportProblem", "resolveProblem", "saveInterest", "joinAlert", "setAlert", "closeInterest", "shareListing", "shareItem", "withdrawShare",
  "seq", "sweep",
]);
/** The action types a seq step may be (C-DESIGN §2.3). */
export const SEQ_STEP_TYPES = Object.freeze(["createEvent", "addHolding", "addThen", "postTicket", "list", "isoReply", "inviteRequester", "shareListing", "postItem", "shareItem", "saveInterest", "joinAlert"]);

/* The event an action is about, from its own ids. */
function targetEventId(n, a) {
  const direct = a.eventId || (a.add && a.add.eventId) || (a.data && a.data.eventId);
  if (typeof direct === "string") return direct;
  const find = (key, id) => typeof id === "string" ? (n[key] || []).find(x => x.id === id) : undefined;
  const rec = find("listings", a.listingId) || find("requests", a.requestId) || find("holdings", a.holdingId) || find("interests", a.isoId)
    || (a.type === "setAlert" || a.type === "closeInterest" ? find("interests", a.id) : undefined)
    || ((a.type === "reportProblem" || a.type === "resolveProblem") && a.kind !== "goods" ? find("requests", a.id) : undefined);
  return rec && typeof rec.eventId === "string" ? rec.eventId : null;
}
/* Why a live world refuses this action before its case runs, or null (C-DESIGN §3.3 item 4). */
function liveRefusal(n, actor, a) {
  if (!a || typeof a !== "object" || typeof a.type !== "string" || !LIVE_TYPES.includes(a.type)) return NOT_AVAILABLE;
  if (a.type === "sweep") return actor === null ? null : NOT_AVAILABLE;
  if (typeof actor !== "string" || actor === "") return "Sign in to do that.";
  if (a.simulate) return NOT_AVAILABLE; // the preview's stand-in for a made-up person's step: real people act for themselves
  if (a.type === "postItem" && a.data && ((Array.isArray(a.data.photos) && a.data.photos.length > 0) || a.data.photo)) return "Photos aren't available in the pilot yet. Describe the item instead.";
  if (a.type === "saveInterest") { const d = a.data || {}; if (d.missing || (!d.goods && !d.eventId)) return "Choose an event."; } // live requests are for events on Handoff, or goods
  const id = targetEventId(n, a); const ev = id ? EV[id] : undefined;
  if (ev && ev.removedAt && a.type !== "removeEvent") return "This event was removed.";
  if (ev && (ev.unsupported || !isQuick(ev))) return "This kind of event isn't available in the pilot.";
  return null;
}

/* ---------- seq: several steps as one change (C-DESIGN §4.1) ---------- */
const SEQ_MAX = 3;
const SEQ_ID_FIELDS = ["id", "eventId", "listingId", "itemId", "isoId", "holdingId", "requestId"];
const SEQ_REF = /^@([0-2])$/;
/* What a refused seq reports for each step that went through before a required one failed: nothing was kept (review INT-4). */
const SEQ_NOT_SAVED = "Not saved: a later step didn't go through.";
/* A step's action with each "@k" id field (top level, or in add, then or data) replaced by step k's result id; null when step k
   is this one or later, or didn't produce an id. Free text is never replaced. */
function seqResolve(action, ids, k) {
  const swap = o => {
    const out = { ...o };
    for (const f of SEQ_ID_FIELDS) {
      const m = typeof out[f] === "string" ? SEQ_REF.exec(out[f]) : null; if (!m) continue;
      const j = Number(m[1]); if (j >= k || !ids[j]) return null;
      out[f] = ids[j];
    }
    return out;
  };
  const top = swap(action); if (!top) return null;
  for (const key of ["add", "then", "data"]) {
    const v = top[key];
    if (v && typeof v === "object" && !Array.isArray(v)) { const s = swap(v); if (!s) return null; top[key] = s; }
  }
  return top;
}
/* Runs the steps in order on the evolving state. A required step failing fails the whole action and keeps nothing, so the
   refusal reports the steps before it as not saved (without the ids and toasts of records that were never stored); an
   optional one (never the first) is reported and skipped, keeping the steps before it. Returns the first step's toast and
   id, and every step's outcome as steps: [{type, ok, error?, toast?, id?}]. */
function runSeq(n, actor, a, fail) {
  const steps = Array.isArray(a.steps) ? a.steps : null;
  const valid = !!steps && steps.length >= 1 && steps.length <= SEQ_MAX
    && steps.every((st, k) => !!st && typeof st === "object" && !!st.action && typeof st.action === "object" && SEQ_STEP_TYPES.includes(st.action.type) && !(k === 0 && st.optional));
  if (!valid) return fail("That combination of changes isn't available.");
  let cur = n; const ids = []; const done = [];
  for (let k = 0; k < steps.length; k++) {
    const { action, optional } = steps[k];
    const resolved = seqResolve(action, ids, k);
    const r = resolved ? reduce(cur, actor, resolved) : { error: "A step refers to an earlier step that didn't go through." };
    if (r.error) {
      done.push({ type: action.type, ok: false, error: r.error });
      if (!optional) { const f = fail(r.error); f.steps = done.map(st => st.ok ? { type: st.type, ok: false, error: SEQ_NOT_SAVED } : st); return f; }
      ids.push(null); continue;
    }
    cur = r.state; const id = r.result && typeof r.result.id === "string" ? r.result.id : null; ids.push(id);
    done.push({ type: action.type, ok: true, ...(r.toast ? { toast: r.toast } : {}), ...(id ? { id } : {}) });
  }
  return { state: cur, ...(done[0].toast ? { toast: done[0].toast } : {}), ...(ids[0] ? { result: { id: ids[0] } } : {}), steps: done };
}

/* ---------- Checks the store runs inside withEngine (C-DESIGN §4.6, §5.3) ---------- */
/**
 * Every invariant a live document breaks, as stable keys such as "oversold:l…" or "holding-overlisted:h…" (C-DESIGN §4.6).
 * The store compares the keys before and after an action, at the same time: it refuses only keys the action introduced and
 * logs the ones already there. Installs doc first, and makes one pass over each collection. Runs inside withEngine.
 */
export function invariantViolations(doc) {
  if (!engineActive) throw new Error("Handoff: invariantViolations runs inside withEngine.");
  if (!doc || doc.mode !== "live") return ["mode-not-live"];
  applyWorld(doc);
  const out = [];
  const list = key => { if (Array.isArray(doc[key])) return doc[key]; out.push(`not-a-list:${key}`); return []; };
  const events = list("events"), holdings = list("holdings"), listings = list("listings"), requests = list("requests"), interests = list("interests");
  const responses = list("responses"), goods = list("goods"), goodsReqs = list("goodsReqs"), notes = list("notifications");
  // Ids are unique within each collection.
  for (const [key, xs] of [["events", events], ["holdings", holdings], ["listings", listings], ["requests", requests], ["interests", interests], ["responses", responses], ["goods", goods], ["goodsReqs", goodsReqs]]) {
    const seen = new Set();
    for (const x of xs) { if (seen.has(x.id)) out.push(`duplicate-id:${key}:${x.id}`); seen.add(x.id); }
  }
  // Every event has a tier, and every tier a finite face value from $0 to $5,000, or (forms round 2) none: null, only on an event's or a
  // train's one implicit ticket type (no face value given, so no price cap).
  const eventById = new Map(events.map(e => [e.id, e]));
  const priceOk = t => typeof t.price === "number" && Number.isFinite(t.price) && t.price >= 0 && t.price <= 5000;
  for (const e of events) if (!(Array.isArray(e.tiers) && e.tiers.length >= 1 && e.tiers.every(t => !!t && (priceOk(t) || (t.price === null && e.tiers.length === 1 && e.kind !== "trek"))))) out.push(`event-tiers:${e.id}`);
  // Records refer to an event that exists. Listings, requests and open public requests or alerts also need it not removed; a
  // holding, or a closed request or alert, may stay on a removed event (removeEvent leaves them, and nothing can act on them).
  const exists = id => eventById.has(id);
  const open = id => { const e = eventById.get(id); return !!e && !e.removedAt; };
  for (const [key, xs] of [["listings", listings], ["requests", requests]]) for (const x of xs) if (!open(x.eventId)) out.push(`event-ref:${key}:${x.id}`);
  for (const h of holdings) if (!exists(h.eventId)) out.push(`event-ref:holdings:${h.id}`);
  for (const i of interests) if (i.eventId != null && !(i.status === "open" ? open(i.eventId) : exists(i.eventId))) out.push(`event-ref:interests:${i.id}`);
  // A seller's pause (pausedAt, a stamp) takes nothing new: no request on a paused listing or item was made, reserved, countered or made
  // active again after it (stamps only grow, so a later one is newer), and a reply held for one request is never paused.
  const pausedOk = x => x.pausedAt === undefined || (typeof x.pausedAt === "number" && Number.isFinite(x.pausedAt));
  const since = (x, times) => typeof x.pausedAt === "number" && times.some(t => typeof t === "number" && t > x.pausedAt);
  for (const x of [...listings, ...goods]) if (!pausedOk(x)) out.push(`paused-at:${x.id}`);
  for (const l of listings) if (l.pausedAt !== undefined && l.isoReplyFor) out.push(`paused-reply:${l.id}`);
  // Follow-on B2: a close reason is one of the two, and only on a listing or item its seller closed (withdrawnAt); and nothing new is
  // taken once it's closed: no request on it was made, reserved or countered after (closedSince, as for a pause).
  for (const x of [...listings, ...goods]) if (x.closeReason !== undefined && !(typeof x.withdrawnAt === "number" && typeof x.closeReason === "string" && closeReasonOk(x.closeReason))) out.push(`close-reason:${x.id}`);
  const closedSince = (x, times) => typeof x.withdrawnAt === "number" && times.some(t => typeof t === "number" && t > x.withdrawnAt);
  const inviteSince = typeof doc.inviteSince === "number" ? doc.inviteSince : 0;
  // Requests point at an existing listing for the same event. Count what each listing has reserved and handed over.
  const listingById = new Map(listings.map(l => [l.id, l]));
  const counts = new Map(); const unpaid = new Map();
  for (const r of requests) {
    const l = listingById.get(r.listingId);
    if (!l) { out.push(`request-listing:${r.id}`); continue; }
    if (l.eventId !== r.eventId) out.push(`request-event:${r.id}`);
    if (since(l, [r.createdAt, r.acceptedAt, r.counteredAt, r.invitedAt])) out.push(`paused-new:${r.id}`);
    if (closedSince(l, [r.createdAt, r.acceptedAt, r.counteredAt, r.invitedAt])) out.push(`closed-new:${r.id}`);
    // Follow-on B5 (FOLLOWON-PLAN §2.7): once the invite flow began in this world (inviteSince, stamped by the first live step after the
    // switch), every direct-payment ticket record made after it carries inviteFlow. Records from before it, and the organizer and
    // premium flows, keep their rules. A new-flow record has the new flow's shape (inviteShapeOk).
    if (inviteSince > 0 && r.flow === "quick" && r.inviteFlow !== true && typeof r.createdAt === "number" && r.createdAt > inviteSince) out.push(`legacy-new:${r.id}`);
    if (r.inviteFlow !== undefined && !inviteShapeOk(r)) out.push(`invite-shape:${r.id}`);
    // Follow-on B1: an exchange's payment snapshot is 1-2 methods of known kinds, and the method the buyer said they used is one of them.
    if (!payShapeOk(r)) out.push(`pay-shape:${r.id}`);
    if (!EV[r.eventId]) continue; // reported above; a request's state can't be read without its event
    const e = rState(r); const c = counts.get(l.id) || { reserved: 0, completed: 0 };
    if (e.st === "completed") c.completed += r.qty; else if (reserves(e)) c.reserved += r.qty;
    counts.set(l.id, c);
    if (r.flow === "quick" && baseSt(e) === "accepted") { const k = `${r.buyerId}\u0000${r.eventId}`; unpaid.set(k, [...(unpaid.get(k) || []), r]); }
  }
  // Each listing: reserved plus handed over is at most what was listed. Each holding: qty >= 0, and what its listings still
  // owe (outstanding) fits in it.
  const owed = new Map();
  for (const l of listings) {
    const c = counts.get(l.id) || { reserved: 0, completed: 0 };
    if (c.reserved + c.completed > l.listed) out.push(`oversold:${l.id}`);
    owed.set(l.holdingId, (owed.get(l.holdingId) || 0) + (l.withdrawnAt ? c.reserved : Math.max(0, l.listed - c.completed)));
  }
  const holdingIds = new Set(holdings.map(h => h.id));
  for (const h of holdings) {
    if (!(typeof h.qty === "number" && h.qty >= 0)) out.push(`holding-negative:${h.id}`);
    if ((owed.get(h.id) || 0) > h.qty) out.push(`holding-overlisted:${h.id}`);
  }
  for (const l of listings) if (!holdingIds.has(l.holdingId)) out.push(`listing-holding:${l.id}`);
  // At most one unpaid reservation per buyer per event: the later ones are the violation.
  for (const rs of unpaid.values()) if (rs.length > 1) rs.slice().sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1)).slice(1).forEach(r => out.push(`unpaid-twice:${r.id}`));
  // Goods requests point at an existing item, and at most one holds each item.
  const itemById = new Map(goods.map(it => [it.id, it])); const holds = new Map();
  for (const g of goodsReqs) {
    const it = itemById.get(g.itemId);
    if (!it) { out.push(`goodsreq-item:${g.id}`); continue; }
    if (since(it, [g.createdAt, g.acceptedAt, g.restoredAt])) out.push(`paused-new:${g.id}`);
    if (closedSince(it, [g.createdAt, g.acceptedAt, g.restoredAt])) out.push(`closed-new:${g.id}`);
    if (gState(g, it).st === "accepted") holds.set(it.id, (holds.get(it.id) || 0) + 1);
  }
  for (const [id, k] of holds) if (k > 1) out.push(`item-double-hold:${id}`);
  // At rest: notifications drained into their table, and no strikes, policy overrides or alert preferences (none in live).
  if (notes.length > 0) out.push("notifications-not-drained");
  for (const key of ["strikes", "policies", "alertPrefs"]) { const v = doc[key]; if (!(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0)) out.push(`${key}-not-empty`); }
  return out;
}

/**
 * Follow-on B1: how many of the seller's listings a new buyer could still reach (reserve, make an offer on, or answer as a held reply's
 * requester: not withdrawn, its event open to transfers, its train not gone, not everything transferred) and would pay through the
 * seller's saved methods, having no handle of their own (a listing posted before B1 keeps the one it was posted with). The store keeps
 * a seller's last method while any does. Installs doc first. Runs inside withEngine.
 */
export function payNeededBy(doc, sellerId) {
  if (!engineActive) throw new Error("Handoff: payNeededBy runs inside withEngine.");
  applyWorld(doc);
  const requests = Array.isArray(doc.requests) ? doc.requests : [];
  // Listings that pay through the seller's saved methods: no handle of their own, on an event that exists.
  const mine = (Array.isArray(doc.listings) ? doc.listings : []).filter(l => !!l && l.sellerId === sellerId && !(typeof l.payHandle === "string" && l.payHandle.trim()) && !!EV[l.eventId]);
  if (inviteOn) {
    // Follow-on B5, once switched on: an open listing alone needs no method (posting doesn't ask for one). What needs one is an
    // exchange on such a listing that will copy the seller's methods when it's reserved, or shows them now without a copy of its own:
    // an open invitation; an older open offer, counter or held reply; a reservation, unpaid or paid but not yet confirmed, made
    // before exchanges kept a copy. A request to buy needs none yet (the seller adds one when they invite). Counts those exchanges.
    const ids = new Set(mine.map(l => l.id));
    return requests.filter(r => {
      if (!r || !ids.has(r.listingId) || r.flow !== "quick" || FINAL.includes(r.status) || !EV[r.eventId] || EV[r.eventId].removedAt) return false;
      const b = baseSt(rState(r));
      if (b === "invited") return !freeDeal(r); // §9x item 1: a free invitation copies no payment details when it's reserved, so it needs none
      return ["pending", "countered", "proposed"].includes(b) || ((b === "accepted" || b === "paid") && !Array.isArray(r.pay));
    }).length;
  }
  return mine.filter(l => !l.withdrawnAt && !EV[l.eventId].removedAt && access(EV[l.eventId]).ok
    && !departed(l) && listingNumbers({ requests }, l).completed < l.listed).length;
}
/**
 * Follow-on B5: which rule payNeededBy is counting by, for the store's words when it keeps a seller's last method: "listing" (an open
 * listing needs it: until the switch) or "exchange" (an invitation, offer or reservation needs it: once switched on).
 */
export const payNeededRule = () => inviteOn ? "exchange" : "listing";

/**
 * The earliest future moment when time alone changes what a live document should hold (C-DESIGN §5.3): an offer, reply,
 * hold or goods request lapsing; a train leaving, an event starting or a transfer cutoff passing while something is unpaid;
 * a disputed payment's release time; a pickup window closing. null when nothing is pending. The first read after it sweeps.
 * Installs doc first. Runs inside withEngine.
 */
export function nextDue(doc) {
  if (!engineActive) throw new Error("Handoff: nextDue runs inside withEngine.");
  applyWorld(doc);
  const now = CLOCK; let best = Infinity;
  const consider = t => { if (typeof t === "number" && t > now && t < best) best = t; };
  for (const r of doc.requests || []) {
    if (FINAL.includes(r.status) || !EV[r.eventId]) continue;
    const e = rState(r); if (!isOpenReq(e)) continue;
    consider(requestDeadlines(r).next); // expiresAt, holdUntil, releaseAfter (and the older flows' clocks)
    if (r.flow === "quick" && !["paid", "confirmed", "sent"].includes(baseSt(e))) { // until it's paid, these end it too
      const ev = EV[r.eventId];
      if (r.departsAt) consider(atMs(r.departsAt));
      consider(closesAt(ev)); consider(cutoffMs(ev));
    }
  }
  const items = new Map((doc.goods || []).map(it => [it.id, it]));
  for (const g of doc.goodsReqs || []) {
    const it = items.get(g.itemId); if (!it || GFINAL.includes(g.status)) continue;
    const st = gState(g, it).st; if (GFINAL.includes(st)) continue;
    if (st === "pending") consider(goodsRespondBy(g, it));
    if (st === "accepted") consider(g.holdUntil);
    consider(atMs(it.until)); // the pickup window closing ends any open request
  }
  // §9s item 6: an open item with a photo ends on its last day, when the sweep drops the photo's reference (and the store its bytes).
  for (const it of doc.goods || []) if (it && it.pic !== undefined && !it.soldAt && !it.withdrawnAt) consider(atMs(it.until));
  return best === Infinity ? null : best;
}

/** Tests only: fn(actor, action, result, depth) runs after every reduce; depth 0 is the action as sent, deeper ones are the
    steps addThen and seq run. null removes it. */
export function setActionTap(fn) { actionTap = typeof fn === "function" ? fn : null; }

/* 16 hex characters (64 bits) from the platform's cryptographic random source: live ids are unguessable and practically unique. */
function liveUid() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") throw new Error("Handoff: live ids need crypto.getRandomValues.");
  let s = ""; for (const b of c.getRandomValues(new Uint8Array(8))) s += b.toString(16).padStart(2, "0");
  return s;
}
