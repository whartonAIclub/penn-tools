"use client";

import { useState, useEffect } from "react";
import FeedbackCard from "@/components/FeedbackCard";
import Dashboard from "@/components/Dashboard";
import DrillsPanel from "@/components/DrillsPanel";
import { loadSessions, saveSession, deleteSession } from "@/lib/storage";
import type { StoredSession } from "@/lib/storage";
import type { SessionResult } from "@/lib/types";

const MIN_WORDS = 200;

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
  communication: [], // always considered present
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

type Tab = "score" | "feedback" | "dashboard" | "drills" | "guide";
type ScoringState = "input" | "warning" | "loading" | "result" | "error";

export default function Home() {
  const [tab, setTab] = useState<Tab>("score");
  const [content, setContent] = useState("");
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

  const words = countWords(content);
  const ready = words >= MIN_WORDS && caseType !== "" && industry !== "";

  function handleScoreClick() {
    if (!ready) return;
    const missing = detectMissingDimensions(content);
    if (missing.length > 0) {
      setMissingDims(missing);
      setScoringState("warning");
    } else {
      submitScore([]);
    }
  }

  async function submitScore(missing: string[]) {
    setScoringState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, caseType, industry, missingDimensions: missing }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setScoringState("error");
        return;
      }

      const stored = saveSession(data, caseType, industry, sessionLabel);
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

  function handleReset() {
    setScoringState("input");
    setContent("");
    setSessionLabel("");
    setResult(null);
    setErrorMsg("");
    setMissingDims([]);
    setTab("score");
  }

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

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f8f8f8", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{
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
      <div style={{ background: "#fff", borderBottom: "1px solid #d4d4d4", padding: "0 24px", display: "flex" }}>
        <button type="button" style={tabStyle("score")} onClick={() => setTab("score")}>Score a session</button>
        <button
          type="button"
          style={tabStyle("feedback")}
          onClick={() => setTab("feedback")}
          disabled={!result}
        >
          Last feedback
        </button>
        <button type="button" style={tabStyle("dashboard")} onClick={() => setTab("dashboard")}>
          My progress {sessions.length > 0 && <span style={{ fontSize: "11px", color: "#999", marginLeft: "4px" }}>({sessions.length})</span>}
        </button>
        <button type="button" style={tabStyle("drills")} onClick={() => setTab("drills")}>
          Drills
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
          }}
        >
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            borderTop: `1px solid ${tab === "guide" ? "#222" : "#bbb"}`,
            borderLeft: `1px solid ${tab === "guide" ? "#222" : "#bbb"}`,
            borderRight: `1px solid ${tab === "guide" ? "#222" : "#bbb"}`,
            borderBottom: `1px solid ${tab === "guide" ? "#222" : "#bbb"}`,
            fontSize: "10px",
            fontWeight: 700,
            color: tab === "guide" ? "#222" : "#bbb",
          }}>?</span>
          How it&apos;s scored
        </button>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>

        {/* ── SCORE TAB ── */}
        {tab === "score" && (
          <>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.4px", marginBottom: "4px" }}>
                Score a session
              </h1>
              <p style={{ fontSize: "14px", color: "#999" }}>
                Paste your case notes — we&apos;ll score across 8 dimensions and show you exactly what to work on.
              </p>
            </div>

            {scoringState === "loading" ? (
              <div style={{
                background: "#fff",
                border: "1px solid #d4d4d4",
                borderRadius: "4px",
                padding: "48px 20px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "14px", color: "#555", marginBottom: "8px" }}>Analyzing your session…</div>
                <div style={{ fontSize: "12px", color: "#999" }}>Scoring across 8 dimensions. This takes about 15–30 seconds.</div>
              </div>
            ) : scoringState === "warning" ? (
              <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "24px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#222", marginBottom: "8px" }}>
                  Missing notes for {missingDims.length} dimension{missingDims.length !== 1 ? "s" : ""}
                </div>
                <p style={{ fontSize: "13px", color: "#555", marginBottom: "14px", lineHeight: 1.5 }}>
                  We couldn&apos;t find enough evidence in your notes for the following. These will be marked <strong>N/A</strong> in your feedback, or you can go back and add more detail.
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
                  <button
                    onClick={() => setScoringState("input")}
                    style={{
                      padding: "9px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      border: "1px solid #d4d4d4",
                      borderRadius: "4px",
                      background: "#fff",
                      cursor: "pointer",
                      color: "#222",
                    }}
                  >
                    ← Edit notes
                  </button>
                  <button
                    onClick={() => submitScore(missingDims)}
                    style={{
                      padding: "9px 18px",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "none",
                      borderRadius: "4px",
                      background: "#1a1a1a",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Proceed anyway →
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#555", marginBottom: "6px" }}>
                      Case type <span style={{ color: "#b00" }}>*</span>
                    </label>
                    <select
                      value={caseType}
                      onChange={(e) => setCaseType(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "13px",
                        border: "1px solid #d4d4d4",
                        borderRadius: "4px",
                        background: "#fff",
                        color: caseType ? "#222" : "#999",
                        outline: "none",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="" disabled>Select case type…</option>
                      {CASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#555", marginBottom: "6px" }}>
                      Industry <span style={{ color: "#b00" }}>*</span>
                    </label>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "13px",
                        border: "1px solid #d4d4d4",
                        borderRadius: "4px",
                        background: "#fff",
                        color: industry ? "#222" : "#999",
                        outline: "none",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="" disabled>Select industry…</option>
                      {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: "14px" }}>
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
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "13px",
                      border: "1px solid #d4d4d4",
                      borderRadius: "4px",
                      background: "#fff",
                      color: "#222",
                      outline: "none",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#555")}
                    onBlur={(e) => (e.target.style.borderColor = "#d4d4d4")}
                  />
                </div>
                <div style={{ marginBottom: "10px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#555", marginBottom: "6px" }}>
                    Session notes
                  </label>
                  <label style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "#555",
                    cursor: "pointer",
                    marginBottom: "8px",
                    padding: "5px 10px",
                    border: "1px solid #d4d4d4",
                    borderRadius: "4px",
                    background: "#fafafa",
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
                    width: "100%",
                    height: "260px",
                    padding: "14px",
                    fontFamily: "'SF Mono', 'Fira Mono', monospace",
                    fontSize: "13px",
                    lineHeight: 1.6,
                    border: "1px solid #d4d4d4",
                    borderRadius: "4px",
                    background: "#fff",
                    color: "#222",
                    resize: "vertical",
                    outline: "none",
                    display: "block",
                    marginBottom: "10px",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#555")}
                  onBlur={(e) => (e.target.style.borderColor = "#d4d4d4")}
                />

                <div style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  marginBottom: "16px",
                  color: ready ? "#2d7a2d" : content.length > 0 || caseType || industry ? "#b85c00" : "#999",
                }}>
                  {words < MIN_WORDS
                    ? content.length > 0
                      ? `${words} / ${MIN_WORDS} words — add more detail`
                      : `Minimum ${MIN_WORDS} words`
                    : !caseType && !industry
                      ? `${words} words — select a case type and industry to continue`
                      : !caseType
                        ? `${words} words — select a case type to continue`
                        : !industry
                          ? `${words} words — select an industry to continue`
                          : `${words} words — ready to score`}
                </div>

                {scoringState === "error" && errorMsg && (
                  <div style={{
                    fontSize: "13px",
                    color: "#b00",
                    background: "#fff5f5",
                    border: "1px solid #fcc",
                    borderRadius: "4px",
                    padding: "10px 14px",
                    marginBottom: "16px",
                  }}>
                    {errorMsg}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    onClick={handleScoreClick}
                    disabled={!ready}
                    style={{
                      padding: "9px 18px",
                      fontSize: "13px",
                      fontWeight: 600,
                      borderRadius: "4px",
                      border: "none",
                      cursor: ready ? "pointer" : "not-allowed",
                      background: ready ? "#1a1a1a" : "#ccc",
                      color: "#fff",
                    }}
                  >
                    Score this session →
                  </button>
                  <span style={{ fontSize: "12px", color: "#999" }}>No account needed</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── FEEDBACK TAB ── */}
        {tab === "feedback" && (
          <>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.4px", marginBottom: "4px" }}>Session feedback</h1>
              <p style={{ fontSize: "14px", color: "#999" }}>Most recent session</p>
            </div>
            {result
              ? <FeedbackCard result={result} onReset={handleReset} sessions={sessions.slice(1)} />
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
            <Dashboard sessions={sessions} onDelete={handleDelete} />
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
                { label: "Clarifying Questions", key: "clarifying_questions", desc: "Did you ask sharp, targeted questions before structuring? Good clarifying questions confirm the objective, scope, timeframe, and any key constraints — before you dive into the framework.", example: "e.g. \"What does success look like for this engagement?\" or \"Are we focused on a specific geography or product line?\"" },
                { label: "Structuring / Framework", key: "structuring", desc: "Did you frame the problem with a clear, MECE structure tailored to the case type? Generic buckets score lower than frameworks that reflect the specific situation.", example: "e.g. Opening with three tailored hypotheses for a profitability case vs. a generic cost/revenue split." },
                { label: "Pace & Driving", key: "pace_driving", desc: "Did you proactively drive the case forward and manage your time? The best candidates set the agenda, signal transitions, and avoid getting stuck in rabbit holes.", example: "e.g. \"I've covered the revenue side — let me now move to costs\" or \"I want to make sure I leave time for a recommendation.\"" },
                { label: "Quant / Math", key: "quantitative", desc: "Were your calculations accurate, clearly set up, and did you state your assumptions? Interviewers look for structured math, not just correct answers.", example: "e.g. Walking through a market sizing step-by-step with explicit assumptions at each stage." },
                { label: "Exhibits / Charts", key: "exhibits", desc: "Did you interpret charts, graphs, or data tables quickly and accurately? The key skill is leading with the insight, not describing the visual.", example: "e.g. \"This chart shows margin declining faster than revenue — that points to a cost structure problem.\"" },
                { label: "Brainstorming", key: "brainstorming", desc: "Did you generate a range of ideas, including non-obvious ones? Interviewers want to see creative, structured brainstorming — not just a list of the first things that come to mind.", example: "e.g. Going beyond obvious cost-cutting to suggest operational restructuring, pricing changes, or channel shifts." },
                { label: "Recommendation", key: "recommendation", desc: "Did you close with a clear, committed recommendation backed by your analysis? The best recommendations name a specific answer, cite 2–3 supporting reasons, and acknowledge the key risk.", example: "e.g. \"My recommendation is to enter the market via acquisition because of X, Y, Z — the main risk is integration cost.\"" },
                { label: "Communication", key: "communication", desc: "Was your delivery clear, concise, and well-signposted throughout? This covers how you structured your spoken reasoning, used transitions, and kept the interviewer oriented.", example: "e.g. Using signposts like \"I'll approach this in three areas: first… second… finally…\"" },
              ].map(({ label, key, desc, example }) => (
                <div key={key} style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <span style={{
                      fontSize: "10px",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      padding: "2px 7px",
                      background: "#1a1a1a",
                      color: "#fff",
                      borderRadius: "2px",
                      letterSpacing: "0.5px",
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
