// Trek Finder: a catalog of Wharton MBA trips, read from the tool's database
// on every request so a new Sheet import shows up without a rebuild. Shows the
// sample trips until the first import. Only signed-in Penn users can see
// trips: signed-out visitors get the sign-in prompt and none of them, so
// anyone who can heart a trip is already signed in.

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { listSavedIds, todayInNewYork } from "@penntools/tool-trek-finder";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { loadTrips } from "./loadTrips";
import { TripCatalog } from "./TripCatalog";

export const metadata: Metadata = {
  title: "Trek Finder",
};

export default async function TrekFinderPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Trek Finder" message="Sign in to browse Wharton trips." />;

  const sql = toolSql("trekfinder");
  if (!sql) throw new Error("Trek Finder's database is not configured (check DATABASE_URL).");

  const [{ trips, sample }, savedIds] = await Promise.all([loadTrips(sql), listSavedIds(sql, user.id)]);

  return <TripCatalog trips={trips} today={todayInNewYork()} savedIds={savedIds} signedIn sample={sample} />;
}
