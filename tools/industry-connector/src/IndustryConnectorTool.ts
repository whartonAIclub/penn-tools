import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/industry-connector/ (see section 4 of CLAUDE.md).
export class IndustryConnectorTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "industry-connector",
    title: "Industry Connections Tool",
    description: "Connect Penn students to other students who have worked in the industry they're interested in",
    contributors: ["Avvalzameer Bhatia", "Yolanda Ye", "Shatakshi Mohan"],
    mentor: "Kevin Zheng",
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Recruiting",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
