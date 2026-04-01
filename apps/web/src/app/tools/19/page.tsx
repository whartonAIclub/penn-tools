"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DM_Sans } from "next/font/google";

// ── Font ─────────────────────────────────────────────────────────────────────
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });

// ── Design tokens (used as Tailwind arbitrary values throughout) ──────────────
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <article className="flex items-center gap-4 rounded-2xl bg-white/70 p-5 shadow-sm ring-1 ring-[#B5A898]/20">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7A9E7E]/10 text-xl">
        {icon}
      </span>
      <div>
        <p className="text-2xl font-semibold text-[#2C1A0E]">{value}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-[#B5A898]">
          {label}
        </p>
      </div>
    </article>
  );
}

function EventCard({ event }: { event: EventItem }) {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const isPast = start.getTime() < Date.now();

  return (
    <li className="group relative flex gap-0 overflow-hidden rounded-2xl bg-white/70 shadow-sm ring-1 ring-[#B5A898]/20 transition-shadow hover:shadow-md">
      {/* Left accent bar */}
      <div className="w-1 shrink-0 rounded-l-2xl bg-[#7A9E7E]" />

      <div className="flex flex-1 flex-col gap-3 p-5">
        {/* Date badge + title row */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#7A9E7E]">
              {formatDate(event.start_time)} · {formatTime(event.start_time)}
              {end ? ` – ${formatTime(event.end_time!)}` : ""}
            </span>
            <h3 className="mt-1 text-base font-semibold leading-snug text-[#2C1A0E]">
              {event.title}
            </h3>
          </div>

          {/* Bookmark icon placeholder */}
          <button
            type="button"
            aria-label="Save event"
            className="text-[#B5A898] transition-colors hover:text-[#7A9E7E]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 3h14a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"
              />
            </svg>
          </button>
        </div>

        {/* Description */}
        {event.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-[#2C1A0E]/60">
            {event.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#B5A898]">
          {event.organizer && (
            <span className="flex items-center gap-1">
              <span>👤</span> {event.organizer}
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1">
              <span>📍</span> {event.location}
            </span>
          )}
          {event.calendar_title && (
            <span className="flex items-center gap-1">
              <span>📅</span> {event.calendar_title}
            </span>
          )}
          {isPast && (
            <span className="rounded-full bg-[#B5A898]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#B5A898]">
              Past
            </span>
          )}
        </div>

        {/* Register link */}
        {event.registration_url && (
          <a
            href={event.registration_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium text-[#C4704F] no-underline transition-opacity hover:opacity-75"
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

  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<SyncSuccess | null>(null);
  const [syncFailure, setSyncFailure] = useState<SyncFailure | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [organizerFilter, setOrganizerFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState<"upcoming" | "all">("upcoming");
  const [sortBy, setSortBy] = useState<"soonest" | "latest">("soonest");

  // ── Data fetching (unchanged logic) ────────────────────────────────────────
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
  }, [adminHeaderValue]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

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

  // ── Derived data (unchanged logic) ─────────────────────────────────────────
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
  const registrationCount = useMemo(
    () => events.filter((e) => Boolean(e.registration_url)).length,
    [events]
  );
  const recommendedEvents = useMemo(
    () => filteredEvents.filter((e) => Boolean(e.registration_url)).slice(0, 3),
    [filteredEvents]
  );

  const runSummary = useMemo(() => {
    if (!syncSuccess) return null;
    return `${syncSuccess.inserted} inserted · ${syncSuccess.updated} updated · ${syncSuccess.total} parsed · ${syncSuccess.durationMs} ms`;
  }, [syncSuccess]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={`${dmSans.className} min-h-screen bg-[#FAF8F4] text-[#2C1A0E]`}
    >
      {/* ── Top nav bar ──────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-10 border-b border-[#B5A898]/20 bg-[#FAF8F4]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧭</span>
            <span className="text-lg font-semibold text-[#2C1A0E]">
              Compass
            </span>
          </div>
          <span className="rounded-full bg-[#7A9E7E]/10 px-3 py-1 text-xs font-medium text-[#7A9E7E]">
            Wharton MBA
          </span>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">

        {/* ── Hero header ──────────────────────────────────────────────────── */}
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B5A898]">
            Event Dashboard
          </p>
          <h1 className="text-3xl font-semibold text-[#2C1A0E]">
            What's happening at Penn
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[#2C1A0E]/60">
            Discover Penn and Wharton events aligned with your goals. Browse
            upcoming options, filter by organizer, and jump straight to
            registration links.
          </p>
        </header>

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Loaded" value={events.length} icon="📋" />
          <StatCard label="Upcoming" value={upcomingCount} icon="📆" />
          <StatCard label="With Registration" value={registrationCount} icon="🎟️" />
        </section>

        {/* ── Main layout ──────────────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">

          {/* ── Events list ──────────────────────────────────────────────── */}
          <section className="space-y-5">

            {/* Filter bar */}
            <div className="rounded-2xl bg-white/70 p-5 shadow-sm ring-1 ring-[#B5A898]/20">
              <div className="flex flex-wrap gap-4">
                {/* Search */}
                <div className="min-w-[200px] flex-1">
                  <label
                    className="text-xs font-semibold uppercase tracking-wide text-[#B5A898]"
                    htmlFor="search-events"
                  >
                    Search
                  </label>
                  <input
                    id="search-events"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, organizer, location…"
                    className="mt-1.5 w-full rounded-xl border border-[#B5A898]/30 bg-[#FAF8F4] px-4 py-2.5 text-sm text-[#2C1A0E] placeholder-[#B5A898] outline-none transition focus:border-[#7A9E7E] focus:ring-2 focus:ring-[#7A9E7E]/20"
                  />
                </div>

                {/* Organizer */}
                <div>
                  <label
                    className="text-xs font-semibold uppercase tracking-wide text-[#B5A898]"
                    htmlFor="organizer-filter"
                  >
                    Organizer
                  </label>
                  <select
                    id="organizer-filter"
                    value={organizerFilter}
                    onChange={(e) => setOrganizerFilter(e.target.value)}
                    className="mt-1.5 min-w-[160px] rounded-xl border border-[#B5A898]/30 bg-[#FAF8F4] px-4 py-2.5 text-sm text-[#2C1A0E] outline-none focus:border-[#7A9E7E]"
                  >
                    <option value="all">All organizers</option>
                    {organizerOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time */}
                <div>
                  <label
                    className="text-xs font-semibold uppercase tracking-wide text-[#B5A898]"
                    htmlFor="time-filter"
                  >
                    Time
                  </label>
                  <select
                    id="time-filter"
                    value={timeFilter}
                    onChange={(e) =>
                      setTimeFilter(
                        e.target.value === "all" ? "all" : "upcoming"
                      )
                    }
                    className="mt-1.5 min-w-[140px] rounded-xl border border-[#B5A898]/30 bg-[#FAF8F4] px-4 py-2.5 text-sm text-[#2C1A0E] outline-none focus:border-[#7A9E7E]"
                  >
                    <option value="upcoming">Upcoming only</option>
                    <option value="all">All events</option>
                  </select>
                </div>

                {/* Sort */}
                <div>
                  <label
                    className="text-xs font-semibold uppercase tracking-wide text-[#B5A898]"
                    htmlFor="sort-by"
                  >
                    Sort
                  </label>
                  <select
                    id="sort-by"
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value === "latest" ? "latest" : "soonest"
                      )
                    }
                    className="mt-1.5 min-w-[140px] rounded-xl border border-[#B5A898]/30 bg-[#FAF8F4] px-4 py-2.5 text-sm text-[#2C1A0E] outline-none focus:border-[#7A9E7E]"
                  >
                    <option value="soonest">Soonest first</option>
                    <option value="latest">Latest first</option>
                  </select>
                </div>
              </div>

              {/* Result count + refresh */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-[#2C1A0E]/50">
                  Showing{" "}
                  <span className="font-semibold text-[#2C1A0E]">
                    {filteredEvents.length}
                  </span>{" "}
                  event{filteredEvents.length !== 1 ? "s" : ""}
                </p>
                <button
                  type="button"
                  onClick={() => { void loadEvents(); }}
                  disabled={isLoadingEvents}
                  className="rounded-full border border-[#B5A898]/40 px-4 py-1.5 text-xs font-medium text-[#2C1A0E]/70 transition hover:border-[#7A9E7E] hover:text-[#7A9E7E] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingEvents ? "Refreshing…" : "↻ Refresh"}
                </button>
              </div>
            </div>

            {/* Error state */}
            {eventsError && (
              <div className="rounded-2xl border border-[#C4704F]/20 bg-[#C4704F]/5 px-5 py-4 text-sm text-[#C4704F]">
                ⚠️ {eventsError}
              </div>
            )}

            {/* Loading state */}
            {isLoadingEvents && !eventsError && (
              <div className="flex items-center justify-center py-12 text-sm text-[#B5A898]">
                Loading events…
              </div>
            )}

            {/* Empty state */}
            {!isLoadingEvents && !eventsError && filteredEvents.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/50 py-14 text-center shadow-sm ring-1 ring-[#B5A898]/20">
                <span className="text-3xl">🔍</span>
                <p className="text-sm font-medium text-[#2C1A0E]">
                  No events match your filters
                </p>
                <p className="text-xs text-[#B5A898]">
                  Try broadening your search or switching to "All events"
                </p>
              </div>
            )}

            {/* Event cards */}
            {filteredEvents.length > 0 && (
              <ul className="space-y-4">
                {filteredEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </ul>
            )}
          </section>

          {/* ── Sidebar ──────────────────────────────────────────────────── */}
          <aside className="space-y-5">

            {/* Recommended */}
            <section className="rounded-2xl bg-[#FDF6EC] p-5 shadow-sm ring-1 ring-[#B5A898]/20">
              <h2 className="text-sm font-semibold text-[#2C1A0E]">
                ✨ Recommended Right Now
              </h2>
              <p className="mt-1 text-xs text-[#2C1A0E]/50">
                Early MVP — goal-based ranking coming soon.
              </p>

              {recommendedEvents.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {recommendedEvents.map((event) => (
                    <li
                      key={`rec-${event.id}`}
                      className="rounded-xl border border-[#B5A898]/20 bg-white/60 p-3"
                    >
                      <p className="text-sm font-medium leading-snug text-[#2C1A0E]">
                        {event.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[#B5A898]">
                        {formatDate(event.start_time)}
                      </p>
                      {event.registration_url && (
                        <a
                          href={event.registration_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-block text-xs font-medium text-[#C4704F] no-underline hover:opacity-75"
                        >
                          Register →
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#B5A898]">
                  No recommendations yet.
                </p>
              )}
            </section>

            {/* Data Operations */}
            <section className="rounded-2xl bg-white/70 p-5 shadow-sm ring-1 ring-[#B5A898]/20">
              <h2 className="text-sm font-semibold text-[#2C1A0E]">
                🔄 Data Sync
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#2C1A0E]/50">
                Manually pull from the CampusGroups ICS feed for development
                and testing.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="rounded-full bg-[#7A9E7E] px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#6a8e6e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSyncing ? "Syncing…" : "Run Sync"}
                </button>
                {lastRunAt && (
                  <span className="text-xs text-[#B5A898]">
                    Last run: {lastRunAt}
                  </span>
                )}
              </div>

              {runSummary && (
                <div className="mt-4 rounded-xl border border-[#7A9E7E]/20 bg-[#7A9E7E]/5 px-4 py-3 text-xs text-[#2C1A0E]/70">
                  ✅ {runSummary}
                </div>
              )}

              {syncFailure && (
                <div className="mt-4 rounded-xl border border-[#C4704F]/20 bg-[#C4704F]/5 px-4 py-3 text-xs text-[#C4704F]">
                  ⚠️ {syncFailure.error}
                  {typeof syncFailure.durationMs === "number" && (
                    <span className="ml-1 text-[#B5A898]">
                      ({syncFailure.durationMs} ms)
                    </span>
                  )}
                </div>
              )}
            </section>

          </aside>
        </div>
      </main>
    </div>
  );
}
