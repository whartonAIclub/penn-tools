"use client";

// The trip catalog: search and filters on top, then a card per trip. Filtering
// and sorting are done here in the browser with filterTrips and sortTrips from
// the tool package.

import { useMemo, useState } from "react";
import {
  REGIONS,
  TRIP_TYPES,
  currentPriceStage,
  filterTrips,
  formatDate,
  formatDateRange,
  listSeasons,
  nextDeadline,
  sortTrips,
  tripDays,
  type Region,
  type Trip,
  type TripType,
} from "@penntools/tool-trek-finder";
import { PriceInfo } from "./PriceInfo";
import styles from "./TripCatalog.module.css";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "17:00" → "5 PM", "09:30" → "9:30 AM". Also takes "HH:MM:SS". */
function formatTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const hour = hours % 12 || 12;
  const suffix = hours < 12 ? "AM" : "PM";
  return minutes ? `${hour}:${String(minutes).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

// today comes from the server (todayInNewYork), so the server and browser agree on the date.
export function TripCatalog({ trips, today, sample = false }: { trips: Trip[]; today: string; sample?: boolean }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TripType | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [period, setPeriod] = useState("");

  const periods = useMemo(() => listSeasons(trips), [trips]);
  const shown = useMemo(
    () =>
      sortTrips(
        filterTrips(trips, { query, type: type || null, region: region || null, season: period || null }),
        "start_date",
        today,
      ),
    [trips, today, query, type, region, period],
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
  const detailsId = `trip-${trip.id}-details`;
  const days = tripDays(trip.startDate, trip.endDate);
  const stage = currentPriceStage(trip.priceStages, today);
  const cost = stage?.amountUsd ?? null;
  const upcoming = nextDeadline(trip, today);
  const deadline = trip.deadlines.find((d) => d.kind === "preliminary") ?? trip.deadlines[0];

  return (
    <li className={styles.card}>
      <div className={styles.photo}>
        {trip.imageUrl && <img src={trip.imageUrl} alt="" loading="lazy" />}
        {trip.academicCredit && <span className={styles.credit}>Course credit</span>}
      </div>

      <div className={styles.body}>
        <h2 className={styles.cardTitle}>{trip.name}</h2>
        <p className={styles.country}>{trip.location}</p>
        <p className={styles.dates}>
          {formatDateRange(trip.startDate, trip.endDate)} ({days} {days === 1 ? "day" : "days"})
        </p>
        {trip.periodLabel && <p className={styles.period}>{trip.periodLabel}</p>}
        <div className={styles.priceRow}>
          <span className={styles.cost}>{cost === null ? "TBD" : usd.format(cost)}</span>
          {/* The stage only helps when a trip's price changes, so it's hidden for single-price trips. */}
          {stage && trip.priceStages.length > 1 && <span className={styles.stage}>{stage.label}</span>}
          {trip.priceIncludes && <PriceInfo text={trip.priceIncludes} />}
        </div>
        {upcoming && (
          <p className={styles.deadline}>
            {upcoming.label}: {formatDate(upcoming.dueDate)}
            {upcoming.dueTime && `, ${formatTime(upcoming.dueTime)} ET`}
          </p>
        )}

        <button className={styles.toggle} aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
          {open ? "Hide details" : "More details"}
        </button>

        {open && (
          <div id={detailsId} className={styles.details}>
            <dl className={styles.facts}>
              <div>
                <dt>Application deadline</dt>
                <dd>{deadline ? formatDate(deadline.dueDate) : "No deadline"}</dd>
              </div>
              <div>
                <dt>Cities</dt>
                <dd>{trip.cities.join(", ")}</dd>
              </div>
            </dl>
            {trip.description && <p>{trip.description}</p>}
            {trip.applicationUrl && (
              <a className={styles.link} href={trip.applicationUrl} target="_blank" rel="noreferrer">
                More info ↗
              </a>
            )}
            {trip.imageCredit && <p className={styles.photoCredit}>Photo: {trip.imageCredit}</p>}
          </div>
        )}
      </div>
    </li>
  );
}
