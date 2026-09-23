"use client";

import { useMemo } from "react";
import Link from "next/link";
import { DM_Sans } from "next/font/google";
import { C, shadow } from "../lib/tokens";
import { formatDate, formatTime } from "../lib/format";
import { useAnonymousIdentity } from "../hooks/useAnonymousIdentity";
import { useCompassEvents } from "../hooks/useCompassEvents";
import { useReflections } from "../hooks/useReflections";
import { ReflectionModal } from "../components/ReflectionModal";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export default function ReflectionsPage() {
  const adminHeaderValue = process.env.NEXT_PUBLIC_TOOL19_ADMIN_KEY || "";
  const { userId: anonUserId } = useAnonymousIdentity();
  const anonRequestHeaders = useMemo<Record<string, string> | undefined>(() => {
    if (!anonUserId) return undefined;
    return { "x-tool-anon-id": anonUserId };
  }, [anonUserId]);

  const { events } = useCompassEvents({ adminHeaderValue, timeFilter: "all" });

  const {
    reflectionsByEventId,
    reflectionsError,
    isLoadingReflections,
    editingReflectionEventId,
    reflectionDrafts,
    savingReflectionEventId,
    handleStartReflectionEdit,
    handleReflectionDraftChange,
    handleCancelReflectionEdit,
    handleSaveReflection,
    handleDeleteReflection,
    editingEvent,
  } = useReflections({ anonRequestHeaders, events, savedEvents: [] });

  const reflectedEvents = useMemo(() => {
    return Object.entries(reflectionsByEventId)
      .map(([eventId, reflection]) => {
        const event = events.find(e => e.id === eventId);
        return event ? { event, reflection } : null;
      })
      .filter((item): item is { event: NonNullable<typeof item>["event"]; reflection: NonNullable<typeof item>["reflection"] } => item !== null)
      .sort((a, b) => new Date(b.reflection.updated_at).getTime() - new Date(a.reflection.updated_at).getTime());
  }, [reflectionsByEventId, events]);

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

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Page heading */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: C.sage }}>
            <SparklesIcon />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em" }}>
              My Reflections
            </span>
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: C.text }}>
            Your Event Reflections
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: C.textLight, lineHeight: 1.6 }}>
            Notes and takeaways from events you've attended.
          </p>
        </div>

        {/* Error */}
        {reflectionsError && (
          <div style={{
            marginBottom: 20, padding: "10px 16px", borderRadius: 10,
            border: `1px solid ${C.terraBorder}`, background: C.terraLight,
            fontSize: 12, color: C.terraDark,
          }}>
            {reflectionsError}
          </div>
        )}

        {/* Loading */}
        {isLoadingReflections && (
          <div style={{ padding: "48px 0", textAlign: "center", color: C.taupe, fontSize: 14 }}>
            Loading reflections…
          </div>
        )}

        {/* Empty state */}
        {!isLoadingReflections && reflectedEvents.length === 0 && !reflectionsError && (
          <div style={{
            padding: "56px 24px", textAlign: "center",
            borderRadius: 20, border: `1px dashed ${C.borderStrong}`,
            background: C.surface,
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✨</div>
            <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: C.text }}>
              No reflections yet
            </p>
            <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textLight }}>
              Save events and add reflections from your Compass dashboard.
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
              Go to Compass
            </Link>
          </div>
        )}

        {/* Reflection cards */}
        {reflectedEvents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {reflectedEvents.map(({ event, reflection }) => (
              <article key={event.id} style={{
                borderRadius: 18, border: `1px solid ${C.border}`,
                background: C.surface, boxShadow: shadow.sm,
                overflow: "hidden",
              }}>
                {/* Event info stripe */}
                <div style={{
                  padding: "16px 20px",
                  background: `linear-gradient(135deg, ${C.sageLight} 0%, transparent 70%)`,
                  borderBottom: `1px solid ${C.borderMuted}`,
                  display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                      {event.title}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: C.textLight }}>
                      {formatDate(event.start_time)} at {formatTime(event.start_time)}
                      {event.organizer && <span> · {event.organizer}</span>}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStartReflectionEdit(event.id)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "6px 12px", borderRadius: 8,
                      border: `1px solid ${C.sageBorder}`, background: C.sageLight,
                      fontSize: 12, fontWeight: 500, color: C.sageDark,
                      cursor: "pointer", flexShrink: 0,
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(122,158,126,0.18)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = C.sageLight;
                    }}
                  >
                    <PencilIcon />
                    Edit
                  </button>
                </div>

                {/* Reflection text */}
                <div style={{ padding: "16px 20px" }}>
                  <p style={{
                    margin: "0 0 10px", fontSize: 14, lineHeight: 1.7,
                    color: C.text, whiteSpace: "pre-wrap",
                  }}>
                    {reflection.reflection_text}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: C.taupe }}>
                    Last updated {new Date(reflection.updated_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                </div>
              </article>
            ))}
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
