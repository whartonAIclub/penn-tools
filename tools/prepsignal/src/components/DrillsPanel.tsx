"use client";

import { useState, useEffect, useRef } from "react";
import { loadDrillPlan, saveDrillPlan } from "@/lib/storage";
import type { StoredSession } from "@/lib/storage";
import type { DrillPlan, TopDrill, SkillBreakdown } from "@/lib/types";

interface Props {
  sessions: StoredSession[];
  onGoScore: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function UrgencyBadge({ urgency }: { urgency: TopDrill["urgency"] }) {
  const colors: Record<TopDrill["urgency"], { bg: string; color: string }> = {
    critical: { bg: "#1a1a1a", color: "#fff" },
    high: { bg: "#fff3e0", color: "#8a5000" },
    medium: { bg: "#f0f0f0", color: "#555" },
  };
  const { bg, color } = colors[urgency];
  return (
    <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", padding: "2px 7px", borderRadius: "2px", background: bg, color, fontFamily: "monospace" }}>
      {urgency}
    </span>
  );
}

function TrendArrow({ trend }: { trend: SkillBreakdown["trend"] }) {
  if (trend === "improving") return <span style={{ color: "#2d7a2d", fontWeight: 700 }}>↑</span>;
  if (trend === "declining") return <span style={{ color: "#b00", fontWeight: 700 }}>↓</span>;
  if (trend === "stable") return <span style={{ color: "#999" }}>→</span>;
  return <span style={{ color: "#ccc" }}>—</span>;
}

function LevelBadge({ level }: { level: SkillBreakdown["level"] }) {
  const map = {
    weak: { bg: "#fff0f0", color: "#b00" },
    developing: { bg: "#fff8e6", color: "#8a5000" },
    strong: { bg: "#f0faf0", color: "#2d7a2d" },
  };
  const { bg, color } = map[level];
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "2px", background: bg, color, fontFamily: "monospace" }}>
      {level}
    </span>
  );
}

function DrillCard({ drill }: { drill: TopDrill }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <UrgencyBadge urgency={drill.urgency} />
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>{drill.label}</span>
        <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#999", marginLeft: "auto" }}>{drill.avgScore.toFixed(1)} / 5</span>
      </div>
      <p style={{ fontSize: "13px", color: "#555", lineHeight: 1.5, marginBottom: "12px" }}>{drill.insight}</p>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{ fontSize: "12px", color: "#555", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", display: "flex", alignItems: "center", gap: "4px" }}
      >
        {expanded ? "Hide drills ▲" : `Show drills (${drill.drills.length}) ▾`}
      </button>
      {expanded && (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {drill.drills.map((d, i) => (
            <div key={i} style={{ background: "#f8f8f8", borderRadius: "4px", padding: "10px 14px", borderLeft: "3px solid #1a1a1a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#222" }}>{d.title}</span>
                <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#999", background: "#efefef", padding: "1px 6px", borderRadius: "2px" }}>{d.duration}</span>
              </div>
              <p style={{ fontSize: "12px", color: "#555", lineHeight: 1.5, margin: 0 }}>{d.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DrillsPanel({ sessions, onGoScore }: Props) {
  const [plan, setPlan] = useState<DrillPlan | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [slowWarning, setSlowWarning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function generate(force = false) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("loading");
    setErrorMsg("");
    setSlowWarning(false);

    const slowTimer = setTimeout(() => setSlowWarning(true), 20000);

    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions }),
        signal: ctrl.signal,
      });
      clearTimeout(slowTimer);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to generate drill plan.");
        setStatus("error");
        return;
      }
      saveDrillPlan(data);
      setPlan(data);
      setStatus("idle");
    } catch (err) {
      clearTimeout(slowTimer);
      if ((err as Error).name === "AbortError") return;
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  useEffect(() => {
    if (sessions.length < 2) return;
    const cached = loadDrillPlan();
    if (cached && cached.sessionCount === sessions.length) {
      setPlan(cached);
    } else {
      generate();
    }
    return () => abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (sessions.length < 2) {
    return (
      <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "14px", color: "#555", marginBottom: "8px" }}>Score at least 2 sessions to generate your drill plan</div>
        <div style={{ fontSize: "12px", color: "#999", marginBottom: "20px" }}>PrepSignal needs to see patterns across multiple cases to give you meaningful recommendations.</div>
        <button
          type="button"
          onClick={onGoScore}
          style={{ padding: "9px 18px", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "4px", background: "#1a1a1a", color: "#fff", cursor: "pointer" }}
        >
          Score a session →
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "14px", color: "#555", marginBottom: "8px" }}>Generating your drill plan…</div>
        <div style={{ fontSize: "12px", color: "#999" }}>
          {slowWarning ? "Still thinking — this can take up to 60 seconds for detailed recommendations." : "Analyzing patterns across your sessions. This takes about 20–30 seconds."}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ background: "#fff5f5", border: "1px solid #fcc", borderRadius: "4px", padding: "20px" }}>
        <div style={{ fontSize: "13px", color: "#b00", marginBottom: "12px" }}>{errorMsg}</div>
        <button type="button" onClick={() => generate(true)} style={{ fontSize: "13px", fontWeight: 500, padding: "8px 14px", border: "1px solid #d4d4d4", borderRadius: "4px", background: "#fff", cursor: "pointer" }}>
          Try again
        </button>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div>
      {/* Header meta */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ fontSize: "12px", color: "#999", fontFamily: "monospace" }}>
          Based on {plan.sessionCount} session{plan.sessionCount !== 1 ? "s" : ""} · Generated {formatDate(plan.generatedAt)}
        </div>
        <button type="button" onClick={() => generate(true)} style={{ fontSize: "12px", color: "#555", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
          Regenerate ↻
        </button>
      </div>

      {/* Top Priority Drills */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#999", marginBottom: "10px" }}>
          Top priority drills
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {plan.topDrills.map((drill) => <DrillCard key={drill.dimension} drill={drill} />)}
        </div>
      </div>

      {/* Skill Breakdown */}
      <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px", marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#999", marginBottom: "12px" }}>
          Skill snapshot
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {plan.skillBreakdown.map((dim, i) => (
            <div key={dim.dimension} style={{
              display: "grid",
              gridTemplateColumns: "160px 90px 50px 24px 1fr",
              alignItems: "center",
              gap: "12px",
              padding: "10px 0",
              borderBottom: i < plan.skillBreakdown.length - 1 ? "1px solid #f0f0f0" : "none",
            }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#222" }}>{dim.label}</span>
              <LevelBadge level={dim.level} />
              <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#555" }}>{dim.avgScore.toFixed(1)}/5</span>
              <TrendArrow trend={dim.trend} />
              <span style={{ fontSize: "12px", color: "#777", lineHeight: 1.4 }}>{dim.gaps}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage Gaps + Weekly Plan */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        {/* Coverage Gaps */}
        <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#999", marginBottom: "12px" }}>
            Case coverage gaps
          </div>
          {plan.coverageGaps.industries.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "5px" }}>Industries not yet practiced</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {plan.coverageGaps.industries.map((ind) => (
                  <span key={ind} style={{ fontSize: "11px", padding: "2px 7px", background: "#f0f0f0", borderRadius: "2px", color: "#555", fontFamily: "monospace" }}>{ind}</span>
                ))}
              </div>
            </div>
          )}
          {plan.coverageGaps.caseTypes.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "5px" }}>Case types not yet practiced</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {plan.coverageGaps.caseTypes.map((ct) => (
                  <span key={ct} style={{ fontSize: "11px", padding: "2px 7px", background: "#f0f0f0", borderRadius: "2px", color: "#555", fontFamily: "monospace" }}>{ct}</span>
                ))}
              </div>
            </div>
          )}
          {plan.coverageGaps.recommendations.length > 0 && (
            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #f0f0f0" }}>
              {plan.coverageGaps.recommendations.map((rec, i) => (
                <p key={i} style={{ fontSize: "12px", color: "#555", lineHeight: 1.5, margin: "0 0 4px 0" }}>→ {rec}</p>
              ))}
            </div>
          )}
        </div>

        {/* Weekly Plan */}
        <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#999", marginBottom: "12px" }}>
            Your next 1–2 weeks
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {plan.weeklyPlan.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span style={{
                  fontSize: "10px", fontFamily: "monospace", fontWeight: 700, padding: "2px 6px",
                  background: item.type === "case" ? "#1a1a1a" : "#f0f0f0",
                  color: item.type === "case" ? "#fff" : "#555",
                  borderRadius: "2px", whiteSpace: "nowrap", marginTop: "1px",
                }}>
                  {item.type === "case" ? "CASE" : "DRILL"}
                </span>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#555" }}>{item.label} · </span>
                  <span style={{ fontSize: "12px", color: "#333" }}>{item.activity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trends + Summary */}
      <div style={{ background: "#1a1a1a", color: "#fff", borderRadius: "4px", padding: "20px 24px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", opacity: 0.5, marginBottom: "12px" }}>
          Progress trends
        </div>
        <div style={{ display: "flex", gap: "24px", marginBottom: "16px", flexWrap: "wrap" }}>
          {plan.trends.improving.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", opacity: 0.5, marginBottom: "5px" }}>↑ Improving</div>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                {plan.trends.improving.map((d) => <span key={d} style={{ fontSize: "11px", padding: "2px 7px", background: "rgba(45,122,45,0.3)", borderRadius: "2px", color: "#8eff8e" }}>{d}</span>)}
              </div>
            </div>
          )}
          {plan.trends.declining.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", opacity: 0.5, marginBottom: "5px" }}>↓ Declining</div>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                {plan.trends.declining.map((d) => <span key={d} style={{ fontSize: "11px", padding: "2px 7px", background: "rgba(176,0,0,0.3)", borderRadius: "2px", color: "#ff9e9e" }}>{d}</span>)}
              </div>
            </div>
          )}
          {plan.trends.stagnant.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", opacity: 0.5, marginBottom: "5px" }}>→ Stagnant</div>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                {plan.trends.stagnant.map((d) => <span key={d} style={{ fontSize: "11px", padding: "2px 7px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", color: "#ccc" }}>{d}</span>)}
              </div>
            </div>
          )}
        </div>
        <p style={{ fontSize: "13px", lineHeight: 1.6, opacity: 0.85, margin: 0 }}>{plan.trends.summary}</p>
      </div>
    </div>
  );
}
