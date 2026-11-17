// Reading an uploaded calendar spreadsheet into numbered text rows, one per
// non-empty row of every tab, for the AI to turn into events. Dates become
// YYYY-MM-DD and formulas are read as their last calculated value.

import ExcelJS from "exceljs";

/** Most rows one calendar import may hold. */
export const MAX_CALENDAR_ROWS = 300;

export class CalendarFormatError extends Error {}

export interface CalendarRow {
  sheet: string;
  /** The row's number in its tab, as the spreadsheet shows it. */
  row: number;
  /** The row's non-empty cells joined with " | ". */
  text: string;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Excel stores a time-only cell as a date in 1899.
    return value.getUTCFullYear() < 1900 ? value.toISOString().slice(11, 16) : value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value);
}

/** Every non-empty row of every tab in an .xlsx file. */
export async function calendarRows(filename: string, data: Uint8Array): Promise<CalendarRow[]> {
  if (!filename.toLowerCase().endsWith(".xlsx")) {
    throw new CalendarFormatError("Upload the calendar as an Excel file (.xlsx). In Google Sheets: File > Download > Microsoft Excel.");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's types want its own Buffer type; a Node Buffer is what it reads.
    await workbook.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
  } catch {
    throw new CalendarFormatError("That file couldn't be read as an Excel workbook.");
  }
  const rows: CalendarRow[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row, number) => {
      const cells: string[] = [];
      row.eachCell((cell) => {
        const text = cellText(cell.value).trim();
        if (text) cells.push(text);
      });
      if (cells.length > 0) rows.push({ sheet: sheet.name, row: number, text: cells.join(" | ") });
    });
  });
  if (rows.length > MAX_CALENDAR_ROWS) {
    throw new CalendarFormatError(`That calendar has ${rows.length} rows; the limit is ${MAX_CALENDAR_ROWS}. Remove old tabs or rows and try again.`);
  }
  return rows;
}
