import { C, shadow } from "../lib/tokens";
import { EventCard } from "./EventCard";
import type { EventItem, ReflectionItem } from "../lib/types";

const SPIN_CSS = `@keyframes el-spin { to { transform: rotate(360deg); } }`;

type EventListProps = {
  isLoadingEvents: boolean;
  isLoadingSavedEvents: boolean;
  displayedEvents: EventItem[];
  activeTab: "discover" | "saved";
  savedEventIds: Set<string>;
  savingEventId: string | null;
  reflectionsByEventId: Record<string, ReflectionItem>;
  onToggleSave: (eventId: string) => void;
  onStartReflection: (eventId: string) => void;
};

function CalendarEmptyIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.taupe} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function EventList({
  isLoadingEvents, isLoadingSavedEvents, displayedEvents,
  activeTab, savedEventIds, savingEventId, reflectionsByEventId,
  onToggleSave, onStartReflection,
}: EventListProps) {
  if (isLoadingEvents || isLoadingSavedEvents) {
    return (
      <>
        <style>{SPIN_CSS}</style>
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: `2.5px solid ${C.border}`,
            borderTopColor: C.sage,
            animation: "el-spin 0.8s linear infinite",
          }} />
        </div>
      </>
    );
  }

  return (
    <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      {displayedEvents.length === 0 ? (
        <li style={{
          listStyle: "none",
          borderRadius: 20,
          border: `1px solid ${C.border}`,
          background: C.surface,
          padding: "56px 32px",
          textAlign: "center",
          boxShadow: shadow.sm,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: C.surfaceWarm,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <CalendarEmptyIcon />
          </div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: C.text }}>
            {activeTab === "saved" ? "No saved events yet" : "No events found"}
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: C.textLight, maxWidth: 300, marginInline: "auto" }}>
            {activeTab === "saved"
              ? "Save events you're interested in to see them here."
              : "Try adjusting your filters or search query."}
          </p>
        </li>
      ) : (
        displayedEvents.map(event => (
          <EventCard
            key={event.id}
            event={event}
            isSaved={savedEventIds.has(event.id)}
            isSaving={savingEventId === event.id}
            onToggleSave={onToggleSave}
            reflection={reflectionsByEventId[event.id]}
            onStartReflection={onStartReflection}
          />
        ))
      )}
    </ul>
  );
}
