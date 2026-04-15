"use server";

import { parseXlsx } from "@penntools/tool-1/track4";
import type { ClearingPriceRecord } from "@penntools/tool-1/track4";

const TERM_RE = /^(Spring|Fall|Summer)\d{4}$/;

export interface ParseResult {
  records: ClearingPriceRecord[];
  accepted: number;
  rejected: number;
  error?: string;
}

export async function processUploadedFile(formData: FormData): Promise<ParseResult> {
  const file = formData.get("file");
  const term = formData.get("term");

  if (!(file instanceof File) || file.size === 0) {
    return { records: [], accepted: 0, rejected: 0, error: "No file provided." };
  }
  if (typeof term !== "string" || !TERM_RE.test(term.trim())) {
    return { records: [], accepted: 0, rejected: 0, error: 'Invalid term format — use e.g. "Spring2025".' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { records, result } = parseXlsx(buffer, term.trim(), { strict: false });

  if (records.length === 0) {
    const first = result.rejectionReasons[0];
    return {
      records: [],
      accepted: 0,
      rejected: result.rejected,
      error: `Could not parse file: ${first?.reason ?? "unknown error"}. Check that column names match the expected format.`,
    };
  }

  return { records, accepted: result.accepted, rejected: result.rejected };
}
