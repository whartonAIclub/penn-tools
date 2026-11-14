import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/non-wharton-course-manager/ (see section 4 of CLAUDE.md).
export class NonWhartonCourseManagerTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "non-wharton-course-manager",
    title: "Non-Wharton Course Manager",
    description: "Check if a Penn course outside Wharton counts toward your MBA, then request permission and register in a few clicks.",
    contributors: ["Tiffany Liu"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Academics",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
    // The page uses the whole page area (stepper beside the steps), not the 720px column.
    fullWidth: true,
  };
}
