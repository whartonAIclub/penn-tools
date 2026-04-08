"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  buildCourseCatalog, findViableSchedules, explainFailure,
  GRID_START_HOUR, GRID_END_HOUR, SLOT_MINUTES, SLOTS_PER_DAY,
} from "@penntools/tool-1/track3";
import type { CourseGroup, ShortlistItem, ScheduleSolution, Section, Priority } from "@penntools/tool-1/track3";
import type { BidGuidance } from "@penntools/tool-1/track4";
import rawSections from "../../../../../../tools/1/course-match-static/_sections_raw.json";

// ── Design tokens (match Evens' styles.css) ─────────────────────────

const C = {
  navy900: "#0a1f44",
  navy700: "#143a77",
  navy100: "#e9f0ff",
  white:   "#ffffff",
  gray100: "#f4f6fb",
  gray300: "#d2d9ea",
  text:    "#1c2640",
  sub:     "#4a5d86",
  muted:   "#5e6d90",
};

// Matches cal-hue-light-0 … 5 from styles.css
const HUE: Array<{ bg: string; border: string }> = [
  { bg: "#cfe5ff", border: "#7eb8f2" },
  { bg: "#c5f0e8", border: "#6ec9b8" },
  { bg: "#f3d4f8", border: "#c995d6" },
  { bg: "#ffecc2", border: "#e8b565" },
  { bg: "#d9e6ff", border: "#8aaeea" },
  { bg: "#e8dff5", border: "#b39fd9" },
];

function hue(idx: number) { return HUE[idx % HUE.length] ?? HUE[0]!; }

// ── Track-4 bid-guidance lookup ──────────────────────────────────────
// Track3 courseId: "ACCT 6110" → Track4 courseId: "ACCT6110"
// Track3 sectionId: "ACCT 6110-001" → section: "001"

function normId(id: string)   { return id.replace(/\s+/g, ""); }
function secNum(sid: string)  { return sid.split("-").pop() ?? ""; }

function lookupGuidance(sec: Section, guidance: BidGuidance[]): BidGuidance | undefined {
  const cid = normId(sec.courseId);
  const num = secNum(sec.sectionId);
  return guidance.find(g => g.courseId === cid && g.section === num);
}

// ── Color map ────────────────────────────────────────────────────────

function buildColorMap(sections: Section[]): Record<string, number> {
  const map: Record<string, number> = {};
  let n = 0;
  for (const s of sections) if (!(s.sectionId in map)) map[s.sectionId] = n++ % HUE.length;
  return map;
}

// ── Weekly planner grid ──────────────────────────────────────────────

const CAL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function WeeklyGrid({ sections, colorMap, modal = false }: {
  sections: Section[]; colorMap: Record<string, number>; modal?: boolean;
}) {
  type Block = { courseId: string; hue: number; startSlot: number; endSlot: number; sectionId: string };
  const cover: Array<Array<Block | null>> =
    Array.from({ length: SLOTS_PER_DAY }, () => Array(5).fill(null) as Array<Block | null>);

  for (const sec of sections) {
    const h = colorMap[sec.sectionId] ?? 0;
    for (const m of sec.meetings) {
      if (m.day < 0 || m.day > 4) continue;
      const s0 = Math.max(0, Math.floor((m.start - GRID_START_HOUR * 60) / SLOT_MINUTES));
      const s1 = Math.min(SLOTS_PER_DAY - 1, Math.ceil((m.end - GRID_START_HOUR * 60) / SLOT_MINUTES) - 1);
      for (let s = s0; s <= s1; s++) (cover[s] as Array<Block | null>)[m.day] = { courseId: sec.courseId, hue: h, startSlot: s0, endSlot: s1, sectionId: sec.sectionId };
    }
  }

  const slotH = modal ? "minmax(20px,1fr)" : "minmax(18px,1fr)";
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "72px repeat(5, minmax(0,1fr))",
    gridTemplateRows: `auto repeat(${SLOTS_PER_DAY}, ${slotH})`,
    minWidth: 520,
    minHeight: modal ? "min(85vh,900px)" : 520,
  };

  function timeLabel(s: number) {
    const mins = GRID_START_HOUR * 60 + s * SLOT_MINUTES;
    const hh = Math.floor(mins / 60), mm = mins % 60;
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${mm < 10 ? "0" : ""}${mm}${hh < 12 ? "am" : "pm"}`;
  }

  return (
    <div style={{ border: `1px solid ${C.gray300}`, borderRadius: 10, overflow: "auto", background: C.white }}>
      <div style={gridStyle}>
        {/* Header row */}
        <div style={{ gridColumn:1, gridRow:1, fontSize:11, fontWeight:700, color:C.muted,
          padding:"8px 6px", borderBottom:`1px solid ${C.gray300}`, borderRight:`1px solid ${C.gray300}`,
          background:C.gray100, display:"flex", alignItems:"center", justifyContent:"center" }}>
          Time
        </div>
        {CAL_DAYS.map((d, i) => (
          <div key={d} style={{ gridColumn:i+2, gridRow:1, fontSize:13, fontWeight:700, color:C.navy900,
            textAlign:"center", padding:"10px 8px", borderBottom:`1px solid ${C.gray300}`,
            borderRight:`1px solid ${C.gray300}`, background:C.gray100 }}>
            {d}
          </div>
        ))}

        {/* Time rows */}
        {Array.from({ length: SLOTS_PER_DAY }, (_, s) => (
          [
            <div key={`t${s}`} style={{ gridColumn:1, gridRow:s+2, fontSize:11, color:C.muted,
              padding:"2px 6px", borderRight:`1px solid ${C.gray300}`, borderBottom:"1px solid #e8ecf5",
              display:"flex", alignItems:"flex-start", justifyContent:"flex-end", background:"#fafbfd" }}>
              {s % 2 === 0 ? timeLabel(s) : ""}
            </div>,
            ...Array.from({ length: 5 }, (_, d) => {
              const b = (cover[s] as Array<Block | null>)[d];
              if (!b) return (
                <div key={`e${s}-${d}`} style={{ gridColumn:d+2, gridRow:s+2,
                  borderRight:"1px solid #e8ecf5", borderBottom:"1px solid #e8ecf5",
                  background:C.white, minHeight:18 }} />
              );
              if (b.startSlot !== s) return null;
              const span = b.endSlot - b.startSlot + 1;
              const col  = hue(b.hue);
              return (
                <div key={`bl${s}-${d}`} style={{ gridColumn:d+2, gridRow:`${s+2} / span ${span}`,
                  background:col.bg, border:`1px solid ${col.border}`, borderRadius:6, margin:1,
                  padding:"4px 6px", boxSizing:"border-box", overflow:"hidden", zIndex:1,
                  display:"flex", alignItems:"flex-start", justifyContent:"center" }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.navy900, lineHeight:1.2,
                    textAlign:"center", wordBreak:"break-word" }}>
                    {b.courseId}
                  </span>
                </div>
              );
            }),
          ]
        ))}
      </div>
    </div>
  );
}

// ── Availability grid (horizontal time, vertical days) ───────────────

function AvailabilityGrid({ blocked, setBlocked }: {
  blocked: Set<string>;
  setBlocked: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const dragging = useRef(false);
  const painting = useRef(true);

  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  function toggle(d: number, slot: number, forceBlock?: boolean) {
    const key = `${d}-${slot}`;
    setBlocked(prev => {
      const next = new Set(prev);
      const block = forceBlock !== undefined ? forceBlock : !next.has(key);
      block ? next.add(key) : next.delete(key);
      return next;
    });
  }

  const labels = Array.from({ length: SLOTS_PER_DAY }, (_, s) => {
    const mins = GRID_START_HOUR * 60 + s * SLOT_MINUTES;
    const hh = Math.floor(mins / 60), mm = mins % 60;
    return `${hh}:${mm < 10 ? "0" : ""}${mm}`;
  });

  const cols = `52px repeat(${SLOTS_PER_DAY}, minmax(28px,1fr))`;

  return (
    <div style={{ overflowX: "auto" }}>
      {/* Time ruler */}
      <div style={{ display:"grid", gridTemplateColumns:cols, minWidth:780, marginBottom:4 }}>
        <div style={{ width:52 }} />
        {labels.map((lab, i) => (
          <span key={i} style={{ fontSize:9, color:C.muted, textAlign:"center", overflow:"hidden" }}>
            {i % 2 === 0 ? lab : ""}
          </span>
        ))}
      </div>
      {/* Day rows */}
      {CAL_DAYS.map((day, dIdx) => (
        <div key={day} style={{ display:"grid", gridTemplateColumns:cols, minWidth:780,
          borderBottom:`1px solid ${C.gray300}` }}>
          <div style={{ width:52, padding:"6px 4px", fontSize:12, fontWeight:600,
            color:C.navy900, background:C.gray100, display:"flex", alignItems:"center" }}>
            {day}
          </div>
          {labels.map((_, slot) => {
            const key = `${dIdx}-${slot}`;
            const on = blocked.has(key);
            return (
              <div key={slot} style={{ minHeight:28, borderRight:"1px solid #e8ecf5",
                borderTop:"1px solid #e8ecf5", cursor:"cell",
                background: on ? "#c5d4ef" : C.white }}
                onMouseDown={() => { dragging.current=true; painting.current=!on; toggle(dIdx,slot,painting.current); }}
                onMouseEnter={() => { if (dragging.current) toggle(dIdx,slot,painting.current); }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Course legend row ────────────────────────────────────────────────

function LegendRow({ sec, colorMap, guidance }: {
  sec: Section; colorMap: Record<string, number>; guidance: BidGuidance[];
}) {
  const h = colorMap[sec.sectionId] ?? 0;
  const col = hue(h);
  const g = lookupGuidance(sec, guidance);
  const meta = `${sec.courseId} · ${sec.sectionId} · ${sec.instructor} · ${sec.days} ${sec.time} · ${sec.quarter} · ${sec.cu} CU`;

  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"8px 0",
      borderBottom:`1px solid ${C.gray100}` }}>
      <span style={{ width:20, height:20, borderRadius:6, flexShrink:0, marginTop:3,
        background:col.bg, border:`1px solid ${col.border}`, display:"inline-block" }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:14, color:C.navy900, lineHeight:1.35 }}>{sec.courseTitle}</div>
        <div style={{ fontSize:12, color:C.sub, marginTop:4, lineHeight:1.4 }}>{meta}</div>
        {g ? (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
            <span style={{ fontSize:11, background:"#d4edda", color:"#155724", padding:"2px 8px", borderRadius:999 }}>
              Safe ≥{g.thresholds.safe} pts
            </span>
            <span style={{ fontSize:11, background:C.navy100, color:C.navy700, padding:"2px 8px", borderRadius:999 }}>
              Competitive ≥{g.thresholds.competitive} pts
            </span>
            <span style={{ fontSize:11, background:"#fff3cd", color:"#856404", padding:"2px 8px", borderRadius:999 }}>
              Reach ≥{g.thresholds.reach} pts
            </span>
            <span style={{ fontSize:11, color:C.muted }}>
              {g.trend} · {g.volatility} volatility
            </span>
          </div>
        ) : (
          <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>No bid history available</div>
        )}
      </div>
    </div>
  );
}

// ── Schedule option card ─────────────────────────────────────────────

function ScheduleCard({ sol, idx, colorMap, guidance }: {
  sol: ScheduleSolution; idx: number;
  colorMap: Record<string, number>; guidance: BidGuidance[];
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <div style={{ width:"100%", marginBottom:28 }}>
      {/* Card head */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        gap:12, marginBottom:12, flexWrap:"wrap" }}>
        <h4 style={{ margin:0, fontSize:16, color:C.navy900 }}>Option {idx + 1}</h4>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <span style={{ fontSize:13, color:C.muted }}>
            {sol.totalCu.toFixed(1)} CU total
          </span>
          <button onClick={() => setExpanded(true)}
            style={{ border:`1px solid ${C.navy700}`, background:C.white, color:C.navy700,
              borderRadius:8, padding:"10px 16px", fontSize:14, cursor:"pointer" }}>
            Expand
          </button>
        </div>
      </div>

      {/* Legend + grid */}
      <div style={{ marginBottom:8 }}>
        <div style={{ marginBottom:14, padding:"12px 14px", background:C.white,
          border:`1px solid ${C.gray300}`, borderRadius:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.navy700,
            textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:10 }}>
            Courses in this schedule
          </div>
          {sol.sections.map(sec => (
            <LegendRow key={sec.sectionId} sec={sec} colorMap={colorMap} guidance={guidance} />
          ))}
        </div>
        <WeeklyGrid sections={sol.sections} colorMap={colorMap} />
      </div>

      {/* Expanded modal */}
      {expanded && (
        <div style={{ position:"fixed", inset:0, zIndex:10000,
          background:"rgba(10,31,68,0.55)", display:"flex", alignItems:"flex-start",
          justifyContent:"center", padding:"24px 16px", overflowY:"auto", boxSizing:"border-box" }}
          onClick={() => setExpanded(false)}>
          <div style={{ width:"100%", maxWidth:1320, background:C.white, borderRadius:12,
            boxShadow:"0 16px 48px rgba(0,0,0,0.2)", paddingBottom:20, marginBottom:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
              gap:16, padding:"16px 20px", borderBottom:`1px solid ${C.gray300}`,
              position:"sticky", top:0, background:C.white, zIndex:2, borderRadius:"12px 12px 0 0" }}>
              <h3 style={{ margin:0, fontSize:18, color:C.navy900 }}>Option {idx + 1}</h3>
              <button onClick={() => setExpanded(false)}
                style={{ border:`1px solid ${C.navy700}`, background:C.white, color:C.navy700,
                  borderRadius:8, padding:"10px 16px", fontSize:14, cursor:"pointer" }}>
                Close
              </button>
            </div>
            <div style={{ padding:"16px 20px 0" }}>
              <WeeklyGrid sections={sol.sections} colorMap={colorMap} modal />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Wizard nav ───────────────────────────────────────────────────────

function WizardNav({ step }: { step: number }) {
  const s: React.CSSProperties = { fontSize:13, fontWeight:600, color:C.muted };
  const a: React.CSSProperties = { ...s, color:C.navy900 };
  const arr: React.CSSProperties = { color:C.gray300, fontSize:12 };
  return (
    <nav style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:16,
      padding:"12px 16px", background:C.white, border:`1px solid ${C.gray300}`, borderRadius:12 }}>
      <span style={step===1?a:s}>1. Courses</span>
      <span style={arr}>→</span>
      <span style={step===2?a:s}>2. Availability</span>
      <span style={arr}>→</span>
      <span style={step===3?a:s}>3. Results</span>
    </nav>
  );
}

// ── Build catalog once ───────────────────────────────────────────────

const CATALOG = buildCourseCatalog(rawSections as Parameters<typeof buildCourseCatalog>[0]);
const DEPARTMENTS = [...new Set(CATALOG.flatMap(g => g.departments))].sort();

// ── Main component ───────────────────────────────────────────────────

interface Props { guidance: BidGuidance[] }

export function SchedulerSection({ guidance }: Props) {
  const [step, setStep]             = useState(1);
  const [query, setQuery]           = useState("");
  const [activeDept, setActiveDept] = useState("ALL");
  const [shortlist, setShortlist]   = useState<ShortlistItem[]>([]);
  const [blocked, setBlocked]       = useState<Set<string>>(new Set());
  const [targetCu, setTargetCu]     = useState(5);
  const [dragId, setDragId]         = useState<string | null>(null);

  const shortlistedKeys = useMemo(
    () => new Set(shortlist.map(s => s.courseGroup.groupKey)),
    [shortlist],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(g => {
      const deptOk = activeDept === "ALL" || g.departments.includes(activeDept);
      const textOk = !q || g.displayCourseIds.toLowerCase().includes(q) || g.title.toLowerCase().includes(q);
      return deptOk && textOk;
    });
  }, [query, activeDept]);

  const schedules = useMemo(() => {
    if (step < 3) return [];
    return findViableSchedules(shortlist, blocked, targetCu, 3);
  }, [step, shortlist, blocked, targetCu]);

  const failureMsg = useMemo(() => {
    if (step < 3 || schedules.length > 0) return "";
    return explainFailure(shortlist, blocked);
  }, [step, schedules, shortlist, blocked]);

  function addCourse(g: CourseGroup) {
    if (shortlistedKeys.has(g.groupKey)) return;
    setShortlist(prev => [...prev, {
      courseGroup: g, priority: "medium",
      clientId: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }]);
  }

  function removeCourse(clientId: string) {
    setShortlist(prev => prev.filter(x => x.clientId !== clientId));
  }

  function setPriority(clientId: string, p: Priority) {
    setShortlist(prev => prev.map(x => x.clientId === clientId ? { ...x, priority: p } : x));
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setShortlist(prev => {
      const copy = [...prev];
      const from = copy.findIndex(x => x.clientId === dragId);
      const to   = copy.findIndex(x => x.clientId === targetId);
      if (from < 0 || to < 0) return prev;
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item!);
      return copy;
    });
    setDragId(null);
  }

  const btnPrimary: React.CSSProperties = {
    background: C.navy700, color: C.white, border: `1px solid ${C.navy700}`,
    borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer",
  };
  const btnSecondary: React.CSSProperties = {
    background: C.white, color: C.navy700, border: `1px solid ${C.navy700}`,
    borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer",
  };

  // ── Step 1: Course selection ────────────────────────────────────

  if (step === 1) return (
    <div style={{ maxWidth:1400, margin:"0 auto", padding:16, fontFamily:"Inter, Segoe UI, Arial, sans-serif", color:C.text }}>
      <WizardNav step={1} />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16, alignItems:"start" }}>

        {/* Left: catalog */}
        <div style={{ background:C.white, border:`1px solid ${C.gray300}`, borderRadius:12, padding:16 }}>
          <header style={{ marginBottom:14 }}>
            <h1 style={{ margin:0, color:C.navy900, fontSize:22 }}>CourseMatch Assist</h1>
            <p style={{ margin:"6px 0 0", color:C.sub, fontSize:14 }}>Plan your schedule, shortlist courses, and bid smarter.</p>
          </header>

          <div style={{ display:"grid", gap:10, marginBottom:14 }}>
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search course name or ID..."
              style={{ width:"100%", padding:"10px 12px", border:`1px solid ${C.gray300}`,
                borderRadius:8, fontSize:14, boxSizing:"border-box" }} />
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:12, fontWeight:600, color:C.navy700 }}>Target CU:</span>
              <input type="number" value={targetCu} step={0.5} min={0.5} max={5.5}
                onChange={e => setTargetCu(parseFloat(e.target.value) || 0)}
                style={{ width:64, padding:"8px", border:`1px solid ${C.gray300}`,
                  borderRadius:8, fontSize:14 }} />
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:C.navy700, marginBottom:6 }}>Department</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {["ALL", ...DEPARTMENTS].map(d => (
                  <button key={d} onClick={() => setActiveDept(d)}
                    style={{ border:`1px solid ${C.navy700}`, borderRadius:999, padding:"6px 11px",
                      fontSize:12, cursor:"pointer",
                      background: activeDept===d ? C.navy700 : C.white,
                      color:      activeDept===d ? C.white   : C.navy700 }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p style={{ fontSize:13, color:C.muted, marginBottom:10 }}>
            High = must be on your final schedule. Medium = add if time permits. Low = only if it helps hit CU. Drag in shortlist to break ties.
          </p>

          <div style={{ display:"grid", gap:10, maxHeight:"70vh", overflowY:"auto", paddingRight:4 }}>
            {visible.map(g => {
              const inList = shortlistedKeys.has(g.groupKey);
              const quarters = [...new Set(g.sections.map(s => s.quarter))].sort().join(", ");
              const times = [...new Set(g.sections.map(s => `${s.days} ${s.time} · ${s.quarter}`))].slice(0, 3);
              const instrs = [...new Set(g.sections.map(s => s.instructor))].slice(0, 2).join(", ");
              return (
                <article key={g.groupKey} onClick={() => addCourse(g)}
                  style={{ border:`1px solid ${inList ? C.navy700 : C.gray300}`, borderRadius:10,
                    padding:10, background: inList ? C.navy100 : C.white, cursor:"pointer" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8 }}>
                    <p style={{ margin:0, color:C.navy900, fontWeight:700, fontSize:14 }}>{g.displayCourseIds}</p>
                    <p style={{ margin:0, fontSize:12, color:"#345" }}>{g.cu} CU · {quarters}</p>
                  </div>
                  <p style={{ margin:"6px 0 0", fontSize:14 }}>{g.title}</p>
                  <p style={{ margin:"4px 0 0", fontSize:12, color:C.sub }}>
                    {times.join(" · ")}{g.sections.length > 3 ? ` (+${g.sections.length - 3} more)` : ""}
                  </p>
                  <p style={{ margin:"2px 0 0", fontSize:12, color:C.sub }}>Instructors: {instrs}</p>
                </article>
              );
            })}
          </div>
        </div>

        {/* Right: shortlist */}
        <div style={{ background:C.white, border:`1px solid ${C.gray300}`, borderRadius:12,
          padding:16, position:"sticky", top:16, height:"fit-content" }}>
          <h2 style={{ margin:"0 0 10px", color:C.navy900, fontSize:18 }}>Shortlist ({shortlist.length})</h2>
          {shortlist.length === 0
            ? <p style={{ color:C.muted, fontSize:14 }}>Click a course to add.</p>
            : shortlist.map(item => (
              <div key={item.clientId} draggable
                onDragStart={() => setDragId(item.clientId)}
                onDragEnd={() => setDragId(null)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); onDrop(item.clientId); }}
                style={{ border:`1px solid ${C.gray300}`, borderRadius:8, padding:9,
                  marginBottom:8, background:C.white, cursor:"grab" }}>
                <p style={{ margin:0, fontSize:13 }}><strong>{item.courseGroup.displayCourseIds}</strong></p>
                <p style={{ margin:0, fontSize:13, color:C.muted }}>{item.courseGroup.title}</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, margin:"8px 0 6px" }}>
                  {(["high","medium","low"] as Priority[]).map(p => (
                    <button key={p} onClick={() => setPriority(item.clientId, p)}
                      style={{ border:`1px solid ${C.navy700}`, borderRadius:999, padding:"6px 11px",
                        fontSize:12, cursor:"pointer",
                        background: item.priority===p ? C.navy700 : C.white,
                        color:      item.priority===p ? C.white   : C.navy700 }}>
                      {p}
                    </button>
                  ))}
                </div>
                <button onClick={() => removeCourse(item.clientId)}
                  style={{ marginTop:4, background:"#ffe9e9", border:"1px solid #d99",
                    color:"#a20000", borderRadius:6, padding:"5px 8px", fontSize:12, cursor:"pointer" }}>
                  Remove
                </button>
              </div>
            ))
          }
          <div style={{ marginTop:16, paddingTop:12, borderTop:`1px solid ${C.gray300}` }}>
            <button style={btnPrimary} onClick={() => setStep(2)}>Next → Availability</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Step 2: Availability ────────────────────────────────────────

  if (step === 2) return (
    <div style={{ maxWidth:1400, margin:"0 auto", padding:16, fontFamily:"Inter, Segoe UI, Arial, sans-serif", color:C.text }}>
      <WizardNav step={2} />
      <div style={{ background:C.white, border:`1px solid ${C.gray300}`, borderRadius:12,
        padding:20, marginBottom:24 }}>
        <h2 style={{ margin:"0 0 8px", color:C.navy900 }}>Availability &amp; constraints</h2>
        <p style={{ margin:"0 0 16px", color:C.sub, fontSize:14 }}>Drag over the grid to mark times you cannot take class.</p>
        <AvailabilityGrid blocked={blocked} setBlocked={setBlocked} />
      </div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
        <button style={btnSecondary} onClick={() => setStep(1)}>← Back</button>
        <button style={btnPrimary}   onClick={() => setStep(3)}>Next → Results</button>
      </div>
    </div>
  );

  // ── Step 3: Results ─────────────────────────────────────────────

  return (
    <div style={{ width:"100%", boxSizing:"border-box", padding:16, fontFamily:"Inter, Segoe UI, Arial, sans-serif", color:C.text }}>
      <div style={{ maxWidth:1400, margin:"0 auto" }}>
        <WizardNav step={3} />
        <div style={{ background:C.white, border:`1px solid ${C.gray300}`, borderRadius:12,
          padding:20, marginBottom:24 }}>
          <h2 style={{ margin:"0 0 8px", color:C.navy900 }}>Schedule results</h2>
          <p style={{ margin:"0 0 16px", color: schedules.length>0 ? C.sub : "#a20000", fontSize:14 }}>
            {schedules.length > 0
              ? `Found ${schedules.length} schedule option${schedules.length!==1?"s":""} closest to ${targetCu} CU.`
              : failureMsg}
          </p>

          <div style={{ display:"flex", flexDirection:"column", gap:28, width:"100%" }}>
            {schedules.map((sol, idx) => (
              <ScheduleCard key={idx} sol={sol} idx={idx}
                colorMap={buildColorMap(sol.sections)} guidance={guidance} />
            ))}
          </div>
        </div>

        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <button style={btnSecondary} onClick={() => setStep(2)}>← Back</button>
          <button style={btnSecondary} onClick={() => setStep(1)}>Edit shortlist</button>
        </div>
      </div>
    </div>
  );
}
