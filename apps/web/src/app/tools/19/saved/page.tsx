"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DM_Sans } from "next/font/google";
import { C, shadow } from "../lib/tokens";
import { formatDate, formatTime } from "../lib/format";
import { useAnonymousIdentity } from "../hooks/useAnonymousIdentity";
import { useCompassEvents } from "../hooks/useCompassEvents";
import { useSavedEvents } from "../hooks/useSavedEvents";
import { useReflections } from "../hooks/useReflections";
import { ReflectionModal } from "../components/ReflectionModal";
import type { EventItem, ReflectionItem } from "../lib/types";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3-7 3V5z" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function UnsaveIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-3-7 3V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      <line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Saved event list card ─────────────────────────────────────────────────────

function SavedEventCard({
  event, reflection, isSaving, onToggleSave, onStartReflection,
}: {
  event: EventItem;
  reflection?: ReflectionItem;
  isSaving: boolean;
  onToggleSave: (id: string) => void;
  onStartReflection: (id: string) => void;
}) {
  const isPast = new Date(event.start_time).getTime() < Date.now();

  return (
    <article style={{
      borderRadius: 16,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${isPast ? C.stoneBorder : C.sage}`,
      background: C.surface,
      boxShadow: shadow.sm,
      overflow: "hidden",
      transition: "box-shadow 0.2s, border-color 0.2s",
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = shadow.md; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = shadow.sm; }}
    >
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Top row: badges + actions */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            <span style={{
              display: "inline-block", padding: "2px 8px", borderRadius: 100,
              fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em",
              background: isPast ? "#F0EDE8" : C.sageLight,
              color: isPast ? "#A09080" : C.sageDark,
            }}>
              {isPast ? "Past" : "Upcoming"}
            </span>
            {reflection && (
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 100,
                fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em",
                background: C.terraLight, color: C.terraDark,
              }}>
                Reflected
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onToggleSave(event.id)}
            disabled={isSaving}
            title="Remove from saved"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 8,
              border: `1px solid ${C.borderStrong}`, background: C.surfaceWarm,
              fontSize: 11, fontWeight: 500, color: C.textLight,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.5 : 1,
              flexShrink: 0, transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.terraBorder;
              (e.currentTarget as HTMLElement).style.color = C.terraDark;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.borderStrong;
              (e.currentTarget as HTMLElement).style.color = C.textLight;
            }}
          >
            <UnsaveIcon />
            {isSaving ? "Saving…" : "Unsave"}
          </button>
        </div>

        {/* Title */}
        <div>
          <h3 style={{ margin: "0 0 5px", fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: C.text }}>
            {event.title}
          </h3>
          <p style={{ margin: 0, fontSize: 12, color: C.textLight }}>
            {formatDate(event.start_time)} · {formatTime(event.start_time)}
            {event.organizer && <span> · {event.organizer}</span>}
          </p>
        </div>

        {/* Reflection preview */}
        {reflection && (
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            border: `1px solid ${C.terraBorder}`, background: C.terraLight,
            fontSize: 12, lineHeight: 1.65, color: C.text,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: C.terraDark, marginBottom: 5 }}>
              Your Reflection
            </div>
            <p style={{ margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
              {reflection.reflection_text}
            </p>
          </div>
        )}

        {/* Action row */}
        <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
          <button
            type="button"
            onClick={() => onStartReflection(event.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "7px 14px", borderRadius: 9,
              border: reflection ? `1px solid ${C.border}` : "none",
              background: reflection ? "transparent" : C.terra,
              color: reflection ? C.textMuted : "#fff",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              boxShadow: reflection ? "none" : shadow.sm,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              if (reflection) { el.style.borderColor = C.sageBorder; el.style.color = C.sageDark; }
              else { el.style.background = C.terraDark; }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              if (reflection) { el.style.borderColor = C.border; el.style.color = C.textMuted; }
              else { el.style.background = C.terra; }
            }}
          >
            <PenIcon />
            {reflection ? "Edit Reflection" : "Write Reflection"}
          </button>

          {event.registration_url && (
            <a
              href={event.registration_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center",
                padding: "7px 14px", borderRadius: 9,
                border: `1px solid ${C.border}`, background: C.surface,
                fontSize: 12, fontWeight: 500, color: C.textMuted,
                textDecoration: "none", transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
                (e.currentTarget as HTMLElement).style.color = C.sageDark;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = C.border;
                (e.currentTarget as HTMLElement).style.color = C.textMuted;
              }}
            >
              Register
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function CalendarView({
  savedEvents, reflectionsByEventId, savingEventId, onToggleSave, onStartReflection,
}: {
  savedEvents: EventItem[];
  reflectionsByEventId: Record<string, ReflectionItem>;
  savingEventId: string | null;
  onToggleSave: (id: string) => void;
  onStartReflection: (id: string) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // Build a map: "YYYY-MM-DD" → EventItem[]
  const eventsByDay = useMemo(() => {
    const map: Record<string, EventItem[]> = {};
    for (const ev of savedEvents) {
      const d = new Date(ev.start_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [savedEvents]);

  // Calendar grid cells
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button type="button" onClick={prevMonth} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: 9,
          border: `1px solid ${C.border}`, background: C.surface,
          cursor: "pointer", color: C.textMuted, boxShadow: shadow.sm,
          transition: "border-color 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
        >
          <ChevronLeft />
        </button>

        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
          {MONTHS[month]} {year}
        </div>

        <button type="button" onClick={nextMonth} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: 9,
          border: `1px solid ${C.border}`, background: C.surface,
          cursor: "pointer", color: C.textMuted, boxShadow: shadow.sm,
          transition: "border-color 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
        >
          <ChevronRight />
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.taupe, padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} style={{ minHeight: 80 }} />;
          }
          const cellKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const cellEvents = eventsByDay[cellKey] ?? [];
          const isToday = cellKey === todayKey;
          const isPast = new Date(year, month, day).getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
          const isExpanded = expandedDay === cellKey;
          const visible = cellEvents.slice(0, 3);
          const overflow = cellEvents.length - 3;

          return (
            <div
              key={cellKey}
              style={{
                minHeight: 80, padding: "6px 6px 8px",
                borderRadius: 10,
                border: `1px solid ${isToday ? C.sage : C.border}`,
                background: isToday ? C.sageLight : isPast ? C.surfaceWarm : C.surface,
                position: "relative",
                cursor: cellEvents.length > 0 ? "pointer" : "default",
                transition: "box-shadow 0.15s",
              }}
              onClick={() => {
                if (cellEvents.length > 0) setExpandedDay(isExpanded ? null : cellKey);
              }}
              onMouseEnter={e => {
                if (cellEvents.length > 0) (e.currentTarget as HTMLElement).style.boxShadow = shadow.sm;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              {/* Day number */}
              <div style={{
                fontSize: 12, fontWeight: isToday ? 700 : 500,
                color: isToday ? C.sageDark : isPast ? C.taupe : C.textMuted,
                marginBottom: 4,
              }}>
                {day}
              </div>

              {/* Event chips */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {visible.map(ev => {
                  const hasReflection = Boolean(reflectionsByEventId[ev.id]);
                  return (
                    <div key={ev.id} style={{
                      padding: "2px 5px", borderRadius: 4,
                      background: hasReflection ? C.terraLight : C.sageLight,
                      border: `1px solid ${hasReflection ? C.terraBorder : C.sageBorder}`,
                      fontSize: 10, fontWeight: 500,
                      color: hasReflection ? C.terraDark : C.sageDark,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                    }}>
                      {ev.title}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div style={{ fontSize: 10, color: C.taupe, fontWeight: 500, paddingLeft: 2 }}>
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day detail popover */}
      {expandedDay && eventsByDay[expandedDay] && (
        <div style={{
          marginTop: 20, borderRadius: 16,
          border: `1px solid ${C.border}`, background: C.surface,
          boxShadow: shadow.md, overflow: "hidden",
        }}>
          <div style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${C.borderMuted}`,
            background: `linear-gradient(90deg, ${C.sageLight} 0%, transparent 70%)`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {new Date(expandedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <button type="button" onClick={() => setExpandedDay(null)} style={{
              border: "none", background: "none", fontSize: 16, color: C.taupe, cursor: "pointer", padding: "2px 6px",
            }}>
              ×
            </button>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {eventsByDay[expandedDay].map(ev => (
              <div key={ev.id} style={{
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
                padding: "12px 14px", borderRadius: 10,
                border: `1px solid ${C.borderMuted}`, background: C.surfaceWarm,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{ev.title}</div>
                  <div style={{ fontSize: 11, color: C.textLight }}>
                    {formatTime(ev.start_time)}
                    {ev.organizer && <span> · {ev.organizer}</span>}
                  </div>
                  {reflectionsByEventId[ev.id] && (
                    <div style={{
                      marginTop: 8, padding: "8px 12px", borderRadius: 8,
                      background: C.terraLight, border: `1px solid ${C.terraBorder}`,
                      fontSize: 11, color: C.terraDark, lineHeight: 1.55,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                    }}>
                      {reflectionsByEventId[ev.id]?.reflection_text}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onStartReflection(ev.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "6px 12px", borderRadius: 8,
                    border: `1px solid ${C.border}`, background: C.surface,
                    fontSize: 11, fontWeight: 500, color: C.textMuted,
                    cursor: "pointer", flexShrink: 0, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
                    (e.currentTarget as HTMLElement).style.color = C.sageDark;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = C.border;
                    (e.currentTarget as HTMLElement).style.color = C.textMuted;
                  }}
                >
                  <PenIcon />
                  {reflectionsByEventId[ev.id] ? "Edit" : "Reflect"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavedEventsPage() {
  const adminHeaderValue = process.env.NEXT_PUBLIC_TOOL19_ADMIN_KEY || "";
  const { userId: anonUserId } = useAnonymousIdentity();
  const anonRequestHeaders = useMemo<Record<string, string> | undefined>(() => {
    if (!anonUserId) return undefined;
    return { "x-tool-anon-id": anonUserId };
  }, [anonUserId]);

  const [view, setView] = useState<"list" | "calendar">("list");

  const { events } = useCompassEvents({ adminHeaderValue, timeFilter: "all" });

  const {
    savedEvents, savedEventsError, isLoadingSavedEvents, savingEventId, handleToggleSave,
  } = useSavedEvents({ anonRequestHeaders, adminHeaderValue, events });

  const {
    reflectionsByEventId, reflectionsError,
    editingReflectionEventId, reflectionDrafts, savingReflectionEventId,
    handleStartReflectionEdit, handleReflectionDraftChange,
    handleCancelReflectionEdit, handleSaveReflection, handleDeleteReflection,
    editingEvent,
  } = useReflections({ anonRequestHeaders, events, savedEvents });

  const upcomingCount = savedEvents.filter(e => new Date(e.start_time).getTime() >= Date.now()).length;
  const pastCount     = savedEvents.length - upcomingCount;
  const reflectedCount = Object.keys(reflectionsByEventId).length;

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, color: C.text, fontFamily: dmSans.style.fontFamily }}>
      {/* Header */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 40,
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(250,248,244,0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}>
        <div style={{
          maxWidth: 1152, margin: "0 auto", padding: "0 24px",
          height: 68, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: C.sage,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: shadow.sm, flexShrink: 0,
            }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>🧭</span>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>Compass</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.sage, letterSpacing: "0.04em" }}>Wharton MBA</div>
            </div>
          </div>

          <Link
            href="/tools/19"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 100,
              border: `1px solid ${C.border}`, background: C.surface,
              fontSize: 13, fontWeight: 500, color: C.textMuted,
              textDecoration: "none", boxShadow: shadow.sm,
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
              (e.currentTarget as HTMLElement).style.color = C.sageDark;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.border;
              (e.currentTarget as HTMLElement).style.color = C.textMuted;
            }}
          >
            <BackIcon />
            Back to Compass
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Page heading */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: C.sage }}>
            <BookmarkIcon />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em" }}>
              My Saved Events
            </span>
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: C.text }}>
            Saved Events
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: C.textLight, lineHeight: 1.6 }}>
            {savedEvents.length > 0
              ? `${savedEvents.length} saved · ${upcomingCount} upcoming · ${pastCount} past · ${reflectedCount} reflected`
              : "Events you bookmark will appear here."}
          </p>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <div style={{ display: "inline-flex", gap: 3, padding: 3, background: C.surfaceWarm, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            {(["list", "calendar"] as const).map(v => {
              const active = view === v;
              return (
                <button key={v} type="button" onClick={() => setView(v)} style={{
                  padding: "6px 18px", borderRadius: 7, border: "none",
                  background: active ? C.surface : "transparent",
                  color: active ? C.text : C.textLight,
                  fontSize: 12, fontWeight: active ? 600 : 500,
                  cursor: "pointer", boxShadow: active ? shadow.sm : "none",
                  transition: "all 0.15s", textTransform: "capitalize",
                }}>
                  {v === "list" ? "List View" : "Calendar View"}
                </button>
              );
            })}
          </div>

          {view === "calendar" && savedEvents.length > 0 && (
            <span style={{ fontSize: 11, color: C.taupe }}>
              Click a day to see event details
            </span>
          )}
        </div>

        {/* Errors */}
        {(savedEventsError || reflectionsError) && (
          <div style={{
            marginBottom: 20, padding: "10px 16px", borderRadius: 10,
            border: `1px solid ${C.terraBorder}`, background: C.terraLight,
            fontSize: 12, color: C.terraDark,
          }}>
            {savedEventsError || reflectionsError}
          </div>
        )}

        {/* Loading */}
        {isLoadingSavedEvents && (
          <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              border: `2.5px solid ${C.border}`, borderTopColor: C.sage,
              animation: "spin 0.8s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Empty state */}
        {!isLoadingSavedEvents && savedEvents.length === 0 && !savedEventsError && (
          <div style={{
            padding: "56px 24px", textAlign: "center",
            borderRadius: 20, border: `1px dashed ${C.borderStrong}`,
            background: C.surface,
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔖</div>
            <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: C.text }}>
              No saved events yet
            </p>
            <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textLight }}>
              Browse events in Compass and bookmark the ones you want to attend or reflect on.
            </p>
            <Link
              href="/tools/19"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 20px", borderRadius: 100,
                background: C.sage, color: "#fff",
                fontSize: 13, fontWeight: 600,
                textDecoration: "none", boxShadow: shadow.sm,
              }}
            >
              Browse Events
            </Link>
          </div>
        )}

        {/* List view */}
        {!isLoadingSavedEvents && savedEvents.length > 0 && view === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {savedEvents.map(event => (
              <SavedEventCard
                key={event.id}
                event={event}
                {...(reflectionsByEventId[event.id] ? { reflection: reflectionsByEventId[event.id] } : {})}
                isSaving={savingEventId === event.id}
                onToggleSave={handleToggleSave}
                onStartReflection={handleStartReflectionEdit}
              />
            ))}
          </div>
        )}

        {/* Calendar view */}
        {!isLoadingSavedEvents && savedEvents.length > 0 && view === "calendar" && (
          <div style={{
            borderRadius: 20, border: `1px solid ${C.border}`,
            background: C.surface, padding: "24px",
            boxShadow: shadow.sm,
          }}>
            <CalendarView
              savedEvents={savedEvents}
              reflectionsByEventId={reflectionsByEventId}
              savingEventId={savingEventId}
              onToggleSave={handleToggleSave}
              onStartReflection={handleStartReflectionEdit}
            />
          </div>
        )}
      </main>

      {editingEvent && editingReflectionEventId && (
        <ReflectionModal
          event={editingEvent}
          existingReflection={reflectionsByEventId[editingReflectionEventId]}
          draft={reflectionDrafts[editingReflectionEventId] || ""}
          onDraftChange={v => handleReflectionDraftChange(editingReflectionEventId, v)}
          onSave={() => handleSaveReflection(editingReflectionEventId)}
          onDelete={() => handleDeleteReflection(editingReflectionEventId)}
          onClose={handleCancelReflectionEdit}
          isSaving={savingReflectionEventId === editingReflectionEventId}
        />
      )}
    </div>
  );
}
