import * as XLSX from "xlsx";
import type { ClearingPriceRecord, IngestionResult } from "./types.js";
import { sanitizeRecord } from "./sanitize.js";
import type { SanitizeOptions } from "./sanitize.js";

// Minimum columns required — all others are optional and default to empty/zero
const REQUIRED_COLUMNS = ["courseId", "title", "clearingPrice"];

const COLUMN_ALIASES: Record<string, string> = {
  // Course ID variants
  "course":         "courseId",
  "courseid":       "courseId",
  "course_id":      "courseId",
  // Combined "Section ID" like "ACCT6130001" — split into courseId + section below
  "sectionid":      "_sectionId",
  // Section variants
  "sect":           "section",
  // Title variants
  "coursetitle":    "title",
  "name":           "title",
  // Instructor variants
  "faculty":        "instructor",
  // Credit unit variants
  "creditunits":    "cu",
  "credits":        "cu",
  "credit":         "cu",
  // Time variants
  "starttime":      "start_time",
  "start":          "start_time",
  "endtime":        "end_time",
  "end":            "end_time",
  // Price variants
  "clearingprice":  "clearingPrice",
  "price":          "clearingPrice",
  "tokens":         "clearingPrice",
  // Quarter variants
  "qtr":            "quarter",
};

export function parseXlsx(buffer: Buffer, term: string, options: SanitizeOptions = {}): { records: ClearingPriceRecord[]; result: IngestionResult } {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      records: [],
      result: { term, totalRows: 0, accepted: 0, rejected: 0, rejectionReasons: [{ row: 0, reason: "workbook has no sheets" }] },
    };
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return {
      records: [],
      result: { term, totalRows: 0, accepted: 0, rejected: 0, rejectionReasons: [{ row: 0, reason: "sheet not found" }] },
    };
  }
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rawRows.length === 0) {
    return {
      records: [],
      result: { term, totalRows: 0, accepted: 0, rejected: 0, rejectionReasons: [] },
    };
  }

  // Normalize header keys from first row
  const normalizedRows = rawRows.map(row => normalizeKeys(row));

  // Check required columns are present
  const firstRow = normalizedRows[0]!;
  const missingColumns = REQUIRED_COLUMNS.filter(col => !(col in firstRow));
  if (missingColumns.length > 0) {
    return {
      records: [],
      result: {
        term,
        totalRows: rawRows.length,
        accepted: 0,
        rejected: rawRows.length,
        rejectionReasons: [{ row: 0, reason: `missing required columns: ${missingColumns.join(", ")}` }],
      },
    };
  }

  const records: ClearingPriceRecord[] = [];
  const rejectionReasons: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < normalizedRows.length; i++) {
    const { record, reason } = sanitizeRecord(normalizedRows[i]!, term, options);
    if (record) {
      records.push(record);
    } else {
      rejectionReasons.push({ row: i + 2, reason: reason ?? "unknown" }); // +2 for 1-index + header row
    }
  }

  return {
    records,
    result: {
      term,
      totalRows: rawRows.length,
      accepted: records.length,
      rejected: rejectionReasons.length,
      rejectionReasons,
    },
  };
}

function normalizeKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const normalized = key.toLowerCase().replace(/[\s_-]+/g, "");
    const canonical = COLUMN_ALIASES[normalized] ?? normalized;
    out[canonical] = val;
  }
  // Split combined "Section ID" (e.g. "ACCT6130001") into courseId + section.
  // Convention: last 3 characters are the section number, everything before is the course ID.
  if (out["_sectionId"] != null && !out["courseId"] && !out["section"]) {
    const combined = String(out["_sectionId"]).trim().toUpperCase();
    out["courseId"] = combined.slice(0, -3);
    out["section"]  = combined.slice(-3);
    delete out["_sectionId"];
  }
  return out;
}
