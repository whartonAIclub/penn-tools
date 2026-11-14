import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class PennPlannerTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "penn-planner",
    title: "Penn Planner",
    description: "AI-powered time-planning assistant that integrates with Canvas and your calendar to estimate effort and suggest study blocks.",
    contributors: ["Sam Lazarus", "Ana Akra", "Krishna Vadera", "Shreya Khetan"],
    mentor: "Alex Sulimanov",
    category: "Other",
    notYetMigrated: true,
  };
}
