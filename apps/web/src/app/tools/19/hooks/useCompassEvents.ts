import { useCallback, useEffect, useState } from "react";
import { requestEvents, requestSync } from "../lib/api";
import type { EventItem, SyncFailure, SyncSuccess, TimeFilter } from "../lib/types";

type UseCompassEventsArgs = {
  adminHeaderValue?: string;
  timeFilter: TimeFilter;
};

export function useCompassEvents({ adminHeaderValue, timeFilter }: UseCompassEventsArgs) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<SyncSuccess | null>(null);
  const [syncFailure, setSyncFailure] = useState<SyncFailure | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    setEventsError(null);
    try {
      const { response, body } = await requestEvents(
        adminHeaderValue
          ? { adminHeaderValue, timeFilter }
          : { timeFilter }
      );

      if (!response.ok) {
        setEvents([]);
        setEventsError(
          "error" in body && body.error ? body.error : "Failed to load events."
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

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncFailure(null);
    try {
      const { response, body } = await requestSync(
        adminHeaderValue ? { adminHeaderValue } : {}
      );
      if (!response.ok) {
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
  }, [adminHeaderValue, loadEvents]);

  return {
    events,
    eventsError,
    isLoadingEvents,
    loadEvents,
    isSyncing,
    syncSuccess,
    syncFailure,
    lastRunAt,
    handleSync,
  };
}
