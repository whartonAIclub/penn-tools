// Live behavior in the engine (C-DESIGN.md §10 C3; the cases §9.1 lists for live-engine.test.ts, and what store.ts relies on):
// withEngine and the shared state; people, names and inboxes; stamps and ids; the live guards; createEvent and removeEvent;
// seq; method file and the disputed Paid; the "transferred" source; refusals that reveal nothing private; the view's fields;
// the browser's applyWorld; invariants; nextDue and sweeps; the action tap; and the preview left as it was.
// Worlds run through helpers/worlds.ts: the real engine on frozen documents, notifications drained and invariants checked
// after every accepted action, as the store does. The people are labelled test accounts; no database and no sign-in.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action, GoodsRequest, Listing, LiveWorld, StoredEvent, TicketRequest } from "../../engine/index.js";
import { runSelfTests, seed } from "../../engine/preview.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, HOUR, LiveTestWorld, MIN, T0, dateAfter, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

/** The sample data as the preview module builds it at load, before anything here installs a live world. */
const SEED_AT_LOAD = JSON.stringify(seed());
const NOT_AVAILABLE = "That isn't available in Handoff.";
const UNSUPPORTED = "This kind of event isn't available in the pilot.";
const BUYER_LIMITS = "This offer can't be accepted right now because of the buyer's limits for this event. You can decline it or let it expire.";
/** §3.2's "Refused in live" types: the reducer's cases that aren't LIVE_TYPES. */
const REFUSED = ["request", "sellerReport", "buyerReport", "consent", "orgApprove", "orgDecline", "orgConfirm", "setPolicy", "reviewMissing",
  "reviewProblem", "clock", "seen", "feedbackGiven", "markFeedSeen", "setAlertPrefs", "suggestEvent", "readNote", "readAll"];

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}
const requestOf = (w: LiveTestWorld, id: string): TicketRequest => must(w.doc.requests.find((r) => r.id === id), `request ${id}`);
const listingOf = (w: LiveTestWorld, id: string): Listing => must(w.doc.listings.find((l) => l.id === id), `listing ${id}`);
const storedEvent = (w: LiveTestWorld, id: string): StoredEvent => must(w.doc.events.find((e) => e.id === id), `event ${id}`);
const goodsReqOf = (w: LiveTestWorld, id: string): GoodsRequest => must(w.doc.goodsReqs.find((g) => g.id === id), `goods request ${id}`);
/** A copy of a world's document to damage or extend by hand. */
const copyDoc = (w: LiveTestWorld): LiveWorld => structuredClone(w.doc) as LiveWorld;

/** Ann's event with 2 tickets listed at $35; optionally Bob has reserved one. */
function market(o: { reserve?: boolean; event?: Record<string, unknown>; list?: Parameters<LiveTestWorld["listTickets"]>[2] } = {}) {
  const w = new LiveTestWorld();
  const ev = w.addEvent(ANN, o.event ?? {});
  const l = w.listTickets(ANN, ev, { qty: 2, ...(o.list ?? {}) });
  const r = o.reserve ? w.take(BOB, l) : "";
  return { w, ev, l, r };
}
/** Bob's reservation on Ann's listing, through Paid. */
function paidMarket(o: Parameters<typeof market>[0] = {}) {
  const m = market({ ...o, reserve: true });
  m.w.ok(BOB.userId, { type: "markPaid", requestId: m.r });
  return m;
}
function expectBlank(): void {
  expect(E.CLOCK).toBeNaN();
  expect(E.EVENTS).toHaveLength(0);
  expect(Object.keys(E.EV)).toEqual([]);
  expect(Object.keys(E.PEOPLE)).toEqual([]);
  expect(E.PEOPLE[ANN.userId]).toBeUndefined();
  expect(E.CLUBS).toHaveLength(0);
  expect(E.CLUB_MENU).toHaveLength(0);
  expect(Object.keys(E.CLUB_BY)).toEqual([]);
  expect(E.FEATURED).toHaveLength(0);
}

afterEach(() => {
  E.setActionTap(null);
  E.setLiveClock(null);
  E.applyWorld(null); // back to the preview's catalog between tests
});

describe("withEngine", () => {
  it("installs the world for one synchronous run and clears the shared state when it returns", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const seen = w.run(() => ({ title: E.EV[ev]?.title, events: E.EVENTS.length, ann: E.PEOPLE[ANN.userId]?.name, clock: E.CLOCK, clubs: E.CLUB_MENU.length }));
    expect(seen).toEqual({ title: "Spring Formal", events: 1, ann: "Ann L.", clock: T0, clubs: 1 });
    expectBlank();
  });

  it("throws when the function returns a Promise, still clears the state, and leaves no unhandled rejection", async () => {
    const w = new LiveTestWorld();
    expect(() => w.run(() => Promise.resolve(1))).toThrow(/synchronous/);
    expect(() => w.run(async () => 1)).toThrow(/synchronous/);
    expect(() => w.run(() => Promise.reject(new Error("late")))).toThrow(/synchronous/);
    expectBlank();
    await new Promise((resolve) => setTimeout(resolve, 20)); // a rejection vitest would report as unhandled happens here
  });

  it("can't be nested, and an exception inside still clears the state", () => {
    const w = new LiveTestWorld();
    expect(() => w.run(() => w.run(() => 1))).toThrow(/can't be nested/);
    expectBlank();
    expect(() => w.run(() => { throw new Error("boom"); })).toThrow("boom");
    expectBlank();
  });

  it("runs live worlds only, and needs the time", () => {
    expect(() => E.withEngine({ doc: seed() as unknown as LiveWorld, people: [], now: T0 }, () => 1)).toThrow(/live worlds only/);
    expect(() => E.withEngine({ doc: E.emptyWorld(), people: [], now: Number.NaN }, () => 1)).toThrow(/needs the time/);
    const w = new LiveTestWorld();
    expect(() => w.run(() => E.applyWorld(seed()))).toThrow(/live worlds only/); // no switching to the preview inside a run
    expect(() => w.run(() => E.setLiveClock(() => 0))).toThrow(/can't change inside withEngine/);
    expectBlank();
  });

  it("applyWorld refuses a live world without a live clock", () => {
    E.setLiveClock(null);
    expect(() => E.applyWorld(E.emptyWorld())).toThrow(/live clock/);
    E.setLiveClock(() => Number.NaN);
    expect(() => E.applyWorld(E.emptyWorld())).toThrow(/gave no time/);
    expect(() => E.setLiveClock(5 as unknown as () => number)).toThrow(/function or null/);
  });

  it("never changes a frozen input: a refusal returns the previous state itself, re-applied", () => {
    const { w, l } = market();
    const prev = w.doc; // deep-frozen by the helper: any write would throw
    expect(Object.isFrozen(prev.listings[0])).toBe(true);
    const out = w.act(ANN.userId, { type: "take", listingId: l, qty: 1, amount: "", msg: "", member: false });
    expect(out.res.error).toBe("You can't buy your own listing.");
    expect(out.res.state).toBe(prev);
    w.run(() => {
      expect(E.normalizeEvent(prev.events[0] as StoredEvent).title).toBe("Spring Formal");
      expect(E.invariantViolations(prev)).toEqual([]);
      expect(E.nextDue(prev)).toBeNull();
    });
  });

  it("never reads an email, and writes only public names", () => {
    const people = [{ ...ANN, email: "ann-canary@example.invalid" }, { ...BOB, email: "bob-canary@example.invalid" }, CAT];
    const w = new LiveTestWorld({ people });
    const ev = w.addEvent(ANN);
    const l = w.listTickets(ANN, ev, { qty: 2 });
    const r = w.take(BOB, l);
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    w.ok(BOB.userId, { type: "buyerReceived", requestId: r });
    const everything = JSON.stringify({ doc: w.doc, notes: w.notes, outcomes: w.outcomes.map((o) => ({ e: o.res.error, t: o.res.toast })) });
    expect(everything).not.toMatch(/canary|Ann Lee|Bob Diaz/);
    expect(everything).toContain("Bob D.");
    w.run(() => expect(JSON.stringify(E.PEOPLE[ANN.userId])).not.toContain("canary"));
  });
});

describe("people and names", () => {
  it("installs every person with demo set, a public name and their payment handle; anyone else reads 'A classmate'", () => {
    const w = new LiveTestWorld({ people: [ANN, { userId: "user-noname", name: "  ", payHandle: "" }] });
    w.run(() => {
      // payMethods (follow-on B1): a row without saved methods gets its handle as one "other" method, word for word.
      expect(E.PEOPLE[ANN.userId]).toEqual({ name: "Ann L.", first: "Ann", color: E.colorFor(ANN.userId), demo: true, pay: "@ann-lee", payMethods: [{ kind: "other", value: "@ann-lee" }] });
      expect(E.PEOPLE["user-noname"]).toMatchObject({ name: "Classmate", first: "Classmate", demo: true, pay: "", payMethods: [] });
      expect(E.PEOPLE["user-nobody"]).toMatchObject({ name: "A classmate", first: "A classmate", demo: true, payMethods: [] });
      expect(E.PEOPLE["constructor"]).toMatchObject({ name: "A classmate" }); // never Object.prototype's members
      expect(E.EV["constructor"]).toBeUndefined();
      expect(E.EV["__proto__"]).toBeUndefined();
      expect(E.CLUB_BY["toString"]).toBeUndefined();
    });
  });

  it("publicName shows the first name and the last name's initial", () => {
    expect(E.publicName("Langston Chen")).toBe("Langston C.");
    expect(E.publicName("  Mary  Ann   Smith ")).toBe("Mary S.");
    expect(E.publicName("José ángel")).toBe("José Á.");
    expect(E.publicName("Langston")).toBe("Langston");
    expect(E.publicName("Langston C.")).toBe("Langston C."); // a public name stays as it is
    expect(E.publicName("")).toBe("Classmate");
    expect(E.publicName(null)).toBe("Classmate");
  });

  it("colorFor is stable and comes from the avatar palette", () => {
    E.applyWorld(null); // the preview's sample people carry the palette
    const palette = new Set(Object.values(E.PEOPLE).map((p) => p.color));
    const colors = Array.from({ length: 200 }, (_, k) => E.colorFor(`user-${k}`));
    expect(colors.every((c) => palette.has(c))).toBe(true);
    expect(new Set(colors).size).toBeGreaterThanOrEqual(8);
    expect(E.colorFor("user-ann")).toBe(E.colorFor("user-ann"));
  });

  it("every live user has an inbox, and notifications name people by their public name", () => {
    const { w, l } = market();
    w.take(BOB, l);
    const [n] = w.notesFor(ANN.userId);
    expect(n).toMatchObject({ userId: ANN.userId, read: false, link: { name: "activity", tab: "todo" } });
    expect(n?.text).toBe(`Bob D. reserved 1 ticket for Spring Formal at $35 each. They have 15 minutes to pay you and tap "I've sent payment".`);
    expect(n?.id).toMatch(/^[0-9a-f]{16}$/);
    expect(n?.at).toBeGreaterThanOrEqual(T0);
    expect(n?.via).toBeUndefined();
  });
});

describe("stamps and ids", () => {
  it("stamps follow the clock, stay unique and ordered, and don't drift over 1,000 actions", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const alert = must(w.ok(BOB.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" }).id, "alert");
    let last = w.doc.lastStamp;
    for (let k = 0; k < 1000; k++) {
      w.advance(k % 7 === 0 ? 0 : 1000); // now and then two actions in the same millisecond
      w.ok(BOB.userId, { type: "setAlert", id: alert, paused: k % 2 === 0 });
      const stamp = w.doc.lastStamp;
      expect(stamp).toBeGreaterThan(last);
      expect(stamp).toBeGreaterThanOrEqual(w.now);
      expect(stamp - w.now).toBeLessThan(4); // the preview's tick would be 1,000 ms ahead by now
      last = stamp;
    }
    w.advance(-HOUR); // a corrected server clock can't reorder stamps
    w.ok(BOB.userId, { type: "setAlert", id: alert, paused: true });
    expect(w.doc.lastStamp).toBe(last + 1);
    expect(w.doc.tick).toBe(0);
  });

  it("live ids are 16 hex characters from crypto, and 10,000 of them are unique", () => {
    const ids = new LiveTestWorld().run(() => Array.from({ length: 10_000 }, () => E.uid()));
    expect(new Set(ids).size).toBe(10_000);
    expect(ids.every((id) => /^[0-9a-f]{16}$/.test(id))).toBe(true);
  });

  it("every record's id matches its pattern (C-DESIGN §2.3)", () => {
    const { w, ev, l, r } = market({ reserve: true });
    const iso = w.requestFor(CAT, ev, { budget: "40" });
    const share = must(w.ok(ANN.userId, { type: "shareListing", isoId: iso, listingId: l }).id, "share");
    const item = w.postItem(ANN);
    const gr = must(w.ok(DAN.userId, { type: "requestItem", id: item, msg: "", shareContact: true }).id, "goods request");
    expect(ev).toMatch(/^ev-[0-9a-f]{16}$/);
    expect(l).toMatch(/^l[0-9a-f]{16}$/);
    expect(r).toMatch(/^r[0-9a-f]{16}$/);
    expect(listingOf(w, l).holdingId).toMatch(/^h[0-9a-f]{16}$/);
    expect(iso).toMatch(/^iso-[0-9a-f]{16}$/);
    expect(item).toMatch(/^g[0-9a-f]{16}$/);
    expect(gr).toMatch(/^gr[0-9a-f]{16}$/);
    expect(share).toMatch(/^rsp-[0-9a-f]{16}$/);
    expect(storedEvent(w, ev).tiers.map((t) => t.id)).toEqual(["t1"]);
    expect(w.notes.every((n) => /^[0-9a-f]{16}$/.test(n.id))).toBe(true);
  });
});

describe("the live guards (C-DESIGN §3.3 item 4)", () => {
  it("refuse every legacy and preview-only type, changing nothing", () => {
    const { w, ev, l, r } = market({ reserve: true });
    for (const type of REFUSED) {
      const action: Action = { type, requestId: r, listingId: l, eventId: ev, id: r, qty: 1, hours: 1, policy: "official", outcome: "uphold", kind: "ticket", side: "buyer", email: true, at: T0, data: { title: "A party", when: "2026-12-01" } };
      expect(w.no(BOB.userId, action), type).toBe(NOT_AVAILABLE);
    }
  });

  it("cover every case in the reducer: each is a live type or a refused one, so a new type is refused until it's listed", () => {
    const source = readFileSync(fileURLToPath(new URL("../../engine/index.js", import.meta.url)), "utf8");
    const file = ts.createSourceFile("index.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const labels: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) labels.push(node.expression.text);
      ts.forEachChild(node, visit);
    };
    const step = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "step");
    visit(must(step, "step"));
    expect([...labels].sort()).toEqual([...E.LIVE_TYPES, ...REFUSED].sort());
    expect(E.SEQ_STEP_TYPES.every((t) => E.LIVE_TYPES.includes(t))).toBe(true);
  });

  it("refuse unknown types, a missing type and simulate: nobody acts for someone else", () => {
    const { w, l, r } = market({ reserve: true });
    expect(w.no(BOB.userId, { type: "hack" })).toBe(NOT_AVAILABLE);
    expect(w.no(BOB.userId, { type: "" })).toBe(NOT_AVAILABLE);
    for (const action of [
      { type: "markPaid", requestId: r, simulate: true },
      { type: "accept", requestId: r, simulate: true },
      { type: "confirmPayment", requestId: r, simulate: true },
      { type: "markTransferred", requestId: r, simulate: true },
      { type: "buyerReceived", requestId: r, simulate: true },
      { type: "withdraw", listingId: l, simulate: true },
    ]) {
      expect(w.no(ANN.userId, action), action.type).toBe(NOT_AVAILABLE);
      expect(w.no(BOB.userId, action), action.type).toBe(NOT_AVAILABLE);
    }
    expect(w.no(ANN.userId, { type: "markPaid", requestId: r })).toBe("Only the buyer can mark it paid.");
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    expect(w.no(BOB.userId, { type: "confirmPayment", requestId: r })).toBe("Only the seller can confirm the payment.");
    w.run(() => {
      for (const who of [ANN, BOB]) expect(E.needsAction(w.doc, who.userId).map((x) => x.why).join(" | ")).not.toMatch(/simulat|demo/i);
    });
  });

  it("only the server sweeps; every other action needs a signed-in actor", () => {
    const { w, l } = market();
    expect(w.no(ANN.userId, { type: "sweep" })).toBe(NOT_AVAILABLE);
    expect(w.sweep().res.error).toBeUndefined();
    expect(w.no(null, { type: "take", listingId: l, qty: 1 })).toBe("Sign in to do that.");
    expect(w.no("", { type: "take", listingId: l, qty: 1 })).toBe("Sign in to do that.");
  });

  it("refuse actions on a stored event that isn't a quick event: it's marked unsupported and keeps none of the trip fields", () => {
    const base = new LiveTestWorld();
    const ev = base.addEvent(ANN);
    for (const extra of [{ premium: true, price: { total: 900, fee: 0, schedule: [] } }, { organizerRequired: true }, { notOnSale: true }, { tierRule: "topup" }]) {
      const doc = copyDoc(base);
      Object.assign(must(doc.events[0], "event"), extra);
      const w = new LiveTestWorld({ doc });
      w.run(() => {
        const shown = must(E.EV[ev], "event");
        expect(shown.unsupported).toBe(true);
        expect([shown.premium, shown.organizerRequired, shown.price, shown.notOnSale, shown.tierRule]).toEqual([undefined, undefined, undefined, undefined, undefined]);
        expect(E.isQuick(shown)).toBe(true);
      });
      expect(w.no(BOB.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 1, paid: "40" })).toBe(UNSUPPORTED);
      expect(w.no(BOB.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" })).toBe(UNSUPPORTED);
      expect(w.no(BOB.userId, { type: "saveInterest", data: { eventId: ev, qty: 1, budget: "30", note: "", expires: dateAfter(T0, 3) } })).toBe(UNSUPPORTED);
    }
  });

  it("refuse photos and requests for events that aren't on Handoff", () => {
    const w = new LiveTestWorld();
    const photo = "data:image/png;base64,iVBORw0KGgo=";
    expect(w.no(ANN.userId, { type: "postItem", data: { title: "Lamp", cat: "Home & kitchen", cond: "Good", price: "10", area: "Fishtown", until: dateAfter(T0, 5), photos: [photo] } }))
      .toBe("Photos aren't available in the pilot yet. Describe the item instead.");
    expect(w.no(ANN.userId, { type: "postItem", data: { title: "Lamp", cat: "Home & kitchen", cond: "Good", price: "10", area: "Fishtown", until: dateAfter(T0, 5), photo } }))
      .toBe("Photos aren't available in the pilot yet. Describe the item instead.");
    w.postItem(ANN, { photos: [] }); // the form's empty list is fine
    for (const data of [{ eventId: "__none", qty: 1, budget: "20", expires: dateAfter(T0, 3) }, { missing: { title: "Golf night" }, qty: 1, budget: "20", expires: dateAfter(T0, 3) }, { qty: 1, budget: "20", expires: dateAfter(T0, 3) }]) {
      expect(w.no(BOB.userId, { type: "saveInterest", data })).toBe("Choose an event.");
    }
  });
});

describe("createEvent (C-DESIGN §7.3)", () => {
  const TRAIN = { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 2, "06:00"), openUntil: wallAfter(T0, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] };

  it("stores what was entered, and every page reads the defaults normalizeEvent fills in", () => {
    const w = new LiveTestWorld();
    const id = w.addEvent(ANN, { title: "  Spring   Formal ", venue: "Huntsman Hall", notes: "Black tie.\r\nDoors at 7.", officialUrl: "https://example.org/formal", deadline: wallAfter(T0, 9), namesChecked: true });
    expect(storedEvent(w, id)).toEqual({ id, kind: "event", title: "Spring Formal", club: "Wharton Graduate Association", cat: "Parties", start: "2026-11-20T19:00", venue: "Huntsman Hall",
      attend: "all", tiers: [{ id: "t1", label: "General admission", price: 40 }], perPerson: 4, deadline: "2026-11-19T19:00", namesChecked: true,
      officialUrl: "https://example.org/formal", notes: "Black tie.\nDoors at 7.", policy: "unknown", createdBy: ANN.userId, createdAt: T0 });
    w.run(() => {
      const ev = must(E.EV[id], "event");
      expect(ev).toMatchObject({ kind: "event", policy: "unknown", basePolicy: "unknown", policyChanged: false, soldOut: false, userAdded: true, addedBy: ANN.userId,
        policyNote: "", blurb: "From Ann L.: Black tie.\nDoors at 7.",
        path: "Arrange the transfer with the seller and check the organizer's rules.", payment: E.PAY_DEFAULT, sources: [], statusNote: "",
        sourcesNote: "Added by Ann L. · details not checked by Handoff", interestSeed: 0, cap: null, createdAt: T0, deadline: "2026-11-19T19:00" });
      expect(ev.tiers).toEqual([{ id: "t1", label: "General admission", price: 40, src: "entered by Ann" }]);
      expect(ev.unsupported).toBeUndefined();
      // Normalizing again changes nothing, even for a view that sends the blurb without the notes behind it.
      expect(E.normalizeEvent(ev)).toEqual(ev);
      const { notes: _notes, ...projected } = ev;
      expect(E.normalizeEvent(projected)).toEqual(projected);
      expect(E.EVENTS.map((e) => e.id)).toEqual([id]);
      // The view helpers render it without gaps.
      const sum = E.eventSummary(w.doc, ev, BOB.userId);
      const words = JSON.stringify([sum.state, E.priceParts(ev, sum), E.transferTag(ev), E.fmtRange(ev), E.priceBasis(must(ev.tiers?.[0], "tier").src)]);
      expect(words).not.toMatch(/undefined|NaN|null/);
      expect(E.priceBasis("entered by Ann")).toBe("entered by Ann, not checked by Handoff");
    });
    expect(w.ok(BOB.userId, { type: "createEvent", kind: "event", title: "Quiz night", club: "Pub Club", cat: "Food & drink", start: wallAfter(T0, 3), tiers: [{ label: "Entry", price: "0" }] }).toast)
      .toBe("Event added. It shows as added by you, and Handoff doesn't check its details.");
  });

  it("adds trains with a validity window, as eTickets for one train or paper tickets", () => {
    const w = new LiveTestWorld();
    const eticket = must(w.ok(ANN.userId, TRAIN).id, "train");
    expect(storedEvent(w, eticket)).toMatchObject({ kind: "train", cat: "Travel", methods: ["file"], noOrganizer: true, rangePrefix: "Valid ", perPerson: 2, attend: "all", openUntil: wallAfter(T0, 7, "23:00"), deadline: null });
    const paper = must(w.ok(ANN.userId, { ...TRAIN, title: "NJ TRANSIT: Trenton → New York", club: "NJ TRANSIT", ticketType: "paper", start: wallAfter(T0, -5, "06:00"), openUntil: wallAfter(T0, 20, "23:59") }).id, "paper train");
    expect(storedEvent(w, paper)).toMatchObject({ methods: ["inperson"], paperTicket: true });
    w.run(() => {
      const ev = must(E.EV[eticket], "train");
      expect(ev).toMatchObject({ end: ev.openUntil, rangePrefix: "Valid ", noOrganizer: true, tag: { label: "Check the carrier's rules · buyer's risk", tone: "warn", restricted: true } });
      expect(E.needsTrain(ev)).toBe(true);
      expect(E.needsTrain(must(E.EV[paper], "paper"))).toBe(false);
      expect(E.fmtRange(ev).replace(/\s/g, " ")).toBe("Valid Nov 12–17, 2026");
      expect(E.access(must(E.EV[paper], "paper")).ok).toBe(true); // valid since 5 days ago, still open
    });
    // An eTicket listing names its train and needs no file: the seller sends it after the payment.
    expect(w.no(ANN.userId, { type: "addThen", add: { eventId: eticket, tier: "t1", qty: 1, paid: "89" }, then: { type: "list", qty: 1, ask: "80", method: "file", file: null } }))
      .toBe("Add your train's departure date and time.");
    const l = w.listTickets(ANN, eticket, { paid: "89", ask: "80", method: "file", departsAt: wallAfter(T0, 3, "14:11") });
    expect(listingOf(w, l)).toMatchObject({ method: "file", departsAt: wallAfter(T0, 3, "14:11") });
    expect(listingOf(w, l).file).toBeUndefined();
  });

  it("adds treks, whose names are checked and changed by the organizer", () => {
    const w = new LiveTestWorld();
    const id = must(w.ok(ANN.userId, { type: "createEvent", kind: "trek", title: "Iceland Trek", club: "Nordic Club", start: wallAfter(T0, 40, "08:00"), end: wallAfter(T0, 45, "18:00"), attend: "members", tiers: [{ label: "Spot", price: "1200" }, { label: "Spot + flights", price: "2100" }] }).id, "trek");
    expect(storedEvent(w, id)).toMatchObject({ kind: "trek", cat: "Treks & trips", methods: ["name"], namesChecked: true, attend: "members", perPerson: 2 });
    w.run(() => {
      const ev = must(E.EV[id], "trek");
      expect(E.isQuick(ev)).toBe(true);
      expect(E.methodsFor(ev, E.namesCheckedFor(ev, false))).toEqual(["name"]);
      expect(E.unitOf(ev)).toBe("spot");
    });
  });

  it("checks every field, and a refusal changes nothing", () => {
    const w = new LiveTestWorld();
    const EVENT = { type: "createEvent", kind: "event", title: "Spring Formal", club: "WGA", cat: "Parties", start: wallAfter(T0, 10), tiers: [{ label: "GA", price: "40" }] };
    const cases: [Record<string, unknown>, string][] = [
      [{ kind: "party" }, "Choose what you're adding: an event, a train or a trek."],
      [{ title: "ab" }, "Give the event a name (3 to 120 characters)."],
      [{ title: "x".repeat(121) }, "Give the event a name (3 to 120 characters)."],
      [{ title: "!!!" }, "Give the event a name (3 to 120 characters)."],
      [{ title: "Spring\u0000Formal" }, "Give the event a name (3 to 120 characters)."],
      // Simplification batch: an ordinary event may leave the organizer and the category blank (simplify.test.ts); what's typed is checked.
      [{ club: "x" }, "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank."],
      [{ club: "x".repeat(81) }, "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank."],
      [{ club: "", attend: "members" }, "Add the club or organizer: a members-only event is for their members."],
      [{ cat: "Travel" }, "Choose a category from the list, or leave it blank."],
      [{ cat: "Treks & trips" }, "Choose a category from the list, or leave it blank."],
      [{ cat: "constructor" }, "Choose a category from the list, or leave it blank."],
      [{ venue: "v".repeat(121) }, "Keep the venue to 120 characters."],
      [{ notes: "n".repeat(601) }, "Keep the notes to 600 characters, without special characters."],
      [{ notes: "bell\u0007" }, "Keep the notes to 600 characters, without special characters."],
      [{ officialUrl: "javascript:alert(1)" }, "Official link: Enter a full link starting with https://, or leave it blank."],
      // Forms round 2: an ordinary event is added by its date ("2026-11-20" is now valid: forms-round2.test.ts), so a missing or impossible
      // one asks for the date.
      [{ start: "" }, "Enter the date."],
      [{ start: "2026-02-30" }, "Enter the date."],
      [{ start: "2026-02-30T19:00" }, "Enter the date."],
      [{ start: wallAfter(T0, 0, "12:20") }, "The start has to be at least 30 minutes from now."],
      [{ start: wallAfter(T0, 600) }, "The start has to be within the next 18 months."],
      [{ end: wallAfter(T0, 9) }, "The end can't be before the start."],
      [{ end: wallAfter(T0, 25) }, "The end has to be within 14 days of the start."],
      [{ end: "soon" }, "Enter the end date and time, or leave it blank."],
      [{ deadline: wallAfter(T0, -1) }, "The transfer deadline has to be in the future."],
      [{ deadline: wallAfter(T0, 11) }, "The transfer deadline can't be after the start."],
      [{ deadline: "2026-11-15" }, "Enter the transfer deadline's date and time, or leave it blank."],
      [{ attend: "staff" }, "Choose who can attend: anyone, or members only."],
      // Forms round 2: no ticket types is an event's one implicit ticket type, with an optional face value that's checked when typed.
      [{ tiers: [], face: "x" }, "Face value: enter a non-negative amount with at most two decimals."],
      [{ tiers: [1, 2, 3, 4].map((k) => ({ label: `T${k}`, price: "10" })) }, "Add 1 to 3 ticket types, each with a name and a face value."],
      [{ tiers: [{ label: "", price: "40" }] }, "Name each ticket type (up to 40 characters)."],
      // A ticket type is named by its place, never by the name typed for it (refusals are logged; review P4).
      [{ tiers: [{ label: "GA", price: "-1" }] }, "Face value: enter a non-negative amount with at most two decimals."],
      [{ tiers: [{ label: "GA", price: "" }] }, "Face value: enter an amount."],
      [{ tiers: [{ label: "GA", price: "40" }, { label: "Patron row", price: "x" }] }, "Face value for ticket type 2: enter a non-negative amount with at most two decimals."],
      [{ tiers: [{ label: "GA", price: "5000.01" }] }, "Face values can be at most $5,000."],
      [{ perPerson: 0 }, "Choose a per-person limit from 1 to 4."],
      [{ perPerson: 5 }, "Choose a per-person limit from 1 to 4."],
      [{ perPerson: 2.5 }, "Choose a per-person limit from 1 to 4."],
      [{ perPerson: "2" }, "Choose a per-person limit from 1 to 4."],
      // Forms round 2: a train without a validity window is one departure, at least 30 minutes away.
      [{ ...TRAIN, openUntil: undefined, start: wallAfter(T0, 0, "12:10") }, "The departure has to be at least 30 minutes from now."],
      [{ ...TRAIN, openUntil: wallAfter(T0, 1) }, "The tickets have to stop being valid after they start."],
      [{ ...TRAIN, openUntil: wallAfter(T0, 70) }, "Keep the validity window to 60 days."],
      [{ ...TRAIN, start: wallAfter(T0, -5, "06:00"), openUntil: wallAfter(T0, 0, "12:10") }, "The tickets have to stay valid for at least 30 more minutes."],
      [{ ...TRAIN, ticketType: undefined }, "Choose the ticket type: an eTicket for one train, or a paper ticket."],
      [{ ...TRAIN, tiers: [{ label: "Coach", price: "89" }, { label: "Business", price: "150" }] }, "Add the ticket's face value."],
      [{ ...TRAIN, title: "x" }, "Name the operator and route, like “Amtrak: Philadelphia → New York” (3 to 120 characters)."],
      [{ ...TRAIN, club: "" }, "Add the operator, like “Amtrak” (2 to 80 characters)."],
      [{ kind: "trek", club: "" }, "Add who runs the trek: the organizer or travel operator (2 to 80 characters)."],
    ];
    for (const [over, message] of cases) expect(w.no(ANN.userId, { ...EVENT, ...over }), JSON.stringify(over)).toBe(message);
    expect(w.doc.events).toEqual([]);
  });

  it("allows 5 per person in any 24 hours, removed ones included", () => {
    const w = new LiveTestWorld();
    const ids = [1, 2, 3, 4, 5].map((k) => w.addEvent(ANN, { title: `Event ${k}` }));
    expect(w.no(ANN.userId, { type: "createEvent", kind: "event", title: "Event 6", club: "WGA", cat: "Parties", start: wallAfter(T0, 10), tiers: [{ label: "GA", price: "40" }] }))
      .toBe("You've added 5 events in the last 24 hours, the most Handoff allows. Try again later.");
    w.ok(ANN.userId, { type: "removeEvent", eventId: must(ids[0], "first event") });
    expect(() => w.addEvent(ANN, { title: "Event 6" })).toThrow(/the most Handoff allows/);
    w.addEvent(BOB, { title: "Bob's event" }); // the cap is per person
    w.advance(DAY + MIN);
    w.addEvent(ANN, { title: "Event 6", start: wallAfter(w.now, 10) });
  });

  it("can't make a trip or an organizer-run trek: fields only the preview uses aren't stored", () => {
    const w = new LiveTestWorld();
    const id = w.addEvent(ANN, { premium: true, organizerRequired: true, price: { total: 2000, fee: 0, schedule: [] }, tierRule: "topup", notOnSale: true, nonTransferable: true, policy: "official", id: "ev-0000000000000000", createdBy: BOB.userId });
    const stored = storedEvent(w, id) as unknown as Record<string, unknown>;
    expect(Object.keys(stored).filter((k) => ["premium", "organizerRequired", "price", "tierRule", "notOnSale", "nonTransferable"].includes(k))).toEqual([]);
    expect(stored).toMatchObject({ policy: "unknown", createdBy: ANN.userId });
    expect(id).not.toBe("ev-0000000000000000");
    w.run(() => expect(E.EV[id]?.unsupported).toBeUndefined());
  });
});

describe("removeEvent", () => {
  it("works only for the person who added it, and leaves the event resolvable", () => {
    const w = new LiveTestWorld();
    const id = w.addEvent(ANN);
    expect(w.no(BOB.userId, { type: "removeEvent", eventId: id })).toBe("Only the person who added an event can remove it.");
    expect(w.no(ANN.userId, { type: "removeEvent", eventId: "ev-0000000000000000" })).toBe("Event not found.");
    w.advance(MIN);
    expect(w.ok(ANN.userId, { type: "removeEvent", eventId: id }).toast).toBe("Event removed.");
    expect(storedEvent(w, id).removedAt).toBe(T0 + MIN);
    expect(w.no(ANN.userId, { type: "removeEvent", eventId: id })).toBe("This event was already removed.");
    w.run(() => {
      expect(E.EV[id]?.removedAt).toBe(T0 + MIN); // still found by id
      expect(E.EVENTS).toHaveLength(0); // but no longer listed
      expect(E.CLUB_MENU).toHaveLength(0);
    });
    for (const action of [
      { type: "addHolding", eventId: id, tier: "t1", qty: 1, paid: "40" },
      { type: "addThen", add: { eventId: id, tier: "t1", qty: 1, paid: "40" }, then: { type: "list", qty: 1, ask: "35", method: "app" } },
      { type: "joinAlert", eventId: id, qty: 1, max: "" },
      { type: "saveInterest", data: { eventId: id, qty: 1, budget: "30", note: "", expires: dateAfter(T0, 3) } },
    ]) expect(w.no(BOB.userId, action), action.type).toBe("This event was removed.");
  });

  it("is refused while a listing or a public request refers to the event, whatever its state: records that were public", () => {
    const refs: [string, (w: LiveTestWorld, ev: string) => void][] = [
      ["a listing", (w, ev) => { w.listTickets(ANN, ev); }],
      ["a classmate's listing, withdrawn", (w, ev) => { const l = w.listTickets(BOB, ev); w.ok(BOB.userId, { type: "withdraw", listingId: l }); }],
      ["a public request", (w, ev) => { w.requestFor(BOB, ev); }],
      ["a public request, closed", (w, ev) => { const iso = w.requestFor(BOB, ev); w.ok(BOB.userId, { type: "closeInterest", id: iso, reason: "cancelled" }); }],
    ];
    for (const [what, refer] of refs) {
      const w = new LiveTestWorld();
      const ev = w.addEvent(ANN);
      w.run(() => expect(E.eventInPublicUse(w.doc, ev)).toBe(false));
      refer(w, ev);
      w.run(() => expect(E.eventInPublicUse(w.doc, ev), what).toBe(true));
      expect(w.no(ANN.userId, { type: "removeEvent", eventId: ev }), what).toBe("This event can't be removed: listings or public requests refer to it.");
    }
  });

  it("never depends on private alerts or self-reported tickets, so it can't tell the creator they exist (review P2)", () => {
    // The same event, with and without classmates' private records: the creator's answer is the same.
    const outcome = (privately: (w: LiveTestWorld, ev: string) => void) => {
      const w = new LiveTestWorld();
      const ev = w.addEvent(ANN, { title: "Typo Night" });
      privately(w, ev);
      w.advance(MIN);
      const { res } = w.act(ANN.userId, { type: "removeEvent", eventId: ev });
      return { error: res.error, toast: res.toast, removed: res.error === undefined };
    };
    const none = outcome(() => {});
    expect(none).toEqual({ error: undefined, toast: "Event removed.", removed: true });
    expect(outcome((w, ev) => { w.ok(BOB.userId, { type: "joinAlert", eventId: ev, qty: 2, max: "35" }); })).toEqual(none);
    expect(outcome((w, ev) => { w.ok(CAT.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 1, paid: "40" }); })).toEqual(none);
    expect(outcome((w, ev) => {
      const al = must(w.ok(DAN.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" }).id, "alert");
      w.ok(DAN.userId, { type: "setAlert", id: al, paused: true });
      w.ok(DAN.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 2, paid: "40" });
    })).toEqual(none);
  });

  it("turns classmates' alerts off and leaves their tickets, which nothing can act on after it; each owner is told", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN, { title: "Typo Night" });
    const bobs = must(w.ok(BOB.userId, { type: "joinAlert", eventId: ev, qty: 2, max: "35" }).id, "Bob's alert");
    const cats = must(w.ok(CAT.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 1, paid: "40" }).id, "Cat's ticket");
    const dans = must(w.ok(DAN.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" }).id, "Dan's alert");
    w.ok(DAN.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 2, paid: "40" });
    const anns = must(w.ok(ANN.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" }).id, "Ann's own alert");
    w.advance(MIN);
    const done = w.ok(ANN.userId, { type: "removeEvent", eventId: ev });
    expect(done.toast).toBe("Event removed. Your alert for it is off."); // the creator hears only about her own
    expect(storedEvent(w, ev).removedAt).toBe(w.now);
    for (const id of [bobs, dans, anns]) {
      const i = must(w.doc.interests.find((x) => x.id === id), id);
      expect([i.status, i.closedAt, i.closedReason], id).toEqual(["closed", w.now, undefined]);
    }
    expect(w.doc.holdings.filter((h) => h.eventId === ev).map((h) => [h.userId, h.qty])).toEqual([[CAT.userId, 1], [DAN.userId, 2]]);
    const TICKETS = "The tickets you added for it stay in Handoff settings, but can't be listed."; // amendment 9h: the page's new name
    const told = done.notes.map((n) => [n.userId, n.text, n.link] as const).sort((a, b) => a[0].localeCompare(b[0]));
    expect(told).toEqual([
      [BOB.userId, 'Ann L. removed "Typo Night" from Handoff, so your alert for it is off.', { name: "activity" }],
      [CAT.userId, `Ann L. removed "Typo Night" from Handoff. ${TICKETS}`, { name: "activity" }],
      [DAN.userId, `Ann L. removed "Typo Night" from Handoff, so your alert for it is off. ${TICKETS}`, { name: "activity" }],
    ]);
    // Nothing can be done with them now, and the world stays consistent (LiveTestWorld fails on any introduced violation).
    expect(w.no(CAT.userId, { type: "list", holdingId: cats, qty: 1, ask: "35", method: "app", payHandle: "@cat", file: null })).toBe("This event was removed.");
    expect(w.no(BOB.userId, { type: "setAlert", id: bobs, paused: true })).toBe("This event was removed.");
    expect(w.no(BOB.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" })).toBe("This event was removed.");
    w.run(() => expect(E.invariantViolations(w.doc)).toEqual([]));
  });
});

describe("seq (C-DESIGN §4.1)", () => {
  const listStep = (ev: string, over: Record<string, unknown> = {}): Action => ({ type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" }, then: { type: "list", qty: 1, ask: "35", method: "app", file: null, note: "", ...over } });

  it("runs every step as one change, with @k replaced by step k's result", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const iso = w.requestFor(BOB, ev, { budget: "40" });
    const done = w.ok(ANN.userId, { type: "seq", steps: [{ action: listStep(ev) }, { action: { type: "shareListing", isoId: iso, listingId: "@0" }, optional: true }] });
    const [first, second] = must(done.steps, "steps");
    expect(first).toMatchObject({ type: "addThen", ok: true, id: done.id });
    expect(second).toMatchObject({ type: "shareListing", ok: true });
    expect(w.doc.responses).toEqual([expect.objectContaining({ id: second?.id, isoId: iso, listingId: done.id, sellerId: ANN.userId })]);
    expect(done.toast).toBe(first?.toast);
    expect(w.notesFor(BOB.userId).map((n) => n.text).join(" ")).toMatch(/shared a listing for Spring Formal/);
  });

  it("keeps the earlier steps when an optional step fails, and reports why", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const iso = w.requestFor(BOB, ev, { budget: "30" });
    const done = w.ok(ANN.userId, { type: "seq", steps: [{ action: listStep(ev) }, { action: { type: "shareListing", isoId: iso, listingId: "@0" }, optional: true }] });
    expect(done.steps).toEqual([
      expect.objectContaining({ type: "addThen", ok: true, id: done.id }),
      { type: "shareListing", ok: false, error: "This listing doesn't fit the request. $35 per ticket is above Bob's $30 budget." },
    ]);
    expect(w.doc.listings).toHaveLength(1);
    expect(w.doc.responses).toHaveLength(0);
  });

  it("keeps nothing when a required step fails", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const iso = w.requestFor(BOB, ev, { budget: "30" });
    const before = w.doc;
    const { res } = w.act(ANN.userId, { type: "seq", steps: [{ action: listStep(ev) }, { action: { type: "shareListing", isoId: iso, listingId: "@0" } }] });
    expect(res.error).toBe("This listing doesn't fit the request. $35 per ticket is above Bob's $30 budget.");
    expect(res.state).toBe(before);
    // Nothing was kept, so the step before it is reported as not saved: no id or toast for a listing that was never stored (review INT-4).
    expect(res.steps).toEqual([
      { type: "addThen", ok: false, error: "Not saved: a later step didn't go through." },
      { type: "shareListing", ok: false, error: "This listing doesn't fit the request. $35 per ticket is above Bob's $30 budget." },
    ]);
    expect(w.doc.listings).toHaveLength(0);
    expect(w.doc.holdings).toHaveLength(0);
  });

  it("reports no step as done when a required later step fails: a new event that wasn't kept has no id (review INT-4)", () => {
    const w = new LiveTestWorld();
    const before = w.doc;
    const { res } = w.act(ANN.userId, { type: "seq", steps: [
      { action: { type: "createEvent", kind: "event", title: "Gala", club: "WGA", cat: "Parties", start: wallAfter(T0, 10), tiers: [{ label: "GA", price: "40" }] } },
      { action: { type: "addThen", add: { eventId: "@0", tier: "t1", qty: 9, paid: "40" }, then: { type: "list", qty: 9, ask: "35", method: "app", file: null, note: "" } } },
    ] });
    expect(res.error).toBe("Enter between 1 and 4 tickets (4 per person).");
    expect(res.state).toBe(before);
    expect(res.steps).toEqual([
      { type: "createEvent", ok: false, error: "Not saved: a later step didn't go through." },
      { type: "addThen", ok: false, error: "Enter between 1 and 4 tickets (4 per person)." },
    ]);
    expect(JSON.stringify(res.steps)).not.toMatch(/ev-|Event added/);
    expect(w.doc.events).toEqual([]);
  });

  it("chains createEvent, items and shares, and never replaces free text", () => {
    const w = new LiveTestWorld();
    const made = w.ok(ANN.userId, { type: "seq", steps: [
      { action: { type: "createEvent", kind: "event", title: "Gala", club: "WGA", cat: "Parties", start: wallAfter(T0, 10), tiers: [{ label: "GA", price: "40" }] } },
      { action: { type: "addThen", add: { eventId: "@0", tier: "t1", qty: 1, paid: "40" }, then: { type: "list", qty: 1, ask: "35", method: "app", note: "@0" } } },
    ] });
    expect(made.id).toMatch(/^ev-/);
    expect(w.doc.listings[0]).toMatchObject({ eventId: made.id, note: "@0" });
    const iso = must(w.ok(BOB.userId, { type: "saveInterest", data: { goods: { title: "Desk chair", cat: "Furniture" }, qty: 1, budget: "50", note: "", expires: dateAfter(T0, 5) } }).id, "goods request");
    const posted = w.ok(ANN.userId, { type: "seq", steps: [
      { action: { type: "postItem", data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", obo: false, area: "Rittenhouse", until: dateAfter(T0, 10), note: "" } } },
      { action: { type: "shareItem", isoId: iso, itemId: "@0" }, optional: true },
    ] });
    expect(w.doc.responses[0]).toMatchObject({ isoId: iso, itemId: posted.id });
  });

  it("refuses malformed sequences", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const bad = "That combination of changes isn't available.";
    expect(w.no(ANN.userId, { type: "seq", steps: [] })).toBe(bad);
    expect(w.no(ANN.userId, { type: "seq", steps: [1, 2, 3, 4].map(() => ({ action: listStep(ev) })) })).toBe(bad);
    expect(w.no(ANN.userId, { type: "seq", steps: [{ action: { type: "seq", steps: [{ action: listStep(ev) }] } }] })).toBe(bad);
    expect(w.no(ANN.userId, { type: "seq", steps: [{ action: listStep(ev), optional: true }] })).toBe(bad);
    expect(w.no(ANN.userId, { type: "seq", steps: [{ action: { type: "take", listingId: "l0", qty: 1 } }] })).toBe(bad);
    expect(w.no(ANN.userId, { type: "seq", steps: "nope" })).toBe(bad);
    expect(w.no(ANN.userId, { type: "seq", steps: [{ action: listStep(ev) }, { action: { type: "shareListing", isoId: "iso-x", listingId: "@1" } }] }))
      .toBe("A step refers to an earlier step that didn't go through.");
    // A step after a failed optional one can't use its result.
    const done = w.ok(ANN.userId, { type: "seq", steps: [
      { action: listStep(ev) },
      { action: { type: "addHolding", eventId: ev, tier: "t9", qty: 1, paid: "40" }, optional: true },
      { action: { type: "list", holdingId: "@1", qty: 1, ask: "35", method: "app" }, optional: true },
    ] });
    expect(done.steps?.map((s) => [s.ok, s.error ?? ""])).toEqual([[true, ""], [false, "Choose the ticket tier you bought."], [false, "A step refers to an earlier step that didn't go through."]]);
  });

  // flows-A (Nov 7): "Create a listing for this request" and "Sell an item for this request" post and share in one change. The
  // requester used to get two notifications about the one listing or item (that it opened up, and that it was shared with them).
  it("a listing made for a request and shared in the same change: the requester hears once, about the share; others still hear it opened up (flows-A)", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const iso = w.requestFor(BOB, ev, { budget: "40" });
    w.ok(CAT.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" });
    const done = w.ok(ANN.userId, { type: "seq", steps: [{ action: listStep(ev) }, { action: { type: "shareListing", isoId: iso, listingId: "@0" }, optional: true }] });
    const toBob = done.notes.filter((n) => n.userId === BOB.userId);
    expect(toBob.map((n) => n.text)).toEqual([expect.stringMatching(/^Ann L\. shared a listing for Spring Formal with your request: 1 ticket at \$35\. It isn't held for you/)]);
    expect(toBob[0]?.link).toEqual({ name: "event", id: ev, listing: done.id });
    // An alert's owner hears it opened up, and the link points at the listing.
    expect(done.notes.filter((n) => n.userId === CAT.userId)).toEqual([expect.objectContaining({ text: expect.stringMatching(/^A ticket opened up for Spring Formal: Ann listed 1 ticket at \$35\./), link: { name: "event", id: ev, listing: done.id } })]);
  });

  it("a listing shared in a later change: the requester heard when it opened up, and hears again that it was shared (flows-A)", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const iso = w.requestFor(BOB, ev, { budget: "40" });
    const l = w.listTickets(ANN, ev, {});
    expect(w.notesFor(BOB.userId).map((n) => n.text)).toEqual([expect.stringMatching(/^A ticket opened up for Spring Formal: Ann listed 1 ticket at \$35\./)]);
    expect(w.notesFor(BOB.userId)[0]?.link).toEqual({ name: "event", id: ev, listing: l });
    const shared = w.ok(ANN.userId, { type: "shareListing", isoId: iso, listingId: l });
    expect(shared.notes.filter((n) => n.userId === BOB.userId).map((n) => n.text)).toEqual([expect.stringMatching(/^Ann L\. shared a listing for Spring Formal with your request/)]);
    expect(w.notesFor(BOB.userId)).toHaveLength(2);
  });

  it("an item posted for a request and shared in the same change: the requester hears once, about the share (flows-A)", () => {
    const w = new LiveTestWorld();
    const iso = must(w.ok(BOB.userId, { type: "saveInterest", data: { goods: { title: "Desk chair", cat: "Furniture" }, qty: 1, budget: "50", note: "", expires: dateAfter(T0, 5) } }).id, "goods request");
    const posted = w.ok(ANN.userId, { type: "seq", steps: [
      { action: { type: "postItem", data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", obo: false, area: "Rittenhouse", until: dateAfter(T0, 10), note: "" } } },
      { action: { type: "shareItem", isoId: iso, itemId: "@0" }, optional: true },
    ] });
    expect(posted.notes.filter((n) => n.userId === BOB.userId).map((n) => n.text)).toEqual([expect.stringMatching(/^Ann L\. shared "Desk chair" with your request for Desk chair: \$30, pickup in Rittenhouse\./)]);
  });

  it("runs in the preview too", () => {
    const s = seed();
    E.applyWorld(s);
    const res = E.reduce(s, "u_priya", { type: "seq", steps: [
      { action: { type: "addHolding", eventId: "e_concert", tier: "ga", qty: 1, paid: "55" } },
      { action: { type: "list", holdingId: "@0", qty: 1, ask: "50", method: "app" } },
    ] });
    expect(res.error).toBeUndefined();
    expect(res.steps?.map((x) => x.ok)).toEqual([true, true]);
    expect(res.state.listings[0]).toMatchObject({ eventId: "e_concert", sellerId: "u_priya", ask: 50 });
  });
});

describe("payments: the ticket file and the disputed Paid (C-DESIGN §8.3)", () => {
  it("method file: confirming the payment gives confirmed, and the seller sends the PDF or QR code", () => {
    const w = new LiveTestWorld();
    const train = must(w.ok(ANN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 2, "06:00"), openUntil: wallAfter(T0, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
    const l = w.listTickets(ANN, train, { paid: "89", ask: "80", method: "file", departsAt: wallAfter(T0, 3, "14:11") });
    const r = w.take(BOB, l);
    expect(w.ok(BOB.userId, { type: "markPaid", requestId: r }).toast).toBe("Payment marked as sent. Ann confirms it arrived, then they send you the PDF or QR code.");
    const confirmed = w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    expect(confirmed.toast).toBe("Payment confirmed. Now send the PDF or QR code to Bob yourself, then tap “I've sent it”.");
    expect(requestOf(w, r)).toMatchObject({ status: "confirmed" });
    expect(requestOf(w, r).deliveredAt).toBeUndefined();
    expect(confirmed.notes.map((n) => n.text)).toEqual(["Ann confirmed your payment for Amtrak: Philadelphia → New York. Next: they send the PDF or QR code."]);
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    w.ok(BOB.userId, { type: "buyerReceived", requestId: r });
    expect(requestOf(w, r).status).toBe("completed");
    expect(requestOf(w, r).history.map((h) => h.text).join(" | ")).not.toMatch(/delivered the ticket file|simulated/);
  });

  it("the seller can say the payment hasn't arrived; the buyer can then cancel, and the ticket is back on sale", () => {
    const { w, l, r } = paidMarket();
    expect(w.no(BOB.userId, { type: "paymentMissing", requestId: r })).toBe("Only the seller can say the payment hasn't arrived.");
    w.advance(MIN);
    const said = w.ok(ANN.userId, { type: "paymentMissing", requestId: r });
    expect(requestOf(w, r)).toMatchObject({ status: "paid", payDisputedAt: w.now, releaseAfter: w.now + 24 * HOUR });
    expect(requestOf(w, r).history.at(-1)?.text).toBe("Seller says the payment hasn't arrived (Handoff can't see payments)");
    const fmt = (ms: number) => E.fmtMs(ms);
    expect(said.notes.map((n) => [n.userId, n.text])).toEqual([[BOB.userId, `Ann says your payment for Spring Formal hasn't arrived. If you paid, contact Ann: Handoff can't see payments. If you didn't, you can cancel. Ann can release the ticket after ${fmt(w.now + 24 * HOUR)}.`]]);
    expect(said.toast).toBe(`Noted. Bob can cancel, and if the payment still hasn't arrived you can release it after ${fmt(w.now + 24 * HOUR)}. Handoff can't see payments, so it doesn't decide who's right.`);
    expect(w.no(ANN.userId, { type: "paymentMissing", requestId: r })).toBe("You've already said the payment hasn't arrived.");
    w.run(() => expect(E.listingNumbers(w.doc, listingOf(w, l))).toEqual({ reserved: 1, completed: 0, available: 1 }));
    const cancelled = w.ok(BOB.userId, { type: "cancel", requestId: r });
    expect(requestOf(w, r)).toMatchObject({ status: "cancelled", reason: "Buyer withdrew after the seller said the payment didn't arrive" });
    expect(cancelled.notes.map((n) => n.userId)).toEqual([ANN.userId]);
    w.run(() => expect(E.listingNumbers(w.doc, listingOf(w, l)).available).toBe(2));
  });

  it("after the waiting time, and not before, the seller can release it", () => {
    const { w, l, r } = paidMarket();
    w.advance(MIN);
    w.ok(ANN.userId, { type: "paymentMissing", requestId: r });
    const after = requestOf(w, r).releaseAfter ?? 0;
    expect(w.no(ANN.userId, { type: "release", requestId: r })).toBe(`You can release it after ${E.fmtMs(after)} if the payment still hasn't arrived. Bob can cancel before then.`);
    w.now = after;
    const released = w.ok(ANN.userId, { type: "release", requestId: r });
    expect(requestOf(w, r)).toMatchObject({ status: "released", reason: "Released by the seller: the payment didn't arrive" });
    expect(released.notes.map((n) => n.userId)).toEqual([BOB.userId]);
    w.run(() => expect(E.listingNumbers(w.doc, listingOf(w, l)).available).toBe(2));
  });

  it("waits only an hour when the ticket is used within a day", () => {
    const { w, r } = paidMarket({ event: { start: wallAfter(T0, 1, "08:00") } }); // 8 AM tomorrow: 20 hours away
    w.advance(MIN);
    w.ok(ANN.userId, { type: "paymentMissing", requestId: r });
    expect(requestOf(w, r).releaseAfter).toBe(w.now + HOUR);
  });

  it("the seller can still confirm the payment during the dispute, which ends it", () => {
    const { w, r } = paidMarket();
    w.advance(MIN);
    w.ok(ANN.userId, { type: "paymentMissing", requestId: r });
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    expect(requestOf(w, r).status).toBe("confirmed");
    w.advance(2 * DAY);
    expect(w.no(ANN.userId, { type: "release", requestId: r })).toBe("Only a hold that hasn't been sent or gone to the organizer can be released.");
    expect(w.no(BOB.userId, { type: "cancel", requestId: r })).toMatch(/can't be cancelled here/);
  });

  it("without a dispute a paid reservation can't be cancelled or released", () => {
    const { w, r } = paidMarket();
    expect(w.no(BOB.userId, { type: "cancel", requestId: r })).toBe('You\'ve marked it paid, so it can\'t be cancelled here. If something\'s wrong, tap "There\'s a problem".');
    expect(w.no(ANN.userId, { type: "release", requestId: r })).toBe("The buyer says they paid. If the money hasn't arrived, tap “Payment hasn't arrived” first: they can then cancel, or you can release it after a while.");
  });

  it("deadlines, next steps and the next sweep follow the dispute", () => {
    const { w, r } = paidMarket();
    w.advance(MIN);
    w.ok(ANN.userId, { type: "paymentMissing", requestId: r });
    const after = requestOf(w, r).releaseAfter ?? 0;
    const why = (who: string) => w.run(() => E.needsAction(w.doc, who).find((x) => x.x.id === r)?.why ?? null);
    w.run(() => {
      expect(E.requestDeadlines(requestOf(w, r))).toEqual({ next: after, who: "seller", cutoff: null });
      expect(E.nextDue(w.doc)).toBe(after);
    });
    expect(why(ANN.userId)).toBeNull(); // waiting: the buyer may cancel meanwhile
    expect(why(BOB.userId)).toBe("check your payment, or cancel");
    w.now = after;
    expect(why(ANN.userId)).toBe("release or confirm the payment");
  });
});

describe("a step pressed again, or on a reservation that has since closed, says what Handoff recorded (journey review F2)", () => {
  // A second tab or device that hasn't caught up can repeat an exchange step that's done, or press one on a reservation that has
  // closed. These refusals used to say the step hadn't happened yet: "The buyer hasn't marked it paid yet." right after the payment
  // was confirmed. Each is still refused and changes nothing (w.no fails the test if the state isn't the previous one).
  const PAID = "You've already marked it paid.";
  const CONFIRMED = "You've already confirmed this payment.";
  const SENT = "You've already marked it as sent.";
  const RECEIVED = "You've already confirmed receiving it.";
  const NOT_PAID = "The buyer hasn't marked it paid yet.";
  const CONFIRM_FIRST = "Confirm the payment first.";
  const NOT_SENT = "There's nothing to confirm yet: the seller hasn't marked it as sent.";
  /** Each step, by the person whose step it is. */
  const steps = (w: LiveTestWorld, r: string) => ({
    paid: () => w.no(BOB.userId, { type: "markPaid", requestId: r }),
    confirm: () => w.no(ANN.userId, { type: "confirmPayment", requestId: r }),
    sent: () => w.no(ANN.userId, { type: "markTransferred", requestId: r }),
    received: () => w.no(BOB.userId, { type: "buyerReceived", requestId: r }),
    release: () => w.no(ANN.userId, { type: "release", requestId: r }),
  });

  it("repeating a step after it's done says it's already done, at every later stage, and changes nothing", () => {
    const { w, r } = market({ reserve: true });
    const s = steps(w, r);
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    expect(s.paid()).toBe(PAID);
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    expect([s.paid(), s.confirm()]).toEqual([PAID, CONFIRMED]);
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    expect([s.paid(), s.confirm(), s.sent()]).toEqual([PAID, CONFIRMED, SENT]);
    w.ok(BOB.userId, { type: "buyerReceived", requestId: r });
    const doc = w.doc, notes = w.notes.length, lines = requestOf(w, r).history.length;
    expect([s.paid(), s.confirm(), s.sent(), s.received()]).toEqual([PAID, CONFIRMED, SENT, RECEIVED]);
    expect(w.doc).toBe(doc);
    expect([w.notes.length, requestOf(w, r).history.length, requestOf(w, r).status]).toEqual([notes, lines, "completed"]);
  });

  it("the ticket-file method too: “I've sent it” pressed again", () => {
    const w = new LiveTestWorld();
    const train = must(w.ok(ANN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 2, "06:00"), openUntil: wallAfter(T0, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
    const r = w.take(BOB, w.listTickets(ANN, train, { paid: "89", ask: "80", method: "file", departsAt: wallAfter(T0, 3, "14:11") }));
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    expect([steps(w, r).sent(), steps(w, r).confirm()]).toEqual([SENT, CONFIRMED]);
  });

  it("a step on a reservation that has closed since says so, not that the step is still to come", () => {
    // The buyer withdrew after the seller said the payment hadn't arrived: the seller's stale "Payment received" (it used to say the
    // buyer hadn't marked it paid, which they had).
    const a = paidMarket();
    a.w.advance(MIN);
    a.w.ok(ANN.userId, { type: "paymentMissing", requestId: a.r });
    a.w.ok(BOB.userId, { type: "cancel", requestId: a.r });
    const sa = steps(a.w, a.r);
    expect([sa.confirm(), sa.paid(), sa.release(), sa.sent(), sa.received()]).toEqual(Array(5).fill("This reservation was cancelled."));
    // The seller released it after the waiting time.
    const b = paidMarket();
    b.w.advance(MIN);
    b.w.ok(ANN.userId, { type: "paymentMissing", requestId: b.r });
    b.w.now = requestOf(b.w, b.r).releaseAfter ?? 0;
    b.w.ok(ANN.userId, { type: "release", requestId: b.r });
    const sb = steps(b.w, b.r);
    expect([sb.confirm(), sb.paid(), sb.release()]).toEqual(Array(3).fill("This reservation was released."));
    // The 15 minutes ran out unpaid: before a read swept it, and after.
    const c = market({ reserve: true });
    c.w.advance(16 * MIN);
    const sc = steps(c.w, c.r);
    expect([sc.paid(), sc.confirm(), sc.release(), sc.received()]).toEqual(Array(4).fill("The reservation has ended."));
    c.w.sweep();
    expect([sc.paid(), sc.confirm(), sc.release()]).toEqual(Array(3).fill("The reservation has ended."));
    // The buyer cancelled before paying: the seller's stale "Release reservation", the buyer's stale "Paid".
    const d = market({ reserve: true });
    d.w.ok(BOB.userId, { type: "cancel", requestId: d.r });
    expect([steps(d.w, d.r).release(), steps(d.w, d.r).paid(), steps(d.w, d.r).confirm()]).toEqual(Array(3).fill("This reservation was cancelled."));
  });

  it("a step that isn't due yet keeps its own words", () => {
    const { w, r } = market({ reserve: true });
    const s = steps(w, r);
    expect([s.confirm(), s.sent(), s.received()]).toEqual([NOT_PAID, CONFIRM_FIRST, NOT_SENT]);
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    expect([s.sent(), s.received()]).toEqual([CONFIRM_FIRST, NOT_SENT]);
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    expect(s.received()).toBe(NOT_SENT);
    // An offer the seller hasn't accepted isn't a reservation yet.
    const o = market({ list: { obo: true, minOffer: "20" } });
    const offer = must(o.w.ok(BOB.userId, { type: "offer", listingId: o.l, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    expect(o.w.no(BOB.userId, { type: "markPaid", requestId: offer })).toBe("Only a reserved ticket can be marked paid.");
  });

  it("tells nobody else anything: a stranger's and the other party's refusals are the same at every stage", () => {
    const { w, r } = market({ reserve: true });
    const others = () => [
      w.no(CAT.userId, { type: "markPaid", requestId: r }), w.no(CAT.userId, { type: "confirmPayment", requestId: r }),
      w.no(CAT.userId, { type: "markTransferred", requestId: r }), w.no(CAT.userId, { type: "buyerReceived", requestId: r }),
      w.no(CAT.userId, { type: "release", requestId: r }),
      w.no(ANN.userId, { type: "markPaid", requestId: r }), w.no(BOB.userId, { type: "confirmPayment", requestId: r }),
      w.no(BOB.userId, { type: "markTransferred", requestId: r }), w.no(ANN.userId, { type: "buyerReceived", requestId: r }),
      w.no(BOB.userId, { type: "release", requestId: r }),
    ];
    const first = others();
    expect(first).toEqual(["Only the buyer can mark it paid.", "Only the seller can confirm the payment.", "Only the seller can mark it transferred.",
      "Only the buyer can confirm they received it.", "Only the seller can release the hold.", "Only the buyer can mark it paid.",
      "Only the seller can confirm the payment.", "Only the seller can mark it transferred.", "Only the buyer can confirm they received it.",
      "Only the seller can release the hold."]);
    for (const [who, type] of [[BOB, "markPaid"], [ANN, "confirmPayment"], [ANN, "markTransferred"], [BOB, "buyerReceived"]] as const) {
      w.ok(who.userId, { type, requestId: r });
      expect(others()).toEqual(first);
    }
  });

  it("in the preview, a step done for a made-up person names them when it's pressed again", () => {
    let s = seed();
    E.applyWorld(s);
    s = E.reduce(s, "u_priya", { type: "take", listingId: "l12", qty: 1 }).state; // Leah's Amtrak eTicket: Leah is a made-up seller
    const id = must(s.requests[0], "request").id;
    s = E.reduce(s, "u_priya", { type: "markPaid", requestId: id }).state;
    s = E.reduce(s, "u_priya", { type: "confirmPayment", requestId: id, simulate: true }).state; // the preview "delivers" the file
    expect(E.rState(must(s.requests.find((x) => x.id === id), "request")).st).toBe("sent");
    expect(E.reduce(s, "u_priya", { type: "confirmPayment", requestId: id, simulate: true }).error).toBe("Leah has already confirmed this payment.");
    expect(E.reduce(s, "u_priya", { type: "markTransferred", requestId: id, simulate: true }).error).toBe("It's already been sent.");
    expect(E.reduce(s, "u_priya", { type: "markPaid", requestId: id }).error).toBe(PAID);
  });
});

describe("transfers record the source 'transferred' (C-DESIGN §8.4)", () => {
  it("gives the buyer a 'transferred' holding, merged with an earlier one at the same price", () => {
    const { w, l } = market();
    const complete = (r: string) => {
      w.ok(BOB.userId, { type: "markPaid", requestId: r });
      w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
      w.ok(ANN.userId, { type: "markTransferred", requestId: r });
      w.ok(BOB.userId, { type: "buyerReceived", requestId: r });
    };
    complete(w.take(BOB, l));
    const mine = () => w.doc.holdings.filter((h) => h.userId === BOB.userId);
    expect(mine()).toEqual([expect.objectContaining({ source: "transferred", qty: 1, paid: 35, tier: "t1" })]);
    complete(w.take(BOB, l));
    expect(mine()).toEqual([expect.objectContaining({ source: "transferred", qty: 2, paid: 35 })]);
    expect(E.SRC.transferred).toBe("transferred in Handoff · both of you confirmed it, not independently checked");
    expect(JSON.stringify(w.doc)).not.toContain("simulated");
  });
});

describe("refusals don't reveal another user's private state (C-DESIGN §3.7)", () => {
  it("accepting an offer from a buyer who already holds an unpaid reservation", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const a = w.listTickets(ANN, ev, { obo: true });
    const b = w.listTickets(CAT, ev);
    const offer = must(w.ok(BOB.userId, { type: "offer", listingId: a, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    w.take(BOB, b);
    const refusal = w.no(ANN.userId, { type: "accept", requestId: offer });
    expect(refusal).toBe(BUYER_LIMITS);
    expect(refusal).not.toMatch(/Bob/);
  });

  it("accepting an offer that would take the buyer over the per-person limit", () => {
    const base = new LiveTestWorld();
    const ev = base.addEvent(ANN, { perPerson: 2 });
    const a = base.listTickets(ANN, ev, { obo: true });
    const offer = must(base.ok(BOB.userId, { type: "offer", listingId: a, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    const doc = copyDoc(base); // Bob's two other tickets, planted: they're his private holdings
    doc.holdings.push({ id: "h0123456789abcdef", userId: BOB.userId, eventId: ev, tier: "t1", qty: 2, paid: 40, source: "self-reported" });
    const w = new LiveTestWorld({ doc });
    const refusal = w.no(ANN.userId, { type: "accept", requestId: offer });
    expect(refusal).toBe(BUYER_LIMITS);
    expect(refusal).not.toMatch(/\d|Bob/);
  });

  it("a held reply goes through whatever the requester holds, so trying quantities tells the seller nothing (review P3)", () => {
    // Bob asks publicly for 3 (4 per person) and privately holds 0 to 3 more. Ann tries replies of 3, 2 and 1 without keeping them.
    const answers = (holds: number) => {
      const w = new LiveTestWorld();
      const ev = w.addEvent(ANN);
      if (holds > 0) w.ok(BOB.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: holds, paid: "40" });
      const iso = w.requestFor(BOB, ev, { qty: 3, budget: "40" });
      const h = must(w.ok(ANN.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 3, paid: "40" }).id, "holding");
      const reply = (qty: number): Action => ({ type: "isoReply", isoId: iso, holdingId: h, qty, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@ann-lee", note: "", membersOnly: false });
      return [3, 2, 1].map((qty) => w.run(() => { const r = E.reduce(w.doc, ANN.userId, reply(qty)); return r.error ?? `ok: ${r.toast ?? ""}`; }));
    };
    const none = answers(0);
    expect(none).toEqual(Array.from({ length: 3 }, () => "ok: Sent to Bob. If they accept within 6 hours, it's reserved for them for 15 minutes while they pay you."));
    for (const holds of [1, 2, 3]) expect(answers(holds), `Bob holds ${holds}`).toEqual(none);
  });

  it("the requester's own answer checks their limit, in their own words, and they can decline", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    w.ok(BOB.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 3, paid: "40" }); // Bob's private holding of 3
    const iso = w.requestFor(BOB, ev, { qty: 2, budget: "40" });
    const h = must(w.ok(ANN.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 2, paid: "40" }).id, "holding");
    const held = must(w.ok(ANN.userId, { type: "isoReply", isoId: iso, holdingId: h, qty: 2, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@ann-lee", note: "", membersOnly: false }).id, "held reply");
    expect(w.no(BOB.userId, { type: "respond", requestId: held, accept: true, member: false })).toBe("That would go over 4 per person for this event.");
    w.ok(BOB.userId, { type: "respond", requestId: held, accept: false });
    expect(requestOf(w, held).status).toBe("declined");
    expect(listingOf(w, requestOf(w, held).listingId).withdrawnAt).toEqual(expect.any(Number)); // the reply closed, and Ann's ticket is free again
    w.ok(ANN.userId, { type: "list", holdingId: h, qty: 2, ask: "35", method: "app", payHandle: "@ann-lee", file: null });
  });

  it("the preview keeps its wording, which names the buyer", () => {
    const s = seed();
    E.applyWorld(s);
    const took = E.reduce(s, "o_sam", { type: "take", listingId: "l4", qty: 1 }); // Sam's unpaid reservation on the gala
    expect(took.error).toBeUndefined();
    expect(E.reduce(took.state, "u_jordan", { type: "accept", requestId: "r1" }).error).toBe("Sam already has an unpaid reservation for this event. They need to pay for it or cancel it first.");
  });
});

describe("how long an offer, a counter or a held reply stays open, in its words (EPV PRE1)", () => {
  it("names the time actually left when the transfer cutoff comes first, never \"1 hour\" for minutes; whole hours read as before", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN, { deadline: "2026-11-10T12:08" }); // T0 is noon: the transfer window closes in 8 minutes
    const l = w.listTickets(ANN, ev, { qty: 2, obo: true });
    const sent = w.ok(BOB.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false });
    expect(sent.toast).toBe("Offer sent. Ann has 8 minutes to accept, counter or decline.");
    expect(sent.notes.filter((n) => n.userId === ANN.userId).map((n) => n.text)).toEqual([expect.stringMatching(/ Accept, counter once or decline within 8 minutes\.$/)]);
    expect(requestOf(w, must(sent.id, "offer")).expiresAt).toBe(T0 + 8 * MIN); // what the words say is what the rule stored
    w.advance(2 * MIN + 30_000);
    const countered = w.ok(ANN.userId, { type: "counter", requestId: must(sent.id, "offer"), amount: "33" });
    expect(countered.toast).toBe("Counter sent: $33 each. Bob has 6 minutes to accept or decline.");
    expect(countered.notes.filter((n) => n.userId === BOB.userId).map((n) => n.text)).toEqual([expect.stringMatching(/ Accept or decline within 6 minutes\. Accepting reserves it for 15 minutes, so accept when you can pay\.$/)]);
    // A held reply for Cat's request, with 5 minutes left.
    w.advance(30_000);
    const iso = w.requestFor(CAT, ev, { qty: 1, budget: "40", days: 0 }); // needed by tonight (a request can't outlast the cutoff by more than a day)
    const h = must(w.ok(DAN.userId, { type: "addHolding", eventId: ev, tier: "t1", qty: 1, paid: "40" }).id, "holding");
    const held = w.ok(DAN.userId, { type: "isoReply", isoId: iso, holdingId: h, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@dan-ng", note: "", membersOnly: false });
    expect(held.toast).toBe("Sent to Cat. If they accept within 5 minutes, it's reserved for them for 15 minutes while they pay you.");
    expect(held.notes.filter((n) => n.userId === CAT.userId).map((n) => n.text)).toEqual([expect.stringMatching(/ Accept within 5 minutes to reserve it for 15 minutes, and pay right away\.$/)]);
    // The cutoff 2 hours 30 minutes away: both parts. A day or more away: the rule's whole hours, word for word as before.
    const later = new LiveTestWorld();
    const l2 = later.listTickets(ANN, later.addEvent(ANN, { deadline: "2026-11-10T14:30" }), { obo: true });
    expect(later.ok(BOB.userId, { type: "offer", listingId: l2, qty: 1, amount: "30", msg: "", member: false }).toast).toBe("Offer sent. Ann has 2 hours 30 minutes to accept, counter or decline.");
    const usual = new LiveTestWorld();
    const l3 = usual.listTickets(ANN, usual.addEvent(ANN), { obo: true });
    expect(usual.ok(BOB.userId, { type: "offer", listingId: l3, qty: 1, amount: "30", msg: "", member: false }).toast).toBe("Offer sent. Ann has 6 hours to accept, counter or decline.");
  });

  it("is one engine helper, which the page also uses for its words before sending: counted from the minute, never more than is left, never 0", () => {
    expect(E.openLen(T0 + 6 * HOUR, T0)).toBe("6 hours");
    expect(E.openLen(T0 + 8 * MIN, T0 + 30_000)).toBe("8 minutes"); // offerEnd counts from the start of the minute
    expect(E.openLen(T0 + 61 * MIN, T0)).toBe("1 hour 1 minute");
    expect(E.openLen(T0 + 150 * MIN + 59_000, T0)).toBe("2 hours 30 minutes"); // a part-minute left over isn't rounded up
    expect(E.openLen(T0 + 20_000, T0)).toBe("1 minute");
  });
});

describe("a held reply whose match lapsed, before any read swept the world (review INT-2)", () => {
  /** Bob's request; Ann's held reply, which Bob accepts; then its 15-minute hold lapses, and nobody reads or writes in between. */
  function lapsed() {
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    const iso = w.requestFor(BOB, ev, { qty: 1, budget: "35" });
    const r = must(w.ok(ANN.userId, { type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
      then: { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@ann-lee", note: "", membersOnly: false } }).id, "held reply");
    w.ok(BOB.userId, { type: "respond", requestId: r, accept: true, member: false });
    const reply = requestOf(w, r).listingId;
    const open = { w, ev, r, reply, holding: listingOf(w, reply).holdingId };
    w.now = must(requestOf(w, r).holdUntil, "hold") + MIN;
    return open;
  }
  const take = (listingId: string): Action => ({ type: "take", listingId, qty: 1, amount: "", msg: "", member: false });

  it("its requester can't reserve it again: the write settles the lapse first, as a read's sweep would have", () => {
    const { w, reply } = lapsed();
    expect(w.no(BOB.userId, take(reply))).toBe("This listing was withdrawn.");
    expect(w.no(BOB.userId, { type: "offer", listingId: reply, qty: 1, amount: "30", msg: "", member: false })).toBe("This listing was withdrawn.");
    // The same answer as after a sweep.
    w.sweep();
    expect(w.no(BOB.userId, take(reply))).toBe("This listing was withdrawn.");
  });

  it("its seller can list the ticket again at once, without waiting for a read", () => {
    const { w, holding } = lapsed();
    const id = w.ok(ANN.userId, { type: "list", holdingId: holding, qty: 1, ask: "35", method: "app", payHandle: "@ann-lee", file: null, note: "" }).id;
    expect(id).toMatch(/^l[0-9a-f]{16}$/);
  });

  it("to anyone but its requester and seller it doesn't exist, open or lapsed", () => {
    const { w, reply } = lapsed();
    for (const who of [CAT, DAN]) expect(w.no(who.userId, take(reply)), who.name).toBe("Listing not found.");
    const open = new LiveTestWorld();
    const ev = open.addEvent(ANN);
    const iso = open.requestFor(BOB, ev, { qty: 1, budget: "35" });
    const r = must(open.ok(ANN.userId, { type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
      then: { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@ann-lee", note: "", membersOnly: false } }).id, "held reply");
    const listing = requestOf(open, r).listingId;
    expect(open.no(CAT.userId, take(listing))).toBe("Listing not found.");
    expect(open.no(CAT.userId, { type: "offer", listingId: listing, qty: 1, amount: "30", msg: "", member: false })).toBe("Listing not found.");
    expect(open.no(BOB.userId, take(listing))).toBe("No tickets are left on this listing."); // its requester answers it with respond instead
  });
});

describe("a live view's fields (C-DESIGN §3.5)", () => {
  function viewWorld() {
    const { w, l } = market({ reserve: true });
    const item = w.postItem(ANN);
    return { w, l, item };
  }

  it("outside withEngine, listingNumbers, itemState and selfReported read the view's numbers, state and source", () => {
    const { w, l, item } = viewWorld();
    const doc = copyDoc(w);
    const view = {
      ...doc, holdings: [], requests: [],
      listings: doc.listings.map((x) => ({ ...x, numbers: { reserved: 1, completed: 0, available: 1 }, source: "self-reported" as const })),
      goods: doc.goods.map((x) => ({ ...x, state: { key: "reserved", label: "On hold", tone: "warn" as const } })),
    };
    E.setLiveClock(() => w.now);
    E.applyWorld(view);
    const vl = must(view.listings.find((x) => x.id === l), "listing");
    const vi = must(view.goods.find((x) => x.id === item), "item");
    expect(E.listingNumbers(view, vl)).toEqual({ reserved: 1, completed: 0, available: 1 }); // the view has no requests at all
    expect(E.itemState(view, vi)).toEqual({ key: "reserved", label: "On hold", tone: "warn" });
    expect(E.selfReported(view, vl)).toBe(true); // the view has no holdings either
  });

  it("inside withEngine they're ignored: the engine counts every request itself", () => {
    const { w, l, item } = viewWorld();
    w.take(CAT, l); // the second ticket: none left
    const doc = copyDoc(w);
    const planted = must(doc.listings.find((x) => x.id === l), "listing");
    planted.numbers = { reserved: 0, completed: 0, available: 99 };
    must(doc.goods.find((x) => x.id === item), "item").state = { key: "sold", label: "Sold", tone: "muted" };
    const w2 = new LiveTestWorld({ doc, now: w.now });
    w2.run(() => {
      expect(E.listingNumbers(w2.doc, planted)).toEqual({ reserved: 2, completed: 0, available: 0 });
      expect(E.itemState(w2.doc, must(w2.doc.goods[0], "item")).key).toBe("available");
    });
    expect(w2.no(DAN.userId, { type: "take", listingId: l, qty: 1, amount: "", msg: "", member: false })).toBe("No tickets are left on this listing.");
  });
});

describe("applyWorld in the browser", () => {
  it("installs a view's events and people with the live clock; unknown ids read 'A classmate'", () => {
    const { w, ev } = market();
    const view = { ...copyDoc(w), people: {
      [ANN.userId]: { name: "Ann Lee", first: "Ann", color: "#2563A8", demo: true, contact: "ann@example.invalid", pay: "@ann-lee" },
      [BOB.userId]: { name: "Bob D.", first: "Bob", color: "#0E7C66", demo: true },
    } };
    E.setLiveClock(() => T0 + 5 * MIN);
    E.applyWorld(view);
    expect(E.CLOCK).toBe(T0 + 5 * MIN);
    expect(E.PEOPLE[ANN.userId]).toEqual({ name: "Ann Lee", first: "Ann", color: "#2563A8", demo: true, contact: "ann@example.invalid", pay: "@ann-lee" });
    expect(E.PEOPLE[BOB.userId]?.contact).toBeUndefined();
    expect(E.PEOPLE["user-zed"]).toMatchObject({ name: "A classmate", demo: true });
    expect(E.EVENTS.map((e) => e.id)).toEqual([ev]);
    expect(E.EV[ev]?.sourcesNote).toBe("Added by Ann L. · details not checked by Handoff"); // a public surface: never the full name
    expect(E.FEATURED).toEqual([]);
    expect(E.uid()).toMatch(/^[0-9a-f]{16}$/);
    // Normalizing a normalized event changes nothing (the server sends normalized events; the browser applies them again).
    const once = must(E.EV[ev], "event");
    expect(E.normalizeEvent(once)).toEqual(once);
  });

  it("builds By club's menu from live events: one entry per club, spellings grouped, safe keys", () => {
    const w = new LiveTestWorld();
    const pevc = w.addEvent(ANN, { title: "PE/VC Gala", club: "PE/VC Club" });
    w.addEvent(BOB, { title: "PE/VC Mixer", club: "PE/VC club" });
    w.addEvent(CAT, { title: "Tasting", club: "Wharton Wine Club", cat: "Food & drink" });
    w.ok(DAN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 2, "06:00"), openUntil: wallAfter(T0, 7, "23:00"), ticketType: "paper", tiers: [{ label: "Coach", price: "89" }] });
    w.run(() => {
      expect(E.CLUB_MENU.map((c) => c.label)).toEqual(["PE/VC Club", "Wharton Wine Club"]); // a tie goes to the first spelling in code order
      const k = must(E.CLUB_MENU[0], "club").k;
      expect(E.CLUB_MENU.every((c) => /^c[0-9a-z]+$/.test(c.k))).toBe(true);
      expect(E.clubOrgs(k)).toEqual(["PE/VC Club", "PE/VC club"]);
      expect(E.clubOf(k)?.label).toBe("PE/VC Club");
      expect(E.clubOf("all")).toBeNull();
      expect(E.CLUBS).toEqual(["PE/VC Club", "PE/VC club", "Wharton Wine Club"]);
      expect(E.exploreRows(w.doc, ANN.userId, { club: E.clubOrgs(k) ?? [] }).map((r) => r.ev.id)).toContain(pevc);
    });
  });

  it("switching back to the preview restores the sample catalog, and the rule self-tests still pass", () => {
    const { w } = market({ reserve: true });
    w.sweep();
    E.setLiveClock(() => T0);
    E.applyWorld({ ...copyDoc(w), people: {} });
    E.applyWorld(seed());
    expect(E.EVENTS).toHaveLength(15);
    expect(E.EV["e_wine"]?.title).toBe("Monthly Tasting: Northern Rhône Syrah");
    expect(E.PEOPLE["u_priya"]?.name).toBe("Langston Chen");
    expect(E.PEOPLE["user-nobody"]).toBeUndefined();
    expect(E.CLUB_MENU).toHaveLength(14);
    expect(E.FEATURED).toEqual(["e_vets", "e_pevc", "e_wine_fg", "e_euro"]);
    expect(E.CLOCK).toBe(E.DEMO_BASE);
    expect(E.uid()).toMatch(/^[0-9a-z]{1,7}$/);
    const results = runSelfTests(seed());
    expect(results.filter((t) => !t.pass).map((t) => `${t.name}: ${t.detail}`)).toEqual([]);
    expect(results).toHaveLength(96);
  });
});

describe("invariantViolations (C-DESIGN §4.6)", () => {
  /** A world with a bit of everything, all of it consistent. */
  function healthy() {
    const { w, ev, l, r } = market({ reserve: true });
    w.ok(CAT.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" });
    const item = w.postItem(ANN);
    const g = must(w.ok(DAN.userId, { type: "requestItem", id: item, msg: "", shareContact: true }).id, "goods request");
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    return { w, ev, l, r, item, g };
  }
  const check = (w: LiveTestWorld, doc: LiveWorld): string[] => w.run(() => E.invariantViolations(doc));

  it("finds nothing in a consistent world, and runs only inside withEngine", () => {
    const { w } = healthy();
    expect(check(w, w.doc)).toEqual([]);
    expect(() => E.invariantViolations(w.doc)).toThrow(/inside withEngine/);
    expect(() => E.nextDue(w.doc)).toThrow(/inside withEngine/);
  });

  it("names each kind of damage with a stable key", () => {
    const { w, ev, l, r, item, g } = healthy();
    const holdingId = listingOf(w, l).holdingId;
    const damage: [string, (d: LiveWorld) => void, string[]][] = [
      ["oversold", (d) => { d.requests.push({ ...requestOf(w, r), id: "r0000000000000001", buyerId: CAT.userId, qty: 2 }); }, [`oversold:${l}`]],
      ["holding short", (d) => { must(d.holdings.find((h) => h.id === holdingId), "holding").qty = 1; }, [`holding-overlisted:${holdingId}`]],
      ["holding negative", (d) => { must(d.holdings.find((h) => h.id === holdingId), "holding").qty = -1; }, [`holding-negative:${holdingId}`, `holding-overlisted:${holdingId}`]],
      ["listing without holding", (d) => { must(d.listings[0], "listing").holdingId = "h0000000000000000"; }, [`listing-holding:${l}`]],
      ["request without listing", (d) => { must(d.requests[0], "request").listingId = "l0000000000000000"; }, [`request-listing:${r}`]],
      ["goods request without item", (d) => { must(d.goodsReqs[0], "goods request").itemId = "g0000000000000000"; }, [`goodsreq-item:${g}`]],
      ["item held twice", (d) => { d.goodsReqs.push({ ...goodsReqOf(w, g), id: "gr0000000000000001", buyerId: EVE.userId }); }, [`item-double-hold:${item}`]],
      ["two unpaid reservations", (d) => { const x = requestOf(w, r); d.listings.push({ ...listingOf(w, l), id: "l0000000000000002", listed: 1, history: [] }); d.requests.push({ ...x, id: "r0000000000000002", listingId: "l0000000000000002", createdAt: x.createdAt + 1 }); },
        [`holding-overlisted:${holdingId}`, "unpaid-twice:r0000000000000002"]],
      ["duplicate id", (d) => { d.interests.push({ ...must(d.interests[0], "alert") }); }, [`duplicate-id:interests:${must(w.doc.interests[0], "alert").id}`]],
      ["event without a valid tier", (d) => { must(d.events[0], "event").tiers = [{ id: "t1", label: "GA", price: 6000 }]; }, [`event-tiers:${ev}`]],
      ["record on a missing event", (d) => { must(d.holdings[0], "holding").eventId = "ev-0000000000000000"; }, [`event-ref:holdings:${holdingId}`]],
      // A listing, a request and an open alert may not refer to a removed event; a holding may (removeEvent leaves them, inert).
      ["records on a removed event", (d) => { must(d.events[0], "event").removedAt = T0; }, [`event-ref:listings:${l}`, `event-ref:requests:${r}`, `event-ref:interests:${must(w.doc.interests[0], "alert").id}`]],
      ["a closed alert and a holding on a removed event are fine", (d) => { must(d.events[0], "event").removedAt = T0; must(d.interests[0], "alert").status = "closed"; }, [`event-ref:listings:${l}`, `event-ref:requests:${r}`]],
      ["a closed alert on a missing event isn't", (d) => { must(d.interests[0], "alert").status = "closed"; must(d.interests[0], "alert").eventId = "ev-0000000000000000"; }, [`event-ref:interests:${must(w.doc.interests[0], "alert").id}`]],
      ["notifications not drained", (d) => { d.notifications.push({ id: "0123456789abcdef", userId: BOB.userId, text: "x", link: { name: "activity" }, at: T0, read: false }); }, ["notifications-not-drained"]],
      ["strikes, policies and alert preferences", (d) => { d.strikes = { [BOB.userId]: 1 }; d.policies = { [ev]: "official" }; d.alertPrefs = { [BOB.userId]: { email: true } }; }, ["strikes-not-empty", "policies-not-empty", "alertPrefs-not-empty"]],
      ["a collection that isn't a list", (d) => { (d as unknown as Record<string, unknown>)["goods"] = {}; }, ["not-a-list:goods", `goodsreq-item:${g}`]],
      // A seller's pause takes nothing new (C-CONTRACT §8): a reservation, offer or hold made after it, a paused held reply, a pause that isn't a time.
      ["a reservation made after its listing was paused", (d) => { must(d.listings[0], "listing").pausedAt = must(requestOf(w, r).acceptedAt, "acceptedAt") - 1; }, [`paused-new:${r}`]],
      ["a hold agreed after its item was paused", (d) => { must(d.goods[0], "item").pausedAt = must(goodsReqOf(w, g).acceptedAt, "acceptedAt") - 1; }, [`paused-new:${g}`]],
      ["a paused held reply", (d) => { Object.assign(must(d.listings[0], "listing"), { isoReplyFor: must(w.doc.interests[0], "alert").id, pausedAt: T0 + 30 * DAY }); }, [`paused-reply:${l}`]],
      ["a pause that isn't a time", (d) => { (must(d.listings[0], "listing") as unknown as Record<string, unknown>)["pausedAt"] = "soon"; (must(d.goods[0], "item") as unknown as Record<string, unknown>)["pausedAt"] = Number.NaN; },
        [`paused-at:${l}`, `paused-at:${item}`]],
    ];
    for (const [what, harm, keys] of damage) {
      const doc = copyDoc(w);
      harm(doc);
      const found = check(w, doc);
      expect([...found].sort(), what).toEqual([...keys].sort());
      expect(check(w, doc), `${what}: stable`).toEqual(found);
    }
    expect(check(w, { ...copyDoc(w), mode: "preview" } as unknown as LiveWorld)).toEqual(["mode-not-live"]);
  });

  it("checks the document it is given, not the world that happens to be installed (and so does nextDue)", () => {
    const { w } = healthy();
    const other = new LiveTestWorld({ now: w.now }); // an event, listing and hold the installed world doesn't have
    const ev = other.addEvent(EVE, { title: "Other Gala" });
    const l = other.listTickets(EVE, ev); // one ticket
    other.take(DAN, l);
    const doc = copyDoc(other);
    const hold = must(doc.requests[0], "request");
    doc.requests.push({ ...hold, id: "r0000000000000009", buyerId: CAT.userId }); // a second hold on the one ticket
    expect(check(w, doc)).toEqual([`oversold:${l}`]);
    expect(w.run(() => E.nextDue(doc))).toBe(hold.holdUntil);
  });
});

describe("nextDue and sweeps (C-DESIGN §5.3)", () => {
  it("nextDue is the earliest future deadline: a hold, an offer, a goods response or hold", () => {
    const { w, ev, r } = market({ reserve: true });
    w.run(() => expect(E.nextDue(w.doc)).toBe(requestOf(w, r).holdUntil));
    const offer = must(w.ok(DAN.userId, { type: "offer", listingId: w.listTickets(CAT, ev, { obo: true }), qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    expect(requestOf(w, offer).expiresAt).toBeGreaterThan(requestOf(w, r).holdUntil ?? 0);
    w.run(() => expect(E.nextDue(w.doc)).toBe(requestOf(w, r).holdUntil));
    w.advance(16 * MIN); // past the hold, before the offer lapses
    w.run(() => expect(E.nextDue(w.doc)).toBe(requestOf(w, offer).expiresAt)); // only future deadlines count
    const fresh = new LiveTestWorld();
    const item = fresh.postItem(ANN);
    fresh.run(() => expect(E.nextDue(fresh.doc)).toBeNull()); // an item alone changes nothing stored
    const g = must(fresh.ok(DAN.userId, { type: "requestItem", id: item, msg: "", shareContact: true }).id, "goods request");
    fresh.run(() => expect(E.nextDue(fresh.doc)).toBe(E.goodsRespondBy(goodsReqOf(fresh, g), must(fresh.doc.goods[0], "item"))));
    fresh.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    fresh.run(() => expect(E.nextDue(fresh.doc)).toBe(goodsReqOf(fresh, g).holdUntil));
  });

  it("a sweep with nothing due changes nothing; after a hold lapses it stores the expiry once", () => {
    const { w, l, r } = market({ reserve: true });
    const before = JSON.stringify(w.doc);
    const idle = w.sweep();
    expect(idle.res.error).toBeUndefined();
    expect(JSON.stringify(idle.res.state)).toBe(before); // the store spends no version on it
    w.now = (requestOf(w, r).holdUntil ?? 0) + 1;
    w.sweep();
    expect(requestOf(w, r)).toMatchObject({ status: "expired", reason: "The reservation ended without payment, so it went back on sale." });
    w.run(() => expect(E.listingNumbers(w.doc, listingOf(w, l)).available).toBe(2));
    const swept = JSON.stringify(w.doc);
    expect(JSON.stringify(w.sweep().res.state)).toBe(swept);
    w.run(() => expect(E.nextDue(w.doc)).toBeNull());
  });

  it("a sweep after a goods hold lapses makes the backups active again and tells them", () => {
    const w = new LiveTestWorld();
    const item = w.postItem(ANN);
    const dan = must(w.ok(DAN.userId, { type: "requestItem", id: item, msg: "", shareContact: true }).id, "Dan's request");
    w.ok(ANN.userId, { type: "acceptItemReq", id: dan, shareContact: true });
    const eve = must(w.ok(EVE.userId, { type: "requestItem", id: item, msg: "", shareContact: true }).id, "Eve's request");
    expect(goodsReqOf(w, eve).status).toBe("waiting");
    w.now = (goodsReqOf(w, dan).holdUntil ?? 0) + 1;
    const swept = w.sweep();
    expect(goodsReqOf(w, dan)).toMatchObject({ status: "expired", reason: "No pickup time was agreed within 48 hours, so the hold ended." });
    expect(goodsReqOf(w, eve).status).toBe("pending");
    expect(swept.notes.map((n) => n.userId).sort()).toEqual([ANN.userId, EVE.userId].sort());
  });
});

describe("setActionTap (tests only)", () => {
  it("sees every reduce with its depth, and stops when removed", () => {
    const seen: [string, number, boolean][] = [];
    E.setActionTap((actor, action, result, depth) => { seen.push([String(action.type), depth, result.error === undefined]); });
    const w = new LiveTestWorld();
    const ev = w.addEvent(ANN);
    w.listTickets(ANN, ev);
    E.setActionTap(null);
    w.listTickets(BOB, ev);
    expect(seen).toEqual([["createEvent", 0, true], ["addHolding", 1, true], ["list", 1, true], ["addThen", 0, true]]);
  });
});

describe("the preview is unchanged", () => {
  it("seed() gives the same sample data after a live run, while a live view is installed, and between runs", () => {
    market({ reserve: true }).w.sweep(); // PEOPLE is empty now (between withEngine runs)
    expect(JSON.stringify(seed())).toBe(SEED_AT_LOAD);
    E.setLiveClock(() => T0);
    E.applyWorld(E.emptyWorld()); // a browser tab that showed the live page
    expect(JSON.stringify(seed())).toBe(SEED_AT_LOAD);
  });

  it("after live runs: sample people, simulated delivery, '(simulated)' sources, demo rules and share text", () => {
    market({ reserve: true }).w.sweep(); // live runs first, in the same module
    let s = seed();
    E.applyWorld(s);
    const stamp = E.stampOf(s);
    expect(stamp).toBe(E.CLOCK + 1); // the demo clock plus a tick
    // A made-up seller's step can still be simulated by the buyer, and a file is "delivered".
    s = E.reduce(s, "u_priya", { type: "take", listingId: "l12", qty: 1 }).state;
    const id = must(s.requests[0], "request").id;
    s = E.reduce(s, "u_priya", { type: "markPaid", requestId: id }).state;
    const delivered = E.reduce(s, "u_priya", { type: "confirmPayment", requestId: id, simulate: true });
    expect(delivered.error).toBeUndefined();
    expect(delivered.state.requests.find((x) => x.id === id)?.status).toBe("sent");
    s = E.reduce(delivered.state, "u_priya", { type: "buyerReceived", requestId: id }).state;
    expect(s.holdings.some((h) => h.userId === "u_priya" && h.source === "transferred (simulated)")).toBe(true);
    expect(E.gState({ ...must(seed().goodsReqs[0], "gr1"), restoredAt: E.CLOCK - 49 * HOUR }, must(seed().goods.find((x) => x.id === "g6"), "g6")).reason).toBe("The seller didn't respond within 48 hours (demo rule).");
    expect(E.shareText({ type: "listing", id: "l2" }, seed(), new Set(["l2"])).text).toMatch(/\[Handoff prototype: illustrative listing\]$/);
    expect(E.priceBasis("demo price")).toBe("demo figure, not a real price");
    expect(E.METHODS.file.verb).toBe("send the PDF or QR code");
  });
});
