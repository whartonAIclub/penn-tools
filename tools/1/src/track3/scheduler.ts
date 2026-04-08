import type { RawSection, Meeting, Section, CourseGroup, ShortlistItem, ScheduleSolution } from "./types.js";

export const GRID_START_HOUR = 8;
export const GRID_END_HOUR   = 21;
export const SLOT_MINUTES    = 30;
export const SLOTS_PER_DAY   = ((GRID_END_HOUR - GRID_START_HOUR) * 60) / SLOT_MINUTES;

const DEPARTMENTS = ["ACCT","BEPP","FNCE","HCMG","LGST","MGMT","MKTG","OIDD","REAL","STAT","WHCP"];

// ── Cross-listing helpers ───────────────────────────────────────────

function parseCrossListIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
}

function buildCrossListClusters(rows: RawSection[]): string[][] {
  const nbr: Record<string, string[]> = {};
  function link(a: string, b: string) {
    (nbr[a] ??= []).includes(b) || nbr[a]!.push(b);
    (nbr[b] ??= []).includes(a) || nbr[b]!.push(a);
  }
  for (const r of rows) {
    link(r.courseId, r.courseId);
    for (const x of parseCrossListIds(r.crossListedAs)) link(r.courseId, x);
  }
  const visited: Record<string, boolean> = {};
  const components: string[][] = [];
  for (const start of Object.keys(nbr)) {
    if (visited[start]) continue;
    const stack = [start];
    const comp: string[] = [];
    visited[start] = true;
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of nbr[u] ?? []) {
        if (!visited[v]) { visited[v] = true; stack.push(v); }
      }
    }
    comp.sort();
    components.push(comp);
  }
  return components;
}

// ── Time parsing ────────────────────────────────────────────────────

function parseCu(v: string | number): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function parseTimePart(t: string): number {
  const s = t.trim().toLowerCase().replace(/\./g, "");
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([ap])?$/);
  if (!m) return 0;
  let h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  const ap = m[3] ?? "";
  if (ap === "p" && h !== 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return h * 60 + min;
}

function parseTimeRange(range: string): { start: number; end: number } {
  const parts = range.split(/\s*-\s*/);
  return { start: parseTimePart(parts[0] ?? ""), end: parseTimePart(parts[1] ?? "") };
}

function expandDays(raw: string): number[] {
  const s = raw.trim().toUpperCase();
  if (s === "MW") return [0, 2];
  if (s === "TR") return [1, 3];
  if (s === "M")  return [0];
  if (s === "T")  return [1];
  if (s === "W")  return [2];
  if (s === "R")  return [3];
  const out: number[] = [];
  for (const ch of s) {
    if (ch === "M") out.push(0);
    else if (ch === "T") out.push(1);
    else if (ch === "W") out.push(2);
    else if (ch === "R") out.push(3);
    else if (ch === "F") out.push(4);
  }
  return [...new Set(out)];
}

function sectionToMeetings(row: RawSection): Meeting[] {
  const { start, end } = parseTimeRange(row.time);
  const q = String(row.quarter || "Full").trim();
  return expandDays(row.days).map(day => ({ day, start, end, quarter: q }));
}

// ── Conflict detection ──────────────────────────────────────────────

function quarterToSet(q: string): { Q1: boolean; Q2: boolean } {
  const u = q.trim();
  if (u.toLowerCase() === "full") return { Q1: true, Q2: true };
  if (u === "Q1") return { Q1: true, Q2: false };
  if (u === "Q2") return { Q1: false, Q2: true };
  return { Q1: true, Q2: true };
}

function quartersConflict(q1: string, q2: string): boolean {
  const A = quarterToSet(q1), B = quarterToSet(q2);
  return (A.Q1 && B.Q1) || (A.Q2 && B.Q2);
}

function meetingsOverlap(m1: Meeting, m2: Meeting): boolean {
  if (m1.day !== m2.day) return false;
  if (!quartersConflict(m1.quarter, m2.quarter)) return false;
  return m1.start < m2.end && m1.end > m2.start;
}

function sectionsConflict(a: Section, b: Section): boolean {
  for (const ma of a.meetings) for (const mb of b.meetings) if (meetingsOverlap(ma, mb)) return true;
  return false;
}

export function blockedFromCells(cellKeys: Set<string>): Meeting[] {
  return [...cellKeys].map(key => {
    const [d, s] = key.split("-");
    const slot  = parseInt(s ?? "0", 10);
    const start = GRID_START_HOUR * 60 + slot * SLOT_MINUTES;
    return { day: parseInt(d ?? "0", 10), start, end: start + SLOT_MINUTES, quarter: "Full" };
  });
}

function conflictsBlocked(sec: Section, blocked: Meeting[]): boolean {
  for (const ms of sec.meetings) {
    for (const b of blocked) {
      if (ms.day !== b.day) continue;
      if (!quartersConflict(ms.quarter, b.quarter)) continue;
      if (ms.start < b.end && ms.end > b.start) return true;
    }
  }
  return false;
}

// ── Catalog builder ─────────────────────────────────────────────────

export function buildCourseCatalog(rows: RawSection[]): CourseGroup[] {
  const clusters = buildCrossListClusters(rows);
  const idToKey: Record<string, string> = {};
  for (const cluster of clusters) {
    const key = cluster.join("|");
    for (const id of cluster) idToKey[id] = key;
  }

  const groups: Record<string, CourseGroup> = {};
  for (const raw of rows) {
    const gk = idToKey[raw.courseId] ?? raw.courseId;
    if (!groups[gk]) {
      groups[gk] = { groupKey: gk, courseIds: [], displayCourseIds: "", title: raw.courseTitle,
        cu: 0, departments: [], sections: [] };
    }
    const g = groups[gk]!;
    if (!g.courseIds.includes(raw.courseId)) g.courseIds.push(raw.courseId);
    if (!g.departments.includes(raw.department)) g.departments.push(raw.department);
    g.sections.push({
      sectionId: raw.sectionId, courseId: raw.courseId, courseTitle: raw.courseTitle,
      days: raw.days, time: raw.time, quarter: raw.quarter, instructor: raw.instructor,
      cu: parseCu(raw.cu), department: raw.department, meetings: sectionToMeetings(raw),
    });
  }

  for (const g of Object.values(groups)) {
    // Expand courseIds to full cluster and add implied departments
    const cluster = clusters.find(c => c.includes(g.courseIds[0] ?? "")) ?? g.courseIds;
    g.courseIds = [...cluster].sort();
    g.displayCourseIds = g.courseIds.join(" / ");
    const depts = new Set(g.departments);
    for (const id of g.courseIds) depts.add(id.split(" ")[0] ?? "");
    g.departments = [...depts].filter(d => DEPARTMENTS.includes(d)).sort();
    g.cu = Math.max(...g.sections.map(s => s.cu), 0);
  }

  return Object.values(groups).sort((a, b) => a.displayCourseIds.localeCompare(b.displayCourseIds));
}

// ── Scheduler ───────────────────────────────────────────────────────

function priorityWeight(p: string): number {
  return p === "high" ? 3 : p === "low" ? 1 : 2;
}

function partitionShortlist(list: ShortlistItem[]): ShortlistItem[] {
  return [
    ...list.filter(x => x.priority === "high"),
    ...list.filter(x => x.priority === "medium"),
    ...list.filter(x => x.priority === "low"),
  ];
}

function schedulePriorityScore(ordered: ShortlistItem[], chosen: Section[]): number {
  let score = 0;
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i]!;
    if (chosen.some(s => item.courseGroup.courseIds.includes(s.courseId))) {
      score += priorityWeight(item.priority) * (ordered.length - i);
    }
  }
  return score;
}

function totalCu(shortlist: ShortlistItem[], chosen: Section[]): number {
  let t = 0;
  for (const item of shortlist) {
    if (chosen.some(s => item.courseGroup.courseIds.includes(s.courseId))) t += item.courseGroup.cu;
  }
  return t;
}

function mediumLowCounts(partitioned: ShortlistItem[], chosen: Section[]): { medium: number; low: number } {
  let medium = 0, low = 0;
  for (const item of partitioned) {
    if (!chosen.some(s => item.courseGroup.courseIds.includes(s.courseId))) continue;
    if (item.priority === "medium") medium++;
    else if (item.priority === "low") low++;
  }
  return { medium, low };
}

function cuBand(cu: number, target: number): number {
  const d = Math.abs(cu - target);
  if (d < 0.06) return 0;
  if (d <= 0.55) return 1;
  if (d <= 1.05) return 2;
  return 3 + d;
}

export function findViableSchedules(
  shortlist: ShortlistItem[],
  blockedCells: Set<string>,
  targetCu: number,
  maxSolutions: number,
): ScheduleSolution[] {
  const blocked    = blockedFromCells(blockedCells);
  const partitioned = partitionShortlist(shortlist);
  const n          = partitioned.length;
  const solutions: ScheduleSolution[] = [];
  if (n === 0) return solutions;

  const MAX_RAW = Math.max(25000, maxSolutions * 500);

  function dfs(idx: number, chosen: Section[]): void {
    if (solutions.length >= MAX_RAW) return;
    if (idx === n) {
      if (chosen.length === 0) return;
      const cu = totalCu(partitioned, chosen);
      const ml = mediumLowCounts(partitioned, chosen);
      solutions.push({ sections: [...chosen], totalCu: cu, gapsFilled: 0,
        priorityScore: schedulePriorityScore(partitioned, chosen),
        mediumCount: ml.medium, lowCount: ml.low });
      return;
    }
    const item   = partitioned[idx]!;
    const isHigh = item.priority === "high";
    for (const sec of item.courseGroup.sections) {
      if (conflictsBlocked(sec, blocked)) continue;
      if (chosen.some(c => sectionsConflict(sec, c))) continue;
      chosen.push(sec);
      dfs(idx + 1, chosen);
      chosen.pop();
      if (solutions.length >= MAX_RAW) return;
    }
    if (!isHigh) dfs(idx + 1, chosen);
  }

  dfs(0, []);

  solutions.sort((a, b) => {
    const ba = cuBand(a.totalCu, targetCu), bb = cuBand(b.totalCu, targetCu);
    if (ba !== bb) return ba - bb;
    const da = Math.abs(a.totalCu - targetCu), db = Math.abs(b.totalCu - targetCu);
    if (Math.abs(da - db) > 0.02) return da - db;
    if (b.mediumCount !== a.mediumCount) return b.mediumCount - a.mediumCount;
    if (a.lowCount !== b.lowCount) return a.lowCount - b.lowCount;
    const ua = a.totalCu <= targetCu + 0.02, ub = b.totalCu <= targetCu + 0.02;
    if (ua !== ub) return ua ? -1 : 1;
    return b.priorityScore - a.priorityScore;
  });

  const out: ScheduleSolution[] = [];
  const seen = new Set<string>();
  for (const sol of solutions) {
    if (out.length >= maxSolutions) break;
    const sig = [...sol.sections].map(s => s.sectionId).sort().join(",");
    if (!seen.has(sig)) { seen.add(sig); out.push(sol); }
  }
  return out;
}

export function explainFailure(shortlist: ShortlistItem[], blockedCells: Set<string>): string {
  if (!shortlist.length) return "Shortlist is empty. Add courses in step 1.";
  const blocked    = blockedFromCells(blockedCells);
  const partitioned = partitionShortlist(shortlist);
  const highs      = partitioned.filter(x => x.priority === "high");

  for (const item of highs) {
    if (!item.courseGroup.sections.some(s => !conflictsBlocked(s, blocked))) {
      return `All sections of ${item.courseGroup.displayCourseIds} (${item.courseGroup.title}) overlap your blocked times.`;
    }
  }

  if (highs.length > 0) {
    let ok = false;
    function dfsHigh(i: number, chosen: Section[]): void {
      if (ok) return;
      if (i === highs.length) { ok = true; return; }
      for (const sec of highs[i]!.courseGroup.sections) {
        if (conflictsBlocked(sec, blocked)) continue;
        if (chosen.some(c => sectionsConflict(sec, c))) continue;
        chosen.push(sec);
        dfsHigh(i + 1, chosen);
        chosen.pop();
        if (ok) return;
      }
    }
    dfsHigh(0, []);
    if (!ok) return "Your high-priority courses have no combination of sections that fit together without time overlaps. Try different sections or change which courses are marked High.";
  }

  return "No viable schedule was found. Try adjusting blocked times, target CU, or the shortlist.";
}
