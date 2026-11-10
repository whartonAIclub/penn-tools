"use client";

// The trip catalog: search and filters on top, then a card per trip. Filtering
// and sorting are done here in the browser with filterTrips and sortTrips from
// the tool package.

import { useMemo, useState } from "react";
import {
  REGIONS,
  TRIP_TYPES,
  filterTrips,
  formatDateRange,
  listSeasons,
  nextDeadline,
  sortTrips,
  tripDays,
  visibleTrips,
  type Region,
  type Trip,
  type TripType,
} from "@penntools/tool-trek-finder";
import { PriceLine } from "./PriceInfo";
import { TripDetails, formatDeadline } from "./TripDetails";
import styles from "./TripCatalog.module.css";


// today comes from the server (todayInNewYork), so the server and browser agree on the date.
export function TripCatalog({ trips, today, sample = false }: { trips: Trip[]; today: string; sample?: boolean }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TripType | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [period, setPeriod] = useState("");

  // Trips that have started or left the Sheet aren't shown, counted or listed in the periods.
  const visible = useMemo(() => visibleTrips(trips, today), [trips, today]);
  const periods = useMemo(() => listSeasons(visible), [visible]);
  const shown = useMemo(
    () =>
      sortTrips(
        filterTrips(visible, { query, type: type || null, region: region || null, season: period || null }),
        "start_date",
        today,
      ),
    [visible, today, query, type, region, period],
  );
  const filtered = query !== "" || type !== "" || region !== "" || period !== "";

  function clear() {
    setQuery("");
    setType("");
    setRegion("");
    setPeriod("");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Trek Finder</h1>
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as TripType | "")}>
          <option value="">All types</option>
          {TRIP_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value as Region | "")}>
          <option value="">All regions</option>
          {REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">All periods</option>
          {periods.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
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
            <TripCard key={trip.id} trip={trip} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TripCard({ trip, today }: { trip: Trip; today: string }) {
  const [open, setOpen] = useState(false);
  const days = tripDays(trip.startDate, trip.endDate);
  const upcoming = nextDeadline(trip, today);

  return (
    <li className={styles.card}>
      <div className={styles.photo}>
        {trip.imageUrl && <img src={trip.imageUrl} alt="" loading="lazy" />}
        {trip.academicCredit && <span className={styles.credit}>Course credit</span>}
      </div>

      <div className={styles.body}>
        <h2 className={styles.cardTitle}>{trip.name}</h2>
        <p className={styles.dates}>
          {formatDateRange(trip.startDate, trip.endDate)} ({days} {days === 1 ? "day" : "days"})
        </p>
        {trip.periodLabel && <p className={styles.period}>{trip.periodLabel}</p>}
        <PriceLine trip={trip} today={today} />
        {upcoming && (
          <p className={styles.deadline}>
            {upcoming.label}: {formatDeadline(upcoming)}
          </p>
        )}

        <button className={styles.toggle} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          More details
        </button>
      </div>

      {open && <TripDetails trip={trip} today={today} onClose={() => setOpen(false)} />}
    </li>
  );
}
