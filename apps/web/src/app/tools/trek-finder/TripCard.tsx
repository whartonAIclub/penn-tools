"use client";

// One trip's card, shared by the catalog and My Saved Trips: photo with the
// heart and course credit badge, the key facts, and "More details", which
// opens the details panel.

import { useState } from "react";
import { formatDateRange, nextDeadline, savedTripNote, tripDays, type Trip } from "@penntools/tool-trek-finder";
import { PriceLine } from "./PriceInfo";
import { SaveButton } from "./SaveButton";
import { TripDetails, formatDeadline } from "./TripDetails";
import styles from "./TripCatalog.module.css";

const NOTES = { started: "Trip has started", delisted: "No longer listed" } as const;

export function TripCard({
  trip,
  today,
  saved,
  onToggleSave,
}: {
  trip: Trip;
  today: string;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const days = tripDays(trip.startDate, trip.endDate);
  const upcoming = nextDeadline(trip, today);
  // Only saved trips can have left the catalog, so only My Saved Trips shows these.
  const note = savedTripNote(trip, today);

  return (
    <li className={note ? `${styles.card} ${styles.inactive}` : styles.card}>
      <div className={styles.photo}>
        {trip.imageUrl && <img src={trip.imageUrl} alt="" loading="lazy" />}
        {trip.academicCredit && <span className={styles.credit}>Course credit</span>}
        <SaveButton saved={saved} tripName={trip.name} onToggle={onToggleSave} className={styles.cardSave} />
      </div>

      <div className={styles.body}>
        {note && <p className={styles.note}>{NOTES[note]}</p>}
        <h2 className={styles.cardTitle}>{trip.name}</h2>
        <p className={styles.dates}>
          {formatDateRange(trip.startDate, trip.endDate)} ({days} {days === 1 ? "day" : "days"})
        </p>
        {trip.periodLabel && <p className={styles.period}>{trip.periodLabel}</p>}
        <PriceLine trip={trip} today={today} />
        {upcoming && !note && (
          <p className={styles.deadline}>
            {upcoming.label}: {formatDeadline(upcoming)}
          </p>
        )}

        <button className={styles.toggle} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          More details
        </button>
      </div>

      {open && (
        <TripDetails trip={trip} today={today} saved={saved} onToggleSave={onToggleSave} onClose={() => setOpen(false)} />
      )}
    </li>
  );
}
