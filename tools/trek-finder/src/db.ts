// Trek Finder's storage, in its own trekfinder schema. Callers pass the database
// client (toolSql("trekfinder")) and the signed-in user's id; every saved-trip
// read and write is scoped to that user.

import type { Sql } from "postgres";
import type { Deadline, PriceStage, Trip, TripLink } from "./trips.js";

export type ImportRunStatus = "ok" | "partial" | "aborted" | "failed";

/** One thing that went wrong in an import; fields are null when they don't apply. */
export interface ImportProblem {
  tab: string | null;
  row: number | null;
  tripId: string | null;
  message: string;
}

export interface ImportRun {
  id: number;
  /** ISO timestamp of when the import started. */
  startedAt: string;
  status: ImportRunStatus;
  tripsLoaded: number;
  problems: ImportProblem[];
}

/** The most recent Sheet imports, newest first. */
export async function listImportRuns(sql: Sql, limit = 20): Promise<ImportRun[]> {
  // ::int because Postgres BIGINTs otherwise arrive as strings.
  const rows = await sql<{ id: number; started_at: Date; status: ImportRunStatus; trips_loaded: number; problems: ImportProblem[] }[]>`
    SELECT id::int AS id, started_at, status, trips_loaded, problems FROM import_runs
    ORDER BY import_runs.id DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tripsLoaded: row.trips_loaded,
    problems: row.problems,
  }));
}

export interface ImportWrite {
  /** Trips added or updated. */
  written: number;
  /** Listed trips that weren't in this import, now hidden. */
  delisted: number;
}

/**
 * Makes the stored trips match one Sheet import, all at once: if anything
 * fails, nothing changes. Each trip is added or updated and listed, its price
 * stages, deadlines and links are replaced, and listed trips missing from the
 * import are hidden, never deleted, so saved trips keep working. The trips
 * must already be checked (parseTripRow or validateTrip).
 *
 * Refuses an empty import or a repeated id, since either would most likely
 * hide trips by mistake. The import script's safety guard decides what counts
 * as too few trips.
 */
export async function writeImport(sql: Sql, trips: readonly Trip[]): Promise<ImportWrite> {
  if (trips.length === 0) throw new Error("Refusing to import zero trips.");
  const ids = trips.map((trip) => trip.id);
  if (new Set(ids).size !== ids.length) throw new Error("Refusing an import with a repeated trip id.");

  return sql.begin(async (transaction) => {
    // postgres's TransactionSql type loses the tagged-template call signature.
    const tx = transaction as unknown as Sql;
    for (const trip of trips) {
      await tx`
        INSERT INTO trips (
          id, name, trip_type, location, cities, region, start_date, end_date, timing, period_label,
          academic_credit, credit_note, description, price_includes, destination_blurb, itinerary,
          availability_status, spots_total, spots_remaining, organizer_name, organizer_contact,
          organizer_email, application_url, destination_airport, image_url, image_credit, listed
        ) VALUES (
          ${trip.id}, ${trip.name}, ${trip.tripType}, ${trip.location}, ${tx.array(trip.cities)}, ${trip.region},
          ${trip.startDate}, ${trip.endDate}, ${trip.timing}, ${trip.periodLabel}, ${trip.academicCredit},
          ${trip.creditNote}, ${trip.description}, ${trip.priceIncludes}, ${trip.destinationBlurb}, ${trip.itinerary},
          ${trip.availabilityStatus}, ${trip.spotsTotal}, ${trip.spotsRemaining}, ${trip.organizerName},
          ${trip.organizerContact}, ${trip.organizerEmail}, ${trip.applicationUrl}, ${trip.destinationAirport},
          ${trip.imageUrl}, ${trip.imageCredit}, TRUE
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, trip_type = EXCLUDED.trip_type, location = EXCLUDED.location,
          cities = EXCLUDED.cities, region = EXCLUDED.region, start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date, timing = EXCLUDED.timing, period_label = EXCLUDED.period_label,
          academic_credit = EXCLUDED.academic_credit, credit_note = EXCLUDED.credit_note,
          description = EXCLUDED.description, price_includes = EXCLUDED.price_includes,
          destination_blurb = EXCLUDED.destination_blurb, itinerary = EXCLUDED.itinerary,
          availability_status = EXCLUDED.availability_status, spots_total = EXCLUDED.spots_total,
          spots_remaining = EXCLUDED.spots_remaining, organizer_name = EXCLUDED.organizer_name,
          organizer_contact = EXCLUDED.organizer_contact, organizer_email = EXCLUDED.organizer_email,
          application_url = EXCLUDED.application_url, destination_airport = EXCLUDED.destination_airport,
          image_url = EXCLUDED.image_url, image_credit = EXCLUDED.image_credit,
          listed = TRUE, updated_at = NOW()
      `;

      await tx`DELETE FROM trip_price_stages WHERE trip_id = ${trip.id}`;
      await tx`DELETE FROM trip_deadlines WHERE trip_id = ${trip.id}`;
      await tx`DELETE FROM trip_links WHERE trip_id = ${trip.id}`;
      for (const s of trip.priceStages) {
        await tx`
          INSERT INTO trip_price_stages (trip_id, position, label, amount_usd, certainty, valid_from, valid_until, note)
          VALUES (${trip.id}, ${s.position}, ${s.label}, ${s.amountUsd}, ${s.certainty}, ${s.validFrom}, ${s.validUntil}, ${s.note})
        `;
      }
      for (const d of trip.deadlines) {
        await tx`
          INSERT INTO trip_deadlines (trip_id, position, kind, label, due_date, due_time)
          VALUES (${trip.id}, ${d.position}, ${d.kind}, ${d.label}, ${d.dueDate}, ${d.dueTime})
        `;
      }
      for (const l of trip.links) {
        await tx`INSERT INTO trip_links (trip_id, position, label, url) VALUES (${trip.id}, ${l.position}, ${l.label}, ${l.url})`;
      }
    }

    const delisted = await tx`
      UPDATE trips SET listed = FALSE, updated_at = NOW()
      WHERE listed AND NOT (id = ANY(${tx.array(ids)}))
      RETURNING id
    `;
    return { written: trips.length, delisted: delisted.length };
  });
}

/** Groups child rows by trip id, keeping their order. */
function byTrip<T>(rows: readonly (T & { trip_id: string })[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const { trip_id, ...rest } of rows) {
    const group = groups.get(trip_id) ?? [];
    group.push(rest as unknown as T);
    groups.set(trip_id, group);
  }
  return groups;
}

/**
 * Every stored trip with its prices, deadlines and links, soonest first. Hidden
 * trips are included (listed = false) so saved ones can still be shown;
 * visibleTrips picks what the catalog shows.
 */
export async function listTrips(sql: Sql): Promise<Trip[]> {
  // Dates and times come back as text in the Trip shape's formats; Postgres
  // DATEs would otherwise arrive as JavaScript Dates at midnight UTC.
  const trips = await sql<Omit<Trip, "priceStages" | "deadlines" | "links">[]>`
    SELECT
      id, name, trip_type AS "tripType", location, cities, region,
      to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
      timing, period_label AS "periodLabel", academic_credit AS "academicCredit", credit_note AS "creditNote",
      description, price_includes AS "priceIncludes", destination_blurb AS "destinationBlurb", itinerary,
      availability_status AS "availabilityStatus", spots_total AS "spotsTotal", spots_remaining AS "spotsRemaining",
      organizer_name AS "organizerName", organizer_contact AS "organizerContact", organizer_email AS "organizerEmail",
      application_url AS "applicationUrl", destination_airport AS "destinationAirport", image_url AS "imageUrl",
      image_credit AS "imageCredit", listed
    FROM trips
    ORDER BY start_date, id
  `;
  const prices = byTrip<PriceStage>(await sql`
    SELECT trip_id, position, label, amount_usd AS "amountUsd", certainty,
      to_char(valid_from, 'YYYY-MM-DD') AS "validFrom", to_char(valid_until, 'YYYY-MM-DD') AS "validUntil", note
    FROM trip_price_stages ORDER BY trip_id, position
  `);
  const deadlines = byTrip<Deadline>(await sql`
    SELECT trip_id, position, kind, label, to_char(due_date, 'YYYY-MM-DD') AS "dueDate", to_char(due_time, 'HH24:MI') AS "dueTime"
    FROM trip_deadlines ORDER BY trip_id, position
  `);
  const links = byTrip<TripLink>(await sql`SELECT trip_id, position, label, url FROM trip_links ORDER BY trip_id, position`);

  return trips.map((trip) => ({
    ...trip,
    priceStages: prices.get(trip.id) ?? [],
    deadlines: deadlines.get(trip.id) ?? [],
    links: links.get(trip.id) ?? [],
  }));
}

/**
 * Saves a trip for the user; saving one they already have changes nothing.
 * Returns false, saving nothing, if no trip has that id. Trips that are no
 * longer listed can still be saved, so an unsave from the Saved view can be undone.
 */
export async function saveTrip(sql: Sql, userId: string, tripId: string): Promise<boolean> {
  const rows = await sql`
    WITH trip AS (SELECT id FROM trips WHERE id = ${tripId}),
    saved AS (
      INSERT INTO saved_trips (user_id, trip_id)
      SELECT ${userId}, id FROM trip
      ON CONFLICT (user_id, trip_id) DO NOTHING
    )
    SELECT 1 FROM trip
  `;
  return rows.length > 0;
}

/** Removes a trip from the user's saved trips; does nothing if it wasn't saved. */
export async function unsaveTrip(sql: Sql, userId: string, tripId: string): Promise<void> {
  await sql`DELETE FROM saved_trips WHERE user_id = ${userId} AND trip_id = ${tripId}`;
}

/** The ids of the user's saved trips, most recently saved first. */
export async function listSavedIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ trip_id: string }[]>`
    SELECT trip_id FROM saved_trips
    WHERE user_id = ${userId}
    ORDER BY created_at DESC, trip_id
  `;
  return rows.map((row) => row.trip_id);
}
