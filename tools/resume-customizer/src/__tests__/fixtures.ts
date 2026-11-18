// A resume the tests share: non-Latin letters, rows, bullets with mixed styles, and a labelled line.

import { run, type ResumeDoc } from "../resume.js";

export const sample: ResumeDoc = {
  name: "ŁUKASZ NGUYỄN",
  contact: "lukasz@wharton.upenn.edu | (215) 555-0192 | Philadelphia, PA",
  sections: [
    {
      heading: "EXPERIENCE",
      lines: [
        { kind: "row", startsEntry: true, left: [run("BAIN & COMPANY", { bold: true })], right: [run("Boston, MA", { bold: true })] },
        { kind: "row", startsEntry: false, left: [run("Associate Consultant", { italic: true })], right: [run("2022–2024", { bold: true })] },
        { kind: "bullet", runs: [run("Built a pricing model for a $2B retailer")] },
        { kind: "bullet", runs: [run("Led a team of "), run("five", { bold: true }), run(" analysts")] },
      ],
    },
    {
      heading: "ADDITIONAL INFORMATION",
      lines: [{ kind: "text", runs: [run("Skills:", { bold: true }), run(" Excel, SQL")] }],
    },
  ],
};
