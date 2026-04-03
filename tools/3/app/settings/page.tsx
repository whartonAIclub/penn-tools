"use client";

import { useEffect, useState } from "react";

const CATEGORIES = [
  { key: "career",   label: "Career",   icon: "🎯", desc: "CareerPath tasks — interviews, applications, networking" },
  { key: "academic", label: "Academic", icon: "📚", desc: "Canvas tasks — assignments, exams, quizzes" },
  { key: "other",    label: "Other",    icon: "📌", desc: "Manually added tasks and reminders" },
];

const COLOR_LEGEND = [
  { label: "Overdue",                  bg: "#FFF5F5", border: "#FFCDD2", dot: "#EF9A9A",  text: "#B71C1C" },
  { label: "Not Started",              bg: "#FAFAFA", border: "#E0E0E0", dot: "#BDBDBD",  text: "#555"    },
  { label: "In Progress (Due Today)",  bg: "#FFFDE7", border: "#FFF9C4", dot: "#FFE082",  text: "#E65100" },
  { label: "In Progress",              bg: "#F1FDF3", border: "#C8E6C9", dot: "#A5D6A7",  text: "#2E7D32" },
];

export default function Settings() {
  const [order, setOrder] = useState<string[]>(["career", "academic", "other"]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("penn-priorities-order");
      if (stored) setOrder(JSON.parse(stored));
    } catch {}
  }, []);

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setOrder(next);
    setSaved(false);
  }

  function moveDown(idx: number) {
    if (idx === order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setOrder(next);
    setSaved(false);
  }

  function handleSave() {
    localStorage.setItem("penn-priorities-order", JSON.stringify(order));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ padding: "24px", maxWidth: "640px" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700, color: "#011F5B", letterSpacing: "-0.02em" }}>
        Settings
      </h1>
      <p style={{ margin: "0 0 28px", fontSize: "13px", color: "#6b6b6b" }}>
        Customize how Penn-priorities sorts and displays your tasks.
      </p>

      {/* Priority Order */}
      <section style={{ background: "#fff", borderRadius: "10px", border: "1px solid #E5E5E5", overflow: "hidden", marginBottom: "20px" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F0F0" }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#121212" }}>Category Priority Order</h2>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#9b9b9b" }}>
            When tasks share the same due date, this order determines what appears first.
          </p>
        </div>
        <div style={{ padding: "8px 12px" }}>
          {order.map((key, idx) => {
            const cat = CATEGORIES.find((c) => c.key === key)!;
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 8px",
                  borderRadius: "6px",
                  marginBottom: "2px",
                  background: "#FAFAFA",
                  border: "1px solid #F0F0F0",
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: idx === 0 ? "#011F5B" : idx === 1 ? "#3B82F6" : "#E0E0E0",
                    color: idx === 2 ? "#555" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </div>

                {/* Icon + label */}
                <span style={{ fontSize: "18px" }}>{cat.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#121212" }}>{cat.label}</div>
                  <div style={{ fontSize: "12px", color: "#9b9b9b" }}>{cat.desc}</div>
                </div>

                {/* Move buttons */}
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    style={{
                      width: "28px",
                      height: "28px",
                      border: "1px solid #E0E0E0",
                      borderRadius: "4px",
                      background: "#fff",
                      cursor: idx === 0 ? "default" : "pointer",
                      color: idx === 0 ? "#D0D0D0" : "#555",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === order.length - 1}
                    style={{
                      width: "28px",
                      height: "28px",
                      border: "1px solid #E0E0E0",
                      borderRadius: "4px",
                      background: "#fff",
                      cursor: idx === order.length - 1 ? "default" : "pointer",
                      color: idx === order.length - 1 ? "#D0D0D0" : "#555",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ↓
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #F0F0F0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px" }}>
          {saved && <span style={{ fontSize: "12px", color: "#2E7D32", fontWeight: 600 }}>✓ Saved</span>}
          <button
            onClick={handleSave}
            style={{
              fontSize: "13px", padding: "7px 20px", borderRadius: "6px",
              background: "#011F5B", color: "#fff", border: "none",
              cursor: "pointer", fontWeight: 600,
            }}
          >
            Save Order
          </button>
        </div>
      </section>

      {/* Color Legend */}
      <section style={{ background: "#fff", borderRadius: "10px", border: "1px solid #E5E5E5", overflow: "hidden", marginBottom: "20px" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F0F0" }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#121212" }}>Task Color Legend</h2>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#9b9b9b" }}>
            Cards are colored automatically based on status and due date.
          </p>
        </div>
        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {COLOR_LEGEND.map(({ label, bg, border, dot, text }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                borderRadius: "6px",
                background: bg,
                border: `1px solid ${border}`,
                borderLeft: `3px solid ${dot}`,
              }}
            >
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: text }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Connected accounts placeholder */}
      <section style={{ background: "#fff", borderRadius: "10px", border: "1px solid #E5E5E5", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F0F0" }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#121212" }}>Connected Accounts</h2>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#9b9b9b" }}>
            Manage your Penn ID integrations.
          </p>
        </div>
        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { name: "Canvas (Penn LMS)",    status: "Connected",   color: "#1d4ed8" },
            { name: "CareerPath",           status: "Connected",   color: "#6d28d9" },
            { name: "Google Calendar",      status: "Coming soon", color: "#9b9b9b" },
            { name: "iCalendar",            status: "Coming soon", color: "#9b9b9b" },
          ].map(({ name, status, color }) => (
            <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F8F8F8" }}>
              <span style={{ fontSize: "13px", color: "#333", fontWeight: 500 }}>{name}</span>
              <span style={{ fontSize: "12px", color, fontWeight: 600 }}>{status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
