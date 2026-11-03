import { describe, it, expect } from "vitest";
import type { Brief } from "../brief.js";
import { briefToText } from "../format.js";
import { CHAT_TIPS, CLOSING_LINE } from "../framework.js";

const brief: Brief = {
  personType: "founder",
  company: { summary: "Makes scheduling software for clinics.", recentChanges: ["Raised a Series B in October."] },
  overlaps: [{ point: "You both worked in clinic operations.", howToUse: "Open with your scheduling project." }],
  intro: "I ran clinic operations for four years.",
  questions: [
    { coreQuestionId: 4, question: "What surprised you most?", followUp: "Why?", whyThisPerson: "Founder." },
    { coreQuestionId: null, question: "What would you skip if you started over?", followUp: "And repeat?", whyThisPerson: "Founder." },
  ],
};

describe("briefToText", () => {
  it("includes every section, numbered questions, the closing line and the tips", () => {
    const text = briefToText(brief, " Clinicly ");
    expect(text.startsWith("COFFEE CHAT BRIEF: Clinicly")).toBe(true);
    expect(text).toContain("Recent changes:\n- Raised a Series B in October.");
    expect(text).toContain("- You both worked in clinic operations. Open with your scheduling project.");
    expect(text).toContain("1. What surprised you most?\n   Follow-up: Why?");
    expect(text).toContain("2. What would you skip if you started over?");
    expect(text).toContain(`Close: ${CLOSING_LINE}`);
    for (const tip of CHAT_TIPS) expect(text).toContain(tip);
  });

  it("leaves out recent changes when there are none", () => {
    const text = briefToText({ ...brief, company: { ...brief.company, recentChanges: [] } }, "Clinicly");
    expect(text).not.toContain("Recent changes");
  });
});
