"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });

// Design tokens
// bg:        #FAF8F4  warm off-white
// primary:   #7A9E7E  sage green
// secondary: #C4704F  terracotta
// neutral:   #B5A898  warm taupe
// text:      #2C1A0E  dark warm brown

// ── Types ────────────────────────────────────────────────────────────────────
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
};

type EventsSuccess = { events: EventItem[] };
type EventsFailure = { error: string };

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
  return new Date(iso).toLocaleDateString("en-US", {
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

// ── Icons (inline SVG) ────────────────────────────────────────────────────────
function CompassIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function BookmarkIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 3h14a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z" />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="1 4 1 10 7 10" />
      <polyline points="23 20 23 14 17 14" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  accent?: string;
}) {
  return (
    <article className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#B5A898]/20">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-[#B5A898]/20 ${accent ?? "bg-[#FAF8F4] text-[#7A9E7E]"}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-2xl font-semibold text-[#2C1A0E]">{value}</p>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#B5A898]">
          {label}
        </p>
      </div>
    </article>
  );
}

// ── EventCard ─────────────────────────────────────────────────────────────────
function EventCard({ event }: { event: EventItem }) {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const isPast = start.getTime() < Date.now();

  return (
    <li className="group relative flex overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#B5A898]/20 transition-shadow hover:shadow-md">
      <div className="w-1 shrink-0 rounded-l-2xl bg-[#7A9E7E]" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#7A9E7E]">
              {formatDate(event.start_time)} · {formatTime(event.start_time)}
              {end ? ` – ${formatTime(event.end_time!)}` : ""}
            </span>
            <h3 className="mt-1 text-base font-semibold leading-snug text-[#2C1A0E]">
              {event.title}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Save event"
            className="mt-0.5 text-[#B5A898] transition-colors hover:text-[#7A9E7E]"
          >
            <BookmarkIcon className="h-5 w-5" />
          </button>
        </div>

        {event.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-[#2C1A0E]/60">
            {event.description}
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#B5A898]">
          {event.organizer && <span>👤 {event.organizer}</span>}
          {event.location && <span>📍 {event.location}</span>}
          {event.calendar_title && <span>📅 {event.calendar_title}</span>}
          {isPast && (
            <span className="rounded-full bg-[#B5A898]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              Past
            </span>
          )}
        </div>

        {event.registration_url && (
          <a
            href={event.registration_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium text-[#C4704F] no-underline hover:opacity-75"
          >
            Register →
          </a>
        )}
      </div>
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CompassPage() {
  const adminHeaderValue = process.env.NEXT_PUBLIC_TOOL19_ADMIN_KEY || "";

  const [activeTab, setActiveTab] = useState<"discover" | "saved">("discover");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<SyncSuccess | null>(null);
  const [syncFailure, setSyncFailure] = useState<SyncFailure | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<"upcoming" | "all">("upcoming");
  const [sortBy, setSortBy] = useState<"soonest" | "latest">("soonest");

  const loadEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    setEventsError(null);
    try {
      const requestInit: RequestInit = { method: "GET" };
      if (adminHeaderValue) {
        requestInit.headers = { "x-tool-admin-key": adminHeaderValue };
      }
      const res = await fetch("/tools/19/api/events?limit=100", requestInit);
      const body = await parseApiJson<EventsSuccess | EventsFailure>(res);
      if (!res.ok) {
        setEvents([]);
        setEventsError("error" in body && body.error ? body.error : "Failed to load events.");
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
  }, [adminHeaderValue]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

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
        const errorMessage = "error" in body && body.error ? body.error : "Sync failed.";
        const durationMs =
          "durationMs" in body && typeof body.durationMs === "number"
            ? body.durationMs
            : undefined;
        setSyncSuccess(null);
        setSyncFailure(typeof durationMs === "number" ? { error: errorMessage, durationMs } : { error: errorMessage });
        return;
      }
      if ("success" in body && body.success) {
        setSyncSuccess(body);
        await loadEvents();
      } else {
        setSyncSuccess(null);
        setSyncFailure({ error: "Sync response was not in expected format." });
      }
    } catch (error) {
      setSyncSuccess(null);
      setSyncFailure({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSyncing(false);
    }
  }

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const term = query.trim().toLowerCase();
    const filtered = events.filter((event) => {
      const startMs = new Date(event.start_time).getTime();
      if (timeFilter === "upcoming" && startMs < now) return false;
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
  }, [events, query, sortBy, timeFilter]);

  const upcomingCount = useMemo(
    () => events.filter((e) => new Date(e.start_time).getTime() >= Date.now()).length,
    [events]
  );

  const savedCount = 0;       // placeholder — Saved tab coming soon
  const reflectionsCount = 0; // placeholder — Reflections coming soon

  return (
    <div className={`${dmSans.className} min-h-screen bg-[#FAF8F4] text-[#2C1A0E]`}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-10 border-b border-[#B5A898]/20 bg-[#FAF8F4]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7A9E7E] text-white">
              <CompassIcon className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold">Compass</span>
            <span className="rounded-full bg-[#7A9E7E]/10 px-3 py-1 text-xs font-medium text-[#7A9E7E]">
              Wharton MBA
            </span>
          </div>

          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-full border border-[#B5A898]/40 bg-white px-4 py-2 text-sm font-medium text-[#2C1A0E] shadow-sm transition hover:border-[#7A9E7E] hover:text-[#7A9E7E] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SyncIcon className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing…" : "Sync Events"}
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">

        {/* ── Hero card ────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-[#B5A898]/20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A9E7E]">
            Event Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[#2C1A0E]">
            What's happening at Penn
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#2C1A0E]/60">
            Discover Penn and Wharton events aligned with your goals. Browse
            upcoming options, save what matters, and capture reflections in one
            calm workspace.
          </p>
        </div>

        {/* ── Stat cards ───────────────────────────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Upcoming Events"
            value={upcomingCount}
            icon={<CalendarIcon className="h-5 w-5" />}
            accent="bg-[#7A9E7E]/10 text-[#7A9E7E]"
          />
          <StatCard
            label="Saved Events"
            value={savedCount}
            icon={<BookmarkIcon className="h-5 w-5" />}
            accent="bg-[#C4704F]/10 text-[#C4704F]"
          />
          <StatCard
            label="Reflections"
            value={reflectionsCount}
            icon={<SparkleIcon className="h-5 w-5" />}
            accent="bg-[#B5A898]/15 text-[#B5A898]"
          />
        </section>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("discover")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === "discover"
                ? "bg-[#7A9E7E] text-white shadow-sm"
                : "border border-[#B5A898]/40 bg-white text-[#2C1A0E] hover:border-[#7A9E7E] hover:text-[#7A9E7E]"
            }`}
          >
            Discover
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("saved")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === "saved"
                ? "bg-[#7A9E7E] text-white shadow-sm"
                : "border border-[#B5A898]/40 bg-white text-[#2C1A0E] hover:border-[#7A9E7E] hover:text-[#7A9E7E]"
            }`}
          >
            Saved ({savedCount})
          </button>
        </div>

        {/* ── Discover tab ─────────────────────────────────────────────── */}
        {activeTab === "discover" && (
          <section className="space-y-4">

            {/* Search + filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative min-w-[220px] flex-1">
                <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B5A898]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events…"
                  className="w-full rounded-full border border-[#B5A898]/30 bg-white py-2.5 pl-10 pr-4 text-sm text-[#2C1A0E] placeholder-[#B5A898] outline-none transition focus:border-[#7A9E7E] focus:ring-2 focus:ring-[#7A9E7E]/20"
                />
              </div>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value === "all" ? "all" : "upcoming")}
                className="rounded-full border border-[#B5A898]/30 bg-white px-4 py-2.5 text-sm text-[#2C1A0E] outline-none focus:border-[#7A9E7E]"
              >
                <option value="upcoming">Upcoming only</option>
                <option value="all">All events</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value === "latest" ? "latest" : "soonest")}
                className="rounded-full border border-[#B5A898]/30 bg-white px-4 py-2.5 text-sm text-[#2C1A0E] outline-none focus:border-[#7A9E7E]"
              >
                <option value="soonest">Soonest first</option>
                <option value="latest">Latest first</option>
              </select>
            </div>

            {/* Sync feedback */}
            {syncSuccess && (
              <div className="rounded-2xl border border-[#7A9E7E]/20 bg-[#7A9E7E]/5 px-5 py-3 text-xs text-[#2C1A0E]/70">
                ✅ {syncSuccess.inserted} inserted · {syncSuccess.updated} updated · {syncSuccess.total} parsed · {syncSuccess.durationMs} ms
              </div>
            )}
            {syncFailure && (
              <div className="rounded-2xl border border-[#C4704F]/20 bg-[#C4704F]/5 px-5 py-3 text-xs text-[#C4704F]">
                ⚠️ {syncFailure.error}
                {typeof syncFailure.durationMs === "number" && (
                  <span className="ml-1 text-[#B5A898]">({syncFailure.durationMs} ms)</span>
                )}
              </div>
            )}

            {/* API error */}
            {eventsError && (
              <div className="rounded-2xl border border-[#C4704F]/20 bg-[#C4704F]/5 px-5 py-4 text-sm text-[#C4704F]">
                ⚠️ {eventsError}
              </div>
            )}

            {/* Loading */}
            {isLoadingEvents && !eventsError && (
              <div className="flex items-center justify-center py-16 text-sm text-[#B5A898]">
                Loading events…
              </div>
            )}

            {/* Empty state */}
            {!isLoadingEvents && !eventsError && filteredEvents.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-16 text-center shadow-sm ring-1 ring-[#B5A898]/20">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FAF8F4] text-[#B5A898] ring-1 ring-[#B5A898]/20">
                  <CalendarIcon className="h-8 w-8" />
                </span>
                <p className="text-base font-semibold text-[#2C1A0E]">No events found</p>
                <p className="text-sm text-[#B5A898]">
                  Try syncing or switching to "All events"
                </p>
              </div>
            )}

            {/* Event list */}
            {filteredEvents.length > 0 && (
              <ul className="space-y-3">
                {filteredEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Saved tab ────────────────────────────────────────────────── */}
        {activeTab === "saved" && (
          <section className="flex flex-col items-center gap-3 rounded-2xl bg-white py-16 text-center shadow-sm ring-1 ring-[#B5A898]/20">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FAF8F4] text-[#B5A898] ring-1 ring-[#B5A898]/20">
              <BookmarkIcon className="h-8 w-8" />
            </span>
            <p className="text-base font-semibold text-[#2C1A0E]">No saved events yet</p>
            <p className="text-sm text-[#B5A898]">Bookmark events from the Discover tab</p>
          </section>
        )}

      </main>
    </div>
  );
}
