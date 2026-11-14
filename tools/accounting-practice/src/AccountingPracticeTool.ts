import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

// The tool's title (listed in the site sidebar) and details (shown by the
// info button on its page). Its logic goes in other files in this folder,
// called from its page, routes and server actions in
// apps/web/src/app/tools/accounting-practice/ (see section 4 of CLAUDE.md).
export class AccountingPracticeTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "accounting-practice",
    title: "Accounting Practice",
    description: "An interactive game that helps Wharton MBA students practice accounting concepts, test their knowledge, and improve through personalized feedback.",
    contributors: ["Alex Salinas", "Tomer Swisa"],
    // Its section in the site sidebar and on the dashboard, one of TOOL_CATEGORIES
    // in @penntools/core/tools. To add a category, ask the Platform team.
    category: "Academics",
    // Shown as BETA until the tool is ready; delete this line then.
    beta: true,
  };
}
