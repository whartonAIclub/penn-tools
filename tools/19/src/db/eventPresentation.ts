export interface EventPresentationFields {
  description_preview: string | null;
  details_text: string | null;
  date_summary: string | null;
  cost_summary: string | null;
  payment_summary: string | null;
  dress_code: string | null;
  included_items: string[];
  info_deck_url: string | null;
  details_url: string | null;
}

const FIELD_PATTERNS = {
  date: /^\s*date\s*:\s*(.+)$/im,
  cost: /^\s*cost\s*:\s*(.+)$/im,
  payment: /^\s*payment\s*:\s*(.+)$/im,
  dressCode: /^\s*dress\s*code\s*:\s*(.+)$/im,
  included: /^\s*what'?s\s+included\s*:\s*(.+)$/im,
  infoDeck: /^\s*info\s*deck\s*:\s*(.+)$/im,
  eventDetails: /^\s*event\s*details\s*:\s*(.+)$/im,
};

const URL_PATTERN = /https?:\/\/[^\s)]+/i;

export function parseEventPresentation(
  description: string | null,
  registrationUrl: string | null
): EventPresentationFields {
  const raw = (description || "").trim();

  const dateSummary = matchSingleLine(raw, FIELD_PATTERNS.date);
  let costSummary = matchSingleLine(raw, FIELD_PATTERNS.cost);
  let paymentSummary = matchSingleLine(raw, FIELD_PATTERNS.payment);
  const dressCode = matchSingleLine(raw, FIELD_PATTERNS.dressCode);
  const includedRaw = matchSingleLine(raw, FIELD_PATTERNS.included);
  const infoDeckRaw = matchSingleLine(raw, FIELD_PATTERNS.infoDeck);
  const detailsRaw = matchSingleLine(raw, FIELD_PATTERNS.eventDetails);

  if (costSummary) {
    const paymentFromCost = costSummary.match(/^(.*?)(?:\s*-\s*)(please\s+pay.+)$/i);
    if (paymentFromCost) {
      costSummary = paymentFromCost[1]?.trim() || null;
      if (!paymentSummary) {
        paymentSummary = paymentFromCost[2]?.trim() || null;
      }
    }
  }

  const infoDeckUrl = extractUrl(infoDeckRaw);
  const detailsUrl = extractUrl(detailsRaw) || registrationUrl || null;

  const includedItems = includedRaw
    ? includedRaw
        .split(/,\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const cleaned = removeKnownLines(raw)
    .replace(/\s*---\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const descriptionPreview =
    cleaned.length > 220 ? `${cleaned.slice(0, 217).trimEnd()}...` : cleaned;

  const preview = descriptionPreview || null;
  const detailsText = cleaned || null;

  return {
    description_preview: preview,
    details_text: detailsText,
    date_summary: dateSummary,
    cost_summary: costSummary,
    payment_summary: paymentSummary,
    dress_code: dressCode,
    included_items: includedItems,
    info_deck_url: infoDeckUrl,
    details_url: detailsUrl,
  };
}

function matchSingleLine(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  if (!match || typeof match[1] !== "string") return null;

  const value = match[1].trim();
  return value || null;
}

function extractUrl(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(URL_PATTERN);
  return match ? match[0] : null;
}

function removeKnownLines(text: string): string {
  return text
    .replace(FIELD_PATTERNS.date, "")
    .replace(FIELD_PATTERNS.cost, "")
    .replace(FIELD_PATTERNS.payment, "")
    .replace(FIELD_PATTERNS.dressCode, "")
    .replace(FIELD_PATTERNS.included, "")
    .replace(FIELD_PATTERNS.infoDeck, "")
    .replace(FIELD_PATTERNS.eventDetails, "")
    .replace(/\s+/g, " ")
    .trim();
}
