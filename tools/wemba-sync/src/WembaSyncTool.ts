import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/wemba-sync/ (see section 4 of CLAUDE.md).
export class WembaSyncTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "wemba-sync",
    title: "WEMBA Sync",
    description: "WEMBA Sync is an AI-powered dashboard with seamless calendar integration that helps Executive MBA students stay organized, save time, and find balance while juggling full-time careers, rigorous coursework, and personal commitments.",
    contributors: ["Bayo Sule", "Shivora"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Productivity",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
