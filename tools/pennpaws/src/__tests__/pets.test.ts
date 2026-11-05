// What a reader may see of a pet at each stage. No database: this is the rule
// on its own, because getting it wrong leaks a health condition to everyone
// browsing.

import { describe, it, expect } from "vitest";
import { checkPet, privatePetNotes, requestStartFromPets, visiblePrivateDetails, type Pet, type SavedPet } from "../pets.js";
import type { OwnerProfile } from "../profile.js";

const base = {
  name: "Mochi",
  kind: "dog",
  kindOther: null,
  size: "medium",
  age: "adult",
  energy: "medium",
  withPeople: "warms_up",
  withAnimals: "friendly",
  alone: "fine",
  specialCare: [],
  specialCareOther: null,
  bites: false,
  bitesDetails: null,
  photo: null,
  breed: "Shiba Inu",
  diet: "No chicken, it gives her hives.",
  health: "Epilepsy, one tablet morning and night.",
  sharedEarly: [],
} satisfies SavedPet;

const labels = (pet: SavedPet, stage: Parameters<typeof visiblePrivateDetails>[1]) => visiblePrivateDetails(pet, stage).map((d) => d.field);

describe("what a sitter sees of a pet", () => {
  it("keeps breed, diet and health private until the booking is agreed", () => {
    expect(labels(base, "public")).toEqual([]);
    expect(labels(base, "offered")).toEqual([]);
    expect(labels(base, "booked")).toEqual(["breed", "diet", "health"]);
  });

  it("shares only what the owner chose to share early", () => {
    const shared: SavedPet = { ...base, sharedEarly: ["health"] };
    expect(labels(shared, "public")).toEqual(["health"]);
    expect(labels(shared, "offered")).toEqual(["health"]);
    // Choosing to share early never hides the rest from a booked sitter.
    expect(labels(shared, "booked")).toEqual(["breed", "diet", "health"]);
  });

  it("leaves out a field the owner never filled in", () => {
    const sparse: SavedPet = { ...base, breed: null, diet: null, sharedEarly: ["breed", "diet", "health"] };
    expect(labels(sparse, "public")).toEqual(["health"]);
    expect(labels(sparse, "booked")).toEqual(["health"]);
  });

  it("carries the private fields through a save", () => {
    const checked = checkPet({ ...base, sharedEarly: ["diet"] });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value).toMatchObject({ breed: "Shiba Inu", sharedEarly: ["diet"] });
    // They are optional: a pet with none of them still saves.
    expect(checkPet({ ...base, breed: null, diet: null, health: null }).ok).toBe(true);
  });
});

describe("posting from saved pets (R43)", () => {
  const profile: OwnerProfile = {
    role: "owner",
    location: { area: "Spruce Hill", lat: 39.951, lng: -75.207 },
    pet: { ...base, photo: undefined } as unknown as OwnerProfile["pet"],
    sitterGenderPref: "none",
    sitterLanguages: ["mandarin"],
  };
  const mochi: Pet = { ...base, id: "11111111-1111-4111-8111-111111111111", photo: "data:image/png;base64,AAAA" };
  const bao: Pet = { ...base, id: "22222222-2222-4222-8222-222222222222", name: "Bao", kind: "cat", breed: null, diet: null, health: null };

  it("carries one pet in, keeping breed, food and health off until shared", () => {
    const start = requestStartFromPets([mochi], profile);
    expect(start).toMatchObject({ petName: "Mochi", petKind: "dog", area: "Spruce Hill", languages: ["mandarin"], photo: mochi.photo, petIds: [mochi.id] });
    expect(`${start.petDetails} ${start.notes}`).not.toMatch(/Shiba|chicken|Epilepsy/);

    const shared = requestStartFromPets([{ ...mochi, sharedEarly: ["breed", "diet"] }], profile);
    expect(shared.petDetails).toMatch(/^Shiba Inu, /);
    expect(shared.notes).toContain("Food and dietary needs: No chicken");
    expect(shared.notes).not.toContain("Epilepsy");
  });

  it("makes several pets one request that names each", () => {
    const start = requestStartFromPets([mochi, bao], profile);
    expect(start).toMatchObject({ petName: "Mochi and Bao", petKind: "several", petKindOther: "Mochi, a dog and Bao, a cat", petIds: [mochi.id, bao.id] });
    expect(start.photo).toBe(mochi.photo);
  });

  it("shows a sitter who offered only what was shared, and a booked sitter everything", () => {
    const offered = privatePetNotes([mochi, bao], "offered");
    expect(offered).toContain("Mochi\nWith new people");
    expect(offered).not.toMatch(/Epilepsy|Shiba/);
    expect(privatePetNotes([mochi], "booked")).toContain("Health conditions: Epilepsy");
  });
});
