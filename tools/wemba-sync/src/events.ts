// ─────────────────────────────────────────────────────────────────────────────
// WEMBA Sync: events outside class — club events, celebrations, socials
//
// A student pastes an invite (from WhatsApp, an email, any invite site, or
// just its link) and/or adds a screenshot or flyer, and extractEvents() has
// the AI read the event(s) from them. The tool can't open links, so a link
// is kept as the event's link and the details come from the text or image. The student checks them before they're saved (see
// eventStore.ts). The AI is passed in by the tool's route, so tests use a
// fake (see __tests__/events.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIContentPart, AIImageType, AIProvider } from "@penntools/core/ai";
import { AI_IMAGE_TYPES, MAX_IMAGE_BYTES, base64Bytes, base64FileType, isBase64 } from "@penntools/core/ai/attachments";
import { MAX_PDF_BYTES, type ScheduleItem } from "./schedule.js";

/** The longest pasted invite, in characters. */
export const MAX_INVITE_LENGTH = 20_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Fields that may be missing are .nullable(), not .optional(): providers'
// structured output requires every field to be present.
export const Event = z.object({
  title: z.string().describe("The event's name, e.g. 'Diwali celebration'"),
  date: z.string().describe("YYYY-MM-DD of the (first) day"),
  endDate: z.string().nullable().describe("YYYY-MM-DD of the last day if it spans several days, else null"),
  start: z.string().nullable().describe("24-hour HH:MM, or null if no time is given"),
  end: z.string().nullable().describe("24-hour HH:MM, or null if no end time is given"),
  location: z.string().nullable().describe("Venue and address, as given, or null"),
  organizer: z.string().nullable().describe("Who's hosting: a club, a classmate, the program; or null"),
  link: z.string().nullable().describe("The link to RSVP or for details, a full https:// URL, or null"),
  notes: z.string().nullable().describe("One or two sentences of what to know: dress code, cost, what to bring; or null"),
});
export type Event = z.infer<typeof Event>;

const Extracted = z.object({
  events: z.array(Event).describe("Every event in the invite; usually one"),
  warnings: z.array(z.string()).describe("Anything you weren't sure of, e.g. a date without a year or a missing time"),
});
export type ExtractedEvents = z.infer<typeof Extracted>;

/** A screenshot or flyer: an image or a PDF. */
export type InviteFile =
  | { kind: "image"; mediaType: AIImageType; data: string }
  | { kind: "pdf"; filename: string; data: string };

/** An invite as the student gives it: pasted text (perhaps just a link), a screenshot or flyer, or both. */
export interface Invite {
  text: string | null;
  file: InviteFile | null;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

/** The first http(s) link in the text, without trailing punctuation, or null. */
export function firstLink(text: string | null): string | null {
  const match = text?.match(URL_RE)?.[0].replace(/[.,;:!?]+$/, "");
  return match ? safeLink(match) : null;
}

/** True if the text is nothing but a link: the AI can't read an event from it. */
export function isOnlyLink(text: string | null): boolean {
  const trimmed = text?.trim() ?? "";
  return trimmed !== "" && firstLink(trimmed) !== null && !/\s/.test(trimmed);
}

const SYSTEM = [
  "You read invitations for Wharton MBA Program for Executives (WEMBA) students and return the events in them as data.",
  "Invites come from anywhere: WhatsApp messages, emails, event sites, flyers and screenshots of any of these.",
  "Events can be club events, celebrations, socials, talks, trips or anything else the student might attend.",
  "Invites often give dates without a year, or as 'this Friday': resolve them from today's date, and list any guess in warnings.",
  "Times are Philadelphia time unless the invite says otherwise. Keep the location as written.",
  "Only include a link that appears in the invite; never make one up. You can't open links: read the details from the text and images.",
  "If there's no event in it, return no events and say why in warnings.",
].join(" ");

/**
 * The events in the invite, read by the AI. `today` is e.g. "Thursday,
 * 2026-11-12", for relative dates. A link in the pasted text becomes the link
 * of events the AI found none for.
 */
export async function extractEvents(ai: AI, provider: AIProvider, invite: Invite, today: string): Promise<ExtractedEvents> {
  const content: AIContentPart[] = [];
  if (invite.file?.kind === "image") content.push({ type: "image", mediaType: invite.file.mediaType, data: invite.file.data });
  if (invite.file?.kind === "pdf") content.push({ type: "pdf", filename: invite.file.filename, data: invite.file.data });
  if (invite.text?.trim()) content.push({ type: "text", text: `The invite, as the student pasted it:\n\n${invite.text}` });
  const { object } = await ai.generateObject({
    provider,
    tier: "fast", // a short invite: the fast model is enough
    reasoning: "low",
    schema: Extracted,
    system: SYSTEM,
    messages: [
      { role: "user", content: [...content, { type: "text", text: `Today is ${today}. Read the event(s) in this invite.` }] },
    ],
  });
  const pasted = firstLink(invite.text);
  return {
    events: object.events.map((event) => cleanEvent({ ...event, link: event.link ?? pasted })),
    warnings: object.warnings,
  };
}

/** Only http(s) links, so a saved link can't run script when clicked. */
export function safeLink(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** The event with blank fields as null, malformed times dropped and only a safe link. */
export function cleanEvent(event: Event): Event {
  const text = (value: string | null) => (value && value.trim() ? value.trim() : null);
  const start = TIME_RE.test(event.start ?? "") ? event.start : null;
  return {
    title: event.title.trim(),
    date: event.date.trim(),
    endDate: event.endDate && DATE_RE.test(event.endDate) && event.endDate > event.date ? event.endDate : null,
    start,
    end: start && TIME_RE.test(event.end ?? "") ? event.end : null,
    location: text(event.location),
    organizer: text(event.organizer),
    link: safeLink(event.link),
    notes: text(event.notes),
  };
}

/** Why the event can't be saved, or null if it's fine: it needs a title and a real date. */
export function checkEvent(event: Event): string | null {
  if (!event.title.trim()) return "Give the event a name.";
  if (event.title.length > 200) return "The event's name is too long.";
  if (!DATE_RE.test(event.date) || Number.isNaN(Date.parse(`${event.date}T12:00:00Z`))) return "Give the event a date.";
  for (const field of [event.location, event.organizer, event.notes, event.link]) {
    if (field && field.length > 2000) return "One of the event's details is too long.";
  }
  return null;
}

/**
 * Why the invite the browser sent can't be read, or null if it's fine:
 * { text?, filename?, data? } with text of at most MAX_INVITE_LENGTH
 * characters and/or a file, an image (as the AI API takes them) or a PDF, as
 * base64.
 */
export function checkInvite(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Send the invite as JSON.";
  const { text, filename, data } = body as Record<string, unknown>;
  if (text !== undefined && typeof text !== "string") return "Send the invite as text.";
  if (typeof text === "string" && text.length > MAX_INVITE_LENGTH) {
    return `Invites can be at most ${MAX_INVITE_LENGTH.toLocaleString("en-US")} characters.`;
  }
  if (data === undefined) return text?.trim() ? null : "Paste the invite or add a screenshot first.";

  if (typeof filename !== "string" || !filename.trim() || filename.length > 200) return "The file needs a name.";
  if (typeof data !== "string" || !data) return `${filename} is empty.`;
  const type = isBase64(data) ? base64FileType(data) : null;
  if (type === "application/pdf") {
    return base64Bytes(data) > MAX_PDF_BYTES ? `${filename} is over ${MAX_PDF_BYTES / 1024 / 1024} MB.` : null;
  }
  if (!type || !(AI_IMAGE_TYPES as readonly string[]).includes(type)) {
    return `${filename} isn't a JPEG, PNG, GIF, WebP or PDF. Take a screenshot of it instead.`;
  }
  return base64Bytes(data) > MAX_IMAGE_BYTES ? `${filename} is over ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` : null;
}

/** The invite the browser sent, after checkInvite passed. */
export function toInvite(body: { text?: string; filename?: string; data?: string }): Invite {
  const text = body.text?.trim() ? body.text : null;
  if (body.data === undefined) return { text, file: null };
  const type = base64FileType(body.data);
  const file: InviteFile =
    type === "application/pdf"
      ? { kind: "pdf", filename: body.filename!, data: body.data }
      : { kind: "image", mediaType: type as AIImageType, data: body.data };
  return { text, file };
}

/**
 * The event as schedule items, one per day, for a class weekend's calendar
 * and the .ics file (see calendar.ts).
 */
export function eventItems(event: Event): ScheduleItem[] {
  const days: string[] = [event.date];
  if (event.endDate) {
    const day = new Date(`${event.date}T12:00:00Z`);
    // At most two weeks of days, whatever the end date says.
    while (days.length < 14) {
      day.setUTCDate(day.getUTCDate() + 1);
      const next = day.toISOString().slice(0, 10);
      if (next > event.endDate) break;
      days.push(next);
    }
  }
  const multiDay = days.length > 1;
  return days.map((date) => ({
    date,
    start: multiDay ? null : event.start,
    end: multiDay ? null : event.end,
    kind: "event",
    title: event.title,
    course: null,
    instructor: null,
    location: event.location,
    section: null,
    signupOnly: false,
    notes: [event.organizer && `Hosted by ${event.organizer}`, event.notes, event.link].filter(Boolean).join(" · ") || null,
  }));
}
