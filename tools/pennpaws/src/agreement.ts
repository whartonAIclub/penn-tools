// The care agreement both people approve. The template fills it from the
// request with no AI; ai.ts can polish it. Both produce the same shape, so the
// rest of the tool never cares which made it.

import { z } from "@penntools/core/ai";
import { describe, type RequestDraft } from "./request.js";

export const AgreementTerms = z.object({
  dates: z.string(),
  visits: z.string(),
  care: z.string(),
  keys: z.string(),
  pay: z.string(),
  vet: z.string().nullable(),
  ifUrgent: z.string(),
  notes: z.string().nullable(),
});
export type AgreementTerms = z.infer<typeof AgreementTerms>;

export function agreementTemplate(request: RequestDraft, ownerFirstName: string): AgreementTerms {
  const lines = describe(request);
  return {
    dates: lines.when,
    visits: lines.visits,
    care: request.mustHaves.includes("daily_updates") ? `${lines.care}. A photo or video update every day` : lines.care,
    keys: lines.access,
    pay: `${request.pay}, paid directly (for example on Venmo)`,
    vet: request.vet,
    ifUrgent: `Text ${ownerFirstName} first, then call the vet`,
    notes: request.notes,
  };
}

/** The terms with a change request recorded, when no AI is available to apply it. */
export function noteChange(terms: AgreementTerms, change: string, by: string): AgreementTerms {
  const note = `${by} asked: ${change}`;
  return { ...terms, notes: terms.notes ? `${terms.notes}\n${note}` : note };
}
