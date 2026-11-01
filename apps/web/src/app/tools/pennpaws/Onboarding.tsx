"use client";

// First-time setup, one step at a time: pick a role, pass the school email
// check, then answer that role's survey and say roughly where you are. Owners
// describe their pet and sitters what they can take on, on the same scales,
// so matching can compare them later. My profile opens it on the saved
// answers, where each line has an Edit link back to its question.

import { Fragment, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ALONE,
  AVAILABILITY,
  ENERGY,
  EXPERIENCE,
  GPS_AREA,
  GENDERS,
  GENDER_PREFS,
  HOME_TYPES,
  LANGUAGES,
  LIMITS,
  LOCAL_TEST_SCHOOL,
  NEIGHBORHOODS,
  OTHER,
  PET_AGES,
  PET_KINDS,
  PET_SIZES,
  ROLES,
  SERVICES,
  SITTER_PET_KINDS,
  SPECIAL_CARE,
  TRAVEL,
  WITH_ANIMALS,
  WITH_PEOPLE,
  checkProfile,
  labelOf,
  roundCoord,
  type Alone,
  type Availability,
  type Energy,
  type Experience,
  type Gender,
  type GenderPref,
  type HomeType,
  type Language,
  type MemberRole,
  type Option,
  type PetAge,
  type PetKind,
  type PetSize,
  type Profile,
  type Service,
  type SitterPetKind,
  type SpecialCare,
  type Travel,
  type WithAnimals,
  type WithPeople,
} from "@penntools/tool-pennpaws";
import { saveProfile } from "./actions";
import { CheckIcon } from "./PennPaws";
import { Choices, Continue, TextField } from "./Survey";
import styles from "./PennPaws.module.css";

interface Form {
  role: MemberRole | null;
  area: string;
  lat: number | null;
  lng: number | null;
  // Owners: their pet. Pet Pals use petName too.
  petName: string;
  petKind: PetKind | null;
  petKindOther: string;
  size: PetSize | null;
  age: PetAge | null;
  energy: Energy | null;
  withPeople: WithPeople | null;
  withAnimals: WithAnimals | null;
  alone: Alone | null;
  specialCare: SpecialCare[];
  specialCareOther: string;
  bites: boolean | null;
  bitesDetails: string;
  sitterGenderPref: GenderPref | null;
  sitterLanguages: Language[];
  // Sitters. Pet Pals use bio too.
  languages: Language[];
  services: Service[];
  petKinds: SitterPetKind[];
  sizes: PetSize[];
  energies: Energy[];
  anxiousOk: boolean | null;
  experience: Experience[];
  travel: Travel | null;
  availability: Availability[];
  gender: Gender | null;
  showGender: boolean;
  bio: string;
  homeType: HomeType | null;
  homeTypeOther: string;
  hasYard: boolean | null;
  otherPets: string;
  housingAllowsPets: boolean;
  roommatesAgree: boolean;
}

const EMPTY: Form = {
  role: null,
  area: "",
  lat: null,
  lng: null,
  petName: "",
  petKind: null,
  petKindOther: "",
  size: null,
  age: null,
  energy: null,
  withPeople: null,
  withAnimals: null,
  alone: null,
  specialCare: [],
  specialCareOther: "",
  bites: null,
  bitesDetails: "",
  sitterGenderPref: null,
  sitterLanguages: [],
  languages: [],
  services: [],
  petKinds: [],
  sizes: [],
  energies: [],
  anxiousOk: null,
  experience: [],
  travel: null,
  availability: [],
  gender: null,
  showGender: false,
  bio: "",
  homeType: null,
  homeTypeOther: "",
  hasYard: null,
  otherPets: "",
  housingAllowsPets: false,
  roommatesAgree: false,
};

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

type Step =
  | "role"
  | "verify"
  | "pet"
  | "personality"
  | "care"
  | "preference"
  | "services"
  | "comfort"
  | "experience"
  | "about"
  | "home"
  | "pals"
  | "location"
  | "review";

const TITLES: Record<Step, string> = {
  role: "how you'll use PennPaws",
  verify: "school email",
  pet: "your pet",
  personality: "personality",
  care: "care and safety",
  preference: "your sitter",
  services: "what you offer",
  comfort: "pets you're comfortable with",
  experience: "experience and schedule",
  about: "about you",
  home: "your home",
  pals: "about you",
  location: "where you are",
  review: "review",
};

/** The steps for the role chosen so far. Boarding adds a step about the sitter's home. */
function stepsFor(f: Form): Step[] {
  const survey: Step[] =
    f.role === "owner"
      ? ["pet", "personality", "care", "preference"]
      : f.role === "sitter"
        ? ["services", "comfort", "experience", "about", ...(f.services.includes("boarding") ? (["home"] as const) : [])]
        : f.role === "pals"
          ? ["pals"]
          : [];
  return ["role", "verify", ...survey, "location", "review"];
}

const orNull = (text: string) => (text.trim() ? text.trim() : null);
const needsKindText = (kind: PetKind | null) => kind === OTHER || kind === "several";
const yesNo = (value: boolean | null) => (value === null ? null : value ? "yes" : "no");
const labelsOf = (options: readonly Option[], values: readonly string[]) => values.map((value) => labelOf(options, value)).join(", ");

/** The profile to check and save, built from the answers for the chosen role. */
function toProfile(f: Form): unknown {
  const location = { area: f.area.trim(), lat: f.lat, lng: f.lng };
  if (f.role === "owner") {
    return {
      role: "owner",
      location,
      pet: {
        name: f.petName.trim(),
        kind: f.petKind,
        kindOther: needsKindText(f.petKind) ? orNull(f.petKindOther) : null,
        size: f.size,
        age: f.age,
        energy: f.energy,
        withPeople: f.withPeople,
        withAnimals: f.withAnimals,
        alone: f.alone,
        specialCare: f.specialCare,
        specialCareOther: f.specialCare.includes(OTHER) ? orNull(f.specialCareOther) : null,
        bites: f.bites,
        bitesDetails: f.bites ? orNull(f.bitesDetails) : null,
      },
      sitterGenderPref: f.sitterGenderPref,
      sitterLanguages: f.sitterLanguages,
    };
  }
  if (f.role === "sitter") {
    return {
      role: "sitter",
      location,
      services: f.services,
      petKinds: f.petKinds,
      sizes: f.sizes,
      energy: f.energies,
      anxiousOk: f.anxiousOk,
      experience: f.experience,
      travel: f.travel,
      availability: f.availability,
      gender: f.gender,
      showGender: f.gender !== "prefer_not" && f.showGender,
      bio: f.bio.trim(),
      languages: f.languages,
      boarding: f.services.includes("boarding")
        ? {
            homeType: f.homeType,
            homeTypeOther: f.homeType === OTHER ? orNull(f.homeTypeOther) : null,
            hasYard: f.hasYard,
            otherPets: orNull(f.otherPets),
            housingAllowsPets: f.housingAllowsPets,
            roommatesAgree: f.roommatesAgree,
          }
        : null,
    };
  }
  return { role: f.role, location, petName: orNull(f.petName), bio: orNull(f.bio) };
}

/** The answers in a saved profile, so members can change them. */
function fromProfile(p: Profile | null): Form {
  if (!p) return EMPTY;
  const base: Form = { ...EMPTY, role: p.role, area: p.location.area, lat: p.location.lat, lng: p.location.lng };
  switch (p.role) {
    case "owner":
      return {
        ...base,
        petName: p.pet.name,
        petKind: p.pet.kind,
        petKindOther: p.pet.kindOther ?? "",
        size: p.pet.size,
        age: p.pet.age,
        energy: p.pet.energy,
        withPeople: p.pet.withPeople,
        withAnimals: p.pet.withAnimals,
        alone: p.pet.alone,
        specialCare: [...p.pet.specialCare],
        specialCareOther: p.pet.specialCareOther ?? "",
        bites: p.pet.bites,
        bitesDetails: p.pet.bitesDetails ?? "",
        sitterGenderPref: p.sitterGenderPref,
        sitterLanguages: [...p.sitterLanguages],
      };
    case "sitter":
      return {
        ...base,
        services: [...p.services],
        petKinds: [...p.petKinds],
        sizes: [...p.sizes],
        energies: [...p.energy],
        anxiousOk: p.anxiousOk,
        experience: [...p.experience],
        travel: p.travel,
        availability: [...p.availability],
        gender: p.gender,
        showGender: p.showGender,
        bio: p.bio,
        languages: [...p.languages],
        homeType: p.boarding?.homeType ?? null,
        homeTypeOther: p.boarding?.homeTypeOther ?? "",
        hasYard: p.boarding?.hasYard ?? null,
        otherPets: p.boarding?.otherPets ?? "",
        housingAllowsPets: p.boarding !== null,
        roommatesAgree: p.boarding !== null,
      };
    case "pals":
      return { ...base, petName: p.petName ?? "", bio: p.bio ?? "" };
  }
}

/** What still needs an answer before leaving `step`, or null. */
function problem(step: Step, f: Form, school: string | null): string | null {
  const all = "Answer each question to continue.";
  switch (step) {
    case "role":
      return f.role ? null : "Choose one to continue.";
    case "verify":
      return school ? null : "Sign in with your school email to continue.";
    case "pet":
      if (!f.petName.trim()) return "Add your pet's name.";
      if (!f.petKind) return "Choose what kind of pet.";
      if (needsKindText(f.petKind) && !f.petKindOther.trim()) return "Tell sitters what kind of pet.";
      return f.size && f.age ? null : all;
    case "personality":
      return f.energy && f.withPeople && f.withAnimals && f.alone ? null : all;
    case "care":
      if (f.specialCare.includes(OTHER) && !f.specialCareOther.trim()) return "Describe the special care.";
      if (f.bites === null) return "Let sitters know whether your pet has bitten or scratched anyone.";
      return f.bites && !f.bitesDetails.trim() ? "Say what happened, so sitters can prepare." : null;
    case "preference":
      return f.sitterGenderPref ? null : "Choose one to continue.";
    case "services":
      if (f.services.length === 0) return "Pick at least one service.";
      return f.petKinds.length ? null : "Pick at least one kind of pet.";
    case "comfort":
      return f.sizes.length && f.energies.length && f.anxiousOk !== null ? null : all;
    case "experience":
      if (!f.travel) return "Choose how far you'll travel.";
      return f.availability.length ? null : "Pick when you're usually free.";
    case "about":
      if (!f.gender) return "Choose an option. Prefer not to say is fine.";
      if (f.languages.length === 0) return "Pick the languages you speak.";
      return f.bio.trim() ? null : "Write a line or two about yourself.";
    case "home":
      if (!f.homeType || f.hasYard === null) return all;
      if (f.homeType === OTHER && !f.homeTypeOther.trim()) return "Describe your home.";
      if (!f.housingAllowsPets) return "Boarding needs housing that allows pets.";
      return f.roommatesAgree ? null : "Check with your roommates before boarding.";
    case "pals":
      return null;
    case "location":
      return f.area.trim() ? null : "Share your location or pick a neighborhood.";
    case "review": {
      const checked = checkProfile(toProfile(f));
      return checked.ok ? null : checked.error;
    }
  }
}

/** The review card's lines for the chosen role, each with the step that asks it (null when it can't be edited). */
function summary(f: Form, school: string): [string, string, Step | null][] {
  const lines: [string, string, Step | null][] = [
    ["Role", labelOf(ROLES, f.role ?? ""), "role"],
    ["School", school, null],
  ];
  if (f.role === "owner") {
    const kind = needsKindText(f.petKind) ? f.petKindOther : labelOf(PET_KINDS, f.petKind ?? "").replace(/^A /, "");
    lines.push(
      ["Pet", [f.petName, kind, labelOf(PET_SIZES, f.size ?? "").toLowerCase(), labelOf(PET_AGES, f.age ?? "").toLowerCase()].filter(Boolean).join(", "), "pet"],
      [
        "Personality",
        [labelOf(ENERGY, f.energy ?? ""), labelOf(WITH_PEOPLE, f.withPeople ?? ""), `with other animals: ${labelOf(WITH_ANIMALS, f.withAnimals ?? "").toLowerCase()}`, `alone: ${labelOf(ALONE, f.alone ?? "").toLowerCase()}`].join(". "),
        "personality",
      ],
      [
        "Special care",
        f.specialCare.length ? labelsOf(SPECIAL_CARE, f.specialCare.filter((c) => c !== OTHER)).concat(f.specialCare.includes(OTHER) ? `${f.specialCare.length > 1 ? ", " : ""}${f.specialCareOther}` : "") : "None",
        "care",
      ],
      ["Bites or scratches", f.bites ? `Yes. ${f.bitesDetails}` : "No", "care"],
      ["Sitter", labelOf(GENDER_PREFS, f.sitterGenderPref ?? ""), "preference"],
      ["Sitter languages", f.sitterLanguages.length ? labelsOf(LANGUAGES, f.sitterLanguages) : "No preference", "preference"],
    );
  } else if (f.role === "sitter") {
    lines.push(
      ["Offers", labelsOf(SERVICES, f.services), "services"],
      ["Pets", `${labelsOf(SITTER_PET_KINDS, f.petKinds)}. Sizes: ${labelsOf(PET_SIZES, f.sizes).toLowerCase()}`, "comfort"],
      ["Energy", labelsOf(ENERGY, f.energies), "comfort"],
      ["Anxious pets", f.anxiousOk ? "Comfortable with them" : "Prefer not", "comfort"],
      ["Experience", f.experience.length ? labelsOf(EXPERIENCE, f.experience) : "None yet", "experience"],
      ["Schedule", `${labelsOf(AVAILABILITY, f.availability)}. Travels up to ${labelOf(TRAVEL, f.travel ?? "").toLowerCase()}`, "experience"],
      ["Gender", `${labelOf(GENDERS, f.gender ?? "")}${f.gender !== "prefer_not" ? (f.showGender ? ", shown on your profile" : ", kept private") : ""}`, "about"],
      ["Languages", labelsOf(LANGUAGES, f.languages), "about"],
      ["About you", f.bio, "about"],
    );
    if (f.services.includes("boarding")) {
      const home = f.homeType === OTHER ? f.homeTypeOther : labelOf(HOME_TYPES, f.homeType ?? "");
      lines.push(["Your home", [home, f.hasYard ? "has a yard" : "no yard", f.otherPets.trim() ? `other pets: ${f.otherPets.trim()}` : "no other pets"].join(", "), "home"]);
    }
  } else {
    lines.push(["Your pet", f.petName.trim() || "No pet yet", "pals"], ["About you", f.bio.trim() || "Nothing yet", "pals"]);
  }
  lines.push(["Location", f.area, "location"]);
  return lines;
}

/** The badge for a verified member: Penn (the pilot school) or the local test account. */
function schoolBadge(school: string): string {
  return school === LOCAL_TEST_SCHOOL ? "Test account" : "Penn verified";
}

export function Onboarding({
  userFirstName,
  email,
  school,
  initial,
  onDone,
}: {
  userFirstName: string;
  email: string | null;
  /** The verified school, or null when the sign-in email isn't a school one. */
  school: string | null;
  /** Saved answers, when a member is changing them. */
  initial: Profile | null;
  /** Set when opened from the main page: called after saving or to cancel. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<Form>(() => fromProfile(initial));
  // My profile opens on the saved answers; first-time setup starts at the role.
  const [step, setStep] = useState<Step>(initial && onDone ? "review" : "role");
  // Set when editing one answer from the review: Continue goes back there.
  const [editingOne, setEditingOne] = useState(false);
  const [ownPlace, setOwnPlace] = useState(() => initial !== null && initial.location.area !== GPS_AREA && !NEIGHBORHOODS.some((n) => n.value === initial.location.area));
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = stepsFor(f);
  const index = Math.max(0, steps.indexOf(step));

  const set = (patch: Partial<Form>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setError(null);
  };
  const goTo = (next: Form) => {
    const nextSteps = stepsFor(next);
    if (editingOne) {
      // Back to the review, unless the change opened a question that still needs answering (like boarding's home step).
      const open = nextSteps.find((s) => s !== "review" && problem(s, next, school) !== null);
      if (!open) setEditingOne(false);
      setStep(open ?? "review");
      return;
    }
    setStep(nextSteps[nextSteps.indexOf(step) + 1] ?? "review");
  };
  const edit = (target: Step) => {
    setError(null);
    // Changing the role means a different survey, so that walks through every step.
    setEditingOne(target !== "role");
    setStep(target);
  };
  /** Saves `patch` and moves on, for questions answered with one tap. */
  const answer = (patch: Partial<Form>) => {
    const next = { ...f, ...patch };
    setF(next);
    setError(null);
    goTo(next);
  };
  const goOn = () => {
    const wrong = problem(step, f, school);
    if (wrong) {
      setError(wrong);
      return;
    }
    setError(null);
    goTo(f);
  };
  const back = () => {
    setError(null);
    if (editingOne) {
      setEditingOne(false);
      setStep("review");
      return;
    }
    setStep(steps[index - 1] ?? "role");
  };
  const toggle = <T,>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const shareLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("This browser can't share your location. Pick a neighborhood instead.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setOwnPlace(false);
        set({ area: GPS_AREA, lat: roundCoord(position.coords.latitude), lng: roundCoord(position.coords.longitude) });
      },
      () => {
        setLocating(false);
        setError("We couldn't get your location. Allow it in your browser, or pick a neighborhood instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const save = async () => {
    const checked = checkProfile(toProfile(f));
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await saveProfile(checked.value);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onDone?.();
  };

  const petWord = f.petName.trim() || "your pet";

  const body = (
    <section className={styles.survey}>
      {editingOne && step !== "review" ? (
        <div className={styles.progressLabel}>Editing {TITLES[step]}</div>
      ) : (
        step !== "review" || !onDone ? (
          <>
            <div className={styles.progressLabel}>{step === "review" ? "Review your answers" : `Step ${index + 1} of ${steps.length - 1}, ${TITLES[step]}`}</div>
            <div className={styles.progress} aria-hidden="true">
              <span style={{ width: `${Math.round((index / (steps.length - 1)) * 100)}%` }} />
            </div>
          </>
        ) : null
      )}

      {step === "role" && (
        <Ask title={`Welcome, ${userFirstName}. How will you use PennPaws?`} lead="You can change this any time from your profile.">
          <Choices rows options={ROLES} selected={f.role} onPick={(role) => answer({ role })} />
        </Ask>
      )}

      {step === "verify" && (
        <Ask title="Check your Penn email" lead="PennPaws is starting at Penn, so everyone you meet here has a verified Penn email.">
          {school === LOCAL_TEST_SCHOOL ? (
            <div className={styles.notice}>
              <strong>Local test account</strong>
              <span>
                You're signed in as the local development user, so the Penn check is skipped while PennPaws runs on your computer. On the live site,
                people sign in with their Penn Google account.
              </span>
            </div>
          ) : school ? (
            <div className={styles.noticeGood}>
              <strong>
                <CheckIcon /> Penn verified
              </strong>
              <span>You signed in with {email}, a Penn email. Google has confirmed it's yours.</span>
            </div>
          ) : (
            <div className={styles.notice}>
              <strong>We couldn't verify a Penn email</strong>
              <span>
                You're signed in as {email ?? "an account without an email"}. PennPaws is open to Penn for now, so it needs an email ending in upenn.edu.
                Log out with the button at the top right, then sign in with your Penn Google account.
              </span>
            </div>
          )}
          {school && <Continue onClick={goOn} />}
        </Ask>
      )}

      {step === "pet" && (
        <Ask title="Tell us about your pet" lead="Sitters see this when you post a request, so they know who they're meeting.">
          <TextField id="pp-pet-name" label="Name" value={f.petName} placeholder="Mochi" maxLength={LIMITS.name} onChange={(petName) => set({ petName })} />
          <Question label="Kind of pet">
            <Choices columns options={PET_KINDS} selected={f.petKind} onPick={(petKind) => set({ petKind })} />
          </Question>
          {needsKindText(f.petKind) && (
            <TextField
              id="pp-pet-kind"
              label={f.petKind === "several" ? "Which pets? List them all" : "What kind of pet?"}
              value={f.petKindOther}
              placeholder={f.petKind === "several" ? "Two dogs and a cat" : "A rabbit"}
              onChange={(petKindOther) => set({ petKindOther })}
            />
          )}
          <Question label="Size" info={SIZE_GUIDE}>
            <Choices options={PET_SIZES} selected={f.size} onPick={(size) => set({ size })} />
          </Question>
          <Question label="Age" info={AGE_GUIDE}>
            <Choices options={PET_AGES} selected={f.age} onPick={(age) => set({ age })} />
          </Question>
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "personality" && (
        <Ask title={`What is ${petWord} like?`} lead="This helps us find a sitter who suits their personality.">
          <Question label="Energy">
            <Choices options={ENERGY} selected={f.energy} onPick={(energy) => set({ energy })} />
          </Question>
          <Question label="With new people">
            <Choices options={WITH_PEOPLE} selected={f.withPeople} onPick={(withPeople) => set({ withPeople })} />
          </Question>
          <Question label="With other animals">
            <Choices options={WITH_ANIMALS} selected={f.withAnimals} onPick={(withAnimals) => set({ withAnimals })} />
          </Question>
          <Question label="When left alone">
            <Choices options={ALONE} selected={f.alone} onPick={(alone) => set({ alone })} />
          </Question>
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "care" && (
        <Ask title="Care and safety" lead="Honest answers keep your pet and your sitter safe.">
          <Question label="Special care (optional)">
            <MultiChoice options={SPECIAL_CARE} selected={f.specialCare} onToggle={(care) => set({ specialCare: toggle(f.specialCare, care) })} />
          </Question>
          {f.specialCare.includes(OTHER) && (
            <TextField id="pp-care" label="What special care?" value={f.specialCareOther} placeholder="Eye drops twice a day" onChange={(specialCareOther) => set({ specialCareOther })} />
          )}
          <Question label={`Has ${petWord} ever bitten or scratched someone?`}>
            <Choices options={YES_NO} selected={yesNo(f.bites)} onPick={(value) => set({ bites: value === "yes" })} />
          </Question>
          {f.bites && (
            <TextField
              id="pp-bites"
              label="What happened? Sitters see this."
              value={f.bitesDetails}
              maxLength={LIMITS.notes}
              placeholder="Nipped a stranger who reached for his food bowl"
              onChange={(bitesDetails) => set({ bitesDetails })}
            />
          )}
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "preference" && (
        <Ask title="Who would you like as a sitter?" lead="We use these to show you how each sitter matches. You can change them on any request.">
          <Question label="Gender">
            <Choices rows options={GENDER_PREFS} selected={f.sitterGenderPref} onPick={(sitterGenderPref) => set({ sitterGenderPref })} />
          </Question>
          <Question label="Languages you'd like them to speak (optional)">
            <MultiChoice options={LANGUAGES} selected={f.sitterLanguages} onToggle={(language) => set({ sitterLanguages: toggle(f.sitterLanguages, language) })} />
          </Question>
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "services" && (
        <Ask title="What can you offer?" lead="Pick everything you'd be happy to do.">
          <Question label="Services">
            <MultiChoice rows options={SERVICES} selected={f.services} onToggle={(service) => set({ services: toggle(f.services, service) })} />
          </Question>
          <Question label="Pets">
            <MultiChoice options={SITTER_PET_KINDS} selected={f.petKinds} onToggle={(kind) => set({ petKinds: toggle(f.petKinds, kind) })} />
          </Question>
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "comfort" && (
        <Ask title="Which pets are you comfortable with?" lead="We only suggest you for pets that fit.">
          <Question label="Sizes" info={SIZE_GUIDE}>
            <MultiChoice options={PET_SIZES} selected={f.sizes} onToggle={(size) => set({ sizes: toggle(f.sizes, size) })} />
          </Question>
          <Question label="Energy">
            <MultiChoice options={ENERGY} selected={f.energies} onToggle={(energy) => set({ energies: toggle(f.energies, energy) })} />
          </Question>
          <Question label="Anxious or reactive pets?">
            <Choices options={YES_NO} selected={yesNo(f.anxiousOk)} onPick={(value) => set({ anxiousOk: value === "yes" })} />
          </Question>
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "experience" && (
        <Ask title="Your experience and schedule">
          <Question label="Experience (optional)">
            <MultiChoice options={EXPERIENCE} selected={f.experience} onToggle={(item) => set({ experience: toggle(f.experience, item) })} />
          </Question>
          <Question label="How far will you travel?">
            <Choices options={TRAVEL} selected={f.travel} onPick={(travel) => set({ travel })} />
          </Question>
          <Question label="When are you usually free?">
            <MultiChoice options={AVAILABILITY} selected={f.availability} onToggle={(time) => set({ availability: toggle(f.availability, time) })} />
          </Question>
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "about" && (
        <Ask title="About you" lead="Owners read this before they invite you.">
          <Question label="Gender">
            <Choices options={GENDERS} selected={f.gender} onPick={(gender) => set({ gender, showGender: gender === "prefer_not" ? false : f.showGender })} />
          </Question>
          {f.gender && f.gender !== "prefer_not" && (
            <Check checked={f.showGender} onChange={(showGender) => set({ showGender })}>
              Show my gender on my profile. Either way, it's used to match owners who ask for a sitter's gender.
            </Check>
          )}
          {f.gender === "prefer_not" && <span className={styles.hint}>Owners who ask for a particular gender won't see you as a match.</span>}
          <Question label="Languages you speak">
            <MultiChoice options={LANGUAGES} selected={f.languages} onToggle={(language) => set({ languages: toggle(f.languages, language) })} />
          </Question>
          <label htmlFor="pp-bio" className={styles.label}>
            A line or two about you
          </label>
          <textarea
            id="pp-bio"
            className={styles.input}
            rows={3}
            maxLength={LIMITS.notes}
            value={f.bio}
            onChange={(e) => set({ bio: e.target.value })}
            placeholder="Second-year at Wharton, grew up with two labs, and I miss having a dog around."
          />
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "home" && (
        <Ask title="Your home, for boarding" lead="Owners see this before they leave their pet with you.">
          <Question label="Home">
            <Choices options={HOME_TYPES} selected={f.homeType} onPick={(homeType) => set({ homeType })} />
          </Question>
          {f.homeType === OTHER && <TextField id="pp-home" label="Describe your home" value={f.homeTypeOther} placeholder="A room in a shared rowhouse" onChange={(homeTypeOther) => set({ homeTypeOther })} />}
          <Question label="Outdoor space or a yard?">
            <Choices options={YES_NO} selected={yesNo(f.hasYard)} onPick={(value) => set({ hasYard: value === "yes" })} />
          </Question>
          <TextField id="pp-other-pets" label="Other pets at home (optional)" value={f.otherPets} placeholder="One calm cat" onChange={(otherPets) => set({ otherPets })} />
          <Check checked={f.housingAllowsPets} onChange={(housingAllowsPets) => set({ housingAllowsPets })}>
            My lease or housing allows pets.
          </Check>
          <Check checked={f.roommatesAgree} onChange={(roommatesAgree) => set({ roommatesAgree })}>
            Anyone I live with is OK with a pet staying over.
          </Check>
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "pals" && (
        <Ask title="Say hello to Pet Pals" lead="Both are optional. You can follow friends' pets even if you don't have one.">
          <TextField id="pp-pals-pet" label="Your pet's name (optional)" value={f.petName} maxLength={LIMITS.name} placeholder="Mochi" onChange={(petName) => set({ petName })} />
          <label htmlFor="pp-pals-bio" className={styles.label}>
            About you (optional)
          </label>
          <textarea
            id="pp-pals-bio"
            className={styles.input}
            rows={3}
            maxLength={LIMITS.notes}
            value={f.bio}
            onChange={(e) => set({ bio: e.target.value })}
            placeholder="Dog lover without a dog (yet). Happy to join walks in Clark Park."
          />
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "location" && (
        <Ask title="Where are you?" lead="We use this to match people nearby.">
          <button type="button" className={f.area === GPS_AREA ? styles.tileOn : styles.secondary} disabled={locating} onClick={shareLocation}>
            {locating ? "Finding you…" : f.area === GPS_AREA ? "Using your current location" : "Use my current location"}
          </button>
          <Question label="Or pick a neighborhood">
            <div className={styles.chips}>
              {NEIGHBORHOODS.map((place) => {
                const on = f.area === place.value;
                return (
                  <button
                    key={place.value}
                    type="button"
                    className={on ? styles.chipOn : styles.chip}
                    aria-pressed={on}
                    onClick={() => {
                      setOwnPlace(false);
                      set({ area: place.value, lat: place.lat, lng: place.lng });
                    }}
                  >
                    {place.value}
                  </button>
                );
              })}
              <button
                type="button"
                className={ownPlace ? styles.chipOn : styles.chip}
                aria-pressed={ownPlace}
                onClick={() => {
                  setOwnPlace(true);
                  set({ area: "", lat: null, lng: null });
                }}
              >
                Somewhere else
              </button>
            </div>
          </Question>
          {ownPlace && <TextField id="pp-area" label="Your neighborhood or campus" value={f.area} placeholder="Near Drexel" onChange={(area) => set({ area })} />}
          <span className={styles.hint}>We save an approximate spot (about 300 m), never your address. Others only see roughly how far away you are.</span>
          <Continue onClick={goOn} />
        </Ask>
      )}

      {step === "review" && (
        <Ask
          title={onDone ? "My profile" : "Here's your profile"}
          lead={onDone ? "Your answers from setup. Tap Edit next to anything to change it, then save." : "Look it over, then save. You can change it any time."}
        >
          <dl className={styles.panel}>
            {summary(f, school ?? "").map(([label, value, target], i) => (
              <Fragment key={`${label}-${i}`}>
                <dt>{label}</dt>
                <dd className={styles.summaryValue}>
                  <span className={styles.preLine}>{value}</span>
                  {target && (
                    <button type="button" className={styles.editLink} onClick={() => edit(target)} aria-label={`Edit ${label.toLowerCase()}`}>
                      Edit
                    </button>
                  )}
                </dd>
              </Fragment>
            ))}
          </dl>
          <div className={styles.row}>
            <button type="button" className={styles.secondary} onClick={() => edit("role")}>
              Start over
            </button>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : onDone ? "Save changes" : "Save and start"}
            </button>
          </div>
          <span className={styles.hint}>Only signed-in members see your profile. Your email stays hidden until you agree a booking.</span>
        </Ask>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {step !== "role" && !(step === "review" && onDone) && (
        <button type="button" className={styles.link} onClick={back}>
          {editingOne ? (onDone ? "Back to my profile" : "Back to review") : "Back a step"}
        </button>
      )}
      {onDone && (
        <button type="button" className={styles.link} onClick={onDone}>
          Cancel without saving
        </button>
      )}
    </section>
  );

  if (onDone) return body;
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.title}>PennPaws</h1>
          {school && (
            <span className={styles.verified}>
              <CheckIcon /> {schoolBadge(school)}
            </span>
          )}
        </div>
      </header>
      {body}
    </div>
  );
}

function Ask({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className={styles.stack}>
      <h2 className={styles.heading}>{title}</h2>
      {lead && <p className={styles.lead}>{lead}</p>}
      <div className={styles.answer}>{children}</div>
    </div>
  );
}

/** How sizes and ages are defined, behind the info icon. */
const SIZE_GUIDE = (
  <>
    <p>Sizes go by your pet's weight. If they're between two, pick the larger one.</p>
    <ul>
      {PET_SIZES.map((size) => (
        <li key={size.value}>
          <strong>{size.label}:</strong> {size.hint}
        </li>
      ))}
    </ul>
  </>
);

const AGE_GUIDE = (
  <>
    <p>Pets age at different speeds, so "senior" starts earlier for dogs, and earliest for large breeds.</p>
    <ul>
      {PET_AGES.map((age) => (
        <li key={age.value}>
          <strong>{age.label}:</strong> {age.hint}
        </li>
      ))}
    </ul>
    <p>Not sure? Pick the closest one and add details in your request's notes.</p>
  </>
);

function Question({ label, info, children }: { label: string; info?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        {info && (
          <button
            type="button"
            className={styles.infoButton}
            aria-label={`${label} guide`}
            title={`${label} guide`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <InfoIcon />
          </button>
        )}
      </div>
      {info && open && <div className={styles.infoPanel}>{info}</div>}
      {children}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </svg>
  );
}

function MultiChoice<T extends string>({
  options,
  selected,
  onToggle,
  rows = false,
}: {
  options: readonly { value: T; label: string; hint?: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  rows?: boolean;
}) {
  return (
    <div className={rows ? styles.rows : styles.chips}>
      {options.map((option) => {
        const on = selected.includes(option.value);
        const className = rows ? (on ? styles.rowOptionOn : styles.rowOption) : on ? styles.chipOn : styles.chip;
        return (
          <button key={option.value} type="button" className={className} aria-pressed={on} onClick={() => onToggle(option.value)}>
            {option.label}
            {rows && option.hint && <span className={styles.muted}>{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
