// Reads one course from the Path@Penn details panel a student pastes. Simple
// text matching: only what's in the text is filled in, and anything missing is
// left empty for the student (never guessed).

import { checkEligibility, isGraduateLevel, isWharton } from "./eligibility.js";
import type { Course, CrossListing, Format } from "./flow.js";

/** The course details read from the text, before it joins the student's list. */
export type CourseDetails = Omit<Course, "id" | "picked" | "permission" | "contact" | "contactSource">;

/** A new entry in the student's list. Picked by default when it counts. */
export function newCourse(details: CourseDetails, id: string): Course {
  return {
    ...details,
    id,
    // The department contact list (P1) will fill in more of these later.
    contact: details.email,
    contactSource: details.email ? "details" : "none",
    picked: checkEligibility(details).result === "counts",
    permission: "not-sent",
  };
}

/** A department and course number, with an optional section: "CLST 3324" or "DSGN 5100-001". */
const COURSE_CODE = /\b([A-Z]{2,5})\s*(\d{4})(?:-(\d{3}))?\b/;

/** Reads the first course in the text, or null when there's no course code. */
export function parseCourse(text: string): CourseDetails | null {
  const match = text.match(COURSE_CODE);
  if (!match) return null;
  const [found, dept = "", number = "", codeSection] = match;

  return {
    dept,
    number,
    section: codeSection ?? text.match(/Section\s+(\d{3})\b/i)?.[1] ?? "",
    title: readTitle(text, found),
    format: readFormat(text.match(/Instruction Method:\s*([^\n]+)/i)?.[1] ?? ""),
    instructor: text.match(/Instructors?:\s*([^\n]+)/i)?.[1]?.trim() ?? "",
    email: text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? "",
    crossListing: readCrossListing(text),
  };
}

/**
 * Codes of other courses in the text besides the first one, e.g. ["CLST 3324"]
 * when two courses were pasted. Only counts a code at the start of a line, so a
 * "Scheduled With CHIN 5233" cross-listing isn't mistaken for another course.
 */
export function otherCourseCodes(text: string): string[] {
  const codes: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^([A-Z]{2,5})\s*(\d{4})\b/);
    if (m) codes.push(`${m[1]} ${m[2]}`);
  }
  const first = text.match(COURSE_CODE);
  const firstCode = first ? `${first[1]} ${first[2]}` : "";
  return [...new Set(codes)].filter((c) => c !== firstCode);
}

/** The labelled fields of the details panel, which come after the title. */
const PANEL_FIELD =
  /^(Section Status|Schedule Type|Instruction Method|Campus|Credit|Scheduled With|Maximum Enrollment|Seats Avail|Instructors?|Meets?|Meeting Times?|Location|Notes?)\b/i;

/**
 * The text after the code on its line. Otherwise the first line below the code
 * that isn't the section line ("Section 680, CRN 23190") or a date or time,
 * looking only above the panel's labelled fields.
 */
function readTitle(text: string, code: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const at = lines.findIndex((l) => l.includes(code));
  const line = lines[at] ?? "";
  const sameLine = line.slice(line.indexOf(code) + code.length).replace(/^[\s·:–-]+/, "").trim();
  if (sameLine) return sameLine;

  for (const next of lines.slice(at + 1)) {
    if (PANEL_FIELD.test(next)) break;
    if (/^section\b/i.test(next)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(next) || /^\d{1,2}:\d{2}/.test(next)) continue;
    return next;
  }
  return "Untitled course";
}

/** Turns the "Instruction Method:" value into a format, or null when it's missing or unclear. */
export function readFormat(method: string): Format | null {
  const m = method.toLowerCase();
  if (m.includes("asynch") || m.includes("recorded")) return "Online, recorded";
  if (m.includes("online") || m.includes("synch") || m.includes("remote")) return "Online, live";
  if (m.includes("class") || m.includes("person") || m.includes("hybrid")) return "In class";
  return null;
}

/**
 * Reads "Scheduled With CLST 5324, section 401". When there are several,
 * prefers the one at the graduate level outside Wharton.
 */
function readCrossListing(text: string): CrossListing | null {
  const listings: CrossListing[] = [];
  for (const m of text.matchAll(/Scheduled With\s+([A-Z]{2,5})\s*(\d{4})(?:,?\s*section\s*(\d{3}))?/gi)) {
    listings.push({ dept: (m[1] ?? "").toUpperCase(), number: m[2] ?? "", section: m[3] ?? "" });
  }
  return listings.find((l) => isGraduateLevel(l.number) && !isWharton(l.dept)) ?? listings[0] ?? null;
}

type Listing = { dept: string; number: string; section: string };

function sameListing(a: Listing, b: Listing): boolean {
  return a.dept === b.dept && a.number === b.number && a.section === b.section;
}

/** A cross-listing without its own section takes the course's section (as switching does). */
function crossOf(course: CourseDetails): Listing | null {
  const cross = course.crossListing;
  return cross ? { ...cross, section: cross.section || course.section } : null;
}

/**
 * The course already in the list that this one repeats: the same course number
 * and section, or the same class under its other listing (e.g. CHIN 0233-680
 * when CHIN 5233-680 was added by switching).
 */
export function findDuplicate(courses: readonly Course[], details: CourseDetails): Course | undefined {
  const newCross = crossOf(details);
  return courses.find((c) => {
    const oldCross = crossOf(c);
    return (
      sameListing(c, details) ||
      (oldCross !== null && sameListing(oldCross, details)) ||
      (newCross !== null && sameListing(c, newCross))
    );
  });
}
