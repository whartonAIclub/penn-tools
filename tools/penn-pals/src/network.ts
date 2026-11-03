// The people a student has talked to and the follow-ups they owe them. Until
// the tool has its own database (section 4 of CLAUDE.md), the page shows
// sampleNetwork(), dated relative to today so its follow-ups stay current.

export interface Contact {
  id: string;
  name: string;
  /** Penn class, e.g. "WG'19" */
  classYear: string;
  role: string;
  company: string;
  /** ISO date of the most recent conversation */
  lastChat: string;
  /** One-line takeaway from the last conversation */
  note: string;
}

export interface FollowUp {
  id: string;
  contactId: string;
  action: string;
  /** ISO date the follow-up is due */
  due: string;
}

export interface Network {
  contacts: Contact[];
  followUps: FollowUp[];
}

export type FollowUpStatus = "overdue" | "today" | "thisWeek" | "later";

const DAY_MS = 24 * 60 * 60 * 1000;

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

function isoDaysFrom(today: Date, days: number): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Made-up contacts and follow-ups for designing the page. */
export function sampleNetwork(today: Date = new Date()): Network {
  const on = (days: number) => isoDaysFrom(today, days);
  return {
    contacts: [
      { id: "c1", name: "Priya Raman", classYear: "WG'18", role: "Product Lead", company: "Stripe", lastChat: on(-3), note: "Hiring PM interns for payments; open to a referral." },
      { id: "c2", name: "Marcus Bell", classYear: "W'15", role: "Principal", company: "General Catalyst", lastChat: on(-9), note: "Looks at fintech seed deals; liked our thesis." },
      { id: "c3", name: "Sofia Alvarez", classYear: "WG'20", role: "Engagement Manager", company: "McKinsey", lastChat: on(-1), note: "Moved from consulting to tech? Ask about her path." },
      { id: "c4", name: "Daniel Okafor", classYear: "WG'21", role: "Strategy & Ops", company: "Anthropic", lastChat: on(-14), note: "Suggested reading on AI go-to-market." },
      { id: "c5", name: "Hannah Kim", classYear: "WG'17", role: "Director of Growth", company: "Duolingo", lastChat: on(-21), note: "Runs a summer MBA program; applications open soon." },
      { id: "c6", name: "Lucas Moreau", classYear: "WG'22", role: "Associate", company: "Bain Capital Ventures", lastChat: on(-6), note: "Happy to review a market map." },
    ],
    followUps: [
      { id: "f1", contactId: "c2", action: "Send thank-you note and the fintech thesis deck", due: on(-2) },
      { id: "f2", contactId: "c1", action: "Share resume for the PM intern referral", due: on(0) },
      { id: "f3", contactId: "c3", action: "Thank her and ask for an intro to her tech contact", due: on(2) },
      { id: "f4", contactId: "c6", action: "Send the market map for feedback", due: on(4) },
      { id: "f5", contactId: "c4", action: "Share takeaways from the reading he suggested", due: on(-5) },
      { id: "f6", contactId: "c5", action: "Check in when summer applications open", due: on(12) },
    ],
  };
}
