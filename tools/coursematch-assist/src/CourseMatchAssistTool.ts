import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class CourseMatchAssistTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "coursematch-assist",
    title: "CourseMatch Assist",
    description: "This tool is a one-stop-shop for making the most of CourseMatch: giving you your recommended schedule based on various inputs, and even exact utilities you should put into CourseMatch",
    contributors: ["Ishi Tripathi", "Sanjana Wadhwa", "Brendan Holleck", "Evens Esperance"],
    mentor: "Manas Sharma",
    category: "Other",
    notYetMigrated: true,
  };
}
