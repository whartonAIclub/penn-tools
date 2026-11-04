// What every importer produces: excerpts small enough for one extraction
// prompt, with what locates each one in the original file.

/** About a page of text: enough context for a lesson, small enough to batch. */
export const MAX_EXCERPT_CHARS = 1500;

export interface ExcerptMeta {
  /** YYYY-MM-DD, for chat excerpts. */
  date?: string;
  /** Who wrote the messages, for chat excerpts. */
  senders?: string[];
  /** The file's path inside an uploaded zip. */
  file?: string;
  /** The spreadsheet tab, for spreadsheet excerpts. */
  sheet?: string;
  /** The page number, for PDF excerpts. */
  page?: number;
}

export interface ExcerptDraft {
  text: string;
  meta: ExcerptMeta;
}

/**
 * Splits text into pieces of at most `max` characters, breaking between the
 * given units (lines or paragraphs) and only cutting inside a unit longer than
 * `max` on its own.
 */
export function packUnits(units: string[], max = MAX_EXCERPT_CHARS, separator = "\n"): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const unit of units.map((u) => u.trim()).filter(Boolean)) {
    for (const part of splitLong(unit, max)) {
      if (current && current.length + separator.length + part.length > max) {
        pieces.push(current);
        current = "";
      }
      current = current ? `${current}${separator}${part}` : part;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const at = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
