// The individualized major proposal as a Word document, in the order Wharton
// asks for: title, theme, course plan, and how each course aligns with the
// theme. Only the student's own text goes in; Claude's suggestions never do.

import type { Catalog } from "./courses.js";
import { departmentName } from "./courses.js";
import { createDocx, type DocxBlock } from "./docx.js";
import {
  creditsOf,
  INDIVIDUALIZED_MAX_CREDITS,
  planCourses,
  totalCredits,
  type IndividualizedDraft,
} from "./individualized.js";

function formatCredits(credits: number): string {
  return `${credits} CU`;
}

/** The proposal's contents, as blocks (also what the tests check). */
export function proposalBlocks(draft: IndividualizedDraft, catalog: Catalog, preparedOn: string): DocxBlock[] {
  const plan = planCourses(draft, catalog.courses);
  const credits = totalCredits(plan);

  const blocks: DocxBlock[] = [
    { type: "title", text: draft.title.trim() },
    { type: "subtitle", text: "Individualized Major Proposal · Wharton MBA" },
    { type: "heading", level: 1, text: "Theme" },
    { type: "paragraph", text: draft.theme.trim() },
    { type: "heading", level: 1, text: "Course plan" },
    {
      type: "table",
      rows: [
        ["Course", "Title", "Department", "Credits"],
        ...plan.map((c) => [c.code, c.title, departmentName(c.department), formatCredits(creditsOf(c))]),
      ],
    },
    {
      type: "paragraph",
      bold: true,
      text: `Total: ${formatCredits(credits)} (maximum ${formatCredits(INDIVIDUALIZED_MAX_CREDITS)})`,
    },
    { type: "heading", level: 1, text: "How the courses align with the theme" },
  ];

  for (const course of plan) {
    blocks.push(
      { type: "heading", level: 2, text: `${course.code}: ${course.title}` },
      { type: "paragraph", text: (draft.alignments[course.code] ?? "").trim() },
    );
  }

  blocks.push({
    type: "paragraph",
    italic: true,
    text: `Prepared on ${preparedOn} from the ${catalog.termLabel} course list.`,
  });
  return blocks;
}

/** The proposal as the bytes of a .docx file. `preparedOn` is a date to print, e.g. "November 10, 2026". */
export function proposalDocx(draft: IndividualizedDraft, catalog: Catalog, preparedOn: string): Uint8Array<ArrayBuffer> {
  return createDocx(proposalBlocks(draft, catalog, preparedOn));
}

/** A file name from the major's title, e.g. "Healthcare Operations - Proposal.docx". */
export function proposalFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${cleaned || "Individualized Major"} - Proposal.docx`;
}
