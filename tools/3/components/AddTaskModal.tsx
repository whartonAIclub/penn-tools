"use client";

import { useState } from "react";

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (task: Record<string, string>) => void;
}

const TASK_TYPES = [
  { value: "assignment",  label: "Assignment" },
  { value: "quiz",        label: "Quiz" },
  { value: "exam",        label: "Exam" },
  { value: "case_prep",   label: "Case Prep" },
  { value: "interview",   label: "Interview" },
  { value: "application", label: "Application" },
  { value: "networking",  label: "Networking" },
  { value: "other",       label: "Other" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d1d1",
  borderRadius: "5px",
  padding: "8px 11px",
  fontSize: "13px",
  color: "#121212",
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 0.15s",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "#555",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: "5px",
};

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
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          width: "100%",
          maxWidth: "440px",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px 16px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#121212", letterSpacing: "-0.02em" }}>
            Add Task
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "20px",
              color: "#9b9b9b",
              lineHeight: 1,
              padding: "0 2px",
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>

          <div>
            <label style={labelStyle}>Task title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., MGMT 611 Case Write-up"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#4338ca")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d1d1")}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#4338ca")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d1d1")}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due date *</label>
              <input
                type="datetime-local"
                required
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#4338ca")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d1d1")}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional details…"
              rows={2}
              style={{ ...inputStyle, resize: "none" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#4338ca")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d1d1")}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Course</label>
              <input
                type="text"
                value={form.course}
                onChange={(e) => setForm({ ...form, course: e.target.value })}
                placeholder="e.g., MGMT 611"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#4338ca")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d1d1")}
              />
            </div>
            <div>
              <label style={labelStyle}>Est. minutes</label>
              <input
                type="number"
                value={form.estimatedMinutes}
                onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
                placeholder="e.g., 90"
                min="5"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#4338ca")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d1d1")}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", paddingTop: "4px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "9px",
                border: "1px solid #d1d1d1",
                borderRadius: "5px",
                background: "#fff",
                color: "#444",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: "9px",
                border: "none",
                borderRadius: "5px",
                background: "#1a1a1a",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.02em",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#333")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#1a1a1a")}
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
