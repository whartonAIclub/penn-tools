import { Tool } from "@penntools/core/tools";
import type { ToolManifest, ToolContext } from "@penntools/core/tools";
import type { Tool7Input, Tool7Output } from "./types.js";
import { uploadResume, addContext, storeOutput, getUser } from "./dataStore.js";
import { buildPrompt } from "./llm.js";

export class Tool7 extends Tool<Tool7Input, Tool7Output> {
  readonly manifest: ToolManifest = {
    id: "7",
    title: "Resume Customizer",
    description:
      "AI-powered tool that generates tailored resumes and cover letters from a student's full professional knowledge base",
    image: "/tools/7/icon.png",
    contributors: ["Vismay Churiwala", "Nicole Goon", "Hongyu Mao", "Samir Patki"],
    mentor: "Sanjana Wadhwa",
    version: "0.0.1",
    inceptionDate: "2026-03-19",
    latestReleaseDate: "2026-03-23",
  };

  async execute(input: Tool7Input, context: ToolContext): Promise<Tool7Output> {
    const start = Date.now();
    // Prefer the caller-supplied user_id; fall back to the platform's current user.
    const user_id = input.user_id ?? (context.currentUser as { id?: string } | undefined)?.id ?? "anonymous";

    // ── upload-resume ──────────────────────────────────────────────────────────
    if (input.action === "upload-resume") {
      const data = uploadResume(user_id, input.resume);
      return {
        assistantMessage: `Resume saved (${input.resume.length} characters).`,
        data,
        telemetry: { durationMs: Date.now() - start },
      };
    }

    // ── add-context ───────────────────────────────────────────────────────────
    if (input.action === "add-context") {
      const data = addContext(user_id, input.type, input.content);
      return {
        assistantMessage: `Context item added (type: ${input.type}).`,
        data,
        telemetry: { durationMs: Date.now() - start },
      };
    }

    // ── generate ──────────────────────────────────────────────────────────────
    if (input.action === "generate") {
      const userData = getUser(user_id);

      const payload = {
        resume: userData?.base_resume ?? "",
        context: userData?.context_items ?? [],
        job_description: input.job_description,
      };

      const llmResponse = await context.llm.complete({
        messages: [{ role: "user", content: buildPrompt(payload) }],
        systemPrompt:
          "You are an expert resume writer. Return only the tailored resume text — no preamble, no markdown fences.",
        temperature: 0.4,
      });

      const output = storeOutput(user_id, input.job_description, llmResponse.content);

      return {
        assistantMessage: llmResponse.content,
        data: output,
        telemetry: {
          durationMs: Date.now() - start,
          tokensUsed: llmResponse.usage.totalTokens,
        },
      };
    }

    return { assistantMessage: "Unknown action.", telemetry: { durationMs: 0 } };
  }
}
