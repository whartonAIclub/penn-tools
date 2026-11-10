import type { Cohort, Question } from "./types.js";

// The cohorts to choose from at sign-up. The form should offer these as a
// list rather than free text, so everyone in a cohort saves the same ID.
export const COHORTS: readonly Cohort[] = [
  { id: "A", cluster: 1 }, { id: "B", cluster: 1 }, { id: "C", cluster: 1 },
  { id: "D", cluster: 2 }, { id: "E", cluster: 2 }, { id: "F", cluster: 2 },
  { id: "G", cluster: 3 }, { id: "H", cluster: 3 }, { id: "I", cluster: 3 },
  { id: "J", cluster: 4 }, { id: "K", cluster: 4 }, { id: "L", cluster: 4 },
];

// The questions asked at sign-up. The form shows these, and the matching
// compares answers to them, so editing this list updates both. Changing an
// option's ID breaks answers already saved with the old one; changing a label
// is safe.
export const QUESTIONS: readonly Question[] = [
  {
    // Night owl or morning person.
    id: "friday-midnight",
    prompt: "Friday midnight plan",
    options: [
      { id: "out-dancing", label: "Out dancing" },
      { id: "rooftop-talk", label: "Deep talk on a rooftop" },
      { id: "board-games", label: "Board games with friends" },
      { id: "morning-person", label: "Already asleep, I'm a morning person ☀️" },
    ],
  },
  {
    // What you'd actually do together.
    id: "free-day",
    prompt: "A free day in Philly",
    options: [
      { id: "food-crawl", label: "Eating my way through a food crawl" },
      { id: "hike", label: "Out on a hike or a long walk" },
      { id: "museum", label: "Museum or gallery hopping" },
      { id: "movie-day", label: "Cozy movie day at home" },
    ],
  },
  {
    // Social style: big energy or deep 1:1s.
    id: "party-style",
    prompt: "At a party, you're usually…",
    options: [
      { id: "hosting", label: "Hosting and making intros" },
      { id: "kitchen-chat", label: "In a deep 1:1 in the kitchen" },
      { id: "dance-floor", label: "On the dance floor" },
      { id: "heading-out", label: "Heading out early" },
    ],
  },
  {
    // What they want from a friendship.
    id: "friend-value",
    prompt: "What matters most in a friend?",
    options: [
      { id: "honest", label: "Honest with me, even when it's hard" },
      { id: "shows-up", label: "Shows up when it counts" },
      { id: "makes-me-laugh", label: "Makes me laugh no matter what" },
      { id: "pushes-me", label: "Pushes me to grow" },
    ],
  },
];
