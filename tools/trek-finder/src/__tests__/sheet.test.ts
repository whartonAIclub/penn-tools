import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { missingColumns, parseTripRow, SHEET_COLUMNS, type SheetRow } from "../sheet.js";
import { REGIONS, TIMINGS, TRIP_TYPES } from "../trips.js";

const minimal: Record<string, string> = {
  ID: "testland-trek-2027",
  Name: "Testland Trek",
  "Trip type": TRIP_TYPES[0],
  Location: "Testland",
  Region: REGIONS[0],
  "Start date": "2027-03-06",
  "End date": "2027-03-14",
  Timing: TIMINGS[0],
  "Organizer name": "Test Club",
};

const row = (changes: Record<string, string> = {}): SheetRow => ({ ...minimal, ...changes });

function trip(changes: Record<string, string> = {}) {
  const result = parseTripRow(row(changes));
  if (!result.ok) throw new Error(result.problems.join(" "));
  return result.trip;
}

function problemsOf(changes: Record<string, string>): string[] {
  const result = parseTripRow(row(changes));
  return result.ok ? [] : result.problems;
}

describe("SHEET_COLUMNS", () => {
  it("matches the template's header row exactly", () => {
    const template = readFileSync(new URL("../../sheet/trek-finder-template.csv", import.meta.url), "utf8");
    const headers = template.split(/\r?\n/)[0]!.split(",");
    expect(headers).toEqual(SHEET_COLUMNS);
    expect(SHEET_COLUMNS).toHaveLength(66);
  });
});

describe("missingColumns", () => {
  it("is empty when every header is there, in any order and with stray spaces", () => {
    expect(missingColumns([...SHEET_COLUMNS].reverse().map((h) => ` ${h} `))).toEqual([]);
  });

  it("lists renamed or missing headers", () => {
    const headers = SHEET_COLUMNS.filter((h) => h !== "Timing").map((h) => (h === "Name" ? "Trip name" : h));
    expect(missingColumns(headers)).toEqual(["Name", "Timing"]);
  });
});

describe("parseTripRow", () => {
  it("turns a minimal row into a trip, with blanks as empty values", () => {
    expect(trip()).toMatchObject({
      id: "testland-trek-2027",
      cities: [],
      periodLabel: null,
      academicCredit: false,
      description: null,
      availabilityStatus: null,
      spotsTotal: null,
      listed: true,
      priceStages: [],
      deadlines: [],
      links: [],
    });
  });

  it("trims every cell", () => {
    const t = trip({ Name: "  Testland Trek  ", Description: " Hiking. ", "Period label": "   " });
    expect(t.name).toBe("Testland Trek");
    expect(t.description).toBe("Hiking.");
    expect(t.periodLabel).toBeNull();
  });

  it("treats a missing column as blank", () => {
    const { Timing: _, ...withoutTiming } = minimal;
    const result = parseTripRow(withoutTiming);
    expect(result.ok ? [] : result.problems).toEqual(["Timing must be break, opportunity_week or other."]);
  });

  it("splits cities on semicolons and drops blank entries", () => {
    expect(trip({ Cities: "Tokyo; Kyoto ;;Osaka;" }).cities).toEqual(["Tokyo", "Kyoto", "Osaka"]);
  });

  it("reads academic credit as Yes or No in any case, blank as No", () => {
    expect(trip({ "Academic credit": "Yes" }).academicCredit).toBe(true);
    expect(trip({ "Academic credit": "yes" }).academicCredit).toBe(true);
    expect(trip({ "Academic credit": "NO" }).academicCredit).toBe(false);
    expect(problemsOf({ "Academic credit": "Maybe" })).toEqual(["Academic credit must be Yes, No or blank."]);
  });

  it("ignores capitals in every fixed-list column and stores the list's spelling", () => {
    const t = trip({
      "Trip type": TRIP_TYPES[3].toUpperCase(),
      Region: REGIONS[6].toLowerCase(),
      Timing: TIMINGS[1].toUpperCase(),
      Availability: "Waitlist",
      "Price 1 label": "Regular",
      "Price 1 certainty": "CONFIRMED",
      "Deadline 1 kind": "Preliminary",
      "Deadline 1 label": "Sign up",
      "Deadline 1 date": "2027-01-15",
    });
    expect(t).toMatchObject({
      tripType: TRIP_TYPES[3],
      region: REGIONS[6],
      timing: TIMINGS[1],
      availabilityStatus: "waitlist",
    });
    expect(t.priceStages[0]!.certainty).toBe("confirmed");
    expect(t.deadlines[0]!.kind).toBe("preliminary");
  });

  it("still rejects values that aren't on the list", () => {
    expect(problemsOf({ Timing: "Spring break" })).toEqual(["Timing must be break, opportunity_week or other."]);
    expect(problemsOf({ Availability: "almost full" })).toEqual(["Availability must be open, limited, waitlist or full."]);
  });

  it("reports parse and validation problems together", () => {
    expect(problemsOf({ "Academic credit": "Y", Name: "" })).toEqual([
      "Academic credit must be Yes, No or blank.",
      "Name is required.",
    ]);
  });

  it("reads whole numbers and rejects anything else", () => {
    expect(trip({ "Spots total": "40", "Spots remaining": "12" })).toMatchObject({ spotsTotal: 40, spotsRemaining: 12 });
    expect(problemsOf({ "Spots total": "forty" })).toEqual(["Spots total must be a whole number."]);
    expect(problemsOf({ "Spots total": "1.5" })).toEqual(["Spots total must be a whole number."]);
  });

  it("builds price stages, skipping blank sets and keeping their slot number", () => {
    const t = trip({
      "Price 1 label": "Early bird",
      "Price 1 amount": "4500",
      "Price 1 certainty": "confirmed",
      "Price 1 until": "2026-12-15",
      "Price 3 label": "Regular",
      "Price 3 note": "Flights extra",
    });
    expect(t.priceStages).toEqual([
      { position: 1, label: "Early bird", amountUsd: 4500, certainty: "confirmed", validFrom: null, validUntil: "2026-12-15", note: null },
      { position: 3, label: "Regular", amountUsd: null, certainty: "estimate", validFrom: null, validUntil: null, note: "Flights extra" },
    ]);
  });

  it("flags a price filled in without a label, and amounts with $ or commas", () => {
    expect(problemsOf({ "Price 1 amount": "4500" })).toEqual(["Price 1 needs a label."]);
    expect(problemsOf({ "Price 1 label": "Regular", "Price 1 amount": "$4,500" })).toEqual([
      "Price 1 amount must be a whole number of dollars.",
    ]);
  });

  it("builds deadlines, skipping blank sets", () => {
    const t = trip({
      "Deadline 2 kind": "deposit",
      "Deadline 2 label": "Deposit due",
      "Deadline 2 date": "2027-01-15",
      "Deadline 2 time": "17:00",
    });
    expect(t.deadlines).toEqual([{ position: 2, kind: "deposit", label: "Deposit due", dueDate: "2027-01-15", dueTime: "17:00" }]);
  });

  it("flags a deadline with only some of its required cells", () => {
    expect(problemsOf({ "Deadline 1 label": "Apply by" })).toEqual([
      "Deadline 1 kind isn't one of the allowed kinds.",
      "Deadline 1 date must be a real date written YYYY-MM-DD.",
    ]);
  });

  it("builds links, skipping blank sets", () => {
    const t = trip({ "Link 2 label": "Info session", "Link 2 url": "https://example.edu/info" });
    expect(t.links).toEqual([{ position: 2, label: "Info session", url: "https://example.edu/info" }]);
    expect(problemsOf({ "Link 1 url": "https://example.edu" })).toEqual(["Link 1 needs a label."]);
  });

  it("never repeats what was entered in its problems", () => {
    const secret = "SECRET-cell-text";
    const filled = Object.fromEntries(SHEET_COLUMNS.map((column) => [column, secret]));
    const problems = problemsOf(filled);
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(problem).not.toContain(secret);
  });
});
