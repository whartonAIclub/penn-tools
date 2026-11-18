// ─────────────────────────────────────────────────────────────────────────────
// The resume as data: what the AI returns, the editor shows, and the PDF and
// Word exports lay out. Nothing here touches the AI API or the DOM, so the
// page imports it from "@penntools/tool-resume-customizer/resume" without
// bundling the AI code.
// ─────────────────────────────────────────────────────────────────────────────

/** A stretch of text in one style. */
export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/**
 * One line of a section. A row has text on the left and right, such as an
 * organization and its location, or a role and its dates; `startsEntry`
 * marks the first row of an entry, which gets space above it.
 */
export type ResumeLine =
  | { kind: "row"; startsEntry: boolean; left: TextRun[]; right: TextRun[] }
  | { kind: "bullet"; runs: TextRun[] }
  | { kind: "text"; runs: TextRun[] };

/** A section, such as EXPERIENCE. The heading is "" for lines above the first heading. */
export interface ResumeSection {
  heading: string;
  lines: ResumeLine[];
}

export interface ResumeDoc {
  name: string;
  /** One or more lines under the name, separated by "\n" (contactLines). */
  contact: string;
  sections: ResumeSection[];
}

// ── Limits ────────────────────────────────────────────────────────────────────
// Checked on the page, so users see them, and again on the server (the
// tailoring route and the chat's server action). They keep a request well
// under the route's MAX_TAILOR_BYTES and the 1 MB server action limit, and its
// cost reasonable: a generation at these limits is about 20k input tokens.

export const LIMITS = {
  /** The base resume's text, in characters (a dense two-page resume is about 7,000). */
  resume: 20_000,
  jobDescription: 15_000,
  /** All context files together; the page sends the first this-many characters. */
  context: 40_000,
  /** Context files sent; the page sends the first this-many. */
  files: 50,
  /** A context file's name, as sent; the page shortens longer ones. */
  fileName: 200,
  /** Sections, and lines in one section, of a resume sent for a chat edit. */
  sections: 30,
  sectionLines: 200,
  /** One chat message from the user. */
  chatMessage: 2_000,
  /** Chat messages sent with each request: the latest few turns. */
  chatHistory: 6,
} as const;

/** What a file the user uploads is: their resume, or context for tailoring it. */
export const FILE_TAGS = ["Resume", "Cover Letter", "Project", "Writing Sample", "Other"] as const;
export type FileTag = (typeof FILE_TAGS)[number];

/** A context file as the page sends it for tailoring. */
export interface ContextFile {
  name: string;
  tag: FileTag;
  text: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// ── Export settings ───────────────────────────────────────────────────────────

export const RESUME_FONTS = ["serif", "sans"] as const;
export type ResumeFont = (typeof RESUME_FONTS)[number];

/**
 * What each font is called in Word, which supplies it there. The PDF embeds
 * Liberation Serif and Sans, which have the same letter widths, so a line
 * breaks in the same place in both.
 */
export const FONT_NAMES: Record<ResumeFont, string> = {
  serif: "Times New Roman",
  sans: "Arial",
};

/**
 * The names the page registers this package's Liberation fonts under (with
 * the FontFace API), so the editor shows the PDF's own fonts on any computer.
 */
export const EDITOR_FONT_FAMILIES: Record<ResumeFont, string> = {
  serif: "Resume Customizer Serif",
  sans: "Resume Customizer Sans",
};

/**
 * CSS for the editor, so it breaks lines where the exports do: the PDF's own
 * fonts first, then the system fonts with the same letter widths while they
 * load.
 */
export const FONT_CSS: Record<ResumeFont, string> = {
  serif: `'${EDITOR_FONT_FAMILIES.serif}', 'Times New Roman', 'Liberation Serif', Tinos, Times, serif`,
  sans: `'${EDITOR_FONT_FAMILIES.sans}', Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif`,
};

export const FONT_SIZES = [10, 10.5, 11, 11.5, 12] as const;
export const MARGINS_IN = [0.5, 0.75, 1] as const;

export interface ExportSettings {
  font: ResumeFont;
  sizePt: number;
  marginIn: number;
}

/** A US Letter page in points, as both exports lay it out. */
export const LETTER_POINTS = { width: 612, height: 792 } as const;

export const DEFAULT_SETTINGS: ExportSettings ={ font: "serif", sizePt: 11, marginIn: 0.75 };

/**
 * Layout shared by the editor and both exports, in ems of the body text, so
 * what's on screen is what's exported.
 */
export const LAYOUT = {
  lineHeight: 1.25,
  nameSize: 1.3,
  contactSize: 0.9,
  /** Space below the contact line. */
  afterContact: 0.6,
  /** Space above a section heading. */
  beforeHeading: 0.8,
  afterHeading: 0.15,
  /** Space above the first row of an entry. */
  beforeEntry: 0.35,
  /** Where bullet text starts, from the left margin. */
  bulletIndent: 1.3,
  /** Where the bullet sits, from the left margin. */
  bulletMarker: 0.35,
} as const;

// ── Building and reading ──────────────────────────────────────────────────────

export function run(text: string, style: Partial<Omit<TextRun, "text">> = {}): TextRun {
  return { text, bold: style.bold ?? false, italic: style.italic ?? false, underline: style.underline ?? false };
}

/** A count for messages: 20000 → "20,000". */
export function chars(n: number): string {
  return n.toLocaleString("en-US");
}

/** A line without the bullet character it starts with, if any. */
export function stripBullet(line: string): string {
  return line.replace(/^\s*[•●▪◦\-*]\s*/, "");
}

function runsText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join("");
}

/** A line as plain text: a row is "left | right". */
function lineText(line: ResumeLine): string {
  if (line.kind === "row") {
    const left = runsText(line.left).trim();
    const right = runsText(line.right).trim();
    return left && right ? `${left} | ${right}` : left || right;
  }
  return runsText(line.runs).trim();
}

/** The contact block's lines that have text. */
export function contactLines(doc: ResumeDoc): string[] {
  return doc.contact
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Every line's text, headings included, without blanks. */
export function docLines(doc: ResumeDoc): string[] {
  const lines = [doc.name, ...contactLines(doc)];
  for (const section of doc.sections) {
    lines.push(section.heading);
    for (const line of section.lines) lines.push(lineText(line));
  }
  return lines.map((l) => l.trim()).filter(Boolean);
}

/** The resume as plain text: for copying, and for sending to the AI. */
export function docToText(doc: ResumeDoc): string {
  const header = [doc.name, ...contactLines(doc)].filter((s) => s.trim()).join("\n");
  const parts = header ? [header] : [];
  for (const section of doc.sections) {
    const lines = section.lines.map((line) => (line.kind === "bullet" ? `• ${lineText(line)}` : lineText(line)));
    parts.push([section.heading, ...lines].filter((s) => s.trim()).join("\n"));
  }
  return parts.join("\n\n");
}

/**
 * Why an edited resume is too large to send for a chat edit, or null. The
 * page checks before sending, and the server action again.
 */
export function resumeSizeProblem(doc: ResumeDoc): string | null {
  if (doc.sections.length > LIMITS.sections) {
    return `Your resume has more than ${LIMITS.sections} sections. Merge some before asking the AI for changes.`;
  }
  if (doc.sections.some((s) => s.lines.length > LIMITS.sectionLines)) {
    return `A section of your resume has more than ${LIMITS.sectionLines} lines. Add headings or shorten it before asking the AI for changes.`;
  }
  if (docToText(doc).length > LIMITS.resume) return `Keep your resume to at most ${chars(LIMITS.resume)} characters.`;
  return null;
}

/** Whether the resume has any text at all. */
export function isEmptyDoc(doc: ResumeDoc): boolean {
  return docLines(doc).length === 0;
}

/**
 * `next` with the formatting the user gave lines in `previous` (bold, italic,
 * underline) kept on lines whose text didn't change. The AI sees and returns
 * plain text, so without this an AI revision would undo the user's formatting.
 */
export function carryFormatting(previous: ResumeDoc, next: ResumeDoc): ResumeDoc {
  const byText = new Map<string, ResumeLine>();
  for (const section of previous.sections) {
    for (const line of section.lines) byText.set(`${line.kind}:${lineText(line)}`, line);
  }
  return {
    ...next,
    sections: next.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => {
        const old = byText.get(`${line.kind}:${lineText(line)}`);
        // The key includes the kind, so `old` is the same kind of line.
        if (!old) return line;
        return line.kind === "row" && old.kind === "row" ? { ...old, startsEntry: line.startsEntry } : old;
      }),
    })),
  };
}

// ── Editor HTML ───────────────────────────────────────────────────────────────
// The editor is a contentEditable element: HTML is how a browser shows
// formatted text you can edit. Every element carries data-rc, so the page can
// read the resume back (editorToDoc in the page's editor.ts); the exports
// never see HTML.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function runsToHtml(runs: TextRun[]): string {
  return runs
    .map((r) => {
      let html = escapeHtml(r.text);
      if (r.underline) html = `<u>${html}</u>`;
      if (r.italic) html = `<i>${html}</i>`;
      if (r.bold) html = `<b>${html}</b>`;
      return html;
    })
    .join("");
}

const em = (n: number) => `${n}em`;

/**
 * A contact line's inline style. The last line has the space below the
 * header, in its own (smaller) ems so it matches the exports' body-text ems.
 * The editor gives the contact lines it makes this style too.
 */
export function contactStyle(last: boolean): string {
  const below = last ? `;margin-bottom:${em(LAYOUT.afterContact / LAYOUT.contactSize)}` : "";
  return `text-align:center;font-size:${em(LAYOUT.contactSize)}${below}`;
}

/**
 * The editor's HTML for a resume. All text is escaped: model output never
 * becomes markup. `highlight` gives a line's background color, if any, from
 * its text (lineText), for showing what changed.
 */
export function docToHtml(doc: ResumeDoc, highlight?: (text: string) => string | undefined): string {
  const L = LAYOUT;
  const bg = (line: ResumeLine) => {
    const color = highlight?.(lineText(line));
    return color ? `background:${escapeHtml(color)};` : "";
  };
  const parts: string[] = [
    `<div data-rc="name" style="text-align:center;font-weight:700;font-size:${em(L.nameSize)}">${escapeHtml(doc.name)}</div>`,
    // One element per contact line (at least one, to type in), with the space
    // below the header on the last.
    ...doc.contact
      .split("\n")
      .map((line, i, all) => `<div data-rc="contact" style="${contactStyle(i === all.length - 1)}">${escapeHtml(line.trim())}</div>`),
  ];
  for (const section of doc.sections) {
    if (section.heading) {
      parts.push(
        `<div data-rc="heading" style="text-align:center;font-weight:700;margin-top:${em(L.beforeHeading)};margin-bottom:${em(L.afterHeading)}">${escapeHtml(section.heading)}</div>`,
      );
    }
    let bullets: string[] = [];
    const flush = () => {
      if (!bullets.length) return;
      parts.push(`<ul data-rc="bullets" style="margin:0;padding-left:${em(L.bulletIndent)}">${bullets.join("")}</ul>`);
      bullets = [];
    };
    for (const line of section.lines) {
      if (line.kind === "bullet") {
        const style = bg(line);
        bullets.push(`<li${style ? ` style="${style}"` : ""}>${runsToHtml(line.runs)}</li>`);
        continue;
      }
      flush();
      if (line.kind === "row") {
        const top = line.startsEntry ? `margin-top:${em(L.beforeEntry)};` : "";
        parts.push(
          `<div data-rc="row"${line.startsEntry ? ' data-entry="1"' : ""} style="${top}${bg(line)}display:flex;justify-content:space-between;gap:1em">` +
            `<span data-rc="left" style="flex:1;min-width:0">${runsToHtml(line.left)}</span>` +
            // As in the PDF: the right side wraps only past half the line, and the left takes the rest.
            `<span data-rc="right" style="flex:none;max-width:50%;text-align:right">${runsToHtml(line.right)}</span></div>`,
        );
      } else {
        const style = bg(line);
        parts.push(`<div data-rc="text"${style ? ` style="${style}"` : ""}>${runsToHtml(line.runs)}</div>`);
      }
    }
    flush();
  }
  return parts.join("");
}

// ── Comparing with the original ───────────────────────────────────────────────

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean);
}

/** How alike two lines are, from 0 to 1: shared words over all words. */
function wordSim(a: string, b: string): number {
  const sa = new Set(words(a));
  const sb = new Set(words(b));
  if (!sa.size && !sb.size) return 1;
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  sa.forEach((w) => {
    if (sb.has(w)) shared++;
  });
  return shared / (sa.size + sb.size - shared);
}

type LineChange = "added" | "modified" | "unchanged";

function bestSim(line: string, others: string[]): number {
  return others.reduce((best, other) => Math.max(best, wordSim(line, other)), 0);
}

/**
 * Whether a line of the tailored resume is new, reworded or kept from
 * `original`'s lines. Only near-identical wording counts as kept: changing a
 * bullet's lead verb is exactly the rewording tailoring does. Adjacent lines
 * are also compared joined, since text from a PDF splits wrapped bullets.
 */
export function classifyLine(line: string, original: string[]): LineChange {
  const joined = original.slice(1).map((l, i) => `${original[i]} ${l}`);
  const best = Math.max(bestSim(line, original), bestSim(line, joined));
  if (best >= 0.9) return "unchanged";
  if (best > 0.2) return "modified";
  return "added";
}

/** Whether a line of the original was dropped from the tailored resume's lines. */
export function isRemovedLine(line: string, tailored: string[]): boolean {
  return bestSim(line, tailored) <= 0.2;
}

/** Lines of extracted text, trimmed, without blanks or bullet characters. */
export function textLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => stripBullet(l).trim())
    .filter(Boolean);
}

// Common English and job-posting words that say nothing about the role.
const STOPWORDS = new Set(
  (
    "about above across after again against all also among an and any are aren around as at be because been before being below between big both but by can could did do does doing down during each either else ever every few for from further get got had has have having he her here hers him his how if in into is it its itself just key least less let like made make many may me might more most much must my need new no nor not now of off often old on once one only or other our ours out over own per please put rather run same see set she should since so some such than that the their them then there these they this those though through thus to too top two under until up upon us use very via was way we well were what when where whether which while who whom whose why will with within without would yes yet you your yours " +
    "ability able candidate candidates company including include includes job looking opportunity position preferred qualifications required requirements responsibilities role strong team work working years year experience plus etc"
  ).split(" "),
);

/** A word without a plural "s", so "models" matches "model". */
function stem(word: string): string {
  return word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/** The job description's distinctive words, stemmed: three letters or more (SQL counts), not stopwords. */
function jobKeywords(jobDescription: string): Set<string> {
  return new Set(
    words(jobDescription)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
      .map(stem),
  );
}

interface ResumeStats {
  /** Bullets reworded from the original. */
  bulletsRewritten: number;
  /** Bullets with no counterpart in the original. */
  bulletsAdded: number;
  /** The job description's keywords that the resume uses. */
  keywordsMatched: number;
}

/**
 * What tailoring changed. Bullets are compared with every line of the
 * original, since text extracted from Word files loses its bullet characters.
 */
export function computeStats(originalText: string, doc: ResumeDoc, jobDescription: string): ResumeStats {
  const original = textLines(originalText);
  let bulletsRewritten = 0;
  let bulletsAdded = 0;
  for (const section of doc.sections) {
    for (const line of section.lines) {
      if (line.kind !== "bullet") continue;
      const change = classifyLine(lineText(line), original);
      if (change === "modified") bulletsRewritten++;
      if (change === "added") bulletsAdded++;
    }
  }
  const resumeWords = new Set(words(docLines(doc).join(" ")).map(stem));
  let keywordsMatched = 0;
  jobKeywords(jobDescription).forEach((w) => {
    if (resumeWords.has(w)) keywordsMatched++;
  });
  return { bulletsRewritten, bulletsAdded, keywordsMatched };
}
