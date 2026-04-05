import type { ClearingPriceRecord } from "./types.js";

// Key: `${courseId}::${section}` — maps to all historical records for that section
type StoreKey = string;
const store = new Map<StoreKey, ClearingPriceRecord[]>();

function makeKey(courseId: string, section: string): StoreKey {
  return `${courseId}::${section}`;
}

export function upsertRecords(records: ClearingPriceRecord[]): void {
  for (const record of records) {
    const key = makeKey(record.courseId, record.section);
    const existing = store.get(key) ?? [];
    // Replace record for the same term if it already exists; otherwise append
    const idx = existing.findIndex(r => r.term === record.term);
    if (idx >= 0) {
      existing[idx] = record;
    } else {
      existing.push(record);
    }
    // Keep sorted oldest → newest
    existing.sort((a, b) => compareTerm(a.term, b.term));
    store.set(key, existing);
  }
}

export function getHistory(courseId: string, section: string): ClearingPriceRecord[] {
  return store.get(makeKey(courseId, section)) ?? [];
}

export function getAllCourseIds(): string[] {
  const ids = new Set<string>();
  for (const records of store.values()) {
    if (records[0]) ids.add(records[0].courseId);
  }
  return Array.from(ids).sort();
}

// Returns all known sections for a given course ID — lets Track 2 look up
// sections by course ID alone, before Track 3 narrows to a specific section.
export function getSectionsForCourse(courseId: string): string[] {
  const sections: string[] = [];
  for (const [key] of store.entries()) {
    const sep = key.indexOf("::");
    if (key.slice(0, sep) === courseId) {
      sections.push(key.slice(sep + 2));
    }
  }
  return sections.sort();
}

export function clearTerm(term: string): void {
  for (const [key, records] of store.entries()) {
    const filtered = records.filter(r => r.term !== term);
    if (filtered.length === 0) {
      store.delete(key);
    } else {
      store.set(key, filtered);
    }
  }
}

export function clearAll(): void {
  store.clear();
}

// Sorts "Fall2023" < "Spring2024" < "Fall2024" etc.
function compareTerm(a: string, b: string): number {
  const parse = (t: string) => {
    const m = t.match(/^(Spring|Summer|Fall)(\d{4})$/);
    if (!m) return 0;
    const year = parseInt(m[2] ?? "0", 10);
    const season = m[1] === "Spring" ? 0 : m[1] === "Summer" ? 1 : 2;
    return year * 10 + season;
  };
  return parse(a) - parse(b);
}
