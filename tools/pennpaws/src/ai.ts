// The tool's AI calls, all structured and on the fast tier. Each has a
// non-AI path (the survey, the agreement template), so a user without a key
// can still post and book.

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { ACCESS, FREQUENCIES, LIMITS, PET_KINDS, TASKS } from "./survey.js";
import { AgreementTerms, type AgreementTerms as Terms } from "./agreement.js";

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((option) => option.value) as [T[number]["value"], ...T[number]["value"][]];

// Survey answers the model could find in one sentence. Anything it can't find
// stays null and the survey asks for it.
export const ParsedRequest = z.object({
  petName: z.string().nullable(),
  petKind: z.enum(values(PET_KINDS)).nullable(),
  petKindOther: z.string().nullable().describe("Only when petKind is other or several: the kind or list of pets"),
  petDetails: z.string().nullable().describe("Breed, age, size or temperament"),
  weekly: z.boolean().nullable().describe("True when the owner wants a regular weekly visitor"),
  startsOn: z.string().nullable().describe("YYYY-MM-DD"),
  endsOn: z.string().nullable().describe("YYYY-MM-DD"),
  frequency: z.enum(values(FREQUENCIES)).nullable(),
  frequencyOther: z.string().nullable(),
  tasks: z.array(z.enum(values(TASKS))).nullable(),
  tasksOther: z.string().nullable(),
  access: z.enum(values(ACCESS)).nullable(),
  accessOther: z.string().nullable(),
  pay: z.string().nullable().describe('For example "$20 a visit"'),
  area: z.string().nullable().describe("Neighborhood or street near campus"),
  notes: z.string().nullable().describe("Health, quirks or vet details"),
});
export type ParsedRequest = z.infer<typeof ParsedRequest>;

/** Survey answers found in the owner's one-sentence description. */
export async function parseSentence(ai: AI, provider: AIProvider, sentence: string, today: string): Promise<ParsedRequest> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: ParsedRequest,
    system:
      `Today is ${today}. A Penn student describes pet care they need while away. ` +
      "Fill only what the text states or clearly implies; leave everything else null. " +
      "Resolve relative dates like 'this weekend' or 'Thursday to Sunday' to the next matching dates.",
    messages: [{ role: "user", content: sentence.slice(0, LIMITS.sentence) }],
  });
  return object;
}

/**
 * The template's agreement in clearer words, with the sitter's message folded
 * in. Never adds facts: anything unknown stays as the template left it.
 */
export async function polishAgreement(ai: AI, provider: AIProvider, terms: Terms, sitterMessage: string | null): Promise<Terms> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: AgreementTerms,
    system:
      "Rewrite this pet-care agreement between two Penn students so each field is one short, clear sentence. " +
      "Keep every fact, amount and date exactly. Use the sitter's message only for details both would agree on. " +
      "Never invent facts; keep null fields null.",
    messages: [{ role: "user", content: JSON.stringify({ terms, sitterMessage }) }],
  });
  return object;
}

/** The agreement with the requested change applied, leaving everything else as it was. */
export async function applyChange(ai: AI, provider: AIProvider, terms: Terms, change: string): Promise<Terms> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: AgreementTerms,
    system: "Apply the requested change to this pet-care agreement. Change only what the request asks; keep every other field exactly.",
    messages: [{ role: "user", content: JSON.stringify({ terms, change: change.slice(0, LIMITS.message) }) }],
  });
  return object;
}
