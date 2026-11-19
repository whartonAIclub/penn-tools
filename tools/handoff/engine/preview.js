// Development and test fixtures for Handoff's engine, exported as "@penntools/tool-handoff/preview":
// the sample data (seed, SEED_IDS) and the rule self-tests (runSelfTests), moved here unchanged from
// HandoffPrototype.jsx. Only the development preview and the tests import this module. Server code
// (tools/handoff/src and the page's server actions) never does.
import {
  DEMO_BASE, HOUR, DAY, RULES, CLOCK, PEOPLE, EVENTS, EV, applyWorld, atMs, isoDate, faceMin, paidToDate, remaining,
  commitment, access, canAttend, membersOnlyListing, canAcquire, askCap, rState, strikesOf, tradingPaused,
  listingNumbers, outstanding, holdingFree, listingState, isLive, isMissingIso, isoFits, isoMatches, liveRequest,
  stockFor, demandFor, requestMatch, alertMatch, matchRecipients, gState, itemState, requestMatchItem, catOf,
  feedItems, eventSummary, priceParts, alertVia, reduce, transferTag, rStatus, DISC0, rowsOnExplore, availableFor,
  photosOf, wantedFor, feedFor, shareText, needsAction, nyParts, SAMPLE_PEOPLE
} from "./index.js";

/* ============================================================
   SEED (demo data; holdings and listings agree)
   ============================================================ */
export function seed() {
  const t = h => DEMO_BASE - h * HOUR;
  return {
    v: 11, clockOffset: 0, tick: 0, policies: {}, seen: {}, feedbackGiven: false, suggestions: [], strikes: {}, alertPrefs: {},
    responses: [], feedSeen: {}, // listings shared with a request ("I have this"); each account's What's new seen mark (no view shows What's new since the UI update; kept for saved data and the rule checks)
    holdings: [
      { id: "h1",  userId: "u_jordan", eventId: "e_wine",    tier: "std",    qty: 1, paid: 35,  source: "seeded" },
      { id: "h2",  userId: "u_jordan", eventId: "e_pevc",    tier: "member", qty: 1, paid: 95,  source: "seeded" },
      { id: "h3",  userId: "u_jordan", eventId: "e_vets",    tier: "member", qty: 1, paid: 100, source: "seeded" },
      { id: "h4",  userId: "u_jordan", eventId: "e_euro",    tier: null,     qty: 1, paid: null, source: "seeded" },
      { id: "h6",  userId: "u_priya",  eventId: "e_wabf",    tier: "std",    qty: 1, paid: 60,  source: "seeded" },
      { id: "h7",  userId: "o_alex",   eventId: "e_wine_fg", tier: "std",    qty: 1, paid: 10,  source: "seeded" },
      { id: "h8",  userId: "o_sam",    eventId: "e_wabf",    tier: "std",    qty: 2, paid: 60,  source: "seeded" },
      { id: "h9",  userId: "o_dana",   eventId: "e_vets",    tier: "member", qty: 1, paid: 100, source: "seeded" },
      { id: "h10", userId: "o_chris",  eventId: "e_vets",    tier: "early",  qty: 1, paid: 120, source: "seeded" },
      { id: "h11", userId: "o_leah",   eventId: "e_pevc",    tier: "member", qty: 1, paid: 95,  source: "seeded" },
      { id: "h12", userId: "o_nia",    eventId: "e_sixers",  tier: "std",    qty: 1, paid: 10,  source: "seeded" },
      { id: "h13", userId: "o_tomas",  eventId: "e_njt",     tier: "ow",     qty: 1, paid: 21,  source: "seeded" },
      { id: "h14", userId: "u_jordan", eventId: "e_wabf",    tier: "std",    qty: 1, paid: 60,  source: "seeded" },
      { id: "h15", userId: "o_leah",   eventId: "e_amtrak",  tier: "coach",  qty: 1, paid: 64,  source: "seeded" },
      { id: "h16", userId: "o_alex",   eventId: "e_colombia", tier: "std",   qty: 1, paid: 1390, source: "seeded" },
      { id: "h17", userId: "o_chris",  eventId: "e_colombia", tier: "coffee", qty: 1, paid: 350, source: "seeded" },
      { id: "h18", userId: "o_dana",   eventId: "e_concert",  tier: "ga",     qty: 2, paid: 55,  source: "seeded" },
      { id: "h19", userId: "o_nia",    eventId: "e_flyers",   tier: "upper",  qty: 1, paid: 48,  source: "seeded" },
      { id: "h20", userId: "o_leah",   eventId: "e_wga_ball", tier: "std",    qty: 1, paid: 40,  source: "seeded" },
    ],
    listings: [
      { id: "l1", eventId: "e_wine_fg", sellerId: "o_alex",   holdingId: "h7",  listed: 1, ask: 10,   paid: 10,   tier: "std",    method: "name", payHandle: "@Alex-R-demo", note: "Flying home early for Thanksgiving.", createdAt: t(5), history: [] },
      { id: "l2", eventId: "e_wabf",    sellerId: "o_sam",    holdingId: "h8",  listed: 2, ask: 50,   paid: 60,   tier: "std",    method: "name", payHandle: "@Sam-O-demo", obo: true, note: "Recruiting trip that week. Selling below what I paid.", createdAt: t(26), history: [] },
      { id: "l3", eventId: "e_vets",    sellerId: "o_dana",   holdingId: "h9",  listed: 1, ask: 100,  paid: 100,  tier: "member", method: "name", payHandle: "@Dana-L-demo", note: "Member ticket.", createdAt: t(9), history: [] },
      { id: "l4", eventId: "e_vets",    sellerId: "o_chris",  holdingId: "h10", listed: 1, ask: 110,  paid: 120,  tier: "early",  method: "name", payHandle: "@Chris-M-demo", note: "", createdAt: t(2), history: [] },
      { id: "l5", eventId: "e_pevc",    sellerId: "o_leah",   holdingId: "h11", listed: 1, ask: 95,   paid: 95,   tier: "member", method: "name", payHandle: "@Leah-W-demo", note: "Member ticket.", createdAt: t(30), history: [] },
      { id: "l7", eventId: "e_sixers",  sellerId: "o_nia",    holdingId: "h12", listed: 1, ask: 10,   paid: 10,   tier: "std",    method: "app", payHandle: "@Nia-B-demo", note: "Listed before the name-change cutoff.", createdAt: t(72), history: [] },
      { id: "l8", eventId: "e_vets",    sellerId: "u_jordan", holdingId: "h3",  listed: 1, ask: 100,  paid: 100,  tier: "member", method: "name", payHandle: "@Jordan-Kim-WG27", obo: true, note: "Family visiting that weekend.", createdAt: t(20), history: [] },
      { id: "l9", eventId: "e_euro",    sellerId: "u_jordan", holdingId: "h4",  listed: 1, ask: 1650, paid: 1700, tier: null,     viaOrganizer: true, note: "Interview super day moved to that week. Happy to walk you through the trip leads’ process.", createdAt: t(28), history: [] },
      { id: "l10", eventId: "e_njt",    sellerId: "o_tomas",  holdingId: "h13", listed: 1, ask: 18,   paid: 21,   tier: "ow",     method: "inperson", payHandle: "@Tomas-G-demo", note: "Bought two one-ways at Trenton yesterday and only used one. Paper ticket, valid through Nov 18. Can meet at Huntsman.", createdAt: t(3), history: [] },
      { id: "l11", eventId: "e_wabf",   sellerId: "u_jordan", holdingId: "h14", listed: 1, ask: 60,   paid: 60,   tier: "std",    method: "name", payHandle: "@Jordan-Kim-WG27", note: "Case competition moved to that weekend.", createdAt: t(10), history: [] },
      { id: "l13", eventId: "e_colombia", sellerId: "o_alex", holdingId: "h16", listed: 1, ask: 1390, paid: 1390, tier: "std",   viaOrganizer: true, obo: true, minOffer: 1200, note: "Standard ticket. A recruiting event moved to that week.", createdAt: t(6), history: [] },
      { id: "l14", eventId: "e_colombia", sellerId: "o_chris", holdingId: "h17", listed: 1, ask: 300, paid: 350, tier: "coffee", viaOrganizer: true, obo: true, note: "Coffee Region extension only; I'm keeping my main trek spot.", createdAt: t(9), history: [] },
      { id: "l12", eventId: "e_amtrak", sellerId: "o_leah",   holdingId: "h15", listed: 1, ask: 60,   paid: 64,   tier: "coach",  method: "file", file: { name: "Amtrak-eTicket-NER171.pdf", size: 184320, hash: "a3f19c07b2e45d18" }, payHandle: "@Leah-W-demo", departsAt: "2026-11-25T14:11", obo: true, note: "Northeast Regional, coach. Driving up with friends instead. Open to offers before I cancel it.", createdAt: t(8), history: [] },
      { id: "l16", eventId: "e_concert", sellerId: "o_dana",  holdingId: "h18", listed: 2, ask: 55,   paid: 55,   tier: "ga",     method: "app", payHandle: "@Dana-L-demo", note: "Two GA tickets, can split. Ticketmaster transfer.", createdAt: t(11), history: [] },
      { id: "l17", eventId: "e_flyers",  sellerId: "o_nia",   holdingId: "h19", listed: 1, ask: 45,   paid: 48,   tier: "upper",  method: "app", payHandle: "@Nia-B-demo", obo: true, minOffer: 35, note: "Upper level, aisle seat.", createdAt: t(15), history: [] },
      // A reply to Priya's WGA ISO ("I have this" at her max price): a listing just for her, held until she answers.
      { id: "l18", eventId: "e_wga_ball", sellerId: "o_leah", holdingId: "h20", listed: 1, ask: 40,   paid: 40,   tier: "std",    method: "file", file: { name: "WGA-WinterBall-QR.png", size: 48210, hash: "5be8a90d1c37f2e4" }, payHandle: "@Leah-W-demo", isoReplyFor: "iso-p1", note: "", createdAt: t(1.5), history: [] },
    ],
    /* Student tickets follow Christine's flow (flow "quick"): offer or reservation, payment, delivery. Trips and treks keep the request flow. */
    requests: [
      { id: "r1", listingId: "l8",  eventId: "e_vets",     buyerId: "o_sam",   qty: 1, topUp: 0, price: 90, isOffer: true, flow: "quick", msg: "Would $90 work? Coming with my learning team.", status: "pending", createdAt: t(1), expiresAt: t(1) + 6 * HOUR, consent: { buyer: true, seller: true }, reports: {}, history: [] },
      { id: "r2", listingId: "l1",  eventId: "e_wine_fg",  buyerId: "u_priya", qty: 1, topUp: 0, price: 10, flow: "quick", msg: "Hi Alex, I’m a Wine Club member and can pay now.", status: "accepted", createdAt: t(5 / 60), acceptedAt: t(5 / 60), holdUntil: t(5 / 60) + RULES.holdMinutes * 60e3, consent: { buyer: true, seller: true }, reports: {}, history: [] },
      { id: "r3", listingId: "l3",  eventId: "e_vets",     buyerId: "o_leah",  qty: 1, topUp: 0, price: 100, flow: "quick", msg: "Joining Dana’s table.", status: "sent", createdAt: t(7), acceptedAt: t(7), holdUntil: t(6.75), paidAt: t(6.9), paymentConfirmedAt: t(5.5), deliveredAt: t(5), consent: { buyer: true, seller: true }, reports: { seller: t(5) }, history: [] },
      { id: "r4", listingId: "l11", eventId: "e_wabf",     buyerId: "o_chris", qty: 1, topUp: 0, price: 60, flow: "quick", msg: "I’ll take it. Paid you on Venmo.", status: "paid", createdAt: t(2), acceptedAt: t(2), holdUntil: t(1.75), paidAt: t(1.9), consent: { buyer: true, seller: true }, reports: {}, history: [] },
      { id: "r5", listingId: "l18", eventId: "e_wga_ball", buyerId: "u_priya", qty: 1, topUp: 0, price: 40, flow: "quick", isoReply: true, msg: "I have one. The QR code is ready to go.", status: "proposed", createdAt: t(1.5), expiresAt: t(1.5) + 6 * HOUR, consent: { buyer: true, seller: true }, reports: {}, history: [] },
    ],    interests: [
      { id: "iso-p1",     userId: "u_priya", eventId: "e_wga_ball", kind: "iso", qty: 1, budget: 40, note: "One ticket, any section.", expires: "2026-11-30", status: "open", createdAt: t(48) },
      { id: "iso-sam1",   userId: "o_sam",   eventId: "e_wine",     kind: "iso", qty: 1, budget: 35,   note: "Missed the release by two minutes.", expires: "2026-11-10", status: "open", createdAt: t(30) },
      { id: "iso-alex1",  userId: "o_alex",  eventId: "e_wine",     kind: "iso", qty: 2, budget: 35,   note: "", expires: "2026-10-15", status: "open", createdAt: t(190) },
      { id: "iso-nia1",   userId: "o_nia",   eventId: "e_euro",     kind: "iso", qty: 1, budget: 1700, note: "Club member, flexible on rooming.", expires: "2026-11-30", status: "open", createdAt: t(72) },
      { id: "iso-sam2",   userId: "o_sam",   eventId: "e_colombia", kind: "iso", qty: 1, budget: 1390, note: "One standard ticket. Flexible on rooming.", expires: "2026-10-22", status: "open", createdAt: t(14) },
      { id: "iso-alex2",  userId: "o_alex",  eventId: "e_amtrak",   kind: "iso", qty: 1, budget: 70,   note: "Any Tuesday afternoon train to New York.", expires: "2026-11-24", status: "open", createdAt: t(12) },
      { id: "iso-nia2",   userId: "o_nia",   eventId: "e_njt",      kind: "iso", qty: 1, budget: 21,   note: "Heading to New York for the weekend of Nov 7.", expires: "2026-11-07", status: "open", createdAt: t(20) },
      { id: "iso-tomas1", userId: "o_tomas", eventId: "e_follies",  kind: "iso", qty: 2, budget: 33,   note: "Two seats together for opening night.", expires: "2027-01-31", status: "open", createdAt: t(50) },
      { id: "iso-chris1", userId: "o_chris", eventId: null, kind: "iso", missing: { title: "Halloween Pub wristbands", club: "MBA Pub", when: "2026-10-29", flexible: false, details: "Two wristbands if Pub does a ticketed Halloween night." }, review: "reviewing", qty: 2, budget: 25, note: "", expires: "2026-10-29", status: "open", createdAt: t(24) },
      { id: "iso-p2",     userId: "u_priya", eventId: null, kind: "iso", missing: { title: "Golf simulator night", club: "", when: "2026-10-17", flexible: false, details: "" }, review: "unsupported", qty: 1, budget: 20, note: "", expires: "2026-10-18", status: "open", createdAt: t(144) },
      // Goods ISOs (category plus a short description)
      { id: "iso-gp1",    userId: "u_priya", eventId: null, kind: "iso", goods: { title: "Office chair", cat: "Furniture" }, qty: 1, budget: 50, note: "For long problem-set nights.", expires: "2026-11-08", status: "open", createdAt: t(16) },
      { id: "iso-gt1",    userId: "o_tomas", eventId: null, kind: "iso", goods: { title: "Mini fridge", cat: "Home & kitchen" }, qty: 1, budget: 40, note: "", expires: "2026-11-15", status: "open", createdAt: t(34) },
      { id: "iso-gn1",    userId: "o_nia",   eventId: null, kind: "iso", goods: { title: "Ski helmet, size M", cat: "Sports & outdoor" }, qty: 1, budget: 50, note: "Before the January trips.", expires: "2026-12-20", status: "open", createdAt: t(40) },
    ],
    /* Goods: second-hand items, modeled on move-out sales in student group chats (furniture first, OBO common, pickup area and deadline).
       Sellers and items are fictional; areas are neighborhoods, never addresses. */
    goods: [
      { id: "g1", sellerId: "o_dana",   title: "Gray sleeper sofa with storage",        cat: "Furniture",        cond: "Good",     price: 80, obo: true,  area: "Rittenhouse",       until: "2026-11-14", note: "Moving out in December. Can help carry it down from the third floor.", createdAt: t(30), history: [] },
      { id: "g2", sellerId: "o_alex",   title: "27-inch monitor, HDMI cable included",  cat: "Electronics",      cond: "Like new", price: 60, obo: false, area: "University City",   until: "2026-11-07", note: "", createdAt: t(18), history: [] },
      { id: "g3", sellerId: "o_nia",    title: "Queen metal bed frame",                 cat: "Furniture",        cond: "Good",     price: 70, obo: true,  area: "Graduate Hospital", until: "2026-11-21", note: "Disassembled; all the hardware is in a bag.", createdAt: t(50), history: [] },
      { id: "g4", sellerId: "o_tomas",  title: "Electric kettle",                       cat: "Home & kitchen",   cond: "Good",     price: 15, obo: true,  area: "Fitler Square",     until: "2026-11-10", note: "Free if you take something else from my move-out list.", createdAt: t(26), history: [] },
      { id: "g5", sellerId: "o_sam",    title: "Ski jacket, men's M",                   cat: "Clothing",         cond: "Like new", price: 60, obo: true,  area: "University City",   until: "2026-12-15", note: "Worn one season. Good timing before the ski trips.", createdAt: t(12), history: [] },
      { id: "g6", sellerId: "u_jordan", title: "Ergonomic office chair",                cat: "Furniture",        cond: "Good",     price: 45, obo: true,  area: "Rittenhouse",       until: "2026-11-08", note: "Adjustable arms and lumbar support.", createdAt: t(22), history: [] },
      { id: "g7", sellerId: "o_chris",  title: "Adjustable dumbbells, pair up to 25 lb", cat: "Sports & outdoor", cond: "Good",     price: 90, obo: true,  area: "Fairmount",         until: "2026-11-30", note: "", createdAt: t(40), history: [] },
      { id: "g8", sellerId: "o_leah",   title: "Corporate finance textbook",            cat: "Books & supplies", cond: "Good",     price: 30, obo: false, area: "Huntsman Hall",     until: "2026-11-30", note: "Core-course edition. Some highlighting.", createdAt: t(70), history: [] },
    ],
    goodsReqs: [
      { id: "gr1", itemId: "g6", buyerId: "o_leah", price: 35, isOffer: true, msg: "Would you take $35? I can pick it up this weekend.", status: "pending", createdAt: t(3), consent: {}, history: [] },
    ],
    notifications: [
      { id: "n4", userId: "u_jordan", text: "Leah W. offered $35 for your Ergonomic office chair (you're asking $45).", link: { name: "item", id: "g6" }, at: t(3), read: false },
      { id: "n3", userId: "u_jordan", text: "Chris M. says they paid you $60 for Wharton Africa Business Forum. Check Venmo or PayPal, then tap “Payment received”.", link: { name: "activity", tab: "todo" }, at: t(1.5), read: false },
      { id: "n1", userId: "u_jordan", text: "Sam O. offered $90 for your Vets Gala ticket (you're asking $100). Accept, counter once or decline within 6 hours.", link: { name: "activity", tab: "todo" }, at: t(1), read: false },
      { id: "n5", userId: "u_priya",  text: "Leah W. has a WGA Winter Ball ticket at your max price ($40). Accept within 6 hours to reserve it for 15 minutes, and pay right away.", link: { name: "activity", tab: "todo" }, at: t(1.5), read: false },
      { id: "n6", userId: "u_priya",  text: "You reserved Alex R.'s Friendsgiving Wine Social ticket. Pay within 15 minutes, then tap “Paid”.", link: { name: "activity", tab: "todo" }, at: t(5 / 60), read: false },
      { id: "n2", userId: "u_priya",  text: `Welcome. You're using ${SAMPLE_PEOPLE.u_priya.first}'s sample account. Nothing here is real.`, link: { name: "how" }, at: t(24), read: true },
    ],
  };
}
/* Seeded examples exist in every viewer's copy of the demo; anything created later lives only in one browser. */
export const SEED_IDS = (() => { const s = seed(); return new Set([...s.listings.map(l => l.id), ...s.interests.map(i => i.id), ...s.goods.map(g => g.id), ...s.requests.map(r => r.id)]); })();

/* ============================================================
   SELF-TESTS (run in the browser on a fresh seed; never touch saved state)
   ============================================================ */
export function runSelfTests(appState) {
  const out = []; const t = (name, fn) => { try { const r = fn(); out.push({ name, pass: r === true, detail: r === true ? "" : String(r) }); } catch (e) { out.push({ name, pass: false, detail: e.message }); } };
  const S = () => { const s = seed(); applyWorld(s); return s; };
  const ok = (res, msg) => { if (res.error) throw new Error((msg || "unexpected error") + ": " + res.error); return res.state; };
  const err = (res, msg) => { if (!res.error) throw new Error(msg || "expected an error"); return res.state; };
  const L = (s, id) => s.listings.find(l => l.id === id);
  const R = (s, id) => s.requests.find(r => r.id === id);
  const adv = (s, h) => ok(reduce(s, "u_jordan", { type: "clock", hours: h }));

  t("One held spot can't become two listed spots", () => { let s = S(); err(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 2, ask: "60" })); s = ok(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "60" })); return true; });
  t("A second listing can't reuse the same inventory", () => { let s = S(); s = ok(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "55" })); err(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "55" })); return true; });
  t("Asking price can't exceed what was paid; bad values rejected", () => { const s = S(); err(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "61" })); err(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "-5" })); err(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "abc" })); err(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "" })); err(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1.5, ask: "50" })); return true; });
  t("Tier cap: a $95 member ticket can't be listed at $100", () => { const s = S(); const r = reduce(s, "u_jordan", { type: "list", holdingId: "h2", qty: 1, ask: "100" }); if (!r.error || !/\$95/.test(r.error)) return "expected price-cap error, got: " + (r.error || "none"); ok(reduce(s, "u_jordan", { type: "list", holdingId: "h2", qty: 1, ask: "95" })); return true; });
  t("Self-reported holdings can't exceed face value; member-priced student tickets are on the honor system", () => { const s = S(); err(reduce(s, "u_priya", { type: "addHolding", eventId: "e_vets", tier: "early", qty: 1, paid: "130" })); err(reduce(s, "u_priya", { type: "addHolding", eventId: "e_vets", tier: "member", qty: 1, paid: "110" }), "a member ticket above its $100 face value"); ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_vets", tier: "member", qty: 1, paid: "100" })); ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_vets", tier: "early", qty: 1, paid: "120" })); return true; });
  /* ---------- Trips and treks keep the request and organizer-approval flow ---------- */
  // Jordan's Euro Ski Trip spot (l9). Buyers must be club members: Priya, or Nia (a fictional account, acting directly in tests).
  const tripReq = (s, who) => { const s2 = ok(reduce(s, who, { type: "request", listingId: "l9", qty: 1, confirmEligible: true })); return [s2, s2.requests[0].id]; };
  t("Trips: competing acceptances can't hold the same spot; the other request waits as a backup", () => {
    let s = S(); let a1, a2; [s, a1] = tripReq(s, "u_priya"); [s, a2] = tripReq(s, "o_nia");
    s = ok(reduce(s, "u_jordan", { type: "accept", requestId: a1 }));
    err(reduce(s, "u_jordan", { type: "accept", requestId: a2 }), "a backup can't be accepted");
    const nb = listingNumbers(s, L(s, "l9"));
    return (rState(R(s, a2)).st === "waiting" && nb.reserved === 1 && nb.available === 0) || `competing request is ${rState(R(s, a2)).st}; ${JSON.stringify(nb)}`;
  });
  t("Trips: a failed match restores the backup to pending; it's never accepted automatically", () => {
    for (const how of ["release", "orgDecline", "cancel", "lapse"]) {
      let s = S(); let a1, a2; [s, a1] = tripReq(s, "o_nia"); [s, a2] = tripReq(s, "u_priya");
      s = ok(reduce(s, "u_jordan", { type: "accept", requestId: a1 }));
      if (how === "release") s = ok(reduce(s, "u_jordan", { type: "release", requestId: a1 }));
      if (how === "orgDecline") { s = ok(reduce(s, "u_jordan", { type: "sellerReport", requestId: a1 })); s = ok(reduce(s, "reviewer", { type: "orgDecline", requestId: a1 })); }
      if (how === "cancel") s = ok(reduce(s, "o_nia", { type: "cancel", requestId: a1 }));
      if (how === "lapse") s = adv(s, 73);
      const st = rState(R(s, a2)).st; const nb = listingNumbers(s, L(s, "l9"));
      if (st !== "pending" || nb.available !== 1 || nb.reserved !== 0) return `${how}: backup is ${st}; ${JSON.stringify(nb)}`;
      if (!s.notifications.some(x => x.userId === "u_priya" && /available again/.test(x.text))) return `${how}: Priya wasn't told`;
    }
    return true;
  });
  t("Trips: registration confirmation moves the spot exactly once and closes requests it can no longer meet", () => {
    let s = S(); let a1, a2; [s, a1] = tripReq(s, "u_priya"); [s, a2] = tripReq(s, "o_nia");
    s = ok(reduce(s, "u_jordan", { type: "accept", requestId: a1 })); err(reduce(s, "u_jordan", { type: "accept", requestId: a1 }), "duplicate accept");
    s = ok(reduce(s, "u_jordan", { type: "sellerReport", requestId: a1 })); if (rState(R(s, a1)).st !== "approval") return "trip swaps need approval";
    s = ok(reduce(s, "reviewer", { type: "orgApprove", requestId: a1 })); s = ok(reduce(s, "reviewer", { type: "orgConfirm", requestId: a1 }));
    err(reduce(s, "reviewer", { type: "orgConfirm", requestId: a1 }), "duplicate confirmation");
    const nb = listingNumbers(s, L(s, "l9")); const jh = s.holdings.find(h => h.id === "h4").qty; const ph = s.holdings.filter(h => h.userId === "u_priya" && h.eventId === "e_euro").reduce((t, h) => t + h.qty, 0);
    if (!(nb.completed === 1 && nb.available === 0 && nb.reserved === 0 && jh === 0 && ph === 1)) return `${JSON.stringify(nb)} jordan=${jh} priya=${ph}`;
    const e = rState(R(s, a2)); return (e.st === "declined" && /transferred/i.test(e.reason)) || `backup is ${e.st}: ${e.reason}`;
  });
  t("Trips: a swap already with the organizer survives the cutoff, and can still be decided after a rule change pauses it", () => {
    let s = S(); let a1, a2; [s, a1] = tripReq(s, "u_priya"); [s, a2] = tripReq(s, "o_nia");
    s = ok(reduce(s, "u_jordan", { type: "accept", requestId: a1 })); s = ok(reduce(s, "u_jordan", { type: "sellerReport", requestId: a1 }));
    s = adv(s, 43 * 24); // Dec 2: past the Dec 1 cutoff, before the trip
    if (!(rState(R(s, a1)).st === "approval" && rState(R(s, a1)).afterCutoff)) return "the swap should survive the cutoff, is " + rState(R(s, a1)).st;
    if (rState(R(s, a2)).st !== "expired") return "the unsent backup should expire at the cutoff, is " + rState(R(s, a2)).st;
    s = ok(reduce(s, "u_jordan", { type: "setPolicy", eventId: "e_euro", policy: "official" }));
    if (rState(R(s, a1)).st !== "paused") return "the swap should show as paused";
    s = ok(reduce(s, "reviewer", { type: "orgApprove", requestId: a1 })); s = ok(reduce(s, "reviewer", { type: "orgConfirm", requestId: a1 }));
    return rState(R(s, a1)).st === "completed" || "swap is " + rState(R(s, a1)).st;
  });
  t("Trips: a policy change can't revive a swap that expired when the trip started", () => {
    let s = S(); let a1; [s, a1] = tripReq(s, "u_priya");
    s = ok(reduce(s, "u_jordan", { type: "accept", requestId: a1 })); s = ok(reduce(s, "u_jordan", { type: "sellerReport", requestId: a1 }));
    s = adv(s, 82 * 24); if (rState(R(s, a1)).st !== "expired") return "the swap should expire once the trip starts";
    s = ok(reduce(s, "u_jordan", { type: "setPolicy", eventId: "e_euro", policy: "official" }));
    if (rState(R(s, a1)).st !== "expired") return "revived by a policy change"; err(reduce(s, "reviewer", { type: "orgApprove", requestId: a1 })); return true;
  });
  t("Trips always need the trip leads' approval, whatever the club's rule", () => {
    let s = S(); s = ok(reduce(s, "u_jordan", { type: "setPolicy", eventId: "e_euro", policy: "permitted" }));
    s = ok(reduce(s, "u_priya", { type: "request", listingId: "l9", qty: 1, confirmEligible: true })); const id = s.requests[0].id;
    s = ok(reduce(s, "u_jordan", { type: "accept", requestId: id })); return R(s, id).flow === "approval" || "flow is " + R(s, id).flow;
  });
  t("Registration confirmation shares no contacts; sharing still works after it, with consent", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "request", listingId: "l9", qty: 1, confirmEligible: true })); const id = s.requests[0].id;
    s = ok(reduce(s, "u_jordan", { type: "accept", requestId: id })); s = ok(reduce(s, "u_jordan", { type: "sellerReport", requestId: id }));
    s = ok(reduce(s, "reviewer", { type: "orgApprove", requestId: id })); s = ok(reduce(s, "reviewer", { type: "orgConfirm", requestId: id }));
    if (R(s, id).consent.seller || R(s, id).consent.buyer) return "confirmation shared contact details";
    err(reduce(s, "u_priya", { type: "consent", requestId: id, side: "seller" }), "Priya can't agree for Jordan");
    s = ok(reduce(s, "u_jordan", { type: "consent", requestId: id, side: "seller" }));
    if (R(s, id).consent.buyer) return "Jordan's consent shouldn't share Priya's details";
    err(reduce(s, "u_jordan", { type: "consent", requestId: id, side: "seller" }), "duplicate consent");
    s = ok(reduce(s, "u_priya", { type: "consent", requestId: id, side: "buyer" }));
    return (R(s, id).consent.seller && R(s, id).consent.buyer && rState(R(s, id)).st === "completed") || "consent not recorded";
  });
  t("Owner cards never mix 'your listing' with 'nothing listed'", () => {
    const check = (s, when) => { for (const ev of EVENTS) { const sum = eventSummary(s, ev, "u_jordan"); const sub = priceParts(ev, sum).sub; if ((sum.state.key === "mine" || sum.ownMain) && /nothing listed/i.test(sub)) return `${when}: ${ev.title} says "${sum.state.label}" and "${sub}"`; } return null; };
    let s = S(); let bad = check(s, "seed"); if (bad) return bad;
    let sum = eventSummary(s, EV.e_euro, "u_jordan"); let sub = priceParts(EV.e_euro, sum).sub;
    if (sum.state.key !== "mine" || !sum.ownMain || sum.ownMain.ask !== 1650 || !/\$2,900/.test(sub)) return `Euro Ski owner card: "${sum.state.label}" / "${sub}"`;
    s = ok(reduce(s, "u_priya", { type: "request", listingId: "l9", qty: 1, confirmEligible: true })); const id = s.requests[0].id;
    s = ok(reduce(s, "u_jordan", { type: "accept", requestId: id })); bad = check(s, "reserved"); if (bad) return bad;
    sum = eventSummary(s, EV.e_euro, "u_jordan"); if (!/held for a buyer/i.test(sum.state.label)) return "reserved owner card: " + sum.state.label;
    const buyerView = priceParts(EV.e_euro, eventSummary(s, EV.e_euro, "o_nia")).sub; if (!/held for a buyer/.test(buyerView)) return "other students should see the hold: " + buyerView;
    s = ok(reduce(s, "u_jordan", { type: "sellerReport", requestId: id })); s = ok(reduce(s, "reviewer", { type: "orgApprove", requestId: id })); s = ok(reduce(s, "reviewer", { type: "orgConfirm", requestId: id }));
    bad = check(s, "transferred"); if (bad) return bad;
    sub = priceParts(EV.e_euro, eventSummary(s, EV.e_euro, "u_jordan")).sub; return /transferred/i.test(sub) || "transferred owner card: " + sub;
  });
  t("Event eligibility and ticket-tier eligibility are separate", () => {
    const s = S(); const pevc = EV.e_pevc, vets = EV.e_vets, wine = EV.e_wine;
    if (!canAttend("u_priya", pevc).ok) return "Priya should be able to attend PE/VC";
    if (!canAcquire("u_priya", pevc, L(s, "l5")).needsMember) return "a PE/VC member ticket should ask the buyer to confirm membership";
    if (!canAcquire("u_priya", vets, L(s, "l8")).needsMember) return "a Vets member-priced ticket should ask the buyer to confirm membership";
    if (canAcquire("u_priya", vets, L(s, "l4")).needsMember) return "a non-member ticket needs no confirmation";
    if (canAttend("u_priya", { ...wine, club: "Other Club" }).ok) return "members-only events need membership";
    return true;
  });
  t("Members-only tickets: the buyer confirms they're a member before reserving or offering (Handoff doesn't check); sellers can mark one", () => {
    const s = S();
    err(reduce(s, "u_priya", { type: "take", listingId: "l8", qty: 1 }), "reserving a member ticket without confirming membership");
    const s2 = ok(reduce(s, "u_priya", { type: "take", listingId: "l8", qty: 1, member: true })); const r = s2.requests[0];
    if (!(r.memberConfirmed && !r.topUp && r.history.some(h => /confirmed they're a Veterans Club member/.test(h.text)))) return "the confirmation should be recorded, with no top-up";
    let s3 = S(); s3 = ok(reduce(s3, "u_jordan", { type: "addHolding", eventId: "e_concert", tier: "ga", qty: 1, paid: "55" }));
    s3 = ok(reduce(s3, "u_jordan", { type: "list", holdingId: s3.holdings[s3.holdings.length - 1].id, qty: 1, ask: "55", method: "app", membersOnly: true })); const ml = s3.listings[0];
    if (!(ml.membersOnly && membersOnlyListing(EV.e_concert, ml))) return "the seller's members-only mark should be stored";
    err(reduce(s3, "u_priya", { type: "take", listingId: ml.id, qty: 1 }), "a seller-marked members-only ticket without confirmation");
    return !reduce(s3, "u_priya", { type: "take", listingId: ml.id, qty: 1, member: true }).error || "confirming membership should let the buyer reserve it";
  });
  /* ---------- Student tickets: Christine's flow (reserve or offer, pay first, then delivery) ---------- */
  t("“I'll take it” reserves at the asking price for 15 minutes; an unpaid reservation goes back on sale", () => {
    let s = S();
    err(reduce(s, "u_jordan", { type: "take", listingId: "l11", qty: 1 }), "taking your own listing");
    err(reduce(s, "u_priya", { type: "request", listingId: "l2", qty: 1 }), "student tickets don't use the request form");
    s = ok(reduce(s, "u_priya", { type: "take", listingId: "l2", qty: 1 })); const id = s.requests[0].id;
    const r = R(s, id); if (r.status !== "accepted" || r.price !== 50 || r.holdUntil !== CLOCK + RULES.holdMinutes * 60e3) return "not reserved for 15 minutes at $50: " + JSON.stringify({ st: r.status, price: r.price });
    if (listingNumbers(s, L(s, "l2")).available !== 1) return "one of Sam's two tickets should be held";
    err(reduce(s, "u_priya", { type: "take", listingId: "l2", qty: 1 }), "a second reservation on the same listing");
    s = ok(reduce(s, "u_jordan", { type: "addHolding", eventId: "e_concert", tier: "ga", qty: 1, paid: "55" })); const hc = s.holdings[s.holdings.length - 1].id;
    s = ok(reduce(s, "u_jordan", { type: "list", holdingId: hc, qty: 1, ask: "55", method: "app" }));
    s = ok(reduce(s, "u_priya", { type: "take", listingId: "l16", qty: 1 }));
    err(reduce(s, "u_priya", { type: "take", listingId: s.listings.find(l => l.eventId === "e_concert" && l.sellerId === "u_jordan").id, qty: 1 }), "a second unpaid reservation for the same event");
    s = adv(s, 10 / 60); if (rState(R(s, id)).st !== "accepted") return "still held after 10 minutes";
    s = adv(s, 5 / 60); const e = rState(R(s, id));
    if (!(e.st === "expired" && /without payment/.test(e.reason))) return "should lapse after 15 minutes unpaid: " + e.st;
    return listingNumbers(s, L(s, "l2")).available === 2 || "the ticket should be back on sale";
  });
  t("Pay first: “Paid”, then “Payment received”, then the transfer, then “Received”; tickets move once", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "take", listingId: "l2", qty: 1 })); const id = s.requests[0].id; // Sam's WABF pass: a name change
    err(reduce(s, "o_sam", { type: "markPaid", requestId: id }), "only the buyer says they paid");
    err(reduce(s, "o_sam", { type: "confirmPayment", requestId: id }), "nothing to confirm before Paid");
    s = ok(reduce(s, "u_priya", { type: "markPaid", requestId: id })); if (rState(R(s, id)).st !== "paid") return "should be paid";
    err(reduce(s, "u_priya", { type: "cancel", requestId: id }), "a paid reservation can't just be cancelled");
    err(reduce(s, "o_sam", { type: "release", requestId: id }), "a paid reservation can't be released");
    err(reduce(s, "u_priya", { type: "confirmPayment", requestId: id }), "only the seller confirms payment");
    s = ok(reduce(s, "o_sam", { type: "confirmPayment", requestId: id })); if (rState(R(s, id)).st !== "confirmed") return "a name change waits for the seller's step, is " + rState(R(s, id)).st;
    err(reduce(s, "u_priya", { type: "buyerReceived", requestId: id }), "nothing to receive before the transfer");
    s = ok(reduce(s, "o_sam", { type: "markTransferred", requestId: id })); if (rState(R(s, id)).st !== "sent") return "should be delivered";
    err(reduce(s, "o_sam", { type: "buyerReceived", requestId: id }), "only the buyer confirms receipt");
    s = ok(reduce(s, "u_priya", { type: "buyerReceived", requestId: id })); err(reduce(s, "u_priya", { type: "buyerReceived", requestId: id }), "duplicate receipt");
    const nb = listingNumbers(s, L(s, "l2")); const sh = s.holdings.find(h => h.id === "h8").qty;
    const ph = s.holdings.filter(h => h.userId === "u_priya" && h.eventId === "e_wabf" && h.source === "transferred (simulated)");
    return (rState(R(s, id)).st === "completed" && nb.completed === 1 && nb.available === 1 && sh === 1 && ph.length === 1 && ph[0].paid === 50) || `${JSON.stringify(nb)} sam=${sh} priya=${JSON.stringify(ph)}`;
  });
  t("PDF or QR: the file stays hidden until the seller confirms payment, then Handoff delivers it", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "take", listingId: "l12", qty: 1 })); const id = s.requests[0].id; // Leah's Amtrak eTicket (fictional seller)
    s = ok(reduce(s, "u_priya", { type: "markPaid", requestId: id }));
    err(reduce(s, "u_jordan", { type: "confirmPayment", requestId: id, simulate: true }), "only the buyer can simulate a made-up seller");
    s = ok(reduce(s, "u_priya", { type: "confirmPayment", requestId: id, simulate: true }));
    const r = R(s, id); if (!(rState(r).st === "sent" && r.deliveredAt && r.confirmSimulated)) return "file not delivered on payment: " + rState(r).st;
    if (!r.history.some(x => /delivered the ticket file/.test(x.text))) return "delivery not recorded";
    s = ok(reduce(s, "u_priya", { type: "buyerReceived", requestId: id }));
    return rState(R(s, id)).st === "completed" || "not completed";
  });
  t("Offers: below the ask and at or above the seller's lowest; one counter; 6 hours to answer (1 hour within a day of the event)", () => {
    let s = S();
    err(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "45" }), "an offer equal to the ask");
    err(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "30" }), "below the seller's lowest offer");
    err(reduce(s, "u_priya", { type: "offer", listingId: "l16", qty: 1, amount: "40" }), "the listing doesn't take offers");
    s = ok(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const id = s.requests[0].id;
    if (R(s, id).expiresAt !== CLOCK + 6 * HOUR) return "an offer should last 6 hours";
    err(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "40" }), "a second offer on the same listing");
    err(reduce(s, "o_nia", { type: "counter", requestId: id, amount: "50" }), "a counter at or above the ask");
    s = ok(reduce(s, "o_nia", { type: "counter", requestId: id, amount: "42" }));
    err(reduce(s, "o_nia", { type: "counter", requestId: id, amount: "41" }), "only one counter");
    s = ok(reduce(s, "u_priya", { type: "respond", requestId: id, accept: true }));
    const r = R(s, id); if (!(r.status === "accepted" && r.price === 42)) return "the counter price should be reserved: " + JSON.stringify({ st: r.status, price: r.price });
    let s2 = S(); s2 = ok(reduce(s2, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const id2 = s2.requests[0].id;
    s2 = adv(s2, 6.5); if (rState(R(s2, id2)).st !== "expired") return "an unanswered offer should expire after 6 hours";
    let s3 = S(); s3 = adv(s3, 25 * 24 - 1); // Nov 14, 8am: the game starts in 11 hours
    s3 = ok(reduce(s3, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const r3 = s3.requests[0];
    if (r3.expiresAt !== CLOCK + HOUR) return "within a day of the event, an offer should last 1 hour";
    // A pass valid for weeks isn't "within a day" just because its window opened: NJ TRANSIT offers get the full 6 hours.
    let s4 = S(); s4 = ok(reduce(s4, "u_jordan", { type: "addHolding", eventId: "e_njt", tier: EV.e_njt.tiers[0].id, qty: 1, paid: String(EV.e_njt.tiers[0].price) }));
    s4 = ok(reduce(s4, "u_jordan", { type: "list", holdingId: s4.holdings[s4.holdings.length - 1].id, qty: 1, ask: String(EV.e_njt.tiers[0].price), obo: true }));
    s4 = ok(reduce(s4, "u_priya", { type: "offer", listingId: s4.listings[0].id, qty: 1, amount: String(Math.max(1, EV.e_njt.tiers[0].price - 1)) }));
    return s4.requests[0].expiresAt === CLOCK + 6 * HOUR || "an NJ TRANSIT offer should last 6 hours, not 1";
  });
  t("The demo clock's “+15 min” ends a reservation made just now; an offer ends 6 hours after it's made (deadlines count from the clock)", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "take", listingId: "l16", qty: 1 })); const id = s.requests[0].id;
    s = ok(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const o = s.requests[0].id;
    s = adv(s, RULES.holdMinutes / 60);
    if (rState(R(s, id)).st !== "expired" || listingNumbers(s, L(s, "l16")).available !== 2) return "the reservation should end at exactly +15 minutes: " + rState(R(s, id)).st;
    s = adv(s, RULES.offerHours - RULES.holdMinutes / 60);
    return rState(R(s, o)).st === "expired" || "the offer should end at exactly +6 hours: " + rState(R(s, o)).st;
  });
  t("Hold length: 15 minutes when the buyer reserves it themselves (take, counter, ISO reply); 2 hours when the seller accepts their offer", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const o = s.requests[0].id;
    s = ok(reduce(s, "o_nia", { type: "accept", requestId: o }));
    if (R(s, o).holdUntil !== CLOCK + RULES.offerHoldHours * HOUR) return "an accepted offer should be held 2 hours";
    s = adv(s, 1); if (rState(R(s, o)).st !== "accepted") return "an accepted offer should still be held after an hour";
    let s2 = S(); s2 = ok(reduce(s2, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const c = s2.requests[0].id;
    s2 = ok(reduce(s2, "o_nia", { type: "counter", requestId: c, amount: "42" })); s2 = ok(reduce(s2, "u_priya", { type: "respond", requestId: c, accept: true }));
    if (R(s2, c).holdUntil !== CLOCK + RULES.holdMinutes * 60e3) return "accepting a counter should hold it 15 minutes";
    let s3 = S(); s3 = ok(reduce(s3, "u_priya", { type: "respond", requestId: "r5", accept: true }));
    if (R(s3, "r5").holdUntil !== CLOCK + RULES.holdMinutes * 60e3) return "accepting an ISO reply should hold it 15 minutes";
    // Near the transfer deadline the hold is cut short, and the message says the real length
    let s4 = S(); s4 = adv(s4, (atMs("2026-11-04T23:45") - CLOCK) / HOUR); // WABF's transfer window closes at 23:59
    const tk = reduce(s4, "u_priya", { type: "take", listingId: "l2", qty: 1 }); if (tk.error || !/14 minutes/.test(tk.toast)) return "near the cutoff the toast should say 14 minutes: " + (tk.error || tk.toast);
    // Priya's seeded reservation (r2) has 10 minutes left at the demo's start
    return (rState(R(S(), "r2")).st === "accepted" && rState(R(adv(S(), 10 / 60), "r2")).st === "expired") || "the seeded reservation should have 10 minutes left";
  });
  t("A full-price “I'll take it” wins: offers it can no longer cover are declined, and so are the rest when one is accepted", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const p = s.requests[0].id;
    s = ok(reduce(s, "u_jordan", { type: "offer", listingId: "l17", qty: 1, amount: "40" })); const j = s.requests[0].id;
    s = ok(reduce(s, "o_sam", { type: "take", listingId: "l17", qty: 1 }));
    if (!(rState(R(s, p)).st === "declined" && rState(R(s, j)).st === "declined")) return `offers should be declined: ${rState(R(s, p)).st}/${rState(R(s, j)).st}`;
    if (!s.notifications.some(x => x.userId === "u_priya" && /reserved the ticket you made an offer on/.test(x.text))) return "Priya wasn't told";
    s = S(); s = ok(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const p2 = s.requests[0].id;
    s = ok(reduce(s, "u_jordan", { type: "offer", listingId: "l17", qty: 1, amount: "40" })); const j2 = s.requests[0].id;
    s = ok(reduce(s, "o_nia", { type: "accept", requestId: j2 }));
    if (!(rState(R(s, j2)).st === "accepted" && rState(R(s, p2)).st === "declined")) return `accepting one should decline the rest: ${rState(R(s, j2)).st}/${rState(R(s, p2)).st}`;
    s = S(); s = ok(reduce(s, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); const own = s.requests[0].id;
    s = ok(reduce(s, "u_priya", { type: "take", listingId: "l17", qty: 1 }));
    return (rState(R(s, own)).st === "cancelled" && rState(s.requests[0]).st === "accepted") || "a buyer's own offer should be replaced by their full-price reservation";
  });
  t("ISO reply: “I have this” at the buyer's max (never above what you paid) or one counter; the buyer accepts to reserve it", () => {
    let s = S();
    err(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_wine", qty: 1, expires: "2026-11-10" } }), "a ticket ISO needs a max price");
    err(reduce(s, "u_jordan", { type: "isoReply", isoId: "iso-sam1", holdingId: "h1", qty: 1, counter: true, price: "40" }), "a counter above what Jordan paid");
    s = ok(reduce(s, "u_jordan", { type: "isoReply", isoId: "iso-sam1", holdingId: "h1", qty: 1 })); const id = s.requests[0].id; const l = s.listings[0];
    if (!(R(s, id).status === "proposed" && R(s, id).price === 35 && l.isoReplyFor === "iso-sam1" && l.method === "name")) return "reply not recorded at Sam's max via a name change";
    if (listingNumbers(s, l).available !== 0 || eventSummary(s, EV.e_wine, "u_priya").mySpots !== 0) return "a reply is held for Sam, not listed for everyone";
    err(reduce(s, "u_jordan", { type: "isoReply", isoId: "iso-sam1", holdingId: "h1", qty: 1 }), "a second reply to the same ISO");
    err(reduce(s, "u_priya", { type: "respond", requestId: id, accept: true }), "only Sam can answer");
    err(reduce(s, "o_sam", { type: "respond", requestId: id, accept: true }), "accepting a members-only reply without confirming membership");
    s = ok(reduce(s, "o_sam", { type: "respond", requestId: id, accept: true, member: true }));
    if (!(rState(R(s, id)).st === "accepted" && R(s, id).holdUntil && R(s, id).memberConfirmed)) return "accepting should reserve it";
    let s2 = S(); s2 = ok(reduce(s2, "u_jordan", { type: "isoReply", isoId: "iso-sam1", holdingId: "h1", qty: 1, counter: true, price: "30" })); const id2 = s2.requests[0].id; const l2 = s2.listings[0];
    if (!R(s2, id2).isCounter) return "a different price should be marked as a counter";
    s2 = ok(reduce(s2, "o_sam", { type: "respond", requestId: id2, accept: false }));
    return (!!L(s2, l2.id).withdrawnAt && holdingFree(s2, s2.holdings.find(h => h.id === "h1")) === 1) || "a declined reply should close its listing and free the ticket";
  });
  t("Transfer methods: names checked at entry force a name change; a PDF or QR needs its file, and the same file can't be listed twice", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_wga_ball", tier: "std", qty: 2, paid: "40" })); const h = s.holdings[s.holdings.length - 1].id;
    err(reduce(s, "u_priya", { type: "list", holdingId: h, qty: 1, ask: "40" }), "no transfer method chosen");
    err(reduce(s, "u_priya", { type: "list", holdingId: h, qty: 1, ask: "40", method: "file" }), "a PDF or QR listing without its file");
    err(reduce(s, "u_priya", { type: "list", holdingId: h, qty: 1, ask: "40", namesChecked: true, method: "app" }), "names checked at entry: an app transfer isn't allowed");
    const fileA = { name: "wga.png", size: 1000, hash: "deadbeefdeadbeef" };
    s = ok(reduce(s, "u_priya", { type: "list", holdingId: h, qty: 1, ask: "40", method: "file", file: fileA }));
    if (!(s.listings[0].file && s.listings[0].file.hash === fileA.hash)) return "file fingerprint not stored";
    err(reduce(s, "u_priya", { type: "list", holdingId: h, qty: 1, ask: "40", method: "file", file: fileA }), "the same file listed twice");
    s = ok(reduce(s, "u_priya", { type: "list", holdingId: h, qty: 1, ask: "40", namesChecked: true, method: "name" }));
    if (s.listings[0].method !== "name" || !s.listings[0].namesChecked) return "name change not stored";
    err(reduce(s, "u_jordan", { type: "list", holdingId: "h1", qty: 1, ask: "35", method: "app" }), "the Wine Club checks names: only a name change works");
    s = ok(reduce(s, "u_jordan", { type: "list", holdingId: "h1", qty: 1, ask: "35" }));
    return s.listings[0].method === "name" || "a single allowed method should be picked automatically";
  });
  t("When the organizer switches to official process only, unpaid matches pause; paid ones can still finish", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "take", listingId: "l2", qty: 1 })); const a = s.requests[0].id;
    s = ok(reduce(s, "u_jordan", { type: "setPolicy", eventId: "e_wabf", policy: "official" }));
    if (rState(R(s, a)).st !== "paused") return "an unpaid reservation should pause";
    err(reduce(s, "u_priya", { type: "markPaid", requestId: a }), "can't pay while paused");
    if (rState(R(s, "r4")).st !== "paid") return "Chris's paid match should continue";
    s = ok(reduce(s, "u_jordan", { type: "confirmPayment", requestId: "r4" })); s = ok(reduce(s, "u_jordan", { type: "markTransferred", requestId: "r4" }));
    s = ok(reduce(s, "u_jordan", { type: "buyerReceived", requestId: "r4", simulate: true }));
    return (rState(R(s, "r4")).st === "completed" && R(s, "r4").receiptSimulated && s.holdings.find(h => h.id === "h14").qty === 0) || "the paid match should finish once";
  });
  t("Honor system: a buyer who confirmed membership can pass the ticket on; the next buyer confirms too", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "take", listingId: "l8", qty: 1, member: true })); const id = s.requests[0].id;
    s = ok(reduce(s, "u_priya", { type: "markPaid", requestId: id })); s = ok(reduce(s, "u_jordan", { type: "confirmPayment", requestId: id }));
    s = ok(reduce(s, "u_jordan", { type: "markTransferred", requestId: id })); s = ok(reduce(s, "u_priya", { type: "buyerReceived", requestId: id }));
    const h = s.holdings.find(x => x.userId === "u_priya" && x.eventId === "e_vets" && x.qty > 0); if (!h || h.tier !== "member") return "Priya should now hold the member-priced ticket";
    s = ok(reduce(s, "u_priya", { type: "list", holdingId: h.id, qty: 1, ask: "100" }));
    return membersOnlyListing(EV.e_vets, s.listings[0]) || "the relisted ticket should stay members-only";
  });
  t("Adding a ticket and listing it (or answering an ISO with it) is all or nothing", () => {
    let s = S(); const before = s.holdings.length;
    const r = reduce(s, "u_priya", { type: "addThen", add: { eventId: "e_wga_ball", tier: "std", qty: 1, paid: "40" }, then: { type: "list", qty: 1, ask: "50", method: "app" } });
    if (!r.error || r.state.holdings.length !== before) return "a failed listing should leave no added ticket";
    s = ok(reduce(s, "u_priya", { type: "addThen", add: { eventId: "e_wga_ball", tier: "std", qty: 1, paid: "40" }, then: { type: "list", qty: 1, ask: "40", method: "app", membersOnly: true } }));
    if (!(s.holdings.length === before + 1 && s.listings[0].membersOnly)) return "the ticket should be added and listed, marked members-only";
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_wga_ball", qty: 1, budget: "40", expires: "2026-11-20" } })); const iso = s.interests[0].id;
    s = ok(reduce(s, "u_jordan", { type: "addThen", add: { eventId: "e_wga_ball", tier: "std", qty: 1, paid: "40" }, then: { type: "isoReply", isoId: iso, qty: 1, method: "app", membersOnly: true } }));
    const rq = s.requests[0].id; if (!s.listings[0].membersOnly) return "an ISO reply can be marked members-only";
    err(reduce(s, "u_priya", { type: "respond", requestId: rq, accept: true }), "accepting a members-only reply without confirming membership");
    return !reduce(s, "u_priya", { type: "respond", requestId: rq, accept: true, member: true }).error || "confirming membership should accept it";
  });
  t("A seller whose tickets all moved on can add a new one; held-for-a-buyer counts never go negative", () => {
    let s = S(); s = ok(reduce(s, "u_jordan", { type: "confirmPayment", requestId: "r4" })); s = ok(reduce(s, "u_jordan", { type: "markTransferred", requestId: "r4" }));
    s = ok(reduce(s, "u_jordan", { type: "buyerReceived", requestId: "r4", simulate: true }));
    ok(reduce(s, "u_jordan", { type: "addHolding", eventId: "e_wabf", tier: "std", qty: 1, paid: "60" }));
    let w = S(); w = ok(reduce(w, "u_jordan", { type: "list", holdingId: "h1", qty: 1, ask: "35" })); const lid = w.listings[0].id;
    w = ok(reduce(w, "u_priya", { type: "take", listingId: lid, qty: 1, member: true })); w = ok(reduce(w, "u_jordan", { type: "withdraw", listingId: lid }));
    return eventSummary(w, EV.e_wine, "u_priya").reservedOthers === 0 || "the viewer's own reservation isn't someone else's hold";
  });
  t("Train tickets: the method is fixed by the ticket, price caps apply, and a listing closes when its train leaves", () => {
    let s = S();
    err(reduce(s, "u_priya", { type: "addHolding", eventId: "e_amtrak", tier: "coach", qty: 1, paid: "95" }), "Amtrak ticket above the coach fare");
    s = ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_amtrak", tier: "coach", qty: 1, paid: "64" })); const ha = s.holdings[s.holdings.length - 1].id;
    const f = { name: "eticket.pdf", size: 1000, hash: "0123456789abcdef" };
    err(reduce(s, "u_priya", { type: "list", holdingId: ha, qty: 1, ask: "70", file: f, departsAt: "2026-11-25T18:00" }), "asking above what was paid");
    err(reduce(s, "u_priya", { type: "list", holdingId: ha, qty: 1, ask: "60", file: f }), "an Amtrak listing without its train's departure");
    err(reduce(s, "u_priya", { type: "list", holdingId: ha, qty: 1, ask: "60", departsAt: "2026-11-25T18:00" }), "an Amtrak eTicket listing without its file");
    err(reduce(s, "u_priya", { type: "list", holdingId: ha, qty: 1, ask: "60", method: "app", file: f, departsAt: "2026-11-25T18:00" }), "an Amtrak eTicket can't be an app transfer");
    s = ok(reduce(s, "u_priya", { type: "list", holdingId: ha, qty: 1, ask: "60", file: f, departsAt: "2026-11-25T18:00" }));
    if (s.listings[0].method !== "file" || s.listings[0].viaOrganizer) return "an Amtrak ticket goes as its eTicket file, never through an organizer";
    s = ok(reduce(s, "u_jordan", { type: "take", listingId: "l12", qty: 1 })); const ia = s.requests[0].id;
    s = adv(s, 37 * 24); // Nov 26: Leah's Nov 25 train has left
    if (listingState(s, L(s, "l12")).label !== "Train departed") return "l12 should close when its train leaves";
    if (!(rState(R(s, ia)).st === "expired" && /train left/.test(rState(R(s, ia)).reason))) return "an unpaid match should expire when the train leaves, is " + rState(R(s, ia)).st;
    s = S(); s = ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_njt", tier: "ow", qty: 1, paid: "21" })); const hn = s.holdings[s.holdings.length - 1].id;
    s = ok(reduce(s, "u_priya", { type: "list", holdingId: hn, qty: 1, ask: "21" }));
    if (s.listings[0].method !== "inperson") return "a paper ticket is handed over in person";
    s = ok(reduce(s, "u_jordan", { type: "take", listingId: "l10", qty: 1 })); const id = s.requests[0].id;
    s = adv(s, 30 * 24); // Nov 19: past the ticket's Nov 18 expiry
    return (access(EV.e_njt).kind === "closed" && rState(R(s, id)).st === "expired") || `after expiry: ${access(EV.e_njt).kind} / ${rState(R(s, id)).st}`;
  });
  t("Amtrak listings stay open through the travel week, then close; ISOs respect per-person limits", () => {
    let s = S(); s = adv(s, 35 * 24); // Nov 24, after the first Thanksgiving train
    if (!access(EV.e_amtrak).ok || listingNumbers(s, L(s, "l12")).available !== 1) return "Amtrak should still be open on Nov 24 (Leah's train leaves Nov 25)";
    s = adv(s, 6 * 24); // Nov 30
    if (access(EV.e_amtrak).kind !== "closed") return "Amtrak should close after the travel week, is " + access(EV.e_amtrak).kind;
    s = S();
    err(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_njt", qty: 3, budget: "21", expires: "2026-11-10" } }), "an ISO above the 2-per-person limit");
    ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_njt", qty: 2, budget: "21", expires: "2026-11-10" } }));
    return true;
  });
  t("A member buying a member-priced ticket ends up holding it at the price they paid", () => {
    let s = S(); s = ok(reduce(s, "o_dana", { type: "take", listingId: "l8", qty: 1, member: true })); const id = s.requests[0].id;
    if (R(s, id).topUp) return "no top-up should be recorded";
    s = ok(reduce(s, "o_dana", { type: "markPaid", requestId: id })); s = ok(reduce(s, "u_jordan", { type: "confirmPayment", requestId: id }));
    s = ok(reduce(s, "u_jordan", { type: "markTransferred", requestId: id })); s = ok(reduce(s, "u_jordan", { type: "buyerReceived", requestId: id, simulate: true }));
    const h = s.holdings.find(x => x.userId === "o_dana" && x.eventId === "e_vets" && x.source === "transferred (simulated)"); return (h && h.tier === "member" && h.paid === 100) || JSON.stringify(h);
  });
  t("A transferred ticket never merges into a self-reported holding", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_vets", tier: "early", qty: 1, paid: "120" }));
    s = ok(reduce(s, "u_priya", { type: "take", listingId: "l4", qty: 1 })); const id = s.requests[0].id;
    s = ok(reduce(s, "u_priya", { type: "markPaid", requestId: id })); s = ok(reduce(s, "o_chris", { type: "confirmPayment", requestId: id }));
    s = ok(reduce(s, "o_chris", { type: "markTransferred", requestId: id })); s = ok(reduce(s, "u_priya", { type: "buyerReceived", requestId: id }));
    const hs = s.holdings.filter(h => h.userId === "u_priya" && h.eventId === "e_vets");
    return (hs.length === 2 && hs.some(h => h.source === "self-reported" && h.qty === 1) && hs.some(h => h.source === "transferred (simulated)" && h.qty === 1 && h.paid === 110)) || JSON.stringify(hs);
  });
  t("Cancelling a reservation puts it back on sale; an unanswered offer expires; an expired reservation stays expired after rewinding the clock", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "take", listingId: "l2", qty: 1 })); const id = s.requests[0].id;
    s = ok(reduce(s, "u_priya", { type: "cancel", requestId: id })); if (listingNumbers(s, L(s, "l2")).available !== 2) return "not released";
    s = S(); s = adv(s, 6); if (rState(R(s, "r1")).st !== "expired") return "Sam's offer should expire after 6 hours";
    s = S(); s = ok(reduce(s, "u_priya", { type: "take", listingId: "l2", qty: 1 })); const id2 = s.requests[0].id; s = adv(s, 3);
    s = ok(reduce(s, "u_jordan", { type: "clock", reset: true }));
    return (R(s, id2).status === "expired" && listingNumbers(s, L(s, "l2")).available === 2) || "reservation revived";
  });
  t("When an organizer switches to official process only, offers pause and nothing new can be reserved, listed or posted", () => {
    let s = S(); s = ok(reduce(s, "u_jordan", { type: "setPolicy", eventId: "e_vets", policy: "official" }));
    if (rState(R(s, "r1")).st !== "paused") return "pending request should pause";
    err(reduce(s, "u_jordan", { type: "accept", requestId: "r1" })); err(reduce(s, "u_priya", { type: "take", listingId: "l4", qty: 1 }));
    err(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_vets", qty: 1, budget: "100", expires: "2026-11-02" } }), "an ISO on an official-process event");
    return !rowsOnExplore(s, "u_priya").includes("e_vets") || "an official-process event should leave the Tickets list";
  });
  t("Closed transfer window blocks new activity, and closed events leave the Tickets list (still found by search)", () => {
    const s = S(); err(reduce(s, "u_priya", { type: "take", listingId: "l7", qty: 1 }));
    if (eventSummary(s, EV.e_sixers).state.key !== "closed") return "should show closed";
    if (rowsOnExplore(s, "u_priya").includes("e_sixers")) return "a closed event should be hidden from the Tickets list";
    return rowsOnExplore(s, "u_priya", { q: "76ers" }).includes("e_sixers") || "searching for it by name should still find it";
  });
  t("Trip totals agree: $1,700 paid, $1,650 asked, $1,200 left, $50 fee, $2,900 total", () => { S(); const ev = EV.e_euro; return (paidToDate(ev) === 1700 && remaining(ev) === 1200 && commitment(ev, 1650) === 2900) || `${paidToDate(ev)} / ${remaining(ev)} / ${commitment(ev, 1650)}`; });
  t("Expired demand isn't alerted; ineligible demand isn't alerted", () => {
    const s = S(); const fake = { id: "x", eventId: "e_wine", sellerId: "u_jordan", listed: 1, ask: 35, tier: "std" };
    const ids = matchRecipients(s, fake).map(m => m.interest.userId);
    return (ids.includes("o_sam") && !ids.includes("o_alex")) || "recipients: " + ids.join(",");
  });
  t("Unlisted-event ISO creates no event and waits for review", () => { const before = EVENTS.length; let s = S(); s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { qty: 1, expires: "2026-11-30", missing: { title: "Spring formal", flexible: true } } })); return (EVENTS.length === before && s.interests[0].review === "reviewing" && !s.interests[0].eventId) || "unexpected"; });
  t("One public request and one private alert per person per event, each updated rather than duplicated", () => {
    let s = S(); const mine = (st, kind) => st.interests.filter(i => i.userId === "u_priya" && i.eventId === "e_wine" && i.kind === kind && i.status === "open");
    s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_wga_ball" }), "an alert beside Priya's WGA request");
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_wine", qty: 1, budget: "35", expires: "2026-11-10" } })); s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_wine", qty: 2, budget: "35", expires: "2026-11-10" } }));
    s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_wine" })); s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_wine", qty: 2 }));
    const iso = mine(s, "iso"), al = mine(s, "alert");
    return (iso.length === 1 && iso[0].qty === 2 && al.length === 1 && al[0].qty === 2) || `requests ${iso.length}, alerts ${al.length}`;
  });
  t("Sale-attempt record is fixed at listing time", () => { let s = S(); s = ok(reduce(s, "u_jordan", { type: "list", holdingId: "h1", qty: 1, ask: "35" })); const id = s.listings[0].id; const t0 = L(s, id).record.listedAt; s = adv(s, 30); s = ok(reduce(s, "u_jordan", { type: "withdraw", listingId: id })); return (L(s, id).record.listedAt === t0 && L(s, id).record.meets24) || "record changed"; });
  t("Per-person limits count holdings plus open requests", () => { const s = S(); err(reduce(s, "u_priya", { type: "addHolding", eventId: "e_wine_fg", tier: "std", qty: 1, paid: "10" }), "Priya already has a reservation for the 1-per-person social"); return true; });
  t("A trip spot can't be re-listed above what the new holder reimbursed", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "request", listingId: "l9", qty: 1, confirmEligible: true })); const id = s.requests[0].id;
    s = ok(reduce(s, "u_jordan", { type: "accept", requestId: id })); s = ok(reduce(s, "u_jordan", { type: "sellerReport", requestId: id }));
    s = ok(reduce(s, "reviewer", { type: "orgApprove", requestId: id })); s = ok(reduce(s, "reviewer", { type: "orgConfirm", requestId: id }));
    const h = s.holdings.find(x => x.userId === "u_priya" && x.eventId === "e_euro"); if (!h || askCap(EV.e_euro, h) !== 1650) return "cap " + (h && askCap(EV.e_euro, h));
    err(reduce(s, "u_priya", { type: "list", holdingId: h.id, qty: 1, ask: "1700" })); ok(reduce(s, "u_priya", { type: "list", holdingId: h.id, qty: 1, ask: "1650" })); return true;
  });
  t("Withdrawing a listing also declines paused requests", () => {
    let s = S(); s = ok(reduce(s, "u_jordan", { type: "setPolicy", eventId: "e_vets", policy: "official" })); s = ok(reduce(s, "u_jordan", { type: "withdraw", listingId: "l8" }));
    s = ok(reduce(s, "u_jordan", { type: "setPolicy", eventId: "e_vets", policy: "approval" })); return rState(R(s, "r1")).st === "declined" || "r1 is " + rState(R(s, "r1")).st;
  });
  t("Events not on sale can't be self-reported or listed", () => { const s = S(); err(reduce(s, "u_priya", { type: "addHolding", eventId: "e_follies", tier: "ga", qty: 1, paid: "28" })); return eventSummary(s, EV.e_follies, "u_priya").state.key === "notonsale" || "state should be notonsale"; });
  t("Trip total stays right after a payment comes due", () => { let s = S(); s = adv(s, 42 * 24); const l = L(s, "l9"); return commitment(EV.e_euro, l.ask, l.paid) === 2900 || "got " + commitment(EV.e_euro, l.ask, l.paid); });
  t("Cards count every listed ticket; who can take it shows on the listing, and the reducer still enforces it", () => {
    const s = S(); const sum = eventSummary(s, EV.e_pevc, "u_priya");
    if (!(sum.state.key === "available" && sum.best)) return JSON.stringify(sum.state);
    return /Confirm you're a member/.test(reduce(s, "u_priya", { type: "take", listingId: "l5", qty: 1 }).error || "") || "a PE/VC member ticket should ask the buyer to confirm membership";
  });
  t("ISO budgets include the non-member top-up", () => { const s = S(); const i = { userId: "u_priya", eventId: "e_vets", qty: 1, budget: 105, status: "open", expires: null }; return isoMatches(s, i).every(l => { const tu = canAcquire("u_priya", EV.e_vets, l).topUp || 0; return l.ask + tu <= 105 || (l.obo && 105 - tu >= (l.minOffer || 0)); }) || "over-budget match"; });
  t("An ISO or alert never reserves a spot or creates a request", () => {
    let s = S(); const before = { reqs: s.requests.length, nb: JSON.stringify(s.listings.map(l => listingNumbers(s, l))) };
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_euro", qty: 1, budget: "1650", expires: "2026-11-25" } }));
    s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_wabf" }));
    if (s.requests.length !== before.reqs) return "a request was created";
    if (JSON.stringify(s.listings.map(l => listingNumbers(s, l))) !== before.nb) return "listing counts changed";
    return isoMatches(s, s.interests.find(i => i.userId === "u_priya" && i.eventId === "e_euro")).length === 1 || "the Euro Ski listing should show as a possible match, not a reservation";
  });
  t("Suggesting an event creates no event, listing or request; bad links are refused", () => {
    const before = EVENTS.length; let s = S(); const n0 = [s.listings.length, s.requests.length, s.interests.length];
    err(reduce(s, "u_jordan", { type: "suggestEvent", data: { title: "Spring formal", flexible: true, sourceUrl: "javascript:alert(1)" } }), "javascript: link accepted");
    err(reduce(s, "u_jordan", { type: "suggestEvent", data: { title: "Spring formal" } }), "missing date accepted");
    s = ok(reduce(s, "u_jordan", { type: "suggestEvent", data: { title: "Spring formal", flexible: true, sourceUrl: "https://example.edu/events/1" } }));
    const g = s.suggestions[0];
    if (EVENTS.length !== before || s.listings.length !== n0[0] || s.requests.length !== n0[1] || s.interests.length !== n0[2]) return "something besides a review item was created";
    s = ok(reduce(s, "reviewer", { type: "reviewMissing", id: g.id, outcome: "duplicate" }));
    return (g.review === "reviewing" && g.sourceUrl === "https://example.edu/events/1" && s.suggestions[0].review === "duplicate") || JSON.stringify(s.suggestions[0]);
  });
  t("Share links never point others at items that exist only in this browser", () => {
    let s = S();
    if (shareText({ type: "listing", id: "l9" }, s, SEED_IDS).local || shareText({ type: "iso", id: "iso-nia1" }, s, SEED_IDS).hash !== "iso-nia1") return "seeded items should link directly";
    s = ok(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "60" })); const lt = shareText({ type: "listing", id: s.listings[0].id }, s, SEED_IDS);
    if (!lt.local || lt.hash !== "e_wabf" || !/others can't see it/.test(lt.text)) return "new listing share: " + JSON.stringify(lt);
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { qty: 1, expires: "2026-11-30", missing: { title: "Spring formal", flexible: true } } }));
    const it = shareText({ type: "iso", id: s.interests[0].id }, s, SEED_IDS);
    if (!(it.local && it.hash === null && /only in my browser/.test(it.text))) return "new ISO share: " + JSON.stringify(it);
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_wga_ball", qty: 2, budget: "40", expires: "2026-11-30" } })); // edits seeded iso-p1
    const ed = shareText({ type: "iso", id: "iso-p1" }, s, SEED_IDS); if (!ed.local || ed.hash !== "e_wga_ball") return "edited seeded ISO share: " + JSON.stringify(ed);
    s = ok(reduce(s, "u_jordan", { type: "list", holdingId: "h1", qty: 1, ask: "35" }));
    const evs = shareText({ type: "event", id: "e_wine" }, s, SEED_IDS);
    return !/available from|\d+ (tickets?|spots?|add-ons?) (available|listed)/.test(evs.text) || "event share quotes browser-local availability: " + evs.text;
  });
  /* ---------- OBO offers ---------- */
  t("OBO: offers on student tickets use “Make offer”; trek requests can still carry an offer", () => {
    const s = S();
    err(reduce(s, "u_priya", { type: "offer", listingId: "l12", qty: 1, amount: "60" }), "an offer equal to the ask isn't an offer");
    err(reduce(s, "u_priya", { type: "offer", listingId: "l12", qty: 1, amount: "0" }), "zero offer");
    err(reduce(s, "u_priya", { type: "offer", listingId: "l10", qty: 1, amount: "15" }), "the listing doesn't take offers");
    err(reduce(s, "u_priya", { type: "request", listingId: "l13", qty: 1, offer: "1100" }), "below the seller's lowest offer");
    const s2 = ok(reduce(s, "u_priya", { type: "request", listingId: "l13", qty: 1, offer: "1250" }));
    const r = s2.requests[0]; return (r.isOffer && r.price === 1250) || "trek offer not recorded";
  });
  t("OBO: an accepted offer is what the buyer is recorded as paying", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "offer", listingId: "l12", qty: 1, amount: "45" })); const id = s.requests[0].id;
    s = ok(reduce(s, "o_leah", { type: "accept", requestId: id })); s = ok(reduce(s, "u_priya", { type: "markPaid", requestId: id }));
    s = ok(reduce(s, "o_leah", { type: "confirmPayment", requestId: id })); s = ok(reduce(s, "u_priya", { type: "buyerReceived", requestId: id }));
    const h = s.holdings.find(x => x.userId === "u_priya" && x.eventId === "e_amtrak"); return (h && h.paid === 45) || "buyer's holding should show $45 paid, got " + (h ? h.paid : "none");
  });
  t("OBO: trips never take offers, and the lowest offer must be below the ask", () => {
    const s = S();
    const r = reduce(s, "u_priya", { type: "request", listingId: "l9", qty: 1, confirmEligible: true, offer: "1500" }); if (!r.error) return "a trip accepted an offer";
    const s2 = ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_wine", tier: "std", qty: 1, paid: "35" })); const h = s2.holdings[s2.holdings.length - 1];
    err(reduce(s2, "u_priya", { type: "list", holdingId: h.id, qty: 1, ask: "30", obo: true, minOffer: "30" }), "lowest offer equal to the ask");
    const s3 = ok(reduce(s2, "u_priya", { type: "list", holdingId: h.id, qty: 1, ask: "30", obo: true, minOffer: "20" }));
    const l = s3.listings[0]; return (l.obo && l.minOffer === 20) || "OBO listing not saved: " + JSON.stringify({ obo: l.obo, minOffer: l.minOffer });
  });
  t("OBO: an ISO budget below the ask fits an OBO listing at or above its lowest offer", () => {
    const s = S(); const iso = b => ({ userId: "u_priya", eventId: "e_colombia", qty: 1, budget: b, status: "open", expires: null });
    if (!isoFits(s, iso(1250), L(s, "l13"))) return "budget $1,250 should fit an OBO listing with offers from $1,200";
    if (isoFits(s, iso(1100), L(s, "l13"))) return "budget $1,100 is below the lowest offer";
    if (isoFits(s, { ...iso(15), eventId: "e_njt" }, L(s, "l10"))) return "a non-OBO listing above budget shouldn't fit";
    return true;
  });
  t("An add-on isn't a trek spot: ISOs, alerts and \"from\" prices skip it", () => {
    const s = S(); const iso = s.interests.find(i => i.id === "iso-sam2");
    const ids = isoMatches(s, iso).map(l => l.id);
    if (ids.includes("l14") || !ids.includes("l13")) return "Sam's trek ISO should match the standard spot only: " + ids.join(",");
    if (matchRecipients(s, L(s, "l14")).length) return "an add-on listing alerted trek ISOs";
    const sum = eventSummary(s, EV.e_colombia, "u_priya");
    return (sum.best && sum.best.l.id === "l13") || "\"from\" price should quote the standard spot, got " + (sum.best && sum.best.l.id);
  });
  t("Colombia trek: the operator step is always on, whatever the seller picks", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_colombia", tier: "std", qty: 1, paid: "1390" })); const h = s.holdings[s.holdings.length - 1];
    s = ok(reduce(s, "u_priya", { type: "list", holdingId: h.id, qty: 1, ask: "1390", viaOrganizer: false }));
    return s.listings[0].viaOrganizer === true || "listing should go through the operator";
  });
  /* ---------- Goods ---------- */
  const G = (s, id) => s.goods.find(x => x.id === id);
  const GR = (s, id) => s.goodsReqs.find(x => x.id === id);
  const dtLocal = ms => { const p = nyParts(ms); return isoDate(ms) + "T" + String(p.hour).padStart(2, "0") + ":" + String(p.minute).padStart(2, "0"); }; // the datetime-local format the pickup field sends, in New York time like every wall time
  t("Goods: an offer reserves the item once accepted; pickup sells it and closes the rest", () => {
    let s = S();
    err(reduce(s, "u_priya", { type: "requestItem", id: "g6", offer: "50" }), "offer above the ask");
    err(reduce(s, "u_priya", { type: "requestItem", id: "g2", offer: "50" }), "g2 doesn't take offers");
    err(reduce(s, "u_jordan", { type: "requestItem", id: "g6" }), "own item");
    s = ok(reduce(s, "u_priya", { type: "requestItem", id: "g6", offer: "40" })); const pid = s.goodsReqs[0].id;
    err(reduce(s, "u_priya", { type: "requestItem", id: "g6" }), "duplicate request");
    s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: pid }));
    if (itemState(s, G(s, "g6")).key !== "reserved") return "item should be reserved";
    err(reduce(s, "u_jordan", { type: "acceptItemReq", id: "gr1" }), "a second acceptance while reserved");
    err(reduce(s, "u_jordan", { type: "withdrawItem", id: "g6" }), "withdraw while reserved");
    err(reduce(s, "u_jordan", { type: "itemPickedUp", id: pid }), "only the buyer confirms pickup");
    s = ok(reduce(s, "u_priya", { type: "itemPickedUp", id: pid }));
    if (!G(s, "g6").soldAt || GR(s, pid).status !== "completed" || GR(s, pid).price !== 40) return "not sold at $40";
    if (GR(s, "gr1").status !== "declined") return "Leah's offer should close, is " + GR(s, "gr1").status;
    if (s.interests.find(i => i.id === "iso-gp1").status !== "closed") return "Priya's office-chair ISO should close after she buys one";
    err(reduce(s, "o_sam", { type: "requestItem", id: "g6" }), "sold item");
    return true;
  });
  t("Goods: a fictional buyer's pickup can be simulated by the seller, and is labeled", () => {
    let s = S(); s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: "gr1" }));
    err(reduce(s, "u_jordan", { type: "itemPickedUp", id: "gr1" }), "seller can't confirm without simulate");
    s = ok(reduce(s, "u_jordan", { type: "itemPickedUp", id: "gr1", simulate: true }));
    const g = GR(s, "gr1"); return (g.status === "completed" && g.receiptSimulated && G(s, "g6").history.some(x => /simulated/.test(x.text))) || "simulated pickup not labeled";
  });
  t("Alerts: in the app always; email or text only when opted in (simulated), and only for the demo accounts", () => {
    const s = ok(reduce(S(), "u_priya", { type: "setAlertPrefs", email: true }));
    if (JSON.stringify(alertVia(s, "u_priya")) !== '["email"]') return "Priya's email opt-in wasn't saved";
    let s3 = ok(reduce(S(), "u_priya", { type: "setAlertPrefs", text: true })); s3 = ok(reduce(s3, "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" })); s3 = ok(reduce(s3, "o_nia", { type: "counter", requestId: s3.requests[0].id, amount: "42" }));
    const n = s3.notifications.find(x => x.userId === "u_priya" && /countered your offer/.test(x.text));
    if (!(n && JSON.stringify(n.via) === '["text"]')) return "the counter alert should note it was also texted: " + JSON.stringify(n);
    const n0 = ok(reduce(S(), "u_priya", { type: "offer", listingId: "l17", qty: 1, amount: "38" }));
    const plain = ok(reduce(n0, "o_nia", { type: "counter", requestId: n0.requests[0].id, amount: "42" })).notifications.find(x => x.userId === "u_priya" && /countered/.test(x.text));
    if (!plain || plain.via) return "without an opt-in, alerts stay in the app only";
    return !!reduce(S(), "o_nia", { type: "setAlertPrefs", email: true }).error || "made-up accounts don't get alerts";
  });
  t("Goods photos: up to 4 small images, the first is the cover; anything else is refused", () => {
    const s = S(); const until = isoDate(CLOCK + 10 * DAY); const px = "data:image/png;base64,iVBORw0KGgo=";
    const post = photos => reduce(s, "u_jordan", { type: "postItem", data: { title: "Desk lamp", cat: "Home & kitchen", price: "10", cond: "Good", area: "Rittenhouse", until, photos } });
    const two = ok(post([px, px + "AA"])); const it = two.goods.find(g => g.title === "Desk lamp");
    if (!(it && it.photos.length === 2 && photosOf(it)[0] === px)) return "two photos should be stored, the first as the cover";
    err(post([px, px, px, px, px]), "five photos");
    err(post(["javascript:alert(1)"]), "a non-image photo");
    return photosOf({ photo: px }).length === 1 || "an older single photo should still show";
  });
  t("Goods: a new item alerts matching goods ISOs only (category, similar name, budget or OBO)", () => {
    const s = S(); const until = isoDate(CLOCK + 10 * DAY);
    const post = d => reduce(s, "u_jordan", { type: "postItem", data: { cond: "Good", area: "Rittenhouse", until, ...d } });
    const alerted = r => ok(r).notifications.some(x => x.userId === "u_priya" && /Possible match/.test(x.text));
    if (!alerted(post({ title: "Mesh office chair", cat: "Furniture", price: "40" }))) return "matching chair didn't alert Priya";
    if (alerted(post({ title: "Desk lamp", cat: "Home & kitchen", price: "10" }))) return "a lamp alerted an office-chair ISO";
    if (alerted(post({ title: "Leather office chair", cat: "Furniture", price: "80" }))) return "an $80 fixed-price chair is over Priya's $50 budget";
    if (!alerted(post({ title: "Leather office chair", cat: "Furniture", price: "80", obo: true }))) return "an OBO chair should alert (Priya can offer within budget)";
    if (alerted(post({ title: "Leather office chair", cat: "Furniture", price: "80", obo: true, minOffer: "60" }))) return "offers from $60 are over budget";
    return true;
  });
  t("Goods: posts are validated (price, lowest offer, area, pickup date)", () => {
    const s = S(); const base = { title: "Desk", cat: "Furniture", cond: "Good", price: "20", area: "Fairmount", until: isoDate(CLOCK + 5 * DAY) };
    err(reduce(s, "u_priya", { type: "postItem", data: { ...base, price: "-1" } }));
    err(reduce(s, "u_priya", { type: "postItem", data: { ...base, cat: "Cars" } }));
    err(reduce(s, "u_priya", { type: "postItem", data: { ...base, area: " " } }));
    err(reduce(s, "u_priya", { type: "postItem", data: { ...base, until: isoDate(CLOCK - DAY) } }));
    err(reduce(s, "u_priya", { type: "postItem", data: { ...base, obo: true, minOffer: "25" } }));
    ok(reduce(s, "u_priya", { type: "postItem", data: { ...base, price: "0" } }));
    return true;
  });
  t("Goods: a request on a held item waits as a backup, then gets a fresh 48 hours when the hold falls through", () => {
    let s = S(); s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: "gr1" }));
    s = ok(reduce(s, "u_jordan", { type: "setPickup", id: "gr1", at: dtLocal(CLOCK + 5 * DAY) })); // keeps the hold for about six days
    s = ok(reduce(s, "u_priya", { type: "requestItem", id: "g6" })); const pid = s.goodsReqs[0].id;
    if (GR(s, pid).status !== "waiting") return "request on a reserved item should be a backup, is " + GR(s, pid).status;
    s = adv(s, 72);
    if (gState(GR(s, pid), G(s, "g6")).st !== "waiting") return "a backup shouldn't expire on the seller-response clock";
    s = ok(reduce(s, "u_jordan", { type: "releaseItemReq", id: "gr1" }));
    if (GR(s, pid).status !== "pending" || !GR(s, pid).restoredAt) return "backup should be active again after the release";
    if (!s.notifications.some(x => x.userId === "u_priya" && /available again/.test(x.text))) return "Priya wasn't told";
    s = adv(s, 47); if (gState(GR(s, pid), G(s, "g6")).st !== "pending") return "restored request should get a fresh 48 hours";
    s = adv(s, 2); return gState(GR(s, pid), G(s, "g6")).st === "expired" || "restored request should expire 48 hours after it became active";
  });
  t("Goods: accepting one request puts the others on hold; cancelling the reservation brings them back", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "requestItem", id: "g6" })); const pid = s.goodsReqs[0].id;
    s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: pid }));
    if (GR(s, "gr1").status !== "waiting") return "Leah's offer should wait as a backup, is " + GR(s, "gr1").status;
    err(reduce(s, "u_jordan", { type: "acceptItemReq", id: "gr1" }), "a backup can't be accepted");
    s = ok(reduce(s, "u_priya", { type: "cancelItemReq", id: pid }));
    return (GR(s, "gr1").status === "pending" && itemState(s, G(s, "g6")).key === "available") || "Leah's offer should be active again";
  });
  t("Add-ons don't count toward the per-person limit, don't close a trek ISO, and aren't quoted as face value", () => {
    if (faceMin(EV.e_colombia) !== 1240) return "face value should start at the early-bird $1,240, got " + faceMin(EV.e_colombia);
    let s = S(); s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_colombia", qty: 1, budget: "1390", expires: "2026-10-22" } })); const iso = s.interests[0].id;
    s = ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_colombia", tier: "std", qty: 2, paid: "1390" }));
    s = ok(reduce(s, "u_priya", { type: "request", listingId: "l14", qty: 1 }), "an add-on shouldn't hit the 2-per-person limit"); const rid = s.requests[0].id;
    s = ok(reduce(s, "o_chris", { type: "accept", requestId: rid })); s = ok(reduce(s, "o_chris", { type: "sellerReport", requestId: rid })); s = ok(reduce(s, "reviewer", { type: "orgConfirm", requestId: rid }));
    if (R(s, rid).status !== "completed") return "add-on transfer didn't complete";
    return s.interests.find(i => i.id === iso).status === "open" || "buying an add-on closed the trek ISO";
  });
  t("Goods: unanswered requests expire after 48 hours; a hold ends with no pickup time, a day after it, or at the pickup-by date", () => {
    let s = S(); s = adv(s, 49);
    if (gState(GR(s, "gr1"), G(s, "g6")).st !== "expired") return "unanswered offer should expire";
    s = S(); s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: "gr1" })); s = adv(s, 49);
    let e = gState(GR(s, "gr1"), G(s, "g6"));
    if (e.st !== "expired" || !/No pickup time/.test(e.reason)) return "hold should end when no pickup time is agreed: " + e.st;
    if (itemState(s, G(s, "g6")).key !== "available") return "item should be available again";
    s = S(); s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: "gr1" }));
    err(reduce(s, "u_priya", { type: "setPickup", id: "gr1", at: dtLocal(CLOCK + DAY) }), "someone else set the pickup time");
    err(reduce(s, "u_jordan", { type: "setPickup", id: "gr1", at: dtLocal(CLOCK - HOUR) }), "pickup time in the past");
    err(reduce(s, "u_jordan", { type: "setPickup", id: "gr1", at: "2026-11-09T10:00" }), "pickup after the pickup-by date");
    s = ok(reduce(s, "u_jordan", { type: "setPickup", id: "gr1", at: dtLocal(CLOCK + 4 * DAY) }));
    s = adv(s, 4 * 24 + 23); if (gState(GR(s, "gr1"), G(s, "g6")).st !== "accepted") return "hold should last until a day after the pickup time";
    s = adv(s, 2); e = gState(GR(s, "gr1"), G(s, "g6"));
    if (e.st !== "expired" || !/agreed pickup time passed/.test(e.reason)) return "hold should end a day after the pickup time: " + e.reason;
    s = S(); s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: "gr1" })); s = ok(reduce(s, "u_jordan", { type: "setPickup", id: "gr1", at: "2026-11-08T18:00" })); s = adv(s, 20 * 24);
    e = gState(GR(s, "gr1"), G(s, "g6"));
    if (e.st !== "expired" || !/pickup window/i.test(e.reason)) return "hold should end with the pickup window: " + e.reason;
    return itemState(s, G(s, "g6")).key === "closed" || "item should be closed";
  });
  t("Goods: when a hold ends without pickup, backups become active again", () => {
    let s = S(); s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: "gr1" }));
    s = ok(reduce(s, "u_priya", { type: "requestItem", id: "g6" })); const pid = s.goodsReqs[0].id;
    s = adv(s, 49);
    return (GR(s, pid).status === "pending" && !!GR(s, pid).restoredAt && s.notifications.some(x => x.userId === "u_priya" && /available again/.test(x.text))) || "backup should be active again, is " + GR(s, pid).status;
  });
  t("A made-up counterpart's steps can be simulated only from the other side, and are labeled", () => {
    let s = S(); // r2: Priya reserved Alex's ticket (Alex is a fictional account)
    s = ok(reduce(s, "u_priya", { type: "markPaid", requestId: "r2" }));
    err(reduce(s, "u_jordan", { type: "confirmPayment", requestId: "r2", simulate: true }), "someone other than the buyer simulated the seller");
    s = ok(reduce(s, "u_priya", { type: "confirmPayment", requestId: "r2", simulate: true }));
    s = ok(reduce(s, "u_priya", { type: "markTransferred", requestId: "r2", simulate: true }));
    if (!(R(s, "r2").confirmSimulated && R(s, "r2").sendSimulated && R(s, "r2").history.some(h => /Simulated: Alex/.test(h.text)))) return "simulated steps not labeled";
    s = ok(reduce(s, "u_priya", { type: "buyerReceived", requestId: "r2" })); if (R(s, "r2").status !== "completed") return "didn't complete";
    let s2 = S(); // r4: Chris (fictional) paid Jordan
    s2 = ok(reduce(s2, "u_jordan", { type: "confirmPayment", requestId: "r4" })); s2 = ok(reduce(s2, "u_jordan", { type: "markTransferred", requestId: "r4" }));
    err(reduce(s2, "u_priya", { type: "buyerReceived", requestId: "r4", simulate: true }), "only the seller can simulate a made-up buyer");
    s2 = ok(reduce(s2, "u_jordan", { type: "buyerReceived", requestId: "r4", simulate: true }));
    if (!(R(s2, "r4").receiptSimulated && L(s2, "l11").history.some(x => /simulated/.test(x.text)))) return "simulated receipt not labeled";
    let s3 = S(); s3 = ok(reduce(s3, "u_jordan", { type: "addHolding", eventId: "e_concert", tier: "ga", qty: 1, paid: "55" })); s3 = ok(reduce(s3, "u_jordan", { type: "list", holdingId: s3.holdings[s3.holdings.length - 1].id, qty: 1, ask: "55", method: "app" }));
    s3 = ok(reduce(s3, "u_priya", { type: "take", listingId: s3.listings[0].id, qty: 1 })); const i3 = s3.requests[0].id; s3 = ok(reduce(s3, "u_priya", { type: "markPaid", requestId: i3 })); // Jordan is a demo account
    err(reduce(s3, "u_priya", { type: "confirmPayment", requestId: i3, simulate: true }), "a demo seller's step can't be simulated");
    s3 = S(); s3 = ok(reduce(s3, "u_priya", { type: "requestItem", id: "g1" })); const gid = s3.goodsReqs[0].id;
    s3 = ok(reduce(s3, "u_priya", { type: "acceptItemReq", id: gid, simulate: true }));
    return (GR(s3, gid).status === "accepted" && GR(s3, gid).acceptSimulated) || "simulated goods acceptance failed";
  });
  t("Reserving shares both contacts, so the seller can transfer it to the buyer's email", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "take", listingId: "l2", qty: 1 })); const id = s.requests[0].id;
    return (R(s, id).consent.buyer && R(s, id).consent.seller) || "contacts should be shared on reservation";
  });
  t("\"There's a problem\": the two people, from the reservation until the event ends; upheld reports give strikes, and two pause trading", () => {
    let s = S();
    err(reduce(s, "u_jordan", { type: "reportProblem", kind: "ticket", id: "r1", reason: "The buyer hasn't paid" }), "report on an open offer");
    err(reduce(s, "u_priya", { type: "reportProblem", kind: "ticket", id: "r4", reason: "The buyer hasn't paid" }), "an outsider reported a problem");
    err(reduce(s, "u_jordan", { type: "reportProblem", kind: "ticket", id: "r4", reason: "Turned away at the door" }), "a seller picked a buyer's reason");
    s = ok(reduce(s, "o_chris", { type: "reportProblem", kind: "ticket", id: "r4", reason: "Turned away at the door" }));
    err(reduce(s, "o_chris", { type: "reportProblem", kind: "ticket", id: "r4", reason: "Something else" }), "a second open report");
    if (rStatus(R(s, "r4"), rState(R(s, "r4"))).label !== "Disputed") return "an open report should show as Disputed";
    s = ok(reduce(s, "reviewer", { type: "reviewProblem", kind: "ticket", id: "r4", outcome: "uphold" }));
    if (strikesOf(s, "u_jordan") !== 1) return "an upheld report should give the seller a strike";
    s = ok(reduce(s, "o_dana", { type: "take", listingId: "l8", qty: 1, member: true })); const id = s.requests[0].id; // Dana is a Vets member
    s = ok(reduce(s, "o_dana", { type: "reportProblem", kind: "ticket", id, reason: "The seller hasn't sent it" }));
    s = ok(reduce(s, "reviewer", { type: "reviewProblem", kind: "ticket", id, outcome: "uphold" }));
    if (!tradingPaused(s, "u_jordan")) return "two strikes should pause trading";
    err(reduce(s, "u_jordan", { type: "list", holdingId: "h1", qty: 1, ask: "35" }), "a paused account listed a ticket");
    err(reduce(s, "u_jordan", { type: "take", listingId: "l2", qty: 1 }), "a paused account reserved a ticket");
    let s2 = S(); s2 = ok(reduce(s2, "u_priya", { type: "take", listingId: "l2", qty: 1 })); const id2 = s2.requests[0].id;
    s2 = ok(reduce(s2, "u_priya", { type: "reportProblem", kind: "ticket", id: id2, reason: "Something else" }));
    s2 = ok(reduce(s2, "reviewer", { type: "reviewProblem", kind: "ticket", id: id2, outcome: "dismiss" }));
    if (strikesOf(s2, "o_sam") !== 0 || R(s2, id2).problem.review !== "dismissed") return "a dismissed report gives no strike";
    let s3 = S(); s3 = adv(s3, 19 * 24); // Nov 8: the forum ended Nov 7
    err(reduce(s3, "o_chris", { type: "reportProblem", kind: "ticket", id: "r4", reason: "Something else" }), "reports close when the event ends");
    let s4 = S(); s4 = ok(reduce(s4, "u_jordan", { type: "acceptItemReq", id: "gr1" }));
    s4 = ok(reduce(s4, "u_jordan", { type: "reportProblem", kind: "goods", id: "gr1", reason: "The buyer didn't show up or pay" }));
    return !!GR(s4, "gr1").problem || "goods report failed";
  });
  t("Accepting an offer keeps the one-unpaid-reservation rule, and a paused seller's listings can't be reserved", () => {
    let s = S(); // r1: Sam's open $90 offer on Jordan's Vets ticket
    s = ok(reduce(s, "o_sam", { type: "take", listingId: "l4", qty: 1 })); // Sam also reserves Chris's Vets ticket, unpaid
    err(reduce(s, "u_jordan", { type: "accept", requestId: "r1" }), "accepting an offer from a buyer who already has an unpaid reservation for the event");
    let s2 = S(); s2.strikes = { u_jordan: RULES.strikesToPause };
    const t1 = reduce(s2, "u_priya", { type: "take", listingId: "l8", qty: 1 }); if (!/can't trade/.test(t1.error || "")) return "reserving from a paused seller: " + (t1.error || "allowed");
    err(reduce(s2, "u_jordan", { type: "accept", requestId: "r1" }), "a paused seller accepting an offer");
    err(reduce(s2, "u_jordan", { type: "counter", requestId: "r1", amount: "95" }), "a paused seller countering");
    s2 = ok(reduce(s2, "u_jordan", { type: "confirmPayment", requestId: "r4" })); // a match already paid can still finish
    let s3 = S(); s3.strikes = { o_sam: RULES.strikesToPause };
    const a3 = reduce(s3, "u_jordan", { type: "accept", requestId: "r1" }); return /can't trade/.test(a3.error || "") || "an offer from a paused buyer shouldn't be accepted: " + (a3.error || "accepted");
  });
  t("An Amtrak “I have this” names its train and closes when it leaves", () => {
    let s = S(); s = adv(s, 34 * 24); // Nov 23 (Alex's ISO runs to Nov 24)
    s = ok(reduce(s, "u_jordan", { type: "addHolding", eventId: "e_amtrak", tier: "coach", qty: 1, paid: "64" })); const h = s.holdings[s.holdings.length - 1].id;
    const base = { type: "isoReply", isoId: "iso-alex2", holdingId: h, qty: 1, file: { name: "j.pdf", size: 10, hash: "abcdef0123456789" } };
    err(reduce(s, "u_jordan", base), "an Amtrak reply without its train");
    s = ok(reduce(s, "u_jordan", { ...base, departsAt: "2026-11-24T06:30" })); const r = s.requests[0];
    if (!(r.departsAt === "2026-11-24T06:30" && L(s, r.listingId).departsAt === r.departsAt)) return "the departure should be stored on the reply and its listing";
    s = adv(s, 23); // Nov 24, after 06:30
    const e = rState(R(s, r.id)); return (e.st === "expired" && /train left/.test(e.reason)) || "the reply should close when the train leaves: " + e.st + " / " + e.reason;
  });
  t("An upheld “The buyer hasn't paid” puts the ticket back on sale; a report after “Received” shows as Disputed", () => {
    let s = S(); // r4: Chris says he paid Jordan for the WABF pass
    s = ok(reduce(s, "u_jordan", { type: "reportProblem", kind: "ticket", id: "r4", reason: "The buyer hasn't paid" }));
    s = ok(reduce(s, "reviewer", { type: "reviewProblem", kind: "ticket", id: "r4", outcome: "uphold" }));
    if (!(R(s, "r4").status === "released" && listingNumbers(s, L(s, "l11")).available === 1)) return "the unpaid match should close and the pass go back on sale: " + R(s, "r4").status;
    let s2 = S(); s2 = ok(reduce(s2, "u_priya", { type: "take", listingId: "l16", qty: 1 })); const id = s2.requests[0].id;
    s2 = ok(reduce(s2, "u_priya", { type: "markPaid", requestId: id })); s2 = ok(reduce(s2, "u_priya", { type: "confirmPayment", requestId: id, simulate: true }));
    s2 = ok(reduce(s2, "u_priya", { type: "markTransferred", requestId: id, simulate: true })); s2 = ok(reduce(s2, "u_priya", { type: "buyerReceived", requestId: id }));
    s2 = ok(reduce(s2, "u_priya", { type: "reportProblem", kind: "ticket", id, reason: "Turned away at the door" }));
    return rStatus(R(s2, id), rState(R(s2, id))).label === "Disputed" || "a report after Received should show as Disputed";
  });
  t("Needs your attention follows each step, buying or selling", () => {
    let s = S();
    const j = Object.fromEntries(needsAction(s, "u_jordan").map(x => [x.x.id, x.why]));
    if (!(j.r1 === "accept, counter or decline" && j.r4 === "confirm the payment" && j.gr1)) return "Jordan's to-do: " + JSON.stringify(j);
    const p = Object.fromEntries(needsAction(s, "u_priya").map(x => [x.x.id, x.why]));
    if (!(p.r2 === "pay, then tap “Paid”" && /answer Leah/.test(p.r5 || ""))) return "Priya's to-do: " + JSON.stringify(p);
    s = ok(reduce(s, "u_priya", { type: "markPaid", requestId: "r2" }));
    const p2 = needsAction(s, "u_priya").find(x => x.x.id === "r2");
    if (!p2 || !/simulate Alex confirming payment/.test(p2.why)) return "a made-up seller's step should stay in the buyer's list as a demo control";
    s = ok(reduce(s, "u_jordan", { type: "confirmPayment", requestId: "r4" }));
    const j2 = needsAction(s, "u_jordan").find(x => x.x.id === "r4");
    return (j2 && j2.why === "email the club") || "after confirming payment, Jordan should email the club: " + (j2 && j2.why);
  });
  t("Goods: withdrawing declines open requests; goods ISOs need a description and category", () => {
    let s = S(); s = ok(reduce(s, "u_jordan", { type: "withdrawItem", id: "g6" }));
    if (GR(s, "gr1").status !== "declined") return "open offer should be declined";
    const s2 = S(); const exp = isoDate(CLOCK + 7 * DAY);
    err(reduce(s2, "u_priya", { type: "saveInterest", data: { qty: 1, budget: "", expires: exp, goods: { title: " ", cat: "Furniture" } } }));
    err(reduce(s2, "u_priya", { type: "saveInterest", data: { qty: 1, budget: "", expires: exp, goods: { title: "Desk", cat: "" } } }));
    err(reduce(s2, "u_priya", { type: "saveInterest", data: { qty: 1, budget: "", expires: isoDate(CLOCK + 70 * DAY), goods: { title: "Desk", cat: "Furniture" } } }));
    const s3 = ok(reduce(s2, "u_priya", { type: "saveInterest", data: { qty: 1, budget: "30", expires: exp, goods: { title: "Desk", cat: "Furniture" } } }));
    return isMissingIso(s3.interests[0]) === false || "a goods ISO went to the unlisted-event queue";
  });
  t("Share text works for items and goods ISOs, with no names", () => {
    const s = S(); const a = shareText({ type: "item", id: "g6" }, s, SEED_IDS); const b = shareText({ type: "iso", id: "iso-gp1" }, s, SEED_IDS);
    if (a.hash !== "item-g6" || b.hash !== "iso-gp1") return "seeded items and ISOs should deep-link";
    return (!new RegExp(`${PEOPLE.u_jordan.first}|${PEOPLE.u_priya.first}`).test(a.text + b.text)) || "share text includes a name";
  });
  t("Transfer tags read simply, and a seller's restriction flag is stored only where the event has no known restriction", () => {
    const lbl = id => transferTag(EV[id]).label;
    // §9v item 5 (SELL5-M2): an event with no stated rule (e_wga_ball) shows no tag at all; it read "Rules not confirmed" before.
    const want = { e_wine: "Transferable by name change", e_vets: "Club approves name changes", e_concert: "Transferable", e_wga_ball: "", e_euro: "Organizer approval required", e_colombia: "Organizer approval required", e_amtrak: "Transfer restricted · buyer's risk", e_njt: "Paper ticket · in person" };
    for (const [id, l] of Object.entries(want)) if (lbl(id) !== l) return `${id} shows "${lbl(id)}", expected "${l}"`;
    let s = S(); s = ok(reduce(s, "u_priya", { type: "list", holdingId: "h6", qty: 1, ask: "60", restricted: true }));
    if (!s.listings[0].restricted) return "the seller's flag wasn't stored";
    s = ok(reduce(s, "u_priya", { type: "addHolding", eventId: "e_amtrak", tier: "coach", qty: 1, paid: "64" }));
    const ah = s.holdings.find(h => h.userId === "u_priya" && h.eventId === "e_amtrak");
    s = ok(reduce(s, "u_priya", { type: "list", holdingId: ah.id, qty: 1, ask: "60", restricted: true, departsAt: "2026-11-25T10:00", file: { name: "e.pdf", size: 10, hash: "fedcba9876543210" } }));
    return !s.listings[0].restricted || "Amtrak already carries the restriction at event level";
  });
  t("Seeded holdings and listings agree", () => { const s = S(); const bad = s.holdings.filter(h => holdingFree(s, h) < 0 || s.listings.filter(l => l.holdingId === h.id).reduce((a, l) => a + outstanding(s, l), 0) > h.qty); return bad.length === 0 || "over-allocated: " + bad.map(h => h.id).join(","); });
  /* ---------- Public requests, private alerts, shared listings and What's new ---------- */
  t("A private alert and a public request for one event stay separate: their own fields, changed and closed one at a time", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_wga_ball", qty: 2, max: "35" }));
    const al = s.interests.find(i => i.userId === "u_priya" && i.eventId === "e_wga_ball" && i.kind === "alert"), p1 = () => s.interests.find(i => i.id === "iso-p1");
    if (!al || al.qty !== 2 || al.max !== 35 || al.budget !== null) return "the alert should keep its own quantity and private max: " + JSON.stringify(al);
    if (!(p1().kind === "iso" && p1().qty === 1 && p1().budget === 40 && p1().status === "open")) return "Priya's request changed: " + JSON.stringify(p1());
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_wga_ball", qty: 2, budget: "40", expires: "2026-11-30" } })); // updates iso-p1 only
    const al2 = s.interests.find(i => i.id === al.id); if (!(al2.kind === "alert" && al2.max === 35 && al2.qty === 2 && p1().qty === 2)) return "saving the request touched the alert";
    err(reduce(s, "u_jordan", { type: "setAlert", id: al.id, paused: true }), "someone else's alert");
    err(reduce(s, "u_priya", { type: "setAlert", id: "iso-p1", paused: true }), "a public request isn't an alert");
    err(reduce(s, "u_jordan", { type: "joinAlert", eventId: "e_wga_ball", max: "50" }), "a max above the $40 face value");
    err(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_njt", qty: 3 }), "an alert above NJ TRANSIT's 2-per-person limit");
    s = ok(reduce(s, "u_priya", { type: "closeInterest", id: al.id }));
    err(reduce(s, "u_priya", { type: "setAlert", id: al.id, qty: 1 }), "editing a removed alert");
    return p1().status === "open" || "removing the alert closed the request";
  });
  t("A private alert never shows as a public request or counts as demand, and its max stays out of public fields", () => {
    let s = S(); const before = JSON.stringify(demandFor(s, EV.e_wine)), card = eventSummary(s, EV.e_wine, "u_jordan").state.label;
    s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_wine", qty: 2, max: "30" })); const al = s.interests[0];
    if (al.kind !== "alert" || liveRequest(s, al) || al.budget !== null) return "the alert should be private: " + JSON.stringify(al);
    if (JSON.stringify(demandFor(s, EV.e_wine)) !== before || eventSummary(s, EV.e_wine, "u_jordan").state.label !== card) return "an alert changed public demand: " + JSON.stringify(demandFor(s, EV.e_wine));
    if (feedItems(s, "u_jordan").some(x => x.isoId === al.id)) return "the alert showed in someone else's What's new";
    err(reduce(s, "u_jordan", { type: "shareListing", isoId: al.id, listingId: "l8" }), "sharing a listing with a private alert");
    return true;
  });
  t("Demand counts requests, people and tickets separately, from live public requests only; stock leaves out held replies and add-ons", () => {
    let s = S(); const d0 = demandFor(s, EV.e_concert);
    if (d0.requests || d0.people || d0.units) return "nobody has asked yet (the simulated seed doesn't count): " + JSON.stringify(d0);
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_concert", qty: 2, budget: "55", expires: "2026-11-12" } }));
    s = ok(reduce(s, "u_jordan", { type: "saveInterest", data: { eventId: "e_concert", qty: 2, budget: "50", expires: "2026-11-12" } }));
    s = ok(reduce(s, "u_jordan", { type: "joinAlert", eventId: "e_concert", qty: 3 }));
    const d = demandFor(s, EV.e_concert); if (!(d.requests === 2 && d.people === 2 && d.units === 4)) return "two requests for two each: " + JSON.stringify(d);
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_concert", qty: 1, budget: "55", expires: "2026-11-12" } }));
    const d2 = demandFor(s, EV.e_concert); if (!(d2.requests === 2 && d2.people === 2 && d2.units === 3)) return "after Priya asks for one: " + JSON.stringify(d2);
    const s0 = S(); const st = id => stockFor(s0, EV[id]);
    return (st("e_wga_ball") === 0 && st("e_vets") === 2 && st("e_colombia") === 1 && st("e_sixers") === 0) || `stock: WGA ${st("e_wga_ball")}, Vets ${st("e_vets")}, Colombia ${st("e_colombia")}, 76ers ${st("e_sixers")}`;
  });
  t("An alert's private max decides which listings match; raising it brings them in, for matches and for new-listing alerts", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_vets", max: "105" })); const id = s.interests[0].id; const al = () => s.interests.find(i => i.id === id);
    const m4 = alertMatch(s, al(), L(s, "l4"));
    if (m4.ok || !m4.reasons.some(r => /\$110 per ticket is above your \$105 max/.test(r))) return "Chris's $110 ticket is over the $105 max: " + JSON.stringify(m4);
    if (!alertMatch(s, al(), L(s, "l8")).ok) return "Jordan's $100 OBO ticket is within it";
    if (matchRecipients(s, L(s, "l4")).some(m => m.interest.userId === "u_priya")) return "an over-max listing alerted Priya";
    s = ok(reduce(s, "u_priya", { type: "setAlert", id, max: "120" }));
    if (!alertMatch(s, al(), L(s, "l4")).ok || !matchRecipients(s, L(s, "l4")).some(m => m.interest.id === id)) return "raising the max to $120 should match the $110 ticket";
    // The same rule decides who hears about a new listing: $50 is over a $45 max and within $55.
    const listFor = max => { let s1 = ok(reduce(S(), "u_priya", { type: "joinAlert", eventId: "e_concert", max })); s1 = ok(reduce(s1, "u_jordan", { type: "addHolding", eventId: "e_concert", tier: "ga", qty: 1, paid: "55" }));
      const r = reduce(s1, "u_jordan", { type: "list", holdingId: s1.holdings[s1.holdings.length - 1].id, qty: 1, ask: "50", method: "app" }); return { told: ok(r).notifications.some(x => x.userId === "u_priya" && /opened up for Indie night/.test(x.text)), toast: r.toast }; };
    const lo = listFor("45"), hi = listFor("55");
    if (lo.told || !hi.told) return `alerted at a $45 max: ${lo.told}; at $55: ${hi.told}`;
    return (!/\d+ classmates? with a matching request/.test(hi.toast) && /private alert/.test(hi.toast)) || "the seller's toast should count requests only, never alerts: " + hi.toast;
  });
  t("A paused alert never matches or alerts; saving keeps it paused, resuming brings it back", () => {
    let s = S(); s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_vets" })); const id = s.interests[0].id; const al = () => s.interests.find(i => i.id === id);
    if (!alertMatch(s, al(), L(s, "l8")).ok) return "an alert with no max matches any price";
    s = ok(reduce(s, "u_priya", { type: "setAlert", id, paused: true }));
    if (alertMatch(s, al(), L(s, "l8")).ok || alertMatch(s, al(), L(s, "l4")).ok || matchRecipients(s, L(s, "l8")).length || isoMatches(s, al()).length) return "a paused alert matched";
    s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_vets", qty: 2 })); if (!al().paused || al().qty !== 2) return "saving a paused alert should keep it paused";
    s = ok(reduce(s, "u_priya", { type: "setAlert", id, paused: false }));
    return (alertMatch(s, al(), L(s, "l8")).ok && matchRecipients(s, L(s, "l8")).some(m => m.interest.id === id)) || "resuming should match again";
  });
  t("Live requests: open, unexpired and still actionable (an unlisted event only while it's in review or being added)", () => {
    let s = S(); const live = id => liveRequest(s, s.interests.find(i => i.id === id));
    if (!live("iso-sam1") || !live("iso-gp1") || !live("iso-chris1")) return "seeded live requests should be live";
    if (live("iso-alex1") || live("iso-p2")) return "expired requests aren't live";
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { qty: 1, expires: "2026-11-30", missing: { title: "Spring formal", flexible: true } } })); const m = s.interests[0].id;
    const after = o => { s = ok(reduce(s, "reviewer", { type: "reviewMissing", id: m, outcome: o })); return live(m); };
    if (!live(m) || !after("onboarding") || after("unsupported") || after("duplicate") || !after("reviewing")) return "an unlisted-event request is live only while it's reviewed or being added";
    s = ok(reduce(s, "u_priya", { type: "closeInterest", id: "iso-p1" })); if (live("iso-p1")) return "a closed request isn't live";
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_wabf", qty: 1, budget: "60", expires: "2026-11-05" } })); const w = s.interests[0].id;
    s = adv(s, (atMs("2026-11-05T10:00") - CLOCK) / HOUR); // the forum's transfer window closed Nov 4 at 23:59; the request runs to Nov 5
    if (!isLive(s.interests.find(i => i.id === w)) || live(w)) return "a request for an event whose window closed isn't live, even before it expires";
    s = ok(reduce(s, "u_jordan", { type: "joinAlert", eventId: "e_wga_ball" })); return !live(s.interests[0].id) || "an alert is never a live request";
  });
  t("requestMatch explains each mismatch: price, quantity (a partial match), eligibility, add-on, availability and the train's deadline", () => {
    const s = S(); const I = id => s.interests.find(i => i.id === id); const has = (m, re) => m.reasons.some(r => re.test(r));
    const iso = (who, ev, qty, budget, expires) => ({ id: "x", userId: who, eventId: ev, kind: "iso", qty, budget, note: "", expires, status: "open", createdAt: CLOCK });
    let m = requestMatch(s, I("iso-nia1"), L(s, "l9")); if (!m.ok || m.partial || m.reasons.length) return "Nia's $1,700 budget fits Jordan's $1,650 spot: " + JSON.stringify(m);
    m = requestMatch(s, iso("o_nia", "e_euro", 1, 1600, "2026-11-30"), L(s, "l9")); if (m.ok || !has(m, /\$1,650 reimbursement is above Nia's \$1,600 budget/)) return "price: " + JSON.stringify(m.reasons);
    m = requestMatch(s, iso("o_sam", "e_colombia", 1, 1100, "2026-10-22"), L(s, "l13")); if (m.ok || !has(m, /Offers start at \$1,200, above Sam's \$1,100 budget/)) return "lowest offer: " + JSON.stringify(m.reasons);
    if (!requestMatch(s, iso("o_sam", "e_colombia", 1, 1250, "2026-10-22"), L(s, "l13")).ok) return "an OBO listing fits a budget at or above its lowest offer";
    m = requestMatch(s, iso("u_priya", "e_vets", 2, 140, "2026-11-02"), L(s, "l4")); if (!m.ok || !m.partial || !has(m, /Covers 1 of the 2 tickets wanted/)) return "quantity: " + JSON.stringify(m);
    m = requestMatch(s, iso("o_sam", "e_euro", 1, 1700, "2026-11-30"), L(s, "l9")); if (m.ok || !has(m, /Sam can't take it\. Members only/)) return "eligibility: " + JSON.stringify(m.reasons);
    if (!has(requestMatch(s, I("iso-sam2"), L(s, "l14")), /add-on, not a spot/)) return "an add-on isn't a trek spot";
    if (!has(requestMatch(s, I("iso-p1"), L(s, "l18")), /Nothing left on this listing \(held for a buyer\)/)) return "a reply held for someone isn't available";
    if (!has(requestMatch(s, I("iso-sam1"), L(s, "l9")), /different event/)) return "a different event";
    m = requestMatch(s, I("iso-alex2"), L(s, "l12")); if (m.ok || !has(m, /train leaves .* after Alex's Nov 24, 2026 deadline/)) return "train window: " + JSON.stringify(m.reasons);
    if (!requestMatch(s, { ...I("iso-alex2"), expires: "2026-11-26" }, L(s, "l12")).ok) return "a train before the deadline fits";
    const gi = requestMatchItem(s, I("iso-gp1"), G(s, "g1")); if (gi.ok || !gi.reasons.some(r => /Nothing in its title or note matches "Office chair"/.test(r))) return "goods words: " + JSON.stringify(gi.reasons);
    return requestMatchItem(s, I("iso-gp1"), G(s, "g6")).ok || "Jordan's office chair fits Priya's request";
  });
  t("Sharing a listing with a request tells the requester and moves no inventory; duplicates and mismatches are refused", () => {
    let s = S(); const nums = st => JSON.stringify([st.listings.map(l => listingNumbers(st, l)), st.requests.length, st.holdings.map(h => h.qty), st.goods.map(it => itemState(st, it).key)]);
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_vets", qty: 1, budget: "100", expires: "2026-11-02" } })); const iso = s.interests[0].id; const before = nums(s);
    err(reduce(s, "u_priya", { type: "shareListing", isoId: iso, listingId: "l8" }), "sharing someone else's listing");
    err(reduce(s, "o_leah", { type: "shareListing", isoId: "iso-p1", listingId: "l18" }), "sharing an ISO reply held for one person");
    err(reduce(s, "u_jordan", { type: "shareListing", isoId: iso, listingId: "l9" }), "a listing for another event");
    const r = reduce(s, "u_jordan", { type: "shareListing", isoId: iso, listingId: "l8" }); s = ok(r); const x = s.responses[0];
    if (!(x && x.id === r.result.id && x.isoId === iso && x.listingId === "l8" && x.sellerId === "u_jordan" && x.status === "open" && x.partial === false)) return "response not recorded: " + JSON.stringify(x);
    if (nums(s) !== before) return "sharing changed inventory, requests or holdings";
    const nt = s.notifications.find(n => n.userId === "u_priya" && /shared a listing for Vets Gala/.test(n.text));
    if (!(nt && /Jordan Kim/.test(nt.text) && /1 ticket at \$100/.test(nt.text) && nt.link.name === "event" && nt.link.id === "e_vets")) return "Priya should be told who, how many and the price: " + JSON.stringify(nt);
    if (!L(s, "l8").history.some(h => /Shared with Langston Chen's request/.test(h.text))) return "no listing history entry";
    err(reduce(s, "u_jordan", { type: "shareListing", isoId: iso, listingId: "l8" }), "the same listing shared twice with one request");
    err(reduce(s, "u_priya", { type: "withdrawShare", id: x.id }), "the requester withdrew the seller's share");
    s = ok(reduce(s, "u_jordan", { type: "withdrawShare", id: x.id })); if (s.responses[0].status !== "withdrawn") return "the share wasn't withdrawn";
    ok(reduce(s, "u_jordan", { type: "shareListing", isoId: iso, listingId: "l8" }), "sharing again after withdrawing");
    const s2 = ok(reduce(S(), "u_priya", { type: "saveInterest", data: { eventId: "e_euro", qty: 1, budget: "1600", expires: "2026-11-30" } })); // under the $1,650 ask
    const mis = reduce(s2, "u_jordan", { type: "shareListing", isoId: s2.interests[0].id, listingId: "l9" });
    if (!/\$1,650 reimbursement is above/.test(mis.error || "")) return "a mismatch should be refused with its reason: " + (mis.error || "shared");
    let g = ok(reduce(S(), "u_jordan", { type: "shareItem", isoId: "iso-gp1", itemId: "g6" }));
    const gn = g.notifications.find(n => n.userId === "u_priya" && /shared "Ergonomic office chair"/.test(n.text));
    if (!(gn && gn.link.name === "item" && gn.link.id === "g6" && itemState(g, G(g, "g6")).key === "available" && g.goodsReqs.length === 1)) return "goods share: " + JSON.stringify(gn);
    err(reduce(g, "u_jordan", { type: "shareItem", isoId: "iso-gp1", itemId: "g6" }), "the same item shared twice");
    g = ok(reduce(g, "u_jordan", { type: "postItem", data: { title: "Desk lamp", cat: "Home & kitchen", cond: "Good", price: "10", area: "Rittenhouse", until: isoDate(CLOCK + 5 * DAY) } }));
    const lamp = reduce(g, "u_jordan", { type: "shareItem", isoId: "iso-gp1", itemId: g.goods[0].id });
    return /in Home & kitchen, not Furniture/.test(lamp.error || "") || "an item in another category should be refused: " + (lamp.error || "shared");
  });
  t("Closing a request as fulfilled or cancelled records why and when and takes it off Wanted; a purchase or pickup closes it as fulfilled", () => {
    let s = S();
    err(reduce(s, "u_priya", { type: "closeInterest", id: "iso-p1", reason: "sold" }), "an unknown reason");
    err(reduce(s, "u_jordan", { type: "closeInterest", id: "iso-p1", reason: "cancelled" }), "someone else's request");
    s = ok(reduce(s, "u_priya", { type: "closeInterest", id: "iso-p1", reason: "fulfilled" })); const p1 = s.interests.find(i => i.id === "iso-p1");
    if (!(p1.status === "closed" && p1.closedReason === "fulfilled" && p1.closedAt > DEMO_BASE && !liveRequest(s, p1))) return "fulfilled: " + JSON.stringify(p1);
    s = ok(reduce(s, "u_priya", { type: "closeInterest", id: "iso-gp1", reason: "cancelled" })); const gp1 = s.interests.find(i => i.id === "iso-gp1");
    if (!(gp1.closedReason === "cancelled" && gp1.closedAt > p1.closedAt && !feedItems(s, "u_jordan").some(x => x.isoId === "iso-gp1"))) return "cancelled: " + JSON.stringify(gp1);
    err(reduce(s, "u_priya", { type: "closeInterest", id: "iso-gp1", reason: "fulfilled" }), "closing twice");
    let b = ok(reduce(S(), "u_priya", { type: "saveInterest", data: { eventId: "e_concert", qty: 1, budget: "55", expires: "2026-11-12" } })); const ci = b.interests[0].id;
    b = ok(reduce(b, "u_priya", { type: "joinAlert", eventId: "e_concert" })); const ca = b.interests[0].id;
    b = ok(reduce(b, "u_priya", { type: "take", listingId: "l16", qty: 1 })); const rid = b.requests[0].id;
    b = ok(reduce(b, "u_priya", { type: "markPaid", requestId: rid })); b = ok(reduce(b, "u_priya", { type: "confirmPayment", requestId: rid, simulate: true }));
    b = ok(reduce(b, "u_priya", { type: "markTransferred", requestId: rid, simulate: true })); b = ok(reduce(b, "u_priya", { type: "buyerReceived", requestId: rid }));
    const done = R(b, rid).completedAt;
    if (![ci, ca].every(id => { const i = b.interests.find(x => x.id === id); return i.status === "closed" && i.closedReason === "fulfilled" && i.closedAt === done; })) return "a completed purchase should close the request and the alert as fulfilled";
    let g = ok(reduce(S(), "u_priya", { type: "requestItem", id: "g6" })); const gid = g.goodsReqs[0].id;
    g = ok(reduce(g, "u_jordan", { type: "acceptItemReq", id: gid })); g = ok(reduce(g, "u_priya", { type: "itemPickedUp", id: gid }));
    const gi = g.interests.find(i => i.id === "iso-gp1"); return (gi.closedReason === "fulfilled" && gi.closedAt === G(g, "g6").soldAt) || "a pickup should close the goods request as fulfilled: " + JSON.stringify(gi);
  });
  t("What's new: newest first from the last week, never your own or unavailable posts; matches follow an alert's max; Mark seen changes only the seen mark", () => {
    let s = S(); const f0 = feedItems(s, "u_priya");
    if (!f0.length || f0.length > 30 || f0.some((x, k) => k && f0[k - 1].at < x.at) || !f0.every(x => x.unread)) return "a fresh feed should be newest first, at most 30, all unread";
    const gone = ["request:iso-p1", "request:iso-gp1", "listing:l1", "listing:l3", "listing:l7", "listing:l11", "listing:l18", "request:iso-alex1", "request:iso-p2"].filter(k => f0.some(x => x.key === k));
    if (gone.length) return "own, unavailable, closed or expired posts showed: " + gone.join(", ");
    if (catOf(EV.e_amtrak) !== "trains" || catOf(EV.e_colombia) !== "treks" || catOf(EV.e_euro) !== "treks" || catOf(EV.e_vets) !== "events") return "categories";
    s = ok(reduce(s, "u_jordan", { type: "list", holdingId: "h1", qty: 1, ask: "35" })); const lid = s.listings[0].id;
    const f1 = feedItems(s, "u_priya")[0];
    if (!(f1.key === "listing:" + lid && f1.type === "listing" && f1.unread && f1.cat === "events" && f1.eventId === "e_wine")) return "a new listing should come first: " + JSON.stringify(f1);
    if (feedItems(s, "u_jordan").some(x => x.key === "listing:" + lid)) return "your own listing showed in your What's new";
    s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_wine", max: "30" })); const al = s.interests[0].id;
    if (feedItems(s, "u_priya")[0].type !== "listing") return "a $35 ticket isn't a match for a $30 max";
    s = ok(reduce(s, "u_priya", { type: "setAlert", id: al, max: "35" }));
    const fm = feedItems(s, "u_priya")[0]; if (!(fm.type === "match" && fm.via === "alert" && fm.isoId === al)) return "raising the max to $35 should make it a match: " + JSON.stringify(fm);
    const before = JSON.stringify({ ...s, feedSeen: null }), top = Math.max(...feedItems(s, "u_priya").map(x => x.at));
    err(reduce(s, "u_priya", { type: "markFeedSeen", at: "soon" }), "a seen mark that isn't a time");
    const s2 = ok(reduce(s, "u_priya", { type: "markFeedSeen", at: top }));
    if (JSON.stringify({ ...s2, feedSeen: null }) !== before || s2.feedSeen.u_priya !== top) return "Mark seen changed something besides the seen mark";
    if (feedItems(s2, "u_priya").some(x => x.unread) || !feedItems(s2, "u_jordan").some(x => x.unread)) return "Mark seen should read only Priya's feed";
    const s3 = ok(reduce(s2, "o_sam", { type: "take", listingId: lid, qty: 1, member: true }));
    return !feedItems(s3, "u_priya").some(x => x.listingId === lid) || "a reserved listing should leave What's new";
  });
  t("Editing a request updates it in place (an event, an unlisted event or an item); only its owner can, never its event or type, and not once it's closed", () => {
    let s = S(); const n0 = s.interests.length, born = s.interests.find(i => i.id === "iso-gp1").createdAt;
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { id: "iso-gp1", qty: 1, budget: "60", note: "Any color.", expires: "2026-11-15", goods: { title: "Desk chair", cat: "Furniture" } } }));
    const g = s.interests.find(i => i.id === "iso-gp1");
    if (!(s.interests.length === n0 && g.goods.title === "Desk chair" && g.budget === 60 && g.expires === "2026-11-15" && g.updatedAt > DEMO_BASE && g.createdAt === born)) return "item request edit: " + JSON.stringify(g);
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { id: "iso-p1", eventId: "e_wga_ball", qty: 2, budget: "35", expires: "2026-11-20" } }));
    const p1 = s.interests.find(i => i.id === "iso-p1"); if (!(p1.qty === 2 && p1.budget === 35 && s.interests.length === n0)) return "event request edit: " + JSON.stringify(p1);
    err(reduce(s, "u_jordan", { type: "saveInterest", data: { id: "iso-p1", eventId: "e_wga_ball", qty: 1, budget: "35", expires: "2026-11-20" } }), "someone else's request");
    err(reduce(s, "u_priya", { type: "saveInterest", data: { id: "iso-p1", eventId: "e_vets", qty: 1, budget: "100", expires: "2026-11-01" } }), "moving a request to another event");
    err(reduce(s, "u_priya", { type: "saveInterest", data: { id: "iso-gp1", eventId: "e_wga_ball", qty: 1, budget: "35", expires: "2026-11-20" } }), "turning an item request into a ticket request");
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { qty: 1, expires: "2026-11-30", missing: { title: "Spring formal", flexible: true } } })); const m = s.interests[0].id;
    s = ok(reduce(s, "reviewer", { type: "reviewMissing", id: m, outcome: "onboarding" }));
    s = ok(reduce(s, "u_priya", { type: "saveInterest", data: { id: m, qty: 2, budget: "30", expires: "2026-11-30", missing: { title: "Spring formal (Saturday)", flexible: true } } }));
    const mi = s.interests.find(i => i.id === m); if (!(mi.missing.title === "Spring formal (Saturday)" && mi.qty === 2 && mi.review === "onboarding" && s.interests.length === n0 + 1)) return "unlisted-event request edit: " + JSON.stringify(mi);
    s = ok(reduce(s, "u_priya", { type: "closeInterest", id: "iso-gp1", reason: "cancelled" }));
    err(reduce(s, "u_priya", { type: "saveInterest", data: { id: "iso-gp1", qty: 1, budget: "60", expires: "2026-11-15", goods: { title: "Desk chair", cat: "Furniture" } } }), "editing a cancelled request");
    return true;
  });
  /* ---------- Regressions: matching, partial fulfillment, What's new and held listings ---------- */
  t("A goods request needs every word it asks for: an 'Office bookshelf' isn't an 'Office chair', and buying one leaves that request open", () => {
    let s = S(); const gp1 = () => s.interests.find(i => i.id === "iso-gp1");
    s = ok(reduce(s, "u_jordan", { type: "postItem", data: { title: "Office bookshelf", cat: "Furniture", cond: "Good", price: "40", area: "Rittenhouse", until: isoDate(CLOCK + 5 * DAY) } })); const it = s.goods[0];
    if (s.notifications.some(x => x.userId === "u_priya" && /Possible match/.test(x.text))) return "the bookshelf alerted Langston's office-chair request";
    const m = requestMatchItem(s, gp1(), it); if (m.ok || !m.reasons.some(r => /"chair"/.test(r))) return "the bookshelf shouldn't fit, and the reason should name the missing word: " + JSON.stringify(m);
    s = ok(reduce(s, "u_priya", { type: "requestItem", id: it.id })); const gid = s.goodsReqs[0].id;
    s = ok(reduce(s, "u_jordan", { type: "acceptItemReq", id: gid })); s = ok(reduce(s, "u_priya", { type: "itemPickedUp", id: gid }));
    return (gp1().status === "open" && !gp1().closedReason) || "buying the bookshelf closed the office-chair request: " + JSON.stringify({ status: gp1().status, closedReason: gp1().closedReason });
  });
  t("Receiving 1 of 2 wanted tickets leaves the request and the alert open for 1; receiving the second closes both as fulfilled", () => {
    let s = ok(reduce(S(), "u_priya", { type: "saveInterest", data: { eventId: "e_concert", qty: 2, budget: "55", expires: "2026-11-12" } })); const ci = s.interests[0].id;
    s = ok(reduce(s, "u_priya", { type: "joinAlert", eventId: "e_concert", qty: 2 })); const ca = s.interests[0].id;
    const I = id => s.interests.find(x => x.id === id), show = () => JSON.stringify([ci, ca].map(id => { const i = I(id); return { kind: i.kind, status: i.status, closedReason: i.closedReason, qty: i.qty }; }));
    const receiveOne = () => { s = ok(reduce(s, "u_priya", { type: "take", listingId: "l16", qty: 1 })); const rid = s.requests[0].id;
      s = ok(reduce(s, "u_priya", { type: "markPaid", requestId: rid })); s = ok(reduce(s, "u_priya", { type: "confirmPayment", requestId: rid, simulate: true }));
      s = ok(reduce(s, "u_priya", { type: "markTransferred", requestId: rid, simulate: true })); s = ok(reduce(s, "u_priya", { type: "buyerReceived", requestId: rid })); return R(s, rid).completedAt; };
    receiveOne();
    if (![ci, ca].every(id => I(id).status === "open" && I(id).qty === 1)) return "after 1 of 2: " + show();
    if (!liveRequest(s, I(ci)) || demandFor(s, EV.e_concert).units !== 1) return "the request should stay on Wanted for 1 ticket: " + JSON.stringify(demandFor(s, EV.e_concert));
    const done = receiveOne();
    return [ci, ca].every(id => I(id).status === "closed" && I(id).closedReason === "fulfilled" && I(id).closedAt === done) || "after the second ticket: " + show();
  });
  t("A train leaving after a request's deadline matches it nowhere: not in new-listing alerts, the seller's count or a held reply", () => {
    const s = S(), alex = l => matchRecipients(s, l).some(m => m.interest.id === "iso-alex2");
    if (alex(L(s, "l12"))) return "Leah's Nov 25 train alerted Alex, whose deadline is Nov 24";
    if (!alex({ ...L(s, "l12"), departsAt: "2026-11-24T06:30" })) return "a train leaving on Alex's deadline day should alert him";
    const mine = ok(reduce(s, "u_priya", { type: "saveInterest", data: { eventId: "e_amtrak", qty: 1, budget: "70", expires: "2026-11-26" } }));
    const sell = (dep, hash) => reduce(mine, "u_jordan", { type: "addThen", add: { eventId: "e_amtrak", tier: "coach", qty: 1, paid: "60" }, then: { type: "list", qty: 1, ask: "60", departsAt: dep, file: { name: "t.pdf", size: 10, hash } } });
    const told = r => ok(r).notifications.some(x => x.userId === "u_priya" && /opened up for Amtrak/.test(x.text));
    const late = sell("2026-11-27T10:00", "0123456789abcdef"), mid = sell("2026-11-25T16:00", "0123456789abcdee");
    if (told(late) || !/No one has a matching request yet/.test(late.toast || "")) return "a Nov 27 train is after both deadlines: " + late.toast;
    if (!told(mid) || !/^Ticket listed\. 1 classmate with a matching request was alerted/.test(mid.toast || "")) return "a Nov 25 train fits only Langston's Nov 26 deadline: " + mid.toast;
    const j = ok(reduce(s, "u_jordan", { type: "addHolding", eventId: "e_amtrak", tier: "coach", qty: 1, paid: "64" })); const h = j.holdings[j.holdings.length - 1].id;
    const reply = dep => reduce(j, "u_jordan", { type: "isoReply", isoId: "iso-alex2", holdingId: h, qty: 1, departsAt: dep, file: { name: "j.pdf", size: 10, hash: "abcdef0123456789" } });
    const late2 = reply("2026-11-25T16:00"); if (!/after Alex's Nov 24, 2026 deadline/.test(late2.error || "")) return "a held reply on a train after Alex's deadline: " + (late2.error || "sent");
    ok(reply("2026-11-24T06:30"), "a held reply on a train before Alex's deadline"); return true;
  });
  t("What's new leaves out add-ons, which aren't spots: the Colombia coffee extension isn't listed there, the trek spot is", () => {
    const keys = feedItems(S(), "u_priya").map(x => x.key);
    return (!keys.includes("listing:l14") && keys.includes("listing:l13")) || "Colombia in What's new: " + keys.filter(k => /^listing:l1[34]$/.test(k)).join(", ");
  });
  t("What's new quotes a trip listing's total commitment beside its reimbursement, as the card does", () => {
    const x = feedItems(S(), "u_priya").find(y => y.key === "listing:l9");
    return (!!x && x.text.includes("$1,650 reimbursement (total commitment $2,900)")) || "Euro Ski in What's new: " + (x ? x.text : "missing");
  });
  t("What's new searches the same fields as Available and Wanted: a venue, an item's note or a request's note finds the same records in all three", () => {
    const s = S(), me = "u_priya", bad = [];
    const rec = x => x.type === "request" ? x.isoId : x.itemId || x.eventId; // the event, item or request an update is about
    for (const q of ["Wells Fargo", "Fishtown", "lumbar", "weekend"]) {
      const d = { ...DISC0, q }, a = availableFor(s, me, d), rows = feedItems(s, me);
      const found = new Set([...a.cards.map(c => c.key), ...a.lookup.map(r => r.ev.id), ...wantedFor(s, d).map(i => i.id)]), shown = new Set(feedFor(s, me, d).items.map(x => x.key));
      if (!rows.some(x => found.has(rec(x)))) bad.push(`"${q}" finds nothing in What's new to compare`);
      rows.forEach(x => { if (found.has(rec(x)) !== shown.has(x.key)) bad.push(`"${q}": ${x.key} ${shown.has(x.key) ? "is in What's new but not on Available or Wanted" : "is missing from What's new"}`); });
    }
    return bad.length === 0 || bad.join("; ");
  });
  t("An event whose only listed ticket is held says so, not 'No tickets listed'; a reply held for one requester isn't a listed ticket", () => {
    const s = S(), sum = (id, who) => eventSummary(s, EV[id], who);
    if (sum("e_wine_fg", "u_jordan").state.label !== "1 listed ticket held for a buyer") return "Friendsgiving (Alex's only ticket, reserved by Langston), as Jordan: " + sum("e_wine_fg", "u_jordan").state.label;
    if (sum("e_wine_fg", "u_priya").state.label !== "You reserved this") return "as Langston, who reserved it: " + sum("e_wine_fg", "u_priya").state.label;
    const w = sum("e_wga_ball", "u_jordan"); if (w.reservedOthers !== 0 || w.state.label !== "No tickets listed") return `WGA (Leah's reply held for Langston), as Jordan: ${w.reservedOthers} held, "${w.state.label}"`;
    return sum("e_wine", "u_jordan").state.label === "No tickets listed" || "Monthly Tasting: " + sum("e_wine", "u_jordan").state.label;
  });
  applyWorld(appState);
  return out;
}
