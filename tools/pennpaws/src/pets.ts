// An owner's saved pets: one row per pet, so posting a request means picking
// pets instead of answering the same questions again (R3b, R43). The answers
// are PetDetails, the same shape the profile holds, so the pet someone entered
// at setup becomes their first saved pet without being re-asked.
//
// Callers pass the database client (toolSql("pennpaws")). Photos are data URLs,
// kept under LIMITS.photo, as on requests.

import { z } from "@penntools/core/ai";
import type { Sql } from "postgres";
import { PetDetails, SPECIAL_CARE, petIssues, requestStart, temperament, type OwnerProfile, type RequestStart } from "./profile.js";
import { LIMITS, OTHER, labelOf } from "./survey.js";

/**
 * The details an owner may not want on a public request. Private by default:
 * a sitter reads them once the booking is agreed. The owner can share any of
 * them sooner, since a condition or a diet can decide whether someone is able
 * to take the job at all.
 */
export const PRIVATE_FIELDS = [
  { value: "breed", label: "Breed" },
  { value: "diet", label: "Food and dietary needs" },
  { value: "health", label: "Health conditions" },
] as const;
export type PrivateField = (typeof PRIVATE_FIELDS)[number]["value"];

export const SavedPet = PetDetails.extend({
  photo: z.string().max(LIMITS.photo, "That photo is too large.").startsWith("data:image/").nullable().default(null),
  breed: z.string().trim().max(LIMITS.shortText).nullable().default(null),
  diet: z.string().trim().max(LIMITS.notes).nullable().default(null),
  health: z.string().trim().max(LIMITS.notes).nullable().default(null),
  /** Which of the private fields this owner shows sitters before a booking is agreed. */
  sharedEarly: z
    .array(z.enum(["breed", "diet", "health"]))
    .max(PRIVATE_FIELDS.length)
    .default([]),
}).superRefine((pet, ctx) => {
  for (const issue of petIssues(pet)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
});
export type SavedPet = z.infer<typeof SavedPet>;

/** How far along the reader is, which decides what they see of a pet. */
export type PetStage = "public" | "offered" | "booked";

/**
 * The private details this reader may see. The owner sees all of them; a
 * booked sitter sees all of them; anyone earlier sees only what the owner
 * chose to share. An empty field is left out either way.
 */
export function visiblePrivateDetails(pet: SavedPet, stage: PetStage): { field: PrivateField; label: string; value: string }[] {
  return PRIVATE_FIELDS.flatMap(({ value: field, label }) => {
    const value = pet[field];
    if (!value) return [];
    if (stage !== "booked" && !pet.sharedEarly.includes(field)) return [];
    return [{ field, label, value }];
  });
}

/** A saved pet with the id My Pets and the survey refer to it by. */
export interface Pet extends SavedPet {
  id: string;
}

/** Why these answers can't be saved, or null. */
export function checkPet(value: unknown): { ok: true; value: SavedPet } | { ok: false; error: string } {
  const result = SavedPet.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Check the answers and try again." };
}

interface PetRow {
  id: string;
  name: string;
  kind: string;
  kind_other: string | null;
  size: string;
  age: string;
  energy: string;
  with_people: string;
  with_animals: string;
  alone: string;
  special_care: string[];
  special_care_other: string | null;
  bites: boolean;
  bites_details: string | null;
  photo: string | null;
  breed: string | null;
  diet: string | null;
  health: string | null;
  shared_early: string[];
}

const COLUMNS = (sql: Sql) => sql`
  id, name, kind, kind_other, size, age, energy, with_people, with_animals,
  alone, special_care, special_care_other, bites, bites_details, photo,
  breed, diet, health, shared_early
`;

/** A row as the rest of the tool sees it, or null when saved answers no longer pass. */
function toPet(row: PetRow): Pet | null {
  const checked = checkPet({
    name: row.name,
    kind: row.kind,
    kindOther: row.kind_other,
    size: row.size,
    age: row.age,
    energy: row.energy,
    withPeople: row.with_people,
    withAnimals: row.with_animals,
    alone: row.alone,
    specialCare: row.special_care,
    specialCareOther: row.special_care_other,
    bites: row.bites,
    bitesDetails: row.bites_details,
    photo: row.photo,
    breed: row.breed,
    diet: row.diet,
    health: row.health,
    sharedEarly: row.shared_early,
  });
  return checked.ok ? { id: row.id, ...checked.value } : null;
}

/** An owner's pets, oldest first, so My Pets keeps a steady order. */
export async function listPets(sql: Sql, ownerId: string): Promise<Pet[]> {
  const rows = await sql<PetRow[]>`SELECT ${COLUMNS(sql)} FROM pets WHERE owner_id = ${ownerId} ORDER BY created_at, id`;
  return rows.map(toPet).filter((pet): pet is Pet => pet !== null);
}

/** One of this owner's pets, or null. Checks the owner, so ids can't be guessed across accounts. */
export async function getPet(sql: Sql, ownerId: string, petId: string): Promise<Pet | null> {
  const [row] = await sql<PetRow[]>`SELECT ${COLUMNS(sql)} FROM pets WHERE id = ${petId} AND owner_id = ${ownerId}`;
  return row ? toPet(row) : null;
}

/** Several of this owner's pets by id, in the order they were saved. Ids that aren't theirs are left out. */
export async function petsByIds(sql: Sql, ownerId: string, petIds: string[]): Promise<Pet[]> {
  if (petIds.length === 0) return [];
  const rows = await sql<PetRow[]>`
    SELECT ${COLUMNS(sql)} FROM pets WHERE owner_id = ${ownerId} AND id IN ${sql(petIds)} ORDER BY created_at, id
  `;
  return rows.map(toPet).filter((pet): pet is Pet => pet !== null);
}

/** Adds a pet and returns its id. */
export async function addPet(sql: Sql, ownerId: string, pet: SavedPet): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO pets (owner_id, name, kind, kind_other, size, age, energy, with_people, with_animals,
                      alone, special_care, special_care_other, bites, bites_details, photo,
                      breed, diet, health, shared_early)
    VALUES (${ownerId}, ${pet.name}, ${pet.kind}, ${pet.kindOther}, ${pet.size}, ${pet.age}, ${pet.energy},
            ${pet.withPeople}, ${pet.withAnimals}, ${pet.alone}, ${pet.specialCare}, ${pet.specialCareOther},
            ${pet.bites}, ${pet.bitesDetails}, ${pet.photo},
            ${pet.breed}, ${pet.diet}, ${pet.health}, ${pet.sharedEarly})
    RETURNING id
  `;
  return row!.id;
}

/** Replaces one of this owner's pets. Returns false when the pet isn't theirs. */
export async function updatePet(sql: Sql, ownerId: string, petId: string, pet: SavedPet): Promise<boolean> {
  const rows = await sql`
    UPDATE pets SET name = ${pet.name}, kind = ${pet.kind}, kind_other = ${pet.kindOther}, size = ${pet.size},
                    age = ${pet.age}, energy = ${pet.energy}, with_people = ${pet.withPeople},
                    with_animals = ${pet.withAnimals}, alone = ${pet.alone}, special_care = ${pet.specialCare},
                    special_care_other = ${pet.specialCareOther}, bites = ${pet.bites},
                    bites_details = ${pet.bitesDetails}, photo = ${pet.photo}, breed = ${pet.breed},
                    diet = ${pet.diet}, health = ${pet.health}, shared_early = ${pet.sharedEarly},
                    updated_at = NOW()
    WHERE id = ${petId} AND owner_id = ${ownerId}
  `;
  return rows.count > 0;
}

/** Removes one of this owner's pets. Requests already posted keep their own copy of the answers. */
export async function removePet(sql: Sql, ownerId: string, petId: string): Promise<boolean> {
  const rows = await sql`DELETE FROM pets WHERE id = ${petId} AND owner_id = ${ownerId}`;
  return rows.count > 0;
}

/**
 * Gives an owner their first saved pet from the one they entered at setup, so
 * nobody answers those questions twice. Does nothing once they have any pet,
 * which also makes it safe to call on every visit to My Pets.
 */
export async function savePetFromProfile(sql: Sql, ownerId: string, pet: PetDetails): Promise<Pet | null> {
  const [existing] = await sql<{ id: string }[]>`SELECT id FROM pets WHERE owner_id = ${ownerId} LIMIT 1`;
  if (existing) return null;
  const checked = checkPet({ ...pet, photo: null });
  if (!checked.ok) return null;
  const id = await addPet(sql, ownerId, checked.value);
  return getPet(sql, ownerId, id);
}

// ── Posting from saved pets (R43) ────────────────────────────────────────────

/** Survey answers from the pets an owner picked, so only dates, care and pay are left to answer. */
export interface PetsStart extends RequestStart {
  photo: string | null;
  petIds: string[];
}

/** "a cat", "a dog", or the owner's own words for anything else. */
function kindWords(pet: PetDetails): string {
  if (pet.kind === "dog" || pet.kind === "cat") return `a ${pet.kind}`;
  return pet.kindOther ?? "a pet";
}

/** "Mochi and Bao", "Mochi, Bao and Tofu". */
function joinNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Special care plus anything the owner chose to share before booking, as notes for the public request. */
function publicNotes(pet: SavedPet): string[] {
  const care = pet.specialCare.filter((c) => c !== OTHER).map((c) => labelOf(SPECIAL_CARE, c));
  if (pet.specialCareOther) care.push(pet.specialCareOther);
  return [
    care.length ? `Special care: ${care.join(", ")}.` : null,
    ...visiblePrivateDetails(pet, "public")
      .filter((d) => d.field !== "breed")
      .map((d) => `${d.label}: ${d.value}`),
  ].filter((line): line is string => line !== null);
}

/**
 * The request answers for these pets: who they are, the owner's area and
 * sitter wishes from their profile. One pet reads as that pet; several become
 * one request for "more than one", naming each. Breed, diet and health stay
 * off unless the owner shared them early.
 */
export function requestStartFromPets(pets: readonly Pet[], profile: OwnerProfile): PetsStart {
  const [first] = pets;
  if (!first) throw new Error("Pick at least one pet.");
  const base = requestStart({ ...profile, pet: first });
  const photo = pets.find((p) => p.photo)?.photo ?? null;
  const petIds = pets.map((p) => p.id);
  if (pets.length === 1) {
    const breed = first.sharedEarly.includes("breed") ? first.breed : null;
    return {
      ...base,
      petDetails: [breed, base.petDetails].filter(Boolean).join(", ").slice(0, LIMITS.shortText),
      notes: publicNotes(first).join("\n").slice(0, LIMITS.notes),
      photo,
      petIds,
    };
  }
  return {
    ...base,
    petName: joinNames(pets.map((p) => p.name)).slice(0, LIMITS.name),
    petKind: "several",
    petKindOther: joinNames(pets.map((p) => `${p.name}, ${kindWords(p)}`)).slice(0, LIMITS.shortText),
    petDetails: "",
    notes: pets
      .flatMap((p) => publicNotes(p).map((line) => `${p.name}. ${line}`))
      .join("\n")
      .slice(0, LIMITS.notes),
    photo,
    petIds,
  };
}

/**
 * What a sitter who has offered, or is booked, reads about the pets on a
 * request: temperament and bite history, and the private details this stage
 * allows. Named per pet when there are several.
 */
export function privatePetNotes(pets: readonly SavedPet[], stage: Exclude<PetStage, "public">): string {
  return pets
    .map((pet) => {
      const lines = [temperament(pet), ...visiblePrivateDetails(pet, stage).map((d) => `${d.label}: ${d.value}`)];
      return pets.length > 1 ? `${pet.name}\n${lines.join("\n")}` : lines.join("\n");
    })
    .join("\n\n");
}
