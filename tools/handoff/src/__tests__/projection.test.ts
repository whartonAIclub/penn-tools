// The projection (C-DESIGN.md §3.1, §3.5, §3.6, §9.1; C-CONTRACT.md §2; project.ts). Privacy rests on it, so this is strict:
// - Canaries: private values planted in one world (an alert's max and quantity, a payment handle, a reservation's message, an
//   offer, an email, an unlisted holding's price, history lines, a problem report, a goods request's message and offer) appear
//   only in the views of the people §3.1 allows, never in anyone else's view, and never in any text the engine sends another
//   user (refusals, toasts, notifications), whatever they try. A private alert's id doesn't even confirm it exists.
// - Reveals happen exactly at their step: the payment handle from the reservation; email from the reservation to the transfer
//   (tickets) or once both agreed (goods); full names once two people are linked.
// - Other people's records arrive only as the server's counts and states, with when those change (numbersUntil, stateUntil).
// - Every view meets the contract (helpers/contract.ts): the allowed keys for each role, and every id resolves.
// - Allowlists, not deletion: a field nobody listed never leaves the server. Damaged references are dropped and logged.
// - Bounds: 14 days for other people's finished records, 30 for closed events, the newest 200 of one's own finished records.
// The people are labelled test accounts with made-up ids and @example.invalid emails; no database and no sign-in.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as E from "../../engine/index.js";
import type { Action, LiveWorld } from "../../engine/index.js";
import type { EnginePort, WorldDoc } from "../engine-port.js";
import { parseAction } from "../live.js";
import { EVENT_KEEP_DAYS, OTHERS_FINAL_DAYS, OWN_FINAL_CAP, VIEW_NOTIFICATIONS, project } from "../project.js";
import type { View } from "../types.js";
import { contractViolations } from "./helpers/contract.js";
import { FAY, GUS, PEOPLE6, ServerWorld, emailOf, rawViewOf, rowOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, HOUR, LiveTestWorld, MIN, type TestPerson, dateAfter, deepFreeze, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}
/** The view, checked against the contract first: every test reads only views that meet it. */
function seen(w: LiveTestWorld, viewer: TestPerson, o: Parameters<typeof viewOf>[2] = {}): View {
  const v = viewOf(w, viewer, o);
  expect(contractViolations(v, viewer.userId), `the contract, for ${viewer.name}`).toEqual([]);
  return v;
}
const listingIn = (v: View, id: string) => v.listings.find((l) => l.id === id);
const itemIn = (v: View, id: string) => v.goods.find((it) => it.id === id);

afterEach(() => {
  vi.restoreAllMocks();
  E.setLiveClock(null);
  E.applyWorld(null);
});

// C5's real port takes project as it is (a compile-time check).
void (project satisfies EnginePort["project"]);

// ── Canaries ─────────────────────────────────────────────────────────────────────────────

/** Bob's email is the canary address. Ann's saved payment method (follow-on B1) is the canary destination. */
const BOBC: TestPerson = { ...BOB, email: "canary@example.invalid" };
const ANNC: TestPerson = { ...ANN, payHandle: "", payMethods: [{ kind: "venmo", value: "CANARY-PAY" }] };
/** Typed with Ann's listings as the page before protocol 2 did: the server's path drops it, so nobody may ever see it. */
const TYPED_HANDLE = "@CANARY-TYPED-WITH-LISTING";

const CANARY = {
  alertMax: "987.65",
  pay: "CANARY-PAY",
  msg: "CANARY-MSG",
  offer: "123.45",
  offerMsg: "CANARY-OFFER-MSG",
  email: "canary@example.invalid",
  holdingPrice: "77.77",
  requestHistory: "Buyer said they paid",
  problem: "The seller hasn't sent it",
  goodsMsg: "CANARY-GMSG",
  goodsOffer: "12.34",
  listingHistory: "Listed 2 tickets at $35",
  itemHistory: "Posted at $30",
} as const;
type Canary = keyof typeof CANARY;
/** Who may see each canary (§3.1): its owner and, where a record is shared, the other party. */
const MAY_SEE: Record<Canary, readonly string[]> = {
  alertMax: [CAT.userId],
  pay: [ANN.userId, BOB.userId], // Ann's method; Bob's reservation on her listing keeps a copy
  msg: [ANN.userId, BOB.userId],
  offer: [ANN.userId, DAN.userId],
  offerMsg: [ANN.userId, DAN.userId],
  email: [BOB.userId, ANN.userId], // Bob's own, and Ann's while his reservation stands
  holdingPrice: [EVE.userId],
  requestHistory: [ANN.userId, BOB.userId],
  problem: [ANN.userId, BOB.userId],
  goodsMsg: [ANN.userId, DAN.userId],
  goodsOffer: [ANN.userId, DAN.userId],
  listingHistory: [ANN.userId],
  itemHistory: [ANN.userId],
};
const forbidden = (viewerId: string): [Canary, string][] => (Object.keys(CANARY) as Canary[]).filter((k) => !MAY_SEE[k].includes(viewerId)).map((k) => [k, CANARY[k]]);

/**
 * Ann's Gala ($40 and $1,000 tiers). Ann, paid with Venmo CANARY-PAY, lists 2 GA tickets and 1 patron ticket (each sent with a typed
 * handle, which the server's path drops). Bob reserves a GA ticket with a message, pays and reports a problem. Dan offers $123.45 on the
 * patron ticket. Cat has a private alert (3 tickets, up to $987.65). Eve holds 3 patron tickets at $77.77 she hasn't listed, and publicly
 * asks for 2 more; Ann shares a listing with that request. Dan asks for Ann's desk chair at $12.34 with a message. Fay is party to nothing.
 */
function canaryWorld() {
  const w = new ServerWorld({ people: [ANNC, BOBC, CAT, DAN, EVE, FAY] });
  const ev = must(w.ok(ANN.userId, { type: "createEvent", kind: "event", title: "Gala", club: "WGA", cat: "Parties", start: wallAfter(w.now, 10),
    tiers: [{ label: "GA", price: "40" }, { label: "Patron", price: "1000" }] }).id, "event");
  const l1 = must(w.ok(ANN.userId, { type: "addThen", add: { eventId: ev, tier: "t1", qty: 2, paid: "40" },
    then: { type: "list", qty: 2, ask: "35", method: "app", payHandle: TYPED_HANDLE, file: null, note: "Two GA tickets." } }).id, "l1");
  const r1 = must(w.ok(BOB.userId, { type: "take", listingId: l1, qty: 1, amount: "", msg: CANARY.msg, member: false }).id, "r1");
  w.ok(BOB.userId, { type: "markPaid", requestId: r1 });
  w.ok(BOB.userId, { type: "reportProblem", kind: "ticket", id: r1, reason: CANARY.problem });
  const l2 = must(w.ok(ANN.userId, { type: "addThen", add: { eventId: ev, tier: "t2", qty: 1, paid: "1000" },
    then: { type: "list", qty: 1, ask: "900", method: "app", payHandle: TYPED_HANDLE, file: null, obo: true } }).id, "l2");
  const offer = must(w.ok(DAN.userId, { type: "offer", listingId: l2, qty: 1, amount: CANARY.offer, msg: CANARY.offerMsg, member: false }).id, "offer");
  const alert = must(w.ok(CAT.userId, { type: "joinAlert", eventId: ev, qty: 3, max: CANARY.alertMax }).id, "alert");
  const evesHolding = must(w.ok(EVE.userId, { type: "addHolding", eventId: ev, tier: "t2", qty: 3, paid: CANARY.holdingPrice }).id, "Eve's holding");
  const iso = must(w.ok(EVE.userId, { type: "saveInterest", data: { eventId: ev, qty: 2, budget: "40", note: "Public note from Eve.", expires: dateAfter(w.now, 5) } }).id, "iso");
  const share = must(w.ok(ANN.userId, { type: "shareListing", isoId: iso, listingId: l1 }).id, "share");
  const item = w.postItem(ANN, { title: "Desk chair", price: "30", obo: true });
  const greq = must(w.ok(DAN.userId, { type: "requestItem", id: item, offer: CANARY.goodsOffer, msg: CANARY.goodsMsg, shareContact: false }).id, "goods request");
  const dansHolding = must(w.ok(DAN.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 2, paid: "40" }).id, "Dan's holding");
  return { w, ev, l1, l2, r1, offer, alert, evesHolding, iso, share, item, greq, dansHolding };
}

/** Every text the engine would send `actor` for an action on the base world (a refusal, a toast, step outcomes, their own notifications), without keeping it. */
function textsFor(w: LiveTestWorld, actor: string, action: Action): string[] {
  const parsed = parseAction(action);
  if (!parsed.ok) return [parsed.error];
  return E.withEngine({ doc: w.doc, people: w.people, now: w.now }, () => {
    const res = E.reduce(w.doc, actor, parsed.action as Action);
    const own = res.error === undefined ? res.state.notifications.filter((n) => n.userId === actor).map((n) => n.text) : [];
    return [res.error ?? "", res.toast ?? "", res.steps ? JSON.stringify(res.steps) : "", ...own].filter((t) => t !== "");
  });
}

/** Actions on every record id in the canary world: what a curious user could try. */
function battery(c: ReturnType<typeof canaryWorld>): Action[] {
  const out: Action[] = [];
  for (const requestId of [c.r1, c.offer]) {
    for (const type of ["accept", "decline", "markPaid", "confirmPayment", "paymentMissing", "markTransferred", "buyerReceived", "cancel", "release"]) out.push({ type, requestId });
    out.push({ type: "counter", requestId, amount: "33" }, { type: "respond", requestId, accept: true, member: true }, { type: "respond", requestId, accept: false });
    out.push({ type: "reportProblem", kind: "ticket", id: requestId, reason: "Something else" }, { type: "resolveProblem", kind: "ticket", id: requestId });
  }
  for (const listingId of [c.l1, c.l2]) {
    out.push({ type: "take", listingId, qty: 1, amount: "", msg: "", member: true }, { type: "take", listingId, qty: 4, amount: "", msg: "", member: true },
      { type: "offer", listingId, qty: 1, amount: "30", msg: "", member: true }, { type: "withdraw", listingId }, { type: "shareListing", isoId: c.iso, listingId });
  }
  for (const id of [c.iso, c.alert]) {
    out.push({ type: "setAlert", id, paused: true }, { type: "closeInterest", id }, { type: "shareListing", isoId: id, listingId: c.l1 },
      { type: "saveInterest", data: { id, eventId: c.ev, qty: 1, budget: "40", note: "", expires: dateAfter(c.w.now, 3) } });
    for (const holdingId of [c.evesHolding, c.dansHolding]) out.push({ type: "isoReply", isoId: id, holdingId, qty: 2, counter: false, price: "", method: "app", file: null, payHandle: "@x", note: "" });
  }
  for (const holdingId of [c.evesHolding, c.dansHolding]) out.push({ type: "list", holdingId, qty: 1, ask: "35", method: "app", payHandle: "@x", file: null });
  out.push({ type: "withdrawItem", id: c.item }, { type: "requestItem", id: c.item, offer: "10", msg: "", shareContact: true }, { type: "withdrawShare", id: c.share });
  for (const type of ["acceptItemReq", "declineItemReq", "releaseItemReq", "cancelItemReq", "itemPickedUp"]) out.push({ type, id: c.greq });
  out.push({ type: "itemConsent", id: c.greq, side: "buyer" }, { type: "itemConsent", id: c.greq, side: "seller" }, { type: "setPickup", id: c.greq, at: wallAfter(c.w.now, 1, "17:00") },
    { type: "reportProblem", kind: "goods", id: c.greq, reason: "Something else" }, { type: "resolveProblem", kind: "goods", id: c.greq });
  out.push({ type: "removeEvent", eventId: c.ev }, { type: "addHolding", eventId: c.ev, tier: "t1", qty: 4, paid: "40" }, { type: "joinAlert", eventId: c.ev, qty: 4, max: "2000" },
    { type: "saveInterest", data: { eventId: c.ev, qty: 4, budget: "40", note: "", expires: dateAfter(c.w.now, 3) } });
  return out;
}

describe("canaries (C-DESIGN §3.1, §9.1)", () => {
  const c = canaryWorld();
  const viewers: TestPerson[] = [ANNC, BOBC, CAT, DAN, EVE, FAY, GUS];

  it("each private value reaches only the people allowed to see it", () => {
    const leaks: string[] = [];
    for (const p of viewers) {
      const text = JSON.stringify(seen(c.w, p));
      for (const [k, v] of forbidden(p.userId)) if (text.includes(v)) leaks.push(`${p.name} sees ${k} (${v})`);
      if (text.includes(TYPED_HANDLE)) leaks.push(`${p.name} sees the handle typed with a listing (protocol 2 drops it)`);
    }
    expect(leaks).toEqual([]);
    expect(JSON.stringify(c.w.doc)).not.toContain(TYPED_HANDLE); // never stored
    // ...and each does reach them (the canaries are really in the world: a scan for nothing would pass anything).
    const missing: string[] = [];
    for (const p of viewers) {
      const text = JSON.stringify(seen(c.w, p));
      for (const k of Object.keys(CANARY) as Canary[]) if (MAY_SEE[k].includes(p.userId) && !text.includes(CANARY[k])) missing.push(`${p.name} misses ${k}`);
    }
    expect(missing).toEqual([]);
  });

  it("a private alert: not its existence, not a count, for anyone else (not even the event's seller)", () => {
    for (const p of [ANN, BOBC, DAN, EVE, FAY, GUS]) {
      const v = seen(c.w, p);
      expect(v.interests.filter((i) => i.kind === "alert"), p.name).toEqual([]);
      expect(JSON.stringify(v).includes(c.alert), p.name).toBe(false);
      // The max as a number (987.65) or as money ($987.65, or $987 without its cents). Not the bare "987": a random 16-hex id
      // contains it now and then, so that check failed intermittently (C6 rehearsal §6.2).
      expect(JSON.stringify(v).includes("987.65"), p.name).toBe(false);
      expect(JSON.stringify(v).includes("$987"), p.name).toBe(false);
    }
    expect(seen(c.w, CAT).interests.filter((i) => i.kind === "alert").map((i) => [i.max, i.qty])).toEqual([[987.65, 3]]);
  });

  it("no refusal, toast or notification the engine sends anyone carries a canary they may not see", () => {
    const actions = battery(c);
    expect(actions.length).toBeGreaterThan(60);
    const leaks: string[] = [];
    for (const p of [FAY, GUS, CAT, DAN, EVE, BOBC]) {
      const banned = forbidden(p.userId);
      for (const a of actions) for (const text of textsFor(c.w, p.userId, a)) for (const [k, v] of banned) if (text.includes(v)) leaks.push(`${p.name} ${a.type}: ${k} in "${text}"`);
    }
    expect(leaks).toEqual([]);
  });

  it("someone else's alert id answers exactly as an id that doesn't exist (no existence oracle)", () => {
    const nowhere = "iso-0123456789abcdef";
    const probes = (id: string): Action[] => [
      { type: "setAlert", id, paused: true }, { type: "closeInterest", id }, { type: "shareListing", isoId: id, listingId: c.l1 },
      { type: "isoReply", isoId: id, holdingId: c.dansHolding, qty: 1, counter: false, price: "", method: "app", file: null, payHandle: "@x", note: "" },
      { type: "saveInterest", data: { id, eventId: c.ev, qty: 1, budget: "40", note: "", expires: dateAfter(c.w.now, 3) } },
    ];
    for (const p of [ANN, DAN, FAY]) {
      const real = probes(c.alert).map((a) => textsFor(c.w, p.userId, a));
      const fake = probes(nowhere).map((a) => textsFor(c.w, p.userId, a));
      expect(real, p.name).toEqual(fake);
    }
  });

  it("§3.7: a held reply's answer doesn't depend on the requester's private holding (review P3)", () => {
    // Eve holds 3 privately and asks for 2 more: Dan's reply of 2 would put her over 4 per person, and his reply of 1 wouldn't.
    // Both get the same answer, so trying quantities tells Dan nothing; Eve's own answer checks her limit.
    const reply = (qty: number) => textsFor(c.w, DAN.userId, { type: "isoReply", isoId: c.iso, holdingId: c.dansHolding, qty, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@dan-ng", note: "", membersOnly: false });
    expect(reply(2)).toEqual(reply(1));
    expect(reply(2)).toEqual(["Sent to Eve. If they accept within 6 hours, it's reserved for them for 15 minutes while they pay you."]);
  });
});

// ── Reveals ──────────────────────────────────────────────────────────────────────────────

describe("reveals happen exactly at their step (C-CONTRACT §2)", () => {
  /** Ann lists 2 at $35 on her event; her profile's handle (@ann-lee, saved before B1) is how she's paid. */
  function market() {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    const l = w.listTickets(ANN, ev, { qty: 2, obo: true });
    return { w, ev, l };
  }
  /**
   * Where to pay for listing l, as the viewer has it: their own exchange's copy (`pay`, follow-on B1), as people read it, or a listing's
   * own handle (an exchange from before B1). Since protocol 2 the copy is how it reaches a buyer.
   */
  const handleFor = (v: View, l: string): string | undefined => {
    const mine = v.requests.find((r) => r.listingId === l && r.buyerId === v.viewer.id && r.pay);
    return mine?.pay ? mine.pay.map((m) => E.formatPayMethod(m)).join(" | ") : listingIn(v, l)?.payHandle;
  };

  it("tickets: the payment handle from the reservation on; email from the reservation to the transfer; full names once linked", () => {
    const { w, l } = market();
    const at = (step: string) => {
      const bob = seen(w, BOB), ann = seen(w, ANN), fay = seen(w, FAY);
      return {
        step,
        bobSeesHandle: handleFor(bob, l) ?? null,
        bobSeesAnn: [bob.people[ANN.userId]?.name, bob.people[ANN.userId]?.contact ?? null],
        annSeesBob: [ann.people[BOB.userId]?.name ?? null, ann.people[BOB.userId]?.contact ?? null],
        faySeesHandle: handleFor(fay, l) ?? null,
        faySeesAnn: [fay.people[ANN.userId]?.name, fay.people[ANN.userId]?.contact ?? null],
      };
    };
    const steps = [at("listed")];
    const r = w.take(BOB, l);
    steps.push(at("accepted"));
    for (const [step, who, type] of [["paid", BOB, "markPaid"], ["confirmed", ANN, "confirmPayment"], ["sent", ANN, "markTransferred"], ["completed", BOB, "buyerReceived"]] as const) {
      w.ok(who.userId, { type, requestId: r });
      steps.push(at(step));
    }
    const annEmail = emailOf(ANN), bobEmail = emailOf(BOB);
    const fay = { faySeesHandle: null, faySeesAnn: ["Ann L.", null] };
    expect(steps).toEqual([
      { step: "listed", bobSeesHandle: null, bobSeesAnn: ["Ann L.", null], annSeesBob: [null, null], ...fay },
      { step: "accepted", bobSeesHandle: "@ann-lee", bobSeesAnn: ["Ann Lee", annEmail], annSeesBob: ["Bob Diaz", bobEmail], ...fay },
      { step: "paid", bobSeesHandle: "@ann-lee", bobSeesAnn: ["Ann Lee", annEmail], annSeesBob: ["Bob Diaz", bobEmail], ...fay },
      { step: "confirmed", bobSeesHandle: "@ann-lee", bobSeesAnn: ["Ann Lee", annEmail], annSeesBob: ["Bob Diaz", bobEmail], ...fay },
      { step: "sent", bobSeesHandle: "@ann-lee", bobSeesAnn: ["Ann Lee", annEmail], annSeesBob: ["Bob Diaz", bobEmail], ...fay },
      { step: "completed", bobSeesHandle: "@ann-lee", bobSeesAnn: ["Ann Lee", null], annSeesBob: ["Bob Diaz", null], ...fay },
    ]);
  });

  it("an offer links two people (full names) but reveals nothing more until a reservation; a cancelled one takes it back", () => {
    const { w, l } = market();
    const o = must(w.ok(CAT.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    const look = () => { const cat = seen(w, CAT), ann = seen(w, ANN); return [handleFor(cat, l) ?? null, cat.people[ANN.userId]?.name, cat.people[ANN.userId]?.contact ?? null, ann.people[CAT.userId]?.name, ann.people[CAT.userId]?.contact ?? null]; };
    expect(look()).toEqual([null, "Ann Lee", null, "Cat Moore", null]); // pending
    w.ok(ANN.userId, { type: "counter", requestId: o, amount: "33" });
    expect(look()).toEqual([null, "Ann Lee", null, "Cat Moore", null]); // countered
    w.ok(CAT.userId, { type: "respond", requestId: o, accept: true, member: false });
    expect(look()).toEqual(["@ann-lee", "Ann Lee", emailOf(ANN), "Cat Moore", emailOf(CAT)]); // accepted: reserved
    w.ok(CAT.userId, { type: "cancel", requestId: o });
    expect(look()).toEqual([null, "Ann Lee", null, "Cat Moore", null]); // cancelled: linked, nothing revealed
  });

  it("a held reply reaches only its requester, with the handle once they accept it", () => {
    const { w, ev } = market();
    const iso = w.requestFor(DAN, ev, { budget: "40" });
    const r = must(w.ok(EVE.userId, { type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
      then: { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@eve-park", note: "For you.", membersOnly: false } }).id, "held");
    const heldId = must(w.doc.requests.find((x) => x.id === r)?.listingId, "held listing");
    const dan = seen(w, DAN);
    expect(listingIn(dan, heldId)).toMatchObject({ isoReplyFor: iso, note: "For you.", numbers: { reserved: 1, completed: 0, available: 0 } });
    expect(handleFor(dan, heldId)).toBeUndefined();
    expect(dan.people[EVE.userId]).toMatchObject({ name: "Eve Park" });
    expect(dan.people[EVE.userId]?.contact).toBeUndefined(); // proposed isn't a reservation yet
    for (const p of [ANN, BOB, CAT, FAY]) expect(listingIn(seen(w, p), heldId), p.name).toBeUndefined();
    // Protocol 2: the handle typed with the reply is dropped; Eve is paid through her profile (her handle from before B1).
    expect(listingIn(seen(w, EVE), heldId)).toMatchObject({ isoReplyFor: iso, payKinds: ["other"] });
    expect(listingIn(seen(w, EVE), heldId)).not.toHaveProperty("payHandle");
    w.ok(DAN.userId, { type: "respond", requestId: r, accept: true, member: false });
    const after = seen(w, DAN);
    expect(handleFor(after, heldId)).toBe("@eve-park");
    expect(after.people[EVE.userId]?.contact).toBe(emailOf(EVE));
  });

  it("goods: email only once both agreed to share it, while held and after pickup", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const it = w.postItem(ANN);
    const g = must(w.ok(BOB.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).id, "request");
    const look = () => [seen(w, BOB).people[ANN.userId]?.contact ?? null, seen(w, ANN).people[BOB.userId]?.contact ?? null, seen(w, BOB).people[ANN.userId]?.name];
    expect(look()).toEqual([null, null, "Ann Lee"]); // linked by the request
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    expect(look()).toEqual([null, null, "Ann Lee"]); // only the seller agreed
    w.ok(BOB.userId, { type: "itemConsent", id: g, side: "buyer" });
    expect(look()).toEqual([emailOf(ANN), emailOf(BOB), "Ann Lee"]);
    w.ok(BOB.userId, { type: "itemPickedUp", id: g });
    expect(look()).toEqual([emailOf(ANN), emailOf(BOB), "Ann Lee"]);
    expect(seen(w, FAY).people[ANN.userId]).toEqual({ name: "Ann L.", first: "Ann", color: E.colorFor(ANN.userId), demo: true });
  });

  it("a share links the seller and the requester (full names, the share itself), and nobody else", () => {
    const { w, ev, l } = market();
    const iso = w.requestFor(DAN, ev, { budget: "40" });
    const x = must(w.ok(ANN.userId, { type: "shareListing", isoId: iso, listingId: l }).id, "share");
    expect(seen(w, DAN).responses.map((s) => s.id)).toEqual([x]);
    expect(seen(w, ANN).responses.map((s) => s.id)).toEqual([x]);
    expect(seen(w, DAN).people[ANN.userId]).toMatchObject({ name: "Ann Lee" });
    expect(seen(w, DAN).people[ANN.userId]?.contact).toBeUndefined();
    for (const p of [BOB, CAT, EVE, FAY]) expect(seen(w, p).responses, p.name).toEqual([]);
    expect(seen(w, FAY).people[DAN.userId]?.name).toBe("Dan N.");
  });

  it("you: your full name, email and payment methods, as the viewer (and name and email in people); a first-time viewer is there too", () => {
    const { w } = market();
    const v = seen(w, GUS);
    expect(v.viewer).toEqual({ id: GUS.userId, name: "Gus Olsen", email: emailOf(GUS), payMethods: [] }); // never from the email (B1.6)
    expect(v.people[GUS.userId]).toEqual({ name: "Gus Olsen", first: "Gus", color: E.colorFor(GUS.userId), demo: true, contact: emailOf(GUS) });
    expect(v.requests).toEqual([]);
    expect(v.holdings).toEqual([]);
    expect(v.listings).toHaveLength(1); // Ann's public listing
    const ann = seen(w, ANN);
    expect(ann.viewer.payMethods).toEqual([{ kind: "other", value: "@ann-lee" }]); // her handle from before B1, word for word
    expect(ann.people[ANN.userId]).toEqual({ name: "Ann Lee", first: "Ann", color: E.colorFor(ANN.userId), demo: true, contact: emailOf(ANN) });
  });
});

// ── Other people's records: counts and states only ──────────────────────────────────────

describe("numbers and states are the server's, with when they change (C-DESIGN §3.5)", () => {
  it("a listing's counts come with the earliest hold to lapse for those who may see it, and follow the clock without a sweep", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    const l = w.listTickets(ANN, ev, { qty: 3 });
    const r1 = w.take(BOB, l);
    w.advance(5 * MIN);
    w.take(DAN, l);
    const hold1 = must(w.doc.requests.find((r) => r.id === r1)?.holdUntil, "hold");
    let fay = seen(w, FAY);
    expect(listingIn(fay, l)).toMatchObject({ numbers: { reserved: 2, completed: 0, available: 1 }, numbersUntil: null }); // nobody's hold is Fay's to see
    expect(fay.requests).toEqual([]);
    expect(fay.nextRefreshAt).toBeNull();
    expect(listingIn(seen(w, ANN), l)?.numbersUntil).toBe(hold1); // the seller is a party to every request on it
    expect(seen(w, BOB).nextRefreshAt).toBe(hold1); // his own hold
    w.advance(11 * MIN); // Bob's hold lapsed; nothing swept yet
    fay = seen(w, FAY);
    const hold2 = must(w.doc.requests.find((r) => r.buyerId === DAN.userId)?.holdUntil, "hold 2");
    expect(listingIn(fay, l)).toMatchObject({ numbers: { reserved: 1, completed: 0, available: 2 }, numbersUntil: null });
    expect(listingIn(seen(w, ANN), l)?.numbersUntil).toBe(hold2);
    expect(listingIn(seen(w, DAN), l)?.numbersUntil).toBe(hold2);
    w.advance(5 * MIN);
    expect(listingIn(seen(w, FAY), l)).toMatchObject({ numbers: { reserved: 0, completed: 0, available: 3 }, numbersUntil: null });
  });

  it("paid steps never lapse, so they set no time; the event's cutoff ends unpaid holds", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN, { start: wallAfter(w.now, 0, "12:40"), deadline: undefined }); // the event starts in 40 minutes
    const l = w.listTickets(ANN, ev, { qty: 2 });
    const r = w.take(BOB, l);
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    expect(listingIn(seen(w, ANN), l)?.numbersUntil).toBeNull();
    w.take(DAN, l);
    const hold = must(w.doc.requests.find((x) => x.buyerId === DAN.userId)?.holdUntil, "hold");
    expect(listingIn(seen(w, ANN), l)?.numbersUntil).toBe(hold);
    expect(listingIn(seen(w, FAY), l)?.numbersUntil).toBeNull();
  });

  it("an item's state says it's on hold without saying for whom, or until when, to anyone but its two parties", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const it = w.postItem(ANN);
    const until = E.atMs(must(w.doc.goods[0]?.until, "until"));
    const g = must(w.ok(BOB.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).id, "request");
    expect(itemIn(seen(w, FAY), it)?.state).toEqual({ key: "available", label: "Available", tone: "good" });
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    const holdUntil = must(w.doc.goodsReqs.find((x) => x.id === g)?.holdUntil, "hold");
    const fay = seen(w, FAY);
    expect(itemIn(fay, it)).toMatchObject({ state: { key: "reserved", label: "On hold", tone: "warn" }, stateUntil: until });
    expect(fay.goodsReqs).toEqual([]);
    expect(fay.nextRefreshAt).toBe(until);
    for (const p of [ANN, BOB]) expect(itemIn(seen(w, p), it)?.stateUntil, p.name).toBe(holdUntil);
    w.advance(49 * HOUR);
    expect(itemIn(seen(w, FAY), it)).toMatchObject({ state: { key: "available" }, stateUntil: until });
  });

  it("a stranger can't work out the pickup time two people agreed: nothing in their view moves with it (review P1)", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const it = w.postItem(ANN, { area: "Rittenhouse" });
    const g = must(w.ok(BOB.userId, { type: "requestItem", id: it, msg: "", shareContact: false }).id, "request");
    const stranger = (p: TestPerson) => { const v = seen(w, p); return { item: itemIn(v, it), nextRefreshAt: v.nextRefreshAt }; };
    w.advance(7 * MIN);
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true }); // held for 48 hours from this minute
    const held = [stranger(FAY), stranger(CAT)];
    w.advance(20 * MIN);
    w.ok(BOB.userId, { type: "setPickup", id: g, at: wallAfter(w.now, 2, "17:30") }); // the hold now ends a day after it
    expect([stranger(FAY), stranger(CAT)]).toEqual(held);
    const moved = wallAfter(w.now, 3, "09:15");
    w.ok(ANN.userId, { type: "setPickup", id: g, at: moved });
    expect([stranger(FAY), stranger(CAT)]).toEqual(held);
    const hold = must(w.doc.goodsReqs.find((x) => x.id === g)?.holdUntil, "hold");
    expect(hold).toBe(E.wallToMs(moved) + DAY);
    for (const p of [FAY, CAT]) {
      const text = JSON.stringify(seen(w, p));
      for (const leak of [String(hold), String(E.wallToMs(moved)), moved, "pickupAt"]) expect(text.includes(leak), `${p.name}: ${leak}`).toBe(false);
    }
    // The two parties do see it: their item's stateUntil and their next refresh are the hold's end.
    for (const p of [ANN, BOB]) {
      const v = seen(w, p);
      expect([itemIn(v, it)?.stateUntil, v.nextRefreshAt], p.name).toEqual([hold, hold]);
    }
  });

  it("an accepted offer and an \"I'll take it\" look the same to a stranger: no hold's end, only public times (review P1b)", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    const l1 = w.listTickets(ANN, ev, { obo: true });
    const l2 = w.listTickets(CAT, ev);
    const offer = must(w.ok(BOB.userId, { type: "offer", listingId: l1, qty: 1, amount: "25", msg: "", member: false }).id, "offer");
    w.ok(ANN.userId, { type: "accept", requestId: offer });
    const took = w.take(DAN, l2);
    const holdOf = (id: string) => must(w.doc.requests.find((r) => r.id === id)?.holdUntil, "hold");
    expect([holdOf(offer) - w.now, holdOf(took) - w.now]).toEqual([2 * HOUR, 15 * MIN]); // the two kinds of hold differ...
    const fay = seen(w, FAY);
    for (const l of [l1, l2]) expect(listingIn(fay, l), l).toMatchObject({ numbers: { reserved: 1, completed: 0, available: 0 }, numbersUntil: null });
    expect(fay.nextRefreshAt).toBeNull(); // ...but a stranger sees neither
    // Each party sees the holds it's a party to, and nobody else's.
    expect([listingIn(seen(w, ANN), l1)?.numbersUntil, listingIn(seen(w, BOB), l1)?.numbersUntil]).toEqual([holdOf(offer), holdOf(offer)]);
    expect([listingIn(seen(w, CAT), l2)?.numbersUntil, listingIn(seen(w, DAN), l2)?.numbersUntil]).toEqual([holdOf(took), holdOf(took)]);
    expect([listingIn(seen(w, DAN), l1)?.numbersUntil, listingIn(seen(w, BOB), l2)?.numbersUntil]).toEqual([null, null]);
    // A train's departure is public, so everyone gets that one.
    const train = must(w.ok(EVE.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(w.now, 1, "06:00"),
      openUntil: wallAfter(w.now, 3, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "40" }] }).id, "train");
    const departs = wallAfter(w.now, 1, "10:00");
    const lt = w.listTickets(EVE, train, { method: "file", departsAt: departs });
    expect(listingIn(seen(w, FAY), lt)?.numbersUntil).toBe(E.wallToMs(departs));
  });

  it("every listing's numbers and every item's state equal the server's own figures, for every viewer", () => {
    const c = canaryWorld();
    const server = E.withEngine({ doc: c.w.doc, people: c.w.people, now: c.w.now }, () => ({
      numbers: new Map(c.w.doc.listings.map((l) => [l.id, E.listingNumbers(c.w.doc, l)])),
      states: new Map(c.w.doc.goods.map((it) => [it.id, E.itemState(c.w.doc, it)])),
    }));
    for (const p of [ANN, BOBC, CAT, DAN, EVE, FAY]) {
      const v = seen(c.w, p);
      for (const l of v.listings) expect(l.numbers, `${p.name} ${l.id}`).toEqual(server.numbers.get(l.id));
      for (const it of v.goods) expect(it.state, `${p.name} ${it.id}`).toEqual(server.states.get(it.id));
    }
  });
});

// ── What other people never receive ─────────────────────────────────────────────────────

describe("what never reaches someone else", () => {
  it("a stranger gets no requests, goods requests, holdings, shares, alerts, notifications or private profile fields", () => {
    const c = canaryWorld();
    const v = seen(c.w, FAY);
    expect([v.requests, v.goodsReqs, v.holdings, v.responses, v.notifications]).toEqual([[], [], [], [], []]);
    expect(v.interests.map((i) => i.kind)).toEqual(["iso"]);
    expect(Object.keys(v.interests[0] ?? {}).sort()).toEqual(["budget", "createdAt", "eventId", "expires", "id", "kind", "note", "qty", "status", "userId"]);
    for (const [id, p] of Object.entries(v.people)) if (id !== FAY.userId) expect([id, p.contact, "pay" in p]).toEqual([id, undefined, false]);
    for (const l of v.listings) expect(["payHandle", "history", "holdingId", "record", "isoReplyFor"].filter((k) => k in l), l.id).toEqual([]);
    for (const it of v.goods) expect("history" in it, it.id).toBe(false);
    expect(JSON.stringify(v)).not.toMatch(/createdBy|"file"|photos|dedupe|"email":"(?!user-fay)/);
  });

  it("notifications: the viewer's own only, the newest 100, with the unread count over all of them", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const notes = Array.from({ length: 120 }, (_, k) => ({ id: `n${String(k).padStart(15, "0")}`, userId: ANN.userId, text: `Note ${k}`, link: { name: "activity", tab: "todo" }, at: w.now - k * MIN, read: k % 2 === 0 }));
    const theirs = { id: "nother000000000", userId: BOB.userId, text: "Bob's note", link: null, at: w.now, read: false };
    const v = seen(w, ANN, { notifications: [theirs, ...notes] });
    expect(v.notifications).toHaveLength(VIEW_NOTIFICATIONS);
    expect(v.notifications.every((n) => n.userId === ANN.userId)).toBe(true);
    expect(v.notifications[0]).toEqual({ id: "n000000000000000", userId: ANN.userId, text: "Note 0", link: { name: "activity", tab: "todo" }, at: w.now, read: true });
    expect(v.unreadCount).toBe(61); // the store's count, passed through: Bob's note and 60 of Ann's
  });
});

// ── The closure rule and the contract ────────────────────────────────────────────────────

describe("the closure rule (every id resolves) and the view's envelope", () => {
  it("every view in a busy world meets the contract, for everyone, at every step", () => {
    const c = canaryWorld();
    const w = c.w;
    // More steps: a completed exchange, a release after a dispute, a goods pickup, a closed request.
    w.ok(ANN.userId, { type: "confirmPayment", requestId: c.r1 });
    w.ok(ANN.userId, { type: "markTransferred", requestId: c.r1 });
    w.ok(BOB.userId, { type: "buyerReceived", requestId: c.r1 });
    w.ok(ANN.userId, { type: "acceptItemReq", id: c.greq, shareContact: true });
    w.ok(DAN.userId, { type: "itemPickedUp", id: c.greq });
    w.ok(EVE.userId, { type: "closeInterest", id: c.iso, reason: "cancelled" });
    for (const p of [ANN, BOBC, CAT, DAN, EVE, FAY, GUS]) seen(w, p);
    w.advance(3 * DAY);
    w.sweep();
    for (const p of [ANN, BOBC, CAT, DAN, EVE, FAY, GUS]) seen(w, p);
  });

  it("someone with no profile row is \"A classmate\", and still resolves", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(DAN);
    w.listTickets(DAN, ev, { qty: 1 });
    const v = seen(w, FAY, { withoutRows: [DAN.userId] });
    expect(v.people[DAN.userId]).toEqual({ name: "A classmate", first: "A classmate", color: E.colorFor(DAN.userId), demo: true });
  });

  it("the envelope: protocol, the server's time, the world and version as given, inert keys empty", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const v = seen(w, ANN, { worldId: "test-envelope", version: 7 });
    expect(v).toMatchObject({ protocol: E.HANDOFF_PROTOCOL, mode: "live", worldId: "test-envelope", version: 7, serverNow: w.now, nextRefreshAt: null, unreadCount: 0, v: 11,
      strikes: {}, policies: {}, alertPrefs: {}, seen: {}, feedSeen: {}, suggestions: [], feedbackGiven: false, clockOffset: 0, tick: 0 });
    expect([v.events, v.listings, v.requests, v.interests, v.goods, v.holdings]).toEqual([[], [], [], [], [], []]);
  });

  it("is plain JSON: the view before the wire equals the view after it, with no undefined values or NaN", () => {
    const c = canaryWorld();
    for (const p of [ANN, BOBC, FAY]) {
      const raw = rawViewOf(c.w, p);
      const bad: string[] = [];
      const walk = (v: unknown, at: string): void => {
        if (v === undefined) bad.push(`${at}: undefined`);
        else if (typeof v === "number" && !Number.isFinite(v)) bad.push(`${at}: ${v}`);
        else if (Array.isArray(v)) v.forEach((x, k) => walk(x, `${at}[${k}]`));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
      };
      walk(raw, p.name);
      expect(bad).toEqual([]);
      expect(JSON.parse(JSON.stringify(raw))).toStrictEqual(raw);
    }
  });
});

describe("allowlists, not deletion", () => {
  it("a field nobody listed never leaves the server, on any record or anything nested in one", () => {
    const c = canaryWorld();
    const doc = structuredClone(c.w.doc) as unknown as Record<string, unknown>;
    const planted: Record<string, number> = {};
    const plant = (v: unknown, key: string): void => {
      if (Array.isArray(v)) v.forEach((x) => plant(x, key));
      else if (v && typeof v === "object") {
        for (const x of Object.values(v)) plant(x, key);
        (v as Record<string, unknown>)["xSecret"] = "CANARY-FIELD";
        planted[key] = (planted[key] ?? 0) + 1;
      }
    };
    const keys = ["events", "holdings", "listings", "requests", "interests", "responses", "goods", "goodsReqs"];
    for (const key of keys) plant(doc[key], key);
    // Every collection, and the objects nested in records (tiers, history lines, consent, reports, a problem).
    expect(keys.filter((k) => !planted[k])).toEqual([]);
    expect(Object.values(planted).reduce((t, n) => t + n, 0)).toBeGreaterThanOrEqual(30);
    const w = new LiveTestWorld({ people: c.w.people, now: c.w.now, doc: deepFreeze(doc as unknown as LiveWorld) });
    for (const p of [ANN, BOBC, CAT, DAN, EVE, FAY]) {
      const text = JSON.stringify(seen(w, p));
      expect(text.includes("CANARY-FIELD") || text.includes("xSecret"), p.name).toBe(false);
    }
  });

  it("never writes into the stored document", () => {
    const c = canaryWorld();
    const before = JSON.stringify(c.w.doc);
    for (const p of [ANN, BOBC, CAT, FAY]) seen(c.w, p); // the documents are deep-frozen: a write would throw
    expect(JSON.stringify(c.w.doc)).toBe(before);
  });
});

describe("damaged references are dropped and logged, never sent or thrown", () => {
  it("a listing whose event is gone, a request whose listing is gone, a goods request without its item, a share without its request", () => {
    const c = canaryWorld();
    const doc = structuredClone(c.w.doc) as LiveWorld;
    const ghostEvent = "ev-00000000000000aa";
    const listing = must(doc.listings.find((l) => l.id === c.l2), "l2");
    listing.eventId = ghostEvent; // and Dan's offer on it now points at a listing the view can't show
    doc.goodsReqs.push({ ...must(doc.goodsReqs[0], "goods request"), id: "gr00000000000000bb", itemId: "g00000000000000cc" });
    doc.responses.push({ ...must(doc.responses[0], "share"), id: "rsp-00000000000000dd", isoId: "iso-00000000000000ee" });
    const w = new LiveTestWorld({ people: c.w.people, now: c.w.now, doc: deepFreeze(doc) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ann = seen(w, ANN);
    expect(ann.listings.map((l) => l.id)).not.toContain(c.l2);
    expect(ann.requests.map((r) => r.id)).not.toContain(c.offer);
    expect(ann.goodsReqs.map((g) => g.id)).not.toContain("gr00000000000000bb");
    expect(ann.responses.map((x) => x.id)).not.toContain("rsp-00000000000000dd");
    const logged = warn.mock.calls.map((args) => String(args[0])).join("\n");
    for (const id of [c.l2, c.offer, "gr00000000000000bb", "rsp-00000000000000dd"]) expect(logged).toContain(id);
    expect(logged).not.toMatch(/CANARY|@|\$/); // ids only
  });

  it("refuses to run outside withEngine, at another time, or for someone with no profile row", () => {
    const c = canaryWorld();
    const ctx = { worldId: "test-c4" as const, version: 1, now: c.w.now, people: new Map([[ANN.userId, rowOf(ANN)]]), notifications: [], unreadCount: 0 };
    const doc = c.w.doc as unknown as WorldDoc;
    expect(() => project(doc, ANN.userId, ctx)).toThrow();
    expect(() => E.withEngine({ doc: c.w.doc, people: c.w.people, now: c.w.now + 1 }, () => project(doc, ANN.userId, ctx))).toThrow(/at the view's time/);
    expect(() => E.withEngine({ doc: c.w.doc, people: c.w.people, now: c.w.now }, () => project(doc, BOB.userId, ctx))).toThrow(/no profile row/);
  });
});

describe("removable events (canRemove) and who added them", () => {
  it("only the creator sees canRemove: true while no listing or public request refers to the event, exactly removeEvent's rule", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const quiet = w.addEvent(ANN, { title: "Quiet Night" });
    const busy = w.addEvent(ANN, { title: "Busy Night" });
    const asked = w.addEvent(ANN, { title: "Asked Night" });
    w.listTickets(ANN, busy, { qty: 1 });
    w.requestFor(BOB, asked);
    const flags = () => Object.fromEntries(seen(w, ANN).events.map((e) => [e.title, e.canRemove]));
    expect(flags()).toEqual({ "Quiet Night": true, "Busy Night": false, "Asked Night": false });
    for (const p of [BOB, FAY]) expect(seen(w, p).events.map((e) => "canRemove" in e), p.name).toEqual([false, false, false]);
    const server = () => E.withEngine({ doc: w.doc, people: w.people, now: w.now }, () => [quiet, busy, asked].map((id) => !E.eventInPublicUse(w.doc, id)));
    expect(server()).toEqual([true, false, false]);
    expect(seen(w, BOB).events.map((e) => [e.title, e.addedBy, e.sourcesNote])).toEqual([
      ["Quiet Night", ANN.userId, "Added by Ann L. · details not checked by Handoff"],
      ["Busy Night", ANN.userId, "Added by Ann L. · details not checked by Handoff"],
      ["Asked Night", ANN.userId, "Added by Ann L. · details not checked by Handoff"],
    ]);
  });

  it("a classmate's private alert or self-reported ticket changes nothing the creator sees (review P2)", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const quiet = w.addEvent(ANN, { title: "Quiet Night" });
    const before = JSON.stringify(seen(w, ANN).events);
    expect(seen(w, ANN).events[0]?.canRemove).toBe(true);
    w.ok(CAT.userId, { type: "joinAlert", eventId: quiet, qty: 1, max: "" });
    expect(JSON.stringify(seen(w, ANN).events)).toBe(before);
    w.ok(DAN.userId, { type: "addHolding", eventId: quiet, tier: "t1", qty: 2, paid: "40" });
    expect(JSON.stringify(seen(w, ANN).events)).toBe(before);
    // Removing it turns Cat's alert off; Dan's ticket stays, with the event still in Dan's view (marked removed) so it resolves.
    w.advance(MIN);
    w.ok(ANN.userId, { type: "removeEvent", eventId: quiet });
    const dan = seen(w, DAN);
    expect(dan.holdings.map((h) => [h.eventId, h.qty])).toEqual([[quiet, 2]]);
    expect(dan.events.map((e) => [e.id, e.removedAt])).toEqual([[quiet, w.now]]);
    expect(seen(w, CAT).interests.map((i) => [i.kind, i.status])).toEqual([["alert", "closed"]]);
    for (const p of [ANN, FAY]) expect(seen(w, p).events, p.name).toEqual([]);
  });

  it("a removed event leaves the view, unless a record in it still refers to it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    w.ok(ANN.userId, { type: "removeEvent", eventId: ev });
    expect(seen(w, ANN).events).toEqual([]);
    expect(seen(w, FAY).events).toEqual([]);
  });
});

// ── Each screen's data (C-CONTRACT §3) ───────────────────────────────────────────────────

describe("every screen gets what it reads (C-CONTRACT §3), for the right viewer", () => {
  /**
   * Ann's event and 2 tickets; Bob's public request and alert there, and his reservation; Cat's open offer; Fay also looking;
   * Eve's unlisted ticket; Dan's public request for a desk chair, which Ann shares her chair with, and Dan's held request for it.
   */
  function screens() {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN, { notes: "Black tie." });
    const l = w.listTickets(ANN, ev, { qty: 2, obo: true });
    const iso = w.requestFor(BOB, ev, { qty: 2, budget: "35", note: "Two please." });
    const alert = must(w.ok(BOB.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "30" }).id, "alert");
    const fayIso = w.requestFor(FAY, ev, { qty: 1, budget: "40" });
    const r = w.take(BOB, l);
    const offer = must(w.ok(CAT.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "Cat's offer.", member: false }).id, "offer");
    const eveHolding = must(w.ok(EVE.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 1, paid: "40" }).id, "Eve's holding");
    const dIso = must(w.ok(DAN.userId, { type: "saveInterest", data: { qty: 1, budget: "50", note: "", expires: dateAfter(w.now, 10), goods: { title: "Desk chair", cat: "Furniture" } } }).id, "goods request");
    const chair = w.postItem(ANN, { obo: true });
    const share = must(w.ok(ANN.userId, { type: "shareItem", isoId: dIso, itemId: chair }).id, "share");
    const g = must(w.ok(DAN.userId, { type: "requestItem", id: chair, offer: "25", msg: "", shareContact: true }).id, "goods request on the chair");
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    return { w, ev, l, iso, alert, fayIso, r, offer, eveHolding, dIso, chair, share, g };
  }
  const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id).sort();
  const s = screens();

  it("Available and Wanted (anyone): events, public listings with counts, goods with states, public requests, public names", () => {
    const v = seen(s.w, GUS);
    expect(ids(v.events)).toEqual([s.ev]);
    expect(listingIn(v, s.l)?.numbers).toEqual({ reserved: 1, completed: 0, available: 1 });
    expect(itemIn(v, s.chair)?.state.key).toBe("reserved");
    expect(ids(v.interests)).toEqual([s.iso, s.fayIso, s.dIso].sort());
    expect([v.people[ANN.userId]?.name, v.people[BOB.userId]?.name, v.people[FAY.userId]?.name]).toEqual(["Ann L.", "Bob D.", "Fay Q."]);
    expect(v.requests).toEqual([]);
  });

  it("the event page for the buyer: the event, its listings, classmates looking; his request, alert and reservation, with where to pay", () => {
    const v = seen(s.w, BOB);
    expect(ids(v.events)).toEqual([s.ev]);
    expect(listingIn(v, s.l)).toMatchObject({ payKinds: ["other"], note: "" });
    // Where to pay is his reservation's own copy (Ann's handle from before B1, word for word); the listing has no handle beside it.
    expect(v.requests.find((r) => r.id === s.r)?.pay).toEqual([{ kind: "other", value: "@ann-lee" }]);
    expect(listingIn(v, s.l)).not.toHaveProperty("payHandle");
    expect(ids(v.interests)).toEqual([s.iso, s.alert, s.fayIso, s.dIso].sort());
    expect(v.interests.find((i) => i.id === s.alert)).toMatchObject({ kind: "alert", qty: 1, max: 30, paused: false });
    expect(ids(v.requests)).toEqual([s.r]); // not Cat's offer on the same listing
    expect(v.people[ANN.userId]).toMatchObject({ name: "Ann Lee", contact: emailOf(ANN) });
    expect(v.events[0]?.canRemove).toBeUndefined();
  });

  it("the event page and My activity for the seller: canRemove, her listing's own fields, every request on it, her holding", () => {
    const v = seen(s.w, ANN);
    expect(v.events[0]?.canRemove).toBe(false);
    expect(listingIn(v, s.l)).toMatchObject({ payKinds: ["other"], holdingId: expect.any(String) as unknown, history: [{ text: "Listed 2 tickets at $35" }] });
    expect(listingIn(v, s.l)).not.toHaveProperty("payHandle"); // protocol 2: a new listing stores none (the handle typed with it was dropped)
    expect(ids(v.requests)).toEqual([s.r, s.offer].sort());
    expect(v.requests.find((r) => r.id === s.offer)).toMatchObject({ msg: "Cat's offer.", price: 30, status: "pending" });
    expect(v.holdings.map((h) => [h.qty, h.source])).toEqual([[2, "self-reported"]]);
    expect([v.people[BOB.userId]?.contact, v.people[CAT.userId]?.name, v.people[CAT.userId]?.contact]).toEqual([emailOf(BOB), "Cat Moore", undefined]);
    // Her handle from before B1 is her one method, word for word (the Sell form's line); since protocol 2 nothing else carries it.
    expect(v.viewer.payMethods).toEqual([{ kind: "other", value: "@ann-lee" }]);
    expect(v.viewer).not.toHaveProperty("payHandle");
  });

  it("the item page: the buyer's own request, the seller's full name and (both agreed) email; the seller's history and requests", () => {
    const dan = seen(s.w, DAN);
    expect(itemIn(dan, s.chair)).toMatchObject({ state: { key: "reserved" } });
    expect(ids(dan.goodsReqs)).toEqual([s.g]);
    expect(dan.people[ANN.userId]).toMatchObject({ name: "Ann Lee", contact: emailOf(ANN) });
    expect(ids(dan.responses)).toEqual([s.share]); // the share with his request
    const ann = seen(s.w, ANN);
    expect(itemIn(ann, s.chair)?.history?.map((x) => x.text)).toContain("Posted at $30 OBO");
    expect(ids(ann.goodsReqs)).toEqual([s.g]);
    expect(ids(ann.responses)).toEqual([s.share]);
  });

  it("the request page: the request for everyone; its own alert only for its owner (others: not found); the owner's closing fields", () => {
    expect(seen(s.w, FAY).interests.find((i) => i.id === s.alert)).toBeUndefined();
    expect(seen(s.w, ANN).interests.find((i) => i.id === s.iso)).toMatchObject({ qty: 2, budget: 35, note: "Two please." });
    const own = screens(); // a copy to change
    own.w.ok(BOB.userId, { type: "closeInterest", id: own.iso, reason: "cancelled" });
    const closed = seen(own.w, BOB).interests.find((i) => i.id === own.iso);
    expect(closed).toMatchObject({ status: "closed", closedReason: "cancelled" });
    expect(closed?.closedAt).toBeGreaterThanOrEqual(own.w.now); // a stamp: the clock, kept ahead of the last one
    expect(seen(own.w, ANN).interests.find((i) => i.id === own.iso)).toBeUndefined(); // closed, and nothing of Ann's refers to it
  });

  it("the bell and Profile: own notifications and unread count; own name, email and payment methods, read-only", () => {
    const v = seen(s.w, ANN);
    expect(v.notifications.length).toBeGreaterThan(0); // Bob's reservation, Cat's offer, Dan's request for the chair
    expect(v.notifications.every((n) => n.userId === ANN.userId && n.read === false)).toBe(true);
    expect(v.unreadCount).toBe(v.notifications.length);
    expect(seen(s.w, BOB).viewer).toEqual({ id: BOB.userId, name: "Bob Diaz", email: emailOf(BOB), payMethods: [{ kind: "other", value: "@bob-diaz" }] });
    const eve = seen(s.w, EVE);
    expect(eve.holdings.map((h) => [h.id, h.source])).toEqual([[s.eveHolding, "self-reported"]]);
  });
});

// ── Bounds ───────────────────────────────────────────────────────────────────────────────

describe("size bounds (C-DESIGN §3.1)", () => {
  it(`other people's finished listings and items stay ${OTHERS_FINAL_DAYS} days, then leave; their owners keep them`, () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN, { start: wallAfter(w.now, 60) });
    const l = w.listTickets(ANN, ev, { qty: 1 });
    const it = w.postItem(ANN, { until: dateAfter(w.now, 50) });
    w.ok(ANN.userId, { type: "withdraw", listingId: l });
    w.ok(ANN.userId, { type: "withdrawItem", id: it });
    w.advance(OTHERS_FINAL_DAYS * DAY - MIN);
    expect([listingIn(seen(w, FAY), l)?.id, itemIn(seen(w, FAY), it)?.id]).toEqual([l, it]);
    w.advance(2 * MIN);
    expect([listingIn(seen(w, FAY), l), itemIn(seen(w, FAY), it)]).toEqual([undefined, undefined]);
    expect([listingIn(seen(w, ANN), l)?.id, itemIn(seen(w, ANN), it)?.id]).toEqual([l, it]);
  });

  it("the closure keeps what your own records refer to after it leaves everyone else's view (a listing, an item, a shared item)", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN, { start: wallAfter(w.now, 60) });
    const l = w.listTickets(ANN, ev, { qty: 1 });
    const r = w.take(BOB, l);
    for (const [who, type] of [[BOB, "markPaid"], [ANN, "confirmPayment"], [ANN, "markTransferred"], [BOB, "buyerReceived"]] as const) w.ok(who.userId, { type, requestId: r });
    const chair = w.postItem(ANN, { until: dateAfter(w.now, 50) });
    const g = must(w.ok(BOB.userId, { type: "requestItem", id: chair, msg: "", shareContact: true }).id, "goods request");
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    w.ok(BOB.userId, { type: "itemPickedUp", id: g });
    const wanted = must(w.ok(DAN.userId, { type: "saveInterest", data: { qty: 1, budget: "50", note: "", expires: dateAfter(w.now, 40), goods: { title: "Bookshelf", cat: "Furniture" } } }).id, "goods request");
    const shelf = w.postItem(ANN, { title: "Bookshelf", price: "25", until: dateAfter(w.now, 50) });
    const share = must(w.ok(ANN.userId, { type: "shareItem", isoId: wanted, itemId: shelf }).id, "share");
    w.ok(ANN.userId, { type: "withdrawItem", id: shelf });
    const dansIso = w.requestFor(DAN, ev, { budget: "40", days: 40 });
    const l2 = w.listTickets(ANN, ev, { qty: 1 });
    const share2 = must(w.ok(ANN.userId, { type: "shareListing", isoId: dansIso, listingId: l2 }).id, "share 2");
    w.ok(ANN.userId, { type: "withdraw", listingId: l2 });
    w.advance((OTHERS_FINAL_DAYS + 1) * DAY);
    const fay = seen(w, FAY);
    expect([listingIn(fay, l), itemIn(fay, chair), itemIn(fay, shelf), listingIn(fay, l2)]).toEqual([undefined, undefined, undefined, undefined]);
    const bob = seen(w, BOB); // his finished request and goods request still show, so what they refer to does too
    expect([bob.requests.map((x) => x.id), listingIn(bob, l)?.id, bob.goodsReqs.map((x) => x.id), itemIn(bob, chair)?.id]).toEqual([[r], l, [g], chair]);
    const dan = seen(w, DAN); // the shares with his requests, and the item and listing they point at
    expect([dan.responses.map((x) => x.id).sort(), itemIn(dan, shelf)?.state.key, listingIn(dan, l2)?.withdrawnAt !== undefined]).toEqual([[share, share2].sort(), "withdrawn", true]);
  });

  it("a closed public request stays only for those whose share refers to it, for 14 days", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN, { start: wallAfter(w.now, 60) });
    const l = w.listTickets(ANN, ev, { qty: 1 });
    const iso = w.requestFor(DAN, ev, { budget: "40", days: 30 });
    w.ok(ANN.userId, { type: "shareListing", isoId: iso, listingId: l });
    expect(seen(w, FAY).interests.map((i) => i.id)).toEqual([iso]);
    w.ok(DAN.userId, { type: "closeInterest", id: iso, reason: "fulfilled" });
    expect(seen(w, FAY).interests).toEqual([]);
    expect(seen(w, ANN).interests.map((i) => [i.id, i.status, "closedReason" in i])).toEqual([[iso, "closed", false]]); // public fields only
    w.advance(OTHERS_FINAL_DAYS * DAY + MIN);
    expect(seen(w, ANN).interests).toEqual([]);
    expect(seen(w, DAN).interests.map((i) => [i.id, i.closedReason])).toEqual([[iso, "fulfilled"]]);
  });

  it(`events leave ${EVENT_KEEP_DAYS} days after they close, unless a record in the view refers to them`, () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const start = wallAfter(w.now, 2);
    const ev = w.addEvent(ANN, { start });
    const l = w.listTickets(ANN, ev, { qty: 1 });
    const r = w.take(BOB, l);
    for (const [who, type] of [[BOB, "markPaid"], [ANN, "confirmPayment"], [ANN, "markTransferred"], [BOB, "buyerReceived"]] as const) w.ok(who.userId, { type, requestId: r });
    w.advance(E.atMs(start) + EVENT_KEEP_DAYS * DAY - HOUR - w.now); // an hour short of 30 days after it started
    expect(seen(w, FAY).events.map((e) => e.id)).toEqual([ev]);
    w.advance(2 * HOUR);
    expect(seen(w, FAY).events).toEqual([]);
    expect(seen(w, BOB).events.map((e) => e.id)).toEqual([ev]); // his completed request refers to it
    expect(seen(w, ANN).events.map((e) => e.id)).toEqual([ev]); // her listing does
  });

  it(`one's own finished records: the newest ${OWN_FINAL_CAP} per collection; open ones always`, () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(DAN, { start: wallAfter(w.now, 60) });
    const doc = structuredClone(w.doc) as LiveWorld;
    for (let k = 0; k < 205; k++) {
      doc.interests.push({ id: `iso-${k.toString(16).padStart(16, "0")}`, userId: DAN.userId, eventId: ev, kind: "iso", qty: 1, budget: 40, note: "", expires: dateAfter(w.now, 5),
        status: "closed", closedAt: w.now - k * MIN, closedReason: "cancelled", createdAt: w.now - DAY - k * MIN });
    }
    for (let k = 0; k < 3; k++) {
      doc.interests.push({ id: `iso-${(1000 + k).toString(16).padStart(16, "f")}`, userId: DAN.userId, eventId: ev, kind: "alert", qty: 1, max: null, budget: null, note: "", expires: null,
        status: "open", createdAt: w.now - 400 * DAY });
    }
    const big = new LiveTestWorld({ people: PEOPLE6, now: w.now, doc: deepFreeze(doc) });
    const dan = seen(big, DAN);
    const closed = dan.interests.filter((i) => i.status === "closed");
    expect(closed).toHaveLength(OWN_FINAL_CAP);
    expect(dan.interests.filter((i) => i.status === "open")).toHaveLength(3); // the oldest records of all, but open
    expect(Math.min(...closed.map((i) => i.createdAt))).toBe(w.now - DAY - 199 * MIN); // the 200 newest
  });
});
