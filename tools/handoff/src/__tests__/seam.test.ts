// The seam between the projection and the browser (C-DESIGN.md §9.1, §12): the live UI installs a view with setLiveClock and
// applyWorld(view), then calls the same engine view helpers the pages call on it. On projected views for a seller (Ann), a
// buyer (Bob), a stranger (Fay) and a first-time viewer (Gus), at every step of the core flow, on an empty market, with one
// minimal event of each kind and with a person whose profile row is gone:
// - no helper throws, and no string it returns contains "undefined", "NaN" or "$NaN" (and no number is NaN);
// - the counts and states it shows equal the server's, computed with the whole document for the same viewer;
// - needsAction never offers a "simulate" step (every live person is a real one), and nothing reads as sample data;
// - every view meets the contract (helpers/contract.ts).
// The people are labelled test accounts; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { EngineEvent, Interest, Item, Listing, TicketRequest, WorldState } from "../../engine/index.js";
import type { View } from "../types.js";
import { contractViolations } from "./helpers/contract.js";
import { FAY, GUS, PEOPLE6, ServerWorld, viewOf, type ViewOptions } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, HOUR, LiveTestWorld, type TestPerson, dateAfter, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const BAD_TEXT = /undefined|NaN|\$NaN/;
const SAMPLE = /\b(demo|simulat\w*|illustrative|fictional|reviewer|sample)\b/i;

afterEach(() => {
  E.setLiveClock(null);
  E.applyWorld(null);
});

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}

/** What one side (the server on the document, or the browser on the view) shows this viewer, for the view's records. */
interface Figures {
  counts: Record<string, unknown>;
  texts: [string, unknown][];
}

/**
 * The helpers the pages call, for every event, listing, request, item and public request in the view, read from `s` (the
 * document on the server, the view in the browser). Counts are what both sides must agree on; texts are what the page shows.
 */
function figures(s: WorldState, me: string, view: View): Figures {
  const counts: Record<string, unknown> = {};
  const texts: [string, unknown][] = [];
  const listingOf = (id: string): Listing => must(s.listings.find((l) => l.id === id), `listing ${id}`);
  const itemOf = (id: string): Item => must(s.goods.find((it) => it.id === id), `item ${id}`);
  for (const ve of view.events) {
    const ev: EngineEvent = must(E.EV[ve.id], `event ${ve.id}`);
    const sum = E.eventSummary(s, ev, me);
    counts[`summary ${ev.id}`] = { state: sum.state, spots: sum.spots, otherSpots: sum.otherSpots, mySpots: sum.mySpots, ownAvail: sum.ownAvail, ownReserved: sum.ownReserved,
      ownDone: sum.ownDone, reservedOthers: sum.reservedOthers, blockedListed: sum.blockedListed, myOpen: sum.myOpen?.id ?? null, best: sum.best?.l.id ?? null, ownMain: sum.ownMain?.id ?? null,
      ownPaused: sum.ownPaused, pausedOthers: sum.pausedOthers };
    counts[`stock ${ev.id}`] = E.stockFor(s, ev);
    counts[`demand ${ev.id}`] = E.demandFor(s, ev);
    counts[`access ${ev.id}`] = E.access(ev);
    texts.push([`event ${ev.title}`, [ev.title, ev.blurb, ev.path, ev.policyNote, ev.sourcesNote, ev.tag ?? null, E.fmtRange(ev), E.transferTag(ev), E.priceParts(ev, sum), sum.state,
      (ev.tiers ?? []).map((t) => [t.label, E.priceBasis(t.src)]), E.access(ev)]]); // (SELL5-M1: no share message any more, §9v item 3)
  }
  for (const vl of view.listings) {
    const l = listingOf(vl.id);
    counts[`numbers ${l.id}`] = E.listingNumbers(s, l);
    counts[`listingState ${l.id}`] = E.listingState(s, l);
    counts[`selfReported ${l.id}`] = E.selfReported(s, l);
    counts[`paused ${l.id}`] = [E.listingPaused(s, l), E.pausedUnits(s, l)];
    texts.push([`listing ${l.id}`, [E.listingState(s, l), E.METHODS[l.method ?? "file"].label]]);
  }
  for (const vr of view.requests) {
    const r: TicketRequest = must(s.requests.find((x) => x.id === vr.id), `request ${vr.id}`);
    const e = E.rState(r);
    counts[`rState ${r.id}`] = e;
    counts[`deadlines ${r.id}`] = E.requestDeadlines(r);
    texts.push([`request ${r.id}`, [e, E.rStatus(r, e), E.myReqLabel(r), ...(typeof r.holdUntil === "number" ? [E.holdLen(r, E.CLOCK)] : [])]]); // a hold's length, where there's a hold
  }
  for (const vi of view.goods) {
    const it = itemOf(vi.id);
    counts[`itemState ${it.id}`] = E.itemState(s, it);
    counts[`itemPaused ${it.id}`] = E.itemPaused(it);
    texts.push([`item ${it.title}`, [E.itemState(s, it)]]);
  }
  for (const vg of view.goodsReqs) {
    const g = must(s.goodsReqs.find((x) => x.id === vg.id), `goods request ${vg.id}`);
    counts[`gState ${g.id}`] = E.gState(g, itemOf(g.itemId));
  }
  for (const vi of view.interests) {
    const i: Interest = must(s.interests.find((x) => x.id === vi.id), `interest ${vi.id}`);
    counts[`live ${i.id}`] = E.liveRequest(s, i);
    texts.push([`interest ${i.id}`, [E.isoTitle(i), E.reqText(i), ...(i.kind === "iso" ? [] : [E.alertText(i, must(E.EV[i.eventId ?? ""], "alert event"))])]]);
    // Matches against the listings and items in the view (the server's document has others the viewer never gets).
    if (i.goods) for (const vi of view.goods) texts.push([`requestMatchItem ${i.id} ${vi.id}`, E.requestMatchItem(s, i, itemOf(vi.id))]);
    else for (const l of view.listings.filter((x) => x.eventId === i.eventId).map((x) => listingOf(x.id))) {
      const m = i.kind === "alert" ? E.alertMatch(s, i, l) : E.requestMatch(s, i, l);
      counts[`match ${i.id} ${l.id}`] = [m.ok, m.partial];
      texts.push([`match ${i.id} ${l.id}`, m]);
    }
  }
  const actions = E.needsAction(s, me);
  counts["needsAction"] = actions.map((a) => [a.kind, a.x.id, a.role, a.why]);
  texts.push(["needsAction", actions.map((a) => a.why)]);
  const avail = E.availableFor(s, me, E.DISC0);
  counts["available"] = { cards: avail.cards.map((c) => c.key), lookup: avail.lookup.map((r) => r.ev.id) };
  for (const cat of ["events", "trains", "treks", "goods"]) counts[`available ${cat}`] = E.availableFor(s, me, { ...E.DISC0, cat }).cards.map((c) => c.key);
  counts["explore"] = E.exploreRows(s, me, {}).map((r) => [r.ev.id, r.stock, r.sum.state.key]);
  counts["wanted"] = E.wantedFor(s, E.DISC0).map((i) => i.id);
  counts["feed"] = E.feedItems(s, me).map((x) => x.key);
  texts.push(["available", avail.cards.map((c) => ("ev" in c ? [c.ev.title, c.sum.state] : [c.it.title]))], ["feed", E.feedItems(s, me).map((x) => x.text)],
    ["wanted", E.wantedFor(s, E.DISC0).map((i) => E.reqText(i))], ["clubs", E.CLUB_MENU.map((c) => c.label)]);
  return { counts, texts };
}

/** Problems with one viewer's view at one step: contract breaks, throws, bad text, and counts that differ from the server's. */
function seam(w: LiveTestWorld, viewer: TestPerson, label: string, o: ViewOptions = {}): string[] {
  const problems: string[] = [];
  const view = viewOf(w, viewer, o);
  problems.push(...contractViolations(view, viewer.userId).map((p) => `${label}: ${p}`));
  const people = w.people.filter((p) => !(o.withoutRows ?? []).includes(p.userId));
  const server = E.withEngine({ doc: w.doc, people, now: w.now }, () => figures(w.doc, viewer.userId, view));
  let browser: Figures;
  try {
    E.setLiveClock(() => view.serverNow);
    E.applyWorld(view);
    browser = figures(view as unknown as WorldState, viewer.userId, view); // a view has the state's shape where the helpers read it
  } catch (e) {
    return [...problems, `${label}: a helper threw: ${e instanceof Error ? e.stack ?? e.message : String(e)}`];
  } finally {
    E.setLiveClock(null);
    E.applyWorld(null);
  }
  for (const [k, v] of Object.entries(server.counts)) {
    if (JSON.stringify(browser.counts[k]) !== JSON.stringify(v)) problems.push(`${label}: ${k}: browser ${JSON.stringify(browser.counts[k])}, server ${JSON.stringify(v)}`);
  }
  const walk = (v: unknown, at: string): void => {
    if (typeof v === "string") {
      if (BAD_TEXT.test(v)) problems.push(`${label}: ${at}: "${v}"`);
      if (SAMPLE.test(v)) problems.push(`${label}: ${at} reads as sample data: "${v}"`);
    } else if (typeof v === "number") {
      if (Number.isNaN(v)) problems.push(`${label}: ${at}: NaN`);
    } else if (Array.isArray(v)) v.forEach((x, k) => walk(x, `${at}[${k}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  for (const [where, v] of browser.texts) walk(v, where);
  if (browser.texts.some(([where, v]) => where === "needsAction" && JSON.stringify(v).toLowerCase().includes("simulate"))) problems.push(`${label}: needsAction offers a simulate step`);
  return problems;
}

const VIEWERS: readonly TestPerson[] = [ANN, BOB, FAY, GUS];
const everyone = (w: LiveTestWorld, step: string, o: ViewOptions = {}): string[] => VIEWERS.flatMap((p) => seam(w, p, `${step} / ${p.name}`, o));

describe("the seam: the engine's view helpers on projected views", () => {
  it("an empty market", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(everyone(w, "empty")).toEqual([]);
    const v = viewOf(w, GUS);
    expect([v.events, v.listings, v.interests, v.goods]).toEqual([[], [], [], []]);
  });

  it("one minimal event of each kind: an event, an eTicket train, a paper-ticket train and a trek", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const now = w.now;
    w.ok(ANN.userId, { type: "createEvent", kind: "event", title: "Spring Formal", club: "WGA", cat: "Parties", start: wallAfter(now, 10), tiers: [{ label: "GA", price: "40" }] });
    w.ok(ANN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(now, 2, "06:00"), openUntil: wallAfter(now, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] });
    w.ok(BOB.userId, { type: "createEvent", kind: "train", title: "SEPTA: Penn → Airport", club: "SEPTA", start: wallAfter(now, 1, "06:00"), openUntil: wallAfter(now, 3, "23:00"), ticketType: "paper", tiers: [{ label: "Fare", price: "8" }] });
    w.ok(CAT.userId, { type: "createEvent", kind: "trek", title: "Iceland Trek", club: "Nordic Club", start: wallAfter(now, 40, "08:00"), tiers: [{ label: "Spot", price: "1200" }] });
    expect(everyone(w, "events")).toEqual([]);
    expect(viewOf(w, FAY).events.map((e) => [e.kind, e.sourcesNote])).toEqual([
      ["event", "Added by Ann L. · details not checked by Handoff"], ["train", "Added by Ann L. · details not checked by Handoff"],
      ["train", "Added by Bob D. · details not checked by Handoff"], ["trek", "Added by Cat M. · details not checked by Handoff"],
    ]);
  });

  it("the core flow, at every step, for the seller, the buyer, a stranger and a first-time viewer", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const problems: string[] = [];
    const step = (label: string, o: ViewOptions = {}): void => { problems.push(...everyone(w, label, o)); };
    const now = w.now;
    const ev = w.addEvent(ANN, { notes: "Black tie." });
    const train = must(w.ok(ANN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(now, 2, "06:00"),
      openUntil: wallAfter(now, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
    const trek = must(w.ok(CAT.userId, { type: "createEvent", kind: "trek", title: "Iceland Trek", club: "Nordic Club", start: wallAfter(now, 40, "08:00"), tiers: [{ label: "Spot", price: "1200" }] }).id, "trek");
    step("events added");
    const l = w.listTickets(ANN, ev, { qty: 2, obo: true, minOffer: "20", note: "Two together." });
    step("listed");
    const iso = w.requestFor(BOB, ev, { qty: 2, budget: "35", note: "Two please." });
    w.ok(BOB.userId, { type: "joinAlert", eventId: trek, qty: 1, max: "" });
    w.ok(CAT.userId, { type: "saveInterest", data: { qty: 1, budget: "50", note: "", expires: dateAfter(now, 10), goods: { title: "Desk chair", cat: "Furniture" } } });
    step("requested");
    w.ok(ANN.userId, { type: "shareListing", isoId: iso, listingId: l });
    step("shared");
    const r = w.take(BOB, l);
    step("reserved");
    for (const [label, who, type] of [["paid", BOB, "markPaid"], ["confirmed", ANN, "confirmPayment"], ["sent", ANN, "markTransferred"], ["completed", BOB, "buyerReceived"]] as const) {
      w.ok(who.userId, { type, requestId: r });
      step(label);
    }
    const o = must(w.ok(DAN.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    w.ok(ANN.userId, { type: "counter", requestId: o, amount: "33" });
    step("countered");
    const chair = w.postItem(ANN, { obo: true });
    const g = must(w.ok(BOB.userId, { type: "requestItem", id: chair, offer: "25", msg: "", shareContact: true }).id, "goods request");
    step("item requested");
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    w.ok(BOB.userId, { type: "setPickup", id: g, at: wallAfter(now, 2, "17:00") });
    step("item held");
    w.ok(BOB.userId, { type: "itemPickedUp", id: g });
    step("item picked up");
    const tl = w.listTickets(ANN, train, { qty: 1, ask: "80", paid: "89", method: "file", departsAt: wallAfter(now, 3, "14:11") });
    w.take(BOB, tl);
    step("train reserved");
    w.ok(DAN.userId, { type: "respond", requestId: o, accept: true, member: false });
    w.ok(DAN.userId, { type: "markPaid", requestId: o });
    w.ok(ANN.userId, { type: "paymentMissing", requestId: o });
    step("payment disputed");
    step("a profile row gone", { withoutRows: [DAN.userId] });
    w.advance(16 * 60_000);
    step("a hold lapsed, before any sweep");
    w.sweep();
    step("swept");
    w.advance(2 * DAY);
    w.sweep();
    step("two days on");
    expect(problems).toEqual([]);
  });

  it("a held reply and a goods backup reach the right people and render for everyone", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    const iso = w.requestFor(BOB, ev, { qty: 1, budget: "40" });
    w.ok(EVE.userId, { type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
      then: { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@eve-park", note: "", membersOnly: false } });
    const chair = w.postItem(ANN);
    const g1 = must(w.ok(DAN.userId, { type: "requestItem", id: chair, msg: "", shareContact: false }).id, "goods request");
    w.ok(ANN.userId, { type: "acceptItemReq", id: g1, shareContact: true });
    w.ok(BOB.userId, { type: "requestItem", id: chair, msg: "", shareContact: false }); // a backup while Dan holds it
    expect([...everyone(w, "held reply and backup"), ...seam(w, EVE, "Eve"), ...seam(w, DAN, "Dan")]).toEqual([]);
    w.advance(3 * DAY);
    w.sweep();
    expect([...everyone(w, "after the holds lapsed"), ...seam(w, EVE, "Eve later"), ...seam(w, DAN, "Dan later")]).toEqual([]);
  });

  it("a seller's edit, pause and resume (C-CONTRACT §8): the browser shows what the server does, for the seller, buyers and strangers", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const problems: string[] = [];
    const step = (label: string): void => { problems.push(...everyone(w, label), ...seam(w, CAT, `${label} / Cat`), ...seam(w, DAN, `${label} / Dan`)); };
    const ev = w.addEvent(ANN);
    const l = w.listTickets(ANN, ev, { qty: 3, obo: true, minOffer: "20" });
    w.take(BOB, l);
    const o = must(w.ok(CAT.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    const p = must(w.ok(DAN.userId, { type: "offer", listingId: l, qty: 1, amount: "25", msg: "", member: false }).id, "offer 2");
    w.ok(ANN.userId, { type: "counter", requestId: p, amount: "28" });
    w.requestFor(EVE, ev, { qty: 1, budget: "40" });
    w.ok(FAY.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" });
    const chair = w.postItem(ANN, { obo: true, minOffer: "15" });
    const g = must(w.ok(BOB.userId, { type: "requestItem", id: chair, msg: "", shareContact: true }).id, "goods request");
    w.ok(CAT.userId, { type: "requestItem", id: chair, offer: "20", msg: "", shareContact: false });
    step("before");
    w.ok(ANN.userId, { type: "editListing", listingId: l, ask: "38", note: "Row C." });
    w.ok(ANN.userId, { type: "editItem", id: chair, price: "32" });
    step("edited");
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    w.ok(ANN.userId, { type: "pauseItem", id: chair });
    step("paused");
    const lamp = w.postItem(ANN, { title: "Reading lamp", cat: "Home & kitchen", price: "12" });
    const h = must(w.ok(EVE.userId, { type: "requestItem", id: lamp, msg: "", shareContact: true }).id, "lamp request");
    w.ok(ANN.userId, { type: "acceptItemReq", id: h, shareContact: true });
    w.ok(ANN.userId, { type: "pauseItem", id: lamp }); // a hold agreed before the pause goes on
    step("paused, one held");
    w.ok(ANN.userId, { type: "resumeListing", listingId: l });
    w.ok(ANN.userId, { type: "resumeItem", id: chair });
    w.ok(ANN.userId, { type: "accept", requestId: o });
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    step("resumed");
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    w.advance(3 * HOUR);
    w.sweep();
    step("paused, holds lapsed");
    expect(problems).toEqual([]);
  });

  it("the browser's numbers come from the view: a listing someone else holds shows the server's counts", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    const l = w.listTickets(ANN, ev, { qty: 2 });
    w.take(BOB, l);
    const v = viewOf(w, FAY);
    expect(v.requests).toEqual([]); // Fay has none of the requests behind the count
    E.setLiveClock(() => v.serverNow);
    E.applyWorld(v);
    const s = v as unknown as WorldState;
    const listing = must(s.listings.find((x) => x.id === l), "listing");
    expect(E.listingNumbers(s, listing)).toEqual({ reserved: 1, completed: 0, available: 1 });
    expect(E.eventSummary(s, must(E.EV[ev], "event"), FAY.userId).state.label).toBe("1 ticket available");
    expect(E.PEOPLE[ANN.userId]?.name).toBe("Ann L.");
    expect(E.PEOPLE["user-nobody"]?.name).toBe("A classmate");
    expect(E.CLOCK).toBe(v.serverNow);
  });

  it("a view is applied again unchanged: re-normalizing an event gives the same event (the browser does it on every view)", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.addEvent(ANN, { notes: "Black tie.", venue: "Huntsman Hall", officialUrl: "https://example.invalid/x" });
    const v = viewOf(w, BOB);
    E.setLiveClock(() => v.serverNow);
    E.applyWorld(v);
    const installed = must(E.EVENTS[0], "event");
    const { canRemove: _ignored, ...sent } = must(v.events[0], "view event");
    expect(JSON.parse(JSON.stringify(installed))).toEqual(sent);
    expect(installed.blurb).toBe("From Ann L.: Black tie.");
    expect(HOUR).toBe(3_600_000);
  });
});
