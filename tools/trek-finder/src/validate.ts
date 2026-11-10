// The one set of rules a trip must pass before it's stored, used by the Sheet
// import now and an admin form later. Anything that passes can be written to
// the database without an error, so one bad trip can't stop an import.
//
// Problems appear on the import status page, so they say what's wrong but
// never repeat what was entered.

import { REGIONS, TIMINGS, TRIP_TYPES } from "./trips.js";
import type { AvailabilityStatus, Deadline, DeadlineKind, PriceStage, Trip } from "./trips.js";

export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = ["open", "limited", "waitlist", "full"];
export const CERTAINTIES: readonly PriceStage["certainty"][] = ["estimate", "confirmed"];
export const DEADLINE_KINDS: readonly DeadlineKind[] = ["preliminary", "application", "deposit", "payment", "other"];

const MAX_BLURB_LENGTH = 300;
/** The largest value a Postgres INT column holds. */
const MAX_INT = 2_147_483_647;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AIRPORT_RE = /^[A-Z]{3}$/;

export type PriceStageDraft = Omit<PriceStage, "certainty"> & { certainty: string };
export type DeadlineDraft = Omit<Deadline, "kind"> & { kind: string };

/** A trip whose values haven't been checked yet, so its fixed lists are plain text. */
export type TripDraft = Omit<Trip, "tripType" | "region" | "timing" | "availabilityStatus" | "priceStages" | "deadlines"> & {
  tripType: string;
  region: string;
  timing: string;
  availabilityStatus: string | null;
  priceStages: PriceStageDraft[];
  deadlines: DeadlineDraft[];
};

export type TripValidation = { ok: true; trip: Trip } | { ok: false; problems: string[] };

const isFilled = (value: string) => value.trim() !== "";
const isOneOf = (list: readonly string[], value: string) => list.includes(value);
const isCount = (value: number) => Number.isInteger(value) && value >= 0 && value <= MAX_INT;

function isDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  // Round-tripping catches dates that don't exist, such as February 30.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** http(s) only: these become links on the page, where other schemes can run code. */
function isWebUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Checks that positions are positive whole numbers with no repeats. */
function checkPositions(what: string, items: readonly { position: number }[], problems: string[]): void {
  const seen = new Set<number>();
  for (const { position } of items) {
    if (!isCount(position) || position === 0) problems.push(`${what} has an invalid position.`);
    else if (seen.has(position)) problems.push(`Two entries share ${what} ${position}.`);
    seen.add(position);
  }
}

function checkPriceStage(stage: PriceStageDraft, problems: string[]): void {
  const name = `Price ${stage.position}`;
  if (!isFilled(stage.label)) problems.push(`${name} needs a label.`);
  if (stage.amountUsd !== null && !isCount(stage.amountUsd)) problems.push(`${name} amount must be a whole number of dollars.`);
  if (!isOneOf(CERTAINTIES, stage.certainty)) problems.push(`${name} certainty must be estimate or confirmed.`);

  const fromOk = stage.validFrom === null || isDate(stage.validFrom);
  const untilOk = stage.validUntil === null || isDate(stage.validUntil);
  if (!fromOk) problems.push(`${name} from date must be a real date written YYYY-MM-DD.`);
  if (!untilOk) problems.push(`${name} until date must be a real date written YYYY-MM-DD.`);
  if (fromOk && untilOk && stage.validFrom !== null && stage.validUntil !== null && stage.validFrom > stage.validUntil) {
    problems.push(`${name} from date is after its until date.`);
  }
}

function checkDeadline(deadline: DeadlineDraft, problems: string[]): void {
  const name = `Deadline ${deadline.position}`;
  if (!isOneOf(DEADLINE_KINDS, deadline.kind)) problems.push(`${name} kind isn't one of the allowed kinds.`);
  if (!isFilled(deadline.label)) problems.push(`${name} needs a label.`);
  if (!isDate(deadline.dueDate)) problems.push(`${name} date must be a real date written YYYY-MM-DD.`);
  if (deadline.dueTime !== null && !TIME_RE.test(deadline.dueTime)) problems.push(`${name} time must use the 24-hour clock, like 17:00.`);
}

function checkTrip(draft: TripDraft): string[] {
  const problems: string[] = [];

  if (!SLUG_RE.test(draft.id)) problems.push("ID must be lowercase words joined by hyphens.");
  if (!isFilled(draft.name)) problems.push("Name is required.");
  if (!isOneOf(TRIP_TYPES, draft.tripType)) problems.push("Trip type isn't one of the allowed types.");
  if (!isFilled(draft.location)) problems.push("Location is required.");
  if (draft.cities.some((city) => !isFilled(city))) problems.push("Cities has a blank entry.");
  if (!isOneOf(REGIONS, draft.region)) problems.push("Region isn't one of the allowed regions.");
  if (!isOneOf(TIMINGS, draft.timing)) problems.push("Timing must be break, opportunity_week or other.");
  if (!isFilled(draft.organizerName)) problems.push("Organizer name is required.");

  const startOk = isDate(draft.startDate);
  const endOk = isDate(draft.endDate);
  if (!startOk) problems.push("Start date must be a real date written YYYY-MM-DD.");
  if (!endOk) problems.push("End date must be a real date written YYYY-MM-DD.");
  if (startOk && endOk && draft.endDate < draft.startDate) problems.push("End date is before the start date.");

  if (draft.destinationBlurb !== null && draft.destinationBlurb.length > MAX_BLURB_LENGTH) {
    problems.push(`Destination blurb is longer than ${MAX_BLURB_LENGTH} characters.`);
  }
  if (draft.availabilityStatus !== null && !isOneOf(AVAILABILITY_STATUSES, draft.availabilityStatus)) {
    problems.push("Availability must be open, limited, waitlist or full.");
  }

  if (draft.spotsTotal !== null && !isCount(draft.spotsTotal)) problems.push("Spots total must be a whole number.");
  if (draft.spotsRemaining !== null && !isCount(draft.spotsRemaining)) problems.push("Spots remaining must be a whole number.");
  if (draft.spotsTotal !== null && draft.spotsRemaining !== null && draft.spotsRemaining > draft.spotsTotal) {
    problems.push("Spots remaining is more than spots total.");
  }

  if (draft.organizerEmail !== null && !EMAIL_RE.test(draft.organizerEmail)) problems.push("Organizer email isn't a valid email address.");
  if (draft.applicationUrl !== null && !isWebUrl(draft.applicationUrl)) problems.push("Application URL must be a full link starting with https://.");
  if (draft.imageUrl !== null && !isWebUrl(draft.imageUrl)) problems.push("Image URL must be a full link starting with https://.");
  if (draft.destinationAirport !== null && !AIRPORT_RE.test(draft.destinationAirport)) problems.push("Destination airport must be a three-letter code, like NRT.");

  checkPositions("Price", draft.priceStages, problems);
  for (const stage of draft.priceStages) checkPriceStage(stage, problems);

  checkPositions("Deadline", draft.deadlines, problems);
  for (const deadline of draft.deadlines) checkDeadline(deadline, problems);
  if (draft.deadlines.filter((deadline) => deadline.kind === "preliminary").length > 1) {
    problems.push("A trip can have only one preliminary deadline.");
  }

  checkPositions("Link", draft.links, problems);
  for (const link of draft.links) {
    if (!isFilled(link.label)) problems.push(`Link ${link.position} needs a label.`);
    if (!isWebUrl(link.url)) problems.push(`Link ${link.position} must be a full link starting with https://.`);
  }

  return problems;
}

/** The checked trip, or every problem found so they can all be fixed at once. */
export function validateTrip(draft: TripDraft): TripValidation {
  const problems = checkTrip(draft);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, trip: draft as Trip };
}
