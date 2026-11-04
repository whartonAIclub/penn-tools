// A pet-care request as the owner posts it: its shape, how browser input is
// checked, and how it reads in plain words. Storage is in requests.ts.

import { z } from "@penntools/core/ai";
import { GENDER_PREFS } from "./profile.js";
import { ACCESS, CARE_TYPES, FREQUENCIES, LANGUAGES, LIMITS, MUST_HAVES, OTHER, PET_KINDS, TASKS, labelOf, listLabels, shortDate } from "./survey.js";

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((option) => option.value) as [T[number]["value"], ...T[number]["value"][]];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.");
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const RequestDraft = z
  .object({
    petName: z.string().trim().min(1, "Add your pet's name.").max(LIMITS.name),
    petKind: z.enum(values(PET_KINDS)),
    petKindOther: optionalText(LIMITS.shortText),
    petDetails: optionalText(LIMITS.shortText),
    photo: z.string().max(LIMITS.photo, "That photo is too large.").startsWith("data:image/").nullable(),
    weekly: z.boolean(),
    startsOn: isoDate.nullable(),
    endsOn: isoDate.nullable(),
    frequency: z.enum(values(FREQUENCIES)),
    frequencyOther: optionalText(LIMITS.shortText),
    tasks: z.array(z.enum(values(TASKS))).min(1, "Pick at least one thing to do.").max(TASKS.length),
    tasksOther: optionalText(LIMITS.shortText),
    access: z.enum(values(ACCESS)),
    accessOther: optionalText(LIMITS.shortText),
    pay: z.string().trim().min(1, "Choose what you'll pay.").max(LIMITS.shortText),
    area: optionalText(LIMITS.shortText),
    vet: optionalText(LIMITS.shortText),
    notes: optionalText(LIMITS.notes),
    // Added later; the defaults keep older requests and callers working.
    careType: z.enum(values(CARE_TYPES)).default("visits"),
    /** What the owner requires of a sitter, compared with sitter profiles. */
    mustHaves: z.array(z.enum(values(MUST_HAVES))).max(MUST_HAVES.length).default([]),
    sitterGender: z.enum(values(GENDER_PREFS)).default("none"),
    /** Languages the owner would like their sitter to speak. Empty for no preference. */
    languages: z.array(z.enum(values(LANGUAGES))).max(LANGUAGES.length).default([]),
    /** The owner's own post, kept when AI read it from another language. */
    original: optionalText(LIMITS.sentence).default(null),
    originalLanguage: optionalText(40).default(null),
  })
  .superRefine((draft, ctx) => {
    const needsText = (chosen: boolean, text: string | null, path: string, message: string) => {
      if (chosen && !text) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };
    needsText(draft.petKind === OTHER || draft.petKind === "several", draft.petKindOther, "petKindOther", "Tell sitters what kind of pet.");
    needsText(draft.frequency === OTHER, draft.frequencyOther, "frequencyOther", "Describe the schedule.");
    needsText(draft.tasks.includes(OTHER), draft.tasksOther, "tasksOther", "Say what else the sitter should do.");
    needsText(draft.access === OTHER, draft.accessOther, "accessOther", "Say how the sitter will get in.");
    if (!draft.weekly) {
      if (!draft.startsOn || !draft.endsOn) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsOn"], message: "Pick a start and end day." });
      } else if (draft.endsOn < draft.startsOn) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsOn"], message: "The end day is before the start day." });
      }
    }
  });
export type RequestDraft = z.infer<typeof RequestDraft>;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** The draft, or the first thing wrong with it. Server actions get browser input, so check it. */
export function checkDraft(input: unknown): Checked<RequestDraft> {
  const result = RequestDraft.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Check your answers and try again." };
}

/**
 * The pasted post with phone numbers, emails and chat handles blanked out, for
 * everyone but the owner: contact details are shared only once both approve.
 */
export function hideContacts(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email hidden]")
    // The name must start a word, or short ones match inside ordinary words:
    // "big dogs" lost its "ig" and "deadline tomorrow" its "line". \b can't do
    // this job, since 微信 is not a \w run and \b微信 would never match.
    .replace(/(?<![A-Za-z0-9_])(微信|wechat|weixin|vx|wx|whatsapp|line|telegram|ig|instagram)\s*(号|id)?\s*[:：]?\s*[\w.-]{3,}/gi, "$1 [hidden]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number hidden]");
}

/** Why the draft's dates can't be posted, or null. `firstDay` is firstBookableDay() as YYYY-MM-DD. */
export function checkDates(draft: Pick<RequestDraft, "weekly" | "startsOn">, firstDay: string): string | null {
  if (draft.weekly || !draft.startsOn || draft.startsOn >= firstDay) return null;
  return `Pick days from ${shortDate(firstDay)} on. Requests start after today.`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const VISITS_BY_CARE_TYPE = {
  stay: "Sitter stays overnight at the owner's home",
  boarding: "Boarding at the sitter's home",
} as const;

/** How the pet is handed over for boarding, in place of how the sitter gets in. */
const BOARDING_HANDOVER: Partial<Record<RequestDraft["access"], string>> = {
  in_person: "Drop-off and pick-up in person",
  decide_later: "Drop-off and pick-up to agree",
};

/** Plain-words lines for a request card and the agreement template. */
export function describe(draft: RequestDraft): {
  pet: string;
  when: string;
  visits: string;
  care: string;
  access: string;
  /** What the owner asks of a sitter, or null when nothing. */
  sitter: string | null;
} {
  const kind =
    draft.petKind === OTHER || draft.petKind === "several"
      ? draft.petKindOther ?? "Pet"
      : capitalize(labelOf(PET_KINDS, draft.petKind).replace(/^A /, ""));
  const care = draft.tasks
    .filter((task) => task !== OTHER)
    .map((task) => labelOf(TASKS, task))
    .concat(draft.tasks.includes(OTHER) && draft.tasksOther ? [draft.tasksOther] : []);
  return {
    pet: [kind, draft.petDetails].filter(Boolean).join(", "),
    when: draft.weekly
      ? "Every week, days to agree"
      : draft.startsOn && draft.endsOn
        ? draft.startsOn === draft.endsOn
          ? shortDate(draft.startsOn)
          : `${shortDate(draft.startsOn)} to ${shortDate(draft.endsOn)}`
        : "Dates to agree",
    visits:
      draft.careType !== "visits"
        ? VISITS_BY_CARE_TYPE[draft.careType]
        : draft.frequency === OTHER
          ? draft.frequencyOther ?? ""
          : labelOf(FREQUENCIES, draft.frequency),
    care: care.join(", "),
    access:
      draft.access === OTHER
        ? draft.accessOther ?? ""
        : (draft.careType === "boarding" ? BOARDING_HANDOVER[draft.access] : undefined) ?? labelOf(ACCESS, draft.access),
    sitter: describeSitterWishes(draft),
  };
}

function describeSitterWishes(draft: RequestDraft): string | null {
  const parts = [
    draft.mustHaves.length ? capitalize(listLabels(MUST_HAVES, draft.mustHaves).toLowerCase()) : null,
    draft.sitterGender !== "none" ? `Prefers a ${labelOf(GENDER_PREFS, draft.sitterGender).toLowerCase()} sitter` : null,
    draft.languages.length ? `Speaks ${listLabels(LANGUAGES, draft.languages).replace(/ and /, " or ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(". ") : null;
}
