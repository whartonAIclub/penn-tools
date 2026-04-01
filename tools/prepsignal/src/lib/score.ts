import Anthropic from "@anthropic-ai/sdk";
import type { Dimension, SessionResult } from "./types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert McKinsey/BCG/Bain case interview evaluator with 10+ years of experience.

You will receive notes or a transcript from a mock case interview session. Score the candidate across 6 dimensions on a 1–5 scale. For each dimension, you MUST include a verbatim quote from the input that justifies the score.

Scoring scale:
1 = Missing or fundamentally flawed
2 = Present but weak — major gaps
3 = Adequate — covers the basics, noticeable gaps
4 = Strong — minor gaps only
5 = Exceptional — would impress an MBB interviewer

Dimensions:
- structuring: Did the candidate frame the problem with a clear, MECE structure?
- quantitative: Were calculations accurate, stated assumptions, and sized impacts?
- creativity: Did the candidate generate novel or non-obvious hypotheses?
- synthesis: Did the candidate tie findings into a clear, committed recommendation?
- communication: Was the delivery clear, concise, and well-signposted?
- business_judgment: Did the candidate prioritize the right issues and show commercial intuition?

CRITICAL RULES:
1. The "quote" field MUST be a verbatim string copied from the input. Do not paraphrase.
2. If no clear quote exists for a dimension, use the closest available excerpt and note it is approximate.
3. Scores must be integers 1–5. Never use decimals.
4. The "rationale" is one sentence explaining why the score was given.

Respond ONLY with valid JSON matching this exact schema — no markdown, no preamble:
{
  "structuring": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "quantitative": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "creativity": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "synthesis": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "communication": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "business_judgment": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" }
}`;

function pickPriority(scores: SessionResult["scores"]): SessionResult["priority"] {
  const dims = Object.entries(scores) as [Dimension, { score: number }][];
  const lowest = dims.reduce((a, b) => (a[1].score <= b[1].score ? a : b));
  const [dimension] = lowest;

  const advice: Record<Dimension, string> = {
    structuring: "Practice opening with a 3-bucket MECE framework before diving into analysis.",
    quantitative: "State your assumptions aloud before calculating. Walk the interviewer through your logic.",
    creativity: "After your standard framework, push yourself to generate one non-obvious hypothesis.",
    synthesis: "End every case with a single committed sentence: 'My recommendation is X because Y.'",
    communication: "Use signposting: 'I'm going to structure this into three areas. First…'",
    business_judgment: "Before going deep, ask yourself: what does the CEO actually care about here?",
  };

  const labels: Record<Dimension, string> = {
    structuring: "Structuring",
    quantitative: "Quantitative",
    creativity: "Creativity",
    synthesis: "Synthesis",
    communication: "Communication",
    business_judgment: "Biz Judgment",
  };

  return { dimension, label: labels[dimension], advice: advice[dimension] };
}

export async function scoreSession(content: string): Promise<SessionResult> {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Score this case interview session:\n\n${content}` }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  // Strip markdown code fences if present (e.g. ```json ... ```)
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let raw: Record<Dimension, { score: number; quote: string; rationale: string }>;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    // Last resort: find the first { ... } block in the response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse scoring response. Please try again.");
    try {
      raw = JSON.parse(match[0]);
    } catch {
      throw new Error("Failed to parse scoring response. Please try again.");
    }
  }

  // Clamp scores to 1–5
  const scores = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [
      k,
      { ...v, score: Math.min(5, Math.max(1, Math.round(v.score))) },
    ])
  ) as SessionResult["scores"];

  return { scores, priority: pickPriority(scores) };
}
