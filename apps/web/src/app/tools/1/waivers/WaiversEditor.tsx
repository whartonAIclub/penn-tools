"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWaivers } from "../waiversActions";
import type { WaiverEntry } from "../waiversPersistence";

interface CourseOption {
  courseId: string;
  title: string;
  department: string;
}

interface Row {
  id: number;
  courseId: string;
  search: string;
  type: "waived" | "substituted";
  open: boolean;
}

let nextId = 1;
function newRow(): Row {
  return { id: nextId++, courseId: "", search: "", type: "waived", open: false };
}

export function WaiversEditor({
  courses,
  initial,
}: {
  courses: CourseOption[];
  initial: WaiverEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((w) => {
          const match = courses.find((c) => c.courseId === w.courseId);
          return {
            id: nextId++,
            courseId: w.courseId,
            search: match ? `${w.courseId} – ${match.title}` : w.courseId,
            type: w.type,
            open: false,
          };
        })
      : [newRow()]
  );

  const update = (id: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const deleteRow = (id: number) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const handleSave = () => {
    const valid = rows.filter((r) => r.courseId !== "");
    startTransition(async () => {
      await saveWaivers(valid.map((r) => ({ courseId: r.courseId, type: r.type })));
      router.push("/tools/1/requirements");
    });
  };

  const getSuggestions = (row: Row) => {
    const q = row.search.trim().toLowerCase();
    if (q.length < 1) return courses.slice(0, 12);
    return courses
      .filter(
        (c) =>
          c.courseId.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.department.toLowerCase().includes(q)
      )
      .slice(0, 12);
  };

  return (
    <div>
      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 40px", gap: 0, background: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "10px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Course</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</div>
          <div />
        </div>

        {rows.map((row) => {
          const suggestions = getSuggestions(row);
          return (
            <div key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 40px", gap: 0, padding: "12px 20px", alignItems: "center" }}>
                {/* Course search */}
                <div style={{ position: "relative", marginRight: 12 }}>
                  <input
                    value={row.search}
                    placeholder="Search by code or name…"
                    onFocus={() => update(row.id, { open: true })}
                    onBlur={() => setTimeout(() => update(row.id, { open: false }), 150)}
                    onChange={(e) =>
                      update(row.id, { search: e.target.value, courseId: "", open: true })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1.5px solid #d1d5db",
                      borderRadius: 7,
                      fontSize: 13,
                      outline: "none",
                      boxSizing: "border-box",
                      background: row.courseId ? "#f0f4ff" : "#fff",
                    }}
                  />
                  {row.courseId && (
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "#011F5B", fontFamily: "ui-monospace, monospace" }}>
                      ✓
                    </span>
                  )}
                  {row.open && suggestions.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.10)", marginTop: 4, maxHeight: 220, overflowY: "auto",
                    }}>
                      {suggestions.map((c) => (
                        <button
                          key={c.courseId}
                          onMouseDown={() => {
                            update(row.id, {
                              courseId: c.courseId,
                              search: `${c.courseId} – ${c.title}`,
                              open: false,
                            });
                          }}
                          style={{
                            display: "flex", gap: 10, alignItems: "baseline",
                            width: "100%", padding: "9px 14px", background: "none",
                            border: "none", borderBottom: "1px solid #f9fafb",
                            cursor: "pointer", textAlign: "left", fontSize: 13,
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#f0f4ff")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
                        >
                          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#011F5B", flexShrink: 0, fontSize: 12 }}>{c.courseId}</span>
                          <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{c.department}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Type toggle */}
                <div style={{ display: "flex", gap: 6 }}>
                  {(["waived", "substituted"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => update(row.id, { type: t })}
                      style={{
                        padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${row.type === t ? (t === "waived" ? "#166534" : "#1d4ed8") : "#e5e7eb"}`,
                        background: row.type === t ? (t === "waived" ? "#dcfce7" : "#eff6ff") : "#fff",
                        color: row.type === t ? (t === "waived" ? "#166534" : "#1d4ed8") : "#9ca3af",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {t === "waived" ? "Waived" : "Substituted"}
                    </button>
                  ))}
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteRow(row.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 16, padding: "4px 8px" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#d1d5db")}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {/* Add row */}
        <div style={{ padding: "12px 20px" }}>
          <button
            onClick={addRow}
            style={{
              background: "none", border: "1.5px dashed #d1d5db", borderRadius: 7,
              padding: "8px 16px", fontSize: 13, color: "#6b7280", cursor: "pointer", width: "100%",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#011F5B"; (e.currentTarget as HTMLButtonElement).style.color = "#011F5B"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1d5db"; (e.currentTarget as HTMLButtonElement).style.color = "#6b7280"; }}
          >
            + Add another course
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 24, fontSize: 12, color: "#6b7280" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ padding: "2px 8px", borderRadius: 4, background: "#dcfce7", color: "#166534", fontWeight: 600, fontSize: 11 }}>Waived</span>
          The requirement is waived — you don't need to take this course.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ padding: "2px 8px", borderRadius: 4, background: "#eff6ff", color: "#1d4ed8", fontWeight: 600, fontSize: 11 }}>Substituted</span>
          You've received credit for this course via a different course.
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={() => router.push("/tools/1")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6b7280", textDecoration: "underline" }}
        >
          ← Back to transcript
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: "10px 28px", background: "#011F5B", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? "Saving…" : "Save & view requirements →"}
        </button>
      </div>
    </div>
  );
}
