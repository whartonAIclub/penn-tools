import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/trek-finder/ (see section 4 of CLAUDE.md).
export class TrekFinderTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "trek-finder",
    title: "Trek Finder",
    description: "Explore, compare and save every Wharton trip, from club treks to academic programs.",
    contributors: ["Carrie Zhou", "Vivian Sun"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. "LLM Tools" is the catch-all.
    category: "Productivity",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
