import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/pass-it-on/ (see section 4 of CLAUDE.md).
export class PassItOnTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "pass-it-on",
    title: "Pass It On",
    description: "Pass It On is a memory for student clubs - clubs hand down folders, spreadsheets, and checklists that record what was done, but not what worked.",
    contributors: ["Joe Hardwicke", "Bridget Paulmann"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. "LLM Tools" is the catch-all.
    category: "Productivity",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
