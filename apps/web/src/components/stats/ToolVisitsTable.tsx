// Visits to each tool, for the last VISIT_RECENT_DAYS days and all time: on
// /stats for everyone and on /admin. It shows only per-tool counts, never who
// visited, so it's safe to show publicly. Its rows come from
// visitsForEveryTool (lib/visitReport.ts).

import { VISIT_RECENT_DAYS, type ToolVisits } from "@penntools/core/repositories";
import { toolRegistry } from "@penntools/core/tools";
import "@/lib/container"; // registers the tools, whose titles the table shows
import { communityToolByVisitId, isCommunityVisitId } from "@/data/communityTools";
import cardPage from "@/components/layout/CardPage.module.css";
import table from "@/components/layout/DataTable.module.css";

function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** A tool's title, or its ID once it's no longer on the site. */
function toolName(toolId: string): string {
  return toolRegistry.get(toolId)?.manifest.title ?? communityToolByVisitId(toolId)?.title ?? toolId;
}

export function ToolVisitsTable({ visits }: { visits: ToolVisits[] }) {
  return (
    <>
      <p className={cardPage.muted}>
        A visit is opening a tool, signed in or not; moving between its pages isn&apos;t another one. For an external
        tool, it&apos;s a click on its link in the sidebar or on the dashboard, so people who reach its site another
        way aren&apos;t counted. Users counts signed-in people only.
      </p>
      <div className={table.tableWrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th>Tool</th>
              <th className={table.num}>Visits ({VISIT_RECENT_DAYS} days)</th>
              <th className={table.num}>Users ({VISIT_RECENT_DAYS} days)</th>
              <th className={table.num}>Visits (all time)</th>
              <th className={table.num}>Users (all time)</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((tool) => (
              <tr key={tool.toolId}>
                <td>
                  {toolName(tool.toolId)}
                  {isCommunityVisitId(tool.toolId) && <span className={cardPage.muted}> · external</span>}
                </td>
                <td className={table.num}>{count(tool.recentVisits)}</td>
                <td className={table.num}>{count(tool.recentUsers)}</td>
                <td className={table.num}>{count(tool.visits)}</td>
                <td className={table.num}>{count(tool.users)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
