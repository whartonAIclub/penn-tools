import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class PlatformPlaygroundTool extends Tool {
  readonly manifest: ToolManifest = {
    id: "platform-playground",
    title: "Platform Playground",
    description: "Working examples of the platform APIs, for teams building tools.",
    contributors: ["Ananya Chandra", "Ritika Agarwal"],
    mentor: "Ananya Chandra",
    category: "Platform",
    beta: true,
  };
}
