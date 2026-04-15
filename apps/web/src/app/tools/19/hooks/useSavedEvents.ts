import { useCallback, useEffect, useMemo, useState } from "react";
import { sortByStartTime } from "../lib/format";
import { requestSavedEvents, requestToggleSaved } from "../lib/api";
import type { EventItem } from "../lib/types";

type UseSavedEventsArgs = {
  anonRequestHeaders: Record<string, string> | undefined;
  adminHeaderValue?: string;
  events: EventItem[];
};

export function useSavedEvents({
  anonRequestHeaders,
  adminHeaderValue,
  events,
}: UseSavedEventsArgs) {
  const [isLoadingSavedEvents, setIsLoadingSavedEvents] = useState(false);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [savedEvents, setSavedEvents] = useState<EventItem[]>([]);
  const [savedEventsError, setSavedEventsError] = useState<string | null>(null);

  const loadSavedEvents = useCallback(async () => {
    if (!anonRequestHeaders) return;

    setIsLoadingSavedEvents(true);
    setSavedEventsError(null);
    try {
      const { response, body } = await requestSavedEvents(anonRequestHeaders);
      if (!response.ok) {
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

  useEffect(() => {
    if (!anonRequestHeaders) return;
    void loadSavedEvents();
  }, [anonRequestHeaders, loadSavedEvents]);

  const handleToggleSave = useCallback(
    async (eventId: string) => {
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
        const { response, body } = await requestToggleSaved(
          adminHeaderValue
            ? {
                shouldSave,
                eventId,
                anonHeaders: anonRequestHeaders,
                adminHeaderValue,
              }
            : {
                shouldSave,
                eventId,
                anonHeaders: anonRequestHeaders,
              }
        );

        if (!response.ok) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Failed to update saved state."
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
    },
    [adminHeaderValue, anonRequestHeaders, events, loadSavedEvents, savedEvents]
  );

  const savedEventIds = useMemo(
    () => new Set(savedEvents.map((event) => event.id)),
    [savedEvents]
  );

  return {
    savedEvents,
    savedEventsError,
    isLoadingSavedEvents,
    savingEventId,
    loadSavedEvents,
    handleToggleSave,
    savedEventIds,
  };
}
