// Where the Trek Finder pages get their trips: the tool's database, filled from
// the team's Google Sheet. Until the first import has loaded any, the pages
// show the sample trips instead, with their photos, and say so.

import type { toolSql } from "@penntools/platform/db";
import { SAMPLE_TRIPS, listTrips, type Trip } from "@penntools/tool-trek-finder";
import { SAMPLE_PHOTOS } from "./samplePhotos";

type Sql = NonNullable<ReturnType<typeof toolSql>>;

export interface LoadedTrips {
  /** Every trip, hidden ones included; the catalog picks what to show. */
  trips: Trip[];
  /** True when these are the made-up sample trips. */
  sample: boolean;
}

function samplesWithPhotos(): Trip[] {
  return SAMPLE_TRIPS.map((trip) => {
    const photo = SAMPLE_PHOTOS[trip.id];
    return photo ? { ...trip, imageUrl: photo.url, imageCredit: `${photo.author}, ${photo.license}` } : trip;
  });
}

export async function loadTrips(sql: Sql): Promise<LoadedTrips> {
  const trips = await listTrips(sql);
  return trips.length > 0 ? { trips, sample: false } : { trips: samplesWithPhotos(), sample: true };
}
