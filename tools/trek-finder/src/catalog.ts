// The catalog's search, filters and sorts. They run in the browser on every
// trip the page loaded, and filters and sorts can be combined freely. Anything
// that depends on the date takes today (YYYY-MM-DD) as a parameter.

import { currentPriceStage, tripStatus } from "./derive.js";
import { REGIONS, TRIP_TYPES, tripDays, type Deadline, type Region, type Trip, type TripType } from "./trips.js";

export interface TripFilters {
  /** Matches name, location, cities, organizer and description, ignoring case. */
  query?: string;
  type?: TripType | null;
  region?: Region | null;
  /** A season from tripSeason, e.g. "Spring 2027". */
  season?: string | null;
  /** Only trips that earn course credit. */
  creditOnly?: boolean;
}

export const TRIP_SORTS = ["start_date", "price_low", "price_high", "length"] as const;
export type TripSort = (typeof TRIP_SORTS)[number];

/**
 * The season a trip starts in: Fall (Sep–Nov), Winter (Dec–Feb, named for
 * both years), Spring (Mar–Apr) or Summer (May–Aug). "Winter 2026-2027"
 * covers Dec 2026 to Feb 2027.
 */
export function tripSeason(startDate: string): string {
  const [year = 0, month = 1] = startDate.split("-").map(Number);
  if (month >= 9 && month <= 11) return `Fall ${year}`;
  if (month === 12) return `Winter ${year}-${year + 1}`;
  if (month <= 2) return `Winter ${year - 1}-${year}`;
  if (month <= 4) return `Spring ${year}`;
  return `Summer ${year}`;
}

/** Each season the trips start in, once, in date order. */
export function listSeasons(trips: readonly Trip[]): string[] {
  const seasons: string[] = [];
  for (const trip of [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const season = tripSeason(trip.startDate);
    if (!seasons.includes(season)) seasons.push(season);
  }
  return seasons;
}

/**
 * The trips the catalog shows: still listed in the Sheet and not yet started.
 * Filters, sorts and the period list all work on these.
 */
export function visibleTrips(trips: readonly Trip[], today: string): Trip[] {
  return trips.filter((trip) => trip.listed && tripStatus(trip, today) !== "past");
}

/**
 * Why a saved trip is no longer in the catalog: "delisted" when it left the
 * Sheet, otherwise "started" once it's begun. Null while the catalog shows it.
 */
export function savedTripNote(trip: Trip, today: string): "delisted" | "started" | null {
  if (!trip.listed) return "delisted";
  if (tripStatus(trip, today) === "past") return "started";
  return null;
}

/** Trips grouped by the season they start in, with seasons and the trips in each in date order. */
export function groupBySeason(trips: readonly Trip[]): { season: string; trips: Trip[] }[] {
  const groups: { season: string; trips: Trip[] }[] = [];
  for (const trip of [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))) {
    const season = tripSeason(trip.startDate);
    const group = groups.find((g) => g.season === season);
    if (group) group.trips.push(trip);
    else groups.push({ season, trips: [trip] });
  }
  return groups;
}

/** The trips matching every filter given, in their original order. */
export function filterTrips(trips: readonly Trip[], filters: TripFilters = {}): Trip[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return trips.filter(
    (trip) =>
      (!filters.type || trip.tripType === filters.type) &&
      (!filters.region || trip.region === filters.region) &&
      (!filters.season || tripSeason(trip.startDate) === filters.season) &&
      (!filters.creditOnly || trip.academicCredit) &&
      (!query ||
        [trip.name, trip.location, ...trip.cities, trip.organizerName, trip.description ?? ""].some((field) =>
          field.toLowerCase().includes(query),
        )),
  );
}

/**
 * The next sign-up deadline still to come: the preliminary deadline if it
 * hasn't passed, otherwise the soonest application deadline from today on.
 * Null when neither is coming up. Deposit and payment deadlines don't count.
 */
export function nextDeadline(trip: Trip, today: string): Deadline | null {
  const preliminary = trip.deadlines.find((d) => d.kind === "preliminary");
  if (preliminary && preliminary.dueDate >= today) return preliminary;
  const upcoming = trip.deadlines
    .filter((d) => d.kind === "application" && d.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return upcoming[0] ?? null;
}

/** Compares two possibly missing values, putting missing ones last. */
function missingLast<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number): number {
  if (a === null || b === null) return a === null ? (b === null ? 0 : 1) : -1;
  return compare(a, b);
}

/**
 * The trips in a new array, sorted. Trips without a price go last, and length
 * is shortest first. Ties go to the earlier start date.
 */
export function sortTrips(trips: readonly Trip[], sort: TripSort, today: string): Trip[] {
  const cost = (trip: Trip) => currentPriceStage(trip.priceStages, today)?.amountUsd ?? null;
  const byNumber = (a: number, b: number) => a - b;
  const primary: (a: Trip, b: Trip) => number = {
    start_date: () => 0,
    price_low: (a: Trip, b: Trip) => missingLast(cost(a), cost(b), byNumber),
    price_high: (a: Trip, b: Trip) => missingLast(cost(a), cost(b), (x, y) => y - x),
    length: (a: Trip, b: Trip) => tripDays(a.startDate, a.endDate) - tripDays(b.startDate, b.endDate),
  }[sort];
  return [...trips].sort((a, b) => primary(a, b) || a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
}

/** Everything the catalog's controls set. It lives in the page address, so a reload or a shared link keeps it. */
export interface CatalogState {
  query: string;
  type: TripType | null;
  region: Region | null;
  /** A season from tripSeason, e.g. "Spring 2027". */
  season: string | null;
  creditOnly: boolean;
  sort: TripSort;
}

export const DEFAULT_CATALOG_STATE: CatalogState = {
  query: "",
  type: null,
  region: null,
  season: null,
  creditOnly: false,
  sort: "start_date",
};

const SEASON = /^(?:(?:Fall|Spring|Summer) \d{4}|Winter \d{4}-\d{4})$/;

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return values.find((v) => v === value) ?? null;
}

/** Reads the controls from the page address. Unknown or misspelled values count as unset. */
export function parseCatalogQuery(params: URLSearchParams): CatalogState {
  const season = params.get("period");
  return {
    query: params.get("q") ?? "",
    type: oneOf(TRIP_TYPES, params.get("type")),
    region: oneOf(REGIONS, params.get("region")),
    season: season !== null && SEASON.test(season) ? season : null,
    creditOnly: params.get("credit") === "1",
    sort: oneOf(TRIP_SORTS, params.get("sort")) ?? DEFAULT_CATALOG_STATE.sort,
  };
}

/** The page address query for the controls, without the "?". Defaults are left out, so it's "" when nothing is set. */
export function catalogQueryString(state: CatalogState): string {
  const params = new URLSearchParams();
  if (state.query !== "") params.set("q", state.query);
  if (state.type) params.set("type", state.type);
  if (state.region) params.set("region", state.region);
  if (state.season) params.set("period", state.season);
  if (state.creditOnly) params.set("credit", "1");
  if (state.sort !== DEFAULT_CATALOG_STATE.sort) params.set("sort", state.sort);
  return params.toString();
}
