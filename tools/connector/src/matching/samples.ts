import type { Signup } from "../types.js";

// Made-up sign-ups for trying the results page before the sign-up form saves
// real ones. Answers, in order: Friday midnight plan, free day in Philly,
// party style, what matters most in a friend.
const people: [name: string, cohort: string, answers: [string, string, string, string]][] = [
  // Night owls who like big energy
  ["Hannah Kim", "B", ["out-dancing", "food-crawl", "dance-floor", "makes-me-laugh"]],
  ["Diego Torres", "E", ["out-dancing", "food-crawl", "dance-floor", "makes-me-laugh"]],
  ["Aisha Patel", "H", ["out-dancing", "food-crawl", "hosting", "makes-me-laugh"]],
  ["Tom Becker", "K", ["out-dancing", "hike", "dance-floor", "shows-up"]],
  ["Chloe Martin", "B", ["out-dancing", "food-crawl", "hosting", "makes-me-laugh"]],
  ["Zara Ahmed", "G", ["out-dancing", "food-crawl", "dance-floor", "honest"]],
  // Deep talkers
  ["Priya Raman", "A", ["rooftop-talk", "museum", "kitchen-chat", "honest"]],
  ["Marcus Chen", "D", ["rooftop-talk", "museum", "kitchen-chat", "honest"]],
  ["Sofia Alvarez", "G", ["rooftop-talk", "museum", "kitchen-chat", "pushes-me"]],
  ["James Okafor", "J", ["rooftop-talk", "hike", "kitchen-chat", "honest"]],
  ["Arjun Nair", "F", ["rooftop-talk", "food-crawl", "hosting", "honest"]],
  ["Ben Cohen", "A", ["rooftop-talk", "movie-day", "kitchen-chat", "shows-up"]],
  // Game-night hosts
  ["Lena Fischer", "C", ["board-games", "hike", "hosting", "pushes-me"]],
  ["Ravi Mehta", "F", ["board-games", "hike", "hosting", "pushes-me"]],
  ["Grace Liu", "I", ["board-games", "movie-day", "hosting", "shows-up"]],
  ["Noah Williams", "L", ["board-games", "hike", "kitchen-chat", "pushes-me"]],
  ["Mia Johnson", "J", ["board-games", "museum", "hosting", "pushes-me"]],
  // Morning people
  ["Emma Rossi", "A", ["morning-person", "movie-day", "heading-out", "shows-up"]],
  ["Kenji Watanabe", "E", ["morning-person", "movie-day", "heading-out", "shows-up"]],
  ["Olivia Brown", "H", ["morning-person", "hike", "heading-out", "pushes-me"]],
  ["Samir Haddad", "L", ["morning-person", "movie-day", "heading-out", "shows-up"]],
  ["Lucas Silva", "C", ["morning-person", "museum", "kitchen-chat", "shows-up"]],
];

export const SAMPLE_SIGNUPS: readonly Signup[] = people.map(([name, cohort, [friday, freeDay, party, friend]], i) => ({
  id: `sample-${i + 1}`,
  name,
  email: `sample${i + 1}@example.com`,
  cohort,
  answers: { "friday-midnight": friday, "free-day": freeDay, "party-style": party, "friend-value": friend },
}));
