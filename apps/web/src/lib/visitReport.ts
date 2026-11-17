// The rows of the tool visits table on /admin and /stats
// (components/stats/ToolVisitsTable.tsx): the visit report, plus every tool on
// the site that no one has opened yet.
//
// It takes the site's tools as arguments, as toolCatalog does, so it doesn't
// depend on which tools are registered and can be tested on its own.

import type { ToolVisits } from "@penntools/core/repositories";
import type { ToolManifest } from "@penntools/core/tools";
import { communityVisitId, type CommunityTool } from "../data/communityTools";

/**
 * The report's rows in its order (most recent visits first), then every tool
 * on the site no one has opened, with zeros: registered tools in the order
 * container.ts registers them, then community tools. With `onlySiteTools`,
 * rows for IDs no longer on the site are left out, such as a renamed tool's
 * old ID before its visits are moved to the new one.
 */
export function visitsForEveryTool(
  visited: readonly ToolVisits[],
  manifests: readonly ToolManifest[],
  community: readonly CommunityTool[],
  { onlySiteTools }: { onlySiteTools: boolean },
): ToolVisits[] {
  const siteIds = [...manifests.map((manifest) => manifest.id), ...community.map((tool) => communityVisitId(tool.id))];
  const onSite = new Set(siteIds);
  const visitedIds = new Set(visited.map((tool) => tool.toolId));
  const rows = onlySiteTools ? visited.filter((tool) => onSite.has(tool.toolId)) : visited;
  const unvisited = siteIds
    .filter((toolId) => !visitedIds.has(toolId))
    .map((toolId) => ({ toolId, visits: 0, users: 0, recentVisits: 0, recentUsers: 0 }));
  return [...rows, ...unvisited];
}
