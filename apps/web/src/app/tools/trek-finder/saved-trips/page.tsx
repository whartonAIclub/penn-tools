// My Saved Trips: the signed-in student's saved trips, grouped by season.
// Saved trips that have started or left the Sheet stay here, labeled. Trips
// load the same way as the catalog's (loadTrips).

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { listSavedIds, todayInNewYork } from "@penntools/tool-trek-finder";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { loadTrips } from "../loadTrips";
import { SavedTrips } from "./SavedTrips";

export const metadata: Metadata = {
  title: "My Saved Trips",
};

export default async function SavedTripsPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="My Saved Trips" message="Sign in to see the trips you've saved." />;

  const sql = toolSql("trekfinder");
  if (!sql) throw new Error("Trek Finder's database is not configured (check DATABASE_URL).");

  const [savedIds, { trips: all }] = await Promise.all([listSavedIds(sql, user.id), loadTrips(sql)]);
  const trips = all.filter((trip) => savedIds.includes(trip.id));

  return <SavedTrips key={savedIds.join()} trips={trips} savedIds={savedIds} today={todayInNewYork()} />;
}
