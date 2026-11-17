// The brief as plain text, for the page's copy button: students paste it
// into their notes before the chat.

import type { Brief } from "./brief.js";
import { CHAT_TIPS, CLOSING_LINE } from "./framework.js";

function bullets(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

export function briefToText(brief: Brief, company: string): string {
  const sections = [
    `COFFEE CHAT BRIEF: ${company.trim()}`,
    `THE COMPANY\n${brief.company.summary}` +
      (brief.company.recentChanges.length ? `\n\nRecent changes:\n${bullets(brief.company.recentChanges)}` : ""),
    `WHERE YOUR PATHS OVERLAP\n${bullets(brief.overlaps.map((o) => `${o.point}\n  Say: "${o.howToUse}"`))}`,
    `YOUR INTRO\n${brief.intro}`,
    `QUESTIONS\n${brief.questions
      .map((q, i) => `${i + 1}. ${q.question}\n   Follow-up: ${q.followUp}`)
      .join("\n")}\nClose: ${CLOSING_LINE}`,
    `DURING AND AFTER THE CHAT\n${bullets(CHAT_TIPS)}`,
  ];
  return sections.join("\n\n");
}
