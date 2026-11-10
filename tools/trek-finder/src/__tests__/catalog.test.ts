import { describe, it, expect } from "vitest";
import { filterTrips, listSeasons, nextDeadline, sortTrips, tripSeason } from "../catalog.js";
import type { Deadline, PriceStage, Trip } from "../trips.js";
import { SAMPLE_TRIPS } from "../samples.js";

function trip(overrides: Partial<Trip>): Trip {
  return {
    id: "t",
    name: "Trip",
    tripType: "Club/Other Trek",
    location: "Somewhere",
    cities: [],
    region: "Europe",
    startDate: "2027-03-06",
    endDate: "2027-03-14",
    timing: "break",
    periodLabel: null,
    academicCredit: false,
    creditNote: null,
    description: null,
    priceIncludes: null,
    destinationBlurb: null,
    itinerary: null,
    availabilityStatus: null,
    spotsTotal: null,
    spotsRemaining: null,
    organizerName: "Club",
    organizerContact: null,
    organizerEmail: null,
    applicationUrl: null,
    destinationAirport: null,
    imageUrl: null,
    imageCredit: null,
    listed: true,
    priceStages: [],
    deadlines: [],
    links: [],
    ...overrides,
  };
}

function price(amountUsd: number | null, validFrom: string | null = null, validUntil: string | null = null): PriceStage {
  return { position: 1, label: "Fee", amountUsd, certainty: "estimate", validFrom, validUntil, note: null };
}

function deadline(kind: Deadline["kind"], dueDate: string, position = 1): Deadline {
  return { position, kind, label: kind, dueDate, dueTime: null };
}

const ids = (result: Trip[]) => result.map((t) => t.id);
const TODAY = "2026-11-09";

describe("tripSeason", () => {
  it("puts each month in its season", () => {
    expect(tripSeason("2026-09-01")).toBe("Fall 2026");
    expect(tripSeason("2026-11-30")).toBe("Fall 2026");
    expect(tripSeason("2026-12-01")).toBe("Winter 2026-2027");
    expect(tripSeason("2027-01-15")).toBe("Winter 2026-2027");
    expect(tripSeason("2027-02-28")).toBe("Winter 2026-2027");
    expect(tripSeason("2027-03-01")).toBe("Spring 2027");
    expect(tripSeason("2027-04-30")).toBe("Spring 2027");
    expect(tripSeason("2027-05-01")).toBe("Summer 2027");
    expect(tripSeason("2027-08-31")).toBe("Summer 2027");
  });
});

describe("listSeasons", () => {
  it("lists each season once, in date order", () => {
    expect(listSeasons(SAMPLE_TRIPS)).toEqual(["Fall 2026", "Winter 2026-2027", "Spring 2027", "Summer 2027"]);
  });
});

describe("filterTrips", () => {
  const trips = [
    trip({ id: "japan", name: "Japan Trek", region: "Asia", startDate: "2027-03-06" }),
    trip({ id: "india", name: "India GIP", tripType: "GIP", region: "Asia", startDate: "2027-01-03", academicCredit: true }),
    trip({ id: "nyc", name: "NYC", region: "North America", startDate: "2026-11-30" }),
    trip({ id: "iceland", name: "Northern Lights", location: "Iceland", cities: ["Reykjavík"], startDate: "2027-01-06" }),
  ];

  it("returns every trip, in the order given, with no filters", () => {
    expect(ids(filterTrips(trips))).toEqual(["japan", "india", "nyc", "iceland"]);
  });

  it("filters by type, region, season and credit", () => {
    expect(ids(filterTrips(trips, { type: "GIP" }))).toEqual(["india"]);
    expect(ids(filterTrips(trips, { region: "Asia" }))).toEqual(["japan", "india"]);
    expect(ids(filterTrips(trips, { season: "Winter 2026-2027" }))).toEqual(["india", "iceland"]);
    expect(ids(filterTrips(trips, { creditOnly: true }))).toEqual(["india"]);
  });

  it("combines filters", () => {
    expect(ids(filterTrips(trips, { region: "Asia", season: "Winter 2026-2027" }))).toEqual(["india"]);
    expect(ids(filterTrips(trips, { region: "Asia", creditOnly: true, type: "Club/Other Trek" }))).toEqual([]);
  });

  it("searches text fields, ignoring case and surrounding spaces", () => {
    expect(ids(filterTrips(trips, { query: "  REYKJ " }))).toEqual(["iceland"]);
    expect(ids(filterTrips(trips, { query: "iceland" }))).toEqual(["iceland"]);
    expect(ids(filterTrips([...trips, trip({ id: "d", description: "A night in a ryokan" })], { query: "ryokan" }))).toEqual(["d"]);
  });

  it("treats null and false filters as unset", () => {
    expect(filterTrips(trips, { type: null, region: null, season: null, creditOnly: false })).toHaveLength(4);
  });
});

describe("nextDeadline", () => {
  it("uses the preliminary deadline until it passes, counting today as still to come", () => {
    const t = trip({ deadlines: [deadline("preliminary", "2026-11-15"), deadline("application", "2026-12-01", 2)] });
    expect(nextDeadline(t, "2026-11-15")).toBe("2026-11-15");
    expect(nextDeadline(t, "2026-11-16")).toBe("2026-12-01");
  });

  it("takes the soonest upcoming application deadline when there's no preliminary one", () => {
    const t = trip({ deadlines: [deadline("application", "2026-12-20"), deadline("application", "2026-12-01", 2), deadline("application", "2026-10-01", 3)] });
    expect(nextDeadline(t, TODAY)).toBe("2026-12-01");
  });

  it("ignores deposit and payment deadlines, and returns null when nothing is coming up", () => {
    const t = trip({ deadlines: [deadline("preliminary", "2026-11-01"), deadline("deposit", "2026-12-01", 2)] });
    expect(nextDeadline(t, TODAY)).toBe(null);
    expect(nextDeadline(trip({}), TODAY)).toBe(null);
  });
});

describe("sortTrips", () => {
  const cheap = trip({ id: "cheap", startDate: "2027-03-06", priceStages: [price(1000)] });
  const dear = trip({ id: "dear", startDate: "2027-01-06", priceStages: [price(4000)] });
  const tbd = trip({ id: "tbd", startDate: "2026-12-01", priceStages: [price(null)] });
  const early = trip({ id: "early", startDate: "2027-05-01", priceStages: [price(2000, null, "2026-11-30"), { ...price(2500, "2026-12-01"), position: 2 }] });

  it("sorts by start date, soonest first", () => {
    expect(ids(sortTrips([cheap, dear, tbd, early], "start_date", TODAY))).toEqual(["tbd", "dear", "cheap", "early"]);
  });

  it("sorts by today's price, low or high, with TBD last both ways", () => {
    expect(ids(sortTrips([cheap, dear, tbd, early], "cost_low", TODAY))).toEqual(["cheap", "early", "dear", "tbd"]);
    expect(ids(sortTrips([cheap, dear, tbd, early], "cost_high", TODAY))).toEqual(["dear", "early", "cheap", "tbd"]);
  });

  it("uses the price in effect on the given day", () => {
    const later = trip({ id: "later", startDate: "2027-06-01", priceStages: [price(2200)] });
    expect(ids(sortTrips([early, later], "cost_low", "2026-11-09"))).toEqual(["early", "later"]);
    expect(ids(sortTrips([early, later], "cost_low", "2026-12-01"))).toEqual(["later", "early"]);
  });

  it("sorts by next deadline, with no upcoming deadline last", () => {
    const soon = trip({ id: "soon", startDate: "2027-05-01", deadlines: [deadline("preliminary", "2026-11-15")] });
    const later = trip({ id: "later", startDate: "2027-01-01", deadlines: [deadline("application", "2026-12-01")] });
    const passed = trip({ id: "passed", startDate: "2026-12-20", deadlines: [deadline("preliminary", "2026-11-01")] });
    const none = trip({ id: "none", startDate: "2026-12-10" });
    expect(ids(sortTrips([none, passed, later, soon], "deadline", TODAY))).toEqual(["soon", "later", "none", "passed"]);
  });

  it("sorts by trip length, shortest first, counting both end days", () => {
    const week = trip({ id: "week", startDate: "2027-03-06", endDate: "2027-03-12" });
    const weekend = trip({ id: "weekend", startDate: "2027-05-01", endDate: "2027-05-02" });
    const fortnight = trip({ id: "fortnight", startDate: "2026-12-27", endDate: "2027-01-09" });
    const sameLength = trip({ id: "same", startDate: "2027-01-06", endDate: "2027-01-12" });
    expect(ids(sortTrips([week, fortnight, weekend, sameLength], "length", TODAY))).toEqual(["weekend", "same", "week", "fortnight"]);
  });

  it("breaks ties by start date, and leaves the input alone", () => {
    const a = trip({ id: "a", startDate: "2027-03-06", priceStages: [price(1000)] });
    const b = trip({ id: "b", startDate: "2027-01-06", priceStages: [price(1000)] });
    const input = [a, b];
    expect(ids(sortTrips(input, "cost_low", TODAY))).toEqual(["b", "a"]);
    expect(ids(input)).toEqual(["a", "b"]);
  });

  it("combines with filters", () => {
    const sorted = sortTrips(filterTrips(SAMPLE_TRIPS, { creditOnly: true }), "cost_high", TODAY);
    expect(sorted.map((t) => t.tripType).every((type) => type === "GIP" || type === "GMC")).toBe(true);
    expect(ids(sorted)).toEqual(["sample-brazil-gip", "sample-india-gip", "sample-europe-gmc"]);
  });
});
