import { COURSE_CATALOG } from "./catalogData.js";

// ── Major → likely department codes ───────────────────────────────────────
const MAJOR_TO_DEPTS: Record<string, string[]> = {
  // Engineering & CS
  "computer science":       ["CIS", "NETS", "ESE", "MCIT", "LGIC"],
  "cis":                    ["CIS", "NETS", "ESE"],
  "data science":           ["CIS", "STAT", "MATH", "ESE", "NETS"],
  "electrical engineering": ["ESE", "CIS", "PHYS"],
  "mechanical engineering": ["MEAM", "ESE", "PHYS"],
  "chemical engineering":   ["CBE", "CHEM", "BIOL"],
  "bioengineering":         ["BE", "BIOL", "CHEM", "CBE"],
  "systems engineering":    ["ESE", "OIDD", "CIS"],
  "computer engineering":   ["CIS", "ESE"],
  "nets":                   ["NETS", "CIS", "ESE"],

  // Wharton
  "finance":                ["FNCE", "ACCT", "BEPP", "REAL"],
  "accounting":             ["ACCT", "BEPP", "FNCE"],
  "marketing":              ["MKTG", "OIDD", "MGMT"],
  "management":             ["MGMT", "OIDD", "HCMG"],
  "operations":             ["OIDD", "STAT", "MGMT"],
  "real estate":            ["REAL", "FNCE", "BEPP"],
  "statistics":             ["STAT", "MATH", "CIS"],
  "business economics":     ["BEPP", "ECON", "FNCE"],
  "business analytics":     ["STAT", "OIDD", "CIS"],
  "healthcare management":  ["HCMG", "MGMT", "NURS"],

  // SAS — Social Sciences
  "economics":              ["ECON", "BEPP", "FNCE", "MATH"],
  "political science":      ["PSCI", "HSOC", "LGST"],
  "sociology":              ["SOCI", "CRIM", "HSOC"],
  "psychology":             ["PSYC", "BIBB", "NRSC"],
  "history":                ["HIST", "SOCI", "AFRC"],
  "philosophy":             ["PHIL", "LGIC", "RELS"],
  "international relations":["PSCI", "HIST", "ECON"],
  "communication":          ["COMM", "STSC", "SOCI"],
  "criminology":            ["CRIM", "SOCI", "PSYC"],
  "urban studies":          ["URBS", "SOCI", "HSOC"],
  "gender studies":         ["GSWS", "SOCI", "AFRC"],
  "african american studies":["AFRC", "HIST", "SOCI"],

  // SAS — Humanities
  "english":                ["ENGL", "COML", "WRIT"],
  "linguistics":            ["LING", "COML", "PSYC"],
  "mathematics":            ["MATH", "AMCS", "STAT"],
  "physics":                ["PHYS", "ASTR", "MATH"],
  "chemistry":              ["CHEM", "BIOL", "BIOC"],
  "biology":                ["BIOL", "BIBB", "BCHE"],
  "biochemistry":           ["BCHE", "CHEM", "BIOL"],
  "neuroscience":           ["NRSC", "BIBB", "PSYC", "BIOL"],
  "cognitive science":      ["COGS", "PSYC", "LING", "PHIL"],
  "environmental science":  ["ENVS", "EART", "BIOL"],
  "earth science":          ["EART", "ENVS", "PHYS"],

  // Penn Nursing / Social Policy / Education
  "nursing":                ["NURS", "BIOL", "HCMG"],
  "social work":            ["SWRK", "SOCI", "PSYC"],
  "education":              ["EDUC", "PSYC", "SOCI"],
  "health care":            ["HCMG", "NURS", "BIOL"],
  "public policy":          ["PPOL", "BEPP", "ECON"],
};

// ── Keyword scoring ────────────────────────────────────────────────────────
function tokenise(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function score(course: { dept: string; name: string }, keywords: string[]): number {
  let s = 0;
  const name = course.name.toLowerCase();
  const dept = course.dept.toLowerCase();
  for (const kw of keywords) {
    if (dept === kw) s += 4;
    else if (name.includes(kw)) s += 2;
  }
  return s;
}

// ── Main filter function ───────────────────────────────────────────────────
export function filterCourses(
  major: string,
  interests: string,
  targetRoles: string,
  maxResults = 20,
): string {
  // 1. Collect dept codes from major mapping
  const majorKey = major.toLowerCase().trim();
  const deptCodes = new Set<string>();
  for (const [key, depts] of Object.entries(MAJOR_TO_DEPTS)) {
    if (majorKey.includes(key) || key.includes(majorKey)) {
      depts.forEach((d) => deptCodes.add(d));
    }
  }

  // 2. Extract keywords from interests + target roles
  const keywords = [
    ...tokenise(interests),
    ...tokenise(targetRoles),
    ...tokenise(major),
  ].filter((w) => w.length > 3); // skip short stop words

  // 3. Score every course
  const scored = COURSE_CATALOG.map((c) => ({
    ...c,
    score: (deptCodes.has(c.dept) ? 6 : 0) + score(c, keywords),
  })).filter((c) => c.score > 0);

  // 4. Sort and take top N
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxResults);

  if (top.length === 0) return "";

  const lines = top.map((c) => `- ${c.code}: ${c.name}`).join("\n");
  return `### Relevant Penn courses (from 2025–26 catalog)\n${lines}\n\nNote: verify availability and prerequisites at https://catalog.upenn.edu/courses/`;
}
