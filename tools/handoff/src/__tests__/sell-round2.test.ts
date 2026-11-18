// Forms round 2 (USER-INSTRUCTIONS §9j items 2 and 3, step FORMS-F2b), the engine half of picking an event and selling:
// - "Add an event" suggests events already on Handoff as soon as a recognizable name is typed (suggestEvents): up to three upcoming
//   events, exact title matches first, a date (when one is entered) refining the order. Every event is its own suggestion, so
//   separate seatings and departures of one name stay separately selectable.
// - A picker option names the event's date, with its actual start or departure time when one is known (eventWhen, eventOption). An
//   event added by its date alone shows the date and nothing else: 11:59 PM is when it closes, never a start time.
// - The Sell form's asking price starts from the ticket type's face value where the event gives one (askPrefill), and from nothing
//   where it doesn't.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { must, resetEngine } from "./helpers/invite.js";
import { ServerWorld, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, T0, dateAfter, wallAfter, type TestPerson } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as E.Action;
/** An ordinary event as the event form sends it: its name and its date. */
const EVENT = (title: string, date: string, over: Record<string, unknown> = {}) => act({ type: "createEvent", kind: "event", title, start: date, ...over });
/** An event stored with a start time, as the form before this round sent it (two seatings of one show, say). */
const TIMED = (title: string, start: string) => act({ type: "createEvent", kind: "event", title, start, tiers: [{ label: "General admission", price: "40" }] });
/** A train as the event form sends it: one name and its departure. */
const TRAIN = (title: string, departs: string) => act({ type: "createEvent", kind: "train", title, start: departs });
const add = (w: ServerWorld, p: TestPerson, a: E.Action): string => must(w.ok(p.userId, a).id, "event");
const evOf = (id: string): E.EngineEvent => must(E.EV[id], `event ${id}`);
/** The suggestions' ids for what's typed, as the event form asks for them. */
const ids = (w: ServerWorld, title: string, when?: string | null, o?: { max?: number; kind?: "event" | "train" | "trek" | null }): string[] =>
  w.run(() => E.suggestEvents(title, when, o).map((e) => e.id));

describe("events suggested while a name is typed (9j item 2)", () => {
  it("suggests nothing until the name is recognizable, then an event already on Handoff, even from half a word", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const formal = add(w, ANN, EVENT("Spring Formal", dateAfter(T0, 12)));
    add(w, ANN, EVENT("Rooftop Mixer", dateAfter(T0, 9)));
    for (const none of ["", " ", "S", "Sp", "the", "of", "xyz", "Quiz Bowl"]) expect(ids(w, none), JSON.stringify(none)).toEqual([]);
    for (const typed of ["Spr", "spring", "Spring For", "SPRING FORMAL", "  spring   formal ", "Formal", "Spring-Formal!"]) expect(ids(w, typed), typed).toEqual([formal]);
    // A word in the middle of a longer name counts; a half-typed word counts only where it's the last one typed.
    expect(ids(w, "Wharton Spring Formal 2026")).toEqual([formal]);
    expect(ids(w, "Spr Mixer")).toEqual([must(w.doc.events.find((e) => e.title === "Rooftop Mixer"), "mixer").id]);
  });

  it("puts an exact title first, then the names that hold every typed word, then the ones that share at least half of them; three at most", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    // The exact one is the latest of them, so nothing but its title can put it first.
    const afterparty = add(w, ANN, EVENT("Winter Ball Afterparty", dateAfter(T0, 5)));
    const gala = add(w, ANN, EVENT("Winter Gala", dateAfter(T0, 6)));
    const ballroom = add(w, BOB, EVENT("Ballroom Dance Night", dateAfter(T0, 7)));
    const brunch = add(w, BOB, EVENT("Winter Brunch", dateAfter(T0, 8)));
    const ball = add(w, CAT, EVENT("Winter Ball", dateAfter(T0, 30)));
    expect(ids(w, "winter ball")).toEqual([ball, afterparty, gala]); // exact; every word; one word (the sooner of the two that share one)
    expect(ids(w, "Winter Ball").length).toBe(3);
    expect(ids(w, "Winter Ball", null, { max: 5 })).toEqual([ball, afterparty, gala, ballroom, brunch]); // then one word each ("Ball…" may be half of Ballroom), the soonest first
    expect(ids(w, "Ball Winter", null, { max: 5 })).toEqual([afterparty, ball, gala, brunch]); // "Ball" isn't half a word once another follows it: no Ballroom; and it isn't the exact title
    expect(ids(w, "Winter", null, { max: 5 })).toEqual([afterparty, gala, brunch, ball]); // no exact title: the soonest first
    expect(ids(w, "Ball", null, { max: 5 })).toEqual([afterparty, ballroom, ball]); // a half-typed last word: "Ball…" finds Ballroom too
    // One shared word out of four isn't relevant: a name has to share at least half of the typed words.
    expect(ids(w, "Winter Ball Charity Auction", null, { max: 5 })).toEqual([afterparty, ball]);
    expect(ids(w, "Charity Auction for the Winter", null, { max: 5 })).toEqual([]);
    // Exact means the same name whatever its capitals, spacing or punctuation: nothing less.
    expect(ids(w, "WINTER-BALL")[0]).toBe(ball);
    expect(ids(w, "Winter Bal")[0]).toBe(afterparty);
  });

  it("suggests only upcoming events: not one that's over, one whose transfer window closed, or one that was removed", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const soon = add(w, ANN, EVENT("Comedy Night", dateAfter(T0, 1)));
    const closing = add(w, ANN, EVENT("Comedy Night", dateAfter(T0, 6), { deadline: wallAfter(T0, 3, "17:00") }));
    const later = add(w, BOB, EVENT("Comedy Night", dateAfter(T0, 20)));
    const typo = add(w, BOB, EVENT("Comedy Nite", dateAfter(T0, 21)));
    expect(ids(w, "Comedy Night")).toEqual([soon, closing, later]);
    w.ok(BOB.userId, act({ type: "removeEvent", eventId: typo }));
    expect(ids(w, "Comedy Nite")).toEqual([soon, closing, later]); // the removed one is gone; the others share "Comedy"
    w.advance(2 * DAY); // the first is over (11:59 PM on its day has passed)
    expect(ids(w, "Comedy Night")).toEqual([closing, later]);
    w.advance(2 * DAY); // the second one's transfer deadline has passed, though its day hasn't come
    expect(ids(w, "Comedy Night")).toEqual([later]);
    w.advance(30 * DAY);
    expect(ids(w, "Comedy Night")).toEqual([]);
  });

  it("refines by the date when one is entered, and still shows the same name on other days", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const first = add(w, ANN, EVENT("Fight Night", dateAfter(T0, 10)));
    const second = add(w, ANN, EVENT("Fight Night", dateAfter(T0, 17)));
    const third = add(w, BOB, EVENT("Fight Night", dateAfter(T0, 24)));
    const viewing = add(w, BOB, EVENT("Fight Night Viewing Party", dateAfter(T0, 17)));
    expect(ids(w, "Fight Night")).toEqual([first, second, third]); // no date: the soonest first
    expect(ids(w, "Fight Night", dateAfter(T0, 17))).toEqual([second, first, third]); // that day first; the others stay, soonest first
    expect(ids(w, "Fight Night", dateAfter(T0, 24))).toEqual([third, first, second]);
    expect(ids(w, "Fight Night", dateAfter(T0, 23))).toEqual([third, first, second]); // a day off still points at the nearest
    expect(ids(w, "Fight Night", dateAfter(T0, 40))).toEqual([first, second, third]); // no event near that date: the soonest first
    // An exact title on another day still comes before a longer name on the day that was entered.
    expect(ids(w, "Fight Night", dateAfter(T0, 17), { max: 5 })).toEqual([second, first, third, viewing]);
    expect(ids(w, "Fight Night View", dateAfter(T0, 10))).toEqual([viewing, first, second]);
    // A date that isn't one is ignored, never guessed at.
    for (const bad of ["", "2026-13-45", "tomorrow", "0002-11-20x"]) expect(ids(w, "Fight Night", bad), bad).toEqual([first, second, third]);
  });

  it("keeps two seatings and two departures of one name as separate suggestions, each with its own time", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const day = dateAfter(T0, 9);
    const early = add(w, ANN, TIMED("Improv Showcase", `${day}T19:00`));
    const late = add(w, ANN, TIMED("Improv Showcase", `${day}T21:30`));
    const am = add(w, BOB, TRAIN("Amtrak Northeast Regional: Philadelphia → New York", `${day}T09:05`));
    const pm = add(w, BOB, TRAIN("Amtrak Northeast Regional: Philadelphia → New York", `${day}T15:10`));
    expect(ids(w, "Improv Showcase")).toEqual([early, late]);
    expect(ids(w, "Improv Showcase", day)).toEqual([early, late]); // a date alone can't tell them apart: both, the earlier first
    expect(ids(w, "amtrak northeast regional: philadelphia -> new york", null, { kind: "train" })).toEqual([am, pm]);
    expect(ids(w, "Amtrak Northeast Regional", `${day}T15:10`, { kind: "train" })).toEqual([pm, am]); // the departure that was entered comes first
    expect(ids(w, "Amtrak Northeast Regional", `${day}T09:05`, { kind: "train" })).toEqual([am, pm]);
    w.run(() => {
      const rows = E.suggestEvents("Improv Showcase").map((e) => E.eventOption(e));
      expect(rows).toEqual([`Improv Showcase · ${E.fmtDay(day)}, 7:00 PM`, `Improv Showcase · ${E.fmtDay(day)}, 9:30 PM`]);
      expect(new Set(E.suggestEvents("Amtrak", null, { kind: "train" }).map((e) => E.eventOption(e))).size).toBe(2);
    });
    // What's being added decides only a tie: a train of that name comes before an event of that name on the Train form.
    const party = add(w, CAT, EVENT("Northeast Regional", day));
    const regional = add(w, CAT, TRAIN("Northeast Regional", `${day}T12:00`));
    expect(ids(w, "Northeast Regional", null, { kind: "train" }).slice(0, 2)).toEqual([regional, party]);
    expect(ids(w, "Northeast Regional", null, { kind: "event" }).slice(0, 2)).toEqual([party, regional]);
  });

  it("reads the same from a classmate's view in the browser as on the server", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const formal = add(w, ANN, EVENT("Spring Formal", dateAfter(T0, 12)));
    const other = add(w, BOB, EVENT("Spring Fling", dateAfter(T0, 3)));
    const v = viewOf(w, DAN);
    E.setLiveClock(() => v.serverNow);
    E.applyWorld(v as unknown as E.WorldState);
    try {
      expect(E.suggestEvents("spring formal").map((e) => e.id)).toEqual([formal, other]);
      expect(E.suggestEvents("Spring F", dateAfter(T0, 12)).map((e) => e.id)).toEqual([formal, other]);
    } finally { E.setLiveClock(null); E.applyWorld(null); }
  });
});

describe("an event's date in a picker option (9j item 2)", () => {
  it("shows the date alone for a date-only event: never its 11:59 PM closing time", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 12);
    const id = add(w, ANN, EVENT("Rooftop Mixer", date));
    w.run(() => {
      const ev = evOf(id);
      expect(E.closesAt(ev)).toBe(E.wallToMs(`${date}T23:59`)); // it does close then
      expect(E.eventWhen(ev)).toBe(E.fmtDay(date));
      expect(E.eventOption(ev)).toBe(`Rooftop Mixer · ${E.fmtDay(date)}`);
      expect(E.eventOption(ev)).not.toMatch(/11:59|PM|AM|\d:\d\d/);
    });
  });

  it("shows the actual start or departure time when one is known", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const day = dateAfter(T0, 9);
    const timed = add(w, ANN, TIMED("Improv Showcase", `${day}T19:00`));
    const train = add(w, ANN, TRAIN("Amtrak Keystone: Philadelphia → Harrisburg", `${day}T09:05`));
    const trek = add(w, BOB, act({ type: "createEvent", kind: "trek", title: "Japan Trek", club: "Japan Trek Club", start: wallAfter(T0, 20, "08:00"), end: wallAfter(T0, 27, "18:00"), tiers: [{ label: "Spot", price: "1200" }] }));
    const pass = add(w, BOB, act({ type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 2, "06:00"), openUntil: wallAfter(T0, 6, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }));
    w.run(() => {
      expect(E.eventOption(evOf(timed))).toBe(`Improv Showcase · ${E.fmtDay(day)}, 7:00 PM`);
      expect(E.eventOption(evOf(train))).toBe(`Amtrak Keystone: Philadelphia → Harrisburg · ${E.fmtDay(day)}, 9:05 AM`);
      expect(E.eventOption(evOf(trek))).toBe(`Japan Trek · ${E.fmtDay(dateAfter(T0, 20))}, 8:00 AM`);
      // An older train ticket with a validity window has no one departure: its window shows, as on its page.
      expect(E.eventWhen(evOf(pass))).toBe(E.fmtRange(evOf(pass)));
      expect(E.eventWhen(evOf(pass))).toMatch(/^Valid /);
    });
  });

  it("names the year when the event isn't this year", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const id = add(w, ANN, EVENT("Spring Gala", "2027-03-06"));
    w.run(() => expect(E.eventOption(evOf(id))).toBe("Spring Gala · Sat, Mar 6, 2027"));
  });
});

describe("the asking price's starting value (9j item 3)", () => {
  it("is the ticket type's face value where the event gives one, and nothing where it doesn't", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const faced = add(w, ANN, EVENT("Spring Formal", dateAfter(T0, 12), { face: "40" }));
    const cents = add(w, ANN, EVENT("Wine Tasting", dateAfter(T0, 12), { face: "12.50" }));
    const open = add(w, ANN, EVENT("Rooftop Mixer", dateAfter(T0, 12)));
    const two = add(w, BOB, act({ type: "createEvent", kind: "event", title: "Charity Ball", start: wallAfter(T0, 14), tiers: [{ label: "General admission", price: "60" }, { label: "VIP", price: "95" }] }));
    const train = add(w, BOB, TRAIN("Amtrak Keystone: Philadelphia → Harrisburg", wallAfter(T0, 4, "09:05")));
    w.run(() => {
      expect(E.askPrefill(evOf(faced), "t1")).toBe("40");
      expect(E.askPrefill(evOf(cents), "t1")).toBe("12.5");
      expect(E.parseMoney(E.askPrefill(evOf(cents), "t1"))).toEqual({ value: 12.5 });
      expect(E.askPrefill(evOf(open), "t1")).toBe(""); // no face value: nothing is guessed
      expect(E.askPrefill(evOf(train), "t1")).toBe("");
      expect(E.askPrefill(evOf(two), "t1")).toBe("60");
      expect(E.askPrefill(evOf(two), "t2")).toBe("95");
      expect(E.askPrefill(evOf(two), "")).toBe(""); // no ticket type chosen yet
      expect(E.askPrefill(evOf(two), "t9")).toBe("");
      expect(E.askPrefill(null, "t1")).toBe("");
      // It's never above what the engine would accept as the price.
      expect(Number(E.askPrefill(evOf(faced), "t1"))).toBeLessThanOrEqual(E.askCap(evOf(faced), { tier: "t1", paid: null }));
    });
    // Posted untouched, that price is accepted; a dollar more is refused, as before.
    const sell = (ask: string) => act({ type: "addThen", add: { eventId: faced, tier: "t1", qty: 1 }, then: { type: "list", qty: 1, ask, note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false, minOffer: "" } });
    expect(w.no(CAT.userId, sell("41"))).toBe("Asking price can't be more than the face value ($40).");
    const l = must(w.ok(CAT.userId, sell(w.run(() => E.askPrefill(evOf(faced), "t1")))).id, "listing");
    expect(must(w.doc.listings.find((x) => x.id === l), "listing").ask).toBe(40);
  });
});
