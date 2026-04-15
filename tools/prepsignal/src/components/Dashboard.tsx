"use client";

import { DIMENSIONS } from "@/lib/types";
import { toChartData } from "@/lib/storage";
import type { StoredSession } from "@/lib/storage";
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

  return (
    <div>
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

      {/* Session history */}
      <div style={{ background: "#fff", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "16px 20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "#999", marginBottom: "12px" }}>
          Session history · {sessions.length} total
        </div>
        <div>
          {sessions.map((session, i) => (
            <div key={session.id} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: i < sessions.length - 1 ? "1px solid #f0f0f0" : "none",
              fontSize: "13px",
            }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: "2px" }}>Session {sessions.length - i}</div>
                <div style={{ fontSize: "12px", color: "#999", fontFamily: "monospace" }}>
                  {formatDate(session.createdAt)}
                </div>
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
          ))}
        </div>
      </div>
    </div>
  );
}
