// Tests for the question framework itself: the shape the prompt and the page
// rely on, so an edit to framework.ts can't quietly break a brief.

import { describe, it, expect } from "vitest";
import { CHAT_TIPS, CHOICE_QUESTION_ID, CLOSING_LINE, CORE_QUESTIONS, TAILORING_RULES } from "../framework.js";

describe("CORE_QUESTIONS", () => {
  it("have unique ids, since briefs cite them by id", () => {
    const ids = CORE_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("include the choice question, about the student, with brackets to fill", () => {
    const choice = CORE_QUESTIONS.find((q) => q.id === CHOICE_QUESTION_ID);
    expect(choice).toBeDefined();
    expect(choice!.about).toBe("you");
    expect(choice!.text).toMatch(/\[option A\].*\[option B\]/);
  });

  it("leave at least six questions when the choice question is left out", () => {
    // A brief asks six; without a choice entered, it picks from the rest.
    expect(CORE_QUESTIONS.filter((q) => q.id !== CHOICE_QUESTION_ID).length).toBeGreaterThanOrEqual(6);
  });

  it("have both questions about them and about the student, and no blank text", () => {
    expect(CORE_QUESTIONS.some((q) => q.about === "them")).toBe(true);
    expect(CORE_QUESTIONS.some((q) => q.about === "you")).toBe(true);
    for (const q of CORE_QUESTIONS) expect(q.text.trim()).not.toBe("");
  });
});

describe("TAILORING_RULES, CHAT_TIPS and CLOSING_LINE", () => {
  it("are present and not blank", () => {
    expect(TAILORING_RULES.length).toBeGreaterThan(0);
    expect(CHAT_TIPS.length).toBeGreaterThan(0);
    for (const line of [...TAILORING_RULES, ...CHAT_TIPS, CLOSING_LINE]) expect(line.trim()).not.toBe("");
  });

  it("keep the no-referral rule, which the student asked for", () => {
    expect(TAILORING_RULES.some((rule) => /referral/i.test(rule))).toBe(true);
    expect(CHAT_TIPS.some((tip) => /referral/i.test(tip))).toBe(true);
  });
});
