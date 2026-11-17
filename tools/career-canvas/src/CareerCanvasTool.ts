import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class CareerCanvasTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "career-canvas",
    title: "Career Canvas",
    description:
      "An AI Powered Course, Major and Career Planner which identifies interests and skill gaps and builds a course roadmap for students",
    contributors: [
      "Ritika Agarwal",
      "Dee Xie",
      "Parmvir Chahal",
      "Malvika Sinha",
    ],
    mentor: "Itay Zitvar",
    category: "Other",
    fullWidth: true,
    notYetMigrated: true,
  };
}
