// pdfjs for routes that open PDFs on the server, loaded when a request first
// needs it rather than when the route's module loads.
//
// On import, pdfjs tries to load the native `canvas` package to polyfill
// DOMMatrix and Path2D, which only rendering needs, and warns when it can't
// (the repo never builds `canvas`; see neverBuiltDependencies in the root
// package.json). Reading text and counting pages work without them. `next
// build` imports every route to collect page data, so a top-level import
// printed those warnings on every build; loading it here keeps the build quiet.

import type { DocumentInitParameters, PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

/**
 * pdfjs's other getDocument options, e.g. `cMapUrl` and `cMapPacked` for
 * Chinese, Japanese or Korean text, or `password`. `verbosity` defaults to 0
 * (pdfjs's console warnings off).
 */
export type PdfOptions = Omit<DocumentInitParameters, "data" | "url" | "isEvalSupported">;

/**
 * Starts opening a PDF with pdfjs's eval-based font loading off, so a
 * malicious PDF can't run code (CVE-2024-4367). Rejects only if pdfjs itself
 * can't be loaded; a bad PDF rejects the returned task's `promise`.
 */
async function openPdf(data: Uint8Array, options: PdfOptions = {}) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.js");
  return getDocument({ verbosity: 0, ...options, data, isEvalSupported: false });
}

/**
 * Opens a PDF, passes it to `use`, and closes it once `use` is done, even if
 * it throws. Rejects if the PDF doesn't open. Call it inside the request
 * handler, not at module scope.
 */
export async function withPdf<T>(
  data: Uint8Array,
  use: (pdf: PDFDocumentProxy) => T | Promise<T>,
  options: PdfOptions = {},
): Promise<T> {
  const task = await openPdf(data, options);
  try {
    return await use(await task.promise);
  } finally {
    await task.destroy();
  }
}

/**
 * How many pages the base64-encoded PDF has, or null if it doesn't open (not a
 * PDF, damaged, or password-protected). Rejects if pdfjs itself can't be
 * loaded, so a broken deploy shows up as a logged error, not as every upload
 * being refused.
 */
export async function pdfPageCount(base64: string): Promise<number | null> {
  const task = await openPdf(new Uint8Array(Buffer.from(base64, "base64")));
  try {
    return (await task.promise).numPages;
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}
