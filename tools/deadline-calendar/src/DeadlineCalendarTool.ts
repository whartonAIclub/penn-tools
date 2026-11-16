import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/deadline-calendar/ (see section 4 of CLAUDE.md).
export class DeadlineCalendarTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "deadline-calendar",
    title: "Deadline Calendar",
    description: "Upload your syllabi to pull out every deadline, spot overloaded weeks, and download it all as a calendar file.",
    contributors: ["Priyasha Agarwal"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools.
    category: "Academics",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
