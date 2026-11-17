import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class Tool19 extends Tool {
  readonly manifest: ToolManifest = {
    id: "19",
    title: "Compass",
    description:
      "Compass MVP backend for ingesting Penn/Wharton ICS events and serving a read-only events API.",
    contributors: ["Pak Kanjanakosit", "Iris Liu"],
    mentor: "Manas Sharma",
    category: "Other",
  };
}
