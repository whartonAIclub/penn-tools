"use client";

import { useMemo, useState } from "react";
import { DM_Sans } from "next/font/google";
import { C } from "./lib/tokens";
import { matchesTags } from "./lib/tags";
import { getWeekKey, getAvailableWeeks } from "./lib/weeks";
import { CompassHeader } from "./components/CompassHeader";
import { DashboardHero } from "./components/DashboardHero";
import { FiltersBar } from "./components/FiltersBar";
import { DiscoverDeck } from "./components/DiscoverDeck";
import { EventList } from "./components/EventList";
import { ReflectionModal } from "./components/ReflectionModal";
import { SavedEventsModule } from "./components/SavedEventsModule";
import { useAnonymousIdentity } from "./hooks/useAnonymousIdentity";
import { useCompassEvents } from "./hooks/useCompassEvents";
import { useSavedEvents } from "./hooks/useSavedEvents";
import { useReflections } from "./hooks/useReflections";
import type { TimeFilter } from "./lib/types";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function CompassPage() {
  const adminHeaderValue = process.env.NEXT_PUBLIC_TOOL19_ADMIN_KEY || "";
  const { userId: anonUserId } = useAnonymousIdentity();
  const anonRequestHeaders = useMemo<Record<string, string> | undefined>(() => {
    if (!anonUserId) return undefined;
    return { "x-tool-anon-id": anonUserId };
  }, [anonUserId]);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]               = useState<"discover" | "saved">("discover");
  const [query, setQuery]                       = useState("");
  const [timeFilter, setTimeFilter]             = useState<TimeFilter>("upcoming");
  const [organizerFilter, setOrganizerFilter]   = useState("all");
  const [sortBy, setSortBy]                     = useState<"soonest" | "latest">("soonest");
  const [selectedTags, setSelectedTags]         = useState<string[]>([]);
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(new Set());

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { events, eventsError, isLoadingEvents, isSyncing, syncSuccess, syncFailure, lastRunAt, handleSync } =
    useCompassEvents({ adminHeaderValue, timeFilter });

  const { savedEvents, savedEventsError, isLoadingSavedEvents, savingEventId, handleToggleSave, savedEventIds } =
    useSavedEvents({ anonRequestHeaders, adminHeaderValue, events });

  const {
    reflectionsByEventId, reflectionsError,
    editingReflectionEventId, reflectionDrafts, savingReflectionEventId,
    handleStartReflectionEdit, handleReflectionDraftChange,
    handleCancelReflectionEdit, handleSaveReflection, handleDeleteReflection,
    editingEvent,
  } = useReflections({ anonRequestHeaders, events, savedEvents });

  // ── Derived data ──────────────────────────────────────────────────────────
  const organizerOptions = useMemo(() => {
    const vals = new Set<string>();
    for (const e of events) { if (e.organizer?.trim()) vals.add(e.organizer.trim()); }
    return Array.from(vals).sort((a, b) => a.localeCompare(b));
  }, [events]);

  // "You May Like" deck: upcoming, not dismissed, not already saved.
  // When tags selected → filter by tags. When no tags → show recent upcoming.
  const deckEvents = useMemo(() => {
    const now = Date.now();
    const base = events
      .filter(e => new Date(e.start_time).getTime() >= now)
      .filter(e => !dismissedEventIds.has(e.id))
      .filter(e => !savedEventIds.has(e.id))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    const matched = selectedTags.length > 0
      ? base.filter(e => matchesTags(e, selectedTags))
      : base;

    return matched.slice(0, 10);
  }, [events, dismissedEventIds, savedEventIds, selectedTags]);

  // Browse list: standard search/filter/sort
  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const term = query.trim().toLowerCase();
    const list = events.filter(e => {
      if (timeFilter === "upcoming" && new Date(e.start_time).getTime() < now) return false;
      if (organizerFilter !== "all" && (e.organizer?.trim() ?? "") !== organizerFilter) return false;
      if (term) {
        const hay = [e.title, e.description ?? "", e.organizer ?? "", e.location ?? ""].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const diff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      return sortBy === "soonest" ? diff : -diff;
    });
    return list;
  }, [events, timeFilter, organizerFilter, query, sortBy]);

  const displayedEvents = activeTab === "saved" ? savedEvents : filteredEvents;

  const upcomingCount   = useMemo(() => events.filter(e => new Date(e.start_time).getTime() >= Date.now()).length, [events]);
  const savedCount      = savedEvents.length;
  const reflectionCount = Object.keys(reflectionsByEventId).length;

  const handleTagToggle  = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  const handleClearTags  = () => setSelectedTags([]);
  const handleDismiss    = (id: string) => setDismissedEventIds(prev => new Set([...prev, id]));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, color: C.text, fontFamily: dmSans.style.fontFamily }}>
      <CompassHeader isSyncing={isSyncing} onSync={handleSync} />

      <main style={{ maxWidth: 1152, margin: "0 auto", padding: "28px 24px 80px" }}>

        <DashboardHero />

        {/* Stats */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 32 }}>
          {([
            { emoji: "📅", value: upcomingCount,   label: "Upcoming",    color: C.sage,      bg: C.sageLight  },
            { emoji: "🔖", value: savedCount,       label: "Saved",       color: C.terra,     bg: C.terraLight },
            { emoji: "✨", value: reflectionCount,  label: "Reflections", color: C.textLight, bg: "rgba(138,123,109,0.10)" },
          ] as const).map(({ emoji, value, label, color, bg }) => (
            <article key={label} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 18px", borderRadius: 14,
              border: `1px solid ${C.border}`, background: C.surface,
              boxShadow: "0 1px 3px rgba(44,26,14,0.06)",
            }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{emoji}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color }}>{value}</div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: C.taupe, marginTop: 2 }}>{label}</div>
              </div>
            </article>
          ))}
        </section>

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

        {/* Saved Events module */}
        <SavedEventsModule
          savedEvents={savedEvents}
          reflectionsByEventId={reflectionsByEventId}
          onStartReflection={handleStartReflectionEdit}
          onViewAll={() => setActiveTab("saved")}
        />

        {/* ── "You May Like" section ────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>You May Like</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: C.textLight }}>
                {selectedTags.length > 0
                  ? `Filtered by: ${selectedTags.join(", ")} — set interests below to refine`
                  : "Showing upcoming events — set interests below to personalize"}
              </p>
            </div>
            {dismissedEventIds.size > 0 && (
              <button type="button" onClick={() => setDismissedEventIds(new Set())} style={{
                border: "none", background: "none", fontSize: 11, color: C.terra, cursor: "pointer",
              }}>
                Reset deck
              </button>
            )}
          </div>

          <DiscoverDeck
            events={deckEvents}
            savedEventIds={savedEventIds}
            savingEventId={savingEventId}
            onSave={handleToggleSave}
            onDismiss={handleDismiss}
            totalFiltered={deckEvents.length}
          />
        </section>

        {/* ── Browse section ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <span style={{ flex: 1, height: 1, background: C.border }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: C.taupe }}>
            {activeTab === "saved" ? "Your saved events" : "Browse all events"}
          </span>
          <span style={{ flex: 1, height: 1, background: C.border }} />
        </div>

        <FiltersBar
          activeTab={activeTab}
          savedCount={savedCount}
          onTabChange={setActiveTab}
          query={query}
          onQueryChange={setQuery}
          timeFilter={timeFilter}
          onTimeFilterChange={setTimeFilter}
          organizerFilter={organizerFilter}
          organizerOptions={organizerOptions}
          onOrganizerFilterChange={setOrganizerFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
          onClearTags={handleClearTags}
        />

        {(eventsError || savedEventsError || reflectionsError) && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.terraBorder}`, background: C.terraLight, fontSize: 12, color: C.terraDark }}>
            {eventsError || savedEventsError || reflectionsError}
          </div>
        )}

        <EventList
          isLoadingEvents={isLoadingEvents}
          isLoadingSavedEvents={isLoadingSavedEvents}
          displayedEvents={displayedEvents}
          activeTab={activeTab}
          savedEventIds={savedEventIds}
          savingEventId={savingEventId}
          reflectionsByEventId={reflectionsByEventId}
          onToggleSave={handleToggleSave}
          onStartReflection={handleStartReflectionEdit}
        />
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
