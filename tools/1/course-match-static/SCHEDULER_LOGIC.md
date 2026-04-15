# Scheduler logic (CourseMatch Assist)

This document describes how the schedule finder works in `app-logic.js` (and the bundled `app.js`). It is written for internal engineering and product readers.

---

## How courses get added to a schedule (step by step)

1. **Input:** The UI maintains `shortlist`, an ordered array of items. Each item has `courseGroup`, `priority` (`"high"` | `"medium"` | `"low"`), and a stable `clientId`. The scheduler receives a copy as `orderedShortlistForScheduler` (same order as the user’s list).

2. **Partitioning:** Before search, `partitionShortlistForScheduler` **reorders** that list into three contiguous blocks: **all high-priority courses first**, then **all medium**, then **all low**. **Order within each block** is whatever order those items had on the shortlist (e.g. drag order).

3. **Depth-first search:** `findViableSchedules` runs a recursive backtracking routine (`dfs`) over the partitioned list, index `0 … n-1`.

4. **At each index** the current item is one course **group** (cross-listed IDs share one group; the engine picks **one section** for that group).

   - **High priority:** For every section of that group, the algorithm tries sections that pass filters (blocks + no time conflict with sections already chosen). If **no** section can be added, that branch dies; **high courses cannot be skipped**.
   - **Medium or low priority:** The same section loop runs first. **Additionally**, after trying all sections, the algorithm may recurse to the **next index without choosing any section** for this course—i.e. **medium and low courses may be omitted** from the final schedule.

5. **Completion:** When `idx === n`, if at least one section was chosen (`chosen.length > 0`), the current `chosen` set is recorded as one **raw solution** with metadata: `totalCu`, `gapsFilled`, `priorityScore`, `mediumCount`, `lowCount`.

6. **Dedup and cap:** Raw solutions are sorted (see ranking below). The first **up to `maxSolutions`** distinct schedules (by sorted `sectionId` signature) are returned. The UI passes `maxSolutions = 3`.

---

## How priority affects inclusion and ordering

| Priority | Must appear in every viable schedule? | Role in search order |
|----------|----------------------------------------|----------------------|
| **High** | **Yes** — every high item must get exactly one feasible section. | Processed first after partition (all highs before mediums before lows). |
| **Medium** | **No** — optional; any subset of sections that passes filters is allowed. | Middle block. |
| **Low** | **No** — same as medium. | Last block. |

**Ordering among schedules** (after feasibility) uses:

- **`schedulePriorityScore`:** For each shortlist position `i` (in the **partitioned** order), if that course group is included, the score adds `priorityWeight(priority) * (n - i)`. Weights: high = 3, medium = 2, low = 1. **Earlier positions in the partitioned list count more**, and **high contributes more than medium/low** for the same slot.
- This score is a **tie-breaker** after CU band, CU distance, gaps filled, medium count, low count, and a slight preference for being **at or under** target CU (see ranking section).

**Counts:** `mediumCount` / `lowCount` count how many **medium** / **low** shortlist items actually have a selected section in that solution (used in sorting).

---

## Conflict detection (time + Q1 / Q2 / Full)

**Meeting model:** Each section becomes one or more **meetings**: `{ day, start, end, quarter }` in minutes from midnight, with `day` as 0–4 (Mon–Fri). `sectionToMeetings` expands `days` (e.g. `MW`, `TR`, single letters) and attaches the section’s `quarter` string to **every** meeting for that row.

**Quarter semantics** (`quarterToSet` / `quartersConflict`):

- **`Full`** → treated as occupying **both** Q1 and Q2.
- **`Q1`** → only Q1.
- **`Q2`** → only Q2.
- Unknown strings default to **both** halves (same as Full).

Two meetings **conflict in time** only if:

1. Same **day**, and  
2. Their **quarters overlap** in at least one half (both use Q1, or both use Q2), and  
3. **Intervals overlap** on the clock: `start1 < end2 && end1 > start2`.

So **Q1 vs Q2 at the same clock time on the same day does not conflict** (different halves). **Full vs Q1**, **Full vs Q2**, or **Full vs Full** can conflict when the clock overlaps.

**Pairwise sections:** `sectionsTimeConflict(a, b)` compares **all** meetings of `a` against **all** meetings of `b` via `meetingBlocksOverlap`.

There is **no** separate “same course twice” rule beyond the shortlist structure: each list row is one group, and the search picks **at most one section per row**.

---

## How blocked times are enforced

1. **UI state:** `blockedCells` is a `Set` of string keys `"<dayIndex>-<slotIndex>"` where `dayIndex` is 0–4 and `slotIndex` is the 30-minute slot within the grid (8:00–21:00).

2. **Conversion:** `blockedIntervalsFromCells` turns each key into `{ day, start, end, quarter: "Full" }`. Every painted block is therefore treated as **blocking the entire semester** (both Q1 and Q2).

3. **Section vs block:** `sectionConflictsBlocked` returns true if **any** meeting of the section overlaps **any** blocked interval on the **same day**, with **quarter overlap** via `quartersConflict` (so a Q1-only section only needs to avoid the block if the block’s `Full` implies Q1).

4. **Search:** Before a section is pushed onto `chosen`, it must **not** `sectionConflictsBlocked` with the user’s blocks. This is **strict** (any overlap disqualifies that section).

---

## CU targeting and how close the ranker tries to get

- **Target:** The user sets **`targetCu`** (numeric; default **5** in the UI only). Everything below is expressed in terms of that value—call it **T**. **`targetCu` is only used for ranking**, not as a hard constraint. Feasible schedules **above or below** T are both kept.

- **Total CU for a solution:** `totalCuFromChosenSections` sums **`courseGroup.cu`** for each shortlist group that has a chosen section (one section per included group). Group CU is derived from catalog data (max section CU in the group after catalog build).

- **Bands** (`cuAcceptableBand`): Rank uses **distance** `|totalCu - T|`, not “distance from 5.”  
  - **Band 0:** `|totalCu - T| < 0.06` — effectively **on target** (e.g. if **T = 4.5**, totals ≈ 4.44–4.56 win this band).  
  - **Band 1:** distance ≤ **0.55** — **within about ±½ CU of T** (e.g. **T = 4.5** → roughly **4.0–5.0**; **T = 5** → roughly **4.5–5.5**).  
  - **Band 2:** distance ≤ **1.05** — **within about ±1 CU of T**.  
  - **Band 3+:** farther out; the band value grows with distance.

**Interpretation:** “Closest to target” means closest to **whatever T is**, in that order: **on T**, then **within ~½ CU of T**, then **within ~1 CU of T**, then the rest; ties are broken by **raw** `|totalCu - T|`. The engine does **not** optimize toward a fixed number like 5—it **enumerates** feasible schedules (subject to caps), then **sorts** them against **the user’s** `targetCu`.

---

## How schedule options are ranked against each other

After collecting raw solutions, `solutions.sort` applies these criteria **in order** (first difference wins):

1. **`cuAcceptableBand`** — smaller band is better (closer to the user’s **`targetCu`** in the stepped bands described above—not relative to any fixed number like 5).
2. **`Math.abs(totalCu - targetCu)`** — smaller gap is better (if bands tie or are very close, within 0.02).
3. **`gapsFilled`** — **more** requirement gaps filled is better (`countGapsFilledBySchedule`).
4. **`mediumCount`** — **more** medium-priority courses included is better.
5. **`lowCount`** — **fewer** low-priority courses included is better (prefer not to clutter with lows).
6. **At or under target:** If one solution has `totalCu <= targetCu` (within 0.02 tolerance) and the other does not, the **under/at** one is preferred.
7. **`priorityScore`** — higher `schedulePriorityScore` wins (see priority section).

The UI then takes the **first three** unique schedules (unique by sorted `sectionId` list).

---

## What `MAX_RAW` does and why

Inside `findViableSchedules`:

```text
MAX_RAW = Math.max(25000, maxSolutions * 500)
```

(with `maxSolutions === 3` from the UI, this is **25000**.)

**Purpose:** Cap how many **complete** schedules (`idx === n`) are **pushed** into the `solutions` array during DFS.

**Why:** The search space grows exponentially with shortlist size and section counts. Without a cap, pathological inputs could allocate huge arrays and freeze the browser. The cap is a **safety valve**: once `solutions.length >= MAX_RAW`, DFS returns early and **stops accumulating** more raw completions.

**Important:** Ranking runs only on whatever was collected before the cap. If the cap triggers, the “best” schedules might not have been found. The constant **25000** and the multiplier **500** are pragmatic defaults, not guarantees of optimality.

---

## Integration points: Track 1, Track 2, Track 4

Below are the **exact symbols** to replace or extend, and the **shapes** the current code expects.

### Track 1 — Transcript / degree requirements

| Symbol | Location | Role |
|--------|----------|------|
| **`STUDENT_PROFILE`** | Top of `app-logic.js` | Mock student record and requirement display. |

**Expected shape of `STUDENT_PROFILE`:**

- **`studentId`** — string  
- **`displayName`** — string  
- **`program`** — string (display)  
- **`graduationTerm`** — string (display)  
- **`completedCourseIds`** — array of course ID strings (e.g. `"FNCE 6110"`)  
- **`requirementRows`** — array of rows, each with:  
  - **`key`** — string (React key)  
  - **`label`** — string (short title)  
  - **`kind`** — `"complete"` | `"gap"` (drives UI badge)  
  - **`detail`** — string (explanation)  
  - **`fulfillsCourseIds`** — optional; **required for `kind === "gap"`** when that gap should count toward **`countGapsFilledBySchedule` / scheduler ranking**. Array of course ID strings; if **any** of these IDs appears among **chosen section `courseId` values** in a schedule, that gap counts as filled.

**Call sites:** `StudentProfilePanel`, `courseGroupFillsGapLabels` (shortlist badges), `countGapsFilledBySchedule` (scheduler).

**Catalog / sections:** Course offerings still come from **`REAL_DATA_SECTIONS`** (see below), not from `STUDENT_PROFILE`.

**Note:** `completedCourseIds` is part of the mock profile for transcript context; **`findViableSchedules` does not read it** today (no auto-exclusion of completed courses).

---

### Track 2 — Clearing prices

| Symbol | Location | Role |
|--------|----------|------|
| **`MOCK_CLEARING_PRICES`** | Top of `app-logic.js` | Mock clearing statistics by department prefix. |
| **`lookupClearingRow(courseGroup)`** | Same file | Maps a `courseGroup` to one row of clearing data (uses first course id prefix vs `byCoursePrefix`). |

**Expected shape of `MOCK_CLEARING_PRICES`:**

- **`defaultMedianPoints`** — number (reserved for future use; not heavily used in current scheduler)  
- **`byCoursePrefix`** — array of objects, each:  
  - **`prefix`** — string, e.g. `"FNCE"` (matched to the **first token** of the first display course id)  
  - **`min`** — number (points)  
  - **`max`** — number (points)  
  - **`tier`** — string, e.g. `"competitive"` | `"safe"` | `"reach"` (used for CSS class `tier-<tier>` in the UI)

**Fallback:** If no prefix matches, `lookupClearingRow` returns a generic row `{ prefix: "*", min: 800–900, max: 2200, tier: "competitive" }` (see source for exact defaults).

Replace **`MOCK_CLEARING_PRICES`** with real data and adjust **`lookupClearingRow`** if matching should be by course, section, or another key.

---

### Track 4 — Bidding guidance

| Symbol | Location | Role |
|--------|----------|------|
| **`track4BiddingPlaceholder(courseGroup, section, clearingRow)`** | `app-logic.js` | Produces the bidding blurb per section on the results cards. |

**Parameters today:**

- **`courseGroup`** — catalog group (`displayCourseIds`, `courseIds`, etc.)  
- **`section`** — chosen section object (`sectionId`, `courseId`, meetings, …)  
- **`clearingRow`** — object returned by `lookupClearingRow(courseGroup)`

**Return value must include (current UI reads these):**

- **`estimatedBidRange`** — string (rendered as the main bid text)  
- **`tier`** — string (appended with class `tier-<tier>`)  
- **`note`** — string (optional in UI; placeholder includes it for future copy)

**Call site:** Results page builds a list per schedule option: for each `sec` in `sol.sections`, it resolves `cg = COURSE_ID_TO_GROUP[sec.courseId]`, then `row = lookupClearingRow(cg)`, then `track4BiddingPlaceholder(cg, sec, row)`.

Replace the **body** of `track4BiddingPlaceholder` (or swap in a real module) while keeping this **return shape** unless the JSX that renders bidding lines is updated too.

---

### Shared catalog data (sections / Excel pipeline)

| Symbol | Location | Role |
|--------|----------|------|
| **`REAL_DATA_SECTIONS`** | `_real_data_header.js` (merged into `app.js`) | Array of raw section rows from CourseMatch / Excel. |

**Each row** is expected to provide at least: `sectionId`, `courseId`, `courseTitle`, `days`, `time`, `quarter`, `instructor`, `cu`, `department`, `crossListedAs`, `notes` (strings as in the embed). The catalog builder normalizes these into groups and `meetings`.

**Runtime:** `COURSE_CATALOG = buildCourseCatalogFromExcel(REAL_DATA_SECTIONS)` and **`COURSE_ID_TO_GROUP`** map each `courseId` to its group for UI and bidding.

---

## Quick reference: main functions

| Function | Responsibility |
|----------|------------------|
| `partitionShortlistForScheduler` | Reorder shortlist to [high…][medium…][low…]. |
| `findViableSchedules` | DFS, enforce blocks + time conflicts, collect and rank solutions. |
| `sectionsTimeConflict` | Section vs section using meetings + quarter-aware overlap. |
| `sectionConflictsBlocked` | Section vs user blocks (blocks modeled as Full quarter). |
| `explainScheduleFailure` | Plain-language diagnosis when no schedules (blocks, high conflicts, CU messaging). |

---

*Generated from `app-logic.js` behavior; if implementation changes, update this file in the same PR.*
