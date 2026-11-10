// ─────────────────────────────────────────────────────────────────────────────
// The ChatPrep question framework
//
// Edit this file to change the questions every brief starts from. The rules
// are split in two: TAILORING_RULES go to the AI when it writes a brief;
// CHAT_TIPS are for the student during the chat, so the brief shows them as
// written instead of sending them to the AI.
// ─────────────────────────────────────────────────────────────────────────────

export interface CoreQuestion {
  /** Stable number the brief uses to say which core question a tailored one came from. */
  id: number;
  text: string;
  /** "them" questions build rapport and come first; "you" questions land better in the second half. */
  about: "them" | "you";
}

export const CORE_QUESTIONS: CoreQuestion[] = [
  { id: 1, about: "them", text: "What's taking up most of your time right now, and what's the hardest problem on your plate?" },
  { id: 2, about: "them", text: "Where do you expect your team's focus to be three to five months from now?" },
  { id: 3, about: "them", text: "How do you think this space will look most different in five years?" },
  { id: 4, about: "them", text: "What's surprised you most about your work?" },
  { id: 5, about: "them", text: "What separates the people who do really well in your role from the ones who are just fine?" },
  { id: 6, about: "them", text: "What part of the job drains you most, and what part would you happily do every day?" },
  {
    id: 7,
    about: "you",
    text: "I spent [X years doing Y], and I'm hoping to move into [Z]. What from your earlier work carried over most, and what did you have to learn from scratch?",
  },
  {
    id: 8,
    about: "you",
    text: "I'm weighing [option A] against [option B]. Knowing what you know now, what would you weigh most?",
  },
  { id: 9, about: "them", text: "What do you know now that you most wish you'd known when you started?" },
];

/** Every chat ends the same way, so the brief shows this as written. */
export const CLOSING_LINE = "You've given me a lot to think about. Is it OK if I reach back out with any other questions?";

export const TAILORING_RULES: string[] = [
  "Never ask anything their profile, the company website or a press release already answers. Build on what the profile and news say instead, e.g. \"I saw you moved from [previous field] into [current role]. What made you make the jump?\"",
  "Never open with a bare statement the person has no context for, like \"Adoption has grown mostly by word of mouth.\" Most questions need no lead-in at all; add one only when the question builds on a specific fact about them or the company, and then say briefly where the student saw it, the way they'd say it aloud. Use that at most two or three times in a brief, each worded differently, e.g. \"I noticed on your LinkedIn that you moved from Bain into operations…\", \"Your move from Bain to [company] caught my eye…\", \"The [article] about your Series B mentioned…\". Don't build spoken lines on facts that aren't in the profile or the news the student gave; leave them out rather than hedging with \"From what I've read\".",
  "Ask for their judgment, not a list of facts. Phrasings like \"what's the biggest,\" \"what surprised you most\" and \"what would you weigh most\" get real opinions; \"What does your team do?\" gets an org chart.",
  "Tie at least one question to the student's own background, as core question 7 does, and open it with one sentence about where the student is coming from and where they want to go.",
  "Before asking for advice, state the student's own plan or hypothesis so the person has something to react to, as core question 8 does. Fill its brackets with a real choice the student is facing, such as company stage, function or industry.",
  "Adjust the questions to the person. Investors: how they judge companies in their space, or how someone without investing experience can break in. Founders: what they'd repeat and what they'd skip if they started over. People in rotational or leadership programs: how their idea of where they want to end up has changed across rotations.",
  "Ask one question per topic, and give each a short follow-up.",
  "Start with them and save questions about the student for the second half: questions about their work build rapport first.",
  "The student says plainly what they're recruiting for, but never asks for a referral in a first chat.",
];

/** Reminders for during and after the chat, shown with every brief. */
export const CHAT_TIPS: string[] = [
  "Ask at least one follow-up per question, such as \"Can you say more about that?\"",
  "Write down their answer about where their team's focus is headed. When you follow up later, offer to help with exactly that.",
  "Skip anything they've already answered. If time is short, cut questions instead of rushing through them all.",
  "Don't ask for a referral in this chat. A week later, send a follow-up email asking who else you should talk to.",
];
