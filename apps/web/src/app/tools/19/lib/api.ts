import type {
  DeleteReflectionResponse,
  EventsFailure,
  EventsSuccess,
  ReflectionMutationFailure,
  ReflectionMutationSuccess,
  ReflectionsFailure,
  ReflectionsSuccess,
  SavedEventsFailure,
  SavedEventsSuccess,
  SavedMutationFailure,
  SavedMutationSuccess,
  SyncFailure,
  SyncSuccess,
  TimeFilter,
} from "./types";

export type HeaderMap = Record<string, string>;

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

export async function requestEvents(args: {
  adminHeaderValue?: string;
  timeFilter: TimeFilter;
}): Promise<{ response: Response; body: EventsSuccess | EventsFailure }> {
  const requestInit: RequestInit = { method: "GET" };
  if (args.adminHeaderValue) {
    requestInit.headers = { "x-tool-admin-key": args.adminHeaderValue };
  }

  const queryParams = new URLSearchParams();
  queryParams.set("time", args.timeFilter);
  if (args.timeFilter === "all") {
    queryParams.set("limit", "500");
  }

  const response = await fetch(`/tools/19/api/events?${queryParams.toString()}`, requestInit);
  const body = await parseApiJson<EventsSuccess | EventsFailure>(response);
  return { response, body };
}

export async function requestSavedEvents(
  anonHeaders: HeaderMap
): Promise<{ response: Response; body: SavedEventsSuccess | SavedEventsFailure }> {
  const response = await fetch("/tools/19/api/saved", {
    method: "GET",
    headers: anonHeaders,
  });
  const body = await parseApiJson<SavedEventsSuccess | SavedEventsFailure>(response);
  return { response, body };
}

export async function requestReflections(
  anonHeaders: HeaderMap
): Promise<{ response: Response; body: ReflectionsSuccess | ReflectionsFailure }> {
  const response = await fetch("/tools/19/api/reflections", {
    method: "GET",
    headers: anonHeaders,
  });
  const body = await parseApiJson<ReflectionsSuccess | ReflectionsFailure>(response);
  return { response, body };
}

export async function requestSync(args: {
  adminHeaderValue?: string;
}): Promise<{ response: Response; body: SyncSuccess | SyncFailure }> {
  const requestInit: RequestInit = { method: "POST" };
  if (args.adminHeaderValue) {
    requestInit.headers = { "x-tool-admin-key": args.adminHeaderValue };
  }

  const response = await fetch("/tools/19/api/sync", requestInit);
  const body = await parseApiJson<SyncSuccess | SyncFailure>(response);
  return { response, body };
}

export async function requestToggleSaved(args: {
  shouldSave: boolean;
  eventId: string;
  anonHeaders: HeaderMap;
  adminHeaderValue?: string;
}): Promise<{ response: Response; body: SavedMutationSuccess | SavedMutationFailure }> {
  const requestHeaders: HeaderMap = {
    ...args.anonHeaders,
  };

  if (args.adminHeaderValue) {
    requestHeaders["x-tool-admin-key"] = args.adminHeaderValue;
  }

  const requestInit: RequestInit = args.shouldSave
    ? {
        method: "POST",
        headers: {
          ...requestHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({ eventId: args.eventId }),
      }
    : {
        method: "DELETE",
        headers: requestHeaders,
      };

  const url = args.shouldSave
    ? "/tools/19/api/saved"
    : `/tools/19/api/saved?eventId=${encodeURIComponent(args.eventId)}`;

  const response = await fetch(url, requestInit);
  const body = await parseApiJson<SavedMutationSuccess | SavedMutationFailure>(response);
  return { response, body };
}

export async function requestSaveReflection(args: {
  eventId: string;
  reflectionText: string;
  anonHeaders: HeaderMap;
}): Promise<{
  response: Response;
  body: ReflectionMutationSuccess | ReflectionMutationFailure;
}> {
  const response = await fetch("/tools/19/api/reflections", {
    method: "POST",
    headers: { ...args.anonHeaders, "content-type": "application/json" },
    body: JSON.stringify({ eventId: args.eventId, reflectionText: args.reflectionText }),
  });
  const body = await parseApiJson<
    ReflectionMutationSuccess | ReflectionMutationFailure
  >(response);
  return { response, body };
}

export async function requestDeleteReflection(args: {
  eventId: string;
  anonHeaders: HeaderMap;
}): Promise<{ response: Response; body: DeleteReflectionResponse }> {
  const response = await fetch(
    `/tools/19/api/reflections?eventId=${encodeURIComponent(args.eventId)}`,
    { method: "DELETE", headers: args.anonHeaders }
  );
  const body = await parseApiJson<DeleteReflectionResponse>(response);
  return { response, body };
}
