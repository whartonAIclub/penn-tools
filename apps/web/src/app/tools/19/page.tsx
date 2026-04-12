"use client";

import { useMemo, useState } from "react";
import { DM_Sans } from "next/font/google";
import { C } from "./lib/tokens";
import { CompassHeader } from "./components/CompassHeader";
import { PriorityDashboard } from "./components/PriorityDashboard";
import { ReflectionModal } from "./components/ReflectionModal";
import { EventDetailModal } from "./components/EventDetailModal";
import { useAnonymousIdentity } from "./hooks/useAnonymousIdentity";
import { useCompassEvents } from "./hooks/useCompassEvents";
import { useSavedEvents } from "./hooks/useSavedEvents";
import { useReflections } from "./hooks/useReflections";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function CompassPage() {
  const adminHeaderValue = process.env.NEXT_PUBLIC_TOOL19_ADMIN_KEY || "";
  const { userId: anonUserId } = useAnonymousIdentity();
  const anonRequestHeaders = useMemo<Record<string, string> | undefined>(() => {
    if (!anonUserId) return undefined;
    return { "x-tool-anon-id": anonUserId };
  }, [anonUserId]);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [detailEventId, setDetailEventId] = useState<string | null>(null);

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { events, eventsError, isSyncing, syncSuccess, syncFailure, lastRunAt, handleSync } =
    useCompassEvents({ adminHeaderValue, timeFilter: "upcoming" });

  const { savedEvents, savedEventsError, savingEventId, handleToggleSave, savedEventIds } =
    useSavedEvents({ anonRequestHeaders, adminHeaderValue, events });

  const {
    reflectionsByEventId, reflectionsError,
    editingReflectionEventId, reflectionDrafts, savingReflectionEventId,
    handleStartReflectionEdit, handleReflectionDraftChange,
    handleCancelReflectionEdit, handleSaveReflection, handleDeleteReflection,
    editingEvent,
  } = useReflections({ anonRequestHeaders, events, savedEvents });

  // ── Derived ───────────────────────────────────────────────────────────────
  const detailEvent = useMemo(
    () => events.find(e => e.id === detailEventId) ?? savedEvents.find(e => e.id === detailEventId) ?? null,
    [detailEventId, events, savedEvents]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, color: C.text, fontFamily: dmSans.style.fontFamily }}>
      <CompassHeader isSyncing={isSyncing} onSync={handleSync} activePage="home" />

      <main style={{ maxWidth: 1152, margin: "0 auto", padding: "28px 24px 80px" }}>

        <PriorityDashboard
          events={events}
          savedEvents={savedEvents}
          reflectionsByEventId={reflectionsByEventId}
          savedEventIds={savedEventIds}
          onSaveEvent={handleToggleSave}
          onStartReflection={handleStartReflectionEdit}
        />

        {/* Sync banners */}
        {syncSuccess && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.sageBorder}`, background: C.sageLight, fontSize: 12, color: C.sageDark }}>
            Sync complete: {syncSuccess.inserted} inserted, {syncSuccess.updated} updated ({syncSuccess.durationMs}ms)
            {lastRunAt && <span style={{ marginLeft: 8, color: C.textLight }}>Last synced: {lastRunAt}</span>}
          </div>
        )}
        {syncFailure && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.terraBorder}`, background: C.terraLight, fontSize: 12, color: C.terraDark }}>
            Sync error: {syncFailure.error}
          </div>
        )}
        {(eventsError || savedEventsError || reflectionsError) && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.terraBorder}`, background: C.terraLight, fontSize: 12, color: C.terraDark }}>
            {eventsError || savedEventsError || reflectionsError}
          </div>
        )}

      </main>

      {/* Event detail modal */}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          isSaved={savedEventIds.has(detailEvent.id)}
          isSaving={savingEventId === detailEvent.id}
          {...(reflectionsByEventId[detailEvent.id] ? { reflection: reflectionsByEventId[detailEvent.id] } : {})}
          onToggleSave={handleToggleSave}
          onStartReflection={eventId => { handleStartReflectionEdit(eventId); }}
          onClose={() => setDetailEventId(null)}
        />
      )}

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
