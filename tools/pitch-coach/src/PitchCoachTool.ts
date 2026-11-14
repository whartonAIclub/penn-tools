import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class PitchCoachTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "pitch-coach",
    title: "PitchCoach AI",
    description:
      "Practice behavioral interviews and networking pitches with AI-powered feedback on delivery, STAR framework adherence, and communication clarity.",
    contributors: ["Tony Sui", "Hannah Gao", "Ariana Katsanis", "Chithira Mamallan"],
    mentor: "Wharton AI & Analytics Club",
    category: "Other",
    notYetMigrated: true,
  };
}
