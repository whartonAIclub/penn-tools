// My Saved Trips: the signed-in student's saved trips, grouped by season.
// Saved trips that have started or left the Sheet stay here, labeled.
//
// For now the trips are the samples, with photos filled in the same way as
// the catalog's page.tsx; when that page reads the database (plan step 7),
// this one should load trips the same way.

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { SAMPLE_TRIPS, listSavedIds, todayInNewYork } from "@penntools/tool-trek-finder";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { SAMPLE_PHOTOS } from "../samplePhotos";
import { SavedTrips } from "./SavedTrips";

export const metadata: Metadata = {
  title: "My Saved Trips",
};

export default async function SavedTripsPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="My Saved Trips" message="Sign in to see the trips you've saved." />;

  const sql = toolSql("trekfinder");
  if (!sql) throw new Error("Trek Finder's database is not configured (check DATABASE_URL).");

  const savedIds = await listSavedIds(sql, user.id);
  const trips = SAMPLE_TRIPS.filter((trip) => savedIds.includes(trip.id)).map((trip) => {
    const photo = SAMPLE_PHOTOS[trip.id];
    return photo ? { ...trip, imageUrl: photo.url, imageCredit: `${photo.author}, ${photo.license}` } : trip;
  });

  return <SavedTrips key={savedIds.join()} trips={trips} savedIds={savedIds} today={todayInNewYork()} />;
}
