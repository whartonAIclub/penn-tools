"use client";

// Posting a request as a short conversation: one question at a time, tap an
// answer, type only when you want to. Every question has "Something else"
// with a text box. Owners with an API key can type one sentence instead and
// let AI fill in the answers; either way they review everything before
// posting.

import { useState, type ReactNode } from "react";
import {
  ACCESS,
  DATE_MODES,
  FREQUENCIES,
  LIMITS,
  OTHER,
  PAY_PRESETS,
  PET_KINDS,
  SUGGESTED_PAY,
  TASKS,
  TASKS_BY_KIND,
  describe,
  isoDate,
  labelOf,
  thisWeekend,
  type Access,
  type DateMode,
  type Frequency,
  type ParsedRequest,
  type PetKind,
  type RequestDraft,
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
  notes: string;
  notesDone: boolean;
}

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
  notes: "",
  notesDone: false,
};

const STEPS = ["your pet", "about them", "dates", "care", "keys", "pay", "notes"] as const;
const REVIEW = STEPS.length;

const orNull = (text: string) => (text.trim() ? text.trim() : null);
const needsKindText = (kind: PetKind | null) => kind === OTHER || kind === "several";

function toDraft(a: Answers): RequestDraft {
  const weekly = a.dateMode === "weekly";
  return {
    petName: a.petName.trim(),
    petKind: a.petKind ?? "dog",
    petKindOther: needsKindText(a.petKind) ? orNull(a.petKindOther) : null,
    petDetails: orNull(a.petDetails),
    photo: a.photo,
    weekly,
    startsOn: weekly ? null : orNull(a.startsOn),
    endsOn: weekly ? null : orNull(a.endsOn),
    frequency: a.frequency ?? "once_daily",
    frequencyOther: a.frequency === OTHER ? orNull(a.frequencyOther) : null,
    tasks: a.tasks,
    tasksOther: a.tasks.includes(OTHER) ? orNull(a.tasksOther) : null,
    access: a.access ?? "decide_later",
    accessOther: a.access === OTHER ? orNull(a.accessOther) : null,
    pay: a.pay.trim(),
    area: orNull(a.area),
    notes: orNull(a.notes),
  };
}

/** The first step whose answer is still missing, or REVIEW when everything is in. */
function firstMissing(a: Answers): number {
  if (!a.petKind || (needsKindText(a.petKind) && !a.petKindOther.trim())) return 0;
  if (!a.petName.trim()) return 1;
  if (!a.dateMode || (a.dateMode !== "weekly" && (!a.startsOn || !a.endsOn || a.endsOn < a.startsOn))) return 2;
  if (!a.frequency || (a.frequency === OTHER && !a.frequencyOther.trim()) || a.tasks.length === 0 || (a.tasks.includes(OTHER) && !a.tasksOther.trim())) return 3;
  if (!a.access || (a.access === OTHER && !a.accessOther.trim())) return 4;
  if (!a.pay.trim()) return 5;
  if (!a.notesDone) return 6;
  return REVIEW;
}

/** Merges what AI found into the answers, keeping only values the survey accepts. */
function mergeParsed(a: Answers, p: ParsedRequest): Answers {
  const next = { ...a };
  if (p.petKind) next.petKind = p.petKind;
  if (p.petKindOther) next.petKindOther = p.petKindOther;
  if (p.petName) next.petName = p.petName;
  if (p.petDetails) next.petDetails = p.petDetails;
  if (p.weekly) next.dateMode = "weekly";
  else if (p.startsOn && p.endsOn && /^\d{4}-\d{2}-\d{2}$/.test(p.startsOn) && /^\d{4}-\d{2}-\d{2}$/.test(p.endsOn)) {
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

export function Survey({ userFirstName, hasAI, onPosted }: { userFirstName: string; hasAI: boolean; onPosted: (id: string) => void }) {
  const [a, setA] = useState<Answers>(EMPTY);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [sentence, setSentence] = useState("");
  const [filledByAI, setFilledByAI] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }));
  // After AI fills the answers, skip straight to whatever is still missing.
  const advance = (next: Answers) => setStep(filledByAI ? firstMissing(next) : step + 1);
  /** Saves `patch` and moves on. */
  const answer = (patch: Partial<Answers>) => {
    const next = { ...a, ...patch };
    setA(next);
    setError(null);
    advance(next);
  };
  const goOn = () => {
    if (firstMissing(a) <= step) {
      setError("Answer this one to continue.");
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
    const next = mergeParsed(a, result.data);
    setA(next);
    setFilledByAI(true);
    setTyping(false);
    setStep(firstMissing(next));
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

  // The conversation so far: each answered question and its answer.
  const log: { from: "bot" | "me"; text: string }[] = [{ from: "bot", text: `Hi ${userFirstName}. Who are we looking after while you're away?` }];
  if (filledByAI) {
    log.push({ from: "me", text: sentence });
    log.push({ from: "bot", text: step === REVIEW ? "Got it. I filled everything in from what you wrote. Check it, then post." : "Got it. I filled in what you told me, and I'll ask about the rest." });
  } else {
    const said = (n: number, me: string, next: string) => step > n && log.push({ from: "me", text: me }, { from: "bot", text: next });
    said(0, needsKindText(a.petKind) ? a.petKindOther : labelOf(PET_KINDS, a.petKind ?? ""), `Lovely. Tell me about your ${kindWord}. A photo helps your sitter know who to look for at the door.`);
    said(1, [a.petName, a.petDetails].filter(Boolean).join(", ") + (a.photo ? ". Photo added." : ""), "When will you be away?");
    said(2, lines.when, `How often should someone come by, and what should they do for ${a.petName || "them"}?`);
    said(3, `${lines.visits}. ${lines.care}`, "How will your sitter get in?");
    said(4, lines.access, "What would you like to pay? Pick a rate, or I can suggest one.");
    said(5, a.pay, "Last one. Anything a sitter should know about health, quirks or your vet? And roughly where are you?");
    said(6, [a.area, a.notes].filter(Boolean).join(". ") || "Nothing else", "Here is your request. Look it over, then post it.");
  }

  const kindTasks = TASKS_BY_KIND[a.petKind ?? "dog"];

  return (
    <section className={styles.survey}>
      <div className={styles.progressLabel}>{step < REVIEW ? `Step ${step + 1} of ${STEPS.length}, ${STEPS[step]}` : "Review before posting"}</div>
      <div className={styles.progress} aria-hidden="true">
        <span style={{ width: `${Math.round((Math.min(step, REVIEW) / REVIEW) * 100)}%` }} />
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
            <dt className={styles.muted}>Visits</dt>
            <dd>{lines.visits}</dd>
            <dt className={styles.muted}>Care</dt>
            <dd>{lines.care}</dd>
            <dt className={styles.muted}>Keys</dt>
            <dd>{lines.access}</dd>
            <dt className={styles.muted}>Pay</dt>
            <dd>{a.pay}</dd>
            <dt className={styles.muted}>Where</dt>
            <dd>{a.area || "Not given"}</dd>
            <dt className={styles.muted}>Notes</dt>
            <dd className={styles.preLine}>{a.notes || "None"}</dd>
          </dl>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.answer}>
        {step === 0 && !typing && (
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
                Rather type it all in one sentence?
              </button>
            )}
          </>
        )}

        {step === 0 && typing && (
          <>
            <label htmlFor="pp-sentence" className={styles.label}>
              Describe what you need, like texting a friend
            </label>
            <textarea
              id="pp-sentence"
              className={styles.input}
              rows={3}
              maxLength={LIMITS.sentence}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder="Walk Mochi twice a day Thursday to Sunday, she's a shiba near 40th St"
            />
            <div className={styles.row}>
              <button type="button" className={styles.secondary} onClick={() => setTyping(false)}>
                Answer questions instead
              </button>
              <button type="button" className={styles.primary} disabled={busy || !sentence.trim()} onClick={() => void fill()}>
                {busy ? "Reading…" : "Fill it in for me"}
              </button>
            </div>
            <span className={styles.hint}>Uses your saved API key once. We ask about anything you leave out.</span>
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
                  <TextField id="pp-from" label="From" type="date" value={a.startsOn} min={isoDate(new Date())} onChange={(startsOn) => set({ startsOn })} />
                  <TextField id="pp-to" label="To" type="date" value={a.endsOn} min={a.startsOn || isoDate(new Date())} onChange={(endsOn) => set({ endsOn })} />
                </div>
                <Continue onClick={goOn} label="Use these dates" />
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <span className={styles.label}>How often</span>
            <Choices options={FREQUENCIES} selected={a.frequency} onPick={(frequency) => set({ frequency })} />
            {a.frequency === OTHER && (
              <TextField id="pp-freq" label="Describe the schedule" value={a.frequencyOther} placeholder="Mornings only, weekdays" onChange={(frequencyOther) => set({ frequencyOther })} />
            )}
            <span className={styles.label}>What to do on each visit</span>
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
            <Choices rows options={ACCESS} selected={a.access} onPick={(access) => (access === OTHER ? set({ access }) : answer({ access, accessOther: "" }))} />
            {a.access === OTHER && (
              <TextField id="pp-access" label="How will the sitter get in?" value={a.accessOther} placeholder="My roommate will let them in" onChange={(accessOther) => set({ accessOther })}>
                <Continue onClick={goOn} />
              </TextField>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <div className={styles.threeCol}>
              {PAY_PRESETS.map((amount) => {
                const value = `$${amount} a visit`;
                return (
                  <button key={amount} type="button" className={a.pay === value ? styles.tileOn : styles.tile} aria-pressed={a.pay === value} onClick={() => answer({ pay: value, payOwn: false })}>
                    ${amount}
                  </button>
                );
              })}
            </div>
            <button type="button" className={styles.secondary} onClick={() => answer({ pay: `$${SUGGESTED_PAY} a visit, suggested`, payOwn: false })}>
              Suggest a fair rate for me
            </button>
            <button type="button" className={a.payOwn ? styles.tileOn : styles.secondary} aria-pressed={a.payOwn} onClick={() => set({ payOwn: true, pay: "" })}>
              Set my own amount
            </button>
            {a.payOwn && (
              <TextField id="pp-pay" label="Amount and how you'll pay" value={a.pay} placeholder="$150 for the week on Venmo" onChange={(pay) => set({ pay })}>
                <Continue onClick={goOn} />
              </TextField>
            )}
          </>
        )}

        {step === 6 && (
          <>
            <TextField id="pp-area" label="Roughly where (optional)" value={a.area} placeholder="Near 40th and Spruce" onChange={(area) => set({ area })} />
            <label htmlFor="pp-notes" className={styles.label}>
              Health, quirks, vet, anything else (optional)
            </label>
            <textarea
              id="pp-notes"
              className={styles.input}
              rows={3}
              maxLength={LIMITS.notes}
              value={a.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Pulls on the leash near squirrels. Vet is University City Animal Clinic."
            />
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
                setStep(0);
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

        {step > 0 && step < REVIEW && (
          <button type="button" className={styles.link} onClick={() => setStep(step - 1)}>
            Back a step
          </button>
        )}
      </div>
    </section>
  );
}

function Choices<T extends string>({
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

function TextField({
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

function Continue({ onClick, label = "Continue" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={styles.primary} onClick={onClick}>
      {label}
    </button>
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
