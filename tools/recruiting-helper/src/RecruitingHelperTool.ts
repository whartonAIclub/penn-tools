import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/recruiting-helper/ (see section 4 of CLAUDE.md).
export class RecruitingHelperTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "recruiting-helper",
    title: "Alum Outreach Ranker",
    description: "Ranks LinkedIn contacts and job postings by your target companies and roles, and drafts emails for you to use with your alum directory.",
    contributors: ["Emily Chen"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Recruiting",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
