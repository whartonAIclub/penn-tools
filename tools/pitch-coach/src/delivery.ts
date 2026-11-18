// ─────────────────────────────────────────────────────────────────────────────
// Delivery metrics: pace, length and filler words, worked out from the
// transcript and how long the user spoke. No AI involved.
//
// The page imports this file on its own (@penntools/tool-pitch-coach/delivery)
// to show the metrics as soon as recording stops and to highlight fillers in
// the transcript; the server works the metrics out again for the feedback
// prompt rather than trusting the browser's numbers.
// ─────────────────────────────────────────────────────────────────────────────

/** The kinds of practice question. */
export const QUESTION_CATEGORIES = ["behavioral", "elevator", "networking"] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

/** How long a good answer of each kind runs, in seconds. */
export const DURATION_GOALS: Record<QuestionCategory, { min: number; max: number }> = {
  behavioral: { min: 90, max: 150 },
  elevator: { min: 45, max: 75 },
  networking: { min: 30, max: 60 },
};

/** A comfortable speaking pace, in words per minute. */
export const PACE_GOAL = { min: 130, max: 160 };

/** At most this many fillers counts as good. */
export const FILLER_GOAL = 5;

/** Recording stops by itself after this long, in seconds; the server refuses longer answers. */
export const MAX_DURATION_SECONDS = 15 * 60;

/** Transcripts shorter than this, in characters, are treated as no speech. */
export const MIN_TRANSCRIPT_LENGTH = 10;

/** Words and phrases counted as fillers, matched case-insensitively as whole words. */
export const FILLER_WORDS = [
  "um", "uh", "er", "ah", "hmm", "like", "you know", "i mean", "so", "well",
  "actually", "basically", "literally", "let me think", "that's a good question",
  "give me a second", "how do i say this", "what i would say is",
  "the way i think about it is", "kind of", "sort of", "maybe", "probably",
  "i guess", "i think", "it seems like", "in a way", "and then", "because",
  "also", "very", "really", "quite", "pretty", "extremely", "very very",
  "really really",
];

export interface DeliveryMetrics {
  wordsPerMinute: number;
  fillerCount: number;
  /** Each filler found, most frequent first. */
  fillerInstances: { word: string; count: number }[];
  durationSeconds: number;
  wordCount: number;
}

/** One filler in a transcript: `text.slice(start, end)` is what was said. */
export interface FillerMatch {
  /** The entry in FILLER_WORDS. */
  word: string;
  start: number;
  end: number;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest first, so "very very" wins over "very" where both match. Each filler
// must stand alone: not inside a longer word ("um" in "umbrella") or joined to
// one by an apostrophe ("so" in "so's"). Spaces match any whitespace, and
// apostrophes either kind, since speech recognition may write ’.
const FILLER_SOURCES = [...FILLER_WORDS]
  .sort((a, b) => b.length - a.length)
  .map((word) => escapeRegExp(word).replace(/\s+/g, "\\s+").replace(/'/g, "['’]"));
const FILLER_REGEX_SOURCE = `(?<![\\p{L}\\p{N}'’])(?:${FILLER_SOURCES.join("|")})(?![\\p{L}\\p{N}'’])`;

/** Which FILLER_WORDS entry `said` is, e.g. "That’s  a good question" → "that's a good question". */
function fillerFor(said: string): string {
  const normalized = said.toLowerCase().replace(/\s+/g, " ").replace(/’/g, "'");
  return FILLER_WORDS.find((word) => word === normalized) ?? normalized;
}

/** Every filler in the transcript, in order, without overlaps. */
export function findFillers(transcript: string): FillerMatch[] {
  const regex = new RegExp(FILLER_REGEX_SOURCE, "giu");
  return [...transcript.matchAll(regex)].map((match) => ({
    word: fillerFor(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function computeDeliveryMetrics(transcript: string, durationSeconds: number): DeliveryMetrics {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerMinute = durationSeconds > 0 ? Math.round((wordCount / durationSeconds) * 60) : 0;

  const counts = new Map<string, number>();
  for (const { word } of findFillers(transcript)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const fillerInstances = [...counts]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
  const fillerCount = fillerInstances.reduce((sum, f) => sum + f.count, 0);

  return { wordsPerMinute, fillerCount, fillerInstances, durationSeconds, wordCount };
}

/** "1:05" for 65 seconds. */
export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/** The category's duration goal as text, e.g. "1:30–2:30". */
export function durationGoalText(category: QuestionCategory): string {
  const { min, max } = DURATION_GOALS[category];
  return `${formatDuration(min)}–${formatDuration(max)}`;
}

/** Whether the answer's pace, length and filler count each met their goal. */
export function deliveryChecks(
  metrics: DeliveryMetrics,
  category: QuestionCategory,
): { paceOk: boolean; lengthOk: boolean; fillersOk: boolean } {
  const goal = DURATION_GOALS[category];
  return {
    paceOk: metrics.wordsPerMinute >= PACE_GOAL.min && metrics.wordsPerMinute <= PACE_GOAL.max,
    lengthOk: metrics.durationSeconds >= goal.min && metrics.durationSeconds <= goal.max,
    fillersOk: metrics.fillerCount <= FILLER_GOAL,
  };
}
