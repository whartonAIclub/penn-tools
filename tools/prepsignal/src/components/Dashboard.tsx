"use client";

import { DIMENSIONS } from "@/lib/types";
import { toChartData } from "@/lib/storage";
import type { StoredSession } from "@/lib/storage";
import type { Dimension } from "@/lib/types";
import SkillRadar from "./SkillRadar";
import ProgressionChart from "./ProgressionChart";

interface Props {
  sessions: StoredSession[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function avgOverallScore(sessions: StoredSession[]): string {
  const total = sessions.reduce((sum, s) => {
    const sessionAvg = DIMENSIONS.reduce((a, { key }) => a + s.scores[key].score, 0) / DIMENSIONS.length;
    return sum + sessionAvg;
  }, 0);
  return (total / sessions.length).toFixed(1);
}

function bestDimension(sessions: StoredSession[]): string {
  const totals: Record<string, number> = {};
  for (const { key } of DIMENSIONS) totals[key] = 0;
  for (const s of sessions) {
    for (const { key } of DIMENSIONS) totals[key] += s.scores[key].score;
  }
  const best = DIMENSIONS.reduce((a, b) => totals[a.key] > totals[b.key] ? a : b);
  return best.label;
}

function mostImproved(sessions: StoredSession[]): string | null {
  if (sessions.length < 2) return null;
  const oldest = sessions[sessions.length - 1];
  const newest = sessions[0];
  let bestGain = -Infinity;
  let bestLabel = "";
  for (const { key, label } of DIMENSIONS) {
    const gain = newest.scores[key].score - oldest.scores[key].score;
    if (gain > bestGain) { bestGain = gain; bestLabel = label; }
  }
  return bestGain > 0 ? bestLabel : null;
}

function BreakdownCard({ title, sessions, field }: { title: string; sessions: StoredSession[]; field: "caseType" | "industry" }) {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    const key = s[field] || "Unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;

  return (
    <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px" }}>
      <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#999", marginBottom: "12px" }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {entries.map(([label, count]) => (
          <div key={label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
              <span style={{ color: "#222" }}>{label}</span>
              <span style={{ fontFamily: "monospace", color: "#555" }}>{count}</span>
            </div>
            <div style={{ height: "4px", background: "#f0f0f0", borderRadius: "2px" }}>
              <div style={{ height: "4px", background: "#1a1a1a", borderRadius: "2px", width: `${(count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #d4d4d4",
      borderRadius: "4px",
      padding: "16px 20px",
      flex: 1,
    }}>
      <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#999", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.5px", color: "#1a1a1a" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <div style={{
        background: "#fff",
        border: "1px solid #d4d4d4",
        borderRadius: "4px",
        padding: "48px 20px",
        textAlign: "center",
        color: "#999",
        fontSize: "14px",
      }}>
        No sessions yet — score your first session to see your dashboard.
      </div>
    );
  }

  const latest = sessions[0];
  const chartData = toChartData(sessions);
  const priorityDimension = latest.priority.dimension;
  const improved = mostImproved(sessions);

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
        <StatCard label="Sessions" value={String(sessions.length)} sub="total scored" />
        <StatCard label="Avg score" value={avgOverallScore(sessions)} sub="across all dimensions" />
        <StatCard label="Top strength" value={bestDimension(sessions)} sub="highest avg score" />
        <StatCard
          label={improved ? "Most improved" : "Current focus"}
          value={improved ?? latest.priority.label}
          sub={improved ? "since first session" : "needs work"}
        />
      </div>

      {/* Priority */}
      <div style={{
        background: "#1a1a1a",
        color: "#fff",
        borderRadius: "4px",
        padding: "16px 20px",
        marginBottom: "16px",
        display: "flex",
        gap: "14px",
        alignItems: "flex-start",
      }}>
        <div style={{ fontSize: "18px", opacity: 0.6, marginTop: "2px" }}>↑</div>
        <div>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", opacity: 0.5, marginBottom: "4px" }}>
            Focus this week
          </div>
          <div style={{ fontSize: "14px", fontWeight: 500, lineHeight: 1.4 }}>
            <strong>{latest.priority.label}</strong> — {latest.priority.advice}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr",
        gap: "16px",
        marginBottom: "16px",
        alignItems: "start",
      }}>
        {/* Radar */}
        <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#999", marginBottom: "8px" }}>
            Current skill shape
          </div>
          <SkillRadar scores={latest.scores} priority={priorityDimension} />
          <div style={{ fontSize: "11px", color: "#999", textAlign: "center", marginTop: "4px" }}>
            Session {sessions.length} · {formatDate(latest.createdAt)}
          </div>
        </div>

        {/* Progression */}
        <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#999", marginBottom: "12px" }}>
            Score progression · {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </div>
          <ProgressionChart data={chartData} priorityDimension={priorityDimension} />
        </div>
      </div>

      {/* Case type & industry breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        <BreakdownCard title="Cases by type" sessions={sessions} field="caseType" />
        <BreakdownCard title="Cases by industry" sessions={sessions} field="industry" />
      </div>

      {/* Session history */}
      <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#999", marginBottom: "12px" }}>
          Session history · {sessions.length} total
        </div>
        <div>
          {sessions.map((session, i) => {
            const sessionAvg = (DIMENSIONS.reduce((a, { key }) => a + session.scores[key].score, 0) / DIMENSIONS.length).toFixed(1);
            return (
              <div key={session.id} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: i < sessions.length - 1 ? "1px solid #f0f0f0" : "none",
                fontSize: "13px",
              }}>
                <div style={{ minWidth: "120px" }}>
                  <div style={{ fontWeight: 500, marginBottom: "2px" }}>Session {sessions.length - i}</div>
                  <div style={{ fontSize: "12px", color: "#999", fontFamily: "monospace" }}>
                    {formatDate(session.createdAt)}
                  </div>
                </div>
                <div style={{ fontSize: "12px", fontFamily: "monospace", color: "#555", minWidth: "48px", textAlign: "center" }}>
                  avg {sessionAvg}
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {DIMENSIONS.map(({ key, label }) => (
                    <span
                      key={key}
                      title={`${label}: ${session.scores[key].score}/5`}
                      style={{
                        fontSize: "11px",
                        fontFamily: "monospace",
                        padding: "2px 6px",
                        background: key === session.priority.dimension ? "#1a1a1a" : "#efefef",
                        color: key === session.priority.dimension ? "#fff" : "#555",
                        borderRadius: "2px",
                        cursor: "default",
                      }}
                    >
                      {label.slice(0, 3).toUpperCase()} {session.scores[key].score}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
