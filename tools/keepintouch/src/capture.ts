// Quick capture: right after meeting someone, the user jots a note and the AI
// API turns it into a draft for the add form. The draft only fills in the form;
// the user checks it and saves it like anything they typed, so
// checkContactInput still runs on save.

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { LIMITS, MET_HOW, isDate, type ContactInput, type MetHow } from "./input.js";

/** Most tags the model may suggest for one person. */
const MAX_SUGGESTED_TAGS = 5;

const MET_HOW_VALUES = MET_HOW.map((m) => m.value) as [MetHow, ...MetHow[]];

// Every field is required, with null (or empty) for what the note doesn't say:
// providers' structured output needs all of them present.
export const CapturedContact = z.object({
  name: z.string().nullable().describe("The person's name as written, or null if the note doesn't give it"),
  role: z.string().nullable().describe("Their job title or program, e.g. \"VP\" or \"MBA '26\""),
  company: z.string().nullable().describe("Their employer or school"),
  metHow: z
    .enum(MET_HOW_VALUES)
    .nullable()
    .describe(`How they met: ${MET_HOW.map((m) => `${m.value} (${m.label})`).join(", ")}`),
  metAt: z.string().nullable().describe("The event or place, in a few words, e.g. \"TMT coffee chat\""),
  metOn: z
    .string()
    .nullable()
    .describe("When they met, YYYY-MM-DD, working out words like \"yesterday\" from today's date; null if the note doesn't say"),
  tags: z.array(z.string()).describe(`Up to ${MAX_SUGGESTED_TAGS} short labels for finding them later, such as their industry or "alumni"`),
  notes: z
    .string()
    .describe(
      "What they talked about, what the person cares about and anything offered, kept close to the note's words. Leave out what's in other fields; empty if nothing is left",
    ),
  followUpOn: z
    .string()
    .nullable()
    .describe("When to follow up, YYYY-MM-DD, if the note says (e.g. \"in 2 weeks\" counts from today); otherwise null"),
  followUpNote: z.string().nullable().describe("What to do when following up, in a few words, e.g. \"Send a thank-you note\""),
});
export type CapturedContact = z.infer<typeof CapturedContact>;

/** What quick capture fills in on the add form: null (or empty) where the note didn't say. */
export type ContactDraft = Omit<ContactInput, "name" | "cadenceDays"> & { name: string | null };

/**
 * The note as a contact draft. `today` (YYYY-MM-DD, where the user is) lets the
 * model work out dates like "follow up in 2 weeks"; `knownTags`, the user's
 * tags, most used first, are reused when they fit, so filters keep working.
 */
export async function draftContact(
  ai: AI,
  provider: AIProvider,
  note: string,
  { today, knownTags }: { today: string; knownTags: string[] },
): Promise<ContactDraft> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: CapturedContact,
    system: systemPrompt(today, knownTags),
    messages: [{ role: "user", content: note }],
  });
  return toDraft(object, knownTags);
}

/** The model's reply made safe for the form: text trimmed and within limits, real dates only, tidy tags. */
export function toDraft(captured: CapturedContact, knownTags: string[] = []): ContactDraft {
  return {
    name: clip(captured.name, LIMITS.name),
    company: clip(captured.company, LIMITS.company),
    role: clip(captured.role, LIMITS.role),
    metHow: captured.metHow,
    metAt: clip(captured.metAt, LIMITS.metAt),
    metOn: realDate(captured.metOn),
    tags: suggestedTags(captured.tags, knownTags),
    notes: clip(captured.notes, LIMITS.notes) ?? "",
    followUpOn: realDate(captured.followUpOn),
    followUpNote: clip(captured.followUpNote, LIMITS.followUpNote),
  };
}

function systemPrompt(today: string, knownTags: string[]): string {
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return [
    "You fill in a contact form for an MBA student's personal relationship tracker, from their quick note about someone they just met.",
    `Today is ${weekday}, ${today}.`,
    "Use only what the note says. Leave a field null (or empty) when the note doesn't say; never guess names, companies or dates.",
    "Coffee chats, info sessions and company presentations count as recruiting.",
    knownTags.length > 0
      ? `The student already uses these tags; reuse them, spelled the same way, when they fit: ${knownTags.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Trimmed text cut to `maxLength`, or null when blank. */
function clip(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, maxLength).trimEnd() : null;
}

function realDate(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return isDate(trimmed) ? trimmed : null;
}

/** Tags with spacing tidied, too-long and repeated ones dropped, and the user's own spelling where it matches. */
function suggestedTags(tags: string[], knownTags: string[]): string[] {
  const known = new Map(knownTags.map((tag) => [tag.toLowerCase(), tag]));
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag || tag.length > LIMITS.tag) continue;
    const spelled = known.get(tag.toLowerCase()) ?? tag;
    if (result.some((t) => t.toLowerCase() === spelled.toLowerCase())) continue;
    result.push(spelled);
  }
  return result.slice(0, MAX_SUGGESTED_TAGS);
}
