import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/handoff/ (see section 4 of CLAUDE.md).
export class HandoffTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "handoff",
    title: "Handoff",
    description: "A peer-to-peer marketplace for Wharton students to list and find eligible event tickets, post ISO requests, and connect for permitted transfers.",
    contributors: ["Langston Chen"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. "LLM Tools" is the catch-all.
    category: "LLM Tools",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
