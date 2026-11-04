// An owner's saved pets: one row per pet, so posting a request means picking
// pets instead of answering the same questions again (R3b, R43). The answers
// are PetDetails, the same shape the profile holds, so the pet someone entered
// at setup becomes their first saved pet without being re-asked.
//
// Callers pass the database client (toolSql("pennpaws")). Photos are data URLs,
// kept under LIMITS.photo, as on requests.

import { z } from "@penntools/core/ai";
import type { Sql } from "postgres";
import { PetDetails, petIssues } from "./profile.js";
import { LIMITS } from "./survey.js";

export const SavedPet = PetDetails.extend({
  photo: z.string().max(LIMITS.photo, "That photo is too large.").startsWith("data:image/").nullable().default(null),
}).superRefine((pet, ctx) => {
  for (const issue of petIssues(pet)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
});
export type SavedPet = z.infer<typeof SavedPet>;

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
}

const COLUMNS = (sql: Sql) => sql`
  id, name, kind, kind_other, size, age, energy, with_people, with_animals,
  alone, special_care, special_care_other, bites, bites_details, photo
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
                      alone, special_care, special_care_other, bites, bites_details, photo)
    VALUES (${ownerId}, ${pet.name}, ${pet.kind}, ${pet.kindOther}, ${pet.size}, ${pet.age}, ${pet.energy},
            ${pet.withPeople}, ${pet.withAnimals}, ${pet.alone}, ${pet.specialCare}, ${pet.specialCareOther},
            ${pet.bites}, ${pet.bitesDetails}, ${pet.photo})
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
                    bites_details = ${pet.bitesDetails}, photo = ${pet.photo}, updated_at = NOW()
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
