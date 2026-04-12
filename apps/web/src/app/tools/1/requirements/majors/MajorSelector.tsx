"use client";

import { useState } from "react";
import type { SavedCourse } from "../../transcriptPersistence";
import type { WaiverEntry } from "../../waiversPersistence";
import { MAJORS } from "../../majorsData";
import type { MajorData, MajorReqGroup } from "../../majorsData";

// ── Mapping logic ──────────────────────────────────────────────────────────────

interface GroupStatus {
  group: MajorReqGroup;
  met: boolean;
  cuAccumulated: number;
  matchingCourses: SavedCourse[];
}

interface MajorStatus {
  major: MajorData;
  groups: GroupStatus[];
  totalCUAccumulated: number;
  allRequiredMet: boolean;
}

function courseLevel(courseId: string): number {
  const match = courseId.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function coursePrefix(courseId: string): string {
  return courseId.replace(/\d.*$/, "");
}

function computeMajorStatus(major: MajorData, courses: SavedCourse[]): MajorStatus {
  const groups: GroupStatus[] = major.groups.map((group) => {
    // Find all qualifying courses from the transcript
    const matchingCourses = courses.filter((c) => {
      if (!c.courseId) return false;
      // Skip pass/fail
      if (c.grade === "P" || c.grade === "NP") return false;
      // Check specific course list
      if (group.courses.includes(c.courseId)) return true;
      // Check catch-all
      if (group.catchAll) {
        const level = courseLevel(c.courseId);
        const prefix = coursePrefix(c.courseId);
        return (
          level >= group.catchAll.minLevel &&
          group.catchAll.prefixes.includes(prefix)
        );
      }
      return false;
    });

    if (group.type === "required-one") {
      const metBy = matchingCourses[0] ?? null;
      return {
        group,
        met: !!metBy,
        cuAccumulated: metBy ? (metBy.officialCredits ?? metBy.credits ?? 0) : 0,
        matchingCourses: metBy ? [metBy] : [],
      };
    }

    // elective-pool: accumulate CU
    const cuAccumulated = matchingCourses.reduce(
      (s, c) => s + (c.officialCredits ?? c.credits ?? 0),
      0
    );
    return {
      group,
      met: cuAccumulated >= group.cuNeeded,
      cuAccumulated,
      matchingCourses,
    };
  });

  const totalCUAccumulated = groups.reduce(
    (s, g) => s + Math.min(g.cuAccumulated, g.group.cuNeeded),
    0
  );
  const allRequiredMet = groups.every((g) => g.met);

  return { major, groups, totalCUAccumulated, allRequiredMet };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function MajorSelector({ courses, declaredMajor, waivers = [] }: { courses: SavedCourse[]; declaredMajor: string | null; waivers?: WaiverEntry[] }) {
  const [selectedId, setSelectedId] = useState<string>("");

  const selectedMajor = MAJORS.find((m) => m.id === selectedId);
  const waiverCourses: SavedCourse[] = waivers.map((w) => ({
    courseId: w.courseId,
    title: w.courseId,
    credits: 1.0,
    grade: w.type === "waived" ? "Waived" : "Substituted",
    term: null,
    crossListedAs: [],
    officialTitle: null,
    officialCredits: 1.0,
    department: null,
  }));
  const allCourses = [...courses, ...waiverCourses];
  const status = selectedMajor ? computeMajorStatus(selectedMajor, allCourses) : null;

  const progressPercent = status
    ? Math.min(100, (status.totalCUAccumulated / status.major.totalCURequired) * 100)
    : 0;

  return (
    <div>
      {/* Declared major from transcript */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 28px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 36, height: 36, background: "#e8edf7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎓</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Declared major on transcript</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#011F5B", marginTop: 2 }}>
            {declaredMajor ?? "Not found"}
          </div>
        </div>
      </div>

      {/* Major picker */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "28px 32px", marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
          Explore a major — see what your progress would look like
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px",
            border: "1.5px solid #d1d5db",
            borderRadius: 8,
            fontSize: 14,
            color: "#111827",
            background: "#fff",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="">— Choose a major —</option>
          {MAJORS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      {status && (
        <div>
          {/* Header card */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "28px 32px", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
                  {status.major.name}
                </div>
                <a
                  href={status.major.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: "#011F5B", textDecoration: "none", fontWeight: 600 }}
                >
                  View official requirements →
                </a>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: status.allRequiredMet ? "#166534" : "#011F5B" }}>
                  {status.totalCUAccumulated % 1 === 0
                    ? status.totalCUAccumulated
                    : status.totalCUAccumulated.toFixed(1)}{" "}
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#6b7280" }}>
                    / {status.major.totalCURequired} CU
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                  {status.allRequiredMet ? "All requirements met ✓" : "In progress"}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: "#f3f4f6", borderRadius: 999, height: 8, overflow: "hidden" }}>
              <div style={{
                width: `${progressPercent}%`,
                height: "100%",
                background: status.allRequiredMet ? "#16a34a" : "#011F5B",
                borderRadius: 999,
                transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
              {progressPercent.toFixed(0)}% complete
            </div>

            {status.major.notes && (
              <div style={{ marginTop: 16, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e" }}>
                ℹ️ {status.major.notes}
              </div>
            )}

            {status.major.unavailable && (
              <div style={{ marginTop: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#b91c1c" }}>
                ⚠️ Full requirements for this major are not publicly available. Results shown are approximate.{" "}
                <a href={status.major.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#b91c1c", fontWeight: 700 }}>
                  Visit the official page →
                </a>
              </div>
            )}
          </div>

          {/* Requirement groups */}
          {status.major.groups.length > 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "16px 28px", borderBottom: "1px solid #f3f4f6", background: "#f9fafb" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Requirement Breakdown</div>
              </div>
              {status.groups.map((gs, i) => (
                <GroupRow key={i} gs={gs} />
              ))}
            </div>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "32px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              Detailed requirements not available for this major.
            </div>
          )}
        </div>
      )}

      {!selectedId && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "48px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Select a major to see your progress
          </div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>
            We'll map your completed courses against the requirements.
          </div>
        </div>
      )}
    </div>
  );
}

// ── GroupRow ───────────────────────────────────────────────────────────────────

function GroupRow({ gs }: { gs: GroupStatus }) {
  const { group, met, cuAccumulated, matchingCourses } = gs;

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
      padding: "16px 28px",
      borderBottom: "1px solid #f9fafb",
    }}>
      {/* Status icon */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, marginTop: 1,
        background: met ? "#dcfce7" : cuAccumulated > 0 ? "#fef9c3" : "#fef2f2",
        color: met ? "#166534" : cuAccumulated > 0 ? "#a16207" : "#dc2626",
      }}>
        {met ? "✓" : cuAccumulated > 0 ? "~" : "✗"}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
          {group.label}
        </div>
        {group.type === "elective-pool" && (
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            {cuAccumulated.toFixed(1)} / {group.cuNeeded} CU accumulated
          </div>
        )}
      </div>

      {/* Courses from transcript */}
      <div style={{ textAlign: "right", flexShrink: 0, maxWidth: 280 }}>
        {matchingCourses.length > 0 ? (
          <div>
            {matchingCourses.map((c) => (
              <div key={c.courseId} style={{ fontSize: 12, marginBottom: 2 }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#011F5B" }}>
                  {c.courseId}
                </span>{" "}
                <span style={{ color: "#374151" }}>{c.officialTitle ?? c.title}</span>
                <span style={{ color: "#9ca3af", marginLeft: 4 }}>
                  · {c.officialCredits ?? c.credits} CU
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 4,
            background: "#fef2f2", color: "#dc2626",
          }}>
            Not yet completed
          </span>
        )}
      </div>
    </div>
  );
}
