import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class ResumeCustomizerTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "resume-customizer",
    title: "Resume Customizer",
    description:
      "AI-powered tool that generates tailored resumes and cover letters from a student's full professional knowledge base",
    contributors: ["Vismay Churiwala", "Nicole Goon", "Hongyu Mao", "Samir Patki"],
    mentor: "Sanjana Wadhwa",
    category: "Other",
    notYetMigrated: true,
  };
}
