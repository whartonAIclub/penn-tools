import { NextRequest, NextResponse } from "next/server";
import { scoreSession } from "@/lib/score";

const MIN_WORDS = 200;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: NextRequest) {
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
