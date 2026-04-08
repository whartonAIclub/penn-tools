"use client";

import { useEffect, useState } from "react";

const CATEGORIES = [
  { key: "academic", label: "Canvas priorities" },
  { key: "career", label: "CareerPath priorities" },
  { key: "calendar", label: "Calendar priorities" },
  { key: "other", label: "Manual priorities" },
];

const INTEGRATIONS = [
  { name: "Canvas", status: "Connected", color: "#1d4ed8" },
  { name: "CareerPath", status: "Connected", color: "#6d28d9" },
  { name: "Google Calendar", status: "Connected", color: "#047857" },
  { name: "iCalendar", status: "Connected", color: "#7c3aed" },
];

export default function PennPlannerSettingsPage() {
  const [order, setOrder] = useState<string[]>([
    "career",
    "academic",
    "calendar",
    "other",
  ]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("penn-priorities-order");
      if (stored) setOrder(JSON.parse(stored));
    } catch {
      // no-op
    }
  }, []);

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    setOrder(next);
    setSaved(false);
  }

  function moveDown(idx: number) {
    if (idx === order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
    setOrder(next);
    setSaved(false);
  }

  function handleSave() {
    localStorage.setItem("penn-priorities-order", JSON.stringify(order));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ padding: "24px", maxWidth: "720px" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700, color: "#011F5B" }}>
        Settings
      </h1>
      <p style={{ margin: "0 0 28px", fontSize: "13px", color: "#6b6b6b" }}>
        Configure source priority and connected integrations.
      </p>

      <section
        style={{
          background: "#fff",
          borderRadius: "10px",
          border: "1px solid #E5E5E5",
          overflow: "hidden",
          marginBottom: "20px",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F0F0" }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>
            Category Priority Order
          </h2>
        </div>
        <div style={{ padding: "8px 12px" }}>
          {order.map((key, idx) => {
            const cat = CATEGORIES.find((c) => c.key === key);
            if (!cat) return null;
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 8px",
                  borderRadius: "6px",
                  marginBottom: "4px",
                  background: "#FAFAFA",
                  border: "1px solid #F0F0F0",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: "#011F5B",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  {idx + 1}
                </div>
                <div style={{ flex: 1, fontSize: "14px", fontWeight: 600 }}>
                  {cat.label}
                </div>
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
                      cursor: "pointer",
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
                      cursor: "pointer",
                    }}
                  >
                    ↓
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #F0F0F0",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          {saved && (
            <span style={{ fontSize: "12px", color: "#2E7D32", fontWeight: 600 }}>
              Saved
            </span>
          )}
          <button
            onClick={handleSave}
            style={{
              fontSize: "13px",
              padding: "7px 20px",
              borderRadius: "6px",
              background: "#011F5B",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Save Order
          </button>
        </div>
      </section>

      <section
        style={{
          background: "#fff",
          borderRadius: "10px",
          border: "1px solid #E5E5E5",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F0F0" }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>
            Connected Integrations
          </h2>
        </div>
        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {INTEGRATIONS.map(({ name, status, color }) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #F7F7F7",
                paddingBottom: "8px",
              }}
            >
              <span style={{ fontSize: "13px", color: "#333", fontWeight: 500 }}>{name}</span>
              <span style={{ fontSize: "12px", color, fontWeight: 700 }}>{status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
