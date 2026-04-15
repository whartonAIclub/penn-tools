import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { StoredSession } from "@/lib/storage";
import type { DrillPlan } from "@/lib/types";

const client = new Anthropic();

const KNOWN_CASE_TYPES = [
  "Growth Strategy", "Cost Reduction", "Profitability", "Market Entry",
  "M&A / Due Diligence", "Pricing", "Operations / Process Improvement", "Turnaround",
];

const KNOWN_INDUSTRIES = [
  "Airlines / Transportation", "Consumer Packaged Goods (CPG)", "Energy / Utilities",
  "Financial Services", "Healthcare / Pharma", "Media & Entertainment", "Non-profit",
  "Private Equity", "Retail", "Technology", "Telecom",
];

const SYSTEM_PROMPT = `You are an expert MBB case interview coach generating a personalized drill plan from a candidate's historical practice session data.

You will receive JSON containing the candidate's sessions (scores 1–5 per dimension, rationales, case types, industries).

Your job is to analyze patterns and prescribe specific, targeted practice — not give generic advice.

Dimensions scored:
- clarifying_questions: Asking targeted questions before structuring
- structuring: MECE framework quality
- pace_driving: Driving the case forward, time management
- quantitative: Math accuracy and structure
- exhibits: Chart/data interpretation
- brainstorming: Creative, non-obvious ideas
- recommendation: Clear, committed final answer
- communication: Signposting and clarity

Scoring:
- avg < 2.5 → "weak" / urgency: "critical"
- avg 2.5–3.4 → "developing" / urgency: "high"
- avg 3.5–4.2 → "strong" / urgency: "medium"
- avg > 4.2 → "strong" (exclude from topDrills)

Trend: compare avg of oldest half of sessions vs newest half. +0.5 = "improving", -0.5 = "declining", else "stable". If < 2 scored sessions for a dimension, use "n/a".

topDrills: Select the 3–5 lowest-avg dimensions (excluding notApplicable ones). Write the insight as a specific observation grounded in their actual data (reference session counts and scores). Each drill must be concrete and time-boxed.

weeklyPlan: 7 items mixing drills (short focused practice) and full cases. Prioritize the top 2 urgency dimensions. Each item needs a label (e.g. "Day 1", "Day 3–4"), activity description, and type ("drill" or "case").

coverageGaps: Compare practiced industries/caseTypes against the known lists provided. List what's missing. Write 1–2 recommendations.

trends.summary: 2 sentences max. Be direct — name specific dimensions.

CRITICAL: Respond ONLY with valid JSON. No markdown, no preamble. Keep all strings concise (insight ≤ 20 words, drill descriptions ≤ 25 words, gaps ≤ 15 words, activity ≤ 15 words, summary ≤ 40 words). Match this exact schema:
{
  "generatedAt": "<ISO timestamp>",
  "sessionCount": <int>,
  "topDrills": [
    {
      "dimension": "<key>",
      "label": "<label>",
      "urgency": "critical" | "high" | "medium",
      "avgScore": <float 1 decimal>,
      "insight": "<1 sentence grounded in their data>",
      "drills": [
        { "title": "<drill name>", "description": "<1-2 sentence instruction>", "duration": "<e.g. 10 min>" }
      ]
    }
  ],
  "skillBreakdown": [
    {
      "dimension": "<key>",
      "label": "<label>",
      "avgScore": <float>,
      "level": "weak" | "developing" | "strong",
      "trend": "improving" | "declining" | "stable" | "n/a",
      "gaps": "<1 sentence observation>",
      "drills": ["<drill instruction>", "<drill instruction>"]
    }
  ],
  "coverageGaps": {
    "industries": ["<not yet practiced>"],
    "caseTypes": ["<not yet practiced>"],
    "recommendations": ["<1 sentence>"]
  },
  "weeklyPlan": [
    { "label": "<Day X>", "activity": "<description>", "type": "drill" | "case" }
  ],
  "trends": {
    "improving": ["<dimension label>"],
    "declining": ["<dimension label>"],
    "stagnant": ["<dimension label>"],
    "summary": "<2 sentences>"
  }
}`;

export async function POST(req: NextRequest) {
  let body: { sessions?: StoredSession[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sessions = body.sessions ?? [];
  if (sessions.length < 2) {
    return NextResponse.json({ error: "Score at least 2 sessions to generate a drill plan." }, { status: 422 });
  }

  // Use up to 15 most recent sessions (already newest-first from storage)
  const recent = sessions.slice(0, 15);

  const payload = {
    sessionCount: sessions.length,
    sessions: recent.map((s, i) => ({
      sessionNumber: sessions.length - i,
      createdAt: s.createdAt,
      caseType: s.caseType,
      industry: s.industry,
      scores: Object.fromEntries(
        Object.entries(s.scores).map(([k, v]) => [
          k,
          v.notApplicable
            ? { na: true }
            : { score: v.score, rationale: v.rationale?.slice(0, 120) },
        ])
      ),
    })),
    knownCaseTypes: KNOWN_CASE_TYPES,
    knownIndustries: KNOWN_INDUSTRIES,
  };

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let plan: DrillPlan;
    try {
      plan = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Failed to parse drill plan. Please try again.");
      plan = JSON.parse(match[0]);
    }

    // Stamp with actual session count
    plan.sessionCount = sessions.length;
    plan.generatedAt = new Date().toISOString();

    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate drill plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
