"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type EventsSuccess = {
  events: EventItem[];
};

type EventsFailure = {
  error: string;
};

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

  const runSummary = useMemo(() => {
    if (!syncSuccess) return null;

    return [
      `Inserted: ${syncSuccess.inserted}`,
      `Updated: ${syncSuccess.updated}`,
      `Total parsed: ${syncSuccess.total}`,
      `Duration: ${syncSuccess.durationMs} ms`,
    ].join(" | ");
  }, [syncSuccess]);

  const loadEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    setEventsError(null);

    try {
      const requestInit: RequestInit = { method: "GET" };
      if (adminHeaderValue) {
        requestInit.headers = { "x-tool-admin-key": adminHeaderValue };
      }
      const res = await fetch("/tools/19/api/events?limit=100", requestInit);
      const body = (await res.json()) as EventsSuccess | EventsFailure;

      if (!res.ok) {
        const message =
          "error" in body && body.error
            ? body.error
            : "Failed to load events with an unknown error.";
        setEvents([]);
        setEventsError(message);
        return;
      }

      if (!("events" in body) || !Array.isArray(body.events)) {
        setEvents([]);
        setEventsError("Events response was not in expected format.");
        return;
      }

      setEvents(body.events);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEvents([]);
      setEventsError(message);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [adminHeaderValue]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const organizerOptions = useMemo(() => {
    const values = new Set<string>();
    for (const event of events) {
      const organizer = event.organizer?.trim();
      if (organizer) {
        values.add(organizer);
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const term = query.trim().toLowerCase();

    const filtered = events.filter((event) => {
      const startMs = new Date(event.start_time).getTime();

      if (timeFilter === "upcoming" && startMs < now) {
        return false;
      }

      if (organizerFilter !== "all") {
        const organizer = event.organizer?.trim() || "";
        if (organizer !== organizerFilter) {
          return false;
        }
      }

      if (!term) {
        return true;
      }

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

  const upcomingCount = useMemo(() => {
    const now = Date.now();
    return events.filter((event) => new Date(event.start_time).getTime() >= now).length;
  }, [events]);

  const registrationCount = useMemo(() => {
    return events.filter((event) => Boolean(event.registration_url)).length;
  }, [events]);

  const recommendedEvents = useMemo(() => {
    return filteredEvents.filter((event) => Boolean(event.registration_url)).slice(0, 3);
  }, [filteredEvents]);

  async function handleSync() {
    setIsSyncing(true);
    setSyncFailure(null);

    try {
      const requestInit: RequestInit = { method: "POST" };
      if (adminHeaderValue) {
        requestInit.headers = { "x-tool-admin-key": adminHeaderValue };
      }
      const res = await fetch("/tools/19/api/sync", requestInit);
      const body = (await res.json()) as SyncSuccess | SyncFailure;

      if (!res.ok) {
        const errorMessage =
          "error" in body && body.error
            ? body.error
            : "Sync failed with an unknown error.";
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
      const message = error instanceof Error ? error.message : String(error);
      setSyncSuccess(null);
      setSyncFailure({ error: message });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">Compass</p>
        <h1 className="text-3xl font-semibold text-neutral-900">Event Dashboard</h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          Discover Penn and Wharton events aligned with your goals. Browse upcoming options,
          filter quickly, and jump straight to registration links.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Total Loaded</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{events.length}</p>
        </article>
        <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Upcoming</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{upcomingCount}</p>
        </article>
        <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">With Registration</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{registrationCount}</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="search-events">
                Search
              </label>
              <input
                id="search-events"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title, organizer, location, keywords"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="organizer-filter">
                Organizer
              </label>
              <select
                id="organizer-filter"
                value={organizerFilter}
                onChange={(event) => setOrganizerFilter(event.target.value)}
                className="mt-1 min-w-[180px] rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                <option value="all">All organizers</option>
                {organizerOptions.map((organizer) => (
                  <option key={organizer} value={organizer}>
                    {organizer}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="time-filter">
                Time
              </label>
              <select
                id="time-filter"
                value={timeFilter}
                onChange={(event) => setTimeFilter(event.target.value === "all" ? "all" : "upcoming")}
                className="mt-1 min-w-[140px] rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                <option value="upcoming">Upcoming only</option>
                <option value="all">All events</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="sort-by">
                Sort
              </label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value === "latest" ? "latest" : "soonest")}
                className="mt-1 min-w-[140px] rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                <option value="soonest">Soonest first</option>
                <option value="latest">Latest first</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-neutral-900">{filteredEvents.length}</span> events
            </p>
            <button
              onClick={() => {
                void loadEvents();
              }}
              disabled={isLoadingEvents}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
            >
              {isLoadingEvents ? "Refreshing..." : "Refresh Events"}
            </button>
          </div>

          {eventsError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              Error loading events: {eventsError}
            </div>
          ) : null}

          {!eventsError && filteredEvents.length === 0 && !isLoadingEvents ? (
            <p className="text-sm text-neutral-600">No events match your current filters.</p>
          ) : null}

          {filteredEvents.length > 0 ? (
            <ul className="space-y-3">
              {filteredEvents.map((event) => {
                const start = new Date(event.start_time);
                const end = event.end_time ? new Date(event.end_time) : null;

                return (
                  <li
                    key={event.id}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-neutral-900">{event.title}</h3>
                      <span className="text-xs text-neutral-500">{start.toLocaleString()}</span>
                    </div>

                    <p className="mt-1 text-sm text-neutral-700">
                      {event.description?.trim() || "No description"}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                      <span>Calendar: {event.calendar_title || "Unknown"}</span>
                      <span>Organizer: {event.organizer || "Unknown"}</span>
                      <span>Location: {event.location || "TBD"}</span>
                      <span>End: {end ? end.toLocaleString() : "Not provided"}</span>
                    </div>

                    {event.registration_url ? (
                      <a
                        href={event.registration_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-medium text-blue-700 hover:text-blue-900"
                      >
                        Register
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900">Recommended Right Now</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Early MVP placeholder while priority-based ranking is being built.
            </p>

            {recommendedEvents.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {recommendedEvents.map((event) => (
                  <li key={`rec-${event.id}`} className="rounded-md border border-neutral-200 p-3">
                    <p className="font-medium text-neutral-900">{event.title}</p>
                    <p className="text-xs text-neutral-500">{new Date(event.start_time).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-neutral-600">No recommendations yet.</p>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900">Data Operations</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Manually run ingestion for development and testing from COMPASS_ICS_FEED_URL.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                {isSyncing ? "Syncing..." : "Run Sync"}
              </button>
              {lastRunAt ? (
                <span className="text-xs text-neutral-500">Last run: {lastRunAt}</span>
              ) : null}
            </div>

            {runSummary ? (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {runSummary}
              </div>
            ) : null}

            {syncFailure ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <p>Error: {syncFailure.error}</p>
                {typeof syncFailure.durationMs === "number" ? (
                  <p>Duration: {syncFailure.durationMs} ms</p>
                ) : null}
              </div>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}
