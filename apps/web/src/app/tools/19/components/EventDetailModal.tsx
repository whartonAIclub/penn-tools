"use client";

import { useEffect } from "react";
import { C, shadow } from "../lib/tokens";
import { formatDate, formatDuration, formatTime, shorten } from "../lib/format";
import type { EventItem, ReflectionItem } from "../lib/types";

type EventDetailModalProps = {
  event: EventItem;
  isSaved: boolean;
  isSaving: boolean;
  reflection?: ReflectionItem;
  onToggleSave: (eventId: string) => void;
  onStartReflection: (eventId: string) => void;
  onClose: () => void;
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function SvgCal() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SvgUser() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function SvgPin() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function SvgBookmark({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3-7 3V5z" /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-3-7 3V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
  );
}

function SvgPen() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function Pill({ children, color = "stone" }: { children: React.ReactNode; color?: "sage" | "terra" | "stone" }) {
  const styles: Record<string, React.CSSProperties> = {
    sage:  { background: C.sageLight, border: `1px solid ${C.sageBorder}`, color: C.sageDark },
    terra: { background: C.terraLight, border: `1px solid ${C.terraBorder}`, color: C.terraDark },
    stone: { background: C.surfaceWarm, border: `1px solid ${C.borderMuted}`, color: C.textMuted },
  };
  return (
    <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500, ...styles[color] }}>
      {children}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function EventDetailModal({
  event, isSaved, isSaving, reflection,
  onToggleSave, onStartReflection, onClose,
}: EventDetailModalProps) {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const isPast = start.getTime() < Date.now();
  const duration = formatDuration(event.start_time, event.end_time);
  const location = event.location && !event.location.toLowerCase().includes("sign in") ? event.location : null;
  const includedItems = Array.isArray(event.included_items) ? event.included_items : [];
  const fullDetails = event.details_text || event.description || null;
  const hasPills = event.date_summary || event.cost_summary || event.payment_summary || event.dress_code || duration;

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex",
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(44,26,14,0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          cursor: "pointer",
        }}
      />

      {/* Panel — slides in from right */}
      <div style={{
        position: "absolute",
        top: 0, right: 0, bottom: 0,
        width: "min(640px, 100vw)",
        background: C.pageBg,
        boxShadow: "-8px 0 40px rgba(44,26,14,0.14)",
        display: "flex",
        flexDirection: "column",
        animation: "slideInRight 0.25s cubic-bezier(0.25,0.8,0.25,1)",
        overflowY: "auto",
      }}>
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(48px); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Sticky header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: "rgba(250,248,244,0.96)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: `1px solid ${C.border}`,
          padding: "0 24px",
          height: 60,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 100,
              border: `1px solid ${C.border}`, background: C.surface,
              fontSize: 13, fontWeight: 500, color: C.textMuted,
              cursor: "pointer", boxShadow: shadow.sm,
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
          </button>

          {/* Save button in header */}
          <button
            type="button"
            onClick={() => onToggleSave(event.id)}
            disabled={isSaving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 100,
              border: isSaved ? "none" : `1px solid ${C.border}`,
              background: isSaved ? C.sage : C.surface,
              color: isSaved ? "#fff" : C.textMuted,
              fontSize: 12, fontWeight: 600,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
              boxShadow: isSaved ? shadow.sm : shadow.sm,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => {
              if (!isSaving && !isSaved) (e.currentTarget as HTMLElement).style.background = C.sageLight;
            }}
            onMouseLeave={e => {
              if (!isSaved) (e.currentTarget as HTMLElement).style.background = C.surface;
            }}
          >
            <SvgBookmark filled={isSaved} />
            {isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "32px 28px 60px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Status badge */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            <span style={{
              display: "inline-block", padding: "3px 10px", borderRadius: 100,
              fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em",
              background: isPast ? "#F0EDE8" : C.sageLight,
              color: isPast ? "#A09080" : C.sageDark,
            }}>
              {isPast ? "Past event" : "Upcoming"}
            </span>
            {event.calendar_title && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 100,
                fontSize: 11, fontWeight: 500,
                background: C.surfaceWarm, color: C.textMuted,
                border: `1px solid ${C.border}`,
              }}>
                <SvgCal />{event.calendar_title}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.3, color: C.text }}>
            {event.title}
          </h2>

          {/* Date / time / organizer */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 10,
                background: C.sageLight, border: `1px solid ${C.sageBorder}`,
                fontSize: 13, fontWeight: 600, color: C.sageDark,
              }}>
                <SvgCal />{formatDate(event.start_time)}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 10,
                background: C.surfaceWarm, border: `1px solid ${C.border}`,
                fontSize: 13, fontWeight: 500, color: C.textMuted,
              }}>
                {formatTime(event.start_time)}
                {end ? ` – ${formatTime(event.end_time!)}` : ""}
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "6px 20px", fontSize: 13, color: C.textLight }}>
              {event.organizer && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <SvgUser />{event.organizer}
                </span>
              )}
              {location && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <SvgPin />{location}
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: C.borderMuted }} />

          {/* Description / details */}
          {fullDetails && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.taupe, marginBottom: 10 }}>
                About this event
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: C.textMuted, whiteSpace: "pre-wrap" as const }}>
                {fullDetails}
              </p>
            </div>
          )}

          {/* Meta pills */}
          {hasPills && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.taupe, marginBottom: 10 }}>
                Event details
              </div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                {event.date_summary    && <Pill color="sage">{shorten(event.date_summary, 80)}</Pill>}
                {event.cost_summary    && <Pill color="terra">{shorten(event.cost_summary, 80)}</Pill>}
                {event.payment_summary && <Pill color="stone">{shorten(event.payment_summary, 80)}</Pill>}
                {event.dress_code      && <Pill color="sage">{event.dress_code}</Pill>}
                {duration              && <Pill color="stone">{duration}</Pill>}
              </div>
            </div>
          )}

          {/* Included items */}
          {includedItems.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.taupe, marginBottom: 10 }}>
                What&apos;s included
              </div>
              <ul style={{
                margin: 0, padding: "14px 18px",
                listStyle: "none",
                borderRadius: 14, border: `1px solid ${C.borderMuted}`,
                background: C.surfaceMuted,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {includedItems.map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.textMuted }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.sage, flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Your reflection */}
          {reflection && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.terraDark, marginBottom: 10 }}>
                Your reflection
              </div>
              <div style={{
                padding: "14px 18px", borderRadius: 14,
                border: `1px solid ${C.terraBorder}`, background: C.terraLight,
              }}>
                <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.7, color: C.text, whiteSpace: "pre-wrap" as const }}>
                  {reflection.reflection_text}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: C.taupe }}>
                  Last updated {new Date(reflection.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: C.borderMuted }} />

          {/* Actions */}
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10 }}>
            {event.registration_url && (
              <a
                href={event.registration_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "10px 22px", borderRadius: 12,
                  background: C.terra, color: "#fff",
                  fontSize: 13, fontWeight: 600, textDecoration: "none",
                  boxShadow: shadow.sm, transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.terraDark; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.terra; }}
              >
                Register
              </a>
            )}

            {isSaved && (
              <button
                type="button"
                onClick={() => onStartReflection(event.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "10px 22px", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: C.surface,
                  fontSize: 13, fontWeight: 500, color: C.textMuted,
                  cursor: "pointer", transition: "border-color 0.15s, color 0.15s",
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
                <SvgPen />{reflection ? "Edit Reflection" : "Add Reflection"}
              </button>
            )}

            {event.info_deck_url && (
              <a
                href={event.info_deck_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "10px 22px", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: C.surface,
                  fontSize: 13, fontWeight: 500, color: C.textMuted,
                  textDecoration: "none", transition: "border-color 0.15s, color 0.15s",
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
                Info Deck
              </a>
            )}

            {event.details_url && event.details_url !== event.registration_url && (
              <a
                href={event.details_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "10px 22px", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: C.surface,
                  fontSize: 13, fontWeight: 500, color: C.textMuted,
                  textDecoration: "none", transition: "border-color 0.15s, color 0.15s",
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
                Event Details
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
