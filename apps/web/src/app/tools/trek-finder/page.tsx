// Trek Finder: a catalog of Wharton MBA trips, read from the tool's database
// on every request so a new Sheet import shows up without a rebuild. Shows the
// sample trips until the first import. Browsing doesn't need sign-in; hearts
// show the signed-in student's saved trips.

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { listSavedIds, todayInNewYork } from "@penntools/tool-trek-finder";
import { getCurrentUser } from "@/lib/auth";
import { loadTrips } from "./loadTrips";
import { TripCatalog } from "./TripCatalog";

export const metadata: Metadata = {
  title: "Trek Finder",
};

export default async function TrekFinderPage() {
  const sql = toolSql("trekfinder");
  if (!sql) throw new Error("Trek Finder's database is not configured (check DATABASE_URL).");

  const user = await getCurrentUser();
  const [{ trips, sample }, savedIds] = await Promise.all([loadTrips(sql), user ? listSavedIds(sql, user.id) : []]);

  return (
    <TripCatalog trips={trips} today={todayInNewYork()} savedIds={savedIds} signedIn={user !== null} sample={sample} />
  );
}
