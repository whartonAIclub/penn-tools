import ical from "node-ical";
import type { ParsedEvent } from "../db/schema.js";

type VEventLike = {
  type: "VEVENT";
  uid?: unknown;
  start?: unknown;
  summary?: unknown;
  description?: unknown;
  end?: unknown;
  location?: unknown;
  url?: unknown;
  organizer?: unknown;
};

type IcsTextFieldObject = {
  val?: unknown;
};

function isVEventComponent(component: unknown): component is VEventLike {
  if (typeof component !== "object" || component === null) return false;
  return (component as { type?: unknown }).type === "VEVENT";
}

/**
 * Parses raw ICS text into an array of ParsedEvent records.
 *
 * Field mapping:
 *   UID         -> external_event_id
 *   SUMMARY     -> title
 *   DESCRIPTION -> description
 *   DTSTART     -> start_time
 *   DTEND       -> end_time
 *   LOCATION    -> location
 *   URL         -> registration_url
 *   ORGANIZER   -> organizer (CN name extracted when present)
 *
 * Events without a UID or DTSTART are skipped — they cannot be
 * reliably upserted or displayed.
 */
export function parseIcsFeed(
  icsText: string,
  sourceFeed: string
): ParsedEvent[] {
  const data = ical.sync.parseICS(icsText);
  const calendarTitle = extractCalendarTitle(icsText);
  const events: ParsedEvent[] = [];

  for (const key of Object.keys(data)) {
    const component = data[key];
    if (!isVEventComponent(component)) continue;

    const uid =
      typeof component.uid === "string" ? component.uid.trim() : "";
    if (!uid) continue;

    const startTime = component.start instanceof Date ? component.start : null;
    if (!startTime) continue;

    const summaryText = extractTextField(component.summary);
    const title = summaryText || "(no title)";

    const description = extractTextField(component.description);

    const endTime =
      component.end instanceof Date ? component.end : null;

    const location = extractTextField(component.location);

    // URL field maps directly to registration_url
    const registrationUrl = extractTextField(component.url);

    const organizer = extractOrganizer(component.organizer);

    events.push({
      external_event_id: uid,
      calendar_title: calendarTitle,
      title,
      description,
      organizer,
      start_time: startTime,
      end_time: endTime,
      location,
      registration_url: registrationUrl,
      source_feed: sourceFeed,
    });
  }

  return events;
}

function extractCalendarTitle(icsText: string): string | null {
  const match = icsText.match(/^X-WR-CALNAME:(.+)$/m);
  if (!match || typeof match[1] !== "string") return null;

  const value = match[1].trim();
  return value || null;
}

function extractTextField(raw: unknown): string | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    return value || null;
  }

  if (typeof raw === "object" && raw !== null) {
    const val = (raw as IcsTextFieldObject).val;
    if (typeof val === "string") {
      const value = val.trim();
      return value || null;
    }
  }

  return null;
}

/**
 * Extracts a human-readable organizer name from the raw ICS ORGANIZER field.
 *
 * ICS ORGANIZER can arrive in several shapes from node-ical:
 *   - a plain string: "CN=Jane Doe:mailto:jane@example.com"
 *   - an object:      { params: { CN: "Jane Doe" }, val: "mailto:jane@example.com" }
 *
 * We prefer the CN (common name). If absent, we return null rather than
 * exposing a raw mailto URI.
 */
function extractOrganizer(raw: unknown): string | null {
  if (!raw) return null;

  // Object shape from node-ical
  if (typeof raw === "object" && raw !== null) {
    const params = (raw as Record<string, unknown>).params;
    if (params && typeof (params as Record<string, unknown>).CN === "string") {
      return ((params as Record<string, unknown>).CN as string).trim() || null;
    }
    return null;
  }

  // String shape: "CN=Jane Doe:mailto:jane@example.com"
  if (typeof raw === "string") {
    const cnMatch = raw.match(/CN=([^;:]+)/);
    const cn = cnMatch?.[1]?.trim();
    if (cn) return cn;
    return null;
  }

  return null;
}
