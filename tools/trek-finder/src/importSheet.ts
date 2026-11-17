// One Sheet import, from CSV text to the stored trips and a logged import run.
// seed.mjs reads sheet/trips.csv (a download of the Sheet) on every deploy and
// hands it here; keeping the file reading out of this module keeps it testable.
//
// Bad rows are skipped with a reason rather than failing the import. Imports
// that look like a mistake change nothing: a file that isn't the Sheet, a
// Sheet with no good trips, or one with fewer than half the trips listed now.
//
// Problems appear on the import status page, so they name rows and columns but
// never repeat what was entered. A trip id is named only when it's a valid id.

import type { Sql } from "postgres";
import { writeImport, type ImportProblem, type ImportRunStatus } from "./db.js";
import { missingColumns, parseTripRow, SHEET_COLUMNS, type SheetRow } from "./sheet.js";
import type { Trip } from "./trips.js";

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Splits CSV text into rows of cells: quoted cells may hold commas, line breaks
 * and doubled quotes (""). Handles \r\n line ends and a leading byte-order mark;
 * a \r\n inside a cell becomes \n, so Windows line endings change nothing.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const input = text.startsWith("﻿") ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else if (char === "\r" && input[i + 1] === "\n") {
        // Dropped; the \n that follows is kept.
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

export interface ImportResult {
  status: ImportRunStatus;
  /** Trips written to the database (0 unless the import went ahead). */
  tripsLoaded: number;
  /** Listed trips missing from the Sheet, now hidden. */
  delisted: number;
  problems: ImportProblem[];
}

const problem = (message: string, row: number | null = null, tripId: string | null = null): ImportProblem => ({
  tab: null,
  row,
  tripId,
  message,
});

async function recordRun(sql: Sql, status: ImportRunStatus, tripsLoaded: number, problems: ImportProblem[]): Promise<void> {
  await sql`
    INSERT INTO import_runs (status, trips_loaded, problems)
    VALUES (${status}, ${tripsLoaded}, ${sql.json(problems as unknown as Parameters<Sql["json"]>[0])})
  `;
}

/**
 * Imports the Sheet's CSV: checks every row, then, unless the import looks like
 * a mistake, makes the stored trips match the good rows. Always logs the run.
 */
export async function importSheet(sql: Sql, csv: string): Promise<ImportResult> {
  const finish = async (status: ImportRunStatus, problems: ImportProblem[], tripsLoaded = 0, delisted = 0) => {
    await recordRun(sql, status, tripsLoaded, problems);
    return { status, tripsLoaded, delisted, problems };
  };

  const [headerRow = [], ...dataRows] = parseCsv(csv);
  const headers = headerRow.map((header) => header.trim());
  const missing = missingColumns(headers);
  if (missing.length === SHEET_COLUMNS.length) {
    return finish("failed", [problem("The file isn't the Trek Finder Sheet (none of its columns were found). Nothing changed.")]);
  }
  if (missing.length > 0) {
    return finish("failed", missing.map((column) => problem(`The Sheet is missing the column "${column}". Nothing changed.`)));
  }

  const problems: ImportProblem[] = [];
  const trips: Trip[] = [];
  const firstRowFor = new Map<string, number>();

  dataRows.forEach((cells, index) => {
    if (cells.every((value) => value.trim() === "")) return;
    const rowNumber = index + 2; // the Sheet's own numbering: the header is row 1
    const row: SheetRow = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
    const id = (row["ID"] ?? "").trim();
    const safeId = ID_RE.test(id) ? id : null;

    const result = parseTripRow(row);
    if (!result.ok) {
      for (const message of result.problems) problems.push(problem(`${message} Row skipped.`, rowNumber, safeId));
      return;
    }
    const earlier = firstRowFor.get(result.trip.id);
    if (earlier !== undefined) {
      problems.push(problem(`This ID is already used in row ${earlier}. Row skipped.`, rowNumber, safeId));
      return;
    }
    firstRowFor.set(result.trip.id, rowNumber);
    trips.push(result.trip);
  });

  if (trips.length === 0) {
    return finish("aborted", [...problems, problem("The Sheet has no trips that could be loaded. Nothing changed.")]);
  }
  const [counted] = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM trips WHERE listed`;
  const listedNow = counted?.count ?? 0;
  if (trips.length * 2 < listedNow) {
    return finish("aborted", [
      ...problems,
      problem(`Only ${trips.length} trips could be loaded, fewer than half of the ${listedNow} listed now. Nothing changed.`),
    ]);
  }

  let written;
  try {
    written = await writeImport(sql, trips);
  } catch (error) {
    await recordRun(sql, "failed", 0, [...problems, problem("Saving the trips failed. Nothing changed.")]);
    throw error;
  }
  return finish(problems.length === 0 ? "ok" : "partial", problems, written.written, written.delisted);
}
