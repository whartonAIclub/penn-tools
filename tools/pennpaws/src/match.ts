// How well an open request fits a sitter. Rules come first: they compare the
// sitter's profile with the owner's pet profile and the request on the same
// scales (kind, size, energy, distance, services, experience), so every
// sitter gets a ranked list with reasons, with or without an AI key. The AI
// (ai.ts, rankMatches) then reads what rules can't, like free-text notes in
// any language, and re-ranks the best few.

import type { Sql } from "postgres";
import {
  ENERGY,
  NEIGHBORHOODS,
  OwnerProfile,
  PET_SIZES,
  TRAVEL,
  GENDER_PREFS,
  type MemberLocation,
  type SitterProfile,
} from "./profile.js";
import type { RequestDraft } from "./request.js";
import { OTHER, labelOf } from "./survey.js";

export interface Point {
  lat: number;
  lng: number;
}

/** What matching knows about the owner behind a request: where they are and their pet profile, when they have one. */
export interface OwnerContext {
  point: Point | null;
  profile: OwnerProfile | null;
}

export type Fit = "great" | "good" | "maybe" | "poor";

export interface Match {
  requestId: string;
  /** 0 to 100. */
  score: number;
  fit: Fit;
  /** Why it fits, most useful first, in a few words each. */
  reasons: string[];
  /** What might not work, most serious first. */
  concerns: string[];
  /** Miles between the sitter and the owner, when both locations are known. */
  miles: number | null;
}

export const FIT_LABELS: Record<Fit, string | null> = {
  great: "Great match",
  good: "Good match",
  maybe: null,
  poor: "Not a fit",
};

export function fitOf(score: number): Fit {
  if (score >= 80) return "great";
  if (score >= 62) return "good";
  if (score >= 35) return "maybe";
  return "poor";
}

/** A member's location as a point: their rounded GPS, else a known neighborhood named in the area text. */
export function pointOf(location: Pick<MemberLocation, "area" | "lat" | "lng"> | null, fallbackArea: string | null = null): Point | null {
  if (location?.lat != null && location.lng != null) return { lat: location.lat, lng: location.lng };
  for (const text of [location?.area, fallbackArea]) {
    const lower = text?.toLowerCase();
    if (!lower) continue;
    const place = NEIGHBORHOODS.find((n) => lower.includes(n.value.toLowerCase()));
    if (place) return { lat: place.lat, lng: place.lng };
  }
  return null;
}

export function milesBetween(a: Point, b: Point): number {
  const km = Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180));
  return km / 1.609;
}

const formatMiles = (miles: number) => (miles < 0.1 ? "Under 0.1 mi away" : `${miles.toFixed(1)} mi away`);

/** Days of the week (0 is Sunday) the request covers, or null for weekly requests. */
function daysCovered(draft: RequestDraft): Set<number> | null {
  if (draft.weekly || !draft.startsOn || !draft.endsOn) return null;
  const days = new Set<number>();
  const day = new Date(`${draft.startsOn}T12:00:00`);
  const end = new Date(`${draft.endsOn}T12:00:00`);
  for (let i = 0; day <= end && i < 7; i++, day.setDate(day.getDate() + 1)) days.add(day.getDay());
  return days;
}

/** The rules score for one request. Starts at 50 and moves with each thing that fits or doesn't. */
export function scoreMatch(sitter: SitterProfile, sitterPoint: Point | null, requestId: string, draft: RequestDraft, owner: OwnerContext): Match {
  let score = 50;
  const reasons: { text: string; weight: number }[] = [];
  const concerns: { text: string; weight: number }[] = [];
  const good = (weight: number, text: string) => {
    score += weight;
    reasons.push({ text, weight });
  };
  const bad = (weight: number, text: string) => {
    score -= weight;
    concerns.push({ text, weight });
  };
  const pet = owner.profile?.pet ?? null;

  // Kind of pet. "More than one" is left to the AI, which reads the owner's words.
  const kind = draft.petKind;
  // "Something else" is usually a rabbit, bird or fish, so it's read as small pets.
  const wanted = kind === "dog" ? "dogs" : kind === "cat" ? "cats" : kind === OTHER ? "small_pets" : null;
  const kindWords = { dogs: "dogs", cats: "cats", small_pets: "small pets" } as const;
  if (wanted && sitter.petKinds.includes(wanted)) good(10, `You look after ${kindWords[wanted]}`);
  else if (wanted) bad(kind === OTHER ? 20 : 40, `You didn't list ${kindWords[wanted]}`);

  // Distance against how far the sitter said they'd go.
  const ownerPoint = owner.point ?? pointOf(null, draft.area);
  const miles = sitterPoint && ownerPoint ? milesBetween(sitterPoint, ownerPoint) : null;
  const travel = Number(sitter.travel);
  if (miles !== null) {
    if (miles <= travel) good(miles <= travel / 2 ? 20 : 12, formatMiles(miles));
    else bad(miles <= travel * 2 ? 12 : 25, `${miles.toFixed(1)} mi away, past your ${labelOf(TRAVEL, sitter.travel).toLowerCase()}`);
  }

  // The kind of visit.
  const overnight = draft.frequency === "overnight";
  if (overnight) {
    if (sitter.services.includes("overnight") || sitter.services.includes("boarding")) good(8, "You do overnights");
    else bad(15, "Needs overnights, which you don't offer");
  }
  if (draft.tasks.includes("walks")) {
    if (sitter.services.includes("walk")) good(5, "You do dog walks");
    else bad(10, "Needs walks, which you don't offer");
  }
  if (!overnight && !draft.tasks.includes("walks") && !sitter.services.includes("drop_in")) bad(8, "Needs drop-in visits, which you don't offer");

  // The pet itself, when the owner has a profile.
  if (pet) {
    if (kind === "dog") {
      if (sitter.sizes.includes(pet.size)) good(5, `${labelOf(PET_SIZES, pet.size)} dogs are fine for you`);
      else bad(15, `${labelOf(PET_SIZES, pet.size)} dog, a size you didn't pick`);
    }
    if (!sitter.energy.includes(pet.energy)) bad(8, `${labelOf(ENERGY, pet.energy)}, more or less energy than you picked`);
    const anxious = pet.alone !== "fine" || pet.withPeople === "shy";
    if (anxious && sitter.anxiousOk) good(6, "You're happy with anxious pets");
    else if (anxious) bad(10, "Anxious pet, which you said you'd rather not take");
    if (pet.age === "senior" && sitter.experience.includes("seniors")) good(5, "You've cared for senior pets");
    if (pet.age === "young" && sitter.experience.includes("puppies")) good(5, "You've cared for puppies or kittens");
    if (pet.bites) {
      if (sitter.experience.includes("reactive")) good(3, "You've handled reactive pets");
      else bad(10, "Has bitten before; read the notes first");
    }
    if (pet.specialCare.includes("injections")) {
      if (sitter.experience.includes("injections")) good(15, "You've given injections");
      else bad(15, "Needs injections, which you haven't listed");
    }
    const pref = owner.profile?.sitterGenderPref ?? "none";
    if (pref !== "none" && sitter.gender !== pref) bad(25, `The owner prefers a ${labelOf(GENDER_PREFS, pref).toLowerCase()} sitter`);
  }
  if (draft.tasks.includes("medication") || pet?.specialCare.includes("medication")) {
    if (sitter.experience.includes("medication")) good(8, "You've given medication");
    else bad(8, "Needs medication, which you haven't listed");
  }

  // When. Only a clear clash counts against: a request that needs weekdays from someone free on weekends only.
  const days = daysCovered(draft);
  if (days) {
    const weekendOnly = [...days].every((d) => d === 0 || d === 6);
    const freeWeekdays = sitter.availability.some((a) => a.startsWith("weekday") || a === "breaks");
    if (weekendOnly && sitter.availability.includes("weekends")) good(6, "On a weekend, when you're free");
    else if (!weekendOnly && !freeWeekdays) bad(8, "Includes weekdays; you're usually free weekends");
  }
  if (kind === "several") concerns.push({ text: `${draft.petKindOther ?? "Several pets"}; check you're comfortable`, weight: 0 });

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const byWeight = (a: { weight: number }, b: { weight: number }) => b.weight - a.weight;
  return {
    requestId,
    score: clamped,
    fit: fitOf(clamped),
    reasons: reasons.sort(byWeight).map((r) => r.text),
    concerns: concerns.sort(byWeight).map((c) => c.text),
    miles: miles === null ? null : Math.round(miles * 10) / 10,
  };
}

/** The owner's location and pet profile for each request, by request id. */
export async function loadOwners(sql: Sql, requestIds: readonly string[]): Promise<Map<string, OwnerContext>> {
  if (requestIds.length === 0) return new Map();
  const rows = await sql<{ id: string; lat: number | null; lng: number | null; area: string | null; profile: unknown }[]>`
    SELECT r.id, m.lat, m.lng, m.area, m.profile
    FROM requests r LEFT JOIN members m ON m.user_id = r.owner_id
    WHERE r.id = ANY(${sql.array([...requestIds])}::uuid[])
  `;
  return new Map(
    rows.map((row) => {
      const parsed = OwnerProfile.safeParse(row.profile);
      const profile = parsed.success ? parsed.data : null;
      return [row.id, { point: pointOf({ area: row.area ?? "", lat: row.lat, lng: row.lng }), profile }];
    }),
  );
}

/** Every request scored for the sitter, best first. */
export async function matchRequests(
  sql: Sql,
  sitter: SitterProfile,
  requests: readonly { id: string; draft: RequestDraft }[],
): Promise<Match[]> {
  const owners = await loadOwners(
    sql,
    requests.map((r) => r.id),
  );
  const sitterPoint = pointOf(sitter.location);
  return requests
    .map((r) => scoreMatch(sitter, sitterPoint, r.id, r.draft, owners.get(r.id) ?? { point: null, profile: null }))
    .sort((a, b) => b.score - a.score);
}
