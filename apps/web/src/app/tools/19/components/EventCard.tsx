import { useState } from "react";
import { formatDate, formatDuration, formatTime, shorten } from "../lib/format";
import { C, shadow } from "../lib/tokens";
import type { EventItem, ReflectionItem } from "../lib/types";

export type EventCardProps = {
  event: EventItem;
  isSaved: boolean;
  isSaving: boolean;
  onToggleSave: (eventId: string) => void;
  reflection?: ReflectionItem | undefined;
  onStartReflection: (eventId: string) => void;
};

// ── Tiny SVG icons ─────────────────────────────────────────────────────────────

function SvgCal() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SvgUser() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function SvgPen() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function SvgBookmark({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3-7 3V5z" />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-3-7 3V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SvgChevron({ up }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: up ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Pill / badge ───────────────────────────────────────────────────────────────

function Pill({ children, color = "stone" }: { children: React.ReactNode; color?: "sage" | "terra" | "stone" }) {
  const styles: Record<string, React.CSSProperties> = {
    sage:  { background: C.sageLight, border: `1px solid ${C.sageBorder}`, color: C.sageDark },
    terra: { background: C.terraLight, border: `1px solid ${C.terraBorder}`, color: C.terraDark },
    stone: { background: C.surfaceWarm, border: `1px solid ${C.borderMuted}`, color: C.textMuted },
  };
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500, ...styles[color] }}>
      {children}
    </span>
  );
}

// ── OutlineButton (for secondary actions) ─────────────────────────────────────

function OutlineButton({ onClick, href, children }: { onClick?: () => void; href?: string; children: React.ReactNode }) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "6px 14px", borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.surface,
    fontSize: 12, fontWeight: 500, color: C.textMuted,
    cursor: "pointer", textDecoration: "none",
    transition: "border-color 0.15s, color 0.15s",
  };
  const enter = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
    (e.currentTarget as HTMLElement).style.color = C.sageDark;
  };
  const leave = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.borderColor = C.border;
    (e.currentTarget as HTMLElement).style.color = C.textMuted;
  };
  if (href) {
    return <a href={href} target="_blank" rel="noreferrer" style={base} onMouseEnter={enter} onMouseLeave={leave}>{children}</a>;
  }
  return <button type="button" onClick={onClick} style={base} onMouseEnter={enter} onMouseLeave={leave}>{children}</button>;
}

// ── EventCard ──────────────────────────────────────────────────────────────────

export function EventCard({ event, isSaved, isSaving, onToggleSave, reflection, onStartReflection }: EventCardProps) {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const isPast = start.getTime() < Date.now();
  const [isExpanded, setIsExpanded] = useState(false);

  const includedItems = Array.isArray(event.included_items) ? event.included_items.slice(0, 6) : [];
  const detailsText = event.details_text || event.description || null;
  const descriptionPreview = event.description_preview || event.description || null;
  const duration = formatDuration(event.start_time, event.end_time);
  const hasExpandableDetails = Boolean(detailsText && detailsText !== descriptionPreview);
  const location = event.location && !event.location.toLowerCase().includes("sign in") ? event.location : null;
  const hasMetaRow = event.organizer || location || event.calendar_title;
  const hasPills = event.date_summary || event.cost_summary || event.payment_summary || event.dress_code || duration;

  return (
    <li style={{
      listStyle: "none",
      position: "relative",
      overflow: "hidden",
      borderRadius: 20,
      border: `2px solid ${C.stoneBorder}`,
      background: C.surface,
      boxShadow: shadow.md,
      transition: "border-color 0.2s, box-shadow 0.2s",
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
      (e.currentTarget as HTMLElement).style.boxShadow = shadow.lg;
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.borderColor = C.stoneBorder;
      (e.currentTarget as HTMLElement).style.boxShadow = shadow.md;
    }}
    >
      {/* Top accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: isPast
          ? C.stoneBorder
          : `linear-gradient(90deg, ${C.sage}, #9FC4A3)`,
      }} />

      <div style={{ padding: "24px 28px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Title + Save button */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.35, color: C.text }}>
              {event.title}
            </h3>

            {/* Date / time badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 8,
                background: C.sageLight, border: `1px solid ${C.sageBorder}`,
                fontSize: 11, fontWeight: 600, color: C.sageDark,
              }}>
                <SvgCal />
                {formatDate(event.start_time)}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 8,
                background: C.surfaceWarm,
                fontSize: 11, fontWeight: 500, color: C.textMuted,
              }}>
                {formatTime(event.start_time)}
                {end ? ` – ${formatTime(event.end_time!)}` : ""}
              </span>
              {isPast && (
                <span style={{
                  padding: "4px 8px", borderRadius: 8,
                  background: "#F0EDE8", fontSize: 10,
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                  color: "#A09080",
                }}>Past</span>
              )}
            </div>
          </div>

          {/* Save button */}
          <button
            type="button"
            aria-label={isSaved ? "Unsave" : "Save"}
            aria-pressed={isSaved}
            onClick={() => onToggleSave(event.id)}
            disabled={isSaving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 10, border: "none",
              background: isSaved ? C.sage : C.surfaceWarm,
              color: isSaved ? "#fff" : C.textMuted,
              fontSize: 12, fontWeight: 600,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
              boxShadow: isSaved ? shadow.sm : "none",
              flexShrink: 0,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => {
              if (!isSaving && !isSaved) (e.currentTarget as HTMLElement).style.background = C.sageLight;
            }}
            onMouseLeave={e => {
              if (!isSaved) (e.currentTarget as HTMLElement).style.background = C.surfaceWarm;
            }}
          >
            <SvgBookmark filled={isSaved} />
            {isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}
          </button>
        </div>

        {/* Description */}
        {descriptionPreview && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "rgba(44,26,14,0.65)" }}>
            {descriptionPreview}
          </p>
        )}

        {/* Meta pills */}
        {hasPills && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {event.date_summary  && <Pill color="sage">{shorten(event.date_summary, 52)}</Pill>}
            {event.cost_summary  && <Pill color="terra">{shorten(event.cost_summary, 64)}</Pill>}
            {event.payment_summary && <Pill color="stone">{shorten(event.payment_summary, 72)}</Pill>}
            {event.dress_code   && <Pill color="sage">{event.dress_code}</Pill>}
            {duration            && <Pill color="stone">{duration}</Pill>}
          </div>
        )}

        {/* Included items */}
        {includedItems.length > 0 && (
          <ul style={{
            margin: 0, padding: "12px 16px",
            listStyle: "none",
            borderRadius: 12, border: `1px solid ${C.borderMuted}`,
            background: C.surfaceMuted,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            {includedItems.map((item, i) => (
              <li key={`${event.id}-item-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(44,26,14,0.72)" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.sage, flexShrink: 0 }} />
                {item}
              </li>
            ))}
          </ul>
        )}

        {/* Organizer / location / calendar meta row */}
        {hasMetaRow && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "6px 20px",
            paddingTop: 12,
            borderTop: `1px solid ${C.borderMuted}`,
            fontSize: 12, color: C.textLight,
          }}>
            {event.organizer && (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <SvgUser />{event.organizer}
              </span>
            )}
            {location && (
              <span>{location}</span>
            )}
            {event.calendar_title && (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <SvgCal />{event.calendar_title}
              </span>
            )}
          </div>
        )}

        {/* Expand/collapse */}
        {hasExpandableDetails && (
          <button
            type="button"
            onClick={() => setIsExpanded(c => !c)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              border: "none", background: "none", padding: 0,
              fontSize: 12, fontWeight: 500, color: C.sageDark, cursor: "pointer",
            }}
          >
            <SvgChevron up={isExpanded} />
            {isExpanded ? "Hide details" : "Show details"}
          </button>
        )}

        {isExpanded && detailsText && (
          <div style={{
            padding: "12px 16px",
            borderRadius: 12, border: `1px solid ${C.borderMuted}`,
            background: C.surfaceMuted,
            fontSize: 12, lineHeight: 1.7, color: "rgba(44,26,14,0.68)",
          }}>
            {detailsText}
          </div>
        )}

        {/* Reflection preview */}
        {reflection && (
          <div style={{
            padding: "12px 16px",
            borderRadius: 12, border: `1px solid ${C.terraBorder}`,
            background: C.terraLight,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <SvgPen />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.terraDark }}>
                Your Reflection
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: "rgba(44,26,14,0.72)" }}>
              {reflection.reflection_text}
            </p>
          </div>
        )}

        {/* Action row */}
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
          paddingTop: 12, borderTop: `1px solid ${C.borderMuted}`,
        }}>
          {event.registration_url && (
            <a
              href={event.registration_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 18px", borderRadius: 10, border: "none",
                background: C.terra, color: "#fff",
                fontSize: 12, fontWeight: 600, textDecoration: "none",
                boxShadow: shadow.sm, transition: "background 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = C.terraDark;
                (e.currentTarget as HTMLElement).style.boxShadow = shadow.md;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = C.terra;
                (e.currentTarget as HTMLElement).style.boxShadow = shadow.sm;
              }}
            >
              Register
            </a>
          )}

          {isSaved && (
            <OutlineButton onClick={() => onStartReflection(event.id)}>
              <SvgPen />{reflection ? "Edit Reflection" : "Add Reflection"}
            </OutlineButton>
          )}

          {event.info_deck_url && (
            <OutlineButton href={event.info_deck_url}>Info Deck</OutlineButton>
          )}

          {event.details_url && event.details_url !== event.registration_url && (
            <OutlineButton href={event.details_url}>Event Details</OutlineButton>
          )}
        </div>
      </div>
    </li>
  );
}
