import type { ToolOutput } from "@penntools/core/tools";

export interface PennPlannerInput {
  prompt: string;
}

export interface PennPlannerOutput extends ToolOutput {}
