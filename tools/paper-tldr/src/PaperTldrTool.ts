import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/paper-tldr/ (see section 4 of CLAUDE.md).
export class PaperTldrTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "paper-tldr",
    title: "Paper TL;DR",
    description: "Upload a Penn professor's research paper and get a simplified 1–2 page summary that's easy to read.",
    contributors: ["Ishita Gupta", "Yashwini Bansal"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Academics",
    // Fill the whole page area, so the background painting reaches the edges.
    fullWidth: true,
  };
}
