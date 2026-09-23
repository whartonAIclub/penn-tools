import Link from "next/link";
import { C, shadow } from "../lib/tokens";
import { formatDate, formatTime } from "../lib/format";
import type { EventItem, ReflectionItem } from "../lib/types";

type SavedEventsModuleProps = {
  savedEvents: EventItem[];
  reflectionsByEventId: Record<string, ReflectionItem>;
  onStartReflection: (eventId: string) => void;
  onViewAll: () => void;
};

function SvgBookmarkFilled() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3-7 3V5z" />
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

function SavedEventMiniCard({
  event, reflection, onStartReflection,
}: {
  event: EventItem;
  reflection?: ReflectionItem | undefined;
  onStartReflection: (eventId: string) => void;
}) {
  const isPast = new Date(event.start_time).getTime() < Date.now();

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      borderRadius: 14,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${isPast ? C.stoneBorder : C.sage}`,
      background: C.surface,
      padding: "14px 16px",
      boxShadow: shadow.sm,
      transition: "box-shadow 0.2s, border-color 0.2s",
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.boxShadow = shadow.md;
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.boxShadow = shadow.sm;
    }}
    >
      {/* Badges */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
          <span style={{
            display: "inline-block",
            padding: "2px 8px", borderRadius: 100,
            fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em",
            background: isPast ? "#F0EDE8" : C.sageLight,
            color: isPast ? "#A09080" : C.sageDark,
          }}>
            {isPast ? "Past" : "Upcoming"}
          </span>
          {reflection && (
            <span style={{
              display: "inline-block",
              padding: "2px 8px", borderRadius: 100,
              fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.07em",
              background: C.terraLight, color: C.terraDark,
            }}>
              Reflected
            </span>
          )}
        </div>

        {/* Title */}
        <h4 style={{
          margin: "0 0 5px",
          fontSize: 13, fontWeight: 600,
          lineHeight: 1.35, color: C.text,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {event.title}
        </h4>

        {/* Date */}
        <p style={{ margin: 0, fontSize: 11, color: C.textLight }}>
          {formatDate(event.start_time)} · {formatTime(event.start_time)}
        </p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() => onStartReflection(event.id)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          width: "100%",
          padding: "7px 10px",
          borderRadius: 9,
          border: reflection ? `1px solid ${C.border}` : "none",
          background: reflection ? "transparent" : C.terra,
          color: reflection ? C.textMuted : "#fff",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: reflection ? "none" : shadow.sm,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          if (reflection) {
            el.style.borderColor = C.sageBorder;
            el.style.color = C.sageDark;
          } else {
            el.style.background = C.terraDark;
          }
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          if (reflection) {
            el.style.borderColor = C.border;
            el.style.color = C.textMuted;
          } else {
            el.style.background = C.terra;
          }
        }}
      >
        <SvgPen />
        {reflection ? "Edit Reflection" : "Write Reflection"}
      </button>
    </div>
  );
}

export function SavedEventsModule({ savedEvents, reflectionsByEventId, onStartReflection, onViewAll }: SavedEventsModuleProps) {
  const preview = savedEvents.slice(0, 4);
  const overflow = savedEvents.length - 4;
  const reflectedCount = savedEvents.filter(e => reflectionsByEventId[e.id]).length;
  const unreflectedPast = savedEvents.filter(
    e => new Date(e.start_time).getTime() < Date.now() && !reflectionsByEventId[e.id]
  ).length;

  return (
    <section style={{
      marginBottom: 40,
      borderRadius: 20,
      border: `1px solid ${C.borderStrong}`,
      background: C.surface,
      overflow: "hidden",
      boxShadow: shadow.sm,
    }}>
      {/* Section header */}
      <div style={{
        padding: "18px 24px",
        borderBottom: `1px solid ${C.borderMuted}`,
        background: `linear-gradient(90deg, ${C.sageLight} 0%, transparent 70%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: C.sageLight, border: `1px solid ${C.sageBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.sage, flexShrink: 0,
          }}>
            <SvgBookmarkFilled />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Saved Events</div>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 1 }}>
              {savedEvents.length} saved
              {reflectedCount > 0 && (
                <> · <span style={{ color: C.terraDark }}>{reflectedCount} reflected</span></>
              )}
              {unreflectedPast > 0 && (
                <> · <span style={{ color: C.terra, fontWeight: 600 }}>{unreflectedPast} awaiting reflection</span></>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/tools/19/reflections"
            style={{
              display: "inline-block",
              padding: "6px 14px", borderRadius: 100,
              border: `1px solid ${C.border}`, background: C.surface,
              fontSize: 11, fontWeight: 500, color: C.textMuted,
              textDecoration: "none", boxShadow: shadow.sm,
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.terraBorder;
              (e.currentTarget as HTMLElement).style.color = C.terraDark;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.border;
              (e.currentTarget as HTMLElement).style.color = C.textMuted;
            }}
          >
            All reflections →
          </Link>
          {savedEvents.length > 0 && (
            <button
              type="button"
              onClick={onViewAll}
              style={{
                padding: "6px 14px", borderRadius: 100,
                border: `1px solid ${C.border}`, background: C.surface,
                fontSize: 11, fontWeight: 500, color: C.textMuted,
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
              See all →
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 24px" }}>
        {savedEvents.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: C.surfaceWarm, margin: "0 auto 12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.taupe,
            }}>
              <SvgBookmarkFilled />
            </div>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: C.text }}>No saved events yet</p>
            <p style={{ margin: 0, fontSize: 12, color: C.textLight, maxWidth: 280, marginInline: "auto" }}>
              Browse events below and bookmark the ones you want to attend or reflect on.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
            }}>
              {preview.map(event => (
                <SavedEventMiniCard
                  key={event.id}
                  event={event}
                  reflection={reflectionsByEventId[event.id]}
                  onStartReflection={onStartReflection}
                />
              ))}
            </div>

            {overflow > 0 && (
              <button
                type="button"
                onClick={onViewAll}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 12,
                  padding: "10px",
                  borderRadius: 12,
                  border: `1.5px dashed ${C.borderStrong}`,
                  background: "none",
                  fontSize: 12, fontWeight: 500, color: C.textLight,
                  cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = C.sageBorder;
                  el.style.color = C.sageDark;
                  el.style.background = C.sageLight;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = C.borderStrong;
                  el.style.color = C.textLight;
                  el.style.background = "none";
                }}
              >
                + {overflow} more saved event{overflow !== 1 ? "s" : ""}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
