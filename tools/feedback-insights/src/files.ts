// Reading and writing the files people move in and out of the tool: tags and
// review decisions as CSV (the same columns as the "Coded" and "Review" sheets
// some teams keep beside their responses), and a whole workspace as JSON.

import { normalizeTagType } from "./analyze.js";
import { parseCsv, toCsv } from "./csv.js";
import { detectSetup, stripIdentityColumns } from "./detect.js";
import { DECISIONS, QUESTION_KINDS } from "./types.js";
import type { Decision, Question, Setup, SkippedAnswer, Tag, Workspace } from "./types.js";

export const TAG_COLUMNS = ["comment_id", "response_id", "source", "question", "text", "theme", "topic", "sentiment"];
export const DECISION_COLUMNS = ["response_id", "decision", "reason", "reviewer"];
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;

export interface Imported<T> {
  items: T[];
  /** Problems a person should know about; the import still happened. */
  notes: string[];
}

const lowerKeys = (row: Record<string, string>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));

/** Tags from a "Coded" CSV. `type` may be headed sentiment or type. */
export function tagsFromCsv(text: string): Imported<Tag> {
  const table = parseCsv(text);
  const have = new Set(table.columns.map((c) => c.trim().toLowerCase()));
  const need = ["response_id", "text", "theme"].filter((c) => !have.has(c));
  if (need.length) {
    return { items: [], notes: [`This doesn't look like a tags file: it has no ${need.join(", ")} column. Its first row should read: ${TAG_COLUMNS.join(", ")}.`] };
  }
  const items = table.rows.map((raw, i): Tag => {
    const row = lowerKeys(raw);
    return {
      id: (row["comment_id"] ?? "").trim() || `T${String(i + 1).padStart(3, "0")}`,
      responseId: (row["response_id"] ?? "").trim(),
      source: (row["source"] ?? "").trim(),
      question: (row["question"] ?? "").trim(),
      text: (row["text"] ?? "").trim(),
      theme: (row["theme"] ?? "").trim(),
      topic: (row["topic"] ?? "").trim(),
      type: normalizeTagType(row["sentiment"] ?? row["type"] ?? ""),
    };
  });
  return { items, notes: [] };
}

export function tagsToCsv(tags: Tag[]): string {
  return toCsv(
    TAG_COLUMNS,
    tags.map((t) => ({ comment_id: t.id, response_id: t.responseId, source: t.source, question: t.question, text: t.text, theme: t.theme, topic: t.topic, sentiment: t.type })),
  );
}

/** Decisions from a "Review" CSV. Rows with a decision other than Keep or Exclude are skipped and reported. */
export function decisionsFromCsv(text: string): Imported<Decision> {
  const table = parseCsv(text);
  const have = new Set(table.columns.map((c) => c.trim().toLowerCase()));
  if (!have.has("response_id") || !have.has("decision")) {
    return { items: [], notes: [`This doesn't look like a review file. Its first row should read: ${DECISION_COLUMNS.join(", ")}.`] };
  }
  const byId = new Map<string, Decision>();
  const notes: string[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];
  for (const raw of table.rows) {
    const row = lowerKeys(raw);
    const responseId = (row["response_id"] ?? "").trim();
    const word = (row["decision"] ?? "").trim().toLowerCase();
    const decision = /^exclude[sd]?$/.test(word) ? "Exclude" : /^(keep|kept)$/.test(word) ? "Keep" : null;
    if (!responseId || !decision) {
      skipped.push(word || "(blank)");
      continue;
    }
    const before = byId.get(responseId);
    if (before && before.decision !== decision) conflicts.push(responseId);
    byId.set(responseId, { responseId, decision, reason: (row["reason"] ?? "").trim(), reviewer: (row["reviewer"] ?? "").trim() });
  }
  if (skipped.length) notes.push(`${skipped.length} ${skipped.length === 1 ? "row was" : "rows were"} skipped: the decision must be Keep or Exclude (found ${[...new Set(skipped)].slice(0, 3).join(", ")}).`);
  if (conflicts.length) notes.push(`${conflicts.length} ${conflicts.length === 1 ? "response has" : "responses have"} rows that disagree; the last row was used.`);
  return { items: [...byId.values()], notes };
}

export function decisionsToCsv(decisions: Decision[]): string {
  return toCsv(
    DECISION_COLUMNS,
    decisions.map((d) => ({ response_id: d.responseId, decision: d.decision, reason: d.reason, reviewer: d.reviewer })),
  );
}

const WORKSPACE_FORMAT = "penntools-feedback-insights";

export function workspaceToJson(ws: Workspace): string {
  return JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, ...ws });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const texts = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : fallback);

/**
 * A workspace from JSON someone exported, or null if it isn't one. Every field
 * is checked and anything missing falls back to what the tool would guess, so
 * a file from an older version, or one edited by hand, can't break the page.
 */
export function workspaceFromJson(json: string): Workspace | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(data) || data["format"] !== WORKSPACE_FORMAT || !isRecord(data["table"])) return null;
  const allColumns = texts(data["table"]["columns"], []);
  const rawRows = Array.isArray(data["table"]["rows"]) ? data["table"]["rows"] : [];
  const rows = rawRows.filter(isRecord).slice(0, MAX_ROWS).map((r) => Object.fromEntries(allColumns.map((c) => [c, text(r[c])])));
  // A copy saved by an older version, or edited by hand, may still hold identity columns.
  const { table } = stripIdentityColumns({ columns: allColumns, rows });
  const columns = table.columns;
  const guess = detectSetup(table);

  const s = isRecord(data["setup"]) ? data["setup"] : {};
  const savedQuestions = Array.isArray(s["questions"]) ? s["questions"].filter(isRecord) : [];
  const saved = new Map(savedQuestions.map((q) => [text(q["column"]), q]));
  const questions = guess.questions.map((g): Question => {
    const q = saved.get(g.column);
    if (!q) return g;
    const kind = QUESTION_KINDS.find((k) => k === q["kind"]) ?? g.kind;
    return { column: g.column, label: text(q["label"], g.label) || g.label, kind, group: typeof q["group"] === "string" ? q["group"] : g.group, min: num(q["min"], g.min), max: num(q["max"], g.max), options: texts(q["options"], g.options), labels: texts(q["labels"], g.labels) };
  });
  const timestampColumn = typeof s["timestampColumn"] === "string" && columns.includes(s["timestampColumn"]) ? s["timestampColumn"] : guess.timestampColumn;
  const setup: Setup = {
    timestampColumn,
    questions: questions.filter((q) => q.column !== timestampColumn),
    themes: texts(s["themes"], guess.themes).map((t) => t.trim()).filter(Boolean),
    flagBelow: num(s["flagBelow"], guess.flagBelow),
    lowSample: num(s["lowSample"], guess.lowSample),
    noRatingGap: num(s["noRatingGap"], guess.noRatingGap),
    duplicateMinutes: num(s["duplicateMinutes"], guess.duplicateMinutes),
    blankValues: texts(s["blankValues"], guess.blankValues).map((v) => v.trim().toLowerCase()).filter(Boolean),
    nonAnswers: texts(s["nonAnswers"], guess.nonAnswers).map((v) => v.trim().toLowerCase()).filter(Boolean),
    cohortSize: typeof s["cohortSize"] === "number" && s["cohortSize"] > 0 ? Math.round(s["cohortSize"]) : null,
    surveySource: text(s["surveySource"], guess.surveySource) || guess.surveySource,
  };

  const tags = (Array.isArray(data["tags"]) ? data["tags"] : []).filter(isRecord).map((t, i): Tag => ({
    id: text(t["id"]) || `T${String(i + 1).padStart(3, "0")}`,
    responseId: text(t["responseId"]),
    source: text(t["source"]),
    question: text(t["question"]),
    text: text(t["text"]),
    theme: text(t["theme"]),
    topic: text(t["topic"]),
    type: normalizeTagType(t["type"]),
  }));
  const decisions = (Array.isArray(data["decisions"]) ? data["decisions"] : []).filter(isRecord).flatMap((d): Decision[] => {
    const decision = DECISIONS.find((k) => k === d["decision"]);
    const responseId = text(d["responseId"]);
    return decision && responseId ? [{ responseId, decision, reason: text(d["reason"]), reviewer: text(d["reviewer"]) }] : [];
  });
  const skipped = (Array.isArray(data["skipped"]) ? data["skipped"] : []).filter(isRecord).flatMap((x): SkippedAnswer[] => {
    const responseId = text(x["responseId"]);
    return responseId ? [{ responseId, question: text(x["question"]) }] : [];
  });
  return { name: text(data["name"], "Imported survey") || "Imported survey", table, setup, tags, decisions, skipped };
}

/** The next unused tag ID after `tags`: C001, C002, … */
export function nextTagId(tags: Tag[], offset = 0): string {
  let top = 0;
  for (const t of tags) {
    const m = t.id.match(/^C(\d+)$/);
    if (m) top = Math.max(top, +m[1]!);
  }
  return `C${String(top + 1 + offset).padStart(3, "0")}`;
}
