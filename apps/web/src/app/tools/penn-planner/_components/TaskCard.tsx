"use client";

import { useState } from "react";
import type { PrioritizedTask } from "@/lib/pennPlanner/types";

interface TaskCardProps {
  task: PrioritizedTask;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}

const SOURCE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  canvas: { bg: "#EFF6FF", color: "#1d4ed8", border: "#BFDBFE" },
  careerpath: { bg: "#F5F3FF", color: "#6d28d9", border: "#DDD6FE" },
  google_calendar: { bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" },
  icalendar: { bg: "#F5F3FF", color: "#7C3AED", border: "#DDD6FE" },
  manual: { bg: "#F5F5F5", color: "#555", border: "#E0E0E0" },
};

function getCardStyle(status: string, daysUntilDue: number): React.CSSProperties {
  if (status === "completed") return { background: "#F9F9F9", borderLeft: "3px solid #C8E6C9", border: "1px solid #E0E0E0" };
  if (daysUntilDue < 0) return { background: "#FFF5F5", borderLeft: "3px solid #FFAB91", border: "1px solid #FFCDD2" };
  if (status === "in_progress" && daysUntilDue <= 0) return { background: "#FFFDE7", borderLeft: "3px solid #FFE082", border: "1px solid #FFF9C4" };
  if (status === "in_progress") return { background: "#F1FDF3", borderLeft: "3px solid #A5D6A7", border: "1px solid #C8E6C9" };
  if (daysUntilDue === 0) return { background: "#FFFDE7", borderLeft: "3px solid #FFE082", border: "1px solid #FFF9C4" };
  return { background: "#FAFAFA", borderLeft: "3px solid #BDBDBD", border: "1px solid #E8E8E8" };
}

export function TaskCard({ task, onStatusChange, onDelete }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const isCompleted = task.status === "completed";
  const cardStyle = getCardStyle(task.status, task.daysUntilDue);
  const src = SOURCE_STYLES[task.source] ?? SOURCE_STYLES.manual;

  async function handleStatusChange(newStatus: string) {
    setLoading(true);
    await onStatusChange(task.id, newStatus);
    setLoading(false);
  }

  return (
    <div style={{ ...cardStyle, borderRadius: "8px", opacity: isCompleted ? 0.65 : 1, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, textDecoration: isCompleted ? "line-through" : "none" }}>{task.title}</span>
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: "#E0E0E0", color: "#555", fontWeight: 700 }}>
              {task.status === "completed" ? "Done" : task.status === "in_progress" ? "In Progress" : "Not Started"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "11px",
                padding: "1px 7px",
                borderRadius: "3px",
                border: `1px solid ${src.border}`,
                background: src.bg,
                color: src.color,
                fontWeight: 600,
              }}
            >
              {task.source === "canvas"
                ? "Canvas"
                : task.source === "careerpath"
                  ? "CareerPath"
                  : task.source === "google_calendar"
                    ? "Google Calendar"
                    : task.source === "icalendar"
                      ? "iCalendar"
                      : "Manual"}
            </span>
            <span style={{ fontSize: "12px", color: "#6b6b6b" }}>{new Date(task.dueDate).toLocaleString()}</span>
            <span style={{ fontSize: "12px", color: "#4338ca", fontWeight: 500 }}>~{task.recommendedWorkMinutes} min</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          {!isCompleted ? (
            <>
              <button
                onClick={() => handleStatusChange("in_progress")}
                disabled={loading || task.status === "in_progress"}
                style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "4px", border: "1px solid #BFDBFE", background: "#fff", color: "#011F5B", cursor: "pointer", fontWeight: 600 }}
              >
                Start
              </button>
              <button
                onClick={() => handleStatusChange("completed")}
                disabled={loading}
                style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "4px", border: "1px solid #A5D6A7", background: "#fff", color: "#2E7D32", cursor: "pointer", fontWeight: 600 }}
              >
                Done
              </button>
            </>
          ) : (
            <button
              onClick={() => handleStatusChange("pending")}
              disabled={loading}
              style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "4px", border: "1px solid #E0E0E0", background: "#fff", color: "#6b6b6b", cursor: "pointer", fontWeight: 600 }}
            >
              Undo
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9b9b9b", fontSize: "12px" }}>
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "12px 16px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {task.description && <p style={{ fontSize: "13px", color: "#444", margin: 0 }}>{task.description}</p>}
          {task.priorityReason && <p style={{ fontSize: "12px", color: "#9b9b9b", margin: 0 }}>Prioritized because: {task.priorityReason}</p>}
          <button onClick={() => onDelete(task.id)} style={{ alignSelf: "flex-start", fontSize: "12px", color: "#d32f2f", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            Remove task
          </button>
        </div>
      )}
    </div>
  );
}
