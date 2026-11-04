import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/sorted/ (see section 4 of CLAUDE.md).
export class SortedTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "sorted",
    title: "Sorted.",
    description: "Sorted is a personal productivity tool that organizes your to-do lists into eight categories of life, keeping everything in one place and top of mind so you can make the most of your free time and tackle tasks as opportunities come up throughout the day.",
    contributors: ["Rhoda Azeze"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Productivity",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
