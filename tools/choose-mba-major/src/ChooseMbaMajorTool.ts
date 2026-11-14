import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/choose-mba-major/ (see section 4 of CLAUDE.md).
export class ChooseMbaMajorTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "choose-mba-major",
    title: "Choose My MBA Major",
    description: "Based on your ranked interest in offered MBA courses, this tool will identify the optimal MBA major for you.",
    contributors: ["Xinyi Wang", "Hadeka Rasul"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Academics",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
