// What the user enters for a contact or an interaction, and the checks it must
// pass. Server actions get this from the browser, so they check it here before
// anything is saved.

/** How often the user can choose to check in with someone. */
export const CADENCES = [
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
  { days: 90, label: "Every 3 months" },
  { days: 180, label: "Every 6 months" },
] as const;

export const DEFAULT_CADENCE_DAYS = 30;

/** How the user met someone. The values are also listed in schema.sql. */
export const MET_HOW = [
  { value: "recruiting", label: "Recruiting event" },
  { value: "class", label: "Class" },
  { value: "club", label: "Club" },
  { value: "conference", label: "Conference" },
  { value: "social", label: "Social" },
  { value: "intro", label: "Introduction" },
  { value: "other", label: "Other" },
] as const;
export type MetHow = (typeof MET_HOW)[number]["value"];

/** Longest allowed text for each field, in characters, and the most tags per contact. */
export const LIMITS = {
  name: 120,
  company: 120,
  role: 120,
  metAt: 200,
  notes: 4000,
  followUpNote: 300,
  summary: 2000,
  tag: 30,
  tags: 10,
  /** A quick note for the AI to fill in the add form from (capture.ts). */
  quickNote: 2000,
} as const;

/** Ways of being in touch after meeting someone. */
export const INTERACTION_KINDS = ["message", "call", "meeting"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

/** A contact's details, as entered. Dates are YYYY-MM-DD. */
export interface ContactInput {
  name: string;
  company: string | null;
  role: string | null;
  metHow: MetHow | null;
  /** Where they met, e.g. "PE club panel". */
  metAt: string | null;
  metOn: string | null;
  /** The user's own labels, e.g. "alumni"; no two the same ignoring case. */
  tags: string[];
  /** What they talked about and what the person cares about. */
  notes: string;
  /** How often to check in, one of CADENCES; null for only when a follow-up is set. */
  cadenceDays: number | null;
  followUpOn: string | null;
  followUpNote: string | null;
}

/** One time in touch, as entered, and the contact's next follow-up after it. */
export interface InteractionInput {
  /** YYYY-MM-DD */
  occurredOn: string;
  kind: InteractionKind;
  summary: string;
  /** Replaces the contact's follow-up date; null clears it. */
  nextFollowUpOn: string | null;
  nextFollowUpNote: string | null;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** The contact's details with text trimmed and blanks as null, or what's wrong with them. */
export function checkContactInput(raw: unknown): Checked<ContactInput> {
  return check(() => {
    const input = fields(raw);
    const name = text(input["name"], "the name", LIMITS.name);
    if (!name) throw new InputError("Enter a name.");

    const metHow = input["metHow"] || null;
    if (metHow !== null && !MET_HOW.some((m) => m.value === metHow)) throw new InputError("Choose how you met.");

    const cadenceDays = input["cadenceDays"] ?? null;
    if (cadenceDays !== null && !CADENCES.some((c) => c.days === cadenceDays)) {
      throw new InputError("Choose how often to stay in touch.");
    }

    return {
      name,
      company: text(input["company"], "the company", LIMITS.company),
      role: text(input["role"], "the role", LIMITS.role),
      metHow: metHow as MetHow | null,
      metAt: text(input["metAt"], "where you met", LIMITS.metAt),
      metOn: date(input["metOn"], "The date you met"),
      tags: tags(input["tags"]),
      notes: text(input["notes"], "the notes", LIMITS.notes) ?? "",
      cadenceDays: cadenceDays as number | null,
      followUpOn: date(input["followUpOn"], "The follow-up date"),
      followUpNote: text(input["followUpNote"], "the follow-up", LIMITS.followUpNote),
    };
  });
}

/** The interaction with its text trimmed, or what's wrong with it. */
export function checkInteractionInput(raw: unknown): Checked<InteractionInput> {
  return check(() => {
    const input = fields(raw);
    const occurredOn = date(input["occurredOn"], "The date");
    if (!occurredOn) throw new InputError("Enter when you were in touch.");
    const kind = input["kind"];
    if (!INTERACTION_KINDS.includes(kind as InteractionKind)) throw new InputError("Choose how you were in touch.");
    return {
      occurredOn,
      kind: kind as InteractionKind,
      summary: text(input["summary"], "the summary", LIMITS.summary) ?? "",
      nextFollowUpOn: date(input["nextFollowUpOn"], "The next follow-up date"),
      nextFollowUpNote: text(input["nextFollowUpNote"], "the follow-up", LIMITS.followUpNote),
    };
  });
}

/** Whether `value` is a real calendar date written YYYY-MM-DD. */
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Rolls over impossible dates (2026-02-30 becomes March 2), so compare back.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

class InputError extends Error {}

function check<T>(read: () => T): Checked<T> {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
}

function fields(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new InputError("Check the form and try again.");
  return raw as Record<string, unknown>;
}

/** Trimmed text, or null when blank. */
function text(value: unknown, label: string, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new InputError("Check the form and try again.");
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new InputError(`Keep ${label} to at most ${maxLength} characters.`);
  return trimmed || null;
}

/** A YYYY-MM-DD date, or null when blank. */
function date(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !isDate(value)) throw new InputError(`${label} isn't a valid date.`);
  return value;
}

/** Tags with spacing tidied, blanks dropped and repeats (ignoring case) removed. */
function tags(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new InputError("Check the form and try again.");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const tag = text(item, "each tag", LIMITS.tag)?.replace(/\s+/g, " ");
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    result.push(tag);
  }
  if (result.length > LIMITS.tags) throw new InputError(`Use at most ${LIMITS.tags} tags.`);
  return result;
}
