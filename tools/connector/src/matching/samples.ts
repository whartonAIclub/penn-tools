import type { Signup } from "../types.js";

// Made-up sign-ups for trying the results page before the sign-up form saves
// real ones.
const people: [name: string, cohort: string, twoAm: string, saturday: string][] = [
  ["Priya Raman", "A", "rooftop-talk", "hike"],
  ["Marcus Chen", "D", "rooftop-talk", "hike"],
  ["Sofia Alvarez", "G", "rooftop-talk", "museum"],
  ["James Okafor", "J", "rooftop-talk", "hike"],
  ["Hannah Kim", "B", "diner-run", "food-crawl"],
  ["Diego Torres", "E", "diner-run", "food-crawl"],
  ["Aisha Patel", "H", "diner-run", "food-crawl"],
  ["Tom Becker", "K", "diner-run", "hike"],
  ["Lena Fischer", "C", "board-games", "museum"],
  ["Ravi Mehta", "F", "board-games", "museum"],
  ["Grace Liu", "I", "board-games", "sleep-in"],
  ["Noah Williams", "L", "board-games", "museum"],
  ["Emma Rossi", "A", "asleep", "sleep-in"],
  ["Kenji Watanabe", "E", "asleep", "sleep-in"],
  ["Olivia Brown", "H", "asleep", "hike"],
  ["Samir Haddad", "L", "asleep", "sleep-in"],
  ["Chloe Martin", "B", "diner-run", "food-crawl"],
  ["Arjun Nair", "F", "rooftop-talk", "food-crawl"],
  ["Mia Johnson", "J", "board-games", "museum"],
  ["Lucas Silva", "C", "asleep", "museum"],
  ["Zara Ahmed", "G", "diner-run", "hike"],
  ["Ben Cohen", "A", "rooftop-talk", "sleep-in"],
];

export const SAMPLE_SIGNUPS: readonly Signup[] = people.map(([name, cohort, twoAm, saturday], i) => ({
  id: `sample-${i + 1}`,
  name,
  email: `sample${i + 1}@example.com`,
  cohort,
  answers: { "ideal-2am": twoAm, "free-saturday": saturday },
}));
