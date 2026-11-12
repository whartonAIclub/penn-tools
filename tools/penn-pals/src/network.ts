// The follow-ups a student owes the people they've talked to, worked out from
// the contacts the intake saves (contacts.ts) with the "2-Hour Job Search"
// rules for after an informational meeting:
//   - a thank-you email within 24 hours that highlights their best advice
//   - a check-in about two months later that recaps that advice; the user can
//     make it repeat every N weeks, months or years (otherwise it happens once)
// The intake decides which of the two a contact gets (its next steps); these
// rules only date them when the intake didn't, and schedule the next check-in
// when the contact's check-in repeats.
// A contact's best advice is its first key takeaway.

import { addDays } from "./debrief.js";
import { STEP_ACTIONS, SUGGESTED_CHECK_IN_MONTHS } from "./contacts.js";
import type { Contact, NextStep, Recurrence } from "./contacts.js";

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

/** `date` plus one repeat: N weeks, N months (clamped to the month's end) or N years. */
export function addRecurrence(date: string, { every, unit }: Recurrence): string {
  if (unit === "week") return addDays(date, 7 * every);
  if (unit === "month") return addMonths(date, every);
  return addMonths(date, 12 * every);
}

/** When a step is due if the user gave no date: the thank-you the next day, the check-in two months after the chat. */
export function workshopDue(kind: FollowUpKind, meetingDate: string): string {
  return kind === "thankYou" ? addDays(meetingDate, THANK_YOU_DAYS) : addMonths(meetingDate, SUGGESTED_CHECK_IN_MONTHS);
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
    const action = kind === "thankYou" ? `Thank ${firstName}` : `Check in with ${firstName}`;
    const due = step.dueDate ?? workshopDue(kind, contact.meetingDate);
    return [{ id: `${contact.id}:${stepIndex}`, contactId: contact.id, stepIndex, kind, action, due }];
  });
}

/**
 * The contact with the finished step at `stepIndex` open again, so it returns
 * to the to-do list. Finishing a repeating check-in scheduled the next one; if
 * that one is still untouched (open, on the date it was given), it's removed so
 * reopening doesn't leave a duplicate. A one-off check-in scheduled nothing.
 */
export function reopenStep(contact: Contact, stepIndex: number): Contact {
  const target = contact.nextSteps[stepIndex];
  if (!target?.done) return contact;
  const scheduledDue =
    target.doneOn && kindOf(target) === "followUp" && contact.recurrence ? addRecurrence(target.doneOn, contact.recurrence) : null;
  let removed = false;
  const nextSteps = contact.nextSteps.flatMap((step, i) => {
    if (i === stepIndex) return [{ ...step, done: false, doneOn: null }];
    const isScheduled =
      scheduledDue && !removed && i > stepIndex && !step.done && step.action === FOLLOW_UP_ACTION && step.dueDate === scheduledDue;
    if (isScheduled) {
      removed = true;
      return [];
    }
    return [step];
  });
  return { ...contact, nextSteps };
}

/** The contact with the open step at `stepIndex` due on `date` (YYYY-MM-DD) instead; finished steps are left alone. */
export function rescheduleStep(contact: Contact, stepIndex: number, date: string): Contact {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || contact.nextSteps[stepIndex]?.done !== false) return contact;
  return {
    ...contact,
    nextSteps: contact.nextSteps.map((step, i) => (i === stepIndex ? { ...step, dueDate: date } : step)),
  };
}

/** The contact with `followUp` done on `today`; a done check-in schedules the next one a repeat later, when the contact's check-in repeats, and nothing otherwise. */
export function markFollowUpDone(contact: Contact, followUp: FollowUp, today: string): Contact {
  const nextSteps = contact.nextSteps.map((step, i) => (i === followUp.stepIndex ? { ...step, done: true, doneOn: today } : step));
  if (followUp.kind === "followUp" && contact.recurrence) {
    nextSteps.push({
      action: FOLLOW_UP_ACTION,
      owner: "me",
      dueDate: addRecurrence(today, contact.recurrence),
      done: false,
      doneOn: null,
    });
  }
  return { ...contact, nextSteps };
}
