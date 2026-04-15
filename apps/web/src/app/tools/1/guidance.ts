import { computeBidGuidance } from "@penntools/tool-1/track4";
import type { BidGuidance, ClearingPriceRecord } from "@penntools/tool-1/track4";

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
      recs.sort((a, b) => a.term.localeCompare(b.term));
      return computeBidGuidance(courseId, section, recs);
    })
    .filter((g): g is BidGuidance => g !== null);
}
