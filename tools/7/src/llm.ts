/**
 * llm.ts — LLM utilities for Tool 7.
 *
 * buildPrompt()  — constructs the full prompt sent to the LLM.
 * mockLLM()      — returns a canned result for offline / test use.
 *
 * The real call lives in Tool7.ts via context.llm.complete().
 */
import type { ContextItem } from "./types.js";

export interface LlmPayload {
  resume: string;
  context: ContextItem[];
  job_description: string;
}

export interface LlmResult {
  tailored_resume: string;
}

/**
 * Builds the prompt sent to the LLM.
 * Structured so the model receives clear delimiters for each input section.
 */
export function buildPrompt(payload: LlmPayload): string {
  const contextBlock =
    payload.context.length > 0
      ? payload.context
          .map((c) => `[${c.type.toUpperCase()}]\n${c.content}`)
          .join("\n\n")
      : "No additional context provided.";

  return [
    "You are an expert resume writer helping a Penn student tailor their resume for a specific job.",
    "Rewrite the resume to match the job description: emphasize relevant skills, quantify impact,",
    "and use action verbs aligned with the employer's language.",
    "Return ONLY the tailored resume text. No preamble, no markdown code fences.",
    "",
    "=== JOB DESCRIPTION ===",
    payload.job_description,
    "",
    "=== ADDITIONAL CONTEXT (projects, past roles, writing samples) ===",
    contextBlock,
    "",
    "=== ORIGINAL RESUME ===",
    payload.resume || "(no resume provided — generate a strong Wharton-style resume based on context above)",
    "",
    "=== TAILORED RESUME ===",
  ].join("\n");
}

/**
 * Mock LLM for local development / when no API key is configured.
 * Annotates existing bullets with "(quantified for impact)" to simulate real output.
 */
export function mockLLM(payload: LlmPayload): LlmResult {
  const jdSnippet = payload.job_description.slice(0, 80).trim();
  const annotated = (payload.resume || "")
    .split("\n")
    .map((line) =>
      /^[\u2022\-\*]/.test(line.trim())
        ? line + " (quantified for impact)"
        : line
    )
    .join("\n");

  return {
    tailored_resume: [
      `[Tailored for: "${jdSnippet}${payload.job_description.length > 80 ? "…" : ""}"]`,
      "",
      annotated ||
        "Jane Doe | jane.doe@wharton.upenn.edu | (215) 555-0192\n\nEDUCATION\nThe Wharton School, University of Pennsylvania — B.S. Economics, Finance Concentration — GPA 3.87\n\nEXPERIENCE\nGoldman Sachs — Investment Banking Analyst Intern\n• Led $2.4B healthcare DCF model adopted by senior bankers for live deal\n• Quantified for impact: coordinated 12-person cross-functional deal team\n\nBlackstone — Private Equity Intern\n• Sourced and evaluated 40+ potential portfolio companies in tech sector",
    ].join("\n"),
  };
}
