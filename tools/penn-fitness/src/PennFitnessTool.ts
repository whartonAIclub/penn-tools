import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/penn-fitness/ (see section 4 of CLAUDE.md).
export class PennFitnessTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "penn-fitness",
    title: "Penn Fitness",
    description: "An AI health companion for Penn students that brings nutrition, fitness, mental wellbeing, and access to care into one personalized platform.",
    contributors: ["Arpit Singh", "Manali Patil"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Lifestyle",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
