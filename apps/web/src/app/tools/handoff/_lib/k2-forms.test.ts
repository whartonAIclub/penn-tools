// The WhatsApp-short ISO and the Sell polish (USER-INSTRUCTIONS §9q items 4 and 5), the page's rules with no page in them
// (_lib/sell.js): what "Post request" sends for a new event (its name and date, nothing else), the one collapsed "Optional details"
// line, the club field's suggestions and when it's required, and the
// Members-only ticket's club.
// Pure functions over the engine's catalog: a small live market installed with a set clock; no DOM, no server, no sign-in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import {
  NEW0, NEW_MORE, WHAT, clubOptions, isoMoreHint, memberClubError, memberTicketOffer, newEventIssues, newMoreIds, newMoreUsed, requestAction, requestNew, whatHelp,
} from "./sell";

const T0 = Date.UTC(2026, 10, 15, 20, 0); // Sun Nov 15, 2026, 3:00 PM in Philadelphia
const stored = (id: string, title: string, start: string, more: Record<string, unknown> = {}) => ({
  id: `ev-${id.padStart(16, "0")}`, kind: "event", title, start, attend: "all", tiers: [{ id: "t1", label: "Ticket", price: null }], perPerson: 4, deadline: null,
  policy: "unknown", createdBy: "u-test-other", createdAt: T0 - 3600e3, ...more,
});
const GALA = stored("1", "Spring Gala", "2026-12-04", { venue: "Houston Hall", club: "Wharton Social Committee" });
const WINE = stored("2", "Wine Tasting", "2026-12-05", { club: "Wharton Wine Club" });
const WINE2 = stored("3", "Wine and Cheese", "2026-12-06", { club: "wharton wine club" }); // the same club, typed another way
const QUIZ = stored("4", "Quiz Night", "2026-11-24"); // names no club
const WSC2 = stored("5", "Rooftop Mixer", "2026-11-29", { club: "Wharton Social Committee" });
const TRAIN = stored("6", "Amtrak Northeast Regional: Philadelphia → New York", "2026-11-21T09:05", { kind: "train", cat: "Travel", club: "Amtrak", methods: ["file"], noOrganizer: true, perPerson: 2 });
const MEMBERS = stored("7", "Members Mixer", "2026-12-08", { club: "Wharton Wine Club", attend: "members" });
const install = () => { E.setLiveClock(() => T0); E.applyWorld({ ...E.emptyWorld(), events: [GALA, WINE, WINE2, QUIZ, WSC2, TRAIN, MEMBERS] } as unknown as Parameters<typeof E.applyWorld>[0]); };
const nd = (over: Partial<Record<keyof typeof NEW0, string | boolean>> = {}) => ({ ...NEW0, ...over }) as typeof NEW0;
const issue = (rows: ReturnType<typeof newEventIssues>, id: string) => { const r = rows.find((x) => x[0] === id); return r ? { missing: r[1], wrong: r[2] } : null; };

beforeEach(() => install());
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("Post request for a new event sends its name and date, nothing else (9q item 4)", () => {
  it("a new event goes with its kind, name and date; a train with its departure", () => {
    expect(requestAction({ eventId: "", text: "Oysters", nd: nd({ date: "2026-11-27" }), qty: 1, budget: "", note: "", until: "" }))
      .toEqual({ type: "postRequest", event: { kind: "event", title: "Oysters", start: "2026-11-27" }, qty: 1, budget: "", note: "" });
    expect(requestAction({ eventId: "", text: "Acela 2150", nd: nd({ kind: "train", start: "2026-11-21T15:10" }), qty: 1, budget: "", note: "", until: "" }))
      .toEqual({ type: "postRequest", event: { kind: "train", title: "Acela 2150", start: "2026-11-21T15:10" }, qty: 1, budget: "", note: "" });
  });
  // SELL6-N3 (§9x item 5): the club is on the request form again (one optional field, in Optional details), so it's the one detail
  // that's kept and sent; this test had "club" in its list of what never rides along, with a kept club of "J". Everything else is
  // dropped as before, and the hidden fields still can't stop a post.
  it("nothing the form doesn't show rides along: a kept form's face value, venue, limit, names checked or link (its club, shown again, does: 9x item 5)", () => {
    const kept = nd({ date: "2026-11-27", face: "abc", venue: "Houston Hall", club: "Jazz Society", perPerson: "2", namesChecked: true, officialUrl: "example.com", cat: "Social" });
    expect(requestNew(kept)).toEqual({ ...NEW0, date: "2026-11-27", club: "Jazz Society" });
    expect(requestNew(nd({ kind: "train", start: "2026-11-21T15:10", date: "2026-11-27", venue: "30th Street", club: "Amtrak" }))).toEqual({ ...NEW0, kind: "train", start: "2026-11-21T15:10", date: "2026-11-27" });
    const a = requestAction({ eventId: "", text: "Oysters", nd: kept, qty: 1, budget: "", note: "", until: "" });
    expect((a as { event?: object }).event).toEqual({ kind: "event", title: "Oysters", start: "2026-11-27", club: "Jazz Society" });
    // And nothing hidden can stop the post: only the name, the date and the club that's shown are checked.
    const rows = newEventIssues("Oysters", requestNew(kept) as typeof NEW0, T0, { idp: "iso", request: true });
    expect(rows.every(([, missing, wrong]) => !missing && !wrong)).toBe(true);
    // With no club typed, the post is what it was before: the name and the date, nothing else.
    const bare = nd({ date: "2026-11-27", face: "abc", venue: "Houston Hall", perPerson: "2", namesChecked: true, officialUrl: "example.com", cat: "Social" });
    expect(requestNew(bare)).toEqual({ ...NEW0, date: "2026-11-27" });
    expect((requestAction({ eventId: "", text: "Oysters", nd: bare, qty: 1, budget: "", note: "", until: "" }) as { event?: object }).event).toEqual({ kind: "event", title: "Oysters", start: "2026-11-27" });
  });
  it("an event on Handoff is sent by its id, as before; quantity, budget, an earlier end and the note go as chosen", () => {
    expect(requestAction({ eventId: QUIZ.id, text: "ignored", nd: nd(), qty: 1, budget: "", note: "", until: "" })).toEqual({ type: "postRequest", eventId: QUIZ.id, qty: 1, budget: "", note: "" });
    expect(requestAction({ eventId: QUIZ.id, text: "", nd: nd(), qty: 2, budget: " 30 ", note: " Can pay today ", until: "2026-11-20" }))
      .toEqual({ type: "postRequest", eventId: QUIZ.id, qty: 2, budget: "30", note: "Can pay today", expires: "2026-11-20" });
  });
  it("neither caption about Handoff adding the event with the request is left", () => {
    expect(whatHelp("request", "new", "Oysters", 0)).toBe("");
    expect(whatHelp("request", "new", "Spring Gala", 2)).toBe("");
    for (const v of Object.values(WHAT.request)) expect(String(v)).not.toMatch(/together with your request/);
    // Sell keeps its own words, and the search help is as it was on both forms.
    expect(whatHelp("sell", "new", "Jazz Brunch", 0)).toBe("New on Handoff: it's added together with your ticket when you post.");
    expect(whatHelp("request", "search", "", 0)).toBe("Type its name. Events and trains already on Handoff show up as you type.");
    expect(whatHelp("request", "search", "Spring Gala", 2)).toBe("Is it one of these? Tap it. If not, tap “isn't one of these”.");
  });
});

describe("one collapsed Optional details on the request form: what it says while closed (9q item 4)", () => {
  it("the defaults: one ticket, any price, until the event's cutoff", () => {
    expect(isoMoreHint({ qty: 1, unit: "ticket", budget: null, until: "Fri, Nov 27, 11:59 PM" })).toBe("1 ticket · any price · until Fri, Nov 27, 11:59 PM");
    expect(isoMoreHint({ qty: 1, unit: "ticket", budget: null, until: "" })).toBe("1 ticket · any price"); // no event chosen yet
    expect(isoMoreHint({ qty: 1, unit: "spot", budget: null, until: "" })).toBe("1 spot · any price");
  });
  it("what the buyer chose stays in view when they collapse it; from two up the count shows on its own (9n)", () => {
    expect(isoMoreHint({ qty: 1, unit: "ticket", budget: 30, until: "Fri, Nov 20, 11:59 PM" })).toBe("1 ticket · up to $30 · until Fri, Nov 20, 11:59 PM");
    expect(isoMoreHint({ qty: 2, unit: "ticket", budget: null, until: "Fri, Nov 27, 11:59 PM" })).toBe("any price · until Fri, Nov 27, 11:59 PM");
    expect(isoMoreHint({ qty: 3, unit: "ticket", budget: 0, until: "" })).toBe("up to $0"); // an explicit $0 is a budget, never "any price"
  });
});

describe("Club or organizer: suggestions from the clubs already on Handoff, free text accepted (9q item 5)", () => {
  it("suggests existing clubs as the seller types, each once, the ones starting with what's typed first", () => {
    expect(clubOptions("wh")).toEqual(["Wharton Wine Club", "Wharton Social Committee"]); // both start with it: the club with more events first
    expect(clubOptions("wine")).toEqual(["Wharton Wine Club"]);
    expect(clubOptions("WHARTON W")).toEqual(["Wharton Wine Club"]);
    expect(clubOptions("social c")).toEqual(["Wharton Social Committee"]);
    expect(clubOptions("club")).toEqual(["Wharton Wine Club"]);
    expect(clubOptions("wh", 1)).toEqual(["Wharton Wine Club"]);
    expect(clubOptions("committee")).toEqual(["Wharton Social Committee"]);
    expect(clubOptions("wc")).toEqual([]); // letters in a row only: nothing more is guessed
  });
  it("nothing before a letter is typed, nothing for a train's operator, and nothing once the name is exactly one of them", () => {
    expect(clubOptions("")).toEqual([]);
    expect(clubOptions("  ")).toEqual([]);
    expect(clubOptions("amtrak")).toEqual([]);
    expect(clubOptions("Wharton Wine Club")).toEqual([]);
    expect(clubOptions("wharton wine club ")).toEqual([]);
    expect(clubOptions("Penn Glee Club")).toEqual([]); // a club Handoff hasn't seen: free text, nothing to suggest
  });
  it("the field is optional until eligibility needs a club: names checked at the door, or a members-only ticket", () => {
    const date = { date: "2026-12-06" };
    expect(issue(newEventIssues("Jazz Brunch", nd(date)), "r-club")).toEqual({ missing: null, wrong: null });
    expect(issue(newEventIssues("Jazz Brunch", nd(date), T0, { membersOnly: true }), "r-club")!.missing).toBe("Add the club: a members-only ticket is for its members.");
    expect(issue(newEventIssues("Jazz Brunch", nd({ ...date, club: "Jazz Society" }), T0, { membersOnly: true }), "r-club")).toEqual({ missing: null, wrong: null });
    expect(issue(newEventIssues("Jazz Brunch", nd({ ...date, namesChecked: true })), "r-club")!.missing).toMatch(/^Add the club or organizer: with names checked at the door/);
    expect(issue(newEventIssues("Jazz Brunch", nd({ ...date, club: "J" }), T0, { membersOnly: true }), "r-club")!.wrong).toMatch(/2 to 80 characters/);
  });
  it("a club typed on the form doesn't count as an optional detail in use (§9y: it's on the form itself; a kept form doesn't open Optional details for it)", () => {
    expect(newMoreUsed(nd({ date: "2026-12-06", club: "Jazz Society" }))).toBe(false); // §9y (SELL7-O1): on the form itself again, as in §9q item 5 (§9s item 4 had put it in Optional details: true)
    expect(newMoreUsed(nd({ date: "2026-12-06", venue: "Houston Hall" }))).toBe(true);
  });
  it("it isn't in the fixed list of Optional details' fields (§9y: clubPlace, on the form itself)", () => {
    expect(NEW_MORE).toEqual(["r-face", "r-cat", "r-venue", "r-pp", "r-names", "r-url"]);
    expect(newMoreIds("r")).toEqual(NEW_MORE);
  });
});

describe("Members-only ticket: offered on any ordinary event, with the club named where the event names none (9q item 5)", () => {
  const ev = (raw: object) => E.normalizeEvent(raw as Parameters<typeof E.normalizeEvent>[0]);
  it("is offered for an event with a club and for one that names none; never for a train, or where the event or type already is", () => {
    expect(memberTicketOffer(ev(WINE), "t1")).toBe(true);
    expect(memberTicketOffer(ev(QUIZ), "t1")).toBe(true); // names no club: the seller names it
    expect(memberTicketOffer(ev(TRAIN), "t1")).toBe(false);
    expect(memberTicketOffer(ev(MEMBERS), "t1")).toBe(false); // the event is members-only already
    expect(memberTicketOffer(null, "t1")).toBe(false);
  });
  it("the named club: 2 to 80 characters, in the server's words; blank asks for it", () => {
    expect(memberClubError("Quiz League")).toBeNull();
    expect(memberClubError("  Quiz   League ")).toBeNull();
    expect(memberClubError("")).toBe("Name the club whose members can use this ticket.");
    expect(memberClubError("   ")).toBe("Name the club whose members can use this ticket.");
    expect(memberClubError("Q")).toBe(E.NO_MEMBER_CLUB);
    expect(memberClubError("??")).toBe(E.NO_MEMBER_CLUB);
    expect(memberClubError("x".repeat(81))).toBe(E.NO_MEMBER_CLUB);
  });
});
