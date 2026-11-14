import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class Tool3 extends Tool {
  readonly manifest: ToolManifest = {
    id: "3",
    title: "Penn Planner",
    description: "The planning tool centralizes a Wharton student's deadlines and commitments across academics and recruiting into a single prioritized to-do list.",
    contributors: ["Alec Roslin", "Nyla Thompson", "Travon Martin", "Nikunj Agrawal"],
    mentor: "Steven Adelberg",
    category: "Other",
  };
}
