import { describe, it, expect } from "vitest";
import { fitOf, milesBetween, pointOf, scoreMatch, type OwnerContext } from "../match.js";
import type { OwnerProfile, SitterProfile } from "../profile.js";
import type { RequestDraft } from "../request.js";

const sitter: SitterProfile = {
  role: "sitter",
  location: { area: "Spruce Hill", lat: 39.951, lng: -75.207 },
  services: ["walk", "drop_in"],
  petKinds: ["dogs", "cats"],
  sizes: ["small", "medium"],
  energy: ["low", "medium"],
  anxiousOk: false,
  experience: ["owned_cats"],
  travel: "1",
  availability: ["weekday_evenings", "weekends"],
  gender: "man",
  showGender: true,
  bio: "Penn student.",
  boarding: null,
};
const here = pointOf(sitter.location);

const cat: RequestDraft = {
  petName: "Tofu",
  petKind: "cat",
  petKindOther: null,
  petDetails: null,
  photo: null,
  weekly: false,
  startsOn: "2026-11-07",
  endsOn: "2026-11-08",
  frequency: "once_daily",
  frequencyOther: null,
  tasks: ["feeding", "litter"],
  tasksOther: null,
  access: "in_person",
  accessOther: null,
  pay: "$20 a visit",
  area: "Spruce Hill",
  vet: null,
  notes: null,
};

const ownerPet = (pet: Partial<OwnerProfile["pet"]>, pref: OwnerProfile["sitterGenderPref"] = "none"): OwnerContext => ({
  point: { lat: 39.952, lng: -75.208 },
  profile: {
    role: "owner",
    location: { area: "Spruce Hill", lat: 39.952, lng: -75.208 },
    pet: {
      name: "Tofu",
      kind: "cat",
      kindOther: null,
      size: "small",
      age: "adult",
      energy: "low",
      withPeople: "loves_everyone",
      withAnimals: "friendly",
      alone: "fine",
      specialCare: [],
      specialCareOther: null,
      bites: false,
      bitesDetails: null,
      ...pet,
    },
    sitterGenderPref: pref,
  },
});

describe("matching", () => {
  it("rates a nearby weekend cat visit as a great match, with distance first", () => {
    const match = scoreMatch(sitter, here, "r1", cat, ownerPet({}));
    expect(match.fit).toBe("great");
    expect(match.reasons[0]).toMatch(/mi away/);
    expect(match.concerns).toEqual([]);
  });

  it("flags a pet kind the sitter didn't list", () => {
    const match = scoreMatch({ ...sitter, petKinds: ["dogs"] }, here, "r1", cat, ownerPet({}));
    expect(match.concerns[0]).toBe("You didn't list cats");
    expect(match.fit).not.toBe("great");
  });

  it("counts distance past the sitter's range against the match", () => {
    const far: OwnerContext = { ...ownerPet({}), point: { lat: 39.972, lng: -75.134 } };
    const match = scoreMatch(sitter, here, "r1", cat, far);
    expect(match.concerns[0]).toMatch(/past your 1 mile/);
  });

  it("uses a neighborhood named in the request when the owner has no location", () => {
    const match = scoreMatch(sitter, here, "r1", { ...cat, area: "Fishtown, near Girard" }, { point: null, profile: null });
    expect(match.miles).toBeGreaterThan(3);
  });

  it("respects the owner's sitter preference", () => {
    const match = scoreMatch(sitter, here, "r1", cat, ownerPet({}, "woman"));
    expect(match.concerns).toContain("The owner prefers a woman sitter");
  });

  it("needs injection experience for a pet that gets injections", () => {
    const needs = ownerPet({ specialCare: ["injections"] });
    expect(scoreMatch(sitter, here, "r1", cat, needs).concerns[0]).toMatch(/injections/);
    const ready = scoreMatch({ ...sitter, experience: ["injections"] }, here, "r1", cat, needs);
    expect(ready.reasons).toContain("You've given injections");
  });

  it("asks for overnights and walks the sitter offers", () => {
    const overnight = scoreMatch(sitter, here, "r1", { ...cat, frequency: "overnight" }, ownerPet({}));
    expect(overnight.concerns).toContain("Needs overnights, which you don't offer");
  });

  it("reads something else as small pets", () => {
    const birds = { ...cat, petKind: "other" as const, petKindOther: "Two parakeets" };
    expect(scoreMatch(sitter, here, "r1", birds, { point: null, profile: null }).concerns).toContain("You didn't list small pets");
  });

  it("works out fit bands and distances", () => {
    expect([fitOf(90), fitOf(70), fitOf(50), fitOf(10)]).toEqual(["great", "good", "maybe", "poor"]);
    expect(milesBetween({ lat: 39.952, lng: -75.193 }, { lat: 39.95, lng: -75.172 })).toBeCloseTo(1.1, 1);
  });
});
