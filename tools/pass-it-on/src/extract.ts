// Pulling candidate lessons out of imported excerpts, a batch at a time. The
// AI proposes lessons that each quote one excerpt; any whose quote isn't
// really in that excerpt are dropped, and the rest are saved as pending for
// the club to review.

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import type { Sql } from "postgres";
import { checkQuotes } from "./records.js";
import { LESSON_CATEGORIES, markExtracted, nextExcerptBatch, saveLessons, type NewLesson, type StoredExcerpt } from "./storage.js";

/** Excerpts per AI call: about 30,000 characters, a few seconds on the fast tier. */
export const EXTRACT_BATCH_SIZE = 20;

export const ExcerptLessons = z.object({
  lessons: z.array(
    z.object({
      excerptId: z.number().int().describe("The id of the excerpt the lesson comes from"),
      category: z.enum(LESSON_CATEGORIES),
      summary: z.string().describe("The lesson for a future organizer, in one short sentence"),
      quote: z.string().describe("The exact words the lesson rests on, copied verbatim from that excerpt"),
    }),
  ),
});
export type ExcerptLessons = z.infer<typeof ExcerptLessons>;

export const EXTRACT_SYSTEM_PROMPT = [
  "You help student club leaders hand down what they learned running events.",
  "You'll see excerpts from a club's old documents, spreadsheets and group chats.",
  "Pull out only the lessons a future organizer should know: what went wrong or right, what something really cost,",
  "which vendors, venues or partner clubs to use, chase or avoid, how turnout compared with RSVPs, and how long things took.",
  "Skip routine logistics, greetings, jokes and anything with no lasting lesson. Most excerpts have none; an empty list is fine.",
  "Each lesson is one short, specific sentence. For every lesson, copy the exact words it rests on into `quote`,",
  "verbatim from a single excerpt, and give that excerpt's id in `excerptId`.",
].join(" ");

/** Lessons from a batch of excerpts, keeping only those whose quote is really in the excerpt cited. */
export async function extractLessons(ai: AI, provider: AIProvider, excerpts: StoredExcerpt[]): Promise<NewLesson[]> {
  if (excerpts.length === 0) return [];
  const byId = new Map(excerpts.map((e) => [e.id, e]));
  const content = excerpts.map((e) => `<excerpt id="${e.id}"${describe(e)}>\n${e.text}\n</excerpt>`).join("\n\n");

  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: ExcerptLessons,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const cited = object.lessons.filter((l) => byId.has(l.excerptId));
  return checkQuotes(cited, (l) => byId.get(l.excerptId)!.text)
    .filter((l) => l.quoteFound)
    .map((l) => ({ answerId: null, excerptId: l.excerptId, eventId: null, category: l.category, summary: l.summary, quote: l.quote }));
}

export interface ExtractProgress {
  /** Excerpts handled in this call. */
  processed: number;
  /** Lessons saved for review in this call. */
  saved: number;
  /** True once the source has no excerpts left to extract from. */
  done: boolean;
}

/**
 * Extracts lessons from the source's next batch of excerpts and saves them as
 * pending. Call repeatedly until `done`; each call is short, so a big import
 * never hits a request timeout. If the AI call fails, nothing is marked as
 * extracted, so retrying picks up the same batch.
 */
export async function extractNextBatch(sql: Sql, ai: AI, provider: AIProvider, sourceId: string): Promise<ExtractProgress> {
  const batch = await nextExcerptBatch(sql, sourceId, EXTRACT_BATCH_SIZE);
  if (batch.length === 0) {
    await markExtracted(sql, sourceId, []);
    return { processed: 0, saved: 0, done: true };
  }
  const lessons = await extractLessons(ai, provider, batch);
  // Together, so a retry can't save the same batch's lessons twice.
  await sql.begin(async (transaction) => {
    // postgres's TransactionSql type drops the call signature; it runs queries like Sql.
    const tx = transaction as unknown as Sql;
    await saveLessons(tx, lessons);
    await markExtracted(tx, sourceId, batch.map((e) => e.id));
  });
  const done = (await nextExcerptBatch(sql, sourceId, 1)).length === 0;
  return { processed: batch.length, saved: lessons.length, done };
}

/** Where the excerpt came from, as attributes the model can read. */
function describe(excerpt: StoredExcerpt): string {
  const { date, file, sheet, page } = excerpt.meta;
  const attributes = [
    date && `date="${date}"`,
    file && `file="${file.replace(/"/g, "'")}"`,
    sheet && `sheet="${sheet.replace(/"/g, "'")}"`,
    page && `page="${page}"`,
  ].filter(Boolean);
  return attributes.length ? ` ${attributes.join(" ")}` : "";
}
