/**
 * exportResume.ts — the PDF and Word downloads, and the page count, in the
 * browser. The layouts are in the tool package: "/pdf" (with jsPDF and the
 * fonts) loads when the page first counts pages, "/docx" only when someone
 * downloads the Word file.
 */

import type { FontSet, FontStyle } from "@penntools/tool-resume-customizer/pdf";
import type { ExportSettings, ResumeDoc, ResumeFont } from "@penntools/tool-resume-customizer/resume";

/**
 * The PDF's font files, bundled from the tool package. Each URL is written out
 * so the bundler can find and copy the file.
 */
function fontUrls(font: ResumeFont): Record<FontStyle, URL> {
  if (font === "sans") {
    return {
      regular: new URL("@penntools/tool-resume-customizer/fonts/LiberationSans-Regular.ttf", import.meta.url),
      bold: new URL("@penntools/tool-resume-customizer/fonts/LiberationSans-Bold.ttf", import.meta.url),
      italic: new URL("@penntools/tool-resume-customizer/fonts/LiberationSans-Italic.ttf", import.meta.url),
      boldItalic: new URL("@penntools/tool-resume-customizer/fonts/LiberationSans-BoldItalic.ttf", import.meta.url),
    };
  }
  return {
    regular: new URL("@penntools/tool-resume-customizer/fonts/LiberationSerif-Regular.ttf", import.meta.url),
    bold: new URL("@penntools/tool-resume-customizer/fonts/LiberationSerif-Bold.ttf", import.meta.url),
    italic: new URL("@penntools/tool-resume-customizer/fonts/LiberationSerif-Italic.ttf", import.meta.url),
    boldItalic: new URL("@penntools/tool-resume-customizer/fonts/LiberationSerif-BoldItalic.ttf", import.meta.url),
  };
}

const fontCache = new Map<ResumeFont, Promise<FontSet>>();

function loadFonts(font: ResumeFont): Promise<FontSet> {
  let fonts = fontCache.get(font);
  if (!fonts) {
    const urls = fontUrls(font);
    const load = async (style: FontStyle) => {
      const res = await fetch(urls[style]);
      if (!res.ok) throw new Error(`Couldn't load the PDF's font (HTTP ${res.status}).`);
      return res.arrayBuffer();
    };
    fonts = Promise.all([load("regular"), load("bold"), load("italic"), load("boldItalic")]).then(
      ([regular, bold, italic, boldItalic]) => ({ regular, bold, italic, boldItalic }),
    );
    // A failed load is retried next time rather than cached.
    fonts.catch(() => fontCache.delete(font));
    fontCache.set(font, fonts);
  }
  return fonts;
}

/** "JANE Q. DOE" → "Jane-Q-Doe-Resume". */
function baseName(doc: ResumeDoc): string {
  const name = doc.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("-");
  return name ? `${name}-Resume` : "Resume";
}

function download(bytes: ArrayBuffer, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** How many pages the PDF would have. */
export async function countPages(doc: ResumeDoc, settings: ExportSettings): Promise<number> {
  const [{ countPdfPages }, fonts] = await Promise.all([import("@penntools/tool-resume-customizer/pdf"), loadFonts(settings.font)]);
  return countPdfPages(doc, settings, fonts);
}

export async function downloadPdf(doc: ResumeDoc, settings: ExportSettings): Promise<void> {
  const [{ toPdf }, fonts] = await Promise.all([import("@penntools/tool-resume-customizer/pdf"), loadFonts(settings.font)]);
  download(toPdf(doc, settings, fonts).bytes, `${baseName(doc)}.pdf`, "application/pdf");
}

export async function downloadDocx(doc: ResumeDoc, settings: ExportSettings): Promise<void> {
  const { toDocx } = await import("@penntools/tool-resume-customizer/docx");
  download(
    await toDocx(doc, settings),
    `${baseName(doc)}.docx`,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}
