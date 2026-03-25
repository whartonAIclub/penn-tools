import type { ToolOutput } from "@penntools/core/tools";

export interface Tool1Input {
  prompt: string;
}

export interface Tool1Output extends ToolOutput {}
