"use client";

// The My Saved Trips page: saved trips in season sections, soonest first, with
// the same cards and details panel as the catalog. Unsaving a trip here
// removes it from the page.

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { groupBySeason, type Trip } from "@penntools/tool-trek-finder";
import { SaveMessage, useSavedTrips } from "../SaveButton";
import { TripCard } from "../TripCard";
import catalog from "../TripCatalog.module.css";
import styles from "./SavedTrips.module.css";

export function SavedTrips({ trips, savedIds, today }: { trips: Trip[]; savedIds: string[]; today: string }) {
  const router = useRouter();
  const saves = useSavedTrips(savedIds);

  // Next.js reuses a recently visited page when someone navigates back to it,
  // which would show saves from before. Asking the server again on every visit
  // keeps the list current; page.tsx keys this component on the saved ids, so
  // fresh ones replace the old state.
  useEffect(() => {
    router.refresh();
  }, [router]);
  const groups = groupBySeason(trips.filter((trip) => saves.isSaved(trip.id)));
  const count = groups.reduce((total, group) => total + group.trips.length, 0);

  return (
    <div className={catalog.page}>
      <header className={catalog.header}>
        <Link className={styles.back} href="/tools/trek-finder">
          ← All trips
        </Link>
        <h1 className={catalog.title}>My Saved Trips</h1>
        <p className={catalog.intro}>
          {count === 0 ? "Trips you save with ♡ appear here." : `${count} saved ${count === 1 ? "trip" : "trips"}, by season.`}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className={catalog.empty}>No saved trips yet. Tap ♡ on a trip in the catalog to save it.</p>
      ) : (
        groups.map((group) => (
          <section key={group.season} className={styles.season} aria-labelledby={`season-${group.season}`}>
            <h2 id={`season-${group.season}`} className={styles.seasonTitle}>
              {group.season} <span className={styles.seasonCount}>({group.trips.length})</span>
            </h2>
            <ul className={catalog.grid}>
              {group.trips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  today={today}
                  saved={saves.isSaved(trip.id)}
                  onToggleSave={() => saves.toggle(trip.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <SaveMessage message={saves.message} />
    </div>
  );
}
