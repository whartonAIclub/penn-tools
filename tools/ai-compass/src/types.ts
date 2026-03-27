import type { ToolOutput } from "@penntools/core/tools";

export interface AiCompassInput {
  prompt: string;
}

export interface AiCompassOutput extends ToolOutput {}
