"use client";

// The trip catalog: search and filters on top, then a card per trip. Filtering
// is done here in the browser with filterTrips from the tool package.

import { useMemo, useState } from "react";
import {
  REGIONS,
  TRIP_TYPES,
  filterTrips,
  formatDate,
  formatDateRange,
  listPeriods,
  tripDays,
  type Region,
  type Trip,
  type TripType,
} from "@penntools/tool-trek-finder";
import styles from "./TripCatalog.module.css";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function TripCatalog({ trips, sample = false }: { trips: Trip[]; sample?: boolean }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TripType | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [period, setPeriod] = useState("");

  const periods = useMemo(() => listPeriods(trips), [trips]);
  const shown = useMemo(
    () => filterTrips(trips, { query, type: type || null, region: region || null, period: period || null }),
    [trips, query, type, region, period],
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
            <TripCard key={trip.id} trip={trip} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const [open, setOpen] = useState(false);
  const detailsId = `trip-${trip.id}-details`;
  const days = tripDays(trip.startDate, trip.endDate);

  return (
    <li className={styles.card}>
      <div className={styles.photo}>
        {trip.photo && <img src={trip.photo.url} alt="" loading="lazy" />}
        {trip.credit && <span className={styles.credit}>Course credit</span>}
      </div>

      <div className={styles.body}>
        <h2 className={styles.cardTitle}>{trip.name}</h2>
        <p className={styles.country}>{trip.country}</p>
        <p className={styles.dates}>
          {formatDateRange(trip.startDate, trip.endDate)} ({days} {days === 1 ? "day" : "days"})
        </p>
        <p className={styles.period}>{trip.period}</p>
        <p className={styles.cost}>{trip.costUsd === null ? "TBA" : usd.format(trip.costUsd)}</p>

        <button className={styles.toggle} aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
          {open ? "Hide details" : "More details"}
        </button>

        {open && (
          <div id={detailsId} className={styles.details}>
            <dl className={styles.facts}>
              <div>
                <dt>Application deadline</dt>
                <dd>{trip.applicationDeadline ? formatDate(trip.applicationDeadline) : "No deadline"}</dd>
              </div>
              <div>
                <dt>Cities</dt>
                <dd>{trip.cities.join(", ")}</dd>
              </div>
            </dl>
            <p>{trip.description}</p>
            {trip.link && (
              <a className={styles.link} href={trip.link} target="_blank" rel="noreferrer">
                More info ↗
              </a>
            )}
            {trip.photo && (
              <p className={styles.photoCredit}>
                Photo:{" "}
                <a href={trip.photo.source} target="_blank" rel="noreferrer">
                  {trip.photo.author}
                </a>
                {", "}
                {trip.photo.licenseUrl ? (
                  <a href={trip.photo.licenseUrl} target="_blank" rel="noreferrer">
                    {trip.photo.license}
                  </a>
                ) : (
                  trip.photo.license
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
