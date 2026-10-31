// The questions an owner answers to post a request. The survey, the browse
// filters, request validation and the AI's structured output all read these
// lists, so adding a pet kind or a task here is the only change needed.
//
// Every question has a way out: OTHER, paired with a free-text field.

export const OTHER = "other";

export interface Option<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export const PET_KINDS = [
  { value: "dog", label: "A dog" },
  { value: "cat", label: "A cat" },
  { value: "several", label: "More than one" },
  { value: OTHER, label: "Something else" },
] as const satisfies readonly Option[];
export type PetKind = (typeof PET_KINDS)[number]["value"];

// How the owner picks dates in the survey. Only the resulting dates (or
// weekly) are stored.
export const DATE_MODES = [
  { value: "dates", label: "Pick my own dates", hint: "Choose a start and end day" },
  { value: "weekend", label: "This weekend", hint: "The coming Saturday and Sunday" },
  { value: "weekly", label: "Every week, same days", hint: "A regular walker or visitor" },
] as const satisfies readonly Option[];
export type DateMode = (typeof DATE_MODES)[number]["value"];

export const FREQUENCIES = [
  { value: "once_daily", label: "Once a day" },
  { value: "twice_daily", label: "Twice a day" },
  { value: "every_other_day", label: "Every other day" },
  { value: "overnight", label: "Stay overnight" },
  { value: OTHER, label: "Something else" },
] as const satisfies readonly Option[];
export type Frequency = (typeof FREQUENCIES)[number]["value"];

export const TASKS = [
  { value: "walks", label: "Walks" },
  { value: "feeding", label: "Feeding" },
  { value: "water", label: "Fresh water" },
  { value: "litter", label: "Litter box" },
  { value: "playtime", label: "Playtime" },
  { value: "medication", label: "Medication" },
  { value: "brushing", label: "Brushing" },
  { value: "cleanup", label: "Clean up" },
  { value: OTHER, label: "Something else" },
] as const satisfies readonly Option[];
export type Task = (typeof TASKS)[number]["value"];

/** The tasks offered first for each kind of pet; any task can still be picked. */
export const TASKS_BY_KIND: Record<PetKind, readonly Task[]> = {
  dog: ["walks", "feeding", "water", "playtime", "medication", "cleanup", OTHER],
  cat: ["feeding", "litter", "water", "playtime", "medication", "brushing", OTHER],
  several: ["walks", "feeding", "water", "litter", "playtime", "medication", OTHER],
  [OTHER]: ["feeding", "water", "playtime", "medication", "cleanup", OTHER],
};

export const ACCESS = [
  { value: "in_person", label: "Meet in person", hint: "Hand over keys before you leave" },
  { value: "front_desk", label: "Front desk or doorman", hint: "Leave keys with your building" },
  { value: "lockbox", label: "Lockbox or door code", hint: "Shared only after you both approve" },
  { value: "decide_later", label: "Decide with my sitter", hint: "Sort it out once you match" },
  { value: OTHER, label: "Something else", hint: "Type your own" },
] as const satisfies readonly Option[];
export type Access = (typeof ACCESS)[number]["value"];

/** Suggested pay per visit, in dollars. Owners can also type their own. */
export const PAY_PRESETS = [15, 20, 25] as const;
export const SUGGESTED_PAY = 20;

export const LIMITS = {
  name: 60,
  shortText: 120,
  notes: 1000,
  sentence: 500,
  message: 500,
  /** A resized photo as a data URL; the survey shrinks photos well under this. */
  photo: 200_000,
} as const;

export function labelOf(options: readonly Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** The coming Saturday and Sunday (today when it is the weekend), as YYYY-MM-DD. */
export function thisWeekend(today: Date): { startsOn: string; endsOn: string } {
  const day = today.getDay();
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (day === 0 ? -1 : 6 - day));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  return { startsOn: isoDate(saturday), endsOn: isoDate(sunday) };
}

export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Nov 12" from "2026-11-12". */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
