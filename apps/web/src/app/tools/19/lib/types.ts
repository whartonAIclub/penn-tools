export type SyncSuccess = {
  success: true;
  inserted: number;
  updated: number;
  total: number;
  durationMs: number;
};

export type SyncFailure = {
  error: string;
  durationMs?: number;
};

export type EventItem = {
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

export type ReflectionItem = {
  event_id: string;
  reflection_text: string;
  updated_at: string;
};

export type EventsSuccess = { events: EventItem[] };
export type EventsFailure = { error: string };

export type SavedEventsSuccess = { savedEvents: EventItem[] };
export type SavedEventsFailure = { error: string };

export type SavedMutationSuccess = {
  eventId: string;
  saved: boolean;
};

export type SavedMutationFailure = { error: string };

export type ReflectionsSuccess = { reflections: ReflectionItem[] };
export type ReflectionsFailure = { error: string };

export type ReflectionMutationSuccess = { reflection: ReflectionItem };
export type ReflectionMutationFailure = { error: string };

export type DeleteReflectionResponse = { deleted?: boolean; error?: string };

export type TimeFilter = "upcoming" | "all";
