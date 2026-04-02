// Server-only — reads and writes clearing price records to disk.
// Records are accumulated across terms: uploading Spring2026 does not
// remove Fall2025 data. The JSON file is the source of truth.
//
// NOTE: This is a local-dev solution. For production, the Platform team
// should expose a ToolDataRepository API via ToolContext so records can
// be stored in the shared Prisma database instead of the filesystem.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { ClearingPriceRecord } from "@penntools/tool-1/track4";

// Resolves to tools/1/data/clearing-prices.json from the repo root.
// process.cwd() is the repo root when running `pnpm dev` from there.
const DATA_DIR  = join(process.cwd(), "tools", "1", "data");
const DATA_FILE = join(DATA_DIR, "clearing-prices.json");

export function loadPersistedRecords(): ClearingPriceRecord[] {
  if (!existsSync(DATA_FILE)) return [];
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as ClearingPriceRecord[];
  } catch {
    return [];
  }
}

// Merges incoming records into the existing set.
// Key: courseId + section + term — same key replaces, new key appends.
// This means re-uploading a term updates it; old terms are preserved.
export function persistRecords(incoming: ClearingPriceRecord[]): void {
  const existing = loadPersistedRecords();
  const map = new Map<string, ClearingPriceRecord>();
  for (const r of [...existing, ...incoming]) {
    map.set(`${r.courseId}::${r.section}::${r.term}`, r);
  }
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(Array.from(map.values()), null, 2), "utf-8");
}

export function getStoredTerms(): string[] {
  const records = loadPersistedRecords();
  return [...new Set(records.map(r => r.term))].sort();
}
