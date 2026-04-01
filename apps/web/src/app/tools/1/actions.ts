"use server";

import { parseXlsx } from "@penntools/tool-1/track4";
import type { BidGuidance } from "@penntools/tool-1/track4";
import { persistRecords, loadPersistedRecords, getStoredTerms } from "./persistence";
import { buildGuidance } from "./guidance";

const TERM_RE = /^(Spring|Fall|Summer)\d{4}$/;

export interface UploadResult {
  guidance: BidGuidance[];
  accepted: number;
  rejected: number;
  storedTerms: string[];
  error?: string;
}

export async function processUploadedFile(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");
  const term = formData.get("term");

  if (!(file instanceof File) || file.size === 0) {
    return { guidance: [], accepted: 0, rejected: 0, storedTerms: getStoredTerms(), error: "No file provided." };
  }
  if (typeof term !== "string" || !TERM_RE.test(term.trim())) {
    return { guidance: [], accepted: 0, rejected: 0, storedTerms: getStoredTerms(), error: 'Invalid term format — use e.g. "Spring2025".' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { records, result } = parseXlsx(buffer, term.trim(), { strict: false });

  if (records.length === 0) {
    const first = result.rejectionReasons[0];
    return {
      guidance: [],
      accepted: 0,
      rejected: result.rejected,
      storedTerms: getStoredTerms(),
      error: `Could not parse file: ${first?.reason ?? "unknown error"}. Check that column names match the expected format.`,
    };
  }

  // Persist new records — merges with all previously uploaded terms
  persistRecords(records);

  // Build guidance from the full accumulated dataset (all terms)
  const allRecords = loadPersistedRecords();
  const guidance   = buildGuidance(allRecords);
  const storedTerms = getStoredTerms();

  return { guidance, accepted: result.accepted, rejected: result.rejected, storedTerms };
}

