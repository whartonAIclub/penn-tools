// ─────────────────────────────────────────────────────────────────────────────
// Paper TL;DR: turn a research paper's text into a short, structured summary.
//
// The page extracts the PDF's text in the browser and sends it to the tool's
// route, POST /tools/paper-tldr/simplify, which passes the user's `ai` in here.
// It's a route, not a server action, on purpose: Next.js refuses server action
// requests over 1 MB, and a long paper's text can be bigger. The reply is
// typed data (checked against PaperSummary), so the page can lay it out the
// same way every time.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { MIN_PAPER_CHARS, MAX_PAPER_CHARS } from "./limits.js";

export { MIN_PAPER_CHARS, MAX_PAPER_CHARS };

export const PaperSummary = z.object({
  title: z.string(),
  authors: z
    .string()
    .describe("Authors, with affiliations in parentheses only where the paper states them, e.g. 'Alex Rivera (Wharton), Sam Lee'"),
  venue: z.string().nullable().describe("Journal or preprint, year and links (code, arXiv) if given; null if unknown"),
  field: z.string().describe("Two or three topic tags joined with ' • ', e.g. 'Statistics • Causal inference'"),
  claim: z.string().describe("The paper's main claim in one or two plain sentences, with its scale (e.g. how many studies)"),
  context: z.string().describe("The background a student needs, in 2–4 sentences, with a concrete example"),
  keyTerms: z
    .array(z.object({ term: z.string(), definition: z.string().describe("One short plain-language sentence") }))
    .describe("3–5 terms a student must know to follow the paper"),
  researchQuestion: z.string().describe("The question the paper asks, in one sentence"),
  hypothesis: z.string().nullable().describe("Their hypothesis or main idea in one or two sentences; null if none"),
  data: z.string().describe("The data, experiments or setting they use, in one or two sentences"),
  methodSteps: z.array(z.string()).describe("The method as 3–5 numbered steps, each one sentence"),
  keyEquation: z
    .object({
      equation: z.string().describe("The single most important equation in plain Unicode math (no LaTeX), e.g. 'C = [θ_w + L·t_X·s, θ_w + U·t_X·s]'"),
      symbols: z.array(z.object({ symbol: z.string(), meaning: z.string() })),
    })
    .nullable()
    .describe("null when the paper has no central equation"),
  keyResults: z.array(z.string()).describe("2–4 main findings, each one or two sentences"),
  comparison: z
    .object({
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string()).describe("One cell per column")),
    })
    .nullable()
    .describe("A small table comparing methods, groups or conditions, if the paper has one; else null"),
  takeaway: z.string().describe("One sentence: what the results mean"),
  whatWeLearned: z.string().describe("The lesson for the field, in one or two sentences"),
  confidence: z.object({
    verdict: z.string().describe("How confident to be, in one short sentence"),
    strengths: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
  openQuestions: z.array(z.string()).describe("3–5 open questions or follow-up research ideas"),
  relatedWork: z
    .array(z.object({ citation: z.string().describe("Authors and year"), note: z.string().describe("A few words on what it adds") }))
    .describe("4–7 related papers the paper itself cites"),
});
export type PaperSummary = z.infer<typeof PaperSummary>;

const SYSTEM = `You turn academic research papers into one-page summaries for undergraduate students at Penn.

Write in plain, friendly language a smart first-year could follow. Define jargon the first time it appears. Prefer concrete examples over abstractions. Be accurate: use only what the paper says, keep its numbers exact, and never invent results, citations or affiliations. If a field isn't in the paper, use null where allowed. Keep every field short: the whole summary should fit on one or two printed pages.`;

/** The paper's text, cleaned up and cut to MAX_PAPER_CHARS. `truncated` says whether anything was cut. */
export function preparePaperText(raw: string): { text: string; truncated: boolean } {
  const text = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= MAX_PAPER_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_PAPER_CHARS), truncated: true };
}

/**
 * Why `value` can't be summarized, or null if it's fine. The route gets this
 * from the browser, so check it. Long text isn't an error: summarizePaper
 * trims it to MAX_PAPER_CHARS (the page already stops reading there).
 */
export function checkPaperText(value: unknown): string | null {
  if (typeof value !== "string") return "Upload a PDF first.";
  if (value.trim().length < MIN_PAPER_CHARS) {
    return "We couldn't find enough text in that PDF. It may be a scanned image; try a version with selectable text.";
  }
  return null;
}

/** `signal` cancels the AI call, e.g. when the user leaves the page, so it stops costing their credit. */
export async function summarizePaper(
  ai: AI,
  provider: AIProvider,
  paperText: string,
  signal?: AbortSignal,
): Promise<PaperSummary> {
  const { text, truncated } = preparePaperText(paperText);
  const note = truncated ? "\n\n[The paper was cut here because it is very long; summarize what is above.]" : "";
  const { object } = await ai.generateObject({
    provider,
    tier: "standard",
    reasoning: "medium",
    schema: PaperSummary,
    system: SYSTEM,
    messages: [{ role: "user", content: `Summarize this paper.\n\n<paper>\n${text}${note}\n</paper>` }],
    ...(signal && { signal }),
  });
  return object;
}
