// ─────────────────────────────────────────────────────────────────────────────
// Penn food data: dining plans and food outlets with menu items, curated from
// official sources and bundled with the tool, since tool code can't fetch live
// data. Every entry names its source; the data itself is in data/pennFood.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { DINING_PLANS, OUTLETS } from "./data/pennFood.js";

export { DINING_PLANS, FOOD_DATA_CHECKED_ON, OUTLETS } from "./data/pennFood.js";

export type DietaryTag = "vegetarian" | "vegan" | "halal" | "kosher" | "gluten-free" | "dairy-free";

/** A Penn Dining meal plan, as offered for the current academic year. */
export interface DiningPlan {
  id: string;
  name: string;
  /** Meal swipes per week, or null if the plan counts them per semester or has none. */
  swipesPerWeek: number | null;
  /** Meal swipes per semester, or null if counted per week or none. */
  swipesPerSemester: number | null;
  /** Dining Dollars per semester, or null if none. */
  diningDollarsPerSemester: number | null;
  /** Price per semester in US dollars, or null if not published. */
  pricePerSemester: number | null;
  /** Who it's for, e.g. "First-year students" or "Upper-level and graduate students". */
  eligibility: string;
  notes: string | null;
  sourceUrl: string;
}

export interface MenuItem {
  name: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  priceUsd: number | null;
  dietary: DietaryTag[];
  /** Set when the nutrition is a best approximation, not the official figure; the planner then says "about". */
  approximate?: true;
}

/** A place to eat on or near campus. */
export interface Outlet {
  id: string;
  name: string;
  kind: "dining-hall" | "cafe" | "market" | "restaurant";
  /** "penn-dining" for university-run places, "chain" for national chains, otherwise "independent". */
  operator: "penn-dining" | "chain" | "independent";
  address: string | null;
  /** Campus buildings it's in or next to, e.g. ["Houston Hall"]. */
  nearBuildings: string[];
  acceptsSwipes: boolean | null;
  acceptsDiningDollars: boolean | null;
  /** A short summary of usual hours, or null; hours change, so the app says to check. */
  hoursNote: string | null;
  menuUrl: string | null;
  /** Representative items. Dining-hall menus rotate, so these are staples, not today's menu. */
  items: MenuItem[];
  sourceUrl: string;
}

// ── Lookups ─────────────────────────────────────────────────────────────────

/** Dining plan ids a student can pick, with "none" for no plan. */
export const DINING_PLAN_IDS = ["none", ...DINING_PLANS.map((p) => p.id)] as [string, ...string[]];

export function findDiningPlan(id: string): DiningPlan | null {
  return DINING_PLANS.find((p) => p.id === id) ?? null;
}

/** About how many weeks a semester's meal swipes cover. */
export const WEEKS_PER_SEMESTER = 15;

/** "Upperclass 108: 108 swipes (about 7 a week) and $600 Dining Dollars a semester". */
export function describeDiningPlan(plan: DiningPlan): string {
  const parts = [
    plan.swipesPerSemester !== null &&
      `${plan.swipesPerSemester} swipes (about ${Math.round(plan.swipesPerSemester / WEEKS_PER_SEMESTER)} a week)`,
    plan.swipesPerWeek !== null && `${plan.swipesPerWeek} swipes a week`,
    plan.diningDollarsPerSemester !== null && `$${plan.diningDollarsPerSemester} Dining Dollars`,
  ].filter((part): part is string => typeof part === "string");
  return `${plan.name}: ${parts.join(" and ")} a semester`;
}

/** The outlet with this name, ignoring case and spacing, or null for a place we don't know. */
export function findOutlet(name: string): Outlet | null {
  const key = normalize(name);
  return OUTLETS.find((o) => normalize(o.name) === key || o.id === key.replace(/ /g, "-")) ?? null;
}

/** Outlets whose name, building or menu matches `query`, best first; all of them for an empty query. */
export function searchOutlets(query: string, limit = 8): Outlet[] {
  const q = normalize(query);
  if (!q) return OUTLETS.slice(0, limit);
  const score = (o: Outlet) =>
    normalize(o.name).startsWith(q) ? 3 : normalize(o.name).includes(q) ? 2 : o.nearBuildings.some((b) => normalize(b).includes(q)) ? 1 : 0;
  return OUTLETS.map((o) => ({ o, s: score(o) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ o }) => o);
}

/** Outlets this dining plan can be used at: swipes, Dining Dollars or both. */
export function outletsForPlan(plan: DiningPlan): Outlet[] {
  const swipes = plan.swipesPerSemester !== null || plan.swipesPerWeek !== null;
  const dollars = plan.diningDollarsPerSemester !== null;
  return OUTLETS.filter((o) => (swipes && o.acceptsSwipes) || (dollars && o.acceptsDiningDollars));
}

/** An outlet and its menu as lines for an AI prompt, with whatever nutrition is published. */
export function describeOutlet(o: Outlet): string {
  const pay = [o.acceptsSwipes && "takes swipes", o.acceptsDiningDollars && "takes Dining Dollars"].filter(Boolean).join(", ");
  const street = o.address?.split(",")[0];
  const near = [street, o.nearBuildings.length > 0 && `near ${o.nearBuildings.join(", ")}`].filter(Boolean).join("; ");
  const head = `${o.name}${near ? ` (${near})` : ""}${pay ? `; ${pay}` : ""}`;
  const items = o.items.map((i) => {
    const facts = [
      i.calories !== null && `${i.calories} cal`,
      i.proteinG !== null && `${i.proteinG} g protein`,
      i.carbsG !== null && `${i.carbsG} g carbs`,
      i.fatG !== null && `${i.fatG} g fat`,
      i.priceUsd !== null && `$${i.priceUsd}`,
      ...i.dietary,
    ].filter(Boolean);
    const about = i.approximate && i.calories !== null ? "about " : "";
    return `  - ${i.name}${facts.length ? ` (${about}${facts.join(", ")})` : ""}`;
  });
  return [head, ...items].join("\n");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
