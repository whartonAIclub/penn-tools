"use client";

import { useState, useEffect } from "react";
import FeedbackCard from "@/components/FeedbackCard";
import Dashboard from "@/components/Dashboard";
import DrillsPanel from "@/components/DrillsPanel";
import { loadSessions, saveSession, deleteSession, seedDemoData } from "@/lib/storage";
import type { StoredSession } from "@/lib/storage";
import type { SessionResult } from "@/lib/types";

const MIN_WORDS = 200;       // paste mode minimum
const MIN_FIELD_WORDS = 20;  // guided mode minimum per required field

const CASE_TYPES = [
  "Growth Strategy",
  "Cost Reduction",
  "Profitability",
  "Market Entry",
  "M&A / Due Diligence",
  "Pricing",
  "Operations / Process Improvement",
  "Turnaround",
  "Other",
];

const INDUSTRIES = [
  "Airlines / Transportation",
  "Consumer Packaged Goods (CPG)",
  "Energy / Utilities",
  "Financial Services",
  "Healthcare / Pharma",
  "Media & Entertainment",
  "Non-profit",
  "Private Equity",
  "Retail",
  "Technology",
  "Telecom",
  "Other",
];

// ── Guided debrief form definition ──────────────────────────────────────────

type GuidedPrompt = {
  key: string;
  phase: "Opening" | "Analysis" | "Synthesis";
  label: string;
  question: string;
  placeholder: string;
  required: boolean;  // required = must meet MIN_FIELD_WORDS to submit
  canSkip: boolean;   // canSkip = user can mark N/A
};

const GUIDED_PROMPTS: GuidedPrompt[] = [
  {
    key: "clarifying_questions",
    phase: "Opening",
    label: "Clarifying Questions",
    question: "What questions did you ask before structuring?",
    placeholder:
      'e.g. "I asked about the timeline for the decision, the client\'s definition of success, and whether we were focused on a specific region. The interviewer confirmed we were looking at the US market only…"',
    required: true,
    canSkip: false,
  },
  {
    key: "structuring",
    phase: "Opening",
    label: "Structuring",
    question: "How did you frame the problem? Walk through your opening structure.",
    placeholder:
      'e.g. "I opened with three hypotheses: the margin decline is driven by volume loss, pricing pressure, or a cost structure issue. I prioritized the revenue side first because the prompt mentioned flat market share…"',
    required: true,
    canSkip: false,
  },
  {
    key: "pace_driving",
    phase: "Analysis",
    label: "Pace & Driving",
    question: "How did you manage the flow? Did you signal transitions and keep the agenda?",
    placeholder:
      'e.g. "I signaled each transition clearly — \'I\'ve covered the revenue side, let me now turn to costs.\' I noticed I spent too long on market sizing and had to cut the brainstorm short to leave time for a recommendation…"',
    required: true,
    canSkip: false,
  },
  {
    key: "quantitative",
    phase: "Analysis",
    label: "Quant / Math",
    question: "What calculations did you do? Walk through your math and assumptions.",
    placeholder:
      'e.g. "I estimated market size: 300M US adults × 20% target segment × $50 avg spend = $3B total addressable market. I stated my assumptions explicitly before calculating and sanity-checked the output…"',
    required: true,
    canSkip: true,
  },
  {
    key: "exhibits",
    phase: "Analysis",
    label: "Exhibits / Charts",
    question: "Were there any charts or data exhibits? What was your key insight?",
    placeholder:
      'e.g. "Exhibit 2 showed gross margin declining faster than revenue over 3 years. I led with the insight: \'This suggests a cost structure problem, not a top-line problem.\' I avoided describing the chart and went straight to the takeaway…"',
    required: false,
    canSkip: true,
  },
  {
    key: "brainstorming",
    phase: "Analysis",
    label: "Brainstorming",
    question: "What ideas or hypotheses did you generate?",
    placeholder:
      'e.g. "Beyond the obvious cost cuts, I suggested exploring pricing elasticity by segment, shifting volume to a DTC channel, and renegotiating supplier contracts. The interviewer pushed for a fifth idea and I came up with a white-label licensing model…"',
    required: true,
    canSkip: true,
  },
  {
    key: "recommendation",
    phase: "Synthesis",
    label: "Recommendation",
    question: "How did you close? What was your final recommendation?",
    placeholder:
      'e.g. "My recommendation: enter via acquisition of Company X, because of their distribution network, existing brand recognition in the segment, and IP portfolio. The main risk is integration cost — I\'d mitigate by phasing the deal over 18 months…"',
    required: true,
    canSkip: false,
  },
  {
    key: "communication",
    phase: "Synthesis",
    label: "Communication",
    question: "Any notes on your delivery — signposting, clarity, or moments you lost structure?",
    placeholder:
      'e.g. "I used signposts well in the opening and synthesis. In the middle section I lost track of my structure and the interviewer had to re-orient me. My final summary was concise and hit the three key points without rambling…"',
    required: true,
    canSkip: false,
  },
];

const PHASES: GuidedPrompt["phase"][] = ["Opening", "Analysis", "Synthesis"];

// ── Utilities (paste mode) ───────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const DIMENSION_KEYWORDS: Record<string, string[]> = {
  clarifying_questions: ["clarif", "question", "asked", "confirm", "objective", "understand", "scope", "goal"],
  structuring: ["structure", "framework", "bucket", "mece", "approach", "categor", "break down", "split into", "area"],
  pace_driving: ["pace", "driv", "moved to", "next step", "transition", "progress", "led", "pushed", "proceeded"],
  quantitative: ["$", "%", "calculat", "math", "number", "million", "billion", "thousand", "estimate", "percent", "revenue", "cost", "profit"],
  exhibits: ["exhibit", "chart", "graph", "table", "figure", "slide", "visual", "data show", "shows that"],
  brainstorming: ["brainstorm", "idea", "hypothes", "potential", "creativ", "option", "possib", "consider"],
  recommendation: ["recommend", "conclus", "therefore", "final", "summary", "my answer", "advise", "should", "suggest"],
  communication: [],
};

function detectMissingDimensions(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(DIMENSION_KEYWORDS)
    .filter(([, keywords]) => keywords.length > 0 && !keywords.some((kw) => lower.includes(kw)))
    .map(([dim]) => dim);
}

const DIMENSION_LABELS: Record<string, string> = {
  clarifying_questions: "Clarifying Questions",
  structuring: "Structuring / Framework",
  pace_driving: "Pace & Driving",
  quantitative: "Quant / Math",
  exhibits: "Exhibits / Charts",
  brainstorming: "Brainstorming",
  recommendation: "Recommendation",
  communication: "Communication",
};

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "score" | "feedback" | "dashboard" | "drills" | "guide";
type ScoringState = "input" | "warning" | "loading" | "result" | "error";
type InputMode = "guided" | "paste";

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<Tab>("score");
  const [inputMode, setInputMode] = useState<InputMode>("guided");

  // Paste mode state
  const [content, setContent] = useState("");

  // Guided mode state
  const [guidedAnswers, setGuidedAnswers] = useState<Record<string, string>>({});
  const [guidedNA, setGuidedNA] = useState<Set<string>>(new Set(["exhibits"]));

  // Shared state
  const [caseType, setCaseType] = useState("");
  const [industry, setIndustry] = useState("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [scoringState, setScoringState] = useState<ScoringState>("input");
  const [missingDims, setMissingDims] = useState<string[]>([]);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [sessions, setSessions] = useState<StoredSession[]>([]);

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  // ── Readiness ──────────────────────────────────────────────────────────────

  const pasteWords = countWords(content);
  const pasteReady = pasteWords >= MIN_WORDS && caseType !== "" && industry !== "";

  function isGuidedReady(): boolean {
    if (!caseType || !industry) return false;
    for (const p of GUIDED_PROMPTS) {
      if (guidedNA.has(p.key)) continue;
      if (!p.required) continue;
      if (countWords(guidedAnswers[p.key] ?? "") < MIN_FIELD_WORDS) return false;
    }
    return true;
  }

  const ready = inputMode === "guided" ? isGuidedReady() : pasteReady;

  // Count completed required fields for progress indicator
  function guidedProgress(): { done: number; total: number } {
    const required = GUIDED_PROMPTS.filter((p) => p.required && !guidedNA.has(p.key));
    const done = required.filter((p) => countWords(guidedAnswers[p.key] ?? "") >= MIN_FIELD_WORDS);
    return { done: done.length, total: required.length };
  }

  // ── Guided content assembly ────────────────────────────────────────────────

  function assembleGuidedContent(): { content: string; missingDimensions: string[] } {
    const missing: string[] = [];
    const parts: string[] = [];
    for (const p of GUIDED_PROMPTS) {
      if (guidedNA.has(p.key)) {
        missing.push(p.key);
        parts.push(`[${p.label.toUpperCase()}]\nN/A — not present in this session.`);
      } else {
        const answer = (guidedAnswers[p.key] ?? "").trim();
        parts.push(`[${p.label.toUpperCase()}]\n${answer || "(No notes provided.)"}`);
      }
    }
    return { content: parts.join("\n\n"), missingDimensions: missing };
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleScoreClick() {
    if (inputMode === "guided") {
      const { content: assembled, missingDimensions } = assembleGuidedContent();
      submitScore(assembled, missingDimensions);
    } else {
      if (!pasteReady) return;
      const missing = detectMissingDimensions(content);
      if (missing.length > 0) {
        setMissingDims(missing);
        setScoringState("warning");
      } else {
        submitScore(content, []);
      }
    }
  }

  async function submitScore(contentToScore: string, missing: string[]) {
    setScoringState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToScore, caseType, industry, missingDimensions: missing }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setScoringState("error");
        return;
      }
      saveSession(data, caseType, industry, sessionLabel);
      setSessions(loadSessions());
      setResult(data);
      setScoringState("result");
      setTab("feedback");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setScoringState("error");
    }
  }

  function handleDelete(id: string) {
    deleteSession(id);
    setSessions(loadSessions());
  }

  function handleSeedDemo() {
    seedDemoData();
    setSessions(loadSessions());
  }

  function handleImport() {
    setSessions(loadSessions());
  }

  function handleReset() {
    setScoringState("input");
    setContent("");
    setGuidedAnswers({});
    setGuidedNA(new Set(["exhibits"]));
    setSessionLabel("");
    setResult(null);
    setErrorMsg("");
    setMissingDims([]);
    setTab("score");
  }

  function toggleGuidedNA(key: string) {
    setGuidedNA((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: "12px 16px",
    fontSize: "13px",
    color: tab === t ? "#222" : "#999",
    cursor: "pointer",
    borderTop: "none",
    borderLeft: "none",
    borderRight: "none",
    borderBottom: tab === t ? "2px solid #222" : "2px solid transparent",
    fontWeight: tab === t ? 500 : 400,
    background: "none",
    outline: "none",
    fontFamily: "inherit",
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f8f8f8", minHeight: "100vh" }}>

      {/* Nav */}
      <nav className="ps-nav" style={{
        background: "#fff",
        borderBottom: "1px solid #d4d4d4",
        padding: "0 24px",
        height: "52px",
        display: "flex",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ fontWeight: 700, fontSize: "16px", letterSpacing: "-0.3px" }}>
          PrepSignal <span style={{ fontWeight: 400, color: "#999" }}>beta</span>
        </div>
      </nav>

      {/* Tabs */}
      <div className="ps-tabs" style={{ background: "#fff", borderBottom: "1px solid #d4d4d4", position: "sticky", top: "52px", zIndex: 9 }}>
        <div className="ps-tabs-inner" style={{ display: "flex", padding: "0 24px", minWidth: "max-content" }}>
          <button type="button" style={tabStyle("score")} onClick={() => setTab("score")}>
            <span className="ps-tab-label-full">Score a session</span>
            <span className="ps-tab-label-short">Score</span>
          </button>
          <button type="button" style={tabStyle("feedback")} onClick={() => setTab("feedback")} disabled={!result}>
            <span className="ps-tab-label-full">Latest Score</span>
            <span className="ps-tab-label-short">Result</span>
          </button>
          <button type="button" style={tabStyle("dashboard")} onClick={() => setTab("dashboard")}>
            <span className="ps-tab-label-full">My progress</span>
            <span className="ps-tab-label-short">Progress</span>
            {sessions.length > 0 && <span style={{ fontSize: "11px", color: "#999", marginLeft: "4px" }}>({sessions.length})</span>}
          </button>
          <button type="button" style={tabStyle("drills")} onClick={() => setTab("drills")}>
            Drills <span style={{ fontSize: "10px", color: "#999", fontWeight: 400 }}>(beta)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("guide")}
            style={{
              marginLeft: "auto",
              padding: "12px 16px",
              fontSize: "13px",
              fontWeight: tab === "guide" ? 500 : 400,
              color: tab === "guide" ? "#222" : "#999",
              cursor: "pointer",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: tab === "guide" ? "2px solid #222" : "2px solid transparent",
              outline: "none",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              border: `1px solid ${tab === "guide" ? "#222" : "#bbb"}`,
              fontSize: "10px",
              fontWeight: 700,
              color: tab === "guide" ? "#222" : "#bbb",
            }}>?</span>
            <span className="ps-tab-label-full">How it&apos;s scored</span>
            <span className="ps-tab-label-short">Guide</span>
          </button>
        </div>
      </div>

      <div className="ps-content" style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>

        {/* ── SCORE TAB ── */}
        {tab === "score" && (
          <>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.4px", marginBottom: "4px" }}>
                Score a session
              </h1>
              <p style={{ fontSize: "14px", color: "#999" }}>
                Walk through your case debrief — we&apos;ll score across 8 dimensions and show you exactly what to work on.
              </p>
            </div>

            {/* Hero — shown on first visit before any session is scored */}
            {scoringState === "input" && sessions.length === 0 && (
              <div style={{
                background: "#fff",
                border: "1px solid #d4d4d4",
                borderRadius: "4px",
                padding: "20px 24px",
                marginBottom: "16px",
              }}>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#222", marginBottom: "12px", lineHeight: 1.4 }}>
                  Know exactly where you&apos;re improving — before your next interview.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    "Score any case session across 8 consulting dimensions",
                    "Track your skill progression on your personal dashboard",
                    "Get a personalized drill plan based on your weakest areas",
                  ].map((item) => (
                    <div key={item} style={{ fontSize: "13px", color: "#555", display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <span style={{ color: "#1a1a1a", fontWeight: 600, flexShrink: 0 }}>→</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loading state */}
            {scoringState === "loading" ? (
              <div style={{
                background: "#fff",
                border: "1px solid #d4d4d4",
                borderRadius: "4px",
                padding: "48px 20px",
                textAlign: "center",
              }}>
                <div className="ps-spinner" />
                <div style={{ fontSize: "14px", color: "#333", fontWeight: 500, marginBottom: "6px" }}>Analyzing your session…</div>
                <div style={{ fontSize: "12px", color: "#999" }}>Scoring across 8 dimensions. This takes about 15–30 seconds.</div>
              </div>

            ) : scoringState === "warning" ? (
              /* Warning state (paste mode only) */
              <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "24px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#222", marginBottom: "8px" }}>
                  Missing notes for {missingDims.length} dimension{missingDims.length !== 1 ? "s" : ""}
                </div>
                <p style={{ fontSize: "13px", color: "#555", marginBottom: "14px", lineHeight: 1.5 }}>
                  We couldn&apos;t find enough evidence for the following. These will be marked <strong>N/A</strong>, or go back and add more detail.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
                  {missingDims.map((d) => (
                    <span key={d} style={{
                      fontSize: "12px",
                      fontFamily: "monospace",
                      padding: "4px 10px",
                      background: "#fff5e6",
                      border: "1px solid #f0c080",
                      borderRadius: "4px",
                      color: "#8a5000",
                    }}>
                      {DIMENSION_LABELS[d] ?? d}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setScoringState("input")} style={{
                    padding: "9px 16px", fontSize: "13px", fontWeight: 500,
                    border: "1px solid #d4d4d4", borderRadius: "4px",
                    background: "#fff", cursor: "pointer", color: "#222",
                  }}>
                    ← Edit notes
                  </button>
                  <button onClick={() => submitScore(content, missingDims)} style={{
                    padding: "9px 18px", fontSize: "13px", fontWeight: 600,
                    border: "none", borderRadius: "4px",
                    background: "#1a1a1a", color: "#fff", cursor: "pointer",
                  }}>
                    Proceed anyway →
                  </button>
                </div>
              </div>

            ) : (
              /* Input form */
              <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "20px" }}>

                {/* Case type + industry */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#555", marginBottom: "6px" }}>
                      Case type <span style={{ color: "#b00" }}>*</span>
                    </label>
                    <select value={caseType} onChange={(e) => setCaseType(e.target.value)} style={{
                      width: "100%", padding: "8px 10px", fontSize: "13px",
                      border: "1px solid #d4d4d4", borderRadius: "4px",
                      background: "#fff", color: caseType ? "#222" : "#999",
                      outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                    }}>
                      <option value="" disabled>Select case type…</option>
                      {CASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#555", marginBottom: "6px" }}>
                      Industry <span style={{ color: "#b00" }}>*</span>
                    </label>
                    <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={{
                      width: "100%", padding: "8px 10px", fontSize: "13px",
                      border: "1px solid #d4d4d4", borderRadius: "4px",
                      background: "#fff", color: industry ? "#222" : "#999",
                      outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                    }}>
                      <option value="" disabled>Select industry…</option>
                      {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                  </div>
                </div>

                {/* Session label */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#555", marginBottom: "6px" }}>
                    Session label <span style={{ color: "#bbb", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={sessionLabel}
                    onChange={(e) => setSessionLabel(e.target.value)}
                    placeholder='e.g. "Mock with Sarah" or "McKinsey M&A prep"'
                    maxLength={80}
                    style={{
                      width: "100%", padding: "8px 10px", fontSize: "13px",
                      border: "1px solid #d4d4d4", borderRadius: "4px",
                      background: "#fff", color: "#222",
                      outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#555")}
                    onBlur={(e) => (e.target.style.borderColor = "#d4d4d4")}
                  />
                </div>

                {/* Divider */}
                <div style={{ borderTop: "1px solid #ebebeb", marginBottom: "20px" }} />

                {/* Input mode toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#555" }}>
                    Session notes
                  </div>
                  <div style={{
                    display: "inline-flex",
                    border: "1px solid #d4d4d4",
                    borderRadius: "4px",
                    overflow: "hidden",
                    fontSize: "12px",
                  }}>
                    {(["guided", "paste"] as InputMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setInputMode(mode); setScoringState("input"); }}
                        style={{
                          padding: "6px 14px",
                          fontSize: "12px",
                          border: "none",
                          borderRight: mode === "guided" ? "1px solid #d4d4d4" : "none",
                          background: inputMode === mode ? "#1a1a1a" : "#fff",
                          color: inputMode === mode ? "#fff" : "#666",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: inputMode === mode ? 500 : 400,
                        }}
                      >
                        {mode === "guided" ? "Guided debrief" : "Paste notes"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── GUIDED MODE ── */}
                {inputMode === "guided" && (
                  <>
                    <p style={{ fontSize: "12px", color: "#888", marginBottom: "20px", lineHeight: 1.5 }}>
                      Answer each prompt in your own words — a few sentences per field is enough. Mark any dimension as <strong>N/A</strong> if it wasn&apos;t part of your session.
                    </p>

                    {PHASES.map((phase) => {
                      const phasePrompts = GUIDED_PROMPTS.filter((p) => p.phase === phase);
                      return (
                        <div key={phase} style={{ marginBottom: "28px" }}>
                          {/* Phase header */}
                          <div style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                            color: "#aaa",
                            marginBottom: "12px",
                            paddingBottom: "8px",
                            borderBottom: "1px solid #ebebeb",
                          }}>
                            {phase}
                          </div>

                          {/* Fields in this phase */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            {phasePrompts.map((p) => {
                              const isNA = guidedNA.has(p.key);
                              const words = countWords(guidedAnswers[p.key] ?? "");
                              const fieldReady = isNA || !p.required || words >= MIN_FIELD_WORDS;

                              return (
                                <div key={p.key}>
                                  {/* Field label row */}
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <span style={{ fontSize: "13px", fontWeight: 500, color: isNA ? "#aaa" : "#222" }}>
                                        {p.label}
                                      </span>
                                      {p.required && !isNA && (
                                        <span style={{ fontSize: "10px", color: "#b00" }}>*</span>
                                      )}
                                    </div>
                                    {p.canSkip && (
                                      <button
                                        type="button"
                                        onClick={() => toggleGuidedNA(p.key)}
                                        style={{
                                          fontSize: "11px",
                                          padding: "2px 8px",
                                          border: `1px solid ${isNA ? "#1a1a1a" : "#d4d4d4"}`,
                                          borderRadius: "3px",
                                          background: isNA ? "#1a1a1a" : "#fff",
                                          color: isNA ? "#fff" : "#888",
                                          cursor: "pointer",
                                          fontFamily: "inherit",
                                        }}
                                      >
                                        {isNA ? "✓ N/A" : "N/A"}
                                      </button>
                                    )}
                                  </div>

                                  {/* Question prompt */}
                                  <p style={{ fontSize: "12px", color: "#888", marginBottom: "6px", lineHeight: 1.4 }}>
                                    {p.question}
                                  </p>

                                  {/* Textarea or N/A state */}
                                  {isNA ? (
                                    <div style={{
                                      padding: "10px 12px",
                                      background: "#f5f5f5",
                                      border: "1px solid #e4e4e4",
                                      borderRadius: "4px",
                                      fontSize: "12px",
                                      color: "#aaa",
                                      fontStyle: "italic",
                                    }}>
                                      Marked as N/A — will be excluded from scoring
                                    </div>
                                  ) : (
                                    <>
                                      <textarea
                                        value={guidedAnswers[p.key] ?? ""}
                                        onChange={(e) => setGuidedAnswers((prev) => ({ ...prev, [p.key]: e.target.value }))}
                                        placeholder={p.placeholder}
                                        rows={3}
                                        style={{
                                          width: "100%",
                                          padding: "10px 12px",
                                          fontFamily: "inherit",
                                          fontSize: "13px",
                                          lineHeight: 1.6,
                                          border: "1px solid #d4d4d4",
                                          borderRadius: "4px",
                                          background: "#fff",
                                          color: "#222",
                                          resize: "vertical",
                                          outline: "none",
                                          display: "block",
                                          boxSizing: "border-box",
                                        }}
                                        onFocus={(e) => (e.target.style.borderColor = "#555")}
                                        onBlur={(e) => (e.target.style.borderColor = "#d4d4d4")}
                                      />
                                      {/* Per-field word count */}
                                      {(guidedAnswers[p.key] ?? "").length > 0 && (
                                        <div style={{
                                          fontSize: "11px",
                                          fontFamily: "monospace",
                                          marginTop: "4px",
                                          color: fieldReady ? "#2d7a2d" : "#b85c00",
                                        }}>
                                          {words} word{words !== 1 ? "s" : ""}
                                          {p.required && !fieldReady && ` — ${MIN_FIELD_WORDS - words} more to go`}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Progress + submit */}
                    {(() => {
                      const { done, total } = guidedProgress();
                      const metaReady = caseType !== "" && industry !== "";
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingTop: "8px", borderTop: "1px solid #ebebeb" }}>
                          <button
                            onClick={handleScoreClick}
                            disabled={!ready}
                            style={{
                              padding: "9px 18px", fontSize: "13px", fontWeight: 600,
                              borderRadius: "4px", border: "none",
                              cursor: ready ? "pointer" : "not-allowed",
                              background: ready ? "#1a1a1a" : "#ccc",
                              color: "#fff",
                            }}
                          >
                            Score this session →
                          </button>
                          <span style={{ fontSize: "12px", color: "#999" }}>
                            {!metaReady
                              ? "Select a case type and industry to continue"
                              : done < total
                                ? `${done} / ${total} required fields complete`
                                : "Ready to score"}
                          </span>
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* ── PASTE MODE ── */}
                {inputMode === "paste" && (
                  <>
                    <div style={{ marginBottom: "10px" }}>
                      <label style={{
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        fontSize: "12px", color: "#555", cursor: "pointer",
                        padding: "5px 10px",
                        border: "1px solid #d4d4d4", borderRadius: "4px", background: "#fafafa",
                      }}>
                        ↑ Upload .txt file
                        <input
                          type="file"
                          accept=".txt"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => setContent(ev.target?.result as string ?? "");
                            reader.readAsText(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={`Paste your case notes here, or upload a .txt file above…\n\nMinimum ${MIN_WORDS} words for a reliable score.`}
                      style={{
                        width: "100%", height: "260px",
                        padding: "14px",
                        fontFamily: "'SF Mono', 'Fira Mono', monospace",
                        fontSize: "13px", lineHeight: 1.6,
                        border: "1px solid #d4d4d4", borderRadius: "4px",
                        background: "#fff", color: "#222",
                        resize: "vertical", outline: "none",
                        display: "block", marginBottom: "10px", boxSizing: "border-box",
                      }}
                      onFocus={(e) => (e.target.style.borderColor = "#555")}
                      onBlur={(e) => (e.target.style.borderColor = "#d4d4d4")}
                    />

                    <div style={{
                      fontSize: "12px", fontFamily: "monospace", marginBottom: "16px",
                      color: pasteReady ? "#2d7a2d" : content.length > 0 || caseType || industry ? "#b85c00" : "#999",
                    }}>
                      {pasteWords < MIN_WORDS
                        ? content.length > 0
                          ? `${pasteWords} / ${MIN_WORDS} words — add more detail`
                          : `Minimum ${MIN_WORDS} words`
                        : !caseType && !industry
                          ? `${pasteWords} words — select a case type and industry to continue`
                          : !caseType
                            ? `${pasteWords} words — select a case type to continue`
                            : !industry
                              ? `${pasteWords} words — select an industry to continue`
                              : `${pasteWords} words — ready to score`}
                    </div>

                    {scoringState === "error" && errorMsg && (
                      <div style={{
                        fontSize: "13px", color: "#b00",
                        background: "#fff5f5", border: "1px solid #fcc",
                        borderRadius: "4px", padding: "10px 14px", marginBottom: "16px",
                      }}>
                        {errorMsg}
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button
                        onClick={handleScoreClick}
                        disabled={!pasteReady}
                        style={{
                          padding: "9px 18px", fontSize: "13px", fontWeight: 600,
                          borderRadius: "4px", border: "none",
                          cursor: pasteReady ? "pointer" : "not-allowed",
                          background: pasteReady ? "#1a1a1a" : "#ccc",
                          color: "#fff",
                        }}
                      >
                        Score this session →
                      </button>
                      <span style={{ fontSize: "12px", color: "#999" }}>No account needed</span>
                    </div>
                  </>
                )}

                {/* Error (shared, shown below submit in guided mode too) */}
                {scoringState === "error" && errorMsg && inputMode === "guided" && (
                  <div style={{
                    fontSize: "13px", color: "#b00",
                    background: "#fff5f5", border: "1px solid #fcc",
                    borderRadius: "4px", padding: "10px 14px", marginTop: "16px",
                  }}>
                    {errorMsg}
                  </div>
                )}

              </div>
            )}
          </>
        )}

        {/* ── FEEDBACK TAB ── */}
        {tab === "feedback" && (
          <>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.4px", marginBottom: "4px" }}>Latest Score</h1>
              <p style={{ fontSize: "14px", color: "#999" }}>Most recent session</p>
            </div>
            {result
              ? <FeedbackCard result={result} onReset={handleReset} sessions={sessions.slice(1)} caseType={caseType} industry={industry} />
              : <div style={{ color: "#999", fontSize: "14px" }}>No session scored yet.</div>
            }
          </>
        )}

        {/* ── DASHBOARD TAB ── */}
        {tab === "dashboard" && (
          <>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.4px", marginBottom: "4px" }}>My progress</h1>
              <p style={{ fontSize: "14px", color: "#999" }}>
                {sessions.length > 0
                  ? `${sessions.length} session${sessions.length !== 1 ? "s" : ""} tracked`
                  : "Score your first session to start tracking"}
              </p>
            </div>
            <Dashboard sessions={sessions} onDelete={handleDelete} onSeedDemo={handleSeedDemo} onImport={handleImport} />
          </>
        )}

        {/* ── DRILLS TAB ── */}
        {tab === "drills" && (
          <>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.4px", marginBottom: "4px" }}>Drills</h1>
              <p style={{ fontSize: "14px", color: "#999" }}>Personalized practice plan based on your session history</p>
            </div>
            <DrillsPanel sessions={sessions} onGoScore={() => setTab("score")} />
          </>
        )}

        {/* ── GUIDE TAB ── */}
        {tab === "guide" && (
          <>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.4px", marginBottom: "4px" }}>How it&apos;s scored</h1>
              <p style={{ fontSize: "14px", color: "#999" }}>The 8 dimensions PrepSignal evaluates in every case session</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { label: "Clarifying Questions", key: "clarifying_questions", desc: "Did you ask sharp, targeted questions before structuring? Good clarifying questions confirm the objective, scope, timeframe, and any key constraints — before you dive into the framework.", example: 'e.g. "What does success look like for this engagement?" or "Are we focused on a specific geography or product line?"' },
                { label: "Structuring / Framework", key: "structuring", desc: "Did you frame the problem with a clear, MECE structure tailored to the case type? Generic buckets score lower than frameworks that reflect the specific situation.", example: "e.g. Opening with three tailored hypotheses for a profitability case vs. a generic cost/revenue split." },
                { label: "Pace & Driving", key: "pace_driving", desc: "Did you proactively drive the case forward and manage your time? The best candidates set the agenda, signal transitions, and avoid getting stuck in rabbit holes.", example: 'e.g. "I\'ve covered the revenue side — let me now move to costs" or "I want to make sure I leave time for a recommendation."' },
                { label: "Quant / Math", key: "quantitative", desc: "Were your calculations accurate, clearly set up, and did you state your assumptions? Interviewers look for structured math, not just correct answers.", example: "e.g. Walking through a market sizing step-by-step with explicit assumptions at each stage." },
                { label: "Exhibits / Charts", key: "exhibits", desc: "Did you interpret charts, graphs, or data tables quickly and accurately? The key skill is leading with the insight, not describing the visual.", example: 'e.g. "This chart shows margin declining faster than revenue — that points to a cost structure problem."' },
                { label: "Brainstorming", key: "brainstorming", desc: "Did you generate a range of ideas, including non-obvious ones? Interviewers want to see creative, structured brainstorming — not just a list of the first things that come to mind.", example: "e.g. Going beyond obvious cost-cutting to suggest operational restructuring, pricing changes, or channel shifts." },
                { label: "Recommendation", key: "recommendation", desc: "Did you close with a clear, committed recommendation backed by your analysis? The best recommendations name a specific answer, cite 2–3 supporting reasons, and acknowledge the key risk.", example: 'e.g. "My recommendation is to enter the market via acquisition because of X, Y, Z — the main risk is integration cost."' },
                { label: "Communication", key: "communication", desc: "Was your delivery clear, concise, and well-signposted throughout? This covers how you structured your spoken reasoning, used transitions, and kept the interviewer oriented.", example: 'e.g. Using signposts like "I\'ll approach this in three areas: first… second… finally…"' },
              ].map(({ label, key, desc, example }) => (
                <div key={key} style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <span style={{
                      fontSize: "10px", fontFamily: "monospace", fontWeight: 700,
                      padding: "2px 7px", background: "#1a1a1a", color: "#fff",
                      borderRadius: "2px", letterSpacing: "0.5px",
                    }}>
                      {label.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "#333", lineHeight: 1.6, marginBottom: "8px" }}>{desc}</p>
                  <p style={{ fontSize: "12px", color: "#999", lineHeight: 1.5, fontStyle: "italic" }}>{example}</p>
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
