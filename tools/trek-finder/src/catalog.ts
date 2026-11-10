// The catalog's search, filters and sorts. They run in the browser on every
// trip the page loaded, and filters and sorts can be combined freely. Anything
// that depends on the date takes today (YYYY-MM-DD) as a parameter.

import { currentPriceStage } from "./derive.js";
import { tripDays, type Deadline, type Region, type Trip, type TripType } from "./trips.js";

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

export const TRIP_SORTS = ["start_date", "cost_low", "cost_high", "deadline", "length"] as const;
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
 * The trips in a new array, sorted. Trips without a price or an upcoming
 * deadline go last; length is shortest first. Ties go to the earlier start date.
 */
export function sortTrips(trips: readonly Trip[], sort: TripSort, today: string): Trip[] {
  const cost = (trip: Trip) => currentPriceStage(trip.priceStages, today)?.amountUsd ?? null;
  const byNumber = (a: number, b: number) => a - b;
  const byText = (a: string, b: string) => a.localeCompare(b);
  const primary: (a: Trip, b: Trip) => number = {
    start_date: () => 0,
    cost_low: (a: Trip, b: Trip) => missingLast(cost(a), cost(b), byNumber),
    cost_high: (a: Trip, b: Trip) => missingLast(cost(a), cost(b), (x, y) => y - x),
    deadline: (a: Trip, b: Trip) =>
      missingLast(nextDeadline(a, today)?.dueDate ?? null, nextDeadline(b, today)?.dueDate ?? null, byText),
    length: (a: Trip, b: Trip) => tripDays(a.startDate, a.endDate) - tripDays(b.startDate, b.endDate),
  }[sort];
  return [...trips].sort((a, b) => primary(a, b) || a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
}
