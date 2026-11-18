// Text limits, in a file with no imports so the page can use them in the
// browser (via "@penntools/tool-paper-tldr/limits") without bundling the
// summary schema.

/** Text shorter than this is almost certainly a scanned PDF with no text layer. */
export const MIN_PAPER_CHARS = 1_500;
/** About 75k tokens: enough for a long paper with its appendix. Longer text is cut to this. */
export const MAX_PAPER_CHARS = 300_000;
