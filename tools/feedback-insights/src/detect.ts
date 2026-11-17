// Works out what each column of an exported survey holds, so a new survey
// needs no setup. People can correct any guess on the Setup tab.

import { normalizeTimestamp } from "./timestamps.js";
import type { Question, QuestionKind, Row, Setup, Table } from "./types.js";

export const DEFAULT_BLANK_VALUES = ["n/a", "na", "-", ".", "?"];
export const DEFAULT_NON_ANSWERS = [
  "idk",
  "i don't know",
  "dont know",
  "not sure",
  "none",
  "nothing",
  "no comment",
  "nope",
  "see above",
  "same as above",
  "same as before",
  "same",
  "thanks",
  "thank you",
];
export const SURVEY_SOURCE = "Survey";
/** The theme for tags that fit no other; always available. */
export const OTHER_THEME = "Other";

/** The number a rating cell holds: "4", or "5 - Very useful" as Google Forms grids export labeled ends. A range like "4-6" is not a rating. */
export function ratingNumber(value: unknown): number | null {
  const m = String(value ?? "").trim().match(/^(\d{1,2})(\s*[-–—:(]\s*(?!\d).*)?$/);
  return m ? +m[1]! : null;
}

/** "Question [Row]" → its two parts, as Google Forms names grid columns. */
export function gridParts(column: string): { group: string; label: string } | null {
  const m = column.match(/^(.*\S)\s*\[([^\]]+)\]$/);
  return m ? { group: m[1]!.trim(), label: m[2]!.trim() } : null;
}

function isBlank(value: string | undefined, blanks: string[]): boolean {
  const text = (value ?? "").trim().toLowerCase();
  return text === "" || blanks.includes(text);
}

/**
 * Scales that are answered in words, lowest to highest. A column whose answers
 * all come from one of these is a rating, and its words become 1, 2, 3 …
 */
const LADDERS: string[][] = [
  ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
  ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
  ["Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"],
  ["Very dissatisfied", "Dissatisfied", "Satisfied", "Very satisfied"],
  ["Not at all useful", "Slightly useful", "Somewhat useful", "Very useful", "Extremely useful"],
  ["Not at all helpful", "Slightly helpful", "Somewhat helpful", "Very helpful", "Extremely helpful"],
  // Three-point scales come before four-point ones, so a 3-option question isn't stretched onto 4 points.
  ["Not very useful", "Somewhat useful", "Very useful"],
  ["Not useful", "Somewhat useful", "Very useful"],
  ["Not very helpful", "Somewhat helpful", "Very helpful"],
  ["Not helpful", "Somewhat helpful", "Very helpful"],
  ["Not at all useful", "Not very useful", "Somewhat useful", "Very useful"],
  ["Not at all helpful", "Not very helpful", "Somewhat helpful", "Very helpful"],
  ["Very unlikely", "Unlikely", "Neutral", "Likely", "Very likely"],
  ["Very poor", "Poor", "Average", "Good", "Excellent"],
  ["Poor", "Fair", "Good", "Very good", "Excellent"],
  ["Poor", "Fair", "Good", "Excellent"],
  ["Very bad", "Bad", "Okay", "Good", "Very good"],
];

const lower = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The word scale that `values` (and `context`, the other answers in the same grid)
 * all come from, or null. A scale with a middle word is chosen whenever the
 * answers could belong to it, so a 5-point question nobody answered "Neutral" to
 * isn't squeezed onto 4 points when its grid-mates show it has a middle.
 */
export function wordLadder(values: string[], context: string[] = []): string[] | null {
  const used = new Set(values.map(lower));
  if (used.size < 2) return null;
  const everything = new Set([...used, ...context.map(lower)]);
  const fits = LADDERS.filter((l) => {
    const words = new Set(l.map(lower));
    return [...used].every((v) => words.has(v));
  });
  if (fits.length === 0) return null;
  const withMiddle = fits.filter((l) => l.length === 5);
  const sameFamily = (l: string[]) => [...everything].every((v) => l.map(lower).includes(v));
  return withMiddle.find(sameFamily) ?? fits.find(sameFamily) ?? fits[0] ?? null;
}

/** The position (from `min`) of a word answer on `q`'s labels, or null. */
export function wordNumber(text: string, labels: string[], min: number): number | null {
  const i = labels.findIndex((l) => lower(l) === lower(text.replace(/[.!]+$/, "")));
  return i < 0 ? null : min + i;
}

// A number question about quality is a rating (higher is better); these are about something else.
const NOT_QUALITY = /\b(pace|speed|how (many|much|long|often|old)|hours?|minutes?|age|year|number of|times|length|difficult\w*|hard|likely|recommend|temperature|rank)\b/i;

/** A short name for a standalone question: "How was the food?" → "Food". */
export function shortLabel(question: string): string {
  const text = question
    .trim()
    .replace(/[?:.\s]+$/, "")
    .replace(/^(overall,?\s*)?(please\s+)?(how\s+(would|do|did|was|were|satisfied|useful|helpful|good|well|much)(\s+you)?(\s+(rate|are you|were you|was|did you like|like|find))?|rate|rating of|your rating of|what did you think of)\s+(with\s+|of\s+|about\s+)?/i, "")
    .replace(/^(the|this|that|your|our|these|those)\s+/i, "")
    .replace(/\b(overall|please|rate|rating)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const label = text.length >= 2 && text.length <= 40 ? text : question.trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const OPEN_QUESTION = /^(why|what|where|how (would|could|can|should|did|do)|anything|any (other|additional|further)|if you|describe|explain|tell us|please (share|describe|explain|tell)|comments?|suggestions?|feedback|other thoughts)\b/i;

// Headers that ask people to say something in their own words, even when the answers are short.
const WRITTEN_ABOUT = /\b(suggest\w*|worked well|improv\w+|liked|enjoyed|disliked|change|comments?|feedback|thoughts|stop|keep doing|went well|go better)\b/i;

/** A checkbox cell with its options joined by ", ": Microsoft Forms' "Slack;Zoom;" becomes "Slack, Zoom". */
export function commaJoined(cell: string): string {
  const text = cell.trim();
  return text.includes(";") ? text.replace(/;\s*$/, "").replace(/\s*;\s*/g, ", ") : text;
}

/** What `column` most likely holds, from its header and its answers. */
export function detectQuestion(column: string, rows: Row[], context: string[] = []): Question {
  const grid = gridParts(column);
  const base = { column, label: grid ? grid.label : column, group: grid ? grid.group : null, min: 1, max: 5, options: [] as string[], labels: [] as string[] };
  const values = rows.map((r) => (r[column] ?? "").trim()).filter((v) => !isBlank(v, DEFAULT_BLANK_VALUES));
  if (values.length === 0) return { ...base, kind: grid ? "rating" : "text" };

  const numbers = values.map(ratingNumber);
  // Mostly numbers is a scale: a stray "great" is flagged on its response rather than changing the question.
  const seen = numbers.filter((n): n is number => n != null && n >= 0 && n <= 10);
  if (seen.length > 0 && (seen.length >= values.length * 0.8 || (seen.length >= 2 && values.length - seen.length === 1))) {
    const top = Math.max(...seen);
    // Common scales: 1-5, 1-7, 0-10. One that only reaches 4 is still out of 5.
    const max = top <= 5 ? 5 : top <= 7 ? 7 : 10;
    const min = seen.includes(0) || max === 10 ? 0 : 1;
    // A standalone 1-5 or 1-7 question about quality ("How was the food?") is a rating just like a grid row.
    const rating = grid != null || (min === 1 && max <= 7 && !NOT_QUALITY.test(column));
    return { ...base, kind: rating ? "rating" : "scale", label: grid || !rating ? base.label : shortLabel(column), min, max };
  }

  // Answered in words from a known scale: "Strongly agree", "Excellent".
  const ladder = wordLadder(values, context);
  if (ladder && !values.some((v) => v.includes(", "))) {
    const rating = grid != null || !NOT_QUALITY.test(column);
    return { ...base, kind: rating ? "rating" : "scale", label: grid || !rating ? base.label : shortLabel(column), min: 1, max: ladder.length, labels: ladder };
  }

  const distinct = [...new Set(values)];
  const average = values.reduce((n, v) => n + v.length, 0) / values.length;
  // "Why…?" answered in sentences is a written question even when a few people wrote the same thing.
  const words = values.reduce((n, v) => n + v.split(/\s+/).length, 0) / values.length;
  // A written question is told by its wording and by how long the answers run; a few people repeating themselves doesn't make it multiple choice.
  const piecesLookShort = values.map(commaJoined).every((v) => v.split(", ").every((piece) => piece.length <= 30));
  const listLike = values.some((v) => commaJoined(v).includes(", ")) && piecesLookShort && distinct.length > 1;
  if (OPEN_QUESTION.test(column.trim()) && words >= 3.2 && !listLike) return { ...base, kind: "text" };
  if (WRITTEN_ABOUT.test(column) && words >= 1.8 && !listLike) return { ...base, kind: "text" };
  // "Anything else?" that only a couple of people answered, each differently, is still a written question.
  if (OPEN_QUESTION.test(column.trim()) && !listLike && distinct.length === values.length) return { ...base, kind: "text" };
  // Checkboxes: several answers are lists whose pieces also appear on their own or in other lists.
  // Microsoft Forms joins them with ";" instead of ", ".
  const joined = values.map(commaJoined);
  const pieces = new Map<string, number>();
  for (const v of joined) for (const piece of v.split(", ")) pieces.set(piece, (pieces.get(piece) ?? 0) + 1);
  const lists = joined.filter((v) => v.includes(", "));
  const repeatedPieces = [...pieces.values()].filter((n) => n > 1).length;
  if (lists.length >= 2 && pieces.size <= 12 && repeatedPieces >= Math.min(2, pieces.size) && average < 160) {
    return { ...base, kind: "multi", options: optionsOf(joined, true) };
  }
  if (words >= 6) return { ...base, kind: "text" };
  // One choice from a short list: few different answers, each short, and at least one repeated.
  const maxDistinct = Math.max(2, Math.min(8, Math.ceil(values.length / 2)));
  const short = distinct.every((v) => v.length <= 60);
  if (short && distinct.length <= maxDistinct && (values.length > distinct.length || distinct.every((v) => v.length <= 12))) {
    return { ...base, kind: "choice", options: optionsOf(values, false) };
  }
  return { ...base, kind: "text" };
}

/**
 * The options seen in a column, most picked first. A checkbox cell joins its
 * options with ", " and an option may itself hold a comma, so longer options
 * that appear whole elsewhere are kept whole.
 */
export function optionsOf(values: string[], multi: boolean): string[] {
  const counts = new Map<string, number>();
  if (!multi) {
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  } else {
    // An answer with no ", " is one whole option; learn those first.
    const whole = new Set(values.filter((v) => !v.includes(", ")));
    for (const v of values) {
      for (const option of splitOptions(v, [...whole])) counts.set(option, (counts.get(option) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([option]) => option);
}

const CONTINUES = /^(but|and|or|not|so|if|with|without|because|then|which|e\.g\.|i\.e\.|etc)\b/;

/** The options ticked in a checkbox cell. Known options are matched whole first, longest first; the rest is split on ", ". */
export function splitOptions(cell: string, known: string[]): string[] {
  let rest = `, ${commaJoined(cell)}, `;
  const picked: string[] = [];
  for (const option of [...known].sort((a, b) => b.length - a.length)) {
    const needle = `, ${option}, `;
    if (rest.includes(needle)) {
      picked.push(option);
      rest = rest.replace(needle, ", ");
    }
  }
  const pieces: string[] = [];
  for (const piece of rest.split(", ")) {
    if (!piece.trim()) continue;
    // "Merged, but not launched" is one option: a piece that carries on the sentence joins the one before.
    if (pieces.length > 0 && CONTINUES.test(piece.trim())) pieces[pieces.length - 1] += `, ${piece.trim()}`;
    else pieces.push(piece.trim());
  }
  return [...picked, ...pieces];
}

/** The column that identifies responses: one named like a timestamp whose cells are dates and times. */
export function detectTimestampColumn(table: Table): string | null {
  const named = table.columns.filter((c) => /^(timestamp|submitted( at)?|submission (time|date)|date submitted|start time|completion time)$/i.test(c.trim()));
  for (const column of named.length ? named : table.columns.slice(0, 1)) {
    const values = table.rows.map((r) => (r[column] ?? "").trim()).filter(Boolean);
    if (values.length === 0 && named.includes(column)) return column;
    if (values.length > 0 && values.filter((v) => normalizeTimestamp(v) != null).length >= values.length * 0.8) return column;
  }
  return null;
}

// Columns that say who answered: Google Forms' "Email Address", Microsoft Forms' "Email" and "Name",
// Qualtrics' recipient and location fields.
const IDENTITY =
  /^(e-?mail( address)?|(respondent|recipient|your)[ _]?(e-?mail|name|first ?name|last ?name)( address)?|name|full name|first name|last name|username|user ?id|pennkey|penn ?id|student ?id|phone( number)?|ip ?address|location ?(latitude|longitude)|external ?(data )?reference)$/i;
// Not about the answers, but not about a person either: hidden, kept.
const NOT_A_QUESTION = /^(score|total score|points)$/i;

/** True for a column that identifies the respondent, going by its header. */
export function isIdentityColumn(column: string): boolean {
  return IDENTITY.test(column.trim());
}

/**
 * `table` without the columns that identify respondents, and their names. An
 * anonymous-feedback tool has no use for them, so they are dropped as the
 * file is read rather than hidden: they never reach storage or an export.
 */
export function stripIdentityColumns(table: Table): { table: Table; removed: string[] } {
  const removed = table.columns.filter(isIdentityColumn);
  if (removed.length === 0) return { table, removed };
  const columns = table.columns.filter((c) => !isIdentityColumn(c));
  return { table: { columns, rows: table.rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? ""]))) }, removed };
}

// Columns a survey tool adds about the response itself (Qualtrics, Microsoft Forms).
const META = /^(status|progress|duration( \(in seconds\))?|finished|recorded ?date|start ?date|end ?date|response ?id|id|completion time|start time|ip ?address|distribution ?channel|user ?language|response type|last modified time|language)$/i;

/**
 * A table from a Qualtrics export cleaned up: the two extra rows under the
 * header (question text, ImportId) are dropped, and `Q1_2`-style headers are
 * replaced by the question text. Any other table is returned as it is.
 */
export function tidyExport(table: Table): Table {
  const first = table.rows[1];
  if (!first || !table.columns.some((c) => (first[c] ?? "").startsWith('{"ImportId"'))) return table;
  const text = table.rows[0] ?? {};
  const used = new Set<string>();
  const names = table.columns.map((c) => {
    let name = c;
    if (/^Q\d+(_\d+)?$/.test(c) && (text[c] ?? "").trim()) {
      name = (text[c] ?? "").trim().replace(/^(.*?)\s+-\s+(.+)$/, "$1 [$2]");
    }
    while (used.has(name)) name += " ";
    used.add(name);
    return name;
  });
  const rows = table.rows.slice(2).map((r) => Object.fromEntries(table.columns.map((c, i) => [names[i] as string, r[c] ?? ""])));
  return { columns: names, rows };
}

/** A setup for `table`, guessing every column. */
export function detectSetup(table: Table): Setup {
  const timestampColumn = detectTimestampColumn(table);
  const metaHits = table.columns.filter((c) => META.test(c.trim()));
  const metaColumns = new Set(metaHits.length >= 2 ? metaHits : []);
  const questions = table.columns
    .filter((c) => c !== timestampColumn)
    .map((column): Question => {
      const grid = gridParts(column);
      const context = grid ? table.columns.filter((c) => c !== column && gridParts(c)?.group === grid.group).flatMap((c) => table.rows.map((r) => r[c] ?? "")) : [];
      const q = detectQuestion(column, table.rows, context);
      if (metaColumns.has(column)) return { ...q, kind: "ignore" };
      // Identity columns are normally stripped before this; one that gets here is never analyzed unless someone turns it on.
      return isIdentityColumn(column) || NOT_A_QUESTION.test(column.trim()) ? { ...q, kind: "ignore" } : q;
    });
  const rated = questions.filter((q) => q.kind === "rating").map((q) => q.label);
  return {
    timestampColumn,
    questions,
    themes: [...new Set([...rated, OTHER_THEME])],
    flagBelow: 3.5,
    lowSample: 10,
    noRatingGap: 1.5,
    duplicateMinutes: 30,
    blankValues: DEFAULT_BLANK_VALUES,
    nonAnswers: DEFAULT_NON_ANSWERS,
    cohortSize: null,
    surveySource: SURVEY_SOURCE,
  };
}

/**
 * The setup for a new export of a survey that already has one: columns keep
 * the kind and options someone chose, new columns are guessed, and columns no
 * longer in the file are dropped. Themes and thresholds are kept.
 */
export function mergeSetup(previous: Setup, table: Table): Setup {
  const fresh = detectSetup(table);
  const old = new Map(previous.questions.map((q) => [q.column, q]));
  const questions = fresh.questions.map((q): Question => {
    const was = old.get(q.column);
    if (!was) return q;
    const options = was.kind === q.kind ? [...new Set([...was.options, ...q.options])] : was.options;
    return { ...q, kind: was.kind, min: was.min, max: was.max, labels: was.labels, options: was.kind === "choice" || was.kind === "multi" ? options : [] };
  });
  return { ...previous, timestampColumn: fresh.timestampColumn, questions };
}

/** `setup` with one column's kind changed, re-reading its options or scale from the rows. */
export function setQuestionKind(setup: Setup, table: Table, column: string, kind: QuestionKind): Setup {
  const questions = setup.questions.map((q): Question => {
    if (q.column !== column) return q;
    const values = table.rows.map((r) => (r[column] ?? "").trim()).filter((v) => !isBlank(v, setup.blankValues));
    if (kind === "choice" || kind === "multi") return { ...q, kind, options: optionsOf(values, kind === "multi") };
    if (kind === "rating" || kind === "scale") {
      const ladder = wordLadder(values);
      if (ladder) return { ...q, kind, options: [], labels: ladder, min: 1, max: ladder.length };
      const seen = values.map(ratingNumber).filter((n): n is number => n != null);
      const top = seen.length ? Math.max(...seen) : 5;
      const max = top <= 5 ? 5 : top <= 7 ? 7 : 10;
      return { ...q, kind, options: [], min: seen.includes(0) || max === 10 ? 0 : 1, max, labels: [] };
    }
    return { ...q, kind, options: [], labels: [] };
  });
  return { ...setup, questions };
}
