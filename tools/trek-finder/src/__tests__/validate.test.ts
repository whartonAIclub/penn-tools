import { describe, it, expect } from "vitest";
import { validateTrip, type TripDraft } from "../validate.js";
import { REGIONS, TIMINGS, TRIP_TYPES } from "../trips.js";
import { SAMPLE_TRIPS } from "../samples.js";

const price = { position: 1, label: "Early bird", amountUsd: 4500, certainty: "confirmed", validFrom: null, validUntil: null, note: null };
const deadline = { position: 1, kind: "application", label: "Apply by", dueDate: "2027-01-15", dueTime: null };
const link = { position: 1, label: "Info", url: "https://example.edu/info" };

function draft(changes: Partial<TripDraft> = {}): TripDraft {
  return {
    id: "testland-trek-2027",
    name: "Testland Trek",
    tripType: TRIP_TYPES[0],
    location: "Testland",
    cities: ["Testville"],
    region: REGIONS[0],
    startDate: "2027-03-06",
    endDate: "2027-03-14",
    timing: TIMINGS[0],
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
    organizerName: "Test Club",
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
    ...changes,
  };
}

function problemsOf(changes: Partial<TripDraft>): string[] {
  const result = validateTrip(draft(changes));
  return result.ok ? [] : result.problems;
}

describe("validateTrip", () => {
  it("accepts a minimal trip and hands it back", () => {
    const input = draft();
    expect(validateTrip(input)).toEqual({ ok: true, trip: input });
  });

  it("accepts a trip with every optional field filled in", () => {
    const result = validateTrip(
      draft({
        destinationBlurb: "x".repeat(300),
        availabilityStatus: "limited",
        spotsTotal: 40,
        spotsRemaining: 40,
        organizerEmail: "treks@example.edu",
        applicationUrl: "https://example.edu/apply",
        destinationAirport: "NRT",
        imageUrl: "http://example.edu/photo.jpg",
        priceStages: [
          { ...price, validUntil: "2026-12-15" },
          { ...price, position: 2, amountUsd: null, certainty: "estimate", validFrom: "2026-12-16" },
        ],
        deadlines: [
          { ...deadline, kind: "preliminary", dueTime: "17:00" },
          { ...deadline, position: 2, kind: "deposit" },
        ],
        links: [link],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts every sample trip", () => {
    for (const trip of SAMPLE_TRIPS) expect(validateTrip(trip)).toEqual({ ok: true, trip });
  });

  it("accepts every allowed trip type, region and timing", () => {
    for (const tripType of TRIP_TYPES) expect(problemsOf({ tripType })).toEqual([]);
    for (const region of REGIONS) expect(problemsOf({ region })).toEqual([]);
    for (const timing of TIMINGS) expect(problemsOf({ timing })).toEqual([]);
  });

  it.each<[string, Partial<TripDraft>, string]>([
    ["an ID with capitals", { id: "Japan-2027" }, "ID must be"],
    ["an ID with spaces", { id: "japan trek" }, "ID must be"],
    ["a blank name", { name: "  " }, "Name is required"],
    ["an unknown trip type", { tripType: "Cruise" }, "Trip type"],
    ["a blank location", { location: "" }, "Location is required"],
    ["a blank city", { cities: ["Tokyo", " "] }, "Cities has a blank"],
    ["an old region", { region: "Latin America" }, "Region"],
    ["an unknown timing", { timing: "summer" }, "Timing"],
    ["a blank organizer", { organizerName: "" }, "Organizer name is required"],
    ["a date in the wrong format", { startDate: "3/6/2027" }, "Start date must be"],
    ["a date that doesn't exist", { endDate: "2027-02-30" }, "End date must be"],
    ["a trip that ends before it starts", { endDate: "2027-03-05" }, "End date is before"],
    ["a blurb over the limit", { destinationBlurb: "x".repeat(301) }, "Destination blurb"],
    ["an unknown availability", { availabilityStatus: "maybe" }, "Availability"],
    ["negative spots", { spotsTotal: -1 }, "Spots total"],
    ["fractional spots", { spotsRemaining: 1.5 }, "Spots remaining must"],
    ["more spots left than exist", { spotsTotal: 5, spotsRemaining: 6 }, "Spots remaining is more"],
    ["a bad email", { organizerEmail: "not-an-email" }, "Organizer email"],
    ["an application link with no scheme", { applicationUrl: "example.edu/apply" }, "Application URL"],
    ["a script link", { applicationUrl: "javascript:alert(1)" }, "Application URL"],
    ["a data image", { imageUrl: "data:text/html,hi" }, "Image URL"],
    ["a bad airport code", { destinationAirport: "nrt" }, "Destination airport"],
    ["a price with no label", { priceStages: [{ ...price, label: "" }] }, "Price 1 needs a label"],
    ["a price with cents", { priceStages: [{ ...price, amountUsd: 99.5 }] }, "Price 1 amount"],
    ["a price too big to store", { priceStages: [{ ...price, amountUsd: 3_000_000_000 }] }, "Price 1 amount"],
    ["an unknown certainty", { priceStages: [{ ...price, certainty: "sure" }] }, "Price 1 certainty"],
    ["a bad price date", { priceStages: [{ ...price, validFrom: "soon" }] }, "Price 1 from date must"],
    ["price dates the wrong way round", { priceStages: [{ ...price, validFrom: "2027-02-01", validUntil: "2027-01-01" }] }, "from date is after"],
    ["repeated price positions", { priceStages: [price, price] }, "Two entries share Price 1"],
    ["an unknown deadline kind", { deadlines: [{ ...deadline, kind: "someday" }] }, "Deadline 1 kind"],
    ["a deadline with no label", { deadlines: [{ ...deadline, label: "" }] }, "Deadline 1 needs a label"],
    ["a bad deadline date", { deadlines: [{ ...deadline, dueDate: "Jan 15" }] }, "Deadline 1 date"],
    ["a 12-hour deadline time", { deadlines: [{ ...deadline, dueTime: "5pm" }] }, "Deadline 1 time"],
    ["an impossible deadline time", { deadlines: [{ ...deadline, dueTime: "24:00" }] }, "Deadline 1 time"],
    ["a link with no label", { links: [{ ...link, label: "" }] }, "Link 1 needs a label"],
    ["a script link in the list", { links: [{ ...link, url: "javascript:alert(1)" }] }, "Link 1 must be"],
    ["an invalid position", { links: [{ ...link, position: 0 }] }, "invalid position"],
  ])("rejects %s", (_name, changes, expected) => {
    expect(problemsOf(changes).join(" ")).toContain(expected);
  });

  it("allows only one preliminary deadline, which the database also requires", () => {
    const preliminary = { ...deadline, kind: "preliminary" };
    expect(problemsOf({ deadlines: [preliminary, { ...preliminary, position: 2 }] })).toContain("A trip can have only one preliminary deadline.");
  });

  it("reports every problem at once", () => {
    expect(problemsOf({ name: "", region: "Atlantis", startDate: "soon" })).toHaveLength(3);
  });

  it("never repeats what was entered, because problems are shown on the status page", () => {
    const secret = "SECRET-CELL-VALUE";
    const problems = problemsOf({
      id: secret,
      tripType: secret,
      region: secret,
      timing: secret,
      startDate: secret,
      endDate: secret,
      availabilityStatus: secret,
      organizerEmail: secret,
      applicationUrl: secret,
      imageUrl: secret,
      destinationAirport: secret,
      priceStages: [{ ...price, certainty: secret, validFrom: secret, validUntil: secret }],
      deadlines: [{ ...deadline, kind: secret, dueDate: secret, dueTime: secret }],
      links: [{ ...link, url: secret }],
    });
    expect(problems.length).toBeGreaterThan(10);
    expect(problems.join(" ")).not.toContain(secret);
  });
});
