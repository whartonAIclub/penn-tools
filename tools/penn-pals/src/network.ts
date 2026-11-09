// The people a student has talked to, and the follow-ups they owe them. Until
// the tool has its own database (section 4 of CLAUDE.md), the page shows
// sampleContacts(), dated relative to today so its follow-ups stay current.
//
// Follow-ups aren't entered by hand: followUpsFor() works them out from each
// call, using the "2-Hour Job Search" rules for after an informational meeting:
//   - a thank-you note within 24 hours that highlights their best advice
//   - a monthly check-in that recaps that advice, every month after the last

export interface Contact {
  id: string;
  name: string;
  /** Penn class, e.g. "WG'19" */
  classYear: string;
  role: string;
  company: string;
  /** ISO date of the informational call */
  callDate: string;
  /** The best piece of advice they gave on the call */
  bestAdvice: string;
  /** ISO date the thank-you note was sent, or null if not yet */
  thankedOn: string | null;
  /** ISO date of the most recent monthly check-in, or null if none yet */
  lastCheckIn: string | null;
}

export type FollowUpKind = "thankYou" | "checkIn";

export interface FollowUp {
  /** `${contactId}:${kind}`, unique since a contact owes at most one of each */
  id: string;
  contactId: string;
  kind: FollowUpKind;
  action: string;
  /** ISO date the follow-up is due */
  due: string;
}

export type FollowUpStatus = "overdue" | "today" | "thisWeek" | "later";

/** Days after the call the thank-you note is due ("within 24 hours"). */
export const THANK_YOU_DAYS = 1;
/** Months between check-ins, counted from the call or the last check-in. */
export const CHECK_IN_MONTHS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIso(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: string, days: number): string {
  const d = parseIso(date);
  return toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** `months` later, on the same day of the month or the month's last day (Jan 31 → Feb 28). */
function addMonths(date: string, months: number): string {
  const d = parseIso(date);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + months + 1, 0).getDate();
  return toIso(new Date(d.getFullYear(), d.getMonth() + months, Math.min(d.getDate(), lastDay)));
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

/** What the student owes this contact next: the thank-you until it's sent, then the next check-in. */
export function followUpsFor(contact: Contact): FollowUp[] {
  const firstName = contact.name.split(" ")[0];
  const advice = `"${contact.bestAdvice}"`;
  if (!contact.thankedOn) {
    return [
      {
        id: `${contact.id}:thankYou`,
        contactId: contact.id,
        kind: "thankYou",
        action: `Thank ${firstName} and highlight their best advice: ${advice}`,
        due: addDays(contact.callDate, THANK_YOU_DAYS),
      },
    ];
  }
  return [
    {
      id: `${contact.id}:checkIn`,
      contactId: contact.id,
      kind: "checkIn",
      action: `Check in with ${firstName}: how acting on ${advice} helped, plus a new question`,
      due: addMonths(contact.lastCheckIn ?? contact.callDate, CHECK_IN_MONTHS),
    },
  ];
}

/** The contact after `followUp` is done on `today`, which schedules what comes next. */
export function completeFollowUp(contact: Contact, followUp: FollowUp, today: string): Contact {
  return followUp.kind === "thankYou" ? { ...contact, thankedOn: today } : { ...contact, lastCheckIn: today };
}

/** Made-up contacts for designing the page. */
export function sampleContacts(today: Date = new Date()): Contact[] {
  const on = (days: number) => addDays(toIso(today), days);
  return [
    { id: "c1", name: "Priya Raman", classYear: "WG'18", role: "Product Lead", company: "Stripe", callDate: on(0), bestAdvice: "Lead with one payments metric you'd move, not your resume", thankedOn: null, lastCheckIn: null },
    { id: "c2", name: "Marcus Bell", classYear: "W'15", role: "Principal", company: "General Catalyst", callDate: on(-3), bestAdvice: "Write a one-page fintech thesis and share it widely", thankedOn: null, lastCheckIn: null },
    { id: "c3", name: "Sofia Alvarez", classYear: "WG'20", role: "Engagement Manager", company: "McKinsey", callDate: on(-1), bestAdvice: "Pick one tech function and talk to five people in it", thankedOn: null, lastCheckIn: null },
    { id: "c4", name: "Daniel Okafor", classYear: "WG'21", role: "Strategy & Ops", company: "Anthropic", callDate: on(-33), bestAdvice: "Read the company's research before any AI go-to-market chat", thankedOn: on(-32), lastCheckIn: null },
    { id: "c5", name: "Hannah Kim", classYear: "WG'17", role: "Director of Growth", company: "Duolingo", callDate: on(-55), bestAdvice: "Run a small growth experiment and bring the results", thankedOn: on(-54), lastCheckIn: on(-26) },
    { id: "c6", name: "Lucas Moreau", classYear: "WG'22", role: "Associate", company: "Bain Capital Ventures", callDate: on(-20), bestAdvice: "Build a market map; it's the best conversation starter in VC", thankedOn: on(-19), lastCheckIn: null },
  ];
}
