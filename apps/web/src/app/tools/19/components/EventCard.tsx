import { C, shadow } from "../lib/tokens";
import { formatDate, formatTime } from "../lib/format";
import type { EventItem, ReflectionItem } from "../lib/types";

export type EventCardProps = {
  event: EventItem;
  isSaved: boolean;
  isSaving: boolean;
  onToggleSave: (eventId: string) => void;
  reflection?: ReflectionItem | undefined;
  onStartReflection: (eventId: string) => void;
  onViewDetails: (eventId: string) => void;
};

// ── Icons ─────────────────────────────────────────────────────────────────────

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

function SvgArrow() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
    </svg>
  );
}

// ── EventCard ──────────────────────────────────────────────────────────────────

export function EventCard({ event, isSaved, isSaving, onToggleSave, reflection, onStartReflection, onViewDetails }: EventCardProps) {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const isPast = start.getTime() < Date.now();
  const descriptionPreview = event.description_preview || event.description || null;
  const location = event.location && !event.location.toLowerCase().includes("sign in") ? event.location : null;
  const hasMetaRow = event.organizer || location;

  return (
    <li style={{
      listStyle: "none",
      position: "relative",
      overflow: "hidden",
      borderRadius: 18,
      border: `1.5px solid ${C.stoneBorder}`,
      background: C.surface,
      boxShadow: shadow.sm,
      transition: "border-color 0.2s, box-shadow 0.2s",
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
      (e.currentTarget as HTMLElement).style.boxShadow = shadow.md;
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.borderColor = C.stoneBorder;
      (e.currentTarget as HTMLElement).style.boxShadow = shadow.sm;
    }}
    >
      {/* Top accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: isPast ? C.stoneBorder : `linear-gradient(90deg, ${C.sage}, #9FC4A3)`,
      }} />

      <div style={{ padding: "20px 24px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Title row + save button */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Date badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 9px", borderRadius: 8,
                background: C.sageLight, border: `1px solid ${C.sageBorder}`,
                fontSize: 11, fontWeight: 600, color: C.sageDark,
              }}>
                <SvgCal />{formatDate(event.start_time)}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "3px 9px", borderRadius: 8,
                background: C.surfaceWarm,
                fontSize: 11, fontWeight: 500, color: C.textMuted,
              }}>
                {formatTime(event.start_time)}{end ? ` – ${formatTime(event.end_time!)}` : ""}
              </span>
              {isPast && (
                <span style={{
                  padding: "3px 8px", borderRadius: 8,
                  background: "#F0EDE8", fontSize: 10,
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                  color: "#A09080",
                }}>Past</span>
              )}
            </div>

            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.35, color: C.text }}>
              {event.title}
            </h3>
          </div>

          {/* Save button */}
          <button
            type="button"
            aria-label={isSaved ? "Unsave" : "Save"}
            aria-pressed={isSaved}
            onClick={() => onToggleSave(event.id)}
            disabled={isSaving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 10, border: "none",
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

        {/* Description preview */}
        {descriptionPreview && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textMuted,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {descriptionPreview}
          </p>
        )}

        {/* Meta row */}
        {hasMetaRow && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 12, color: C.textLight }}>
            {event.organizer && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <SvgUser />{event.organizer}
              </span>
            )}
            {location && <span>{location}</span>}
          </div>
        )}

        {/* Reflection indicator */}
        {reflection && (
          <div style={{
            padding: "8px 12px", borderRadius: 10,
            border: `1px solid ${C.terraBorder}`, background: C.terraLight,
            fontSize: 12, lineHeight: 1.5, color: C.terraDark,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            <span style={{ fontWeight: 700, marginRight: 6 }}>✏ Reflected:</span>
            {reflection.reflection_text}
          </div>
        )}

        {/* Action row */}
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
          paddingTop: 8, borderTop: `1px solid ${C.borderMuted}`,
        }}>
          {event.registration_url && (
            <a
              href={event.registration_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "6px 16px", borderRadius: 9, border: "none",
                background: C.terra, color: "#fff",
                fontSize: 12, fontWeight: 600, textDecoration: "none",
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
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 9,
                border: `1px solid ${C.border}`, background: C.surface,
                fontSize: 12, fontWeight: 500, color: C.textMuted,
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

          {/* View details — always visible, aligned right */}
          <button
            type="button"
            onClick={() => onViewDetails(event.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 9,
              border: `1px solid ${C.border}`, background: "transparent",
              fontSize: 12, fontWeight: 500, color: C.textMuted,
              cursor: "pointer",
              marginLeft: "auto",
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
            View details <SvgArrow />
          </button>
        </div>
      </div>
    </li>
  );
}
