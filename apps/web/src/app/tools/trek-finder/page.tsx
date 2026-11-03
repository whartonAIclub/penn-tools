// Trek Finder: a catalog of Wharton MBA trips. For now it shows sample trips
// from the tool package; they'll move to the tool's own database later.
// Browsing doesn't need sign-in.

import type { Metadata } from "next";
import { SAMPLE_TRIPS } from "@penntools/tool-trek-finder";
import { TripCatalog } from "./TripCatalog";

export const metadata: Metadata = {
  title: "Trek Finder",
};

export default function TrekFinderPage() {
  return <TripCatalog trips={SAMPLE_TRIPS} sample />;
}
