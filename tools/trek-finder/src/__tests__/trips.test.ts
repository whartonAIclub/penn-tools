import { describe, it, expect } from "vitest";
import { filterTrips, formatDateRange, listPeriods, type Trip } from "../trips.js";
import { SAMPLE_TRIPS } from "../samples.js";

function trip(overrides: Partial<Trip>): Trip {
  return {
    id: "t",
    name: "Trip",
    type: "Club trek",
    destination: "Somewhere",
    region: "Europe",
    startDate: "2027-03-06",
    endDate: "2027-03-14",
    period: "Spring Break 2027",
    organizer: "Club",
    costUsd: null,
    credit: false,
    description: "",
    applicationDeadline: null,
    link: null,
    ...overrides,
  };
}

describe("filterTrips", () => {
  const trips = [
    trip({ id: "japan", name: "Japan Trek", region: "Asia", startDate: "2027-03-06" }),
    trip({ id: "nyc", name: "NYC Finance Trek", type: "Career trek", region: "North America", startDate: "2026-11-30", period: "Fall 2026" }),
    trip({ id: "iceland", name: "Iceland", destination: "Reykjavík", startDate: "2027-01-06", period: "Winter Break" }),
  ];
  const ids = (result: Trip[]) => result.map((t) => t.id);

  it("returns every trip, soonest first, with no filters", () => {
    expect(ids(filterTrips(trips))).toEqual(["nyc", "iceland", "japan"]);
  });

  it("filters by type, region and period", () => {
    expect(ids(filterTrips(trips, { type: "Career trek" }))).toEqual(["nyc"]);
    expect(ids(filterTrips(trips, { region: "Asia" }))).toEqual(["japan"]);
    expect(ids(filterTrips(trips, { period: "Winter Break" }))).toEqual(["iceland"]);
    expect(ids(filterTrips(trips, { region: "Europe", period: "Spring Break 2027" }))).toEqual([]);
  });

  it("searches text fields, ignoring case and surrounding spaces", () => {
    expect(ids(filterTrips(trips, { query: "  REYKJ " }))).toEqual(["iceland"]);
    expect(ids(filterTrips(trips, { query: "trek" }))).toEqual(["nyc", "japan"]);
  });

  it("treats null filters as unset", () => {
    expect(filterTrips(trips, { type: null, region: null, period: null })).toHaveLength(3);
  });
});

describe("listPeriods", () => {
  it("lists each period once, in date order", () => {
    expect(listPeriods(SAMPLE_TRIPS)).toEqual(["Fall 2026", "Winter Break 2026–27", "Spring Break 2027", "Summer 2027"]);
  });
});

describe("formatDateRange", () => {
  it("shortens ranges in the same month or year", () => {
    expect(formatDateRange("2027-03-06", "2027-03-14")).toBe("Mar 6 – 14, 2027");
    expect(formatDateRange("2027-05-28", "2027-06-02")).toBe("May 28 – Jun 2, 2027");
    expect(formatDateRange("2026-12-27", "2027-01-04")).toBe("Dec 27, 2026 – Jan 4, 2027");
    expect(formatDateRange("2027-03-06", "2027-03-06")).toBe("Mar 6, 2027");
  });
});

describe("SAMPLE_TRIPS", () => {
  it("has unique ids and end dates on or after start dates", () => {
    expect(new Set(SAMPLE_TRIPS.map((t) => t.id)).size).toBe(SAMPLE_TRIPS.length);
    for (const t of SAMPLE_TRIPS) expect(t.endDate >= t.startDate).toBe(true);
  });
});
