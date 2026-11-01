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
  vet: z.string().nullable().describe("The pet's vet clinic or doctor"),
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

export interface MessageContext {
  /** Who the draft is for. */
  writer: "owner" | "sitter";
  writerFirstName: string;
  otherFirstName: string;
  /** The request in plain words (describe() plus pay, area and notes). */
  request: Record<string, string | null>;
  /** The sitter's profile in plain words, when the writer is the sitter. */
  aboutMe: string | null;
  /** The conversation so far, oldest first. */
  thread: { fromMe: boolean; body: string }[];
}

const MessageDraft = z.object({ message: z.string() });

/**
 * A message for the writer to edit and send themselves: a sitter's first
 * note and questions, or a reply to the latest message. Never sent by AI.
 */
export async function draftMessage(ai: AI, provider: AIProvider, context: MessageContext): Promise<string> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: MessageDraft,
    system:
      `Draft a short, friendly message from ${context.writerFirstName}, a Penn ${context.writer === "sitter" ? "student who wants to look after this pet" : "student who posted this pet-care request"}, ` +
      `to ${context.otherFirstName} on PennPaws. Plain text, at most 90 words, no subject line or sign-off. ` +
      (context.thread.length === 0
        ? "It's the first message: introduce the writer in one sentence using only what aboutMe says, then ask two or three questions that matter for this job and aren't answered by the request, such as feeding, walking routine, key handoff or a quick meet-and-greet. "
        : "Reply to the latest message from the other person, answering what the request lets you answer. ") +
      "Use only facts given; where the writer must fill something in, write it in [square brackets]. Never include addresses, phone numbers or emails.",
    messages: [{ role: "user", content: JSON.stringify({ request: context.request, aboutMe: context.aboutMe, thread: context.thread.slice(-10) }) }],
  });
  return object.message.trim().slice(0, LIMITS.message);
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
