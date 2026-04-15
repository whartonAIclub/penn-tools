import Anthropic from "@anthropic-ai/sdk";
import type { Dimension, SessionResult } from "./types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert McKinsey/BCG/Bain case interview evaluator with 10+ years of experience.

You will receive notes or a transcript from a mock case interview session. Score the candidate across 8 dimensions on a 1–5 scale. For each dimension, you MUST include a verbatim quote from the input that justifies the score.

Scoring scale:
1 = Missing or fundamentally flawed
2 = Present but weak — major gaps
3 = Adequate — covers the basics, noticeable gaps
4 = Strong — minor gaps only
5 = Exceptional — would impress an MBB interviewer

Dimensions:
- clarifying_questions: Did the candidate ask sharp, targeted clarifying questions before diving in? Did they confirm the objective and key constraints?
- structuring: Did the candidate frame the problem with a clear, MECE structure or framework tailored to the case type?
- pace_driving: Did the candidate drive the case forward proactively, manage their time well, and avoid getting stuck?
- quantitative: Were calculations accurate? Did the candidate state assumptions, show their math, and size impacts?
- exhibits: Did the candidate interpret charts, graphs, or data exhibits accurately and extract the key insight quickly?
- brainstorming: Did the candidate generate a range of creative, non-obvious hypotheses or ideas when asked?
- recommendation: Did the candidate deliver a clear, structured, data-backed recommendation with risks and next steps?
- communication: Was the delivery concise, well-signposted, and easy to follow throughout the case?

CRITICAL RULES:
1. The "quote" field MUST be a verbatim string copied from the input. Do not paraphrase.
2. If no clear quote exists for a dimension, use the closest available excerpt and note it is approximate.
3. Scores must be integers 1–5. Never use decimals.
4. The "rationale" is one sentence explaining why the score was given.
5. If the session notes don't contain evidence for a dimension (e.g. no exhibit was used), score it 1 and note the absence.

Respond ONLY with valid JSON matching this exact schema — no markdown, no preamble:
{
  "clarifying_questions": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "structuring": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "pace_driving": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "quantitative": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "exhibits": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "brainstorming": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "recommendation": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" },
  "communication": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" }
}`;

function pickPriority(scores: SessionResult["scores"]): SessionResult["priority"] {
  const dims = (Object.entries(scores) as [Dimension, { score: number; notApplicable?: boolean }][])
    .filter(([, v]) => !v.notApplicable);
  if (dims.length === 0) {
    return { dimension: "communication", label: "Communication", advice: "Use signposting: 'I'm going to structure this into three areas. First…'" };
  }
  const lowest = dims.reduce((a, b) => (a[1].score <= b[1].score ? a : b));
  const [dimension] = lowest;

  const advice: Record<Dimension, string> = {
    clarifying_questions: "Before structuring, ask 2–3 targeted questions to confirm the objective, timeframe, and any key constraints.",
    structuring: "Open with a tailored, MECE framework — avoid generic buckets. State your structure out loud before diving in.",
    pace_driving: "Set mini-deadlines as you go: 'I'll spend 2 minutes on sizing, then move to the cost side.' Own the clock.",
    quantitative: "State your assumptions before calculating, show each step out loud, and sanity-check your answer at the end.",
    exhibits: "Lead with the headline insight from the chart, then support it with the specific data point. Don't describe — interpret.",
    brainstorming: "Push past the obvious. After your first three ideas, ask yourself: what would a competitor or a customer say?",
    recommendation: "End with one committed sentence: 'My recommendation is X because Y, and the key risk to manage is Z.'",
    communication: "Use signposting throughout: 'I'll structure this into three areas. First… Second… Finally…'",
  };

  const labels: Record<Dimension, string> = {
    clarifying_questions: "Clarifying Qs",
    structuring: "Structuring",
    pace_driving: "Pace & Drive",
    quantitative: "Quant / Math",
    exhibits: "Exhibits",
    brainstorming: "Brainstorming",
    recommendation: "Recommendation",
    communication: "Communication",
  };

  return { dimension, label: labels[dimension], advice: advice[dimension] };
}

export async function scoreSession(
  content: string,
  caseType: string,
  industry: string,
  missingDimensions: Dimension[] = []
): Promise<SessionResult> {
  const ALL_DIMS: Dimension[] = [
    "clarifying_questions", "structuring", "pace_driving", "quantitative",
    "exhibits", "brainstorming", "recommendation", "communication",
  ];
  const toScore = ALL_DIMS.filter((d) => !missingDimensions.includes(d));

  // Build a pruned prompt listing only dimensions to score
  const dimLines = toScore.map((d) => {
    const descriptions: Record<Dimension, string> = {
      clarifying_questions: "clarifying_questions: Did the candidate ask sharp, targeted clarifying questions before diving in?",
      structuring: "structuring: Did the candidate frame the problem with a clear, MECE structure or framework?",
      pace_driving: "pace_driving: Did the candidate drive the case forward proactively and manage time well?",
      quantitative: "quantitative: Were calculations accurate? Did the candidate state assumptions and show their math?",
      exhibits: "exhibits: Did the candidate interpret charts or data exhibits accurately and extract the key insight?",
      brainstorming: "brainstorming: Did the candidate generate a range of creative, non-obvious hypotheses?",
      recommendation: "recommendation: Did the candidate deliver a clear, structured, data-backed recommendation?",
      communication: "communication: Was the delivery concise, well-signposted, and easy to follow?",
    };
    return descriptions[d];
  }).join("\n");

  const schemaLines = toScore.map((d) =>
    `  "${d}": { "score": <int>, "quote": "<verbatim>", "rationale": "<sentence>" }`
  ).join(",\n");

  const dynamicPrompt = `You are an expert McKinsey/BCG/Bain case interview evaluator with 10+ years of experience.

Score the candidate ONLY across the following dimensions on a 1–5 scale. For each, include a verbatim quote from the input.

Scoring scale: 1=Missing/flawed  2=Weak  3=Adequate  4=Strong  5=Exceptional

Dimensions to score:
${dimLines}

RULES:
1. "quote" MUST be verbatim from the input.
2. Scores must be integers 1–5.
3. "rationale" is one sentence.

Respond ONLY with valid JSON — no markdown, no preamble:
{
${schemaLines}
}`;

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: dynamicPrompt,
    messages: [{ role: "user", content: `Case type: ${caseType}\nIndustry: ${industry}\n\nScore this case interview session:\n\n${content}` }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let raw: Partial<Record<Dimension, { score: number; quote: string; rationale: string }>>;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse scoring response. Please try again.");
    try {
      raw = JSON.parse(match[0]);
    } catch {
      throw new Error("Failed to parse scoring response. Please try again.");
    }
  }

  // Build full scores: clamped for scored dims, N/A for missing
  const scores = Object.fromEntries(
    ALL_DIMS.map((d) => {
      if (missingDimensions.includes(d)) {
        return [d, { score: 0, quote: "", rationale: "", notApplicable: true }];
      }
      const v = raw[d];
      if (!v) return [d, { score: 1, quote: "", rationale: "No data returned for this dimension." }];
      return [d, { ...v, score: Math.min(5, Math.max(1, Math.round(v.score))) }];
    })
  ) as SessionResult["scores"];

  return { scores, priority: pickPriority(scores) };
}
