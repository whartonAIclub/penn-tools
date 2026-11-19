// The simplification batch (USER-INSTRUCTIONS §9e, step SIM-A): an ordinary event may be added without a category or an organizer.
// - The category is stored as not given (no key), never guessed or "Other"; it reads as "" everywhere, counts under Events and All,
//   never under a specific category, and the pilot report counts it as "(unspecified)". Existing categories are kept as they were.
// - The organizer may be left out of an ordinary event, but not where a rule needs one: a members-only event, names checked at the door,
//   a train's operator, a trek's organizer. On an event without one, a name change and a members-only ticket are refused.
// - Everything that shows the event reads cleanly without them: views, the guest view, share text.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { PilotData } from "../report/index.js";
import { buildPilotReport } from "../report/index.js";
import type { WorldState } from "../../engine/index.js";
import { guestContractViolations } from "./helpers/contract.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, LiveTestWorld, T0, wallAfter } from "./helpers/worlds.js";

afterEach(() => {
  E.setLiveClock(null);
  E.applyWorld(null);
});

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}
/** An ordinary event with only what's required: no category, no organizer, no venue, end, notes or link. */
const BARE = { type: "createEvent", kind: "event", title: "Rooftop Mixer", start: wallAfter(T0, 10), tiers: [{ label: "Entry", price: "25" }] } as const;
const stored = (w: LiveTestWorld, id: string): Record<string, unknown> => must(w.doc.events.find((e) => e.id === id), "event") as unknown as Record<string, unknown>;
const listOn = (eventId: string, then: Record<string, unknown>) => ({
  type: "addThen", add: { eventId, tier: "t1", qty: 1, paid: "25" },
  then: { type: "list", qty: 1, ask: "20", note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false, minOffer: "", ...then },
});
function installed<T>(state: { serverNow: number }, fn: (s: WorldState) => T): T {
  E.setLiveClock(() => state.serverNow);
  E.applyWorld(state as unknown as WorldState);
  try { return fn(state as unknown as WorldState); } finally { E.setLiveClock(null); E.applyWorld(null); }
}

/** A world whose document already holds an ordinary event stored without a category or an organizer (as createEvent now stores one),
 *  so each reader is checked on its own, whatever createEvent does. */
const BARE_ID = "ev-0123456789abcdef";
function storedBare(): ServerWorld {
  const doc = { ...E.emptyWorld(), events: [{ id: BARE_ID, kind: "event", title: "Rooftop Mixer", start: wallAfter(T0, 10), attend: "all", tiers: [{ id: "t1", label: "Entry", price: 25 }], perPerson: 4, deadline: null, policy: "unknown", createdBy: ANN.userId, createdAt: T0 }] };
  return new ServerWorld({ people: PEOPLE6, doc: doc as unknown as E.LiveWorld });
}

describe("each reader of a stored event without a category or an organizer", () => {
  it("reads it with no stray words", () => {
    const w = storedBare();
    w.run(() => {
      const ev = must(E.EV[BARE_ID], "event");
      expect(ev.policyNote).toBe(""); // §9v item 5 (SELL5-M2): no generic "Transfer rules not confirmed" note
      expect(E.CLUBS).toEqual([]);
    });
  });
  it("offers no name change and refuses a name change or a members-only ticket", () => {
    const w = storedBare();
    w.run(() => expect(E.methodsFor(must(E.EV[BARE_ID], "event"), false)).toEqual(["file", "app"]));
    expect(w.no(BOB.userId, listOn(BARE_ID, { method: "name" }) as unknown as E.Action)).toBe(E.NO_ORG_NAME);
    expect(w.no(BOB.userId, listOn(BARE_ID, { membersOnly: true }) as unknown as E.Action)).toBe(E.NO_ORG_MEMBERS);
  });
  // ("shares a message with no empty organizer" was removed in SELL5-M1: §9v item 3 removed outward Share, so there is no share message.)
  it("is counted as \"(unspecified)\" in the pilot report", () => {
    const w = storedBare();
    w.listTickets(BOB, BARE_ID, { paid: "25", ask: "20" });
    const data = { now: w.now, transaction: { readOnly: true, isolation: "repeatable read" }, live: { version: 2, createdAt: T0, updatedAt: w.now, nextDue: null, doc: w.doc },
      testWorlds: 0, profiles: 2, notifications: { total: 0, unread: 0 }, snapshots: 0, actions: { retained: 0, oldestAt: null, recent: [] }, knownTestAccounts: null } as unknown as PilotData;
    expect(buildPilotReport(data).supplyAndDemand.tickets.byCategory.map((c) => c.category)).toEqual(["(unspecified)"]);
  });
});

describe("an ordinary event without a category or an organizer", () => {
  it("is added with neither stored, and reads as unspecified, never guessed", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const id = must(w.ok(ANN.userId, BARE as unknown as E.Action).id, "event");
    const st = stored(w, id);
    expect("cat" in st).toBe(false);
    expect("club" in st).toBe(false);
    expect("venue" in st).toBe(false);
    w.run(() => {
      const ev = must(E.EV[id], "event");
      expect(ev.cat).toBe("");
      expect(ev.club).toBe("");
      expect(E.catLabel(ev.cat)).toBe("");
      expect(E.catOf(ev)).toBe("events");
      expect(ev.policyNote).toBe(""); // §9v item 5 (SELL5-M2): no generic "Transfer rules not confirmed" note
      expect(E.dotJoin(E.fmtRange(ev), ev.club)).toBe(E.fmtRange(ev));
      expect(E.dotJoin(ev.club, E.catLabel(ev.cat))).toBe("");
      const words = JSON.stringify([E.transferTag(ev), E.fmtRange(ev), ev.policyNote, ev.sourcesNote, ev.path, E.evText(ev)]);
      expect(words).not.toMatch(/undefined|null|NaN|\(\)|Other/);
      expect(E.CLUBS).not.toContain("");
      expect(E.CLUB_MENU.map((c) => c.label)).toEqual([]);
    });
  });

  it("keeps a category and an organizer that are given, and the existing classifications", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const party = must(w.ok(ANN.userId, { ...BARE, title: "Spring Formal", club: "WGA", cat: "Parties" } as unknown as E.Action).id, "party");
    expect(stored(w, party)).toMatchObject({ club: "WGA", cat: "Parties" });
    const train = must(w.ok(BOB.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 2, "06:00"), openUntil: wallAfter(T0, 6, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] } as unknown as E.Action).id, "train");
    expect(stored(w, train)).toMatchObject({ cat: "Travel", club: "Amtrak", methods: ["file"] });
    const trek = must(w.ok(BOB.userId, { type: "createEvent", kind: "trek", title: "Japan Trek", club: "Japan Trek Club", start: wallAfter(T0, 20, "08:00"), tiers: [{ label: "Spot", price: "1200" }] } as unknown as E.Action).id, "trek");
    expect(stored(w, trek)).toMatchObject({ cat: "Treks & trips", club: "Japan Trek Club", methods: ["name"], namesChecked: true });
    w.run(() => {
      expect(E.catOf(must(E.EV[party], "party"))).toBe("events");
      expect(E.catOf(must(E.EV[train], "train"))).toBe("trains");
      expect(E.catOf(must(E.EV[trek], "trek"))).toBe("treks");
      expect(E.CLUBS).toEqual(["Japan Trek Club", "WGA"]);
    });
  });

  it("still needs the organizer where a rule does, and checks what's typed", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const cases: [Record<string, unknown>, string][] = [
      [{ attend: "members" }, "Add the club or organizer: a members-only event is for their members."],
      [{ namesChecked: true }, "Add the club or organizer: with names checked at the door, tickets move by a name change with them."],
      [{ club: "x" }, "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank."],
      [{ club: "!!" }, "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank."],
      [{ club: "x".repeat(81) }, "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank."],
      [{ cat: "Travel" }, "Choose a category from the list, or leave it blank."],
      [{ cat: "Treks & trips" }, "Choose a category from the list, or leave it blank."],
      [{ cat: "Other" }, "Choose a category from the list, or leave it blank."],
      [{ kind: "train", club: "", openUntil: wallAfter(T0, 14, "23:00"), ticketType: "eticket" }, "Add the operator, like “Amtrak” (2 to 80 characters)."],
      [{ kind: "trek", club: "" }, "Add who runs the trek: the organizer or travel operator (2 to 80 characters)."],
      [{ kind: "trek" }, "Add who runs the trek: the organizer or travel operator (2 to 80 characters)."],
    ];
    for (const [over, message] of cases) expect(w.no(ANN.userId, { ...BARE, ...over } as unknown as E.Action), JSON.stringify(over)).toBe(message);
    expect(w.doc.events).toEqual([]);
    // With the organizer, both are fine as before.
    const id = must(w.ok(ANN.userId, { ...BARE, club: "Wine Club", attend: "members", namesChecked: true } as unknown as E.Action).id, "members-only event");
    expect(stored(w, id)).toMatchObject({ club: "Wine Club", attend: "members", namesChecked: true });
    expect("cat" in stored(w, id)).toBe(false);
  });

  it("offers no name change and no members-only ticket, and refuses them, with what to do instead", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const bare = must(w.ok(ANN.userId, BARE as unknown as E.Action).id, "bare");
    const named = must(w.ok(ANN.userId, { ...BARE, title: "Wine Social", club: "Wine Club" } as unknown as E.Action).id, "named");
    w.run(() => {
      expect(E.methodsFor(must(E.EV[bare], "bare"), false)).toEqual(["file", "app"]);
      expect(E.methodsFor(must(E.EV[named], "named"), false)).toEqual(["file", "app", "name"]);
    });
    expect(w.no(BOB.userId, listOn(bare, { method: "name" }) as unknown as E.Action)).toBe(E.NO_ORG_NAME);
    expect(w.no(BOB.userId, listOn(bare, { method: "name", namesChecked: true }) as unknown as E.Action)).toBe(E.NO_ORG_NAME);
    expect(w.no(BOB.userId, listOn(bare, { membersOnly: true }) as unknown as E.Action)).toBe(E.NO_ORG_MEMBERS);
    expect(w.doc.listings).toEqual([]);
    expect(w.doc.holdings).toEqual([]); // addThen is one step: a refused listing leaves no stray ticket
    w.ok(BOB.userId, listOn(bare, { method: "app" }) as unknown as E.Action);
    w.ok(CAT.userId, listOn(named, { method: "name", namesChecked: true, membersOnly: true }) as unknown as E.Action); // unchanged where there is an organizer
    expect(w.doc.listings.map((l) => [l.eventId, l.method, !!l.membersOnly])).toEqual([[named, "name", true], [bare, "app", false]]);
  });

  it("reads cleanly in every view and the guest view, and is found under Events and All only", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const bare = must(w.ok(ANN.userId, BARE as unknown as E.Action).id, "bare");
    const party = must(w.ok(ANN.userId, { ...BARE, title: "Spring Formal", club: "WGA", cat: "Parties" } as unknown as E.Action).id, "party");
    const l = w.listTickets(BOB, bare, { paid: "25", ask: "20" });
    w.listTickets(BOB, party, { paid: "25", ask: "20" });
    const g = guestViewOf(w);
    expect(guestContractViolations(g)).toEqual([]);
    const ge = must(g.events.find((e) => e.id === bare), "guest event");
    expect(ge).toMatchObject({ club: "", cat: "" });
    // SELL5-M1: the share text's checks were removed (§9v item 3: no outward Share, so no share message). The guest view itself still
    // carries the listing at its price, under an event with no organizer or category stored (above), nothing guessed.
    expect(must(g.listings.find((x) => x.id === l), "the visitor's copy")).toMatchObject({ ask: 20 });
    const v = viewOf(w, CAT);
    installed(v, (s) => {
      const ids = (cat: string, q = "") => E.availableFor(s, CAT.userId, { ...E.DISC0, cat, q }).cards.map((c) => c.key);
      expect(ids("all")).toEqual(expect.arrayContaining([bare, party]));
      expect(ids("events")).toEqual(expect.arrayContaining([bare, party]));
      expect(ids("trains")).toEqual([]);
      expect(ids("treks")).toEqual([]);
      expect(ids("all", "parties")).toEqual([party]); // a category search never matches the unspecified event
      expect(ids("all", "rooftop")).toEqual([bare]);
    });
    expect(JSON.stringify(v.events.find((e) => e.id === bare))).not.toMatch(/undefined|Other/);
  });

  it("is counted as \"(unspecified)\" in the pilot report, never as another category", () => {
    const w = new LiveTestWorld();
    const bare = must(w.ok(ANN.userId, BARE as unknown as E.Action).id, "bare");
    const party = must(w.ok(ANN.userId, { ...BARE, title: "Spring Formal", club: "WGA", cat: "Parties" } as unknown as E.Action).id, "party");
    w.listTickets(BOB, bare, { paid: "25", ask: "20" });
    w.listTickets(BOB, party, { paid: "25", ask: "20" });
    const data: PilotData = {
      now: w.now, transaction: { readOnly: true, isolation: "repeatable read" },
      live: { version: 4, createdAt: T0, updatedAt: w.now, nextDue: null, doc: w.doc as unknown as PilotData extends { live: infer L } ? L extends { doc: infer D } ? D : never : never },
      testWorlds: 0, profiles: 2, notifications: { total: 0, unread: 0 }, snapshots: 0, actions: { retained: 0, oldestAt: null, recent: [] }, knownTestAccounts: null,
    };
    const r = buildPilotReport(data);
    const cats = r.supplyAndDemand.tickets.byCategory.map((c) => [c.category, c.events, c.availableUnits]);
    expect(cats).toEqual([["(unspecified)", 1, 1], ["Parties", 1, 1]]);
    expect(r.supplyAndDemand.tickets.byEvent.map((e) => e.category).sort()).toEqual(["(unspecified)", "Parties"]);
  });
});
