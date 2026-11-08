import type { Question } from "./types.js";

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
