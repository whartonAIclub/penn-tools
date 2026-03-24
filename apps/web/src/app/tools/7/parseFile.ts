/**
 * parseFile.ts — browser-side text extraction from uploaded files.
 * Supports PDF, DOCX, PPTX/PPT, and plain text.
 * Uses dynamic imports so parsers are only loaded when needed.
 */

export interface UploadedFile {
  id: string;
  name: string;
  tag: string;
  text: string;   // plain text sent to the LLM
  html?: string;  // HTML (DOCX only) used for richer in-app preview
  date: string;
}

/** Extract text (and optional HTML) from a File. */
export async function parseFile(file: File): Promise<{ text: string; html?: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  try {
    if (ext === "pdf")  return { text: cleanResumeText(await parsePDF(file)) };
    if (ext === "docx") return await parseDocx(file);
    if (ext === "pptx" || ext === "ppt") return { text: await parsePptx(file) };
    return { text: await readAsText(file) };
  } catch (err) {
    console.error("parseFile error:", err);
    return { text: `[Could not parse ${file.name} — paste the content manually]` };
  }
}

// ── Text cleaning ─────────────────────────────────────────────────────────────

const SECTION_KEYWORDS = [
  "EDUCATION", "EXPERIENCE", "WORK EXPERIENCE", "PROFESSIONAL EXPERIENCE",
  "EMPLOYMENT", "SKILLS", "TECHNICAL SKILLS", "CORE COMPETENCIES",
  "PROJECTS", "LEADERSHIP", "ACTIVITIES", "EXTRACURRICULAR",
  "VOLUNTEER", "VOLUNTEERING", "CERTIFICATIONS", "LICENSES",
  "PUBLICATIONS", "RESEARCH", "AWARDS", "HONORS", "HONORS & AWARDS",
  "SUMMARY", "PROFILE", "OBJECTIVE", "ADDITIONAL", "ADDITIONAL INFORMATION",
  "LANGUAGES", "INTERESTS", "HOBBIES", "AFFILIATIONS", "INVOLVEMENT",
  "COURSEWORK", "TEACHING", "REFERENCES",
];

// Detects a line that looks like a section header:
// pure ALL-CAPS, optionally ending in ":" or "&"
function isSectionHeader(line: string): boolean {
  const t = line.trim().replace(/:$/, "").trim();
  if (t.length < 3) return false;
  // Matches known headers or any ALL-CAPS-only line (letters, spaces, &, /)
  return (
    SECTION_KEYWORDS.includes(t.toUpperCase()) ||
    /^[A-Z][A-Z\s&\/\-]{2,}$/.test(t)
  );
}

/**
 * Post-process raw PDF text to restore readable resume structure.
 *
 * Fixes:
 *  1. Bullet point characters that lost their spacing
 *  2. Section headers — surrounds them with blank lines
 *  3. Right-aligned dates/locations merged onto the same line — adds " | " separator
 *  4. Excessive blank lines (collapsed to single blank)
 *  5. Trailing whitespace on every line
 */
export function cleanResumeText(rawText: string): string {
  // --- Step 1: normalize line endings and trim each line ---
  let lines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(l => l.trimEnd());

  // --- Step 2: normalize bullet characters ---
  // Some PDFs produce ● ▪ ▸ → ◦ as separate tokens; normalise to "• "
  const BULLET_RE = /^[\s]*[●▪▸→◦•]\s*/;
  const DASH_BULLET_RE = /^(\s{2,}|\t)[-–]\s+/;  // indented dashes
  lines = lines.map(l => {
    if (BULLET_RE.test(l))      return "  • " + l.replace(BULLET_RE, "").trimStart();
    if (DASH_BULLET_RE.test(l)) return "  • " + l.replace(DASH_BULLET_RE, "").trimStart();
    return l;
  });

  // --- Step 3: detect right-column content merged onto the same line ---
  // Pattern: a line ends with a US-city+state or a date range, with a large
  // apparent gap (no bullet, not a header).  We insert " | " as a separator
  // so the structure is clear to both humans and the LLM.
  const LOCATION_TAIL =
    /^(.+?)\s{3,}([A-Z][a-zA-Z .]+,\s*[A-Z]{2}(?:\s|$).*)$/;
  const DATE_TAIL =
    /^(.+?)\s{3,}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}.*)$/i;
  const YEAR_RANGE_TAIL =
    /^(.+?)\s{3,}(\d{4}\s*[–\-]\s*(?:\d{4}|Present|Current|Now).*)$/i;
  const SEASON_TAIL =
    /^(.+?)\s{3,}((?:Summer|Fall|Spring|Winter)\s+\d{4}.*)$/i;

  lines = lines.map(l => {
    if (l.startsWith("  •") || isSectionHeader(l)) return l;
    for (const re of [LOCATION_TAIL, DATE_TAIL, YEAR_RANGE_TAIL, SEASON_TAIL]) {
      const m = l.match(re);
      if (m) return `${m[1]!.trimEnd()} | ${m[2]!.trimStart()}`;
    }
    return l;
  });

  // --- Step 4: ensure blank lines around section headers ---
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isSectionHeader(line)) {
      // add blank line before (if previous line is not already blank)
      if (result.length > 0 && result[result.length - 1] !== "") {
        result.push("");
      }
      result.push(line);
      // add blank line after
      result.push("");
    } else {
      result.push(line);
    }
  }

  // --- Step 5: collapse runs of 3+ blank lines to 1 ---
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of result) {
    if (line === "") {
      blankRun++;
      if (blankRun <= 1) collapsed.push(line);
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }

  return collapsed.join("\n").trim();
}

/**
 * Parse cleaned resume text into broad sections for structured downstream use.
 * Returns arrays of non-empty lines per section bucket.
 */
export function parseResumeToStructuredData(rawText: string): {
  contact:    string[];
  education:  string[];
  experience: string[];
  skills:     string[];
  other:      string[];
} {
  const text   = cleanResumeText(rawText);
  const lines  = text.split("\n");
  const out    = { contact: [] as string[], education: [] as string[], experience: [] as string[], skills: [] as string[], other: [] as string[] };

  // The first non-blank lines before the first section header are contact info
  type Bucket = keyof typeof out;
  let bucket: Bucket = "contact";
  let seenFirstHeader = false;

  const classify = (header: string): Bucket => {
    const h = header.toUpperCase();
    if (/EDUCATION|ACADEMIC/.test(h))                      return "education";
    if (/EXPERIENCE|EMPLOYMENT|WORK/.test(h))              return "experience";
    if (/SKILL|TECHNICAL|COMPETENC|TOOL|LANGUAGE/.test(h)) return "skills";
    return "other";
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (isSectionHeader(t)) {
      seenFirstHeader = true;
      bucket = classify(t);
      continue;
    }
    if (!seenFirstHeader) {
      out.contact.push(t);
    } else {
      out[bucket].push(t);
    }
  }

  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── PDF (pdfjs-dist v3) ──────────────────────────────────────────────────────

async function parsePDF(file: File): Promise<string> {
  const arrayBuffer = await readAsArrayBuffer(file);
  const pdfjsLib = await import("pdfjs-dist");
  // Use CDN worker for pdfjs-dist v3.11
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Each item has a transform matrix: [scaleX, skewX, skewY, scaleY, x, y]
    // We group items that share the same y-coordinate into a single line,
    // then sort lines top-to-bottom (PDF y-axis is bottom-up, so higher y = higher on page).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = content.items as Array<{ str: string; transform: number[] }>;

    // Sort: descending y (top of page first), then ascending x (left to right)
    const sorted = [...items].sort((a, b) => {
      const dy = (b.transform[5] ?? 0) - (a.transform[5] ?? 0);
      if (Math.abs(dy) > 2) return dy;
      return (a.transform[4] ?? 0) - (b.transform[4] ?? 0);
    });

    // Group into text lines by y proximity (within 3 pts = same line)
    const lines: string[] = [];
    let lineTokens: string[] = [];
    let lastY: number = sorted[0]?.transform[5] ?? 0;

    for (const item of sorted) {
      if (!item.str) continue;
      const y: number = item.transform[5] ?? lastY;
      if (Math.abs(y - lastY) > 3 && lineTokens.length > 0) {
        lines.push(lineTokens.join(" ").trim());
        lineTokens = [];
        lastY = y;
      }
      lineTokens.push(item.str);
    }
    if (lineTokens.length > 0) lines.push(lineTokens.join(" ").trim());

    pages.push(lines.filter(Boolean).join("\n"));
  }

  return pages.filter(Boolean).join("\n\n");
}

// ── DOCX (mammoth) ───────────────────────────────────────────────────────────

async function parseDocx(file: File): Promise<{ text: string; html: string }> {
  const arrayBuffer = await readAsArrayBuffer(file);
  const mammoth     = await import("mammoth");
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer }),
  ]);
  return { text: textResult.value, html: htmlResult.value };
}

// ── PPTX/PPT (jszip + XML parsing) ──────────────────────────────────────────

async function parsePptx(file: File): Promise<string> {
  const arrayBuffer = await readAsArrayBuffer(file);
  const JSZip       = (await import("jszip")).default;
  const zip         = await JSZip.loadAsync(arrayBuffer);

  const slideNames = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? "0");
      const numB = parseInt(b.match(/\d+/)?.[0] ?? "0");
      return numA - numB;
    });

  const slideTexts: string[] = [];
  for (const slideName of slideNames) {
    const xml     = await zip.files[slideName]!.async("text");
    const matches = Array.from(xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g));
    const text    = matches.map(m => m[1]).join(" ").trim();
    if (text) slideTexts.push(text);
  }
  return slideTexts.join("\n\n");
}
