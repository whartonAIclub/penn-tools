import { useCallback, useEffect, useMemo, useState } from "react";
import { requestDeleteReflection, requestReflections, requestSaveReflection } from "../lib/api";
import type { EventItem, ReflectionItem } from "../lib/types";

type UseReflectionsArgs = {
  anonRequestHeaders: Record<string, string> | undefined;
  events: EventItem[];
  savedEvents: EventItem[];
};

export function useReflections({
  anonRequestHeaders,
  events,
  savedEvents,
}: UseReflectionsArgs) {
  const [reflectionsByEventId, setReflectionsByEventId] = useState<
    Record<string, ReflectionItem>
  >({});
  const [reflectionsError, setReflectionsError] = useState<string | null>(null);
  const [isLoadingReflections, setIsLoadingReflections] = useState(false);
  const [editingReflectionEventId, setEditingReflectionEventId] = useState<
    string | null
  >(null);
  const [reflectionDrafts, setReflectionDrafts] = useState<Record<string, string>>({});
  const [savingReflectionEventId, setSavingReflectionEventId] = useState<
    string | null
  >(null);

  const loadReflections = useCallback(async () => {
    if (!anonRequestHeaders) return;

    setIsLoadingReflections(true);
    setReflectionsError(null);
    try {
      const { response, body } = await requestReflections(anonRequestHeaders);

      if (!response.ok) {
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
    if (!anonRequestHeaders) return;
    void loadReflections();
  }, [anonRequestHeaders, loadReflections]);

  const handleStartReflectionEdit = useCallback(
    (eventId: string) => {
      const existing = reflectionsByEventId[eventId]?.reflection_text || "";
      setReflectionDrafts((current) => ({ ...current, [eventId]: existing }));
      setEditingReflectionEventId(eventId);
    },
    [reflectionsByEventId]
  );

  const handleReflectionDraftChange = useCallback((eventId: string, value: string) => {
    setReflectionDrafts((current) => ({ ...current, [eventId]: value }));
  }, []);

  const handleCancelReflectionEdit = useCallback(() => {
    setEditingReflectionEventId(null);
  }, []);

  const handleSaveReflection = useCallback(
    async (eventId: string) => {
      if (!anonRequestHeaders) return;

      const draft = (reflectionDrafts[eventId] || "").trim();
      if (!draft) {
        setReflectionsError("Reflection cannot be empty.");
        return;
      }

      setSavingReflectionEventId(eventId);
      setReflectionsError(null);

      try {
        const { response, body } = await requestSaveReflection({
          eventId,
          reflectionText: draft,
          anonHeaders: anonRequestHeaders,
        });

        if (!response.ok) {
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
    },
    [anonRequestHeaders, reflectionDrafts]
  );

  const handleDeleteReflection = useCallback(
    async (eventId: string) => {
      if (!anonRequestHeaders) return;

      setSavingReflectionEventId(eventId);
      setReflectionsError(null);

      try {
        const { response, body } = await requestDeleteReflection({
          eventId,
          anonHeaders: anonRequestHeaders,
        });

        if (!response.ok) {
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
    },
    [anonRequestHeaders, editingReflectionEventId]
  );

  const editingEvent = useMemo(() => {
    if (!editingReflectionEventId) return null;

    return (
      events.find((e) => e.id === editingReflectionEventId) ||
      savedEvents.find((e) => e.id === editingReflectionEventId) ||
      null
    );
  }, [editingReflectionEventId, events, savedEvents]);

  return {
    reflectionsByEventId,
    reflectionsError,
    isLoadingReflections,
    editingReflectionEventId,
    reflectionDrafts,
    savingReflectionEventId,
    loadReflections,
    handleStartReflectionEdit,
    handleReflectionDraftChange,
    handleCancelReflectionEdit,
    handleSaveReflection,
    handleDeleteReflection,
    editingEvent,
  };
}
