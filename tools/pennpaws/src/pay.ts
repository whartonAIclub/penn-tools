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

export function suggestPay(draft: RequestDraft): PaySuggestion {
  const parts: PaySuggestion["parts"] = [];
  const add = (label: string, dollars: number) => parts.push({ label, dollars });
  const holiday = !draft.weekly && draft.startsOn && draft.endsOn ? isHoliday(draft.startsOn, draft.endsOn) : false;
  const medication = draft.tasks.includes("medication");
  const several = draft.petKind === "several";

  if (draft.careType === "stay" || draft.careType === "boarding") {
    if (draft.careType === "stay") add("Sitter stays at your place", NIGHT.stay);
    else add("Boarding at the sitter's place", NIGHT.boarding);
    if (several) add("More than one pet", NIGHT.severalPets);
    if (medication) add("Medication", NIGHT.medication);
    if (holiday) add("Over a school break, when sitters are scarce", NIGHT.holiday);
    return { amount: total(parts), unit: "night", parts };
  }

  if (draft.tasks.includes("walks")) add("Dog walk", VISIT.walk);
  else add("Drop-in visit", VISIT.dropIn);
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
