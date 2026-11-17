// Trek Finder seed: loads the trips in sheet/trips.csv into the database.
//
// Run by `db:deploy` after schema.sql, on every deploy (see
// packages/platform/scripts/setup-tools.mjs), with a client connected as the
// trekfinder role. trips.csv is a download of the team's Google Sheet, so
// Sheet edits go live once a new download is committed and deployed (see
// sheet/EDITOR_GUIDE.md). importSheet skips bad rows, refuses imports that look
// like a mistake, and logs every run for the status page
// (/tools/trek-finder/status). Loading the same file again changes nothing.

import { readFile } from "node:fs/promises";
import { importSheet } from "./dist/index.js";

const TRIPS_CSV = new URL("./sheet/trips.csv", import.meta.url);

/** @param {{ sql: import("postgres").Sql }} deps */
export default async function seed({ sql }) {
  const result = await importSheet(sql, await readFile(TRIPS_CSV, "utf8"));
  console.log(
    `  trips.csv import ${result.status}: ${result.tripsLoaded} trips loaded, ` +
      `${result.delisted} hidden, ${result.problems.length} problems.`
  );
}
