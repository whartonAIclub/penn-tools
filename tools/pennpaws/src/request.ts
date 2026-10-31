// A pet-care request as the owner posts it: its shape, how browser input is
// checked, and how it reads in plain words. Storage is in requests.ts.

import { z } from "@penntools/core/ai";
import { ACCESS, FREQUENCIES, LIMITS, OTHER, PET_KINDS, TASKS, labelOf, shortDate } from "./survey.js";

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
    notes: optionalText(LIMITS.notes),
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

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Plain-words lines for a request card and the agreement template. */
export function describe(draft: RequestDraft): {
  pet: string;
  when: string;
  visits: string;
  care: string;
  access: string;
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
    visits: draft.frequency === OTHER ? draft.frequencyOther ?? "" : labelOf(FREQUENCIES, draft.frequency),
    care: care.join(", "),
    access: draft.access === OTHER ? draft.accessOther ?? "" : labelOf(ACCESS, draft.access),
  };
}
