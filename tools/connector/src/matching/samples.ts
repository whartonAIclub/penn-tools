import type { Signup } from "../types.js";

// Made-up sign-ups for trying Connector before real students sign up. Four
// kinds of student, so the matching has something to find.

/** How they'd like to meet: 1 = one-on-one, G = small group, E = either. */
const FORMATS = { "1": "one-on-one", G: "small-group", E: "either" } as const;

type Sample = [
  name: string,
  cohort: string,
  format: keyof typeof FORMATS,
  party: string,
  freeDay: [string, string],
  hopingFor: string,
  values: [string, string, string, string],
  pace: string,
  followThrough: string,
];

const people: Sample[] = [
  // Night owls: big energy, here for fun.
  ["Hannah Kim", "B", "G", "dance-floor", ["night-out", "restaurant"], "explore-philly", ["makes-me-laugh", "shows-up", "honest", "pushes-me"], "keep-light", "suggest-time"],
  ["Diego Torres", "E", "G", "dance-floor", ["night-out", "sports"], "explore-philly", ["makes-me-laugh", "honest", "shows-up", "pushes-me"], "keep-light", "say-yes"],
  ["Aisha Patel", "H", "E", "host", ["restaurant", "night-out"], "ride-or-die", ["makes-me-laugh", "shows-up", "honest", "pushes-me"], "warm-up", "happy-to-plan"],
  ["Tom Becker", "K", "1", "dance-floor", ["sports", "night-out"], "ritual", ["shows-up", "makes-me-laugh", "pushes-me", "honest"], "keep-light", "say-yes"],
  ["Chloe Martin", "B", "E", "host", ["restaurant", "culture"], "explore-philly", ["makes-me-laugh", "honest", "shows-up", "pushes-me"], "keep-light", "suggest-time"],
  ["Zara Ahmed", "G", "G", "dance-floor", ["night-out", "restaurant"], "ride-or-die", ["honest", "makes-me-laugh", "shows-up", "pushes-me"], "warm-up", "set-plan"],
  // Deep talkers: real conversations, values honesty.
  ["Priya Raman", "A", "1", "my-people", ["culture", "restaurant"], "real-talk", ["honest", "pushes-me", "shows-up", "makes-me-laugh"], "go-deep", "suggest-time"],
  ["Marcus Chen", "D", "1", "my-people", ["culture", "outdoors"], "real-talk", ["honest", "shows-up", "pushes-me", "makes-me-laugh"], "go-deep", "say-yes"],
  ["Sofia Alvarez", "G", "E", "host", ["culture", "restaurant"], "real-talk", ["honest", "pushes-me", "makes-me-laugh", "shows-up"], "go-deep", "happy-to-plan"],
  ["James Okafor", "J", "1", "my-people", ["outdoors", "culture"], "ride-or-die", ["honest", "shows-up", "makes-me-laugh", "pushes-me"], "go-deep", "set-plan"],
  ["Arjun Nair", "F", "E", "my-people", ["restaurant", "culture"], "ride-or-die", ["shows-up", "honest", "pushes-me", "makes-me-laugh"], "warm-up", "suggest-time"],
  ["Ben Cohen", "A", "G", "first-hour", ["culture", "game-night"], "real-talk", ["honest", "shows-up", "pushes-me", "makes-me-laugh"], "go-deep", "set-plan"],
  // Doers: routines, fresh air, growth.
  ["Lena Fischer", "C", "G", "host", ["outdoors", "sports"], "ritual", ["pushes-me", "shows-up", "honest", "makes-me-laugh"], "warm-up", "suggest-time"],
  ["Ravi Mehta", "F", "G", "host", ["outdoors", "sports"], "ritual", ["pushes-me", "honest", "shows-up", "makes-me-laugh"], "warm-up", "say-yes"],
  ["Grace Liu", "I", "E", "my-people", ["outdoors", "game-night"], "ritual", ["shows-up", "pushes-me", "honest", "makes-me-laugh"], "warm-up", "happy-to-plan"],
  ["Noah Williams", "L", "G", "first-hour", ["outdoors", "culture"], "ritual", ["pushes-me", "honest", "shows-up", "makes-me-laugh"], "go-deep", "set-plan"],
  ["Mia Johnson", "J", "E", "host", ["sports", "outdoors"], "explore-philly", ["pushes-me", "makes-me-laugh", "shows-up", "honest"], "warm-up", "say-yes"],
  // Homebodies: small, steady, loyal.
  ["Emma Rossi", "A", "1", "first-hour", ["game-night", "culture"], "ride-or-die", ["shows-up", "honest", "makes-me-laugh", "pushes-me"], "warm-up", "happy-to-plan"],
  ["Kenji Watanabe", "E", "1", "first-hour", ["game-night", "restaurant"], "ride-or-die", ["shows-up", "honest", "makes-me-laugh", "pushes-me"], "warm-up", "say-yes"],
  ["Olivia Brown", "H", "E", "first-hour", ["game-night", "outdoors"], "real-talk", ["shows-up", "pushes-me", "honest", "makes-me-laugh"], "go-deep", "suggest-time"],
  ["Samir Haddad", "L", "G", "my-people", ["game-night", "sports"], "ride-or-die", ["shows-up", "makes-me-laugh", "honest", "pushes-me"], "warm-up", "happy-to-plan"],
  ["Lucas Silva", "C", "E", "first-hour", ["game-night", "culture"], "explore-philly", ["shows-up", "honest", "pushes-me", "makes-me-laugh"], "keep-light", "set-plan"],
];

export const SAMPLE_SIGNUPS: readonly Signup[] = people.map(
  ([name, cohort, format, party, freeDay, hopingFor, values, pace, followThrough], i) => ({
    id: `sample-${i + 1}`,
    name,
    email: `sample${i + 1}@example.com`,
    cohort,
    answers: {
      "meet-format": FORMATS[format],
      "party-style": party,
      "free-day": freeDay,
      "hoping-for": hopingFor,
      "friend-values": values,
      pace,
      "follow-through": followThrough,
    },
  }),
);
