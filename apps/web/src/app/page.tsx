// Root page — the PennTools dashboard: the most-visited tools this week and
// month (lib/topTools.ts), then every tool on the site as a tile, in the same
// sections as the site sidebar (lib/toolCatalog.ts).

import { toolRegistry } from "@penntools/core/tools";
import { logger, toolVisits } from "@/lib/container"; // also registers the tools
import { communityTools } from "@/data/communityTools";
import { cachedOrStale } from "@/lib/cache";
import { toolCatalog } from "@/lib/toolCatalog";
import { TOP_TOOL_PERIODS, topTools } from "@/lib/topTools";
import { Dashboard } from "@/components/dashboard/Dashboard";

// Rendered on each request, for the top tools, not once at build time (when
// there may be no database to read)...
export const dynamic = "force-dynamic";

// ...but the visit counts are read at most once a minute, however often the
// page is loaded. The rest of the page doesn't need the database, so it
// mustn't wait on it: if a read fails or takes over 2 seconds, the page shows
// the last counts read instead (none, so no top tools, if nothing has been
// read since the server started), and a failed read is retried a minute later.
const recentVisits = cachedOrStale(60_000, 2_000, () =>
  Promise.all([toolVisits.visitsSince(TOP_TOOL_PERIODS.week), toolVisits.visitsSince(TOP_TOOL_PERIODS.month)]).catch(
    (error: unknown) => {
      logger.error("home.top_tools_unavailable", error);
      throw error;
    },
  ),
);

export default async function HomePage() {
  const sections = toolCatalog(toolRegistry.listManifests(), communityTools);
  const visits = await recentVisits();
  const top = visits && { week: topTools(visits[0], sections), month: topTools(visits[1], sections) };
  return <Dashboard sections={sections} top={top} />;
}
