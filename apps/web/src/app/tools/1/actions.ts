"use server";

import { parseXlsx, computeBidGuidance } from "@penntools/tool-1/track4";
import type { BidGuidance, ClearingPriceRecord } from "@penntools/tool-1/track4";
import { persistRecords, loadPersistedRecords, getStoredTerms } from "./persistence";

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

export function buildGuidance(records: ClearingPriceRecord[]): BidGuidance[] {
  const groups = new Map<string, ClearingPriceRecord[]>();
  for (const r of records) {
    const key = `${r.courseId}::${r.section}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([key, recs]) => {
      const sep      = key.indexOf("::");
      const courseId = key.slice(0, sep);
      const section  = key.slice(sep + 2);
      // Sort oldest → newest before computing so trend direction is correct
      recs.sort((a, b) => a.term.localeCompare(b.term));
      return computeBidGuidance(courseId, section, recs);
    })
    .filter((g): g is BidGuidance => g !== null);
}
