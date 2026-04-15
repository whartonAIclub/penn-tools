import type { BidGuidance, ClearingPriceRecord } from "@penntools/tool-1/track4";
import { computeBidGuidance, SEED_RECORDS } from "@penntools/tool-1/track4";
import { WizardClient } from "./WizardClient";
import { MAJORS } from "./majorsData";
import { CATALOG_BY_ID } from "./courseCatalog";

function buildSeedGuidance(): BidGuidance[] {
  const groups = new Map<string, ClearingPriceRecord[]>();
  for (const r of SEED_RECORDS) {
    const key = `${r.courseId}::${r.section}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([key, records]) => {
      const sep = key.indexOf("::");
      return computeBidGuidance(key.slice(0, sep), key.slice(sep + 2), records);
    })
    .filter((g): g is BidGuidance => g !== null);
}

function getAllRequirementCourses() {
  const seen = new Set<string>();
  const result: { courseId: string; title: string; department: string }[] = [];
  for (const major of MAJORS) {
    for (const group of major.groups) {
      for (const courseId of group.courses) {
        if (seen.has(courseId)) continue;
        seen.add(courseId);
        const entry = CATALOG_BY_ID.get(courseId);
        result.push({ courseId, title: entry?.title ?? courseId, department: entry?.department ?? "" });
      }
    }
  }
  return result.sort((a, b) => a.courseId.localeCompare(b.courseId));
}

export default function Tool1Page() {
  const requirementCourses = getAllRequirementCourses();
  const guidance           = buildSeedGuidance();

  return (
    <WizardClient
      requirementCourses={requirementCourses}
      defaultGuidance={guidance}
      defaultStoredTerms={[]}
      isUsingSeedData={true}
    />
  );
}
