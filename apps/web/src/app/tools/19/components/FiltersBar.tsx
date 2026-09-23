import { C, shadow } from "../lib/tokens";
import { TAGS } from "../lib/tags";
import type { TimeFilter } from "../lib/types";

export type FiltersBarProps = {
  activeTab: "discover" | "saved";
  savedCount: number;
  onTabChange: (tab: "discover" | "saved") => void;
  query: string;
  onQueryChange: (value: string) => void;
  timeFilter: TimeFilter;
  onTimeFilterChange: (value: TimeFilter) => void;
  organizerFilter: string;
  organizerOptions: string[];
  onOrganizerFilterChange: (value: string) => void;
  sortBy: "soonest" | "latest";
  onSortByChange: (value: "soonest" | "latest") => void;
  // Tag bar — drives the "You May Like" deck
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  onClearTags: () => void;
};

const sel: React.CSSProperties = {
  borderRadius: 9, border: `1px solid ${C.stoneBorder}`,
  background: C.surface, padding: "7px 12px",
  fontSize: 12, fontWeight: 500, color: C.textMuted,
  boxShadow: shadow.sm, cursor: "pointer", outline: "none",
};

export function FiltersBar({
  activeTab, savedCount, onTabChange,
  query, onQueryChange,
  timeFilter, onTimeFilterChange,
  organizerFilter, organizerOptions, onOrganizerFilterChange,
  sortBy, onSortByChange,
  selectedTags, onTagToggle, onClearTags,
}: FiltersBarProps) {
  return (
    <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Tabs + Search + Dropdowns ────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {/* Tab pills */}
        <div style={{ display: "inline-flex", gap: 3, padding: 3, background: C.surfaceWarm, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          {(["discover", "saved"] as const).map(tab => {
            const active = activeTab === tab;
            return (
              <button key={tab} type="button" onClick={() => onTabChange(tab)} style={{
                padding: "6px 16px", borderRadius: 7, border: "none",
                background: active ? C.surface : "transparent",
                color: active ? C.text : C.textLight,
                fontSize: 12, fontWeight: active ? 600 : 500,
                cursor: "pointer", boxShadow: active ? shadow.sm : "none",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}>
                {tab === "discover" ? "Discover" : `Saved (${savedCount})`}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 280 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={C.taupe} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" value={query} onChange={e => onQueryChange(e.target.value)} placeholder="Search events…" style={{
            width: "100%", boxSizing: "border-box",
            borderRadius: 9, border: `1px solid ${C.stoneBorder}`,
            background: C.surface, padding: "7px 12px 7px 30px",
            fontSize: 12, fontWeight: 500, color: C.text,
            boxShadow: shadow.sm, outline: "none",
          }} />
        </div>

        {/* Discover-only dropdowns */}
        {activeTab === "discover" && (
          <>
            <select value={timeFilter} onChange={e => onTimeFilterChange(e.target.value as TimeFilter)} style={sel}>
              <option value="upcoming">Upcoming only</option>
              <option value="all">All events</option>
            </select>
            {organizerOptions.length > 0 && (
              <select value={organizerFilter} onChange={e => onOrganizerFilterChange(e.target.value)} style={sel}>
                <option value="all">All organizers</option>
                {organizerOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            <select value={sortBy} onChange={e => onSortByChange(e.target.value as "soonest" | "latest")} style={sel}>
              <option value="soonest">Soonest first</option>
              <option value="latest">Latest first</option>
            </select>
          </>
        )}
      </div>

      {/* ── Interest tag pills (discover only) ───────────────────────────── */}
      {activeTab === "discover" && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.taupe, textTransform: "uppercase", letterSpacing: "0.1em", marginRight: 2, whiteSpace: "nowrap" }}>
            Interests:
          </span>
          {TAGS.map(tag => {
            const active = selectedTags.includes(tag.label);
            return (
              <button key={tag.label} type="button" onClick={() => onTagToggle(tag.label)} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 12px", borderRadius: 100,
                border: `1px solid ${active ? C.sage : C.border}`,
                background: active ? C.sageLight : C.surface,
                color: active ? C.sageDark : C.textMuted,
                fontSize: 12, fontWeight: active ? 600 : 400,
                cursor: "pointer", transition: "all 0.12s",
                boxShadow: active ? "none" : shadow.sm,
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
              >
                <span style={{ fontSize: 13 }}>{tag.emoji}</span>
                {tag.label}
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button type="button" onClick={onClearTags} style={{
              border: "none", background: "none", padding: "4px 8px",
              fontSize: 11, color: C.terra, cursor: "pointer",
            }}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
