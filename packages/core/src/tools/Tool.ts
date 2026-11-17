// ─────────────────────────────────────────────────────────────────────────────
// Tool base class
//
// Every PennTool extends this class and registers an instance in
// apps/web/src/lib/container.ts. The class holds the tool's manifest: its title
// is listed in the site sidebar and shown in the site header on its pages, where
// the info button shows its description and contributors. A tool's work happens in its own page, routes
// and server actions (apps/web/src/app/tools/{id}/), which call functions in
// the tool's package.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tool metadata ─────────────────────────────────────────────────────────────

/**
 * The sections of the site sidebar and the dashboard, in the order they're
 * shown. Every tool, registered or community, belongs to one:
 *
 * - Recruiting: jobs and internships, interviews, resumes, networking
 * - Academics: courses, schedules, degree planning, coursework
 * - Finance: valuation, investing, markets, financial analysis
 * - Entrepreneurship: starting a venture, pitching, market sizing, customer discovery
 * - Productivity: planning, writing, email, everyday workflow
 * - Lifestyle: campus life, events, clubs, housing, food, travel, wellbeing
 * - Other: the catch-all, for tools that don't fit another
 * - Platform: the Platform team's own tools
 *
 * Only the Platform team adds categories: tool teams that want a new one ask
 * them. `pnpm new-tool` reads this list from this file, so keep it a plain
 * array of string literals.
 */
export const TOOL_CATEGORIES = [
  "Recruiting",
  "Academics",
  "Finance",
  "Entrepreneurship",
  "Productivity",
  "Lifestyle",
  "Other",
  "Platform",
] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export interface ToolManifest {
  /** Stable, kebab-case identifier. Never change after the tool ships. */
  id: string;
  title: string;
  description: string;
  /** GitHub usernames or display names of the people who built this tool. */
  contributors: string[];
  /** Student, faculty or staff mentor for this tool, if any. */
  mentor?: string;
  /** The tool's section in the site sidebar and on the dashboard. */
  category: ToolCategory;
  /** Shown as BETA: still under development, and may not be fully functional. */
  beta?: boolean;
  /** The tool's pages fill the whole page area instead of the centered 720px column. */
  fullWidth?: boolean;
  /**
   * Still on the legacy LLM API (POST /api/llm/complete) rather than the AI API.
   * Not shown to users, except that the tool is shown as BETA until it migrates.
   * `pnpm check:tools` keeps it accurate: it fails if a tool calls the legacy API
   * without this, or has this and doesn't.
   */
  notYetMigrated?: boolean;
}

// ── Base class ────────────────────────────────────────────────────────────────

export abstract class Tool {
  abstract readonly manifest: ToolManifest;
}
