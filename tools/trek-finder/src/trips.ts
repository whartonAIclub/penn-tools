// What a trip is, and the catalog's search and filters. The page passes the
// trips in, so this works the same for sample data now and the tool's own
// database later. The shape matches the tables in schema.sql.

export const TRIP_TYPES = ["GIP", "GMC", "Leadership Venture", "Club/Other Trek"] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const REGIONS = [
  "Africa",
  "Asia",
  "Europe",
  "Middle East",
  "North America",
  "Oceania",
  "South America",
] as const;
export type Region = (typeof REGIONS)[number];

export const TIMINGS = ["break", "opportunity_week", "other"] as const;
export type Timing = (typeof TIMINGS)[number];

export type AvailabilityStatus = "open" | "limited" | "waitlist" | "full";
export type DeadlineKind = "preliminary" | "application" | "deposit" | "payment" | "other";

/**
 * One of a trip's prices. Stages with dates are tiers that change on those
 * dates; stages without dates are an estimate that firms up, the highest
 * position being the latest.
 */
export interface PriceStage {
  position: number;
  label: string;
  /** Null shows as "TBD". */
  amountUsd: number | null;
  certainty: "estimate" | "confirmed";
  /** ISO date; null means no start bound. */
  validFrom: string | null;
  /** ISO date; null means no end bound. */
  validUntil: string | null;
  note: string | null;
}

export interface Deadline {
  position: number;
  kind: DeadlineKind;
  label: string;
  /** ISO date. */
  dueDate: string;
  /** "HH:MM" in America/New_York; null means end of day. */
  dueTime: string | null;
}

export interface TripLink {
  position: number;
  label: string;
  url: string;
}

export interface Trip {
  /** Permanent slug, e.g. "japan-trek-2027". Saves point to it. */
  id: string;
  name: string;
  tripType: TripType;
  /** Where it goes, e.g. "Japan" or "Italy & France". */
  location: string;
  /** The places it visits, e.g. ["Tokyo", "Kyoto"]. */
  cities: string[];
  region: Region;
  /** ISO dates (YYYY-MM-DD), first and last day of the trip. */
  startDate: string;
  endDate: string;
  timing: Timing;
  /** The break or term it falls in, e.g. "Spring Break 2027". */
  periodLabel: string | null;
  academicCredit: boolean;
  /** e.g. "1.0 CU". */
  creditNote: string | null;
  description: string | null;
  /** What the price covers, shown by the price's info icon. */
  priceIncludes: string | null;
  /** The back of the card; null means the card doesn't flip. */
  destinationBlurb: string | null;
  itinerary: string | null;
  /** Null means unknown. */
  availabilityStatus: AvailabilityStatus | null;
  spotsTotal: number | null;
  spotsRemaining: number | null;
  /** The club or office running it. */
  organizerName: string;
  /** A person or role to contact. */
  organizerContact: string | null;
  organizerEmail: string | null;
  applicationUrl: string | null;
  /** IATA code, for a future flight link or prices. */
  destinationAirport: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  /** False once the trip leaves the Sheet. */
  listed: boolean;
  priceStages: PriceStage[];
  deadlines: Deadline[];
  links: TripLink[];
}

export interface TripFilters {
  /** Matches name, location, cities, organizer and description, ignoring case. */
  query?: string;
  type?: TripType | null;
  region?: Region | null;
  /** Matches periodLabel. */
  period?: string | null;
}

/** The trips matching every filter given, soonest first. */
export function filterTrips(trips: readonly Trip[], filters: TripFilters = {}): Trip[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return trips
    .filter((trip) => !filters.type || trip.tripType === filters.type)
    .filter((trip) => !filters.region || trip.region === filters.region)
    .filter((trip) => !filters.period || trip.periodLabel === filters.period)
    .filter(
      (trip) =>
        !query ||
        [trip.name, trip.location, ...trip.cities, trip.organizerName, trip.description ?? ""].some((field) =>
          field.toLowerCase().includes(query),
        ),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Each period the trips fall in, once, in date order. Trips without one are skipped. */
export function listPeriods(trips: readonly Trip[]): string[] {
  const periods: string[] = [];
  for (const trip of [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (trip.periodLabel !== null && !periods.includes(trip.periodLabel)) periods.push(trip.periodLabel);
  }
  return periods;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year: year ?? 0, month: MONTHS[(month ?? 1) - 1] ?? "", day: day ?? 0 };
}

/** "Mar 6, 2027". Read from the string, not a Date, so time zones can't shift the day. */
export function formatDate(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${month} ${day}, ${year}`;
}

/** "Mar 6 – 14, 2027", "Dec 28, 2026 – Jan 5, 2027", etc. */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = parts(startIso);
  const end = parts(endIso);
  if (start.year !== end.year) return `${formatDate(startIso)} – ${formatDate(endIso)}`;
  if (start.month !== end.month) return `${start.month} ${start.day} – ${end.month} ${end.day}, ${end.year}`;
  if (start.day !== end.day) return `${start.month} ${start.day} – ${end.day}, ${end.year}`;
  return formatDate(startIso);
}

function utcDay(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

/** How many days a trip runs, counting both the first and the last day. */
export function tripDays(startIso: string, endIso: string): number {
  return Math.round((utcDay(endIso) - utcDay(startIso)) / 86_400_000) + 1;
}
