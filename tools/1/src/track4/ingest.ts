import { parseXlsx } from "./parseXlsx.js";
import { upsertRecords } from "./store.js";
import type { SanitizeOptions } from "./sanitize.js";
import type { IngestionResult } from "./types.js";

export interface IngestOptions extends SanitizeOptions {}

/**
 * Ingest a clearing price xlsx file for a given term.
 *
 * @param buffer  - Raw xlsx file buffer (from server-side file pipe)
 * @param term    - Term label, e.g. "Spring2025"
 * @param options - { strict: false } to disable the prompt-injection character
 *                  allowlist while LLM integration is not active
 */
export function ingestClearingPrices(
  buffer: Buffer,
  term: string,
  options: IngestOptions = {}
): IngestionResult {
  const { records, result } = parseXlsx(buffer, term, options);
  if (records.length > 0) {
    upsertRecords(records);
  }
  return result;
}
