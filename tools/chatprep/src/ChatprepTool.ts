import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/chatprep/ (see section 4 of CLAUDE.md).
export class ChatprepTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "chatprep",
    title: "ChatPrep",
    description: "Prep for any coffee chat in minutes with a brief and questions tailored to your background and theirs.",
    contributors: ["Elise Lovett"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Recruiting",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
