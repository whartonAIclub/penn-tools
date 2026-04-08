"use client";

import { useEffect, useState, useCallback } from "react";
import { TaskCard } from "@/components/TaskCard";
import { AddTaskModal } from "@/components/AddTaskModal";

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

interface Nudge {
  type: string;
  message: string;
  taskIds: string[];
}

const INTEGRATIONS = ["Canvas", "CareerPath", "Google Calendar", "iCalendar"];

function categoryWeight(source: string, userOrder: string[]): number {
  const category =
    source === "canvas"
      ? "academic"
      : source === "careerpath"
        ? "career"
        : source === "google_calendar" || source === "icalendar"
          ? "calendar"
          : "other";
  const idx = userOrder.indexOf(category);
  return idx === -1 ? 99 : idx;
}

function sortTasks(tasks: Task[], userOrder: string[]): Task[] {
  return [...tasks].sort((a, b) => {
    const scoreDiff = b.priorityScore - a.priorityScore;
    if (scoreDiff !== 0) return scoreDiff;
    const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (dateDiff !== 0) return dateDiff;
    return categoryWeight(a.source, userOrder) - categoryWeight(b.source, userOrder);
  });
}

function groupTasks(tasks: Task[]) {
  const now = new Date();
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const endOfDay2  = new Date(now); endOfDay2.setDate(now.getDate() + 2); endOfDay2.setHours(23, 59, 59, 999);

  const overdue:  Task[] = [];
  const today:    Task[] = [];
  const next2:    Task[] = [];
  const upcoming: Task[] = [];

  for (const t of tasks) {
    if (t.status === "completed") continue;
    const due = new Date(t.dueDate);
    if (due < now)              overdue.push(t);
    else if (due <= endOfToday) today.push(t);
    else if (due <= endOfDay2)  next2.push(t);
    else                        upcoming.push(t);
  }

  return { overdue, today, next2, upcoming };
}

export default function Dashboard() {
  const [enteredApp, setEnteredApp] = useState(false);
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [nudges, setNudges]             = useState<Nudge[]>([]);
  const [summary, setSummary]           = useState<string>("");
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  const [userOrder, setUserOrder]       = useState<string[]>(["career", "academic", "calendar", "other"]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(Array.isArray(data) ? data : []);
  }, []);

  const fetchNudges = useCallback(async () => {
    const res = await fetch("/api/nudges");
    const data = await res.json();
    setNudges(data.nudges ?? []);
  }, []);

  useEffect(() => {
    const alreadyEntered = localStorage.getItem("penn-priorities-entered");
    if (alreadyEntered === "1") setEnteredApp(true);
  }, []);

  useEffect(() => {
    if (!enteredApp) return;
    async function init() {
      setLoading(true);
      await fetchTasks();
      await fetchNudges();
      setLoading(false);
      try {
        const saved = localStorage.getItem("penn-priorities-order");
        if (saved) setUserOrder(JSON.parse(saved));
      } catch {}
    }
    init();
  }, [enteredApp, fetchTasks, fetchNudges]);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/sync", { method: "POST" });
    await fetchTasks();
    await fetchNudges();
    setSyncing(false);
  }

  async function handleGetSummary() {
    setLoadingSummary(true);
    const res = await fetch("/api/summary");
    const data = await res.json();
    setSummary(data.summary ?? "");
    setLoadingSummary(false);
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchTasks();
    await fetchNudges();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await fetchTasks();
    await fetchNudges();
  }

  async function handleAdd(formData: Record<string, string>) {
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    await fetchTasks();
    await fetchNudges();
  }

  const sorted = sortTasks(tasks, userOrder);
  const { overdue, today, next2, upcoming } = groupTasks(sorted);
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const visibleNudges  = nudges.filter((n) => !dismissedNudges.has(n.message));

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  function enterApp() {
    localStorage.setItem("penn-priorities-entered", "1");
    setEnteredApp(true);
  }

  if (!enteredApp) {
    return (
      <div style={{ padding: "36px 28px", maxWidth: "980px" }}>
        <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5", marginBottom: "10px" }}>
          Team 3 Tool
        </p>
        <h1 style={{ margin: 0, fontSize: "38px", lineHeight: 1.15, letterSpacing: "-0.03em", color: "#0f172a" }}>
          Penn-priorities
        </h1>
        <p style={{ marginTop: "14px", maxWidth: "760px", fontSize: "16px", color: "#475569", lineHeight: 1.65 }}>
          Merge tasks from Canvas, CareerPath, Google Calendar, and iCalendar into one ranked
          priority list so you always know what to do next.
        </p>

        <div style={{ display: "flex", gap: "10px", marginTop: "22px", flexWrap: "wrap" }}>
          {INTEGRATIONS.map((name) => (
            <span
              key={name}
              style={{
                border: "1px solid #dbe4ff",
                background: "#eef2ff",
                color: "#3730a3",
                borderRadius: "999px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              {name}
            </span>
          ))}
        </div>

        <div style={{ marginTop: "24px", display: "flex", gap: "10px" }}>
          <button
            onClick={enterApp}
            style={{
              background: "#011F5B",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Enter App
          </button>
          <button
            onClick={() => (window.location.href = "/settings")}
            style={{
              background: "#fff",
              color: "#0f172a",
              border: "1px solid #d9dfea",
              borderRadius: "8px",
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            View Integrations
          </button>
        </div>
      </div>
    );
  }

  function Section({ title, tasks, color, dot }: { title: string; tasks: Task[]; color: string; dot: string }) {
    if (tasks.length === 0) return null;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }} />
          <h2 style={{ margin: 0, fontSize: "12px", fontWeight: 700, color, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {title}
          </h2>
          <span style={{ fontSize: "12px", color: "#9b9b9b", fontWeight: 500 }}>({tasks.length})</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onDelete={handleDelete} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "860px" }}>

      {/* Page header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#011F5B", letterSpacing: "-0.02em" }}>
            My Priorities
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b6b6b" }}>{todayLabel}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              fontSize: "13px", padding: "7px 14px", border: "1px solid #d1d1d1",
              borderRadius: "6px", background: "#fff", color: "#333",
              cursor: syncing ? "not-allowed" : "pointer", fontWeight: 500,
              transition: "background 0.15s",
            }}
          >
            {syncing ? "Syncing…" : "⟳ Sync All"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              fontSize: "13px", padding: "7px 16px", borderRadius: "6px",
              background: "#011F5B", color: "#fff", border: "none",
              cursor: "pointer", fontWeight: 600, transition: "background 0.15s",
            }}
          >
            + Add Task
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Due Today",   value: today.length,                                         color: "#FFFDE7", text: "#E65100" },
          { label: "In Progress", value: tasks.filter(t => t.status === "in_progress").length, color: "#F1FDF3", text: "#2E7D32" },
          { label: "Completed",   value: completedCount,                                        color: "#F5F5F5", text: "#555"    },
          { label: "Overdue",     value: overdue.length,                                        color: "#FFF5F5", text: "#B71C1C" },
        ].map(({ label, value, color, text }) => (
          <div
            key={label}
            style={{
              background: color,
              borderRadius: "8px",
              padding: "12px 20px",
              minWidth: "110px",
            }}
          >
            <div style={{ fontSize: "22px", fontWeight: 700, color: text, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: "11px", color: text, opacity: 0.8, marginTop: "3px", fontWeight: 600, letterSpacing: "0.03em" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Nudges */}
      {visibleNudges.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
          {visibleNudges.map((nudge) => (
            <div
              key={nudge.message}
              style={{
                background: nudge.type === "deadline_stack" ? "#FFFDE7" : "#FFF5F5",
                border: `1px solid ${nudge.type === "deadline_stack" ? "#FFE082" : "#FFCDD2"}`,
                borderLeft: `3px solid ${nudge.type === "deadline_stack" ? "#FFC107" : "#EF9A9A"}`,
                borderRadius: "6px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <p style={{ fontSize: "13px", fontWeight: 500, color: "#1a1a1a", margin: 0, lineHeight: 1.5 }}>
                {nudge.message}
              </p>
              <button
                onClick={() => setDismissedNudges((d) => new Set([...d, nudge.message]))}
                style={{ color: "#9b9b9b", background: "none", border: "none", cursor: "pointer", fontSize: "18px", lineHeight: 1, flexShrink: 0, padding: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* AI Briefing */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e5e5",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#011F5B", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
              AI Daily Briefing
            </p>
            {summary ? (
              <p style={{ fontSize: "14px", color: "#333", lineHeight: 1.6, margin: 0 }}>{summary}</p>
            ) : (
              <p style={{ fontSize: "14px", color: "#9b9b9b", fontStyle: "italic", margin: 0 }}>
                Click &ldquo;Get Briefing&rdquo; for your AI-powered daily summary.
              </p>
            )}
          </div>
          <button
            onClick={handleGetSummary}
            disabled={loadingSummary}
            style={{
              flexShrink: 0, fontSize: "12px", padding: "6px 14px", borderRadius: "4px",
              background: loadingSummary ? "#E0E0E0" : "#011F5B",
              color: loadingSummary ? "#777" : "#fff",
              border: "none", cursor: loadingSummary ? "not-allowed" : "pointer",
              fontWeight: 600, letterSpacing: "0.02em", transition: "background 0.15s",
            }}
          >
            {loadingSummary ? "Thinking…" : "Get Briefing"}
          </button>
        </div>
      </div>

      {/* Task sections */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: "#9b9b9b" }}>
          <div style={{ fontSize: "28px", marginBottom: "12px" }}>⏳</div>
          <p style={{ fontSize: "14px" }}>Loading your tasks…</p>
        </div>
      ) : tasks.filter(t => t.status !== "completed").length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: "#9b9b9b" }}>
          <div style={{ fontSize: "28px", marginBottom: "12px" }}>{tasks.length === 0 ? "📥" : "✅"}</div>
          <p style={{ fontSize: "15px", fontWeight: 500, color: "#555" }}>
            {tasks.length === 0 ? "No tasks yet — sync Canvas, CareerPath, and Calendar to get started" : "All caught up! No pending tasks."}
          </p>
          {tasks.length === 0 && (
            <button
              onClick={handleSync}
              style={{
                marginTop: "16px", fontSize: "13px", padding: "8px 20px",
                borderRadius: "6px", background: "#011F5B", color: "#fff",
                border: "none", cursor: "pointer", fontWeight: 600,
              }}
            >
              Sync Now
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <Section title="Overdue"        tasks={overdue}  color="#B71C1C" dot="#EF9A9A" />
          <Section title="Due Today"      tasks={today}    color="#E65100" dot="#FFE082" />
          <Section title="Next 2 Days"    tasks={next2}    color="#7E5B00" dot="#FFC107" />
          <Section title="Upcoming"       tasks={upcoming} color="#555"    dot="#BDBDBD" />
        </div>
      )}
    </div>
  );
}
