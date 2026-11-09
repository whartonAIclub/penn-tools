// The follow-ups a student owes the people they've talked to, worked out from
// the contacts the intake saves (contacts.ts) with the "2-Hour Job Search"
// rules for after an informational meeting:
//   - a thank-you email within 24 hours that highlights their best advice
//   - a follow-up a month later that recaps that advice, then every month
// The intake decides which of the two a contact gets (its next steps); these
// rules only date them when the intake didn't, and schedule the next follow-up.
// A contact's best advice is its first key takeaway.

import { addDays } from "./debrief.js";
import { STEP_ACTIONS } from "./contacts.js";
import type { Contact, NextStep } from "./contacts.js";

/** Where the browser keeps saved contacts, shared by the tracker and landing pages. */
export const CONTACTS_STORAGE_KEY = "penn-pals:contacts:v1";

export type FollowUpKind = "thankYou" | "followUp";

export interface FollowUp {
  /** `${contactId}:${stepIndex}` */
  id: string;
  contactId: string;
  /** Index of the next step in `contact.nextSteps` */
  stepIndex: number;
  kind: FollowUpKind;
  action: string;
  /** ISO date the follow-up is due */
  due: string;
}

export type FollowUpStatus = "overdue" | "today" | "thisWeek" | "later";

/** Days after the call the thank-you email is due ("within 24 hours"). */
export const THANK_YOU_DAYS = 1;
/** Months between follow-ups, counted from the call or the last follow-up. */
export const FOLLOW_UP_MONTHS = 1;

const [THANK_YOU_ACTION, FOLLOW_UP_ACTION] = STEP_ACTIONS;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `months` later, on the same day of the month or the month's last day (Jan 31 → Feb 28). */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y!, m! - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y!, m! - 1 + months, Math.min(d!, lastDay))).toISOString().slice(0, 10);
}

/** Whole days from `today` to `date`; negative when `date` is in the past. */
export function daysFrom(today: Date, date: string): number {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - start) / DAY_MS);
}

export function followUpStatus(today: Date, due: string): FollowUpStatus {
  const days = daysFrom(today, due);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "thisWeek";
  return "later";
}

/** The best piece of advice from the call: the first key takeaway, or null if there are none. */
export function bestAdvice(contact: Contact): string | null {
  return contact.takeaways[0] ?? null;
}

function kindOf(step: NextStep): FollowUpKind | null {
  if (step.action === THANK_YOU_ACTION) return "thankYou";
  if (step.action === FOLLOW_UP_ACTION) return "followUp";
  return null;
}

/** Open follow-ups of each kind, for the page's summary. */
export function countByKind(followUps: FollowUp[]): Record<FollowUpKind, number> {
  return {
    thankYou: followUps.filter((f) => f.kind === "thankYou").length,
    followUp: followUps.filter((f) => f.kind === "followUp").length,
  };
}

/** The student's open thank-you and follow-up steps for this contact, dated by the workshop rules when the intake didn't. */
export function followUpsFor(contact: Contact): FollowUp[] {
  const firstName = contact.name.split(" ")[0];
  return contact.nextSteps.flatMap((step, stepIndex) => {
    const kind = kindOf(step);
    if (!kind || step.done || step.owner !== "me") return [];
    // Kept short for the to-do list; the contact's card shows the advice to mention.
    const action = kind === "thankYou" ? `Thank ${firstName}` : `Follow up with ${firstName}`;
    const due =
      step.dueDate ??
      (kind === "thankYou" ? addDays(contact.meetingDate, THANK_YOU_DAYS) : addMonths(contact.meetingDate, FOLLOW_UP_MONTHS));
    return [{ id: `${contact.id}:${stepIndex}`, contactId: contact.id, stepIndex, kind, action, due }];
  });
}

/** The contact with `followUp` done on `today`; a done follow-up schedules the next one a month later. */
export function markFollowUpDone(contact: Contact, followUp: FollowUp, today: string): Contact {
  const nextSteps = contact.nextSteps.map((step, i) => (i === followUp.stepIndex ? { ...step, done: true } : step));
  if (followUp.kind === "followUp") {
    nextSteps.push({ action: FOLLOW_UP_ACTION, owner: "me", dueDate: addMonths(today, FOLLOW_UP_MONTHS), done: false });
  }
  return { ...contact, nextSteps };
}
