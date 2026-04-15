import type { EventItem } from "./types";

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(startIso: string, endIso: string | null): string | null {
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

export function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

export function sortByStartTime(items: EventItem[]): EventItem[] {
  return [...items].sort(
    (left, right) =>
      new Date(left.start_time).getTime() - new Date(right.start_time).getTime()
  );
}
