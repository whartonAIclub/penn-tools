"use client";

// The Add a deal form. Only the establishment and what the deal is are
// required; everything else sits under "More details". Students can fill it
// in themselves, or paste a deal's text (including text copied from a photo)
// and let AI fill it in (on the platform's free AI credit, then their own
// key), then check it and save.

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type {
  DealDraft,
  DealType,
  Discount,
  DiscountCategory,
  DiscountKind,
  Neighborhood,
} from "@penntools/tool-student-discount-maximizer";
import { addDeal, fillForm, type ActionResult } from "./actions";
import type { Option } from "./DiscountBoard";
import styles from "./DiscountBoard.module.css";

export interface FormLimits {
  business: number;
  title: number;
  discount: number;
  appliesTo: number;
  code: number;
  location: number;
  url: number;
  howToClaim: number;
  search: number;
  pastedText: number;
}

/** A deal type, and whether it takes a number (20 for 20% off). */
export interface DealTypeOption extends Option<DealType> {
  amount: "required" | "optional" | "none";
}

interface FormState {
  business: string;
  dealType: DealType | "";
  amount: string;
  /** "Everything" when false. */
  specificItems: boolean;
  appliesTo: string;
  /** Never empty: the form keeps at least one ticked. */
  kinds: DiscountKind[];
  code: string;
  discount: string;
  title: string;
  location: string;
  neighborhood: Neighborhood | "";
  url: string;
  howToClaim: string;
  category: DiscountCategory;
  pennSpecific: boolean;
}

const EMPTY: FormState = {
  business: "",
  dealType: "",
  amount: "",
  specificItems: false,
  appliesTo: "",
  kinds: ["local"],
  code: "",
  discount: "",
  title: "",
  location: "",
  neighborhood: "",
  url: "",
  howToClaim: "",
  category: "other",
  pennSpecific: false,
};

/** Where the deal is used, in the order the form offers it: most deals are in person. */
const WHERE: { value: DiscountKind; label: string }[] = [
  { value: "local", label: "In person" },
  { value: "online", label: "Online" },
  { value: "code", label: "Promo code" },
];

// Errors about the student's AI key, or their used-up free AI credit, send them to Settings.
const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit", "credit_used"]);

async function call<T>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, error: { message: "Something went wrong. Try again." } };
  }
}

export function AddDiscountForm({
  providers,
  providerLabels,
  dealTypes,
  categories,
  neighborhoods,
  limits,
  onAdded,
}: {
  providers: AIProvider[];
  providerLabels: Record<AIProvider, string>;
  dealTypes: DealTypeOption[];
  categories: Option<DiscountCategory>[];
  neighborhoods: Option<Neighborhood>[];
  limits: FormLimits;
  onAdded: (deal: Discount) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const type = dealTypes.find((t) => t.value === form.dealType);
  const inPerson = form.kinds.includes("local");

  /** Ticks or unticks a way to use the deal, keeping at least one ticked. */
  function toggleKind(kind: DiscountKind) {
    setForm((f) => {
      const kinds = f.kinds.includes(kind) ? f.kinds.filter((k) => k !== kind) : [...f.kinds, kind];
      return kinds.length > 0 ? { ...f, kinds } : f;
    });
  }

  /** Fills in what the AI found, keeping what the student already typed where it found nothing. */
  function applyDraft(draft: DealDraft) {
    setForm((f) => ({
      business: draft.business ?? f.business,
      dealType: draft.dealType ?? f.dealType,
      amount: draft.amount !== null ? String(draft.amount) : f.amount,
      specificItems: draft.appliesTo !== null ? true : f.specificItems,
      appliesTo: draft.appliesTo ?? f.appliesTo,
      kinds: draft.kinds && draft.kinds.length > 0 ? draft.kinds : f.kinds,
      code: draft.code ?? f.code,
      discount: draft.discount ?? f.discount,
      title: draft.title ?? f.title,
      location: draft.location ?? f.location,
      neighborhood: draft.neighborhood ?? f.neighborhood,
      url: draft.url ?? f.url,
      howToClaim: draft.howToClaim ?? f.howToClaim,
      category: draft.category ?? f.category,
      pennSpecific: draft.pennSpecific ?? f.pennSpecific,
    }));
    // Show what the AI filled in beyond the essentials.
    if (draft.location || draft.url || draft.title || draft.howToClaim || draft.category) setMoreOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { specificItems, ...fields } = form;
    const result = await call(() =>
      addDeal({
        ...fields,
        amount: type?.amount === "none" ? "" : fields.amount,
        appliesTo: specificItems ? fields.appliesTo : "",
      }),
    );
    setSaving(false);
    if (result.ok) {
      setForm(EMPTY);
      setMoreOpen(false);
      setError(null);
      onAdded(result.data);
    } else {
      setError(result.error.message);
    }
  }

  return (
    <section className={styles.formCard}>
      <h2 className={styles.cardTitle}>Add a deal</h2>

      <FillWithAI providers={providers} providerLabels={providerLabels} maxLength={limits.pastedText} onDraft={applyDraft} />

      <form className={styles.form} onSubmit={(e) => void save(e)}>
        <label className={styles.field}>
          Establishment name
          <input
            className={styles.input}
            required
            maxLength={limits.business}
            placeholder="e.g. Sweetgreen"
            value={form.business}
            onChange={(e) => set("business", e.target.value)}
          />
        </label>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>What&apos;s the deal?</legend>
          <div className={styles.chips}>
            {dealTypes.map((t) => (
              <label key={t.value} className={form.dealType === t.value ? styles.chipActive : styles.chip}>
                <input
                  type="radio"
                  name="dealType"
                  value={t.value}
                  required
                  checked={form.dealType === t.value}
                  onChange={() => set("dealType", t.value)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        {type && type.amount !== "none" && (
          <label className={styles.field}>
            {form.dealType === "percent" ? "Percent off" : form.dealType === "amount" ? "Dollars off" : "Student price ($, optional)"}
            <input
              className={`${styles.input} ${styles.amount}`}
              inputMode="decimal"
              required={type.amount === "required"}
              placeholder={form.dealType === "percent" ? "e.g. 20" : "e.g. 5"}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </label>
        )}

        {type && form.dealType !== "other" && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{form.dealType === "free_item" ? "What's free?" : "What does it apply to?"}</legend>
            {form.dealType === "free_item" ? (
              <input
                className={styles.input}
                maxLength={limits.appliesTo}
                placeholder="e.g. admission, cookie with any drink"
                value={form.appliesTo}
                onFocus={() => set("specificItems", true)}
                onChange={(e) => {
                  set("specificItems", true);
                  set("appliesTo", e.target.value);
                }}
              />
            ) : (
              <>
                <div className={styles.chips}>
                  <label className={!form.specificItems ? styles.chipActive : styles.chip}>
                    <input type="radio" name="appliesTo" checked={!form.specificItems} onChange={() => set("specificItems", false)} />
                    Everything
                  </label>
                  <label className={form.specificItems ? styles.chipActive : styles.chip}>
                    <input type="radio" name="appliesTo" checked={form.specificItems} onChange={() => set("specificItems", true)} />
                    Specific items
                  </label>
                </div>
                {form.specificItems && (
                  <input
                    className={styles.input}
                    required
                    maxLength={limits.appliesTo}
                    placeholder="e.g. bowls, coffee drinks"
                    aria-label="Which items"
                    value={form.appliesTo}
                    onChange={(e) => set("appliesTo", e.target.value)}
                  />
                )}
              </>
            )}
          </fieldset>
        )}

        <label className={styles.field}>
          {form.dealType === "other" ? "Describe the deal" : "Details (optional)"}
          <input
            className={styles.input}
            required={form.dealType === "other"}
            maxLength={limits.discount}
            placeholder="e.g. Tuesdays only, show your PennCard"
            value={form.discount}
            onChange={(e) => set("discount", e.target.value)}
          />
        </label>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Where do you use it? (pick all that apply)</legend>
          <div className={styles.chips}>
            {WHERE.map((w) => (
              <label key={w.value} className={form.kinds.includes(w.value) ? styles.chipActive : styles.chip}>
                <input type="checkbox" name="kinds" checked={form.kinds.includes(w.value)} onChange={() => toggleKind(w.value)} />
                {w.label}
              </label>
            ))}
          </div>
        </fieldset>
        {form.kinds.includes("code") && (
          <label className={styles.field}>
            Code
            <input className={styles.input} required maxLength={limits.code} value={form.code} onChange={(e) => set("code", e.target.value)} />
          </label>
        )}

        <details className={styles.more} open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
          <summary>More details (optional)</summary>
          <div className={styles.form}>
            {inPerson && (
              <div className={styles.formRow}>
                <label className={styles.field}>
                  Address
                  <input className={styles.input} maxLength={limits.location} placeholder="e.g. 3601 Walnut St" value={form.location} onChange={(e) => set("location", e.target.value)} />
                </label>
                <label className={styles.field}>
                  Neighborhood
                  <select
                    className={styles.select}
                    value={form.neighborhood}
                    onChange={(e) => set("neighborhood", e.target.value as Neighborhood | "")}
                  >
                    <option value="">Not sure</option>
                    {neighborhoods.map((n) => (
                      <option key={n.value} value={n.value}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <label className={styles.field}>
              Link
              <input className={styles.input} type="url" maxLength={limits.url} placeholder="https://" value={form.url} onChange={(e) => set("url", e.target.value)} />
            </label>
            <label className={styles.field}>
              Category
              <select className={styles.select} value={form.category} onChange={(e) => set("category", e.target.value as DiscountCategory)}>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Title
              <input className={styles.input} maxLength={limits.title} placeholder="Only if the deal has a name, e.g. Premium Student" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </label>
            <label className={styles.field}>
              How to claim it
              <textarea className={styles.textarea} rows={2} maxLength={limits.howToClaim} value={form.howToClaim} onChange={(e) => set("howToClaim", e.target.value)} />
            </label>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={form.pennSpecific} onChange={(e) => set("pennSpecific", e.target.checked)} />
              Only for Penn students (e.g. with a PennCard)
            </label>
          </div>
        </details>

        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.button} type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add deal"}
        </button>
      </form>
    </section>
  );
}

function FillWithAI({
  providers,
  providerLabels,
  maxLength,
  onDraft,
}: {
  providers: AIProvider[];
  providerLabels: Record<AIProvider, string>;
  maxLength: number;
  onDraft: (draft: DealDraft) => void;
}) {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<AIProvider | undefined>(providers[0]);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<{ message: string; keyProblem: boolean } | null>(null);

  if (!provider) {
    return (
      <p className={styles.hint}>
        You&apos;ve used your free AI credit. Add an OpenAI or Anthropic key in{" "}
        <Link href="/settings" className={styles.link}>
          Settings
        </Link>{" "}
        to fill this form in from a deal&apos;s web page, or a photo of a sign.
      </p>
    );
  }

  async function fill() {
    setFilling(true);
    const result = await call(() => fillForm(provider!, text));
    setFilling(false);
    if (result.ok) {
      onDraft(result.data);
      setError(null);
    } else {
      setError({ message: result.error.message, keyProblem: KEY_PROBLEMS.has(result.error.kind ?? "") });
    }
  }

  return (
    <div className={styles.aiBox}>
      <label className={styles.field}>
        Fill it in with AI (optional)
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={maxLength}
          placeholder="Paste text from the deal's web page, an email, or a photo of a sign"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p className={styles.meta}>
        📷 From a photo: on iPhone, open the photo, press and hold the text, and tap Copy. On Android, use Google Lens
        to copy the text. Then paste it here.
      </p>
      <div className={styles.row}>
        {providers.length > 1 && (
          <select
            className={styles.select}
            aria-label="AI provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AIProvider)}
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {providerLabels[p]}
              </option>
            ))}
          </select>
        )}
        <button className={styles.button} type="button" disabled={filling || !text.trim()} onClick={() => void fill()}>
          {filling ? "Filling in…" : "Fill in with AI"}
        </button>
      </div>
      {error && (
        <p className={styles.error}>
          {error.message}
          {error.keyProblem && (
            <>
              {" "}
              Check your key in{" "}
              <Link href="/settings" className={styles.link}>
                Settings
              </Link>
              .
            </>
          )}
        </p>
      )}
      <p className={styles.meta}>Check what it fills in before you save: AI can get details wrong.</p>
    </div>
  );
}
