// Claude's suggestions for an individualized major: possible themes (each with
// a title and the courses that fit it) from the courses a student rated
// highly, and a draft alignment statement for each course in their plan. The
// page fills these into the student's boxes as drafts they can edit.
//
// Called from the tool's server actions with the signed-in student's AI API,
// which uses their own Anthropic key. Each function is one request.

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import type { Course } from "./courses.js";
import { departmentName } from "./courses.js";
import { creditsOf, MAX_THEME_LENGTH, type CandidateCourse } from "./individualized.js";

export const SUGGESTION_PROVIDER: AIProvider = "anthropic";

/** Themes come from courses rated at least this, and ones the student is taking or has taken. */
export const THEME_MIN_RATING = 3;
/** Fewest such courses to ask for themes from. */
export const THEME_MIN_COURSES = 3;
/** Most courses sent in one request, to keep requests small. */
export const MAX_SUGGESTION_COURSES = 40;
const MAX_THEMES = 3;
/** Descriptions are cut to this many characters; their first lines say what the course is about. */
const DESCRIPTION_LENGTH = 700;

/** A course description without the registrar's enrollment boilerplate. */
export function shortDescription(description: string): string {
  const cut = description.search(/\n?(Auditors need permission|Wharton MBA course\.|MBA students must request)/);
  const text = (cut >= 0 ? description.slice(0, cut) : description).replace(/\s+/g, " ").trim();
  return text.length > DESCRIPTION_LENGTH ? `${text.slice(0, DESCRIPTION_LENGTH)}…` : text;
}

function describeCourse(course: Course, rating?: number, taken?: boolean): string {
  const interest = taken ? ", the student is taking or has taken it" : rating ? `, student's interest ${rating}/5` : "";
  return `- ${course.code} "${course.title}" (${departmentName(course.department)}, ${creditsOf(course)} CU${interest}): ${shortDescription(course.description)}`;
}

// ── Themes ────────────────────────────────────────────────────────────────────

export const ThemeSuggestions = z.object({
  themes: z.array(
    z.object({
      name: z.string().describe("A short name for the theme, at most 8 words"),
      title: z
        .string()
        .describe("A title for the individualized major as it would appear on the proposal, at most 10 words"),
      summary: z.string().describe("Two or three sentences: what the theme is about and why these courses belong together"),
      courseCodes: z.array(z.string()).describe("Codes of the listed courses that fit this theme, exactly as written"),
    }),
  ),
});
export type ThemeSuggestion = z.infer<typeof ThemeSuggestions>["themes"][number];

const THEME_SYSTEM = [
  "You help Wharton MBA students design an individualized major: a major of their own, built around a theme, a course plan and a title.",
  `From the courses a student rated highly, suggest ${MAX_THEMES} distinct themes that a coherent set of their courses could support.`,
  "Each theme should cut across departments in a way no single standard Wharton major does, be specific enough to explain to an advisor, and use at least three of the listed courses.",
  "Build on courses the student is taking or has taken, and prefer the ones they rated higher. Use only course codes from the list, written exactly as given.",
  "Write plainly, without marketing language.",
].join(" ");

/** Whether a course is one themes are built from. */
export function isThemeSource(candidate: CandidateCourse): boolean {
  return candidate.taken || candidate.rating >= THEME_MIN_RATING;
}

/** Up to three possible themes from the student's taken and highly rated courses. */
export async function suggestThemes(ai: AI, candidates: readonly CandidateCourse[]): Promise<ThemeSuggestion[]> {
  const courses = [...candidates]
    .filter(isThemeSource)
    .sort((a, b) => Number(b.taken) - Number(a.taken))
    .slice(0, MAX_SUGGESTION_COURSES);
  if (courses.length < THEME_MIN_COURSES) return [];

  const { object } = await ai.generateObject({
    provider: SUGGESTION_PROVIDER,
    tier: "standard",
    reasoning: "low",
    maxOutputTokens: 4000,
    schema: ThemeSuggestions,
    system: THEME_SYSTEM,
    messages: [
      {
        role: "user",
        content: `The courses I'm taking or have taken, then the ones I'm interested in, most interested first:\n${courses.map((c) => describeCourse(c.course, c.rating, c.taken)).join("\n")}`,
      },
    ],
  });

  const offered = new Set(courses.map((r) => r.course.code));
  return object.themes
    .map((theme) => ({
      name: theme.name.trim(),
      title: theme.title.trim() || theme.name.trim(),
      summary: theme.summary.trim(),
      courseCodes: [...new Set(theme.courseCodes.map((code) => code.trim()))].filter((code) => offered.has(code)),
    }))
    .filter((theme) => theme.name && theme.courseCodes.length > 0)
    .slice(0, MAX_THEMES);
}

// ── Alignment statements ──────────────────────────────────────────────────────

export const AlignmentSuggestions = z.object({
  statements: z.array(
    z.object({
      courseCode: z.string().describe("The course's code, exactly as given"),
      statement: z.string().describe("Two to four sentences on how this course advances the theme"),
    }),
  ),
});

const ALIGNMENT_SYSTEM = [
  "You help a Wharton MBA student write the part of an individualized major proposal that shows how each selected course aligns with the major's theme.",
  "For each course you're asked about, write a short draft statement, in the first person, explaining how that course's content serves the theme, using specifics from its description.",
  "Mention how it connects to other courses in the plan where that's true. Don't invent facts about the course or the student.",
  "The student will rewrite these in their own words, so keep them concrete and plain.",
].join(" ");

/**
 * A draft alignment statement for each course in the plan, by course code, or
 * only for the courses in `only` (e.g. ones just added), with the rest of the
 * plan as context.
 */
export async function suggestAlignments(
  ai: AI,
  theme: string,
  plan: readonly Course[],
  only?: readonly string[],
): Promise<Record<string, string>> {
  const courses = plan.slice(0, MAX_SUGGESTION_COURSES);
  const wanted = new Set(only ?? courses.map((c) => c.code));
  const targets = courses.filter((c) => wanted.has(c.code));
  if (!theme.trim() || targets.length === 0) return {};
  const ask =
    targets.length === courses.length
      ? "Write a statement for every course in my plan."
      : `Write statements only for: ${targets.map((c) => c.code).join(", ")}. The other courses are context.`;

  const { object } = await ai.generateObject({
    provider: SUGGESTION_PROVIDER,
    tier: "standard",
    reasoning: "low",
    maxOutputTokens: 8000,
    schema: AlignmentSuggestions,
    system: ALIGNMENT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `My theme:\n${theme.trim().slice(0, MAX_THEME_LENGTH)}\n\nMy course plan:\n${courses.map((c) => describeCourse(c)).join("\n")}\n\n${ask}`,
      },
    ],
  });

  const inPlan = new Set(targets.map((c) => c.code));
  const out: Record<string, string> = {};
  for (const { courseCode, statement } of object.statements) {
    const code = courseCode.trim();
    if (inPlan.has(code) && statement.trim()) out[code] = statement.trim();
  }
  return out;
}
