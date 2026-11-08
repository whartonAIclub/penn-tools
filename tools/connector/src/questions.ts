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
    id: "ideal-2am",
    prompt: "Ideal 2am plan",
    options: [
      { id: "diner-run", label: "Diner run" },
      { id: "rooftop-talk", label: "Rooftop talk" },
      { id: "board-games", label: "Board games" },
      { id: "asleep", label: "Asleep" },
    ],
  },
  {
    id: "free-saturday",
    prompt: "Free Saturday",
    options: [
      { id: "food-crawl", label: "Food crawl" },
      { id: "hike", label: "Hike" },
      { id: "museum", label: "Museum" },
      { id: "sleep-in", label: "Sleep in" },
    ],
  },
];
