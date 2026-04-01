/**
 * CourseMatch Assist - application logic (loads after REAL_DATA_SECTIONS).
 * Expects: const REAL_DATA_SECTIONS = [...] from Excel embed.
 */

const { useMemo, useState, useRef, useEffect } = React;

// -----------------------------------------------------------------------------
// MOCK DATA - replace with Track 1 transcript parser output
// -----------------------------------------------------------------------------
const STUDENT_PROFILE = {
  studentId: "MOCK-WG26-0142",
  displayName: "Alex Chen",
  program: "MBA",
  graduationTerm: "Spring 2027",
  completedCourseIds: ["FNCE 6110", "MGMT 6120", "OIDD 6120", "LGST 6120", "MKTG 6120", "MGMT 6110", "STAT 7700"],
  requirementRows: [
    { key: "fixed-core", label: "Fixed core (6 courses)", kind: "complete", detail: "All six fixed core courses satisfied." },
    { key: "major-depth", label: "Major depth electives", kind: "complete", detail: "FNCE depth requirement met." },
    {
      key: "mgmt-half",
      label: "MGMT 0.5 credit (Year 2)",
      kind: "gap",
      detail: "Need one 0.5 cu MGMT offering.",
      fulfillsCourseIds: ["MGMT 7010", "MGMT 8010", "MGMT 8040", "MGMT 7400", "MGMT 7720", "MGMT 8710", "MGMT 7850", "MGMT 6240", "MGMT 6250", "MGMT 7230"],
    },
    {
      key: "non-major-elective",
      label: "Elective outside home department",
      kind: "gap",
      detail: "Need one course primarily outside FNCE.",
      fulfillsCourseIds: ["MKTG 7110", "MKTG 7120", "OIDD 6140", "OIDD 6150", "HCMG 8580", "LGST 8130", "REAL 8210", "BEPP 6200"],
    },
    { key: "stat-analytics", label: "Statistics / analytics", kind: "complete", detail: "STAT 7700 completed." },
  ],
};

// -----------------------------------------------------------------------------
// MOCK DATA - replace with Track 2 historical clearing prices
// -----------------------------------------------------------------------------
const MOCK_CLEARING_PRICES = {
  defaultMedianPoints: 2000,
  byCoursePrefix: [
    { prefix: "FNCE", min: 1800, max: 3200, tier: "competitive" },
    { prefix: "MGMT", min: 1200, max: 2600, tier: "competitive" },
    { prefix: "OIDD", min: 1000, max: 2400, tier: "safe" },
    { prefix: "LGST", min: 800, max: 2000, tier: "safe" },
    { prefix: "MKTG", min: 1400, max: 2800, tier: "competitive" },
    { prefix: "HCMG", min: 900, max: 1900, tier: "safe" },
    { prefix: "STAT", min: 1100, max: 2500, tier: "competitive" },
    { prefix: "ACCT", min: 1300, max: 2700, tier: "competitive" },
    { prefix: "BEPP", min: 1000, max: 2200, tier: "safe" },
    { prefix: "REAL", min: 1200, max: 2600, tier: "competitive" },
    { prefix: "WHCP", min: 500, max: 1500, tier: "reach" },
  ],
};

// -----------------------------------------------------------------------------
// PLACEHOLDER - replace with Track 4 recommendation engine
// -----------------------------------------------------------------------------
function track4BiddingPlaceholder(courseGroup, section, clearingRow) {
  return {
    estimatedBidRange: clearingRow.min + " - " + clearingRow.max + " pts (mock)",
    tier: clearingRow.tier,
    note: "Track 4 engine: combine clearing history, demand, and student strategy.",
  };
}

function lookupClearingRow(courseGroup) {
  if (!courseGroup) return { prefix: "*", min: 900, max: 2200, tier: "competitive" };
  const firstId = courseGroup.displayCourseIds.split(" / ")[0] || "";
  const prefix = firstId.split(" ")[0] || "";
  for (let i = 0; i < MOCK_CLEARING_PRICES.byCoursePrefix.length; i++) {
    const r = MOCK_CLEARING_PRICES.byCoursePrefix[i];
    if (prefix === r.prefix) return r;
  }
  return { prefix: "*", min: 800, max: 2200, tier: "competitive" };
}

const DEPARTMENTS = ["ACCT", "BEPP", "FNCE", "HCMG", "LGST", "MGMT", "MKTG", "OIDD", "REAL", "STAT", "WHCP"];
const CAL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 21;
const SLOT_MINUTES = 30;
const SLOTS_PER_DAY = ((GRID_END_HOUR - GRID_START_HOUR) * 60) / SLOT_MINUTES;

function parseCrossListIds(crossListedAs) {
  if (!crossListedAs || !String(crossListedAs).trim()) return [];
  return String(crossListedAs)
    .split(/\s*\/\s*/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

function buildCrossListClusters(rows) {
  const neighbors = {};
  function add(a, b) {
    if (!neighbors[a]) neighbors[a] = [];
    if (!neighbors[b]) neighbors[b] = [];
    if (neighbors[a].indexOf(b) === -1) neighbors[a].push(b);
    if (neighbors[b].indexOf(a) === -1) neighbors[b].push(a);
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cid = r.courseId;
    parseCrossListIds(r.crossListedAs).forEach(function (x) {
      add(cid, x);
    });
    add(cid, cid);
  }
  const visited = {};
  const components = [];
  const ids = Object.keys(neighbors);
  for (let i = 0; i < ids.length; i++) {
    const start = ids[i];
    if (visited[start]) continue;
    const stack = [start];
    const comp = [];
    visited[start] = true;
    while (stack.length) {
      const u = stack.pop();
      comp.push(u);
      const nbr = neighbors[u] || [];
      for (let j = 0; j < nbr.length; j++) {
        const v = nbr[j];
        if (!visited[v]) {
          visited[v] = true;
          stack.push(v);
        }
      }
    }
    comp.sort();
    components.push(comp);
  }
  return components;
}

function parseCu(v) {
  const n = parseFloat(v, 10);
  return isNaN(n) ? 0 : n;
}

function parseTimePart(t) {
  const s = String(t).trim().toLowerCase().replace(/\./g, "");
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([ap])?$/);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3];
  if (ap === "p" && h !== 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return h * 60 + min;
}

function parseTimeRange(range) {
  const parts = String(range).split(/\s*-\s*/);
  if (parts.length < 2) return { start: 0, end: 0 };
  return { start: parseTimePart(parts[0]), end: parseTimePart(parts[1]) };
}

function expandDays(daysStr) {
  const s = String(daysStr || "").trim().toUpperCase();
  const out = [];
  if (s === "MW") return [0, 2];
  if (s === "TR") return [1, 3];
  if (s === "M") return [0];
  if (s === "T") return [1];
  if (s === "W") return [2];
  if (s === "R") return [3];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "M") out.push(0);
    else if (ch === "T") out.push(1);
    else if (ch === "W") out.push(2);
    else if (ch === "R") out.push(3);
    else if (ch === "F") out.push(4);
  }
  return out.filter(function (d, idx, a) {
    return a.indexOf(d) === idx;
  });
}

function sectionToMeetings(row) {
  const tr = parseTimeRange(row.time);
  const dayIndices = expandDays(row.days);
  const q = String(row.quarter || "Full").trim();
  const meetings = [];
  for (let i = 0; i < dayIndices.length; i++) {
    meetings.push({ day: dayIndices[i], start: tr.start, end: tr.end, quarter: q });
  }
  return meetings;
}

/** Q1 / Q2 = one half-semester each; Full = both halves. Overlap only if both occupy the same half. */
function quarterToSet(q) {
  const u = String(q).trim();
  if (u.toLowerCase() === "full") return { Q1: true, Q2: true };
  if (u === "Q1") return { Q1: true };
  if (u === "Q2") return { Q2: true };
  return { Q1: true, Q2: true };
}

function quartersConflict(q1, q2) {
  const A = quarterToSet(q1);
  const B = quarterToSet(q2);
  return !!(A.Q1 && B.Q1) || !!(A.Q2 && B.Q2);
}

function meetingBlocksOverlap(m1, m2) {
  if (m1.day !== m2.day) return false;
  if (!quartersConflict(m1.quarter, m2.quarter)) return false;
  return m1.start < m2.end && m1.end > m2.start;
}

function sectionAllMeetings(section) {
  return section.meetings || [];
}

function sectionsTimeConflict(a, b) {
  const ma = sectionAllMeetings(a);
  const mb = sectionAllMeetings(b);
  for (let i = 0; i < ma.length; i++) {
    for (let j = 0; j < mb.length; j++) {
      if (meetingBlocksOverlap(ma[i], mb[j])) return true;
    }
  }
  return false;
}

function blockedIntervalsFromCells(cellKeys) {
  const list = [];
  cellKeys.forEach(function (key) {
    const parts = key.split("-");
    const d = parseInt(parts[0], 10);
    const slot = parseInt(parts[1], 10);
    const start = GRID_START_HOUR * 60 + slot * SLOT_MINUTES;
    const end = start + SLOT_MINUTES;
    list.push({ day: d, start: start, end: end, quarter: "Full" });
  });
  return list;
}

function sectionConflictsBlocked(section, blockedIntervals) {
  const ms = sectionAllMeetings(section);
  for (let i = 0; i < ms.length; i++) {
    for (let j = 0; j < blockedIntervals.length; j++) {
      const b = blockedIntervals[j];
      if (ms[i].day !== b.day) continue;
      if (!quartersConflict(ms[i].quarter, b.quarter)) continue;
      if (ms[i].start < b.end && ms[i].end > b.start) return true;
    }
  }
  return false;
}

function clusterContaining(clusters, courseId) {
  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i].indexOf(courseId) !== -1) return clusters[i].slice();
  }
  return [courseId];
}

function buildCourseCatalogFromExcel(rows) {
  const clusters = buildCrossListClusters(rows);
  const idToGroupKey = {};
  for (let i = 0; i < clusters.length; i++) {
    const key = clusters[i].join("|");
    for (let j = 0; j < clusters[i].length; j++) {
      idToGroupKey[clusters[i][j]] = key;
    }
  }
  const groups = {};
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const gk = idToGroupKey[raw.courseId] || raw.courseId;
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        courseIds: [],
        displayCourseIds: "",
        title: raw.courseTitle,
        cu: parseCu(raw.cu),
        departments: [],
        sections: [],
        notesSamples: [],
      };
    }
    const g = groups[gk];
    if (g.courseIds.indexOf(raw.courseId) === -1) g.courseIds.push(raw.courseId);
    if (raw.notes && g.notesSamples.indexOf(raw.notes) === -1 && g.notesSamples.length < 3) g.notesSamples.push(raw.notes);
    if (g.departments.indexOf(raw.department) === -1) g.departments.push(raw.department);
    const sectionObj = {
      sectionId: raw.sectionId,
      courseId: raw.courseId,
      courseTitle: raw.courseTitle,
      days: raw.days,
      time: raw.time,
      quarter: raw.quarter,
      instructor: raw.instructor,
      cu: parseCu(raw.cu),
      department: raw.department,
      meetings: sectionToMeetings(raw),
    };
    g.sections.push(sectionObj);
  }
  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    const comp = clusterContaining(clusters, g.courseIds[0]);
    g.courseIds = comp.slice().sort();
    g.displayCourseIds = g.courseIds.join(" / ");
    const deptSet = {};
    for (let d = 0; d < g.departments.length; d++) {
      deptSet[g.departments[d]] = true;
    }
    for (let c = 0; c < comp.length; c++) {
      const prefix = comp[c].split(" ")[0];
      if (DEPARTMENTS.indexOf(prefix) !== -1) deptSet[prefix] = true;
    }
    g.departments = Object.keys(deptSet).sort();
  });
  const catalog = Object.keys(groups).map(function (k) {
    return groups[k];
  });
  catalog.forEach(function (g) {
    let maxCu = 0;
    for (let i = 0; i < g.sections.length; i++) {
      if (g.sections[i].cu > maxCu) maxCu = g.sections[i].cu;
    }
    if (maxCu > 0) g.cu = maxCu;
  });
  catalog.sort(function (a, b) {
    return a.displayCourseIds.localeCompare(b.displayCourseIds);
  });
  return catalog;
}

function courseGroupFillsGapLabels(courseGroup) {
  const hits = [];
  const rows = STUDENT_PROFILE.requirementRows || [];
  const hayIds = courseGroup.courseIds.join(" ");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.kind !== "gap" || !r.fulfillsCourseIds) continue;
    const list = r.fulfillsCourseIds;
    for (let j = 0; j < list.length; j++) {
      const fid = list[j];
      if (hayIds.indexOf(fid) !== -1) {
        hits.push(r.label);
        break;
      }
    }
  }
  return hits;
}

function countGapsFilledBySchedule(chosenSections) {
  const chosenIds = {};
  chosenSections.forEach(function (sec) {
    chosenIds[sec.courseId] = true;
  });
  let count = 0;
  const rows = STUDENT_PROFILE.requirementRows || [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.kind !== "gap" || !r.fulfillsCourseIds) continue;
    const list = r.fulfillsCourseIds;
    let filled = false;
    for (let j = 0; j < list.length; j++) {
      if (chosenIds[list[j]]) {
        filled = true;
        break;
      }
    }
    if (filled) count++;
  }
  return count;
}

function priorityWeight(p) {
  if (p === "high") return 3;
  if (p === "low") return 1;
  return 2;
}

/** High first, then medium, then low; preserves drag order within each tier. */
function partitionShortlistForScheduler(list) {
  const h = [];
  const m = [];
  const l = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i].priority;
    if (p === "high") h.push(list[i]);
    else if (p === "low") l.push(list[i]);
    else m.push(list[i]);
  }
  return h.concat(m).concat(l);
}

function schedulePriorityScore(orderedShortlist, chosenSections) {
  const byGk = {};
  chosenSections.forEach(function (s) {
    for (let i = 0; i < orderedShortlist.length; i++) {
      if (orderedShortlist[i].courseGroup.courseIds.indexOf(s.courseId) !== -1) {
        byGk[orderedShortlist[i].courseGroup.groupKey] = s;
        break;
      }
    }
  });
  let score = 0;
  for (let i = 0; i < orderedShortlist.length; i++) {
    const item = orderedShortlist[i];
    if (!byGk[item.courseGroup.groupKey]) continue;
    score += priorityWeight(item.priority) * (orderedShortlist.length - i);
  }
  return score;
}

function mediumLowIncludedCounts(partitioned, chosen) {
  let medium = 0;
  let low = 0;
  for (let i = 0; i < partitioned.length; i++) {
    const item = partitioned[i];
    const g = item.courseGroup;
    const hit = chosen.some(function (s) {
      return g.courseIds.indexOf(s.courseId) !== -1;
    });
    if (!hit) continue;
    if (item.priority === "medium") medium++;
    else if (item.priority === "low") low++;
  }
  return { medium: medium, low: low };
}

function cuAcceptableBand(sol, targetCu) {
  const d = Math.abs(sol.totalCu - targetCu);
  if (d < 0.06) return 0;
  if (d <= 0.55) return 1;
  if (d <= 1.05) return 2;
  return 3 + d;
}

function totalCuFromChosenSections(orderedShortlist, chosen) {
  let t = 0;
  for (let i = 0; i < orderedShortlist.length; i++) {
    const g = orderedShortlist[i].courseGroup;
    const hit = chosen.some(function (s) {
      return g.courseIds.indexOf(s.courseId) !== -1;
    });
    if (hit) t += g.cu;
  }
  return t;
}

/**
 * Scheduler: list is partitioned [all high][all medium][all low] (drag order within tier).
 * High: MUST pick exactly one feasible section (no skip). Medium/low: skip or one section.
 * Blocked times: strict via sectionConflictsBlocked + Full-quarter blocks vs section meetings.
 * Quarter overlap: Q1 vs Q2 same clock do not conflict; Full overlaps Q1 and Q2.
 * Ranks: CU band (exact, then ~0.5 off), distance, gaps filled, more medium, fewer low.
 */
function findViableSchedules(orderedShortlist, blockedCellKeys, targetCu, maxSolutions) {
  const blocked = blockedIntervalsFromCells(blockedCellKeys);
  const solutions = [];
  const partitioned = partitionShortlistForScheduler(orderedShortlist);
  const n = partitioned.length;
  if (n === 0) return solutions;

  const MAX_RAW = Math.max(25000, maxSolutions * 500);

  function dfs(idx, chosen) {
    if (solutions.length >= MAX_RAW) return;
    if (idx === n) {
      if (chosen.length === 0) return;
      const cu = totalCuFromChosenSections(partitioned, chosen);
      const ml = mediumLowIncludedCounts(partitioned, chosen);
      solutions.push({
        sections: chosen.slice(),
        totalCu: cu,
        gapsFilled: countGapsFilledBySchedule(chosen),
        priorityScore: schedulePriorityScore(partitioned, chosen),
        mediumCount: ml.medium,
        lowCount: ml.low,
      });
      return;
    }

    const item = partitioned[idx];
    const isHigh = item.priority === "high";
    const secs = item.courseGroup.sections;

    for (let s = 0; s < secs.length; s++) {
      const sec = secs[s];
      if (sectionConflictsBlocked(sec, blocked)) continue;
      let ok = true;
      for (let c = 0; c < chosen.length; c++) {
        if (sectionsTimeConflict(sec, chosen[c])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      chosen.push(sec);
      dfs(idx + 1, chosen);
      chosen.pop();
      if (solutions.length >= MAX_RAW) return;
    }

    if (!isHigh) {
      dfs(idx + 1, chosen);
    }
  }
  dfs(0, []);

  function cuGap(sol) {
    return Math.abs(sol.totalCu - targetCu);
  }

  solutions.sort(function (a, b) {
    const bandA = cuAcceptableBand(a, targetCu);
    const bandB = cuAcceptableBand(b, targetCu);
    if (bandA !== bandB) return bandA - bandB;
    const gA = cuGap(a);
    const gB = cuGap(b);
    if (Math.abs(gA - gB) > 0.02) return gA - gB;
    if (b.gapsFilled !== a.gapsFilled) return b.gapsFilled - a.gapsFilled;
    if (b.mediumCount !== a.mediumCount) return b.mediumCount - a.mediumCount;
    if (a.lowCount !== b.lowCount) return a.lowCount - b.lowCount;
    var underA = a.totalCu <= targetCu + 0.02;
    var underB = b.totalCu <= targetCu + 0.02;
    if (underA !== underB) return underA ? -1 : 1;
    return b.priorityScore - a.priorityScore;
  });

  const out = [];
  const seenSig = {};
  for (let i = 0; i < solutions.length && out.length < maxSolutions; i++) {
    const sig = solutions[i].sections
      .map(function (s) {
        return s.sectionId;
      })
      .sort()
      .join(",");
    if (seenSig[sig]) continue;
    seenSig[sig] = true;
    out.push(solutions[i]);
  }
  return out;
}

function explainScheduleFailure(orderedShortlist, blockedCellKeys, targetCu) {
  if (!orderedShortlist.length) return "Shortlist is empty. Add courses on the previous step.";
  const blocked = blockedIntervalsFromCells(blockedCellKeys);
  const partitioned = partitionShortlistForScheduler(orderedShortlist);
  const highs = partitioned.filter(function (item) {
    return item.priority === "high";
  });

  for (let i = 0; i < highs.length; i++) {
    const g = highs[i].courseGroup;
    let anyClear = false;
    for (let s = 0; s < g.sections.length; s++) {
      if (!sectionConflictsBlocked(g.sections[s], blocked)) {
        anyClear = true;
        break;
      }
    }
    if (!anyClear) {
      return (
        "All sections of " +
        g.displayCourseIds +
        " (" +
        g.title +
        ") overlap your blocked times. Relax those blocks or change your availability."
      );
    }
  }

  if (highs.length > 0) {
    let highsOk = false;
    function dfsHigh(i, chosen) {
      if (highsOk) return;
      if (i === highs.length) {
        highsOk = true;
        return;
      }
      const secs = highs[i].courseGroup.sections;
      for (let s = 0; s < secs.length; s++) {
        const sec = secs[s];
        if (sectionConflictsBlocked(sec, blocked)) continue;
        let ok = true;
        for (let c = 0; c < chosen.length; c++) {
          if (sectionsTimeConflict(sec, chosen[c])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        chosen.push(sec);
        dfsHigh(i + 1, chosen);
        chosen.pop();
        if (highsOk) return;
      }
    }
    dfsHigh(0, []);
    if (!highsOk) {
      return (
        "Your high-priority courses have no combination of sections that fit together without time overlaps (Q1 vs Q2 at the same clock time is allowed). Try different sections or change which courses are marked High."
      );
    }
  }

  if (highs.length > 0) {
    return (
      "No ranked schedule matched your target of about " +
      targetCu +
      " CU while including every high-priority course and staying conflict-free. Try target CU, blocks, or moving a course from High to Medium."
    );
  }
  return "No viable schedule was built from your shortlist with these blocks (for example, every section of a course may be unavailable). Adjust availability or the shortlist.";
}

function buildSectionColorMap(sections) {
  const paletteN = 6;
  const map = {};
  let next = 0;
  for (let i = 0; i < sections.length; i++) {
    const id = sections[i].sectionId;
    if (map[id] === undefined) {
      map[id] = next % paletteN;
      next++;
    }
  }
  return map;
}

function WizardNav(props) {
  const el = React.createElement;
  const step = props.step;
  return el(
    "nav",
    { className: "wizard-nav" },
    el("span", { className: step === 1 ? "wizard-step active" : "wizard-step" }, "1. Courses"),
    el("span", { className: "wizard-arrow" }, "→"),
    el("span", { className: step === 2 ? "wizard-step active" : "wizard-step" }, "2. Availability"),
    el("span", { className: "wizard-arrow" }, "→"),
    el("span", { className: step === 3 ? "wizard-step active" : "wizard-step" }, "3. Results"),
  );
}

function StudentProfilePanel() {
  const el = React.createElement;
  const rows = STUDENT_PROFILE.requirementRows || [];
  return el(
    "div",
    { className: "profile-panel" },
    el("h3", { className: "profile-heading" }, "Student profile"),
    el("p", { className: "profile-meta" }, STUDENT_PROFILE.displayName + " · " + STUDENT_PROFILE.studentId),
    el(
      "ul",
      { className: "req-list" },
      rows.map(function (r) {
        return el(
          "li",
          { key: r.key, className: "req-item " + (r.kind === "gap" ? "req-gap" : "req-ok") },
          el("span", { className: "req-badge" }, r.kind === "gap" ? "Gap" : "OK"),
          el("span", { className: "req-label" }, r.label),
          el("span", { className: "req-detail" }, r.detail),
        );
      }),
    ),
  );
}

function PagePickerCalendar(props) {
  const el = React.createElement;
  const blockedCells = props.blockedCells;
  const setBlockedCells = props.setBlockedCells;
  const dragging = useRef(false);
  const paintBlocking = useRef(true);
  useEffect(
    function () {
      function onUp() {
        dragging.current = false;
      }
      window.addEventListener("mouseup", onUp);
      return function () {
        window.removeEventListener("mouseup", onUp);
      };
    },
    [],
  );
  const slotLabels = [];
  for (let s = 0; s < SLOTS_PER_DAY; s++) {
    const minutes = GRID_START_HOUR * 60 + s * SLOT_MINUTES;
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    slotLabels.push(hh + ":" + (mm < 10 ? "0" : "") + mm);
  }
  function toggleCell(d, slot, forceBlock) {
    const key = d + "-" + slot;
    setBlockedCells(function (prev) {
      const next = new Set(prev);
      const block = forceBlock !== undefined ? forceBlock : !next.has(key);
      if (block) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  const rows = CAL_DAYS.map(function (day, dIdx) {
    return el(
      "div",
      { key: day, className: "cal-row" },
      el("div", { className: "cal-day-label" }, day.slice(0, 3)),
      el(
        "div",
        { className: "cal-slots" },
        slotLabels.map(function (_, slot) {
          const key = dIdx + "-" + slot;
          const on = blockedCells.has(key);
          return el("div", {
            key: key,
            className: "cal-cell" + (on ? " blocked" : ""),
            onMouseDown: function () {
              dragging.current = true;
              paintBlocking.current = !on;
              toggleCell(dIdx, slot, paintBlocking.current);
            },
            onMouseEnter: function () {
              if (!dragging.current) return;
              toggleCell(dIdx, slot, paintBlocking.current);
            },
          });
        }),
      ),
    );
  });
  return el(
    "div",
    { className: "calendar-picker" },
    el(
      "div",
      { className: "cal-time-ruler" },
      el("div", { className: "cal-day-spacer" }),
      el(
        "div",
        { className: "cal-time-labels" },
        slotLabels.map(function (lab, i) {
          return el("span", { key: i, className: "time-tick" }, lab);
        }),
      ),
    ),
    el("div", { className: "calendar-grid-wrap" }, rows),
  );
}

function formatPlannerTimeRow(slotIndex) {
  const minutes = GRID_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const ampm = hh < 12 ? "am" : "pm";
  return h12 + ":" + (mm < 10 ? "0" : "") + mm + ampm;
}

/** Days as columns (Mon-Fri), time as rows (8am top -> 9pm bottom). */
function WeeklyPlannerGrid(props) {
  const el = React.createElement;
  const sections = props.sections || [];
  const colorMap = props.sectionColorMap || {};
  const isModal = !!props.isModal;
  const nSlots = SLOTS_PER_DAY;
  const nDays = 5;
  const cover = [];
  for (let s = 0; s < nSlots; s++) {
    cover[s] = [];
    for (let d = 0; d < nDays; d++) {
      cover[s][d] = null;
    }
  }
  sections.forEach(function (sec) {
    const hue = colorMap[sec.sectionId] != null ? colorMap[sec.sectionId] : 0;
    (sec.meetings || []).forEach(function (m) {
      const d = m.day;
      if (d < 0 || d > 4) return;
      const slot0 = Math.max(0, Math.floor((m.start - GRID_START_HOUR * 60) / SLOT_MINUTES));
      const slot1 = Math.min(nSlots - 1, Math.ceil((m.end - GRID_START_HOUR * 60) / SLOT_MINUTES) - 1);
      const block = {
        courseId: sec.courseId,
        hue: hue,
        startSlot: slot0,
        endSlot: slot1,
        sectionId: sec.sectionId,
      };
      for (let slot = slot0; slot <= slot1; slot++) {
        cover[slot][d] = block;
      }
    });
  });

  const rowHeight = isModal ? "minmax(20px, 1fr)" : "minmax(18px, 1fr)";
  const gridStyle = {
    gridTemplateColumns: "72px repeat(5, minmax(0, 1fr))",
    gridTemplateRows: "auto repeat(" + nSlots + ", " + rowHeight + ")",
  };

  const header = [
    el(
      "div",
      { key: "corner", className: "planner-corner", style: { gridColumn: 1, gridRow: 1 } },
      "Time",
    ),
  ].concat(
    CAL_DAYS.map(function (day, i) {
      return el(
        "div",
        {
          key: "hd-" + i,
          className: "planner-day-head",
          style: { gridColumn: i + 2, gridRow: 1 },
        },
        day,
      );
    }),
  );

  const body = [];
  for (let s = 0; s < nSlots; s++) {
    body.push(
      el(
        "div",
        {
          key: "time-" + s,
          className: "planner-time-cell",
          style: { gridColumn: 1, gridRow: s + 2 },
        },
        formatPlannerTimeRow(s),
      ),
    );
    for (let d = 0; d < nDays; d++) {
      const b = cover[s][d];
      if (!b) {
        body.push(
          el("div", {
            key: "empty-" + s + "-" + d,
            className: "planner-slot-empty",
            style: { gridColumn: d + 2, gridRow: s + 2 },
          }),
        );
      } else if (b.startSlot === s) {
        const sp = b.endSlot - b.startSlot + 1;
        body.push(
          el(
            "div",
            {
              key: "block-" + s + "-" + d,
              className: "planner-block cal-hue-light-" + (b.hue % 6),
              style: { gridColumn: d + 2, gridRow: s + 2 + " / span " + sp },
            },
            el("span", { className: "planner-block-id" }, b.courseId),
          ),
        );
      }
    }
  }

  return el(
    "div",
    { className: "planner-outer" },
    el(
      "div",
      {
        className: "planner-grid" + (isModal ? " planner-grid--modal" : ""),
        style: gridStyle,
      },
      header.concat(body),
    ),
  );
}

function ScheduleCourseLegend(props) {
  const el = React.createElement;
  const sections = props.sections || [];
  const colorMap = props.sectionColorMap || {};
  const seen = {};
  const rows = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (seen[sec.sectionId]) continue;
    seen[sec.sectionId] = true;
    const hue = colorMap[sec.sectionId] != null ? colorMap[sec.sectionId] : 0;
    const meta =
      sec.courseId +
      " · " +
      sec.sectionId +
      " · " +
      sec.instructor +
      " · " +
      sec.days +
      " " +
      sec.time +
      " · " +
      sec.cu +
      " CU · " +
      sec.quarter;
    rows.push(
      el(
        "div",
        { key: sec.sectionId, className: "legend-row" },
        el("span", { className: "legend-swatch cal-hue-light-" + (hue % 6), "aria-hidden": true }),
        el(
          "div",
          { className: "legend-body" },
          el("div", { className: "legend-title-line" }, sec.courseTitle),
          el("div", { className: "legend-meta" }, meta),
        ),
      ),
    );
  }
  return el(
    "div",
    { className: "course-legend" },
    el("div", { className: "legend-heading" }, "Courses in this schedule"),
    rows,
  );
}

function ScheduleOptionCard(props) {
  const el = React.createElement;
  const sol = props.sol;
  const idx = props.optionIndex;
  const summary = props.summary;
  const colorMap = props.sectionColorMap;
  const [expanded, setExpanded] = useState(false);

  useEffect(
    function () {
      if (!expanded) return;
      function onKey(e) {
        if (e.key === "Escape") setExpanded(false);
      }
      window.addEventListener("keydown", onKey);
      return function () {
        window.removeEventListener("keydown", onKey);
      };
    },
    [expanded],
  );

  const legendProps = { sections: sol.sections, sectionColorMap: colorMap };
  const gridPropsBase = { sections: sol.sections, sectionColorMap: colorMap };
  const legendInline = el(ScheduleCourseLegend, Object.assign({ key: "legend-inline" }, legendProps));
  const legendModal = el(ScheduleCourseLegend, Object.assign({ key: "legend-modal" }, legendProps));
  const gridInline = el(WeeklyPlannerGrid, Object.assign({ key: "grid-inline", isModal: false }, gridPropsBase));
  const gridModal = el(WeeklyPlannerGrid, Object.assign({ key: "grid-modal", isModal: true }, gridPropsBase));

  const modalPlanner =
    expanded &&
    el(
      "div",
      {
        className: "schedule-modal-backdrop",
        role: "dialog",
        "aria-modal": true,
        "aria-labelledby": "schedule-modal-title-" + idx,
        onClick: function () {
          setExpanded(false);
        },
      },
      el(
        "div",
        {
          className: "schedule-modal",
          onClick: function (e) {
            e.stopPropagation();
          },
        },
        el(
          "div",
          { className: "schedule-modal-toolbar" },
          el(
            "h3",
            { id: "schedule-modal-title-" + idx, className: "schedule-modal-title" },
            "Option " + (idx + 1),
          ),
          el(
            "button",
            {
              type: "button",
              className: "btn-secondary schedule-modal-close",
              onClick: function () {
                setExpanded(false);
              },
            },
            "Close",
          ),
        ),
        el("div", { className: "schedule-modal-body" }, legendModal, gridModal),
      ),
    );

  return el(
    "div",
    { className: "schedule-option-card" },
    el(
      "div",
      { className: "schedule-option-head" },
      el("h4", { className: "schedule-option-label" }, "Option " + (idx + 1)),
      el(
        "button",
        {
          type: "button",
          className: "btn-secondary schedule-expand-btn",
          onClick: function () {
            setExpanded(true);
          },
        },
        "Expand",
      ),
    ),
    el("div", { className: "schedule-option-planner" }, legendInline, gridInline),
    summary,
    modalPlanner,
  );
}

function parseHtmlTimeInput(str) {
  const p = String(str || "0:0").split(":");
  const h = parseInt(p[0], 10) || 0;
  const m = parseInt(p[1], 10) || 0;
  return h * 60 + m;
}

function addRecurringToCells(dayFlags, startHM, endHM, setCells) {
  const startMin = parseHtmlTimeInput(startHM);
  const endMin = parseHtmlTimeInput(endHM);
  if (endMin <= startMin) return;
  setCells(function (prev) {
    const next = new Set(prev);
    CAL_DAYS.forEach(function (_, dIdx) {
      const dayName = CAL_DAYS[dIdx];
      if (!dayFlags[dayName]) return;
      for (let t = startMin; t < endMin; t += SLOT_MINUTES) {
        if (t < GRID_START_HOUR * 60 || t >= GRID_END_HOUR * 60) continue;
        const slot = Math.floor((t - GRID_START_HOUR * 60) / SLOT_MINUTES);
        next.add(dIdx + "-" + slot);
      }
    });
    return next;
  });
}

const COURSE_CATALOG = buildCourseCatalogFromExcel(typeof REAL_DATA_SECTIONS !== "undefined" ? REAL_DATA_SECTIONS : []);

const COURSE_ID_TO_GROUP = {};
for (let i = 0; i < COURSE_CATALOG.length; i++) {
  const g = COURSE_CATALOG[i];
  for (let j = 0; j < g.courseIds.length; j++) {
    COURSE_ID_TO_GROUP[g.courseIds[j]] = g;
  }
}

function App() {
  const el = React.createElement;

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [activeDept, setActiveDept] = useState("ALL");
  const [shortlist, setShortlist] = useState([]);
  const [blockedCells, setBlockedCells] = useState(new Set());
  const [targetCu, setTargetCu] = useState(5);
  const [recurringLabel, setRecurringLabel] = useState("");
  const [recurringDays, setRecurringDays] = useState({ Mon: true, Tue: false, Wed: true, Thu: false, Fri: false });
  const [recurringStart, setRecurringStart] = useState("16:00");
  const [recurringEnd, setRecurringEnd] = useState("18:00");
  const [dragSid, setDragSid] = useState(null);

  const shortlistedGroupKeys = useMemo(function () {
    return new Set(
      shortlist.map(function (s) {
        return s.courseGroup.groupKey;
      }),
    );
  }, [shortlist]);

  const visibleCourses = useMemo(function () {
    const q = query.trim().toLowerCase();
    return COURSE_CATALOG.filter(function (c) {
      const deptOk = activeDept === "ALL" || c.departments.indexOf(activeDept) !== -1;
      const textOk =
        !q ||
        c.displayCourseIds.toLowerCase().indexOf(q) !== -1 ||
        c.title.toLowerCase().indexOf(q) !== -1;
      return deptOk && textOk;
    });
  }, [query, activeDept]);

  const orderedShortlistForScheduler = useMemo(function () {
    return shortlist.slice();
  }, [shortlist]);

  const viableSchedules = useMemo(function () {
    if (page < 3) return [];
    return findViableSchedules(orderedShortlistForScheduler, blockedCells, targetCu, 3);
  }, [page, orderedShortlistForScheduler, blockedCells, targetCu]);

  const resultsSummaryMessage = useMemo(function () {
    if (page < 3) return "";
    if (viableSchedules.length > 0) {
      const hasHigh = orderedShortlistForScheduler.some(function (x) {
        return x.priority === "high";
      });
      const core =
        "We found " +
        viableSchedules.length +
        " schedule option" +
        (viableSchedules.length === 1 ? "" : "s") +
        " that ";
      const mid = hasHigh
        ? "include every high-priority course, "
        : "use your shortlist priorities, ";
      return (
        core +
        mid +
        "avoid time overlaps where quarters actually overlap (Q1 vs Q2 at the same clock is fine), and respect your blocked times."
      );
    }
    return explainScheduleFailure(orderedShortlistForScheduler, blockedCells, targetCu);
  }, [page, viableSchedules, orderedShortlistForScheduler, blockedCells, targetCu]);

  function addCourse(courseGroup) {
    if (shortlistedGroupKeys.has(courseGroup.groupKey)) return;
    setShortlist(function (prev) {
      return prev.concat([
        {
          courseGroup: courseGroup,
          priority: "medium",
          clientId: "sl-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
        },
      ]);
    });
  }

  function removeShortlist(clientId) {
    setShortlist(function (prev) {
      return prev.filter(function (x) {
        return x.clientId !== clientId;
      });
    });
  }

  function setPriority(clientId, p) {
    setShortlist(function (prev) {
      return prev.map(function (x) {
        return x.clientId === clientId ? Object.assign({}, x, { priority: p }) : x;
      });
    });
  }

  function onDragStart(item) {
    setDragSid(item.clientId);
  }
  function onDragOver(e, _item) {
    e.preventDefault();
  }
  function onDrop(targetItem) {
    const sid = dragSid;
    if (!sid || sid === targetItem.clientId) return;
    setShortlist(function (prev) {
      const idxDrag = prev.findIndex(function (x) {
        return x.clientId === sid;
      });
      const idxDrop = prev.findIndex(function (x) {
        return x.clientId === targetItem.clientId;
      });
      if (idxDrag < 0 || idxDrop < 0) return prev;
      const copy = prev.slice();
      const [removed] = copy.splice(idxDrag, 1);
      copy.splice(idxDrop, 0, removed);
      return copy;
    });
    setDragSid(null);
  }

  function applyRecurring() {
    if (!recurringLabel.trim()) return;
    addRecurringToCells(recurringDays, recurringStart, recurringEnd, setBlockedCells);
    setRecurringLabel("");
  }

  const deptButtons = [
    el(
      "button",
      {
        key: "ALL",
        className: "pill" + (activeDept === "ALL" ? " active" : ""),
        onClick: function () {
          setActiveDept("ALL");
        },
      },
      "ALL",
    ),
  ].concat(
    DEPARTMENTS.map(function (dept) {
      return el(
        "button",
        {
          key: dept,
          className: "pill" + (activeDept === dept ? " active" : ""),
          onClick: function () {
            setActiveDept(dept);
          },
        },
        dept,
      );
    }),
  );

  const cards = visibleCourses.map(function (courseGroup) {
    const inList = shortlistedGroupKeys.has(courseGroup.groupKey);
    const gapLabels = courseGroupFillsGapLabels(courseGroup);
    const quarters = {};
    courseGroup.sections.forEach(function (s) {
      quarters[s.quarter] = true;
    });
    const qStr = Object.keys(quarters).sort().join(", ");
    return el(
      "article",
      {
        key: courseGroup.groupKey,
        className: "card" + (inList ? " shortlisted" : ""),
        onClick: function () {
          addCourse(courseGroup);
        },
      },
      el(
        "div",
        { className: "card-head" },
        el("p", { className: "course-id" }, courseGroup.displayCourseIds),
        el("p", { className: "course-cu" }, courseGroup.cu + " CU · " + qStr),
      ),
      gapLabels.length
        ? el(
            "div",
            { className: "gap-badge-row" },
            gapLabels.map(function (g, gi) {
              return el("span", { key: g + "-" + gi, className: "gap-badge" }, "Fills: " + g);
            }),
          )
        : null,
      el("p", { className: "course-title" }, courseGroup.title),
      el(
        "p",
        { className: "course-meta" },
        (function () {
          const u = {};
          const times = [];
          courseGroup.sections.forEach(function (s) {
            const k = s.days + " " + s.time + " · " + s.quarter;
            if (!u[k]) {
              u[k] = true;
              times.push(k);
            }
          });
          const show = times.slice(0, 3).join(" · ");
          return times.length > 3 ? show + " (+" + (times.length - 3) + " more)" : show;
        })(),
      ),
      el(
        "p",
        { className: "course-meta" },
        (function () {
          const ins = courseGroup.sections.map(function (s) {
            return s.instructor;
          });
          const uniq = ins.filter(function (x, i, a) {
            return a.indexOf(x) === i;
          });
          const show = uniq.slice(0, 2).join(", ");
          return "Instructors: " + show + (uniq.length > 2 ? " +" + (uniq.length - 2) + " more" : "");
        })(),
      ),
    );
  });

  const shortlistPanel =
    shortlist.length === 0
      ? el("p", { className: "empty" }, "Click a course to add.")
      : shortlist.map(function (item) {
          const g = item.courseGroup;
          return el(
            "div",
            {
              key: item.clientId,
              className: "short-item drag-item",
              draggable: true,
              onDragStart: function (e) {
                try {
                  e.dataTransfer.setData("text/plain", String(item.clientId));
                } catch (err) {}
                e.dataTransfer.effectAllowed = "move";
                onDragStart(item);
              },
              onDragEnd: function () {
                setDragSid(null);
              },
              onDragOver: function (e) {
                onDragOver(e, item);
              },
              onDrop: function (e) {
                e.preventDefault();
                e.stopPropagation();
                onDrop(item);
              },
            },
            el("p", null, el("strong", null, g.displayCourseIds)),
            el("p", { className: "short-mini" }, g.title),
            el(
              "div",
              { className: "priority-row" },
              ["high", "medium", "low"].map(function (p) {
                return el(
                  "button",
                  {
                    key: p,
                    className: "pill small" + (item.priority === p ? " active" : ""),
                    type: "button",
                    onClick: function (e) {
                      e.stopPropagation();
                      setPriority(item.clientId, p);
                    },
                  },
                  p,
                );
              }),
            ),
            el(
              "button",
              {
                className: "remove-btn",
                onClick: function (e) {
                  e.stopPropagation();
                  removeShortlist(item.clientId);
                },
              },
              "Remove",
            ),
          );
        });

  if (page === 1) {
    return el(
      "div",
      { className: "app-shell" },
      WizardNav({ step: 1 }),
      el(
        "main",
        { className: "app app-three-col" },
        el(
          "section",
          { className: "panel left-panel wide" },
          el(
            "header",
            { className: "header" },
            el("h1", { className: "title" }, "CourseMatch Assist"),
            el("p", { className: "subtitle" }, "Plan your schedule, shortlist courses, and bid smarter."),
          ),
          el(
            "div",
            { className: "controls" },
            el("input", {
              className: "search",
              placeholder: "Search course name or ID...",
              value: query,
              onChange: function (e) {
                setQuery(e.target.value);
              },
            }),
            el("div", { className: "target-cu-row" },
              el("label", { className: "target-cu-label" }, "Target semester CU:"),
              el("input", {
                type: "number",
                className: "target-cu-input",
                step: "0.5",
                min: "0.5",
                max: "5.5",
                value: targetCu,
                onChange: function (e) {
                  setTargetCu(parseFloat(e.target.value) || 0);
                },
              }),
            ),
            el("div", { className: "controls-label" }, "Department"),
            el("div", { className: "button-row" }, deptButtons),
          ),
          el(
            "p",
            { className: "hint drag-hint" },
            "Shortlist: High = must be on your final schedule. Medium = add if time permits. Low = only if it helps hit CU without conflicts. Drag order breaks ties within each level.",
          ),
          el("section", { className: "cards" }, cards),
        ),
        el("aside", { className: "panel profile-aside" }, StudentProfilePanel({})),
        el(
          "aside",
          { className: "panel shortlist" },
          el("h2", { className: "shortlist-title" }, "Shortlist (" + shortlist.length + ")"),
          shortlistPanel,
          el(
            "div",
            { className: "page-actions" },
            el(
              "button",
              {
                className: "btn-primary",
                onClick: function () {
                  setPage(2);
                },
              },
              "Next → Availability",
            ),
          ),
        ),
      ),
    );
  }

  if (page === 2) {
    return el(
      "div",
      { className: "app-shell" },
      WizardNav({ step: 2 }),
      el(
        "main",
        { className: "page-availability" },
        el("h2", { className: "page-title" }, "Availability & constraints"),
        el("p", { className: "page-lead" }, "Mark times you cannot take class. Drag on the grid or use recurring blocks."),
        el(PagePickerCalendar, { blockedCells: blockedCells, setBlockedCells: setBlockedCells }),
        el(
          "div",
          { className: "recurring-panel panel" },
          el("h3", null, "Recurring commitment"),
          el(
            "div",
            { className: "recurring-row" },
            el("input", {
              className: "search",
              placeholder: "Name (e.g. Internship)",
              value: recurringLabel,
              onChange: function (e) {
                setRecurringLabel(e.target.value);
              },
            }),
            CAL_DAYS.map(function (d) {
              return el(
                "label",
                { key: d, className: "day-check" },
                el("input", {
                  type: "checkbox",
                  checked: !!recurringDays[d],
                  onChange: function (e) {
                    setRecurringDays(function (prev) {
                      const next = Object.assign({}, prev);
                      next[d] = e.target.checked;
                      return next;
                    });
                  },
                }),
                " " + d.slice(0, 3),
              );
            }),
            el("input", { type: "time", className: "time-input", value: recurringStart, onChange: function (e) { setRecurringStart(e.target.value); } }),
            el("span", null, "-"),
            el("input", { type: "time", className: "time-input", value: recurringEnd, onChange: function (e) { setRecurringEnd(e.target.value); } }),
            el("button", { className: "btn-secondary", onClick: applyRecurring }, "Add to grid"),
          ),
        ),
        el(
          "div",
          { className: "page-actions-inline" },
          el(
            "button",
            {
              className: "btn-secondary",
              onClick: function () {
                setPage(1);
              },
            },
            "← Back",
          ),
          el(
            "button",
            {
              className: "btn-primary",
              onClick: function () {
                setPage(3);
              },
            },
            "Next → Results",
          ),
        ),
      ),
    );
  }

  const scheduleOptions =
    viableSchedules.length === 0
      ? null
      : el(
          "div",
          { className: "schedule-compare" },
          viableSchedules.map(function (sol, idx) {
            const colorMap = buildSectionColorMap(sol.sections);
            const clearing = sol.sections.map(function (sec) {
              const cg = COURSE_ID_TO_GROUP[sec.courseId];
              const row = lookupClearingRow(cg);
              const ph = track4BiddingPlaceholder(cg, sec, row);
              return el(
                "li",
                { key: sec.sectionId },
                el("strong", null, cg.displayCourseIds),
                " - ",
                sec.sectionId,
                ": ",
                ph.estimatedBidRange,
                " · ",
                el("span", { className: "tier-" + ph.tier }, ph.tier),
              );
            });
            const summary = el(
              "div",
              { className: "schedule-summary" },
              el("p", { className: "schedule-total-cu" }, el("strong", null, "Total CU: "), sol.totalCu.toFixed(2)),
              el("h5", { className: "bidding-head" }, "Bidding guidance (mock clearing prices)"),
              el("ul", { className: "bidding-list" }, clearing),
            );
            return el(ScheduleOptionCard, {
              key: "opt-" + idx,
              sol: sol,
              optionIndex: idx,
              summary: summary,
              sectionColorMap: colorMap,
            });
          }),
        );

  return el(
    "div",
    { className: "app-shell app-shell--results-wide" },
    WizardNav({ step: 3 }),
    el(
      "main",
      { className: "page-results page-results--wide" },
      el("h2", { className: "page-title" }, "Schedule results"),
      el("p", { className: "page-lead results-summary-lead" }, resultsSummaryMessage),
      el(
        "div",
        { className: "panel results-section results-schedules-panel" },
        el(
          "h3",
          null,
          "Top schedule options (closest to " + targetCu + " CU: exact best, then e.g. 4.5 / 5.5)",
        ),
        scheduleOptions,
      ),
      el(
        "div",
        { className: "page-actions-inline" },
        el(
          "button",
          {
            className: "btn-secondary",
            onClick: function () {
              setPage(2);
            },
          },
          "← Back",
        ),
        el(
          "button",
          {
            className: "btn-secondary",
            onClick: function () {
              setPage(1);
            },
          },
          "Edit shortlist",
        ),
      ),
    ),
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");

try {
  rootEl.textContent = "";
  var reactRoot = ReactDOM.createRoot(rootEl);
  window.__COURSE_MATCH_REACT_ROOT__ = reactRoot;
  reactRoot.render(React.createElement(App));
  window.__COURSE_MATCH_MOUNTED__ = true;
} catch (err) {
  console.error(err);
  rootEl.textContent = "Error: " + (err && err.message ? err.message : String(err));
}

