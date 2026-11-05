"use client";

// Posting a request as a short conversation: one question at a time, tap an
// answer, type only when you want to. Every question has "Something else"
// with a text box. Owners with an API key can paste a post or describe what
// they need, in any language, and let AI fill in the answers in English; they
// check what AI understood, answer only what's missing, and review everything
// before posting. Owners with saved pets start by picking who it's for (R43):
// everything on those pets is carried in, so they answer only dates, care
// and pay. Owners with no saved pet start with the one from setup filled in.

import { useState, type ReactNode } from "react";
import { DateField } from "./DateField";
import {
  ACCESS,
  CARE_TYPES,
  DATE_MODES,
  FREQUENCIES,
  GENDER_PREFS,
  LANGUAGES,
  LIMITS,
  MUST_HAVES,
  NIGHT_PAY_PRESETS,
  explainPay,
  suggestPay,
  OTHER,
  PAY_PRESETS,
  PET_KINDS,
  TASKS,
  TASKS_BY_KIND,
  describe,
  firstBookableDay,
  labelOf,
  shortDate,
  thisWeekend,
  requestStartFromPets,
  type Access,
  type CareType,
  type DateMode,
  type Frequency,
  type GenderPref,
  type Language,
  type MustHave,
  type OwnerProfile,
  type ParsedRequest,
  type Pet,
  type PetKind,
  type RequestDraft,
  type RequestStart,
  type Task,
} from "@penntools/tool-pennpaws";
import { parseRequest, postRequest } from "./actions";
import { PetAvatar } from "./PennPaws";
import styles from "./PennPaws.module.css";

interface Answers {
  petKind: PetKind | null;
  petKindOther: string;
  petName: string;
  petDetails: string;
  photo: string | null;
  dateMode: DateMode | null;
  startsOn: string;
  endsOn: string;
  frequency: Frequency | null;
  frequencyOther: string;
  tasks: Task[];
  tasksOther: string;
  access: Access | null;
  accessOther: string;
  pay: string;
  payOwn: boolean;
  area: string;
  vet: string;
  notes: string;
  notesDone: boolean;
  careType: CareType | null;
  mustHaves: MustHave[];
  sitterGender: GenderPref;
  languages: Language[];
  /** The owner's post, kept when AI read it from another language. */
  original: string | null;
  originalLanguage: string | null;
  /** The saved pets this request is for, when the owner picked them. */
  petIds: string[];
}

/** For boarding, the keys question becomes how the pet is handed over. */
const HANDOVER = [
  { value: "in_person", label: "Drop off and pick up in person", hint: "At the sitter's place, or they come to you" },
  { value: "decide_later", label: "Decide with my sitter", hint: "Sort it out once you match" },
  { value: OTHER, label: "Something else", hint: "Type your own" },
] as const;

const EMPTY: Answers = {
  petKind: null,
  petKindOther: "",
  petName: "",
  petDetails: "",
  photo: null,
  dateMode: null,
  startsOn: "",
  endsOn: "",
  frequency: null,
  frequencyOther: "",
  tasks: [],
  tasksOther: "",
  access: null,
  accessOther: "",
  pay: "",
  payOwn: false,
  area: "",
  vet: "",
  notes: "",
  notesDone: false,
  careType: null,
  mustHaves: [],
  sitterGender: "none",
  languages: [],
  original: null,
  originalLanguage: null,
  petIds: [],
};

const STEPS = ["your pet", "about them", "dates", "care", "keys", "pay", "notes"] as const;
const REVIEW = STEPS.length;
/** The steps left after picking saved pets: dates, care and pay. Keys default to "decide with my sitter". */
const PET_STEPS = [2, 3, 5] as const;

const orNull = (text: string) => (text.trim() ? text.trim() : null);
const needsKindText = (kind: PetKind | null) => kind === OTHER || kind === "several";

const VISITS_PER_DAY: Partial<Record<RequestDraft["frequency"], number>> = { once_daily: 1, twice_daily: 2, every_other_day: 0.5 };

/** How many visits or nights the owner is paying for, so the rate reads as a total too. Null when it can't be counted (weekly, or a schedule in their own words). */
function countPaid(draft: RequestDraft): { count: number; label: string } | null {
  if (draft.weekly || !draft.startsOn || !draft.endsOn || draft.endsOn < draft.startsOn) return null;
  const days = Math.round((Date.parse(draft.endsOn) - Date.parse(draft.startsOn)) / 86_400_000) + 1;
  if (draft.frequency === "overnight") {
    const nights = Math.max(1, days - 1);
    return { count: nights, label: `${nights} ${nights === 1 ? "night" : "nights"}` };
  }
  const perDay = VISITS_PER_DAY[draft.frequency];
  if (!perDay) return null;
  const visits = Math.max(1, Math.ceil(days * perDay));
  return { count: visits, label: `${visits} ${visits === 1 ? "visit" : "visits"} over ${days} ${days === 1 ? "day" : "days"}` };
}

function toDraft(a: Answers): RequestDraft {
  const weekly = a.dateMode === "weekly";
  const visits = (a.careType ?? "visits") === "visits";
  return {
    petName: a.petName.trim(),
    petKind: a.petKind ?? "dog",
    petKindOther: needsKindText(a.petKind) ? orNull(a.petKindOther) : null,
    petDetails: orNull(a.petDetails),
    photo: a.photo,
    weekly,
    startsOn: weekly ? null : orNull(a.startsOn),
    endsOn: weekly ? null : orNull(a.endsOn),
    // A stay or boarding has no visit schedule; it's overnight.
    frequency: visits ? a.frequency ?? "once_daily" : "overnight",
    frequencyOther: visits && a.frequency === OTHER ? orNull(a.frequencyOther) : null,
    tasks: a.tasks,
    tasksOther: a.tasks.includes(OTHER) ? orNull(a.tasksOther) : null,
    access: a.access ?? "decide_later",
    accessOther: a.access === OTHER ? orNull(a.accessOther) : null,
    pay: a.pay.trim(),
    area: orNull(a.area),
    vet: orNull(a.vet),
    notes: orNull(a.notes),
    careType: a.careType ?? "visits",
    mustHaves: a.mustHaves,
    sitterGender: a.sitterGender,
    languages: a.languages,
    original: a.original,
    originalLanguage: a.originalLanguage,
    petIds: a.petIds,
  };
}

/** True when `isoDay` is today or earlier: requests start tomorrow at the soonest. */
const tooSoon = (isoDay: string) => isoDay < firstBookableDay(new Date());

/** The steps whose answers are still missing, in order. */
function missingSteps(a: Answers): number[] {
  const missing = [
    !a.petKind || (needsKindText(a.petKind) && !a.petKindOther.trim()),
    !a.petName.trim(),
    !a.dateMode || (a.dateMode !== "weekly" && (!a.startsOn || !a.endsOn || a.endsOn < a.startsOn || tooSoon(a.startsOn))),
    !a.careType ||
      (a.careType === "visits" && (!a.frequency || (a.frequency === OTHER && !a.frequencyOther.trim()))) ||
      a.tasks.length === 0 ||
      (a.tasks.includes(OTHER) && !a.tasksOther.trim()),
    !a.access || (a.access === OTHER && !a.accessOther.trim()),
    !a.pay.trim(),
    !a.notesDone,
  ];
  return missing.flatMap((isMissing, step) => (isMissing ? [step] : []));
}

/** The first step whose answer is still missing, or REVIEW when everything is in. */
function firstMissing(a: Answers): number {
  return missingSteps(a)[0] ?? REVIEW;
}

/** Merges what AI found into the answers, keeping only values the survey accepts. */
function mergeParsed(a: Answers, p: ParsedRequest, post: string): Answers {
  const next = { ...a };
  if (p.careType) next.careType = p.careType;
  if (p.mustHaves?.length) next.mustHaves = p.mustHaves;
  if (p.sitterGender) next.sitterGender = p.sitterGender;
  if (p.languages?.length) next.languages = p.languages;
  // Keep the owner's own words when AI translated them.
  if (p.sourceLanguage && !/^english$/i.test(p.sourceLanguage.trim())) {
    next.original = post.trim();
    next.originalLanguage = p.sourceLanguage.trim();
  }
  if (p.petKind) next.petKind = p.petKind;
  if (p.petKindOther) next.petKindOther = p.petKindOther;
  if (p.petName) next.petName = p.petName;
  if (p.petDetails) next.petDetails = p.petDetails;
  if (p.weekly) next.dateMode = "weekly";
  else if (
    p.startsOn &&
    p.endsOn &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.startsOn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.endsOn) &&
    !tooSoon(p.startsOn)
  ) {
    next.dateMode = "dates";
    next.startsOn = p.startsOn;
    next.endsOn = p.endsOn;
  }
  if (p.frequency) next.frequency = p.frequency;
  if (p.frequencyOther) next.frequencyOther = p.frequencyOther;
  if (p.tasks?.length) next.tasks = p.tasks;
  if (p.tasksOther) next.tasksOther = p.tasksOther;
  if (p.access) next.access = p.access;
  if (p.accessOther) next.accessOther = p.accessOther;
  if (p.pay) next.pay = p.pay;
  if (p.area) next.area = p.area;
  if (p.vet) next.vet = p.vet;
  if (p.notes) next.notes = p.notes;
  return next;
}

/** Shrinks a photo to at most 480px on its long side, as a JPEG data URL. */
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function Survey({
  userFirstName,
  hasAI,
  start = null,
  pets = [],
  profile = null,
  onPosted,
}: {
  userFirstName: string;
  hasAI: boolean;
  /** The owner's pet from their profile, if they have one. Used when there are no saved pets. */
  start?: RequestStart | null;
  /** The owner's saved pets, to pick from first. */
  pets?: Pet[];
  /** The owner's profile, for their area and sitter wishes on a request from saved pets. */
  profile?: OwnerProfile | null;
  onPosted: (id: string) => void;
}) {
  const canPick = pets.length > 0 && profile !== null;
  const [picking, setPicking] = useState(canPick);
  const [chosen, setChosen] = useState<string[]>(() => (pets.length === 1 && pets[0] ? [pets[0].id] : []));
  const [fromPets, setFromPets] = useState(false);
  const [a, setA] = useState<Answers>(() => (start ? { ...EMPTY, ...start } : EMPTY));
  // While picking pets the step stays at 0, whose answers only show once picking is done.
  const [step, setStep] = useState(pets.length > 0 && profile !== null ? 0 : start ? 1 : 0);
  const [typing, setTyping] = useState(false);
  const [sentence, setSentence] = useState("");
  const [filledByAI, setFilledByAI] = useState(false);
  // The first question AI left for the owner to answer.
  const [aiFrom, setAiFrom] = useState(0);
  // True while the owner checks what AI understood, before the remaining questions.
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }));
  // After AI fills the answers, skip straight to whatever is still missing.
  const advance = (next: Answers) => setStep(filledByAI || fromPets ? firstMissing(next) : step + 1);
  /** Saves `patch` and moves on. */
  const answer = (patch: Partial<Answers>) => {
    const next = { ...a, ...patch };
    setA(next);
    setError(null);
    advance(next);
  };
  const goOn = () => {
    if (firstMissing(a) <= step) {
      const early = step === 2 && a.dateMode === "dates" && a.startsOn && tooSoon(a.startsOn);
      setError(early ? `Pick days from ${shortDate(firstBookableDay(new Date()))} on. Requests start after today.` : "Answer this one to continue.");
      return;
    }
    setError(null);
    advance(a);
  };

  const fill = async () => {
    setBusy(true);
    setError(null);
    const result = await parseRequest(sentence);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = mergeParsed(a, result.data, sentence);
    setA(next);
    setFilledByAI(true);
    setAiFrom(firstMissing(next));
    setTyping(false);
    setUnderstood(true);
  };
  const confirmUnderstood = () => {
    setUnderstood(false);
    setStep(aiFrom);
  };
  /** Carries the picked pets into the answers and goes to the first question left: dates. */
  const pickPets = () => {
    const picked = pets.filter((p) => chosen.includes(p.id));
    if (!profile || picked.length === 0) {
      setError("Pick at least one pet.");
      return;
    }
    const next: Answers = { ...EMPTY, ...requestStartFromPets(picked, profile), access: "decide_later", notesDone: true };
    setA(next);
    setError(null);
    setFromPets(true);
    setFilledByAI(false);
    setPicking(false);
    setStep(firstMissing(next));
  };
  /** Someone not saved in My Pets: the full survey, from scratch. */
  const someoneElse = () => {
    setA(EMPTY);
    setFromPets(false);
    setPicking(false);
    setError(null);
    setStep(0);
  };
  const backToPets = () => {
    setStep(0);
    setPicking(true);
    setFromPets(false);
    setError(null);
  };
  const back = () => {
    if (!fromPets) {
      setStep(step - 1);
      return;
    }
    const earlier = PET_STEPS.filter((s) => s < step);
    const previous = earlier[earlier.length - 1];
    if (previous === undefined) backToPets();
    else setStep(previous);
  };

  const startOver = () => {
    setA(start ? { ...EMPTY, ...start } : EMPTY);
    setFilledByAI(false);
    setUnderstood(false);
    setStep(0);
    setTyping(true);
  };

  const post = async () => {
    setBusy(true);
    setError(null);
    const result = await postRequest(toDraft(a));
    setBusy(false);
    if (result.ok) onPosted(result.data);
    else setError(result.error);
  };

  const kindWord = a.petKind === "cat" ? "cat" : a.petKind === "dog" ? "dog" : "pet";
  const lines = describe(toDraft(a));
  const weekend = thisWeekend(new Date());
  const firstDay = firstBookableDay(new Date());
  const boarding = a.careType === "boarding";
  // A stay or boarding is paid by the night, visits by the visit.
  const nightly = a.careType === "stay" || boarding;
  const payUnit = nightly ? "a night" : "a visit";
  const payCount = countPaid(toDraft(a));
  const suggested = suggestPay(toDraft(a));
  const suggestedPay = `$${suggested.amount} ${payUnit}`;
  const toggle = <T,>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // The conversation so far: each question asked and its answer. After AI
  // fills the answers, it picks up at the first question AI couldn't answer.
  const questions = [
    `Hi ${userFirstName}. Who are we looking after while you're away?`,
    `Lovely. Tell me about your ${kindWord}. A photo helps your sitter know who to look for at the door.`,
    "When will you be away?",
    `What kind of care ${a.petIds.length > 1 ? "do" : "does"} ${a.petName || "your pet"} need, and what should the sitter do?`,
    boarding ? `How will you hand ${a.petName || "them"} over to your sitter?` : "How will your sitter get in?",
    `What would you like to pay ${nightly ? "per night" : "per visit"}? Pick a rate, or I can suggest one.`,
    "Last one. Roughly where are you, who is your vet, what matters in a sitter, and is there anything else they should know?",
    "Here is your request. Look it over, then post it.",
  ];
  const answers = [
    needsKindText(a.petKind) ? a.petKindOther : labelOf(PET_KINDS, a.petKind ?? ""),
    [a.petName, a.petDetails].filter(Boolean).join(", ") + (a.photo ? ". Photo added." : ""),
    lines.when,
    `${lines.visits}. ${lines.care}`,
    lines.access,
    a.pay,
    [a.area, a.vet && `Vet: ${a.vet}`, lines.sitter, a.notes].filter(Boolean).join(". ") || "Nothing else",
  ];
  const log: { from: "bot" | "me"; text: string }[] = [{ from: "bot", text: questions[0]! }];
  let first = 0;
  if (fromPets && !picking) {
    // Picked from My Pets: only the questions left to answer.
    log.push({ from: "me", text: a.petName });
    for (const s of PET_STEPS.filter((n) => n < step)) log.push({ from: "bot", text: questions[s]! }, { from: "me", text: answers[s]! });
    log.push({ from: "bot", text: questions[Math.min(step, REVIEW)]! });
  } else if (filledByAI) {
    first = aiFrom;
    log.push({ from: "me", text: sentence });
    log.push({
      from: "bot",
      text: understood
        ? `Here's what I understood${a.originalLanguage ? ` (you wrote in ${a.originalLanguage}; sitters see it in English, with your post attached)` : ""}. Is it right?`
        : aiFrom === REVIEW
          ? "Great. I filled everything in from what you wrote. Check it, then post."
          : "Great. Just a few more questions.",
    });
    if (!understood && aiFrom < REVIEW) log.push({ from: "bot", text: questions[aiFrom]! });
  }
  if (!fromPets && !picking) {
    for (let n = first; n < Math.min(step, REVIEW); n++) {
      log.push({ from: "me", text: answers[n]! }, { from: "bot", text: questions[n + 1]! });
    }
  }
  const progress = picking
    ? { label: "Who it's for", share: 0 }
    : fromPets
      ? step < REVIEW
        ? { label: `Step ${PET_STEPS.indexOf(step as (typeof PET_STEPS)[number]) + 1} of ${PET_STEPS.length}, ${STEPS[step]}`, share: PET_STEPS.indexOf(step as (typeof PET_STEPS)[number]) / PET_STEPS.length }
        : { label: "Review before posting", share: 1 }
      : { label: step < REVIEW ? `Step ${step + 1} of ${STEPS.length}, ${STEPS[step]}` : "Review before posting", share: Math.min(step, REVIEW) / REVIEW };
  const chosenNames = pets.filter((p) => chosen.includes(p.id)).map((p) => p.name);

  const kindTasks = TASKS_BY_KIND[a.petKind ?? "dog"];

  return (
    <section className={styles.survey}>
      <div className={styles.progressLabel}>{progress.label}</div>
      <div className={styles.progress} aria-hidden="true">
        <span style={{ width: `${Math.round(progress.share * 100)}%` }} />
      </div>

      <ol className={styles.chat} aria-live="polite">
        {log.map((line, i) => (
          <li key={i} className={line.from === "bot" ? styles.bot : styles.me}>
            {line.text}
          </li>
        ))}
      </ol>

      {step === REVIEW && (
        <div className={styles.panel}>
          <div className={styles.detailHead}>
            <PetAvatar name={a.petName} photo={a.photo} />
            <div className={styles.cardName}>
              <strong>{a.petName}</strong>
              <span className={styles.muted}>{lines.pet}</span>
            </div>
          </div>
          <dl className={styles.facts}>
            <dt className={styles.muted}>When</dt>
            <dd>{lines.when}</dd>
            <dt className={styles.muted}>{a.careType === "visits" ? "Visits" : "Stay"}</dt>
            <dd>{lines.visits}</dd>
            <dt className={styles.muted}>Care</dt>
            <dd>{lines.care}</dd>
            <dt className={styles.muted}>{boarding ? "Handover" : "Keys"}</dt>
            <dd>{lines.access}</dd>
            <dt className={styles.muted}>Pay</dt>
            <dd>{a.pay}</dd>
            <dt className={styles.muted}>Sitter</dt>
            <dd>{lines.sitter ?? "No preferences"}</dd>
            <dt className={styles.muted}>Where</dt>
            <dd>{a.area || "Not given"}</dd>
            <dt className={styles.muted}>Vet</dt>
            <dd>{a.vet || "Not given"}</dd>
            <dt className={styles.muted}>Notes</dt>
            <dd className={styles.preLine}>{a.notes || "None"}</dd>
            {a.original && (
              <>
                <dt className={styles.muted}>Your post</dt>
                <dd className={styles.preLine}>
                  {a.original}
                  <span className={styles.hint}> Shown to sitters as written, in {a.originalLanguage}.</span>
                </dd>
              </>
            )}
          </dl>
        </div>
      )}

      {understood && (
        <div className={styles.panelPlain}>
          <ul className={styles.understood}>
            {[
              a.petKind && ["Pet", [a.petName, needsKindText(a.petKind) ? a.petKindOther : labelOf(PET_KINDS, a.petKind).replace(/^A /, ""), a.petDetails].filter(Boolean).join(", ")],
              a.dateMode && ["When", lines.when],
              a.careType && ["Type of care", lines.visits],
              a.tasks.length > 0 && ["Care", lines.care],
              a.access && [boarding ? "Handover" : "Keys", lines.access],
              a.pay.trim() && ["Pay", a.pay],
              lines.sitter && ["Sitter", lines.sitter],
              a.area.trim() && ["Where", a.area],
              a.vet.trim() && ["Vet", a.vet],
              a.notes.trim() && ["Notes", a.notes],
            ]
              .filter((line): line is [string, string] => Array.isArray(line))
              .map(([label, value]) => (
                <li key={label}>
                  <CheckMark /> <strong>{label}:</strong> {value}
                </li>
              ))}
          </ul>
          {missingSteps(a).length > 0 && (
            <span className={styles.muted}>
              I&apos;ll still ask about: {missingSteps(a).map((n) => (n === 6 ? "anything else" : STEPS[n])).join(", ")}.
            </span>
          )}
          <div className={styles.row}>
            <button type="button" className={styles.secondary} onClick={startOver}>
              Not right, start over
            </button>
            <button type="button" className={styles.primary} onClick={confirmUnderstood}>
              Looks right
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.answer}>
        {picking && (
          <>
            <div className={styles.twoCol}>
              {pets.map((pet) => {
                const on = chosen.includes(pet.id);
                return (
                  <button
                    key={pet.id}
                    type="button"
                    className={`${on ? styles.tileOn : styles.tile} ${styles.petPick}`}
                    aria-pressed={on}
                    onClick={() => setChosen(toggle(chosen, pet.id))}
                  >
                    <PetAvatar name={pet.name} photo={pet.photo} />
                    <span className={styles.cardName}>
                      <strong>{pet.name}</strong>
                      <span className={styles.muted}>{pet.kind === "dog" ? "Dog" : pet.kind === "cat" ? "Cat" : pet.kindOther}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" className={styles.primary} disabled={chosen.length === 0} onClick={pickPets}>
              {chosen.length === 0 ? "Pick one or more" : `Continue with ${chosenNames.length === 1 ? chosenNames[0] : `${chosenNames.length} pets`}`}
            </button>
            <span className={styles.hint}>Everything in My Pets comes along, so you only add dates, care and pay. Breed, food and health stay private until you book, unless you chose to share them.</span>
            <button type="button" className={styles.link} onClick={someoneElse}>
              Someone not in My Pets
            </button>
          </>
        )}

        {!picking && step === 0 && !typing && !understood && (
          <>
            <Choices
              columns
              options={PET_KINDS}
              selected={a.petKind}
              onPick={(petKind) => (needsKindText(petKind) ? set({ petKind }) : answer({ petKind, petKindOther: "" }))}
            />
            {needsKindText(a.petKind) && (
              <TextField
                id="pp-kind"
                label={a.petKind === "several" ? "Which pets? List them all" : "What kind of pet?"}
                value={a.petKindOther}
                placeholder={a.petKind === "several" ? "Two dogs and a cat" : "A rabbit, a bearded dragon"}
                onChange={(petKindOther) => set({ petKindOther })}
              >
                <Continue onClick={goOn} />
              </TextField>
            )}
            {hasAI && (
              <button type="button" className={styles.link} onClick={() => setTyping(true)}>
                Paste a post you wrote, or describe it in your own words
              </button>
            )}
          </>
        )}

        {!picking && step === 0 && typing && (
          <>
            <label htmlFor="pp-sentence" className={styles.label}>
              Paste your post or describe what you need. Any language works.
            </label>
            <textarea
              id="pp-sentence"
              className={styles.input}
              rows={5}
              maxLength={LIMITS.sentence}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder="Looking for someone with cat experience to board my cat Nov 18 to 30. Daily photos please, pay negotiable."
            />
            <div className={styles.row}>
              <button type="button" className={styles.secondary} onClick={() => setTyping(false)}>
                Answer questions instead
              </button>
              <button type="button" className={styles.primary} disabled={busy || !sentence.trim()} onClick={() => void fill()}>
                {busy ? "Reading…" : "Read it for me"}
              </button>
            </div>
            <span className={styles.hint}>
              Uses your saved API key once. Your request is written in English for every sitter, with your original post attached. We ask about anything
              you leave out.
            </span>
          </>
        )}

        {step === 1 && (
          <>
            <div className={styles.nameRow}>
              <TextField id="pp-name" label="Name" value={a.petName} placeholder="Mochi" maxLength={LIMITS.name} onChange={(petName) => set({ petName })} />
              <label className={a.photo ? styles.photoOn : styles.photo}>
                {a.photo ? <PetAvatar name={a.petName} photo={a.photo} /> : <CameraIcon />}
                <input
                  type="file"
                  aria-label={a.photo ? "Change photo" : "Add a photo"}
                  accept="image/*"
                  className={styles.visuallyHidden}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      set({ photo: await shrinkPhoto(file) });
                    } catch {
                      setError("That photo couldn't be read. Try a JPEG or PNG.");
                    }
                  }}
                />
              </label>
            </div>
            <TextField
              id="pp-details"
              label="Breed, age, size or temperament (optional)"
              value={a.petDetails}
              placeholder="Shiba Inu, 3, friendly but nervous around bikes"
              onChange={(petDetails) => set({ petDetails })}
            />
            <span className={styles.hint}>{a.photo ? "Photo added. Sitters see it on your request." : "Add a photo with the camera. Optional, but it helps."}</span>
            <Continue onClick={goOn} />
          </>
        )}

        {step === 2 && (
          <>
            <Choices
              rows
              options={DATE_MODES}
              selected={a.dateMode}
              onPick={(dateMode) =>
                dateMode === "dates"
                  ? set({ dateMode })
                  : dateMode === "weekend"
                    ? answer({ dateMode, ...weekend })
                    : answer({ dateMode, startsOn: "", endsOn: "" })
              }
            />
            {a.dateMode === "dates" && (
              <>
                <div className={styles.twoCol}>
                  <DateField id="pp-from" label="From" value={a.startsOn} min={firstDay} onChange={(startsOn) => set({ startsOn })} />
                  <DateField id="pp-to" label="To" value={a.endsOn} min={a.startsOn || firstDay} onChange={(endsOn) => set({ endsOn })} />
                </div>
                <Continue onClick={goOn} label="Use these dates" />
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <span className={styles.label}>Type of care</span>
            <Choices rows options={CARE_TYPES} selected={a.careType} onPick={(careType) => set({ careType })} />
            {a.careType === "visits" && (
              <>
                <span className={styles.label}>How often</span>
                <Choices options={FREQUENCIES.filter((f) => f.value !== "overnight")} selected={a.frequency} onPick={(frequency) => set({ frequency })} />
                {a.frequency === OTHER && (
                  <TextField id="pp-freq" label="Describe the schedule" value={a.frequencyOther} placeholder="Mornings only, weekdays" onChange={(frequencyOther) => set({ frequencyOther })} />
                )}
              </>
            )}
            <span className={styles.label}>{a.careType === "visits" ? "What to do on each visit" : "What should the sitter do?"}</span>
            <div className={styles.chips}>
              {kindTasks.map((task) => {
                const on = a.tasks.includes(task);
                return (
                  <button
                    key={task}
                    type="button"
                    className={on ? styles.chipOn : styles.chip}
                    aria-pressed={on}
                    onClick={() => set({ tasks: on ? a.tasks.filter((t) => t !== task) : [...a.tasks, task] })}
                  >
                    {labelOf(TASKS, task)}
                  </button>
                );
              })}
            </div>
            {a.tasks.includes(OTHER) && (
              <TextField id="pp-task" label="What else should the sitter do?" value={a.tasksOther} placeholder="Water the plants, bring in packages" onChange={(tasksOther) => set({ tasksOther })} />
            )}
            <Continue onClick={goOn} />
          </>
        )}

        {step === 4 && (
          <>
            <Choices
              rows
              options={boarding ? HANDOVER : ACCESS}
              selected={a.access}
              onPick={(access) => (access === OTHER ? set({ access }) : answer({ access, accessOther: "" }))}
            />
            {a.access === OTHER && (
              <TextField
                id="pp-access"
                label={boarding ? "How will you hand them over?" : "How will the sitter get in?"}
                value={a.accessOther}
                placeholder={boarding ? "My roommate will drop her off" : "My roommate will let them in"}
                onChange={(accessOther) => set({ accessOther })}
              >
                <Continue onClick={goOn} />
              </TextField>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <div className={styles.threeCol}>
              {(nightly ? NIGHT_PAY_PRESETS : PAY_PRESETS).map((amount) => {
                const value = `$${amount} ${payUnit}`;
                return (
                  <button key={amount} type="button" className={a.pay === value ? styles.tileOn : styles.tile} aria-pressed={a.pay === value} onClick={() => answer({ pay: value, payOwn: false })}>
                    ${amount} <span className={styles.hint}>{payUnit}</span>
                  </button>
                );
              })}
            </div>
            <div className={styles.suggestion}>
              <p>
                <strong>Suggested: {suggestedPay}</strong>
                {payCount && <>, about ${payCount.count * suggested.amount} for {payCount.label}</>}
              </p>
              <p className={styles.hint}>{explainPay(suggested)}. Based on your pet, care and dates.</p>
              <button type="button" className={styles.secondary} onClick={() => answer({ pay: suggestedPay, payOwn: false })}>
                Use {suggestedPay}
              </button>
            </div>
            <button type="button" className={a.payOwn ? styles.tileOn : styles.secondary} aria-pressed={a.payOwn} onClick={() => set({ payOwn: true, pay: "" })}>
              Set my own amount
            </button>
            {a.payOwn && (
              <TextField
                id="pp-pay"
                label="Amount and how you'll pay"
                value={a.pay}
                placeholder={nightly ? "$400 for the two weeks, or negotiable" : "$150 for the week on Venmo"}
                onChange={(pay) => set({ pay })}
              >
                <Continue onClick={goOn} />
              </TextField>
            )}
          </>
        )}

        {step === 6 && (
          <>
            {/* One box per kind of answer: testers typed temperament into a shared "where" box. */}
            <TextField
              id="pp-area"
              label="Neighborhood or nearest cross streets (optional)"
              value={a.area}
              placeholder="40th and Spruce"
              onChange={(area) => set({ area })}
            />
            <span className={styles.hint}>Only this shows on your request. Your exact address is shared once you both approve.</span>
            <TextField id="pp-vet" label="Vet (optional)" value={a.vet} placeholder="University City Animal Clinic" onChange={(vet) => set({ vet })} />
            <label htmlFor="pp-notes" className={styles.label}>
              Health, habits or anything else a sitter should know (optional)
            </label>
            <textarea
              id="pp-notes"
              className={styles.input}
              rows={3}
              maxLength={LIMITS.notes}
              value={a.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Shy with strangers at first. Gets one treat after dinner."
            />
            <span className={styles.hint}>Leave out your phone and address. You share them when you approve a sitter, and any you type here are hidden from sitters.</span>
            <span className={styles.label}>What matters in a sitter? (optional)</span>
            <div className={styles.chips} role="group" aria-label="Sitter must-haves">
              {MUST_HAVES.map((option) => {
                const on = a.mustHaves.includes(option.value);
                return (
                  <button key={option.value} type="button" className={on ? styles.chipOn : styles.chip} aria-pressed={on} onClick={() => set({ mustHaves: toggle(a.mustHaves, option.value) })}>
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span className={styles.label}>Sitter&apos;s gender</span>
            <Choices options={GENDER_PREFS} selected={a.sitterGender} onPick={(sitterGender) => set({ sitterGender })} />
            <span className={styles.label}>Languages you&apos;d like them to speak (optional)</span>
            <div className={styles.chips} role="group" aria-label="Sitter languages">
              {LANGUAGES.map((option) => {
                const on = a.languages.includes(option.value);
                return (
                  <button key={option.value} type="button" className={on ? styles.chipOn : styles.chip} aria-pressed={on} onClick={() => set({ languages: toggle(a.languages, option.value) })}>
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span className={styles.hint}>We show sitters how they match, and show you how each sitter who offers matches.</span>
            <button type="button" className={styles.primary} onClick={() => answer({ notesDone: true })}>
              Continue
            </button>
          </>
        )}

        {step === REVIEW && (
          <div className={styles.row}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setFilledByAI(false);
                setStep(fromPets ? PET_STEPS[0] : 0);
              }}
            >
              Edit answers
            </button>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void post()}>
              {busy ? "Posting…" : "Post request"}
            </button>
          </div>
        )}
        {step === REVIEW && <span className={styles.hint}>Only signed-in Penn students see it. Your email stays hidden until you approve a sitter.</span>}

        {!picking && step > 0 && step < REVIEW && (
          <button type="button" className={styles.link} onClick={back}>
            {fromPets && step === PET_STEPS[0] ? "Change pets" : "Back a step"}
          </button>
        )}
        {!picking && step === 0 && canPick && (
          <button type="button" className={styles.link} onClick={backToPets}>
            Pick from My Pets instead
          </button>
        )}
      </div>
    </section>
  );
}

export function Choices<T extends string>({
  options,
  selected,
  onPick,
  rows = false,
  columns = false,
}: {
  options: readonly { value: T; label: string; hint?: string }[];
  selected: T | null;
  onPick: (value: T) => void;
  rows?: boolean;
  columns?: boolean;
}) {
  const container = rows ? styles.rows : columns ? styles.twoCol : styles.chips;
  return (
    <div className={container}>
      {options.map((option) => {
        const on = option.value === selected;
        const className = rows ? (on ? styles.rowOptionOn : styles.rowOption) : columns ? (on ? styles.tileOn : styles.tile) : on ? styles.chipOn : styles.chip;
        return (
          <button key={option.value} type="button" className={className} aria-pressed={on} onClick={() => onPick(option.value)}>
            {option.label}
            {rows && option.hint && <span className={styles.muted}>{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  maxLength = LIMITS.shortText,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  min?: string;
  maxLength?: number;
  children?: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type={type}
        value={value}
        min={min}
        maxLength={type === "text" ? maxLength : undefined}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {children}
    </div>
  );
}

export function Continue({ onClick, label = "Continue" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={styles.primary} onClick={onClick}>
      {label}
    </button>
  );
}

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
