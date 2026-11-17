// Trek Finder seed: imports the trips from the Google Sheet.
//
// Run by `db:deploy` after schema.sql, on every deploy (see
// packages/platform/scripts/setup-tools.mjs), with a client connected as the
// trekfinder role, so Sheet edits go live at the next deploy. Downloads the
// Sheet's "Publish to web" CSV from TREK_FINDER_SHEET_CSV_URL and hands it to
// importSheet, which skips bad rows, refuses imports that look like a mistake,
// and logs every run for the status page (/tools/trek-finder/status). Without
// the variable it does nothing, so the catalog keeps its current trips.

import { importSheet, recordFailedImport } from "./dist/index.js";

const DOWNLOAD_TIMEOUT_MS = 30_000;

/** @param {{ sql: import("postgres").Sql }} deps */
export default async function seed({ sql }) {
  const url = process.env["TREK_FINDER_SHEET_CSV_URL"];
  if (!url) {
    console.warn("  TREK_FINDER_SHEET_CSV_URL is not set; skipping the Trek Finder Sheet import.");
    return;
  }

  let csv;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`The Sheet download returned HTTP ${response.status}.`);
    csv = await response.text();
  } catch (error) {
    await recordFailedImport(sql, "Couldn't download the Sheet. Nothing changed.");
    throw error;
  }

  const result = await importSheet(sql, csv);
  console.log(
    `  Sheet import ${result.status}: ${result.tripsLoaded} trips loaded, ` +
      `${result.delisted} hidden, ${result.problems.length} problems.`
  );
}
