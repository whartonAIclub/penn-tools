// What a reader may see of a pet at each stage. No database: this is the rule
// on its own, because getting it wrong leaks a health condition to everyone
// browsing.

import { describe, it, expect } from "vitest";
import { checkPet, visiblePrivateDetails, type SavedPet } from "../pets.js";

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
