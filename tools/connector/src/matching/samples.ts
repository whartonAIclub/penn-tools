import type { Signup } from "../types.js";

// Made-up sign-ups for trying the results page before the sign-up form saves
// real ones. Each has how they'd like to meet (1 = one-on-one, G = small
// group, E = either), then answers in order: Friday midnight plan, free day
// in Philly, party style, what matters most in a friend.
const FORMATS = { "1": "one-on-one", G: "small-group", E: "either" } as const;

const people: [name: string, cohort: string, format: keyof typeof FORMATS, answers: [string, string, string, string]][] = [
  // Night owls who like big energy
  ["Hannah Kim", "B", "G", ["out-dancing", "food-crawl", "dance-floor", "makes-me-laugh"]],
  ["Diego Torres", "E", "G", ["out-dancing", "food-crawl", "dance-floor", "makes-me-laugh"]],
  ["Aisha Patel", "H", "E", ["out-dancing", "food-crawl", "hosting", "makes-me-laugh"]],
  ["Tom Becker", "K", "1", ["out-dancing", "hike", "dance-floor", "shows-up"]],
  ["Chloe Martin", "B", "E", ["out-dancing", "food-crawl", "hosting", "makes-me-laugh"]],
  ["Zara Ahmed", "G", "G", ["out-dancing", "food-crawl", "dance-floor", "honest"]],
  // Deep talkers
  ["Priya Raman", "A", "1", ["rooftop-talk", "museum", "kitchen-chat", "honest"]],
  ["Marcus Chen", "D", "1", ["rooftop-talk", "museum", "kitchen-chat", "honest"]],
  ["Sofia Alvarez", "G", "E", ["rooftop-talk", "museum", "kitchen-chat", "pushes-me"]],
  ["James Okafor", "J", "1", ["rooftop-talk", "hike", "kitchen-chat", "honest"]],
  ["Arjun Nair", "F", "E", ["rooftop-talk", "food-crawl", "hosting", "honest"]],
  ["Ben Cohen", "A", "G", ["rooftop-talk", "movie-day", "kitchen-chat", "shows-up"]],
  // Game-night hosts
  ["Lena Fischer", "C", "G", ["board-games", "hike", "hosting", "pushes-me"]],
  ["Ravi Mehta", "F", "G", ["board-games", "hike", "hosting", "pushes-me"]],
  ["Grace Liu", "I", "E", ["board-games", "movie-day", "hosting", "shows-up"]],
  ["Noah Williams", "L", "G", ["board-games", "hike", "kitchen-chat", "pushes-me"]],
  ["Mia Johnson", "J", "E", ["board-games", "museum", "hosting", "pushes-me"]],
  // Morning people
  ["Emma Rossi", "A", "1", ["morning-person", "movie-day", "heading-out", "shows-up"]],
  ["Kenji Watanabe", "E", "1", ["morning-person", "movie-day", "heading-out", "shows-up"]],
  ["Olivia Brown", "H", "E", ["morning-person", "hike", "heading-out", "pushes-me"]],
  ["Samir Haddad", "L", "G", ["morning-person", "movie-day", "heading-out", "shows-up"]],
  ["Lucas Silva", "C", "E", ["morning-person", "museum", "kitchen-chat", "shows-up"]],
];

export const SAMPLE_SIGNUPS: readonly Signup[] = people.map(
  ([name, cohort, format, [friday, freeDay, party, friend]], i) => ({
    id: `sample-${i + 1}`,
    name,
    email: `sample${i + 1}@example.com`,
    cohort,
    answers: {
      "meet-format": FORMATS[format],
      "friday-midnight": friday,
      "free-day": freeDay,
      "party-style": party,
      "friend-value": friend,
    },
  }),
);
