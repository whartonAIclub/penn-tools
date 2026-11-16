import type { Person, SearchFilters } from "./types.js";

/** People who have worked in `industry`, newest class first, then by name. */
export function searchByIndustry(people: readonly Person[], industry: string, filters: SearchFilters = {}): Person[] {
  return people
    .filter(
      (p) =>
        p.industries.includes(industry) &&
        (!filters.program || p.program === filters.program) &&
        (filters.classYear === undefined || p.classYear === filters.classYear),
    )
    .sort((a, b) => b.classYear - a.classYear || a.name.localeCompare(b.name));
}

/** How many people have worked in each industry. */
export function industryCounts(people: readonly Person[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const person of people) {
    for (const industry of new Set(person.industries)) counts[industry] = (counts[industry] ?? 0) + 1;
  }
  return counts;
}
