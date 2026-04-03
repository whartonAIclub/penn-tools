"use client";

import { useState } from "react";
import { format } from "date-fns";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  source: string;
  type: string;
  dueDate: string;
  estimatedMinutes?: number | null;
  priority: number;
  priorityScore: number;
  status: string;
  course?: string | null;
  company?: string | null;
  urgencyLabel: string;
  recommendedWorkMinutes: number;
  priorityReason: string;
  daysUntilDue: number;
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}

const SOURCE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  canvas:     { bg: "#EFF6FF", color: "#1d4ed8", border: "#BFDBFE" },
  careerpath: { bg: "#F5F3FF", color: "#6d28d9", border: "#DDD6FE" },
  manual:     { bg: "#F5F5F5", color: "#555",    border: "#E0E0E0" },
};

const TYPE_ICONS: Record<string, string> = {
  exam:        "📝",
  interview:   "🎯",
  application: "📋",
  case_prep:   "💼",
  quiz:        "❓",
  assignment:  "📚",
  networking:  "🤝",
  other:       "📌",
};

// Pastel card styles based on status + urgency
function getCardStyle(status: string, daysUntilDue: number): React.CSSProperties {
  if (status === "completed") {
    return { background: "#F9F9F9", borderLeft: "3px solid #C8E6C9", border: "1px solid #E0E0E0" };
  }
  if (daysUntilDue < 0) {
    // Overdue — pastel red
    return { background: "#FFF5F5", borderLeft: "3px solid #FFAB91", border: "1px solid #FFCDD2" };
  }
  if (status === "in_progress" && daysUntilDue <= 0) {
    // In progress + due today — pastel yellow
    return { background: "#FFFDE7", borderLeft: "3px solid #FFE082", border: "1px solid #FFF9C4" };
  }
  if (status === "in_progress") {
    // In progress — pastel green
    return { background: "#F1FDF3", borderLeft: "3px solid #A5D6A7", border: "1px solid #C8E6C9" };
  }
  if (daysUntilDue === 0) {
    // Due today, not started — pastel yellow
    return { background: "#FFFDE7", borderLeft: "3px solid #FFE082", border: "1px solid #FFF9C4" };
  }
  // Not started — pastel grey
  return { background: "#FAFAFA", borderLeft: "3px solid #BDBDBD", border: "1px solid #E8E8E8" };
}

function getStatusBadge(status: string, daysUntilDue: number) {
  if (daysUntilDue < 0 && status !== "completed")
    return { label: "Overdue", bg: "#FFCDD2", color: "#B71C1C" };
  if (status === "in_progress" && daysUntilDue <= 0)
    return { label: "Due Today", bg: "#FFF9C4", color: "#F57F17" };
  if (status === "in_progress")
    return { label: "In Progress", bg: "#C8E6C9", color: "#1B5E20" };
  if (status === "completed")
    return { label: "Done", bg: "#C8E6C9", color: "#1B5E20" };
  if (daysUntilDue === 0)
    return { label: "Due Today", bg: "#FFF9C4", color: "#F57F17" };
  return { label: "Not Started", bg: "#E0E0E0", color: "#555" };
}

function urgencyColor(label: string) {
  if (label === "Overdue")         return "#C62828";
  if (label === "Due today")       return "#E65100";
  if (label === "Due tomorrow")    return "#B45309";
  if (label === "Due in 2–3 days") return "#7E5B00";
  return "#6b6b6b";
}

export function TaskCard({ task, onStatusChange, onDelete }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const isCompleted = task.status === "completed";
  const cardStyle   = getCardStyle(task.status, task.daysUntilDue);
  const badge       = getStatusBadge(task.status, task.daysUntilDue);
  const src         = SOURCE_STYLES[task.source] ?? SOURCE_STYLES.manual;

  async function handleStatusChange(newStatus: string) {
    setLoading(true);
    await onStatusChange(task.id, newStatus);
    setLoading(false);
  }

  return (
    <div
      style={{
        ...cardStyle,
        borderRadius: "8px",
        opacity: isCompleted ? 0.65 : 1,
        transition: "box-shadow 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.09)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)")}
    >
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>

          {/* Type icon */}
          <div style={{ fontSize: "20px", flexShrink: 0, marginTop: "1px" }}>
            {TYPE_ICONS[task.type] ?? "📌"}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title + status badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#121212",
                  textDecoration: isCompleted ? "line-through" : "none",
                  letterSpacing: "-0.01em",
                }}
              >
                {task.title}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 8px",
                  borderRadius: "20px",
                  background: badge.bg,
                  color: badge.color,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                }}
              >
                {badge.label}
              </span>
            </div>

            {/* Source + course/company */}
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
                  letterSpacing: "0.02em",
                }}
              >
                {task.source === "canvas" ? "Canvas" : task.source === "careerpath" ? "CareerPath" : "Manual"}
              </span>
              {task.course && (
                <span style={{ fontSize: "12px", color: "#6b6b6b" }}>{task.course}</span>
              )}
              {task.company && (
                <span style={{ fontSize: "12px", color: "#6b6b6b" }}>{task.company}</span>
              )}
            </div>

            {/* Due / time */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: urgencyColor(task.urgencyLabel) }}>
                {task.urgencyLabel}
              </span>
              <span style={{ color: "#d1d1d1", fontSize: "12px" }}>•</span>
              <span style={{ fontSize: "12px", color: "#6b6b6b" }}>
                {format(new Date(task.dueDate), "MMM d, h:mm a")}
              </span>
              <span style={{ color: "#d1d1d1", fontSize: "12px" }}>•</span>
              <span style={{ fontSize: "12px", color: "#4338ca", fontWeight: 500 }}>
                ~{task.recommendedWorkMinutes} min
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            {!isCompleted && (
              <>
                <button
                  onClick={() => handleStatusChange("in_progress")}
                  disabled={loading || task.status === "in_progress"}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    border: "1px solid",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    background: task.status === "in_progress" ? "#011F5B" : "#fff",
                    color: task.status === "in_progress" ? "#fff" : "#011F5B",
                    borderColor: task.status === "in_progress" ? "#011F5B" : "#BFDBFE",
                    transition: "all 0.15s",
                  }}
                >
                  {task.status === "in_progress" ? "In Progress" : "Start"}
                </button>
                <button
                  onClick={() => handleStatusChange("completed")}
                  disabled={loading}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    border: "1px solid #A5D6A7",
                    background: "#fff",
                    color: "#2E7D32",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    transition: "all 0.15s",
                  }}
                >
                  Done
                </button>
              </>
            )}
            {isCompleted && (
              <button
                onClick={() => handleStatusChange("pending")}
                disabled={loading}
                style={{
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "4px",
                  border: "1px solid #E0E0E0",
                  background: "#fff",
                  color: "#6b6b6b",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Undo
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#9b9b9b",
                fontSize: "12px",
                padding: "4px",
                lineHeight: 1,
              }}
            >
              {expanded ? "▲" : "▼"}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid rgba(0,0,0,0.06)",
            padding: "12px 16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {task.description && (
            <p style={{ fontSize: "13px", color: "#444", margin: 0, lineHeight: 1.6 }}>{task.description}</p>
          )}
          {task.priorityReason && (
            <p style={{ fontSize: "12px", color: "#9b9b9b", fontStyle: "italic", margin: 0 }}>
              Prioritized because: {task.priorityReason}
            </p>
          )}
          <button
            onClick={() => onDelete(task.id)}
            style={{
              alignSelf: "flex-start",
              fontSize: "12px",
              color: "#d32f2f",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontWeight: 500,
              marginTop: "4px",
            }}
          >
            Remove task
          </button>
        </div>
      )}
    </div>
  );
}
