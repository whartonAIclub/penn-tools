import { NextRequest, NextResponse } from "next/server";
import { llm, createLLMFromKey } from "@/lib/container";
import { getCurrentUser, signInRequired } from "@/lib/auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await getCurrentUser())) return signInRequired();

  const { prompt } = (await req.json()) as { prompt: string };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const userApiKey = req.headers.get("X-Api-Key");
  const requestLlm = userApiKey ? createLLMFromKey(userApiKey) : llm;

  const result = await requestLlm.complete({
    messages: [{ role: "user", content: prompt }],
  });

  return NextResponse.json({ content: result.content, model: result.model, usage: result.usage });
}
