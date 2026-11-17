// The upload file format, defined once: the admin page checks a file with it
// for the preview, and the upload route checks it again before writing.
// A file is a JSON array with one object per person.

import { z } from "@penntools/core/ai";
import { INDUSTRIES } from "./industries.js";

/** The largest file the upload route reads. The full CareerPath export is about 1.5 MB. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** The most people one file may hold. */
export const MAX_UPLOAD_PEOPLE = 50_000;

const CURRENT_YEAR = new Date().getFullYear();
const text = (max: number) => z.string().trim().max(max);

/** One person in an upload file: the shape the CareerPath export (people.json) has. */
export const UploadEntry = z.object({
  /** CareerPath's ID for the person, when the export has one: the most reliable way to match them across uploads. */
  careerPathId: z.union([z.string().trim().min(1).max(40), z.number().int().nonnegative()]).optional(),
  name: text(200).min(1),
  gradYear: z.number().int().min(1950).max(CURRENT_YEAR + 6),
  program: text(100).min(1),
  isAlumni: z.boolean(),
  currentEmployer: text(200).default(""),
  currentTitle: text(300).default(""),
  industries: z.array(z.enum(INDUSTRIES)).min(1).max(INDUSTRIES.length),
});
export type UploadEntry = z.infer<typeof UploadEntry>;

export interface UploadProblem {
  /** The entry's position in the file, counting from 1. Absent for problems with the whole file. */
  position?: number | undefined;
  /** The field at fault, e.g. "industries[2]". */
  field?: string | undefined;
  message: string;
}

export type UploadCheck = { ok: true; entries: UploadEntry[] } | { ok: false; problems: UploadProblem[] };

/** Problems listed at most, so a badly wrong file doesn't produce a huge reply. */
const MAX_PROBLEMS = 50;

/**
 * The person's key, the same in every upload: their CareerPath ID when the
 * file has one, otherwise their name, class year and program.
 */
export function personKey(entry: Pick<UploadEntry, "careerPathId" | "name" | "gradYear" | "program">): string {
  if (entry.careerPathId !== undefined) return `cp:${entry.careerPathId}`;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `np:${norm(entry.name)}|${entry.gradYear}|${norm(entry.program)}`;
}

/**
 * Checks a parsed upload file. Rejects the whole file if any entry is wrong,
 * listing the bad entries by position and field, and rejects two entries for
 * the same person.
 */
export function checkUpload(data: unknown): UploadCheck {
  if (!Array.isArray(data)) return { ok: false, problems: [{ message: "The file must be a JSON array, one object per person." }] };
  if (data.length === 0) return { ok: false, problems: [{ message: "The file has no people in it." }] };
  if (data.length > MAX_UPLOAD_PEOPLE) {
    return { ok: false, problems: [{ message: `The file has ${data.length} people; at most ${MAX_UPLOAD_PEOPLE} can be uploaded at once.` }] };
  }

  const problems: UploadProblem[] = [];
  const entries: UploadEntry[] = [];
  const seen = new Map<string, number>();
  data.forEach((item, i) => {
    if (problems.length >= MAX_PROBLEMS) return;
    const parsed = UploadEntry.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 3)) {
        problems.push({ position: i + 1, field: fieldName(issue.path), message: issue.message });
      }
      return;
    }
    const key = personKey(parsed.data);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      problems.push({ position: i + 1, message: `Same person as entry ${earlier}: each person may appear once.` });
      return;
    }
    seen.set(key, i + 1);
    entries.push(parsed.data);
  });
  return problems.length ? { ok: false, problems: problems.slice(0, MAX_PROBLEMS) } : { ok: true, entries };
}

/** ["industries", 2] → "industries[2]". */
function fieldName(path: readonly PropertyKey[]): string | undefined {
  if (path.length === 0) return undefined;
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : `${i ? "." : ""}${String(p)}`)).join("");
}
