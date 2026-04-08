"use client";

import { useCallback, useEffect, useState } from "react";
import { AddTaskModal } from "../../_components/AddTaskModal";
import { TaskCard } from "../../_components/TaskCard";
import type { PrioritizedTask } from "@/lib/pennPlanner/types";

interface Nudge {
  type: string;
  message: string;
  taskIds: string[];
}

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

function sortTasks(tasks: PrioritizedTask[], userOrder: string[]): PrioritizedTask[] {
  return [...tasks].sort((a, b) => {
    const scoreDiff = b.priorityScore - a.priorityScore;
    if (scoreDiff !== 0) return scoreDiff;
    const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (dateDiff !== 0) return dateDiff;
    return categoryWeight(a.source, userOrder) - categoryWeight(b.source, userOrder);
  });
}

function groupTasks(tasks: PrioritizedTask[]) {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfDay2 = new Date(now);
  endOfDay2.setDate(now.getDate() + 2);
  endOfDay2.setHours(23, 59, 59, 999);

  const overdue: PrioritizedTask[] = [];
  const today: PrioritizedTask[] = [];
  const next2: PrioritizedTask[] = [];
  const upcoming: PrioritizedTask[] = [];

  for (const t of tasks) {
    if (t.status === "completed") continue;
    const due = new Date(t.dueDate);
    if (due < now) overdue.push(t);
    else if (due <= endOfToday) today.push(t);
    else if (due <= endOfDay2) next2.push(t);
    else upcoming.push(t);
  }

  return { overdue, today, next2, upcoming };
}

export default function PennPlannerDashboardPage() {
  const [tasks, setTasks] = useState<PrioritizedTask[]>([]);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  const [userOrder, setUserOrder] = useState<string[]>([
    "career",
    "academic",
    "calendar",
    "other",
  ]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tools/penn-planner/tasks");
    const data = await res.json();
    setTasks(Array.isArray(data) ? data : []);
  }, []);

  const fetchNudges = useCallback(async () => {
    const res = await fetch("/api/tools/penn-planner/nudges");
    const data = await res.json();
    setNudges(data.nudges ?? []);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchTasks();
      await fetchNudges();
      setLoading(false);
      try {
        const saved = localStorage.getItem("penn-priorities-order");
        if (saved) setUserOrder(JSON.parse(saved));
      } catch {
        // no-op
      }
    }
    init();
  }, [fetchTasks, fetchNudges]);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/tools/penn-planner/sync", { method: "POST" });
    await fetchTasks();
    await fetchNudges();
    setSyncing(false);
  }

  async function handleGetSummary() {
    setLoadingSummary(true);
    const res = await fetch("/api/tools/penn-planner/summary");
    const data = await res.json();
    setSummary(data.summary ?? "");
    setLoadingSummary(false);
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/tools/penn-planner/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchTasks();
    await fetchNudges();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tools/penn-planner/tasks/${id}`, { method: "DELETE" });
    await fetchTasks();
    await fetchNudges();
  }

  async function handleAdd(formData: Record<string, string>) {
    await fetch("/api/tools/penn-planner/tasks", {
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
  const visibleNudges = nudges.filter((n) => !dismissedNudges.has(n.message));

  return (
    <div style={{ padding: "24px", maxWidth: "860px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#011F5B" }}>My Priorities</h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b6b6b" }}>{new Date().toLocaleDateString()}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ fontSize: "13px", padding: "7px 14px", border: "1px solid #d1d1d1", borderRadius: "6px", background: "#fff", cursor: syncing ? "not-allowed" : "pointer", fontWeight: 500 }}
          >
            {syncing ? "Syncing..." : "Sync all sources"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{ fontSize: "13px", padding: "7px 16px", borderRadius: "6px", background: "#011F5B", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}
          >
            + Add Task
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Due Today", value: today.length },
          { label: "In Progress", value: tasks.filter((t) => t.status === "in_progress").length },
          { label: "Completed", value: completedCount },
          { label: "Overdue", value: overdue.length },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #eee", borderRadius: "8px", padding: "12px 20px", minWidth: "110px" }}>
            <div style={{ fontSize: "22px", fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "3px", fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      {visibleNudges.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
          {visibleNudges.map((nudge) => (
            <div key={nudge.message} style={{ background: "#FFFDE7", border: "1px solid #FFE082", borderRadius: "6px", padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <p style={{ fontSize: "13px", fontWeight: 500, color: "#1a1a1a", margin: 0 }}>{nudge.message}</p>
              <button
                onClick={() => setDismissedNudges((d) => new Set([...d, nudge.message]))}
                style={{ color: "#9b9b9b", background: "none", border: "none", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: "8px", padding: "16px 20px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#011F5B", textTransform: "uppercase", marginBottom: "6px" }}>AI Daily Briefing</p>
            <p style={{ fontSize: "14px", color: summary ? "#333" : "#9b9b9b", margin: 0 }}>
              {summary || 'Click "Get Briefing" for your AI-powered daily summary.'}
            </p>
          </div>
          <button
            onClick={handleGetSummary}
            disabled={loadingSummary}
            style={{ flexShrink: 0, fontSize: "12px", padding: "6px 14px", borderRadius: "4px", background: "#011F5B", color: "#fff", border: "none", cursor: loadingSummary ? "not-allowed" : "pointer", fontWeight: 600 }}
          >
            {loadingSummary ? "Thinking..." : "Get Briefing"}
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "#9b9b9b" }}>Loading your tasks...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {[
            { title: "Overdue", tasks: overdue },
            { title: "Due Today", tasks: today },
            { title: "Next 2 Days", tasks: next2 },
            { title: "Upcoming", tasks: upcoming },
          ].map((section) => (
            <div key={section.title}>
              <h2 style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {section.title} ({section.tasks.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {section.tasks.map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && <AddTaskModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />}
    </div>
  );
}
