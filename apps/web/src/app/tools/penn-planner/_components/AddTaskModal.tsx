"use client";

import { useState } from "react";

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (task: Record<string, string>) => void;
}

const TASK_TYPES = [
  { value: "assignment", label: "Assignment" },
  { value: "quiz", label: "Quiz" },
  { value: "exam", label: "Exam" },
  { value: "case_prep", label: "Case Prep" },
  { value: "interview", label: "Interview" },
  { value: "application", label: "Application" },
  { value: "networking", label: "Networking" },
  { value: "other", label: "Other" },
];

export function AddTaskModal({ onClose, onAdd }: AddTaskModalProps) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "assignment",
    dueDate: "",
    estimatedMinutes: "",
    course: "",
    company: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.dueDate) return;
    onAdd(form);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ background: "#fff", borderRadius: "10px", width: "100%", maxWidth: "440px" }}>
        <div
          style={{
            padding: "18px 22px 16px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#121212" }}>Add Task</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#9b9b9b" }}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Task title"
            style={{ width: "100%", border: "1px solid #d1d1d1", borderRadius: "5px", padding: "8px 11px" }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              style={{ width: "100%", border: "1px solid #d1d1d1", borderRadius: "5px", padding: "8px 11px" }}
            >
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              required
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              style={{ width: "100%", border: "1px solid #d1d1d1", borderRadius: "5px", padding: "8px 11px" }}
            />
          </div>

          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description"
            rows={2}
            style={{ width: "100%", border: "1px solid #d1d1d1", borderRadius: "5px", padding: "8px 11px", resize: "none" }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <input
              type="text"
              value={form.course}
              onChange={(e) => setForm({ ...form, course: e.target.value })}
              placeholder="Course"
              style={{ width: "100%", border: "1px solid #d1d1d1", borderRadius: "5px", padding: "8px 11px" }}
            />
            <input
              type="number"
              value={form.estimatedMinutes}
              onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
              placeholder="Est. minutes"
              min="5"
              style={{ width: "100%", border: "1px solid #d1d1d1", borderRadius: "5px", padding: "8px 11px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: "9px", border: "1px solid #d1d1d1", borderRadius: "5px", background: "#fff", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{ flex: 1, padding: "9px", border: "none", borderRadius: "5px", background: "#1a1a1a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
