"use client";

import { useState, useRef, useEffect } from "react";

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

// ── Per-syllabus color palette ─────────────────────────────────────────────────

const SYLLABUS_COLORS: { bg: string; border: string; text: string; dot: string }[] = [
  { bg: "#eff6ff", border: "#2563eb", text: "#1e40af", dot: "#2563eb" }, // blue
  { bg: "#fef2f2", border: "#dc2626", text: "#991b1b", dot: "#dc2626" }, // red
  { bg: "#f0fdf4", border: "#16a34a", text: "#166534", dot: "#16a34a" }, // green
  { bg: "#fefce8", border: "#ca8a04", text: "#854d0e", dot: "#ca8a04" }, // amber
  { bg: "#faf5ff", border: "#9333ea", text: "#6b21a8", dot: "#9333ea" }, // purple
  { bg: "#fff7ed", border: "#ea580c", text: "#9a3412", dot: "#ea580c" }, // orange
];

function syllabusColor(idx: number) {
  return SYLLABUS_COLORS[idx % SYLLABUS_COLORS.length]!;
}

// ── Palette (minimal — one blue accent, otherwise grays) ──────────────────────

const C = {
  blue:      "#2563eb",
  blueSoft:  "#eff6ff",
  red:       "#dc2626",
  redSoft:   "#fef2f2",
  gray:      "#6b7280",
  grayLight: "#f9fafb",
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

/** Extract readable text from a PDF via the server-side API route (avoids browser worker issues). */
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

function generateCalendarBlocks(assignments: Assignment[]): CalendarBlock[] {
  const blocks: CalendarBlock[] = [];
  const today = new Date();

  for (const a of assignments) {
    const due       = new Date(a.dueDate + "T12:00:00");
    const daysUntil = Math.max(1, Math.ceil((due.getTime() - today.getTime()) / 86_400_000));
    const sessions  = Math.max(1, Math.ceil(a.estimatedHours / 2));
    const hrs       = Math.round((a.estimatedHours / sessions) * 10) / 10;

    for (let s = 0; s < sessions; s++) {
      const daysBack    = Math.floor((daysUntil * (sessions - s)) / (sessions + 1));
      const d           = new Date(due);
      d.setDate(due.getDate() - daysBack);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() - 1);

      blocks.push({
        id:             `${a.id}-b${s}`,
        assignmentId:   a.id,
        assignmentName: a.name,
        course:         a.course,
        date:           d.toISOString().split("T")[0]!,
        startHour:      s % 2 === 0 ? 9 : 19,
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

// ── Weekly calendar grid ───────────────────────────────────────────────────────

function WeeklyCalendar({
  blocks, syllabusNames, onToggle,
}: {
  blocks: CalendarBlock[];
  syllabusNames: string[];
  onToggle: (id: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today    = new Date();
  const todayStr = today.toISOString().split("T")[0]!;
  const DAY_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  // Base: Sunday of the week containing the first block (or today)
  const firstBlock = blocks.find(b => b.included);
  const anchor     = firstBlock ? new Date(firstBlock.date + "T12:00:00") : today;
  const baseSun    = new Date(anchor);
  baseSun.setDate(anchor.getDate() - anchor.getDay());

  // Apply week offset
  const sun = new Date(baseSun);
  sun.setDate(baseSun.getDate() + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun); d.setDate(sun.getDate() + i); return d;
  });

  const weekLabel = `${days[0]!.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6]!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div>
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

      {/* Legend — one entry per syllabus */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        {syllabusNames.map((name, i) => {
          const sc = syllabusColor(i);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.gray }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: sc.bg, border: `1.5px solid ${sc.border}` }} />
              {name}
            </div>
          );
        })}
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
                  const sc = syllabusColor(b.syllabusIndex);
                  return (
                    <div key={b.id} onClick={() => onToggle(b.id)}
                      title={`${b.assignmentName} — click to toggle`}
                      style={{
                        borderRadius: 5, padding: "5px 6px", cursor: "pointer",
                        background:  b.included ? sc.bg   : C.grayLight,
                        borderLeft:  `3px solid ${b.included ? sc.border : C.border}`,
                        opacity:     b.included ? 1 : 0.45,
                        transition:  "all 0.1s",
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: b.included ? sc.text : C.gray }}>
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

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = false }: {
  label: string; value: string; sub: string; accent?: boolean;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 120,
      border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "14px 16px", background: C.white,
    }}>
      <div style={{ fontSize: 11, color: C.gray, fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? C.blue : C.text, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ── Confidence dot ─────────────────────────────────────────────────────────────

function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const color = level === "high" ? C.green : level === "medium" ? C.amber : C.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.gray }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
      {level.charAt(0).toUpperCase() + level.slice(1)} confidence
    </span>
  );
}

// ── Type badge (outline only, no fill) ────────────────────────────────────────

function TypeBadge({ type }: { type: AssignmentType }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: C.gray,
      border: `1px solid ${C.border}`, borderRadius: 99,
      padding: "1px 8px",
    }}>
      {MBA_REFERENCE[type].label}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PennPlannerPage() {
  const [step,          setStep]          = useState<Step>("setup");
  const [rigor,         setRigor]         = useState(2);
  const [pacePrefs,     setPacePrefs]     = useState<string[]>([]);
  const [syllabusFiles, setSyllabusFiles] = useState<SyllabusFile[]>([]);
  const [assignments,   setAssignments]   = useState<Assignment[]>([]);
  const [blocks,        setBlocks]        = useState<CalendarBlock[]>([]);
  const [error,         setError]         = useState<string | null>(null);
  const [apiKeyInput,   setApiKeyInput]   = useState("");
  const [showApiKey,    setShowApiKey]    = useState(false);
  const [storedApiKey,  setStoredApiKey]  = useState("");
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [newA,          setNewA]          = useState<{
    name: string; course: string; type: AssignmentType;
    dueDate: string; estimatedHours: number; syllabusIndex: number;
  }>({ name: "", course: "", type: "other", dueDate: "", estimatedHours: 2, syllabusIndex: 0 });
  const [windowWidth,   setWindowWidth]   = useState(1200);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    setStoredApiKey(localStorage.getItem("penntools_api_key") ?? "");
  }, []);

  // Responsive layout
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const llmHeaders = (key: string) => ({
    "Content-Type": "application/json",
    ...(key ? { "X-Api-Key": key } : {}),
  });

  const llmModel = (key: string) =>
    key.startsWith("sk-ant-") ? "claude-haiku-4-5-20251001" : "gpt-4o-mini";

  // ── Generate plan: real LLM if PDFs uploaded, mock otherwise ────────────────

  async function handleGenerate() {
    setError(null);
    setStep("generating");

    const today = new Date().toISOString().split("T")[0]!;

    // No PDFs → use mock directly
    if (syllabusFiles.length === 0) {
      await new Promise(r => setTimeout(r, 600));
      setAssignments(getMockAssignments(rigor, 0));
      setStep("review");
      return;
    }

    try {
      const currentKey = typeof window !== "undefined" ? (localStorage.getItem("penntools_api_key") ?? "") : "";
      const multiplier = RIGOR_MULTIPLIERS[rigor];
      const paceDesc   = pacePrefs.length ? pacePrefs.join("; ") : "no specific pace preferences";
      const refLines   = Object.entries(MBA_REFERENCE)
        .map(([k, v]) => `  ${k}: ${v.baseHours}h baseline`).join("\n");

      const allAssignments: Assignment[] = [];

      for (let syllabusIndex = 0; syllabusIndex < syllabusFiles.length; syllabusIndex++) {
        const { file } = syllabusFiles[syllabusIndex]!;
        const text = await extractTextFromPDF(file);

        // ── Step 1: Parse deliverables ───────────────────────────────────────
        const parsePrompt = `You are a syllabus parser for a Penn MBA/graduate student.

Your ONLY job: extract graded deliverables the student must submit.
These include: assignments, quizzes, exams, projects, case writeups, problem sets, papers, reflections, homeworks.

Critical rules:
- ONLY extract items that are explicit graded submissions
- Look in columns/sections labelled "Deliverables", "Assignments", "Due", "Homework", "Submit"
- DO NOT include readings (textbook chapters, articles, or cases listed only for reading)
- DO NOT include lecture topics, class sessions, guest speakers, or "No class" rows
- If a due date is embedded in the deliverable name (e.g. "Project 2 - 3/8 by 11:59pm"), use THAT date, not the class session date
- If the syllabus is a table with a "Deliverables" column, only rows where that column is non-empty count
- Syllabi vary in format (tables, bullets, paragraphs) — adapt accordingly
- ONLY include assignments with due dates on or after today (${today})

Syllabus text:
${text}

Today is ${today}.
Return ONLY a valid JSON array — no markdown, no explanation:
[{"id":"s${syllabusIndex}_a1","name":"exact deliverable name","course":"course name or number","type":"case|essay|problem-set|reading|presentation|exam|reflection|group-project|quiz|other","dueDate":"YYYY-MM-DD"}]`;

        const parseRes = await fetch("/api/llm/complete", {
          method: "POST", headers: llmHeaders(currentKey),
          body: JSON.stringify({ prompt: parsePrompt, model: llmModel(currentKey) }),
        });

        if (!parseRes.ok) throw new Error("llm_unavailable");
        const parseData = await parseRes.json() as { content: string };
        const parseMatch = parseData.content.match(/\[[\s\S]*\]/);
        const parsed: Omit<Assignment, "estimatedHours" | "confidence" | "reasoning" | "syllabusIndex">[] =
          JSON.parse(parseMatch ? parseMatch[0] : parseData.content);
        if (!Array.isArray(parsed) || parsed.length === 0) continue;

        // ── Step 2: Estimate effort ──────────────────────────────────────────
        const estimatePrompt = `You are an effort estimation engine for Penn MBA students.

Student profile:
- Rigor mode: ${RIGOR_LABELS[rigor]} (${Math.round(multiplier! * 100)}% of baseline)
- Pace preferences: ${paceDesc}

MBA average hours by type (at 1.0× rigor):
${refLines}

Apply the rigor multiplier and pace adjustments. Return a JSON array:
[{"id":"same as input","estimatedHours":number,"confidence":"high|medium|low","reasoning":"one sentence"}]

Assignments:
${JSON.stringify(parsed, null, 2)}

Return ONLY valid JSON array. No markdown.`;

        const estRes = await fetch("/api/llm/complete", {
          method: "POST", headers: llmHeaders(currentKey),
          body: JSON.stringify({ prompt: estimatePrompt, model: llmModel(currentKey) }),
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
      if (msg.includes("llm_unavailable") || msg.includes("empty_parse") || msg.includes("JSON")) {
        setError("LLM API unavailable — showing sample data. Connect to PennTools platform for real parsing.");
        setAssignments(getMockAssignments(rigor, 0));
        setStep("review");
      } else {
        setError(`Error: ${msg}`);
        setStep("setup");
      }
    }
  }

  function handleBuildCalendar() {
    setBlocks(generateCalendarBlocks(assignments));
    setStep("calendar");
  }

  function updateHours(id: string, delta: number) {
    setAssignments(prev =>
      prev.map(a =>
        a.id === id
          ? { ...a, estimatedHours: Math.max(0.5, Math.round((a.estimatedHours + delta) * 10) / 10) }
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

  // ── Shared styles ─────────────────────────────────────────────────────────────

  const wrap: React.CSSProperties = {
    maxWidth:   1080,
    margin:     "0 auto",
    padding:    "40px 24px 80px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color:      C.text,
  };

  const card: React.CSSProperties = {
    background: C.white, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: 24, marginBottom: 16,
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
  const STEP_NAMES: Record<string, string> = { setup: "Setup", review: "Review", calendar: "My Plan" };
  const activeIdx  = STEPS.indexOf(step === "generating" ? "setup" : step);

  const includedBlocks = blocks.filter(b => b.included);
  const totalHours     = assignments.reduce((s, a) => s + a.estimatedHours, 0);
  const earliestDue    = assignments.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const isNarrow       = windowWidth < 768;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={wrap}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px" }}>Penn Planner</h1>
          <p style={{ color: C.gray, margin: 0, fontSize: 15 }}>
            Upload your syllabus → AI effort estimates → block your study time
          </p>
        </div>
        <button
          onClick={() => setStep(step === "how-it-works" ? "setup" : "how-it-works")}
          style={{
            background: step === "how-it-works" ? C.blue : C.white,
            color: step === "how-it-works" ? C.white : C.textMid,
            border: `1px solid ${step === "how-it-works" ? C.blue : C.border}`,
            borderRadius: 8, padding: "8px 16px",
            fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}
        >
          How It Works
        </button>
      </div>

      {/* How It Works view */}
      {step === "how-it-works" && <HowItWorksView onBack={() => setStep("setup")} isNarrow={isNarrow} />}

      {/* Progress */}
      {step !== "how-it-works" && <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              background: i <= activeIdx ? C.blue : C.grayLight,
              color:      i <= activeIdx ? C.white : C.gray,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700,
            }}>{i + 1}</div>
            <span style={{
              marginLeft: 6, fontSize: 13, whiteSpace: "nowrap",
              color:      i === activeIdx ? C.text : C.gray,
              fontWeight: i === activeIdx ? 600 : 400,
            }}>
              {STEP_NAMES[s]}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ width: 28, height: 1, background: C.border, margin: "0 10px" }} />
            )}
          </div>
        ))}
      </div>}

      {/* Error */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: C.red, fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ══════════ STEP 1 — SETUP ══════════ */}
      {(step === "setup" || step === "generating") && (
        <>
          {/* Upload */}
          <div style={card}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Upload Syllabus</h2>
            <p style={{ color: C.gray, fontSize: 13, margin: "0 0 16px" }}>
              Upload your course syllabus PDF — or skip to use sample Wharton MBA data
            </p>
            {/* Uploaded syllabi list */}
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
              <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>PDF files only · each syllabus gets its own color</div>
            </div>
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setSyllabusFiles(prev => [...prev, { file: f, name: f.name }]); e.target.value = ""; }
              }} />
          </div>

          {/* Rigor */}
          <div style={card}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Academic Rigor</h2>
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
            <div style={{ padding: "8px 12px", background: C.blueSoft, borderRadius: 6, fontSize: 13, color: C.blue, fontWeight: 500 }}>
              <strong>{RIGOR_LABELS[rigor]}</strong> — estimates at <strong>{Math.round(RIGOR_MULTIPLIERS[rigor]! * 100)}%</strong> of MBA average
            </div>
          </div>

          {/* Pace */}
          <div style={card}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Your Pace</h2>
            <p style={{ color: C.gray, fontSize: 13, margin: "0 0 14px" }}>Select any that apply</p>
            {[
              "I read slower than average",
              "I read faster than average",
              "I'm fast with quantitative work",
              "I struggle with quantitative work",
              "I work best in short focused bursts",
              "I need extra time for written work",
            ].map(pref => (
              <label key={pref} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={pacePrefs.includes(pref)}
                  onChange={e => setPacePrefs(prev => e.target.checked ? [...prev, pref] : prev.filter(p => p !== pref))}
                  style={{ accentColor: C.blue, width: 16, height: 16, cursor: "pointer" }} />
                <span style={{ fontSize: 14 }}>{pref}</span>
              </label>
            ))}
          </div>

          {/* API key input */}
          <div style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showApiKey ? 10 : 0 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>LLM API Key</span>
                <span style={{ fontSize: 12, color: C.gray, marginLeft: 8 }}>
                  {storedApiKey ? "✓ Key saved" : "Required for real AI parsing"}
                </span>
              </div>
              <button onClick={() => setShowApiKey(v => !v)}
                style={{ fontSize: 12, color: C.blue, background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>
                {showApiKey ? "Hide" : storedApiKey ? "Change" : "Add key"}
              </button>
            </div>
            {showApiKey && (
              <div style={{ display: "flex", gap: 8 }}>
                <input type="password" placeholder="sk-... or sk-ant-..." value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  style={{ flex: 1, padding: "7px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none" }} />
                <button onClick={() => { if (apiKeyInput) { localStorage.setItem("penntools_api_key", apiKeyInput); setStoredApiKey(apiKeyInput); setApiKeyInput(""); setShowApiKey(false); } }}
                  style={{ ...btn(true, true) }}>
                  Save
                </button>
              </div>
            )}
          </div>

          <button onClick={handleGenerate} disabled={step === "generating"}
            style={{ ...btn(), width: "100%", justifyContent: "center", padding: "14px 20px", fontSize: 15, opacity: step === "generating" ? 0.7 : 1 }}>
            {step === "generating" ? "⏳ Generating plan..." : "Generate My Plan →"}
          </button>
        </>
      )}

      {/* ══════════ STEP 2 — REVIEW ══════════ */}
      {step === "review" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 2px" }}>Your Assignments</h2>
              <p style={{ color: C.gray, fontSize: 13, margin: 0 }}>
                {assignments.length} found · adjust hours if needed
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
                  <span style={{ fontSize: 13, color: C.gray, whiteSpace: "nowrap" }}>Hours:</span>
                  <button onClick={() => setNewA(v => ({ ...v, estimatedHours: Math.max(0.5, Math.round((v.estimatedHours - 0.5) * 10) / 10) }))}
                    style={{ width: 26, height: 26, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <span style={{ fontWeight: 700, fontSize: 16, minWidth: 32, textAlign: "center" }}>{newA.estimatedHours}</span>
                  <button onClick={() => setNewA(v => ({ ...v, estimatedHours: Math.round((v.estimatedHours + 0.5) * 10) / 10 }))}
                    style={{ width: 26, height: 26, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
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

          {assignments.map(a => {
            const sc = syllabusColor(a.syllabusIndex);
            return (
            <div key={a.id} style={{ ...card, padding: "16px 20px", borderLeft: `3px solid ${sc.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <TypeBadge type={a.type} />
                    <span style={{ fontSize: 12, color: C.gray }}>{a.course}</span>
                    {syllabusFiles.length > 1 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: sc.text, background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 99, padding: "1px 7px" }}>
                        {(syllabusFiles[a.syllabusIndex]?.name ?? "").replace(/\.pdf$/i, "")}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{a.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: C.gray }}>Due {fmtDate(a.dueDate)}</span>
                    <ConfidenceDot level={a.confidence} />
                  </div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 4, fontStyle: "italic" }}>{a.reasoning}</div>
                </div>
                {/* Stepper + delete */}
                <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <button onClick={() => deleteAssignment(a.id)}
                    title="Remove assignment"
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.gray, fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
                  <div>
                    <div style={{ fontSize: 12, color: C.gray, marginBottom: 4 }}>Est. hours</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => updateHours(a.id, -0.5)} style={{ width: 26, height: 26, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                      <span style={{ fontWeight: 700, fontSize: 20, minWidth: 36, textAlign: "center" }}>{a.estimatedHours}</span>
                      <button onClick={() => updateHours(a.id, 0.5)} style={{ width: 26, height: 26, borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            );
          })}

          <div style={{ ...card, background: C.grayLight, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontWeight: 600 }}>Total: </span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.blue }}>{totalHours.toFixed(1)}h</span>
              <span style={{ color: C.gray, fontSize: 13, marginLeft: 8 }}>across {assignments.length} assignments</span>
            </div>
            <button onClick={handleBuildCalendar} style={btn()}>Build My Plan →</button>
          </div>
        </>
      )}

      {/* ══════════ STEP 3 — DASHBOARD ══════════ */}
      {step === "calendar" && (
        <>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                My Planner
              </div>
              <p style={{ color: C.textMid, margin: 0, fontSize: 14 }}>
                AI estimated <strong>{totalHours.toFixed(1)}h total</strong> across {assignments.length} assignments — study blocks scheduled.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep("review")} style={btn(false, true)}>← Edit</button>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.blueSoft, border: `1px solid #bfdbfe`, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, color: C.blue }}>
                ✓ {includedBlocks.length} blocks scheduled
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <StatCard label="Assignments" value={String(assignments.length)} sub="this week" />
            <StatCard label="Total Hours" value={`${totalHours.toFixed(1)}h`} sub="estimated" accent />
            <StatCard label="Blocks Scheduled" value={String(includedBlocks.length)} sub="on calendar" />
            <StatCard
              label="Earliest Due"
              value={earliestDue ? new Date(earliestDue.dueDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }) : "—"}
              sub={earliestDue?.name.slice(0, 22) ?? ""}
            />
          </div>

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1.5fr", gap: 16, alignItems: "start" }}>

            {/* Left — Assignment list */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                Assignments
              </div>
              {assignments.map(a => {
                const aBlocks   = blocks.filter(b => b.assignmentId === a.id && b.included);
                const isOverdue = new Date(a.dueDate + "T23:59:59") < new Date();
                const sc        = syllabusColor(a.syllabusIndex);
                return (
                  <div key={a.id} style={{
                    background: C.white, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "14px 16px", marginBottom: 10,
                    borderLeft: isOverdue ? `3px solid ${C.red}` : `3px solid ${sc.border}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>
                          {a.course} · Due {fmtDate(a.dueDate)}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>{a.estimatedHours}h</span>
                          <span style={{ fontSize: 12, color: C.gray }}>estimated</span>
                          <ConfidenceDot level={a.confidence} />
                        </div>
                      </div>
                      <TypeBadge type={a.type} />
                    </div>
                    {aBlocks.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.gray }}>
                        {aBlocks.length} block{aBlocks.length !== 1 ? "s" : ""} scheduled ·{" "}
                        {aBlocks.reduce((s, b) => s + b.hours, 0).toFixed(1)}h
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right — Weekly calendar + actions */}
            <div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <WeeklyCalendar
                  blocks={blocks}
                  syllabusNames={syllabusFiles.length > 0 ? syllabusFiles.map(sf => sf.name.replace(/\.pdf$/i, "")) : ["Sample Data"]}
                  onToggle={toggleBlock}
                />
                <p style={{ fontSize: 11, color: C.gray, margin: "12px 0 0", textAlign: "center" }}>
                  Click a block to toggle it on/off
                </p>
              </div>

              {/* AI Insight */}
              <div style={{
                background: C.white, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: 16, marginBottom: 16,
                borderLeft: `3px solid ${C.blue}`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>✦ AI Insight</div>
                <p style={{ fontSize: 13, color: C.textMid, margin: 0, lineHeight: 1.6 }}>
                  Your <strong>{assignments.find(a => a.type === "exam")?.name ?? "exam"}</strong> has the highest prep time.
                  Sessions are spread across mornings and evenings to avoid last-minute cramming.
                  {pacePrefs.length > 0 && ` Adjusted for: ${pacePrefs[0]!.toLowerCase()}.`}
                </p>
              </div>

              {/* Add to calendar */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  Add to Google Calendar
                </div>
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
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── How It Works View ───────────────────────────────────────────────────────────

function HowItWorksView({ onBack, isNarrow }: { onBack: () => void; isNarrow: boolean }) {
  const PENN_BLUE = "#011F5B";

  const steps = [
    {
      num: "01", title: "Canvas Sync", icon: "📚",
      desc: "Penn Planner reads your Canvas courses and pulls all upcoming assignments — titles, types, deadlines, and course context — automatically.",
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
          Most students plan around deadlines. Penn Planner shifts you to planning around <em>effort</em> — so you stop cramming and start finishing work before the night it's due.
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
            { name: "Anthony Dodd",   role: "PM",            track: "Track 1" },
            { name: "Arkan Kausar",   role: "Engineer",      track: "Track 1" },
          ].map((m) => (
            <div key={m.name} style={{ background: C.grayLight, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", minWidth: 148 }}>
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
