// The rate the pay step suggests, worked out from the request so the owner
// sees why: a base for the kind of care, then a few dollars for what makes a
// visit or a night more work or harder to fill. Rates are student-to-student,
// below what commercial apps charge; change the numbers here to retune.

import type { RequestDraft } from "./request.js";

export interface PaySuggestion {
  amount: number;
  unit: "visit" | "night";
  /** The base and each change, in order, like "Dog walk, $20" and "Medication, +$3". */
  parts: { label: string; dollars: number }[];
}

const VISIT = { dropIn: 15, walk: 20, medication: 3, severalPets: 5, holiday: 5, weekly: -2 } as const;
const NIGHT = { stay: 40, boarding: 35, medication: 5, severalPets: 10, holiday: 10 } as const;

/** The four bases, and the keys the posted rates are grouped under. */
export type RateKind = "dropIn" | "walk" | "stay" | "boarding";

/** What members here have actually asked for, per kind of care. */
export type PlatformRates = Partial<Record<RateKind, { median: number; count: number }>>;

/**
 * How many posted requests a kind needs before its median replaces the base
 * above. Below this, a couple of unusual asks would swing the suggestion.
 */
export const ENOUGH_POSTED = 5;

/** The dollars and unit in a stored pay line like "$18 a walk" or "$40 a night, suggested". */
export function parsePay(pay: string): { dollars: number; kind: RateKind } | null {
  const match = /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:a|per|\/)\s*(visit|walk|night)/i.exec(pay);
  if (!match) return null;
  const dollars = Number(match[1]);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const word = match[2]!.toLowerCase();
  // A night's rate still depends on whose home it is, which the line doesn't
  // say, so the caller passes the care type for those.
  return { dollars, kind: word === "walk" ? "walk" : word === "visit" ? "dropIn" : "stay" };
}

/** What a rate is called per kind of care, for a band anyone may read. */
const UNIT: Record<RateKind, string> = { walk: "a walk", dropIn: "a visit", stay: "a night", boarding: "a night" };

/** How wide a band is: $5 for a visit or a walk, $10 for a night, which spans more. */
const bandWidth = (kind: RateKind) => (kind === "stay" || kind === "boarding" ? 10 : 5);

/**
 * The public band for a pay line: "$30 a visit" reads as "$30–35 a visit" to
 * anyone browsing. Only the owner and the sitter they pick see the exact rate
 * (toCard in requests.ts), so a request advertises the going rate and the two
 * of them settle the number between themselves. Null when the owner wrote
 * something we can't read as an amount, which the caller shows as "to agree".
 */
export function payBand(pay: string): string | null {
  const parsed = parsePay(pay);
  if (!parsed) return null;
  const width = bandWidth(parsed.kind);
  const low = Math.max(width, Math.floor(parsed.dollars / width) * width);
  return `$${low}–${low + width} ${UNIT[parsed.kind]}`;
}

/** The middle value, which a single generous or stingy request can't drag around. */
export function median(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

/** Groups posted requests into a median per kind, for suggestPay to lean on. */
export function ratesFromPosted(posted: { pay: string; careType: string }[]): PlatformRates {
  const buckets = new Map<RateKind, number[]>();
  for (const row of posted) {
    const parsed = parsePay(row.pay);
    if (!parsed) continue;
    // "a night" doesn't say whose home, so take that from the request itself.
    const kind: RateKind = parsed.kind === "stay" ? (row.careType === "boarding" ? "boarding" : "stay") : parsed.kind;
    buckets.set(kind, [...(buckets.get(kind) ?? []), parsed.dollars]);
  }
  const rates: PlatformRates = {};
  for (const [kind, amounts] of buckets) {
    const middle = median(amounts);
    if (middle !== null) rates[kind] = { median: middle, count: amounts.length };
  }
  return rates;
}

/** Thanksgiving week (Wednesday to Sunday) and winter break, when most students leave and sitters are scarce. */
export function isHoliday(startsOn: string, endsOn: string): boolean {
  const year = Number(startsOn.slice(0, 4));
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const thanksgiving = 1 + ((4 - nov1 + 7) % 7) + 21;
  const iso = (month: number, day: number) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  const breaks: [string, string][] = [
    [iso(10, thanksgiving - 1), iso(10, thanksgiving + 3)],
    [iso(11, 20), `${year + 1}-01-03`],
    [`${year - 1}-12-20`, iso(0, 3)],
  ];
  return breaks.some(([from, to]) => startsOn <= to && endsOn >= from);
}

export function suggestPay(draft: RequestDraft, rates: PlatformRates = {}): PaySuggestion {
  const parts: PaySuggestion["parts"] = [];
  const add = (label: string, dollars: number) => parts.push({ label, dollars });
  /**
   * The base for this kind of care: what members here actually ask once
   * enough of them have asked, otherwise the starting rate above. Owners
   * price against their own market, not a number we guessed once.
   */
  const base = (kind: RateKind, label: string, fallback: number) => {
    const seen = rates[kind];
    if (seen && seen.count >= ENOUGH_POSTED) add(`${label}, what students here ask`, seen.median);
    else add(label, fallback);
  };
  const holiday = !draft.weekly && draft.startsOn && draft.endsOn ? isHoliday(draft.startsOn, draft.endsOn) : false;
  const medication = draft.tasks.includes("medication");
  const several = draft.petKind === "several";

  if (draft.careType === "stay" || draft.careType === "boarding") {
    if (draft.careType === "stay") base("stay", "Sitter stays at your place", NIGHT.stay);
    else base("boarding", "Boarding at the sitter's place", NIGHT.boarding);
    if (several) add("More than one pet", NIGHT.severalPets);
    if (medication) add("Medication", NIGHT.medication);
    if (holiday) add("Over a school break, when sitters are scarce", NIGHT.holiday);
    return { amount: total(parts), unit: "night", parts };
  }

  if (draft.tasks.includes("walks")) base("walk", "Dog walk", VISIT.walk);
  else base("dropIn", "Drop-in visit", VISIT.dropIn);
  if (several) add("More than one pet", VISIT.severalPets);
  if (medication) add("Medication", VISIT.medication);
  if (holiday) add("Over a school break, when sitters are scarce", VISIT.holiday);
  if (draft.weekly) add("Every week, a small regular discount", VISIT.weekly);
  return { amount: total(parts), unit: "visit", parts };
}

const total = (parts: PaySuggestion["parts"]) => parts.reduce((sum, p) => sum + p.dollars, 0);

/** "Dog walk $20, medication +$3, over a school break +$5". */
export function explainPay(suggestion: PaySuggestion): string {
  return suggestion.parts
    .map((p, i) => {
      const label = i === 0 ? p.label : p.label.charAt(0).toLowerCase() + p.label.slice(1);
      const dollars = i === 0 ? `$${p.dollars}` : p.dollars < 0 ? `-$${-p.dollars}` : `+$${p.dollars}`;
      return `${label} ${dollars}`;
    })
    .join(", ");
}
