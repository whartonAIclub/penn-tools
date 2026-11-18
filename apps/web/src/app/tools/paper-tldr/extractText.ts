// Browser-side text extraction from a PDF, with pdfjs-dist (already a web app
// dependency). Runs only in "use client" code.

import { MAX_PAPER_CHARS } from "@penntools/tool-paper-tldr/limits";

export interface ExtractedPaper {
  text: string;
  /** Pages read, and the PDF's total; fewer when the text reached MAX_PAPER_CHARS first. */
  pagesRead: number;
  totalPages: number;
}

/** The parts of a pdf.js text item used here. */
interface Item {
  str: string;
  hasEOL: boolean;
  width: number;
  transform: number[];
}

export async function extractPdfText(file: File): Promise<ExtractedPaper> {
  const pdfjs = await import("pdfjs-dist");
  // The worker is bundled with the app, as AskPenn does, rather than loaded from a CDN.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.js", import.meta.url).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    let length = 0;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Items without `str` are marked-content markers, with no text.
      const text = pageText(content.items.filter((item) => "str" in item) as Item[]);
      page.cleanup();
      pages.push(text);
      length += text.length + 2;
      // The server cuts the text at MAX_PAPER_CHARS anyway, so stop reading there.
      if (length >= MAX_PAPER_CHARS) break;
    }

    return { text: pages.join("\n\n"), pagesRead: pages.length, totalPages: pdf.numPages };
  } finally {
    // Frees the PDF and its worker; otherwise every paper stays in memory until the tab reloads.
    await task.destroy();
  }
}

/**
 * One page's text. pdf.js often splits a word across items (a style change, a
 * ligature, a superscript), so a space goes in only where there's a visible
 * gap between one item's end and the next one's start, or the next one starts
 * on another line. That keeps "significant" and "0.05" whole.
 */
function pageText(items: Item[]): string {
  const lines: string[] = [];
  let line = "";
  let prev: Item | null = null;

  for (const item of items) {
    if (prev && !prev.hasEOL && item.str && needsSpace(prev, item, line)) line += " ";
    line += item.str;
    if (item.hasEOL) {
      lines.push(line.trim());
      line = "";
    }
    prev = item;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.filter(Boolean).join("\n");
}

function needsSpace(prev: Item, item: Item, line: string): boolean {
  if (!line || line.endsWith(" ") || item.str.startsWith(" ")) return false;
  const [, , , prevSize = 0, prevX = 0, prevY = 0] = prev.transform;
  const [, , , size = 0, x = 0, y = 0] = item.transform;
  const fontSize = Math.max(Math.abs(prevSize), Math.abs(size), 1);
  // On another line (no hasEOL between them): treat it as a word break.
  if (Math.abs(y - prevY) > fontSize * 0.5) return true;
  // Same line: a gap of more than about a sixth of the font size is a space.
  return x - (prevX + prev.width) > fontSize * 0.15;
}
