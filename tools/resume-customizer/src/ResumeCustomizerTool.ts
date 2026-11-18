import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class ResumeCustomizerTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "resume-customizer",
    title: "Resume Customizer",
    description:
      "Tailor your resume to a job description using your past resumes, projects and writing samples, then refine it with AI and download it as a PDF or Word document.",
    contributors: ["Vismay Churiwala", "Nicole Goon", "Hongyu Mao", "Samir Patki"],
    mentor: "Sanjana Wadhwa",
    category: "Recruiting",
    fullWidth: true,
  };
}
