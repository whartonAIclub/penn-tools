import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/pennpaws/ (see section 4 of CLAUDE.md).
export class PennpawsTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "pennpaws",
    title: "PennPaws",
    description: "Find a verified Penn student to walk your dog or visit your cat while you're away.",
    contributors: ["Lu Lu", "Esther Li"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Lifestyle",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
