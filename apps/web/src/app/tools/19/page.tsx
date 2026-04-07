"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DM_Sans } from "next/font/google";

// ── Font ─────────────────────────────────────────────────────────────────────
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// ── Design tokens ────────────────────────────────────────────────────────────
// bg:        #FAF8F4  warm off-white
// primary:   #7A9E7E  sage green
// secondary: #C4704F  terracotta
// neutral:   #B5A898  warm taupe
// text:      #2C1A0E  dark warm brown

// ── Types ─────────────────────────────────────────────────────────────────────
type SyncSuccess = {
  success: true;
  inserted: number;
  updated: number;
  total: number;
  durationMs: number;
};

type SyncFailure = {
  error: string;
  durationMs?: number;
};

type EventItem = {
  id: string;
  external_event_id: string;
  calendar_title: string | null;
  title: string;
  description: string | null;
  organizer: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  registration_url: string | null;
  source_feed: string;
  last_synced_at: string;
  description_preview?: string | null;
  details_text?: string | null;
  date_summary?: string | null;
  cost_summary?: string | null;
  payment_summary?: string | null;
  dress_code?: string | null;
  included_items?: string[];
  info_deck_url?: string | null;
  details_url?: string | null;
};

type EventsSuccess = { events: EventItem[] };
type EventsFailure = { error: string };

type SavedEventsSuccess = { savedEvents: EventItem[] };
type SavedEventsFailure = { error: string };

type SavedMutationSuccess = {
  eventId: string;
  saved: boolean;
};

type SavedMutationFailure = { error: string };

type ReflectionItem = {
  event_id: string;
  reflection_text: string;
  updated_at: string;
};

type ReflectionsSuccess = { reflections: ReflectionItem[] };
type ReflectionsFailure = { error: string };

type ReflectionMutationSuccess = { reflection: ReflectionItem };
type ReflectionMutationFailure = { error: string };

// ── Anonymous Identity Hook ──────────────────────────────────────────────────
function useAnonymousIdentity() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("compass_anon_id");
    if (stored) {
      setUserId(stored);
    } else {
      const newId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem("compass_anon_id", newId);
      setUserId(newId);
    }
  }, []);

  return { userId };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function parseApiJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return (await response.json()) as T;
  }
  const text = await response.text();
  const snippet = text.slice(0, 120).replace(/\s+/g, " ").trim();
  throw new Error(
    `API returned non-JSON (status ${response.status}). ${snippet || "Empty response."}`
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  const totalHours = Math.round(((end - start) / (1000 * 60 * 60)) * 10) / 10;
  if (totalHours < 24) {
    return `${totalHours}h`;
  }

  const days = Math.round((totalHours / 24) * 10) / 10;
  return `${days}d`;
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function sortByStartTime(items: EventItem[]): EventItem[] {
  return [...items].sort(
    (left, right) =>
      new Date(left.start_time).getTime() - new Date(right.start_time).getTime()
  );
}

const ICON_SHRINK_STYLE: React.CSSProperties = {
  transform: "scale(0.1142857)",
  transformOrigin: "center",
};

// ── Icons ─────────────────────────────────────────────────────────────────────
function CompassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function BookmarkIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} style={ICON_SHRINK_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accentColor = "sage",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accentColor?: "sage" | "terracotta" | "taupe";
}) {
  const colorMap = {
    sage: "bg-[#7A9E7E]/10 text-[#4B7352]",
    terracotta: "bg-[#C4704F]/10 text-[#A35838]",
    taupe: "bg-[#B5A898]/15 text-[#6E6257]",
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm transition-all duration-200 hover:border-[#7A9E7E]/30 hover:shadow-md">
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorMap[accentColor]} transition-transform duration-200 group-hover:scale-105`}>
          {icon}
        </span>
        <div className="flex-1">
          <p className="text-3xl font-bold tracking-tight text-[#2C1A0E]">{value}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-[#B5A898]">
            {label}
          </p>
        </div>
      </div>
    </article>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-[#7A9E7E] text-white shadow-sm"
          : "bg-white text-[#6E6257] ring-1 ring-[#E8E4DC] hover:bg-[#F5F2ED] hover:ring-[#B5A898]/50"
      }`}
    >
      {children}
    </button>
  );
}

function EventCard({
  event,
  isSaved,
  isSaving,
  onToggleSave,
  reflection,
  onStartReflection,
}: {
  event: EventItem;
  isSaved: boolean;
  isSaving: boolean;
  onToggleSave: (eventId: string) => void;
  reflection?: ReflectionItem | undefined;
  onStartReflection: (eventId: string) => void;
}) {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const isPast = start.getTime() < Date.now();
  const [isExpanded, setIsExpanded] = useState(false);

  const includedItems = Array.isArray(event.included_items)
    ? event.included_items.slice(0, 6)
    : [];
  const detailsText = event.details_text || event.description || null;
  const descriptionPreview = event.description_preview || event.description || null;
  const duration = formatDuration(event.start_time, event.end_time);
  const hasExpandableDetails = Boolean(detailsText && detailsText !== descriptionPreview);

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-sm transition-all duration-300 hover:border-[#7A9E7E]/40 hover:shadow-lg">
      {/* Top accent gradient */}
      <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-[#7A9E7E] to-[#8FB093]" />

      <div className="flex flex-col gap-5 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            {/* Date badge */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#7A9E7E]/10 px-3 py-1.5 text-xs font-semibold text-[#4B7352]">
                <CalendarIcon className="h-3.5 w-3.5" />
                {formatDate(event.start_time)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F5F2ED] px-3 py-1.5 text-xs font-medium text-[#6E6257]">
                <ClockIcon className="h-3.5 w-3.5" />
                {formatTime(event.start_time)}
                {end ? ` - ${formatTime(event.end_time!)}` : ""}
              </span>
              {isPast && (
                <span className="rounded-lg bg-[#B5A898]/15 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6D]">
                  Past
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="text-lg font-semibold leading-snug text-[#2C1A0E] sm:text-xl">
              {event.title}
            </h3>
          </div>

          {/* Save button */}
          <button
            type="button"
            aria-label="Save event"
            aria-pressed={isSaved}
            onClick={() => onToggleSave(event.id)}
            disabled={isSaving}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
              isSaved
                ? "bg-[#7A9E7E] text-white shadow-sm"
                : "bg-[#F5F2ED] text-[#6E6257] hover:bg-[#7A9E7E]/10 hover:text-[#4B7352]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <BookmarkIcon className="h-4 w-4" filled={isSaved} />
            <span>{isSaving ? "Saving..." : isSaved ? "Saved" : "Save"}</span>
          </button>
        </div>

        {/* Description */}
        {descriptionPreview && (
          <p className="text-sm leading-relaxed text-[#2C1A0E]/70">
            {descriptionPreview}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {event.date_summary && (
            <span className="rounded-lg border border-[#7A9E7E]/20 bg-[#7A9E7E]/5 px-3 py-1.5 text-xs font-medium text-[#4B7352]">
              {shorten(event.date_summary, 52)}
            </span>
          )}
          {event.cost_summary && (
            <span className="rounded-lg border border-[#C4704F]/20 bg-[#C4704F]/5 px-3 py-1.5 text-xs font-medium text-[#A35838]">
              {shorten(event.cost_summary, 64)}
            </span>
          )}
          {event.payment_summary && (
            <span className="rounded-lg border border-[#B5A898]/25 bg-[#F5F2ED] px-3 py-1.5 text-xs font-medium text-[#6E6257]">
              {shorten(event.payment_summary, 72)}
            </span>
          )}
          {event.dress_code && (
            <span className="rounded-lg border border-[#7A9E7E]/20 bg-[#7A9E7E]/5 px-3 py-1.5 text-xs font-medium text-[#4B7352]">
              {event.dress_code}
            </span>
          )}
          {duration && (
            <span className="rounded-lg border border-[#B5A898]/25 bg-[#F5F2ED] px-3 py-1.5 text-xs font-medium text-[#6E6257]">
              {duration}
            </span>
          )}
        </div>

        {/* Included items */}
        {includedItems.length > 0 && (
          <ul className="space-y-1.5 rounded-xl border border-[#E8E4DC] bg-[#FDFCFA] p-4 text-sm text-[#2C1A0E]/75">
            {includedItems.map((item, index) => (
              <li key={`${event.id}-included-${index}`} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#7A9E7E]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-4 border-t border-[#E8E4DC] pt-4 text-sm text-[#8A7B6D]">
          {event.organizer && (
            <span className="flex items-center gap-1.5">
              <UserIcon className="h-4 w-4" />
              <span>{event.organizer}</span>
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1.5">
              <MapPinIcon className="h-4 w-4" />
              <span>{event.location}</span>
            </span>
          )}
          {event.calendar_title && (
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4" />
              <span>{event.calendar_title}</span>
            </span>
          )}
        </div>

        {/* Expandable details */}
        {hasExpandableDetails && (
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="flex items-center gap-1.5 text-sm font-medium text-[#4B7352] transition-colors hover:text-[#3F6C46]"
          >
            <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
            <span>{isExpanded ? "Hide details" : "Show details"}</span>
          </button>
        )}

        {isExpanded && detailsText && (
          <div className="rounded-xl border border-[#E8E4DC] bg-[#FDFCFA] p-4 text-sm leading-relaxed text-[#2C1A0E]/75">
            {detailsText}
          </div>
        )}

        {/* Reflection */}
        {reflection && (
          <div className="rounded-xl border border-[#7A9E7E]/20 bg-[#7A9E7E]/5 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#4B7352]">
              <SparklesIcon className="h-4 w-4" />
              <span>Your Reflection</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#2C1A0E]/80">
              {reflection.reflection_text}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[#E8E4DC] pt-4">
          {event.registration_url && (
            <a
              href={event.registration_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#C4704F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#A35838] hover:shadow-md"
            >
              Register
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
          )}
          {event.info_deck_url && (
            <a
              href={event.info_deck_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[#E8E4DC] bg-white px-4 py-2.5 text-sm font-medium text-[#6E6257] transition-all duration-200 hover:border-[#7A9E7E] hover:text-[#4B7352]"
            >
              Info Deck
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          )}
          {event.details_url && event.details_url !== event.registration_url && (
            <a
              href={event.details_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[#E8E4DC] bg-white px-4 py-2.5 text-sm font-medium text-[#6E6257] transition-all duration-200 hover:border-[#7A9E7E] hover:text-[#4B7352]"
            >
              Event Details
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onStartReflection(event.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E8E4DC] bg-white px-4 py-2.5 text-sm font-medium text-[#6E6257] transition-all duration-200 hover:border-[#7A9E7E] hover:text-[#4B7352]"
          >
            <SparklesIcon className="h-4 w-4" />
            {reflection ? "Edit Reflection" : "Add Reflection"}
          </button>
        </div>
      </div>
    </li>
  );
}

function ReflectionModal({
  event,
  existingReflection,
  draft,
  onDraftChange,
  onSave,
  onDelete,
  onClose,
  isSaving,
}: {
  event: EventItem;
  existingReflection?: ReflectionItem | undefined;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#2C1A0E]/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-[#E8E4DC] bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-[#E8E4DC] bg-gradient-to-r from-[#7A9E7E]/10 to-transparent p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#7A9E7E]">
                <SparklesIcon className="h-4 w-4" />
                <span>Reflection</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold text-[#2C1A0E]">
                {event.title}
              </h3>
              <p className="mt-1 text-sm text-[#8A7B6D]">
                {formatDate(event.start_time)} at {formatTime(event.start_time)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[#8A7B6D] transition-colors hover:bg-[#F5F2ED] hover:text-[#2C1A0E]"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <label className="block">
            <span className="text-sm font-medium text-[#2C1A0E]">
              What did you learn or take away from this event?
            </span>
            <textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="Share your thoughts, insights, or key takeaways..."
              rows={5}
              className="mt-3 w-full resize-none rounded-xl border border-[#E8E4DC] bg-[#FDFCFA] px-4 py-3 text-sm text-[#2C1A0E] placeholder:text-[#B5A898] focus:border-[#7A9E7E] focus:outline-none focus:ring-2 focus:ring-[#7A9E7E]/20"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E8E4DC] bg-[#FDFCFA] p-4">
          <div>
            {existingReflection && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isSaving}
                className="text-sm font-medium text-[#C4704F] transition-colors hover:text-[#A35838] disabled:opacity-50"
              >
                Delete reflection
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-[#6E6257] transition-colors hover:bg-[#F5F2ED]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !draft.trim()}
              className="rounded-xl bg-[#7A9E7E] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#6B8D6F] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Reflection"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CompassPage() {
  const adminHeaderValue = process.env.NEXT_PUBLIC_TOOL19_ADMIN_KEY || "";
  const { userId: anonUserId } = useAnonymousIdentity();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isLoadingSavedEvents, setIsLoadingSavedEvents] = useState(false);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<SyncSuccess | null>(null);
  const [syncFailure, setSyncFailure] = useState<SyncFailure | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [savedEvents, setSavedEvents] = useState<EventItem[]>([]);
  const [reflectionsByEventId, setReflectionsByEventId] = useState<
    Record<string, ReflectionItem>
  >({});
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [savedEventsError, setSavedEventsError] = useState<string | null>(null);
  const [reflectionsError, setReflectionsError] = useState<string | null>(null);
  const [isLoadingReflections, setIsLoadingReflections] = useState(false);
  const [editingReflectionEventId, setEditingReflectionEventId] = useState<
    string | null
  >(null);
  const [reflectionDrafts, setReflectionDrafts] = useState<Record<string, string>>({});
  const [savingReflectionEventId, setSavingReflectionEventId] = useState<
    string | null
  >(null);
  const anonRequestHeaders = useMemo(() => {
    if (!anonUserId) return undefined;

    return {
      "x-tool-anon-id": anonUserId,
    };
  }, [anonUserId]);

  const [query, setQuery] = useState("");
  const [organizerFilter, setOrganizerFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState<"upcoming" | "all">("upcoming");
  const [sortBy, setSortBy] = useState<"soonest" | "latest">("soonest");
  const [activeTab, setActiveTab] = useState<"discover" | "saved">("discover");

  // ── Data fetching ────────────────────────────────────────────────────────────
  const loadEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    setEventsError(null);
    try {
      const requestInit: RequestInit = { method: "GET" };
      if (adminHeaderValue) {
        requestInit.headers = { "x-tool-admin-key": adminHeaderValue };
      }
      const queryParams = new URLSearchParams();
      queryParams.set("time", timeFilter);
      if (timeFilter === "all") {
        queryParams.set("limit", "500");
      }
      const res = await fetch(
        `/tools/19/api/events?${queryParams.toString()}`,
        requestInit
      );
      const body = await parseApiJson<EventsSuccess | EventsFailure>(res);
      if (!res.ok) {
        setEvents([]);
        setEventsError(
          "error" in body && body.error
            ? body.error
            : "Failed to load events."
        );
        return;
      }
      if (!("events" in body) || !Array.isArray(body.events)) {
        setEvents([]);
        setEventsError("Events response was not in expected format.");
        return;
      }
      setEvents(body.events);
    } catch (error) {
      setEvents([]);
      setEventsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingEvents(false);
    }
  }, [adminHeaderValue, timeFilter]);

  const loadSavedEvents = useCallback(async () => {
    if (!anonRequestHeaders) return;

    setIsLoadingSavedEvents(true);
    setSavedEventsError(null);
    try {
      const res = await fetch("/tools/19/api/saved", {
        method: "GET",
        headers: anonRequestHeaders,
      });
      const body = await parseApiJson<SavedEventsSuccess | SavedEventsFailure>(res);
      if (!res.ok) {
        setSavedEvents([]);
        setSavedEventsError(
          "error" in body && body.error
            ? body.error
            : "Failed to load saved events."
        );
        return;
      }
      if (!("savedEvents" in body) || !Array.isArray(body.savedEvents)) {
        setSavedEvents([]);
        setSavedEventsError("Saved events response was not in expected format.");
        return;
      }
      setSavedEvents(body.savedEvents);
    } catch (error) {
      setSavedEvents([]);
      setSavedEventsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingSavedEvents(false);
    }
  }, [anonRequestHeaders]);

  const loadReflections = useCallback(async () => {
    if (!anonRequestHeaders) return;

    setIsLoadingReflections(true);
    setReflectionsError(null);
    try {
      const res = await fetch("/tools/19/api/reflections", {
        method: "GET",
        headers: anonRequestHeaders,
      });
      const body = await parseApiJson<ReflectionsSuccess | ReflectionsFailure>(res);

      if (!res.ok) {
        setReflectionsByEventId({});
        setReflectionsError(
          "error" in body && body.error
            ? body.error
            : "Failed to load reflections."
        );
        return;
      }

      if (!("reflections" in body) || !Array.isArray(body.reflections)) {
        setReflectionsByEventId({});
        setReflectionsError("Reflections response was not in expected format.");
        return;
      }

      const next: Record<string, ReflectionItem> = {};
      for (const reflection of body.reflections) {
        if (reflection && typeof reflection.event_id === "string") {
          next[reflection.event_id] = reflection;
        }
      }
      setReflectionsByEventId(next);
    } catch (error) {
      setReflectionsByEventId({});
      setReflectionsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingReflections(false);
    }
  }, [anonRequestHeaders]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!anonUserId) return;

    void loadSavedEvents();
    void loadReflections();
  }, [anonUserId, loadSavedEvents, loadReflections]);

  async function handleSync() {
    setIsSyncing(true);
    setSyncFailure(null);
    try {
      const requestInit: RequestInit = { method: "POST" };
      if (adminHeaderValue) {
        requestInit.headers = { "x-tool-admin-key": adminHeaderValue };
      }
      const res = await fetch("/tools/19/api/sync", requestInit);
      const body = await parseApiJson<SyncSuccess | SyncFailure>(res);
      if (!res.ok) {
        const errorMessage =
          "error" in body && body.error ? body.error : "Sync failed.";
        const durationMs =
          "durationMs" in body && typeof body.durationMs === "number"
            ? body.durationMs
            : undefined;
        setSyncSuccess(null);
        setSyncFailure(
          typeof durationMs === "number"
            ? { error: errorMessage, durationMs }
            : { error: errorMessage }
        );
        return;
      }
      if ("success" in body && body.success) {
        setSyncSuccess(body);
        setLastRunAt(new Date().toLocaleString());
        await loadEvents();
      } else {
        setSyncSuccess(null);
        setSyncFailure({ error: "Sync response was not in expected format." });
      }
    } catch (error) {
      setSyncSuccess(null);
      setSyncFailure({
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleToggleSave(eventId: string) {
    if (!anonRequestHeaders) return;

    const existingSaved = savedEvents.some((event) => event.id === eventId);
    const event = events.find((item) => item.id === eventId);
    const nextEvent = event || savedEvents.find((item) => item.id === eventId);
    const shouldSave = !existingSaved;

    setSavingEventId(eventId);
    if (shouldSave && nextEvent) {
      setSavedEvents((current) => {
        const filtered = current.filter((item) => item.id !== eventId);
        return sortByStartTime([nextEvent, ...filtered]);
      });
    }

    if (!shouldSave) {
      setSavedEvents((current) => current.filter((item) => item.id !== eventId));
    }

    try {
      const requestHeaders: Record<string, string> = {
        ...anonRequestHeaders,
      };
      if (adminHeaderValue) {
        requestHeaders["x-tool-admin-key"] = adminHeaderValue;
      }

      const requestInit: RequestInit = shouldSave
        ? {
            method: "POST",
            headers: {
              ...requestHeaders,
              "content-type": "application/json",
            },
            body: JSON.stringify({ eventId }),
          }
        : {
            method: "DELETE",
            headers: requestHeaders,
          };

      const url = shouldSave
        ? "/tools/19/api/saved"
        : `/tools/19/api/saved?eventId=${encodeURIComponent(eventId)}`;

      const res = await fetch(url, requestInit);
      const body = await parseApiJson<SavedMutationSuccess | SavedMutationFailure>(res);

      if (!res.ok) {
        throw new Error(
          "error" in body && body.error ? body.error : "Failed to update saved state."
        );
      }

      if (!("eventId" in body) || typeof body.saved !== "boolean") {
        throw new Error("Saved response was not in expected format.");
      }

      await loadSavedEvents();
    } catch (error) {
      await loadSavedEvents();
      setSavedEventsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingEventId(null);
    }
  }

  function handleStartReflectionEdit(eventId: string) {
    const existing = reflectionsByEventId[eventId]?.reflection_text || "";
    setReflectionDrafts((current) => ({ ...current, [eventId]: existing }));
    setEditingReflectionEventId(eventId);
  }

  function handleReflectionDraftChange(eventId: string, value: string) {
    setReflectionDrafts((current) => ({ ...current, [eventId]: value }));
  }

  function handleCancelReflectionEdit() {
    setEditingReflectionEventId(null);
  }

  async function handleSaveReflection(eventId: string) {
    if (!anonRequestHeaders) return;

    const draft = (reflectionDrafts[eventId] || "").trim();
    if (!draft) {
      setReflectionsError("Reflection cannot be empty.");
      return;
    }

    setSavingReflectionEventId(eventId);
    setReflectionsError(null);

    try {
      const res = await fetch("/tools/19/api/reflections", {
        method: "POST",
        headers: { ...anonRequestHeaders, "content-type": "application/json" },
        body: JSON.stringify({ eventId, reflectionText: draft }),
      });
      const body = await parseApiJson<
        ReflectionMutationSuccess | ReflectionMutationFailure
      >(res);

      if (!res.ok) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Failed to save reflection."
        );
      }

      if (!("reflection" in body) || !body.reflection) {
        throw new Error("Reflection response was not in expected format.");
      }

      setReflectionsByEventId((current) => ({
        ...current,
        [eventId]: body.reflection,
      }));
      setEditingReflectionEventId(null);
    } catch (error) {
      setReflectionsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingReflectionEventId(null);
    }
  }

  async function handleDeleteReflection(eventId: string) {
    if (!anonRequestHeaders) return;

    setSavingReflectionEventId(eventId);
    setReflectionsError(null);

    try {
      const res = await fetch(
        `/tools/19/api/reflections?eventId=${encodeURIComponent(eventId)}`,
        { method: "DELETE", headers: anonRequestHeaders }
      );
      const body = await parseApiJson<{ deleted?: boolean; error?: string }>(res);

      if (!res.ok) {
        throw new Error(body.error || "Failed to delete reflection.");
      }

      setReflectionsByEventId((current) => {
        const next = { ...current };
        delete next[eventId];
        return next;
      });
      setReflectionDrafts((current) => {
        const next = { ...current };
        delete next[eventId];
        return next;
      });
      if (editingReflectionEventId === eventId) {
        setEditingReflectionEventId(null);
      }
    } catch (error) {
      setReflectionsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingReflectionEventId(null);
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const organizerOptions = useMemo(() => {
    const values = new Set<string>();
    for (const event of events) {
      const organizer = event.organizer?.trim();
      if (organizer) values.add(organizer);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const term = query.trim().toLowerCase();
    const filtered = events.filter((event) => {
      const startMs = new Date(event.start_time).getTime();
      if (timeFilter === "upcoming" && startMs < now) return false;
      if (organizerFilter !== "all") {
        if ((event.organizer?.trim() || "") !== organizerFilter) return false;
      }
      if (!term) return true;
      const haystack = [
        event.title,
        event.description || "",
        event.organizer || "",
        event.location || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
    filtered.sort((a, b) => {
      const aStart = new Date(a.start_time).getTime();
      const bStart = new Date(b.start_time).getTime();
      return sortBy === "soonest" ? aStart - bStart : bStart - aStart;
    });
    return filtered;
  }, [events, organizerFilter, query, sortBy, timeFilter]);

  const upcomingCount = useMemo(
    () =>
      events.filter((e) => new Date(e.start_time).getTime() >= Date.now())
        .length,
    [events]
  );
  const savedCount = savedEvents.length;
  const reflectionCount = Object.keys(reflectionsByEventId).length;

  const savedEventIds = useMemo(
    () => new Set(savedEvents.map((event) => event.id)),
    [savedEvents]
  );

  const displayedEvents = activeTab === "saved" ? savedEvents : filteredEvents;
  const editingEvent = editingReflectionEventId
    ? events.find((e) => e.id === editingReflectionEventId) ||
      savedEvents.find((e) => e.id === editingReflectionEventId)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`${dmSans.className} min-h-screen bg-[#FAF8F4] text-[#2C1A0E]`}>
      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b border-[#E8E4DC] bg-[#FAF8F4]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7A9E7E] text-white shadow-sm">
              <CompassIcon className="h-5 w-5" />
            </div>
            <div>
              <span className="text-lg font-bold text-[#2C1A0E]">Compass</span>
              <span className="ml-2 rounded-full bg-[#7A9E7E]/10 px-2.5 py-0.5 text-xs font-semibold text-[#4B7352]">
                Wharton MBA
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-[#6E6257] shadow-sm ring-1 ring-[#E8E4DC] transition-all duration-200 hover:bg-[#F5F2ED] hover:ring-[#B5A898]/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshIcon className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync Events"}</span>
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <header className="relative mb-8 overflow-hidden rounded-3xl border border-[#E8E4DC] bg-gradient-to-br from-white via-[#FDFCFA] to-[#F5F2ED] p-8 shadow-sm sm:p-10">
          {/* Decorative elements */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#7A9E7E]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-[#C4704F]/10 blur-3xl" />

          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7A9E7E]">
              Event Dashboard
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#2C1A0E] sm:text-4xl">
              What&apos;s happening at Penn
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#6E6257]">
              Discover Penn and Wharton events aligned with your goals. Browse upcoming options, save what matters, and capture reflections in one calm workspace.
            </p>
          </div>
        </header>

        {/* Stats */}
        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Upcoming Events"
            value={upcomingCount}
            icon={<CalendarIcon className="h-6 w-6" />}
            accentColor="sage"
          />
          <StatCard
            label="Saved Events"
            value={savedCount}
            icon={<BookmarkIcon className="h-6 w-6" />}
            accentColor="terracotta"
          />
          <StatCard
            label="Reflections"
            value={reflectionCount}
            icon={<SparklesIcon className="h-6 w-6" />}
            accentColor="taupe"
          />
        </section>

        {/* Sync status */}
        {syncSuccess && (
          <div className="mb-6 rounded-xl border border-[#7A9E7E]/20 bg-[#7A9E7E]/5 p-4 text-sm text-[#4B7352]">
            Sync complete: {syncSuccess.inserted} inserted, {syncSuccess.updated} updated ({syncSuccess.durationMs}ms)
            {lastRunAt && <span className="ml-2 text-[#8A7B6D]">Last synced: {lastRunAt}</span>}
          </div>
        )}
        {syncFailure && (
          <div className="mb-6 rounded-xl border border-[#C4704F]/20 bg-[#C4704F]/5 p-4 text-sm text-[#A35838]">
            Sync error: {syncFailure.error}
          </div>
        )}

        {/* Tabs and Filters */}
        <div className="mb-6 space-y-4">
          {/* Tab toggle */}
          <div className="flex gap-2">
            <FilterPill active={activeTab === "discover"} onClick={() => setActiveTab("discover")}>
              Discover
            </FilterPill>
            <FilterPill active={activeTab === "saved"} onClick={() => setActiveTab("saved")}>
              Saved ({savedCount})
            </FilterPill>
          </div>

          {/* Filters (only on discover tab) */}
          {activeTab === "discover" && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 sm:max-w-xs">
                <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B5A898]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events..."
                  className="w-full rounded-xl border border-[#E8E4DC] bg-white py-2.5 pl-10 pr-4 text-sm text-[#2C1A0E] placeholder:text-[#B5A898] focus:border-[#7A9E7E] focus:outline-none focus:ring-2 focus:ring-[#7A9E7E]/20"
                />
              </div>

              {/* Time filter */}
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as "upcoming" | "all")}
                className="rounded-xl border border-[#E8E4DC] bg-white px-4 py-2.5 text-sm text-[#6E6257] focus:border-[#7A9E7E] focus:outline-none focus:ring-2 focus:ring-[#7A9E7E]/20"
              >
                <option value="upcoming">Upcoming only</option>
                <option value="all">All events</option>
              </select>

              {/* Organizer filter */}
              {organizerOptions.length > 0 && (
                <select
                  value={organizerFilter}
                  onChange={(e) => setOrganizerFilter(e.target.value)}
                  className="rounded-xl border border-[#E8E4DC] bg-white px-4 py-2.5 text-sm text-[#6E6257] focus:border-[#7A9E7E] focus:outline-none focus:ring-2 focus:ring-[#7A9E7E]/20"
                >
                  <option value="all">All organizers</option>
                  {organizerOptions.map((org) => (
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </select>
              )}

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "soonest" | "latest")}
                className="rounded-xl border border-[#E8E4DC] bg-white px-4 py-2.5 text-sm text-[#6E6257] focus:border-[#7A9E7E] focus:outline-none focus:ring-2 focus:ring-[#7A9E7E]/20"
              >
                <option value="soonest">Soonest first</option>
                <option value="latest">Latest first</option>
              </select>
            </div>
          )}
        </div>

        {/* Error messages */}
        {eventsError && (
          <div className="mb-6 rounded-xl border border-[#C4704F]/20 bg-[#C4704F]/5 p-4 text-sm text-[#A35838]">
            {eventsError}
          </div>
        )}
        {savedEventsError && (
          <div className="mb-6 rounded-xl border border-[#C4704F]/20 bg-[#C4704F]/5 p-4 text-sm text-[#A35838]">
            {savedEventsError}
          </div>
        )}
        {reflectionsError && (
          <div className="mb-6 rounded-xl border border-[#C4704F]/20 bg-[#C4704F]/5 p-4 text-sm text-[#A35838]">
            {reflectionsError}
          </div>
        )}

        {/* Loading */}
        {(isLoadingEvents || isLoadingSavedEvents) && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#7A9E7E] border-t-transparent" />
          </div>
        )}

        {/* Events list */}
        {!isLoadingEvents && !isLoadingSavedEvents && (
          <ul className="space-y-4">
            {displayedEvents.length === 0 ? (
              <div className="rounded-2xl border border-[#E8E4DC] bg-white p-12 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F5F2ED]">
                  <CalendarIcon className="h-8 w-8 text-[#B5A898]" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#2C1A0E]">
                  {activeTab === "saved" ? "No saved events yet" : "No events found"}
                </h3>
                <p className="mt-2 text-sm text-[#8A7B6D]">
                  {activeTab === "saved"
                    ? "Save events you're interested in to see them here."
                    : "Try adjusting your filters or search query."}
                </p>
              </div>
            ) : (
              displayedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isSaved={savedEventIds.has(event.id)}
                  isSaving={savingEventId === event.id}
                  onToggleSave={handleToggleSave}
                  reflection={reflectionsByEventId[event.id]}
                  onStartReflection={handleStartReflectionEdit}
                />
              ))
            )}
          </ul>
        )}
      </main>

      {/* Reflection Modal */}
      {editingEvent && editingReflectionEventId && (
        <ReflectionModal
          event={editingEvent}
          existingReflection={reflectionsByEventId[editingReflectionEventId]}
          draft={reflectionDrafts[editingReflectionEventId] || ""}
          onDraftChange={(value) => handleReflectionDraftChange(editingReflectionEventId, value)}
          onSave={() => handleSaveReflection(editingReflectionEventId)}
          onDelete={() => handleDeleteReflection(editingReflectionEventId)}
          onClose={handleCancelReflectionEdit}
          isSaving={savingReflectionEventId === editingReflectionEventId}
        />
      )}
    </div>
  );
}
