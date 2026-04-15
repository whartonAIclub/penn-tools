import type { Dimension, SessionResult, DrillPlan } from "./types";
import { DIMENSIONS } from "./types";

export interface StoredSession {
  id: string;
  createdAt: string; // ISO string
  label?: string; // optional short user-provided label
  caseType: string;
  industry: string;
  scores: SessionResult["scores"];
  priority: SessionResult["priority"];
}

const KEY = "prepsignal_sessions";

export function loadSessions(): StoredSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveSession(result: SessionResult, caseType: string, industry: string, label?: string): StoredSession {
  const session: StoredSession = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...(label?.trim() ? { label: label.trim() } : {}),
    caseType,
    industry,
    scores: result.scores,
    priority: result.priority,
  };
  const sessions = loadSessions();
  sessions.unshift(session); // newest first
  localStorage.setItem(KEY, JSON.stringify(sessions));
  return session;
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

const DRILL_KEY = "prepsignal_drills";

export function loadDrillPlan(): DrillPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRILL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDrillPlan(plan: DrillPlan): void {
  localStorage.setItem(DRILL_KEY, JSON.stringify(plan));
}

export function clearDrillPlan(): void {
  localStorage.removeItem(DRILL_KEY);
}

// Injects 4 realistic pre-scored sessions for demo purposes.
// Sessions span the past 4 weeks with an improving score arc.
export function seedDemoData(): void {
  const now = Date.now();
  const day = 86_400_000;

  const sessions: StoredSession[] = [
    // Session 4 — newest, strongest (profitability / healthcare)
    {
      id: "demo-4",
      createdAt: new Date(now - 7 * day).toISOString(),
      label: "Mock with Priya — profitability",
      caseType: "Profitability",
      industry: "Healthcare / Pharma",
      scores: {
        clarifying_questions: { score: 4, quote: "What is the primary goal — margin improvement or absolute profit?", rationale: "Opened with a sharp scope question that redirected the case early." },
        structuring: { score: 3, quote: "I split this into revenue and cost, then broke cost into fixed and variable.", rationale: "MECE but generic — a profitability-specific lens (e.g., payor mix, reimbursement) would have scored higher." },
        pace_driving: { score: 4, quote: "I'll spend two minutes on the revenue side then move to costs.", rationale: "Explicitly set time-boxes and followed through on each transition." },
        quantitative: { score: 4, quote: "Assuming $200M revenue and a 15% margin decline, that's $30M gap to close.", rationale: "Stated assumptions, showed math out loud, reached a specific number." },
        exhibits: { score: 4, quote: "The chart shows reimbursement rates falling faster than volume — that's the driver.", rationale: "Led with the headline insight rather than describing the chart." },
        brainstorming: { score: 4, quote: "Beyond pricing, I'd also look at care-setting shift and formulary positioning.", rationale: "Moved past the obvious cost-cut ideas to payor-specific levers." },
        recommendation: { score: 4, quote: "My recommendation is to prioritize formulary negotiations because the data shows a 40% reimbursement gap vs. peers.", rationale: "Clear, specific, evidence-backed — could have named one key risk." },
        communication: { score: 5, quote: "I'll structure this in three areas: revenue, variable cost, and fixed cost. Starting with revenue.", rationale: "Consistent signposting throughout; interviewer never lost track of where we were." },
      },
      priority: { dimension: "structuring", label: "Structuring", advice: "Open with a tailored, MECE framework — avoid generic buckets. State your structure out loud before diving in." },
    },

    // Session 3 — market entry / tech
    {
      id: "demo-3",
      createdAt: new Date(now - 14 * day).toISOString(),
      label: "Practice — market entry",
      caseType: "Market Entry",
      industry: "Technology",
      scores: {
        clarifying_questions: { score: 3, quote: "Are we entering organically or via acquisition?", rationale: "Asked one good question but missed confirming the timeline and success metric." },
        structuring: { score: 3, quote: "I'll look at market attractiveness, competitive dynamics, and our ability to win.", rationale: "Solid three-bucket structure but the 'ability to win' bucket needed more specifics upfront." },
        pace_driving: { score: 3, quote: "Let me move to competitive dynamics now.", rationale: "Signaled transitions but didn't set explicit time targets — ran long on market sizing." },
        quantitative: { score: 3, quote: "If the market is $2B and we capture 5%, that's $100M revenue.", rationale: "Correct calculation but assumptions weren't stated before the math." },
        exhibits: { score: 3, quote: "The growth rate is 18% year-over-year, which is above market.", rationale: "Identified the key data point but didn't connect it to a strategic implication." },
        brainstorming: { score: 3, quote: "Potential entry modes include greenfield, partnership, or acquisition.", rationale: "Standard list — didn't push to a less obvious lever like licensing or white-labeling." },
        recommendation: { score: 3, quote: "I recommend entering via partnership to reduce execution risk.", rationale: "Made a call but didn't cite the specific data that drove the decision." },
        communication: { score: 4, quote: "First, market attractiveness. Second, competitive landscape. Third, our fit.", rationale: "Clear structure at the start; transitions were smooth though not always proactive." },
      },
      priority: { dimension: "pace_driving", label: "Pace & Drive", advice: "Set mini-deadlines as you go: 'I'll spend 2 minutes on sizing, then move to the cost side.' Own the clock." },
    },

    // Session 2 — M&A / retail
    {
      id: "demo-2",
      createdAt: new Date(now - 21 * day).toISOString(),
      label: "Study group — M&A case",
      caseType: "M&A / Due Diligence",
      industry: "Retail",
      scores: {
        clarifying_questions: { score: 3, quote: "What's the strategic rationale — synergies or market share?", rationale: "Asked one clarifying question but didn't confirm deal timeline or integration constraints." },
        structuring: { score: 2, quote: "I'll look at the financials, the market, and the integration.", rationale: "Generic M&A buckets without tailoring to the retail-specific synergy thesis." },
        pace_driving: { score: 2, quote: "Should I move on to the financial analysis?", rationale: "Asked the interviewer for permission to proceed rather than driving the transition independently." },
        quantitative: { score: 3, quote: "If synergies are $50M and the deal costs $500M, payback is 10 years.", rationale: "Correct but didn't sanity-check whether 10 years is reasonable in this context." },
        exhibits: { notApplicable: true, score: 0, quote: "", rationale: "" },
        brainstorming: { score: 3, quote: "Synergies could come from procurement, shared logistics, or private label.", rationale: "Covered the standard levers but in a list format without prioritizing." },
        recommendation: { score: 3, quote: "I'd recommend proceeding if the synergies are achievable within 3 years.", rationale: "Conditional recommendation — too hedged. A stronger close names the number and the risk." },
        communication: { score: 3, quote: "So to summarize what I found...", rationale: "Summary at the end was clear but in-case signposting was inconsistent." },
      },
      priority: { dimension: "structuring", label: "Structuring", advice: "Open with a tailored, MECE framework — avoid generic buckets. State your structure out loud before diving in." },
    },

    // Session 1 — oldest, weakest (growth strategy / consumer)
    {
      id: "demo-1",
      createdAt: new Date(now - 28 * day).toISOString(),
      label: "First mock",
      caseType: "Growth Strategy",
      industry: "Consumer Packaged Goods (CPG)",
      scores: {
        clarifying_questions: { score: 2, quote: "So we want to grow revenue?", rationale: "Restated the prompt rather than asking a targeted question to narrow scope." },
        structuring: { score: 2, quote: "I'll look at new products, new markets, and existing customers.", rationale: "Generic growth buckets — no hypothesis about where growth is most likely to come from." },
        pace_driving: { score: 2, quote: "I think I'm done with this area.", rationale: "Passive transition language — didn't signal timing or take ownership of the agenda." },
        quantitative: { score: 2, quote: "Revenue could grow by maybe 10 to 20 percent.", rationale: "Estimate given as a range without stating assumptions or showing the calculation." },
        exhibits: { notApplicable: true, score: 0, quote: "", rationale: "" },
        brainstorming: { score: 2, quote: "We could expand into new markets or launch new SKUs.", rationale: "Only two ideas, both obvious — no differentiated or creative options explored." },
        recommendation: { score: 2, quote: "I think we should focus on new markets because there's more opportunity there.", rationale: "Vague reasoning — didn't cite specific data or name the key risk." },
        communication: { score: 3, quote: "Let me walk you through what I found.", rationale: "Adequate closing but no structured signposting during the case." },
      },
      priority: { dimension: "clarifying_questions", label: "Clarifying Qs", advice: "Before structuring, ask 2–3 targeted questions to confirm the objective, timeframe, and any key constraints." },
    },
  ];

  // Store newest-first (consistent with how saveSession works)
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

const PRIORITY_ADVICE: Record<Dimension, string> = {
  clarifying_questions: "Before structuring, ask 2–3 targeted questions to confirm the objective, timeframe, and any key constraints.",
  structuring: "Open with a tailored, MECE framework — avoid generic buckets. State your structure out loud before diving in.",
  pace_driving: "Set mini-deadlines as you go: 'I'll spend 2 minutes on sizing, then move to the cost side.' Own the clock.",
  quantitative: "State your assumptions before calculating, show each step out loud, and sanity-check your answer at the end.",
  exhibits: "Lead with the headline insight from the chart, then support it with the specific data point. Don't describe — interpret.",
  brainstorming: "Push past the obvious. After your first three ideas, ask yourself: what would a competitor or a customer say?",
  recommendation: "End with one committed sentence: 'My recommendation is X because Y, and the key risk to manage is Z.'",
  communication: "Use signposting throughout: 'I'll structure this into three areas. First… Second… Finally…'",
};

// Computes priority from rolling average of up to last 3 sessions.
// Ties broken by least improvement (smallest score delta from oldest to newest of those 3).
// Falls back to latest session's priority if < 2 sessions or no scorable data.
export function computeMultiSessionPriority(sessions: StoredSession[]): SessionResult["priority"] {
  const recent = sessions.slice(0, 3); // newest first
  if (recent.length < 2) return sessions[0].priority;

  const avgs: Partial<Record<Dimension, number>> = {};
  const deltas: Partial<Record<Dimension, number>> = {};

  for (const { key } of DIMENSIONS) {
    const scored = recent.filter((s) => s.scores[key] && !s.scores[key].notApplicable);
    if (scored.length < 2) continue;
    avgs[key] = scored.reduce((sum, s) => sum + s.scores[key].score, 0) / scored.length;
    deltas[key] = scored[0].scores[key].score - scored[scored.length - 1].scores[key].score;
  }

  const candidates = (Object.keys(avgs) as Dimension[]);
  if (candidates.length === 0) return sessions[0].priority;

  const lowestAvg = Math.min(...candidates.map((k) => avgs[k]!));
  const tied = candidates.filter((k) => avgs[k]! === lowestAvg);
  const dimension = tied.length === 1
    ? tied[0]
    : tied.reduce((a, b) => (deltas[a] ?? 0) <= (deltas[b] ?? 0) ? a : b);

  const label = DIMENSIONS.find((d) => d.key === dimension)?.label ?? dimension;
  return { dimension, label, advice: PRIORITY_ADVICE[dimension] };
}

// Returns data shaped for the Recharts progression chart
export function toChartData(sessions: StoredSession[]): Record<string, string | number>[] {
  return [...sessions].reverse().map((s, i) => {
    const row: Record<string, string | number> = { session: `S${i + 1}` };
    (Object.keys(s.scores) as Dimension[]).forEach((dim) => {
      const d = s.scores[dim];
      if (d && !d.notApplicable) {
        row[dim] = d.score;
      }
    });
    return row;
  });
}
