import type { ToolOutput } from "@penntools/core/tools";

export interface PlatformPlaygroundInput {
  prompt: string;
}

export interface PlatformPlaygroundOutput extends ToolOutput {}
