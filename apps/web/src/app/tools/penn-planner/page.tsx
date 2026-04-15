"use client";

import { useState, useRef, useEffect } from "react";
import {
  type GCalAuthState, type GCalEvent, type GCalTimeSlot,
  getStoredAuth, isTokenValid, initGCalAuth, signOut,
  fetchCalendarEvents, eventsToOccupiedSlots, pushBlocksToCalendar,
} from "./gcal";

// ── Google Calendar ───────────────────────────────────────────────────────────
const GCAL_CLIENT_ID = process.env.NEXT_PUBLIC_GCAL_CLIENT_ID ?? "";

// ── MBA Reference Dataset ──────────────────────────────────────────────────────

const MBA_REFERENCE = {
  "case":          { baseHours: 3.0,  label: "Case Study" },
  "essay":         { baseHours: 4.0,  label: "Essay" },
  "problem-set":   { baseHours: 5.0,  label: "Problem Set" },
  "reading":       { baseHours: 2.0,  label: "Reading" },
  "presentation":  { baseHours: 6.0,  label: "Presentation" },
  "exam":          { baseHours: 8.0,  label: "Exam Prep" },
  "reflection":    { baseHours: 1.5,  label: "Reflection" },
  "group-project": { baseHours: 10.0, label: "Group Project" },
  "quiz":          { baseHours: 2.0,  label: "Quiz Prep" },
  "other":         { baseHours: 2.0,  label: "Other" },
} as const;

type AssignmentType = keyof typeof MBA_REFERENCE;

const RIGOR_LABELS      = ["Just Pass", "Get It Done", "Balanced", "High Effort", "Dean's List"];
const RIGOR_MULTIPLIERS = [0.70, 0.85, 1.00, 1.20, 1.50];

// ── Types ──────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  name: string;
  course: string;
  type: AssignmentType;
  dueDate: string;
  estimatedHours: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  syllabusIndex: number;
}

interface CalendarBlock {
  id: string;
  assignmentId: string;
  assignmentName: string;
  course: string;
  type: AssignmentType;
  date: string;
  startHour: number;
  hours: number;
  included: boolean;
  syllabusIndex: number;
}

interface SyllabusFile {
  file: File;
  name: string;
}

type Step = "setup" | "generating" | "review" | "calendar" | "how-it-works";
type IncludeMode = "core" | "readings" | "all";

// ── Type-based color palette (used on dashboard/calendar) ─────────────────────

const TYPE_COLORS: Record<AssignmentType, { bg: string; border: string; text: string; dot: string }> = {
  "exam":          { bg: "#fef2f2", border: "#dc2626", text: "#991b1b", dot: "#dc2626" }, // red
  "quiz":          { bg: "#fff7ed", border: "#ea580c", text: "#9a3412", dot: "#ea580c" }, // orange
  "reading":       { bg: "#faf5ff", border: "#9333ea", text: "#6b21a8", dot: "#9333ea" }, // purple
  "group-project": { bg: "#f0fdf4", border: "#16a34a", text: "#166534", dot: "#16a34a" }, // green
  "presentation":  { bg: "#ecfdf5", border: "#059669", text: "#065f46", dot: "#059669" }, // teal
  "case":          { bg: "#eff6ff", border: "#2563eb", text: "#1e40af", dot: "#2563eb" }, // blue
  "essay":         { bg: "#eff6ff", border: "#2563eb", text: "#1e40af", dot: "#2563eb" }, // blue
  "problem-set":   { bg: "#fefce8", border: "#ca8a04", text: "#854d0e", dot: "#ca8a04" }, // amber
  "reflection":    { bg: "#f0f9ff", border: "#0284c7", text: "#0c4a6e", dot: "#0284c7" }, // sky
  "other":         { bg: "#f9fafb", border: "#6b7280", text: "#374151", dot: "#6b7280" }, // gray
};

// ── Per-syllabus color palette (used on review step) ──────────────────────────

const SYLLABUS_COLORS: { bg: string; border: string; text: string; dot: string }[] = [
  { bg: "#eff6ff", border: "#2563eb", text: "#1e40af", dot: "#2563eb" },
  { bg: "#fef2f2", border: "#dc2626", text: "#991b1b", dot: "#dc2626" },
  { bg: "#f0fdf4", border: "#16a34a", text: "#166534", dot: "#16a34a" },
  { bg: "#fefce8", border: "#ca8a04", text: "#854d0e", dot: "#ca8a04" },
  { bg: "#faf5ff", border: "#9333ea", text: "#6b21a8", dot: "#9333ea" },
  { bg: "#fff7ed", border: "#ea580c", text: "#9a3412", dot: "#ea580c" },
];

function syllabusColor(idx: number) {
  return SYLLABUS_COLORS[idx % SYLLABUS_COLORS.length]!;
}

// ── Palette ────────────────────────────────────────────────────────────────────

const C = {
  blue:      "#2563eb",
  blueSoft:  "#eff6ff",
  red:       "#dc2626",
  gray:      "#6b7280",
  grayLight: "#f3f4f6",
  border:    "#e5e7eb",
  text:      "#111827",
  textMid:   "#374151",
  white:     "#ffffff",
  green:     "#16a34a",
  amber:     "#d97706",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0]!;
}

async function extractTextFromPDF(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/tools/penn-planner/parse-pdf", {
    method: "POST", body: formData,
  });
  if (!res.ok) throw new Error(`PDF parse failed: ${res.status}`);
  const data = await res.json() as { text?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return data.text ?? "";
}

function getMockAssignments(rigor: number, syllabusIndex = 0): Assignment[] {
  const m = RIGOR_MULTIPLIERS[rigor]!;
  const r = (type: AssignmentType) =>
    Math.round(MBA_REFERENCE[type].baseHours * m * 2) / 2;
  const today = new Date().toISOString().split("T")[0]!;

  return ([
    {
      id: "a1", name: "Case Analysis: Wharton Retail Strategy",
      course: "MGMT 611", type: "case" as AssignmentType, dueDate: addDays(5),
      estimatedHours: r("case"), confidence: "high",
      reasoning: "Standard Wharton case; rigor multiplier applied.",
      syllabusIndex,
    },
    {
      id: "a2", name: "Financial Modeling Problem Set 1",
      course: "FNCE 601", type: "problem-set", dueDate: addDays(8),
      estimatedHours: r("problem-set"), confidence: "high",
      reasoning: "Quantitative problem set; adjusted for rigor.",
      syllabusIndex,
    },
    {
      id: "a3", name: "Weekly Reading — Chapters 4–6",
      course: "MGMT 611", type: "reading", dueDate: addDays(3),
      estimatedHours: r("reading"), confidence: "medium",
      reasoning: "Three chapters; estimate based on average reading speed.",
      syllabusIndex,
    },
    {
      id: "a4", name: "Group Project: Market Entry Plan",
      course: "MKTG 621", type: "group-project", dueDate: addDays(18),
      estimatedHours: r("group-project"), confidence: "medium",
      reasoning: "Group project complexity varies; using baseline.",
      syllabusIndex,
    },
    {
      id: "a5", name: "Midterm Exam",
      course: "FNCE 601", type: "exam", dueDate: addDays(14),
      estimatedHours: r("exam"), confidence: "high",
      reasoning: "Full exam prep block; rigor multiplier applied.",
      syllabusIndex,
    },
    {
      id: "a6", name: "Reflection Paper — Leadership Module",
      course: "MGMT 611", type: "reflection", dueDate: addDays(10),
      estimatedHours: r("reflection"), confidence: "high",
      reasoning: "Short reflection paper; low variance.",
      syllabusIndex,
    },
  ] as Assignment[]).filter(a => a.dueDate >= today);
}

function generateCalendarBlocks(
  assignments: Assignment[],
  occupiedSlots?: GCalTimeSlot[],
): CalendarBlock[] {
  const blocks: CalendarBlock[] = [];
  const today = new Date();
  const selfOccupied: GCalTimeSlot[] = [];
  const PREFERRED_HOURS = [9, 14, 19, 11, 16, 20];

  function isConflict(date: string, startH: number, durationH: number): boolean {
    const endH = startH + durationH;
    const allSlots = [...(occupiedSlots ?? []), ...selfOccupied];
    return allSlots.some(
      s => s.date === date && startH < s.endHour && endH > s.startHour,
    );
  }

  for (const a of assignments) {
    const due       = new Date(a.dueDate + "T12:00:00");
    const daysUntil = Math.max(1, Math.ceil((due.getTime() - today.getTime()) / 86_400_000));
    const sessions  = Math.max(1, Math.ceil(a.estimatedHours / 2));
    const hrs       = Math.round((a.estimatedHours / sessions) * 10) / 10;

    for (let s = 0; s < sessions; s++) {
      const daysBack = Math.floor((daysUntil * (sessions - s)) / (sessions + 1));
      const d        = new Date(due);
      d.setDate(due.getDate() - daysBack);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() - 1);

      const dateStr = d.toISOString().split("T")[0]!;

      // Pick first non-conflicting preferred slot, else fall back to alternating
      let chosenHour = s % 2 === 0 ? 9 : 19;
      if (occupiedSlots && occupiedSlots.length > 0) {
        for (const h of PREFERRED_HOURS) {
          if (!isConflict(dateStr, h, hrs)) { chosenHour = h; break; }
        }
      }

      selfOccupied.push({ date: dateStr, startHour: chosenHour, endHour: chosenHour + hrs });

      blocks.push({
        id:             `${a.id}-b${s}`,
        assignmentId:   a.id,
        assignmentName: a.name,
        course:         a.course,
        type:           a.type,
        date:           dateStr,
        startHour:      chosenHour,
        hours:          hrs,
        included:       true,
        syllabusIndex:  a.syllabusIndex,
      });
    }
  }
  return blocks.sort((a, b) => a.date.localeCompare(b.date));
}

function toGCalUrl(b: CalendarBlock): string {
  const start = new Date(`${b.date}T${String(b.startHour).padStart(2, "0")}:00:00`);
  const end   = new Date(start.getTime() + b.hours * 3_600_000);
  const fmt   = (d: Date) => d.toISOString().replace(/[-:.Z]/g, "").slice(0, 15);
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(`📚 ${b.assignmentName}`)}` +
    `&dates=${fmt(start)}/${fmt(end)}` +
    `&details=${encodeURIComponent(`Study block — ${b.course}\n${b.assignmentName}`)}`
  );
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtHour(h: number) {
  return h === 12 ? "12:00 PM" : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
}

// ── Semester Timeline Strip ────────────────────────────────────────────────────

function SemesterStrip({
  blocks, weekOffset, onJump,
}: {
  blocks: CalendarBlock[];
  weekOffset: number;
  onJump: (n: number) => void;
}) {
  const today   = new Date();
  const baseSun = new Date(today);
  baseSun.setDate(today.getDate() - today.getDay());

  const WEEKS = 16;
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const sun = new Date(baseSun);
    sun.setDate(baseSun.getDate() + i * 7);
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    const sunStr = sun.toISOString().split("T")[0]!;
    const satStr = sat.toISOString().split("T")[0]!;
    const hasDue = blocks.some(b => b.included && b.date >= sunStr && b.date <= satStr);
    return { i, hasDue };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 14 }}>
      <span style={{ fontSize: 10, color: C.gray, marginRight: 6, whiteSpace: "nowrap" }}>Semester</span>
      {weeks.map(w => (
        <button
          key={w.i}
          onClick={() => onJump(w.i)}
          title={`Week ${w.i + 1}`}
          style={{
            width:        w.i === weekOffset ? 10 : 6,
            height:       w.i === weekOffset ? 10 : 6,
            borderRadius: "50%",
            background:   w.i === weekOffset ? C.blue : w.hasDue ? "#93c5fd" : C.border,
            border:       "none",
            cursor:       "pointer",
            padding:      0,
            flexShrink:   0,
            transition:   "all 0.12s",
          }}
        />
      ))}
      <span style={{ fontSize: 10, color: C.gray, marginLeft: 4 }}>16 wks</span>
    </div>
  );
}

// ── Weekly Calendar Grid ───────────────────────────────────────────────────────

function WeeklyCalendar({
  blocks, syllabusNames, onToggle,
}: {
  blocks: CalendarBlock[];
  syllabusNames: string[];
  onToggle: (id: string) => void;
}) {
  // Default to current week (offset 0 = this week)
  const [weekOffset, setWeekOffset] = useState(0);
  const today    = new Date();
  const todayStr = today.toISOString().split("T")[0]!;
  const DAY_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  // Always anchor to today's Sunday
  const baseSun = new Date(today);
  baseSun.setDate(today.getDate() - today.getDay());

  const sun = new Date(baseSun);
  sun.setDate(baseSun.getDate() + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun); d.setDate(sun.getDate() + i); return d;
  });

  const weekLabel = `${days[0]!.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6]!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div>
      {/* Semester strip */}
      <SemesterStrip blocks={blocks} weekOffset={weekOffset} onJump={setWeekOffset} />

      {/* Week navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => setWeekOffset(o => o - 1)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}>
          ← Prev
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {weekLabel}
        </span>
        <button onClick={() => setWeekOffset(o => o + 1)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}>
          Next →
        </button>
      </div>

      {/* Legend — by assignment type */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {(Object.entries(TYPE_COLORS) as [AssignmentType, typeof TYPE_COLORS[AssignmentType]][])
          .filter(([type]) => blocks.some(b => b.type === type && b.included))
          .map(([type, tc]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.gray }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: tc.bg, border: `1.5px solid ${tc.border}` }} />
              {MBA_REFERENCE[type].label}
            </div>
          ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {days.map((day, i) => {
          const dayStr    = day.toISOString().split("T")[0];
          const dayBlocks = blocks.filter(b => b.date === dayStr);
          const isToday   = dayStr === todayStr;

          return (
            <div key={i}>
              <div style={{ textAlign: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.gray, letterSpacing: "0.05em" }}>
                  {DAY_ABBR[i]}
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", margin: "2px auto 0",
                  background: isToday ? C.blue : "transparent",
                  color:      isToday ? C.white : C.text,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: isToday ? 700 : 500,
                }}>
                  {day.getDate()}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {dayBlocks.map(b => {
                  const tc = TYPE_COLORS[b.type];
                  return (
                    <div key={b.id} onClick={() => onToggle(b.id)}
                      title={`${b.assignmentName} — click to toggle`}
                      style={{
                        borderRadius: 5, padding: "5px 6px", cursor: "pointer",
                        background:  b.included ? tc.bg   : C.grayLight,
                        borderLeft:  `3px solid ${b.included ? tc.border : C.border}`,
                        opacity:     b.included ? 1 : 0.45,
                        transition:  "all 0.1s",
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: b.included ? tc.text : C.gray }}>
                        {fmtHour(b.startHour)}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMid, lineHeight: 1.3, marginTop: 1, wordBreak: "break-word" }}>
                        {b.course}
                      </div>
                      <div style={{ fontSize: 10, color: C.gray, marginTop: 1 }}>
                        {fmtHour(b.startHour + Math.ceil(b.hours))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: C.gray, margin: "10px 0 0", textAlign: "center" }}>
        Click a block to toggle it on/off
      </p>
    </div>
  );
}

// ── Confidence dot ─────────────────────────────────────────────────────────────

function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const color = level === "high" ? C.green : level === "medium" ? C.amber : C.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.gray }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      {level}
    </span>
  );
}

// ── Type badge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: AssignmentType }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, color: C.gray,
      border: `1px solid ${C.border}`, borderRadius: 99,
      padding: "1px 7px", whiteSpace: "nowrap" as const,
    }}>
      {MBA_REFERENCE[type].label}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PennPlannerPage() {
  const [step,          setStep]          = useState<Step>("setup");
  const [rigor,         setRigor]         = useState(2);
  const [includeMode,   setIncludeMode]   = useState<IncludeMode>("core");
  const [syllabusFiles, setSyllabusFiles] = useState<SyllabusFile[]>([]);
  const [assignments,   setAssignments]   = useState<Assignment[]>([]);
  const [blocks,        setBlocks]        = useState<CalendarBlock[]>([]);
  const [error,         setError]         = useState<string | null>(null);
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [newA,          setNewA]          = useState<{
    name: string; course: string; type: AssignmentType;
    dueDate: string; estimatedHours: number; syllabusIndex: number;
  }>({ name: "", course: "", type: "other", dueDate: "", estimatedHours: 2, syllabusIndex: 0 });
  const [windowWidth,   setWindowWidth]   = useState(1200);
  const [gcalAuth,       setGcalAuth]       = useState<GCalAuthState>({ accessToken: null, expiresAt: null, userEmail: null });
  const [gcalEvents,     setGcalEvents]     = useState<GCalEvent[]>([]);
  const [gcalLoading,    setGcalLoading]    = useState(false);
  const [gcalPushStatus, setGcalPushStatus] = useState<{ created: number; failed: string[] } | null>(null);
  const [showManualLinks, setShowManualLinks] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const stored = getStoredAuth();
    if (stored.accessToken && isTokenValid(stored)) setGcalAuth(stored);
  }, []);

  // Responsive layout
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const llmHeaders = () => ({ "Content-Type": "application/json" });
  const llmModel   = () => "gpt-4o-mini";

  const includeModePrompt: Record<IncludeMode, string> = {
    core:     "ONLY extract explicitly graded deliverables: assignments, problem sets, case analyses, quizzes, projects, and exams. Skip readings, lecture notes, and guest speakers.",
    readings: "Extract graded deliverables (assignments, exams, quizzes, projects) AND required reading assignments. Skip lecture topics and guest speakers.",
    all:      "Extract ALL academic tasks: assignments, exams, quizzes, projects, readings, reflections, and any other coursework mentioned.",
  };

  // ── Generate plan ─────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setError(null);
    setStep("generating");

    const today = new Date().toISOString().split("T")[0]!;

    if (syllabusFiles.length === 0) {
      await new Promise(r => setTimeout(r, 600));
      setAssignments(getMockAssignments(rigor, 0));
      setStep("review");
      return;
    }

    try {
      const multiplier = RIGOR_MULTIPLIERS[rigor];
      const refLines   = Object.entries(MBA_REFERENCE)
        .map(([k, v]) => `  ${k}: ${v.baseHours}h baseline`).join("\n");

      const allAssignments: Assignment[] = [];

      for (let syllabusIndex = 0; syllabusIndex < syllabusFiles.length; syllabusIndex++) {
        const { file } = syllabusFiles[syllabusIndex]!;
        const text = await extractTextFromPDF(file);

        const parsePrompt = `You are a syllabus parser for a Penn MBA/graduate student.

Scope: ${includeModePrompt[includeMode]}

Additional rules:
- If a due date is embedded in the name (e.g. "Project 2 - 3/8 by 11:59pm"), use THAT date
- If the syllabus is a table with a "Deliverables" column, only rows where that column is non-empty count
- ONLY include items with due dates on or after today (${today})

Syllabus text:
${text}

Today is ${today}.
Return ONLY a valid JSON array — no markdown, no explanation:
[{"id":"s${syllabusIndex}_a1","name":"exact deliverable name","course":"course name or number","type":"case|essay|problem-set|reading|presentation|exam|reflection|group-project|quiz|other","dueDate":"YYYY-MM-DD"}]`;

        const parseRes = await fetch("/api/llm/complete", {
          method: "POST", headers: llmHeaders(),
          body: JSON.stringify({ prompt: parsePrompt, model: llmModel() }),
        });

        if (!parseRes.ok) throw new Error("llm_unavailable");
        const parseData  = await parseRes.json() as { content: string };
        const parseMatch = parseData.content.match(/\[[\s\S]*\]/);
        const parsed: Omit<Assignment, "estimatedHours" | "confidence" | "reasoning" | "syllabusIndex">[] =
          JSON.parse(parseMatch ? parseMatch[0] : parseData.content);
        if (!Array.isArray(parsed) || parsed.length === 0) continue;

        const estimatePrompt = `You are an effort estimation engine for Penn MBA students.

Student profile:
- Rigor mode: ${RIGOR_LABELS[rigor]} (${Math.round(multiplier! * 100)}% of baseline)

MBA average hours by type (at 1.0× rigor):
${refLines}

Apply the rigor multiplier. Return a JSON array:
[{"id":"same as input","estimatedHours":number,"confidence":"high|medium|low","reasoning":"one sentence"}]

Assignments:
${JSON.stringify(parsed, null, 2)}

Return ONLY valid JSON array. No markdown.`;

        const estRes = await fetch("/api/llm/complete", {
          method: "POST", headers: llmHeaders(),
          body: JSON.stringify({ prompt: estimatePrompt, model: llmModel() }),
        });

        if (!estRes.ok) throw new Error("llm_unavailable");
        const estData  = await estRes.json() as { content: string };
        const estMatch = estData.content.match(/\[[\s\S]*\]/);
        const estimates: { id: string; estimatedHours: number; confidence: "high"|"medium"|"low"; reasoning: string }[] =
          JSON.parse(estMatch ? estMatch[0] : estData.content);

        const estMap = Object.fromEntries(estimates.map(e => [e.id, e]));
        const syllabusAssignments: Assignment[] = parsed
          .filter(a => a.dueDate >= today)
          .map(a => {
            const safeType = (a.type in MBA_REFERENCE ? a.type : "other") as AssignmentType;
            return {
              ...a, type: safeType,
              estimatedHours: estMap[a.id]?.estimatedHours ?? MBA_REFERENCE[safeType].baseHours,
              confidence:     estMap[a.id]?.confidence     ?? "medium",
              reasoning:      estMap[a.id]?.reasoning      ?? "",
              syllabusIndex,
            };
          });

        allAssignments.push(...syllabusAssignments);
      }

      if (allAssignments.length === 0) throw new Error("empty_parse");
      setAssignments(allAssignments);
      setStep("review");
    } catch (err) {
      const msg = String(err);
      // Fall back to mock data for any PDF or LLM failure — keeps the demo working
      setError("Could not process syllabus — showing sample Wharton data instead.");
      setAssignments(getMockAssignments(rigor, 0));
      setStep("review");
      console.error("[penn-planner] generate error:", msg);
    }
  }

  async function handleBuildCalendar() {
    let occupied: GCalTimeSlot[] = [];
    if (gcalAuth.accessToken && isTokenValid(gcalAuth)) {
      setGcalLoading(true);
      try {
        const dates = assignments.map(a => a.dueDate).sort();
        const timeMin = new Date().toISOString();
        const timeMax = new Date(dates[dates.length - 1]! + "T23:59:59").toISOString();
        const events = await fetchCalendarEvents(gcalAuth.accessToken, timeMin, timeMax);
        setGcalEvents(events);
        occupied = eventsToOccupiedSlots(events);
      } catch (err) {
        if (String(err).includes("token_expired")) {
          setGcalAuth({ accessToken: null, expiresAt: null, userEmail: null });
        }
        // Fall back to no conflict avoidance
      }
      setGcalLoading(false);
    }
    setBlocks(generateCalendarBlocks(assignments, occupied));
    setGcalPushStatus(null);
    setStep("calendar");
  }

  function setHours(id: string, newHours: number) {
    setAssignments(prev =>
      prev.map(a =>
        a.id === id
          ? { ...a, estimatedHours: Math.max(0.5, Math.round(newHours * 10) / 10) }
          : a
      )
    );
  }

  function toggleBlock(id: string) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, included: !b.included } : b));
  }

  function deleteAssignment(id: string) {
    setAssignments(prev => prev.filter(a => a.id !== id));
  }

  function addAssignment() {
    if (!newA.name || !newA.dueDate) return;
    setAssignments(prev => [...prev, {
      ...newA,
      id: `manual-${Date.now()}`,
      confidence: "medium" as const,
      reasoning: "Manually added",
    }]);
    setShowAddForm(false);
    setNewA({ name: "", course: "", type: "other", dueDate: "", estimatedHours: 2, syllabusIndex: 0 });
  }

  function addAllToCalendar() {
    includedBlocks.forEach((b, i) => {
      setTimeout(() => { window.open(toGCalUrl(b), "_blank"); }, i * 200);
    });
  }

  // ── Shared styles ─────────────────────────────────────────────────────────────

  const wrap: React.CSSProperties = {
    maxWidth:   1200,
    margin:     "0 auto",
    padding:    "40px 24px 80px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color:      C.text,
  };

  // Borderless card — whitespace + background for separation
  const card: React.CSSProperties = {
    background:   C.white,
    borderRadius: 12,
    padding:      24,
    marginBottom: 16,
  };

  const btn = (primary = true, small = false): React.CSSProperties => ({
    background:     primary ? C.blue : C.white,
    color:          primary ? C.white : C.textMid,
    border:         primary ? "none" : `1px solid ${C.border}`,
    borderRadius:   8,
    padding:        small ? "7px 14px" : "10px 20px",
    fontSize:       small ? 13 : 14,
    fontWeight:     600,
    cursor:         "pointer",
    display:        "inline-flex",
    alignItems:     "center",
    gap:            6,
    textDecoration: "none",
  });

  const STEPS      = ["setup", "review", "calendar"];
  const STEP_NAMES: Record<string, string> = { setup: "Setup", review: "Review Estimates", calendar: "My Plan" };
  const activeIdx  = STEPS.indexOf(step === "generating" ? "setup" : step);

  const includedBlocks = blocks.filter(b => b.included);
  const totalHours     = assignments.reduce((s, a) => s + a.estimatedHours, 0);
  const earliestDue    = assignments.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const isNarrow       = windowWidth < 768;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    // Break out of the platform's max-width: 720px container
    <div style={{
      width: "100vw", position: "relative", left: "50%",
      marginLeft: "-50vw", marginRight: "-50vw",
      background: "#f7f8fa", minHeight: "100vh",
    }}>
    <div style={wrap}>

      {/* ── Top nav bar ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 28, gap: 12, flexWrap: "wrap" as const,
      }}>
        {/* Left: Home + Back */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => { setStep("setup"); setAssignments([]); setBlocks([]); setError(null); }}
            style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.textMid, display: "flex", alignItems: "center", gap: 6 }}
          >
            ⌂ Home
          </button>
          {activeIdx > 0 && step !== "how-it-works" && (
            <button
              onClick={() => {
                if (activeIdx === 2) setStep("review");
                else if (activeIdx === 1) setStep("setup");
              }}
              style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.textMid, display: "flex", alignItems: "center", gap: 6 }}
            >
              ← Back
            </button>
          )}
        </div>

        {/* Center: title */}
        <div style={{ flex: 1, textAlign: "center" as const }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: "-0.5px" }}>Penn Planner</h1>
        </div>

        {/* Right: How It Works */}
        <div style={{ display: "flex", justifyContent: "flex-end", minWidth: 120 }}>
          <button
            onClick={() => setStep(step === "how-it-works" ? "setup" : "how-it-works")}
            style={{ background: "none", border: "none", color: C.gray, fontSize: 13, fontWeight: 500, cursor: "pointer", padding: "7px 0" }}
          >
            How It Works →
          </button>
        </div>
      </div>

      {/* Breadcrumb steps (no home/back — those are in top bar) */}
      {step !== "how-it-works" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => {
                  if (i === 0) setStep("setup");
                  else if (i === 1 && assignments.length > 0) setStep("review");
                  else if (i === 2 && blocks.length > 0) setStep("calendar");
                }}
                disabled={i > activeIdx}
                style={{
                  background:     i === activeIdx ? C.white : "none",
                  border:         i === activeIdx ? `1px solid ${C.border}` : "none",
                  borderRadius:   6,
                  padding:        "4px 10px",
                  fontSize:       13,
                  fontWeight:     i === activeIdx ? 700 : 400,
                  color:          i === activeIdx ? C.text : i < activeIdx ? C.blue : C.gray,
                  cursor:         i <= activeIdx ? "pointer" : "default",
                  textDecoration: i < activeIdx ? "underline" : "none",
                }}
              >
                {STEP_NAMES[s]}
              </button>
              {i < STEPS.length - 1 && (
                <span style={{ fontSize: 12, color: C.border }}>›</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* How It Works view */}
      {step === "how-it-works" && <HowItWorksView onBack={() => setStep("setup")} isNarrow={isNarrow} />}

      {/* Error banner */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: C.red, fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ══════════ STEP 1 — SETUP ══════════ */}
      {(step === "setup" || step === "generating") && (
        <>
          {/* Two-column grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}>
            {/* LEFT: Upload + Rigor */}
            <div>
              <div style={card}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Syllabus Upload</h2>
                <p style={{ color: C.gray, fontSize: 13, margin: "0 0 16px" }}>
                  Upload a PDF — or skip to use sample Wharton data
                </p>
                {syllabusFiles.length > 0 && (
                  <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    {syllabusFiles.map((sf, i) => {
                      const sc = syllabusColor(i);
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: sc.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sf.name}</span>
                          <button onClick={() => setSyllabusFiles(prev => prev.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.gray, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) setSyllabusFiles(prev => [...prev, { file: f, name: f.name }]);
                  }}
                  style={{
                    border: `2px dashed ${syllabusFiles.length > 0 ? C.blue : C.border}`,
                    borderRadius: 8, padding: "20px 24px", textAlign: "center",
                    cursor: "pointer", background: syllabusFiles.length > 0 ? C.blueSoft : C.grayLight,
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>📤</div>
                  <div style={{ fontWeight: 600 }}>
                    {syllabusFiles.length > 0 ? "Add another syllabus" : "Drop PDF here or click to upload"}
                  </div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>PDF only · each syllabus gets its own color</div>
                </div>
                <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setSyllabusFiles(prev => [...prev, { file: f, name: f.name }]); e.target.value = ""; }
                  }} />
              </div>

              <div style={card}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Academic Rigor</h2>
                <p style={{ color: C.gray, fontSize: 13, margin: "0 0 18px" }}>How much effort do you want to put in?</p>
                <input type="range" min={0} max={4} step={1} value={rigor}
                  onChange={e => setRigor(Number(e.target.value))}
                  style={{ width: "100%", accentColor: C.blue, marginBottom: 8 }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  {RIGOR_LABELS.map((l, i) => (
                    <span key={l} style={{ fontSize: 11, textAlign: "center", maxWidth: 70,
                      color: i === rigor ? C.blue : C.gray, fontWeight: i === rigor ? 700 : 400 }}>
                      {l}
                    </span>
                  ))}
                </div>
                <div style={{ padding: "8px 12px", background: C.grayLight, borderRadius: 6, fontSize: 13, color: C.textMid }}>
                  <strong>{RIGOR_LABELS[rigor]}</strong> — estimates at <strong>{Math.round(RIGOR_MULTIPLIERS[rigor]! * 100)}%</strong> of MBA average
                </div>
              </div>
            </div>

            {/* RIGHT: What to Include + API Key */}
            <div>
              <div style={card}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>What to Include</h2>
                <p style={{ color: C.gray, fontSize: 13, margin: "0 0 16px" }}>Which tasks should Penn Planner schedule for you?</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {([
                    { value: "core"     as IncludeMode, label: "Assignments & Exams", desc: "Graded deliverables only — cases, problem sets, quizzes, exams" },
                    { value: "readings" as IncludeMode, label: "Readings too",         desc: "Also includes required reading assignments" },
                    { value: "all"      as IncludeMode, label: "Everything",           desc: "All coursework including reflections and misc tasks" },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setIncludeMode(opt.value)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        padding: "12px 14px",
                        background: includeMode === opt.value ? C.blueSoft : C.grayLight,
                        border: `1.5px solid ${includeMode === opt.value ? C.blue : C.border}`,
                        borderRadius: 8, cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                        background: includeMode === opt.value ? C.blue : C.white,
                        border: `2px solid ${includeMode === opt.value ? C.blue : C.border}`,
                        marginTop: 2,
                      }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: includeMode === opt.value ? C.blue : C.text, marginBottom: 2 }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 12, color: C.gray }}>{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Google Calendar connect */}
          {GCAL_CLIENT_ID && (
            <div style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Google Calendar</span>
                  <span style={{ fontSize: 12, color: C.gray, marginLeft: 8 }}>
                    {gcalAuth.accessToken && isTokenValid(gcalAuth)
                      ? `Connected as ${gcalAuth.userEmail ?? "Google user"}`
                      : "Optional — avoids scheduling over your existing events"}
                  </span>
                </div>
                {gcalAuth.accessToken && isTokenValid(gcalAuth) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
                    <button onClick={() => { signOut(gcalAuth.accessToken); setGcalAuth({ accessToken: null, expiresAt: null, userEmail: null }); setGcalEvents([]); }}
                      style={{ fontSize: 12, color: C.gray, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        const auth = await initGCalAuth(GCAL_CLIENT_ID);
                        setGcalAuth(auth);
                      } catch (err) {
                        setError(`Calendar sign-in failed: ${String(err)}`);
                      }
                    }}
                    style={{ fontSize: 12, color: C.blue, background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>
                    Sign in with Google
                  </button>
                )}
              </div>
            </div>
          )}

          <button onClick={handleGenerate} disabled={step === "generating"}
            style={{ ...btn(), width: "100%", justifyContent: "center", padding: "14px 20px", fontSize: 16, fontWeight: 700, opacity: step === "generating" ? 0.7 : 1 }}>
            {step === "generating" ? "⏳ Generating plan..." : "Generate My Plan →"}
          </button>
        </>
      )}

      {/* ══════════ STEP 2 — REVIEW ══════════ */}
      {step === "review" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 2px", letterSpacing: "-0.3px" }}>Review Estimates</h2>
              <p style={{ color: C.gray, fontSize: 13, margin: 0 }}>
                {assignments.length} assignments · {totalHours.toFixed(1)}h total — adjust hours if needed
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setStep("setup")} style={btn(false)}>← Back</button>
              <button onClick={() => setShowAddForm(v => !v)} style={btn(false)}>+ Add</button>
              <button onClick={handleBuildCalendar} style={btn()}>Build My Plan →</button>
            </div>
          </div>

          {/* Add assignment form */}
          {showAddForm && (
            <div style={{ ...card, borderLeft: `3px solid ${C.blue}`, padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Add Assignment</div>
              <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <input placeholder="Assignment name *" value={newA.name}
                  onChange={e => setNewA(v => ({ ...v, name: e.target.value }))}
                  style={{ padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none" }} />
                <input placeholder="Course (e.g. MGMT 611)" value={newA.course}
                  onChange={e => setNewA(v => ({ ...v, course: e.target.value }))}
                  style={{ padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none" }} />
                <input type="date" value={newA.dueDate}
                  onChange={e => setNewA(v => ({ ...v, dueDate: e.target.value }))}
                  style={{ padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none" }} />
                <select value={newA.type}
                  onChange={e => setNewA(v => ({ ...v, type: e.target.value as AssignmentType }))}
                  style={{ padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", background: C.white }}>
                  {Object.entries(MBA_REFERENCE).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.gray }}>Hours:</span>
                  <input type="number" min={0.5} step={0.5} value={newA.estimatedHours}
                    onChange={e => setNewA(v => ({ ...v, estimatedHours: parseFloat(e.target.value) || 0.5 }))}
                    style={{ width: 60, padding: "6px 8px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none" }} />
                </div>
                {syllabusFiles.length > 1 && (
                  <select value={newA.syllabusIndex}
                    onChange={e => setNewA(v => ({ ...v, syllabusIndex: Number(e.target.value) }))}
                    style={{ padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", background: C.white }}>
                    {syllabusFiles.map((sf, i) => (
                      <option key={i} value={i}>{sf.name.replace(/\.pdf$/i, "")}</option>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addAssignment} style={btn(true, true)}>Add Assignment</button>
                <button onClick={() => setShowAddForm(false)} style={btn(false, true)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Compressed single-row assignment list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
            {assignments.map(a => {
              const sc = syllabusColor(a.syllabusIndex);
              return (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px",
                  background: C.white,
                  borderRadius: 8,
                  borderLeft: `3px solid ${sc.border}`,
                }}>
                  {/* Color dot */}
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />

                  {/* Name + course */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                    <span style={{ fontSize: 12, color: C.gray, marginLeft: 8 }}>{a.course}</span>
                  </div>

                  {/* Type */}
                  {!isNarrow && <TypeBadge type={a.type} />}

                  {/* Due date */}
                  <span style={{ fontSize: 12, color: C.gray, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {fmtDate(a.dueDate)}
                  </span>

                  {/* Hours — inline number input */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <input
                      type="number" min={0.5} step={0.5}
                      value={a.estimatedHours}
                      onChange={e => setHours(a.id, parseFloat(e.target.value) || 0.5)}
                      style={{
                        width: 46, textAlign: "center", padding: "3px 4px",
                        fontSize: 13, fontWeight: 700,
                        border: `1px solid ${C.border}`, borderRadius: 5,
                        outline: "none", background: C.grayLight,
                      }}
                    />
                    <span style={{ fontSize: 12, color: C.gray }}>h</span>
                  </div>

                  {/* Confidence */}
                  {!isNarrow && <ConfidenceDot level={a.confidence} />}

                  {/* Delete */}
                  <button onClick={() => deleteAssignment(a.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.gray, fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: C.white, borderRadius: 8 }}>
            <span style={{ fontSize: 14, color: C.gray }}>
              {assignments.length} assignments · <strong style={{ color: C.text }}>{totalHours.toFixed(1)}h</strong> total
            </span>
            <button onClick={handleBuildCalendar} style={btn()}>Build My Plan →</button>
          </div>
        </>
      )}

      {/* ══════════ STEP 3 — DASHBOARD ══════════ */}
      {step === "calendar" && (
        <>
          {/* Dashboard header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 30, fontWeight: 900, margin: "0 0 8px", letterSpacing: "-0.4px" }}>My Plan</h2>
              {/* Inline stats — single text line */}
              <p style={{ color: C.gray, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <strong style={{ color: C.text }}>{assignments.length}</strong> assignments ·{" "}
                <strong style={{ color: C.text }}>{totalHours.toFixed(1)}h</strong> estimated ·{" "}
                <strong style={{ color: C.text }}>{includedBlocks.length}</strong> blocks scheduled
                {earliestDue && (
                  <> · First due <strong style={{ color: C.text }}>{fmtDate(earliestDue.dueDate)}</strong></>
                )}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => setStep("review")} style={btn(false, true)}>← Edit</button>
              {/* Primary CTA: Add all */}
              <button onClick={addAllToCalendar} style={{ ...btn(true), whiteSpace: "nowrap" as const }}>
                Add all to Google Calendar ({includedBlocks.length})
              </button>
            </div>
          </div>

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1.6fr", gap: 20, alignItems: "start" }}>

            {/* Left — compressed assignment list */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>
                Assignments
              </div>
              {assignments.map(a => {
                const aBlocks   = blocks.filter(b => b.assignmentId === a.id && b.included);
                const isOverdue = new Date(a.dueDate + "T23:59:59") < new Date();
                const tc        = TYPE_COLORS[a.type];
                return (
                  <div key={a.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    background: tc.bg,
                    borderRadius: 8,
                    borderLeft: isOverdue ? `3px solid ${C.red}` : `3px solid ${tc.border}`,
                    marginBottom: 6,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: C.gray, marginTop: 1 }}>{a.course} · Due {fmtDate(a.dueDate)}</div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" as const }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{a.estimatedHours}h</div>
                      {aBlocks.length > 0 && (
                        <div style={{ fontSize: 10, color: C.gray }}>{aBlocks.length} block{aBlocks.length !== 1 ? "s" : ""}</div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* AI Insight */}
              <div style={{ marginTop: 16, padding: "14px 16px", background: C.grayLight, borderRadius: 8, borderLeft: `3px solid ${C.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>AI Insight</div>
                <p style={{ fontSize: 13, color: C.textMid, margin: 0, lineHeight: 1.6 }}>
                  Your <strong>{assignments.find(a => a.type === "exam")?.name ?? "highest-effort task"}</strong> has
                  the most prep time. Sessions spread across mornings and evenings to avoid last-minute cramming.
                  {includeMode !== "core" && ` Includes ${includeMode === "readings" ? "readings" : "all coursework"}.`}
                </p>
              </div>
            </div>

            {/* Right — Calendar */}
            <div style={{ background: C.white, borderRadius: 12, padding: 20 }}>
              <WeeklyCalendar
                blocks={blocks}
                syllabusNames={syllabusFiles.length > 0 ? syllabusFiles.map(sf => sf.name.replace(/\.pdf$/i, "")) : ["Sample Data"]}
                onToggle={toggleBlock}
              />

              {/* Add to calendar */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  Add to Google Calendar
                </div>

                {/* Push All button (when connected) */}
                {gcalAuth.accessToken && isTokenValid(gcalAuth) ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, color: C.gray, marginBottom: 2 }}>
                      Connected as {gcalAuth.userEmail ?? "Google user"}
                      {gcalEvents.length > 0 && ` · ${gcalEvents.length} existing events loaded`}
                    </div>

                    {gcalPushStatus ? (
                      <div style={{
                        padding: "10px 14px", borderRadius: 8, fontSize: 13,
                        background: gcalPushStatus.failed.length === 0 ? "#f0fdf4" : "#fffbeb",
                        border: `1px solid ${gcalPushStatus.failed.length === 0 ? "#bbf7d0" : "#fde68a"}`,
                        color: gcalPushStatus.failed.length === 0 ? "#166534" : "#92400e",
                      }}>
                        {gcalPushStatus.created} block{gcalPushStatus.created !== 1 ? "s" : ""} added to Google Calendar
                        {gcalPushStatus.failed.length > 0 && ` · ${gcalPushStatus.failed.length} failed`}
                      </div>
                    ) : (
                      <button
                        disabled={gcalLoading}
                        onClick={async () => {
                          setGcalLoading(true);
                          try {
                            const result = await pushBlocksToCalendar(
                              gcalAuth.accessToken!,
                              includedBlocks.map(b => ({
                                assignmentName: b.assignmentName, course: b.course,
                                date: b.date, startHour: b.startHour, hours: b.hours,
                              })),
                            );
                            setGcalPushStatus(result);
                          } catch (err) {
                            if (String(err).includes("token_expired")) {
                              setGcalAuth({ accessToken: null, expiresAt: null, userEmail: null });
                              setError("Google session expired. Please reconnect.");
                            } else {
                              setError(`Failed to push to calendar: ${String(err)}`);
                            }
                          }
                          setGcalLoading(false);
                        }}
                        style={{ ...btn(), width: "100%", justifyContent: "center", opacity: gcalLoading ? 0.7 : 1 }}>
                        {gcalLoading ? "Pushing..." : `Push ${includedBlocks.length} Blocks to Calendar`}
                      </button>
                    )}

                    <button onClick={() => setShowManualLinks(v => !v)}
                      style={{ fontSize: 11, color: C.gray, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                      {showManualLinks ? "Hide individual links" : "Or export individually..."}
                    </button>
                    {showManualLinks && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {includedBlocks.map(b => (
                          <a key={b.id} href={toGCalUrl(b)} target="_blank" rel="noopener noreferrer"
                            style={{ ...btn(false, true), justifyContent: "space-between", textDecoration: "none" }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                              {b.assignmentName}
                            </span>
                            <span style={{ color: C.gray, fontWeight: 400, flexShrink: 0 }}>
                              {fmtDate(b.date)}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Not connected — show individual links (original behavior) */
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {includedBlocks.map(b => (
                      <a key={b.id} href={toGCalUrl(b)} target="_blank" rel="noopener noreferrer"
                        style={{ ...btn(false, true), justifyContent: "space-between", textDecoration: "none" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                          {b.assignmentName}
                        </span>
                        <span style={{ color: C.gray, fontWeight: 400, flexShrink: 0 }}>
                          {fmtDate(b.date)}
                        </span>
                      </a>
                    ))}
                    {GCAL_CLIENT_ID && (
                      <button
                        onClick={async () => {
                          try {
                            const auth = await initGCalAuth(GCAL_CLIENT_ID);
                            setGcalAuth(auth);
                          } catch { /* user cancelled */ }
                        }}
                        style={{ fontSize: 11, color: C.blue, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "4px 0 0", textDecoration: "underline" }}>
                        Connect Google Calendar for one-click export
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
    </div>
  );
}

// ── How It Works View ───────────────────────────────────────────────────────────

function HowItWorksView({ onBack, isNarrow }: { onBack: () => void; isNarrow: boolean }) {
  const PENN_BLUE = "#011F5B";

  const steps = [
    {
      num: "01", title: "Syllabus Upload", icon: "📤",
      desc: "Upload your course syllabus PDF. Penn Planner extracts all graded deliverables — assignments, exams, projects, and quizzes — automatically.",
      color: C.blueSoft, border: "#bfdbfe", text: "#1e40af",
    },
    {
      num: "02", title: "AI Effort Estimation", icon: "✦",
      desc: "Our LLM analyzes each assignment by type (problem set vs. reading), course difficulty, and your rigor level to estimate realistic hours.",
      color: "#fdf4ff", border: "#e9d5ff", text: "#7e22ce",
    },
    {
      num: "03", title: "Smart Scheduling", icon: "📅",
      desc: "Penn Planner finds open blocks in your calendar and inserts study sessions ahead of each deadline — starting with the most urgent work first.",
      color: "#f0fdf4", border: "#bbf7d0", text: "#166534",
    },
    {
      num: "04", title: "Learns Over Time", icon: "📈",
      desc: "Log your actual time spent after each assignment. Penn Planner adjusts future estimates based on how accurate its predictions were.",
      color: "#fffbeb", border: "#fde68a", text: "#92400e",
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: PENN_BLUE, textTransform: "uppercase" as const, marginBottom: 8 }}>
          Penn Planner · AI-PMT Team 2
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 10px", color: C.text }}>
          Effort-based planning for Penn students
        </h2>
        <p style={{ fontSize: 14, color: C.gray, margin: 0, maxWidth: 520, lineHeight: 1.7 }}>
          Most students plan around deadlines. Penn Planner shifts you to planning around <em>effort</em> — so you stop cramming and start finishing work before the night it&apos;s due.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 32 }}>
        {steps.map((s) => (
          <div key={s.num} style={{ background: s.color, border: `1px solid ${s.border}`, borderRadius: 12, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: s.text, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
                Step {s.num}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{s.title}</div>
            <p style={{ fontSize: 13, color: C.textMid, margin: 0, lineHeight: 1.65 }}>{s.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.gray, marginBottom: 14 }}>
          Team 2 — Time Management Org
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
          {[
            { name: "Sam Lazarus",    role: "PM · Engineer", track: "Track 2 + 3" },
            { name: "Krishna Vadera", role: "PM · Engineer", track: "Track 2 + 3" },
          ].map((m) => (
            <div key={m.name} style={{ background: C.grayLight, borderRadius: 8, padding: "10px 14px", minWidth: 148 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: C.gray }}>{m.role}</div>
              <div style={{ fontSize: 11, color: C.gray, marginTop: 1 }}>{m.track}</div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onBack} style={{
        background: PENN_BLUE, color: "#fff", border: "none",
        borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
      }}>
        ← Start Planning
      </button>
    </div>
  );
}
