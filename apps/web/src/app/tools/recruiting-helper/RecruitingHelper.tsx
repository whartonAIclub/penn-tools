"use client";

// Recruiting Helper's page: the student's profile, a box to paste a job posting
// or LinkedIn profile (text or screenshots), and the ranked list of everything
// scored so far. The profile and list are saved to the user's account by
// actions.ts and score/route.ts, so they're the same on every device.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type {
  CompanyTier,
  OutreachDraft,
  RecruitingProfile,
  SavedContact,
  SavedItem,
  Screenshot,
} from "@penntools/tool-recruiting-helper";
import {
  clearMyOutreachStyle,
  draftMissingOutreach,
  draftMyOutreach,
  removeMyItem,
  reviseAllMyOutreach,
  saveMyEmail,
  saveMySchools,
  saveMyOutreach,
  saveMyProfile,
} from "./actions";
import { Dictation } from "./Dictation";
import { RolePicker } from "./RolePicker";
import { ACCEPT, readScreenshot, screenshotSrc, toBase64 } from "./screenshots";
import styles from "./RecruitingHelper.module.css";

interface ScoreError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

type ScoreResponse = { ok: true; item: SavedItem; replaced: boolean } | { ok: false; error: ScoreError };

type Status = { state: "idle" } | { state: "loading" } | { state: "error"; error: ScoreError };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);
const TIERS: CompanyTier[] = ["target", "secondary", "practice"];
const TIER_HELP: Record<CompanyTier, string> = {
  target: "Target companies: your top choices (+1 on jobs, +2 on people)",
  secondary: "Secondary: would be happy there (+0 on jobs, +1 on people)",
  practice: "Practice: interview practice or backups (-1 on jobs)",
};

/**
 * A profile an earlier version of this page saved in this browser, before
 * profiles were saved to accounts; offered once in the editor, then forgotten.
 */
const oldStorageKey = (userId: string) => `recruiting-helper:${userId}`;

function oldBrowserProfile(userId: string): RecruitingProfile | null {
  try {
    const raw = localStorage.getItem(oldStorageKey(userId));
    const profile = raw ? (JSON.parse(raw) as { profile?: RecruitingProfile }).profile : null;
    return profile && typeof profile.background === "string" ? profile : null;
  } catch {
    return null;
  }
}

/** Ranked as the server ranks them: best score first, most recent first within a score. */
const byRank = (a: SavedItem, b: SavedItem) => b.score - a.score || b.addedAt.localeCompare(a.addedAt);

export function RecruitingHelper({
  userId,
  initialProfile,
  initialItems,
  providers,
  labels,
  samples,
  limits,
}: {
  userId: string;
  initialProfile: RecruitingProfile | null;
  initialItems: SavedItem[];
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  samples: { profile: RecruitingProfile; posting: string; linkedIn: string };
  limits: { pasteLength: number; screenshots: number; resumeBytes: number; backgroundLength: number };
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [items, setItems] = useState(initialItems);
  const [editingProfile, setEditingProfile] = useState(!initialProfile);
  const [provider, setProvider] = useState(providers[0]!);
  const [browserProfile, setBrowserProfile] = useState<RecruitingProfile | null>(null);

  // localStorage only exists in the browser, so look for an old profile after the first render.
  useEffect(() => {
    if (!initialProfile) setBrowserProfile(oldBrowserProfile(userId));
  }, [userId, initialProfile]);

  // Every person gets an email draft: write any that are missing (people scored
  // before drafts were automatic, or whose draft failed) once, when the page opens.
  const [autoDrafts, setAutoDrafts] = useState<{ state: "writing"; count: number } | { state: "error"; error: ScoreError } | null>(null);
  const autoDraftStarted = useRef(false);
  useEffect(() => {
    if (autoDraftStarted.current || !initialProfile) return;
    const count = initialItems.filter((i) => i.kind === "contact" && !i.outreach).length;
    if (count === 0) return;
    autoDraftStarted.current = true;
    setAutoDrafts({ state: "writing", count });
    draftMissingOutreach(providers[0]!)
      .then((result) => {
        if (result.ok) {
          setItems(result.data.items);
          setAutoDrafts(null);
        } else {
          setAutoDrafts({ state: "error", error: { message: result.message, ...(result.kind && { kind: result.kind }) } });
        }
      })
      .catch(() => setAutoDrafts({ state: "error", error: { message: "Couldn't write the missing email drafts. Reload to try again." } }));
  }, [initialItems, initialProfile, providers]);

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Recruiting Helper</h1>
        <p className={styles.intro}>
          Paste a job posting or a LinkedIn profile. It&apos;s scored 1 to 5 against your own target companies, roles
          and background, and added to your ranked list, so you know whom to reach out to first.
        </p>
      </header>

      {editingProfile || !profile ? (
        <ProfileEditor
          key={browserProfile ? "from-browser" : "fresh"}
          initial={profile ?? browserProfile}
          fromBrowser={!profile && !!browserProfile}
          sample={samples.profile}
          provider={provider}
          maxResumeBytes={limits.resumeBytes}
          maxBackgroundLength={limits.backgroundLength}
          onSaved={(saved, rescored) => {
            // The editor doesn't edit the outreach style, and the server kept it.
            setProfile({ ...saved, ...(profile?.outreachStyle && { outreachStyle: profile.outreachStyle }) });
            setItems(rescored);
            setEditingProfile(false);
            setBrowserProfile(null);
            try {
              localStorage.removeItem(oldStorageKey(userId)); // now in the account
            } catch {
              // Storage blocked: nothing to forget.
            }
          }}
          onCancel={profile ? () => setEditingProfile(false) : null}
        />
      ) : (
        <ProfileSummary profile={profile} onEdit={() => setEditingProfile(true)} />
      )}

      {profile && (
        <>
          <AddCard
            provider={provider}
            providers={providers}
            labels={labels}
            onProvider={setProvider}
            samples={samples}
            limits={limits}
            onScored={(item) =>
              // A repeat of the same person or posting link comes back with the old entry's id.
              setItems((old) => [item, ...old.filter((i) => i.id !== item.id)].sort(byRank))
            }
            onUpdated={(item) => setItems((old) => old.map((i) => (i.id === item.id ? item : i)))}
          />
          <RankedList
            items={items}
            provider={provider}
            autoDrafts={autoDrafts}
            outreachStyle={profile.outreachStyle ?? null}
            onStyleChange={(outreachStyle) =>
              setProfile((old) => {
                if (!old) return old;
                const { outreachStyle: _old, ...rest } = old;
                return outreachStyle ? { ...rest, outreachStyle } : rest;
              })
            }
            onItemsReplaced={setItems}
            onRemoved={(id) => setItems((old) => old.filter((i) => i.id !== id))}
            onUpdated={(item) => setItems((old) => old.map((i) => (i.id === item.id ? item : i)))}
          />
        </>
      )}
    </div>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

const toLines = (s: string) =>
  s
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

type Upload =
  | { state: "idle" }
  | { state: "reading" }
  | { state: "done"; name: string }
  | { state: "error"; error: ScoreError };

function ProfileEditor({
  initial,
  fromBrowser,
  sample,
  provider,
  maxResumeBytes,
  maxBackgroundLength,
  onSaved,
  onCancel,
}: {
  initial: RecruitingProfile | null;
  /** True when `initial` is an old profile from this browser, not yet in the account. */
  fromBrowser: boolean;
  sample: RecruitingProfile;
  /** The AI provider that reads PDF résumés. */
  provider: AIProvider;
  maxResumeBytes: number;
  maxBackgroundLength: number;
  /** Called with the saved profile and the list, re-scored against it. */
  onSaved: (profile: RecruitingProfile, items: SavedItem[]) => void;
  onCancel: (() => void) | null;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<Upload>({ state: "idle" });
  const resumeInput = useRef<HTMLInputElement>(null);

  /** Reads the résumé on the server (resume/route.ts) and puts its text in the background box. */
  async function uploadResume(file: File) {
    if (file.size > maxResumeBytes) {
      setUpload({ state: "error", error: { message: `${file.name} is over ${maxResumeBytes / 1024 / 1024} MB.` } });
      return;
    }
    setUpload({ state: "reading" });
    try {
      const res = await fetch("/tools/recruiting-helper/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, name: file.name, data: await toBase64(file) }),
      });
      const result = (await res.json().catch(() => null)) as
        | { ok: true; text: string }
        | { ok: false; error: ScoreError }
        | null;
      if (!result) {
        setUpload({ state: "error", error: { message: `Couldn't read ${file.name} (HTTP ${res.status}). Try again.` } });
      } else if (!result.ok) {
        setUpload({ state: "error", error: result.error });
      } else {
        setForm((old) => ({ ...old, background: result.text }));
        setUpload({ state: "done", name: file.name });
      }
    } catch {
      setUpload({ state: "error", error: { message: "Couldn't reach PennTools. Check your connection and try again." } });
    }
  }
  const companiesIn = (p: RecruitingProfile | null, tier: CompanyTier) =>
    (p?.companies ?? [])
      .filter((c) => c.tier === tier)
      .map((c) => c.name)
      .join("\n");
  const fill = (p: RecruitingProfile | null) => ({
    background: p?.background ?? "",
    targetRoles: p?.targetRoles ?? "",
    target: companiesIn(p, "target"),
    secondary: companiesIn(p, "secondary"),
    practice: companiesIn(p, "practice"),
    signals: (p?.bonusSignals ?? []).join("\n"),
  });
  const [form, setForm] = useState(() => fill(initial));
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const companies = TIERS.flatMap((tier) => toLines(form[tier]).map((name) => ({ name, tier })));
  const tooLong = form.background.length > maxBackgroundLength;
  const ready = form.background.trim() && !tooLong && form.targetRoles.trim() && companies.length > 0;

  async function save() {
    const profile: RecruitingProfile = {
      background: form.background.trim(),
      targetRoles: form.targetRoles.trim(),
      companies,
      bonusSignals: toLines(form.signals).slice(0, 10),
    };
    setSaving(true);
    setError(null);
    try {
      const result = await saveMyProfile(profile);
      if (result.ok) onSaved(profile, result.data);
      else setError(result.message);
    } catch {
      setError("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Your profile</h2>
        <button className={styles.textButton} onClick={() => setForm(fill(sample))}>
          Fill with an example
        </button>
      </div>
      <p className={styles.help}>
        Saved to your account, so it&apos;s the same on every device you sign in on. Scores use only what you write
        here, so include what you&apos;d want an interviewer to know.
      </p>
      {fromBrowser && (
        <p className={styles.notice}>
          We found a profile you saved in this browser earlier. Check it, then save it to your account.
        </p>
      )}

      <div className={styles.label}>
        <div className={styles.labelRow}>
          <label htmlFor="rh-background">Your background</label>
          <button className={styles.uploadButton} onClick={() => resumeInput.current?.click()} disabled={upload.state === "reading"}>
            {upload.state === "reading" ? "Reading your résumé…" : "Upload résumé (PDF or Word)"}
          </button>
          <input
            ref={resumeInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // so picking the same file again still fires
              if (file) void uploadResume(file);
            }}
          />
        </div>
        <span className={styles.hint}>
          Upload your résumé, or paste or type a summary: roles, results, skills, schools, languages. Add anything
          your résumé leaves out.
        </span>
        <div className={styles.textareaWrap}>
          <textarea
            id="rh-background"
            className={styles.textarea}
            rows={form.background ? 14 : 7}
            value={form.background}
            onChange={set("background")}
            aria-describedby="rh-background-count"
          />
          <Dictation
            label="Add to your background by voice"
            onText={(spoken) =>
              setForm((old) => ({
                ...old,
                // Each spoken phrase goes on the end, after a space (or straight after a new line).
                background: !old.background ? spoken : /\s$/.test(old.background) ? old.background + spoken : `${old.background} ${spoken}`,
              }))
            }
          />
        </div>
        <span id="rh-background-count" className={tooLong ? styles.countOver : styles.count}>
          {form.background.length.toLocaleString()} / {maxBackgroundLength.toLocaleString()} characters
          {tooLong &&
            ` — ${(form.background.length - maxBackgroundLength).toLocaleString()} too many. Cut older roles or details to save.`}
        </span>
        {upload.state === "done" && (
          <p className={styles.notice}>Filled in from {upload.name}. Check it, add anything missing, then save.</p>
        )}
        {upload.state === "error" && (
          <p className={styles.error}>
            {upload.error.message}
            {upload.error.kind && KEY_PROBLEMS.has(upload.error.kind) && (
              <>
                {" "}
                <Link href="/settings" className={styles.link}>
                  Open Settings
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <div className={styles.label}>
        Roles you&apos;re targeting
        <span className={styles.hint}>Click all that apply, and add your own.</span>
        <RolePicker value={form.targetRoles} onChange={(targetRoles) => setForm((old) => ({ ...old, targetRoles }))} />
      </div>

      <div className={styles.tiers}>
        {TIERS.map((tier) => (
          <label key={tier} className={styles.label}>
            {tier[0]!.toUpperCase() + tier.slice(1)}
            <span className={styles.hint}>{TIER_HELP[tier].split(": ")[1]}</span>
            <textarea
              className={styles.textarea}
              rows={5}
              value={form[tier]}
              placeholder="One company per line"
              onChange={set(tier)}
            />
          </label>
        ))}
      </div>
      <p className={styles.hint}>
        Companies not on any list count -1 on jobs. Write alternatives on one line, like &quot;Amazon / AWS&quot;.
      </p>

      <label className={styles.label}>
        Bonus signals (optional)
        <span className={styles.hint}>
          Things you share with people worth meeting, one per line, e.g. &quot;Wharton&quot;, &quot;Speaks
          Mandarin&quot;. Each one visible on a profile adds a point.
        </span>
        <textarea className={styles.textarea} rows={3} value={form.signals} onChange={set("signals")} />
      </label>

      <div className={styles.actions}>
        <button className={styles.button} disabled={!ready || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {onCancel && (
          <button className={styles.textButton} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}

function ProfileSummary({ profile, onEdit }: { profile: RecruitingProfile; onEdit: () => void }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Your profile</h2>
        <button className={styles.textButton} onClick={onEdit}>
          Edit
        </button>
      </div>
      <p className={styles.summary}>
        <strong>Roles:</strong> {profile.targetRoles}
      </p>
      {TIERS.map((tier) => {
        const names = profile.companies.filter((c) => c.tier === tier).map((c) => c.name);
        return names.length ? (
          <p key={tier} className={styles.summary}>
            <strong>{tier[0]!.toUpperCase() + tier.slice(1)}:</strong> {names.join(", ")}
          </p>
        ) : null;
      })}
      {profile.bonusSignals.length > 0 && (
        <p className={styles.summary}>
          <strong>Bonus signals:</strong> {profile.bonusSignals.join(", ")}
        </p>
      )}
    </section>
  );
}

// ── Paste and score ──────────────────────────────────────────────────────────


function AddCard({
  provider,
  providers,
  labels,
  onProvider,
  samples,
  limits,
  onScored,
  onUpdated,
}: {
  provider: AIProvider;
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  onProvider: (p: AIProvider) => void;
  samples: { posting: string; linkedIn: string };
  limits: { pasteLength: number; screenshots: number };
  onScored: (item: SavedItem) => void;
  /** An item changed after scoring (its outreach draft was written or edited). */
  onUpdated: (item: SavedItem) => void;
}) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [latest, setLatest] = useState<{ item: SavedItem; replaced: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Reads image files into screenshots, up to the limit; shows the first problem. */
  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const room = limits.screenshots - screenshots.length;
    if (room <= 0) {
      setStatus({ state: "error", error: { message: `You can add at most ${limits.screenshots} screenshots.` } });
      return;
    }
    setReading(true);
    try {
      const read = await Promise.all(images.slice(0, room).map(readScreenshot));
      setScreenshots((old) => [...old, ...read].slice(0, limits.screenshots));
      setStatus(
        images.length > room
          ? { state: "error", error: { message: `Only the first ${room} were added: at most ${limits.screenshots} screenshots.` } }
          : { state: "idle" },
      );
    } catch (error) {
      setStatus({ state: "error", error: { message: error instanceof Error ? error.message : "Couldn't read that image." } });
    } finally {
      setReading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault(); // keep the image out of the text box
      void addFiles(files);
    }
  }

  async function score() {
    setStatus({ state: "loading" });
    try {
      const res = await fetch("/tools/recruiting-helper/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, text, screenshots, link }),
      });
      if (res.status === 401) {
        setStatus({ state: "error", error: { message: "Sign in with the button at the top right first." } });
        return;
      }
      let result: ScoreResponse;
      try {
        result = (await res.json()) as ScoreResponse;
      } catch {
        setStatus({ state: "error", error: { message: `Scoring failed (HTTP ${res.status}). Try again.` } });
        return;
      }
      if (!result.ok) {
        setStatus({ state: "error", error: result.error });
        return;
      }
      onScored(result.item);
      setLatest({ item: result.item, replaced: result.replaced });
      setText("");
      setLink("");
      setScreenshots([]);
      setStatus({ state: "idle" });
    } catch {
      setStatus({ state: "error", error: { message: "Couldn't reach PennTools. Check your connection and try again." } });
    }
  }

  const busy = status.state === "loading" || reading;

  return (
    <section className={styles.card} onPaste={onPaste}>
      <h2 className={styles.cardTitle}>Score a job or a person</h2>
      <p className={styles.help}>
        Paste a job posting or someone&apos;s LinkedIn profile, as text or screenshots (⌘V / Ctrl+V). It figures out
        which it is. Try an example:{" "}
        <button className={styles.textButton} onClick={() => setText(samples.posting)}>
          job posting
        </button>{" "}
        or{" "}
        <button className={styles.textButton} onClick={() => setText(samples.linkedIn)}>
          LinkedIn profile
        </button>
      </p>
      <div
        className={dragging ? `${styles.dropZone} ${styles.dropping}` : styles.dropZone}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          setDragging(false);
          void addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <textarea
          aria-label="Job posting or LinkedIn profile"
          className={styles.textarea}
          rows={screenshots.length ? 4 : 8}
          value={text}
          maxLength={limits.pasteLength}
          placeholder="Paste a job posting or LinkedIn profile here: text, or screenshots with ⌘V"
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.shots}>
          {screenshots.map((shot, i) => (
            <figure key={i} className={styles.shot}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, nothing for next/image to optimize */}
              <img src={screenshotSrc(shot)} alt={`Screenshot ${i + 1}`} />
              <button
                className={styles.shotRemove}
                aria-label={`Remove screenshot ${i + 1}`}
                onClick={() => setScreenshots((old) => old.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </figure>
          ))}
          {screenshots.length < limits.screenshots && (
            <button className={styles.addShot} onClick={() => fileInput.current?.click()} disabled={reading}>
              {reading ? "Reading…" : "+ Add screenshots"}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = ""; // so picking the same file again still fires
            }}
          />
        </div>
      </div>
      <input
        aria-label="Link to the job posting or LinkedIn profile"
        className={styles.input}
        value={link}
        placeholder="Link to the job posting or their LinkedIn profile (optional, saved with it)"
        onChange={(e) => setLink(e.target.value)}
      />
      <div className={styles.actions}>
        <button className={styles.button} onClick={() => void score()} disabled={busy || (!text.trim() && screenshots.length === 0)}>
          {status.state === "loading" ? "Scoring…" : "Score it"}
        </button>
        {providers.length > 1 ? (
          <label className={styles.provider}>
            using
            <select value={provider} onChange={(e) => onProvider(e.target.value as AIProvider)}>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {labels[p]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className={styles.hint}>using {labels[provider]}</span>
        )}
      </div>

      {status.state === "error" && (
        <p className={styles.error}>
          {status.error.message}
          {status.error.kind && KEY_PROBLEMS.has(status.error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}
      {latest && (
        <div className={styles.latest}>
          <p className={styles.hint}>
            {latest.replaced ? "Already on your list, so it was updated:" : "Added to your list:"}
          </p>
          <ItemDetails
            item={latest.item}
            onUpdated={(item) => {
              setLatest({ ...latest, item });
              onUpdated(item);
            }}
          />
          {latest.item.kind === "contact" && (
            <Outreach
              // A fresh draft area for each person scored.
              key={`${latest.item.id}:${draftKey(latest.item.outreach)}`}
              contact={latest.item}
              provider={provider}
              onSaved={(item) => {
                setLatest({ ...latest, item });
                onUpdated(item);
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}

// ── Ranked list ──────────────────────────────────────────────────────────────

type Filter = "all" | SavedItem["kind"];

function RankedList({
  items,
  provider,
  autoDrafts,
  outreachStyle,
  onStyleChange,
  onItemsReplaced,
  onRemoved,
  onUpdated,
}: {
  items: SavedItem[];
  provider: AIProvider;
  /** Missing email drafts being written, or why they couldn't be. */
  autoDrafts: { state: "writing"; count: number } | { state: "error"; error: ScoreError } | null;
  /** The remembered instruction new drafts follow, if any. */
  outreachStyle: string | null;
  onStyleChange: (style: string | null) => void;
  onItemsReplaced: (items: SavedItem[]) => void;
  onRemoved: (id: string) => void;
  onUpdated: (item: SavedItem) => void;
}) {
  const draftCount = items.filter((i) => i.kind === "contact" && i.outreach).length;
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const ranked = useMemo(() => items.filter((i) => filter === "all" || i.kind === filter).sort(byRank), [items, filter]);

  async function remove(id: string) {
    setRemoveError(null);
    try {
      const result = await removeMyItem(id);
      // Already gone (say, removed on another device) is fine: take it off this list too.
      if (result.ok || result.message === "That item was already removed.") onRemoved(id);
      else setRemoveError(result.message);
    } catch {
      setRemoveError("Couldn't remove it. Check your connection and try again.");
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Your ranked list</h2>
        <div className={styles.toggle}>
          {(
            [
              ["all", "All"],
              ["posting", "Jobs"],
              ["contact", "People"],
            ] as const
          ).map(([f, label]) => (
            <button key={f} className={filter === f ? styles.toggleOn : styles.toggleOff} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {autoDrafts?.state === "writing" && (
        <p className={styles.notice} role="status">
          Writing email drafts for {autoDrafts.count} {autoDrafts.count === 1 ? "person" : "people"}…
        </p>
      )}
      {autoDrafts?.state === "error" && (
        <p className={styles.error}>
          Couldn&apos;t write the missing email drafts: {autoDrafts.error.message}
          {autoDrafts.error.kind && KEY_PROBLEMS.has(autoDrafts.error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}

      {(draftCount > 0 || outreachStyle) && (
        <ReviseAllDrafts
          provider={provider}
          draftCount={draftCount}
          outreachStyle={outreachStyle}
          onStyleChange={onStyleChange}
          onItemsReplaced={onItemsReplaced}
        />
      )}

      {ranked.length === 0 ? (
        <p className={styles.help}>Nothing here yet. Score a job posting or a LinkedIn profile above.</p>
      ) : (
        <ol className={styles.list}>
          {ranked.map((item) => (
            <li key={item.id} className={styles.listItem}>
              <div className={styles.listRowWrap}>
                <button className={styles.listRow} onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>
                  <ScoreBadge score={item.score} />
                  <span className={styles.listText}>
                    <strong>
                      {item.kind === "posting" ? item.title : item.name}
                      {item.kind === "contact" && item.pennAlum && <span className={styles.tag}>Penn alum</span>}
                    </strong>
                    <span className={styles.hint}>
                      {item.kind === "posting" ? item.company : `${item.title} at ${item.company}`} ·{" "}
                      {item.kind === "posting" ? "Job" : `${item.priority} priority`}
                      {item.kind === "posting" && item.applyBy ? ` · apply by ${item.applyBy}` : ""}
                      {item.kind === "contact" && item.schools?.length ? ` · ${item.schools.join("; ")}` : ""}
                    </span>
                  </span>
                </button>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.rowLink}
                    title={item.kind === "posting" ? "Open the posting" : "Open their LinkedIn profile"}
                  >
                    {item.kind === "posting" ? "Posting ↗" : "LinkedIn ↗"}
                  </a>
                )}
              </div>
              {open === item.id && (
                <div className={styles.listDetails}>
                  <ItemDetails item={item} onUpdated={onUpdated} />
                  {item.kind === "contact" && (
                    <Outreach
                      // Starts over when the saved draft changes elsewhere (written for them, or all drafts changed).
                      key={`${item.id}:${draftKey(item.outreach)}`}
                      contact={item}
                      provider={provider}
                      writing={autoDrafts?.state === "writing"}
                      onSaved={onUpdated}
                    />
                  )}
                  <button className={styles.textButton} onClick={() => void remove(item.id)}>
                    Remove from list
                  </button>
                  {removeError && <p className={styles.error}>{removeError}</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 4 ? styles.high : score === 3 ? styles.medium : styles.low;
  return (
    <span className={`${styles.badge} ${tone}`} aria-label={`Score ${score} of 5`}>
      {score}
    </span>
  );
}

const tierLabel = (tier: CompanyTier | "off-list") =>
  tier === "off-list" ? "not on your list" : `${tier[0]!.toUpperCase() + tier.slice(1)} company`;

/**
 * A text box that saves itself when the student presses Enter or leaves it,
 * if the text changed. `save` returns the text as saved (it may be cleaned up)
 * or why it couldn't be.
 */
function AutosaveField({
  label,
  initial,
  placeholder,
  type = "text",
  hint,
  save,
}: {
  label: string;
  initial: string;
  placeholder: string;
  type?: "text" | "email";
  hint?: string;
  save: (value: string) => Promise<{ ok: true; value: string } | { ok: false; message: string }>;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<{ state: "idle" | "saving" | "saved" } | { state: "error"; message: string }>({
    state: "idle",
  });
  const id = `rh-field-${label.toLowerCase()}-${useId()}`;

  async function commit() {
    if (value.trim() === saved.trim() || status.state === "saving") return;
    setStatus({ state: "saving" });
    try {
      const result = await save(value);
      if (result.ok) {
        setValue(result.value);
        setSaved(result.value);
        setStatus({ state: "saved" });
      } else {
        setStatus({ state: "error", message: result.message });
      }
    } catch {
      setStatus({ state: "error", message: "Couldn't save. Check your connection and try again." });
    }
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={styles.input}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          if (status.state !== "saving") setStatus({ state: "idle" });
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setValue(saved);
            setStatus({ state: "idle" });
          }
        }}
      />
      <span className={status.state === "error" ? styles.fieldError : styles.fieldStatus} role="status">
        {status.state === "saving" ? "Saving…" : status.state === "saved" ? "Saved" : status.state === "error" ? status.message : hint ?? ""}
      </span>
    </div>
  );
}

/** A person's school and email: boxes the student types or pastes into, saved as they go. */
function ContactFields({ contact, onSaved }: { contact: SavedContact; onSaved: (item: SavedItem) => void }) {
  return (
    <div className={styles.contactFields}>
      <AutosaveField
        label="School"
        initial={(contact.schools ?? []).join("; ")}
        placeholder={contact.schools === null ? "Not recorded: type their school(s)" : "e.g. The Wharton School, MBA; Wellesley College"}
        hint="Separate schools with a semicolon. A school named in your bonus signals adds a point."
        save={async (value) => {
          const result = await saveMySchools(contact.id, value.split(/[;\n]/));
          if (!result.ok) return result;
          onSaved(result.data);
          return { ok: true, value: (result.data.schools ?? []).join("; ") };
        }}
      />
      <AutosaveField
        label="Email"
        type="email"
        initial={contact.email ?? ""}
        placeholder="Paste their email from the alumni directory"
        save={async (value) => {
          const result = await saveMyEmail(contact.id, value);
          if (!result.ok) return result;
          const { email: _old, ...rest } = contact;
          onSaved(result.data ? { ...rest, email: result.data } : rest);
          return { ok: true, value: result.data ?? "" };
        }}
      />
    </div>
  );
}

function ItemDetails({ item, onUpdated }: { item: SavedItem; onUpdated: (item: SavedItem) => void }) {
  if (item.kind === "posting") {
    return (
      <div className={styles.details}>
        <p>
          <ScoreBadge score={item.score} /> <strong>{item.title}</strong> at {item.company} ({tierLabel(item.tier)})
        </p>
        {item.summary ? (
          <p>
            <strong>What you&apos;d do:</strong> {item.summary}
          </p>
        ) : (
          <p className={styles.hint}>
            Scored before role summaries existed: paste this posting again to see what the role does, its team and
            LinkedIn search phrases.
          </p>
        )}
        {item.team && (
          <p>
            <strong>Team:</strong> {item.team}{" "}
            <span className={styles.inlineHint}>
              ({item.teamStated ? "named in the posting" : "likely, inferred from the posting"})
            </span>
          </p>
        )}
        {item.searchKeywords.length > 0 && (
          <div className={styles.searchRow}>
            <strong>Find people on LinkedIn:</strong>
            <div className={styles.chips}>
              {item.searchKeywords.map((keyword) => (
                <a
                  key={keyword}
                  className={styles.chip}
                  href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keyword)}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Opens a LinkedIn people search in a new tab"
                >
                  {keyword} ↗
                </a>
              ))}
            </div>
          </div>
        )}
        <p>
          <strong>Why:</strong> Role fit {item.roleFit}/5, {item.adjustment}. {item.reason}
        </p>
        {item.leadWith.length > 0 && (
          <p>
            <strong>Lead with:</strong> {item.leadWith.join("; ")}
          </p>
        )}
        <p>
          <strong>Gaps:</strong> {item.gaps.length ? item.gaps.join("; ") : "None found"}
        </p>
        <p>
          <strong>Apply by:</strong> {item.applyBy ?? "not stated"}
          {item.link && (
            <>
              {" · "}
              <a href={item.link} target="_blank" rel="noreferrer" className={styles.link}>
                Open posting
              </a>
            </>
          )}
        </p>
        {item.tier === "off-list" && (
          <p className={styles.hint}>{item.company} isn&apos;t on your company lists. Add it to your profile if you want it to count.</p>
        )}
      </div>
    );
  }
  return (
    <div className={styles.details}>
      <p>
        <ScoreBadge score={item.score} /> <strong>{item.name}</strong>, {item.title} at {item.company} ({item.priority}{" "}
        priority)
      </p>
      <p>
        <strong>Why:</strong> Starts at 1
        {item.points.length ? `, ${item.points.join(", ")}` : "; no matching signals"}
        {item.capped && " (capped at 5)"}
      </p>
      {item.matchedSignals.length > 0 && (
        <p className={styles.hint}>
          Seen on profile: {item.matchedSignals.map((m) => `${m.signal} (“${m.evidence}”)`).join("; ")}
        </p>
      )}
      <ContactFields key={item.id} contact={item} onSaved={onUpdated} />
      {item.pennAlum && (
        <p className={styles.notice}>Penn alum: look up their email in the Penn / Wharton alumni directory.</p>
      )}
      <p>
        <strong>Hook:</strong> {item.hook}
        {item.link && (
          <>
            {" · "}
            <a href={item.link} target="_blank" rel="noreferrer" className={styles.link}>
              Open LinkedIn profile
            </a>
          </>
        )}
      </p>
      {item.tier === "off-list" && (
        <p className={styles.hint}>{item.company} isn&apos;t on your company lists. Add it to your profile if you want it to count.</p>
      )}
    </div>
  );
}

// ── Outreach email ───────────────────────────────────────────────────────────

const INSTRUCTION_EXAMPLES = [
  "Make them shorter",
  "Open with \"I'm a Wharton MBA candidate\"",
  "Make the tone more casual",
  "Ask for a 15-minute call instead of 20",
];

/** One instruction applied to every saved draft, optionally remembered for new drafts. */
function ReviseAllDrafts({
  provider,
  draftCount,
  outreachStyle,
  onStyleChange,
  onItemsReplaced,
}: {
  provider: AIProvider;
  draftCount: number;
  outreachStyle: string | null;
  onStyleChange: (style: string | null) => void;
  onItemsReplaced: (items: SavedItem[]) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [remember, setRemember] = useState(true);
  const [state, setState] = useState<"idle" | "working">("idle");
  const [result, setResult] = useState<{ ok: boolean; message: string; kind?: string } | null>(null);

  async function apply() {
    const plural = draftCount === 1 ? "draft" : "drafts";
    if (!window.confirm(`Rewrite all ${draftCount} email ${plural}, including any you've edited?`)) return;
    setState("working");
    setResult(null);
    try {
      const response = await reviseAllMyOutreach(provider, instruction, remember);
      if (!response.ok) {
        setResult({ ok: false, message: response.message, ...(response.kind && { kind: response.kind }) });
      } else {
        onItemsReplaced(response.data.items);
        if (remember && response.data.revised === response.data.total) onStyleChange(instruction.trim());
        const { revised, total } = response.data;
        setResult(
          revised === total
            ? { ok: true, message: `Updated ${revised} ${revised === 1 ? "draft" : "drafts"}.${remember ? " New drafts will follow it too." : ""}` }
            : { ok: false, message: `Updated ${revised} of ${total} drafts, then the AI stopped. Try again to finish the rest.` },
        );
        setInstruction("");
      }
    } catch {
      setResult({ ok: false, message: "Couldn't reach PennTools. Check your connection and try again." });
    } finally {
      setState("idle");
    }
  }

  async function forget() {
    const response = await clearMyOutreachStyle().catch(() => null);
    if (response?.ok) onStyleChange(null);
  }

  return (
    <div className={styles.reviseAll}>
      <strong className={styles.outreachTitle}>
        {draftCount === 1 ? "Change your email draft" : `Change all ${draftCount} email drafts at once`}
      </strong>
      <div className={styles.row}>
        <input
          className={styles.input}
          aria-label="How to change all the email drafts"
          value={instruction}
          maxLength={500}
          placeholder="e.g. make them shorter"
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && instruction.trim() && draftCount > 0 && state === "idle") void apply();
          }}
        />
        <button className={styles.button} onClick={() => void apply()} disabled={!instruction.trim() || draftCount === 0 || state === "working"}>
          {state === "working" ? `Updating ${draftCount}…` : "Update all"}
        </button>
      </div>
      <div className={styles.chips}>
        {INSTRUCTION_EXAMPLES.map((example) => (
          <button key={example} type="button" className={styles.chip} onClick={() => setInstruction(example)}>
            {example}
          </button>
        ))}
      </div>
      <label className={styles.checkbox}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Use this for new drafts too
      </label>
      {outreachStyle && (
        <p className={styles.hint}>
          New drafts follow: &ldquo;{outreachStyle}&rdquo;.{" "}
          <button className={styles.textButton} onClick={() => void forget()}>
            Stop using it
          </button>
        </p>
      )}
      {result && (
        <p className={result.ok ? styles.notice : styles.error}>
          {result.message}
          {result.kind && KEY_PROBLEMS.has(result.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** Identifies a saved draft's content, so the draft area restarts when it changes elsewhere. */
function draftKey(draft: OutreachDraft | undefined): string {
  return draft ? `${draft.subject.length}-${draft.body.length}-${draft.body.slice(0, 40)}` : "none";
}

/**
 * The cold email to the person: written for them automatically when they're
 * scored, then the student's to edit, save and copy, or have rewritten.
 */
function Outreach({
  contact,
  provider,
  writing = false,
  onSaved,
}: {
  contact: SavedContact;
  provider: AIProvider;
  /** True while the page is writing missing drafts, this one among them. */
  writing?: boolean;
  onSaved: (item: SavedItem) => void;
}) {
  const [draft, setDraft] = useState<OutreachDraft | null>(contact.outreach ?? null);
  const [state, setState] = useState<"idle" | "drafting" | "saving" | "saved" | "copied">("idle");
  const [error, setError] = useState<ScoreError | null>(null);
  const dirty = draft !== null && (draft.subject !== contact.outreach?.subject || draft.body !== contact.outreach?.body);

  async function generate() {
    if (dirty && !window.confirm("Replace your edited draft with a new one?")) return;
    setState("drafting");
    setError(null);
    try {
      const result = await draftMyOutreach(provider, contact.id);
      if (!result.ok) {
        setError({ message: result.message, ...(result.kind && { kind: result.kind }) });
        setState("idle");
        return;
      }
      setDraft(result.data);
      onSaved({ ...contact, outreach: result.data });
      setState("idle");
    } catch {
      setError({ message: "Couldn't reach PennTools. Check your connection and try again." });
      setState("idle");
    }
  }

  async function save() {
    if (!draft) return;
    setState("saving");
    setError(null);
    try {
      const result = await saveMyOutreach(contact.id, draft);
      if (!result.ok) {
        setError({ message: result.message });
        setState("idle");
        return;
      }
      onSaved({ ...contact, outreach: draft });
      setState("saved");
    } catch {
      setError({ message: "Couldn't save. Check your connection and try again." });
      setState("idle");
    }
  }

  function copy() {
    if (!draft) return;
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`).then(
      () => setState("copied"),
      () => setError({ message: "Couldn't copy. Select the text and copy it yourself." }),
    );
  }

  return (
    <div className={styles.outreach}>
      {!draft ? (
        writing || state === "drafting" ? (
          <p className={styles.hint}>Writing their email draft…</p>
        ) : (
          // Only when writing it automatically failed (say, the AI key ran out of credit).
          <button className={styles.uploadButton} onClick={() => void generate()}>
            Try writing their email draft again
          </button>
        )
      ) : (
        <>
          <strong className={styles.outreachTitle}>Outreach email draft</strong>
          <input
            className={styles.input}
            aria-label="Email subject"
            value={draft.subject}
            onChange={(e) => {
              setDraft({ ...draft, subject: e.target.value });
              setState("idle");
            }}
          />
          <textarea
            className={styles.textarea}
            aria-label="Email body"
            rows={10}
            value={draft.body}
            onChange={(e) => {
              setDraft({ ...draft, body: e.target.value });
              setState("idle");
            }}
          />
          <div className={styles.actions}>
            <button className={styles.button} onClick={copy}>
              {state === "copied" ? "Copied" : "Copy email"}
            </button>
            {dirty && (
              <button className={styles.uploadButton} onClick={() => void save()} disabled={state === "saving"}>
                {state === "saving" ? "Saving…" : "Save changes"}
              </button>
            )}
            {state === "saved" && !dirty && <span className={styles.hint}>Saved</span>}
            <button className={styles.textButton} onClick={() => void generate()} disabled={state === "drafting"}>
              {state === "drafting" ? "Drafting…" : "Write a new one"}
            </button>
          </div>
          <p className={styles.hint}>
            Nothing is sent from here. Copy it into your own email, check every detail, and make it sound like you.
          </p>
        </>
      )}
      {error && (
        <p className={styles.error}>
          {error.message}
          {error.kind && KEY_PROBLEMS.has(error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
