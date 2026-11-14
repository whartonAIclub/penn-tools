// CSV in and out. Google Forms and Sheets export RFC 4180: quoted cells may
// hold commas, quotes ("") and line breaks.

import type { Row, Table } from "./types.js";

/** Cells of every row. Accepts \n or \r\n, a UTF-8 byte order mark, and tabs or semicolons as the separator. */
export function parseCells(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const separator = count("\t") > count(",") ? "\t" : count(";") > count(",") ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * A table from CSV text: the first row names the columns. Blank rows are
 * dropped, short rows are padded, and a repeated header gets " (2)" so no
 * column hides another.
 */
export function parseCsv(text: string): Table {
  const cells = parseCells(text);
  const header = cells[0];
  if (!header) return { columns: [], rows: [] };
  const seen = new Map<string, number>();
  const columns = header.map((raw, i) => {
    const name = raw.trim() || `Column ${i + 1}`;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} (${n})`;
  });
  const rows: Row[] = [];
  for (const line of cells.slice(1)) {
    if (line.every((c) => c.trim() === "")) continue;
    const row: Row = {};
    columns.forEach((column, i) => {
      row[column] = line[i] ?? "";
    });
    rows.push(row);
  }
  return { columns, rows };
}

/** CSV text for `rows`, with every cell that needs quoting quoted. */
export function toCsv(columns: string[], rows: Record<string, string | number | null | undefined>[]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value == null ? "" : String(value);
    // A cell that starts like a formula would run in a spreadsheet; a leading ' keeps it text.
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map(cell).join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))].join("\n") + "\n";
}
