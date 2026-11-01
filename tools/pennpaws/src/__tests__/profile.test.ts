// First-time setup: the school email check and the profile survey for each
// role. No keys, no network, no database.

import { describe, it, expect } from "vitest";
import {
  GPS_AREA,
  LOCAL_TEST_SCHOOL,
  checkProfile,
  nearestNeighborhood,
  requestStart,
  roundCoord,
  schoolOf,
  verifySchool,
  type OwnerProfile,
  type SitterProfile,
} from "../profile.js";
import { checkDraft } from "../request.js";

const owner: OwnerProfile = {
  role: "owner",
  location: { area: "University City", lat: 39.951, lng: -75.192 },
  pet: {
    name: "Mochi",
    kind: "dog",
    kindOther: null,
    size: "medium",
    age: "adult",
    energy: "high",
    withPeople: "warms_up",
    withAnimals: "selective",
    alone: "bit_anxious",
    specialCare: [],
    specialCareOther: null,
    bites: false,
    bitesDetails: null,
  },
  sitterGenderPref: "none",
  sitterLanguages: ["mandarin"],
};

const sitter: SitterProfile = {
  role: "sitter",
  location: { area: "Near my current location", lat: 39.951, lng: -75.189 },
  services: ["walk", "drop_in"],
  petKinds: ["dogs"],
  sizes: ["small", "medium"],
  energy: ["medium", "high"],
  anxiousOk: true,
  experience: ["owned_dogs"],
  travel: "1",
  availability: ["weekends"],
  gender: "woman",
  showGender: false,
  bio: "Grew up with two labs.",
  languages: ["english", "spanish"],
  boarding: null,
};

const boarding = { homeType: "apartment", homeTypeOther: null, hasYard: false, otherPets: null, housingAllowsPets: true, roommatesAgree: true } as const;

describe("schoolOf", () => {
  it("returns the school for a .edu email, including school subdomains", () => {
    expect(schoolOf("ada@upenn.edu")).toBe("upenn.edu");
    expect(schoolOf("ada@wharton.upenn.edu")).toBe("upenn.edu");
    expect(schoolOf("Ada@SEAS.UPENN.EDU")).toBe("upenn.edu");
    expect(schoolOf("grace@nyu.edu")).toBe("nyu.edu");
  });

  it("rejects emails that aren't at a .edu domain", () => {
    for (const email of ["ada@gmail.com", "ada@edu.com", "ada@upenn.edu.com", "ada@edu", "@upenn.edu", "dev@localhost", "", null, undefined]) {
      expect(schoolOf(email)).toBeNull();
    }
  });
});

describe("verifySchool", () => {
  it("lets the local development user through only when allowed", () => {
    expect(verifySchool("dev@localhost", true)).toBe(LOCAL_TEST_SCHOOL);
    expect(verifySchool("dev@localhost", false)).toBeNull();
    expect(verifySchool("ada@upenn.edu", false)).toBe("upenn.edu");
  });

  it("accepts only Penn emails during the pilot", () => {
    expect(verifySchool("ada@wharton.upenn.edu", false)).toBe("upenn.edu");
    expect(verifySchool("grace@nyu.edu", false)).toBeNull();
    expect(verifySchool("ada@gmail.com", false)).toBeNull();
  });
});

describe("roundCoord", () => {
  it("rounds to a grid of about 300 m", () => {
    expect(roundCoord(39.95224)).toBe(39.951);
    expect(roundCoord(-75.19321)).toBe(-75.192);
    expect(Math.abs(roundCoord(39.95224) - 39.95224)).toBeLessThan(0.0016);
  });
});

describe("checkProfile", () => {
  it("accepts a complete owner and sitter", () => {
    expect(checkProfile(owner)).toEqual({ ok: true, value: owner });
    expect(checkProfile(sitter)).toEqual({ ok: true, value: sitter });
  });

  it("asks for a role first", () => {
    expect(checkProfile({ ...owner, role: "admin" })).toEqual({ ok: false, error: "Choose how you'll use PennPaws." });
    expect(checkProfile(null)).toMatchObject({ ok: false });
  });

  it("needs details when the pet has bitten or scratched someone", () => {
    const bites = { ...owner, pet: { ...owner.pet, bites: true } };
    expect(checkProfile(bites)).toEqual({ ok: false, error: "Say what happened, so sitters can prepare." });
    expect(checkProfile({ ...bites, pet: { ...bites.pet, bitesDetails: "Nipped at a stranger" } })).toMatchObject({ ok: true });
  });

  it("needs a home for boarding, in housing that allows pets", () => {
    const boards = { ...sitter, services: ["boarding"] };
    expect(checkProfile(boards)).toEqual({ ok: false, error: "Tell owners about your home for boarding." });
    expect(checkProfile({ ...boards, boarding })).toMatchObject({ ok: true });
    expect(checkProfile({ ...boards, boarding: { ...boarding, housingAllowsPets: false } })).toMatchObject({ ok: false });
  });

  it("rounds the location and needs both coordinates or neither", () => {
    const exact = { ...owner, location: { area: "Near my current location", lat: 39.95224, lng: -75.19321 } };
    expect(checkProfile(exact)).toMatchObject({ ok: true, value: { location: { lat: 39.951, lng: -75.192 } } });
    expect(checkProfile({ ...owner, location: { area: "Somewhere", lat: 39.95, lng: null } })).toMatchObject({ ok: false });
    expect(checkProfile({ ...owner, location: { area: " ", lat: null, lng: null } })).toEqual({ ok: false, error: "Share your location or pick a neighborhood." });
  });

  it("accepts a Pet Pals member with only a location", () => {
    expect(checkProfile({ role: "pals", location: { area: "Fishtown", lat: null, lng: null }, petName: null, bio: null })).toMatchObject({ ok: true });
  });
});

describe("requestStart", () => {
  it("fills in the pet and neighborhood from the owner's profile", () => {
    expect(requestStart(owner)).toEqual({
      petName: "Mochi",
      petKind: "dog",
      petKindOther: "",
      petDetails: "Medium, adult, high energy",
      area: "University City",
      notes: "With new people: warms up after a bit. With other animals: picky about friends. Alone: a bit anxious.",
      sitterGender: "none",
      languages: ["mandarin"],
    });
  });

  it("treats profiles saved before languages existed as no preference (owners) and English (sitters)", () => {
    const { sitterLanguages: _owner, ...oldOwner } = owner;
    const { languages: _sitter, ...oldSitter } = sitter;
    expect(checkProfile(oldOwner)).toMatchObject({ ok: true, value: { sitterLanguages: [] } });
    expect(checkProfile(oldSitter)).toMatchObject({ ok: true, value: { languages: ["english"] } });
    expect(checkProfile({ ...sitter, languages: [] })).toEqual({ ok: false, error: "Pick the languages you speak." });
  });

  it("adds special care and bite history to the notes", () => {
    const withCare: OwnerProfile = {
      ...owner,
      pet: { ...owner.pet, specialCare: ["medication", "other"], specialCareOther: "Eye drops", bites: true, bitesDetails: "Nipped at a stranger" },
    };
    expect(requestStart(withCare).notes).toContain(
      "Special care: Medication, Eye drops.\nHas bitten or scratched someone before: Nipped at a stranger",
    );
  });

  it("names the nearest neighborhood for a GPS location, and nothing when none is close", () => {
    expect(nearestNeighborhood(39.951, -75.192)).toBe("University City");
    expect(nearestNeighborhood(40.713, -74.006)).toBeNull();
    expect(requestStart({ ...owner, location: { area: GPS_AREA, lat: 39.951, lng: -75.192 } }).area).toBe("University City");
    expect(requestStart({ ...owner, location: { area: GPS_AREA, lat: 40.713, lng: -74.006 } }).area).toBe("");
  });

  it("starts a request that passes the request checks once the rest is answered", () => {
    const start = requestStart(owner);
    const draft = {
      ...start,
      petKindOther: null,
      photo: null,
      weekly: true,
      startsOn: null,
      endsOn: null,
      frequency: "once_daily",
      frequencyOther: null,
      tasks: ["walks"],
      tasksOther: null,
      access: "in_person",
      accessOther: null,
      pay: "$20 a visit",
      vet: null,
    };
    expect(checkDraft(draft)).toMatchObject({ ok: true });
  });
});
