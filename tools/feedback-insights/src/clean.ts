// Standardizes each response and flags possible problems.
//
// The rule this file keeps: formats are standardized, meaning never is. A
// rating label becomes its number, "n/a" becomes blank, a timestamp gets one
// spelling; no written answer is reworded, and nothing is removed. Flags only
// suggest. A response leaves the numbers only when a person excludes it.

import { ratingNumber, splitOptions, wordNumber } from "./detect.js";
import { hasPersonalInfo } from "./privacy.js";
import { minutesOf, normalizeTimestamp, responseKey } from "./timestamps.js";
import type { CleanResponse, CleanValue, Decision, Setup, Table } from "./types.js";

export const FLAGS = {
  duplicate: "Likely duplicate of an earlier response",
  resubmitted: "Possibly resubmitted: nearly the same as an earlier response",
  sharedId: "Shares a timestamp with another response",
  noTimestamp: "No timestamp, so it was probably typed in by hand",
  empty: "Empty response: every answer is blank",
  sameWritten: "Same written answer in every box",
  junk: "Junk or placeholder text",
  personal: "Possible name or contact info in a written answer",
  sameRating: "Same rating for every part",
  contradictory: "Contradictory answers: “none” ticked along with another option",
} as const;

const NONE_OPTION = /^(none|n\/a|not applicable|nothing)\b/i;

/** Lowercase, without the punctuation people end short answers with: "N/A." and "idk!!" match "n/a" and "idk". */
export function bare(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.!?,;:]+$/, "")
    .replace(/[‘’]/g, "'");
}

export function isBlankAnswer(value: unknown, setup: Setup): boolean {
  const text = String(value ?? "").trim();
  return text === "" || setup.blankValues.includes(text.toLowerCase()) || setup.blankValues.includes(bare(text));
}

export function isNonAnswer(value: unknown, setup: Setup): boolean {
  return setup.nonAnswers.includes(bare(value));
}

/** Keyboard mash, a lone "test", or too few letters (in any alphabet) to be an answer. */
export function isJunk(text: string): boolean {
  const t = text.trim();
  return (
    (t.match(/\p{L}/gu) ?? []).length < 3 ||
    /^(asdf\w*|qwer\w*|zxcv\w*|jkl\w*|test|testing|lol|a+|x+)$/i.test(t) ||
    /^[b-df-hj-np-tv-xz]{5,}$/i.test(t)
  );
}

interface Working extends CleanResponse {
  /** Every standardized answer, to spot exact copies. */
  all: string;
  /** The answers that aren't written, to spot a resubmission with one box changed. */
  closed: string;
  written: string[];
}

/** Every response in `table`, standardized and flagged, in file order. */
export function cleanResponses(table: Table, setup: Setup, decisions: Decision[] = []): CleanResponse[] {
  const decided = new Map<string, Decision>();
  for (const d of decisions) decided.set(responseKey(d.responseId), d);
  const present = new Set(table.columns);
  const questions = setup.questions.filter((q) => q.kind !== "ignore" && present.has(q.column));
  const ratings = questions.filter((q) => q.kind === "rating");
  const tsColumn = setup.timestampColumn != null && present.has(setup.timestampColumn) ? setup.timestampColumn : null;

  const rows = table.rows.map((raw, index): Working => {
    const flags: string[] = [];
    const unrecognized: string[] = [];
    const changed = { timestamp: 0, rating: 0, blank: 0 };
    const values: Record<string, CleanValue> = {};
    const submitted = tsColumn ? (raw[tsColumn] ?? "").trim() : "";

    let id = `row ${index + 1}`;
    if (tsColumn) {
      const ts = normalizeTimestamp(submitted);
      if (ts) {
        id = ts;
        if (ts !== submitted) changed.timestamp++;
      } else if (submitted) {
        id = submitted;
        unrecognized.push(tsColumn);
      } else flags.push(FLAGS.noTimestamp);
    }

    const written: string[] = [];
    const tagColumns: string[] = [];
    let junk = false;
    let personal = false;
    for (const q of questions) {
      const cell = raw[q.column];
      if (isBlankAnswer(cell, setup)) {
        if ((cell ?? "").trim() !== "") changed.blank++;
        values[q.column] = q.kind === "multi" ? [] : null;
        continue;
      }
      const text = (cell ?? "").trim();
      if (q.kind === "rating" || q.kind === "scale") {
        const n = q.labels.length ? wordNumber(text, q.labels, q.min) ?? ratingNumber(text) : ratingNumber(text);
        if (n == null || n < q.min || n > q.max) {
          unrecognized.push(q.column);
          values[q.column] = null;
        } else {
          if (String(n) !== text) changed.rating++;
          values[q.column] = n;
        }
      } else if (q.kind === "choice") {
        const hit = q.options.find((o) => o.toLowerCase() === text.toLowerCase());
        if (hit == null) unrecognized.push(q.column);
        values[q.column] = hit ?? null;
      } else if (q.kind === "multi") {
        const picked = splitOptions(text, q.options);
        const known = picked.filter((p) => q.options.includes(p));
        if (known.length !== picked.length) unrecognized.push(q.column);
        values[q.column] = known;
        if (known.length > 1 && known.some((o) => NONE_OPTION.test(o))) flags.push(FLAGS.contradictory);
      } else {
        values[q.column] = text;
        written.push(bare(text));
        if (isNonAnswer(text, setup)) continue;
        if (isJunk(text)) {
          junk = true;
          continue;
        }
        tagColumns.push(q.column);
        if (hasPersonalInfo(text)) personal = true;
      }
    }

    const answered = questions.some((q) => {
      const v = values[q.column];
      return Array.isArray(v) ? v.length > 0 : v != null;
    });
    if (questions.length > 0 && !answered && unrecognized.length === 0) flags.push(FLAGS.empty);
    const filled = written.filter((w) => !setup.nonAnswers.includes(w));
    if (filled.length >= 3 && filled.every((w) => w === filled[0])) flags.push(FLAGS.sameWritten);
    if (junk) flags.push(FLAGS.junk);
    if (personal) flags.push(FLAGS.personal);
    const rated = ratings.map((q) => values[q.column]);
    if (rated.length > 2 && rated.every((v) => v != null && v === rated[0])) flags.push(FLAGS.sameRating);
    if (unrecognized.length) flags.push(`Unrecognized value in ${unrecognized.length} ${unrecognized.length === 1 ? "answer" : "answers"}`);

    const openColumns = new Set(questions.filter((q) => q.kind === "text").map((q) => q.column));
    return {
      id,
      number: index + 1,
      submitted,
      values,
      flags,
      status: "OK",
      reason: "",
      tagColumns,
      changed,
      unrecognized,
      all: JSON.stringify(questions.map((q) => values[q.column])),
      closed: JSON.stringify(questions.filter((q) => !openColumns.has(q.column)).map((q) => values[q.column])),
      written,
    };
  });

  // Duplicates: only responses close in time are compared, walking back from each one.
  const timed = rows
    .map((r) => ({ r, at: minutesOf(r.id) }))
    .filter((x): x is { r: Working; at: number } => x.at != null)
    .sort((a, b) => a.at - b.at || a.r.number - b.r.number);
  timed.forEach(({ r, at }, i) => {
    if (r.flags.includes(FLAGS.empty)) return;
    for (let j = i - 1; j >= 0; j--) {
      const earlier = timed[j]!;
      if (at - earlier.at > setup.duplicateMinutes) break;
      if (earlier.r.all === r.all) {
        r.flags.push(FLAGS.duplicate);
        break;
      }
      if (earlier.r.closed === r.closed && r.written.some((w) => w.length > 3 && earlier.r.written.includes(w))) {
        r.flags.push(FLAGS.resubmitted);
        break;
      }
    }
  });

  const idCounts = new Map<string, number>();
  for (const r of rows) idCounts.set(r.id, (idCounts.get(r.id) ?? 0) + 1);
  const seen = new Map<string, number>();

  return rows.map(({ all: _all, closed: _closed, written: _written, ...r }) => {
    if ((idCounts.get(r.id) ?? 0) > 1) {
      r.flags.push(FLAGS.sharedId);
      // Tags and decisions can't tell these apart, so each later one gets its own ID.
      const n = (seen.get(r.id) ?? 0) + 1;
      seen.set(r.id, n);
      if (n > 1) r.id = `${r.id} (${n})`;
    }
    const d = decided.get(r.id);
    r.status = d?.decision === "Exclude" ? "Excluded" : d?.decision === "Keep" ? "Kept" : r.flags.length ? "Needs review" : "OK";
    r.reason = d?.reason ?? "";
    return r;
  });
}
