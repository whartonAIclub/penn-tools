"use client";

// The "More details" panel for one trip. It's a modal <dialog>, so the browser
// handles Esc, keeps keyboard focus inside and returns it to "More details"
// on close. Empty sections are left out rather than shown with blank labels.

import { useEffect, useRef } from "react";
import { formatDate, formatDateRange, nextDeadline, tripDays, type Deadline, type Trip } from "@penntools/tool-trek-finder";
import { PriceLine } from "./PriceInfo";
import { SaveButton } from "./SaveButton";
import styles from "./TripDetails.module.css";

/** "17:00" → "5 PM", "09:30" → "9:30 AM". Also takes "HH:MM:SS". */
function formatTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const hour = hours % 12 || 12;
  const suffix = hours < 12 ? "AM" : "PM";
  return minutes ? `${hour}:${String(minutes).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/** "Nov 15, 2026, 5 PM ET", or just the date when there's no time. */
export function formatDeadline(deadline: Deadline): string {
  const date = formatDate(deadline.dueDate);
  return deadline.dueTime ? `${date}, ${formatTime(deadline.dueTime)} ET` : date;
}

export function TripDetails({
  trip,
  today,
  saved,
  onToggleSave,
  onClose,
}: {
  trip: Trip;
  today: string;
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const days = tripDays(trip.startDate, trip.endDate);
  const upcoming = nextDeadline(trip, today);
  const itinerary = (trip.itinerary ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const deadlines = [...trip.deadlines].sort((a, b) => a.position - b.position);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    // Closing goes through dialog.close(), so the browser restores focus before the panel unmounts.
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={`trip-${trip.id}-title`}
      onClose={onClose}
      // A click on the dialog itself, not its content, is a click on the backdrop.
      onClick={(event) => event.target === dialog.current && dialog.current.close()}
    >
      <div className={styles.content}>
        <button type="button" className={styles.close} aria-label="Close" onClick={() => dialog.current?.close()}>
          ✕
        </button>

        {trip.imageUrl && (
          <div className={styles.photo}>
            <img src={trip.imageUrl} alt="" />
          </div>
        )}

        <div className={styles.body}>
          <header className={styles.header}>
            <div className={styles.titleRow}>
              <h2 id={`trip-${trip.id}-title`} className={styles.title}>
                {trip.name}
              </h2>
              <SaveButton saved={saved} tripName={trip.name} onToggle={onToggleSave} />
            </div>
            <p className={styles.place}>{[trip.location, trip.cities.join(", ")].filter(Boolean).join(" · ")}</p>
            <p className={styles.when}>
              {formatDateRange(trip.startDate, trip.endDate)} ({days} {days === 1 ? "day" : "days"})
              {trip.periodLabel && ` · ${trip.periodLabel}`}
            </p>
            {trip.academicCredit && (
              <p className={styles.credit}>Course credit{trip.creditNote && ` · ${trip.creditNote}`}</p>
            )}
            <PriceLine trip={trip} today={today} />
            {upcoming && (
              <p className={styles.deadline}>
                {upcoming.label}: {formatDeadline(upcoming)}
              </p>
            )}
            {trip.applicationUrl && (
              <a className={styles.website} href={trip.applicationUrl} target="_blank" rel="noreferrer">
                Trip Website ↗
              </a>
            )}
          </header>

          {trip.description && (
            <section className={styles.section}>
              <h3>About</h3>
              <p className={styles.description}>{trip.description}</p>
            </section>
          )}

          {itinerary.length > 0 && (
            <section className={styles.section}>
              <h3>Itinerary</h3>
              <ul className={styles.itinerary}>
                {itinerary.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {deadlines.length > 0 && (
            <section className={styles.section}>
              <h3>Deadlines</h3>
              <dl className={styles.facts}>
                {deadlines.map((d) => (
                  <div key={d.position} className={d.dueDate < today ? styles.passed : undefined}>
                    <dt>{d.label}</dt>
                    <dd>
                      {formatDeadline(d)}
                      {d.dueDate < today && " (passed)"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className={styles.section}>
            <dl className={styles.facts}>
              <div>
                <dt>Organizer</dt>
                <dd>{trip.organizerName}</dd>
              </div>
            </dl>
          </section>

          {trip.links.length > 0 && (
            <section className={styles.section}>
              <h3>Links</h3>
              <ul className={styles.links}>
                {[...trip.links]
                  .sort((a, b) => a.position - b.position)
                  .map((link) => (
                    <li key={link.position}>
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.label} ↗
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {trip.imageCredit && <p className={styles.photoCredit}>Photo: {trip.imageCredit}</p>}
        </div>
      </div>
    </dialog>
  );
}
