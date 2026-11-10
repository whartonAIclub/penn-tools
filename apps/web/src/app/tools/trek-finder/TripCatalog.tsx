"use client";

// The trip catalog: search, filters and sort on top, then a card per trip.
// Filtering and sorting are done here in the browser with filterTrips and
// sortTrips from the tool package. The controls live in the page address
// (e.g. ?region=Asia&sort=price_low), so a reload or a shared link keeps them.

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DEFAULT_CATALOG_STATE,
  REGIONS,
  TRIP_SORTS,
  TRIP_TYPES,
  catalogQueryString,
  filterTrips,
  listSeasons,
  parseCatalogQuery,
  sortTrips,
  visibleTrips,
  type CatalogState,
  type Region,
  type Trip,
  type TripSort,
  type TripType,
} from "@penntools/tool-trek-finder";
import { SaveMessage, useSavedTrips } from "./SaveButton";
import { TripCard } from "./TripCard";
import styles from "./TripCatalog.module.css";

const SORT_LABELS: Record<TripSort, string> = {
  start_date: "Start date",
  price_low: "Price: Low to high",
  price_high: "Price: High to low",
  length: "Trip length (shortest first)",
};

interface CatalogProps {
  trips: Trip[];
  /** From the server (todayInNewYork), so the server and browser agree on the date. */
  today: string;
  /** The signed-in user's saved trip ids; empty when signed out. */
  savedIds?: string[];
  /** Passed by page.tsx as agreed, but hearts don't need it: the save route answers 401 when signed out. */
  signedIn?: boolean;
  sample?: boolean;
}

// Reading the page address needs a Suspense boundary in Next.js.
export function TripCatalog(props: CatalogProps) {
  return (
    <Suspense fallback={null}>
      <Catalog {...props} />
    </Suspense>
  );
}

function Catalog({ trips, today, savedIds = [], sample = false }: CatalogProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseCatalogQuery(new URLSearchParams(searchParams.toString())), [searchParams]);
  const saves = useSavedTrips(savedIds);

  // replaceState updates the address without a server round trip or a back-button step per change.
  function update(change: Partial<CatalogState>) {
    const query = catalogQueryString({ ...state, ...change });
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  // Trips that have started or left the Sheet aren't shown, counted or listed in the periods.
  const visible = useMemo(() => visibleTrips(trips, today), [trips, today]);
  const periods = useMemo(() => listSeasons(visible), [visible]);
  const shown = useMemo(() => sortTrips(filterTrips(visible, state), state.sort, today), [visible, state, today]);
  const filtered =
    state.query !== "" || state.type !== null || state.region !== null || state.season !== null || state.creditOnly;

  // Clearing keeps the sort: it's how someone likes to browse, not a filter.
  function clear() {
    const { sort } = state;
    update({ ...DEFAULT_CATALOG_STATE, sort });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Trek Finder</h1>
          <Link className={styles.savedLink} href="/tools/trek-finder/saved-trips">
            ♥ My Saved Trips ({saves.count})
          </Link>
        </div>
        <p className={styles.intro}>Explore club treks, career treks and academic programs for Wharton MBA students.</p>
        {sample && (
          <p className={styles.sampleNote}>These are made-up sample trips while the catalog is being built.</p>
        )}
      </header>

      <div className={styles.filters}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search trips, places, clubs…"
          aria-label="Search trips"
          value={state.query}
          onChange={(e) => update({ query: e.target.value })}
        />
        <select aria-label="Type" value={state.type ?? ""} onChange={(e) => update({ type: (e.target.value || null) as TripType | null })}>
          <option value="">All types</option>
          {TRIP_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select aria-label="Region" value={state.region ?? ""} onChange={(e) => update({ region: (e.target.value || null) as Region | null })}>
          <option value="">All regions</option>
          {REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select aria-label="Period" value={state.season ?? ""} onChange={(e) => update({ season: e.target.value || null })}>
          <option value="">All periods</option>
          {periods.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={state.creditOnly} onChange={(e) => update({ creditOnly: e.target.checked })} />
          Course credit only
        </label>
        <label className={styles.sort}>
          Sort by
          <select value={state.sort} onChange={(e) => update({ sort: e.target.value as TripSort })}>
            {TRIP_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.count}>
        <span>
          {shown.length} {shown.length === 1 ? "trip" : "trips"}
        </span>
        {filtered && (
          <button className={styles.clear} onClick={clear}>
            Clear filters
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>No trips match those filters.</p>
      ) : (
        <ul className={styles.grid}>
          {shown.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              today={today}
              saved={saves.isSaved(trip.id)}
              onToggleSave={() => saves.toggle(trip.id)}
            />
          ))}
        </ul>
      )}

      <SaveMessage message={saves.message} />
    </div>
  );
}
