// pdfjs for routes that open PDFs on the server, loaded when a request first
// needs it rather than when the route's module loads.
//
// On import, pdfjs tries to load the native `canvas` package to polyfill
// DOMMatrix and Path2D, which only rendering needs, and warns when it can't
// (the repo never builds `canvas`; see neverBuiltDependencies in the root
// package.json). Reading text and counting pages work without them. `next
// build` imports every route to collect page data, so a top-level import
// printed those warnings on every build; loading it here keeps the build quiet.

type GetDocument = typeof import("pdfjs-dist/legacy/build/pdf.js").getDocument;

/** pdfjs's getDocument. Call it inside the request handler, not at module scope. */
export async function loadGetDocument(): Promise<GetDocument> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.js");
  return getDocument;
}
