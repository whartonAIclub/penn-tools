// Cited answers from the library. The AI answers only from the passages it's
// given and cites them by id with a verbatim quote. A citation survives only
// if that quote really is in that passage (checked word for word), and what's
// shown is the passage from the database, never the model's own copy. With no
// surviving citation, the answer is "I couldn't find this", never a guess.

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { containsQuote } from "./records.js";
import type { Passage } from "./library.js";

export const NOT_FOUND_MESSAGE = "I couldn't find this in the library.";

export const LibraryAnswer = z.object({
  found: z.boolean().describe("False if the passages don't answer the question"),
  answer: z.string().nullable().describe("A short answer using only the passages; null if found is false"),
  citations: z.array(
    z.object({
      excerptId: z.number().int().describe("The id of the passage the answer rests on"),
      quote: z.string().describe("The exact words in that passage that support the answer, copied verbatim"),
    }),
  ),
});
export type LibraryAnswer = z.infer<typeof LibraryAnswer>;

export const ANSWER_SYSTEM_PROMPT = [
  "You answer questions for a student club using only the passages from its own files given below.",
  "Never use outside knowledge and never guess. If the passages don't answer the question, set found to false and answer to null.",
  "Keep the answer short and specific. Cite every passage the answer rests on by id, with the exact words that support it copied verbatim.",
].join(" ");

/** A citation whose quote was found in its passage. `passage` is the stored text, not the model's copy. */
export interface Citation {
  quote: string;
  passage: Passage;
}

export type CitedAnswer = { found: true; answer: string; citations: Citation[] } | { found: false; message: string };

/** Answers `question` from `passages`, with checked citations, or says it couldn't find an answer. */
export async function answerFromLibrary(ai: AI, provider: AIProvider, question: string, passages: Passage[]): Promise<CitedAnswer> {
  const notFound: CitedAnswer = { found: false, message: NOT_FOUND_MESSAGE };
  if (passages.length === 0) return notFound;
  const byId = new Map(passages.map((p) => [p.excerptId, p]));

  const content = [
    `Question: ${question.trim()}`,
    "Passages:",
    ...passages.map((p) => `<passage id="${p.excerptId}" file="${p.filename}">\n${p.text}\n</passage>`),
  ].join("\n");

  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "low",
    schema: LibraryAnswer,
    system: ANSWER_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  if (!object.found || !object.answer?.trim()) return notFound;

  const seen = new Set<number>();
  const citations: Citation[] = [];
  for (const c of object.citations) {
    const passage = byId.get(c.excerptId);
    if (!passage || seen.has(c.excerptId) || !containsQuote(passage.text, c.quote)) continue;
    seen.add(c.excerptId);
    citations.push({ quote: c.quote.trim(), passage });
  }
  // An answer nobody can check against a source isn't shown.
  return citations.length > 0 ? { found: true, answer: object.answer.trim(), citations } : notFound;
}
