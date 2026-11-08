// Connector's questions, asked one at a time in this order. To add a question,
// add an entry here: a short unique id, the prompt, and the options to pick from.

export interface Question {
  id: string;
  prompt: string;
  options: string[];
}

export const QUESTIONS: Question[] = [
  {
    id: "2am-plan",
    prompt: "Ideal 2 AM plan",
    options: ["Diner Run", "Rooftop Talk", "Board Games", "Asleep"],
  },
  {
    id: "free-saturday",
    prompt: "Free Saturday",
    options: ["Food Crawl", "Hike", "Museum", "Sleep In"],
  },
];

/** A student's answers: each question's id mapped to the option they picked. */
export type Answers = Record<string, string>;
