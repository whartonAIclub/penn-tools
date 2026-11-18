// The home page's top tools: the most-visited tools on the site over the last
// week and month (TOP_TOOL_PERIODS), from ToolVisitRepository.visitsSince.
//
// It takes the catalog as an argument, as visitsForEveryTool does, so it can
// be tested without the registry.

import { VISIT_RECENT_DAYS, type ToolVisitCount } from "@penntools/core/repositories";
import type { CatalogSection, CatalogTool } from "./toolCatalog";

/**
 * The windows the home page ranks tools over, in days. The month is /stats's
 * recent window, so "Top this month" matches its "Visits (30 days)" column.
 */
export const TOP_TOOL_PERIODS = { week: 7, month: VISIT_RECENT_DAYS } as const;

/** Tools shown per period: the podium's three places. */
const TOP_TOOL_COUNT = 3;

/**
 * Tools never ranked, both the Platform team's own: the Platform Playground,
 * a demo for tool teams rather than a tool for students, and, for now,
 * AskPenn, so the top spots go to tool teams' tools.
 */
const NOT_RANKED: ReadonlySet<string> = new Set(["platform-playground", "askpenn"]);

export interface RankedTool {
  tool: CatalogTool;
  visits: number;
  /** Distinct signed-in users, plus one for all signed-out visitors (ToolVisitCount.users). */
  users: number;
}

export interface TopTools {
  week: RankedTool[];
  month: RankedTool[];
}

/**
 * Up to `count` of the catalog's tools with the most visits, most first; ties
 * go to the tool more people opened, then by title. NOT_RANKED tools and IDs
 * no longer on the site are left out, as are tools with no visits.
 */
export function topTools(
  counts: readonly ToolVisitCount[],
  sections: readonly CatalogSection[],
  count: number = TOP_TOOL_COUNT,
): RankedTool[] {
  const tools = new Map(
    sections.flatMap((section) => section.tools).filter((tool) => !NOT_RANKED.has(tool.visitId)).map((tool) => [tool.visitId, tool]),
  );
  return counts
    .flatMap(({ toolId, visits, users }) => {
      const tool = tools.get(toolId);
      return tool && visits > 0 ? [{ tool, visits, users }] : [];
    })
    .sort((a, b) => b.visits - a.visits || b.users - a.users || a.tool.title.localeCompare(b.tool.title))
    .slice(0, count);
}
