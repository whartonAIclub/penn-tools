/**
 * exportResume.ts — the PDF and Word downloads, the page count, and the
 * editor's fonts, in the browser. The layouts are in the tool package: "/pdf"
 * (with jsPDF) loads when the page first counts pages, "/docx" only when
 * someone downloads the Word file.
 */

import type { FontSet, FontStyle } from "@penntools/tool-resume-customizer/pdf";
import { EDITOR_FONT_FAMILIES, type ExportSettings, type ResumeDoc, type ResumeFont } from "@penntools/tool-resume-customizer/resume";

/**
 * The font files, bundled from the tool package's fonts/ folder. Each URL is
 * written out so the bundler can find and copy the file; the package's export
 * tests list the same files.
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

const STYLES: FontStyle[] = ["regular", "bold", "italic", "boldItalic"];

/** Each font file, fetched once, when first needed. */
const fileCache = new Map<string, Promise<ArrayBuffer>>();

function loadFont(font: ResumeFont, style: FontStyle): Promise<ArrayBuffer> {
  const key = `${font}:${style}`;
  let file = fileCache.get(key);
  if (!file) {
    // force-cache: the editor's FontFace may have downloaded the file already.
    file = fetch(fontUrls(font)[style], { cache: "force-cache" }).then((res) => {
      if (!res.ok) throw new Error(`Couldn't load the PDF's font (HTTP ${res.status}).`);
      return res.arrayBuffer();
    });
    // A failed load is retried next time rather than cached.
    file.catch(() => fileCache.delete(key));
    fileCache.set(key, file);
  }
  return file;
}

/** The fonts `styles` names, in the settings' font. */
async function loadFonts(font: ResumeFont, styles: Iterable<FontStyle>): Promise<FontSet> {
  const wanted = [...styles];
  const files = await Promise.all(wanted.map((style) => loadFont(font, style)));
  return Object.fromEntries(wanted.map((style, i) => [style, files[i]]));
}

let editorFontsRegistered = false;

/**
 * Registers the PDF's fonts with the browser under EDITOR_FONT_FAMILIES, which
 * FONT_CSS names first, so the editor shows exactly the PDF's letters and line
 * breaks on any computer. The browser downloads a file only when the page
 * first shows text in it.
 */
export function registerEditorFonts(): void {
  if (editorFontsRegistered || typeof FontFace === "undefined") return;
  editorFontsRegistered = true;
  for (const font of Object.keys(EDITOR_FONT_FAMILIES) as ResumeFont[]) {
    const urls = fontUrls(font);
    for (const style of STYLES) {
      const face = new FontFace(EDITOR_FONT_FAMILIES[font], `url("${urls[style].href}")`, {
        weight: style === "bold" || style === "boldItalic" ? "700" : "400",
        style: style === "italic" || style === "boldItalic" ? "italic" : "normal",
      });
      document.fonts.add(face);
    }
  }
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

/** How many pages the PDF would have. Fetches only the font styles the resume uses. */
export async function countPages(doc: ResumeDoc, settings: ExportSettings): Promise<number> {
  const { countPdfPages, usedStyles } = await import("@penntools/tool-resume-customizer/pdf");
  return countPdfPages(doc, settings, await loadFonts(settings.font, usedStyles(doc)));
}

export async function downloadPdf(doc: ResumeDoc, settings: ExportSettings): Promise<void> {
  const { toPdf, usedStyles } = await import("@penntools/tool-resume-customizer/pdf");
  const fonts = await loadFonts(settings.font, usedStyles(doc));
  download(toPdf(doc, settings, fonts), `${baseName(doc)}.pdf`, "application/pdf");
}

export async function downloadDocx(doc: ResumeDoc, settings: ExportSettings): Promise<void> {
  const { toDocx } = await import("@penntools/tool-resume-customizer/docx");
  download(
    await toDocx(doc, settings),
    `${baseName(doc)}.docx`,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}
