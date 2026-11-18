import { describe, it, expect } from "vitest";
import {
  carryFormatting,
  classifyLine,
  computeStats,
  docLines,
  docToHtml,
  docToText,
  run,
  type ResumeDoc,
} from "../resume.js";
import { sample } from "./fixtures.js";


describe("docToHtml", () => {
  it("escapes text, so model output never becomes markup", () => {
    const doc: ResumeDoc = {
      name: `<img src=x onerror="alert(1)">`,
      contact: "a & b",
      sections: [{ heading: "<script>", lines: [{ kind: "bullet", runs: [run("<b>not bold</b>")] }] }],
    };
    const html = docToHtml(doc);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });

  it("marks every element so the editor can be read back", () => {
    const html = docToHtml(sample);
    for (const kind of ["name", "contact", "heading", "row", "left", "right", "bullets", "text"]) {
      expect(html).toContain(`data-rc="${kind}"`);
    }
    expect(html).toContain("<b>five</b>");
    expect(html).toContain(`data-entry="1"`);
  });
});

describe("docToText", () => {
  it("writes rows as left | right and bullets with •", () => {
    expect(docToText(sample)).toBe(
      [
        "ŁUKASZ NGUYỄN",
        "lukasz@wharton.upenn.edu | (215) 555-0192 | Philadelphia, PA",
        "",
        "EXPERIENCE",
        "BAIN & COMPANY | Boston, MA",
        "Associate Consultant | 2022–2024",
        "• Built a pricing model for a $2B retailer",
        "• Led a team of five analysts",
        "",
        "ADDITIONAL INFORMATION",
        "Skills: Excel, SQL",
      ].join("\n"),
    );
  });
});

describe("the contact block", () => {
  const twoLines: ResumeDoc = { ...sample, contact: "jane@wharton.upenn.edu\nlinkedin.com/in/jane" };

  it("is one editor line per contact line, with the space below the header on the last", () => {
    const html = docToHtml(twoLines);
    const contacts = [...html.matchAll(/<div data-rc="contact" style="([^"]*)">([^<]*)<\/div>/g)];
    expect(contacts.map((m) => m[2])).toEqual(["jane@wharton.upenn.edu", "linkedin.com/in/jane"]);
    expect(contacts.map((m) => m[1]!.includes("margin-bottom"))).toEqual([false, true]);
  });

  it("keeps its lines in order in the text", () => {
    expect(docToText(twoLines).split("\n").slice(0, 3)).toEqual(["ŁUKASZ NGUYỄN", "jane@wharton.upenn.edu", "linkedin.com/in/jane"]);
    expect(docLines({ ...twoLines, contact: "a\n\n b " })).toContain("b");
  });
});

describe("carryFormatting", () => {
  it("keeps the user's formatting on lines whose text didn't change", () => {
    const revised: ResumeDoc = {
      ...sample,
      sections: [
        {
          heading: "EXPERIENCE",
          lines: [
            { kind: "bullet", runs: [run("Led a team of five analysts")] },
            { kind: "bullet", runs: [run("Cut costs by 10%")] },
          ],
        },
      ],
    };
    const carried = carryFormatting(sample, revised);
    expect(carried.sections[0]!.lines[0]).toEqual(sample.sections[0]!.lines[3]);
    expect(carried.sections[0]!.lines[1]).toEqual(revised.sections[0]!.lines[1]);
  });
});

describe("comparing with the original", () => {
  it("tells kept, reworded and new lines apart", () => {
    const original = ["Built a pricing model for a $2B retailer", "Managed client relationships"];
    expect(classifyLine("Built a pricing model for a $2B retailer", original)).toBe("unchanged");
    expect(classifyLine("Built a pricing model that grew a $2B retailer's margin", original)).toBe("modified");
    expect(classifyLine("Presented to the CFO weekly", original)).toBe("added");
  });

  it("counts a new lead verb as reworded", () => {
    expect(classifyLine("Developed pricing strategy for a $2B retailer", ["Worked on pricing strategy for a $2B retailer"])).toBe("modified");
  });

  it("matches a bullet that PDF text split across two lines", () => {
    const original = ["Worked on pricing strategy for a", "$2B consumer retailer", "Other line"];
    expect(classifyLine("Worked on pricing strategy for a $2B consumer retailer", original)).toBe("unchanged");
  });

  it("counts bullets against every original line, since Word text has no bullet characters", () => {
    const original = "BAIN & COMPANY\nBuilt a pricing model for a $2B retailer\nLed a team of five analysts";
    const stats = computeStats(original, sample, "Pricing analyst. Build pricing models in Excel and SQL for retailers.");
    // pricing, analyst(s), model(s), excel, sql, retailer(s); not "build"
    expect(stats).toEqual({ bulletsRewritten: 0, bulletsAdded: 0, keywordsMatched: 6 });
  });

  it("doesn't count common words as keywords", () => {
    const stats = computeStats("", sample, "The candidate will have experience working with the team and company.");
    expect(stats.keywordsMatched).toBe(0);
  });

  it("lists every line", () => {
    expect(docLines(sample)).toContain("BAIN & COMPANY | Boston, MA");
  });
});
