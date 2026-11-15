import type { Answer, Cohort, Question } from "./types.js";

// The cohorts to choose from at sign-up. The form should offer these as a
// list rather than free text, so everyone in a cohort saves the same ID.
export const COHORTS: readonly Cohort[] = [
  { id: "A", cluster: 1 }, { id: "B", cluster: 1 }, { id: "C", cluster: 1 },
  { id: "D", cluster: 2 }, { id: "E", cluster: 2 }, { id: "F", cluster: 2 },
  { id: "G", cluster: 3 }, { id: "H", cluster: 3 }, { id: "I", cluster: 3 },
  { id: "J", cluster: 4 }, { id: "K", cluster: 4 }, { id: "L", cluster: 4 },
];

// The questions asked at sign-up, in order. The form shows these, and the
// matching compares answers to them (how, question by question, is in
// matching/scoring.ts), so editing this list updates both. Changing an
// option's ID breaks answers already saved with the old one; changing a label
// is safe.
export const QUESTIONS: readonly Question[] = [
  {
    // How they'd like to meet, not who they'd click with: never scored.
    id: "meet-format",
    prompt: "How would you like to meet people?",
    short: "Meet",
    options: [
      { id: "one-on-one", label: "One-on-one" },
      { id: "small-group", label: "Small group (3–4)" },
      { id: "either", label: "Either works" },
    ],
    scored: false,
  },
  {
    // Social energy, from high to low.
    id: "party-style",
    prompt: "At a party, you're usually…",
    short: "At a party",
    options: [
      { id: "host", label: "Playing host and making intros" },
      { id: "dance-floor", label: "First on the dance floor" },
      { id: "my-people", label: "Sticking with my crew all night" },
      { id: "first-hour", label: "Owning the first hour, then home to recharge" },
    ],
  },
  {
    // What they'd actually do together.
    id: "free-day",
    prompt: "The perfect day with a friend looks like…",
    short: "Perfect day",
    kind: "pick",
    picks: 2,
    options: [
      { id: "sports", label: "Catching a game" },
      { id: "outdoors", label: "A trail or a run" },
      { id: "game-night", label: "Board game or movie night" },
      { id: "culture", label: "A museum or a show" },
      { id: "restaurant", label: "A new restaurant or café" },
      { id: "night-out", label: "A fun night out" },
    ],
  },
  {
    // What kind of friendship they want.
    id: "hoping-for",
    prompt: "What kind of friendship are you looking for?",
    short: "Looking for",
    options: [
      { id: "real-talk", label: "Real, unfiltered conversations" },
      { id: "ride-or-die", label: "A ride-or-die for the long run" },
      { id: "ritual", label: "A gym, run or coffee ritual" },
      { id: "explore-philly", label: "Someone to explore Philly with" },
    ],
  },
  {
    // Their values in a friend, most important first.
    id: "friend-values",
    prompt: "Rank what matters most in a friend",
    short: "In a friend",
    kind: "rank",
    hint: "Drag to reorder, most important at the top",
    options: [
      { id: "honest", label: "Honest, even when it's hard" },
      { id: "shows-up", label: "Shows up when it counts" },
      { id: "makes-me-laugh", label: "Makes me laugh" },
      { id: "pushes-me", label: "Pushes me to grow" },
    ],
  },
  {
    // How fast they open up.
    id: "pace",
    prompt: "With someone new, you'd rather…",
    short: "With someone new",
    options: [
      { id: "go-deep", label: "Go deep right away" },
      { id: "warm-up", label: "Warm up over a few hangs" },
      { id: "keep-light", label: "Keep it light and fun" },
    ],
  },
  {
    // Whether they'll make the plan: every match needs a planner (see
    // matching/scoring.ts), so it's not something in common.
    id: "follow-through",
    prompt: "When it comes to making plans, you…",
    short: "Making plans",
    options: [
      { id: "suggest-time", label: "Suggest a time and place right away" },
      { id: "happy-to-plan", label: "Happy to plan, not always first to reach out" },
      { id: "say-yes", label: "Say yes to whatever's planned" },
      { id: "set-plan", label: "Show up if there's a set plan" },
    ],
    scored: false,
  },
];

/** The IDs in an answer: the one option of a "single" answer, or all of a "pick" or "rank" answer. */
export function answerIds(answer: Answer | undefined): readonly string[] {
  if (answer === undefined) return [];
  return typeof answer === "string" ? [answer] : answer;
}
