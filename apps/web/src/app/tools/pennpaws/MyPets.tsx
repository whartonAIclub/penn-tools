"use client";

// My Pets: an owner keeps a page per pet, so posting a request is picking one
// instead of answering the same questions again (R3b).
//
// Breed, food and health sit in their own section. They stay private until a
// booking is agreed, because a public request shouldn't carry a pet's medical
// history. Each can be shared sooner, one at a time, since a condition or a
// diet often decides whether a sitter can take the job at all.

import { useState } from "react";
import {
  ALONE,
  ENERGY,
  PET_AGES,
  PET_KINDS,
  PET_SIZES,
  PRIVATE_FIELDS,
  SPECIAL_CARE,
  WITH_ANIMALS,
  WITH_PEOPLE,
  OTHER,
  labelOf,
  type Pet,
  type PrivateField,
  type SavedPet,
} from "@penntools/tool-pennpaws";
import { deletePet, savePet } from "./actions";
import { PetAvatar } from "./PennPaws";
import styles from "./PennPaws.module.css";

const BLANK: SavedPet = {
  name: "",
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
  breed: null,
  diet: null,
  health: null,
  sharedEarly: [],
};

/** Shrinks a photo to at most 480px on its long side, as a JPEG data URL. */
export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
const trimmed = (value: string): string | null => (value.trim() ? value.trim() : null);

function Choices<T extends string>({ options, selected, onPick }: { options: readonly { value: string; label: string }[]; selected: T; onPick: (value: T) => void }) {
  return (
    <div className={styles.chips}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={selected === option.value ? styles.chipOn : styles.chip}
          aria-pressed={selected === option.value}
          onClick={() => onPick(option.value as T)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}

/** Adding a pet from somewhere else, such as posting a request: opens straight on the form and hands back the new pet. */
export interface AddingPet {
  onAdded: (petId: string) => void;
  onCancel: () => void;
}

export function MyPets({
  pets,
  onChanged,
  onProfile,
  adding,
}: {
  pets: Pet[];
  onChanged: () => void;
  onProfile: () => void;
  adding?: AddingPet;
}) {
  const [editing, setEditing] = useState<{ id: string | null; pet: SavedPet } | null>(adding ? { id: null, pet: BLANK } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const set = (patch: Partial<SavedPet>) => setEditing((current) => (current ? { ...current, pet: { ...current.pet, ...patch } } : current));

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const result = await savePet(editing.id, editing.pet);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (adding) return adding.onAdded(result.data);
    setEditing(null);
    onChanged();
  };

  const remove = async (petId: string) => {
    setBusy(true);
    setError(null);
    const result = await deletePet(petId);
    setBusy(false);
    setConfirming(null);
    if (!result.ok) return setError(result.error);
    onChanged();
  };

  if (editing) {
    const pet = editing.pet;
    return (
      <section className={styles.stack}>
        <h3 className={styles.heading}>{editing.id ? `Editing ${pet.name || "your pet"}` : "Add a pet"}</h3>

        <label className={styles.petPhotoRow}>
          <span className={pet.photo ? styles.petPhotoPickOn : styles.petPhotoPick}>
            {pet.photo ? (
              // A plain img: next/image adds nothing to a small data URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pet.photo} alt={`Photo of ${pet.name || "your pet"}`} />
            ) : (
              <span className={styles.petPhotoPlus} aria-hidden="true">
                +
              </span>
            )}
          </span>
          <span className={styles.petPhotoSide}>
            <span className={styles.petPhotoButton}>{pet.photo ? "Change photo" : "Add a photo"}</span>
            <span className={styles.hint}>
              {pet.photo
                ? `This is how sitters recognise ${pet.name || "your pet"} at the door.`
                : "Optional, but it's how a sitter recognises them at the door."}
            </span>
          </span>
          <input
            type="file"
            accept="image/*"
            className={styles.visuallyHidden}
            aria-label={pet.photo ? "Change photo" : "Add a photo"}
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

        <Field label="Name">
          <input className={styles.input} value={pet.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="Mochi" />
        </Field>
        <Field label="Kind of pet">
          <Choices options={PET_KINDS} selected={pet.kind} onPick={(kind) => set({ kind })} />
        </Field>
        {(pet.kind === OTHER || pet.kind === "several") && (
          <Field label="Tell sitters what kind">
            <input
              className={styles.input}
              value={pet.kindOther ?? ""}
              maxLength={120}
              onChange={(e) => set({ kindOther: trimmed(e.target.value) })}
              placeholder="Two parakeets"
            />
          </Field>
        )}
        <Field label="Size">
          <Choices options={PET_SIZES} selected={pet.size} onPick={(size) => set({ size })} />
        </Field>
        <Field label="Age">
          <Choices options={PET_AGES} selected={pet.age} onPick={(age) => set({ age })} />
        </Field>
        <Field label="Energy">
          <Choices options={ENERGY} selected={pet.energy} onPick={(energy) => set({ energy })} />
        </Field>
        <Field label="With new people">
          <Choices options={WITH_PEOPLE} selected={pet.withPeople} onPick={(withPeople) => set({ withPeople })} />
        </Field>
        <Field label="With other animals">
          <Choices options={WITH_ANIMALS} selected={pet.withAnimals} onPick={(withAnimals) => set({ withAnimals })} />
        </Field>
        <Field label="When left alone">
          <Choices options={ALONE} selected={pet.alone} onPick={(alone) => set({ alone })} />
        </Field>
        <Field label="Special care">
          <div className={styles.chips}>
            {SPECIAL_CARE.map((option) => (
              <button
                key={option.value}
                type="button"
                className={pet.specialCare.includes(option.value) ? styles.chipOn : styles.chip}
                aria-pressed={pet.specialCare.includes(option.value)}
                onClick={() => set({ specialCare: toggle([...pet.specialCare], option.value) })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
        {pet.specialCare.includes(OTHER) && (
          <Field label="Describe the special care">
            <input className={styles.input} value={pet.specialCareOther ?? ""} maxLength={120} onChange={(e) => set({ specialCareOther: trimmed(e.target.value) })} />
          </Field>
        )}
        <Field label={`Has ${pet.name || "your pet"} ever bitten or scratched someone?`}>
          <Choices
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            selected={pet.bites ? "yes" : "no"}
            onPick={(value) => set({ bites: value === "yes", bitesDetails: value === "yes" ? pet.bitesDetails : null })}
          />
        </Field>
        {pet.bites && (
          <Field label="What happened, so sitters can prepare">
            <textarea className={styles.input} rows={2} value={pet.bitesDetails ?? ""} maxLength={300} onChange={(e) => set({ bitesDetails: trimmed(e.target.value) })} />
          </Field>
        )}

        <h4 className={styles.subhead}>Only for your sitter</h4>
        <span className={styles.hint}>
          These stay off your public request. The sitter you book reads them once you both approve. Tick one to show it earlier, to everyone browsing — worth doing
          when it decides whether someone can take the job.
        </span>
        {PRIVATE_FIELDS.map(({ value: field, label }) => (
          <Field key={field} label={label}>
            <textarea
              className={styles.input}
              rows={field === "breed" ? 1 : 2}
              value={pet[field] ?? ""}
              maxLength={300}
              onChange={(e) => set({ [field]: trimmed(e.target.value) } as Partial<SavedPet>)}
              placeholder={
                field === "breed" ? "Shiba Inu" : field === "diet" ? "Half a cup twice a day. No chicken, it gives her hives." : "Epilepsy. One tablet morning and night."
              }
            />
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={pet.sharedEarly.includes(field)}
                onChange={() => set({ sharedEarly: toggle([...pet.sharedEarly], field) as PrivateField[] })}
              />
              <span className={styles.hint}>Show this before booking</span>
            </label>
          </Field>
        ))}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : editing.id ? "Save changes" : "Add this pet"}
        </button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => (adding ? adding.onCancel() : setEditing(null))}>
          {adding ? "Back to picking pets" : "Cancel without saving"}
        </button>
      </section>
    );
  }

  return (
    <section className={styles.stack}>
      <h3 className={styles.heading}>My Pets</h3>
      <span className={styles.hint}>Everything here fills in your next request, so you only answer what changes.</span>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {pets.length === 0 ? (
        <p className={styles.muted}>No pets yet. Add one, and posting a request becomes a few taps.</p>
      ) : (
        <ul className={styles.list}>
          {pets.map((pet) => (
            <li key={pet.id} className={styles.offer}>
              <div className={styles.nameRow}>
                <PetAvatar name={pet.name} photo={pet.photo} kind={pet.kind} />
                <div>
                  <strong>{pet.name}</strong>
                  <p className={styles.hint}>
                    {[labelOf(PET_KINDS, pet.kind), pet.breed, labelOf(PET_SIZES, pet.size).toLowerCase(), labelOf(PET_AGES, pet.age).toLowerCase()]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
              <div className={styles.row}>
                <button type="button" className={styles.secondary} onClick={() => setEditing({ id: pet.id, pet })}>
                  Edit
                </button>
                {confirming === pet.id ? (
                  <button type="button" className={styles.secondary} disabled={busy} onClick={() => void remove(pet.id)}>
                    {busy ? "Removing…" : "Really remove"}
                  </button>
                ) : (
                  <button type="button" className={styles.secondary} onClick={() => setConfirming(pet.id)}>
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={styles.primary} onClick={() => setEditing({ id: null, pet: BLANK })}>
        Add a pet
      </button>
      <button type="button" className={styles.editLink} onClick={onProfile}>
        Your own details, location and sitter preferences
      </button>
    </section>
  );
}
