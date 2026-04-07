import type { Tool8Input } from "./types.js";
import { filterCourses } from "./courseSearch.js";

/**
 * Shared instructions for Career Canvas — used by Tool8 (systemPrompt) and
 * bundled into a single user prompt on the landing page (HTTP API has no system slot).
 */
export const CAREER_CANVAS_SYSTEM_PROMPT = `You are Career Canvas, an AI academic and career planning assistant for university students (especially at Penn / Wharton).

Given the student's materials, produce a practical, supportive plan. Follow this structure with Markdown headings:

## Profile summary
2–4 sentences synthesizing background, interests, and goals.

## Skill & experience gaps
Bullet list of gaps relative to their stated target roles. Be specific (e.g., "systems design", "SQL", "case practice", "ML experiment design").

## Major and academic pathways
Recommend 1–2 plausible major paths (if applicable) and how each aligns with their goals. Note tradeoffs briefly.

## Suggested courses & learning
Suggest **types** of courses and example topics that close gaps. If you name specific Penn course numbers or titles, label them clearly as *examples* and tell the student to verify against the official catalog (https://catalog.upenn.edu/courses/).

## Extracurriculars & projects
Concrete extracurricular, club, research, internship, or project ideas tied to their gaps.

## What-if scenario (if provided)
If the student described an alternate path (e.g. switching major), compare readiness vs their base case in a short subsection. If none was provided, write one sentence: "No alternate scenario was provided."

## Next 30–90 days
3–5 numbered, actionable next steps (each begin with a verb).

Rules:
- Do not claim you verified enrollment, GPA, or official degree requirements.
- Be concise but specific; avoid generic platitudes.
- If information is missing, say what you assumed and what to clarify.`;

export function buildStudentPayload(input: Tool8Input): string {
  const parts: string[] = [];

  if (input.resumeSummary?.trim()) {
    parts.push(`### Resume / experience summary\n${input.resumeSummary.trim()}`);
  }
  if (input.academicBackground?.trim()) {
    parts.push(`### Academic history\n${input.academicBackground.trim()}`);
  }
  if (input.interests?.trim()) {
    parts.push(`### Interests\n${input.interests.trim()}`);
  }
  if (input.targetRoles?.trim()) {
    parts.push(`### Target roles / industries\n${input.targetRoles.trim()}`);
  }
  if (input.scenarioNotes?.trim()) {
    parts.push(`### What-if / alternate path\n${input.scenarioNotes.trim()}`);
  }

  return parts.join("\n\n");
}

/** Message body for the LLM `user` role (tool execute path). */
export function buildUserMessageForCareerCanvas(input: Tool8Input): string {
  const raw = input.prompt?.trim();
  if (raw) {
    return raw;
  }
  const payload = buildStudentPayload(input);
  if (!payload.trim()) {
    return "";
  }
  return `Use the following student-provided information:\n\n${payload}`;
}

/**
 * Single string for POST /api/llm/complete (only `prompt` is supported there).
 */
export function buildMonolithicPromptForHttpApi(input: Tool8Input): string {
  const raw = input.prompt?.trim();
  if (raw) {
    return `${CAREER_CANVAS_SYSTEM_PROMPT}\n\n---\n\nStudent request:\n${raw}`;
  }
  const userBlock = buildUserMessageForCareerCanvas(input);
  if (!userBlock.trim()) {
    return "";
  }

  // Inject relevant Penn courses derived from the student's major + interests
  const courses = filterCourses(
    input.academicBackground ?? "",
    input.interests ?? "",
    input.targetRoles ?? "",
  );
  const courseBlock = courses ? `\n\n${courses}` : "";

  return `${CAREER_CANVAS_SYSTEM_PROMPT}\n\n---\n\n${userBlock}${courseBlock}`;
}
