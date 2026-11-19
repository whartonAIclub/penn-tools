// First-time setup: the role a member picks, the school check on their
// sign-in email, and the profile survey for each role. The answers are what
// matching reads later, so owners describe their pet and sitters describe
// what they can take on, using the same scales. Storage is in members.ts.

import { z } from "@penntools/core/ai";
import type { Checked } from "./request.js";
import { LANGUAGES, LIMITS, OTHER, PET_KINDS, labelOf, type Language, type Option } from "./survey.js";

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((option) => option.value) as [T[number]["value"], ...T[number]["value"][]];

// ── Roles and the school check ───────────────────────────────────────────────

export const ROLES = [
  { value: "owner", label: "I need care for my pet", hint: "Post a request and get matched with a student sitter" },
  { value: "sitter", label: "I want to look after pets", hint: "Walks, drop-in visits, overnights or boarding" },
  { value: "pals", label: "I'm here for Pet Pals", hint: "Follow friends' pets and join meetups" },
] as const satisfies readonly Option[];
export type MemberRole = (typeof ROLES)[number]["value"];

/** Shown instead of a school for the platform's local development user. */
export const LOCAL_TEST_SCHOOL = "Local test account";

/** The school of a .edu email, "upenn.edu" for "ada@wharton.upenn.edu", or null for any other email. */
export function schoolOf(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf("@") ?? -1;
  if (!email || at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!/^([a-z0-9-]+\.)+edu$/.test(domain)) return null;
  return domain.split(".").slice(-2).join(".");
}

/**
 * The schools whose members may join. Penn is the pilot; to open PennPaws to
 * another school, add its domain here (and ask the Platform team to allow its
 * sign-in, which today accepts Penn accounts only).
 */
export const PILOT_SCHOOLS: readonly string[] = ["upenn.edu"];

/**
 * The school a member joins with, or null if their email isn't at a pilot
 * school. Sign-in has already proved they own the email. `allowLocalTest` lets
 * the local development user (who has no school email) through, in
 * development only.
 */
export function verifySchool(email: string | null | undefined, allowLocalTest: boolean): string | null {
  const school = schoolOf(email);
  if (school && PILOT_SCHOOLS.includes(school)) return school;
  return allowLocalTest ? LOCAL_TEST_SCHOOL : null;
}

// ── Survey options ───────────────────────────────────────────────────────────
// Owners and sitters answer on the same scales (size, energy, ...) so a pet
// can be compared directly with what a sitter is comfortable with.

export const PET_SIZES = [
  { value: "small", label: "Small", hint: "Under 20 lb, like a Chihuahua, a Pug or most cats" },
  { value: "medium", label: "Medium", hint: "20 to 50 lb, like a Beagle or a Corgi" },
  { value: "large", label: "Large", hint: "50 to 90 lb, like a Labrador or a Golden Retriever" },
  { value: "giant", label: "Giant", hint: "Over 90 lb, like a Great Dane or a Mastiff" },
] as const satisfies readonly Option[];
export type PetSize = (typeof PET_SIZES)[number]["value"];

export const PET_AGES = [
  { value: "young", label: "Puppy or kitten", hint: "Under 1 year" },
  { value: "adult", label: "Adult", hint: "Dogs 1 to 7 years, cats 1 to 10 years" },
  { value: "senior", label: "Senior", hint: "Dogs 7 and up (large breeds 6 and up), cats 11 and up" },
] as const satisfies readonly Option[];
export type PetAge = (typeof PET_AGES)[number]["value"];

export const ENERGY = [
  { value: "low", label: "Couch potato" },
  { value: "medium", label: "Moderate" },
  { value: "high", label: "High energy" },
] as const satisfies readonly Option[];
export type Energy = (typeof ENERGY)[number]["value"];

export const WITH_PEOPLE = [
  { value: "shy", label: "Shy with new people" },
  { value: "warms_up", label: "Warms up after a bit" },
  { value: "loves_everyone", label: "Loves everyone" },
] as const satisfies readonly Option[];
export type WithPeople = (typeof WITH_PEOPLE)[number]["value"];

export const WITH_ANIMALS = [
  { value: "friendly", label: "Friendly" },
  { value: "selective", label: "Picky about friends" },
  { value: "not_good", label: "Not good with them" },
  { value: "unknown", label: "Not sure" },
] as const satisfies readonly Option[];
export type WithAnimals = (typeof WITH_ANIMALS)[number]["value"];

export const ALONE = [
  { value: "fine", label: "Fine on their own" },
  { value: "bit_anxious", label: "A bit anxious" },
  { value: "separation_anxiety", label: "Separation anxiety" },
] as const satisfies readonly Option[];
export type Alone = (typeof ALONE)[number]["value"];

export const SPECIAL_CARE = [
  { value: "medication", label: "Medication" },
  { value: "injections", label: "Injections" },
  { value: "senior_care", label: "Senior care" },
  { value: "special_diet", label: "Special diet" },
  { value: OTHER, label: "Something else" },
] as const satisfies readonly Option[];
export type SpecialCare = (typeof SPECIAL_CARE)[number]["value"];

export const GENDER_PREFS = [
  { value: "none", label: "No preference" },
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non_binary", label: "Non-binary" },
] as const satisfies readonly Option[];
export type GenderPref = (typeof GENDER_PREFS)[number]["value"];

export const SERVICES = [
  { value: "walk", label: "Dog walks" },
  { value: "drop_in", label: "Drop-in visits", hint: "At the owner's home" },
  { value: "overnight", label: "Overnight stays", hint: "At the owner's home" },
  { value: "boarding", label: "Boarding", hint: "The pet stays at your place" },
] as const satisfies readonly Option[];
export type Service = (typeof SERVICES)[number]["value"];

export const SITTER_PET_KINDS = [
  { value: "dogs", label: "Dogs" },
  { value: "cats", label: "Cats" },
  { value: "small_pets", label: "Small pets", hint: "Rabbits, birds, fish" },
] as const satisfies readonly Option[];
export type SitterPetKind = (typeof SITTER_PET_KINDS)[number]["value"];

export const EXPERIENCE = [
  { value: "owned_dogs", label: "Have owned dogs" },
  { value: "owned_cats", label: "Have owned cats" },
  { value: "medication", label: "Giving medication" },
  { value: "injections", label: "Giving injections" },
  { value: "seniors", label: "Senior pets" },
  { value: "puppies", label: "Puppies or kittens" },
  { value: "reactive", label: "Reactive or anxious pets" },
] as const satisfies readonly Option[];
export type Experience = (typeof EXPERIENCE)[number]["value"];

export const TRAVEL = [
  { value: "0.5", label: "Half a mile" },
  { value: "1", label: "1 mile" },
  { value: "2", label: "2 miles" },
  { value: "5", label: "5 miles" },
] as const satisfies readonly Option[];
export type Travel = (typeof TRAVEL)[number]["value"];

export const AVAILABILITY = [
  { value: "weekday_mornings", label: "Weekday mornings" },
  { value: "weekday_daytime", label: "Weekday daytime" },
  { value: "weekday_evenings", label: "Weekday evenings" },
  { value: "weekends", label: "Weekends" },
  { value: "breaks", label: "School breaks" },
] as const satisfies readonly Option[];
export type Availability = (typeof AVAILABILITY)[number]["value"];

export const GENDERS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not", label: "Prefer not to say" },
] as const satisfies readonly Option[];
export type Gender = (typeof GENDERS)[number]["value"];

export const HOME_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: OTHER, label: "Something else" },
] as const satisfies readonly Option[];
export type HomeType = (typeof HOME_TYPES)[number]["value"];

/** Neighborhoods near Penn, with a rough center for distances when GPS is off. */
export const NEIGHBORHOODS = [
  { value: "University City", lat: 39.952, lng: -75.193 },
  { value: "Spruce Hill", lat: 39.951, lng: -75.21 },
  { value: "Powelton Village", lat: 39.961, lng: -75.196 },
  { value: "Cedar Park", lat: 39.948, lng: -75.217 },
  { value: "West Philly", lat: 39.96, lng: -75.225 },
  { value: "Rittenhouse", lat: 39.95, lng: -75.172 },
  { value: "Center City", lat: 39.953, lng: -75.165 },
  { value: "Graduate Hospital", lat: 39.943, lng: -75.177 },
  { value: "Fairmount", lat: 39.967, lng: -75.173 },
  { value: "Fishtown", lat: 39.972, lng: -75.134 },
  { value: "South Philly", lat: 39.925, lng: -75.169 },
] as const;

/** The area saved for a shared GPS location with no listed neighborhood close by. */
export const GPS_AREA = "Near my current location";

/** The area saved for a shared GPS location: "Near Spruce Hill", so others see a place, not a phrase. */
export function gpsArea(lat: number, lng: number): string {
  const place = nearestNeighborhood(lat, lng);
  return place ? `Near ${place}` : GPS_AREA;
}

/** Whether an area came from sharing GPS rather than picking or typing a place. */
export function isGpsArea(area: string): boolean {
  return area === GPS_AREA || NEIGHBORHOODS.some((n) => area === `Near ${n.value}`);
}

/** Whether a point is within about 8 km of campus, so a member who shares GPS from home over break can be warned. */
export function nearCampus(lat: number, lng: number): boolean {
  const campus = NEIGHBORHOODS[0];
  return Math.hypot((campus.lat - lat) * 111, (campus.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180)) <= 8;
}

/** The closest listed neighborhood within about 2 km, or null when none is that close. */
export function nearestNeighborhood(lat: number, lng: number): string | null {
  // Degrees of longitude are shorter away from the equator; this is close enough at city scale.
  const km = (place: { lat: number; lng: number }) => Math.hypot((place.lat - lat) * 111, (place.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180));
  const closest = [...NEIGHBORHOODS].sort((a, b) => km(a) - km(b))[0];
  return closest && km(closest) <= 2 ? closest.value : null;
}

/** Rounds a coordinate to a grid of about 300 m, so no one's exact address is stored. */
export function roundCoord(degrees: number): number {
  return (Math.round(degrees / 0.003) * 3) / 1000;
}

// ── Profiles ─────────────────────────────────────────────────────────────────

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const atLeastOne = <T extends readonly { value: string }[]>(options: T, message: string) =>
  z.array(z.enum(values(options))).min(1, message).max(options.length);

/** Where a member is: a GPS point (rounded), a neighborhood's center, or only a place name. */
export const MemberLocation = z
  .object({
    area: z.string().trim().min(1, "Share your location or pick a neighborhood.").max(LIMITS.shortText),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
  })
  .refine((l) => (l.lat === null) === (l.lng === null), { message: "Share your location again, or pick a neighborhood." });
export type MemberLocation = z.infer<typeof MemberLocation>;

/**
 * Everything the owner says about one pet. The profile holds it at setup and
 * `pets` saves one row per pet (pets.ts), so the two never drift apart.
 */
export const PetDetails = z.object({
  name: z.string().trim().min(1, "Add your pet's name.").max(LIMITS.name),
  kind: z.enum(values(PET_KINDS)),
  kindOther: optionalText(LIMITS.shortText),
  size: z.enum(values(PET_SIZES)),
  age: z.enum(values(PET_AGES)),
  energy: z.enum(values(ENERGY)),
  withPeople: z.enum(values(WITH_PEOPLE)),
  withAnimals: z.enum(values(WITH_ANIMALS)),
  alone: z.enum(values(ALONE)),
  specialCare: z.array(z.enum(values(SPECIAL_CARE))).max(SPECIAL_CARE.length),
  specialCareOther: optionalText(LIMITS.shortText),
  bites: z.boolean(),
  bitesDetails: optionalText(LIMITS.notes),
});
export type PetDetails = z.infer<typeof PetDetails>;

/** Why a pet's answers don't hang together, or null. Shared by the profile and a saved pet. */
export function petIssues(pet: PetDetails): { path: string[]; message: string }[] {
  const issues: { path: string[]; message: string }[] = [];
  if ((pet.kind === OTHER || pet.kind === "several") && !pet.kindOther) issues.push({ path: ["kindOther"], message: "Tell sitters what kind of pet." });
  if (pet.specialCare.includes(OTHER) && !pet.specialCareOther) issues.push({ path: ["specialCareOther"], message: "Describe the special care." });
  if (pet.bites && !pet.bitesDetails) issues.push({ path: ["bitesDetails"], message: "Say what happened, so sitters can prepare." });
  return issues;
}

export const OwnerProfile = z
  .object({
    role: z.literal("owner"),
    location: MemberLocation,
    pet: PetDetails,
    sitterGenderPref: z.enum(values(GENDER_PREFS)),
    /** Languages the owner would like their sitter to speak; added later, so empty when missing. */
    sitterLanguages: z.array(z.enum(values(LANGUAGES))).max(LANGUAGES.length).default([]),
  })
  .superRefine((p, ctx) => {
    for (const issue of petIssues(p.pet)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pet", ...issue.path], message: issue.message });
    }
  });
export type OwnerProfile = z.infer<typeof OwnerProfile>;

/**
 * A member's owner answers, whichever side they're on now. Switching sides
 * swaps `profile` and `other_profile` (members.ts), so an owner looking after
 * pets keeps their pet and home in `other_profile`.
 */
export function ownerSideOf(profile: unknown, otherProfile: unknown): OwnerProfile | null {
  for (const candidate of [profile, otherProfile]) {
    const parsed = OwnerProfile.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export const SitterProfile = z
  .object({
    role: z.literal("sitter"),
    location: MemberLocation,
    services: atLeastOne(SERVICES, "Pick at least one service."),
    petKinds: atLeastOne(SITTER_PET_KINDS, "Pick at least one kind of pet."),
    sizes: atLeastOne(PET_SIZES, "Pick the sizes you're comfortable with."),
    energy: atLeastOne(ENERGY, "Pick the energy levels you're comfortable with."),
    anxiousOk: z.boolean(),
    experience: z.array(z.enum(values(EXPERIENCE))).max(EXPERIENCE.length),
    travel: z.enum(values(TRAVEL)),
    availability: atLeastOne(AVAILABILITY, "Pick when you're usually free."),
    gender: z.enum(values(GENDERS)),
    showGender: z.boolean(),
    bio: z.string().trim().min(1, "Write a line or two about yourself.").max(LIMITS.notes),
    // Added later: profiles saved before it are taken as English.
    languages: atLeastOne(LANGUAGES, "Pick the languages you speak.").default(["english"]),
    boarding: z
      .object({
        homeType: z.enum(values(HOME_TYPES)),
        homeTypeOther: optionalText(LIMITS.shortText),
        hasYard: z.boolean(),
        otherPets: optionalText(LIMITS.shortText),
        housingAllowsPets: z.literal(true, { message: "Boarding needs housing that allows pets." }),
        roommatesAgree: z.literal(true, { message: "Check with your roommates before boarding." }),
      })
      .nullable(),
  })
  .superRefine((p, ctx) => {
    const boards = p.services.includes("boarding");
    if (boards && !p.boarding) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["boarding"], message: "Tell owners about your home for boarding." });
    }
    if (p.boarding?.homeType === OTHER && !p.boarding.homeTypeOther) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["boarding", "homeTypeOther"], message: "Describe your home." });
    }
    if (p.gender === "prefer_not" && p.showGender) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["showGender"], message: "There's no gender to show." });
    }
  });
export type SitterProfile = z.infer<typeof SitterProfile>;

export const PalsProfile = z.object({
  role: z.literal("pals"),
  location: MemberLocation,
  petName: optionalText(LIMITS.name),
  bio: optionalText(LIMITS.notes),
});
export type PalsProfile = z.infer<typeof PalsProfile>;

export type Profile = OwnerProfile | SitterProfile | PalsProfile;

const SCHEMAS = { owner: OwnerProfile, sitter: SitterProfile, pals: PalsProfile } as const;

/** Request survey answers taken from an owner's profile, so they don't describe their pet twice. */
export interface RequestStart {
  petName: string;
  petKind: OwnerProfile["pet"]["kind"];
  petKindOther: string;
  petDetails: string;
  area: string;
  notes: string;
  sitterGender: OwnerProfile["sitterGenderPref"];
  languages: Language[];
}

const ENERGY_WORDS: Record<Energy, string> = { low: "couch potato", medium: "moderate energy", high: "high energy" };

/** The owner's pet and neighborhood as a starting point for posting a request. */
export function requestStart(profile: OwnerProfile): RequestStart {
  const { pet, location } = profile;
  const lower = (options: readonly Option[], value: string) => labelOf(options, value).toLowerCase();
  const care = pet.specialCare.filter((c) => c !== OTHER).map((c) => labelOf(SPECIAL_CARE, c));
  if (pet.specialCareOther) care.push(pet.specialCareOther);
  // Only special care goes on the public request; temperament and bite history are shown to sitters who offer (petNotes).
  const notes = [care.length ? `Special care: ${care.join(", ")}.` : null];
  const area =
    isGpsArea(location.area) ? (location.lat !== null && location.lng !== null ? nearestNeighborhood(location.lat, location.lng) : null) : location.area;
  return {
    petName: pet.name,
    petKind: pet.kind,
    petKindOther: pet.kindOther ?? "",
    petDetails: [lower(PET_SIZES, pet.size), lower(PET_AGES, pet.age), ENERGY_WORDS[pet.energy]].join(", ").replace(/^./, (c) => c.toUpperCase()),
    area: area ?? "",
    notes: notes.filter(Boolean).join("\n").slice(0, LIMITS.notes),
    sitterGender: profile.sitterGenderPref,
    languages: [...profile.sitterLanguages],
  };
}

/** The pet's temperament and any bite history, in plain words. Shown only to the owner and sitters who have offered, never on the public request. */
export function petNotes(profile: OwnerProfile): string {
  return temperament(profile.pet);
}

/** One pet's temperament and any bite history, in plain words. */
export function temperament(pet: PetDetails): string {
  const lower = (options: readonly Option[], value: string) => labelOf(options, value).toLowerCase();
  return [
    `With new people: ${lower(WITH_PEOPLE, pet.withPeople)}. With other animals: ${lower(WITH_ANIMALS, pet.withAnimals)}. Alone: ${lower(ALONE, pet.alone)}.`,
    pet.bites ? `Has bitten or scratched someone before: ${pet.bitesDetails ?? ""}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A sitter's profile in plain words, for AI to introduce them in a message. Leaves out gender and location. */
export function aboutSitter(profile: SitterProfile): string {
  const list = (options: readonly Option[], values: readonly string[]) => values.map((value) => labelOf(options, value).toLowerCase()).join(", ");
  return [
    profile.bio,
    `Offers: ${list(SERVICES, profile.services)}.`,
    `Comfortable with: ${list(SITTER_PET_KINDS, profile.petKinds)}; sizes ${list(PET_SIZES, profile.sizes)}.`,
    profile.experience.length ? `Experience: ${list(EXPERIENCE, profile.experience)}.` : "No pet-sitting experience yet.",
    `Available: ${list(AVAILABILITY, profile.availability)}.`,
    `Speaks: ${profile.languages.map((l) => labelOf(LANGUAGES, l)).join(", ")}.`,
  ].join(" ");
}

/** The profile, or the first thing wrong with it. Server actions get browser input, so check it. */
export function checkProfile(input: unknown): Checked<Profile> {
  const role = (input as { role?: unknown } | null)?.role;
  if (typeof role !== "string" || !(role in SCHEMAS)) return { ok: false, error: "Choose how you'll use PennPaws." };
  const result = SCHEMAS[role as MemberRole].safeParse(input);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Check your answers and try again." };
  const profile = result.data;
  const { lat, lng } = profile.location;
  return {
    ok: true,
    value: { ...profile, location: { ...profile.location, lat: lat === null ? null : roundCoord(lat), lng: lng === null ? null : roundCoord(lng) } },
  };
}
