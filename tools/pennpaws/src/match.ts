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
  type PetDetails,
  TRAVEL,
  GENDER_PREFS,
  type MemberLocation,
  type SitterProfile,
} from "./profile.js";
import { petsByIds } from "./pets.js";
import type { RequestDraft } from "./request.js";
import { LANGUAGES, OTHER, labelOf, listLabels } from "./survey.js";

export interface Point {
  lat: number;
  lng: number;
}

/** What matching knows about the owner behind a request: where they are and their pet profile, when they have one. */
export interface OwnerContext {
  point: Point | null;
  profile: OwnerProfile | null;
  /** The saved pets the request was posted from (R43). When given, these are read instead of the profile's pet. */
  pets?: PetDetails[];
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

// Rounded to half a mile, so a distance plus a neighborhood can't narrow down someone's home.
const formatMiles = (miles: number) => (miles < 0.5 ? "Under half a mile away" : `About ${Math.round(miles * 2) / 2} mi away`);

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
  const goodRaw = good;
  const badRaw = bad;
  const pets = owner.pets?.length ? owner.pets : owner.profile ? [owner.profile.pet] : [];
  const several = pets.length > 1;
  // With several pets, each line says which one it's about.
  const about = (pet: PetDetails, text: string) => (several ? `${pet.name}: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text);

  // Kind of pet. "More than one" typed by hand is left to the AI, which reads
  // the owner's words; saved pets say each pet's kind.
  // "Something else" is usually a rabbit, bird or fish, so it's read as small pets.
  const kindOf = (kind: string) => (kind === "dog" ? "dogs" : kind === "cat" ? "cats" : kind === OTHER ? "small_pets" : null);
  const kindWords = { dogs: "dogs", cats: "cats", small_pets: "small pets" } as const;
  const kinds = several ? [...new Set(pets.map((p) => p.kind))] : [draft.petKind];
  for (const kind of kinds) {
    const wanted = kindOf(kind);
    if (wanted && sitter.petKinds.includes(wanted)) good(several ? 5 : 10, `You look after ${kindWords[wanted]}`);
    else if (wanted) bad(kind === OTHER ? 20 : 40, `You didn't list ${kindWords[wanted]}`);
  }

  // Distance against how far the sitter said they'd go.
  const ownerPoint = owner.point ?? pointOf(null, draft.area);
  const miles = sitterPoint && ownerPoint ? milesBetween(sitterPoint, ownerPoint) : null;
  const travel = Number(sitter.travel);
  if (miles !== null) {
    if (miles <= travel) good(miles <= travel / 2 ? 20 : 12, formatMiles(miles));
    else bad(miles <= travel * 2 ? 12 : 25, `${formatMiles(miles)}, past your ${labelOf(TRAVEL, sitter.travel).toLowerCase()}`);
  }

  // The type of care. A stay or boarding is overnight by definition.
  if (draft.careType === "boarding") {
    if (sitter.services.includes("boarding")) good(12, "You offer boarding at your place");
    else bad(30, "Boarding at your place, which you don't offer");
  } else if (draft.careType === "stay") {
    if (sitter.services.includes("overnight")) good(10, "You do overnight stays");
    else bad(25, "Needs an overnight stay, which you don't offer");
  }

  // The kind of visit.
  const overnight = draft.careType !== "visits" || draft.frequency === "overnight";
  if (draft.careType === "visits" && draft.frequency === "overnight") {
    if (sitter.services.includes("overnight") || sitter.services.includes("boarding")) good(8, "You do overnights");
    else bad(15, "Needs overnights, which you don't offer");
  }
  // Walks at the owner's place; a boarded dog is walked from the sitter's.
  if (draft.careType === "visits" && draft.tasks.includes("walks")) {
    if (sitter.services.includes("walk")) good(5, "You do dog walks");
    else bad(10, "Needs walks, which you don't offer");
  }
  if (!overnight && !draft.tasks.includes("walks") && !sitter.services.includes("drop_in")) bad(8, "Needs drop-in visits, which you don't offer");

  // Each pet itself, when the owner described them.
  for (const pet of pets) {
    const good = (weight: number, text: string) => goodRaw(several ? weight / pets.length : weight, about(pet, text));
    const bad = (weight: number, text: string) => badRaw(weight, about(pet, text));
    if (pet.kind === "dog") {
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
  }
  // The request's own preference wins; otherwise the owner's profile.
  const pref = draft.sitterGender !== "none" ? draft.sitterGender : owner.profile?.sitterGenderPref ?? "none";
  if (pref !== "none" && sitter.gender !== pref) bad(25, `The owner prefers a ${labelOf(GENDER_PREFS, pref).toLowerCase()} sitter`);
  if (draft.tasks.includes("medication") || pets.some((p) => p.specialCare.includes("medication"))) {
    if (sitter.experience.includes("medication")) good(8, "You've given medication");
    else bad(8, "Needs medication, which you haven't listed");
  }

  // What the owner asked of a sitter on this request.
  if (draft.mustHaves.includes("cat_experience")) {
    if (sitter.experience.includes("owned_cats")) good(8, "You've had cats");
    else bad(15, "The owner wants someone who's cared for cats");
  }
  if (draft.mustHaves.includes("dog_experience")) {
    if (sitter.experience.includes("owned_dogs")) good(8, "You've had dogs");
    else bad(15, "The owner wants someone who's cared for dogs");
  }
  if (draft.mustHaves.includes("home_most_days")) {
    if (sitter.availability.includes("weekday_daytime")) good(6, "You're free weekday daytimes");
    else bad(10, "The owner wants someone home most of the day");
  }
  if (draft.languages.length > 0) {
    const shared = draft.languages.filter((l) => sitter.languages.includes(l));
    if (shared.length) good(10, `You speak ${listLabels(LANGUAGES, shared)}`);
    else bad(15, `The owner would like a sitter who speaks ${listLabels(LANGUAGES, draft.languages).replace(/ and /, " or ")}`);
  }

  // When. Only a clear clash counts against: a request that needs weekdays from someone free on weekends only.
  const days = daysCovered(draft);
  if (days) {
    const weekendOnly = [...days].every((d) => d === 0 || d === 6);
    const freeWeekdays = sitter.availability.some((a) => a.startsWith("weekday") || a === "breaks");
    if (weekendOnly && sitter.availability.includes("weekends")) good(6, "On a weekend, when you're free");
    else if (!weekendOnly && !freeWeekdays) bad(8, "Includes weekdays; you're usually free weekends");
  }
  if (draft.petKind === "several" && !several) concerns.push({ text: `${draft.petKindOther ?? "Several pets"}; check you're comfortable`, weight: 0 });

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

/** What an owner asked for on a request, checked against one sitter, in words for the owner. */
export interface AskCheck {
  fits: string[];
  misses: string[];
}

const SERVICES_FOR_CARE: Record<RequestDraft["careType"], { services: readonly SitterProfile["services"][number][]; fit: string; miss: string }> = {
  visits: { services: ["walk", "drop_in"], fit: "Does walks or drop-ins", miss: "Doesn't do walks or drop-ins" },
  stay: { services: ["overnight"], fit: "Does overnight stays", miss: "Doesn't do overnight stays" },
  boarding: { services: ["boarding"], fit: "Offers boarding", miss: "Doesn't offer boarding" },
};
const PET_FOR_SITTER = { dog: "dogs", cat: "cats", other: "small_pets" } as const;
const PET_WORDS = { dogs: "dogs", cats: "cats", small_pets: "small pets" } as const;

/**
 * Shows the owner, on each offer, whether the sitter has what the request asks
 * for: the type of care, the kind of pet, the must-haves, gender and
 * languages. Only what the owner asked is checked.
 */
export function checkAsks(draft: RequestDraft, sitter: SitterProfile): AskCheck {
  const fits: string[] = [];
  const misses: string[] = [];
  const check = (ok: boolean, fit: string, miss: string) => (ok ? fits.push(fit) : misses.push(miss));

  const care = SERVICES_FOR_CARE[draft.careType];
  check(care.services.some((s) => sitter.services.includes(s)), care.fit, care.miss);
  if (draft.petKind !== "several") {
    const kind = PET_FOR_SITTER[draft.petKind];
    check(sitter.petKinds.includes(kind), `Comfortable with ${PET_WORDS[kind]}`, `Doesn't list ${PET_WORDS[kind]}`);
  }
  if (draft.mustHaves.includes("cat_experience")) check(sitter.experience.includes("owned_cats"), "Has owned cats", "No cat experience listed");
  if (draft.mustHaves.includes("dog_experience")) check(sitter.experience.includes("owned_dogs"), "Has owned dogs", "No dog experience listed");
  if (draft.mustHaves.includes("home_most_days")) check(sitter.availability.includes("weekday_daytime"), "Free weekday daytimes", "Not free weekday daytimes");
  // Gender still counts in the sitter's own ranking, but the owner only sees this line when the sitter chose to show their gender.
  if (draft.sitterGender !== "none" && sitter.showGender) check(sitter.gender === draft.sitterGender, "Matches your gender preference", "Doesn't match your gender preference");
  if (draft.languages.length) {
    const shared = draft.languages.filter((l) => sitter.languages.includes(l));
    check(shared.length > 0, `Speaks ${listLabels(LANGUAGES, shared)}`, `Doesn't speak ${listLabels(LANGUAGES, draft.languages).replace(/ and /, " or ")}`);
  }
  return { fits, misses };
}

/** The owner's location and pet profile for each request, by request id. */
export async function loadOwners(sql: Sql, requestIds: readonly string[]): Promise<Map<string, OwnerContext>> {
  if (requestIds.length === 0) return new Map();
  const rows = await sql<{ id: string; owner_id: string; pet_ids: string[]; lat: number | null; lng: number | null; area: string | null; profile: unknown }[]>`
    SELECT r.id, r.owner_id, r.pet_ids, m.lat, m.lng, m.area, m.profile
    FROM requests r LEFT JOIN members m ON m.user_id = r.owner_id
    WHERE r.id = ANY(${sql.array([...requestIds])}::uuid[])
  `;
  return new Map(
    await Promise.all(
      rows.map(async (row): Promise<[string, OwnerContext]> => {
        const parsed = OwnerProfile.safeParse(row.profile);
        const profile = parsed.success ? parsed.data : null;
        const pets = row.pet_ids.length ? await petsByIds(sql, row.owner_id, row.pet_ids) : [];
        return [row.id, { point: pointOf({ area: row.area ?? "", lat: row.lat, lng: row.lng }), profile, ...(pets.length ? { pets } : {}) }];
      }),
    ),
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
