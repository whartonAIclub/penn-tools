"use client";

// The Add a deal pop-up. Only the store, what the deal is and who's
// adding it are required; everything else sits under "More details". Students
// can fill it in themselves, or drop a screenshot or photo of the deal, or
// paste its text, and let AI fill it in (on the platform's free AI credit,
// then their own key), then check it and save.

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type {
  DealDraft,
  DealType,
  Discount,
  DiscountCategory,
  DiscountKind,
  DiscountScope,
  Neighborhood,
  Screenshot,
} from "@penntools/tool-student-discount-maximizer";
import { isSettingsError } from "@penntools/core/ai/errors";
import { isSameSaving, readAmount, type SimilarDeal } from "@penntools/tool-student-discount-maximizer/discounts";
import { addDeal, fillForm, similarDeals, type ActionResult } from "./actions";
import { callAction } from "./callAction";
import type { Option } from "./DiscountBoard";
import { prepareScreenshot } from "./screenshot";
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
  addedBy: number;
  sourcedFrom: number;
  search: number;
  pastedText: number;
  /** The largest screenshot or photo sent to AI, in bytes. */
  screenshot: number;
}

/** A deal type, and whether it takes a number (20 for 20% off). */
export interface DealTypeOption extends Option<DealType> {
  amount: "required" | "optional" | "none";
}

interface FormState {
  scope: DiscountScope;
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
  /** YYYY-MM-DD, or empty for no end date. */
  expiresOn: string;
  addedBy: string;
  sourcedFrom: string;
  /** Ticked when the deal has no link, the only time the link isn't required. */
  noLink: boolean;
}

const EMPTY: FormState = {
  scope: "general",
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
  expiresOn: "",
  addedBy: "",
  sourcedFrom: "",
  noLink: false,
};

/** Suggestions for Sourced from; students can type anything. */
const SOURCES = ["UNiDAYS", "Student Beans", "ID.me", "SheerID", "The store's website", "In store"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as YYYY-MM-DD in the student's own time zone, the earliest end date the form offers. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Where the deal is used, in the order the form offers it: most deals are in person. */
const WHERE: { value: DiscountKind; label: string }[] = [
  { value: "local", label: "In person" },
  { value: "online", label: "Online" },
  { value: "code", label: "Promo code" },
];

/** Sends a screenshot to the tool's fill-screenshot route (a route, since server actions refuse requests over 1 MB). */
async function fillFormFromScreenshot(provider: AIProvider, screenshot: Screenshot): Promise<ActionResult<DealDraft>> {
  const response = await fetch("/tools/student-discount-maximizer/fill-screenshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, screenshot }),
  });
  if (response.status === 401) {
    return { ok: false, error: { message: "Sign in with the button at the top right to do that." } };
  }
  return (await response.json()) as ActionResult<DealDraft>;
}

export function AddDiscountForm({
  providers,
  providerLabels,
  scopes,
  dealTypes,
  categories,
  neighborhoods,
  limits,
  defaultAddedBy,
  onAdded,
  onClose,
}: {
  providers: AIProvider[];
  providerLabels: Record<AIProvider, string>;
  scopes: Option<DiscountScope>[];
  dealTypes: DealTypeOption[];
  categories: Option<DiscountCategory>[];
  neighborhoods: Option<Neighborhood>[];
  limits: FormLimits;
  /** The signed-in student's first name, to start the Added by field with. */
  defaultAddedBy: string;
  onAdded: (deal: Discount) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>({ ...EMPTY, addedBy: defaultAddedBy });
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);

  // Start in the first field, close on Escape, and put focus back where it was after.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("textarea, input:not([type=file]), select")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [onClose]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const type = dealTypes.find((t) => t.value === form.dealType);
  const inPerson = form.kinds.includes("local");

  // Deals already listed at this store, looked up as the student types its
  // name, so they can see them before adding a duplicate.
  const [similar, setSimilar] = useState<SimilarDeal[]>([]);
  const [notDuplicate, setNotDuplicate] = useState(false);
  const similarRequest = useRef(0);
  useEffect(() => {
    const request = ++similarRequest.current;
    setNotDuplicate(false);
    if (form.business.trim().length < 2) {
      setSimilar([]);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await callAction(() => similarDeals(form.business));
      if (request === similarRequest.current) setSimilar(result.ok ? result.data : []);
    }, 400);
    return () => clearTimeout(timer);
  }, [form.business]);

  // The one already listed that this deal would duplicate: the same store and
  // saving (see isSameSaving). The server refuses it too.
  const typedAmount = type?.amount === "none" ? null : readAmount(form.amount);
  const amount = typedAmount !== null && Number.isFinite(typedAmount) ? typedAmount : null;
  const duplicate = form.dealType
    ? similar.find(
        (d) =>
          d.sameStore &&
          isSameSaving(
            {
              scope: form.scope,
              dealType: form.dealType as DealType,
              amount,
              appliesTo: form.specificItems && form.dealType !== "other" ? form.appliesTo || null : null,
            },
            d,
          ),
      )
    : undefined;

  /** Ticks or unticks a way to use the deal, keeping at least one ticked. */
  function toggleKind(kind: DiscountKind) {
    setForm((f) => {
      const kinds = f.kinds.includes(kind) ? f.kinds.filter((k) => k !== kind) : [...f.kinds, kind];
      return kinds.length > 0 ? { ...f, kinds } : f;
    });
  }

  /**
   * Fills in what the AI found, keeping what the student already typed where
   * it found nothing. Kept the same between renders, so FillWithAI (memo)
   * doesn't re-render on every keystroke in the form.
   */
  const applyDraft = useCallback((draft: DealDraft) => {
    setForm((f) => ({
      scope: draft.scope ?? f.scope,
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
      // The date field only takes YYYY-MM-DD, so anything else the AI returns is dropped.
      expiresOn: draft.expiresOn && DATE_RE.test(draft.expiresOn) ? draft.expiresOn : f.expiresOn,
      addedBy: f.addedBy,
      sourcedFrom: draft.sourcedFrom ?? f.sourcedFrom,
      noLink: draft.url ? false : f.noLink,
    }));
    // Show what the AI filled in beyond the essentials.
    if (draft.location || draft.url || draft.title || draft.howToClaim || draft.category || draft.expiresOn || draft.sourcedFrom) {
      setMoreOpen(true);
    }
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (duplicate) return;
    // The second check, after the checkbox: other deals at this store are listed above.
    if (
      similar.length > 0 &&
      !window.confirm(
        `Are you sure this isn't a duplicate? ${similar.length === 1 ? "A deal" : `${similar.length} deals`} at ${similar[0]!.business} ` +
          `${similar.length === 1 ? "is" : "are"} already listed. Please don't add the same deal twice.`,
      )
    ) {
      return;
    }
    setSaving(true);
    // Only what's on screen is sent: a field hidden by a later choice (a code
    // typed before unticking "Promo code", say) keeps its text in case the
    // student switches back, but isn't saved. The server drops them too.
    const { specificItems, ...fields } = form;
    const result = await callAction(() =>
      addDeal({
        ...fields,
        amount: type?.amount === "none" ? "" : fields.amount,
        appliesTo: specificItems && form.dealType !== "other" ? fields.appliesTo : "",
        code: form.kinds.includes("code") ? fields.code : "",
        location: inPerson ? fields.location : "",
        neighborhood: inPerson ? fields.neighborhood : "",
        url: form.noLink ? "" : fields.url,
        notDuplicate: similar.length > 0 && notDuplicate,
      }),
    );
    setSaving(false);
    if (result.ok) {
      setForm({ ...EMPTY, addedBy: form.addedBy });
      setMoreOpen(false);
      setError(null);
      onAdded(result.data);
    } else {
      setError(result.error.message);
      // A possible duplicate: show the deals at the store, and the checkbox when it's allowed.
      if (result.error.similar) {
        setSimilar(result.error.similar);
        setNotDuplicate(false);
      }
    }
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        // Only a click on the backdrop itself closes it, not one inside the pop-up.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="add-deal-title">
        <div className={styles.dialogHeader}>
          <h2 id="add-deal-title" className={styles.cardTitle}>
            Add a deal
          </h2>
          <button type="button" className={styles.closeButton} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <FillWithAI
          providers={providers}
          providerLabels={providerLabels}
          maxLength={limits.pastedText}
          maxScreenshotBytes={limits.screenshot}
          onDraft={applyDraft}
        />

        <form className={styles.form} onSubmit={(e) => void save(e)}>
          <label className={styles.field}>
            Store
            <input
              className={styles.input}
              required
              maxLength={limits.business}
              placeholder="e.g. Sweetgreen"
              value={form.business}
              onChange={(e) => set("business", e.target.value)}
            />
          </label>

          {similar.length > 0 && (
            <div className={duplicate ? styles.dupBlock : styles.dupWarning} role="alert">
              <strong className={styles.dupTitle}>
                {duplicate
                  ? "⛔ This deal is already listed"
                  : `⚠️ ${similar.length === 1 ? "There's already a deal" : `There are already ${similar.length} deals`} at ${similar[0]!.business}`}
              </strong>
              <span>
                {duplicate
                  ? "You can't add a deal with the same store, type of discount and deal twice. If it still works, vote 👍 on it instead."
                  : "Please do not add a duplicate. If your deal is one of these, vote on it instead of adding it again."}
              </span>
              <ul className={styles.dupList}>
                {similar.map((d) => (
                  <li key={d.id} className={duplicate?.id === d.id ? styles.dupMatch : undefined}>
                    <strong>{d.business}</strong>: {d.title ?? d.summary}
                    {d.sourcedFrom && ` · ${d.sourcedFrom}`} · 👍 {d.works}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.linkBox}>
            <label className={styles.field}>
              Link to the deal
              <input
                className={styles.input}
                type="url"
                required={!form.noLink}
                disabled={form.noLink}
                maxLength={limits.url}
                placeholder="https://"
                value={form.noLink ? "" : form.url}
                onChange={(e) => set("url", e.target.value)}
              />
            </label>
            <span className={styles.linkNote}>
              🔗 The right link is the most helpful thing you can add: it&apos;s how students actually get this deal.
              Please take a moment to find the exact page for it, not just the store&apos;s homepage.
            </span>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={form.noLink} onChange={(e) => set("noLink", e.target.checked)} />
              There&apos;s no link for this deal (for example, it&apos;s only offered in person)
            </label>
          </div>

          <label className={styles.field}>
            Type of discount
            <select className={styles.select} value={form.scope} onChange={(e) => set("scope", e.target.value as DiscountScope)}>
              {scopes.map((sc) => (
                <option key={sc.value} value={sc.value}>
                  {sc.label}
                </option>
              ))}
            </select>
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
                Expiration date
                <input
                  className={`${styles.input} ${styles.amount}`}
                  type="date"
                  min={today()}
                  value={form.expiresOn}
                  onChange={(e) => set("expiresOn", e.target.value)}
                />
                <span className={styles.meta}>Leave it empty if the deal doesn&apos;t end. After this date it moves to Expired.</span>
              </label>
              <label className={styles.field}>
                Sourced from
                <input
                  className={styles.input}
                  list="deal-sources"
                  maxLength={limits.sourcedFrom}
                  placeholder="Where you found it, e.g. UNiDAYS"
                  value={form.sourcedFrom}
                  onChange={(e) => set("sourcedFrom", e.target.value)}
                />
                <datalist id="deal-sources">
                  {SOURCES.map((source) => (
                    <option key={source} value={source} />
                  ))}
                </datalist>
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

          <label className={styles.field}>
            Added by (shown publicly on the deal)
            <input
              className={styles.input}
              required
              maxLength={limits.addedBy}
              placeholder="Your first name or a nickname"
              value={form.addedBy}
              onChange={(e) => set("addedBy", e.target.value)}
            />
            <span className={styles.meta}>Anyone can see this, even signed out. A first name or nickname is fine.</span>
          </label>

          {similar.length > 0 && !duplicate && (
            <label className={styles.dupConfirm}>
              <input type="checkbox" required checked={notDuplicate} onChange={(e) => setNotDuplicate(e.target.checked)} />
              I checked the {similar.length === 1 ? "deal" : `${similar.length} deals`} at {similar[0]!.business} listed above, and mine
              isn&apos;t one of them.
            </label>
          )}
          {duplicate && <p className={styles.error}>This deal is already listed, so it can&apos;t be added again.</p>}
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.button} type="submit" disabled={saving || Boolean(duplicate)}>
            {saving ? "Saving…" : "Add deal"}
          </button>
        </form>
      </section>
    </div>
  );
}

/** Memoized: the form re-renders on every keystroke, and this holds the image. */
const FillWithAI = memo(function FillWithAI({
  providers,
  providerLabels,
  maxLength,
  maxScreenshotBytes,
  onDraft,
}: {
  providers: AIProvider[];
  providerLabels: Record<AIProvider, string>;
  maxLength: number;
  maxScreenshotBytes: number;
  onDraft: (draft: DealDraft) => void;
}) {
  const [text, setText] = useState("");
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<AIProvider | undefined>(providers[0]);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<{ message: string; keyProblem: boolean } | null>(null);

  // The preview is an object URL made once per image, not a data: URL rebuilt
  // from megabytes of base64 on every render; freed when the image goes.
  const preview = useMemo(
    () =>
      shot ? URL.createObjectURL(new Blob([Uint8Array.from(atob(shot.data), (c) => c.charCodeAt(0))], { type: shot.mediaType })) : null,
    [shot],
  );
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (!provider) {
    return (
      <p className={styles.hint}>
        You&apos;ve used your free AI credit. Add an OpenAI or Anthropic key in{" "}
        <Link href="/settings" className={styles.link} target="_blank" rel="noopener noreferrer">
          Settings
        </Link>{" "}
        to fill this form in from a screenshot, a photo of a sign or a deal&apos;s text.
      </p>
    );
  }

  async function fill() {
    setFilling(true);
    // An image, when there is one, is what gets read.
    const result = await callAction(() => (shot ? fillFormFromScreenshot(provider!, shot) : fillForm(provider!, text)));
    setFilling(false);
    if (result.ok) {
      onDraft(result.data);
      setError(null);
      // The form has what the image showed; don't keep megabytes of it around.
      setShot(null);
    } else {
      setError({ message: result.error.message, keyProblem: isSettingsError(result.error.kind) });
    }
  }

  async function takeFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    const result = await prepareScreenshot(file, maxScreenshotBytes);
    setReading(false);
    if (typeof result === "string") {
      setError({ message: result, keyProblem: false });
    } else {
      setShot(result);
      setError(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void takeFile(e.dataTransfer.files[0]);
  }

  // An image copied to the clipboard (e.g. Cmd+Ctrl+Shift+4 on a Mac) can be pasted straight in.
  function onPaste(e: ClipboardEvent) {
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (image) {
      e.preventDefault();
      void takeFile(image);
    }
  }

  return (
    <div className={styles.aiBox} onPaste={onPaste}>
      <span className={styles.legend}>Fill it in with AI (optional)</span>
      {shot && preview ? (
        <div className={styles.shot}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.shotImg} src={preview} alt="Your screenshot or photo" />
          <button type="button" className={styles.linkButton} onClick={() => setShot(null)}>
            Remove image
          </button>
        </div>
      ) : (
        <div
          className={dragging ? styles.dropZoneActive : styles.dropZone}
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInput.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {reading ? "Reading the image…" : "📷 Drop a screenshot or photo of the deal here, paste one, or click to choose"}
          <input
            ref={fileInput}
            type="file"
            hidden
            accept="image/*"
            onChange={(e) => {
              void takeFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      <label className={styles.field}>
        Or paste the deal&apos;s text
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={maxLength}
          placeholder="Paste text from the deal's web page or an email"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
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
        <button className={styles.button} type="button" disabled={filling || reading || (!shot && !text.trim())} onClick={() => void fill()}>
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
              <Link href="/settings" className={styles.link} target="_blank" rel="noopener noreferrer">
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
});
