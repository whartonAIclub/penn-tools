"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DM_Sans } from "next/font/google";
import { C, shadow } from "../lib/tokens";
import { matchesTags, TAGS } from "../lib/tags";
import { CompassHeader } from "../components/CompassHeader";
import { ForYouRow } from "../components/ForYouRow";
import { EventDetailModal } from "../components/EventDetailModal";
import { useAnonymousIdentity } from "../hooks/useAnonymousIdentity";
import { useCompassEvents } from "../hooks/useCompassEvents";
import { useSavedEvents } from "../hooks/useSavedEvents";
import type { EventItem } from "../lib/types";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// ── Pass feedback ──────────────────────────────────────────────────────────────

const PASS_REASONS = [
  "Not interested",
  "Bad timing",
  "Too busy",
  "Not relevant to my priorities",
  "Already have enough planned",
  "Other",
] as const;

const FADE_UP_CSS = `@keyframes fy-fade-up {
  from { transform: translateX(-50%) translateY(14px); opacity: 0; }
  to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
}`;

function PassFeedbackPrompt({
  eventTitle,
  onSelect,
  onDismiss,
}: {
  eventTitle: string;
  onSelect: (reason: string) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <>
      <style>{FADE_UP_CSS}</style>
      <div style={{
        position: "fixed", bottom: 28, left: "50%",
        transform: "translateX(-50%)",
        width: "min(480px, calc(100vw - 48px))",
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 18, padding: "18px 20px",
        boxShadow: shadow.lg,
        zIndex: 200,
        animation: "fy-fade-up 0.22s ease-out",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>
              Why did you pass?
            </div>
            <div style={{ fontSize: 11, color: C.textLight }}>
              on &ldquo;{eventTitle.length > 52 ? eventTitle.slice(0, 52) + "…" : eventTitle}&rdquo;
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              border: "none", background: "none", fontSize: 15,
              cursor: "pointer", color: C.textMuted, padding: "0 0 0 12px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PASS_REASONS.map(reason => (
            <button
              key={reason}
              type="button"
              onClick={() => onSelect(reason)}
              style={{
                padding: "5px 12px", borderRadius: 100,
                border: `1px solid ${C.border}`, background: "#fff",
                fontSize: 12, color: C.text, cursor: "pointer",
                transition: "background 0.1s, border-color 0.1s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
                (e.currentTarget as HTMLElement).style.background = C.sageLight;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = C.border;
                (e.currentTarget as HTMLElement).style.background = "#fff";
              }}
            >
              {reason}
            </button>
          ))}
          <button
            type="button"
            onClick={onDismiss}
            style={{
              padding: "5px 12px", borderRadius: 100,
              border: "none", background: "none",
              fontSize: 12, color: C.textMuted, cursor: "pointer",
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMatchedTags(event: EventItem) {
  return TAGS.filter(tag => matchesTags(event, [tag.label]));
}

function getWhyItMatches(event: EventItem, matched: ReturnType<typeof getMatchedTags>): string {
  if (matched.length === 0) return "";
  if (matched.length === 1) return `Matches your ${matched[0]!.label} interest`;
  if (matched.length === 2) return `Relevant to ${matched[0]!.label} and ${matched[1]!.label}`;
  return `Spans ${matched[0]!.label}, ${matched[1]!.label}, and more`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ForYouPage() {
  const adminHeaderValue = process.env.NEXT_PUBLIC_TOOL19_ADMIN_KEY || "";
  const { userId: anonUserId } = useAnonymousIdentity();
  const anonRequestHeaders = useMemo<Record<string, string> | undefined>(() => {
    if (!anonUserId) return undefined;
    return { "x-tool-anon-id": anonUserId };
  }, [anonUserId]);

  const [selectedTags, setSelectedTags]       = useState<string[]>([]);
  const [passedEventIds, setPassedEventIds]   = useState<Set<string>>(new Set());
  const [laterEventIds, setLaterEventIds]     = useState<Set<string>>(new Set());
  const [detailEventId, setDetailEventId]     = useState<string | null>(null);
  const [passFeedback, setPassFeedback]       = useState<{ eventId: string; title: string } | null>(null);

  const passCountRef = useRef(0);

  const { events, isSyncing, handleSync } =
    useCompassEvents({ adminHeaderValue, timeFilter: "upcoming" });

  const { savingEventId, handleToggleSave, savedEventIds } =
    useSavedEvents({ anonRequestHeaders, adminHeaderValue, events });

  // ── Filtered list ─────────────────────────────────────────────────────────
  const listEvents = useMemo(() => {
    const now = Date.now();
    return events
      .filter(e => new Date(e.start_time).getTime() >= now)
      .filter(e => !passedEventIds.has(e.id))
      .filter(e => !laterEventIds.has(e.id))
      .filter(e => !savedEventIds.has(e.id))
      .filter(e => selectedTags.length === 0 || matchesTags(e, selectedTags))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [events, passedEventIds, laterEventIds, savedEventIds, selectedTags]);

  const detailEvent = useMemo(
    () => events.find(e => e.id === detailEventId) ?? null,
    [detailEventId, events]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePass = (id: string) => {
    setPassedEventIds(prev => new Set([...prev, id]));
    passCountRef.current += 1;
    // Show feedback prompt every 3rd pass
    if (passCountRef.current % 3 === 0) {
      const ev = events.find(e => e.id === id);
      if (ev) setPassFeedback({ eventId: id, title: ev.title });
    }
  };

  const handleLater = (id: string) => {
    setLaterEventIds(prev => new Set([...prev, id]));
  };

  const handleTagToggle = (tag: string) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  // ── Render ────────────────────────────────────────────────────────────────
  const laterCount  = laterEventIds.size;
  const passedCount = passedEventIds.size;
  const hasHiddenEvents = laterCount > 0 || passedCount > 0;

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, color: C.text, fontFamily: dmSans.style.fontFamily }}>
      <CompassHeader isSyncing={isSyncing} onSync={handleSync} activePage="for-you" />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 80px" }}>

        {/* Heading */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: C.sage }}>
            ✨ Personalized
          </span>
          <h1 style={{ margin: "6px 0 6px", fontSize: 26, fontWeight: 700, color: C.text }}>
            For You
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: C.textLight, lineHeight: 1.6 }}>
            Events matched to your priorities.
          </p>
        </div>

        {/* Swipe hint */}
        <div style={{
          display: "flex", gap: 16, marginBottom: 20,
          fontSize: 11, color: C.textMuted, fontWeight: 500,
          letterSpacing: "0.02em",
        }}>
          <span>← swipe to pass</span>
          <span style={{ color: C.border }}>·</span>
          <span>tap to learn more</span>
          <span style={{ color: C.border }}>·</span>
          <span>swipe right for later →</span>
        </div>

        {/* Tag filter pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 24, alignItems: "center" }}>
          {TAGS.map(tag => {
            const active = selectedTags.includes(tag.label);
            return (
              <button
                key={tag.label}
                type="button"
                onClick={() => handleTagToggle(tag.label)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 12px", borderRadius: 100,
                  border: `1px solid ${active ? C.sage : C.border}`,
                  background: active ? C.sageLight : "#fff",
                  color: active ? C.sageDark : C.textMuted,
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  cursor: "pointer", transition: "all 0.12s",
                  boxShadow: active ? "none" : shadow.sm,
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
              >
                <span style={{ fontSize: 12 }}>{tag.emoji}</span>{tag.label}
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              style={{ border: "none", background: "none", padding: "4px 8px", fontSize: 11, color: C.terra, cursor: "pointer" }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Event list */}
        {listEvents.length > 0 ? (
          listEvents.map(event => {
            const matched = getMatchedTags(event);
            return (
              <ForYouRow
                key={event.id}
                event={event}
                matchedTags={matched}
                whyItMatches={getWhyItMatches(event, matched)}
                isSaving={savingEventId === event.id}
                onSave={handleToggleSave}
                onPass={handlePass}
                onLater={handleLater}
                onViewDetails={setDetailEventId}
              />
            );
          })
        ) : (
          /* Empty state */
          <div style={{
            padding: "56px 32px", textAlign: "center",
            borderRadius: 20, border: `1px solid ${C.border}`,
            background: C.surface, boxShadow: shadow.sm,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: C.text }}>
              All caught up
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: C.textLight, maxWidth: 280, marginInline: "auto" }}>
              {hasHiddenEvents
                ? "You've triaged everything for now."
                : "No upcoming events matched right now. Check back after the next sync."}
            </p>
            {hasHiddenEvents && (
              <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                {laterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setLaterEventIds(new Set())}
                    style={{
                      padding: "8px 18px", borderRadius: 100,
                      border: `1px solid ${C.border}`, background: C.surface,
                      fontSize: 12, fontWeight: 500, color: C.textMuted, cursor: "pointer",
                      transition: "border-color 0.12s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
                  >
                    Show {laterCount} held for later
                  </button>
                )}
                {passedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setPassedEventIds(new Set())}
                    style={{
                      padding: "8px 18px", borderRadius: 100,
                      border: `1px solid ${C.border}`, background: C.surface,
                      fontSize: 12, fontWeight: 500, color: C.textMuted, cursor: "pointer",
                      transition: "border-color 0.12s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
                  >
                    Show {passedCount} passed
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Event detail modal */}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          isSaved={savedEventIds.has(detailEvent.id)}
          isSaving={savingEventId === detailEvent.id}
          onToggleSave={handleToggleSave}
          onStartReflection={() => {}}
          onClose={() => setDetailEventId(null)}
        />
      )}

      {/* Pass feedback prompt */}
      {passFeedback && (
        <PassFeedbackPrompt
          eventTitle={passFeedback.title}
          onSelect={(_reason) => setPassFeedback(null)}
          onDismiss={() => setPassFeedback(null)}
        />
      )}
    </div>
  );
}
