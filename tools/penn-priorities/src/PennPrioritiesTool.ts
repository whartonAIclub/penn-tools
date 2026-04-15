import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { PennPrioritiesInput, PennPrioritiesOutput } from "./types.js";

export class PennPrioritiesTool extends Tool<PennPrioritiesInput, PennPrioritiesOutput> {
  readonly manifest: ToolManifest = {
    id: "penn-priorities",
    title: "Penn Priorities",
    description: "Centralize and prioritize tasks across Career, Academic, and Social commitments for Wharton students.",
    image: "Default",
    contributors: ["Travon Martin"],
    version: "0.1.0",
    inceptionDate: "2026-04-15",
    latestReleaseDate: "2026-04-15",
  };
  async execute(
    _input: PennPrioritiesInput,
    _context: ToolContext
  ): Promise<PennPrioritiesOutput> {
    return { assistantMessage: "ok", message: "ok" };
  }
}
