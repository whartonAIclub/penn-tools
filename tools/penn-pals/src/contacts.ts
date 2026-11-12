// ─────────────────────────────────────────────────────────────────────────────
// Penn Pals contacts: the form's data, its checks, and the follow-up rules
//
// Pure functions with no AI and no storage of their own: the page passes in
// `today` and keeps the contacts (in the browser for now). That keeps every
// rule testable (see __tests__/contacts.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import { addDays, DEFAULT_FOLLOW_UP_DAYS, isDate, MAX_NOTES_LENGTH } from "./debrief.js";

/**
 * Every stored relationship. "recruiter" is kept so older contacts still load,
 * but the form no longer offers it: a recruiter is someone outside Penn, so it
 * overlapped with "industry".
 */
export const RELATIONSHIPS = ["1Y", "2Y", "alumni", "faculty", "industry", "recruiter", "other"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

/** What the form offers: one answer per person, with "other" for anything else, written in. */
export const FORM_RELATIONSHIPS = ["1Y", "2Y", "alumni", "faculty", "industry", "other"] as const satisfies readonly Relationship[];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  "1Y": "Wharton 1Y",
  "2Y": "Wharton 2Y",
  alumni: "Penn or Wharton alum",
  faculty: "Penn faculty or staff",
  industry: "Outside Penn (industry, recruiters)",
  recruiter: "Recruiter",
  other: "Other",
};

/** How a contact's relationship reads: the user's own words for "other", when given. */
export function relationshipLabel(contact: Pick<Contact, "relationship" | "relationshipOther">): string {
  return contact.relationship === "other" && contact.relationshipOther
    ? contact.relationshipOther
    : RELATIONSHIP_LABELS[contact.relationship];
}

/** The user's own relationship labels across their contacts, without duplicates (ignoring case), A to Z. */
export function customRelationships(contacts: Contact[]): string[] {
  const byKey = new Map<string, string>();
  for (const c of contacts) {
    const label = c.relationship === "other" ? c.relationshipOther?.trim() : null;
    if (label && !byKey.has(label.toLowerCase())) byKey.set(label.toLowerCase(), label);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export const VIBES = ["great", "good", "neutral", "lukewarm"] as const;
export type Vibe = (typeof VIBES)[number];

/** How senior the person is: one level each, from student to executive. */
export const SENIORITIES = ["student", "entry", "mid", "senior", "executive"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  student: "Student or intern",
  entry: "Entry level (Analyst, Associate)",
  mid: "Mid level (Manager, Senior Associate)",
  senior: "Senior (Director, Principal)",
  executive: "Executive (VP, Partner, C-suite, Founder)",
};

/** How far back a conversation can be dated, and how far ahead a follow-up, so a mistyped year (0011, 2206) is caught. */
export const MAX_YEARS_BACK = 10;
export const MAX_YEARS_AHEAD = 2;

/** The next steps the form offers. */
export const STEP_ACTIONS = ["Send a thank-you email", "Follow up"] as const;

/** Days ahead that count as "due this week". */
export const DUE_SOON_DAYS = 7;

const MAX_FIELD_LENGTH = 300;
const MAX_STEPS = 20;

// ── What gets stored ──────────────────────────────────────────────────────────

const NextStep = z.object({
  action: z.string(),
  owner: z.enum(["me", "them"]),
  dueDate: z.string().nullable(),
  done: z.boolean(),
  /** The day it was marked done; missing or null while open, and for steps finished before this was recorded. */
  doneOn: z.string().nullable().optional(),
});
export type NextStep = z.infer<typeof NextStep>;

export const Contact = z.object({
  id: z.string(),
  name: z.string(),
  relationship: z.enum(RELATIONSHIPS),
  /** The user's own label when the relationship is "other"; null or missing otherwise (optional so older contacts load). */
  relationshipOther: z.string().nullable().optional(),
  classYear: z.string().nullable(),
  /** Optional so contacts saved before it existed still load. */
  seniority: z.enum(SENIORITIES).nullable().optional(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  area: z.string().nullable(),
  location: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedin: z.string().nullable(),
  meetingDate: z.string(),
  vibe: z.enum(VIBES),
  // .default(false) so contacts saved before these fields existed still load.
  offeredReferral: z.boolean().default(false),
  offeredIntro: z.boolean().default(false),
  takeaways: z.array(z.string()),
  nextSteps: z.array(NextStep),
  /** The user's full notes, kept as written. */
  notes: z.string(),
  /** When to check in if no open next step has a due date; set automatically, not on the form. */
  checkInDate: z.string(),
  createdAt: z.string(),
});
export type Contact = z.infer<typeof Contact>;

// ── What the form holds ───────────────────────────────────────────────────────

/** The form's fields as typed: every one a string, empty when left blank. */
export interface ContactDraft {
  name: string;
  relationship: Relationship;
  /** The user's own label, used when the relationship is "other". */
  relationshipOther: string;
  classYear: string;
  /** Empty when not given. */
  seniority: Seniority | "";
  company: string;
  role: string;
  area: string;
  location: string;
  email: string;
  phone: string;
  linkedin: string;
  meetingDate: string;
  vibe: Vibe;
  /** They offered to refer you. */
  offeredReferral: boolean;
  /** They offered to connect you with someone else at their company. */
  offeredIntro: boolean;
  /** One takeaway per line. */
  takeaways: string;
  nextSteps: { action: string; owner: "me" | "them"; dueDate: string }[];
  notes: string;
}

export function emptyDraft(today: string): ContactDraft {
  return {
    name: "",
    relationship: "industry",
    relationshipOther: "",
    classYear: "",
    seniority: "",
    company: "",
    role: "",
    area: "",
    location: "",
    email: "",
    phone: "",
    linkedin: "",
    meetingDate: today,
    vibe: "good",
    offeredReferral: false,
    offeredIntro: false,
    takeaways: "",
    nextSteps: [],
    notes: "",
  };
}

export type BuildResult = { ok: true; contact: Contact } | { ok: false; errors: string[] };

/**
 * A contact from the form. Only the name is required. The check-in date is
 * `today` plus DEFAULT_FOLLOW_UP_DAYS; blank steps are dropped.
 */
export function buildContact(draft: ContactDraft, today: string, id: string): BuildResult {
  const errors: string[] = [];
  const text = (value: string, label: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length > MAX_FIELD_LENGTH) errors.push(`Keep ${label} to at most ${MAX_FIELD_LENGTH} characters.`);
    return trimmed || null;
  };

  const name = draft.name.trim();
  if (!name) errors.push("Enter the contact's full name.");
  else if (name.length > MAX_FIELD_LENGTH) errors.push(`Keep the name to at most ${MAX_FIELD_LENGTH} characters.`);

  const relationshipOther = draft.relationship === "other" ? text(draft.relationshipOther, "the relationship") : null;
  const classYear = text(draft.classYear, "the class year");
  const company = text(draft.company, "the company");
  const role = text(draft.role, "the role");
  const area = text(draft.area, "the area");
  const location = text(draft.location, "the location");
  const phone = text(draft.phone, "the phone number");
  const linkedin = text(draft.linkedin, "the LinkedIn link");
  const email = text(draft.email, "the email");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push("Enter a valid email address.");

  const meetingDate = draft.meetingDate.trim() || today;
  const earliest = addDays(today, -365 * MAX_YEARS_BACK);
  const latest = addDays(today, 365 * MAX_YEARS_AHEAD);
  if (!isDate(meetingDate)) errors.push("Enter a valid date of conversation.");
  else if (meetingDate > today) errors.push("The date of conversation can't be in the future.");
  else if (meetingDate < earliest) errors.push(`The date of conversation can't be more than ${MAX_YEARS_BACK} years ago. Check the year.`);

  if (draft.notes.length > MAX_NOTES_LENGTH) errors.push(`Keep the notes to at most ${MAX_NOTES_LENGTH} characters.`);

  const steps = draft.nextSteps.filter((s) => s.action.trim());
  if (steps.length > MAX_STEPS) errors.push(`Keep next steps to at most ${MAX_STEPS}.`);
  const nextSteps: NextStep[] = steps.map((s) => {
    if (!(STEP_ACTIONS as readonly string[]).includes(s.action.trim())) {
      errors.push(`"${s.action.trim()}" isn't one of the next step options.`);
    }
    const dueDate = s.dueDate.trim();
    if (dueDate && !isDate(dueDate)) errors.push(`"${s.action.trim()}" has an invalid due date.`);
    else if (dueDate && dueDate < meetingDate) errors.push(`"${s.action.trim()}" is due before the conversation. Check the date.`);
    else if (dueDate && dueDate > latest) errors.push(`"${s.action.trim()}" is due more than ${MAX_YEARS_AHEAD} years from now. Check the year.`);
    return { action: s.action.trim(), owner: s.owner, dueDate: dueDate || null, done: false, doneOn: null };
  });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    contact: {
      id,
      name,
      relationship: draft.relationship,
      relationshipOther,
      classYear,
      seniority: draft.seniority || null,
      company,
      role,
      area,
      location,
      email,
      phone,
      linkedin,
      meetingDate,
      vibe: draft.vibe,
      offeredReferral: draft.offeredReferral,
      offeredIntro: draft.offeredIntro,
      takeaways: draft.takeaways
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      nextSteps,
      notes: draft.notes,
      checkInDate: addDays(today, DEFAULT_FOLLOW_UP_DAYS),
      createdAt: today,
    },
  };
}

// ── Editing ───────────────────────────────────────────────────────────────────

/**
 * The form's fields for an existing contact. Only open next steps go in the
 * form; finished ones stay in the contact's history and aren't edited.
 */
export function contactToDraft(contact: Contact): ContactDraft {
  return {
    name: contact.name,
    relationship: contact.relationship,
    relationshipOther: contact.relationshipOther ?? "",
    classYear: contact.classYear ?? "",
    seniority: contact.seniority ?? "",
    company: contact.company ?? "",
    role: contact.role ?? "",
    area: contact.area ?? "",
    location: contact.location ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    linkedin: contact.linkedin ?? "",
    meetingDate: contact.meetingDate,
    vibe: contact.vibe,
    offeredReferral: contact.offeredReferral,
    offeredIntro: contact.offeredIntro,
    takeaways: contact.takeaways.join("\n"),
    nextSteps: contact.nextSteps
      .filter((step) => !step.done)
      .map((step) => ({ action: step.action, owner: step.owner, dueDate: step.dueDate ?? "" })),
    notes: contact.notes,
  };
}

/**
 * `original` with the edited form applied. The id, creation date and check-in
 * date are kept, and finished next steps stay as they were, ahead of the open
 * ones from the form.
 */
export function updateContact(original: Contact, draft: ContactDraft, today: string): BuildResult {
  const result = buildContact(draft, today, original.id);
  if (!result.ok) return result;
  return {
    ok: true,
    contact: {
      ...result.contact,
      createdAt: original.createdAt,
      checkInDate: original.checkInDate,
      nextSteps: [...original.nextSteps.filter((step) => step.done), ...result.contact.nextSteps],
    },
  };
}

// ── Follow-up rules ───────────────────────────────────────────────────────────

export type DueStatus = "overdue" | "soon" | "later";

/**
 * What the contact is due for: the earliest open next step that has a due date,
 * otherwise a check-in on `checkInDate`.
 */
export function nextDue(contact: Contact): { date: string; label: string } {
  const open = contact.nextSteps
    .filter((step) => !step.done && step.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const first = open[0];
  return first ? { date: first.dueDate!, label: first.action } : { date: contact.checkInDate, label: "Check in" };
}

/** Overdue before today, soon within DUE_SOON_DAYS (today included), later after that. */
export function dueStatus(contact: Contact, today: string): DueStatus {
  const { date } = nextDue(contact);
  if (date < today) return "overdue";
  if (date <= addDays(today, DUE_SOON_DAYS)) return "soon";
  return "later";
}

/** Earliest due first; ties by name. Doesn't change the input. */
export function sortByFollowUp(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) => nextDue(a).date.localeCompare(nextDue(b).date) || a.name.localeCompare(b.name));
}

/** The contacts to act on now (overdue or due soon) and the rest, each earliest first. */
export function splitByDue(contacts: Contact[], today: string): { dueNow: Contact[]; later: Contact[] } {
  const sorted = sortByFollowUp(contacts);
  return {
    dueNow: sorted.filter((c) => dueStatus(c, today) !== "later"),
    later: sorted.filter((c) => dueStatus(c, today) === "later"),
  };
}

/**
 * The user followed up: steps due today or earlier are marked done, and the
 * next check-in is DEFAULT_FOLLOW_UP_DAYS from today. Steps due later stay open.
 */
export function completeFollowUp(contact: Contact, today: string): Contact {
  return {
    ...contact,
    nextSteps: contact.nextSteps.map((step) =>
      step.dueDate && step.dueDate <= today ? { ...step, done: true, doneOn: step.doneOn ?? today } : step,
    ),
    checkInDate: addDays(today, DEFAULT_FOLLOW_UP_DAYS),
  };
}

/** The contact with next step `index` ticked or unticked. */
export function toggleStep(contact: Contact, index: number): Contact {
  return {
    ...contact,
    nextSteps: contact.nextSteps.map((step, i) => (i === index ? { ...step, done: !step.done, doneOn: null } : step)),
  };
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/** Contacts from stored JSON. Bad JSON gives none; entries that don't match the shape are skipped. */
export function parseStoredContacts(raw: string | null): Contact[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    // Earlier versions stored `followUpDate`; it becomes the check-in date.
    const migrated =
      item && typeof item === "object" && !("checkInDate" in item) && "followUpDate" in item
        ? { ...item, checkInDate: (item as { followUpDate: unknown }).followUpDate }
        : item;
    const parsed = Contact.safeParse(migrated);
    return parsed.success ? [parsed.data] : [];
  });
}
