import { NextRequest, NextResponse } from "next/server";
import { scoreSession } from "@/lib/score";
import { checkRateLimit } from "@/lib/rateLimit";

const MIN_WORDS = 200;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`score:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 }); // 10/hour
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. You've hit the 10 sessions/hour limit — try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { content?: string; caseType?: string; industry?: string; missingDimensions?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const content = (body.content ?? "").trim();
  const caseType = (body.caseType ?? "").trim();
  const industry = (body.industry ?? "").trim();
  const missingDimensions = Array.isArray(body.missingDimensions) ? body.missingDimensions : [];

  if (!content) {
    return NextResponse.json({ error: "No session content provided." }, { status: 400 });
  }

  if (!caseType || !industry) {
    return NextResponse.json({ error: "Case type and industry are required." }, { status: 400 });
  }

  if (countWords(content) < MIN_WORDS) {
    return NextResponse.json(
      { error: `Add more detail — we need at least ${MIN_WORDS} words for a reliable score. You have ${countWords(content)}.` },
      { status: 422 }
    );
  }

  try {
    const result = await scoreSession(content, caseType, industry, missingDimensions as import("@/lib/types").Dimension[]);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scoring failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
