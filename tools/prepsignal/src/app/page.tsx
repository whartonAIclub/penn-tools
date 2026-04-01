"use client";

import { useState, useEffect } from "react";
import FeedbackCard from "@/components/FeedbackCard";
import Dashboard from "@/components/Dashboard";
import { loadSessions, saveSession } from "@/lib/storage";
import type { StoredSession } from "@/lib/storage";
import type { SessionResult } from "@/lib/types";

const MIN_WORDS = 200;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

type Tab = "score" | "feedback" | "dashboard";
type ScoringState = "input" | "loading" | "result" | "error";

export default function Home() {
  const [tab, setTab] = useState<Tab>("score");
  const [content, setContent] = useState("");
  const [scoringState, setScoringState] = useState<ScoringState>("input");
  const [result, setResult] = useState<SessionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [sessions, setSessions] = useState<StoredSession[]>([]);

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  const words = countWords(content);
  const ready = words >= MIN_WORDS;

  async function handleScore() {
    if (!ready) return;
    setScoringState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setScoringState("error");
        return;
      }

      const stored = saveSession(data);
      setSessions(loadSessions());
      setResult(data);
      setScoringState("result");
      setTab("feedback");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setScoringState("error");
    }
  }

  function handleReset() {
    setScoringState("input");
    setContent("");
    setResult(null);
    setErrorMsg("");
    setTab("score");
  }

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: "12px 16px",
    fontSize: "13px",
    color: tab === t ? "#222" : "#999",
    cursor: "pointer",
    borderBottom: tab === t ? "2px solid #222" : "2px solid transparent",
    fontWeight: tab === t ? 500 : 400,
    background: "none",
    border: "none",
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
        <button style={tabStyle("score")} onClick={() => setTab("score")}>Score a session</button>
        <button
          style={tabStyle("feedback")}
          onClick={() => setTab("feedback")}
          disabled={!result}
        >
          Last feedback
        </button>
        <button style={tabStyle("dashboard")} onClick={() => setTab("dashboard")}>
          My progress {sessions.length > 0 && <span style={{ fontSize: "11px", color: "#999", marginLeft: "4px" }}>({sessions.length})</span>}
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
                Paste your case notes — we&apos;ll score across 6 dimensions and show you exactly what to work on.
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
                <div style={{ fontSize: "12px", color: "#999" }}>Scoring across 6 dimensions. This takes about 15–30 seconds.</div>
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "20px" }}>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`Paste your case notes here…\n\nMinimum ${MIN_WORDS} words for a reliable score.`}
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
                  color: ready ? "#2d7a2d" : content.length > 0 ? "#b85c00" : "#999",
                }}>
                  {content.length > 0
                    ? ready
                      ? `${words} words — ready to score`
                      : `${words} / ${MIN_WORDS} words — add more detail`
                    : `Minimum ${MIN_WORDS} words`}
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
                    onClick={handleScore}
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
              ? <FeedbackCard result={result} onReset={handleReset} />
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
            <Dashboard sessions={sessions} />
          </>
        )}

      </div>
    </div>
  );
}
