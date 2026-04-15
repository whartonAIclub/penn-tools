"use client";

import { useState, useMemo } from "react";
import { TranscriptFlow, type ParsedCourse } from "./TranscriptFlow";
import { WaiversEditor } from "./waivers/WaiversEditor";
import { MajorSelector } from "./requirements/majors/MajorSelector";
import { SchedulerSection } from "./SchedulerSection";
import { BidGuidanceSection } from "./BidGuidanceSection";
import { FIXED_CORE, FLEXIBLE_CORE } from "./requirementsData";
import { MAJORS } from "./majorsData";
import { CATALOG_BY_ID } from "./courseCatalog";
import type { WaiverEntry } from "./waiversPersistence";
import type { SavedCourse } from "./transcriptPersistence";
import type { BidGuidance } from "@penntools/tool-1/track4";
import { buildCourseCatalog } from "@penntools/tool-1/track3";
import type { ShortlistItem } from "@penntools/tool-1/track3";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import rawSections from "../../../../../../tools/1/course-match-static/_sections_raw.json";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CourseOption { courseId: string; title: string; department: string }

interface WizardProps {
  requirementCourses: CourseOption[];
  defaultGuidance: BidGuidance[];
  defaultStoredTerms: string[];
  isUsingSeedData: boolean;
}

// ── Step definitions ───────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Transcript",    short: "1" },
  { id: 2, label: "Waivers",       short: "2" },
  { id: 3, label: "Major",         short: "3" },
  { id: 4, label: "Requirements",  short: "4" },
  { id: 5, label: "Shortlist",     short: "5" },
  { id: 6, label: "Schedule & Bid", short: "6" },
];

// ── Helper: build SavedCourse from ParsedCourse ────────────────────────────────

function toSavedCourse(c: ParsedCourse): SavedCourse {
  return { courseId: c.courseId, title: c.title, credits: c.credits, grade: c.grade,
    term: c.term, crossListedAs: c.crossListedAs, officialTitle: c.officialTitle,
    officialCredits: c.officialCredits, department: c.department };
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export function WizardClient({
  requirementCourses, defaultGuidance, defaultStoredTerms, isUsingSeedData,
}: WizardProps) {
  // Step gating: can only reach step N if step N-1 is done
  const [step, setStep]               = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    return parseInt(localStorage.getItem("wizard_step") ?? "1", 10) || 1;
  });
  const [maxStep, setMaxStep]         = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    return parseInt(localStorage.getItem("wizard_max_step") ?? "1", 10) || 1;
  });

  // Step 1 output — initialized from localStorage
  const [courses, setCourses]         = useState<SavedCourse[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("wizard_transcript_courses") ?? "[]") as SavedCourse[]; }
    catch { return []; }
  });
  const [declaredMajor, setDeclaredMajor] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const meta = JSON.parse(localStorage.getItem("wizard_transcript_meta") ?? "null") as { declaredMajor: string | null } | null;
      return meta?.declaredMajor ?? null;
    } catch { return null; }
  });

  // Step 2 output — initialized from localStorage
  const [waivers, setWaivers]         = useState<WaiverEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("wizard_waivers") ?? "[]") as WaiverEntry[]; }
    catch { return []; }
  });

  // Step 3 output
  const [selectedMajorId, setSelectedMajorId] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("wizard_major_id") ?? "") : ""
  );

  // Step 5 output: shortlisted course IDs
  const [shortlistedIds, setShortlistedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("wizard_shortlist") ?? "[]") as string[]; }
    catch { return []; }
  });

  function advance(nextStep: number) {
    const next = Math.min(nextStep, 6);
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
    if (typeof window !== "undefined") {
      localStorage.setItem("wizard_step", String(next));
      localStorage.setItem("wizard_max_step", String(Math.max(maxStep, next)));
    }
  }

  function goTo(s: number) {
    if (s > maxStep) return; // gated
    setStep(s);
    if (typeof window !== "undefined") localStorage.setItem("wizard_step", String(s));
  }

  // ── Step 1 complete ────────────────────────────────────────────────────────

  function onTranscriptComplete(parsed: ParsedCourse[], major: string | null) {
    const saved = parsed.map(toSavedCourse);
    setCourses(saved);
    setDeclaredMajor(major);
    advance(2);
  }

  // ── Step 2 complete ────────────────────────────────────────────────────────

  function onWaiversComplete(saved: WaiverEntry[]) {
    setWaivers(saved);
    advance(3);
  }

  // ── Step 3 complete ────────────────────────────────────────────────────────

  function onMajorComplete(majorId: string) {
    setSelectedMajorId(majorId);
    if (typeof window !== "undefined") localStorage.setItem("wizard_major_id", majorId);
    advance(4);
  }

  // ── Step 4: compute suggested courses ─────────────────────────────────────

  const suggestedCourseIds = useMemo((): string[] => {
    const takenIds = new Set([
      ...courses.map((c) => c.courseId).filter(Boolean),
      ...waivers.map((w) => w.courseId),
    ]);
    const suggestions: string[] = [];
    const add = (id: string) => { if (!takenIds.has(id) && !suggestions.includes(id)) suggestions.push(id); };

    // Unmet graduation requirements
    for (const req of [...FIXED_CORE, ...FLEXIBLE_CORE]) {
      const met = req.options.some((o) => takenIds.has(o));
      if (!met) req.options.forEach(add);
    }

    // Unmet major requirements
    const major = MAJORS.find((m) => m.id === selectedMajorId);
    if (major) {
      const waiverCourses: SavedCourse[] = waivers.map((w) => ({
        courseId: w.courseId, title: w.courseId, credits: 1, grade: w.type === "waived" ? "Waived" : "Substituted",
        term: null, crossListedAs: [], officialTitle: null, officialCredits: 1, department: null,
      }));
      const allCourses = [...courses, ...waiverCourses];
      const takenSet = new Set(allCourses.map((c) => c.courseId).filter(Boolean));
      for (const group of major.groups) {
        const groupMet = group.courses.some((id) => takenSet.has(id));
        if (!groupMet) group.courses.slice(0, 4).forEach(add);
      }
    }
    return suggestions.slice(0, 20);
  }, [courses, waivers, selectedMajorId]);

  function onRequirementsDone() { advance(5); }

  // ── Step 5: shortlist ──────────────────────────────────────────────────────

  function onShortlistComplete(ids: string[]) {
    setShortlistedIds(ids);
    if (typeof window !== "undefined") localStorage.setItem("wizard_shortlist", JSON.stringify(ids));
    advance(6);
  }

  // ── Step 6: build ShortlistItem[] from IDs ─────────────────────────────────

  const schedulerShortlist = useMemo((): ShortlistItem[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catalog = buildCourseCatalog(rawSections as any);
    return shortlistedIds.flatMap((courseId) => {
      const normalized = courseId.replace(/\s+/g, " ").trim();
      const group = catalog.find((g) =>
        g.displayCourseIds.replace(/\s+/g, " ").includes(normalized) ||
        g.displayCourseIds.replace(/\s+/g, "").includes(normalized.replace(/\s+/g, ""))
      );
      if (!group) return [];
      return [{
        courseGroup: group,
        priority: "medium" as const,
        clientId: `wiz-${courseId}-${Math.random().toString(36).slice(2, 6)}`,
      }];
    });
  }, [shortlistedIds]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
      {/* Nav */}
      <div style={{ background: "#011F5B", height: 56, display: "flex", alignItems: "center", padding: "0 32px", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PennTools</span>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <span style={{ fontSize: 14, color: "#93b4e0" }}>CourseMatch Assist</span>
      </div>

      {/* Step indicator */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 32px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", height: 52 }}>
          {STEPS.map((s, i) => {
            const done    = maxStep > s.id;
            const active  = step === s.id;
            const locked  = s.id > maxStep;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <button
                  onClick={() => goTo(s.id)}
                  disabled={locked}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: locked ? "not-allowed" : "pointer", padding: "4px 0", opacity: locked ? 0.35 : 1 }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    background: done ? "#011F5B" : active ? "#011F5B" : "#fff",
                    border: `2px solid ${done || active ? "#011F5B" : "#d1d5db"}`,
                    color: done || active ? "#fff" : "#9ca3af",
                  }}>
                    {done ? "✓" : s.id}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? "#011F5B" : done ? "#374151" : "#9ca3af", whiteSpace: "nowrap" }}>
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: done ? "#011F5B" : "#e5e7eb", margin: "0 8px" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div style={{ maxWidth: step === 6 ? 1100 : 860, margin: "32px auto 80px", padding: "0 24px" }}>

        {/* ── Step 1: Transcript ── */}
        {step === 1 && (
          <>
            <StepHeader title="Upload your transcript" subtitle="We'll extract your completed courses to track your progress." />
            <TranscriptFlow onComplete={onTranscriptComplete} />
          </>
        )}

        {/* ── Step 2: Waivers ── */}
        {step === 2 && (
          <>
            <StepHeader title="Waivers & Substitutions" subtitle="Did you waive any courses or receive substitution credit? Add them here — or skip if none." />
            <WaiversEditor courses={requirementCourses} initial={waivers} onComplete={onWaiversComplete} />
          </>
        )}

        {/* ── Step 3: Major selection ── */}
        {step === 3 && (
          <>
            <StepHeader title="Select your major" subtitle="Choose a major to see your requirements and get tailored course suggestions." />
            <MajorSelector
              courses={courses}
              declaredMajor={declaredMajor}
              waivers={waivers}
              onComplete={onMajorComplete}
            />
          </>
        )}

        {/* ── Step 4: Requirements ── */}
        {step === 4 && (
          <RequirementsStep
            courses={courses}
            waivers={waivers}
            selectedMajorId={selectedMajorId}
            suggestedCourseIds={suggestedCourseIds}
            onContinue={onRequirementsDone}
          />
        )}

        {/* ── Step 5: Course shortlist ── */}
        {step === 5 && (
          <ShortlistStep
            suggestedCourseIds={suggestedCourseIds}
            initialSelected={shortlistedIds}
            onComplete={onShortlistComplete}
          />
        )}

        {/* ── Step 6: Schedule & Bid ── */}
        {step === 6 && (
          <>
            <StepHeader title="Schedule & Bid" subtitle="Build your schedule from your shortlisted courses and review bid guidance." />
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <SchedulerSection guidance={defaultGuidance} initialShortlist={schedulerShortlist} />
              <BidGuidanceSection
                defaultGuidance={defaultGuidance}
                defaultStoredTerms={defaultStoredTerms}
                isUsingSeedData={isUsingSeedData}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── StepHeader ─────────────────────────────────────────────────────────────────

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#011F5B", margin: "0 0 6px" }}>{title}</h2>
      <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>{subtitle}</p>
    </div>
  );
}

// ── Step 4: Requirements ───────────────────────────────────────────────────────

function RequirementsStep({
  courses, waivers, selectedMajorId, suggestedCourseIds, onContinue,
}: {
  courses: SavedCourse[];
  waivers: WaiverEntry[];
  selectedMajorId: string;
  suggestedCourseIds: string[];
  onContinue: () => void;
}) {
  const waiverCourses: SavedCourse[] = waivers.map((w) => ({
    courseId: w.courseId, title: w.courseId, credits: 1, grade: w.type === "waived" ? "Waived" : "Substituted",
    term: null, crossListedAs: [], officialTitle: null, officialCredits: 1, department: null,
  }));
  const allCourses = [...courses, ...waiverCourses];
  const courseMap  = new Map(allCourses.map((c) => [c.courseId, c]));

  const fixedStatuses  = FIXED_CORE.map((req) => ({
    req, met: req.options.some((o) => courseMap.has(o)),
    metBy: req.options.map((o) => courseMap.get(o)).find(Boolean) ?? null,
  }));
  const flexStatuses   = FLEXIBLE_CORE.map((req) => ({
    req, met: req.options.some((o) => courseMap.has(o)),
    metBy: req.options.map((o) => courseMap.get(o)).find(Boolean) ?? null,
  }));
  const fixedMet   = fixedStatuses.filter((s) => s.met).length;
  const flexMet    = flexStatuses.filter((s) => s.met).length;
  const unmetCount = fixedStatuses.filter((s) => !s.met).length + flexStatuses.filter((s) => !s.met).length;

  return (
    <div>
      <StepHeader title="Degree Requirements" subtitle="Review your graduation requirements. Unmet courses will be suggested in your shortlist." />

      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {[
          { v: `${fixedMet}/${fixedStatuses.length}`, l: "Fixed Core", ok: fixedMet === fixedStatuses.length },
          { v: `${flexMet}/${flexStatuses.length}`, l: "Flexible Core", ok: flexMet === flexStatuses.length },
          { v: unmetCount === 0 ? "Complete" : `${unmetCount} remaining`, l: "Total gaps", ok: unmetCount === 0 },
        ].map(({ v, l, ok }) => (
          <div key={l} style={{ flex: 1, background: "#fff", border: `1px solid ${ok ? "#bbf7d0" : "#e5e7eb"}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: ok ? "#166534" : "#011F5B", lineHeight: 1, marginBottom: 4 }}>{v}</div>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Fixed Core */}
      <RequirementSection title="Fixed Core" subtitle="Required for all Wharton MBA students." statuses={fixedStatuses} />
      {/* Flexible Core */}
      <RequirementSection title="Flexible Core" subtitle="Complete one course from each category." statuses={flexStatuses} />

      {/* Course suggestions */}
      {suggestedCourseIds.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "16px 28px", borderBottom: "1px solid #f3f4f6", background: "#f0f4ff" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#011F5B" }}>Suggested courses for your shortlist ({suggestedCourseIds.length})</div>
            <div style={{ fontSize: 12, color: "#4a6fa5", marginTop: 2 }}>These courses would fill your remaining gaps. You'll confirm your shortlist in the next step.</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "16px 28px" }}>
            {suggestedCourseIds.map((id) => {
              const entry = CATALOG_BY_ID.get(id);
              return (
                <div key={id} style={{ background: "#e8edf7", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#011F5B" }}>{id}</span>
                  {entry && <span style={{ color: "#4a5d86", marginLeft: 6 }}>{entry.title}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {selectedMajorId && (
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Major: <strong style={{ color: "#011F5B" }}>{MAJORS.find((m) => m.id === selectedMajorId)?.name ?? selectedMajorId}</strong>
          </div>
        )}
        <button
          onClick={onContinue}
          style={{ marginLeft: "auto", padding: "10px 28px", background: "#011F5B", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Continue to shortlist →
        </button>
      </div>
    </div>
  );
}

function RequirementSection({ title, subtitle, statuses }: {
  title: string; subtitle: string;
  statuses: Array<{ req: { id: string; label: string; options: string[]; optionLabels?: string[] }; met: boolean; metBy: SavedCourse | null }>;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      <div style={{ padding: "16px 28px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{subtitle}</div>
      </div>
      {statuses.map((s) => (
        <div key={s.req.id} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 28px", borderBottom: "1px solid #f9fafb" }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: s.met ? "#dcfce7" : "#fef2f2", color: s.met ? "#166534" : "#dc2626" }}>
            {s.met ? "✓" : "✗"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{s.req.label}</div>
            {!s.met && s.req.optionLabels && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{s.req.optionLabels.join(" · ")}</div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {s.met && s.metBy ? (
              <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: 12, color: "#011F5B" }}>{s.metBy.courseId}</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#fef2f2", color: "#dc2626" }}>Not completed</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 5: Course Shortlist ───────────────────────────────────────────────────

function ShortlistStep({
  suggestedCourseIds, initialSelected, onComplete,
}: {
  suggestedCourseIds: string[];
  initialSelected: string[];
  onComplete: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Pre-select all suggestions, plus any previously saved
    const s = new Set<string>([...suggestedCourseIds, ...initialSelected]);
    return s;
  });
  const [search, setSearch]     = useState("");

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Show suggestions + search results
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CATALOG_ALL = Array.from((CATALOG_BY_ID as Map<string, any>).entries()).map(([id, e]) => ({ courseId: id, title: e.title as string, department: e.department as string }));
  const searchResults = search.trim().length >= 2
    ? CATALOG_ALL.filter((c) =>
        c.courseId.toLowerCase().includes(search.toLowerCase()) ||
        c.title.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 12)
    : [];

  const sortedSelected = [...selected].sort();

  return (
    <div>
      <StepHeader
        title="Course Shortlist"
        subtitle="These courses are suggested based on your requirements gaps. Add or remove courses, then continue to build your schedule."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        {/* Left: suggestions + search */}
        <div>
          {/* Suggested courses */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", background: "#f0f4ff", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#011F5B" }}>Suggested ({suggestedCourseIds.length})</div>
              <div style={{ fontSize: 12, color: "#4a6fa5", marginTop: 2 }}>Based on your requirements gaps</div>
            </div>
            {suggestedCourseIds.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>No gaps found — all requirements met!</div>
            ) : (
              suggestedCourseIds.map((id) => {
                const e = CATALOG_BY_ID.get(id);
                const checked = selected.has(id);
                return (
                  <label key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", cursor: "pointer", background: checked ? "#f0f4ff" : undefined }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(id)} style={{ width: 16, height: 16, accentColor: "#011F5B", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: 12, color: "#011F5B" }}>{id}</span>
                        {e && <span style={{ fontSize: 11, color: "#6b7280" }}>{e.credits} CU</span>}
                      </div>
                      {e && <div style={{ fontSize: 12, color: "#374151", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>}
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {/* Search to add more */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search catalog to add more courses…"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            {searchResults.length > 0 && searchResults.map((c) => {
              const checked = selected.has(c.courseId);
              return (
                <label key={c.courseId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid #f3f4f6", cursor: "pointer", background: checked ? "#f0f4ff" : undefined }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.courseId)} style={{ width: 16, height: 16, accentColor: "#011F5B", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: 12, color: "#011F5B" }}>{c.courseId}</span>
                    <span style={{ fontSize: 12, color: "#374151", marginLeft: 8 }}>{c.title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{c.department}</span>
                </label>
              );
            })}
            {search.trim().length >= 2 && searchResults.length === 0 && (
              <div style={{ padding: "16px 20px", fontSize: 13, color: "#9ca3af" }}>No matches found.</div>
            )}
            {search.trim().length < 2 && (
              <div style={{ padding: "16px 20px", fontSize: 13, color: "#9ca3af" }}>Type at least 2 characters to search.</div>
            )}
          </div>
        </div>

        {/* Right: shortlist summary */}
        <div style={{ position: "sticky", top: 24 }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", background: "#011F5B" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Your shortlist ({selected.size})</div>
            </div>
            {sortedSelected.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>No courses selected yet.</div>
            ) : (
              sortedSelected.map((id) => {
                const e = CATALOG_BY_ID.get(id);
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: 12, color: "#011F5B" }}>{id}</div>
                      {e && <div style={{ fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>}
                    </div>
                    <button onClick={() => toggle(id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 14, padding: "2px 6px" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#d1d5db")}>✕</button>
                  </div>
                );
              })
            )}
            <div style={{ padding: "16px 20px" }}>
              <button
                onClick={() => onComplete([...selected])}
                style={{ width: "100%", padding: "10px 0", background: selected.size > 0 ? "#011F5B" : "#e5e7eb", color: selected.size > 0 ? "#fff" : "#9ca3af", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: selected.size > 0 ? "pointer" : "not-allowed" }}
                disabled={selected.size === 0}
              >
                {selected.size > 0 ? `Continue with ${selected.size} courses →` : "Select at least one course"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
