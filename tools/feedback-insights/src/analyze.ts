// Turns a workspace into everything the page shows: headline numbers,
// ratings, answer counts, themes, ranked recommendations, the review list and
// the data checks. Pure functions of the workspace, so the same file always
// gives the same numbers.

import { cleanResponses } from "./clean.js";
import { OTHER_THEME } from "./detect.js";
import { hasPersonalInfo } from "./privacy.js";
import { normalizeTimestamp, responseKey } from "./timestamps.js";
import { TAG_TYPES } from "./types.js";
import type { Check, CleanResponse, Question, Setup, Tag, TagType, Workspace } from "./types.js";

export interface RatingSummary {
  column: string;
  label: string;
  group: string | null;
  /** Mean on the question's own scale, to 2 places. */
  average: number;
  /** The mean converted to a 1-5 scale, so scales can be compared. */
  outOfFive: number;
  min: number;
  max: number;
  answered: number;
  low: boolean;
}

export interface Distribution {
  column: string;
  label: string;
  kind: "scale" | "choice" | "multi";
  /** Counted responses that answered this question; the percentages are of these. */
  answered: number;
  /** Mean, for a scale. */
  average: number | null;
  options: { option: string; count: number; percent: number }[];
}

export type DropReason = "orphan" | "excluded" | "repeat_id" | "same_content";

export interface TagView extends Tag {
  /** The response ID standardized. */
  responseKey: string;
  /** The response's number in the file, or null for other sources. */
  responseNumber: number | null;
  /** From Slack, an interview or anywhere else that isn't a survey response. */
  other: boolean;
  /** Who said it: tags with the same person count once in "people". */
  person: string;
  /** Why the tag isn't counted, or null when it is. */
  dropped: DropReason | null;
}

export interface ThemeSummary {
  theme: string;
  pain: number;
  working: number;
  idea: number;
  total: number;
}

export interface Recommendation {
  rank: number;
  theme: string;
  /** The most mentioned pain point in the theme, or a note when people only made suggestions (problemMentions 0). */
  problem: string;
  problemMentions: number;
  quote: string;
  /** How many different people raised a pain point in the theme (or made a suggestion, when nobody named a problem). */
  people: number;
  /** The theme's rating out of 5, or null when no rating has its name. */
  rating: number | null;
  /** The most suggested idea in the theme, or null. */
  fix: string | null;
  fixMentions: number;
  /** people × how far the rating fell short of 5. */
  score: number;
  /** The score on a 1-5 scale, 5 being this survey's top priority: 1 + 4 × score ÷ the highest score, rounded. */
  priority: number;
}

/** Something people said is working, grouped by theme: what to keep doing. */
export interface Strength {
  rank: number;
  theme: string;
  /** The most praised thing in the theme. */
  topic: string;
  topicMentions: number;
  quote: string;
  /** How many different people praised something in the theme. */
  people: number;
  /** The theme's rating out of 5, or null when no rating has its name. */
  rating: number | null;
  /** Other things praised in the theme, most mentioned first. */
  alsoPraised: { topic: string; mentions: number }[];
}

export interface UntaggedAnswer {
  responseId: string;
  responseNumber: number;
  question: string;
  text: string;
}

export interface Analysis {
  responses: CleanResponse[];
  counted: number;
  excluded: number;
  needsReview: number;
  /** Percent of the cohort that responded, when the cohort size is set. */
  responseRate: number | null;
  ratings: RatingSummary[];
  distributions: Distribution[];
  /** Every tag, counted or not. */
  tags: TagView[];
  /** Tags that count, in file order. */
  comments: TagView[];
  themes: ThemeSummary[];
  recommendations: Recommendation[];
  /** What's working, most praised first. */
  strengths: Strength[];
  topics: { type: TagType; topic: string; theme: string; count: number }[];
  untagged: UntaggedAnswer[];
  checks: Check[];
  standardized: { rule: string; count: number }[];
}

const NO_TOPIC = "(no topic)";
const tidy = (value: unknown) => String(value ?? "").trim();
const squash = (value: unknown) => tidy(value).toLowerCase().replace(/\s+/g, " ");
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const sample = (items: string[], limit = 5) => [...new Set(items)].slice(0, limit).join(" · ") + (new Set(items).size > limit ? " …" : "");

/** "pain point" → "Pain point"; anything else is returned trimmed, to be reported. */
export function normalizeTagType(value: unknown): string {
  const text = tidy(value);
  return TAG_TYPES.find((t) => t.toLowerCase() === text.toLowerCase()) ?? text;
}

/** The theme as spelled in the setup when only case or spacing differs, otherwise trimmed. */
function normalizeTheme(value: unknown, setup: Setup): string {
  const text = tidy(value);
  return setup.themes.find((t) => t.toLowerCase() === text.toLowerCase()) ?? text;
}

function viewTags(tags: Tag[], responses: CleanResponse[], setup: Setup): TagView[] {
  const byId = new Map(responses.map((r) => [r.id, r]));
  const survey = setup.surveySource.toLowerCase();
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  return tags.map((tag): TagView => {
    const key = responseKey(tag.responseId);
    const response = byId.get(key);
    const source = tidy(tag.source);
    const other = !response && source !== "" && source.toLowerCase() !== survey && normalizeTimestamp(tag.responseId) == null;
    const person = other ? `${source.toLowerCase()}|${tidy(tag.responseId) || tidy(tag.id)}` : key;
    const theme = normalizeTheme(tag.theme, setup);
    const view: TagView = {
      ...tag,
      theme,
      topic: tidy(tag.topic),
      type: normalizeTagType(tag.type),
      responseKey: key,
      responseNumber: response ? response.number : null,
      other,
      person,
      dropped: null,
    };
    const id = tidy(tag.id);
    const content = JSON.stringify([person, tidy(tag.question), squash(tag.text), theme.toLowerCase(), squash(tag.topic)]);
    if (!other && !response) view.dropped = "orphan";
    else if (!other && response?.status === "Excluded") view.dropped = "excluded";
    else if (id && seenIds.has(id)) view.dropped = "repeat_id";
    else if (seenContent.has(content)) view.dropped = "same_content";
    if (!view.dropped) {
      if (id) seenIds.add(id);
      seenContent.add(content);
    }
    return view;
  });
}

function summarizeRatings(counted: CleanResponse[], questions: Question[], setup: Setup): RatingSummary[] {
  const out: RatingSummary[] = [];
  for (const q of questions.filter((q) => q.kind === "rating")) {
    const values = counted.map((r) => r.values[q.column]).filter((v): v is number => typeof v === "number");
    if (values.length === 0) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const outOfFive = q.max > q.min ? 1 + ((mean - q.min) / (q.max - q.min)) * 4 : mean;
    out.push({
      column: q.column,
      label: q.label,
      group: q.group,
      average: round(mean, 2),
      outOfFive: round(outOfFive, 2),
      min: q.min,
      max: q.max,
      answered: values.length,
      low: outOfFive < setup.flagBelow,
    });
  }
  return out.sort((a, b) => a.outOfFive - b.outOfFive || a.label.localeCompare(b.label));
}

function summarizeDistributions(counted: CleanResponse[], questions: Question[]): Distribution[] {
  const out: Distribution[] = [];
  for (const q of questions) {
    if (q.kind !== "scale" && q.kind !== "choice" && q.kind !== "multi") continue;
    const answers = counted.map((r) => r.values[q.column]).filter((v) => (Array.isArray(v) ? v.length > 0 : v != null));
    const options = q.kind === "scale" ? Array.from({ length: q.max - q.min + 1 }, (_, i) => String(q.min + i)) : q.options;
    const numbers = answers.filter((v): v is number => typeof v === "number");
    out.push({
      column: q.column,
      label: q.label,
      kind: q.kind,
      answered: answers.length,
      average: q.kind === "scale" && numbers.length ? round(numbers.reduce((a, b) => a + b, 0) / numbers.length, 1) : null,
      options: options.map((option) => {
        const count = answers.filter((v) => (Array.isArray(v) ? v.includes(option) : String(v) === option)).length;
        return { option, count, percent: answers.length ? Math.round((100 * count) / answers.length) : 0 };
      }),
    });
  }
  return out;
}

/** The problem shown for a theme where people only made suggestions. */
const NO_PROBLEM = "Only suggestions, no problem described";

function mostCommon(tags: TagView[]): [string, number] {
  const counts = new Map<string, number>();
  for (const t of tags) counts.set(t.topic || NO_TOPIC, (counts.get(t.topic || NO_TOPIC) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [NO_TOPIC, 0];
}

function recommend(comments: TagView[], ratings: RatingSummary[], setup: Setup): Recommendation[] {
  const rated = new Map(ratings.map((r) => [r.label.toLowerCase(), r.outOfFive]));
  const pains = comments.filter((c) => c.type === "Pain point");
  const allIdeas = comments.filter((c) => c.type === "Idea");
  // A theme people only asked for things in ("post recordings") still needs a change, so it is ranked too.
  const rows = [...new Set([...pains, ...allIdeas].map((c) => c.theme))].map((theme) => {
    const ideas = allIdeas.filter((c) => c.theme === theme);
    const painsInTheme = pains.filter((c) => c.theme === theme);
    const inTheme = painsInTheme.length ? painsInTheme : ideas;
    const [problem, problemMentions] = painsInTheme.length ? mostCommon(painsInTheme) : [NO_PROBLEM, 0];
    const [fix, fixMentions] = ideas.length ? mostCommon(ideas) : [null, 0];
    const people = new Set(inTheme.map((c) => c.person)).size;
    const rating = rated.get(theme.toLowerCase()) ?? null;
    const gap = rating == null ? setup.noRatingGap : Math.max(0, 5 - rating);
    const quoteTopic = painsInTheme.length ? problem : fix;
    const quote = (inTheme.find((c) => (c.topic || NO_TOPIC) === quoteTopic) ?? inTheme[0]!).text;
    // Suggestions alone count half: a described problem is stronger evidence than a request.
    const weight = painsInTheme.length ? 1 : 0.5;
    return { theme, problem, problemMentions, quote, people, rating, fix, fixMentions, score: round(people * gap * weight, 1) };
  });
  rows.sort((a, b) => b.score - a.score || b.people - a.people || a.theme.localeCompare(b.theme));
  const top = rows[0]?.score ?? 0;
  return rows.map((r, i) => ({ rank: i + 1, ...r, priority: top > 0 ? Math.round(1 + (4 * r.score) / top) : 1 }));
}

function praise(comments: TagView[], ratings: RatingSummary[]): Strength[] {
  const rated = new Map(ratings.map((r) => [r.label.toLowerCase(), r.outOfFive]));
  const working = comments.filter((c) => c.type === "Working");
  const rows = [...new Set(working.map((c) => c.theme))].map((theme) => {
    const inTheme = working.filter((c) => c.theme === theme);
    const counts = new Map<string, number>();
    for (const c of inTheme) counts.set(c.topic || NO_TOPIC, (counts.get(c.topic || NO_TOPIC) ?? 0) + 1);
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [topic, topicMentions] = ordered[0] ?? [NO_TOPIC, 0];
    return {
      theme,
      topic,
      topicMentions,
      quote: (inTheme.find((c) => (c.topic || NO_TOPIC) === topic) ?? inTheme[0]!).text,
      people: new Set(inTheme.map((c) => c.person)).size,
      rating: rated.get(theme.toLowerCase()) ?? null,
      alsoPraised: ordered.slice(1, 4).map(([t, mentions]) => ({ topic: t, mentions })),
    };
  });
  rows.sort((a, b) => b.people - a.people || (b.rating ?? 0) - (a.rating ?? 0) || a.theme.localeCompare(b.theme));
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/** True when every piece of `quote` outside [brackets] appears, in order, in `answer`. */
export function quoteMatches(quote: string, answer: string): boolean {
  const haystack = squash(answer);
  let at = 0;
  for (const piece of squash(quote).split(/\[[^\]]*\]/).map((p) => p.trim()).filter(Boolean)) {
    const i = haystack.indexOf(piece, at);
    if (i < 0) return false;
    at = i + piece.length;
  }
  return true;
}

function runChecks(ws: Workspace, responses: CleanResponse[], tags: TagView[], untagged: UntaggedAnswer[]): Check[] {
  const { setup, table } = ws;
  const checks: Check[] = [];
  const add = (id: string, level: Check["level"], count: number, text: string) => checks.push({ id, level, count, text });
  const counted = responses.filter((r) => r.status !== "Excluded");
  const comments = tags.filter((t) => !t.dropped);
  const present = new Set(table.columns);

  if (table.rows.length === 0) add("no_responses", "info", 0, "responses in the file yet.");
  const missing = setup.questions.filter((q) => q.kind !== "ignore" && !present.has(q.column)).map((q) => q.column);
  if (setup.timestampColumn && !present.has(setup.timestampColumn)) missing.unshift(setup.timestampColumn);
  if (missing.length) {
    add("missing_questions", "bad", missing.length, `${plural(missing.length, "question column is", "question columns are")} missing from the file, so ${plural(missing.length, "its chart shows", "their charts show")} nothing. Was the question reworded? ${sample(missing, 3)}`);
  }
  if (table.rows.length > 0 && !setup.timestampColumn) {
    add("no_timestamp", "info", table.rows.length, "responses are identified by their row, because the file has no timestamp column. Keep the rows in the same order when you upload a newer file.");
  }

  const openColumns = new Set(setup.questions.filter((q) => q.kind === "text").map((q) => q.column));
  const orphans = tags.filter((t) => t.dropped === "orphan");
  if (orphans.length) {
    add("orphan_tags", "warn", orphans.length, `${plural(orphans.length, "tag points", "tags point")} at a response that isn't in the file, so ${plural(orphans.length, "it is", "they are")} left out. Check the response ID, or whether the response was deleted: ${sample(orphans.map((t) => t.responseId || "(blank)"))}`);
  }
  const repeated = tags.filter((t) => t.dropped === "repeat_id" || t.dropped === "same_content");
  if (repeated.length) {
    add("duplicate_tags", "warn", repeated.length, `${plural(repeated.length, "tag repeats", "tags repeat")} another (the same ID, or the same answer with the same theme and topic), so only the first is counted: ${sample(repeated.map((t) => t.id || t.responseId))}`);
  }
  const blank = comments.filter((t) => !tidy(t.text));
  if (blank.length) add("blank_tag", "warn", blank.length, `${plural(blank.length, "tag has", "tags have")} no text, so the feedback table shows an empty quote: ${sample(blank.map((t) => t.id || t.responseId))}`);
  const offQuestion = tags.filter((t) => !t.other && t.dropped !== "orphan" && !openColumns.has(tidy(t.question)));
  if (offQuestion.length) {
    add("tag_question", "warn", offQuestion.length, `${plural(offQuestion.length, "tag names", "tags name")} a question that isn't a written question in this survey, so ${plural(offQuestion.length, "it", "they")} can't be checked against an answer: ${sample(offQuestion.map((t) => t.question || "(blank)"), 3)}`);
  }
  const byId = new Map(responses.map((r) => [r.id, r]));
  const stale = comments.filter((t) => {
    const response = byId.get(t.responseKey);
    if (t.other || !response || !openColumns.has(tidy(t.question)) || !tidy(t.text)) return false;
    return !quoteMatches(t.text, String(response.values[tidy(t.question)] ?? ""));
  });
  if (stale.length) {
    add("stale_tags", "warn", stale.length, `${plural(stale.length, "tag quotes", "tags quote")} text that isn't in the response any more, so the answer may have changed since tagging. Tag again: ${sample(stale.map((t) => t.id || t.responseId))}`);
  }
  const leaks = comments.filter((t) => hasPersonalInfo(t.text));
  if (leaks.length) {
    add("tag_privacy", "bad", leaks.length, `${plural(leaks.length, "tagged comment", "tagged comments")} may show a name or contact info on this page. Edit the text to a role in brackets, like [mentor]: ${sample(leaks.map((t) => t.id || t.responseId))}`);
  }
  if (untagged.length) {
    const people = new Set(untagged.map((u) => u.responseId)).size;
    add("untagged", "warn", untagged.length, `written ${plural(untagged.length, "answer", "answers")} from ${people} ${plural(people, "response", "responses")} ${plural(untagged.length, "is", "are")} not tagged yet, so themes and recommendations leave ${plural(untagged.length, "it", "them")} out.`);
  }
  const known = new Set(setup.themes.map((t) => t.toLowerCase()));
  const unknownThemes = comments.map((t) => t.theme).filter((t) => !known.has(t.toLowerCase()));
  if (unknownThemes.length) {
    add("unknown_themes", "warn", new Set(unknownThemes).size, `${plural(new Set(unknownThemes).size, "theme is", "themes are")} not in the theme list (check for typos, or add it in Setup): ${sample(unknownThemes.map((t) => t || "(blank)"))}`);
  }
  const types = new Set<string>(TAG_TYPES);
  const badTypes = comments.filter((t) => !types.has(t.type));
  if (badTypes.length) {
    add("unknown_types", "warn", badTypes.length, `${plural(badTypes.length, "tag has", "tags have")} a type other than ${TAG_TYPES.join(", ")}, so ${plural(badTypes.length, "it counts", "they count")} toward no type: ${sample(badTypes.map((t) => t.type || "(blank)"))}`);
  }
  const ids = new Set(responses.map((r) => r.id));
  const lost = ws.decisions.filter((d) => !ids.has(responseKey(d.responseId)));
  if (lost.length) {
    add("review_unmatched", "warn", lost.length, `review ${plural(lost.length, "decision matches", "decisions match")} no response in the file, so ${plural(lost.length, "it is", "they are")} ignored: ${sample(lost.map((d) => d.responseId || "(blank)"))}`);
  }
  const review = responses.filter((r) => r.status === "Needs review").length;
  if (review) add("needs_review", "warn", review, `${plural(review, "response may have a problem and needs", "responses may have a problem and need")} a keep or exclude decision. See the Needs review tab.`);
  const excluded = responses.length - counted.length;
  if (excluded) add("excluded", "info", excluded, `${plural(excluded, "response is", "responses are")} excluded by a reviewer and left out of every number. The Needs review tab lists the reasons.`);
  if (counted.length > 0 && counted.length < setup.lowSample) {
    add("low_sample", "warn", counted.length, `${plural(counted.length, "response", "responses")} so far. Percentages and rankings can swing a lot with this few.`);
  }
  return checks;
}

/** Everything the page shows for `ws`. */
export function analyze(ws: Workspace): Analysis {
  const { setup, table } = ws;
  const present = new Set(table.columns);
  const questions = setup.questions.filter((q) => present.has(q.column));
  const responses = cleanResponses(table, setup, ws.decisions);
  const counted = responses.filter((r) => r.status !== "Excluded");
  const tags = viewTags(ws.tags, responses, setup);
  const comments = tags.filter((t) => !t.dropped);
  const ratings = summarizeRatings(counted, questions, setup);

  const taggedAnswers = new Set(comments.map((t) => `${t.responseKey}|${tidy(t.question)}`));
  for (const s of ws.skipped) taggedAnswers.add(`${responseKey(s.responseId)}|${tidy(s.question)}`);
  const untagged: UntaggedAnswer[] = [];
  for (const r of counted) {
    for (const column of r.tagColumns) {
      if (!taggedAnswers.has(`${r.id}|${column}`)) untagged.push({ responseId: r.id, responseNumber: r.number, question: column, text: String(r.values[column] ?? "") });
    }
  }

  const themeMap = new Map<string, ThemeSummary>();
  for (const c of comments) {
    const t = themeMap.get(c.theme) ?? { theme: c.theme, pain: 0, working: 0, idea: 0, total: 0 };
    if (c.type === "Pain point") t.pain++;
    else if (c.type === "Working") t.working++;
    else if (c.type === "Idea") t.idea++;
    t.total++;
    themeMap.set(c.theme, t);
  }
  const topicMap = new Map<string, { type: TagType; topic: string; theme: string; count: number }>();
  for (const c of comments) {
    const type = TAG_TYPES.find((t) => t === c.type);
    if (!type) continue;
    const key = `${type}|${(c.topic || NO_TOPIC).toLowerCase()}`;
    const entry = topicMap.get(key) ?? { type, topic: c.topic || NO_TOPIC, theme: c.theme, count: 0 };
    entry.count++;
    topicMap.set(key, entry);
  }

  const total = (key: "timestamp" | "rating" | "blank") => responses.reduce((n, r) => n + r.changed[key], 0);
  return {
    responses,
    counted: counted.length,
    excluded: responses.length - counted.length,
    needsReview: responses.filter((r) => r.status === "Needs review").length,
    responseRate: setup.cohortSize && setup.cohortSize > 0 ? Math.min(100, Math.round((100 * counted.length) / setup.cohortSize)) : null,
    ratings,
    distributions: summarizeDistributions(counted, questions),
    tags,
    comments,
    themes: [...themeMap.values()].sort((a, b) => b.pain - a.pain || b.total - a.total || a.theme.localeCompare(b.theme)),
    recommendations: recommend(comments, ratings, setup),
    strengths: praise(comments, ratings),
    topics: [...topicMap.values()].sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)),
    untagged,
    checks: runChecks(ws, responses, tags, untagged),
    standardized: [
      { rule: "Rating labels turned into numbers (“5 - Very useful” counts as 5)", count: total("rating") },
      { rule: "Timestamps put in one format", count: total("timestamp") },
      { rule: "Placeholder answers like “n/a” treated as blank", count: total("blank") },
      { rule: "Unrecognized values left out of the numbers and flagged", count: responses.reduce((n, r) => n + r.unrecognized.length, 0) },
    ],
  };
}

/**
 * Written answers for "Suggest themes": from counted responses only, leaving out
 * non-answers and junk, and taking turns across questions so a long first
 * question doesn't crowd out the rest.
 */
export function themeSample(analysis: Analysis, limit: number): string[] {
  const byQuestion = new Map<string, string[]>();
  for (const r of analysis.responses) {
    if (r.status === "Excluded") continue;
    for (const c of r.tagColumns) {
      const text = String(r.values[c] ?? "").trim();
      if (!text) continue;
      const list = byQuestion.get(c) ?? [];
      list.push(text);
      byQuestion.set(c, list);
    }
  }
  const lists = [...byQuestion.values()];
  const out: string[] = [];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < limit) out.push(l[i]!);
  }
  return out;
}

export { OTHER_THEME };
