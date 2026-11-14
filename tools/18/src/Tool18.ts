import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";

export class Tool18 extends Tool {
  readonly manifest: ToolManifest = {
    id: "18",
    title: "Climate Scribe",
    description: "ClimateScribe is an AI-powered copilot that helps students plan low-carbon events and trips by analyzing itineraries, receipts, and catering menus to estimate carbon footprints and suggest greener alternatives.",
    contributors: ["Karthick Ravikumar", "Anvee Naik", "Sade Bamimore", "Charu Shah"],
    mentor: "Nicole Lin",
    category: "Other",
  };
}
