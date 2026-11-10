// Turns one row of the Trek Finder Sheet into a checked trip. Columns are found
// by their header, so their order in the Sheet doesn't matter. The numbered
// columns (Price 1-3, Deadline 1-4, Link 1-3) become the trip's lists, and a
// set left completely blank is skipped.
//
// Capital letters don't matter in any column with a fixed list of values: each
// one goes through listed(), which swaps in the list's own spelling.
//
// Problems appear on the public import status page, so like validateTrip they
// name the column but never repeat what was entered.

import {
  AVAILABILITY_STATUSES,
  CERTAINTIES,
  DEADLINE_KINDS,
  validateTrip,
  type DeadlineDraft,
  type PriceStageDraft,
  type TripDraft,
  type TripValidation,
} from "./validate.js";
import { REGIONS, TIMINGS, TRIP_TYPES, type TripLink } from "./trips.js";

export const PRICE_SLOTS = 3;
export const DEADLINE_SLOTS = 4;
export const LINK_SLOTS = 3;

const PRICE_FIELDS = ["label", "amount", "certainty", "from", "until", "note"] as const;
const DEADLINE_FIELDS = ["kind", "label", "date", "time"] as const;
const LINK_FIELDS = ["label", "url"] as const;

const numbered = (prefix: string, slots: number, fields: readonly string[]) =>
  Array.from({ length: slots }, (_, i) => fields.map((field) => `${prefix} ${i + 1} ${field}`)).flat();

/** Every header the Sheet must have, in the template's order. */
export const SHEET_COLUMNS: readonly string[] = [
  "ID",
  "Name",
  "Trip type",
  "Location",
  "Cities",
  "Region",
  "Start date",
  "End date",
  "Timing",
  "Period label",
  "Academic credit",
  "Credit note",
  "Description",
  "Price includes",
  "Destination blurb",
  "Itinerary",
  "Availability",
  "Organizer name",
  "Organizer contact",
  "Organizer email",
  "Application URL",
  "Image URL",
  "Image credit",
  ...numbered("Price", PRICE_SLOTS, PRICE_FIELDS),
  ...numbered("Deadline", DEADLINE_SLOTS, DEADLINE_FIELDS),
  ...numbered("Link", LINK_SLOTS, LINK_FIELDS),
  "Destination airport",
  "Spots total",
  "Spots remaining",
];

/** One Sheet row, as header → cell text. */
export type SheetRow = Readonly<Record<string, string | undefined>>;

/** The headers the Sheet is missing. Header names are safe to show; cells aren't. */
export function missingColumns(headers: readonly string[]): string[] {
  const present = new Set(headers.map((header) => header.trim()));
  return SHEET_COLUMNS.filter((column) => !present.has(column));
}

/** The cell, trimmed; "" when blank or missing. */
const cell = (row: SheetRow, column: string) => (row[column] ?? "").trim();

/** The cell, trimmed; null when blank. */
function optional(row: SheetRow, column: string): string | null {
  const value = cell(row, column);
  return value === "" ? null : value;
}

/**
 * The cell as the list spells it, ignoring capitals: "club/other trek" →
 * "Club/Other Trek". Unknown values come back as typed so validateTrip flags them.
 */
function listed(list: readonly string[], value: string): string {
  const lower = value.toLowerCase();
  return list.find((item) => item.toLowerCase() === lower) ?? value;
}

/** A whole number, null when blank, NaN when it isn't one so validateTrip flags it. */
function wholeNumber(row: SheetRow, column: string): number | null {
  const value = cell(row, column);
  if (value === "") return null;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

const anyFilled = (row: SheetRow, columns: readonly string[]) => columns.some((column) => cell(row, column) !== "");

function priceStages(row: SheetRow): PriceStageDraft[] {
  const stages: PriceStageDraft[] = [];
  for (let n = 1; n <= PRICE_SLOTS; n++) {
    const col = (field: string) => `Price ${n} ${field}`;
    if (!anyFilled(row, PRICE_FIELDS.map(col))) continue;
    stages.push({
      position: n,
      label: cell(row, col("label")),
      amountUsd: wholeNumber(row, col("amount")),
      certainty: listed(CERTAINTIES, cell(row, col("certainty")) || "estimate"),
      validFrom: optional(row, col("from")),
      validUntil: optional(row, col("until")),
      note: optional(row, col("note")),
    });
  }
  return stages;
}

function deadlines(row: SheetRow): DeadlineDraft[] {
  const list: DeadlineDraft[] = [];
  for (let n = 1; n <= DEADLINE_SLOTS; n++) {
    const col = (field: string) => `Deadline ${n} ${field}`;
    if (!anyFilled(row, DEADLINE_FIELDS.map(col))) continue;
    list.push({
      position: n,
      kind: listed(DEADLINE_KINDS, cell(row, col("kind"))),
      label: cell(row, col("label")),
      dueDate: cell(row, col("date")),
      dueTime: optional(row, col("time")),
    });
  }
  return list;
}

function links(row: SheetRow): TripLink[] {
  const list: TripLink[] = [];
  for (let n = 1; n <= LINK_SLOTS; n++) {
    const col = (field: string) => `Link ${n} ${field}`;
    if (!anyFilled(row, LINK_FIELDS.map(col))) continue;
    list.push({ position: n, label: cell(row, col("label")), url: cell(row, col("url")) });
  }
  return list;
}

/** Yes → true, No or blank → false, anything else → null (a problem). */
function yesNo(value: string): boolean | null {
  if (value === "") return false;
  const answer = listed(["Yes", "No"], value);
  return answer === "Yes" ? true : answer === "No" ? false : null;
}

/**
 * The row as a checked trip, or every problem with it. Rows that pass can be
 * written to the database as they are.
 */
export function parseTripRow(row: SheetRow): TripValidation {
  const problems: string[] = [];

  const credit = yesNo(cell(row, "Academic credit"));
  if (credit === null) problems.push("Academic credit must be Yes, No or blank.");

  const draft: TripDraft = {
    id: cell(row, "ID"),
    name: cell(row, "Name"),
    tripType: listed(TRIP_TYPES, cell(row, "Trip type")),
    location: cell(row, "Location"),
    cities: cell(row, "Cities")
      .split(";")
      .map((city) => city.trim())
      .filter((city) => city !== ""),
    region: listed(REGIONS, cell(row, "Region")),
    startDate: cell(row, "Start date"),
    endDate: cell(row, "End date"),
    timing: listed(TIMINGS, cell(row, "Timing")),
    periodLabel: optional(row, "Period label"),
    academicCredit: credit ?? false,
    creditNote: optional(row, "Credit note"),
    description: optional(row, "Description"),
    priceIncludes: optional(row, "Price includes"),
    destinationBlurb: optional(row, "Destination blurb"),
    itinerary: optional(row, "Itinerary"),
    availabilityStatus: cell(row, "Availability") === "" ? null : listed(AVAILABILITY_STATUSES, cell(row, "Availability")),
    spotsTotal: wholeNumber(row, "Spots total"),
    spotsRemaining: wholeNumber(row, "Spots remaining"),
    organizerName: cell(row, "Organizer name"),
    organizerContact: optional(row, "Organizer contact"),
    organizerEmail: optional(row, "Organizer email"),
    applicationUrl: optional(row, "Application URL"),
    destinationAirport: optional(row, "Destination airport"),
    imageUrl: optional(row, "Image URL"),
    imageCredit: optional(row, "Image credit"),
    listed: true,
    priceStages: priceStages(row),
    deadlines: deadlines(row),
    links: links(row),
  };

  const result = validateTrip(draft);
  if (problems.length === 0) return result;
  return { ok: false, problems: [...problems, ...(result.ok ? [] : result.problems)] };
}
