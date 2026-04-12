import Link from "next/link";
import { C, shadow } from "../lib/tokens";
import type { EventItem, ReflectionItem } from "../lib/types";

type SavedEventsModuleProps = {
  savedEvents: EventItem[];
  reflectionsByEventId: Record<string, ReflectionItem>;
};

function SvgBookmarkFilled() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3-7 3V5z" />
    </svg>
  );
}

function SvgArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
    </svg>
  );
}

export function SavedEventsModule({ savedEvents, reflectionsByEventId }: SavedEventsModuleProps) {
  const reflectedCount   = savedEvents.filter(e => reflectionsByEventId[e.id]).length;
  const upcomingCount    = savedEvents.filter(e => new Date(e.start_time).getTime() >= Date.now()).length;
  const pastCount        = savedEvents.length - upcomingCount;
  const unreflectedPast  = savedEvents.filter(
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
              {savedEvents.length === 0 ? (
                "No saved events yet"
              ) : (
                <>
                  {savedEvents.length} saved · {upcomingCount} upcoming · {pastCount} past
                  {reflectedCount > 0 && (
                    <> · <span style={{ color: C.terraDark }}>{reflectedCount} reflected</span></>
                  )}
                  {unreflectedPast > 0 && (
                    <> · <span style={{ color: C.terra, fontWeight: 600 }}>{unreflectedPast} awaiting reflection</span></>
                  )}
                </>
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
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 24px" }}>
        {savedEvents.length === 0 ? (
          <div style={{ padding: "12px 0", textAlign: "center" }}>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
            <p style={{ margin: 0, fontSize: 13, color: C.textLight, textAlign: "center" }}>
              View your saved events in list or calendar format, and add reflections.
            </p>
            <Link
              href="/tools/19/saved"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 22px", borderRadius: 100,
                background: C.sage, color: "#fff",
                fontSize: 13, fontWeight: 600,
                textDecoration: "none", boxShadow: shadow.sm,
                transition: "background 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = C.sageDark;
                (e.currentTarget as HTMLElement).style.boxShadow = shadow.md;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = C.sage;
                (e.currentTarget as HTMLElement).style.boxShadow = shadow.sm;
              }}
            >
              View Saved Events
              <SvgArrow />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
