// What a trip is, and the catalog's search and filters. The page passes the
// trips in, so this works the same for sample data now and the tool's own
// database later.

export const TRIP_TYPES = [
  "Club trek",
  "Global Immersion (GIP)",
  "Global Modular Course (GMC)",
  "Career trek",
  "Other",
] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const REGIONS = [
  "Africa",
  "Asia",
  "Europe",
  "Latin America",
  "Middle East",
  "North America",
  "Oceania",
] as const;
export type Region = (typeof REGIONS)[number];

export interface Trip {
  id: string;
  name: string;
  type: TripType;
  /** Where it goes, e.g. "Japan" or "Italy & France". */
  country: string;
  /** The places it visits, e.g. ["Tokyo", "Kyoto"]. */
  cities: string[];
  region: Region;
  /** ISO dates (YYYY-MM-DD), first and last day of the trip. */
  startDate: string;
  endDate: string;
  /** The break or term it falls in, e.g. "Spring Break 2027". */
  period: string;
  /** The club or academic department running it. */
  organizer: string;
  /** Approximate cost per person in USD, or null if not announced. */
  costUsd: number | null;
  /** Whether it earns course credit. */
  credit: boolean;
  description: string;
  /** ISO date, or null if there's no deadline. */
  applicationDeadline: string | null;
  /** Sign-up or info page, or null. */
  link: string | null;
  /** The card's image, or null to show a blank placeholder. */
  photo: TripPhoto | null;
}

/** A trip's image and the credit its license asks for. */
export interface TripPhoto {
  url: string;
  author: string;
  license: string;
  /** Null for licenses with no page to link to. */
  licenseUrl: string | null;
  /** The page the photo came from. */
  source: string;
}

export interface TripFilters {
  /** Matches name, country, cities, organizer and description, ignoring case. */
  query?: string;
  type?: TripType | null;
  region?: Region | null;
  period?: string | null;
}

/** The trips matching every filter given, soonest first. */
export function filterTrips(trips: readonly Trip[], filters: TripFilters = {}): Trip[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return trips
    .filter((trip) => !filters.type || trip.type === filters.type)
    .filter((trip) => !filters.region || trip.region === filters.region)
    .filter((trip) => !filters.period || trip.period === filters.period)
    .filter(
      (trip) =>
        !query ||
        [trip.name, trip.country, ...trip.cities, trip.organizer, trip.description].some((field) =>
          field.toLowerCase().includes(query),
        ),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Each period the trips fall in, once, in date order. */
export function listPeriods(trips: readonly Trip[]): string[] {
  const periods: string[] = [];
  for (const trip of [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (!periods.includes(trip.period)) periods.push(trip.period);
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
