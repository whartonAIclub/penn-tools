// PitchCoach's AI calls, tested with a fake AI API: no keys, no network, no cost.

import { describe, it, expect } from "vitest";
import { AIError } from "@penntools/core/ai";
import type { AI, GenerateObjectRequest, GenerateRequest, GenerateResult } from "@penntools/core/ai";
import {
  Feedback,
  MAX_CONTEXT_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TRANSCRIPT_LENGTH,
  analysisPrompt,
  analyzeAnswer,
  checkAnswer,
  checkImprovements,
  normalizeFeedback,
  rewriteAnswer,
  rewritePrompt,
  type PracticeAnswer,
} from "../coach.js";
import { MAX_DURATION_SECONDS, computeDeliveryMetrics } from "../delivery.js";

const answer: PracticeAnswer = {
  category: "behavioral",
  question: "Tell me about a time you failed.",
  transcript: "So um I launched a product that missed its target and I learned to test pricing earlier.",
  durationSeconds: 60,
  resumeText: "",
  jobDescription: "",
};

const starPart = { score: 7, present: true, feedback: "Clear." };
const contentScore = { score: 7, feedback: "Good." };
const feedback: Feedback = {
  star: { situation: starPart, task: starPart, action: starPart, result: starPart },
  content: {
    clarity: contentScore,
    specificity: contentScore,
    relevance: contentScore,
    impact: contentScore,
    conciseness: contentScore,
  },
  strengths: ["Honest"],
  improvements: ["Quantify the miss"],
  overallScore: 7,
  summary: "A solid start.",
};

function generateResult(overrides: Partial<GenerateResult> = {}): GenerateResult {
  return {
    text: "Improved answer.",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    usage: { inputTokens: 5, outputTokens: 2, reasoningTokens: 0 },
    stopReason: "end",
    ...overrides,
  };
}

/** An AI that records requests; generateObject returns `object`, generate returns `reply`. */
function fakeAI(object: unknown = feedback, reply: GenerateResult = generateResult()) {
  const requests: (GenerateRequest | GenerateObjectRequest<typeof Feedback>)[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generate: async (request: GenerateRequest) => {
      requests.push(request);
      return reply;
    },
    generateObject: async (request: GenerateObjectRequest<typeof Feedback>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "claude-sonnet-5-5", usage: reply.usage };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("checkAnswer", () => {
  it("accepts a complete answer", () => {
    expect(checkAnswer(answer)).toBeNull();
  });

  it("rejects input that isn't an answer", () => {
    expect(checkAnswer(null)).not.toBeNull();
    expect(checkAnswer("hello")).not.toBeNull();
  });

  it("rejects an unknown category", () => {
    expect(checkAnswer({ ...answer, category: "sales" })).toBe("Pick a practice mode.");
  });

  it("rejects an answer with too little speech", () => {
    expect(checkAnswer({ ...answer, transcript: "  um  " })).toMatch(/No speech detected/);
  });

  it("rejects a missing question", () => {
    expect(checkAnswer({ ...answer, question: " " })).toBe("Enter a question.");
  });

  it("rejects a question or answer over its limit", () => {
    expect(checkAnswer({ ...answer, question: "x".repeat(MAX_QUESTION_LENGTH + 1) })).toBe(
      "Keep a question to at most 500 characters.",
    );
    expect(checkAnswer({ ...answer, question: "x".repeat(MAX_QUESTION_LENGTH) })).toBeNull();
    expect(checkAnswer({ ...answer, transcript: "x".repeat(MAX_TRANSCRIPT_LENGTH + 1) })).toBe(
      "Keep your answer to at most 20,000 characters.",
    );
    expect(checkAnswer({ ...answer, transcript: "x".repeat(MAX_TRANSCRIPT_LENGTH) })).toBeNull();
  });

  it("rejects a bad or too-long duration", () => {
    expect(checkAnswer({ ...answer, durationSeconds: 0 })).not.toBeNull();
    expect(checkAnswer({ ...answer, durationSeconds: 1.5 })).not.toBeNull();
    expect(checkAnswer({ ...answer, durationSeconds: "60" })).not.toBeNull();
    expect(checkAnswer({ ...answer, durationSeconds: MAX_DURATION_SECONDS + 1 })).toMatch(/under 15 minutes/);
  });

  it("allows empty context but limits its length", () => {
    expect(checkAnswer({ ...answer, resumeText: "", jobDescription: "" })).toBeNull();
    expect(checkAnswer({ ...answer, resumeText: "x".repeat(MAX_CONTEXT_LENGTH + 1) })).toMatch(/resume summary/);
    expect(checkAnswer({ ...answer, jobDescription: undefined })).not.toBeNull();
  });
});

describe("checkImprovements", () => {
  it("accepts a short list of strings", () => {
    expect(checkImprovements(["Quantify results"])).toBeNull();
    expect(checkImprovements([])).toBeNull();
  });

  it("rejects anything else", () => {
    expect(checkImprovements("Quantify results")).not.toBeNull();
    expect(checkImprovements([1])).not.toBeNull();
    expect(checkImprovements(Array(6).fill("x"))).not.toBeNull();
    expect(checkImprovements(["x".repeat(301)])).not.toBeNull();
  });
});

describe("analyzeAnswer", () => {
  it("asks for the Feedback shape on the standard tier, at its default reasoning, and returns it with the metrics", async () => {
    const { ai, requests } = fakeAI();
    const result = await analyzeAnswer(ai, "openai", answer);

    expect(result.feedback).toEqual(feedback);
    expect(result.metrics).toEqual(computeDeliveryMetrics(answer.transcript, 60));
    const request = requests[0] as GenerateObjectRequest<typeof Feedback>;
    expect(request).toMatchObject({ provider: "openai", tier: "standard" });
    expect(request.reasoning).toBeUndefined(); // the tier's default
    expect(request.schema).toBe(Feedback);
    expect(request.messages).toEqual([{ role: "user", content: analysisPrompt(answer, result.metrics) }]);
  });

  it("works out the metrics on the server", async () => {
    const { ai } = fakeAI();
    const { metrics } = await analyzeAnswer(ai, "openai", answer);
    expect(metrics.fillerInstances).toEqual(
      expect.arrayContaining([
        { word: "so", count: 1 },
        { word: "um", count: 1 },
      ]),
    );
    expect(metrics.wordsPerMinute).toBe(metrics.wordCount);
  });

  it("clamps scores the model gave out of range", async () => {
    const { ai } = fakeAI({ ...feedback, overallScore: 12, content: { ...feedback.content, impact: { score: 0.2, feedback: "" } } });
    const { feedback: result } = await analyzeAnswer(ai, "openai", answer);
    expect(result.overallScore).toBe(10);
    expect(result.content.impact.score).toBe(1);
  });

  it("passes AIErrors through", async () => {
    const ai = { generateObject: async () => Promise.reject(new AIError("credit_used", "openai")) } as unknown as AI;
    await expect(analyzeAnswer(ai, "openai", answer)).rejects.toMatchObject({ kind: "credit_used" });
  });
});

describe("analysisPrompt", () => {
  it("includes the question, metrics and transcript", () => {
    const prompt = analysisPrompt(answer, computeDeliveryMetrics(answer.transcript, 75));
    expect(prompt).toContain("Behavioral interview");
    expect(prompt).toContain(answer.question);
    expect(prompt).toContain("Duration: 1:15 (goal: 1:30–2:30)");
    expect(prompt).toMatch(/Words per minute: \d+ \(goal: 130–160\)/);
    expect(prompt).toContain('"um" (1x)');
    expect(prompt).toContain(answer.transcript);
    expect(prompt).toContain("strictly against the STAR framework");
    expect(prompt).not.toContain("Candidate context");
  });

  it("adds the resume and job description when given", () => {
    const prompt = analysisPrompt(
      { ...answer, resumeText: "PM at Acme", jobDescription: "Senior PM" },
      computeDeliveryMetrics(answer.transcript, 60),
    );
    expect(prompt).toContain("Resume summary:\nPM at Acme");
    expect(prompt).toContain("Job description:\nSenior PM");
  });

  it("doesn't hold non-behavioral answers to STAR", () => {
    const prompt = analysisPrompt({ ...answer, category: "elevator" }, computeDeliveryMetrics(answer.transcript, 60));
    expect(prompt).toContain("Elevator pitch");
    expect(prompt).toContain("(goal: 0:45–1:15)");
    expect(prompt).toContain("don't penalize it for lacking STAR");
  });
});

describe("normalizeFeedback", () => {
  it("rounds scores and keeps them between 1 and 10", () => {
    const result = normalizeFeedback({ ...feedback, overallScore: 6.6, star: { ...feedback.star, task: { ...starPart, score: -3 } } });
    expect(result.overallScore).toBe(7);
    expect(result.star.task.score).toBe(1);
    expect(result.star.situation.score).toBe(7);
  });

  it("caps the lists so the improvements always pass checkImprovements", () => {
    const long = "x".repeat(400);
    const result = normalizeFeedback({
      ...feedback,
      strengths: ["a", " ", "b", "c", "d", "e", "f"],
      improvements: [long, "Quantify", "", "1", "2", "3", "4"],
    });
    expect(result.strengths).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.improvements).toHaveLength(5);
    expect(result.improvements[0]).toHaveLength(300);
    expect(result.improvements[0]!.endsWith("…")).toBe(true);
    expect(checkImprovements(result.improvements)).toBeNull();
  });
});

describe("rewriteAnswer", () => {
  it("rewrites on the standard tier with low reasoning and returns plain text", async () => {
    const { ai, requests } = fakeAI(feedback, generateResult({ text: "  Improved answer.\n" }));
    expect(await rewriteAnswer(ai, "anthropic", answer, ["Quantify the miss"])).toBe("Improved answer.");
    expect(requests[0]).toMatchObject({
      provider: "anthropic",
      tier: "standard",
      reasoning: "low",
      messages: [{ role: "user", content: rewritePrompt(answer, ["Quantify the miss"]) }],
    });
  });

  it("throws an AIError for a refusal, a cut-off reply or an empty reply", async () => {
    const refused = fakeAI(feedback, generateResult({ text: "", stopReason: "refusal" }));
    await expect(rewriteAnswer(refused.ai, "anthropic", answer, [])).rejects.toMatchObject({ kind: "refused" });
    const cutOff = fakeAI(feedback, generateResult({ text: "When our checkout", stopReason: "max_tokens" }));
    await expect(rewriteAnswer(cutOff.ai, "anthropic", answer, [])).rejects.toMatchObject({ kind: "bad_output" });
    const empty = fakeAI(feedback, generateResult({ text: "  " }));
    await expect(rewriteAnswer(empty.ai, "anthropic", answer, [])).rejects.toMatchObject({ kind: "bad_output" });
  });
});

describe("rewritePrompt", () => {
  it("includes the coaching notes and asks for STAR on behavioral answers", () => {
    const prompt = rewritePrompt(answer, ["Quantify the miss"]);
    expect(prompt).toContain("Original answer:\n" + answer.transcript);
    expect(prompt).toContain("- Quantify the miss");
    expect(prompt).toContain("STAR framework");
    expect(prompt).toContain("take 1:30–2:30 to say aloud: about 220–360 words");
  });

  it("aims for the question type's length", () => {
    expect(rewritePrompt({ ...answer, category: "networking" }, [])).toContain("take 0:30–1:00 to say aloud: about 70–150 words");
  });

  it("leaves out notes when there are none, and STAR for other questions", () => {
    const prompt = rewritePrompt({ ...answer, category: "networking" }, []);
    expect(prompt).not.toContain("Coaching notes");
    expect(prompt).not.toContain("STAR");
  });
});
