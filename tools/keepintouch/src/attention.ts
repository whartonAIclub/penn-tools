// Who needs attention, and when. Pure functions of the contacts and today's
// date (YYYY-MM-DD where the user is), so the page can sort in the browser and
// the rules are easy to test.
//
// A contact is due on the earlier of their follow-up date and their last time
// in touch plus their check-in interval. Someone never in touch counts from the
// day they were added.

import type { Contact } from "./contacts.js";

export type AttentionGroup = "overdue" | "today" | "week" | "later" | "none";

/** The home list's sections, in order. */
export const ATTENTION_GROUPS: readonly { group: AttentionGroup; label: string }[] = [
  { group: "overdue", label: "Overdue" },
  { group: "today", label: "Today" },
  { group: "week", label: "This week" },
  { group: "later", label: "Later" },
  { group: "none", label: "No follow-up planned" },
];

export interface Attention {
  /** YYYY-MM-DD the contact is due, or null if nothing is planned. */
  dueOn: string | null;
  /** Whether the follow-up date or the check-in interval sets dueOn. */
  reason: "follow_up" | "interval" | null;
  /** Days from today to dueOn, negative when overdue; null if nothing is planned. */
  daysUntilDue: number | null;
  group: AttentionGroup;
}

export interface ContactWithAttention {
  contact: Contact;
  attention: Attention;
}

/** "This week" is the 7 days after today. */
const WEEK_DAYS = 7;

const DAY_MS = 86_400_000;

export function attentionFor(contact: Contact, today: string): Attention {
  let dueOn: string | null = contact.followUpOn;
  let reason: Attention["reason"] = dueOn === null ? null : "follow_up";

  if (contact.cadenceDays !== null) {
    const intervalDue = addDays(contact.lastContactedOn ?? contact.addedOn, contact.cadenceDays);
    // On a tie the follow-up wins: its to-do says more than "it's been a while".
    if (dueOn === null || intervalDue < dueOn) {
      dueOn = intervalDue;
      reason = "interval";
    }
  }

  if (dueOn === null) return { dueOn: null, reason: null, daysUntilDue: null, group: "none" };
  const daysUntilDue = daysBetween(today, dueOn);
  const group: AttentionGroup =
    daysUntilDue < 0 ? "overdue" : daysUntilDue === 0 ? "today" : daysUntilDue <= WEEK_DAYS ? "week" : "later";
  return { dueOn, reason, daysUntilDue, group };
}

/**
 * The contacts with who needs attention soonest first: the most overdue, then
 * the next due. People with nothing planned come last, longest out of touch first.
 */
export function sortByAttention(contacts: Contact[], today: string): ContactWithAttention[] {
  return contacts
    .map((contact) => ({ contact, attention: attentionFor(contact, today) }))
    .sort((a, b) => {
      const aDue = a.attention.dueOn;
      const bDue = b.attention.dueOn;
      if (aDue !== null && bDue === null) return -1;
      if (aDue === null && bDue !== null) return 1;
      const aKey = aDue ?? a.contact.lastContactedOn ?? a.contact.addedOn;
      const bKey = bDue ?? b.contact.lastContactedOn ?? b.contact.addedOn;
      return aKey.localeCompare(bKey) || a.contact.name.localeCompare(b.contact.name);
    });
}

/** The YYYY-MM-DD date `days` after `date` (before, if negative). */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from one YYYY-MM-DD date to another, negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** Days since 1970-01-01 for a YYYY-MM-DD date, counted in UTC so time zones and daylight saving can't shift it. */
function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / DAY_MS;
}
