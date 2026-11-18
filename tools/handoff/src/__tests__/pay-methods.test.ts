// Follow-on Batch 1, the server half (USER-INSTRUCTIONS §9 Batch 1 and §9a; FOLLOWON-PLAN §1.1 B1.1-B1.3, B1.6-B1.8, B1.10-B1.12, §2.1,
// §2.6, §2.7; C-CONTRACT §1, §2): payment methods on the profile, and the copy each exchange keeps. What it shows:
// - one check, the engine's checkPayMethods, for the page and the store: Venmo usernames, Zelle emails or US mobile numbers, PayPal as
//   before; 0 to 2 methods of different kinds, the first preferred; a handle saved before B1 is "other", word for word, never saved again;
// - listings use the seller's saved methods; each reservation copies them once, as it becomes "accepted" (take, accept, respond), and
//   nothing rewrites the copy: not a profile change, an Edit, a pause, a resume or a close;
// - who sees what: the kinds to every signed-in viewer before committing, never a guest; where to pay only in the exchange's own copy,
//   to its two parties, from the reservation on, and not before it or after it ends unpaid; a viewer's own methods to them only;
// - "I've sent payment" (markPaid, naming the method used) stays the buyer's word, apart from the seller's "Payment received", and the
//   paid steps still work after the event starts (R1, R4); its toast says "Payment marked as sent", in the button's words (W1 fix, OBS-3);
// - the store: methods saved normalized, a legacy handle replaced, the last method kept while an open listing needs it (under the
//   world's lock), and nothing taken from the account's email;
// - protocol 2 (B1's page): saveMyProfile takes payMethods only, a handle sent with a listing is dropped on the server's path, a viewer
//   carries no legacy handle beside their methods, and a buyer gets a listing's own handle only for an exchange from before B1.
// Listings from before protocol 2 (with a handle typed with them) can only be made on the engine's own path now (sellLegacy).
// Labelled test accounts with made-up ids and @example.invalid emails; no sign-in of any kind.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { LiveWorld, PayMethod, TicketRequest } from "../../engine/index.js";
import { seed } from "../../engine/preview.js";
import { LAST_METHOD_ERROR, ensurePerson, getGuestView, getView, savePayMethods, saveProfile } from "../store.js";
import { PAY_METHODS_INVALID, handleSaveMyProfile, type ActionContext, type SessionUser } from "../handlers.js";
import type { Actor, View, WorldId } from "../types.js";
import { contractViolations, guestContractViolations } from "./helpers/contract.js";
import { createTestDb, databaseUrl, deferred, waitForLockWaiters, type TestDb } from "./helpers/db.js";
import { StoreWorld, TEST_A, TEST_B, TEST_C, actions, checked, okOf, refusedOf, type SentAction } from "./helpers/live-store.js";
import { FAY, ServerWorld, guestViewOf, viewOf } from "./helpers/views.js";
import { BOB, CAT, DAN, DAY, EVE, LiveTestWorld, MIN, type TestPerson, dateAfter, deepFreeze } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

afterEach(() => {
  E.setLiveClock(null);
  E.applyWorld(null);
});

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}

const VENMO = "Venmo: enter your username, like @ann-lee.";
const ZELLE = "Zelle: enter the email or US mobile number enrolled with Zelle.";
const PAYPAL = "PayPal: up to 60 characters, on one line.";
const NO_METHODS = "Add how buyers can pay you: Venmo or Zelle."; // §9q item 5: PayPal is kept for those who saved it, not offered as new
const SELLER_HAS_NONE = "This seller hasn't added how to pay them yet.";

// ── The check (no database) ──────────────────────────────────────────────────────────────

describe("checkPayMethods, formatPayMethod and readPayMethods: one check for the page and the store", () => {
  it("accepts Venmo usernames, Zelle emails and US mobile numbers, and PayPal as typed, normalized (B1.1)", () => {
    const cases: [PayMethod["kind"], string, string][] = [
      ["venmo", "@ann-lee", "ann-lee"],
      ["venmo", "  Ann_Lee2 ", "Ann_Lee2"],
      ["venmo", "@abcde", "abcde"],
      ["venmo", `@${"a".repeat(30)}`, "a".repeat(30)],
      ["zelle", "ann@upenn.edu", "ann@upenn.edu"],
      ["zelle", " Ann.Lee@UPenn.EDU ", "ann.lee@upenn.edu"],
      ["zelle", "215-555-0142", "+12155550142"],
      ["zelle", "(215) 555-0142", "+12155550142"],
      ["zelle", "+1 215 555 0142", "+12155550142"],
      ["zelle", "1.215.555.0142", "+12155550142"],
      ["zelle", "2155550142", "+12155550142"],
      ["paypal", "paypal.me/annlee", "paypal.me/annlee"],
      ["paypal", " ann.lee@example.com ", "ann.lee@example.com"],
      ["paypal", "\u{1F642}".repeat(60), "\u{1F642}".repeat(60)], // 60 characters, counted as people see them
    ];
    for (const [kind, value, stored] of cases) {
      expect(E.checkPayMethods([{ kind, value }]), `${kind} ${JSON.stringify(value)}`).toEqual({ ok: true, methods: [{ kind, value: stored }] });
    }
  });

  it("refuses what isn't one, beside its field, in the words the page shows (B1.1)", () => {
    const cases: [string, unknown, string][] = [
      ["venmo", "ann lee", VENMO], ["venmo", "@@ann-lee", VENMO], ["venmo", "abcd", VENMO], ["venmo", "a".repeat(31), VENMO],
      ["venmo", "ann.lee", VENMO], ["venmo", "", VENMO], ["venmo", "@ann\u0000", VENMO], ["venmo", 42, VENMO],
      ["zelle", "555-0142", ZELLE], ["zelle", "015-555-0142", ZELLE], ["zelle", "215-155-0142", ZELLE], ["zelle", "+44 20 7946 0958", ZELLE],
      ["zelle", "ann@upenn", ZELLE], ["zelle", "ann@@upenn.edu", ZELLE], ["zelle", "ann lee@upenn.edu", ZELLE], ["zelle", "", ZELLE],
      ["zelle", `${"a".repeat(250)}@upenn.edu`, ZELLE], ["zelle", 2155550142, ZELLE], ["zelle", "x".repeat(401), ZELLE],
      ["paypal", "", "PayPal: enter your PayPal username or email."], ["paypal", "x".repeat(61), PAYPAL], ["paypal", "a\nb", PAYPAL],
      ["paypal", "\ud800abc", PAYPAL], ["paypal", "\u{1F642}".repeat(61), PAYPAL],
    ];
    for (const [kind, value, error] of cases) {
      expect(E.checkPayMethods([{ kind, value }]), `${kind} ${JSON.stringify(value)}`).toEqual({ ok: false, index: 0, error });
    }
  });

  it("takes 0 to 2 methods of different kinds in the order given, never 'other' (B1.2, B1.3)", () => {
    expect(E.checkPayMethods([])).toEqual({ ok: true, methods: [] });
    expect(E.checkPayMethods([{ kind: "zelle", value: "ann@upenn.edu" }, { kind: "venmo", value: "@ann-lee" }]))
      .toEqual({ ok: true, methods: [{ kind: "zelle", value: "ann@upenn.edu" }, { kind: "venmo", value: "ann-lee" }] }); // the first is preferred
    expect(E.checkPayMethods([{ kind: "venmo", value: "@ann-lee" }, { kind: "venmo", value: "@ann-lee2" }])).toEqual({ ok: false, index: 1, error: "You've already added Venmo." });
    expect(E.checkPayMethods([{ kind: "venmo", value: "@ann-lee" }, { kind: "zelle", value: "555-0142" }])).toEqual({ ok: false, index: 1, error: ZELLE });
    const three = [{ kind: "venmo", value: "@ann-lee" }, { kind: "zelle", value: "ann@upenn.edu" }, { kind: "paypal", value: "ann" }];
    expect(E.checkPayMethods(three)).toEqual({ ok: false, index: null, error: "Save one or two ways to be paid." });
    for (const kind of ["other", "cashapp", "Venmo", undefined]) {
      expect(E.checkPayMethods([{ kind, value: "@ann-lee" }]), String(kind)).toEqual({ ok: false, index: 0, error: "Choose Venmo, Zelle or PayPal." });
    }
    for (const list of [null, "venmo", { kind: "venmo", value: "@ann-lee" }, [null], [["venmo"]]]) {
      expect(E.checkPayMethods(list), JSON.stringify(list)).toMatchObject({ ok: false, error: "Choose Venmo, Zelle or PayPal." });
    }
  });

  it("shows each kind as people read it: Venmo with @, a Zelle number formatted, PayPal and a legacy handle as typed", () => {
    expect(E.formatPayMethod({ kind: "venmo", value: "ann-lee" })).toBe("@ann-lee");
    expect(E.formatPayMethod({ kind: "zelle", value: "+12155550142" })).toBe("(215) 555-0142");
    expect(E.formatPayMethod({ kind: "zelle", value: "ann@upenn.edu" })).toBe("ann@upenn.edu");
    expect(E.formatPayMethod({ kind: "paypal", value: "paypal.me/annlee" })).toBe("paypal.me/annlee");
    expect(E.formatPayMethod({ kind: "other", value: "@ann (Venmo or PayPal)" })).toBe("@ann (Venmo or PayPal)");
    expect(E.formatPayMethod(null)).toBe("");
  });

  it("reads a profile: its saved methods, or else a legacy handle as one 'other' word for word, and nothing else (B1.2, B1.6)", () => {
    const venmo = { kind: "venmo", value: "ann-lee" } as const, zelle = { kind: "zelle", value: "+12155550142" } as const;
    expect(E.readPayMethods([venmo, zelle], "@old")).toEqual([venmo, zelle]); // saved methods win (saving them empties the handle anyway)
    expect(E.readPayMethods([], "@Ann  Lee (venmo?)")).toEqual([{ kind: "other", value: "@Ann  Lee (venmo?)" }]);
    expect(E.readPayMethods([], "   ")).toEqual([]);
    expect(E.readPayMethods(null, "")).toEqual([]);
    expect(E.readPayMethods([{ kind: "other", value: "@x" }], "")).toEqual([]); // "other" is never saved
    expect(E.readPayMethods([venmo, { ...venmo, value: "ann-2" }, zelle], "")).toEqual([venmo, zelle]); // one per kind
    expect(E.readPayMethods([venmo, zelle, { kind: "paypal", value: "ann" }], "")).toEqual([venmo, zelle]); // at most two
    expect(E.readPayMethods([{ kind: "venmo", value: 7 }, "x", null], "@h")).toEqual([{ kind: "other", value: "@h" }]);
  });
});

// ── The engine, on the server's path ─────────────────────────────────────────────────────

/** Sal has saved Venmo and Zelle; Una, one Zelle email; Leo, a handle from before B1; Nia, nothing. */
const SAL: TestPerson = { userId: "user-sal", name: "Sal Rivera", payHandle: "", payMethods: [{ kind: "venmo", value: "sal-rivera" }, { kind: "zelle", value: "+12155550142" }] };
const UNA: TestPerson = { userId: "user-una", name: "Una Park", payHandle: "", payMethods: [{ kind: "zelle", value: "una.park@upenn.edu" }] };
const LEO: TestPerson = { userId: "user-leo", name: "Leo Marsh", payHandle: "@leo-old (Venmo)" };
const NIA: TestPerson = { userId: "user-nia", name: "Nia Cole", payHandle: "" };
const PEOPLE: readonly TestPerson[] = [SAL, UNA, LEO, NIA, BOB, CAT, DAN, EVE, FAY];
const SALS = SAL.payMethods ?? [];
const TICKET = { note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false } as const;
const REPLY = { qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, note: "", membersOnly: false } as const;

const requestOf = (w: ServerWorld, id: string): TicketRequest => must(w.doc.requests.find((r) => r.id === id), `request ${id}`);
/** The viewer's view, checked against C-CONTRACT §2. */
function view(w: ServerWorld, who: TestPerson): View {
  const v = viewOf(w, who);
  expect(contractViolations(v, who.userId), `${who.name}'s view`).toEqual([]);
  return v;
}
/**
 * An action on the engine's own path, without parseAction: what the store holds from before protocol 2 (a listing posted with a typed
 * handle, which the server's path drops now). Accepted, or the test fails.
 */
function onEngine(w: ServerWorld, actor: string, action: Record<string, unknown>): string {
  const { res } = LiveTestWorld.prototype.act.call(w, actor, action as E.Action);
  if (res.error !== undefined) throw new Error(`${String(action["type"])} by ${actor} was refused: ${res.error}`);
  return must(res.result?.id, String(action["type"]));
}
/**
 * Sell a ticket as the page does (Sell's addThen, no handle: the seller's saved methods apply). With `handle`, a listing from before
 * protocol 2, posted with a typed handle (the engine's own path: sellLegacy).
 */
function sell(w: ServerWorld, who: TestPerson, eventId: string, o: { qty?: number; obo?: boolean; handle?: string } = {}): string {
  const qty = o.qty ?? 1;
  const action = { type: "addThen", add: { eventId, tier: "t1", qty, paid: "40" }, then: { type: "list", qty, ask: "35", ...TICKET, obo: o.obo ?? false, ...(o.handle !== undefined ? { payHandle: o.handle } : {}) } };
  return o.handle !== undefined ? onEngine(w, who.userId, action) : must(w.ok(who.userId, action).id, "listing");
}
const sellLegacy = (w: ServerWorld, who: TestPerson, eventId: string, handle: string, qty = 1): string => sell(w, who, eventId, { qty, handle });
/** A holding of `qty`, and listings from it (a person adds one holding per ticket type). */
const hold = (w: ServerWorld, who: TestPerson, eventId: string, qty: number): string =>
  must(w.ok(who.userId, { type: "addHolding", eventId, tier: "t1", qty, paid: "40" }).id, "holding");
const listFrom = (w: ServerWorld, who: TestPerson, holdingId: string, o: { qty?: number; obo?: boolean } = {}): string =>
  must(w.ok(who.userId, { type: "list", holdingId, qty: o.qty ?? 1, ask: "35", ...TICKET, obo: o.obo ?? false }).id, "listing");
const take = (w: ServerWorld, who: TestPerson, listingId: string, qty = 1): string =>
  must(w.ok(who.userId, { type: "take", listingId, qty, amount: "", msg: "", member: false }).id, "reservation");
const offer = (w: ServerWorld, who: TestPerson, listingId: string, amount: string): string =>
  must(w.ok(who.userId, { type: "offer", listingId, qty: 1, amount, msg: "", member: false }).id, "offer");
const publicRequest = (w: ServerWorld, who: TestPerson, eventId: string): string =>
  must(w.ok(who.userId, { type: "saveInterest", data: { eventId, qty: 1, budget: "40", note: "", expires: dateAfter(w.now, 5) } }).id, "public request");
/** A person's saved methods change, as a later saveMyProfile would change their profile row. */
function setMethods(w: ServerWorld, who: TestPerson, payMethods: PayMethod[], payHandle = ""): void {
  w.people = w.people.map((p) => (p.userId === who.userId ? { ...p, payMethods, payHandle } : p));
}
function market() {
  const w = new ServerWorld({ people: PEOPLE });
  const ev = w.addEvent(SAL);
  return { w, ev };
}

describe("the engine: listings use the seller's methods, and each reservation keeps its own copy", () => {
  it("a seller with methods lists without a handle; with neither, listing and replying ask for one, typed handle or not; a listing from before keeps its own (B1.5, legacy)", () => {
    const { w, ev } = market();
    const l = sell(w, SAL, ev);
    expect(w.doc.listings.find((x) => x.id === l)).not.toHaveProperty("payHandle");
    const unpaid = (then: Record<string, unknown>) => w.no(NIA.userId, { type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" }, then });
    expect(unpaid({ type: "list", qty: 1, ask: "35", ...TICKET })).toBe(NO_METHODS);
    expect(unpaid({ type: "list", qty: 1, ask: "35", ...TICKET, payHandle: "  " })).toBe(NO_METHODS);
    // Protocol 2: a handle typed with the listing is dropped on the server's path (parseAction), so it's no way to be paid.
    expect(unpaid({ type: "list", qty: 1, ask: "35", ...TICKET, payHandle: "@nia typed" })).toBe(NO_METHODS);
    const iso = publicRequest(w, EVE, ev);
    expect(unpaid({ type: "isoReply", isoId: iso, ...REPLY })).toBe(NO_METHODS);
    expect(unpaid({ type: "isoReply", isoId: iso, ...REPLY, payHandle: "@nia typed" })).toBe(NO_METHODS);
    expect(JSON.stringify(w.doc)).not.toContain("@nia typed");
    // A listing from before protocol 2, posted with a typed handle (the engine's own path): kept on it, as before (a legacy listing).
    const typed = sellLegacy(w, NIA, ev, "  @nia old  ");
    expect(w.doc.listings.find((x) => x.id === typed)?.payHandle).toBe("@nia old");
    // A handle saved before B1 counts as a method: Leo lists without typing it, and the listing stores none.
    const leo = sell(w, LEO, ev);
    expect(w.doc.listings.find((x) => x.id === leo)).not.toHaveProperty("payHandle");
  });

  it("copies the methods once, as it's reserved: a take, an accepted offer, an accepted counter, an accepted held reply (B1.10)", () => {
    const { w, ev } = market();
    const h = hold(w, SAL, ev, 4);
    const l = listFrom(w, SAL, h, { qty: 3, obo: true });
    const rb = take(w, BOB, l);
    expect(requestOf(w, rb).pay).toEqual(SALS);
    const rc = offer(w, CAT, l, "30");
    expect(requestOf(w, rc)).not.toHaveProperty("pay");
    w.ok(SAL.userId, { type: "accept", requestId: rc });
    expect(requestOf(w, rc).pay).toEqual(SALS);
    const rd = offer(w, DAN, l, "30");
    w.ok(SAL.userId, { type: "counter", requestId: rd, amount: "33" });
    expect(requestOf(w, rd)).not.toHaveProperty("pay");
    w.ok(DAN.userId, { type: "respond", requestId: rd, accept: true });
    expect(requestOf(w, rd).pay).toEqual(SALS);
    const iso = publicRequest(w, EVE, ev);
    const re = must(w.ok(SAL.userId, { type: "isoReply", isoId: iso, holdingId: h, ...REPLY }).id, "held reply");
    expect(requestOf(w, re)).not.toHaveProperty("pay");
    w.ok(EVE.userId, { type: "respond", requestId: re, accept: true });
    expect(requestOf(w, re).pay).toEqual(SALS);
  });

  it("a listing whose seller has saved no methods: its own handle, word for word, as 'other'; the seller's note keeps today's words (B1.2)", () => {
    const { w, ev } = market();
    const l = sell(w, NIA, ev, { handle: "@nia old" });
    const r = take(w, BOB, l);
    expect(requestOf(w, r).pay).toEqual([{ kind: "other", value: "@nia old" }]);
    const done = w.ok(BOB.userId, { type: "markPaid", requestId: r });
    expect(requestOf(w, r)).toMatchObject({ status: "paid", paidVia: "other" });
    expect(done.notes.map((n) => n.text)).toEqual([`Bob D. says they paid you $35 for Spring Formal. Check Venmo or PayPal, then tap "Payment received".`]);
    expect(requestOf(w, r).history.map((x) => x.text)).toContain("Buyer said they paid $35 (self-reported)");
  });

  it("nothing rewrites the copy: the seller's profile changing, an Edit, a pause, a resume, a close (B1.10)", () => {
    const { w, ev } = market();
    const l = sell(w, SAL, ev, { qty: 3, obo: true });
    const rb = take(w, BOB, l);
    const copy = structuredClone(requestOf(w, rb).pay);
    const check = (what: string): void => {
      expect(requestOf(w, rb).pay, what).toEqual(copy);
      expect(view(w, BOB).requests.find((r) => r.id === rb)?.pay, `${what}: Bob's view`).toEqual(copy);
      expect(view(w, SAL).requests.find((r) => r.id === rb)?.pay, `${what}: Sal's view`).toEqual(copy);
    };
    setMethods(w, SAL, [{ kind: "paypal", value: "sal.paypal@example.com" }]);
    check("after the profile changed");
    const rc = take(w, CAT, l); // a later reservation copies the methods as they are now
    expect(requestOf(w, rc).pay).toEqual([{ kind: "paypal", value: "sal.paypal@example.com" }]);
    w.ok(SAL.userId, { type: "editListing", listingId: l, ask: "34", note: "Row B" });
    check("after an Edit");
    w.ok(SAL.userId, { type: "pauseListing", listingId: l });
    check("after a pause");
    w.ok(SAL.userId, { type: "resumeListing", listingId: l });
    check("after a resume");
    w.ok(SAL.userId, { type: "withdraw", listingId: l });
    check("after the close");
    w.ok(BOB.userId, { type: "markPaid", requestId: rb, via: "venmo" });
    check("after the buyer said they paid");
  });

  it("refuses a reservation there's nothing to pay with, and stores nothing (a second line of defense)", () => {
    const { w, ev } = market();
    const l = sell(w, SAL, ev, { qty: 2, obo: true });
    const rc = offer(w, CAT, l, "30"); // an offer needs no payment details
    setMethods(w, SAL, []);
    const before = w.doc;
    expect(w.no(BOB.userId, { type: "take", listingId: l, qty: 1, amount: "", msg: "", member: false })).toBe(SELLER_HAS_NONE);
    expect(w.no(SAL.userId, { type: "accept", requestId: rc })).toBe(NO_METHODS);
    expect(w.doc).toBe(before);
    expect(requestOf(w, rc)).toMatchObject({ status: "pending" });
    expect(requestOf(w, rc)).not.toHaveProperty("pay");
  });

  it("I've sent payment: the method used, named when there are two and implied with one; the seller is told which (B1.11)", () => {
    const { w, ev } = market();
    const l = sell(w, SAL, ev, { qty: 2 });
    const rb = take(w, BOB, l);
    expect(w.no(BOB.userId, { type: "markPaid", requestId: rb })).toBe("Choose how you paid: Venmo or Zelle.");
    expect(w.no(BOB.userId, { type: "markPaid", requestId: rb, via: "paypal" })).toBe("Choose how you paid: Venmo or Zelle.");
    expect(w.no(BOB.userId, { type: "markPaid", requestId: rb, via: "cash" })).toBe("This change couldn't be sent. Reload the page and try again.");
    expect(w.invalid.at(-1)?.why).toMatch(/^via: /);
    const done = w.ok(BOB.userId, { type: "markPaid", requestId: rb, via: "zelle" });
    expect(requestOf(w, rb)).toMatchObject({ status: "paid", paidVia: "zelle" });
    expect(requestOf(w, rb)).not.toHaveProperty("paymentConfirmedAt"); // the buyer's word, not a receipt
    expect(done.notes.map((n) => [n.userId, n.text])).toEqual([[SAL.userId, `Bob D. says they sent $35 by Zelle for Spring Formal. Check Zelle, then tap "Payment received".`]]);
    expect(requestOf(w, rb).history.map((x) => x.text)).toContain("Buyer said they paid $35 by Zelle (self-reported)");
    for (const who of [BOB, SAL]) expect(view(w, who).requests.find((r) => r.id === rb)).toMatchObject({ status: "paid", paidVia: "zelle", pay: SALS });
    w.ok(SAL.userId, { type: "confirmPayment", requestId: rb }); // "Payment received" stays the seller's own step
    expect(requestOf(w, rb)).toMatchObject({ status: "confirmed", paidVia: "zelle" });
    // One method: implied.
    const lu = sell(w, UNA, ev);
    const rd = take(w, DAN, lu);
    w.ok(DAN.userId, { type: "markPaid", requestId: rd });
    expect(requestOf(w, rd).paidVia).toBe("zelle");
    // An exchange reserved before B1 has no copy: there's nothing to choose, so via is ignored and today's words stay.
    const rc = take(w, CAT, l);
    const doc = structuredClone(w.doc) as LiveWorld;
    delete must(doc.requests.find((r) => r.id === rc), "Cat's reservation").pay;
    w.doc = deepFreeze(doc);
    const legacy = w.ok(CAT.userId, { type: "markPaid", requestId: rc, via: "venmo" });
    expect(requestOf(w, rc)).toMatchObject({ status: "paid" });
    expect(requestOf(w, rc)).not.toHaveProperty("paidVia");
    expect(legacy.notes.map((n) => n.text)).toEqual([`Cat M. says they paid you $35 for Spring Formal. Check Venmo or PayPal, then tap "Payment received".`]);
  });

  it("the buyer's toast after I've sent payment says it in the button's words, \"Payment marked as sent\", never \"Marked paid\"; the preview keeps its \"Paid\" (W1 fix, OBS-3)", () => {
    const { w, ev } = market();
    const rb = take(w, BOB, sell(w, SAL, ev, { qty: 2 }));
    expect(w.ok(BOB.userId, { type: "markPaid", requestId: rb, via: "zelle" }).toast).toBe("Payment marked as sent. Sal confirms it arrived, then they transfer it to your email in Ticketmaster or AXS.");
    // An exchange paid through a listing's own handle (one from before B1) reads the same.
    const rl = take(w, BOB, sell(w, NIA, w.addEvent(SAL, { title: "Winter Formal" }), { handle: "@nia old" }));
    expect(w.ok(BOB.userId, { type: "markPaid", requestId: rl }).toast).toBe("Payment marked as sent. Nia confirms it arrived, then they transfer it to your email in Ticketmaster or AXS.");
    expect(w.outcomes.filter((o) => o.action.type === "markPaid").map((o) => o.res.toast ?? "")).not.toContainEqual(expect.stringMatching(/Marked paid/));
    // The preview's button is still "Paid", and its toast says "Marked paid".
    const s = seed();
    E.applyWorld(s);
    const demo = Object.keys(E.PEOPLE).find((id) => E.PEOPLE[id]?.demo && s.listings.some((l) => l.sellerId !== id && !l.withdrawnAt && !l.isoReplyFor && E.isQuick(must(E.EV[l.eventId], "event"))));
    const l = must(s.listings.find((x) => x.sellerId !== demo && !x.withdrawnAt && !x.isoReplyFor && E.isQuick(must(E.EV[x.eventId], "event")) && E.access(must(E.EV[x.eventId], "event")).ok && E.listingNumbers(s, x).available > 0
      && !E.reduce(s, must(demo, "a demo account"), { type: "take", listingId: x.id, qty: 1, amount: "", msg: "", member: true }).error), "a preview listing a demo account can take");
    E.applyWorld(s);
    const taken = E.reduce(s, must(demo, "a demo account"), { type: "take", listingId: l.id, qty: 1, amount: "", msg: "", member: true });
    const r = must(taken.state.requests.find((x) => x.buyerId === demo && x.listingId === l.id && x.status === "accepted"), "the preview reservation");
    E.applyWorld(taken.state);
    expect(E.reduce(taken.state, must(demo, "a demo account"), { type: "markPaid", requestId: r.id }).toast).toMatch(/^Marked paid\. \S+ confirms it arrived, then /);
  });

  it("the paid steps still work after the event starts, and the copy stays to the end (R1, R4)", () => {
    const { w, ev } = market();
    const l = sell(w, SAL, ev, { qty: 2 });
    const rb = take(w, BOB, l);
    const rc = take(w, CAT, l);
    w.ok(BOB.userId, { type: "markPaid", requestId: rb, via: "venmo" });
    w.ok(CAT.userId, { type: "markPaid", requestId: rc, via: "zelle" });
    w.advance(11 * DAY); // the event started yesterday
    w.ok(SAL.userId, { type: "confirmPayment", requestId: rb });
    w.ok(SAL.userId, { type: "markTransferred", requestId: rb });
    w.ok(BOB.userId, { type: "buyerReceived", requestId: rb }); // a late confirmation records the exchange completed (R4)
    w.ok(SAL.userId, { type: "paymentMissing", requestId: rc });
    w.sweep(); // the server's sweep never cancels, refunds or relists a paid exchange (R3)
    expect(requestOf(w, rb)).toMatchObject({ status: "completed", pay: SALS, paidVia: "venmo" });
    expect(requestOf(w, rc)).toMatchObject({ status: "paid", pay: SALS, paidVia: "zelle" });
    expect(view(w, BOB).requests.find((r) => r.id === rb)?.pay).toEqual(SALS);
    expect(w.no(DAN.userId, { type: "take", listingId: l, qty: 1, amount: "", msg: "", member: false })).toBe("The event has started."); // nothing new (R2)
  });

  it("the invariant: a malformed copy, or a method used that isn't one of it, is a violation the store would refuse", () => {
    const { w, ev } = market();
    const rb = take(w, BOB, sell(w, SAL, ev));
    const keysWith = (patch: Record<string, unknown>): string[] => {
      const doc = structuredClone(w.doc) as LiveWorld;
      Object.assign(must(doc.requests.find((r) => r.id === rb), "request"), patch);
      return E.withEngine({ doc, people: [], now: w.now }, () => E.invariantViolations(doc)).filter((k) => k.startsWith("pay-shape"));
    };
    expect(keysWith({})).toEqual([]);
    for (const pay of [[], [{ kind: "cash", value: "x" }], [{ kind: "venmo", value: " " }], [...SALS, { kind: "paypal", value: "y" }], "sal-rivera"]) {
      expect(keysWith({ pay }), JSON.stringify(pay)).toEqual([`pay-shape:${rb}`]);
    }
    expect(keysWith({ paidVia: "paypal" })).toEqual([`pay-shape:${rb}`]);
    expect(keysWith({ paidVia: "zelle" })).toEqual([]);
  });

  it("payNeededBy: the seller's listings a new buyer could still reach, that have no handle of their own", () => {
    const { w, ev } = market();
    const count = (): number => E.withEngine({ doc: w.doc, people: w.people, now: w.now }, () => E.payNeededBy(w.doc, SAL.userId));
    expect(count()).toBe(0);
    const h = hold(w, SAL, ev, 4);
    const open = listFrom(w, SAL, h);
    const paused = listFrom(w, SAL, h);
    w.ok(SAL.userId, { type: "pauseListing", listingId: paused });
    take(w, BOB, listFrom(w, SAL, h)); // everything on it held for a buyer: it may come back
    w.ok(SAL.userId, { type: "withdraw", listingId: listFrom(w, SAL, h) }); // closed
    sell(w, SAL, w.addEvent(SAL, { title: "Spring Formal II" }), { handle: "@sal-typed" }); // pays through its own handle
    sell(w, SAL, w.addEvent(SAL, { title: "Soon", start: `${E.nyIsoDate(w.now + 2 * DAY)}T19:00` }));
    expect(count()).toBe(4); // open, paused, held, and the one on the event two days off
    w.advance(3 * DAY); // that event has started: its listing can't take anyone now
    expect(count()).toBe(3);
    w.ok(SAL.userId, { type: "withdraw", listingId: open });
    expect(count()).toBe(2);
  });
});

describe("who sees what (C-CONTRACT §2, §7)", () => {
  it("which kinds a seller takes reaches every signed-in viewer before they commit, never a guest (B1.7)", () => {
    const { w, ev } = market();
    const l = sell(w, SAL, ev);
    const legacy = sell(w, LEO, ev);
    const typed = sell(w, NIA, ev, { handle: "@nia old" });
    for (const who of [FAY, BOB, SAL]) {
      const v = view(w, who);
      expect(v.listings.find((x) => x.id === l)?.payKinds, who.name).toEqual(["venmo", "zelle"]);
      expect(v.listings.find((x) => x.id === legacy)?.payKinds, who.name).toEqual(["other"]);
      expect(v.listings.find((x) => x.id === typed)?.payKinds, who.name).toEqual(["other"]);
    }
    const g = guestViewOf(w);
    expect(guestContractViolations(g)).toEqual([]);
    expect(g.listings.map((x) => x.id).sort()).toEqual([l, legacy, typed].sort());
    const text = JSON.stringify(g);
    for (const leak of ["payKinds", "venmo", "zelle", '"other"', "sal-rivera", "+12155550142", "@leo-old", "@nia old"]) expect(text, leak).not.toContain(leak);
  });

  it("where to pay: in the exchange's own copy, to its two parties, from the reservation on, and never before or after it ends unpaid (B1.8)", () => {
    const { w, ev } = market();
    const h = hold(w, SAL, ev, 4);
    const l = listFrom(w, SAL, h, { qty: 3, obo: true });
    const payIn = (who: TestPerson, id: string): PayMethod[] | undefined => view(w, who).requests.find((r) => r.id === id)?.pay;
    const nowhere = (id: string, what: string): void => {
      for (const who of [BOB, CAT, DAN, EVE, SAL]) expect(payIn(who, id), `${what}: ${who.name}`).toBeUndefined();
      expect(JSON.stringify(view(w, FAY)), `${what}: a stranger`).not.toContain("sal-rivera");
    };
    const rc = offer(w, CAT, l, "30");
    nowhere(rc, "an open offer");
    // The projection holds this by the step alone: even a copy stored on an open offer (no rule writes one) isn't sent.
    const real = w.doc;
    const planted = structuredClone(real) as LiveWorld;
    must(planted.requests.find((r) => r.id === rc), "the offer").pay = [{ kind: "venmo", value: "planted-venmo" }];
    w.doc = deepFreeze(planted);
    for (const who of [CAT, SAL]) expect(JSON.stringify(view(w, who)), who.name).not.toContain("planted-venmo");
    w.doc = real;
    w.ok(SAL.userId, { type: "counter", requestId: rc, amount: "33" });
    nowhere(rc, "a counter");
    w.ok(CAT.userId, { type: "respond", requestId: rc, accept: true });
    expect(payIn(CAT, rc)).toEqual(SALS);
    expect(payIn(SAL, rc)).toEqual(SALS);
    expect(JSON.stringify(view(w, FAY))).not.toContain("sal-rivera");
    for (const [type, who, extra] of [["markPaid", CAT, { via: "venmo" }], ["confirmPayment", SAL, {}], ["markTransferred", SAL, {}], ["buyerReceived", CAT, {}]] as const) {
      w.ok(who.userId, { type, requestId: rc, ...extra });
      expect(payIn(CAT, rc), type).toEqual(SALS);
      expect(payIn(SAL, rc), type).toEqual(SALS);
    }
    // Ended unpaid: cancelled by the buyer, and lapsed (before any sweep, and after it).
    const rb = take(w, BOB, l);
    expect(payIn(BOB, rb)).toEqual(SALS);
    w.ok(BOB.userId, { type: "cancel", requestId: rb });
    nowhere(rb, "a cancelled reservation");
    const rd = take(w, DAN, l);
    w.advance(16 * MIN);
    nowhere(rd, "a hold that ran out, before the sweep");
    w.sweep();
    nowhere(rd, "a hold that ran out, swept");
    expect(requestOf(w, rd)).toMatchObject({ status: "expired", pay: SALS }); // kept as it was, never sent again
    // A held reply: nothing before its requester accepts it.
    const iso = publicRequest(w, EVE, ev);
    const re = must(w.ok(SAL.userId, { type: "isoReply", isoId: iso, holdingId: h, ...REPLY }).id, "held reply");
    nowhere(re, "a held reply");
    w.ok(EVE.userId, { type: "respond", requestId: re, accept: true });
    expect(payIn(EVE, re)).toEqual(SALS);
  });

  it("your own methods reach you only, and nothing comes from your email (B1.6)", () => {
    const PENN: TestPerson = { userId: "user-pen", name: "Pen Quaker", payHandle: "", email: "pen.quaker@upenn.edu" };
    const w = new ServerWorld({ people: [...PEOPLE, PENN] });
    w.addEvent(SAL);
    expect(view(w, SAL).viewer.payMethods).toEqual(SALS);
    expect(view(w, LEO).viewer.payMethods).toEqual([{ kind: "other", value: "@leo-old (Venmo)" }]);
    expect(view(w, PENN).viewer).toMatchObject({ email: "pen.quaker@upenn.edu", payMethods: [] });
    for (const who of [FAY, BOB, PENN]) {
      const text = JSON.stringify(view(w, who));
      for (const leak of ["sal-rivera", "+12155550142", "una.park@upenn.edu", "@leo-old"]) expect(text, `${who.name}: ${leak}`).not.toContain(leak);
    }
  });

  it("an exchange on a listing with its own handle: the handle to the seller; its buyer gets it in their own copy, and on the listing only for an exchange from before B1", () => {
    const { w, ev } = market();
    const l = sellLegacy(w, NIA, ev, "@nia old");
    expect(view(w, NIA).listings.find((x) => x.id === l)?.payHandle).toBe("@nia old");
    expect(view(w, BOB).listings.find((x) => x.id === l)).not.toHaveProperty("payHandle");
    const r = take(w, BOB, l);
    expect(view(w, BOB).requests.find((x) => x.id === r)?.pay).toEqual([{ kind: "other", value: "@nia old" }]);
    // Protocol 2: Bob's reservation has its own copy, so the listing's handle isn't sent beside it.
    expect(view(w, BOB).listings.find((x) => x.id === l)).not.toHaveProperty("payHandle");
    expect(view(w, FAY).listings.find((x) => x.id === l)).not.toHaveProperty("payHandle");
    // A reservation from before B1 has no copy: its buyer reads the listing's handle, as before.
    const doc = structuredClone(w.doc) as LiveWorld;
    delete must(doc.requests.find((x) => x.id === r), "Bob's reservation").pay;
    w.doc = deepFreeze(doc);
    expect(view(w, BOB).listings.find((x) => x.id === l)?.payHandle).toBe("@nia old");
    expect(view(w, BOB).requests.find((x) => x.id === r)).not.toHaveProperty("pay");
    expect(view(w, FAY).listings.find((x) => x.id === l)).not.toHaveProperty("payHandle");
  });
});

// ── The store and saveMyProfile (Postgres) ───────────────────────────────────────────────

const D: Actor = { id: "handoff-test-d", name: "Handoff Test D", email: "handoff-test-d@example.invalid" };
let db: TestDb;

/** What actions.ts supplies (the session's user, the pool, the world). */
function context(user: SessionUser, world: WorldId): ActionContext {
  return { user: async () => user, sql: () => db.sql, worldId: () => world };
}
const guard = (who: SessionUser) => ({ viewerId: who.id, protocol: E.HANDOFF_PROTOCOL });
/** Sell a ticket through the store as the page will after B1 (no handle). */
function sellNew(eventId: string, qty = 1): SentAction {
  const a = actions.list(eventId, { qty, ask: "35", paid: "40", payHandle: "" });
  delete (a.then as Record<string, unknown>)["payHandle"];
  return a;
}
async function row(id: string): Promise<{ pay_handle: string; pay_methods: unknown } | undefined> {
  const [r] = await db.sql<{ pay_handle: string; pay_methods: unknown }[]>`SELECT pay_handle, pay_methods FROM people WHERE user_id = ${id}`;
  return r;
}

describe.skipIf(!databaseUrl)("the store and saveMyProfile (real engine, Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("pay-methods");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("saves methods normalized, replacing a handle saved before B1; refuses beside the field; reads them back", async () => {
    await ensurePerson(db.sql, TEST_A);
    expect(await saveProfile(db.sql, { userId: TEST_A.id, payHandle: " @a-old " })).toEqual({ ok: true });
    let v = checked(await getView(db.sql, { worldId: "test-pay-read", viewer: TEST_A }), TEST_A.id);
    expect(v.viewer).toMatchObject({ payMethods: [{ kind: "other", value: "@a-old" }] });
    expect(v.viewer).not.toHaveProperty("payHandle"); // protocol 2: the handle reads as one method, and nothing else carries it
    const saved = await savePayMethods(db.sql, { userId: TEST_A.id, payMethods: [{ kind: "venmo", value: "@Hand-Test-A" }, { kind: "zelle", value: "(215) 555-0142" }] });
    const methods = [{ kind: "venmo", value: "Hand-Test-A" }, { kind: "zelle", value: "+12155550142" }];
    expect(saved).toEqual({ ok: true, methods });
    expect(await row(TEST_A.id)).toEqual({ pay_handle: "", pay_methods: methods });
    v = checked(await getView(db.sql, { worldId: "test-pay-read", viewer: TEST_A }), TEST_A.id);
    expect(v.viewer).toEqual({ id: TEST_A.id, name: TEST_A.name, email: TEST_A.email, payMethods: methods });
    expect(await savePayMethods(db.sql, { userId: TEST_A.id, payMethods: [{ kind: "venmo", value: "Hand-Test-A" }, { kind: "zelle", value: "555-0142" }] }))
      .toEqual({ ok: false, index: 1, error: ZELLE });
    expect(await savePayMethods(db.sql, { userId: TEST_A.id, payMethods: [{ kind: "other", value: "@x" }] })).toEqual({ ok: false, index: 0, error: "Choose Venmo, Zelle or PayPal." });
    expect(await row(TEST_A.id)).toEqual({ pay_handle: "", pay_methods: methods }); // nothing changed
    expect(await savePayMethods(db.sql, { userId: "user-nobody", payMethods: [] })).toMatchObject({ ok: false, error: "Your profile isn't set up yet. Reload the page and try again." });
    // A handle saved the way profiles were before B1 (saveProfile; no server action since protocol 2) replaces the methods.
    expect(await saveProfile(db.sql, { userId: TEST_A.id, payHandle: "@a-again" })).toEqual({ ok: true });
    expect(await row(TEST_A.id)).toEqual({ pay_handle: "@a-again", pay_methods: [] });
  });

  it("keeps the last method while an open listing needs it, and lets it go once none does (the guard)", async () => {
    const w = new StoreWorld(db.sql, "test-pay-guard");
    const at = { worldId: w.worldId, now: w.now };
    await ensurePerson(db.sql, TEST_B);
    expect(await savePayMethods(db.sql, { userId: TEST_B.id, payMethods: [{ kind: "venmo", value: "@hand-test-b" }] })).toMatchObject({ ok: true });
    const ev = await w.createEvent(TEST_B);
    const l = must((await w.ok(TEST_B, sellNew(ev))).resultId, "listing");
    const stored = must(await w.row(), "the world");
    expect(stored.doc.listings.find((x) => x.id === l)).not.toHaveProperty("payHandle");
    const holding = must(stored.doc.holdings.find((x) => x.userId === TEST_B.id), "the holding").id;
    expect(await savePayMethods(db.sql, { userId: TEST_B.id, payMethods: [], ...at })).toEqual({ ok: false, index: null, error: LAST_METHOD_ERROR });
    expect(await saveProfile(db.sql, { userId: TEST_B.id, payHandle: "", ...at })).toEqual({ ok: false, error: LAST_METHOD_ERROR });
    expect((await row(TEST_B.id))?.pay_methods).toEqual([{ kind: "venmo", value: "hand-test-b" }]);
    // Changing to another method is fine; so is removing it once the listing is closed.
    expect(await savePayMethods(db.sql, { userId: TEST_B.id, payMethods: [{ kind: "paypal", value: "hand-test-b@example.invalid" }], ...at })).toMatchObject({ ok: true });
    await w.ok(TEST_B, { type: "withdraw", listingId: l });
    expect(await savePayMethods(db.sql, { userId: TEST_B.id, payMethods: [], ...at })).toEqual({ ok: true, methods: [] });
    // Protocol 2: a handle typed with a listing is dropped on the store's path, so with no method saved the listing is refused, and
    // nothing is stored. (A listing from before, with its own handle, doesn't depend on the profile: payNeededBy, above.)
    const typed = await w.refused(TEST_B, { type: "list", holdingId: holding, qty: 1, ask: "35", method: "app", file: null, payHandle: "@hand-test-b-typed" });
    expect(typed.error).toBe(NO_METHODS);
    expect(JSON.stringify(must(await w.row(), "the world").doc)).not.toContain("@hand-test-b-typed");
    expect(await saveProfile(db.sql, { userId: TEST_B.id, payHandle: "", ...at })).toEqual({ ok: true });
  });

  it("the guard waits for the world's lock, so a listing posted meanwhile is counted", async () => {
    const w = new StoreWorld(db.sql, "test-pay-lock");
    await ensurePerson(db.sql, TEST_C);
    expect(await savePayMethods(db.sql, { userId: TEST_C.id, payMethods: [{ kind: "zelle", value: "handoff-test-c@example.invalid" }] })).toMatchObject({ ok: true });
    const ev = await w.createEvent(TEST_C);
    const locked = deferred();
    const release = deferred();
    const listing = w.act(TEST_C, sellNew(ev), { hooks: { afterLock: async () => { locked.resolve(); await release.promise; } } });
    await locked.promise; // the listing's transaction holds the world's lock and hasn't committed
    const removing = savePayMethods(db.sql, { userId: TEST_C.id, payMethods: [], worldId: w.worldId, now: w.now });
    await waitForLockWaiters(db, 1);
    release.resolve();
    okOf(await listing, "the listing");
    expect(await removing).toEqual({ ok: false, index: null, error: LAST_METHOD_ERROR });
    expect((await row(TEST_C.id))?.pay_methods).toEqual([{ kind: "zelle", value: "handoff-test-c@example.invalid" }]);
  });

  it("saveMyProfile: the methods, refusals in the store's words with the fresh view, the shape check, and (protocol 2) no handle input", async () => {
    const ctx = context(D, "test-pay-handler");
    const saved = await handleSaveMyProfile(ctx, { ...guard(D), payMethods: [{ kind: "venmo", value: "@hand-test-d" }] });
    if (!saved.ok) throw new Error(`save: ${saved.code}`);
    expect(saved).toMatchObject({ replay: false, toast: "Payment methods saved.", resultId: null });
    expect(checked(saved.view, D.id).viewer.payMethods).toEqual([{ kind: "venmo", value: "hand-test-d" }]);
    const bad = await handleSaveMyProfile(ctx, { ...guard(D), payMethods: [{ kind: "zelle", value: "555-0142" }] });
    expect(bad).toMatchObject({ ok: false, code: "refused", error: ZELLE, replay: false });
    if (bad.ok || bad.code !== "refused") throw new Error("expected a refusal");
    expect(bad.view.viewer.payMethods).toEqual([{ kind: "venmo", value: "hand-test-d" }]);
    expect(await handleSaveMyProfile(ctx, { ...guard(D), payMethods: "venmo" })).toEqual({ ok: false, code: "invalid", error: PAY_METHODS_INVALID });
    expect(await handleSaveMyProfile(ctx, { ...guard(D) })).toMatchObject({ ok: false, code: "invalid" });
    // payMethods wins over a handle sent with it.
    const both = await handleSaveMyProfile(ctx, { ...guard(D), payMethods: [{ kind: "paypal", value: "hand-test-d" }], payHandle: "@ignored" });
    expect(both).toMatchObject({ ok: true, toast: "Payment methods saved." });
    expect(await row(D.id)).toEqual({ pay_handle: "", pay_methods: [{ kind: "paypal", value: "hand-test-d" }] });
    // The guard through the handler, which reads the world at the database's clock: an open listing there keeps the last method.
    const w = new StoreWorld(db.sql, "test-pay-handler", Date.now());
    const ev = await w.createEvent(D);
    const l = must((await w.ok(D, sellNew(ev))).resultId, "listing");
    expect(await handleSaveMyProfile(ctx, { ...guard(D), payMethods: [] })).toMatchObject({ ok: false, code: "refused", error: LAST_METHOD_ERROR });
    await w.ok(D, { type: "withdraw", listingId: l });
    const removed = await handleSaveMyProfile(ctx, { ...guard(D), payMethods: [] });
    expect(removed).toMatchObject({ ok: true, toast: "Payment methods removed." });
    if (removed.ok) expect(removed.view.viewer).toEqual({ id: D.id, name: D.name, email: D.email, payMethods: [] });
    // Protocol 2: the page before B1's one handle is no input any more; it's invalid and nothing changes.
    expect(await handleSaveMyProfile(ctx, { ...guard(D), payHandle: "@hand-test-d-old" })).toEqual({ ok: false, code: "invalid", error: PAY_METHODS_INVALID });
    expect(await row(D.id)).toEqual({ pay_handle: "", pay_methods: [] });
  });

  it("through the store: each reservation's copy outlives the seller's change, markPaid names the method, a guest sees neither", async () => {
    const w = new StoreWorld(db.sql, "test-pay-flow");
    const [S, B, C] = [TEST_A, TEST_B, TEST_C];
    for (const p of [S, B, C, D]) await ensurePerson(db.sql, p);
    expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [{ kind: "venmo", value: "@hand-test-a" }, { kind: "zelle", value: "215-555-0142" }] })).toMatchObject({ ok: true });
    const first = [{ kind: "venmo", value: "hand-test-a" }, { kind: "zelle", value: "+12155550142" }];
    const ev = await w.createEvent(S);
    const l = must((await w.ok(S, sellNew(ev, 3))).resultId, "listing"); // one stays available, so a guest sees the listing
    expect((await w.view(D)).listings.find((x) => x.id === l)?.payKinds).toEqual(["venmo", "zelle"]); // a stranger, before anyone commits
    const rb = must((await w.ok(B, actions.take(l))).resultId, "B's reservation");
    expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [{ kind: "paypal", value: "hand-test-a.pp@example.invalid" }] })).toMatchObject({ ok: true });
    const rc = must((await w.ok(C, actions.take(l))).resultId, "C's reservation");
    expect((await w.view(B)).requests.find((r) => r.id === rb)?.pay).toEqual(first);
    expect((await w.view(C)).requests.find((r) => r.id === rc)?.pay).toEqual([{ kind: "paypal", value: "hand-test-a.pp@example.invalid" }]);
    expect((await w.view(S)).requests.find((r) => r.id === rb)?.pay).toEqual(first);
    expect((await w.view(D)).listings.find((x) => x.id === l)?.payKinds).toEqual(["paypal"]);
    const stranger = JSON.stringify(await w.view(D));
    for (const leak of ["hand-test-a", "+12155550142"]) expect(stranger, leak).not.toContain(leak);
    // "I've sent payment", by Zelle: the seller's notification names it; "Payment received" is the seller's own step.
    refusedOf(await w.act(B, { type: "markPaid", requestId: rb }), "markPaid without saying how");
    await w.ok(B, { type: "markPaid", requestId: rb, via: "zelle" });
    const [note] = await db.sql<{ text: string }[]>`
      SELECT text FROM notifications WHERE world_id = ${w.worldId} AND user_id = ${S.id} ORDER BY at DESC, id DESC LIMIT 1`;
    expect(note?.text).toBe(`Handoff B. says they sent $35 by Zelle for [Test] Spring Formal. Check Zelle, then tap "Payment received".`);
    expect((await w.view(S)).requests.find((r) => r.id === rb)).toMatchObject({ status: "paid", paidVia: "zelle", pay: first });
    await w.ok(S, { type: "confirmPayment", requestId: rb });
    expect((await w.view(B)).requests.find((r) => r.id === rb)).toMatchObject({ status: "confirmed", paidVia: "zelle" });
    const guest = JSON.stringify(await getGuestView(db.sql, { worldId: w.worldId, now: w.now }));
    expect(guest).toContain(l);
    for (const leak of ["payKinds", "venmo", "zelle", "paypal", "hand-test-a", "paidVia"]) expect(guest, leak).not.toContain(leak);
  });
});
