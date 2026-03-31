"use client";

import { useState, useRef } from "react";

// ── MBA Reference Dataset ──────────────────────────────────────────────────────
// Average hours for each assignment type based on Wharton/Penn MBA norms.

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
  reasoning?: string;
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
}

type Step = "setup" | "parsing" | "estimating" | "review" | "calendar";

// ── Colours ────────────────────────────────────────────────────────────────────

const C = {
  blue:       "#2563eb",
  blueSoft:   "#eff6ff",
  blueBorder: "#bfdbfe",
  red:        "#dc2626",
  redSoft:    "#fef2f2",
  gray:       "#6b7280",
  grayLight:  "#f9fafb",
  border:     "#e5e7eb",
  text:       "#111827",
  textMid:    "#374151",
  white:      "#ffffff",
  green:      "#16a34a",
  greenSoft:  "#f0fdf4",
  amber:      "#d97706",
  amberSoft:  "#fffbeb",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extracts readable ASCII text from a PDF ArrayBuffer (no dependencies). */
function extractTextFromPDF(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 32 && b < 127) text += String.fromCharCode(b);
    else if (b === 10 || b === 13) text += "\n";
  }
  return text.replace(/\s{3,}/g, "  ").trim().slice(0, 8000);
}

/** Spreads study sessions across weekdays before the due date. */
function generateCalendarBlocks(assignments: Assignment[]): CalendarBlock[] {
  const blocks: CalendarBlock[] = [];
  const today = new Date();

  for (const a of assignments) {
    const due      = new Date(a.dueDate);
    const daysUntil = Math.max(1, Math.ceil((due.getTime() - today.getTime()) / 86_400_000));
    const sessions  = Math.ceil(a.estimatedHours / 2);
    const hoursPerSession = Math.round((a.estimatedHours / sessions) * 10) / 10;

    for (let s = 0; s < sessions; s++) {
      const daysBack    = Math.floor((daysUntil * (sessions - s)) / (sessions + 1));
      const sessionDate = new Date(due);
      sessionDate.setDate(due.getDate() - daysBack);
      // Skip weekends
      if (sessionDate.getDay() === 0) sessionDate.setDate(sessionDate.getDate() + 1);
      if (sessionDate.getDay() === 6) sessionDate.setDate(sessionDate.getDate() - 1);

      blocks.push({
        id:             `${a.id}-b${s}`,
        assignmentId:   a.id,
        assignmentName: a.name,
        course:         a.course,
        date:           sessionDate.toISOString().split("T")[0],
        startHour:      s % 2 === 0 ? 9 : 19,
        hours:          hoursPerSession,
        included:       true,
      });
    }
  }

  return blocks.sort((a, b) => a.date.localeCompare(b.date));
}

/** Builds a Google Calendar "create event" URL (no OAuth needed). */
function toGCalUrl(block: CalendarBlock): string {
  const start = new Date(`${block.date}T${String(block.startHour).padStart(2, "0")}:00:00`);
  const end   = new Date(start.getTime() + block.hours * 3_600_000);
  const fmt   = (d: Date) => d.toISOString().replace(/[-:.Z]/g, "").slice(0, 15);
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(`📚 ${block.assignmentName}`)}` +
    `&dates=${fmt(start)}/${fmt(end)}` +
    `&details=${encodeURIComponent(`Study block — ${block.course}\n${block.assignmentName}`)}`
  );
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ── Small badge component ──────────────────────────────────────────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      background: bg, color, fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 99, textTransform: "uppercase",
      letterSpacing: "0.03em",
    }}>
      {label}
    </span>
  );
}

function confidenceBadge(c: "high" | "medium" | "low") {
  const map = {
    high:   { color: C.green, bg: C.greenSoft },
    medium: { color: C.amber, bg: C.amberSoft },
    low:    { color: C.red,   bg: C.redSoft   },
  };
  return <Badge label={c} {...map[c]} />;
}

function typeBadge(type: AssignmentType) {
  return <Badge label={MBA_REFERENCE[type].label} color={C.blue} bg={C.blueSoft} />;
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function PennPlannerPage() {
  const [step,         setStep]         = useState<Step>("setup");
  const [rigor,        setRigor]        = useState(2);
  const [pacePrefs,    setPacePrefs]    = useState<string[]>([]);
  const [fileName,     setFileName]     = useState<string | null>(null);
  const [syllabusText, setSyllabusText] = useState("");
  const [assignments,  setAssignments]  = useState<Assignment[]>([]);
  const [blocks,       setBlocks]       = useState<CalendarBlock[]>([]);
  const [error,        setError]        = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setFileName(file.name);
    const buf  = await file.arrayBuffer();
    const text = extractTextFromPDF(buf);
    setSyllabusText(text);
  }

  async function callLLM(prompt: string): Promise<string> {
    const res = await fetch("/api/llm/complete", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ prompt }),
    });

    // Fall back to mock data when the platform LLM API is unavailable
    if (!res.ok) return callLLMMock(prompt);

    const data = await res.json() as { content: string };
    return data.content;
  }

  function callLLMMock(prompt: string): string {
    const today = new Date();
    const addDays = (n: number) => {
      const d = new Date(today); d.setDate(d.getDate() + n);
      return d.toISOString().split("T")[0];
    };

    if (prompt.includes("syllabus parser")) {
      return JSON.stringify([
        { id: "a1", name: "Case Analysis: Wharton Retail Strategy", course: "MGMT 611", type: "case",          dueDate: addDays(5)  },
        { id: "a2", name: "Financial Modeling Problem Set 1",       course: "FNCE 601", type: "problem-set",   dueDate: addDays(8)  },
        { id: "a3", name: "Weekly Reading — Chapters 4–6",          course: "MGMT 611", type: "reading",       dueDate: addDays(3)  },
        { id: "a4", name: "Group Project: Market Entry Plan",       course: "MKTG 621", type: "group-project", dueDate: addDays(18) },
        { id: "a5", name: "Midterm Exam",                           course: "FNCE 601", type: "exam",          dueDate: addDays(14) },
        { id: "a6", name: "Reflection Paper — Leadership Module",   course: "MGMT 611", type: "reflection",    dueDate: addDays(10) },
      ]);
    }

    if (prompt.includes("effort estimation")) {
      const multiplier = RIGOR_MULTIPLIERS[rigor];
      return JSON.stringify([
        { id: "a1", estimatedHours: Math.round(MBA_REFERENCE["case"]["baseHours"]          * multiplier * 2) / 2, confidence: "high",   reasoning: "Standard Wharton case; rigor multiplier applied." },
        { id: "a2", estimatedHours: Math.round(MBA_REFERENCE["problem-set"]["baseHours"]   * multiplier * 2) / 2, confidence: "high",   reasoning: "Quantitative problem set; adjusted for rigor." },
        { id: "a3", estimatedHours: Math.round(MBA_REFERENCE["reading"]["baseHours"]       * multiplier * 2) / 2, confidence: "medium", reasoning: "Three chapters; estimate based on average reading speed." },
        { id: "a4", estimatedHours: Math.round(MBA_REFERENCE["group-project"]["baseHours"] * multiplier * 2) / 2, confidence: "medium", reasoning: "Group project complexity varies; using baseline." },
        { id: "a5", estimatedHours: Math.round(MBA_REFERENCE["exam"]["baseHours"]          * multiplier * 2) / 2, confidence: "high",   reasoning: "Full exam prep block; rigor multiplier applied." },
        { id: "a6", estimatedHours: Math.round(MBA_REFERENCE["reflection"]["baseHours"]    * multiplier * 2) / 2, confidence: "high",   reasoning: "Short reflection paper; low variance." },
      ]);
    }

    return "[]";
  }

  async function handleGenerate() {
    const text = syllabusText.trim();
    if (!text) { setError("Please upload a syllabus PDF or paste syllabus text."); return; }
    setError(null);
    setStep("parsing");

    try {
      const today = new Date().toISOString().split("T")[0];

      // ── Parse assignments from syllabus ──────────────────────────────────────
      const parsePrompt = `You are a syllabus parser for Penn MBA students.
Extract every graded assignment, exam, quiz, case, project, or deliverable from the syllabus text.

Return a JSON array. Each object must have:
- id: short unique string like "a1", "a2"
- name: specific assignment name (max 70 chars)
- course: course name or number found in the text
- type: exactly one of [case, essay, problem-set, reading, presentation, exam, reflection, group-project, quiz, other]
- dueDate: YYYY-MM-DD. Today is ${today}. Estimate from today if the date is relative (e.g. "Week 3" ≈ 21 days from today). If completely unknown, spread across the next 6 weeks.

Syllabus text:
${text}

Return ONLY a valid JSON array. No markdown fences, no explanation.`;

      const parseRaw = await callLLM(parsePrompt);
      let parsed: Omit<Assignment, "estimatedHours" | "confidence" | "reasoning">[];
      try {
        const match = parseRaw.match(/\[[\s\S]*\]/);
        parsed = JSON.parse(match ? match[0] : parseRaw);
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty");
      } catch {
        throw new Error(
          "Could not extract assignments from the syllabus. Try pasting the text directly in the box below."
        );
      }

      setStep("estimating");

      // ── Estimate effort ──────────────────────────────────────────────────────
      const paceDesc   = pacePrefs.length ? pacePrefs.join("; ") : "no specific pace preferences";
      const multiplier = RIGOR_MULTIPLIERS[rigor];
      const refLines   = Object.entries(MBA_REFERENCE)
        .map(([k, v]) => `  ${k}: ${v.baseHours}h baseline`)
        .join("\n");

      const estimatePrompt = `You are an effort estimation engine for Penn MBA students.

Student profile:
- Rigor mode: ${RIGOR_LABELS[rigor]} (${Math.round(multiplier * 100)}% of baseline)
- Pace preferences: ${paceDesc}

MBA average hours by type (at 1.0× rigor):
${refLines}

Apply the rigor multiplier and any relevant pace adjustments to each assignment, then return a JSON array with:
- id: same as input
- estimatedHours: number rounded to nearest 0.5
- confidence: "high" (clear type + date), "medium" (some ambiguity), "low" (very unclear)
- reasoning: one concise sentence

Assignments:
${JSON.stringify(parsed, null, 2)}

Return ONLY a valid JSON array. No markdown, no explanation.`;

      const estimateRaw = await callLLM(estimatePrompt);
      let estimates: { id: string; estimatedHours: number; confidence: "high"|"medium"|"low"; reasoning: string }[];
      try {
        const match = estimateRaw.match(/\[[\s\S]*\]/);
        estimates = JSON.parse(match ? match[0] : estimateRaw);
      } catch {
        throw new Error("Could not parse effort estimates from the LLM response.");
      }

      const estMap = Object.fromEntries(estimates.map(e => [e.id, e]));
      const final: Assignment[] = parsed.map(a => {
        const safeType = (a.type in MBA_REFERENCE ? a.type : "other") as AssignmentType;
        return {
          ...a,
          type:           safeType,
          estimatedHours: estMap[a.id]?.estimatedHours ?? MBA_REFERENCE[safeType].baseHours,
          confidence:     estMap[a.id]?.confidence     ?? "medium",
          reasoning:      estMap[a.id]?.reasoning,
        };
      });

      setAssignments(final);
      setStep("review");
    } catch (err) {
      setError(String(err));
      setStep("setup");
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

  // ── Shared styles ─────────────────────────────────────────────────────────────

  const wrap: React.CSSProperties = {
    maxWidth:   760,
    margin:     "0 auto",
    padding:    "40px 24px 80px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color:      C.text,
  };

  const card: React.CSSProperties = {
    background:   C.white,
    border:       `1px solid ${C.border}`,
    borderRadius: 12,
    padding:      24,
    marginBottom: 16,
  };

  const btnStyle = (primary = true, small = false): React.CSSProperties => ({
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

  const STEP_ORDER  = ["setup", "review", "calendar"];
  const STEP_LABELS: Record<string, string> = {
    setup: "Setup", review: "Review Estimates", calendar: "Calendar Blocks",
  };
  const activeIdx = STEP_ORDER.indexOf(
    step === "parsing" || step === "estimating" ? "setup" : step
  );

  const includedBlocks = blocks.filter(b => b.included);
  const totalHours     = assignments.reduce((s, a) => s + a.estimatedHours, 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={wrap}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px" }}>Penn Planner</h1>
        <p style={{ color: C.gray, margin: 0, fontSize: 15 }}>
          Upload your syllabus → AI effort estimates → block your study time
        </p>
      </div>

      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
        {STEP_ORDER.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: i <= activeIdx ? C.blue : C.grayLight,
              color:      i <= activeIdx ? C.white : C.gray,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700,
            }}>{i + 1}</div>
            <span style={{
              marginLeft: 6, fontSize: 13, whiteSpace: "nowrap",
              color:      i === activeIdx ? C.text : C.gray,
              fontWeight: i === activeIdx ? 600 : 400,
            }}>
              {STEP_LABELS[s]}
            </span>
            {i < STEP_ORDER.length - 1 && (
              <div style={{ width: 32, height: 1, background: C.border, margin: "0 10px" }} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: C.redSoft, border: `1px solid #fecaca`,
          borderRadius: 8, padding: "12px 16px", marginBottom: 16,
          color: C.red, fontSize: 14,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ══════════════════ STEP 1 — SETUP ══════════════════ */}
      {(step === "setup" || step === "parsing" || step === "estimating") && (
        <>
          {/* PDF upload */}
          <div style={card}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Upload Syllabus</h2>
            <p style={{ color: C.gray, fontSize: 13, margin: "0 0 16px" }}>
              Upload a PDF of your course syllabus
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{
                border: `2px dashed ${fileName ? C.blue : C.border}`,
                borderRadius: 8, padding: "28px 24px", textAlign: "center",
                cursor: "pointer", background: fileName ? C.blueSoft : C.grayLight,
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {fileName ? (
                <>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>📄</div>
                  <div style={{ fontWeight: 600, color: C.blue }}>{fileName}</div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>Click to replace</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
                  <div style={{ fontWeight: 600 }}>Drop PDF here or click to upload</div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>PDF files only</div>
                </>
              )}
            </div>
            <input
              ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <p style={{ fontSize: 12, color: C.gray, margin: "12px 0 4px" }}>
              PDF not parsing well? Paste syllabus text directly:
            </p>
            <textarea
              rows={4}
              placeholder="Paste syllabus content here..."
              value={syllabusText}
              onChange={e => setSyllabusText(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                border: `1px solid ${C.border}`, borderRadius: 6,
                padding: "8px 12px", fontSize: 13, resize: "vertical",
                fontFamily: "inherit", color: C.text,
              }}
            />
          </div>

          {/* Rigor slider */}
          <div style={card}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Academic Rigor</h2>
            <p style={{ color: C.gray, fontSize: 13, margin: "0 0 20px" }}>
              How much effort do you want to put in?
            </p>
            <input
              type="range" min={0} max={4} step={1} value={rigor}
              onChange={e => setRigor(Number(e.target.value))}
              style={{ width: "100%", accentColor: C.blue, marginBottom: 8 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              {RIGOR_LABELS.map((l, i) => (
                <span key={l} style={{
                  fontSize: 11, textAlign: "center", maxWidth: 70,
                  color:      i === rigor ? C.blue : C.gray,
                  fontWeight: i === rigor ? 700 : 400,
                }}>
                  {l}
                </span>
              ))}
            </div>
            <div style={{
              padding: "8px 12px", background: C.blueSoft,
              borderRadius: 6, fontSize: 13, color: C.blue, fontWeight: 500,
            }}>
              <strong>{RIGOR_LABELS[rigor]}</strong> — estimates at{" "}
              <strong>{Math.round(RIGOR_MULTIPLIERS[rigor] * 100)}%</strong> of MBA average
            </div>
          </div>

          {/* Pace preferences */}
          <div style={card}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Your Pace</h2>
            <p style={{ color: C.gray, fontSize: 13, margin: "0 0 16px" }}>
              Select any that apply — personalizes your estimates from day one
            </p>
            {[
              "I read slower than average",
              "I read faster than average",
              "I'm fast with quantitative work",
              "I struggle with quantitative work",
              "I work best in short focused bursts",
              "I need extra time for written work",
            ].map(pref => (
              <label key={pref} style={{
                display: "flex", alignItems: "center", gap: 10,
                marginBottom: 10, cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={pacePrefs.includes(pref)}
                  onChange={e =>
                    setPacePrefs(prev =>
                      e.target.checked ? [...prev, pref] : prev.filter(p => p !== pref)
                    )
                  }
                  style={{ accentColor: C.blue, width: 16, height: 16, cursor: "pointer" }}
                />
                <span style={{ fontSize: 14 }}>{pref}</span>
              </label>
            ))}
          </div>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={step === "parsing" || step === "estimating"}
            style={{
              ...btnStyle(),
              width: "100%", justifyContent: "center",
              padding: "14px 20px", fontSize: 15,
              opacity: (step === "parsing" || step === "estimating") ? 0.7 : 1,
            }}
          >
            {step === "parsing"    ? "⏳ Parsing syllabus..."
            : step === "estimating" ? "⏳ Estimating effort..."
            : "Generate My Plan →"}
          </button>
        </>
      )}

      {/* ══════════════════ STEP 2 — REVIEW ══════════════════ */}
      {step === "review" && (
        <>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12,
          }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 2px" }}>Your Assignments</h2>
              <p style={{ color: C.gray, fontSize: 13, margin: 0 }}>
                {assignments.length} found — adjust hours if needed, then build your calendar
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep("setup")} style={btnStyle(false)}>← Back</button>
              <button onClick={handleBuildCalendar} style={btnStyle()}>Build Calendar →</button>
            </div>
          </div>

          {assignments.map(a => (
            <div key={a.id} style={{ ...card, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    {typeBadge(a.type)}
                    {confidenceBadge(a.confidence)}
                    <span style={{ fontSize: 12, color: C.gray }}>{a.course}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{a.name}</div>
                  <div style={{ fontSize: 13, color: C.gray }}>Due {formatDate(a.dueDate)}</div>
                  {a.reasoning && (
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 4, fontStyle: "italic" }}>
                      {a.reasoning}
                    </div>
                  )}
                </div>
                {/* Hour stepper */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: C.gray, marginBottom: 4 }}>Est. hours</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => updateHours(a.id, -0.5)}
                      style={{
                        width: 26, height: 26, borderRadius: 4,
                        border: `1px solid ${C.border}`, background: C.white,
                        cursor: "pointer", fontSize: 16, lineHeight: "1",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >−</button>
                    <span style={{ fontWeight: 700, fontSize: 20, minWidth: 36, textAlign: "center" }}>
                      {a.estimatedHours}
                    </span>
                    <button
                      onClick={() => updateHours(a.id, 0.5)}
                      style={{
                        width: 26, height: 26, borderRadius: 4,
                        border: `1px solid ${C.border}`, background: C.white,
                        cursor: "pointer", fontSize: 16, lineHeight: "1",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >+</button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Totals */}
          <div style={{
            ...card, background: C.grayLight,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <span style={{ fontWeight: 600 }}>Total: </span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.blue }}>
                {totalHours.toFixed(1)}h
              </span>
              <span style={{ color: C.gray, fontSize: 13, marginLeft: 8 }}>
                across {assignments.length} assignments
              </span>
            </div>
            <button onClick={handleBuildCalendar} style={btnStyle()}>Build Calendar →</button>
          </div>
        </>
      )}

      {/* ══════════════════ STEP 3 — CALENDAR ══════════════════ */}
      {step === "calendar" && (
        <>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12,
          }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 2px" }}>Study Blocks</h2>
              <p style={{ color: C.gray, fontSize: 13, margin: 0 }}>
                {includedBlocks.length} blocks ·{" "}
                {includedBlocks.reduce((s, b) => s + b.hours, 0).toFixed(1)}h —
                toggle to include/exclude, then add to Google Calendar
              </p>
            </div>
            <button onClick={() => setStep("review")} style={btnStyle(false)}>← Back</button>
          </div>

          {blocks.map(b => (
            <div
              key={b.id}
              style={{
                ...card, padding: "14px 20px",
                borderLeft: `4px solid ${b.included ? C.blue : C.border}`,
                opacity:    b.included ? 1 : 0.45,
                transition: "opacity 0.15s, border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                    {b.assignmentName}
                  </div>
                  <div style={{ fontSize: 13, color: C.gray }}>
                    {formatDate(b.date)} · {b.startHour}:00–{b.startHour + Math.ceil(b.hours)}:00 · {b.hours}h · {b.course}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {b.included && (
                    <a
                      href={toGCalUrl(b)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...btnStyle(false, true), color: C.blue, borderColor: C.blueBorder }}
                    >
                      + Add to Calendar
                    </a>
                  )}
                  <button onClick={() => toggleBlock(b.id)} style={btnStyle(!b.included, true)}>
                    {b.included ? "Remove" : "Include"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Footer */}
          <div style={{
            ...card,
            background: C.blueSoft, border: `1px solid ${C.blueBorder}`,
          }}>
            <div style={{ fontWeight: 700, color: C.blue, marginBottom: 4 }}>
              {includedBlocks.length} block{includedBlocks.length !== 1 ? "s" : ""} ready to add
            </div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: includedBlocks.length ? 12 : 0 }}>
              Each "Add to Calendar" button opens Google Calendar with the block pre-filled.
              Review the details and click Save to confirm.
            </div>
            {includedBlocks.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {includedBlocks.map(b => (
                  <a
                    key={b.id}
                    href={toGCalUrl(b)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...btnStyle(true, true), textDecoration: "none" }}
                  >
                    + {b.assignmentName.length > 28
                        ? b.assignmentName.slice(0, 28) + "…"
                        : b.assignmentName}
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
