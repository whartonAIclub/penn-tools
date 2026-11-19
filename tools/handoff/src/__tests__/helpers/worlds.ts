// Live worlds for the engine tests (live-engine.test.ts, copy-audit.test.ts; C4's projection and seam tests can build on it).
// LiveTestWorld runs the real engine the way the store does (C-DESIGN §4.1, store.ts): each action inside one withEngine run
// at a chosen time, as a given user, on a deep-frozen document (so a write into the previous state throws). After an accepted
// action it drains the document's notifications into a list, as the store moves them into its table, and it fails the test
// when the action introduced an invariant violation, which the store would refuse.
// The people are labelled test accounts with made-up ids; no sign-in of any kind is involved.
import * as E from "../../../engine/index.js";
import type { Action, EngineNotification, LiveWorld, ReduceResult, SeqStep } from "../../../engine/index.js";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** The tests' starting time: Tuesday, Nov 10, 2026, noon in Philadelphia. */
export const T0 = E.wallToMs("2026-11-10T12:00");

export interface TestPerson {
  userId: string;
  name: string;
  payHandle: string;
  /** Saved payment methods (follow-on B1), as pay_methods holds them; without them the handle reads as one "other" method. */
  payMethods?: E.PayMethod[];
  /** Profile rows carry one; the engine must never read it. */
  email?: string | null;
}
export const ANN: TestPerson = { userId: "user-ann", name: "Ann Lee", payHandle: "@ann-lee" };
export const BOB: TestPerson = { userId: "user-bob", name: "Bob Diaz", payHandle: "@bob-diaz" };
export const CAT: TestPerson = { userId: "user-cat", name: "Cat Moore", payHandle: "" };
export const DAN: TestPerson = { userId: "user-dan", name: "Dan Ng", payHandle: "@dan-ng" };
export const EVE: TestPerson = { userId: "user-eve", name: "Eve Park", payHandle: "@eve-park" };
export const EVERYONE: readonly TestPerson[] = [ANN, BOB, CAT, DAN, EVE];

/** Freezes value and everything reachable from it, so the engine can't write into it unnoticed (ES modules are strict). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** A New York wall time `days` after `from` (ms), at hh:mm: "2026-11-20T19:00". */
export function wallAfter(from: number, days: number, hhmm = "19:00"): string {
  return `${E.nyIsoDate(from + days * DAY)}T${hhmm}`;
}
/** A New York date `days` after `from`: "2026-11-20". */
export function dateAfter(from: number, days: number): string {
  return E.nyIsoDate(from + days * DAY);
}

export interface Outcome {
  res: ReduceResult<LiveWorld>;
  /** The notifications the action wrote, drained from the document. */
  notes: EngineNotification[];
}
export interface Done {
  toast: string | undefined;
  id: string | undefined;
  steps: SeqStep[] | undefined;
  notes: EngineNotification[];
}

export class LiveTestWorld {
  doc: LiveWorld;
  now: number;
  people: TestPerson[];
  /** Every notification drained so far, oldest first. */
  readonly notes: EngineNotification[] = [];
  /** Every outcome, in order, with the time it ran at: the copy audit reads their toasts, errors and states. */
  readonly outcomes: { actor: string | null; action: Action; res: ReduceResult<LiveWorld>; now: number }[] = [];

  constructor(o: { now?: number; people?: readonly TestPerson[]; doc?: LiveWorld } = {}) {
    this.doc = deepFreeze(o.doc ?? E.emptyWorld());
    this.now = o.now ?? T0;
    this.people = [...(o.people ?? EVERYONE)];
  }

  /** Runs fn inside withEngine on this world, at this world's time. */
  run<T>(fn: () => T): T {
    return E.withEngine({ doc: this.doc, people: this.people, now: this.now }, fn);
  }

  /** One action, as the store runs it. A refused action changes nothing. */
  act(actor: string | null, action: Action): Outcome {
    const prev = this.doc;
    const out = this.run(() => {
      const res = E.reduce(prev, actor, action);
      if (res.error !== undefined) return { res, notes: [] as EngineNotification[], introduced: [] as string[] };
      const notes = res.state.notifications;
      res.state.notifications = [];
      const before = new Set(E.invariantViolations(prev));
      const introduced = E.invariantViolations(res.state).filter((k) => !before.has(k));
      return { res, notes, introduced };
    });
    this.outcomes.push({ actor, action, res: out.res, now: this.now });
    if (out.res.error !== undefined) {
      if (out.res.state !== prev) throw new Error(`${action.type} was refused but returned a different state`);
      return { res: out.res, notes: [] };
    }
    if (out.introduced.length > 0) throw new Error(`${action.type} introduced invariant violations: ${out.introduced.join(", ")}`);
    this.doc = deepFreeze(out.res.state);
    this.notes.push(...out.notes);
    return { res: out.res, notes: out.notes };
  }

  /** An action that must be accepted. */
  ok(actor: string | null, action: Action): Done {
    const { res, notes } = this.act(actor, action);
    if (res.error !== undefined) throw new Error(`${action.type} by ${actor ?? "nobody"} was refused: ${res.error}`);
    return { toast: res.toast, id: res.result?.id, steps: res.steps, notes };
  }

  /** An action that must be refused: returns the refusal. */
  no(actor: string | null, action: Action): string {
    const { res } = this.act(actor, action);
    if (res.error === undefined) throw new Error(`${action.type} by ${actor ?? "nobody"} was accepted, but should be refused`);
    return res.error;
  }

  /** The server's expiry sweep, as getView runs it after next_due. */
  sweep(): Outcome {
    return this.act(null, { type: "sweep" });
  }

  advance(ms: number): void {
    this.now += ms;
  }

  /** Notifications drained so far for one person. */
  notesFor(userId: string): EngineNotification[] {
    return this.notes.filter((n) => n.userId === userId);
  }

  // ── Builders for the common steps ─────────────────────────────────────────────────────

  /** Adds an event (createEvent) 10 days ahead at 19:00 with one $40 tier; returns its id. */
  addEvent(actor: TestPerson, over: Record<string, unknown> = {}): string {
    const id = this.ok(actor.userId, {
      type: "createEvent", kind: "event", title: "Spring Formal", club: "Wharton Graduate Association", cat: "Parties",
      start: wallAfter(this.now, 10), attend: "all", tiers: [{ label: "General admission", price: "40" }], ...over,
    }).id;
    if (!id) throw new Error("createEvent returned no id");
    return id;
  }

  /** Adds a holding and lists it in one step (addThen); returns the listing's id. */
  listTickets(actor: TestPerson, eventId: string, o: { qty?: number; ask?: string; paid?: string; method?: string; obo?: boolean; minOffer?: string; departsAt?: string; tier?: string; note?: string } = {}): string {
    const qty = o.qty ?? 1;
    const id = this.ok(actor.userId, {
      type: "addThen",
      add: { eventId, tier: o.tier ?? "t1", qty, paid: o.paid ?? "40" },
      then: { type: "list", qty, ask: o.ask ?? "35", note: o.note ?? "", viaOrganizer: false, restricted: false, method: o.method ?? "app", namesChecked: false, file: null,
        payHandle: actor.payHandle || "@pay-me", membersOnly: false, obo: o.obo ?? false, ...(o.minOffer !== undefined ? { minOffer: o.minOffer } : {}), ...(o.departsAt !== undefined ? { departsAt: o.departsAt } : {}) },
    }).id;
    if (!id) throw new Error("addThen returned no id");
    return id;
  }

  /** "I'll take it"; returns the request's id. */
  take(actor: TestPerson, listingId: string, qty = 1, member = false): string {
    const id = this.ok(actor.userId, { type: "take", listingId, qty, amount: "", msg: "", member }).id;
    if (!id) throw new Error("take returned no id");
    return id;
  }

  /** A public request for an event; returns its id. */
  requestFor(actor: TestPerson, eventId: string, o: { qty?: number; budget?: string; days?: number; note?: string } = {}): string {
    const id = this.ok(actor.userId, { type: "saveInterest", data: { eventId, qty: o.qty ?? 1, budget: o.budget ?? "40", note: o.note ?? "", expires: dateAfter(this.now, o.days ?? 5) } }).id;
    if (!id) throw new Error("saveInterest returned no id");
    return id;
  }

  /** Posts an item; returns its id. */
  postItem(actor: TestPerson, over: Record<string, unknown> = {}): string {
    const id = this.ok(actor.userId, { type: "postItem", data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", obo: false, area: "Rittenhouse", until: dateAfter(this.now, 10), note: "", ...over } }).id;
    if (!id) throw new Error("postItem returned no id");
    return id;
  }
}
